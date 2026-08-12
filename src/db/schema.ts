/**
 * Kysely type interfaces — DERIVED FROM the PostgreSQL schema (Phase 3D.1 +
 * migrations 0002/0004). These types describe existing tables/views; they do
 * NOT define or own the schema (SQL-first, ADR-3D.3 B5). In a fuller setup
 * these would be produced by kysely-codegen against the live database.
 *
 * The public and admin databases are typed SEPARATELY so the public client
 * literally cannot express a base-table read — the boundary is enforced at the
 * type level as well as by the app_public DB role.
 */
import type { Generated } from "kysely";

// ---- Public views (the ONLY relations the public surface may read) --------
export interface VPublicPimpinan {
  position_id: string;
  position_slug: string;
  position_title: string;
  position_type_code: string;
  unit_slug: string;
  unit_name: string;
  person_id: string;
  person_display_name: string | null;
  person_full_name: string;
  assignment_id: string;
  assignment_class: "substantive" | "acting";
  assignment_type_code: string;
}

export interface PublicDatabase {
  v_public_pimpinan: VPublicPimpinan;
}

// ---- Admin-visible base tables (subset needed for Slice-1 write paths) ----
export interface AssignmentsTable {
  id: Generated<string>;
  person_id: string;
  position_id: string;
  assignment_type_code: string;
  assignment_class: "substantive" | "acting";
  assignment_status: "active" | "ended" | "revoked";
  start_date: string;
  end_date: string | null;
  appointment_reference: string | null;
}

export interface VerificationsTable {
  id: Generated<string>;
  status: "needs_verification" | "verified" | "expired" | "rejected";
  source_type: "perwali" | "sk" | "portal_resmi" | "media" | "lainnya";
  source_reference: string | null;
  person_id: string | null;
  organization_unit_id: string | null;
  position_id: string | null;
  assignment_id: string | null;
  created_by: string | null;
  verified_by: string | null;
}

export interface RolePermissionsTable {
  role_code: string;
  permission_code: string;
}

export interface UserRolesTable {
  user_id: string;
  role_code: string;
  scope_unit_id: string | null;
}

export interface AdminDatabase {
  assignments: AssignmentsTable;
  verifications: VerificationsTable;
  role_permissions: RolePermissionsTable;
  user_roles: UserRolesTable;
  // read models (admin may also read the fact + public views)
  v_public_pimpinan: VPublicPimpinan;
}
