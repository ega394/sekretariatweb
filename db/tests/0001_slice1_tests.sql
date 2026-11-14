-- =====================================================================
-- PHASE 3D.1 — TEST SLICE-1 (PIMPINAN)
-- Proves the LOCKED Phase 3C resolver/eligibility rules against a real DB.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f db/tests/0001_slice1_tests.sql
-- Requires the schema migration + seed to be loaded first.
--
-- Everything runs inside ONE transaction and ROLLBACKs at the end, so the
-- seeded database is left untouched. Negative (must-fail) tests use nested
-- BEGIN/EXCEPTION sub-blocks (savepoints) so a rejected write does not
-- abort the whole run. A sentinel RAISE EXCEPTION (SQLSTATE P0001) fails
-- loudly if a write that MUST be rejected is instead accepted.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------
-- Shared fixtures (all rolled back). Prefix f… ; all UUIDs valid hex.
-- A verified test unit under the (verified) Setda node hosts test positions.
-- ---------------------------------------------------------------------
INSERT INTO organization_units (id, parent_unit_id, unit_type_code, name, slug)
VALUES ('fa000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000003', 'bagian', 'Bagian Uji', 'bagian-uji');
INSERT INTO verifications (status, source_type, source_reference, organization_unit_id)
VALUES ('verified','sk','fixture', 'fa000000-0000-0000-0000-00000000a001');

INSERT INTO positions (id, organization_unit_id, title, slug, position_type_code) VALUES
    ('fb000000-0000-0000-0000-00000000b001','fa000000-0000-0000-0000-00000000a001','Pos A','pos-a','kepala_bagian'),
    ('fb000000-0000-0000-0000-00000000b002','fa000000-0000-0000-0000-00000000a001','Pos Overlap','pos-ov','kepala_bagian'),
    ('fb000000-0000-0000-0000-00000000b003','fa000000-0000-0000-0000-00000000a001','Pos Acting','pos-act','kepala_bagian'),
    ('fb000000-0000-0000-0000-00000000b004','fa000000-0000-0000-0000-00000000a001','Pos Ended','pos-ended','kepala_bagian');
INSERT INTO verifications (status, source_type, source_reference, position_id) VALUES
    ('verified','sk','fixture','fb000000-0000-0000-0000-00000000b001'),
    ('verified','sk','fixture','fb000000-0000-0000-0000-00000000b002'),
    ('verified','sk','fixture','fb000000-0000-0000-0000-00000000b003'),
    ('verified','sk','fixture','fb000000-0000-0000-0000-00000000b004');

INSERT INTO persons (id, full_name, slug) VALUES
    ('fc000000-0000-0000-0000-00000000c001','Uji Verified','uji-verified'),
    ('fc000000-0000-0000-0000-00000000c002','Uji Unverified','uji-unverified'),
    ('fc000000-0000-0000-0000-00000000c003','Uji Substantive','uji-substantive'),
    ('fc000000-0000-0000-0000-00000000c004','Uji Acting','uji-acting');
-- verify all EXCEPT c002 (kept unverified on purpose)
INSERT INTO verifications (status, source_type, source_reference, person_id) VALUES
    ('verified','sk','fixture','fc000000-0000-0000-0000-00000000c001'),
    ('verified','sk','fixture','fc000000-0000-0000-0000-00000000c003'),
    ('verified','sk','fixture','fc000000-0000-0000-0000-00000000c004');

-- =====================================================================
-- TEST 1 — verified + current -> public   (seed: Sekda / Abdul Azis Hasan)
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM v_public_holder
        WHERE position_id = '20000000-0000-0000-0000-000000000003'
          AND person_id   = '30000000-0000-0000-0000-000000000003'
    ) THEN RAISE EXCEPTION 'TEST 1 FAILED: verified+current Sekda not in v_public_holder'; END IF;
    RAISE NOTICE 'TEST 1 PASS: verified + current -> PUBLIC_HOLDER shows Abdul Azis Hasan';
END $$;

-- =====================================================================
-- TEST 2 — unverified person -> not public
-- =====================================================================
DO $$
BEGIN
    INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fd000000-0000-0000-0000-00000000d002','fc000000-0000-0000-0000-00000000c002',
            'fb000000-0000-0000-0000-00000000b001','definitif','substantive', current_date - 10);
    INSERT INTO verifications (status, source_type, source_reference, assignment_id)
    VALUES ('verified','sk','fixture','fd000000-0000-0000-0000-00000000d002');

    IF (SELECT is_public FROM v_public_person WHERE id='fc000000-0000-0000-0000-00000000c002') THEN
        RAISE EXCEPTION 'TEST 2 FAILED: unverified person reported public'; END IF;
    IF EXISTS (SELECT 1 FROM v_public_holder WHERE position_id='fb000000-0000-0000-0000-00000000b001') THEN
        RAISE EXCEPTION 'TEST 2 FAILED: PUBLIC_HOLDER present despite unverified person'; END IF;
    RAISE NOTICE 'TEST 2 PASS: unverified person -> not public, no PUBLIC_HOLDER';
