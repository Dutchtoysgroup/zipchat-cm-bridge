import { config } from "./config";
import { requestJson } from "./http";

/**
 * Welke webshop hoort bij een Zipchat-chat. Er is één bot per land, en ze
 * komen allemaal in dezelfde CM-inbox uit; het land in het ticket is wat de
 * medewerker vertelt wie het oppakt.
 *
 * De domeinen komen uit GET /chats, zodat een nieuwe bot vanzelf meedoet. Het
 * antwoord blijft een kwartier in het geheugen. Lukt het ophalen niet, dan
 * gaat de escalatie gewoon door zonder land: een ticket zonder landlabel is
 * beter dan geen ticket.
 */

export type Shop = { domain: string; country: string };

const TTL_MS = 15 * 60_000;
let cache: { at: number; byChat: Map<string, string> } | null = null;

/** exittoys.co.uk → UK, exittoys.de → DE. */
export function countryOf(domain: string): string {
  const tld = domain.toLowerCase().split(".").pop() ?? "";
  if (tld === "uk") return "UK";
  return tld.toUpperCase();
}

async function domains(): Promise<Map<string, string> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byChat;
  if (config.mockZipchat || !config.zipchat.token) return null;

  const res = await requestJson<{ chats?: Array<{ id: number | string; domain?: string | null }> }>(
    `${config.zipchat.baseUrl}/chats?per_page=100`,
    { method: "GET", headers: { Authorization: `Bearer ${config.zipchat.token}` }, timeoutMs: 5000 },
  );
  if (!res.ok || !res.data?.chats) return cache?.byChat ?? null;

  const byChat = new Map<string, string>();
  for (const c of res.data.chats) if (c.domain) byChat.set(String(c.id), c.domain);
  cache = { at: Date.now(), byChat };
  return byChat;
}

export async function shopForChat(chatId: string | null | undefined): Promise<Shop | null> {
  if (!chatId) return null;
  const domain = (await domains())?.get(String(chatId));
  return domain ? { domain, country: countryOf(domain) } : null;
}

/**
 * Klantenservice per land: het info@-adres op de webshop zelf (20 okt 2026) en
 * de taal van het onderwerp.
 */
const SERVICE: Record<string, { from: string; lang: string }> = {
  NL: { from: "info@exittoys.nl", lang: "nl" },
  BE: { from: "info@exittoys.nl", lang: "nl" },
  DE: { from: "info@exittoys.de", lang: "de" },
  AT: { from: "info@exittoys.de", lang: "de" },
  FR: { from: "info@exittoys.com", lang: "fr" },
  DK: { from: "info@exittoys.com", lang: "da" },
  SE: { from: "info@exittoys.com", lang: "sv" },
  ES: { from: "info@exittoys.com", lang: "es" },
  IT: { from: "info@exittoys.com", lang: "it" },
  UK: { from: "info@exittoys.com", lang: "en" },
  IE: { from: "info@exittoys.com", lang: "en" },
  PL: { from: "info@exittoys.com", lang: "pl" },
};

/** Taal van de klantenservice van een webshop; Engels als het land onbekend is. */
export function shopLang(shop: Shop | null): string {
  return (shop && SERVICE[shop.country]?.lang) ?? "en";
}

const QUESTION: Record<string, string> = {
  nl: "Je vraag aan EXIT Toys",
  de: "Deine Frage an EXIT Toys",
  fr: "Votre question à EXIT Toys",
  da: "Dit spørgsmål til EXIT Toys",
  sv: "Din fråga till EXIT Toys",
  es: "Tu consulta a EXIT Toys",
  it: "La tua domanda a EXIT Toys",
  en: "Your question to EXIT Toys",
  pl: "Twoje pytanie do EXIT Toys",
};

/** Onderwerp van het Robin-gesprek; de klant ziet het terug in de antwoordmail. */
export function questionSubject(shop: Shop | null): string {
  const lang = (shop && SERVICE[shop.country]?.lang) ?? "en";
  return QUESTION[lang] ?? QUESTION.en;
}
