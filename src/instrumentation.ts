/**
 * Draait één keer bij het starten van de server. Ontbreekt er in productie een
 * geheim, dan start de bridge niet: liever een App Service die niet opkomt dan
 * een die stilletjes zonder authenticatie draait.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { enforceProductionSecrets } = await import("./lib/startupCheck");
  enforceProductionSecrets();
}
