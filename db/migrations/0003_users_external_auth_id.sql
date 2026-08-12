-- =====================================================================
-- PHASE 3D.4 — MIGRATION 0003: additive users.external_auth_id
-- Maps an external Auth identity (e.g. Supabase Auth JWT `sub`) to our own
-- users row (ADR-3D.3 C12). ADDITIVE column on an existing INFRA table —
-- NOT a new domain table; domain model stays 19 tables.
--
-- Authentication (external id) stays separate from Authorization (our RBAC
-- tables). Swapping the auth provider only changes which value populates
-- this column; it never touches the RBAC model.
--
-- Transaction-agnostic (runner owns the transaction).
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS external_auth_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_auth_id
    ON users (external_auth_id)
    WHERE external_auth_id IS NOT NULL AND deleted_at IS NULL;
