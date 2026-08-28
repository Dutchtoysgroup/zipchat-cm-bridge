import { config, type Channel } from "./config";
import { store, type Session } from "@/db";
import * as zipchat from "./zipchat";
import * as cm from "./cm";
import { sendEscalationMail } from "./notify";

/* ------------------------------------------------------------- Escaleren */

export type EscalateInput = {
  /** Ontbreekt als de agent het gespreks-id niet kon bepalen. */
  conversationId?: string;
  /** Samenvatting door de agent; vangnet als er geen transcript op te halen is. */
  summary?: string | null;
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
  /** Wat de assistent tegen de klant moet zeggen. Verschilt per modus. */
  message: string;
  mode?: HandoverMode;
  mocked?: boolean;
};

export type HandoverMode = "livechat" | "email";

export const MODE_KEY = "handover_mode";

/** Standaard e-mail: beloof geen live medewerker als er niemand zit. */
export async function getMode(): Promise<HandoverMode> {
  const v = await store.getSetting(MODE_KEY);
  return v === "livechat" ? "livechat" : "email";
}

export async function setMode(mode: HandoverMode): Promise<void> {
  await store.setSetting(MODE_KEY, mode);
  await store.logEvent({
    direction: "internal",
    kind: "settings.mode_changed",
    summary:
      mode === "livechat"
        ? "Modus op LIVE CHAT gezet — klanten wordt een medewerker in de chat beloofd"
        : "Modus op E-MAIL gezet — klanten krijgt antwoord per e-mail beloofd",
  });
}

/**
 * De hoofdflow: Zipchat kan het niet meer aan, dus we tillen het gesprek
 * naar Mobile Service Cloud en houden beide kanten daarna gekoppeld.
 */
