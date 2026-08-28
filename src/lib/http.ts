export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  /** Gebeurde dit echt, of is het gesimuleerd? */
  mocked?: boolean;
};

export async function requestJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { timeoutMs = 15_000, ...rest } = init;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ac.signal, cache: "no-store" });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 2000) };
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      data: (data as T) ?? null,
      error: res.ok ? undefined : describe(data, text, res.status),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted ? `Timeout na ${timeoutMs}ms` : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function describe(data: unknown, text: string, status: number): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["error", "message", "detail", "title"]) {
      if (typeof o[k] === "string") return `HTTP ${status}: ${o[k]}`;
    }
  }
  return `HTTP ${status}: ${text.slice(0, 300) || "(lege body)"}`;
}
