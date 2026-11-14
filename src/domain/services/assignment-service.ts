import "server-only";
import type { Kysely } from "kysely";
import type { AdminDatabase } from "@/db/schema";
import { getAdminDb } from "@/db/admin-client";
import { requirePermission } from "@/rbac/authorization";
import { DomainError, mapPgError } from "@/domain/errors";
import type { Revalidator } from "./verification-service";

export interface CreateAssignmentInput {
  actorUserId: string;
  personId: string;
  positionId: string;
  /** a code from ref_assignment_types (definitif | plt | plh | pj ...) */
  assignmentTypeCode: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  appointmentReference?: string | null;
}

/**
 * Create an assignment. Requires `manage_org_structure`.
 *
 * - The substantive/acting CLASS comes from ref_assignment_types (single source
 *   of truth); the composite FK in the DB guarantees it can never disagree.
 * - Overlap (<=1 substantive, <=1 acting) is enforced by the DB EXCLUDE
 *   constraints; this service only maps the violation to a domain error.
 * - On success the public Pimpinan cache is revalidated so a mutasi shows up
 *   immediately (no stale officeholder).
 */
export async function createAssignment(
  input: CreateAssignmentInput,
  revalidate: Revalidator,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<string> {
  await requirePermission(input.actorUserId, "manage_org_structure");
  try {
    const result = await db.transaction().execute(async (trx) => {
      const type = await trx
        .selectFrom("ref_assignment_types")
        .select("class")
        .where("code", "=", input.assignmentTypeCode)
        .executeTakeFirst();
      if (!type)
        throw new DomainError("Jenis penugasan tidak dikenal.", "unknown_assignment_type");

      const position = await trx
        .selectFrom("positions")
        .select("slug")
        .where("id", "=", input.positionId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!position) throw new DomainError("Jabatan tidak ditemukan.", "unknown_position");

      const row = await trx
        .insertInto("assignments")
        .values({
          person_id: input.personId,
          position_id: input.positionId,
          assignment_type_code: input.assignmentTypeCode,
          assignment_class: type.class,
          assignment_status: "active",
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          appointment_reference: input.appointmentReference ?? null,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return { id: row.id, positionSlug: position.slug };
    });
    await revalidate(["pimpinan", `pimpinan:${result.positionSlug}`]);
    return result.id;
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw mapPgError(err) ?? err;
  }
}

/** End an assignment: it leaves current/public holder but stays in history. */
export async function endAssignment(
  actorUserId: string,
  assignmentId: string,
  endDate: string,
  revalidate: Revalidator,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<void> {
  await requirePermission(actorUserId, "manage_org_structure");
  try {
    const positionSlug = await db.transaction().execute(async (trx) => {
      const found = await trx
        .selectFrom("assignments as a")
        .innerJoin("positions as p", "p.id", "a.position_id")
        .select(["p.slug as slug"])
        .where("a.id", "=", assignmentId)
        .where("a.deleted_at", "is", null)
        .executeTakeFirst();
      if (!found) throw new DomainError("Penugasan tidak ditemukan.", "unknown_assignment");

      await trx
        .updateTable("assignments")
        .set({
          assignment_status: "ended",
          end_date: endDate,
          updated_by: actorUserId,
        })
        .where("id", "=", assignmentId)
        .execute();
      return found.slug;
    });
    await revalidate(["pimpinan", `pimpinan:${positionSlug}`]);
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw mapPgError(err) ?? err;
  }
}
