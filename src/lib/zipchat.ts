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

export type ApiConversationResult = ApiResult<ZipchatConversation>;

/** Haal één gesprek op inclusief berichten. */
export async function getConversation(
  conversationId: string,
  opts: { chatId?: string; sinceIso?: string } = {},
): Promise<ApiResult<ZipchatConversation>> {
  if (config.mockZipchat) {
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
  const res = await requestJson<ZipchatConversation | { conversation: ZipchatConversation }>(
    `${chatBase(opts.chatId)}/conversations/${conversationId}?${q}`,
    { method: "GET", headers: headers() },
  );
  return { ...res, data: unwrapConversation(res.data) };
}

/**
 * Zipchat antwoordt met {"conversation": {...}} — zonder deze laag zag de brug
 * nooit berichten en ging elk ticket met een lege gespreksgeschiedenis de deur
 * uit. Het platte formaat blijft werken, voor het geval de API wisselt.
 */
function unwrapConversation(
  data: ZipchatConversation | { conversation: ZipchatConversation } | null,
): ZipchatConversation | null {
  if (!data) return null;
  if ("conversation" in data && data.conversation) return data.conversation;
  return data as ZipchatConversation;
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
  if (config.mockZipchat) return mock({ assignee_id: assigneeId });
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
  if (config.mockZipchat) return mock({ message, delivered: true });
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
  if (config.mockZipchat) return mock({ resolved });
  return requestJson(`${chatBase(chatId)}/conversations/${conversationId}/escalation`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ resolved }),
  });
}

/** Verbindingstest voor het dashboard. */
export async function ping(): Promise<ApiResult<unknown>> {
  if (config.mockZipchat) return mock({ note: "mock-modus: geen echte Zipchat-call" });
  return requestJson(`${config.zipchat.baseUrl}/chats`, { method: "GET", headers: headers() });
}

/**
 * De tekst van één bericht. Berichten met een bijlage komen binnen als een
 * JSON-array met blokken ({"type":"image"...}, {"type":"text"...}); die mag de
 * medewerker niet rauw in zijn ticket krijgen.
 */
export function messageText(m: ZipchatMessage): string {
  const raw = (m.message ?? "").trim();
  if (!raw.startsWith("[") && !raw.startsWith("{")) return stripHtml(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  const delen = blocks.map((b) => {
    if (typeof b === "string") return b;
    if (!b || typeof b !== "object") return "";
    const o = b as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (o.type === "image") {
      const src = o.source as Record<string, unknown> | undefined;
      const url = typeof src?.url === "string" ? src.url : null;
      return url ? `[afbeelding: ${url}]` : "[afbeelding]";
    }
    if (typeof o.message === "string") return o.message;
    return "";
  });
  const tekst = delen.filter(Boolean).map(stripHtml).join(" ").trim();
  return tekst || stripHtml(raw);
}

/**
 * De AI antwoordt met wat HTML voor in de widget. In een ticket leest dat niet;
 * dit maakt er platte tekst van.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plat transcript voor in het CM-ticket. */
export function formatTranscript(messages: ZipchatMessage[] = []): string {
  return messages
    .map((m) => {
      const who = m.role === "user" ? "Klant" : m.manual_reply ? "Medewerker" : "AI";
      return `${who}: ${messageText(m)}`;
    })
    .filter((r) => r.split(": ").slice(1).join(": ").trim() !== "")
    // Lege regel tussen elke beurt: in Robin is het ticket platte tekst en
    // zonder witruimte loopt het hele gesprek als één blok in elkaar over.
    .join("\n\n");
}

type ConversationSummary = {
  id: number | string;
  channel?: string;
  last_message_at?: string | null;
  lead?: { email?: string | null } | null;
};

/**
 * Zoek het gesprek van deze klant als de assistent het gespreks-id niet (goed)
 * meegaf. De klant heeft zijn e-mailadres in de chat getypt, want de skill
 * vraagt erom: een recent gesprek op deze bot waarin dat adres staat (als lead
 * of in een bericht van de klant) is het zijne. Bij twijfel (meer dan één
 * kandidaat) wint het gesprek met het laatste bericht. Hooguit `maxDetails`
 * gesprekken worden opengehaald, zodat de rate limit (120/min) heel blijft.
 */
export async function findConversationByEmail(
  chatId: string,
  email: string,
  opts: { withinMinutes?: number; maxDetails?: number } = {},
): Promise<{ id: string; conversation: ZipchatConversation } | null> {
  if (config.mockZipchat) return null;
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  const since = new Date(Date.now() - (opts.withinMinutes ?? 60) * 60_000).toISOString();
  const q = new URLSearchParams({ per_page: "50", last_message_at_since: since });
  const list = await requestJson<{ conversations?: ConversationSummary[] }>(
    `${chatBase(chatId)}/conversations?${q}`,
    { method: "GET", headers: headers(), timeoutMs: 10_000 },
  );
  const recent = list.data?.conversations ?? [];
  if (!list.ok || recent.length === 0) return null;

  // Eerst op het lead-adres: kost geen extra aanroepen.
  const byLead = recent.find((c) => c.lead?.email?.trim().toLowerCase() === needle);
  const candidates = byLead ? [byLead] : recent.slice(0, opts.maxDetails ?? 15);

  for (const c of candidates) {
    const conv = await getConversation(String(c.id), { chatId });
    if (!conv.ok || !conv.data) continue;
    const mentions = (conv.data.messages ?? []).some(
      (m) => m.role === "user" && messageText(m).toLowerCase().includes(needle),
    );
    if (c === byLead || mentions) return { id: String(c.id), conversation: conv.data };
  }
  return null;
}
