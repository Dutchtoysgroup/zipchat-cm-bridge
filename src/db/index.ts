import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { config } from "@/lib/config";
import { sessions, events, type Session, type NewSession, type BridgeEvent } from "./schema";

export type EventInput = {
  sessionId?: number | null;
  direction: "zipchat->bridge" | "bridge->cm" | "cm->bridge" | "bridge->zipchat" | "internal";
  kind: string;
  ok?: boolean;
  statusCode?: number | null;
  summary?: string | null;
  payload?: unknown;
};

export interface Store {
  readonly kind: "neon" | "memory";
  createSession(s: NewSession): Promise<Session>;
  updateSession(id: number, patch: Partial<NewSession>): Promise<Session | null>;
  getSessionById(id: number): Promise<Session | null>;
  getSessionByZipchatConversation(conversationId: string): Promise<Session | null>;
  getSessionByCmChatId(cmChatId: string): Promise<Session | null>;
  listSessions(limit?: number): Promise<Session[]>;
  listOpenSessions(): Promise<Session[]>;
  logEvent(e: EventInput): Promise<void>;
  listEvents(limit?: number): Promise<BridgeEvent[]>;
  reset(): Promise<void>;
}

/* ------------------------------------------------------------------ Neon */

class NeonStore implements Store {
  readonly kind = "neon" as const;
  private db: ReturnType<typeof drizzle>;

  constructor(url: string) {
    this.db = drizzle(neon(url));
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

  async reset() {
    // Alleen bedoeld voor testdata: verwijdert gesloten sessies ouder dan nu.
    await this.db.delete(events);
    await this.db.delete(sessions).where(lt(sessions.createdAt, new Date()));
  }
}

/* ---------------------------------------------------------------- Memory */

/**
 * Fallback zodat het project meteen draait zonder Neon.
 * LET OP: per serverless-invocatie leeg op Vercel — alleen voor lokale dev.
 */
class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private sessions: Session[] = [];
  private events: BridgeEvent[] = [];
  private seqS = 1;
  private seqE = 1;

  async createSession(s: NewSession): Promise<Session> {
    const now = new Date();
    const row = {
      id: this.seqS++,
      cmChatId: null,
      cmConversationClientId: null,
      customerName: null,
      customerEmail: null,
      channel: "webchat",
      status: "escalating",
      reason: null,
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
  async reset() {
    this.sessions = [];
    this.events = [];
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
  (globalThis.__bridgeStore = config.databaseUrl ? new NeonStore(config.databaseUrl) : new MemoryStore());

export * from "./schema";
