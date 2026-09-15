import { config } from "./config";

/**
 * De poll-cron is de duurste post van dit project: elke aanroep wekt de Neon-
 * compute, en die blijft daarna nog minuten wakker. Draaide de cron elke minuut,
 * dan sliep de database dus nooit — ook 's nachts zonder één gesprek.
 *
 * Daarom draait de cron nu op grote afstand (zie vercel.json) en houden lopende
 * gesprekken zichzelf warm: /api/poll roept zichzelf opnieuw aan zolang er open
 * sessies zijn. Latency blijft ~5s tijdens een handover, terwijl er in rust
 * niets naar de database gaat.
 */
export function pollUrl(origin: string): string {
  return new URL("/api/poll", origin).toString();
}

/** Basis-URL van deze deployment, afgeleid van het binnenkomende verzoek. */
export function originOf(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    return host ? `https://${host}` : null;
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
