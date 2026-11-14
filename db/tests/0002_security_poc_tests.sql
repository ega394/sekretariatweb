-- =====================================================================
-- PHASE 3D.4 — SECURITY PROOF-OF-CONCEPT (not an assumption)
-- Proves the DB-enforced public/admin boundary on a REAL PostgreSQL engine.
--
-- Run (after schema + seed + 0002 roles/grants) with:
--   psql -v ON_ERROR_STOP=1 -f db/tests/0002_security_poc_tests.sql
--
-- Method: run as a superuser and SET LOCAL ROLE to simulate each app role,
-- asserting exact privilege outcomes. Negative tests expect SQLSTATE 42501
-- (insufficient_privilege); a sentinel RAISE EXCEPTION fails loudly if a
-- forbidden read is instead allowed.
--
-- NOTE ON SCOPE: this proves the PostgreSQL role + view-owner mechanism,
-- which is identical on Supabase (stock PostgreSQL). The ONLY Supabase-
-- specific item not provable here is whether the Supavisor POOLER accepts a
-- custom LOGIN role — that must be checked on a real Supabase project. See
-- db/security/README.md.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- 1) app_public CAN read the public boundary views ---------------------
DO $$
DECLARE n int;
BEGIN
    SET LOCAL ROLE app_public;
    SELECT count(*) INTO n FROM v_public_holder;
    IF n < 1 THEN RAISE EXCEPTION 'SEC 1 FAIL: app_public sees no rows in v_public_holder'; END IF;
    PERFORM 1 FROM v_public_eligibility LIMIT 1;
    PERFORM 1 FROM v_public_unit LIMIT 1;
    RESET ROLE;
    RAISE NOTICE 'SEC 1 PASS: app_public reads v_public_holder (% rows) + v_public_eligibility + v_public_unit', n;
END $$;

-- 2) app_public is DENIED on base tables -------------------------------
DO $$
DECLARE tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['persons','assignments','verifications','organization_units','positions'] LOOP
        SET LOCAL ROLE app_public;
        BEGIN
            EXECUTE format('SELECT 1 FROM %I LIMIT 1', tbl);
            RESET ROLE;
            RAISE EXCEPTION 'SEC 2 FAIL: app_public was allowed to read base table %', tbl;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
            RAISE NOTICE 'SEC 2 PASS: app_public DENIED on base table %', tbl;
        END;
    END LOOP;
END $$;

-- 3) app_public is DENIED on the ungated fact views (v_current_*) ------
DO $$
DECLARE v text;
BEGIN
    FOREACH v IN ARRAY ARRAY['v_current_holder','v_current_verification'] LOOP
        SET LOCAL ROLE app_public;
        BEGIN
            EXECUTE format('SELECT 1 FROM %I LIMIT 1', v);
            RESET ROLE;
            RAISE EXCEPTION 'SEC 3 FAIL: app_public was allowed to read ungated view %', v;
        EXCEPTION WHEN insufficient_privilege THEN
            RESET ROLE;
            RAISE NOTICE 'SEC 3 PASS: app_public DENIED on ungated view %', v;
        END;
    END LOOP;
END $$;

-- 4) app_public reading v_public_holder returns ONLY public-eligible ---
--    (seed has 3 verified current holders: Wali Kota, Wakil, Sekda)
DO $$
DECLARE n int;
BEGIN
    SET LOCAL ROLE app_public;
    SELECT count(*) INTO n FROM v_public_holder;
    RESET ROLE;
    IF n <> 3 THEN RAISE EXCEPTION 'SEC 4 FAIL: expected 3 public holders from seed, got %', n; END IF;
    RAISE NOTICE 'SEC 4 PASS: v_public_holder exposes exactly the 3 eligible holders';
END $$;

-- 5) app_admin CAN read base tables AND views --------------------------
DO $$
BEGIN
    SET LOCAL ROLE app_admin;
    PERFORM 1 FROM persons LIMIT 1;
    PERFORM 1 FROM v_public_holder LIMIT 1;
    PERFORM 1 FROM v_current_verification LIMIT 1;
    RESET ROLE;
    RAISE NOTICE 'SEC 5 PASS: app_admin reads base tables and views';
END $$;

ROLLBACK;   -- privileges are persistent (from 0002); this run changes no data
