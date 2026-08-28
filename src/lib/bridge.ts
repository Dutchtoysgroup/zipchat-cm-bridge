import { config, type Channel } from "./config";
import { store, type Session } from "@/db";
import * as zipchat from "./zipchat";
import * as cm from "./cm";

/* ------------------------------------------------------------- Escaleren */

export type EscalateInput = {
  conversationId: string;
  name?: string | null;
  email?: string | null;
  reason?: string | null;
  channel?: Channel;
  chatId?: string;
};

export type EscalateResult = {
  ok: boolean;
  sessionId?: number;
  cmChatId?: string;
  message: string;
  mocked?: boolean;
};

/**
 * De hoofdflow: Zipchat kan het niet meer aan, dus we tillen het gesprek
 * naar Mobile Service Cloud en houden beide kanten daarna gekoppeld.
 */
export async function escalate(input: EscalateInput): Promise<EscalateResult> {
  const chatId = input.chatId ?? config.zipchat.chatId ?? "unknown-chat";
  const channel: Channel = input.channel ?? "webchat";

  const existing = await store.getSessionByZipchatConversation(input.conversationId);
  if (existing && (existing.status === "escalating" || existing.status === "active")) {
    await store.logEvent({
      sessionId: existing.id,
      direction: "zipchat->bridge",
      kind: "escalate.duplicate",
      summary: "Gesprek liep al — geen tweede ticket aangemaakt",
    });
    return {
      ok: true,
      sessionId: existing.id,
      cmChatId: existing.cmChatId ?? undefined,
      message: "Dit gesprek staat al bij een medewerker.",
    };
  }

  // 1. Transcript ophalen bij Zipchat.
  const conv = await zipchat.getConversation(input.conversationId, { chatId });
  if (!conv.ok) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "escalate.transcript_failed",
      ok: false,
      statusCode: conv.status,
      summary: conv.error,
      payload: { conversationId: input.conversationId },
    });
    return { ok: false, message: `Transcript ophalen mislukt: ${conv.error}` };
  }

  const messages = conv.data?.messages ?? [];
  const name = input.name ?? conv.data?.lead?.name ?? null;
  const email = input.email ?? conv.data?.lead?.email ?? null;

  // 2. Sessie vastleggen.
  const clientId = `zipchat:${input.conversationId}`;
  const cmChat = cm.buildChat({ conversationClientId: clientId, clientName: name, channel: mapChannel(channel) });

  const session = await store.createSession({
    zipchatChatId: chatId,
    zipchatConversationId: String(input.conversationId),
    cmChatId: cmChat.id,
    cmConversationClientId: clientId,
    customerName: name,
    customerEmail: email,
    channel,
    status: "escalating",
    reason: input.reason ?? null,
    lastForwardedAt: new Date(),
  });

  await store.logEvent({
    sessionId: session.id,
    direction: "zipchat->bridge",
    kind: "escalate.received",
    summary: `Escalatie voor ${name ?? "onbekende klant"} (${email ?? "geen e-mail"})`,
    payload: { conversationId: input.conversationId, reason: input.reason, messages: messages.length },
  });

  // 3. AI pauzeren zodat de bot niet door de agent heen praat.
  const assigneeId = Number(config.zipchat.senderId);
  const pause = await zipchat.setAssignment(
    input.conversationId,
    Number.isFinite(assigneeId) ? assigneeId : 0,
    chatId,
  );
  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->zipchat",
    kind: "escalate.pause_ai",
    ok: pause.ok,
    statusCode: pause.status,
    summary: pause.ok ? "AI gepauzeerd (manual mode)" : `AI pauzeren mislukt: ${pause.error}`,
  });

  // 4. Context + transcript als één openingsbericht naar de router.
  const header = [
    `Overgedragen door de AI-assistent (kanaal: ${channel}).`,
    name ? `Naam: ${name}` : null,
    email ? `E-mail: ${email}` : null,
    input.reason ? `Reden: ${input.reason}` : null,
    "",
    "--- Gespreksgeschiedenis ---",
  ]
    .filter(Boolean)
    .join("\n");

  const payload: cm.TwoWayPayload = {
    chat: cmChat,
    conversationMessages: [cm.textMessage(`${header}\n${zipchat.formatTranscript(messages)}`)],
  };

  const sent = await cm.sendToRouter(payload);
  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->cm",
    kind: "escalate.to_router",
    ok: sent.ok,
    statusCode: sent.status,
    summary: sent.ok ? "Transcript naar Conversational Router gestuurd" : `Naar CM sturen mislukt: ${sent.error}`,
    payload,
  });

  if (!sent.ok) {
    await store.updateSession(session.id, { status: "error" });
    return { ok: false, sessionId: session.id, message: `Doorzetten naar CM mislukt: ${sent.error}` };
  }

  // 5. Router expliciet naar de agent-state duwen (indien geconfigureerd).
  if (config.cm.agentStateNameId) {
    const ctx: Record<string, string> = { channel, source: "zipchat" };
    if (email) ctx.email = email;
    if (name) ctx.name = name;
    const state = await cm.setSessionState(cmChat.id, config.cm.agentStateNameId, ctx);
    await store.logEvent({
      sessionId: session.id,
      direction: "bridge->cm",
      kind: "escalate.state_change",
      ok: state.ok,
      statusCode: state.status,
      summary: state.ok ? "Routersessie op agent-state gezet" : `State change mislukt: ${state.error}`,
      payload: ctx,
    });
  }

  await store.updateSession(session.id, { status: "active" });

  return {
    ok: true,
    sessionId: session.id,
    cmChatId: cmChat.id,
    mocked: sent.mocked,
    message: "Doorgezet naar een medewerker.",
  };
}

