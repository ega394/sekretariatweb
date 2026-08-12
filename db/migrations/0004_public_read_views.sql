-- =====================================================================
-- PHASE 3D.4 — MIGRATION 0004: public presentation view (read model)
-- ADDITIVE. Does NOT modify any Phase 3D.1 resolver (v_public_holder etc.
-- are unchanged). This view only DECORATES the already-eligible holders
-- with display fields, so the public surface can render without any
-- base-table access (app_public still cannot read persons/positions/units).
--
-- The view is owned by the migration role, so it may join base tables; a
-- caller (app_public) granted SELECT on this view reads decorated eligible
-- rows WITHOUT base-table privilege — the boundary holds.
--
-- Transaction-agnostic (runner owns the transaction).
-- =====================================================================

CREATE VIEW v_public_pimpinan AS
    SELECT
        ph.position_id,
        pos.slug                AS position_slug,
        pos.title               AS position_title,
        pos.position_type_code,
        ou.slug                 AS unit_slug,
        ou.name                 AS unit_name,
        ph.person_id,
        per.display_name        AS person_display_name,
        per.full_name           AS person_full_name,
        ph.assignment_id,
        ph.assignment_class,
        ph.assignment_type_code
    FROM v_public_holder ph
    JOIN positions          pos ON pos.id = ph.position_id
    JOIN persons            per ON per.id = ph.person_id
    JOIN organization_units ou  ON ou.id  = pos.organization_unit_id;

-- expose ONLY this presentation view to the public role
GRANT SELECT ON v_public_pimpinan TO app_public;
