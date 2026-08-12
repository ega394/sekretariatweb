import { execSync } from "node:child_process";

/**
 * Provisions a fresh `setda_test` database (all migrations + seed + dev login
 * roles) and adds RBAC test users (a verifier and a publisher). Teardown drops
 * the database. Uses libpq env vars; defaults to the local TCP instance.
 */
const DB = "setda_test";

function pgEnv() {
  return {
    ...process.env,
    PGHOST: process.env.PGHOST ?? "127.0.0.1",
    PGPORT: process.env.PGPORT ?? "5433",
    PGUSER: process.env.PGUSER ?? "postgres",
    PGDATABASE: DB,
  };
}

export const VERIFIER_USER = "00000000-0000-0000-0000-0000000000a1";
export const PUBLISHER_USER = "00000000-0000-0000-0000-0000000000a2";

export async function setup() {
  const env = pgEnv();
  execSync("bash db/reset-dev.sh", { env, stdio: "inherit" });

  const sql = `
    INSERT INTO users (id, username) VALUES
      ('${VERIFIER_USER}', 'verifier1'),
      ('${PUBLISHER_USER}', 'publisher1');
    INSERT INTO user_roles (user_id, role_code) VALUES
      ('${VERIFIER_USER}', 'verifier'),
      ('${PUBLISHER_USER}', 'publisher');
  `;
  // pass SQL via stdin to avoid shell/psql quoting pitfalls
  execSync("psql -v ON_ERROR_STOP=1 -f -", {
    env,
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

export async function teardown() {
  const env = { ...pgEnv(), PGDATABASE: "postgres" };
  execSync(`psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB};"`, {
    env,
    stdio: "inherit",
  });
}
