import { pgTable, serial, text, timestamp, boolean, integer, jsonb, index, uuid, bigint } from "drizzle-orm/pg-core";

/** Eén escalatie: koppelt een Zipchat-gesprek aan een CM-router-chat. */
export const sessions = pgTable(
  "bridge_sessions",
  {
    id: serial("id").primaryKey(),
    zipchatChatId: text("zipchat_chat_id").notNull(),
    zipchatConversationId: text("zipchat_conversation_id").notNull().unique(),
    cmChatId: text("cm_chat_id"),
    cmConversationClientId: text("cm_conversation_client_id"),
    /** sessionId dat de router in zijn callbacks meestuurt. */
    cmSessionId: text("cm_session_id"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    channel: text("channel").notNull().default("webchat"),
    status: text("status").notNull().default("escalating"),
    reason: text("reason"),
    /** "livechat" of "email" — de modus die gold toen dit gesprek binnenkwam. */
    mode: text("mode").notNull().default("email"),
    /** Laatst gemelde handover-status uit de router (bijv. agentAssigned). */
    handoverState: text("handover_state"),
    /** Naam van de medewerker die het gesprek oppakte, als CM die meestuurt. */
    agentName: text("agent_name"),
    /**
     * Watermerk: Zipchat-tijd van het laatste bericht dat al bij CM ligt. Alleen
     * de ondergrens voor het ophalen; wat nieuw is, bepaalt de cursor op
     * bericht-id (Store.getForwardCursor).
     */
    lastForwardedAt: timestamp("last_forwarded_at", { withTimezone: true }),
    lastAgentReplyAt: timestamp("last_agent_reply_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index("bridge_sessions_status_idx").on(t.status) }),
);

/** Auditlog van alles wat er over de brug gaat — voedt het dashboard. */
export const events = pgTable(
  "bridge_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id"),
    direction: text("direction").notNull(),
    kind: text("kind").notNull(),
    ok: boolean("ok").notNull().default(true),
    statusCode: integer("status_code"),
    summary: text("summary"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ createdIdx: index("bridge_events_created_idx").on(t.createdAt) }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type BridgeEvent = typeof events.$inferSelect;

/** Instellingen die je in het dashboard omzet. */
export const settings = pgTable("bridge_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Wie het dashboard mag openen, naast de vaste accounts in VASTE_TOEGANG. Op
 * Marketing-account-id; een rij erbij is toegang, een rij weg is geen
 * toegang. Gezet vanuit admin (Gebruikers & toegang). Migratie V169 in
 * dtg-data-platform.
 */
export const access = pgTable("toegang", {
  marketingId: uuid("marketing_id").primaryKey(),
  grantedBy: uuid("toegekend_door").notNull(),
  grantedByName: text("toegekend_door_naam").notNull(),
  grantedAt: timestamp("toegekend_op", { withTimezone: true }).notNull().defaultNow(),
});

/** Elke wijziging in toegang. Alleen toevoegen. */
export const accessLog = pgTable("toegang_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  marketingId: uuid("marketing_id").notNull(),
  action: text("actie").notNull(),
  by: uuid("door").notNull(),
  byName: text("door_naam").notNull(),
  at: timestamp("op", { withTimezone: true }).notNull().defaultNow(),
});
