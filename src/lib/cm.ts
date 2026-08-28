import { createHash } from "crypto";
import { config } from "./config";
import { requestJson, type ApiResult } from "./http";

/* ------------------------------------------------------------ TwoWay types */

export type TwoWayChat = {
  id: string;
  sessionId?: string;
  accountId: string;
  channel: string;
  conversationClientId: string;
  conversationHostId: string;
  conversationClientName?: string;
};

export type TwoWayTextMessage = {
  /** Kleine letters: CM's deserializer herkent "Text" niet, "text" wel. */
  $type: "text";
  id?: string;
  direction: "ClientOriginated" | "ClientTerminated";
  createdOn?: string;
  text: string;
};

export type TwoWayPayload = {
  chat: TwoWayChat;
  conversationMessages?: TwoWayTextMessage[];
  conversationEvents?: Array<Record<string, unknown>>;
  targetAdaptersInfo?: Array<Record<string, unknown>>;
};

/**
 * De kanalen die de router accepteert. Er zit geen "Custom" tussen: een eigen
 * webchat loopt binnen als CXWebConversations.
 */
export const CM_CHANNELS = [
  "Apple Business Chat", "iMessage", "WhatsApp", "Line", "Push", "RCS", "SMS",
  "Viber", "Voice", "Facebook Messenger", "MobilePush", "CXWebConversations",
  "Instagram", "Telegram Messenger", "Slack", "Microsoft Teams",
] as const;

export function isValidChannel(c: string): boolean {
  return (CM_CHANNELS as readonly string[]).includes(c);
}

/**
 * chat.id moet gevuld zijn, maar CM negeert onze waarde en leidt zijn eigen id
 * deterministisch af uit conversationClientId. Het id uit het 201-antwoord is
 * dus leidend — daarmee komen de callbacks terug.
 * We leiden 'm deterministisch af zodat dezelfde klant altijd dezelfde chat krijgt.
 */
export function deriveChatId(clientId: string, hostId: string, channel: string): string {
  return createHash("sha256").update(`${clientId}|${hostId}|${channel}`).digest("hex").slice(0, 32);
}

export function buildChat(params: {
  conversationClientId: string;
  clientName?: string | null;
  channel?: string;
  chatId?: string;
}): TwoWayChat {
  const channel = params.channel ?? config.cm.channel;
  const hostId = config.cm.adapterId ?? "bridge";
  return {
    id: params.chatId ?? deriveChatId(params.conversationClientId, hostId, channel),
    accountId: config.cm.accountId ?? "unknown-account",
    channel,
    conversationClientId: params.conversationClientId,
    conversationHostId: hostId,
    ...(params.clientName ? { conversationClientName: params.clientName } : {}),
  };
}

export function textMessage(
  text: string,
  direction: TwoWayTextMessage["direction"] = "ClientOriginated",
): TwoWayTextMessage {
  return { $type: "text", direction, createdOn: new Date().toISOString(), text };
}

/* --------------------------------------------------------------- Outbound */

function twowayUrl(): string {
  return `${config.cm.twowayBaseUrl}/accounts/${config.cm.accountId}/adapters/${config.cm.adapterId}`;
}

function mock<T>(data: T): ApiResult<T> {
  return { ok: true, status: 202, data, mocked: true };
}

export type RouterAck = { chat?: { id?: string; sessionId?: string | null }; message?: string };

/**
 * Stuur berichten naar de Conversational Router (en daarmee richting MSC).
 * Bij succes (201) staat in het antwoord het chat-id dat CM zelf hanteert.
 */
export async function sendToRouter(payload: TwoWayPayload): Promise<ApiResult<RouterAck>> {
  if (config.mockCm) {
    return mock<RouterAck>({ chat: { id: payload.chat.id }, message: "mock: niet echt verstuurd" });
  }
  return requestJson<RouterAck>(twowayUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "",
    },
    body: JSON.stringify(payload),
  });
}

/** Het chat-id zoals CM het hanteert, uit een 201-antwoord. */
export function chatIdFromAck(res: ApiResult<RouterAck>): string | undefined {
  return res.data?.chat?.id ?? undefined;
}

/* --------------------------------------------------------- Routing control */

