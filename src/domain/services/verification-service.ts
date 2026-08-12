import "server-only";
import type { Kysely } from "kysely";
import type { AdminDatabase } from "@/db/schema";
import { getAdminDb } from "@/db/admin-client";
import { requirePermission } from "@/rbac/authorization";
import { mapPgError } from "@/domain/errors";

export type Revalidator = (tags: string[]) => void | Promise<void>;

type VerificationTarget =
  | { kind: "person"; id: string }
  | { kind: "organization_unit"; id: string }
  | { kind: "position"; id: string }
  | { kind: "assignment"; id: string };

export interface RecordVerificationInput {
  actorUserId: string;
  target: VerificationTarget;
  status: AdminDatabase["verifications"]["status"];
  sourceType: AdminDatabase["verifications"]["source_type"];
  sourceReference?: string;
}

/**
 * Record an institutional/legal verification.
 * Requires the `write_verification` permission (held by `verifier`, NOT by
 * `publisher` — Publish ≠ Verify). Eligibility recomputation is the DB's job;
 * a successful write revalidates the public Pimpinan cache.
 */
export async function recordVerification(
  input: RecordVerificationInput,
  revalidate: Revalidator,
  db: Kysely<AdminDatabase> = getAdminDb(),
): Promise<string> {
  await requirePermission(input.actorUserId, "write_verification");

  const targetCols = {
    person_id: input.target.kind === "person" ? input.target.id : null,
    organization_unit_id:
      input.target.kind === "organization_unit" ? input.target.id : null,
    position_id: input.target.kind === "position" ? input.target.id : null,
    assignment_id: input.target.kind === "assignment" ? input.target.id : null,
  };

  try {
    const row = await db.transaction().execute(async (trx) =>
      trx
        .insertInto("verifications")
        .values({
          status: input.status,
          source_type: input.sourceType,
          source_reference: input.sourceReference ?? null,
          created_by: input.actorUserId,
          verified_by:
            input.status === "verified" ? input.actorUserId : null,
          ...targetCols,
        })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    await revalidate(["pimpinan"]);
    return row.id;
  } catch (err) {
    const mapped = mapPgError(err);
    throw mapped ?? err;
  }
}