END $$;

-- =====================================================================
-- TEST 3 — assignment expired -> not current
-- =====================================================================
DO $$
BEGIN
    INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, assignment_status, start_date, end_date)
    VALUES ('fd000000-0000-0000-0000-00000000d003','fc000000-0000-0000-0000-00000000c001',
            'fb000000-0000-0000-0000-00000000b004','definitif','substantive','active',
            current_date - 100, current_date - 1);
    IF EXISTS (SELECT 1 FROM v_current_holder WHERE assignment_id='fd000000-0000-0000-0000-00000000d003') THEN
        RAISE EXCEPTION 'TEST 3 FAILED: expired assignment still current'; END IF;
    RAISE NOTICE 'TEST 3 PASS: expired assignment -> not CURRENT_HOLDER';
END $$;

-- =====================================================================
-- TEST 4 — person stays verified after assignment ended
-- =====================================================================
DO $$
BEGIN
    IF NOT (SELECT is_public FROM v_public_person WHERE id='fc000000-0000-0000-0000-00000000c001') THEN
        RAISE EXCEPTION 'TEST 4 FAILED: person lost verification after assignment ended'; END IF;
    IF EXISTS (SELECT 1 FROM v_public_holder WHERE person_id='fc000000-0000-0000-0000-00000000c001') THEN
        RAISE EXCEPTION 'TEST 4 FAILED: ended assignment still yields a PUBLIC_HOLDER'; END IF;
    RAISE NOTICE 'TEST 4 PASS: person still verified after assignment ended (identity != tenure)';
END $$;

-- =====================================================================
-- TEST 5 — two SUBSTANTIVE overlap -> rejected by DB
-- =====================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
        VALUES ('fc000000-0000-0000-0000-00000000c003','fb000000-0000-0000-0000-00000000b002','definitif','substantive', current_date - 5);
        INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
        VALUES ('fc000000-0000-0000-0000-00000000c004','fb000000-0000-0000-0000-00000000b002','definitif','substantive', current_date - 3);
        RAISE EXCEPTION 'TEST 5 FAILED: two active substantive overlaps were ACCEPTED';
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE NOTICE 'TEST 5 PASS: second active substantive overlap rejected by DB';
    END;
END $$;

-- =====================================================================
-- TEST 6 — two ACTING overlap -> rejected by DB
-- =====================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
        VALUES ('fc000000-0000-0000-0000-00000000c003','fb000000-0000-0000-0000-00000000b002','plt','acting', current_date - 5);
        INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
        VALUES ('fc000000-0000-0000-0000-00000000c004','fb000000-0000-0000-0000-00000000b002','plh','acting', current_date - 3);
        RAISE EXCEPTION 'TEST 6 FAILED: two active acting overlaps were ACCEPTED';
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE NOTICE 'TEST 6 PASS: second active acting overlap rejected by DB';
    END;
END $$;

-- =====================================================================
-- TEST 7 — ACTING + SUBSTANTIVE overlap -> ALLOWED
-- =====================================================================
DO $$
DECLARE n int;
BEGIN
    INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fc000000-0000-0000-0000-00000000c003','fb000000-0000-0000-0000-00000000b002','definitif','substantive', current_date - 5);
    INSERT INTO assignments (person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fc000000-0000-0000-0000-00000000c004','fb000000-0000-0000-0000-00000000b002','plt','acting', current_date - 3);
    SELECT count(*) INTO n FROM assignments
        WHERE position_id='fb000000-0000-0000-0000-00000000b002' AND assignment_status='active';
    IF n <> 2 THEN RAISE EXCEPTION 'TEST 7 FAILED: acting+substantive overlap not both present (got %)', n; END IF;
    RAISE NOTICE 'TEST 7 PASS: acting may overlap substantive (both active accepted)';
END $$;

-- =====================================================================
-- TEST 8 — acting is current but UNVERIFIED -> no PUBLIC_HOLDER,
--          and NO fallback to the (verified) substantive.
-- =====================================================================
DO $$
DECLARE holder uuid;
BEGIN
    INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fd000000-0000-0000-0000-00000000d8a0','fc000000-0000-0000-0000-00000000c003',
            'fb000000-0000-0000-0000-00000000b003','definitif','substantive', current_date - 100);
    INSERT INTO verifications (status, source_type, source_reference, assignment_id)
    VALUES ('verified','sk','fixture','fd000000-0000-0000-0000-00000000d8a0');
    -- acting: UNVERIFIED assignment, starts later -> current holder
    INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fd000000-0000-0000-0000-00000000d8b0','fc000000-0000-0000-0000-00000000c004',
            'fb000000-0000-0000-0000-00000000b003','plt','acting', current_date - 5);

    SELECT person_id INTO holder FROM v_current_holder WHERE position_id='fb000000-0000-0000-0000-00000000b003';
    IF holder IS DISTINCT FROM 'fc000000-0000-0000-0000-00000000c004' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: current holder is not the acting person (got %)', holder; END IF;
    IF EXISTS (SELECT 1 FROM v_public_holder WHERE position_id='fb000000-0000-0000-0000-00000000b003') THEN
        RAISE EXCEPTION 'TEST 8 FAILED: PUBLIC_HOLDER present / fell back to substantive'; END IF;
    RAISE NOTICE 'TEST 8 PASS: acting current but unverified -> no PUBLIC_HOLDER, no fallback';
