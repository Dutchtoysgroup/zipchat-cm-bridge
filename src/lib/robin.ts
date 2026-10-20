import { randomUUID } from "crypto";
import { config } from "./config";
import { requestJson, type ApiResult } from "./http";

/**
 * Een doorzetting als Online-gesprek in Robin (Mobile Service Cloud), precies
 * zoals het contactformulier op de webshops dat doet. De medewerker antwoordt
 * in Robin en Robin mailt dat antwoord zelf naar de klant, vanuit het adres van
 * de webshop; een reactie van de klant komt in hetzelfde gesprek terug.
 *
 * Dit is geen gedocumenteerde API maar de route van Robins eigen widget
 * (contact.robinhq.com), uitgezocht op 20 okt 2026:
 *
 * 1. POST /Conversation/Start/ met header `apikey` maakt het gesprek aan. De
 *    `Referrer` bepaalt de webshop: Robin koppelt die op het begin van de URL
 *    (exittoys.fr → EXIT Toys France, exittoys.de/.at → Duitsland, enz.).
 * 2. POST /Conversation/AddAutoMessage zet de bevestiging in het gesprek, zoals
 *    de widget doet na het versturen.
 * 3. Een korte SignalR-verbinding (selfServiceHub.connectClient) die meteen
 *    weer dicht gaat. Zolang Robin denkt dat de bezoeker op de site zit, zet
 *    hij een antwoord in de widget en niet in de mail; zonder deze stap kwam
 *    de mail bij de eerste test pas veel later.
 *
 * Verandert CM deze route, dan valt de bridge terug op de Conversational
 * Router (ESCALATION_TARGET=cm).
 */

const BASE = (process.env.ROBIN_CONTACT_BASE_URL ?? "https://contact.robinhq.com").replace(/\/+$/, "");

function headers(json: boolean): Record<string, string> {
  return {
    apikey: config.robin.apiKey ?? "",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded; charset=UTF-8",
  };
}

export type RobinStart = { guid: string; autoReply: string | null };

export async function startConversation(params: {
  name: string;
  email: string;
  subject: string;
  content: string;
  /** Webshop-URL; bepaalt in welke Robin-webshop het gesprek landt. */
  referrer: string;
}): Promise<ApiResult<RobinStart>> {
  if (config.mockCm) {
    return { ok: true, status: 200, data: { guid: `mock-${randomUUID()}`, autoReply: null }, mocked: true };
  }
  const guid = randomUUID();
  const res = await requestJson<{ Guid?: string; IsError?: boolean; Message?: string; AutoReply?: string }>(
    `${BASE}/Conversation/Start/`,
    {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        Content: params.content,
        Question: params.content,
        Name: params.name,
        EmailAddress: params.email,
        Referrer: params.referrer,
        User: "",
        Guid: guid,
        Subject: params.subject,
        CategoryId: "",
        IsChat: false,
        IsAnonymous: false,
        Attachments: [],
      }),
    },
  );
  // Robin geeft bij een fout soms 200 met IsError, en soms 500 met platte tekst.
  if (!res.ok || !res.data?.Guid || res.data.IsError) {
    const raw = (res.data as { raw?: string } | null)?.raw;
    return {
      ok: false,
      status: res.status,
      data: null,
      error: res.error ?? res.data?.Message ?? raw?.slice(0, 200) ?? "Robin gaf geen gespreks-id terug",
    };
  }
  return { ok: true, status: res.status, data: { guid: res.data.Guid, autoReply: res.data.AutoReply ?? null } };
}

/** De bevestiging van de webshop in het gesprek zetten, zoals de widget dat doet. */
export async function addAutoMessage(guid: string, html: string): Promise<ApiResult<unknown>> {
  if (config.mockCm) return { ok: true, status: 200, data: null, mocked: true };
  const content = htmlToPlain(html);
  if (!content) return { ok: true, status: 0, data: null };
  return requestJson(`${BASE}/Conversation/AddAutoMessage`, {
    method: "POST",
    headers: headers(false),
    body: new URLSearchParams({ guid, content }).toString(),
  });
}

/**
 * Meldt de "bezoeker" aan en meteen weer af bij Robin, via het oude
 * SignalR-protocol (long polling) dat de widget gebruikt. Daarna weet Robin dat
 * er niemand meer op de site zit en mailt hij het antwoord.
 */
export async function leaveSite(guid: string): Promise<{ ok: boolean; error?: string }> {
  if (config.mockCm) return { ok: true };
  const apikey = config.robin.apiKey ?? "";
  const connectionData = JSON.stringify([{ name: "selfservicehub" }]);
  const url = (path: string, extra: Record<string, string> = {}) =>
    `${BASE}/signalr/${path}?${new URLSearchParams({ clientProtocol: "1.5", connectionData, apikey, guid, ...extra })}`;
  const h = { "X-Requested-With": "XMLHttpRequest", apikey };

  const neg = await requestJson<{ ConnectionToken?: string }>(url("negotiate"), { method: "GET", headers: h, timeoutMs: 10_000 });
  const token = neg.data?.ConnectionToken;
  if (!neg.ok || !token) return { ok: false, error: `negotiate ${neg.status}: ${neg.error ?? "geen token"}` };
  const t = { transport: "longPolling", connectionToken: token };

  const steps: Array<[string, RequestInit]> = [
    ["connect", { method: "POST", headers: h }],
    ["start", { method: "GET", headers: h }],
    [
      "send",
      {
        method: "POST",
        headers: { ...h, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({
          data: JSON.stringify({ H: "selfservicehub", M: "connectClient", A: [apikey, guid, false], I: 0 }),
        }).toString(),
      },
    ],
  ];
  for (const [step, init] of steps) {
    const r = await requestJson(url(step, t), { ...init, timeoutMs: 15_000 });
    if (!r.ok) return { ok: false, error: `${step} ${r.status}: ${r.error}` };
  }
  // Even laten staan, zoals een bezoeker die het formulier verstuurt en wegklikt.
  await new Promise((r) => setTimeout(r, 2_000));
  const abort = await requestJson(url("abort", t), { method: "POST", headers: h, timeoutMs: 10_000 });
  return abort.ok ? { ok: true } : { ok: false, error: `abort ${abort.status}: ${abort.error}` };
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&eacute;/gi, "é")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
