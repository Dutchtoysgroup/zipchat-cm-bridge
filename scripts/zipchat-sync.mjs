#!/usr/bin/env node
/**
 * Zet de klantenservice-skills en de promptregels op alle landenbots in Zipchat.
 *
 *   node scripts/zipchat-sync.mjs              # laat zien wat er zou veranderen
 *   node scripts/zipchat-sync.mjs --apply      # voert het uit
 *   node scripts/zipchat-sync.mjs --apply --only 22066,22067
 *
 * Bron: zipchat-tool/bots.json (welke bot, welke taal, landgegevens) en
 * zipchat-tool/skills/<taal>/*.md (de teksten). Wat je in het Zipchat-dashboard
 * aan deze skills wijzigt, overschrijft de volgende sync: pas de bron aan.
 *
 * Env:
 *   ZIPCHAT_API_TOKEN       user-token (zcu-…), verplicht
 *   MSC_BRIDGE_SECRET       = BRIDGE_SHARED_SECRET van de bridge
 *   EXIT_ORDER_API_AUTH     Authorization-header voor exittoys.com/halo.json
 *   EXIT_TRACKING_API_AUTH  Authorization-header voor exittoys.com/robin
 *   MSC_BRIDGE_URL          optioneel, standaard het escalate-endpoint op Azure
 *
 * Variabelen zijn in Zipchat alleen-schrijven. Ontbreekt er een op een bot, dan
 * maakt het script hem aan met de waarde uit de env. Een bestaande variabele
 * krijgt alleen een nieuwe waarde met --set-variables (bijv. na roteren).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ZIPCHAT_BASE_URL ?? "https://app.zipchat.ai/api/integrations/backend_api/v1";
const TOKEN = process.env.ZIPCHAT_API_TOKEN;
const APPLY = process.argv.includes("--apply");
const SET_VARIABLES = process.argv.includes("--set-variables");
const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === "--only");
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;

const BEGIN = "<!-- EXIT-regels: beheerd vanuit zipchat-cm-bridge, hieronder niet in het dashboard aanpassen -->";
const END = "<!-- /EXIT-regels -->";
const SKILLS = ["doorzetten", "tracking", "retour", "klacht"];

if (!TOKEN) {
  console.error("ZIPCHAT_API_TOKEN ontbreekt.");
  process.exit(1);
}

const VARIABLE_VALUES = {
  MSC_BRIDGE_URL:
    process.env.MSC_BRIDGE_URL ?? "https://dtg-zipchat-cm-bridge-weu.azurewebsites.net/api/zipchat/escalate",
  MSC_BRIDGE_SECRET: process.env.MSC_BRIDGE_SECRET,
  EXIT_ORDER_API_AUTH: process.env.EXIT_ORDER_API_AUTH,
  EXIT_TRACKING_API_AUTH: process.env.EXIT_TRACKING_API_AUTH,
};

const { bots } = JSON.parse(readFileSync(join(ROOT, "zipchat-tool/bots.json"), "utf8"));
const names = JSON.parse(readFileSync(join(ROOT, "zipchat-tool/skills/names.json"), "utf8"));

function render(text, bot) {
  const vars = {
    CHAT_ID: String(bot.chatId),
    CONTACT_EMAIL: bot.contactEmail,
    ZIP_HINT: bot.zipHint,
    COUNTRY_NAME: bot.countryName,
    SHOP_URL: bot.shopUrl,
  };
  const out = text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`Onbekende sjabloonvariabele ${m}`);
    return vars[k];
  });
  return out.trim();
}

function source(lang, file) {
  return readFileSync(join(ROOT, "zipchat-tool/skills", lang, `${file}.md`), "utf8");
}

async function api(method, path, body) {
  for (let poging = 1; ; poging++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    // 120 aanroepen per minuut; bij 429 even wachten in plaats van halverwege stoppen.
    if (res.status === 429 && poging < 5) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return data;
  }
}

async function listAll(path, key) {
  const all = [];
  for (let page = 1; ; page++) {
    const d = await api("GET", `${path}?per_page=100&page=${page}`);
    all.push(...d[key]);
    if (!d.pagination?.has_next_page) return all;
  }
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function syncBot(bot) {
  const log = (s) => console.log(`  ${s}`);
  console.log(`\n== ${bot.domain} (chat ${bot.chatId}, ${bot.lang})`);

  // 1. Variabelen
  const vars = await listAll(`/chats/${bot.chatId}/variables`, "variables");
  const varId = {};
  const needed = [...new Set(SKILLS.flatMap((s) => names.variabelen[s]))];
  for (const name of needed) {
    const bestaand = vars.find((v) => v.name === name);
    const waarde = VARIABLE_VALUES[name];
    if (bestaand) {
      varId[name] = bestaand.id;
      if (SET_VARIABLES && waarde) {
        log(`variabele ${name}: nieuwe waarde zetten`);
        if (APPLY) await api("PATCH", `/chats/${bot.chatId}/variables/${bestaand.id}`, { skill_variable: { value: waarde } });
      }
      continue;
    }
    if (!waarde) throw new Error(`Variabele ${name} ontbreekt op ${bot.domain} en niet in de env gezet.`);
    log(`variabele ${name}: aanmaken`);
    if (APPLY) {
      const d = await api("POST", `/chats/${bot.chatId}/variables`, { skill_variable: { name, value: waarde } });
      varId[name] = (d.variable ?? d.skill_variable ?? d).id;
    } else {
      varId[name] = `(nieuw ${name})`;
    }
  }

  // 2. Skills
  const tools = await listAll(`/chats/${bot.chatId}/custom_tools`, "custom_tools");
  for (const skill of SKILLS) {
    const naam = names.skills[skill][bot.lang];
    if (!naam) throw new Error(`Geen naam voor ${skill} in ${bot.lang}`);
    const bekendeNamen = [naam, ...(names.vorigeNamen[skill]?.[bot.lang] ?? [])];
    const gewenst = {
      name: naam,
      instructions: render(source(bot.lang, skill), bot),
      channels: bot.csChannels,
      active: true,
      variable_ids: names.variabelen[skill].map((v) => varId[v]),
    };
    if (gewenst.instructions.length > 10_000) throw new Error(`${skill}/${bot.lang} is langer dan 10.000 tekens`);

    const bestaand = tools.find((t) => bekendeNamen.includes(t.name));
    if (!bestaand) {
      log(`skill "${naam}": aanmaken (${gewenst.instructions.length} tekens, ${gewenst.channels.join(",")})`);
      if (APPLY) await api("POST", `/chats/${bot.chatId}/custom_tools`, { custom_tool: gewenst });
      continue;
    }
    const verschil = [];
    if (bestaand.name !== gewenst.name) verschil.push("naam");
    if (bestaand.instructions.trim() !== gewenst.instructions) verschil.push("instructies");
    if (!sameSet(bestaand.channels, gewenst.channels)) verschil.push(`kanalen ${bestaand.channels}→${gewenst.channels}`);
    if (!bestaand.active) verschil.push("activeren");
    if (!sameSet(bestaand.variable_ids.map(String), gewenst.variable_ids.map(String))) verschil.push("variabelen");
    if (verschil.length === 0) {
      log(`skill "${naam}": ongewijzigd`);
      continue;
    }
    log(`skill "${naam}": bijwerken (${verschil.join(", ")})`);
    if (APPLY) await api("PATCH", `/chats/${bot.chatId}/custom_tools/${bestaand.id}`, { custom_tool: gewenst });
  }

  // 3. Promptregels als beheerd blok onder de eigen tekst van de bot
  if (bot.rules === false) {
    log("prompt: geen beheerd blok (bot heeft eigen regels)");
    return;
  }
  const { prompt } = await api("GET", `/chats/${bot.chatId}/prompt`);
  const huidig = prompt.master_prompt ?? "";
  const max = prompt.master_prompt_max_length ?? 10_000;
  const blok = `${BEGIN}\n\n${render(source(bot.lang, "prompt-regels"), bot)}\n\n${END}`;
  const b = huidig.indexOf(BEGIN);
  const e = huidig.indexOf(END);
  const eigen = b >= 0 && e > b ? `${huidig.slice(0, b)}${huidig.slice(e + END.length)}`.trim() : huidig.trim();
  const nieuw = `${eigen}\n\n${blok}`;
  if (nieuw.length > max) throw new Error(`Prompt van ${bot.domain} wordt ${nieuw.length} tekens, max ${max}`);
  if (nieuw === huidig) {
    log("prompt: ongewijzigd");
    return;
  }
  log(`prompt: ${b >= 0 ? "blok bijwerken" : "blok toevoegen"} (${huidig.length} → ${nieuw.length} tekens)`);
  if (APPLY) await api("PATCH", `/chats/${bot.chatId}/prompt`, { master_prompt: nieuw });
}

console.log(APPLY ? "UITVOEREN" : "PROEFDRAAI — niets wordt gewijzigd; voeg --apply toe om uit te voeren");
for (const bot of bots) {
  if (ONLY && !ONLY.has(String(bot.chatId)) && !ONLY.has(bot.domain)) continue;
  await syncBot(bot);
}
