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
  $type: "Text";
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
 * chat.id is volgens de CM-docs een hash van client-id, host-id en kanaal.
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
  return { $type: "Text", direction, createdOn: new Date().toISOString(), text };
}

/* --------------------------------------------------------------- Outbound */

function twowayUrl(): string {
  return `${config.cm.twowayBaseUrl}/accounts/${config.cm.accountId}/adapters/${config.cm.adapterId}`;
}

function mock<T>(data: T): ApiResult<T> {
  return { ok: true, status: 202, data, mocked: true };
}

/** Stuur berichten naar de Conversational Router (en daarmee richting MSC). */
export async function sendToRouter(payload: TwoWayPayload): Promise<ApiResult<unknown>> {
  if (config.mockCm) return mock({ note: "mock-modus: niet echt naar CM verstuurd", payload });
  return requestJson(twowayUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CM-PRODUCTTOKEN": config.cm.productToken ?? "",
    },
    body: JSON.stringify(payload),
  });
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
    .filter((m) => m.$type === "Text" && typeof m.text === "string" && m.text.trim() !== "")
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
  return res;
}
