import { config } from "./config";
import { requestJson } from "./http";

export type MailResult = { ok: boolean; via: string; error?: string };

/**
 * Stuurt de escalatie per e-mail. Bewust provider-onafhankelijk: Resend als er
 * een sleutel is, anders SMTP. Zonder allebei doen we niets en zeggen we dat
 * ook — stil falen is hier het gevaarlijkst, want dan denkt de klant dat er
 * iemand meekijkt terwijl er niemand iets ontvangt.
 */
export async function sendEscalationMail(params: {
  name?: string | null;
  email?: string | null;
  reason?: string | null;
  summary?: string | null;
  transcript?: string | null;
  channel: string;
  sessionId: number;
}): Promise<MailResult> {
  const to = config.mail.to;
  if (!to) return { ok: false, via: "geen", error: "ESCALATION_EMAIL_TO niet ingesteld" };

  const subject = `Klantvraag doorgezet: ${params.name ?? "onbekende klant"}${
    params.reason ? ` — ${params.reason}` : ""
  }`;

  const lines = [
    "Een klant vroeg in de chat om een medewerker. De AI-assistent heeft het gesprek doorgezet.",
    "",
    `Naam:     ${params.name ?? "niet opgegeven"}`,
    `E-mail:   ${params.email ?? "niet opgegeven"}`,
    `Kanaal:   ${params.channel}`,
    `Sessie:   #${params.sessionId}`,
    params.reason ? `Reden:    ${params.reason}` : null,
    "",
    params.summary ? `Samenvatting door de assistent:\n${params.summary}` : null,
    params.transcript ? `\n--- Gespreksgeschiedenis ---\n${params.transcript}` : null,
    "",
    params.email ? `Reageren kan rechtstreeks naar ${params.email}.` : "Let op: geen e-mailadres opgegeven.",
  ].filter((l) => l !== null);

  const text = lines.join("\n");
  const from = config.mail.from ?? `klantenservice@${(to.split("@")[1] ?? "example.com")}`;

  if (config.mail.resendApiKey) {
    const res = await requestJson("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(params.email ? { reply_to: params.email } : {}),
      }),
    });
    return { ok: res.ok, via: "resend", error: res.ok ? undefined : res.error };
  }

  if (config.mail.smtpUrl) {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(config.mail.smtpUrl);
      await transport.sendMail({
        from,
        to,
        subject,
        text,
        ...(params.email ? { replyTo: params.email } : {}),
      });
      return { ok: true, via: "smtp" };
    } catch (err) {
      return { ok: false, via: "smtp", error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    ok: false,
    via: "geen",
    error: "Geen RESEND_API_KEY of SMTP_URL ingesteld — er is geen mail verstuurd",
  };
}
