import { pgTable, serial, text, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";

/** Eén escalatie: koppelt een Zipchat-gesprek aan een CM-router-chat. */
export const sessions = pgTable(
  "bridge_sessions",
  {
    id: serial("id").primaryKey(),
    zipchatChatId: text("zipchat_chat_id").notNull(),
    zipchatConversationId: text("zipchat_conversation_id").notNull().unique(),
    cmChatId: text("cm_chat_id"),
    cmConversationClientId: text("cm_conversation_client_id"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    channel: text("channel").notNull().default("webchat"),
    status: text("status").notNull().default("escalating"),
    reason: text("reason"),
    /** Laatst gemelde handover-status uit de router (bijv. agentAssigned). */
    handoverState: text("handover_state"),
    /** Naam van de medewerker die het gesprek oppakte, als CM die meestuurt. */
    agentName: text("agent_name"),
    /** Watermerk: laatste bericht dat we al naar CM hebben doorgezet. */
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
