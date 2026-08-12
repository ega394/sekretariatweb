import "server-only";
import type { Kysely } from "kysely";
import type { AdminDatabase } from "@/db/schema";
import { getAdminDb } from "@/db/admin-client";
import { requirePermission } from "@/rbac/authorization";
import { mapPgError } from "@/domain/errors";
import type { Revalidator } from "./verification-service";

export interface CreateAssignmentInput {
  actorUserId: string;
  personId: string;
  positionId: string;
  positionSlug: string; // for cache tagging only
  assignmentTypeCode: string;
  assignmentClass: "substantive" | "acting";
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  appointmentReference?: string | null;
}

/**
 * Create an assignment. Requires `manage_org_structure`. The DB EXCLUDE
 * constraints enforce the overlap rule (≤1 substantive, ≤1 acting) — this
 * service does NOT re-implement overlap; it catches the violation and maps it
 * to a domain error. On success it revalidates the public Pimpinan cache so a
 * mutasi is reflected immediately (no stale officeholder).
 */
export async function createAssignment(
  input: CreateAssignmentInput,
  revalidate: Revalidator,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<string> {
  await requirePermission(input.actorUserId, "manage_org_structure");
  try {
    const row = await db.transaction().execute(async (trx) =>
      trx
        .insertInto("assignments")
        .values({
          person_id: input.personId,
          position_id: input.positionId,
          assignment_type_code: input.assignmentTypeCode,
          assignment_class: input.assignmentClass,
          assignment_status: "active",
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          appointment_reference: input.appointmentReference ?? null,
        })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    await revalidate(["pimpinan", `pimpinan:${input.positionSlug}`]);
    return row.id;
  } catch (err) {
    const mapped = mapPgError(err);
    throw mapped ?? err;
  }
}

/** End an assignment (drops it from current/public holder). Requires the same permission. */
export async function endAssignment(
  actorUserId: string,
  assignmentId: string,
  positionSlug: string,
  endDate: string,
  revalidate: Revalidator,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<void> {
  await requirePermission(actorUserId, "manage_org_structure");
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("assignments")
      .set({ assignment_status: "ended", end_date: endDate })
      .where("id", "=", assignmentId)
      .execute();
  });
  await revalidate(["pimpinan", `pimpinan:${positionSlug}`]);
}