export async function escalate(input: EscalateInput): Promise<EscalateResult> {
  const chatId = input.chatId ?? config.zipchat.chatId ?? "unknown-chat";
  const channel: Channel = input.channel ?? "webchat";
  const hasConversation = !!input.conversationId;
  const setting = await getMode();
  // Live chat kan alleen als er iemand klaarstaat én we een gesprek hebben om
  // antwoorden in terug te leggen. Ontbreekt één van beide, dan is het e-mail —
  // en dat moet ook zo in de administratie staan, niet alleen in de belofte.
  const liveChat = setting === "livechat" && hasConversation;
  const mode: HandoverMode = liveChat ? "livechat" : "email";

  // Zonder gespreks-id kunnen we geen transcript ophalen en geen antwoorden
  // terugbezorgen, maar het ticket moet er wél komen.
  const conversationId = input.conversationId ?? `zonder-id-${Date.now()}`;

  const existing = await store.getSessionByZipchatConversation(conversationId);
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
      mode: existing.mode as HandoverMode,
      message:
        existing.mode === "livechat"
          ? "Dit gesprek staat al bij een medewerker; zeg dat een collega het al heeft opgepakt."
          : "De vraag is al doorgegeven; zeg dat een collega zo snel mogelijk per e-mail reageert en dat het niet nog een keer hoeft.",
    };
  }

  // 1. Transcript ophalen bij Zipchat.
  const conv = hasConversation
    ? await zipchat.getConversation(conversationId, { chatId })
    : { ok: true as const, status: 0, data: null, error: undefined };
  if (!conv.ok) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "escalate.transcript_failed",
      ok: false,
      statusCode: conv.status,
      summary: conv.error,
      payload: { conversationId },
    });
    return { ok: false, message: `Transcript ophalen mislukt: ${conv.error}` };
  }

  const messages = conv.data?.messages ?? [];
  const name = input.name ?? conv.data?.lead?.name ?? null;
  const email = input.email ?? conv.data?.lead?.email ?? null;

  // 2. Sessie vastleggen.
  const clientId = `zipchat:${conversationId}`;
  const cmChat = cm.buildChat({ conversationClientId: clientId, clientName: name, channel: mapChannel(channel) });

  const session = await store.createSession({
    zipchatChatId: chatId,
    zipchatConversationId: conversationId,
    cmChatId: cmChat.id,
    cmConversationClientId: clientId,
    customerName: name,
    customerEmail: email,
    channel,
    mode,
    status: "escalating",
    reason: input.reason ?? null,
    lastForwardedAt: new Date(),
  });

  await store.logEvent({
    sessionId: session.id,
    direction: "zipchat->bridge",
    kind: "escalate.received",
    summary: `Escalatie voor ${name ?? "onbekende klant"} (${email ?? "geen e-mail"})`,
    payload: { conversationId, reason: input.reason, messages: messages.length, hasConversation },
  });

  // 3. AI pauzeren zodat de bot niet door de agent heen praat.
  const assigneeId = Number(config.zipchat.senderId);
  const pause = liveChat
    ? await zipchat.setAssignment(conversationId, Number.isFinite(assigneeId) ? assigneeId : 0, chatId)
    : { ok: true as const, status: 0, error: undefined };
  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->zipchat",
    kind: "escalate.pause_ai",
    ok: pause.ok,
    statusCode: pause.status,
    summary: liveChat
      ? pause.ok
        ? "AI gepauzeerd (manual mode)"
        : `AI pauzeren mislukt: ${pause.error}`
      : setting === "livechat" && !hasConversation
        ? "Stond op live chat, maar zonder gespreks-id kan dat niet — als e-mail afgehandeld"
        : "E-mailmodus — AI blijft actief, medewerker reageert per e-mail",
  });

  // 4. Context + transcript als één openingsbericht naar de router.
  const instructie = liveChat
    ? "LIVE CHAT — de klant zit nu in de chat te wachten. Antwoord hier; je bericht komt direct in het chatvenster."
    : `PER E-MAIL AFHANDELEN — de klant zit NIET in een live chat. Reageer naar ${email ?? "het e-mailadres hieronder"}.`;

  const header = [
    instructie,
    "",
    `Overgedragen door de AI-assistent (kanaal: ${channel}).`,
    name ? `Naam: ${name}` : null,
    email ? `E-mail: ${email}` : null,
    input.reason ? `Reden: ${input.reason}` : null,
    input.summary ? `Samenvatting door de assistent: ${input.summary}` : null,
    hasConversation ? null : "LET OP: geen gespreks-id — antwoorden komen sowieso niet terug in de chat.",
    "",
    hasConversation ? "--- Gespreksgeschiedenis ---" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: cm.TwoWayPayload = {
    chat: cmChat,
    conversationMessages: [cm.textMessage(`${header}\n${zipchat.formatTranscript(messages)}`)],
  };

  const sent = await cm.sendToRouter(payload);

  // CM negeert het chat-id dat wij meesturen en hanteert een eigen, uit
  // conversationClientId afgeleid id. Dát is het id waarmee zijn callbacks
  // terugkomen, dus dat moeten we vastleggen.
  const realChatId = cm.chatIdFromAck(sent) ?? cmChat.id;

  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->cm",
    kind: "escalate.to_router",
    ok: sent.ok,
    statusCode: sent.status,
    summary: sent.ok
      ? `Transcript naar Conversational Router gestuurd (CM-chat ${realChatId})`
      : `Naar CM sturen mislukt: ${sent.error}`,
    payload,
  });

  if (!sent.ok) {
    await store.updateSession(session.id, { status: "error" });
    return { ok: false, sessionId: session.id, message: `Doorzetten naar CM mislukt: ${sent.error}` };
  }

  // 5b. Onafhankelijk van CM: de klantenservice per e-mail op de hoogte stellen.
  // Dit pad blijft werken ook als de router onderweg iets laat liggen.
  const mail = await sendEscalationMail({
    name,
    email,
    reason: input.reason,
    summary: input.summary,
    transcript: messages.length ? zipchat.formatTranscript(messages) : null,
    channel,
    sessionId: session.id,
  });
  await store.logEvent({
    sessionId: session.id,
    direction: "internal",
    kind: mail.ok ? "escalate.mail_sent" : "escalate.mail_failed",
    ok: mail.ok,
    summary: mail.ok
      ? `Escalatiemail verstuurd naar ${config.mail.to} via ${mail.via}`
      : `Escalatiemail NIET verstuurd: ${mail.error}`,
  });

  // Zipchat's eigen escalatievlag zetten: die kan een notificatie sturen
  // volgens de instellingen in het dashboard, los van onze eigen mail.
  if (hasConversation) {
    const flag = await zipchat.setEscalation(conversationId, false, chatId);
    await store.logEvent({
      sessionId: session.id,
      direction: "bridge->zipchat",
      kind: "escalate.flagged",
      ok: flag.ok,
      statusCode: flag.status,
      summary: flag.ok ? "Gesprek in Zipchat als geëscaleerd gemarkeerd" : `Markeren mislukt: ${flag.error}`,
    });
  }

  if (realChatId !== cmChat.id) {
    await store.updateSession(session.id, { cmChatId: realChatId });
    cmChat.id = realChatId;
  }

  // 5. Router expliciet naar de agent-state duwen (indien geconfigureerd).
  if (config.cm.agentStateNameId) {
    const ctx: Record<string, string> = { channel, source: "zipchat" };
    if (email) ctx.email = email;
    if (name) ctx.name = name;
    const state = await cm.setSessionState(realChatId, config.cm.agentStateNameId, ctx);
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
    cmChatId: realChatId,
    mode,
    mocked: sent.mocked,
    message: liveChat
      ? "Doorgezet. Zeg tegen de klant dat een collega het gesprek nu overneemt en dat die hier in de chat antwoordt."
      : `Doorgezet. Zeg tegen de klant dat de vraag is doorgegeven aan de klantenservice, dat er op dit moment niemand live meekijkt in de chat, en dat een collega zo snel mogelijk per e-mail${email ? ` (${email})` : ""} reageert.`,
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

  if (session.mode === "email") {
    const preview = cm.extractInboundTexts(payload).join(" | ").slice(0, 120);
    await store.logEvent({
      sessionId: session.id,
      direction: "cm->bridge",
      kind: "agent_reply.email_mode",
      summary: `Antwoord in e-mailmodus, niet in de chat gezet: "${preview}"`,
      payload,
    });
    return {
      ok: true,
      delivered: 0,
      message: "E-mailmodus: dit gesprek loopt niet live, beantwoord de klant per e-mail.",
    };
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
  // Alleen live-chatsessies met een echt Zipchat-gesprek zijn de moeite waard.
  // In e-mailmodus praat de klant gewoon door met de AI; die berichten horen
  // niet bij CM. En een sessie zonder gespreks-id heeft niets om op te halen.
  const open = (await store.listOpenSessions()).filter(
    (s) => s.mode === "livechat" && !s.zipchatConversationId.startsWith("zonder-id-"),
  );
  let forwarded = 0;
  let closed = 0;

  for (const session of open) {
    const sinceIso = (session.lastForwardedAt ?? session.createdAt).toISOString();
    const conv = await zipchat.getConversation(session.zipchatConversationId, {
      chatId: session.zipchatChatId,
      sinceIso,
    });
    if (!conv.ok) {
      // Een 404 verandert niet bij de volgende poging; blijven proberen levert
      // alleen een logboek vol ruis op.
      const gone = conv.status === 404;
      await store.logEvent({
        sessionId: session.id,
        direction: "zipchat->bridge",
        kind: gone ? "poll.conversation_gone" : "poll.failed",
        ok: false,
        statusCode: conv.status,
        summary: gone
          ? "Zipchat kent dit gesprek niet (meer) — sessie gesloten, niet opnieuw geprobeerd"
          : conv.error,
      });
      if (gone) {
        await store.updateSession(session.id, { status: "closed" });
        closed++;
      }
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

/**
 * CM accepteert alleen kanalen uit een vaste lijst — "Email" en "Custom" zitten
 * daar niet in. Alles wat via deze bridge binnenkomt is voor de router
 * webverkeer; het echte kanaal staat in de begeleidende tekst.
 */
function mapChannel(c: Channel): string {
  const map: Record<Channel, string> = {
    webchat: config.cm.channel,
    email: config.cm.channel,
    sms: "SMS",
    whatsapp: "WhatsApp",
  };
  const v = map[c] ?? config.cm.channel;
  return cm.isValidChannel(v) ? v : config.cm.channel;
}

function isAfter(iso: string | undefined, sinceIso: string): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() > new Date(sinceIso).getTime();
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* --------------------------------------------------- Handover-notificaties */

/**
 * Het Hand Over Endpoint uit de TwoWay-adapterconfiguratie. CM stuurt daar een
 * platte body naartoe, standaard opgebouwd uit deze placeholders:
 *
 *   {"chatId":"{{$chatId}}","sessionId":"{{$sessionId}}","accountId":"{{$accountId}}",
 *    "channel":"{{$channel}}","conversationHostId":"{{$conversationHostId}}",
 *    "conversationClientId":"{{$conversationClientId}}","context":{{$context}}}
 *
 * Er zit geen expliciet event-type in. Wat er precies gebeurde moet dus uit
 * `context` komen — en die vullen wij zelf bij de state change. We loggen de
 * volledige payload zodat de eerste echte handover laat zien wat CM meestuurt.
 */
export async function handleHandover(raw: unknown): Promise<{
  ok: boolean;
  message: string;
  sessionId?: number;
  state?: string;
}> {
  const p = (raw ?? {}) as Record<string, any>;
  const ctx = (p.context ?? {}) as Record<string, any>;

  const chatId: string | undefined = p.chatId ?? p.chat?.id ?? p.ChatId;
  const clientId: string | undefined = p.conversationClientId ?? p.chat?.conversationClientId;
  const cmSessionId: string | undefined = p.sessionId ?? p.chat?.sessionId;

  // Volgorde: expliciet veld in de payload, anders iets uit context, anders
  // gewoon "handover" — het endpoint heet niet voor niets zo.
  const state = String(
    p.eventType ?? p.state ?? p.newState ?? p.NewStateNameId ??
      ctx.state ?? ctx.eventType ?? ctx.reason ?? "handover",
  );
  const agentName: string | null =
    p.agent?.name ?? p.agentName ?? ctx.agentName ?? ctx.agent ?? ctx.userName ?? null;

  let session: Session | null = null;
  if (chatId) session = await store.getSessionByCmChatId(chatId);
  if (!session && clientId?.startsWith("zipchat:")) {
    session = await store.getSessionByZipchatConversation(clientId.slice("zipchat:".length));
  }

  if (!session) {
    await store.logEvent({
      direction: "cm->bridge",
      kind: "handover.no_session",
      ok: false,
      summary: `Handover "${state}" voor onbekende chat ${chatId ?? "(geen id)"}`,
      payload: raw,
    });
    return { ok: false, message: "Onbekende chat — geen gekoppelde Zipchat-sessie.", state };
  }

  const assigned = isAssigned(state);

  await store.updateSession(session.id, {
    handoverState: state,
    ...(agentName ? { agentName } : {}),
    ...(cmSessionId ? { cmSessionId } : {}),
    ...(assigned ? { status: "active" } : {}),
  });

  await store.logEvent({
    sessionId: session.id,
    direction: "cm->bridge",
    kind: `handover.${assigned ? "assigned" : "state"}`,
    summary: assigned
      ? `Medewerker${agentName ? ` ${agentName}` : ""} heeft het gesprek opgepakt (${state})`
      : `Handover-status: ${state}`,
    payload: raw,
  });

  // Bewust terughoudend: alleen melden dat er is doorverbonden als er ook
  // echt iemand is toegewezen én dat expliciet is aangezet.
  if (assigned && config.cm.notifyCustomerOnHandover) {
    const who = agentName ? agentName : "een collega";
    const res = await zipchat.sendManualReply(
      session.zipchatConversationId,
      `Je bent doorverbonden met ${who}. Je kunt hier gewoon verder typen.`,
      { chatId: session.zipchatChatId },
    );
    await store.logEvent({
      sessionId: session.id,
      direction: "bridge->zipchat",
      kind: "handover.customer_notified",
      ok: res.ok,
      statusCode: res.status,
      summary: res.ok ? `Klant gemeld dat ${who} overneemt` : `Melden mislukt: ${res.error}`,
    });
  }

  return { ok: true, sessionId: session.id, state, message: `Handover verwerkt: ${state}` };
}

/* ------------------------------------------------------- Router-events */

/**
 * Het Event Endpoint. Hier komen router-events binnen, waaronder
 * RouterSessionEnded. We loggen alles en sluiten de sessie als de router
 * 'm beëindigt, zodat de poller er niet eindeloos op blijft draaien.
 */
export async function handleRouterEvent(raw: unknown): Promise<{ ok: boolean; message: string; sessionId?: number }> {
  const p = (raw ?? {}) as Record<string, any>;
  const chatId: string | undefined = p.chatId ?? p.chat?.id;
  const clientId: string | undefined = p.conversationClientId ?? p.chat?.conversationClientId;
  const type = String(
    p.eventType ?? p.$type ?? p.type ?? p.conversationEvents?.[0]?.$type ?? "onbekend",
  );

  let session: Session | null = null;
  if (chatId) session = await store.getSessionByCmChatId(chatId);
  if (!session && clientId?.startsWith("zipchat:")) {
    session = await store.getSessionByZipchatConversation(clientId.slice("zipchat:".length));
  }

  const ended = /sessionended|ended|closed|clientleft/i.test(type);

  await store.logEvent({
    sessionId: session?.id ?? null,
    direction: "cm->bridge",
    kind: `event.${ended ? "session_ended" : "received"}`,
    summary: session ? `Router-event: ${type}` : `Router-event ${type} zonder gekoppelde sessie`,
    payload: raw,
  });

  if (session && ended) {
    await closeSession(session.id, true);
    return { ok: true, sessionId: session.id, message: `Sessie gesloten na ${type}.` };
  }

  return { ok: true, sessionId: session?.id, message: `Event ${type} gelogd.` };
}

/** Herkent de states waarin er daadwerkelijk iemand zit. */
/** Herkent de states waarin er daadwerkelijk iemand zit. */
function isAssigned(state: string): boolean {
  const s = state.toLowerCase();
  // Eerst de gevallen waarin er juist NIEMAND zit — die winnen altijd.
  if (/(noagent|unavailable|failed|timeout|queue|wachtrij|ended|closed|rejected)/.test(s)) return false;
  return /(assigned|accepted|answered|pickedup|agent|handover)/.test(s);
}

