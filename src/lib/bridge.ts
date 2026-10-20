import { config, type Channel } from "./config";
import { store, type Session } from "@/db";
import * as zipchat from "./zipchat";
import * as cm from "./cm";
import { sendEscalationMail } from "./notify";
import { checkPresence } from "./presence";
import { shopForChat, customerService, questionSubject, type Shop } from "./shops";
import * as robin from "./robin";
import { sendGraphMail } from "./graph";

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
/** Wat er in het dashboard staat ingesteld. "auto" vraagt het aan MSC zelf. */
export type ModeSetting = HandoverMode | "auto";

export const MODE_KEY = "handover_mode";

/** De instelling uit het dashboard. Standaard "livechat". */
export async function getModeSetting(): Promise<ModeSetting> {
  const v = await store.getSetting(MODE_KEY);
  if (v === "livechat" || v === "email" || v === "auto") return v;
  // Sinds de router-koppeling werkt is live chat de normale gang van zaken;
  // een lege database mag daar niet stilletjes van afwijken.
  return "livechat";
}

export async function setMode(mode: ModeSetting): Promise<void> {
  await store.setSetting(MODE_KEY, mode);
  const uitleg: Record<ModeSetting, string> = {
    auto: "Modus op AUTOMATISCH — Mobile Service Cloud bepaalt per gesprek of er iemand beschikbaar is",
    livechat: "Modus op LIVE CHAT vastgezet — klanten wordt altijd een medewerker in de chat beloofd",
    email: "Modus op E-MAIL vastgezet — klanten krijgen altijd een antwoord per e-mail beloofd",
  };
  await store.logEvent({ direction: "internal", kind: "settings.mode_changed", summary: uitleg[mode] });
}

/**
 * Bepaalt of er nú live doorverbonden kan worden. In "auto" vragen we het aan
 * Mobile Service Cloud; de handmatige standen negeren dat signaal bewust,
 * zodat je het altijd kunt overrulen.
 */
export async function resolveLiveAvailability(): Promise<{
  setting: ModeSetting;
  live: boolean;
  presence?: { online: boolean; raw: string; ok: boolean; error?: string };
}> {
  const setting = await getModeSetting();
  if (setting === "livechat") return { setting, live: true };
  if (setting === "email") return { setting, live: false };

  const presence = await checkPresence();
  if (!presence.ok) {
    // Bij twijfel geen live chat beloven: een klant die op niemand zit te
    // wachten is erger dan een klant die een antwoord per e-mail krijgt.
    await store.logEvent({
      direction: "internal",
      kind: "presence.failed",
      ok: false,
      summary: `Beschikbaarheid niet op te vragen (${presence.error}) — veiligheidshalve als offline behandeld`,
    });
    return { setting, live: false, presence };
  }
  return { setting, live: presence.online, presence };
}

/**
 * De hoofdflow: Zipchat kan het niet meer aan, dus we tillen het gesprek
 * naar Mobile Service Cloud en houden beide kanten daarna gekoppeld.
 */
