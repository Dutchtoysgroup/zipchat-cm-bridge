import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { store } from "@/db";
import { sendGraphMail } from "./graph";
import { verifyMail } from "./verifyMail";
import { shopForChat, shopLang } from "./shops";
import { controleerContact } from "./bridge";
import * as orders from "./exitOrders";

/**
 * Bestelvragen in de chat met alleen een e-mailadres, zoals HALO het deed:
 *
 *   1. start  — de klant geeft zijn e-mailadres; de bridge mailt een code van
 *               6 cijfers vanuit noreply@exittoys.com.
 *   2. check  — de klant typt de code over; klopt hij, dan geeft de bridge de
 *               bestellingen op dat adres terug.
 *   3. order  — met hetzelfde e-mailadres en dezelfde code haalt de assistent
 *               tracking of een serviceportaallink op voor één van díe
 *               bestellingen.
 *
 * Na een goede code blijft die code een uur het bewijs voor dat adres (elk
 * gebruik verlengt het uur). Eerst kreeg de assistent een token, maar Zipchat
 * geeft toolantwoorden niet mee naar de volgende beurt: zodra de klant een
 * bestelling koos, was het token weg en mailde de assistent een nieuwe code.
 * Wat de klant typte (adres en code) staat wél in het gesprek.
 *
 * De bridge houdt de code en de order-API-sleutels; de assistent ziet nooit
 * een bestelling van een adres dat niet bevestigd is. Bij HALO zat de
 * controle in de flow; hier kan de assistent alleen curl draaien, dus moet de
 * controle aan deze kant.
 *
 * Alles staat in bridge_settings (geen migratie nodig), de code gehasht:
 *   otp:<e-mail>          code: hash, geldig tot, pogingen, al bevestigd?
 *   otprate:<e-mail>      tijdstippen van verstuurde codes (tegen spammen)
 */

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Zo lang blijft een bevestigde code geldig na het laatste gebruik. */
const SESSION_MINUTES = 60;
/** Hoogstens zoveel codes per adres per uur, en niet sneller dan elke 30 s. */
const MAX_SENDS_PER_HOUR = 3;
const MIN_SEND_GAP_MS = 30_000;

type Pending = { hash: string; until: number; attempts: number; chatId?: string; verified?: boolean };

export type VerifyReply = {
  ok: boolean;
  /** Wat de assistent nu moet doen of zeggen. */
  message: string;
  [k: string]: unknown;
};

const norm = (email: string) => email.trim().toLowerCase();

