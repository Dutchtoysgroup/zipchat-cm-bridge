"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Health = {
  mockMode: boolean;
  storage: "neon" | "memory";
  openSessions: number;
  missing: string[];
  warnings: string[];
  lastWebhookAt: string | null;
  lastPollAt: string | null;
  poll: { windowMs: number; intervalMs: number };
};

type Session = {
  id: number;
  zipchatConversationId: string;
  cmChatId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  channel: string;
  status: string;
  reason: string | null;
  mode: string;
  handoverState: string | null;
  agentName: string | null;
  updatedAt: string;
};

type Ev = {
  id: number;
  sessionId: number | null;
  direction: string;
  kind: string;
  ok: boolean;
  statusCode: number | null;
  summary: string | null;
  payload: unknown;
  createdAt: string;
};

const DIRECTION_LABEL: Record<string, string> = {
  "zipchat->bridge": "Zipchat → Bridge",
  "bridge->cm": "Bridge → CM",
  "cm->bridge": "CM → Bridge",
  "bridge->zipchat": "Bridge → Zipchat",
  internal: "Intern",
};

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [mode, setMode] = useState<"livechat" | "email" | null>(null);
  const [convId, setConvId] = useState("");

  const [name, setName] = useState("Testklant");
  const [email, setEmail] = useState("test@example.com");
  const [agentText, setAgentText] = useState("Hallo, je spreekt met de klantenservice. Waarmee kan ik je helpen?");

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, s, e, m] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/sessions").then((r) => r.json()),
        fetch("/api/events?limit=150").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      if (h.ok) setHealth(h);
      if (s.ok) setSessions(s.sessions ?? []);
      if (e.ok) setEvents(e.events ?? []);
      if (m.ok) setMode(m.mode);
    } catch {
      /* stil: volgende tik probeert opnieuw */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (autoRefresh) timer.current = setInterval(refresh, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoRefresh, refresh]);

  const openSessions = useMemo(
    () => sessions.filter((s) => s.status === "escalating" || s.status === "active"),
    [sessions],
  );

  useEffect(() => {
    if (selected === null && openSessions.length > 0) setSelected(openSessions[0].id);
  }, [openSessions, selected]);

  async function switchMode(next: "livechat" | "email") {
    setBusy("mode");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setMode(data.mode);
        setResult({
          ok: true,
          text:
            next === "livechat"
              ? "Modus: live chat. Nieuwe escalaties worden aan een medewerker in de chat beloofd."
              : "Modus: e-mail. Nieuwe escalaties krijgen een e-mailbelofte; de AI blijft in de chat actief.",
        });
      } else {
        setResult({ ok: false, text: data.error ?? "Wisselen mislukt" });
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      setResult({
        ok: !!data.ok,
        text: data.message || data.error || summarize(action, data),
      });
      if (action.startsWith("incoming") && data.sessionId) setSelected(data.sessionId);
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Zipchat ↔ CM Mobile Service Cloud</h1>
        <span className="sub">Bridge via de Conversational Router</span>
      </header>

      {/* ---------------- Modus ---------------- */}
      <section className="panel">
        <h2>Bemensing</h2>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <button
            className={mode === "livechat" ? "primary" : undefined}
            disabled={!!busy || mode === null}
            onClick={() => switchMode("livechat")}
          >
            Live chat — er zit iemand klaar
          </button>
          <button
            className={mode === "email" ? "primary" : undefined}
            disabled={!!busy || mode === null}
            onClick={() => switchMode("email")}
          >
            E-mail — niemand beschikbaar
          </button>
          <span className="dim" style={{ fontSize: 12 }}>
            {mode === null
              ? "…"
              : mode === "livechat"
                ? "De bot belooft de klant dat een collega het gesprek in de chat overneemt."
                : "De bot zegt dat er per e-mail wordt gereageerd. De AI blijft actief in de chat."}
          </span>
        </div>
      </section>

      {/* ---------------- Status ---------------- */}
      <section className="panel">
        <h2>Status</h2>
        <div className="grid">
          <div className="stat">
            <div className="k">Modus</div>
            <div className="v">
              {health ? (
                <span className={`badge ${health.mockMode ? "warn" : "ok"}`}>
                  {health.mockMode ? "Mock" : "Live"}
                </span>
              ) : (
                "…"
              )}
            </div>
          </div>
          <div className="stat">
            <div className="k">Opslag</div>
            <div className="v">
              <span className={`badge ${health?.storage === "neon" ? "ok" : "warn"}`}>
                {health?.storage === "neon" ? "Neon" : health ? "In-memory" : "…"}
              </span>
            </div>
          </div>
          <div className="stat">
            <div className="k">Open gesprekken</div>
            <div className="v">{health?.openSessions ?? "…"}</div>
          </div>
          <div className="stat">
            <div className="k">Laatste CM-webhook</div>
            <div className="v" style={{ fontSize: 14 }}>{fmtAgo(health?.lastWebhookAt)}</div>
          </div>
          <div className="stat">
            <div className="k">Laatste poll</div>
            <div className="v" style={{ fontSize: 14 }}>{fmtAgo(health?.lastPollAt)}</div>
          </div>
        </div>

        {health && health.missing.length > 0 && (
          <div className="note warn">
            <strong>Nog niet ingevuld:</strong>{" "}
            <span className="mono">{health.missing.join(", ")}</span>
            <br />
            Zolang deze ontbreken draait de bridge in mock-modus: er gaat niets echt naar CM of Zipchat.
          </div>
        )}
        {health?.warnings.map((w) => (
          <div key={w} className="note warn">{w}</div>
        ))}
      </section>

      {/* ---------------- Testpaneel ---------------- */}
      <section className="panel">
        <h2>Testpaneel</h2>

        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field" style={{ flex: "1 1 180px" }}>
            Naam klant
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field" style={{ flex: "1 1 220px" }}>
            E-mail klant
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field" style={{ flex: "1 1 240px" }}>
            Zipchat-gesprek-id (optioneel)
            <input
              value={convId}
              onChange={(e) => setConvId(e.target.value)}
              placeholder="leeg = ticket zonder transcript"
            />
          </label>
        </div>

        <div className="row">
          <button className="primary" disabled={!!busy} onClick={() => run("incoming_chat", { name, email, conversationId: convId })}>
            {busy === "incoming_chat" ? "Bezig…" : "Inkomende chat → escaleren"}
          </button>
          <button disabled={!!busy} onClick={() => run("incoming_email", { name, email, conversationId: convId })}>
            {busy === "incoming_email" ? "Bezig…" : "Inkomende e-mail → escaleren"}
          </button>
          <button disabled={!!busy} onClick={() => run("ping")}>
            {busy === "ping" ? "Bezig…" : "Verbindingen testen"}
          </button>
          <button disabled={!!busy} onClick={() => run("poll")}>
            {busy === "poll" ? "Bezig…" : "Nu pollen"}
          </button>
          <button disabled={!!busy} onClick={() => run("reset")}>Testdata wissen</button>
        </div>

        <div className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "0 0 auto" }}>
            Sessie
            <select value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value) || null)}>
              <option value="">— kies —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} · {s.customerName ?? "onbekend"} · {s.status}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 340px" }}>
            Antwoord van de MSC-medewerker
            <input value={agentText} onChange={(e) => setAgentText(e.target.value)} />
          </label>
          <button
            disabled={!!busy || !selected}
            onClick={() => run("agent_reply", { sessionId: selected, text: agentText })}
          >
            {busy === "agent_reply" ? "Bezig…" : "Agent antwoordt"}
          </button>
          <button
            disabled={!!busy || !selected}
            onClick={() => run("handover", { sessionId: selected })}
          >
            {busy === "handover" ? "Bezig…" : "Handover-melding"}
          </button>
          <button disabled={!!busy || !selected} onClick={() => run("close", { sessionId: selected })}>
            Sessie sluiten
          </button>
        </div>

        {result && <div className={`note ${result.ok ? "ok" : "err"}`}>{result.text}</div>}
      </section>

      {/* ---------------- Sessies ---------------- */}
      <section className="panel">
        <h2>Gesprekken ({sessions.length})</h2>
        <div className="scroll">
          {sessions.length === 0 ? (
            <div className="empty">Nog geen gesprekken. Gebruik het testpaneel hierboven.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Klant</th>
                  <th>E-mail</th>
                  <th>Kanaal</th>
                  <th>Modus</th>
                  <th>Status</th>
                  <th>Medewerker</th>
                  <th>Zipchat-gesprek</th>
                  <th>CM-chat</th>
                  <th>Bijgewerkt</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className={selected === s.id ? "sel" : undefined}
                    onClick={() => setSelected(s.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="mono">{s.id}</td>
                    <td>{s.customerName ?? <span className="dim">—</span>}</td>
                    <td className="dim">{s.customerEmail ?? "—"}</td>
                    <td>{s.channel}</td>
                    <td>
                      <span className={`badge ${s.mode === "livechat" ? "ok" : ""}`}>
                        {s.mode === "livechat" ? "live chat" : "e-mail"}
                      </span>
                    </td>
                    <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                    <td>
                      {s.agentName ?? <span className="dim">—</span>}
                      {s.handoverState && (
                        <div className="dim mono" style={{ fontSize: 11 }}>{s.handoverState}</div>
                      )}
                    </td>
                    <td className="mono trunc">{s.zipchatConversationId}</td>
                    <td className="mono trunc">{s.cmChatId ?? "—"}</td>
                    <td className="dim">{fmtAgo(s.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ---------------- Logboek ---------------- */}
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Logboek</h2>
          <label className="row" style={{ gap: 6, fontSize: 12, color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ minWidth: "auto" }}
            />
            elke 3s verversen
          </label>
        </div>
        <div className="scroll">
          {events.length === 0 ? (
            <div className="empty">Nog niets gebeurd.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tijd</th>
                  <th>Richting</th>
                  <th>Type</th>
                  <th>Resultaat</th>
                  <th>Toelichting</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="mono dim">{fmtTime(e.createdAt)}</td>
                    <td className="dim">{DIRECTION_LABEL[e.direction] ?? e.direction}</td>
                    <td className="mono">{e.kind}</td>
                    <td>
                      <span className={`badge ${e.ok ? "ok" : "err"}`}>
                        {e.ok ? "ok" : "fout"}{e.statusCode ? ` ${e.statusCode}` : ""}
                      </span>
                    </td>
                    <td className="trunc">{e.summary ?? <span className="dim">—</span>}</td>
                    <td>
                      {e.payload ? (
                        <details className="raw">
                          <summary>tonen</summary>
                          <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ utils */

function statusClass(s: string) {
  if (s === "active") return "ok";
  if (s === "error") return "err";
  if (s === "escalating") return "warn";
  return "";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour12: false });
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "zojuist";
  if (s < 60) return `${s}s geleden`;
  if (s < 3600) return `${Math.floor(s / 60)}m geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)}u geleden`;
  return new Date(iso).toLocaleDateString("nl-NL");
}

function summarize(action: string, data: Record<string, unknown>): string {
  if (action === "ping") {
    const zc = data.zipchat as { ok?: boolean; error?: string } | undefined;
    const cm = data.cm as { ok?: boolean; error?: string } | undefined;
    return `Zipchat: ${zc?.ok ? "bereikbaar" : zc?.error ?? "fout"} · CM: ${cm?.ok ? "bereikbaar" : cm?.error ?? "fout"}`;
  }
  if (action === "poll") {
    return `${data.checked ?? 0} sessie(s) gecontroleerd, ${data.forwarded ?? 0} bericht(en) doorgestuurd.`;
  }
  return JSON.stringify(data);
}