/* --------------------------------------------- Agent-antwoord terug naar de widget */

export async function handleAgentReply(payload: cm.TwoWayPayload): Promise<{ ok: boolean; delivered: number; message: string }> {
  const cmChatId = payload?.chat?.id;
  const clientId = payload?.chat?.conversationClientId;

  let session: Session | null = null;
  if (cmChatId) session = await store.getSessionByCmChatId(cmChatId);
  if (!session && clientId?.startsWith("zipchat:")) {
    session = await store.getSessionByZipchatConversation(clientId.slice("zipchat:".length));
  }

  if (!session) {
    await store.logEvent({
      direction: "cm->bridge",
      kind: "agent_reply.no_session",
      ok: false,
      summary: `Geen sessie gevonden voor CM-chat ${cmChatId ?? "(onbekend)"}`,
      payload,
    });
    return { ok: false, delivered: 0, message: "Onbekende chat — geen gekoppelde Zipchat-sessie." };
  }

  const texts = cm.extractInboundTexts(payload);
  if (texts.length === 0) {
    await store.logEvent({
      sessionId: session.id,
      direction: "cm->bridge",
      kind: "agent_reply.empty",
      summary: "Payload zonder bruikbare tekst (waarschijnlijk een event)",
      payload,
    });
    return { ok: true, delivered: 0, message: "Geen tekstbericht in payload." };
  }

  let delivered = 0;
  for (const text of texts) {
    const res = await zipchat.sendManualReply(session.zipchatConversationId, text, {
      chatId: session.zipchatChatId,
    });
    await store.logEvent({
      sessionId: session.id,
      direction: "bridge->zipchat",
      kind: "agent_reply.delivered",
      ok: res.ok,
      statusCode: res.status,
      summary: res.ok ? `Agent-antwoord in widget geplaatst: "${truncate(text)}"` : `Bezorgen mislukt: ${res.error}`,
      payload: { text },
    });
    if (res.ok) delivered++;
  }

  await store.updateSession(session.id, { lastAgentReplyAt: new Date(), status: "active" });
  return { ok: delivered > 0, delivered, message: `${delivered} van ${texts.length} bericht(en) bezorgd.` };
}

