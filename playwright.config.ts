import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE = `http://127.0.0.1:${PORT}`;

// In this managed environment Chromium is pre-installed; allow an explicit
// executablePath override so E2E works without downloading a browser.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `${BASE}/pimpinan`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_PUBLIC_DB_URL:
        process.env.APP_PUBLIC_DB_URL ??
        "postgres://app_public@127.0.0.1:5433/setda_app",
      APP_ADMIN_DB_URL:
        process.env.APP_ADMIN_DB_URL ??
        "postgres://app_admin@127.0.0.1:5433/setda_app",
    },
  },
});
