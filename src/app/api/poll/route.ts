import { NextResponse, after } from "next/server";
import { countPollable, pollOnce } from "@/lib/bridge";
import { config } from "@/lib/config";
import { checkCron } from "@/lib/auth";
import { store } from "@/db";
import { kickPoll, originOf } from "@/lib/pollChain";

export const dynamic = "force-dynamic";

const LEASE_KEY = "poll_lease";
/**
 * Zo lang blijft een lease staan zonder verlenging. Een venster dat crasht
 * blokkeert de ketting dus hooguit zo lang; daarna pakt de cron het op.
 */
const LEASE_TTL_MS = 30_000;
const LEASE_RENEW_MS = 10_000;

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
  if (!(await store.acquireLease(LEASE_KEY, mine, LEASE_TTL_MS))) {
    return NextResponse.json({ ok: true, skipped: "busy", checked: 0 });
  }

  const origin = originOf(req);

  // Meteen antwoorden en daarna doorpollen: zo blijft de aanroeper (cron, of het
  // vorige venster) niet 50 seconden hangen en is de ketting goedkoop.
  if (new URL(req.url).searchParams.get("sync") === "1") {
    const totals = await runWindow(mine);
    if (totals.checked > 0 && !totals.leaseLost) await kickPoll(origin);
    return NextResponse.json({ ok: true, ...totals });
  }

  after(async () => {
    const totals = await runWindow(mine);
    // Nog steeds gesprekken open? Dan zelf het volgende venster starten. De
    // lease is dan al vrijgegeven, anders kreeg de opvolger "busy".
    if (totals.checked > 0 && !totals.leaseLost) await kickPoll(origin);
  });

  return NextResponse.json({ ok: true, started: true, checked: pollable });
}

async function runWindow(token: string) {
  const started = Date.now();
  const totals = { rounds: 0, checked: 0, forwarded: 0, closed: 0, leaseLost: false };

  // Verlengen los van de rondes: één ronde kan zelf lang duren (tot 15 s per
  // HTTP-aanroep), en een verlopen lease laat de cron een tweede venster
  // starten. Mislukt een verlenging, dan probeert de volgende tik het opnieuw;
  // de TTL geeft daar ruimte voor.
  let renewing: Promise<void> = Promise.resolve();
  const heartbeat = setInterval(() => {
    renewing = store.renewLease(LEASE_KEY, token, LEASE_TTL_MS).then(
      (ok) => {
        if (!ok) totals.leaseLost = true;
      },
      () => {},
    );
  }, LEASE_RENEW_MS);

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
      // Lease kwijt: een ander venster heeft het overgenomen en pollt verder.
      if (totals.leaseLost) break;
      await sleep(config.poll.intervalMs);
    } while (true);
  } catch (err) {
    await store.logEvent({
      direction: "internal",
      kind: "poll.crashed",
      ok: false,
      summary: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearInterval(heartbeat);
    // Een verlenging die nog onderweg is, zou na het vrijgeven niets meer
    // vinden en de lease ten onrechte "kwijt" melden.
    await renewing;
    try {
      await store.releaseLease(LEASE_KEY, token);
    } catch (err) {
      // Dan verloopt hij vanzelf binnen LEASE_TTL_MS; tot die tijd krijgt de
      // opvolger "busy" en neemt de cron het over.
      await store
        .logEvent({
          direction: "internal",
          kind: "poll.lease_release_failed",
          ok: false,
          summary: err instanceof Error ? err.message : String(err),
        })
        .catch(() => {});
    }
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