END $$;

-- =====================================================================
-- TEST 9 — parent unit UNVERIFIED -> child not public
-- =====================================================================
DO $$
BEGIN
    INSERT INTO organization_units (id, parent_unit_id, unit_type_code, name, slug)
    VALUES ('fe000000-0000-0000-0000-00000000e9a0','10000000-0000-0000-0000-000000000001','asisten','Parent Unverified','parent-unverified');
    INSERT INTO organization_units (id, parent_unit_id, unit_type_code, name, slug)
    VALUES ('fe000000-0000-0000-0000-00000000e9b0','fe000000-0000-0000-0000-00000000e9a0','bagian','Child Verified','child-verified');
    INSERT INTO verifications (status, source_type, source_reference, organization_unit_id)
    VALUES ('verified','sk','fixture','fe000000-0000-0000-0000-00000000e9b0');  -- child verified, parent NOT

    IF (SELECT is_public FROM v_public_unit WHERE id='fe000000-0000-0000-0000-00000000e9b0') THEN
        RAISE EXCEPTION 'TEST 9 FAILED: child public despite unverified parent'; END IF;
    RAISE NOTICE 'TEST 9 PASS: unverified parent -> child not public (cascading chain works)';
END $$;

-- =====================================================================
-- TEST 10 — full dependency chain verified -> PUBLIC_HOLDER appears
-- =====================================================================
DO $$
BEGIN
    INSERT INTO organization_units (id, parent_unit_id, unit_type_code, name, slug)
    VALUES ('fe000000-0000-0000-0000-00000000ea00','10000000-0000-0000-0000-000000000003','bagian','Bagian Chain','bagian-chain');
    INSERT INTO verifications (status, source_type, source_reference, organization_unit_id)
    VALUES ('verified','sk','fixture','fe000000-0000-0000-0000-00000000ea00');
    INSERT INTO positions (id, organization_unit_id, title, slug, position_type_code)
    VALUES ('fb000000-0000-0000-0000-00000000ba00','fe000000-0000-0000-0000-00000000ea00','Kabag Chain','kabag-chain','kepala_bagian');
    INSERT INTO verifications (status, source_type, source_reference, position_id)
    VALUES ('verified','sk','fixture','fb000000-0000-0000-0000-00000000ba00');
    INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, start_date)
    VALUES ('fd000000-0000-0000-0000-00000000da00','fc000000-0000-0000-0000-00000000c001',
            'fb000000-0000-0000-0000-00000000ba00','definitif','substantive', current_date - 30);
    INSERT INTO verifications (status, source_type, source_reference, assignment_id)
    VALUES ('verified','sk','fixture','fd000000-0000-0000-0000-00000000da00');

    IF NOT EXISTS (
        SELECT 1 FROM v_public_holder
        WHERE position_id='fb000000-0000-0000-0000-00000000ba00'
          AND person_id  ='fc000000-0000-0000-0000-00000000c001') THEN
        RAISE EXCEPTION 'TEST 10 FAILED: full verified chain did not yield PUBLIC_HOLDER'; END IF;
    RAISE NOTICE 'TEST 10 PASS: full dependency chain verified -> PUBLIC_HOLDER appears';
END $$;

-- ---------------------------------------------------------------------
-- BONUS — RBAC proves Publish != Verify at the data layer
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_code='verifier' AND permission_code='write_verification') THEN
        RAISE EXCEPTION 'RBAC FAILED: verifier lacks write_verification'; END IF;
    IF EXISTS (SELECT 1 FROM role_permissions WHERE role_code='publisher' AND permission_code='write_verification') THEN
        RAISE EXCEPTION 'RBAC FAILED: publisher must NOT hold write_verification'; END IF;
    RAISE NOTICE 'BONUS PASS: Publish != Verify (verifier verifies; publisher cannot)';
END $$;

ROLLBACK;   -- leave the seeded DB pristine
