import { config } from "./config";
import { requestJson } from "./http";

/**
 * De order-API's van de webshop (Dicode): `halo.json` voor bestellingen en
 * serviceportaallinks, `robin` voor tracking. Dezelfde aanroepen als HALO-tools
 * 16, 18 en 26. De assistent roept ze bij de e-mailverificatie niet zelf aan;
 * de bridge doet dat pas na een goede code (src/lib/verify.ts).
 *
 * halo.json geeft altijd HTTP 200; een lege body betekent "niets gevonden".
 */

export type OrdersResult = { ok: boolean; empty: boolean; body: unknown; error?: string };

const ENT: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  oslash: "ø", Oslash: "Ø", szlig: "ß", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", iuml: "ï", euml: "ë",
  ntilde: "ñ", aring: "å", aelig: "æ", AElig: "Æ", deg: "°", euro: "€", times: "×",
  hellip: "…", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', middot: "·", bull: "•",
};

/** HTML-entiteiten in de antwoorden terug naar tekens, net als HALO-tool 16 doet. */
function schoon(x: unknown): unknown {
  if (typeof x === "string") {
    return x.replace(/&([a-zA-Z0-9#]{1,10});/g, (m, naam: string) => {
      if (naam in ENT) return ENT[naam];
      const n = naam.startsWith("#x") || naam.startsWith("#X") ? parseInt(naam.slice(2), 16) : naam.startsWith("#") ? parseInt(naam.slice(1), 10) : NaN;
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    });
  }
  if (Array.isArray(x)) return x.map(schoon);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, schoon(v)]));
  return x;
}

function isEmpty(body: unknown): boolean {
  if (body === null || body === undefined || body === "") return true;
  if (Array.isArray(body)) return body.length === 0;
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    if ("raw" in o && Object.keys(o).length === 1) return String(o.raw ?? "").trim() === "";
    return Object.keys(o).length === 0;
  }
  return false;
}

async function haloJson(params: Record<string, string | undefined>): Promise<OrdersResult> {
  if (!config.exitOrders.orderAuth) return { ok: false, empty: true, body: null, error: "EXIT_ORDER_API_AUTH niet ingesteld" };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const res = await requestJson<unknown>(`${config.exitOrders.baseUrl}/halo.json?${qs}`, {
    method: "GET",
    timeoutMs: 20_000,
    headers: { Authorization: config.exitOrders.orderAuth, Accept: "application/json" },
  });
  if (!res.ok) return { ok: false, empty: true, body: null, error: res.error };
  const body = schoon(res.data);
  return { ok: true, empty: isEmpty(body), body };
}

/** Alle bestellingen op een e-mailadres (HALO-tool 16). */
export function ordersByEmail(email: string, conversationId?: string): Promise<OrdersResult> {
  return haloJson({ email, conversationid: conversationId });
}

/** Serviceportaallink voor retour of klacht bij één bestelling (HALO-tool 18). */
export function portalLink(
  email: string,
  orderId: string,
  agent: "retour" | "klacht",
  conversationId?: string,
): Promise<OrdersResult> {
  return haloJson({ email, orderid: orderId, agent, conversationid: conversationId });
}

/**
 * Hoort dit ordernummer bij de bestellingen in `body`? We kennen de vorm van
 * het antwoord niet tot op de sleutel, dus we zoeken het nummer als waarde van
 * een veld dat naar een order-id of -nummer klinkt. Korte waarden tellen niet:
 * een aantal of huisnummer mag nooit als ordernummer doorgaan.
 */
export function ownsOrder(body: unknown, orderId: string): boolean {
  const wanted = orderId.trim().toLowerCase();
  if (wanted.length < 4) return false;
  const KEY = /order|id$|^id|number|nummer|increment|reference|ref/i;
  const walk = (x: unknown, key: string): boolean => {
    if (typeof x === "string" || typeof x === "number") {
      return KEY.test(key) && String(x).trim().toLowerCase() === wanted;
    }
    if (Array.isArray(x)) return x.some((v) => walk(v, key));
    if (x && typeof x === "object") return Object.entries(x).some(([k, v]) => walk(v, k));
    return false;
  };
  return walk(body, "");
}

export type Tracking = { ok: boolean; trackingNumber: string | null; trackingUrl: string | null; error?: string };

/** Trackingnummer en -link van één bestelling (HALO-tool 26). */
export async function tracking(orderId: string): Promise<Tracking> {
  if (!config.exitOrders.trackingAuth) {
    return { ok: false, trackingNumber: null, trackingUrl: null, error: "EXIT_TRACKING_API_AUTH niet ingesteld" };
  }
  const res = await requestJson<{ details_view?: Array<{ data?: Record<string, unknown> }> }>(
    `${config.exitOrders.baseUrl}/robin?order=&id=${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      timeoutMs: 20_000,
      redirect: "manual",
      headers: { Authorization: config.exitOrders.trackingAuth, Accept: "application/json" },
    },
  );
  if (!res.ok) return { ok: false, trackingNumber: null, trackingUrl: null, error: res.error };

  const data = res.data?.details_view?.[0]?.data ?? {};
  const html = Object.entries(data).find(([k]) => k.startsWith("Levering"))?.[1];
  if (typeof html !== "string") return { ok: true, trackingNumber: null, trackingUrl: null };

  const number = String(schoon(html.replace(/<[^>]+>/g, ""))).trim();
  const url = html.match(/href="([^"]+)"/)?.[1] ?? null;
  return {
    ok: true,
    trackingNumber: number && number !== "-" ? number : null,
    trackingUrl: url ? String(schoon(url)) : null,
  };
}
