import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { store } from "@/db";

export const dynamic = "force-dynamic";

/** Wat is er wél en niet geconfigureerd — voedt de statusbalk van het dashboard. */
export async function GET() {
  const events = await store.listEvents(50);
  const open = await store.listOpenSessions();

  const missing: string[] = [];
  if (!config.zipchat.token) missing.push("ZIPCHAT_API_TOKEN");
  if (!config.zipchat.chatId) missing.push("ZIPCHAT_CHAT_ID");
  if (!config.zipchat.senderId) missing.push("ZIPCHAT_SENDER_ID");
  if (!config.cm.accountId) missing.push("CM_ACCOUNT_ID");
  if (!config.cm.adapterId) missing.push("CM_ADAPTER_ID");
  if (!config.cm.productToken) missing.push("CM_PRODUCT_TOKEN");
  if (!config.cm.agentStateNameId) missing.push("CM_AGENT_STATE_NAME_ID");

  const warnings: string[] = [];
  if (!config.bridgeSecret) warnings.push("BRIDGE_SHARED_SECRET niet gezet — /api/zipchat/escalate is onbeveiligd.");
  if (!config.cm.webhookSecret) warnings.push("CM_WEBHOOK_SECRET niet gezet — de CM-webhook is onbeveiligd.");
  if (store.kind === "memory") warnings.push("Geen DATABASE_URL — opslag is in-memory en verdwijnt bij herstart.");

  const lastWebhook = events.find((e) => e.direction === "cm->bridge");
  const lastPoll = events.find((e) => e.kind.startsWith("poll."));

  return NextResponse.json({
    ok: true,
    mockMode: config.mockMode,
    storage: store.kind,
    openSessions: open.length,
    missing,
    warnings,
    lastWebhookAt: lastWebhook?.createdAt ?? null,
    lastPollAt: lastPoll?.createdAt ?? null,
    poll: { windowMs: config.poll.windowMs, intervalMs: config.poll.intervalMs },
  });
}
