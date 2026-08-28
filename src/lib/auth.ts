import { config } from "./config";

/** Timing-veilige vergelijking van twee korte strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function presented(req: Request, header: string): string | null {
  const direct = req.headers.get(header);
  if (direct) return direct.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Controleert een gedeeld geheim. Is er geen geheim geconfigureerd, dan laten
 * we door (handig lokaal) maar melden we dat, zodat het dashboard kan waarschuwen.
 */
export function checkSecret(
  req: Request,
  expected: string | undefined,
  header = "x-bridge-secret",
): { ok: boolean; unprotected: boolean } {
  if (!expected) return { ok: true, unprotected: true };
  const given = presented(req, header);
  return { ok: !!given && safeEqual(given, expected), unprotected: false };
}

export function checkBridgeSecret(req: Request) {
  return checkSecret(req, config.bridgeSecret, "x-bridge-secret");
}

export function checkCmWebhookSecret(req: Request) {
  return checkSecret(req, config.cm.webhookSecret, "x-bridge-token");
}

/** Vercel Cron stuurt een Authorization: Bearer <CRON_SECRET>. */
export function checkCron(req: Request) {
  const expected = process.env.CRON_SECRET || config.bridgeSecret;
  return checkSecret(req, expected, "x-bridge-secret");
}
