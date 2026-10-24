"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Health = {
  mockMode: boolean;
  storage: "postgres" | "memory";
  openSessions: number;
  missing: string[];
  warnings: string[];
  lastWebhookAt: string | null;
  lastPollAt: string | null;
  poll: { windowMs: number; intervalMs: number };
  mail: { to: string | null; configured: boolean };
};

type Session = {
  id: number;
  zipchatConversationId: string;
  cmChatId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  /** Land van de bot, bijv. DE; null als Zipchat het niet gaf. */
  country: string | null;
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

type View = "overzicht" | "gesprekken" | "logboek" | "testen";

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  {
    key: "overzicht",
    label: "Overzicht",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  {
    key: "gesprekken",
    label: "Gesprekken",
    icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />,
  },
  {
    key: "logboek",
    label: "Logboek",
    icon: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  },
  {
    key: "testen",
    label: "Testen",
    icon: <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 14h10" />,
  },
];

const KOP: Record<View, { titel: string; sub: string }> = {
  overzicht: {
    titel: "Doorzetten naar een medewerker",
    sub: "Gesprekken die de Zipchat-AI niet zelf afhandelt, gaan naar een medewerker in Mobile Service Cloud; diens antwoorden komen terug in dezelfde chat.",
  },
  gesprekken: {
    titel: "Gesprekken",
    sub: "Elke escalatie naar een medewerker, met de klant, de status en de koppeling tussen Zipchat en CM. Naam en e-mailadres worden na 90 dagen gewist.",
  },
  logboek: {
    titel: "Logboek",
    sub: "Alles wat over de brug gaat, nieuwste eerst. Regels ouder dan 90 dagen worden opgeschoond.",
  },
  testen: {
    titel: "Testen",
    sub: "Probeer een escalatie of een antwoord van een medewerker. Draait de bridge live, dan gaat dit echt naar CM en Zipchat.",
  },
};

const MODE_LABEL: Record<"auto" | "livechat" | "email", string> = {
  auto: "Automatisch",
  livechat: "Altijd live chat",
  email: "Altijd per e-mail",
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="icoon" viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function viewFromHash(): View {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return VIEWS.some((v) => v.key === h) ? (h as View) : "overzicht";
}

const DIRECTION_LABEL: Record<string, string> = {
  "zipchat->bridge": "Zipchat → Bridge",
  "bridge->cm": "Bridge → CM",
  "cm->bridge": "CM → Bridge",
  "bridge->zipchat": "Bridge → Zipchat",
  "bridge->klant": "Bridge → klant (e-mail)",
  internal: "Intern",
};

export default function Dashboard({ user }: { user: string | null }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [mode, setMode] = useState<"auto" | "livechat" | "email" | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [presence, setPresence] = useState<string | null>(null);
  const [convId, setConvId] = useState("");
  const [loggedOut, setLoggedOut] = useState(false);
  const [view, setView] = useState<View>("overzicht");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [name, setName] = useState("Testklant");
  const [email, setEmail] = useState("test@example.com");
  const [agentText, setAgentText] = useState("Hallo, je spreekt met de klantenservice. Waarmee kan ik je helpen?");

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Elke tik zijn vier databasequeries op de gedeelde centrale database;
   * 15 seconden is voor meekijken bij een gesprek ruim genoeg.
   */
  const REFRESH_MS = 15_000;

  const refresh = useCallback(async () => {
    try {
      const [h, s, e, m] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/sessions").then((r) => r.json()),
        fetch("/api/events?limit=60").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      if (h.ok) setHealth(h);
      if (s.ok) setSessions(s.sessions ?? []);
      if (e.ok) setEvents(e.events ?? []);
      if (m.ok) {
        setMode(m.mode);
        setLive(m.live);
        setPresence(m.presence?.raw ?? null);
      }
      setUpdatedAt(new Date());
    } catch {
      /* stil: volgende tik probeert opnieuw */
    }
  }, []);

  useEffect(() => {
    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    // Een tabblad op de achtergrond hoeft niets te verversen — maar hield wel
    // de database wakker. Ververs alleen wat zichtbaar is.
    const sync = () => {
      stop();
      if (autoRefresh && document.visibilityState === "visible") {
        refresh();
        timer.current = setInterval(refresh, REFRESH_MS);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [autoRefresh, refresh]);

  // De weergave staat in de URL (#gesprekken), zodat terug en een link werken.
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const openSessions = useMemo(
    () => sessions.filter((s) => s.status === "escalating" || s.status === "active"),
    [sessions],
  );

  useEffect(() => {
    if (selected === null && openSessions.length > 0) setSelected(openSessions[0].id);
  }, [openSessions, selected]);

  async function switchMode(next: "auto" | "livechat" | "email") {
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
        setLive(data.live);
        setPresence(data.presence?.raw ?? null);
        const uitleg: Record<string, string> = {
          auto: `Modus: automatisch. Mobile Service Cloud bepaalt het — op dit moment ${data.live ? "wél" : "géén"} live chat.`,
          livechat: "Modus: live chat vastgezet. Elke escalatie belooft een medewerker in de chat.",
          email: "Modus: e-mail vastgezet. Elke escalatie wordt een Online-gesprek in Robin; de klant krijgt antwoord per e-mail.",
        };
        setResult({ ok: true, text: uitleg[next] });
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

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    if (timer.current) clearInterval(timer.current);
    setLoggedOut(true);
  }

  if (loggedOut) {
    return (
      <div className="los">
        <div className="kader">
          <img src="/exit-logo.svg" alt="EXIT Toys" />
          <h2>Je bent afgemeld</h2>
          <p className="uitleg">Je aanmelding bij het platformdashboard blijft staan.</p>
          <p style={{ margin: "18px 0 0" }}>
            <a href="/auth/login">Opnieuw aanmelden</a>
          </p>
        </div>
      </div>
    );
  }

  const kop = KOP[view];
  const sessionTable = (rows: Session[], compact = false) => (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Klant</th>
            <th>Land</th>
            {!compact && <th>Kanaal</th>}
            <th>Modus</th>
            <th>Status</th>
            <th>Medewerker</th>
            {!compact && <th>Zipchat-gesprek</th>}
            {!compact && <th>CM-chat</th>}
            <th>Bijgewerkt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              className="klikbaar"
              aria-selected={selected === s.id}
              onClick={() => setSelected(s.id)}
            >
              <td className="mono">{s.id}</td>
              <td>
                {s.customerName ?? <span className="zacht">—</span>}
                {s.customerEmail && <div className="zacht klein">{s.customerEmail}</div>}
              </td>
              <td>{s.country ?? <span className="zacht">—</span>}</td>
              {!compact && <td>{s.channel}</td>}
              <td>
                <span className={`status ${s.mode === "livechat" ? "ok" : ""}`}>
                  {s.mode === "livechat" ? "live chat" : "e-mail"}
                </span>
              </td>
              <td>
                <span className={`status ${statusClass(s.status)}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
              </td>
              <td>
                {s.agentName ?? <span className="zacht">—</span>}
                {s.handoverState && <div className="zacht mono klein">{s.handoverState}</div>}
              </td>
              {!compact && <td className="mono kort">{s.zipchatConversationId}</td>}
              {!compact && <td className="mono kort">{s.cmChatId ?? "—"}</td>}
              <td className="zacht heel">{fmtAgo(s.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <a className="skip" href="#inhoud">
        Naar inhoud
      </a>
      <aside className="zijbalk">
        <a className="merk" href="#overzicht" aria-label="Zipchat, overzicht">
          <img src="/exit-logo.svg" width={48} height={36} alt="EXIT Toys" />
          <span>
            Zipchat<small>Dutch Toys Group</small>
          </span>
        </a>
        {/* Per onderdeel een kopje: hier komt meer Zipchat-functionaliteit bij. */}
        <div className="nav-label">Doorzetten naar MSC</div>
        <nav aria-label="Hoofdnavigatie">
          {VIEWS.map((v) => (
            <a key={v.key} href={`#${v.key}`} aria-current={view === v.key ? "page" : undefined}>
              <Icon>{v.icon}</Icon>
              {v.label}
              {v.key === "gesprekken" && openSessions.length > 0 && (
                <span className="teller" aria-label={`${openSessions.length} open`}>
                  {openSessions.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="zij-voet">
          <strong>EXIT Toys</strong>De Zipchat-assistent op de webshops
        </div>
      </aside>

      <div className="werkruimte">
        <header className="topbalk">
          <div className="breadcrumb">
            Zipchat <span>/</span>
            <strong>{kop.titel}</strong>
          </div>
          {user && (
            <div className="wie">
              <span className="avatar" aria-hidden="true">
                {initials(user)}
              </span>
              <span>{user}</span>
              <button className="link" onClick={logout}>
                Afmelden
              </button>
            </div>
          )}
        </header>

        <main id="inhoud">
          <div className="paginakop">
            <div>
              <p className="bovenlabel">Zipchat · Doorzetten naar MSC</p>
              <h1>{kop.titel}</h1>
              <p className="sub">{kop.sub}</p>
            </div>
            <div className="kop-acties">
              <button className="secundair" type="button" onClick={() => refresh()}>
                ↻ Vernieuwen
              </button>
              <span className="versheid" role="status">
                <label className="schakel">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  elke 15 s
                </label>
                <span aria-hidden="true">·</span>
                {updatedAt ? `Bijgewerkt ${fmtTime(updatedAt.toISOString())}` : "Laden…"}
              </span>
            </div>
          </div>

          {result && (
            <div className={`notitie ${result.ok ? "ok" : "fout"}`} role="status">
              <p>{result.text}</p>
            </div>
          )}

          {view === "overzicht" && (
            <>
              {health && health.missing.length > 0 && (
                <div className="notitie let-op">
                  <p>
                    <strong>Nog niet ingevuld:</strong> <span className="mono">{health.missing.join(", ")}</span>.
                    {health.mockMode && " Zolang deze ontbreken draait de bridge in mock-modus: er gaat niets echt naar CM of Zipchat."}
                  </p>
                </div>
              )}
              {health?.warnings.map((w) => (
                <div key={w} className="notitie let-op">
                  <p>{w}</p>
                </div>
              ))}

              <div className="cijfers" aria-label="Overzicht">
                <div className="cijfer">
                  <span className="cijfer-label">
                    Open gesprekken
                    <Icon>{VIEWS[1].icon}</Icon>
                  </span>
                  <strong>{health?.openSessions ?? "—"}</strong>
                  <small>Gesprekken zonder live chat sluiten na een uur stilte</small>
                </div>
                <div className="cijfer">
                  <span className="cijfer-label">
                    Doorzetten nu
                    <Icon>
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0 1 16 0" />
                    </Icon>
                  </span>
                  <strong>{live === null ? "—" : live ? "Live chat" : "Per e-mail"}</strong>
                  <small>{mode ? (mode === "auto" ? "Automatisch, via MSC" : "Handmatig vastgezet") : "Wordt geladen"}</small>
                </div>
                <div className="cijfer">
                  <span className="cijfer-label">
                    Laatste CM-webhook
                    <Icon>
                      <path d="M4 12h12M12 6l6 6-6 6" />
                    </Icon>
                  </span>
                  <strong>{health && !health.lastWebhookAt ? "Geen" : fmtAgo(health?.lastWebhookAt)}</strong>
                  <small>
                    {health && !health.lastWebhookAt
                      ? "In 90 dagen geen antwoord via de chat"
                      : "Antwoord van een medewerker"}
                  </small>
                </div>
                <div className="cijfer">
                  <span className="cijfer-label">
                    Laatste poll
                    <Icon>
                      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
                    </Icon>
                  </span>
                  <strong>{fmtAgo(health?.lastPollAt)}</strong>
                  <small>Elke 5 min, vaker tijdens een live chat</small>
                </div>
              </div>

              <div className="twee">
                <div>
                  <section className="kader">
                    <div className="kader-kop">
                      <div>
                        <h2>Bemensing</h2>
                        <p className="uitleg">
                          {mode === "auto"
                            ? "Zoals HALO: is er in Mobile Service Cloud iemand online, dan komt het gesprek als live chat in Robin (webshop HALO Livechat) en antwoordt de medewerker in het chatvenster. Anders wordt het een Online-gesprek en mailt Robin het antwoord."
                            : mode === "livechat"
                              ? "Handmatig vastgezet: elke doorzetting wordt een live chat, ook als MSC offline meldt."
                              : mode === "email"
                                ? "Handmatig vastgezet: elke doorzetting wordt een Online-gesprek in Robin en de klant krijgt antwoord per e-mail, ook als er wél iemand online is."
                                : "Wordt geladen…"}
                        </p>
                      </div>
                      <span className={`status ${live ? "ok" : "let-op"}`}>
                        {live === null ? "…" : live ? "nu live chat" : "nu per e-mail"}
                      </span>
                    </div>
                    <div className="segment" role="group" aria-label="Bemensing">
                      {(["auto", "livechat", "email"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={mode === m}
                          disabled={!!busy || mode === null}
                          onClick={() => switchMode(m)}
                        >
                          {MODE_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="kader">
                    <div className="kader-kop">
                      <div>
                        <h2>Open gesprekken</h2>
                        <p className="uitleg">Escalaties die nog bij een medewerker liggen.</p>
                      </div>
                      <a href="#gesprekken">Alle gesprekken →</a>
                    </div>
                    {openSessions.length === 0 ? (
                      <div className="leeg">Er staat nu niets open.</div>
                    ) : (
                      sessionTable(openSessions, true)
                    )}
                  </section>
                </div>

                <section className="kader">
                  <div className="kader-kop">
                    <div>
                      <h2>Systeem</h2>
                      <p className="uitleg">Waar de bridge mee verbonden is.</p>
                    </div>
                  </div>
                  <dl className="lijst">
                    <div>
                      <dt>Verbinding</dt>
                      <dd>
                        {health ? (
                          <span className={`status ${health.mockMode ? "let-op" : "ok"}`}>
                            {health.mockMode ? "Mock" : "Live"}
                          </span>
                        ) : (
                          "…"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Opslag</dt>
                      <dd>
                        {health ? (
                          <span className={`status ${health.storage === "postgres" ? "ok" : "let-op"}`}>
                            {health.storage === "postgres" ? "Azure PostgreSQL" : "In-memory"}
                          </span>
                        ) : (
                          "…"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Escalatiemail</dt>
                      <dd>
                        {health ? (
                          health.mail.configured ? (
                            <span className="mono">{health.mail.to}</span>
                          ) : (
                            <span className="status" title="Een extra kopie per mail naast CM; zet ESCALATION_EMAIL_TO en RESEND_API_KEY of SMTP_URL om hem aan te zetten.">
                              uit, alleen via CM
                            </span>
                          )
                        ) : (
                          "…"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Mobile Service Cloud meldt</dt>
                      <dd className="mono">{presence ?? "—"}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </>
          )}

          {view === "gesprekken" && (
            <section className="kader">
              <div className="kader-kop">
                <div>
                  <h2>Alle gesprekken</h2>
                  <p className="uitleg">
                    {sessions.length} in de lijst, waarvan {openSessions.length} open. Klik een gesprek om het onder
                    Testen te kiezen.
                  </p>
                </div>
              </div>
              {sessions.length === 0 ? (
                <div className="leeg">Nog geen gesprekken.</div>
              ) : (
                sessionTable(sessions)
              )}
            </section>
          )}

          {view === "logboek" && (
            <section className="kader">
              <div className="kader-kop">
                <div>
                  <h2>Laatste gebeurtenissen</h2>
                  <p className="uitleg">De laatste {events.length} regels.</p>
                </div>
              </div>
              {events.length === 0 ? (
                <div className="leeg">Nog niets gebeurd.</div>
              ) : (
                <div className="scroll">
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
                          <td className="mono zacht heel">{fmtTime(e.createdAt)}</td>
                          <td className="zacht heel">{DIRECTION_LABEL[e.direction] ?? e.direction}</td>
                          <td className="mono">{e.kind}</td>
                          <td>
                            <span className={`status ${e.ok ? "ok" : "fout"}`}>
                              {e.ok ? "ok" : "fout"}
                              {e.statusCode ? ` ${e.statusCode}` : ""}
                            </span>
                          </td>
                          <td className="kort">{e.summary ?? <span className="zacht">—</span>}</td>
                          <td>
                            {e.payload ? (
                              <details className="ruw">
                                <summary>Tonen</summary>
                                <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                              </details>
                            ) : (
                              <span className="zacht">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {view === "testen" && (
            <>
              <section className="kader">
                <div className="kader-kop">
                  <div>
                    <h2>Escalatie proberen</h2>
                    <p className="uitleg">Alsof de Zipchat-AI een gesprek doorzet naar een medewerker.</p>
                  </div>
                </div>
                <div className="velden">
                  <label className="veld">
                    Naam klant
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="veld">
                    E-mail klant
                    <input value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="veld">
                    Zipchat-gesprek-id (optioneel)
                    <input
                      value={convId}
                      onChange={(e) => setConvId(e.target.value)}
                      placeholder="Leeg = ticket zonder transcript"
                    />
                  </label>
                </div>
                <div className="rij">
                  <button
                    disabled={!!busy}
                    onClick={() => run("incoming_chat", { name, email, conversationId: convId })}
                  >
                    {busy === "incoming_chat" ? "Bezig…" : "Inkomende chat escaleren"}
                  </button>
                  <button
                    className="secundair"
                    disabled={!!busy}
                    onClick={() => run("incoming_email", { name, email, conversationId: convId })}
                  >
                    {busy === "incoming_email" ? "Bezig…" : "Inkomende e-mail escaleren"}
                  </button>
                  <button className="secundair" disabled={!!busy} onClick={() => run("mail", { name, email })}>
                    {busy === "mail" ? "Bezig…" : "Testmail sturen"}
                  </button>
                </div>
              </section>

              <section className="kader">
                <div className="kader-kop">
                  <div>
                    <h2>Antwoord van een medewerker</h2>
                    <p className="uitleg">Alsof iemand in Mobile Service Cloud reageert op een gesprek.</p>
                  </div>
                </div>
                <div className="velden">
                  <label className="veld">
                    Gesprek
                    <select value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value) || null)}>
                      <option value="">Kies een gesprek</option>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          #{s.id} · {s.customerName ?? "onbekend"} · {STATUS_LABEL[s.status] ?? s.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="veld" style={{ gridColumn: "span 2" }}>
                    Antwoord
                    <input value={agentText} onChange={(e) => setAgentText(e.target.value)} />
                  </label>
                </div>
                <div className="rij">
                  <button
                    disabled={!!busy || !selected}
                    onClick={() => run("agent_reply", { sessionId: selected, text: agentText })}
                  >
                    {busy === "agent_reply" ? "Bezig…" : "Antwoord sturen"}
                  </button>
                  <button
                    className="secundair"
                    disabled={!!busy || !selected}
                    onClick={() => run("handover", { sessionId: selected })}
                  >
                    {busy === "handover" ? "Bezig…" : "Handover-melding"}
                  </button>
                  <button
                    className="secundair"
                    disabled={!!busy || !selected}
                    onClick={() => run("close", { sessionId: selected })}
                  >
                    Gesprek sluiten
                  </button>
                </div>
              </section>

              <section className="kader">
                <div className="kader-kop">
                  <div>
                    <h2>Onderhoud</h2>
                    <p className="uitleg">Verbindingen nalopen, de poller aanzetten of testdata opruimen.</p>
                  </div>
                </div>
                <div className="rij">
                  <button className="secundair" disabled={!!busy} onClick={() => run("ping")}>
                    {busy === "ping" ? "Bezig…" : "Verbindingen testen"}
                  </button>
                  <button className="secundair" disabled={!!busy} onClick={() => run("poll")}>
                    {busy === "poll" ? "Bezig…" : "Nu pollen"}
                  </button>
                  <button
                    className="gevaar"
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm("Alle gesprekken en het hele logboek wissen? Dit is niet terug te draaien.")) run("reset");
                    }}
                  >
                    Testdata wissen
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ utils */

const STATUS_LABEL: Record<string, string> = {
  escalating: "doorzetten",
  active: "bij medewerker",
  closed: "gesloten",
  error: "fout",
};

function statusClass(s: string) {
  if (s === "active") return "ok";
  if (s === "error") return "fout";
  if (s === "escalating") return "let-op";
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
