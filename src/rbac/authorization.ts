import "server-only";
import { sql } from "kysely";
import { getAdminDb } from "@/db/admin-client";

/**
 * Authorization service — reads the LOCKED RBAC tables (Phase 3D.1) as the
 * single source of truth for permissions. Authentication (who the user is) is
 * handled separately by the Identity port (src/auth). Authorization ≠
 * Authentication; Publish ≠ Verify (they are distinct permissions here).
 */
export type Permission = "manage_org_structure" | "write_verification";

/** Does this user hold `permission` (optionally within a unit subtree)? */
export async function can(
  userId: string,
  permission: Permission,
  opts?: { unitScope?: string },
): Promise<boolean> {
  const db = getAdminDb();

  const grant = await db
    .selectFrom("user_roles as ur")
    .innerJoin("role_permissions as rp", "rp.role_code", "ur.role_code")
    .select(["ur.role_code", "ur.scope_unit_id"])
    .where("ur.user_id", "=", userId)
    .where("rp.permission_code", "=", permission)
    .execute();

  if (grant.length === 0) return false;
  if (!opts?.unitScope) return true;

  // Unit-scoped: a grant with no scope is global; a scoped grant must contain
  // the target unit within its org subtree (fn_org_subtree, Phase 3D.1).
  for (const g of grant) {
    if (g.scope_unit_id == null) return true;
    const inScope = await db
      .selectFrom(
        sql<{ id: string }>`fn_org_subtree(${g.scope_unit_id}::uuid)`.as("t"),
      )
      .select("t.id")
      .where("t.id", "=", opts.unitScope)
      .executeTakeFirst();
    if (inScope) return true;
  }
  return false;
}

export class AuthorizationError extends Error {
  constructor(permission: string) {
    super(`Not authorized: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export async function requirePermission(
  userId: string,
  permission: Permission,
  opts?: { unitScope?: string },
): Promise<void> {
  if (!(await can(userId, permission, opts)))
    throw new AuthorizationError(permission);
}
