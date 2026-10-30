import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { DefaultAzureCredential } from "@azure/identity";
import { and, desc, eq, inArray, isNotNull, like, lt, sql, type SQL } from "drizzle-orm";
import { config } from "@/lib/config";
import { sessions, events, settings, access, accessLog, type Session, type NewSession, type BridgeEvent } from "./schema";

export type EventInput = {
  sessionId?: number | null;
  direction: "zipchat->bridge" | "bridge->cm" | "cm->bridge" | "bridge->zipchat" | "bridge->klant" | "internal";
  kind: string;
  ok?: boolean;
  statusCode?: number | null;
  summary?: string | null;
  payload?: unknown;
};

export interface Store {
  readonly kind: "postgres" | "memory";
  createSession(s: NewSession): Promise<Session>;
  updateSession(id: number, patch: Partial<NewSession>): Promise<Session | null>;
  getSessionById(id: number): Promise<Session | null>;
  getSessionByZipchatConversation(conversationId: string): Promise<Session | null>;
  getSessionByCmChatId(cmChatId: string): Promise<Session | null>;
  listSessions(limit?: number): Promise<Session[]>;
  listOpenSessions(): Promise<Session[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  /**
   * Zet `next` alleen als de huidige waarde nog `expected` is (null = er is nog
   * geen rij). Zo kunnen twee gelijktijdige pogingen op een e-mailcode niet
   * allebei dezelfde teller ophogen. true = gezet.
   */
  compareAndSetSetting(key: string, expected: string | null, next: string): Promise<boolean>;
  /**
   * Id van het laatste Zipchat-bericht van deze sessie dat al bij CM ligt: in
   * het openingsticket of los doorgestuurd. De poller stuurt alleen wat erna
   * komt. Zipchat-id's lopen op; de tijdstempels hebben maar secondeprecisie,
   * dus alleen daarop sturen laat berichten uit dezelfde seconde vallen.
   */
  getForwardCursor(sessionId: number): Promise<number | null>;
  setForwardCursor(sessionId: number, messageId: number): Promise<void>;
  /**
   * Eén pollvenster tegelijk. Nemen lukt alleen als de lease vrij, verlopen of
   * al van dit token is; dat gebeurt in één statement, zodat twee aanvragen
   * tegelijk hem niet allebei krijgen. Verlengen en vrijgeven kan alleen de
   * eigenaar.
   */
  acquireLease(key: string, token: string, ttlMs: number): Promise<boolean>;
  renewLease(key: string, token: string, ttlMs: number): Promise<boolean>;
  releaseLease(key: string, token: string): Promise<void>;
  /**
   * Eenmalig gebruik van een sleutel (het jti van een SSO-ticket). true = nu
   * voor het eerst gezien. Oude sleutels ruimt hij zelf op.
   */
  claimOnce(key: string): Promise<boolean>;
  /** Toegangslijst van het dashboard (tabel toegang, V169): Marketing-account-id's. */
  listAccess(): Promise<string[]>;
  hasAccess(marketingId: string): Promise<boolean>;
  /** Toegang geven of nemen, met een regel in het log. false = er veranderde niets. */
  setAccess(marketingId: string, granted: boolean, by: AccessActor): Promise<boolean>;
  logEvent(e: EventInput): Promise<void>;
  /** Tijd van de laatste gebeurtenis in deze richting, binnen de bewaartermijn. */
  lastEventAt(direction: EventInput["direction"]): Promise<Date | null>;
  /**
   * Sluit open sessies in deze modus die sinds `cutoff` niet zijn bijgewerkt.
   * Geeft het aantal terug.
   */
  closeIdleSessions(mode: string, cutoff: Date): Promise<number>;
  listEvents(limit?: number): Promise<BridgeEvent[]>;
  /** Bewaartermijn: events weg, naam en e-mail van gesloten sessies leeg. */
  purgeOlderThan(cutoff: Date): Promise<{ events: number; sessions: number }>;
  reset(): Promise<void>;
}

/**
 * De cursor staat in bridge_settings, net als de poll-lease: zo is er geen
 * migratie op het centrale dataplatform voor nodig. Eén rij per sessie; de
 * bewaartermijn ruimt ze op.
 */
const CURSOR_PREFIX = "forward_cursor:";

/**
 * E-mailverificatie (src/lib/verify.ts), ook in bridge_settings: de code per
 * e-mailadres (lopend of bevestigd) en de verzendtijden. De dagelijkse
 * opschoning haalt ze na een dag weg; geldig zijn ze veel korter. `otpok:` is
 * van de oude tokenroute (tot 30 okt 2026) en staat er nog voor de opruiming.
 */
export const VERIFY_PREFIXES = ["otp:", "otpok:", "otprate:"] as const;

/** Gebruikte SSO-tickets, ook in bridge_settings. Een ticket leeft 2 minuten. */
const ONCE_PREFIX = "sso_jti:";
const ONCE_KEEP_MS = 60 * 60 * 1000;

/** Wie toegang geeft of neemt; komt in toegang_log. */
export type AccessActor = { id: string; name: string };

function parseCursor(raw: string | null): number | null {
  const n = Number(raw);
  return raw !== null && Number.isSafeInteger(n) ? n : null;
}

/** Een lease staat in bridge_settings als "<token>:<geldig tot, epoch-ms>". */
function parseLease(raw: string | null): { token: string; until: number } | null {
  if (!raw) return null;
  const [token, until] = raw.split(":");
  const ms = Number(until);
  return token && Number.isFinite(ms) ? { token, until: ms } : null;
}

function leaseToken(col: typeof settings.value): SQL {
  return sql`split_part(${col}, ':', 1)`;
}

/** Onleesbare waarde telt als verlopen, anders zou één kapotte rij het pollen blokkeren. */
function leaseUntil(col: typeof settings.value): SQL {
  return sql`case when split_part(${col}, ':', 2) ~ '^[0-9]+$' then split_part(${col}, ':', 2)::bigint else 0 end`;
}

/* -------------------------------------------------------------- Postgres */

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Productie draait op het centrale DTG-dataplatform (`dtg-data-platform-pg`,
 * schema `app_zipchat_bridge`). Daar bestaan geen wachtwoorden: met
 * DATABASE_AUTH=entra haalt de App Service met zijn managed identity een token
 * op, en dat token ís het wachtwoord. De gebruikersnaam in DATABASE_URL is de
 * naam van de App Service.
 *
 * TLS wordt altijd geverifieerd, behalve tegen een database op de machine zelf.
 * sslmode e.d. halen we uit de URL, omdat pg die boven het ssl-object laat gaan.
 */
function poolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "ssl"]) {
    url.searchParams.delete(key);
  }
  const ssl = LOOPBACK_HOSTS.has(url.hostname) ? false : { rejectUnauthorized: true };
  const schema = process.env.DATABASE_SCHEMA;
  const base: PoolConfig = {
    ssl,
    // De bridge doet weinig tegelijk; één lang lopend Node-proces op App Service.
    max: 5,
    idleTimeoutMillis: 30_000,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  };

  if (process.env.DATABASE_AUTH !== "entra") return { ...base, connectionString: url.toString() };

  if (url.password) throw new Error("DATABASE_AUTH=entra vereist een DATABASE_URL zonder wachtwoord");
  const credential = new DefaultAzureCredential();
  return {
    ...base,
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: async () => {
      const token = await credential.getToken("https://ossrdbms-aad.database.windows.net/.default");
      if (!token) throw new Error("Geen Entra-token voor PostgreSQL ontvangen");
      return token.token;
    },
  };
}

