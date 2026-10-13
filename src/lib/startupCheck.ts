import { secretProblems } from "./authMode";

/**
 * Bij het starten van de server: in productie stoppen als er een geheim
 * ontbreekt. Gooien is niet genoeg: een fout uit register() vangt Next zelf
 * af, waarna de server blijft draaien en op elk verzoek een 500 geeft. Echt
 * stoppen maakt in App Service zichtbaar dat de start mislukt is.
 *
 * Alleen Node: wordt uitsluitend vanuit instrumentation.ts geladen.
 */
export function enforceProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const problems = secretProblems();
  if (problems.length === 0) return;
  console.error(`Bridge start niet: ${problems.join("; ")}. Zet ze in App Service → Configuration.`);
  process.exit(1);
}
