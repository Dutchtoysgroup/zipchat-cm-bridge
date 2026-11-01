import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Lege DATABASE_URL = in-memory opslag. Geen echte sleutels: fetch is nep.
    env: {
      DATABASE_URL: "",
      BRIDGE_SHARED_SECRET: "test-geheim-van-minstens-16",
      EXIT_ORDER_API_AUTH: "dicode test-order",
      EXIT_TRACKING_API_AUTH: "dicode test-tracking",
    },
  },
});
