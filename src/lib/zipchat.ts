import { config } from "./config";
import { requestJson, type ApiResult } from "./http";

export type ZipchatMessage = {
  id?: number | string;
  role: string;             // "user" | "assistant" | ...
  message: string;
  manual_reply?: boolean;
  status?: string;
  sender_id?: number | null;
  created_at?: string;
};

export type ZipchatConversation = {
  id: number | string;
  lead?: { name?: string | null; email?: string | null } | null;
  assignee?: { id?: number } | null;
  escalated_at?: string | null;
  resolved_at?: string | null;
  last_message_at?: string | null;
  messages?: ZipchatMessage[];
};

function headers() {
  return {
    Authorization: `Bearer ${config.zipchat.token}`,
    "Content-Type": "application/json",
  };
}

function chatBase(chatId?: string) {
  const id = chatId ?? config.zipchat.chatId;
  return `${config.zipchat.baseUrl}/chats/${id}`;
}

function mock<T>(data: T): ApiResult<T> {
  return { ok: true, status: 200, data, mocked: true };
}

/** Haal één gesprek op inclusief berichten. */
export async function getConversation(
  conversationId: string,
  opts: { chatId?: string; sinceIso?: string } = {},
): Promise<ApiResult<ZipchatConversation>> {
  if (config.mockMode) {
    return mock<ZipchatConversation>({
      id: conversationId,
      lead: { name: "Testklant", email: "test@example.com" },
      last_message_at: new Date().toISOString(),
      messages: [
        { role: "user", message: "Hoi, mijn EXIT trampoline mist een onderdeel.", created_at: new Date(Date.now() - 60_000).toISOString() },
        { role: "assistant", message: "Vervelend! Om welk model gaat het?", created_at: new Date(Date.now() - 45_000).toISOString() },
        { role: "user", message: "Elegant 305. Ik wil graag iemand spreken.", created_at: new Date(Date.now() - 30_000).toISOString() },
      ],
    });
  }
  const q = new URLSearchParams({ message_per_page: "200" });
  if (opts.sinceIso) q.set("message_created_at_since", opts.sinceIso);
  return requestJson<ZipchatConversation>(
    `${chatBase(opts.chatId)}/conversations/${conversationId}?${q}`,
    { method: "GET", headers: headers() },
  );
}

/**
 * Zet het gesprek in manual mode (AI stopt) of geef het terug aan de AI.
 * assigneeId = null → terug naar de AI.
 */
export async function setAssignment(
  conversationId: string,
  assigneeId: number | null,
  chatId?: string,
): Promise<ApiResult<unknown>> {
  if (config.mockMode) return mock({ assignee_id: assigneeId });
  return requestJson(`${chatBase(chatId)}/conversations/${conversationId}/assignment`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ assignee_id: assigneeId }),
  });
}

/** Stuur een bericht namens de menselijke agent de widget in. */
export async function sendManualReply(
  conversationId: string,
  message: string,
  opts: { chatId?: string; senderId?: number } = {},
): Promise<ApiResult<unknown>> {
  if (config.mockMode) return mock({ message, delivered: true });
  const senderId = opts.senderId ?? Number(config.zipchat.senderId);
  const body: Record<string, unknown> = { message };
  if (Number.isFinite(senderId)) body.sender_id = senderId;
  return requestJson(`${chatBase(opts.chatId)}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
}

/** Markeer een gesprek als geëscaleerd of opgelost. */
export async function setEscalation(
  conversationId: string,
  resolved: boolean,
  chatId?: string,
): Promise<ApiResult<unknown>> {
  if (config.mockMode) return mock({ resolved });
  return requestJson(`${chatBase(chatId)}/conversations/${conversationId}/escalation`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ resolved }),
  });
}

/** Verbindingstest voor het dashboard. */
export async function ping(): Promise<ApiResult<unknown>> {
  if (config.mockMode) return mock({ note: "mock-modus: geen echte Zipchat-call" });
  return requestJson(`${config.zipchat.baseUrl}/chats`, { method: "GET", headers: headers() });
}

/** Plat transcript voor in het CM-ticket. */
export function formatTranscript(messages: ZipchatMessage[] = []): string {
  return messages
    .map((m) => {
      const who = m.role === "user" ? "Klant" : m.manual_reply ? "Medewerker" : "AI";
      return `${who}: ${m.message}`;
    })
    .join("\n");
}