/* --------------------------------------- Klantberichten pollen (Zipchat heeft geen webhook) */

export async function pollOnce(): Promise<{ checked: number; forwarded: number; closed: number }> {
  const open = await store.listOpenSessions();
  let forwarded = 0;
  let closed = 0;

  for (const session of open) {
    const sinceIso = (session.lastForwardedAt ?? session.createdAt).toISOString();
    const conv = await zipchat.getConversation(session.zipchatConversationId, {
      chatId: session.zipchatChatId,
      sinceIso,
    });
    if (!conv.ok) {
      await store.logEvent({
        sessionId: session.id,
        direction: "zipchat->bridge",
        kind: "poll.failed",
        ok: false,
        statusCode: conv.status,
        summary: conv.error,
      });
      continue;
    }

    const fresh = (conv.data?.messages ?? []).filter(
      (m) => m.role === "user" && !m.manual_reply && isAfter(m.created_at, sinceIso),
    );

    for (const m of fresh) {
      const res = await cm.sendToRouter({
        chat: cm.buildChat({
          conversationClientId: session.cmConversationClientId ?? `zipchat:${session.zipchatConversationId}`,
          clientName: session.customerName,
          channel: mapChannel(session.channel as Channel),
          chatId: session.cmChatId ?? undefined,
        }),
        conversationMessages: [cm.textMessage(m.message, "ClientOriginated")],
      });
      await store.logEvent({
        sessionId: session.id,
        direction: "bridge->cm",
        kind: "poll.forwarded",
        ok: res.ok,
        statusCode: res.status,
        summary: res.ok ? `Klantbericht doorgestuurd: "${truncate(m.message)}"` : `Doorsturen mislukt: ${res.error}`,
      });
      if (res.ok) forwarded++;
    }

    const patch: Record<string, unknown> = {};
    if (fresh.length > 0) patch.lastForwardedAt = new Date();

    // Stille sessies netjes afsluiten.
    const idleMs = Date.now() - new Date(session.updatedAt).getTime();
    if (fresh.length === 0 && idleMs > config.poll.idleTimeoutMin * 60_000) {
      patch.status = "closed";
      closed++;
      await store.logEvent({
        sessionId: session.id,
        direction: "internal",
        kind: "session.auto_closed",
        summary: `Automatisch gesloten na ${config.poll.idleTimeoutMin} min stilte`,
      });
    }
    if (Object.keys(patch).length > 0) await store.updateSession(session.id, patch);
  }

  return { checked: open.length, forwarded, closed };
}

/* ---------------------------------------------------------------- Afsluiten */

export async function closeSession(sessionId: number, backToAi = true) {
  const session = await store.getSessionById(sessionId);
  if (!session) return { ok: false, message: "Sessie niet gevonden." };

  if (backToAi) {
    await zipchat.setAssignment(session.zipchatConversationId, null, session.zipchatChatId);
    await zipchat.setEscalation(session.zipchatConversationId, true, session.zipchatChatId);
  }
  if (session.cmChatId) await cm.endSession(session.cmChatId);

  await store.updateSession(sessionId, { status: "closed" });
  await store.logEvent({
    sessionId,
    direction: "internal",
    kind: "session.closed",
    summary: backToAi ? "Gesloten, gesprek terug naar de AI" : "Gesloten",
  });
  return { ok: true, message: "Sessie gesloten." };
}

/* ------------------------------------------------------------------ Utils */

function mapChannel(c: Channel): string {
  // CM verwacht een kanaalnaam; webchat via ons loopt als custom kanaal binnen.
  const map: Record<Channel, string> = {
    webchat: config.cm.channel,
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
  };
  return map[c] ?? config.cm.channel;
}

function isAfter(iso: string | undefined, sinceIso: string): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() > new Date(sinceIso).getTime();
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
