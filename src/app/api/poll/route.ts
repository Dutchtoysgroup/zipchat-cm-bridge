import { NextResponse } from "next/server";
import { pollOnce } from "@/lib/bridge";
import { config } from "@/lib/config";
import { checkCron } from "@/lib/auth";
import { store } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Zipchat heeft geen webhook, dus halen we nieuwe klantberichten op.
 * Eén cron-invocatie per minuut loopt intern door met een korte interval,
 * zodat de latency ~5s is in plaats van 60s.
 */
export async function GET(req: Request) {
  const auth = checkCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  const started = Date.now();
  const totals = { rounds: 0, checked: 0, forwarded: 0, closed: 0 };

  try {
    do {
      const r = await pollOnce();
      totals.rounds++;
      totals.checked += r.checked;
      totals.forwarded += r.forwarded;
      totals.closed += r.closed;

      const elapsed = Date.now() - started;
      if (elapsed + config.poll.intervalMs >= config.poll.windowMs) break;
      // Geen open sessies? Dan is doorlopen zinloos.
      if (r.checked === 0) break;
      await sleep(config.poll.intervalMs);
    } while (true);
  } catch (err) {
    await store.logEvent({
      direction: "internal",
      kind: "poll.crashed",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, ...totals, error: "Poll afgebroken" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...totals, durationMs: Date.now() - started });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
