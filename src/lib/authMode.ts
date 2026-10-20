/**
 * Wanneer mag de bridge zonder geheimen draaien? Alleen lokaal, en alleen als
 * je dat expliciet aanzet met BRIDGE_DEV_NO_AUTH=true. In een productiebuild
 * (`next build`, standalone server.js) is NODE_ENV altijd "production" en telt
 * de vlag niet: een vergeten app setting mag nooit klantdata of de escalatie-
 * en verzendendpoints openzetten.
 */
export function authDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.BRIDGE_DEV_NO_AUTH === "true";
}

/**
 * Zonder deze geheimen weigert de bridge te starten in productie, met hun
 * minimumlengte. CRON_SECRET staat er niet tussen: /api/poll valt terug op
 * BRIDGE_SHARED_SECRET. ADMIN_SSO_SECRET deelt de bridge met admin
 * (SSO_ZIPCHAT_SECRET daar), en admin eist er minstens 32 tekens voor.
 */
const REQUIRED_SECRETS = {
  BRIDGE_SHARED_SECRET: 16,
  CM_WEBHOOK_SECRET: 16,
  ADMIN_SSO_SECRET: 32,
} as const;

/** Korter is eerder een placeholder ("x", "changeme") dan een geheim. */
const MIN_SECRET_LENGTH = 16;

/** Welke verplichte geheimen ontbreken of te kort zijn. Alleen namen, nooit waarden. */
export function secretProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  for (const [name, min] of Object.entries(REQUIRED_SECRETS)) {
    const value = env[name]?.trim() ?? "";
    if (!value) problems.push(`${name} ontbreekt`);
    else if (value.length < min) problems.push(`${name} is korter dan ${min} tekens`);
  }
  const cron = env.CRON_SECRET?.trim();
  if (cron && cron.length < MIN_SECRET_LENGTH) problems.push(`CRON_SECRET is korter dan ${MIN_SECRET_LENGTH} tekens`);
  return problems;
}
