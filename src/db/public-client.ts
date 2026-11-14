import "server-only";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import type { PublicDatabase } from "./schema";

/**
 * publicDb — the ONLY database handle the public surface may use.
 *
 * - Connects as PostgreSQL role `app_public` (APP_PUBLIC_DB_URL), which has
 *   SELECT on the v_public_* views only. A bug here cannot read base tables
 *   (proven in db/tests/0002_security_poc_tests.sql).
 * - Typed to `PublicDatabase` (views only) so base-table reads are not even
 *   expressible.
 * - `prepare: false` keeps it compatible with the Supabase Supavisor pooler
 *   (transaction mode) when deployed serverless.
 */
let _publicDb: Kysely<PublicDatabase> | null = null;

export function getPublicDb(): Kysely<PublicDatabase> {
  if (_publicDb) return _publicDb;
  const url = process.env.APP_PUBLIC_DB_URL;
  if (!url) throw new Error("APP_PUBLIC_DB_URL is not set");
  _publicDb = new Kysely<PublicDatabase>({
    dialect: new PostgresJSDialect({
      postgres: postgres(url, { prepare: false, max: 5 }),
    }),
  });
  return _publicDb;
}
