import { config } from "./config";

/**
 * Lopende gesprekken houden zichzelf warm: /api/poll roept zichzelf opnieuw aan
 * zolang er open sessies zijn, zodat de latency tijdens een handover ~5s blijft.
 * De cron (Logic App `cron-zipchat-bridge-poll`) is alleen een vangnet voor als
 * de ketting breekt, bijvoorbeeld door een herstart.
 */
export function pollUrl(origin: string): string {
  return new URL("/api/poll", origin).toString();
}

/**
 * Basis-URL van deze deployment. Op App Service eindigt TLS vóór de app, dus
 * req.url begint met http:// — een zelfaanroep daarheen wordt omgeleid naar
 * https en verliest onderweg zijn Authorization-header. Daarom bij voorkeur de
 * vaste BRIDGE_PUBLIC_URL, anders de host uit x-forwarded-proto/-host.
 */
export function originOf(req: Request): string | null {
  const fixed = process.env.BRIDGE_PUBLIC_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  try {
    const url = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host") ?? url.host;
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

/**
 * Start een pollvenster zonder erop te wachten. Aanroepen vanuit `after()`,
 * zodat het verzoek van de klant er niet op blijft hangen.
 */
export async function kickPoll(origin: string | null): Promise<void> {
  if (!origin || !config.poll.selfChain) return;
  const secret = process.env.CRON_SECRET || config.bridgeSecret;
  try {
    await fetch(pollUrl(origin), {
      method: "GET",
      headers: {
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        "x-poll-chain": "1",
      },
      // De andere kant antwoordt meteen en pollt daarna door in `after()`,
      // dus dit verzoek is in milliseconden klaar.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* Lukt het niet, dan pakt de safety-cron het binnen enkele minuten op. */
  }
}
