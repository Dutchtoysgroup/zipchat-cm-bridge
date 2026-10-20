import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Aanmelden via het platformdashboard (admin.dashboard-exit.com), zoals het
 * contractregister en de publieke MCP. Geen eigen wachtwoorden: wie in admin
 * is aangemeld (zelf via Marketing, met 2FA of passkey) komt terug met een
 * kortlevend HMAC-ticket. De uitgever staat in dtg-data-platform,
 * dashboard/src/lib/sso-uitgifte.ts (app `zipchat`, SSO_ZIPCHAT_SECRET en
 * SSO_ZIPCHAT_URL daar; hier ADMIN_SSO_SECRET).
 *
 * Met datzelfde geheim ondertekent admin ook zijn beheeracties naar
 * /platform/manage, en ondertekent de bridge zijn eigen sessiecookie. Een
 * vast voorvoegsel per soort houdt ze uit elkaar: een ticket is geen geldig
 * platformtoken of cookie, en andersom.
 */

export const AUDIENCE = "zipchat";
export const ISSUER = "admin";
export const PLATFORM_PREFIX = "dtg-platform-v1:";
export const PLATFORM_PATH = "/platform/manage";
const SESSION_PREFIX = "sessie:";

/** Korter is eerder een placeholder dan een geheim; admin eist hetzelfde. */
export const MIN_SSO_SECRET = 32;

export const SESSION_COOKIE = "zcb_sessie";
export const STATE_COOKIE = "zcb_state";
export const SESSION_TTL_S = 8 * 3600;
/** De middleware geeft hierin de naam van wie er is aangemeld door aan de pagina. */
export const USER_HEADER = "x-bridge-user";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTicket extends Error {}

export type Ticket = { jti: string; marketingId: string; email: string; name: string; exp: number };
export type SessionUser = { id: string; name: string; email: string; exp: number };
export type Actor = { id: string; name: string; email: string; role: string };

