import "server-only";
import { getAdminDb } from "@/db/admin-client";

/**
 * Admin read models (authenticated, RBAC-gated callers only).
 * These read FACT views (v_current_*) and base tables — never exposed publicly.
 * "Public status" comes from v_public_holder (the LOCKED resolver); it is never
 * recomputed here.
 */

/** DATE columns arrive as JS Date (UTC midnight) from postgres.js; render as YYYY-MM-DD. */
function toDateString(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

export interface PositionOverview {
  position_id: string;
  position_title: string;
  position_slug: string;
  unit_name: string;
  current_assignment_id: string | null;
  current_person: string | null;
  current_type: string | null;
  current_verification: string | null;
  is_publicly_shown: boolean;
}

export async function listPositionsOverview(): Promise<PositionOverview[]> {
  const rows = await getAdminDb()
    .selectFrom("positions as p")
    .innerJoin("organization_units as u", "u.id", "p.organization_unit_id")
    .leftJoin("v_current_holder as ch", "ch.position_id", "p.id")
    .leftJoin("persons as cp", "cp.id", "ch.person_id")
    .leftJoin("v_public_holder as ph", "ph.position_id", "p.id")
    .leftJoin("v_current_verification as cv", (join) =>
      join
        .onRef("cv.entity_id", "=", "ch.assignment_id")
        .on("cv.entity_type", "=", "assignment"),
    )
    .select([
      "p.id as position_id",
      "p.title as position_title",
      "p.slug as position_slug",
      "u.name as unit_name",
      "ch.assignment_id as current_assignment_id",
      "cp.full_name as current_person",
      "ch.assignment_type_code as current_type",
      "cv.status as current_verification",
      "ph.assignment_id as public_assignment_id",
    ])
    .where("p.deleted_at", "is", null)
    .orderBy("u.name")
    .orderBy("p.title")
    .execute();

  return rows.map((r) => ({
    position_id: r.position_id,
    position_title: r.position_title,
    position_slug: r.position_slug,
    unit_name: r.unit_name,
    current_assignment_id: r.current_assignment_id,
    current_person: r.current_person,
    current_type: r.current_type,
    current_verification: r.current_verification,
    is_publicly_shown: r.public_assignment_id !== null,
  }));
}

export interface AssignmentRow {
  id: string;
  person_name: string;
  position_title: string;
  assignment_type_code: string;
  assignment_status: string;
  start_date: string;
  end_date: string | null;
  verification: string | null;
}

export async function listAssignments(limit = 100): Promise<AssignmentRow[]> {
  const rows = await getAdminDb()
    .selectFrom("assignments as a")
    .innerJoin("persons as per", "per.id", "a.person_id")
    .innerJoin("positions as pos", "pos.id", "a.position_id")
    .leftJoin("v_current_verification as cv", (join) =>
      join
        .onRef("cv.entity_id", "=", "a.id")
        .on("cv.entity_type", "=", "assignment"),
    )
    .select([
      "a.id as id",
      "per.full_name as person_name",
      "pos.title as position_title",
      "a.assignment_type_code as assignment_type_code",
      "a.assignment_status as assignment_status",
      "a.start_date as start_date",
      "a.end_date as end_date",
      "cv.status as verification",
    ])
    .where("a.deleted_at", "is", null)
    .orderBy("a.start_date", "desc")
    .limit(limit)
    .execute();
  return rows.map((r) => ({
    ...r,
    start_date: toDateString(r.start_date),
    end_date: r.end_date ? toDateString(r.end_date) : null,
  }));
}

export interface PersonRow {
  id: string;
  full_name: string;
  verification: string | null;
}

export async function listPersons(): Promise<PersonRow[]> {
  return getAdminDb()
    .selectFrom("persons as p")
    .leftJoin("v_current_verification as cv", (join) =>
      join.onRef("cv.entity_id", "=", "p.id").on("cv.entity_type", "=", "person"),
    )
    .select(["p.id as id", "p.full_name as full_name", "cv.status as verification"])
    .where("p.deleted_at", "is", null)
    .orderBy("p.full_name")
    .execute();
}

export interface UnitRow {
  id: string;
  name: string;
  verification: string | null;
}

export async function listUnits(): Promise<UnitRow[]> {
  return getAdminDb()
    .selectFrom("organization_units as u")
    .leftJoin("v_current_verification as cv", (join) =>
      join
        .onRef("cv.entity_id", "=", "u.id")
        .on("cv.entity_type", "=", "organization_unit"),
    )
    .select(["u.id as id", "u.name as name", "cv.status as verification"])
    .where("u.deleted_at", "is", null)
    .orderBy("u.name")
    .execute();
}