class PgStore implements Store {
  readonly kind = "postgres" as const;
  private db: ReturnType<typeof drizzle>;

  constructor(url: string) {
    this.db = drizzle(new Pool(poolConfig(url)));
  }

  async createSession(s: NewSession): Promise<Session> {
    const [row] = await this.db.insert(sessions).values(s).returning();
    return row;
  }

  async updateSession(id: number, patch: Partial<NewSession>): Promise<Session | null> {
    const [row] = await this.db
      .update(sessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    return row ?? null;
  }

  async getSessionById(id: number) {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ?? null;
  }

  async getSessionByZipchatConversation(conversationId: string) {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.zipchatConversationId, conversationId))
      .limit(1);
    return row ?? null;
  }

  async getSessionByCmChatId(cmChatId: string) {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.cmChatId, cmChatId)).limit(1);
    return row ?? null;
  }

  async listSessions(limit = 100) {
    return this.db.select().from(sessions).orderBy(desc(sessions.updatedAt)).limit(limit);
  }

  async listOpenSessions() {
    return this.db.select().from(sessions).where(inArray(sessions.status, ["escalating", "active"]));
  }

  async getSetting(key: string) {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string) {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }

  async deleteSetting(key: string) {
    await this.db.delete(settings).where(eq(settings.key, key));
  }

  async compareAndSetSetting(key: string, expected: string | null, next: string) {
    const rows =
      expected === null
        ? await this.db
            .insert(settings)
            .values({ key, value: next })
            .onConflictDoNothing()
            .returning({ key: settings.key })
        : await this.db
            .update(settings)
            .set({ value: next, updatedAt: new Date() })
            .where(and(eq(settings.key, key), eq(settings.value, expected)))
            .returning({ key: settings.key });
    return rows.length > 0;
  }

  async getForwardCursor(sessionId: number) {
    return parseCursor(await this.getSetting(`${CURSOR_PREFIX}${sessionId}`));
  }

  async setForwardCursor(sessionId: number, messageId: number) {
    await this.setSetting(`${CURSOR_PREFIX}${sessionId}`, String(messageId));
  }

  async acquireLease(key: string, token: string, ttlMs: number) {
    const now = Date.now();
    const value = `${token}:${now + ttlMs}`;
    const rows = await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
        setWhere: sql`${leaseUntil(settings.value)} < ${now} or ${leaseToken(settings.value)} = ${token}`,
      })
      .returning({ key: settings.key });
    return rows.length > 0;
  }

  async renewLease(key: string, token: string, ttlMs: number) {
    const rows = await this.db
      .update(settings)
      .set({ value: `${token}:${Date.now() + ttlMs}`, updatedAt: new Date() })
      .where(and(eq(settings.key, key), sql`${leaseToken(settings.value)} = ${token}`))
      .returning({ key: settings.key });
    return rows.length > 0;
  }

  async releaseLease(key: string, token: string) {
    await this.db.delete(settings).where(and(eq(settings.key, key), sql`${leaseToken(settings.value)} = ${token}`));
  }

  async claimOnce(key: string) {
    await this.db
      .delete(settings)
      .where(and(like(settings.key, `${ONCE_PREFIX}%`), lt(settings.updatedAt, new Date(Date.now() - ONCE_KEEP_MS))));
    const rows = await this.db
      .insert(settings)
      .values({ key: `${ONCE_PREFIX}${key}`, value: "1" })
      .onConflictDoNothing()
      .returning({ key: settings.key });
    return rows.length > 0;
  }

  async listAccess() {
    const rows = await this.db.select({ id: access.marketingId }).from(access).orderBy(access.marketingId);
    return rows.map((r) => r.id);
  }

  async hasAccess(marketingId: string) {
    const [row] = await this.db
      .select({ id: access.marketingId })
      .from(access)
      .where(eq(access.marketingId, marketingId))
      .limit(1);
    return !!row;
  }

  async setAccess(marketingId: string, granted: boolean, by: AccessActor) {
    return this.db.transaction(async (tx) => {
      const changed = granted
        ? await tx
            .insert(access)
            .values({ marketingId, grantedBy: by.id, grantedByName: by.name })
            .onConflictDoNothing()
            .returning({ id: access.marketingId })
        : await tx.delete(access).where(eq(access.marketingId, marketingId)).returning({ id: access.marketingId });
      if (changed.length === 0) return false;
      await tx.insert(accessLog).values({
        marketingId,
        action: granted ? "toegekend" : "ingetrokken",
        by: by.id,
        byName: by.name,
      });
      return true;
    });
  }

  async logEvent(e: EventInput) {
    await this.db.insert(events).values({
      sessionId: e.sessionId ?? null,
      direction: e.direction,
      kind: e.kind,
      ok: e.ok ?? true,
      statusCode: e.statusCode ?? null,
      summary: e.summary ?? null,
      payload: (e.payload ?? null) as never,
    });
  }

  async listEvents(limit = 200) {
    return this.db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
  }

  async lastEventAt(direction: EventInput["direction"]) {
    const [row] = await this.db
      .select({ at: events.createdAt })
      .from(events)
      .where(eq(events.direction, direction))
      .orderBy(desc(events.createdAt))
      .limit(1);
    return row?.at ?? null;
  }

  async closeIdleSessions(mode: string, cutoff: Date) {
    const rows = await this.db
      .update(sessions)
      .set({ status: "closed", updatedAt: new Date() })
      .where(
        and(
          inArray(sessions.status, ["escalating", "active"]),
          eq(sessions.mode, mode),
          lt(sessions.updatedAt, cutoff),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  async purgeOlderThan(cutoff: Date) {
    const ev = await this.db.delete(events).where(lt(events.createdAt, cutoff)).returning({ id: events.id });
    const ss = await this.db
      .update(sessions)
      .set({ customerName: null, customerEmail: null })
      .where(and(eq(sessions.status, "closed"), lt(sessions.updatedAt, cutoff), isNotNull(sessions.customerEmail)))
      .returning({ id: sessions.id });
    // Een cursor die 90 dagen niet is bijgewerkt hoort bij een sessie die al
    // lang dicht is (die sluit na een uur stilte vanzelf).
    await this.db
      .delete(settings)
      .where(and(like(settings.key, `${CURSOR_PREFIX}%`), lt(settings.updatedAt, cutoff)));
    // E-mailcodes en verificaties leven hooguit een uur; een dag is ruim.
    const dag = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const prefix of VERIFY_PREFIXES) {
      await this.db.delete(settings).where(and(like(settings.key, `${prefix}%`), lt(settings.updatedAt, dag)));
    }
    return { events: ev.length, sessions: ss.length };
  }

  async reset() {
    // Alleen bedoeld voor testdata: verwijdert gesloten sessies ouder dan nu.
    await this.db.delete(events);
    await this.db.delete(sessions).where(lt(sessions.createdAt, new Date()));
    await this.db.delete(settings).where(like(settings.key, `${CURSOR_PREFIX}%`));
  }
}

/* ---------------------------------------------------------------- Memory */

/**
 * Fallback zodat het project meteen draait zonder database.
 * LET OP: leeg na elke herstart en niet gedeeld tussen instanties — alleen voor lokale dev.
 */
class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private sessions: Session[] = [];
  private events: BridgeEvent[] = [];
  private settings = new Map<string, string>();
  private seqS = 1;
  private seqE = 1;

  async createSession(s: NewSession): Promise<Session> {
    const now = new Date();
    const row = {
      id: this.seqS++,
      cmChatId: null,
      cmConversationClientId: null,
      cmSessionId: null,
      customerName: null,
      customerEmail: null,
      channel: "webchat",
      status: "escalating",
      reason: null,
      mode: "email",
      handoverState: null,
      agentName: null,
      lastForwardedAt: null,
      lastAgentReplyAt: null,
      ...s,
      createdAt: now,
      updatedAt: now,
    } as Session;
    this.sessions.unshift(row);
    return row;
  }

  async updateSession(id: number, patch: Partial<NewSession>) {
    const i = this.sessions.findIndex((s) => s.id === id);
    if (i === -1) return null;
    this.sessions[i] = { ...this.sessions[i], ...patch, updatedAt: new Date() } as Session;
    return this.sessions[i];
  }

  async getSessionById(id: number) {
    return this.sessions.find((s) => s.id === id) ?? null;
  }
  async getSessionByZipchatConversation(cid: string) {
    return this.sessions.find((s) => s.zipchatConversationId === cid) ?? null;
  }
  async getSessionByCmChatId(cmChatId: string) {
    return this.sessions.find((s) => s.cmChatId === cmChatId) ?? null;
  }
  async listSessions(limit = 100) {
    return [...this.sessions]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }
  async listOpenSessions() {
    return this.sessions.filter((s) => s.status === "escalating" || s.status === "active");
  }
  async getSetting(key: string) {
    return this.settings.get(key) ?? null;
  }
  async setSetting(key: string, value: string) {
    this.settings.set(key, value);
  }
  async deleteSetting(key: string) {
    this.settings.delete(key);
  }
  async compareAndSetSetting(key: string, expected: string | null, next: string) {
    if ((this.settings.get(key) ?? null) !== expected) return false;
    this.settings.set(key, next);
    return true;
  }
  async getForwardCursor(sessionId: number) {
    return parseCursor(this.settings.get(`${CURSOR_PREFIX}${sessionId}`) ?? null);
  }
  async setForwardCursor(sessionId: number, messageId: number) {
    this.settings.set(`${CURSOR_PREFIX}${sessionId}`, String(messageId));
  }
  async acquireLease(key: string, token: string, ttlMs: number) {
    const now = Date.now();
    const cur = parseLease(this.settings.get(key) ?? null);
    if (cur && cur.until >= now && cur.token !== token) return false;
    this.settings.set(key, `${token}:${now + ttlMs}`);
    return true;
  }
  async renewLease(key: string, token: string, ttlMs: number) {
    if (parseLease(this.settings.get(key) ?? null)?.token !== token) return false;
    this.settings.set(key, `${token}:${Date.now() + ttlMs}`);
    return true;
  }
  async releaseLease(key: string, token: string) {
    if (parseLease(this.settings.get(key) ?? null)?.token === token) this.settings.delete(key);
  }
  private access = new Map<string, AccessActor>();
  private once = new Map<string, number>();
  async claimOnce(key: string) {
    const now = Date.now();
    for (const [k, t] of this.once) if (t < now - ONCE_KEEP_MS) this.once.delete(k);
    if (this.once.has(key)) return false;
    this.once.set(key, now);
    return true;
  }
  async listAccess() {
    return [...this.access.keys()].sort();
  }
  async hasAccess(marketingId: string) {
    return this.access.has(marketingId);
  }
  async setAccess(marketingId: string, granted: boolean, by: AccessActor) {
    if (granted === this.access.has(marketingId)) return false;
    if (granted) this.access.set(marketingId, by);
    else this.access.delete(marketingId);
    return true;
  }
  async logEvent(e: EventInput) {
    this.events.unshift({
      id: this.seqE++,
      sessionId: e.sessionId ?? null,
      direction: e.direction,
      kind: e.kind,
      ok: e.ok ?? true,
      statusCode: e.statusCode ?? null,
      summary: e.summary ?? null,
      payload: (e.payload ?? null) as never,
      createdAt: new Date(),
    });
    this.events = this.events.slice(0, 500);
  }
  async listEvents(limit = 200) {
    return this.events.slice(0, limit);
  }
  async lastEventAt(direction: EventInput["direction"]) {
    return this.events.find((e) => e.direction === direction)?.createdAt ?? null;
  }
  async closeIdleSessions(mode: string, cutoff: Date) {
    let n = 0;
    for (const s of this.sessions) {
      if ((s.status === "escalating" || s.status === "active") && s.mode === mode && s.updatedAt < cutoff) {
        s.status = "closed";
        s.updatedAt = new Date();
        n++;
      }
    }
    return n;
  }
  async purgeOlderThan(cutoff: Date) {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.createdAt >= cutoff);
    let n = 0;
    for (const s of this.sessions) {
      if (s.status === "closed" && s.updatedAt < cutoff && s.customerEmail) {
        s.customerName = null;
        s.customerEmail = null;
        n++;
      }
    }
    return { events: before - this.events.length, sessions: n };
  }

  async reset() {
    this.sessions = [];
    this.events = [];
    // Sessie-id's beginnen weer bij 1; een oude cursor zou dan bij een nieuwe sessie horen.
    for (const key of [...this.settings.keys()]) if (key.startsWith(CURSOR_PREFIX)) this.settings.delete(key);
    this.seqS = 1;
    this.seqE = 1;
  }
}

/* -------------------------------------------------------------- Singleton */

declare global {
  // eslint-disable-next-line no-var
  var __bridgeStore: Store | undefined;
}

export const store: Store =
  globalThis.__bridgeStore ??
  (globalThis.__bridgeStore = config.databaseUrl ? new PgStore(config.databaseUrl) : new MemoryStore());

export * from "./schema";