export function ssoSecret(): string {
  return process.env.ADMIN_SSO_SECRET?.trim() ?? "";
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const hmac = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest("base64url");
const b64json = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function parse(body: string): Record<string, unknown> | null {
  try {
    const p: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/* ------------------------------------------------------------- Ticket */

/** Alleen voor tests en lokaal proberen: een ticket zoals admin het maakt. */
export function signTicket(secret: string, payload: Record<string, unknown>): string {
  const body = b64json(payload);
  return `${body}.${hmac(secret, body)}`;
}

/** Het ticket uit /auth/callback, zoals sso-uitgifte.ts `maak_ticket` het maakt. */
export function verifyTicket(secret: string, ticket: string, state: string | undefined, now = Date.now() / 1000): Ticket {
  if (secret.length < MIN_SSO_SECRET) throw new InvalidTicket("SSO is niet ingesteld");
  if (!ticket || ticket.length > 4096 || ticket.split(".").length !== 2) throw new InvalidTicket("ticket heeft niet de juiste vorm");
  const [body = "", sig = ""] = ticket.split(".");
  if (!same(sig, hmac(secret, body))) throw new InvalidTicket("handtekening klopt niet");
  const p = parse(body);
  if (!p) throw new InvalidTicket("ticket is geen JSON");
  if (p.v !== 1 || p.aud !== AUDIENCE) throw new InvalidTicket("ticket is niet voor deze app");
  if (p.iss !== ISSUER) throw new InvalidTicket("ticket komt niet van het platformdashboard");
  if (typeof p.exp !== "number" || p.exp < now) throw new InvalidTicket("ticket is verlopen");
  if (typeof p.iat !== "number" || p.iat > now + 60) throw new InvalidTicket("ticket komt uit de toekomst");
  // Zonder deze controle kan iemand een ander onder zijn eigen account laten
  // inloggen (login-CSRF).
  if (!state || typeof p.state !== "string" || !same(p.state, state)) throw new InvalidTicket("ticket hoort niet bij deze browser");
  for (const field of ["jti", "sub", "email"]) {
    if (typeof p[field] !== "string" || !p[field]) throw new InvalidTicket(`veld ${field} ontbreekt`);
  }
  if (!UUID.test(p.sub as string)) throw new InvalidTicket("sub is geen Marketing-account-id");
  const email = (p.email as string).toLowerCase();
  return {
    jti: p.jti as string,
    marketingId: (p.sub as string).toLowerCase(),
    email,
    name: typeof p.name === "string" && p.name ? p.name : email,
    exp: p.exp,
  };
}

/* ------------------------------------------------------------ Sessie */

/**
 * Sessiecookie: base64url(JSON) + "." + HMAC. Geen sessietabel; wie er in mag
 * wordt bij elk verzoek opnieuw in de toegangslijst opgezocht (toegang.ts).
 */
export function signSession(secret: string, user: Omit<SessionUser, "exp">, now = Date.now() / 1000): string {
  const body = b64json({ ...user, exp: Math.floor(now) + SESSION_TTL_S });
  return `${body}.${hmac(secret, SESSION_PREFIX + body)}`;
}

export function readSession(secret: string, value: string | undefined, now = Date.now() / 1000): SessionUser | null {
  if (!value || secret.length < MIN_SSO_SECRET || value.length > 4096) return null;
  const [body = "", sig = ""] = value.split(".");
  if (!same(sig, hmac(secret, SESSION_PREFIX + body))) return null;
  const s = parse(body);
  if (!s || typeof s.exp !== "number" || s.exp <= now) return null;
  if (typeof s.id !== "string" || !UUID.test(s.id) || typeof s.email !== "string") return null;
  return { id: s.id, name: typeof s.name === "string" ? s.name : s.email, email: s.email, exp: s.exp };
}

/* ------------------------------------------------------ Platformtoken */

const sha256 = (body: Buffer) => createHash("sha256").update(body).digest("hex");

/** Alleen voor tests: een token zoals admin het maakt (platform-signing.ts `sign`). */
export function signPlatform(secret: string, body: Buffer, actor: Actor, now = Math.floor(Date.now() / 1000)): string {
  const payload = { v: 1, iss: ISSUER, aud: AUDIENCE, method: "POST", path: PLATFORM_PATH, hash: sha256(body), actor, iat: now, exp: now + 30 };
  const b = b64json(payload);
  return `${b}.${hmac(secret, PLATFORM_PREFIX + b)}`;
}

/**
 * De X-DTG-Platform-kop van een beheeractie uit admin
 * (dtg-data-platform, docs/platform-toegang.md): richting, pad, body,
 * levensduur en identiteit. null = weigeren, zonder te zeggen waarom.
 */
export function verifyPlatform(secret: string, token: string, body: Buffer, now = Math.floor(Date.now() / 1000)): Actor | null {
  if (secret.length < MIN_SSO_SECRET || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [b = "", sig = ""] = token.split(".");
  if (!same(sig, hmac(secret, PLATFORM_PREFIX + b))) return null;
  const p = parse(b);
  if (
    !p ||
    p.v !== 1 ||
    p.iss !== ISSUER ||
    p.aud !== AUDIENCE ||
    p.method !== "POST" ||
    p.path !== PLATFORM_PATH ||
    p.hash !== sha256(body) ||
    !Number.isInteger(p.iat) ||
    !Number.isInteger(p.exp) ||
    Number(p.iat) > now + 5 ||
    Number(p.exp) <= now ||
    Number(p.exp) - Number(p.iat) !== 30
  ) {
    return null;
  }
  const a = p.actor;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const actor = a as Record<string, unknown>;
  if (!["id", "name", "email", "role"].every((k) => typeof actor[k] === "string") || !UUID.test(String(actor.id))) return null;
  return { id: actor.id as string, name: actor.name as string, email: actor.email as string, role: actor.role as string };
}

/* ------------------------------------------------------------ Cookies */

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  for (const part of (cookieHeader ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function cookieAttrs(maxAge: number): string {
  // Lokaal (http://localhost) zet een browser geen Secure-cookie.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
