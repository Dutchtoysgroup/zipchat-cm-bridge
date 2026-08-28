import { config } from "./config";
import { requestJson } from "./http";

export type Presence = { online: boolean; raw: string; ok: boolean; error?: string };

/**
 * Vraagt aan Mobile Service Cloud of er nu een medewerker beschikbaar is.
 * Zelfde endpoint als HALO gebruikt; publiek, alleen een apiKey in de URL.
 * Het antwoord is platte tekst: "Online" of "Offline".
 */
export async function checkPresence(): Promise<Presence> {
  const url = config.presence.url;
  if (!url) return { online: false, raw: "", ok: false, error: "PRESENCE_URL niet ingesteld" };

  const res = await requestJson<{ raw?: string }>(url, { method: "GET", timeoutMs: 8000 });
  // De API geeft platte tekst terug; requestJson stopt die in { raw }.
  const raw = (res.data?.raw ?? "").toString().trim();
  if (!res.ok) return { online: false, raw, ok: false, error: res.error };

  return { online: raw.toLowerCase() === "online", raw, ok: true };
}
