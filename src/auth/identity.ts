import "server-only";
import { sql } from "kysely";
import { getAdminDb } from "@/db/admin-client";

/**
 * Identity port (Authentication) — kept separate from Authorization (RBAC).
 *
 * The application depends on this port, NOT on Supabase specifics. Swapping the
 * provider (Supabase Auth ⇄ OIDC / SSO Pemkot / local) only changes the adapter
 * that produces an { externalId }. Authorization always comes from our own
 * `users` + RBAC tables (Phase 3D.1), mapped via `users.external_auth_id`
 * (migration 0003).
 */
export interface ExternalIdentity {
  externalId: string;
  email?: string | null;
}

export interface IdentityProvider {
  /** Resolve the caller's external identity from the request, or null. */
  getIdentity(request: Request): Promise<ExternalIdentity | null>;
}

/**
 * Default MVP provider = Supabase Auth. Structural adapter: it reads the
 * bearer JWT and returns the subject. Real cryptographic verification against
 * SUPABASE_JWT_SECRET is wired when a Supabase project exists (dev/pilot);
 * until then this is not exercised — RBAC/services are tested directly with a
 * known internal user id. See ADR-3D.3 C11.
 */
export class SupabaseIdentityProvider implements IdentityProvider {
  async getIdentity(request: Request): Promise<ExternalIdentity | null> {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    // TODO(dev/pilot): verify JWT signature with SUPABASE_JWT_SECRET (jose)
    // before trusting `sub`. Left unverified here on purpose (no live project).
    return null;
  }
}

/** Map an external identity to our internal users.id (Authorization anchor). */
export async function mapIdentityToUser(
  externalId: string,
): Promise<string | null> {
  const row = await getAdminDb()
    .selectFrom(
      sql<{ id: string }>`(
        SELECT id FROM users
        WHERE external_auth_id = ${externalId} AND deleted_at IS NULL
        LIMIT 1
      )`.as("u"),
    )
    .select("u.id")
    .executeTakeFirst();
  return row?.id ?? null;
}
