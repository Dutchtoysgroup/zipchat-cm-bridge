import { EXIT_LOGO_PNG_BASE64 } from "@/assets/exitLogo";
import type { InlineImage } from "./graph";

/**
 * De mail met de verificatiecode, in de huisstijl van EXIT Toys: groene kop met
 * logo en pay-off, de code groot in een kader. Tabellen en inline stijlen,
 * omdat Outlook niets anders begrijpt. Changa One en Rajdhani laden waar de
 * mailclient webfonts toestaat (Apple Mail, iOS); elders wordt het Arial.
 *
 * De taal volgt de webshop van de bot, niet wat de klant typt: die kennen we
 * zeker, en het is ook de taal van de rest van de communicatie met dat land.
 */

type Copy = {
  subject: string;
  preheader: string;
  heading: string;
  intro: (shop: string) => string;
  validity: (minutes: number) => string;
  ignore: string;
  noreply: (shop: string) => string;
  signoff: string;
};

const COPY: Record<string, Copy> = {
  nl: {
    subject: "Je verificatiecode van EXIT Toys",
    preheader: "Vul deze code in de chat in om je bestellingen te bekijken.",
    heading: "Je verificatiecode",
    intro: (shop) =>
      `Je vroeg in de chat op ${shop} naar je bestelling. Vul de code hieronder in de chat in, dan zoeken we je bestellingen erbij.`,
    validity: (m) => `De code is ${m} minuten geldig.`,
    ignore:
      "Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail negeren. Zonder deze code kan niemand je bestellingen inzien.",
    noreply: (shop) => `Dit is een automatische e-mail. Heb je een vraag? Stel hem gerust in de chat op ${shop}.`,
    signoff: "Sportieve groet,<br>Team EXIT Toys",
  },
  de: {
    subject: "Dein Bestätigungscode von EXIT Toys",
    preheader: "Gib diesen Code im Chat ein, um deine Bestellungen zu sehen.",
    heading: "Dein Bestätigungscode",
    intro: (shop) =>
      `Du hast im Chat auf ${shop} nach deiner Bestellung gefragt. Gib den Code unten im Chat ein, dann suchen wir deine Bestellungen heraus.`,
    validity: (m) => `Der Code ist ${m} Minuten gültig.`,
    ignore:
      "Hast du das nicht selbst angefordert? Dann kannst du diese E-Mail ignorieren. Ohne diesen Code kann niemand deine Bestellungen einsehen.",
    noreply: (shop) => `Dies ist eine automatische E-Mail. Hast du eine Frage? Stell sie gern im Chat auf ${shop}.`,
    signoff: "Sportliche Grüße,<br>Dein EXIT Toys Team",
  },
  fr: {
    subject: "Votre code de vérification EXIT Toys",
    preheader: "Saisissez ce code dans le chat pour consulter vos commandes.",
    heading: "Votre code de vérification",
    intro: (shop) =>
      `Vous avez posé une question sur votre commande dans le chat de ${shop}. Saisissez le code ci-dessous dans le chat et nous retrouverons vos commandes.`,
    validity: (m) => `Ce code est valable ${m} minutes.`,
    ignore:
      "Vous n'êtes pas à l'origine de cette demande ? Vous pouvez ignorer cet e-mail. Sans ce code, personne ne peut consulter vos commandes.",
    noreply: (shop) =>
      `Ceci est un e-mail automatique. Une question ? Posez-la volontiers dans le chat sur ${shop}.`,
    signoff: "Sportivement,<br>L'équipe EXIT Toys",
  },
  en: {
    subject: "Your EXIT Toys verification code",
    preheader: "Enter this code in the chat to view your orders.",
    heading: "Your verification code",
    intro: (shop) =>
      `You asked about your order in the chat on ${shop}. Enter the code below in the chat and we'll look up your orders.`,
    validity: (m) => `This code is valid for ${m} minutes.`,
    ignore:
      "Didn't request this? Then you can ignore this email. Without this code, nobody can see your orders.",
    noreply: (shop) => `This is an automated email. Got a question? Just ask it in the chat on ${shop}.`,
    signoff: "Sporty regards,<br>Team EXIT Toys",
  },
  da: {
    subject: "Din bekræftelseskode fra EXIT Toys",
    preheader: "Indtast koden i chatten for at se dine ordrer.",
    heading: "Din bekræftelseskode",
    intro: (shop) =>
      `Du spurgte til din ordre i chatten på ${shop}. Indtast koden herunder i chatten, så finder vi dine ordrer frem.`,
    validity: (m) => `Koden er gyldig i ${m} minutter.`,
    ignore:
      "Har du ikke selv bedt om dette? Så kan du se bort fra denne e-mail. Uden koden kan ingen se dine ordrer.",
    noreply: (shop) => `Dette er en automatisk e-mail. Har du et spørgsmål? Stil det gerne i chatten på ${shop}.`,
    signoff: "Sportslig hilsen,<br>Team EXIT Toys",
  },
  sv: {
    subject: "Din verifieringskod från EXIT Toys",
    preheader: "Ange koden i chatten för att se dina beställningar.",
    heading: "Din verifieringskod",
    intro: (shop) =>
      `Du frågade om din beställning i chatten på ${shop}. Ange koden nedan i chatten så letar vi fram dina beställningar.`,
    validity: (m) => `Koden gäller i ${m} minuter.`,
    ignore:
      "Har du inte bett om detta själv? Då kan du bortse från det här mejlet. Utan koden kan ingen se dina beställningar.",
    noreply: (shop) => `Det här är ett automatiskt mejl. Har du en fråga? Ställ den gärna i chatten på ${shop}.`,
    signoff: "Sportiga hälsningar,<br>Team EXIT Toys",
  },
  es: {
    subject: "Tu código de verificación de EXIT Toys",
    preheader: "Introduce este código en el chat para ver tus pedidos.",
    heading: "Tu código de verificación",
    intro: (shop) =>
      `Has preguntado por tu pedido en el chat de ${shop}. Introduce el código de abajo en el chat y buscaremos tus pedidos.`,
    validity: (m) => `El código es válido durante ${m} minutos.`,
    ignore:
      "¿No lo has solicitado tú? Entonces puedes ignorar este correo. Sin este código nadie puede ver tus pedidos.",
    noreply: (shop) => `Este es un correo automático. ¿Tienes alguna pregunta? Hazla en el chat de ${shop}.`,
    signoff: "Un saludo deportivo,<br>El equipo de EXIT Toys",
  },
  it: {
    subject: "Il tuo codice di verifica EXIT Toys",
    preheader: "Inserisci questo codice nella chat per vedere i tuoi ordini.",
    heading: "Il tuo codice di verifica",
    intro: (shop) =>
      `Hai chiesto informazioni sul tuo ordine nella chat di ${shop}. Inserisci il codice qui sotto nella chat e cercheremo i tuoi ordini.`,
    validity: (m) => `Il codice è valido per ${m} minuti.`,
    ignore:
      "Non l'hai richiesto tu? Allora puoi ignorare questa e-mail. Senza questo codice nessuno può vedere i tuoi ordini.",
    noreply: (shop) => `Questa è un'e-mail automatica. Hai una domanda? Chiedila pure nella chat di ${shop}.`,
    signoff: "Saluti sportivi,<br>Il team EXIT Toys",
  },
  pl: {
    subject: "Twój kod weryfikacyjny EXIT Toys",
    preheader: "Wpisz ten kod na czacie, aby zobaczyć swoje zamówienia.",
    heading: "Twój kod weryfikacyjny",
    intro: (shop) =>
      `Pytałeś(-aś) na czacie ${shop} o swoje zamówienie. Wpisz poniższy kod na czacie, a wyszukamy Twoje zamówienia.`,
    validity: (m) => `Kod jest ważny przez ${m} minut.`,
    ignore:
      "To nie Ty? W takim razie zignoruj tę wiadomość. Bez tego kodu nikt nie zobaczy Twoich zamówień.",
    noreply: (shop) => `To jest wiadomość automatyczna. Masz pytanie? Zadaj je na czacie na ${shop}.`,
    signoff: "Sportowe pozdrowienia,<br>Zespół EXIT Toys",
  },
};

