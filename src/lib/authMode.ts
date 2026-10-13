/**
 * Wanneer mag de bridge zonder geheimen draaien? Alleen lokaal, en alleen als
 * je dat expliciet aanzet met BRIDGE_DEV_NO_AUTH=true. In een productiebuild
 * (`next build`, standalone server.js) is NODE_ENV altijd "production" en telt
 * de vlag niet: een vergeten app setting mag nooit klantdata of de escalatie-
 * en verzendendpoints openzetten.
 *
 * Geen Node-API's hier: de middleware draait in de edge-runtime.
 */
export function authDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.BRIDGE_DEV_NO_AUTH === "true";
}

/**
 * Zonder deze geheimen weigert de bridge te starten in productie. CRON_SECRET
 * staat er niet tussen: /api/poll valt terug op BRIDGE_SHARED_SECRET.
 */
const REQUIRED_SECRETS = ["BRIDGE_SHARED_SECRET", "CM_WEBHOOK_SECRET", "DASHBOARD_PASSWORD"] as const;

/** Korter is eerder een placeholder ("x", "changeme") dan een geheim. */
const MIN_SECRET_LENGTH = 16;

/** Welke verplichte geheimen ontbreken of te kort zijn. Alleen namen, nooit waarden. */
export function secretProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_SECRETS) {
    const value = env[name]?.trim() ?? "";
    if (!value) problems.push(`${name} ontbreekt`);
    else if (value.length < MIN_SECRET_LENGTH) problems.push(`${name} is korter dan ${MIN_SECRET_LENGTH} tekens`);
  }
  const cron = env.CRON_SECRET?.trim();
  if (cron && cron.length < MIN_SECRET_LENGTH) problems.push(`CRON_SECRET is korter dan ${MIN_SECRET_LENGTH} tekens`);
  return problems;
}