/**
 * Zet de routersessie in een andere state — zo draag je over aan een
 * menselijke agent in Agent Inbox. Context wordt gebruikt voor skill-based
 * routing (bijv. team of taal meegeven).
 */
export async function setSessionState(
  cmChatId: string,
  newStateNameId: string,
  context: Record<string, string> = {},
): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ cmChatId, newStateNameId, context });
  const url = `${config.cm.routerControlBaseUrl}/accounts/${config.cm.logicalAccountId}/chats/${cmChatId}/session/state`;
  return requestJson(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "",
    },
    body: JSON.stringify({ NewStateNameId: newStateNameId, Context: context }),
  });
}

/** Huidige routerstatus opvragen. */
export async function getSession(cmChatId: string): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ cmChatId, state: "mock-agent-state" });
  const url = `${config.cm.routerControlBaseUrl}/accounts/${config.cm.logicalAccountId}/chats/${cmChatId}/session`;
  return requestJson(url, { method: "GET", headers: { "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "" } });
}

/** Routersessie beëindigen (reset routing). */
export async function endSession(cmChatId: string): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ cmChatId, ended: true });
  const url = `${config.cm.routerControlBaseUrl}/accounts/${config.cm.logicalAccountId}/chats/${cmChatId}/session/end`;
  return requestJson(url, { method: "PUT", headers: { "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "" } });
}

/* ---------------------------------------------------------------- Inbound */

/** Haal de bruikbare tekstberichten uit een inkomende TwoWay-payload. */
export function extractInboundTexts(payload: TwoWayPayload): string[] {
  return (payload.conversationMessages ?? [])
    .filter((m) => String(m.$type).toLowerCase() === "text" && typeof m.text === "string" && m.text.trim() !== "")
    // ClientTerminated = richting klant, dus afkomstig van de agent in MSC.
    .filter((m) => m.direction !== "ClientOriginated")
    .map((m) => m.text.trim());
}

/** Verbindingstest voor het dashboard. */
export async function ping(): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ note: "mock-modus: geen echte CM-call" });
  // Een lege payload naar de adapter is geen nette test; we controleren de
  // routing-control API met een niet-bestaande chat: 401/403 = token fout,
  // 404 = token werkt maar chat bestaat niet (dat is wat we willen zien).
  const url = `${config.cm.routerControlBaseUrl}/accounts/${config.cm.logicalAccountId}/chats/connectivity-probe/session`;
  const res = await requestJson(url, {
    method: "GET",
    headers: { "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "" },
  });
  if (res.status === 404) {
    return { ok: true, status: 404, data: { note: "Token geaccepteerd (404 op testchat is verwacht)" } };
  }
  if (res.status === 403) {
    return {
      ok: true,
      status: 403,
      data: {
        note:
          "Token werkt voor berichten, maar mist het recht " +
          "ConversationalRouter.RouterSession_Update. Alleen nodig voor expliciete state changes.",
      },
    };
  }
  return res;
}

/* ------------------------------------------------- Handover via mutationrequest */

/**
 * De handover zoals HALO hem doet. Dit is een ánder endpoint dan de
 * routing-control uit de documentatie: die geeft 403 met ons producttoken,
 * dit endpoint accepteert het wel.
 *
 * De mutaties zetten componenten of routingregels uit voor déze ene chat,
 * zodat het gesprek bij een medewerker uitkomt in plaats van bij een bot.
 */
export async function requestHandoverMutation(params: {
  chatId: string;
  name?: string | null;
  email?: string | null;
  referrer?: string;
}): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ note: "mock: geen mutationrequest verstuurd", ...params });

  const url = `${config.cm.conversationalControlBaseUrl}/accounts/${config.cm.logicalAccountId}/chats/${params.chatId}/routing/mutationrequests`;

  const body = {
    chatId: params.chatId,
    Context: {
      RoutingKeywords: "",
      WebStoreReferrer: params.referrer ?? "Zipchat",
      // CustomerInfo is een JSON-string binnen de JSON, precies zoals HALO het stuurt.
      CustomerInfo: JSON.stringify({ name: params.name ?? "", email: params.email ?? "" }),
    },
    mutations: [{ $type: "disableComponent", ComponentId: "CMBot" }],
  };

  return requestJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cm-Producttoken": config.cm.productToken ?? "",
    },
    body: JSON.stringify(body),
  });
}
