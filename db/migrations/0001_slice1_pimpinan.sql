-- =====================================================================
-- PHASE 3D.1 — DDL SLICE-1 (PIMPINAN)
-- Portal Resmi Sekretariat Daerah Kota Tarakan (setda.tarakankota.go.id)
--
-- Scope  : /pimpinan  and  /pimpinan/:position-slug
-- Domain : organization_units, positions, persons, assignments, verifications
-- Infra  : users, roles, permissions, role_permissions, user_roles
--
-- Implements the LOCKED Phase 3C model + relevant Phase 3D physical spec.
-- Deliberately does NOT create Agenda/News/Announcement/Document/Media/
-- SitePage/ExternalChannel. See 3D.1-FINDINGS at bottom for physical
-- decisions that diverged from the on-paper 3D spec.
--
-- Target: PostgreSQL 16+
--
-- TRANSACTION POLICY: this file is transaction-AGNOSTIC — it contains no
-- BEGIN/COMMIT. The runner owns the transaction boundary (psql
-- --single-transaction, a migration tool, or CI), so the same file runs
-- identically everywhere. (Approved 3D.1 portability fix.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
-- btree_gist: required so the EXCLUDE constraint can combine
--   (position_id WITH =)  and  (daterange WITH &&)  in one GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- gen_random_uuid() is in PostgreSQL core since v13; no extension needed.
-- (FINDING-5: UUIDv4 via gen_random_uuid() chosen for Slice-1; UUIDv7 deferred.)

-- ---------------------------------------------------------------------
-- 1. NATIVE ENUMS  (stable technical vocabularies only)
-- ---------------------------------------------------------------------
CREATE TYPE verification_status      AS ENUM ('needs_verification','verified','expired','rejected');
CREATE TYPE verification_source_type AS ENUM ('perwali','sk','portal_resmi','media','lainnya');
CREATE TYPE assignment_status        AS ENUM ('active','ended','revoked');
CREATE TYPE assignment_class         AS ENUM ('substantive','acting');

-- ---------------------------------------------------------------------
-- 2. REFERENCE TABLES  (institutional nomenclature = PROPOSED, data-driven)
--    Not native ENUM on purpose: post-verification corrections are INSERTs,
--    never ALTER TYPE. (Phase 3D butir 1 decision.)
-- ---------------------------------------------------------------------
CREATE TABLE ref_unit_types (
    code        text PRIMARY KEY,
    label       text NOT NULL,
    sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE ref_position_types (
    code        text PRIMARY KEY,
    label       text NOT NULL,
    sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE ref_assignment_types (
    code        text PRIMARY KEY,
    label       text NOT NULL,
    class       assignment_class NOT NULL,
    sort_order  int  NOT NULL DEFAULT 0,
    -- Enables the COMPOSITE FK from assignments so that assignment_class
    -- can NEVER contradict the type's class, natively (FINDING-1).
    UNIQUE (code, class)
);

-- ---------------------------------------------------------------------
-- 3. INFRASTRUCTURE: USERS / RBAC
--    Created first because every domain table's audit columns FK to users.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username      text NOT NULL,
    email         text,
    -- person_id is a nullable link (an admin who is also an official);
    -- FK added AFTER persons exists (see ALTER at section 6).
    person_id     uuid,
    -- primary_unit_id scopes future unit-based RBAC; FK added after units.
    primary_unit_id uuid,
    status        text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','disabled')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES users(id),
    updated_by    uuid REFERENCES users(id),
    deleted_at    timestamptz,
    deleted_by    uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX uq_users_username ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_email    ON users (lower(email))    WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE TABLE roles (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    description text
);

CREATE TABLE permissions (
    code        text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_code       text NOT NULL REFERENCES roles(code)       ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_roles (
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
    -- optional unit scope for the grant (future unit-scoped enforcement)
    scope_unit_id uuid,
    PRIMARY KEY (user_id, role_code)
);

-- ---------------------------------------------------------------------
-- 4. DOMAIN: ORGANIZATION_UNITS  (self-referencing tree; A-lock: root=Pemkot)
-- ---------------------------------------------------------------------
CREATE TABLE organization_units (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_unit_id  uuid REFERENCES organization_units(id) ON DELETE RESTRICT,
    unit_type_code  text NOT NULL REFERENCES ref_unit_types(code),
    name            text NOT NULL,
    short_name      text,
    slug            text NOT NULL,
    description     text,
    official_duties     text,
    official_functions  text,
    legal_basis     text,
    contact         jsonb,
    effective_from  date,
    effective_to    date,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users(id),
    updated_by  uuid REFERENCES users(id),
    deleted_at  timestamptz,
    deleted_by  uuid REFERENCES users(id),
    CONSTRAINT ck_ou_not_self_parent CHECK (parent_unit_id IS NULL OR parent_unit_id <> id),
    CONSTRAINT ck_ou_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX uq_ou_slug ON organization_units (slug) WHERE deleted_at IS NULL;
CREATE INDEX ix_ou_parent ON organization_units (parent_unit_id);

-- ---------------------------------------------------------------------
-- 5. DOMAIN: POSITIONS  (office; distinct from OrganizationUnit — GAP-F)
-- ---------------------------------------------------------------------
CREATE TABLE positions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_unit_id uuid NOT NULL REFERENCES organization_units(id) ON DELETE RESTRICT,
    parent_position_id   uuid REFERENCES positions(id) ON DELETE SET NULL,
    title                text NOT NULL,
    slug                 text NOT NULL,
    position_type_code   text NOT NULL REFERENCES ref_position_types(code),
    coordination_scope   text,
    official_description text,
    effective_from  date,
    effective_to    date,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users(id),
    updated_by  uuid REFERENCES users(id),
    deleted_at  timestamptz,
    deleted_by  uuid REFERENCES users(id),
    CONSTRAINT ck_pos_not_self_parent CHECK (parent_position_id IS NULL OR parent_position_id <> id),
    CONSTRAINT ck_pos_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX uq_pos_slug ON positions (slug) WHERE deleted_at IS NULL;
CREATE INDEX ix_pos_unit ON positions (organization_unit_id);

-- ---------------------------------------------------------------------
-- 6. DOMAIN: PERSONS  (identity only; NO temporal, NO current_position — C2-1)
-- ---------------------------------------------------------------------
CREATE TABLE persons (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        text NOT NULL,
    display_name     text,
    honorific_prefix text,
    honorific_suffix text,
    biography        text,
    contact          jsonb,
    slug             text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users(id),
    updated_by  uuid REFERENCES users(id),
    deleted_at  timestamptz,
    deleted_by  uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX uq_persons_slug ON persons (slug) WHERE deleted_at IS NULL;

-- deferred FKs on users now that persons/organization_units exist
ALTER TABLE users
    ADD CONSTRAINT fk_users_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_users_primary_unit FOREIGN KEY (primary_unit_id) REFERENCES organization_units(id) ON DELETE SET NULL;
ALTER TABLE user_roles
    ADD CONSTRAINT fk_user_roles_scope_unit FOREIGN KEY (scope_unit_id) REFERENCES organization_units(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 7. DOMAIN: ASSIGNMENTS  (temporal bridge Person<->Position)
--    - assignment_class kept consistent with type via COMPOSITE FK (FINDING-1)
--    - overlap enforced by two EXCLUDE constraints (native, no trigger)
-- ---------------------------------------------------------------------
CREATE TABLE assignments (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id             uuid NOT NULL REFERENCES persons(id)   ON DELETE RESTRICT,
    position_id           uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    assignment_type_code  text NOT NULL,
    assignment_class      assignment_class NOT NULL,
    assignment_status     assignment_status NOT NULL DEFAULT 'active',
    start_date            date NOT NULL,
    end_date              date,
    appointment_reference text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users(id),
    updated_by  uuid REFERENCES users(id),
    deleted_at  timestamptz,
    deleted_by  uuid REFERENCES users(id),
    CONSTRAINT ck_asg_date_range CHECK (end_date IS NULL OR end_date >= start_date),
    -- COMPOSITE FK: (type, class) must exist as a pair in the reference
    -- table => assignment_class can never lie about its type's class.
    CONSTRAINT fk_asg_type_class
        FOREIGN KEY (assignment_type_code, assignment_class)
        REFERENCES ref_assignment_types (code, class),
    -- Overlap Rule #1: at most ONE active substantive per position over time.
    CONSTRAINT ex_asg_one_substantive
        EXCLUDE USING gist (
            position_id WITH =,
            daterange(start_date, end_date, '[)') WITH &&
        ) WHERE (assignment_status = 'active' AND deleted_at IS NULL AND assignment_class = 'substantive'),
    -- Overlap Rule #2: at most ONE active acting per position over time.
    -- (Acting MAY overlap a substantive because the two constraints are
    --  independent and each is class-filtered.)
    CONSTRAINT ex_asg_one_acting
        EXCLUDE USING gist (
            position_id WITH =,
            daterange(start_date, end_date, '[)') WITH &&
        ) WHERE (assignment_status = 'active' AND deleted_at IS NULL AND assignment_class = 'acting')
);
CREATE INDEX ix_asg_position ON assignments (position_id, start_date, end_date);
CREATE INDEX ix_asg_person   ON assignments (person_id);
CREATE INDEX ix_asg_active   ON assignments (position_id) WHERE assignment_status = 'active' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 8. GOVERNANCE: VERIFICATIONS  (append-style log; current = latest by created_at)
--    Slice-1 targets = 4 institutional entities (Document deferred: FINDING-3).
--    Typed nullable FK columns + CHECK exactly-one (no polymorphic id).
-- ---------------------------------------------------------------------
CREATE TABLE verifications (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seq              bigint GENERATED ALWAYS AS IDENTITY,   -- deterministic tie-break
    status           verification_status NOT NULL,
    source_type      verification_source_type NOT NULL,
    source_reference text,
    verified_at      timestamptz,        -- INFORMATIONAL ONLY (not used by resolver)
    notes            text,
    -- typed targets (exactly one):
    person_id            uuid REFERENCES persons(id)            ON DELETE CASCADE,
    organization_unit_id uuid REFERENCES organization_units(id) ON DELETE CASCADE,
    position_id          uuid REFERENCES positions(id)          ON DELETE CASCADE,
    assignment_id        uuid REFERENCES assignments(id)        ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users(id),
    verified_by uuid REFERENCES users(id),
    CONSTRAINT ck_ver_exactly_one_target CHECK (
        num_nonnulls(person_id, organization_unit_id, position_id, assignment_id) = 1
    )
);
CREATE INDEX ix_ver_person ON verifications (person_id, created_at DESC, seq DESC) WHERE person_id IS NOT NULL;
CREATE INDEX ix_ver_unit   ON verifications (organization_unit_id, created_at DESC, seq DESC) WHERE organization_unit_id IS NOT NULL;
CREATE INDEX ix_ver_pos    ON verifications (position_id, created_at DESC, seq DESC) WHERE position_id IS NOT NULL;
CREATE INDEX ix_ver_asg    ON verifications (assignment_id, created_at DESC, seq DESC) WHERE assignment_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 9. updated_at maintenance (conventional trigger; not a design work-around)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ou_touch  BEFORE UPDATE ON organization_units FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pos_touch BEFORE UPDATE ON positions          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_per_touch BEFORE UPDATE ON persons            FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_asg_touch BEFORE UPDATE ON assignments        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_usr_touch BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 10. HELPER: recursive org subtree (realizes the unit-scoped RBAC claim)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_org_subtree(root uuid)
RETURNS TABLE (id uuid) AS $$
    WITH RECURSIVE t AS (
        SELECT ou.id FROM organization_units ou WHERE ou.id = root AND ou.deleted_at IS NULL
        UNION ALL
        SELECT c.id FROM organization_units c
        JOIN t ON c.parent_unit_id = t.id
        WHERE c.deleted_at IS NULL
    )
    SELECT id FROM t;
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- 11. RESOLVER VIEWS  (the heart of the system)
--     Kept as REGULAR views for Slice-1 (always fresh; materialization
--     deferred to a performance phase — FINDING-2).
-- =====================================================================

-- 11.1 current verification per entity (LOCKED: latest by created_at,
--      seq as deterministic tie-break; verified_at NOT used).
CREATE VIEW v_current_verification AS
    SELECT 'person'::text AS entity_type, entity_id, status FROM (
        SELECT DISTINCT ON (person_id) person_id AS entity_id, status
        FROM verifications WHERE person_id IS NOT NULL
        ORDER BY person_id, created_at DESC, seq DESC) s
    UNION ALL
    SELECT 'organization_unit', entity_id, status FROM (
        SELECT DISTINCT ON (organization_unit_id) organization_unit_id AS entity_id, status
        FROM verifications WHERE organization_unit_id IS NOT NULL
        ORDER BY organization_unit_id, created_at DESC, seq DESC) s
    UNION ALL
    SELECT 'position', entity_id, status FROM (
        SELECT DISTINCT ON (position_id) position_id AS entity_id, status
        FROM verifications WHERE position_id IS NOT NULL
        ORDER BY position_id, created_at DESC, seq DESC) s
    UNION ALL
    SELECT 'assignment', entity_id, status FROM (
        SELECT DISTINCT ON (assignment_id) assignment_id AS entity_id, status
        FROM verifications WHERE assignment_id IS NOT NULL
        ORDER BY assignment_id, created_at DESC, seq DESC) s;

-- 11.2 PUBLIC_PERSON = verified (no temporal dimension — C2-1)
CREATE VIEW v_public_person AS
    SELECT p.id,
           (COALESCE(cv.status,'needs_verification') = 'verified'
            AND p.deleted_at IS NULL) AS is_public
    FROM persons p
    LEFT JOIN v_current_verification cv
        ON cv.entity_type = 'person' AND cv.entity_id = p.id;

-- 11.3 PUBLIC_UNIT = verified + effective + (parent NULL OR parent public)
--      Recursive, cascading up the tree (C2-2).
CREATE RECURSIVE VIEW v_public_unit (id, is_public) AS
    SELECT u.id,
           ( COALESCE(cv.status,'needs_verification') = 'verified'
             AND (u.effective_from IS NULL OR u.effective_from <= current_date)
             AND (u.effective_to   IS NULL OR u.effective_to   >  current_date)
             AND u.deleted_at IS NULL )
    FROM organization_units u
    LEFT JOIN v_current_verification cv
        ON cv.entity_type = 'organization_unit' AND cv.entity_id = u.id
    WHERE u.parent_unit_id IS NULL
  UNION ALL
    SELECT c.id,
           ( COALESCE(cv.status,'needs_verification') = 'verified'
             AND (c.effective_from IS NULL OR c.effective_from <= current_date)
             AND (c.effective_to   IS NULL OR c.effective_to   >  current_date)
             AND c.deleted_at IS NULL
             AND p.is_public )
    FROM organization_units c
    JOIN v_public_unit p ON c.parent_unit_id = p.id
    LEFT JOIN v_current_verification cv
        ON cv.entity_type = 'organization_unit' AND cv.entity_id = c.id;

-- 11.4 PUBLIC_POSITION = verified + effective + parent unit public
CREATE VIEW v_public_position AS
    SELECT pos.id,
           ( COALESCE(cv.status,'needs_verification') = 'verified'
             AND (pos.effective_from IS NULL OR pos.effective_from <= current_date)
             AND (pos.effective_to   IS NULL OR pos.effective_to   >  current_date)
             AND pos.deleted_at IS NULL
             AND COALESCE(pu.is_public,false) ) AS is_public
    FROM positions pos
    LEFT JOIN v_current_verification cv
        ON cv.entity_type = 'position' AND cv.entity_id = pos.id
    LEFT JOIN v_public_unit pu ON pu.id = pos.organization_unit_id;

-- 11.5 CURRENT_HOLDER — FACT ONLY. No verification / no publication.
--      active + date-current; acting-first; one row per position.
CREATE VIEW v_current_holder AS
    SELECT DISTINCT ON (a.position_id)
           a.position_id,
           a.id            AS assignment_id,
           a.person_id,
           a.assignment_class,
           a.assignment_type_code
    FROM assignments a
    WHERE a.assignment_status = 'active'
      AND a.deleted_at IS NULL
      AND a.start_date <= current_date
      AND (a.end_date IS NULL OR a.end_date > current_date)
    ORDER BY a.position_id,
             CASE a.assignment_class WHEN 'acting' THEN 0 ELSE 1 END,  -- acting first
             a.start_date DESC;

-- 11.6 PUBLIC_ASSIGNMENT = verified + active + current + public person + public position
CREATE VIEW v_public_assignment AS
    SELECT a.id,
           ( COALESCE(cv.status,'needs_verification') = 'verified'
             AND a.assignment_status = 'active'
             AND a.deleted_at IS NULL
             AND a.start_date <= current_date
             AND (a.end_date IS NULL OR a.end_date > current_date)
             AND COALESCE(pp.is_public,false)
             AND COALESCE(vpos.is_public,false) ) AS is_public
    FROM assignments a
    LEFT JOIN v_current_verification cv
        ON cv.entity_type = 'assignment' AND cv.entity_id = a.id
    LEFT JOIN v_public_person   pp   ON pp.id   = a.person_id
    LEFT JOIN v_public_position vpos ON vpos.id = a.position_id;

-- 11.7 PUBLIC_HOLDER = CURRENT_HOLDER only if that same assignment is
--      public-eligible AND its position is public. NO cross fallback
--      from acting to substantive (C2-3).
CREATE VIEW v_public_holder AS
    SELECT ch.position_id,
           ch.assignment_id,
           ch.person_id,
           ch.assignment_class,
           ch.assignment_type_code
    FROM v_current_holder ch
    JOIN v_public_assignment pa ON pa.id = ch.assignment_id AND pa.is_public
    JOIN v_public_position   vp ON vp.id = ch.position_id   AND vp.is_public;

-- 11.8 Canonical eligibility union for the Slice-1 institutional entities.
CREATE VIEW v_public_eligibility AS
    SELECT 'person'::text AS entity_type, id, is_public FROM v_public_person
    UNION ALL SELECT 'organization_unit', id, is_public FROM v_public_unit
    UNION ALL SELECT 'position',          id, is_public FROM v_public_position
    UNION ALL SELECT 'assignment',        id, is_public FROM v_public_assignment;

-- =====================================================================
-- 3D.1-FINDINGS  (physical decisions that diverged from on-paper 3D)
-- ---------------------------------------------------------------------
-- FINDING-1  assignment_class cannot be a GENERATED column (generated
--            columns may not reference other tables). Chosen solution:
--            store assignment_class explicitly and guarantee it matches
--            its type via a COMPOSITE FK (assignment_type_code,
--            assignment_class) -> ref_assignment_types(code,class).
--            This preserves integrity NATIVELY with no trigger. The
--            EXCLUDE constraints then key on the concrete class column.
--            (A convenience BEFORE-trigger to auto-fill class from the
--            ref was considered and rejected for Slice-1 to keep the
--            model purely declarative; callers supply both columns.)
--
-- FINDING-2  Resolver views are REGULAR (not MATERIALIZED) in Slice-1.
--            Rationale: correctness-first + always-fresh for the CMS; a
--            recursive materialized view needs a unique index +
--            CONCURRENT refresh + invalidation wiring that is premature
--            before we measure real query cost. Materialization is a
--            later performance decision, not a design change.
--
-- FINDING-3  verifications has only 4 targets here (person, unit,
--            position, assignment). The 5th target (document_id) is
--            omitted because the Document table is intentionally out of
--            Slice-1 scope; adding the column would force creating an
--            unused table. Re-added when the Document slice lands.
--
-- FINDING-5  UUIDv4 via core gen_random_uuid() is used (no extension).
--            PostgreSQL 16 has no built-in uuidv7(); adopting time-
--            ordered UUIDv7 (pg_uuidv7 ext / app-side / PG18) is revisited
--            in Phase 3D.2 Technical Architecture.
--
-- No LOCKED Phase 3C decision was altered. Nothing above changes the
-- domain model shape; these are physical realizations only.
-- =====================================================================
