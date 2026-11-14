import "server-only";
import type { Kysely } from "kysely";
import type { AdminDatabase } from "@/db/schema";
import { getAdminDb } from "@/db/admin-client";
import { requirePermission } from "@/rbac/authorization";
import { mapPgError } from "@/domain/errors";
import { slugify } from "@/domain/slug";

export interface CreatePersonInput {
  actorUserId: string;
  fullName: string;
  displayName?: string | null;
  honorificPrefix?: string | null;
  honorificSuffix?: string | null;
}

/**
 * Create a person (identity only — no position, no currentness).
 * A new person has no verification, so by default they are NOT public
 * (NEEDS_VERIFICATION) until a verifier records a verification.
 */
export async function createPerson(
  input: CreatePersonInput,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<{ id: string; slug: string }> {
  await requirePermission(input.actorUserId, "manage_org_structure");
  const base = slugify(input.fullName);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const row = await db
        .insertInto("persons")
        .values({
          full_name: input.fullName,
          display_name: input.displayName ?? null,
          honorific_prefix: input.honorificPrefix ?? null,
          honorific_suffix: input.honorificSuffix ?? null,
          slug,
          created_by: input.actorUserId,
        })
        .returning(["id", "slug"])
        .executeTakeFirstOrThrow();
      return row;
    } catch (err) {
      const mapped = mapPgError(err);
      if (mapped?.code === "unique_violation" && attempt < 3) continue; // slug taken
      throw mapped ?? err;
    }
  }
  throw new Error("unreachable");
}
