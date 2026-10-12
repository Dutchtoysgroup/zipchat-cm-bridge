import { config } from "./config";
import { store } from "@/db";
import * as zipchat from "./zipchat";
import { sendGraphMail } from "./graph";
import { controleerContact } from "./bridge";

export type MarketingInput = {
  conversationId?: string;
  chatId?: string;
  name?: string | null;
  email?: string | null;
  handle?: string | null;
  channel?: string | null;
  summary?: string | null;
};

export type MarketingResult = {
  ok: boolean;
  /** Alleen true als de mail echt bij marketing is afgeleverd. */
  forwarded: boolean;
  /** Wat de assistent nog moet vragen voordat hij het opnieuw probeert. */
  missing?: string[];
  /** Wat de assistent tegen de persoon moet zeggen. */
  message: string;
};

/**
 * Zet een influencer- of samenwerkingsaanvraag per mail door naar marketing.
 * Anders dan de escalatie raakt dit CM en Robin niet, en de AI blijft gewoon
 * in het gesprek: er neemt hier geen medewerker over in de chat.
 */
export async function forwardToMarketing(input: MarketingInput): Promise<MarketingResult> {
  const { naamOk, mailOk } = controleerContact(input.name, input.email);
  if (!naamOk || !mailOk) {
    const missing = [!mailOk ? "email" : null, !naamOk ? "name" : null].filter((m): m is string => !!m);
    await store.logEvent({
      direction: "zipchat->bridge",
      kind: "marketing.details_needed",
      summary: `Samenwerkingsaanvraag niet doorgezet, ontbreekt: ${missing.join(", ")}`,
      payload: { conversationId: input.conversationId, chatId: input.chatId },
    });
    return {
      ok: false,
      forwarded: false,
      missing,
      message:
        "Nog NIET doorgezet. Vraag het ontbrekende gegeven in een apart bericht en roep de tool daarna " +
        "opnieuw aan met de echte waarde. Vul nooit zelf iets in. Weigert de persoon zijn naam na twee " +
        "keer vragen, gebruik dan exact 'NAAM NIET OPGEGEVEN'.",
    };
  }

  // Het gesprek gaat mee, zodat marketing leest wat de persoon zelf schreef en
  // niet alleen de samenvatting van de assistent. Lukt dat niet, dan gaat de
  // mail toch: een aanvraag zonder historie is beter dan geen aanvraag.
  const conv =
    input.conversationId && input.chatId
      ? await zipchat.getConversation(input.conversationId, { chatId: input.chatId })
      : null;
  const transcript = conv?.ok ? zipchat.formatTranscript(conv.data?.messages ?? []) : "";

  const name = input.name!.trim();
  const email = input.email!.trim();
  const handle = input.handle?.trim() || null;
  const channel = input.channel?.trim() || "onbekend kanaal";

  const subject = `Samenwerkingsaanvraag: ${name}${handle ? ` (${handle})` : ""} via ${channel}`;
  const text = [
    "Nieuwe influencer- of samenwerkingsaanvraag via de social-media-assistent.",
    "",
    `Naam:     ${name}`,
    `E-mail:   ${email}`,
    `Handle:   ${handle ?? "niet opgegeven"}`,
    `Kanaal:   ${channel}`,
    input.conversationId ? `Gesprek:  Zipchat #${input.conversationId} (agent ${input.chatId ?? "onbekend"})` : null,
    "",
    input.summary ? `Samenvatting door de assistent:\n${input.summary}` : null,
    transcript
      ? `\n--- Gespreksgeschiedenis ---\n\n${transcript}`
      : conv && !conv.ok
        ? "\nLET OP: de gespreksgeschiedenis kon niet opgehaald worden bij Zipchat."
        : null,
    "",
    `Beantwoorden gaat rechtstreeks naar ${email}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const mail = await sendGraphMail({ to: [config.marketing.to], subject, text, replyTo: email });
  await store.logEvent({
    direction: "internal",
    kind: mail.ok ? "marketing.mail_sent" : "marketing.mail_failed",
    ok: mail.ok,
    summary: mail.ok
      ? `Samenwerkingsaanvraag van ${name} doorgemaild naar ${config.marketing.to}`
      : `Samenwerkingsaanvraag van ${name} NIET doorgemaild: ${mail.error}`,
    payload: { conversationId: input.conversationId, chatId: input.chatId, channel, handle },
  });

  if (!mail.ok) {
    return {
      ok: false,
      forwarded: false,
      message:
        "Doorsturen is mislukt. Zeg NIET dat het is doorgezet. Meld kort dat het nu niet lukt en dat de " +
        `persoon het marketingteam zelf kan mailen op ${config.marketing.to}.`,
    };
  }
  return {
    ok: true,
    forwarded: true,
    message:
      "Doorgestuurd naar het marketingteam. Zeg in de taal van de persoon dat de aanvraag bij ons " +
      "marketingteam ligt en dat zij per e-mail contact opnemen. Noem geen termijn en beloof geen samenwerking.",
  };
}
