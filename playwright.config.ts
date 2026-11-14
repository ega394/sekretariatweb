import { defineConfig, devices } from "@playwright/test";
import { MOCK_AUTH_PORT, MOCK_AUTH_URL, E2E_JWT_SECRET } from "./tests/e2e/constants.mjs";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE = `http://127.0.0.1:${PORT}`;

// In this managed environment Chromium is pre-installed; allow an explicit
// executablePath override so E2E works without downloading a browser.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  // Admin lifecycle mutates data (and restores it): run files one at a time.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: BASE, trace: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-auth.mjs",
      url: `${MOCK_AUTH_URL}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_AUTH_PORT },
    },
    {
      command: `npm run start -- -p ${PORT}`,
      url: `${BASE}/pimpinan`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        APP_PUBLIC_DB_URL:
          process.env.APP_PUBLIC_DB_URL ?? "postgres://app_public@127.0.0.1:5433/setda_app",
        APP_ADMIN_DB_URL:
          process.env.APP_ADMIN_DB_URL ?? "postgres://app_admin@127.0.0.1:5433/setda_app",
        SUPABASE_URL: MOCK_AUTH_URL,
        SUPABASE_ANON_KEY: "e2e-anon-key",
        SUPABASE_JWT_SECRET: E2E_JWT_SECRET,
        SESSION_COOKIE_SECURE: "false", // local HTTP only
      },
    },
  ],
});
