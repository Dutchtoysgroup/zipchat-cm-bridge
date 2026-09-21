import { NextResponse, after } from "next/server";
import { countPollable, pollOnce } from "@/lib/bridge";
import { config } from "@/lib/config";
import { checkCron } from "@/lib/auth";
import { store } from "@/db";
import { kickPoll, originOf } from "@/lib/pollChain";

export const dynamic = "force-dynamic";

const LEASE_KEY = "poll_lease";

/**
 * Zipchat heeft geen webhook, dus halen we nieuwe klantberichten op.
 *
 * In rust doet deze route één query en stopt. Loopt er wél een gesprek, dan
 * pollt hij door met een interval van 5s en roept hij zichzelf aan het eind van
 * het venster opnieuw aan; de cron is alleen een vangnet.
 */
export async function GET(req: Request) {
  const auth = checkCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Niet geautoriseerd" }, { status: 401 });

  await enforceRetention();

  // Eén goedkope query: valt er niets te doen, dan is dit het hele bezoek.
  const pollable = await countPollable();
  if (pollable === 0) return NextResponse.json({ ok: true, idle: true, checked: 0 });

  // Voorkomt dat de cron een tweede venster start terwijl de ketting nog loopt;
  // twee vensters tegelijk zouden hetzelfde klantbericht dubbel doorsturen.
  const mine = Math.random().toString(36).slice(2, 10);
  const now = Date.now();
  const existing = parseLease(await store.getSetting(LEASE_KEY));
  if (existing && existing.until > now && existing.token !== mine) {
    return NextResponse.json({ ok: true, skipped: "busy", checked: 0 });
  }
  await store.setSetting(LEASE_KEY, `${mine}:${now + config.poll.windowMs + 10_000}`);
  if (parseLease(await store.getSetting(LEASE_KEY))?.token !== mine) {
    return NextResponse.json({ ok: true, skipped: "busy", checked: 0 });
  }

  const origin = originOf(req);

  // Meteen antwoorden en daarna doorpollen: zo blijft de aanroeper (cron, of het
  // vorige venster) niet 50 seconden hangen en is de ketting goedkoop.
  if (new URL(req.url).searchParams.get("sync") === "1") {
    const totals = await runWindow();
    if (totals.checked > 0) await kickPoll(origin);
    return NextResponse.json({ ok: true, ...totals });
  }

  after(async () => {
    const totals = await runWindow();
    // Nog steeds gesprekken open? Dan zelf het volgende venster starten.
    if (totals.checked > 0) await kickPoll(origin);
  });

  return NextResponse.json({ ok: true, started: true, checked: pollable });
}

async function runWindow() {
  const started = Date.now();
  const totals = { rounds: 0, checked: 0, forwarded: 0, closed: 0 };
  try {
    do {
      const r = await pollOnce();
      totals.rounds++;
      totals.checked = r.checked;
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
  }
  return { ...totals, durationMs: Date.now() - started };
}

const RETENTION_KEY = "retention_last_run";
const RETENTION_DAYS = 90;

/**
 * Bewaartermijn van 90 dagen, afgesproken voor het centrale dataplatform:
 * events weg, naam en e-mail van gesloten sessies leeg. Draait hooguit één keer
 * per dag, meeliftend op de cron, zodat er geen aparte job voor nodig is.
 */
async function enforceRetention() {
  const last = Number(await store.getSetting(RETENTION_KEY));
  if (Number.isFinite(last) && Date.now() - last < 24 * 3600_000) return;
  await store.setSetting(RETENTION_KEY, String(Date.now()));
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000);
    const r = await store.purgeOlderThan(cutoff);
    if (r.events || r.sessions) {
      await store.logEvent({
        direction: "internal",
        kind: "retention.purged",
        summary: `${r.events} events verwijderd, ${r.sessions} sessies geanonimiseerd (ouder dan ${RETENTION_DAYS} dagen)`,
      });
    }
  } catch (err) {
    await store.logEvent({
      direction: "internal",
      kind: "retention.failed",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    });
  }
}

function parseLease(raw: string | null): { token: string; until: number } | null {
  if (!raw) return null;
  const [token, until] = raw.split(":");
  const ms = Number(until);
  return token && Number.isFinite(ms) ? { token, until: ms } : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
