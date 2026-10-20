import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { authDisabled } from "@/lib/authMode";
import { store } from "@/db";
import { LAST_POLL_KEY } from "@/lib/bridge";

export const dynamic = "force-dynamic";

/** Wat is er wél en niet geconfigureerd — voedt de statusbalk van het dashboard. */
export async function GET() {
  const [open, lastWebhookAt, lastPollAt] = await Promise.all([
    store.listOpenSessions(),
    store.lastEventAt("cm->bridge"),
    store.getSetting(LAST_POLL_KEY),
  ]);

  const missing: string[] = [];
  if (!config.zipchat.token) missing.push("ZIPCHAT_API_TOKEN");
  if (!config.zipchat.chatId) missing.push("ZIPCHAT_CHAT_ID");
  if (!config.zipchat.senderId) missing.push("ZIPCHAT_SENDER_ID");
  if (!config.cm.accountId) missing.push("CM_ACCOUNT_ID");
  if (!config.cm.adapterId) missing.push("CM_ADAPTER_ID");
  if (!config.cm.productToken) missing.push("CM_PRODUCT_TOKEN");
  // CM_AGENT_STATE_NAME_ID hoort hier niet: dat is alleen voor de optionele
  // routing control (README), en de router routeert zonder.

  const warnings: string[] = [];
  if (authDisabled()) {
    warnings.push("Lokale ontwikkelmodus (BRIDGE_DEV_NO_AUTH): endpoints zonder geheim staan open.");
  } else {
    if (!config.bridgeSecret) warnings.push("BRIDGE_SHARED_SECRET niet gezet — /api/zipchat/escalate weigert elke aanroep.");
    if (!config.cm.webhookSecret) warnings.push("CM_WEBHOOK_SECRET niet gezet — de CM-webhook weigert elke aanroep.");
  }
  if (store.kind === "memory") warnings.push("Geen DATABASE_URL — opslag is in-memory en verdwijnt bij herstart.");
  // De escalatiemail is een extra kopie naast CM; uit is geen waarschuwing.
  // Het dashboard toont de stand onder Systeem.

  if (!config.graph.configured) {
    warnings.push(
      `MS_GRAPH_* niet volledig ingesteld — samenwerkingsaanvragen bereiken ${config.marketing.to} NIET.`,
    );
  }

  return NextResponse.json({
    ok: true,
    mockMode: config.mockMode,
    mockZipchat: config.mockZipchat,
    mockCm: config.mockCm,
    mail: { to: config.mail.to ?? null, configured: config.mail.configured },
    marketingMail: { to: config.marketing.to, configured: config.graph.configured },
    storage: store.kind,
    openSessions: open.length,
    missing,
    warnings,
    lastWebhookAt: lastWebhookAt?.toISOString() ?? null,
    lastPollAt,
    poll: { windowMs: config.poll.windowMs, intervalMs: config.poll.intervalMs },
  });
}
