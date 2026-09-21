import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "";

// De centrale database wordt alleen via migraties in dtg-data-platform gewijzigd;
// een push zou de tabellen bovendien in public zetten in plaats van
// app_zipchat_bridge. Alleen tegen een eigen (lokale) database gebruiken.
if (url.includes("dtg-data-platform-pg")) {
  throw new Error("db:push tegen het centrale dataplatform is geblokkeerd — lever een migratie aan in dtg-data-platform");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