const LOGO_CID = "exit-logo";

const GREEN = "#78be20";
const DARK_GREEN = "#658d1b";
const ORANGE = "#f68d2e";
const LIGHT_BLUE = "#9bcbeb";
const HEAD = "'Changa One',Impact,'Arial Black',Arial,sans-serif";
const BODY = "Rajdhani,'Segoe UI',Arial,Helvetica,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function verifyMail(params: { code: string; lang: string; shop: string; minutes: number }): {
  subject: string;
  html: string;
  inlineImages: InlineImage[];
} {
  const c = COPY[params.lang] ?? COPY.en;
  const shop = escapeHtml(params.shop);
  // 123456 → "123 456": leest en typt makkelijker over.
  const spaced = `${params.code.slice(0, 3)}&nbsp;${params.code.slice(3)}`;

  const html = `<!DOCTYPE html>
<html lang="${params.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Changa+One&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#eef5e6;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef5e6" style="background-color:#eef5e6">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
        <tr>
          <td align="center" bgcolor="${GREEN}" style="background-color:${GREEN};border-radius:20px 20px 0 0;padding:28px 24px 22px">
            <img src="cid:${LOGO_CID}" width="122" height="91" alt="EXIT Toys" style="display:block;border:0;outline:none;width:122px;height:91px">
            <p style="margin:14px 0 0;font-family:${HEAD};font-size:20px;line-height:24px;letter-spacing:1px;color:#ffffff;white-space:nowrap">GO PLAY OUTSIDE!</p>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 28px 8px">
            <h1 style="margin:0 0 14px;font-family:${HEAD};font-size:28px;line-height:32px;font-weight:400;text-transform:uppercase;color:${DARK_GREEN}">${escapeHtml(c.heading)}</h1>
            <p style="margin:0;font-family:${BODY};font-size:17px;line-height:25px;font-weight:500;color:#2f3a2a">${escapeHtml(c.intro(params.shop)).replace(shop, `<strong>${shop}</strong>`)}</p>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" align="center" style="background-color:#ffffff;padding:24px 28px 8px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#f3f9ea" style="background-color:#f3f9ea;border:2px dashed ${GREEN};border-radius:14px;padding:16px 26px">
                  <span style="font-family:${HEAD};font-size:38px;line-height:44px;letter-spacing:5px;color:${DARK_GREEN};white-space:nowrap">${spaced}</span>
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0;font-family:${BODY};font-size:16px;line-height:22px;font-weight:700;color:${ORANGE}">${escapeHtml(c.validity(params.minutes))}</p>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 28px 32px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#eef6fb" style="background-color:#eef6fb;border-left:4px solid ${LIGHT_BLUE};border-radius:8px;padding:14px 16px;font-family:${BODY};font-size:15px;line-height:21px;font-weight:500;color:#3b4a55">${escapeHtml(c.ignore)}</td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-family:${BODY};font-size:17px;line-height:24px;font-weight:600;color:#2f3a2a">${c.signoff}</p>
          </td>
        </tr>
        <tr>
          <td bgcolor="${DARK_GREEN}" style="background-color:${DARK_GREEN};border-radius:0 0 20px 20px;padding:18px 28px;font-family:${BODY};font-size:13px;line-height:19px;font-weight:500;color:#e8f3d6">${escapeHtml(c.noreply(params.shop))}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return {
    subject: c.subject,
    html,
    inlineImages: [
      { contentId: LOGO_CID, name: "exit-toys.png", contentType: "image/png", base64: EXIT_LOGO_PNG_BASE64 },
    ],
  };
}
