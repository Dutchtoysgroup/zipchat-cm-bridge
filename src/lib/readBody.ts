import { store } from "@/db";

/**
 * CM bouwt de body van zijn callbacks op uit placeholders. Als er één leeg
 * blijft (bijvoorbeeld `"context":{{$context}}` zonder context) komt er
 * ongeldige JSON binnen. Dan willen we de ruwe tekst zién in het logboek,
 * niet blind een 400 teruggeven.
 */
export async function readTolerantJson(
  req: Request,
  kind: string,
): Promise<{ ok: true; data: unknown } | { ok: false; raw: string }> {
  const raw = await req.text();
  try {
    return { ok: true, data: raw ? JSON.parse(raw) : {} };
  } catch {
    // Laatste redmiddel: een lege context repareren zodat de rest bruikbaar is.
    const repaired = raw
      .replace(/"context"\s*:\s*(?=[,}])/g, '"context":{}')
      .replace(/:\s*\{\{\$[A-Za-z]+\}\}/g, ":null");
    try {
      return { ok: true, data: JSON.parse(repaired) };
    } catch {
      await store.logEvent({
        direction: "cm->bridge",
        kind: `${kind}.unparsable`,
        ok: false,
        summary: "CM stuurde geen geldige JSON — ruwe body opgeslagen",
        payload: { raw: raw.slice(0, 4000) },
      });
      return { ok: false, raw };
    }
  }
}