function codeHash(email: string, code: string): string {
  // Sleutel uit de omgeving: wie alleen de database leest, kan 10^6 codes niet
  // zomaar narekenen.
  const key = config.bridgeSecret ?? "dev-zonder-geheim";
  return createHmac("sha256", key).update(`${norm(email)}:${code}`).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** E-mailadres in het logboek zonder het hele adres: s***@dutchtoysgroup.com. */
function masked(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain ?? ""}`;
}

/* ------------------------------------------------------------------ code */

type CodeResult =
  | { state: "ok"; firstTime: boolean }
  | { state: "none" | "expired" | "locked" }
  | { state: "wrong"; left: number };

/**
 * Controleer een code tegen de lopende of al bevestigde code van dit adres.
 * Elke poging telt, ook bij een bevestigde code: vijf keer fout en hij vervalt.
 * Goed = vanaf nu een uur bevestigd.
 */
async function useCode(email: string, code: string, chatId?: string): Promise<CodeResult> {
  const key = `otp:${norm(email)}`;
  // Pogingen ophogen vóór het vergelijken, met compare-and-set: tien
  // gelijktijdige gokken tellen zo als tien pogingen, niet als één.
  let pending: Pending | null = null;
  for (let i = 0; i < 5; i++) {
    const raw = await store.getSetting(key);
    const cur = parse<Pending>(raw);
    if (!cur || cur.until < Date.now()) {
      pending = cur;
      break;
    }
    if (cur.attempts >= MAX_ATTEMPTS) {
      // Op: ook een goede code telt niet meer.
      pending = { ...cur, attempts: MAX_ATTEMPTS + 1 };
      break;
    }
    const next: Pending = { ...cur, attempts: cur.attempts + 1 };
    if (await store.compareAndSetSetting(key, raw, JSON.stringify(next))) {
      pending = next;
      break;
    }
  }

  if (!pending) return { state: "none" };
  if (pending.until < Date.now()) {
    await store.deleteSetting(key);
    return { state: "expired" };
  }
  const match = sameHex(pending.hash, codeHash(email, code));
  if (pending.attempts > MAX_ATTEMPTS || (pending.attempts === MAX_ATTEMPTS && !match)) {
    await store.deleteSetting(key);
    return { state: "locked" };
  }
  if (!match) return { state: "wrong", left: MAX_ATTEMPTS - pending.attempts };

  const session: Pending = {
    hash: pending.hash,
    until: Date.now() + SESSION_MINUTES * 60_000,
    attempts: 0,
    chatId: pending.chatId ?? chatId,
    verified: true,
  };
  await store.setSetting(key, JSON.stringify(session));
  return { state: "ok", firstTime: !pending.verified };
}

/** Wat de assistent moet doen als de code niet (meer) goed is. */
function codeProblem(r: Exclude<CodeResult, { state: "ok" }>): { reason: string; message: string; extra?: Record<string, unknown> } {
  switch (r.state) {
    case "none":
      return {
        reason: "geen code",
        message:
          "Er loopt geen code voor dit adres. Controleer of het e-mailadres precies hetzelfde is als waar de " +
          "code heen ging; zo niet, vraag dan een nieuwe code aan voor het juiste adres (stap 1).",
      };
    case "expired":
      return {
        reason: "verlopen",
        message: "De code is verlopen. Bied aan een nieuwe code te sturen (stap 1).",
      };
    case "locked":
      return {
        reason: "te vaak fout",
        message:
          "De code is te vaak verkeerd ingevuld en vervalt. Zeg dat de klant een nieuwe code kan laten sturen, " +
          "of gebruik de andere route: bestelnummer, postcode en huisnummer.",
      };
    case "wrong":
      return {
        reason: "verkeerde code",
        message:
          `De code klopt niet. Vraag de klant de code nog eens precies over te typen (nog ${r.left} ` +
          `poging${r.left === 1 ? "" : "en"}). Geef geen hint over welke cijfers fout zijn.`,
        extra: { attempts_left: r.left },
      };
  }
}

/* ------------------------------------------------------------------ start */

export async function startVerification(input: {
  email?: string;
  chatId?: string;
  conversationId?: string;
}): Promise<VerifyReply> {
  const email = (input.email ?? "").trim();
  if (!controleerContact(null, email).mailOk) {
    return {
      ok: false,
      sent: false,
      message:
        "Geen geldig e-mailadres. Vraag de klant om het e-mailadres waarmee besteld is, wacht op het " +
        "antwoord en roep de tool dan opnieuw aan. Vul nooit zelf een adres in.",
    };
  }

  // Al bevestigd: geen nieuwe code. De assistent vergeet tussen twee beurten
  // dat het al gelukt is en begint anders gewoon weer bij stap 1.
  const current = parse<Pending>(await store.getSetting(`otp:${norm(email)}`));
  if (current?.verified && current.until > Date.now()) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.already_verified",
      summary: `Geen nieuwe code voor ${masked(email)}: het adres is al bevestigd`,
      payload: { chatId: input.chatId, conversationId: input.conversationId },
    });
    return {
      ok: true,
      sent: false,
      already_verified: true,
      message:
        "Er is GEEN nieuwe code gestuurd: dit adres is het afgelopen uur al bevestigd. Staat er in dit gesprek " +
        "al een code die de klant typte en die klopte? Ga dan met dat e-mailadres en die code verder bij stap 2 " +
        "of 3 en vraag niets opnieuw. Zo niet, vraag de klant dan de code uit de laatste e-mail van EXIT Toys " +
        "in te typen.",
    };
  }

  const rateKey = `otprate:${norm(email)}`;
  const now = Date.now();
  const sends = (parse<number[]>(await store.getSetting(rateKey)) ?? []).filter((t) => t > now - 3_600_000);
  if (sends.length >= MAX_SENDS_PER_HOUR || (sends.length && now - Math.max(...sends) < MIN_SEND_GAP_MS)) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.rate_limited",
      ok: false,
      summary: `Verificatiecode voor ${masked(email)} niet verstuurd: te vaak gevraagd`,
      payload: { chatId: input.chatId, conversationId: input.conversationId },
    });
    return {
      ok: false,
      sent: false,
      rate_limited: true,
      message:
        "Er zijn net al codes naar dit adres gestuurd; er gaat nu geen nieuwe. Vraag de klant de laatst " +
        "ontvangen code in te typen (ook in de spammap kijken). Lukt dat niet, gebruik dan de andere route: " +
        "bestelnummer, postcode en huisnummer.",
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const shop = await shopForChat(input.chatId);
  const mail = verifyMail({
    code,
    lang: shopLang(shop),
    shop: shop?.domain ?? "exittoys.com",
    minutes: CODE_MINUTES,
  });

  const sent = await sendGraphMail({
    account: config.verifyGraph,
    to: [email],
    subject: mail.subject,
    html: mail.html,
    inlineImages: mail.inlineImages,
  });

  await store.logEvent({
    direction: "bridge->klant",
    kind: sent.ok ? "verify.code_sent" : "verify.mail_failed",
    ok: sent.ok,
    summary: sent.ok
      ? `Verificatiecode gemaild naar ${masked(email)}${shop ? ` (${shop.country})` : ""}`
      : `Verificatiecode NIET gemaild naar ${masked(email)}: ${sent.error}`,
    payload: { chatId: input.chatId, conversationId: input.conversationId },
  });

  if (!sent.ok) {
    return {
      ok: false,
      sent: false,
      message:
        "De code kon niet worden verstuurd. Zeg NIET dat er een code onderweg is. Gebruik de andere " +
        "route: vraag om bestelnummer, postcode en huisnummer.",
    };
  }

  // Een nieuwe code vervangt de vorige; pogingen beginnen opnieuw.
  const pending: Pending = { hash: codeHash(email, code), until: now + CODE_MINUTES * 60_000, attempts: 0, chatId: input.chatId };
  await store.setSetting(`otp:${norm(email)}`, JSON.stringify(pending));
  await store.setSetting(rateKey, JSON.stringify([...sends, now]));

  return {
    ok: true,
    sent: true,
    message:
      `Code verstuurd. Zeg de klant dat er een code van 6 cijfers naar ${email} is gemaild (${CODE_MINUTES} ` +
      "minuten geldig, eventueel in de spammap) en vraag hem die hier in te typen. Noem de code zelf nooit.",
  };
}

/* ------------------------------------------------------------------ check */

export async function checkVerification(input: {
  email?: string;
  code?: string;
  chatId?: string;
  conversationId?: string;
}): Promise<VerifyReply> {
  const email = (input.email ?? "").trim();
  const code = (input.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) {
    return {
      ok: false,
      verified: false,
      message:
        "Geef het e-mailadres waar de code heen ging en de 6 cijfers die de klant typte. Vraag de klant " +
        "de code opnieuw in te typen als je geen 6 cijfers hebt.",
    };
  }

  const r = await useCode(email, code, input.chatId);
  if (r.state !== "ok") {
    const p = codeProblem(r);
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.failed",
      ok: false,
      summary: `Verificatie ${masked(email)} mislukt: ${p.reason}`,
      payload: { chatId: input.chatId, conversationId: input.conversationId, reason: p.reason },
    });
    return { ok: false, verified: false, reason: p.reason, message: p.message, ...p.extra };
  }

  const found = await orders.ordersByEmail(norm(email), input.conversationId);
  if (r.firstTime) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.ok",
      summary: `E-mailadres ${masked(email)} bevestigd; ${found.ok ? (found.empty ? "geen bestellingen" : "bestellingen gevonden") : `bestellingen ophalen mislukt: ${found.error}`}`,
      payload: { chatId: input.chatId, conversationId: input.conversationId },
    });
  }

  if (!found.ok) {
    return {
      ok: true,
      verified: true,
      orders: null,
      message:
        "Het e-mailadres is bevestigd, maar de bestellingen konden nu niet worden opgehaald. Probeer het " +
        "één keer opnieuw met de order-actie \"list\" (zelfde e-mailadres en code); lukt dat niet, bied dan " +
        "aan door te verbinden.",
    };
  }
  if (found.empty) {
    return {
      ok: true,
      verified: true,
      orders: [],
      message:
        "Het e-mailadres is bevestigd, maar er staan geen bestellingen op dit adres. Vraag of de klant met " +
        "een ander e-mailadres heeft besteld, of gebruik de andere route: bestelnummer, postcode en huisnummer.",
    };
  }
  return {
    ok: true,
    verified: true,
    orders: found.body,
    message:
      "Het e-mailadres is bevestigd. Laat de klant kiezen om welke bestelling het gaat: noem per bestelling " +
      "alleen het bestelnummer, de datum en de artikelen. Gebruik in stap 3 hetzelfde e-mailadres en dezelfde " +
      "code; die blijven een uur geldig. Vraag de klant in dit gesprek dus niet opnieuw om een code.",
  };
}

/* ------------------------------------------------------------------ order */

export async function orderInfo(input: {
  email?: string;
  code?: string;
  orderId?: string;
  info?: "list" | "tracking" | "retour" | "klacht";
  conversationId?: string;
}): Promise<VerifyReply> {
  const email = (input.email ?? "").trim();
  const code = (input.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) {
    return {
      ok: false,
      verified: false,
      message:
        "Geef het bevestigde e-mailadres en de code die de klant eerder in dit gesprek typte. Staat er geen " +
        "code in het gesprek, stuur dan eerst een code (stap 1).",
    };
  }

  const r = await useCode(email, code);
  if (r.state !== "ok") {
    const p = codeProblem(r);
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.order_refused",
      ok: false,
      summary: `Bestelgegevens voor ${masked(email)} geweigerd: ${p.reason}`,
      payload: { conversationId: input.conversationId, info: input.info, reason: p.reason },
    });
    return { ok: false, verified: false, reason: p.reason, message: p.message, ...p.extra };
  }

  const list = await orders.ordersByEmail(norm(email), input.conversationId);
  if (!list.ok) {
    return { ok: false, message: "De bestellingen konden nu niet worden opgehaald. Bied aan door te verbinden." };
  }
  if (input.info === "list" || !input.info) {
    return { ok: true, orders: list.empty ? [] : list.body, message: "De bestellingen op het bevestigde e-mailadres." };
  }

  const orderId = (input.orderId ?? "").trim();
  if (!orderId || list.empty || !orders.ownsOrder(list.body, orderId)) {
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "verify.order_refused",
      ok: false,
      summary: `Order ${orderId || "(leeg)"} hoort niet bij ${masked(email)}; geweigerd`,
      payload: { conversationId: input.conversationId, info: input.info },
    });
    return {
      ok: false,
      message:
        "Dit bestelnummer hoort niet bij het bevestigde e-mailadres. Gebruik alleen een bestelnummer uit de " +
        "lijst die je na de verificatie kreeg, precies zoals het daar staat.",
    };
  }

  if (input.info === "tracking") {
    const t = await orders.tracking(orderId);
    if (!t.ok) return { ok: false, message: "De tracking kon nu niet worden opgehaald. Bied aan door te verbinden." };
    return {
      ok: true,
      order_id: orderId,
      tracking_number: t.trackingNumber,
      tracking_url: t.trackingUrl,
      message: t.trackingUrl
        ? "Geef het trackingnummer en de link, teken voor teken."
        : "Er is (nog) geen tracking. Kijk naar de orderstatus in de lijst en zeg alleen wat daaruit blijkt.",
    };
  }

  const portal = await orders.portalLink(norm(email), orderId, input.info, input.conversationId);
  if (!portal.ok || portal.empty) {
    return {
      ok: false,
      order_id: orderId,
      message: "Er kwam geen serviceportaallink terug voor deze bestelling. Bied aan door te verbinden.",
    };
  }
  return {
    ok: true,
    order_id: orderId,
    result: portal.body,
    message: "Geef de serviceportaallink uit 'result', teken voor teken, met één zin uitleg.",
  };
}