export async function escalate(input: EscalateInput): Promise<EscalateResult> {
  // Elke landenbot stuurt zijn eigen chat_id mee. ZIPCHAT_CHAT_ID (de FR-bot)
  // is alleen nog de terugval voor een tool die dat niet doet.
  const chatId = input.chatId ?? config.zipchat.chatId ?? "unknown-chat";
  const shop = await shopForChat(chatId);
  const channel: Channel = input.channel ?? "webchat";
  const hasConversation = !!input.conversationId;
  // Sinds 20 okt 2026 gaat het antwoord van de medewerker altijd per e-mail
  // naar de klant (handleAgentReply). De AI blijft in de chat; er is geen live
  // chat meer, en dus ook geen beschikbaarheidscheck.
  const setting: HandoverMode = "email";

  // Naam en e-mailadres zijn altijd verplicht: het antwoord gaat naar dat adres.
  const bezwaar = valideerKlantgegevens(input.name, input.email);
  if (bezwaar) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "escalate.details_needed",
      summary: `Klantgegevens niet bruikbaar: ${input.name ?? "(geen naam)"} / ${input.email ?? "(geen e-mail)"}`,
    });
    return { ok: true, mode: setting, message: `${needDetailsMessage()}\n\n${bezwaar}` };
  }
  const mode: HandoverMode = "email";

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
        mailHandoverMessage(),
    };
  }

  // 1. Transcript ophalen bij Zipchat.
  const conv = hasConversation
    ? await zipchat.getConversation(conversationId, { chatId })
    : { ok: true as const, status: 0, data: null, error: undefined };
  // Het transcript is meegenomen, niet noodzakelijk. Lukt het niet, dan gaat de
  // escalatie gewoon door met naam, e-mail en de samenvatting van de assistent:
  // een klant zonder hulp laten zitten is erger dan een ticket zonder historie.
  if (!conv.ok) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "escalate.transcript_failed",
      ok: false,
      statusCode: conv.status,
      summary: `${conv.error} — escalatie gaat door zonder gespreksgeschiedenis`,
      payload: { conversationId },
    });
  }

  const transcriptOk = conv.ok;
  const messages = conv.data?.messages ?? [];
  // Het hele gesprek gaat mee naar het ticket, niet alleen de samenvatting van
  // de assistent: de medewerker moet kunnen lezen wat de klant echt zei.
  const transcript = zipchat.formatTranscript(messages);
  const name = input.name ?? conv.data?.lead?.name ?? null;
  const email = input.email ?? conv.data?.lead?.email ?? null;

  // 2. Sessie vastleggen.

  const clientId = `zipchat:${conversationId}`;
  const cmChat = cm.buildChat({ conversationClientId: clientId, clientName: name, channel: mapChannel(channel) });

  // Alles tot en met het laatste bericht van dit transcript gaat in het ticket
  // mee; de poller begint daarna. Op Zipchats eigen klok en id's, niet op de
  // onze: die lopen niet gelijk.
  const lastInTicket = latestMessage(messages);

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
    lastForwardedAt: lastInTicket.at ?? new Date(),
  });
  if (lastInTicket.id !== null) await store.setForwardCursor(session.id, lastInTicket.id);

  await store.logEvent({
    sessionId: session.id,
    direction: "zipchat->bridge",
    kind: "escalate.received",
    summary: `Escalatie voor ${name ?? "onbekende klant"} (${email ?? "geen e-mail"})${shop ? ` via ${shop.domain}` : ""}`,
    payload: { conversationId, chatId, shop: shop?.domain, reason: input.reason, messages: messages.length, hasConversation },
  });

  // 3. Context + transcript als één openingsbericht naar de router. De AI blijft
  // in de chat; de medewerker antwoordt hier en de bridge mailt dat door.
  const instructie = email
    ? `Je antwoord in dit gesprek gaat per e-mail naar de klant (${email}).`
    : null;

  // Blokken worden gescheiden door een lege regel; binnen een blok staan de
  // regels onder elkaar. Robin toont het ticket als platte tekst, dus die
  // witruimte is het enige wat het leesbaar houdt. Alle landen komen in
  // dezelfde inbox; het land bovenaan vertelt wie het oppakt.
  const gegevens = [
    shop ? `Land: ${shop.country} (${shop.domain})` : null,
    name ? `Naam: ${name}` : null,
    email ? `E-mail: ${email}` : null,
    input.reason ? `Reden: ${input.reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const waarschuwing =
    hasConversation && !transcriptOk
      ? "LET OP: gespreksgeschiedenis kon niet opgehaald worden bij Zipchat."
      : hasConversation && !transcript
        ? "LET OP: Zipchat gaf geen berichten terug voor dit gesprek."
        : null;

  const header = [
    instructie,
    `Overgedragen door de AI-assistent (kanaal: ${channel}).`,
    gegevens || null,
    input.summary ? `Samenvatting door de assistent: ${input.summary}` : null,
    waarschuwing,
    transcript ? "--- Volledig gesprek ---" : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 3a. Standaard: een Online-gesprek in Robin, zoals het contactformulier. Robin
  // mailt het antwoord van de medewerker dan zelf. Let op: Robin citeert dit
  // bericht onder dat antwoord, dus de klant leest het ook.
  if (config.escalationTarget === "robin" && email) {
    const viaRobin = await escalateViaRobin({
      sessionId: session.id,
      conversationId,
      chatId,
      hasConversation,
      shop,
      name: name ?? "NAAM NIET OPGEGEVEN",
      email,
      summary: input.summary ?? null,
      waarschuwing,
      transcript,
    });
    if (viaRobin) return viaRobin;
    // Lukt Robin niet, dan alsnog via de router: liever een chatticket dan geen ticket.
  }

  const payload: cm.TwoWayPayload = {
    chat: cmChat,
    conversationMessages: [cm.textMessage(transcript ? `${header}\n\n${transcript}` : header)],
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
    transcript: transcript || null,
    channel,
    shop: shop?.domain,
    sessionId: session.id,
  });
  if (!mail.off) await store.logEvent({
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

  // 5. Handover aanvragen zoals HALO dat doet. Dit is het endpoint dat wél
  // werkt met ons producttoken; de routing-control uit de documentatie niet.
  // Altijd aanroepen, ook in e-mailmodus: dit stuurt naam/e-mail mee als
  // CustomerInfo in de routing-context. LET OP: dit vult het profielpaneel
  // in Robin niet betrouwbaar — bevestigd op 2 sep 2026, een ticket met een
  // succesvolle (201) aanroep hier miste alsnog het e-mailadres in Robin en
  // moest handmatig gekoppeld worden. De echte koppelmethode is nog niet
  // gevonden; zie project-memory zipchat-cm-bridge voor de laatste stand.
  const mut = await cm.requestHandoverMutation({
    chatId: realChatId,
    name,
    email,
    referrer: "Zipchat",
  });
  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->cm",
    kind: "escalate.handover_request",
    ok: mut.ok,
    statusCode: mut.status,
    summary: mut.ok
      ? "Handover aangevraagd bij de router (mutationrequest)"
      : `Handover aanvragen mislukt: ${mut.error}`,
  });

  // 5c. Router expliciet naar de agent-state duwen (indien geconfigureerd).
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
    message: mailHandoverMessage(),
  };
}

/**
 * De doorzetting als Online-gesprek in Robin (src/lib/robin.ts). Geeft null
 * terug als Robin het gesprek niet aannam; dan gaat het via de router.
 */
async function escalateViaRobin(p: {
  sessionId: number;
  conversationId: string;
  chatId: string;
  hasConversation: boolean;
  shop: Shop | null;
  name: string;
  email: string;
  summary: string | null;
  waarschuwing: string | null;
  transcript: string;
}): Promise<EscalateResult | null> {
  // De URL van de webshop bepaalt in welke Robin-webshop het gesprek landt.
  const referrer = p.shop ? `https://www.${p.shop.domain}/` : "https://www.exittoys.com/";
  const content = [
    `Doorgezet door de AI-assistent in de chat van ${p.shop?.domain ?? "EXIT Toys"}${p.shop ? ` (${p.shop.country})` : ""}.`,
    p.summary ? `Samenvatting: ${p.summary}` : null,
    p.waarschuwing,
    p.transcript ? `--- Gesprek ---\n\n${p.transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const start = await robin.startConversation({
    name: p.name,
    email: p.email,
    subject: questionSubject(p.shop),
    content,
    referrer,
  });
  await store.logEvent({
    sessionId: p.sessionId,
    direction: "bridge->cm",
    kind: "escalate.to_robin",
    ok: start.ok,
    statusCode: start.status,
    summary: start.ok
      ? `Online-gesprek aangemaakt in Robin (${referrer}); Robin mailt het antwoord naar ${p.email}`
      : `Online-gesprek in Robin aanmaken mislukt (${start.error}) — valt terug op de Conversational Router`,
    payload: { referrer, guid: start.data?.guid },
  });
  if (!start.ok || !start.data) return null;
  const guid = start.data.guid;

  if (start.data.autoReply) {
    const auto = await robin.addAutoMessage(guid, start.data.autoReply);
    if (!auto.ok) {
      await store.logEvent({
        sessionId: p.sessionId,
        direction: "bridge->cm",
        kind: "escalate.robin_autoreply",
        ok: false,
        statusCode: auto.status,
        summary: `Bevestiging niet in het Robin-gesprek gezet: ${auto.error}`,
      });
    }
  }

  // Zonder dit denkt Robin dat de klant nog op de site zit en zet hij het
  // antwoord in de widget in plaats van in de mail.
  const left = await robin.leaveSite(guid);
  await store.logEvent({
    sessionId: p.sessionId,
    direction: "bridge->cm",
    kind: "escalate.robin_left",
    ok: left.ok,
    summary: left.ok
      ? "Bezoeker bij Robin afgemeld: het antwoord gaat per e-mail"
      : `Afmelden bij Robin mislukt (${left.error}); het antwoord kan in de widget blijven hangen tot Robin het alsnog mailt`,
  });

  if (p.hasConversation) {
    const flag = await zipchat.setEscalation(p.conversationId, false, p.chatId);
    await store.logEvent({
      sessionId: p.sessionId,
      direction: "bridge->zipchat",
      kind: "escalate.flagged",
      ok: flag.ok,
      statusCode: flag.status,
      summary: flag.ok ? "Gesprek in Zipchat als geëscaleerd gemarkeerd" : `Markeren mislukt: ${flag.error}`,
    });
  }

  await store.updateSession(p.sessionId, { cmChatId: `robin:${guid}`, status: "active" });
  return { ok: true, sessionId: p.sessionId, mode: "email", mocked: start.mocked, message: mailHandoverMessage() };
}

/* --------------------------------------------- Agent-antwoord per e-mail naar de klant */

/**
 * Een medewerker antwoordt in Robin. Dat antwoord gaat altijd per e-mail naar
 * de klant, vanuit de klantenservice van het land, en nooit in de Zipchat-chat:
 * de klant zit daar na een doorzetting meestal allang niet meer, en de AI blijft
 * er gewoon aan. Een reactie van de klant komt via het antwoordadres in Robin
 * binnen.
 */
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

  // Robin stuurt ook de automatische berichten van een team mee, met de naam
  // van dat team als afzender. Die zijn voor WhatsApp geschreven en horen niet
  // in de mailbox van de klant.
  const sender = cm.agentName(payload);
  if (sender && config.cmSkipSenders.includes(sender.toLowerCase())) {
    await store.logEvent({
      sessionId: session.id,
      direction: "cm->bridge",
      kind: "agent_reply.skipped",
      summary: `Automatisch bericht van "${sender}" niet naar de klant gestuurd: "${truncate(texts.join(" "))}"`,
      payload,
    });
    return { ok: true, delivered: 0, message: `Bericht van ${sender} overgeslagen.` };
  }

  const to = session.customerEmail?.trim();
  if (!to) {
    await store.logEvent({
      sessionId: session.id,
      direction: "cm->bridge",
      kind: "agent_reply.no_email",
      ok: false,
      summary: `Antwoord NIET verstuurd: geen e-mailadres bij deze sessie. Beantwoord de klant vanuit Robin: "${truncate(texts.join(" "))}"`,
      payload,
    });
    return { ok: false, delivered: 0, message: "Geen e-mailadres bekend." };
  }

  const service = customerService(await shopForChat(session.zipchatChatId));
  const mail = await sendGraphMail({
    to: [to],
    from: service.from,
    replyTo: service.from,
    subject: service.subject,
    text: texts.join("\n\n"),
    saveToSentItems: true,
  });
  await store.logEvent({
    sessionId: session.id,
    direction: "bridge->klant",
    kind: mail.ok ? "agent_reply.mailed" : "agent_reply.mail_failed",
    ok: mail.ok,
    summary: mail.ok
      ? `Antwoord${sender ? ` van ${sender}` : ""} gemaild naar ${to} vanuit ${service.from}: "${truncate(texts.join(" "))}"`
      : `Antwoord NIET gemaild naar ${to} vanuit ${service.from} (${mail.error}). Beantwoord de klant vanuit Robin: "${truncate(texts.join(" "))}"`,
    payload: { text: texts },
  });

  await store.updateSession(session.id, { lastAgentReplyAt: new Date(), ...(sender ? { agentName: sender } : {}) });
  return {
    ok: mail.ok,
    delivered: mail.ok ? 1 : 0,
    message: mail.ok ? `Per e-mail naar de klant gestuurd.` : `Mailen mislukt: ${mail.error}`,
  };
}

/* --------------------------------------- Klantberichten pollen (Zipchat heeft geen webhook) */

/**
 * Alleen live-chatsessies met een echt Zipchat-gesprek zijn de moeite waard.
 * In e-mailmodus praat de klant gewoon door met de AI; die berichten horen
 * niet bij CM. En een sessie zonder gespreks-id heeft niets om op te halen.
 */
async function pollableSessions(): Promise<Session[]> {
  return (await store.listOpenSessions()).filter(
    (s) => s.mode === "livechat" && !s.zipchatConversationId.startsWith("zonder-id-"),
  );
}

/** bridge_settings: wanneer /api/poll voor het laatst liep, voor het dashboard. */
export const LAST_POLL_KEY = "poll_last_run";

/**
 * Sessies in e-mailmodus (`email`) worden nooit gepolld: de klant praat
 * gewoon door met de AI. Daardoor sloot de stiltetimer van de poller ze ook
 * nooit en bleven ze voor altijd "actief". Nu sluiten ze na dezelfde stilte
 * als een live chat. Een later antwoord uit CM vindt de sessie nog steeds.
 */
export async function closeIdleEmailSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - config.poll.idleTimeoutMin * 60_000);
  const n = await store.closeIdleSessions("email", cutoff);
  if (n > 0) {
    await store.logEvent({
      direction: "internal",
      kind: "poll.closed_email_sessions",
      summary: `${n} e-mailsessie(s) gesloten na ${config.poll.idleTimeoutMin} min stilte`,
    });
  }
  return n;
}

/** Eén query: moet er überhaupt gepolld worden? Houdt de idle-cron goedkoop. */
export async function countPollable(): Promise<number> {
  return (await pollableSessions()).length;
}

/**
 * Een haperende router bestoken we niet elke ronde: per sessie wachten we
 * steeds langer, tot vijf minuten. Dit staat alleen in het geheugen. Na een
 * herstart begint het opnieuw, en dat kost hooguit een poging te veel, nooit
 * een bericht: wat nog niet bij CM ligt, staat nog gewoon in Zipchat.
 */
const backoff = new Map<number, { failures: number; nextAt: number }>();
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Zipchat is zelf de wachtrij: wat nog niet bij CM ligt, halen we de volgende
 * ronde gewoon opnieuw op. Cursor en watermerk schuiven daarom pas op ná een
 * bevestigde aflevering, en alleen tot het bericht dat afgeleverd is. Lukt
 * een bericht niet, dan wacht alles erachter, zodat de volgorde bij CM klopt.
 */
export async function pollOnce(): Promise<{ checked: number; forwarded: number; closed: number }> {
  const open = await pollableSessions();
  let forwarded = 0;
  let closed = 0;

  for (const session of open) {
    // Wacht deze sessie nog op een nieuwe poging? Dan niets doen, ook niet sluiten.
    if ((backoff.get(session.id)?.nextAt ?? 0) > Date.now()) continue;

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
        backoff.delete(session.id);
        closed++;
      }
      continue;
    }

    // Zipchat filtert inclusief en kent alleen hele seconden, dus het laatst
    // doorgestuurde bericht en zijn buren uit dezelfde seconde komen terug.
    // De cursor (bericht-id) bepaalt wat er nog niet bij CM ligt.
    const cursor = await store.getForwardCursor(session.id);
    const pending = (conv.data?.messages ?? [])
      .filter((m) => m.role === "user" && !m.manual_reply && isPending(m, cursor, sinceIso))
      .sort(byMessageId);

    let stuck = false;
    for (const m of pending) {
      const text = zipchat.messageText(m);
      const res = await cm.sendToRouter({
        chat: cm.buildChat({
          conversationClientId: session.cmConversationClientId ?? `zipchat:${session.zipchatConversationId}`,
          clientName: session.customerName,
          channel: mapChannel(session.channel as Channel),
          chatId: session.cmChatId ?? undefined,
        }),
        conversationMessages: [cm.textMessage(text, "ClientOriginated")],
      });

      if (res.ok) {
        forwarded++;
        await store.logEvent({
          sessionId: session.id,
          direction: "bridge->cm",
          kind: "poll.forwarded",
          statusCode: res.status,
          summary: `Klantbericht doorgestuurd: "${truncate(text)}"`,
          payload: { messageId: m.id },
        });
      } else {
        const reason = giveUpReason(m, res.status);
        if (!reason) {
          const failures = (backoff.get(session.id)?.failures ?? 0) + 1;
          const delay = Math.min(config.poll.intervalMs * 2 ** (failures - 1), MAX_BACKOFF_MS);
          backoff.set(session.id, { failures, nextAt: Date.now() + delay });
          await store.logEvent({
            sessionId: session.id,
            direction: "bridge->cm",
            kind: "poll.forwarded",
            ok: false,
            statusCode: res.status,
            summary: `Doorsturen mislukt (poging ${failures}, opnieuw over ${Math.ceil(delay / 1000)}s): ${res.error}`,
            payload: { messageId: m.id },
          });
          stuck = true;
          break;
        }
        await store.logEvent({
          sessionId: session.id,
          direction: "bridge->cm",
          kind: "poll.dropped",
          ok: false,
          statusCode: res.status,
          summary: `Klantbericht NIET bij CM aangekomen, opgegeven (${reason}): "${truncate(text)}"`,
          payload: { messageId: m.id, text },
        });
      }

      await markHandled(session.id, m);
    }
    if (!stuck) backoff.delete(session.id);

    // Stille sessies netjes afsluiten.
    const idleMs = Date.now() - new Date(session.updatedAt).getTime();
    if (pending.length === 0 && idleMs > config.poll.idleTimeoutMin * 60_000) {
      await store.updateSession(session.id, { status: "closed" });
      closed++;
      await store.logEvent({
        sessionId: session.id,
        direction: "internal",
        kind: "session.auto_closed",
        summary: `Automatisch gesloten na ${config.poll.idleTimeoutMin} min stilte`,
      });
    }
  }

  return { checked: open.length, forwarded, closed };
}

/** Nog niet bij CM? Op id als we die hebben; alleen op tijd voor sessies van vóór de cursor. */
function isPending(m: zipchat.ZipchatMessage, cursor: number | null, sinceIso: string): boolean {
  const id = messageId(m);
  if (cursor !== null && id !== null) return id > cursor;
  return isAfter(m.created_at, sinceIso);
}

/**
 * Wanneer opnieuw proberen geen zin meer heeft. Een 400, 413 of 422 gaat over
 * dít bericht en wordt bij herhaling niet anders; wachten zou alles erachter
 * ophouden. Al het andere (time-out, 429, 5xx, ook 401/403 van een verlopen
 * token) is tijdelijk, tot het bericht ouder is dan de stilte waarna een
 * sessie toch al dichtgaat.
 */
function giveUpReason(m: zipchat.ZipchatMessage, status: number): string | null {
  if (status === 400 || status === 413 || status === 422) return `CM weigert het, HTTP ${status}`;
  const at = parseAt(m.created_at);
  if (at && Date.now() - at.getTime() > config.poll.idleTimeoutMin * 60_000) {
    return `na ${config.poll.idleTimeoutMin} min nog steeds niet gelukt`;
  }
  return null;
}

/** Cursor en watermerk tot en met dit bericht opschuiven. */
async function markHandled(sessionId: number, m: zipchat.ZipchatMessage): Promise<void> {
  const id = messageId(m);
  if (id !== null) await store.setForwardCursor(sessionId, id);
  const at = parseAt(m.created_at);
  if (at) await store.updateSession(sessionId, { lastForwardedAt: at });
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
 * Overgenomen uit HALO (tool 21). Een bot die een ontbrekende naam invult met
 * "Unbekannt" of "onbekend" levert een ticket op dat bij de klantenservice niet
 * meer van een echte naam te onderscheiden is. Beter blokkeren en opnieuw vragen.
 */
const PLACEHOLDERS = new Set([
  "", "-", "--", ".", "..", "x", "xx", "xxx", "?", "??", "???",
  "unknown", "unbekannt", "unbekannte", "unbekannter", "onbekend", "inconnu",
  "desconocido", "n/a", "na", "n.v.t", "nvt", "keine angabe", "ohne angabe",
  "not provided", "niet opgegeven", "nicht angegeben", "nicht bekannt",
  "none", "null", "nil", "nan", "geen", "geen naam", "geen email", "geen e-mail",
  "kein name", "keine email", "no name", "no email",
  "naam", "name", "vorname", "nachname", "voornaam", "achternaam",
  "firstname", "lastname", "email", "e-mail", "emailadres", "email adres",
  "email address", "e-mail-adresse", "person", "klant", "kunde", "customer",
  "user", "gebruiker", "anoniem", "anonymous", "test", "exit", "exit toys",
]);

/** De enige toegestane uitzondering: de klant weigert zijn naam te geven. */
const NAAM_MARKER = "naam niet opgegeven";

/**
 * Domeinen die per definitie geen echte klant zijn. De eerste groep is door de
 * RFC voor documentatie gereserveerd, de rest zijn adressen die een assistent
 * verzint als hij toch iets moet invullen. Bewust kort gehouden: een te ruime
 * lijst weigert echte klanten, en dat is erger dan een enkel nepadres.
 */
const NEP_DOMEINEN = new Set([
  "example.com", "example.org", "example.net", "example.edu",
  "test.com", "test.nl", "test.fr", "domain.com",
  "unknown.com", "onbekend.nl", "inconnu.fr", "none.com", "email.example",
]);

/** Herkent een adres dat syntactisch klopt maar nergens aankomt. */
function isNepAdres(email: string): boolean {
  const [lokaal, domein] = email.toLowerCase().split("@");
  if (!lokaal || !domein) return true;
  if (NEP_DOMEINEN.has(domein)) return true;
  if (/\.(test|invalid|example|localhost|local)$/.test(domein)) return true;
  if (PLACEHOLDERS.has(kaal(lokaal))) return true;
  if (/^(no-?reply|donotreply|do-not-reply)/.test(lokaal)) return true;
  return false;
}

function kaal(v: string): string {
  return v.replace(/_/g, " ").replace(/\s+/g, " ").trim().replace(/^[.,:;!*\s]+|[.,:;!*\s]+$/g, "").toLowerCase();
}

/**
 * Zijn naam en e-mailadres bruikbaar? Gedeeld door de klantenservice-escalatie
 * en de marketingdoorzetting; alleen de tekst richting de assistent verschilt.
 * Een naam telt ook als de klant hem expliciet weigerde ("NAAM NIET OPGEGEVEN").
 */
export function controleerContact(name?: string | null, email?: string | null): { naamOk: boolean; mailOk: boolean } {
  const n = (name ?? "").trim();
  const e = (email ?? "").trim();
  const nk = kaal(n);
  const ek = kaal(e);

  const naamOk =
    (nk.length >= 2 && !PLACEHOLDERS.has(nk) && !n.includes("@") && !/^\d+$/.test(nk.replace(/ /g, ""))) ||
    nk === NAAM_MARKER;
  const mailOk =
    /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(e) && !PLACEHOLDERS.has(ek) && !isNepAdres(e);
  return { naamOk, mailOk };
}

export function valideerKlantgegevens(name?: string | null, email?: string | null): string | null {
  const { naamOk, mailOk } = controleerContact(name, email);
  if (naamOk && mailOk) return null;

  const mist: string[] = [];
  if (!mailOk) mist.push("een geldig e-mailadres");
  if (!naamOk) mist.push("de naam van de klant");
  return (
    `Nog niet doorgezet. Ontbrekend of ongeldig: ${mist.join(" en ")}. ` +
    "Zeg tegen de klant NIET dat hij is doorverbonden. Vraag het ontbrekende gegeven " +
    "alsnog, in een apart bericht, en roep deze tool daarna opnieuw aan met de echte " +
    "waarde. Vul nooit zelf iets in als 'onbekend', 'unknown' of 'geen'. Wil de klant " +
    "zijn naam na twee keer vragen echt niet geven, gebruik dan exact 'NAAM NIET OPGEGEVEN'."
  );
}

/**
 * Wat de assistent tegen de klant zegt als het gesprek wel is doorgezet maar
 * het antwoord niet in dit chatvenster terug kan komen. De tekst staat hier
 * voluit — de bot moet 'm overnemen, niet zelf iets verzinnen. Er zijn bots in
 * elf talen; de bot vertaalt deze ene zin beter dan wij hem hier elf keer
 * bijhouden.
 */
function mailHandoverMessage(): string {
  const tijd = config.followUp.responseTime?.trim();
  const termijn = tijd ? `meestal binnen ${tijd}` : "zo snel mogelijk";
  return [
    "Geef de klant dit antwoord, getrouw vertaald naar de taal van het gesprek:",
    "",
    `Je vraag is doorgegeven aan een collega van de klantenservice. Je krijgt ${termijn} een antwoord per e-mail, op het adres dat je hebt opgegeven.`,
    "",
    "Beloof niets anders: geen terugbelverzoek, geen medewerker in dit chatvenster.",
  ].join("\n");
}

/** Wat de bot moet doen als er gegevens ontbreken. */
function needDetailsMessage(): string {
  return [
    "Ik heb nog gegevens nodig: het antwoord van de collega komt per e-mail.",
    "Vraag de klant om zijn naam en e-mailadres, en roep deze tool daarna opnieuw aan met die gegevens erbij.",
    "Zeg nog niet dat het gesprek is doorgezet.",
  ].join("\n");
}

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

function parseAt(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Zipchat-id's zijn oplopende gehele getallen (nagegaan op 13 okt 2026). */
function messageId(m: zipchat.ZipchatMessage): number | null {
  const n = typeof m.id === "number" ? m.id : typeof m.id === "string" && m.id.trim() ? Number(m.id) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

/** Oplopend op id, zodat stoppen bij de eerste fout ook echt de volgorde bewaart. */
function byMessageId(a: zipchat.ZipchatMessage, b: zipchat.ZipchatMessage): number {
  const x = messageId(a);
  const y = messageId(b);
  return x !== null && y !== null ? x - y : 0;
}

/** Hoogste id en laatste tijdstempel van een transcript. */
function latestMessage(messages: zipchat.ZipchatMessage[]): { id: number | null; at: Date | null } {
  let id: number | null = null;
  let at: Date | null = null;
  for (const m of messages) {
    const i = messageId(m);
    if (i !== null && (id === null || i > id)) id = i;
    const t = parseAt(m.created_at);
    if (t && (!at || t > at)) at = t;
  }
  return { id, at };
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

