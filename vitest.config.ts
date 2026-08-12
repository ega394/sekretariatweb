import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 'server-only' is a Next build guard; no-op it under vitest (node).
      "server-only": fileURLToPath(
        new URL("./tests/setup/empty-module.ts", import.meta.url),
      ),
    },
  },
  test: {
    globalSetup: ["./tests/setup/global.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      APP_PUBLIC_DB_URL:
        process.env.APP_PUBLIC_DB_URL ??
        "postgres://app_public@127.0.0.1:5433/setda_test",
      APP_ADMIN_DB_URL:
        process.env.APP_ADMIN_DB_URL ??
        "postgres://app_admin@127.0.0.1:5433/setda_test",
    },
  },
});
