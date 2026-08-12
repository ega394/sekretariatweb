import "server-only";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import type { AdminDatabase } from "./schema";

/**
 * adminDb — used ONLY from authenticated, RBAC-checked server code.
 * Connects as PostgreSQL role `app_admin` (APP_ADMIN_DB_URL): DML on base
 * tables. All writes go through the service layer in a transaction; DB
 * constraints (overlap, exactly-one-target, checks) remain the safety net.
 */
let _adminDb: Kysely<AdminDatabase> | null = null;

export function getAdminDb(): Kysely<AdminDatabase> {
  if (_adminDb) return _adminDb;
  const url = process.env.APP_ADMIN_DB_URL;
  if (!url) throw new Error("APP_ADMIN_DB_URL is not set");
  _adminDb = new Kysely<AdminDatabase>({
    dialect: new PostgresJSDialect({
      postgres: postgres(url, { prepare: false, max: 5 }),
    }),
  });
  return _adminDb;
}
