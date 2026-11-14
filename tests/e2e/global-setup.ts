import { execSync } from "node:child_process";
import { E2E_SUB } from "./constants.mjs";

/** Map the E2E auth identity to the seeded super admin (what an operator does once). */
export default async function globalSetup() {
  execSync(
    `psql -v ON_ERROR_STOP=1 -c "UPDATE users SET external_auth_id='${E2E_SUB}' WHERE username='superadmin'"`,
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PGHOST: process.env.PGHOST ?? "127.0.0.1",
        PGPORT: process.env.PGPORT ?? "5433",
        PGUSER: process.env.PGUSER ?? "postgres",
        PGDATABASE: process.env.PGDATABASE ?? "setda_app",
      },
    },
  );
}
