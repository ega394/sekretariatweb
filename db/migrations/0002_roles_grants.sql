-- =====================================================================
-- PHASE 3D.4 — MIGRATION 0002: least-privilege application roles + grants
-- Realizes the DB-enforced public/admin boundary (ADR-3D.3 A2/C15).
--
-- Transaction-agnostic (runner owns the transaction).
--
-- SECURITY MODEL:
--   app_public : SELECT on the v_public_* views the app queries directly.
--                NO access to base tables or the ungated v_current_* views.
--                Views run with owner (postgres) privileges (security_invoker
--                OFF), so app_public reads eligible rows WITHOUT any base-table
--                grant -> a public-code mistake cannot reach internal data.
--   app_admin  : DML on base tables + read on all views, behind Auth + RBAC.
--
-- NOTE: roles are created NOLOGIN here so the POC can prove privileges via
--   SET ROLE. In dev/staging/production these become LOGIN roles with
--   passwords (the app connects as them). On Supabase, whether the Supavisor
--   pooler accepts a custom LOGIN role must be verified on a real project
--   (see db/security/README — POC proves the PostgreSQL mechanism only).
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_public') THEN
        CREATE ROLE app_public NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin NOLOGIN;
    END IF;
END $$;

-- Schema usage (needed to resolve object names); NOT table privileges.
GRANT USAGE ON SCHEMA public TO app_public, app_admin;

-- --- app_public: ONLY the public read boundary -----------------------
-- Exactly the views the public surface queries directly (Slice-1 + struktur).
GRANT SELECT ON
    v_public_holder,
    v_public_eligibility,
    v_public_unit
TO app_public;
-- (No grant on base tables, on v_current_holder, or on v_current_verification.)

-- --- app_admin: base tables (DML) + all views (read) -----------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- Future objects created by the migration owner inherit these grants, so new
-- tables/views do not silently become readable by app_public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO app_admin;
-- Intentionally NO default privilege for app_public: every public view must be
-- granted explicitly, one at a time, so nothing is exposed by accident.
