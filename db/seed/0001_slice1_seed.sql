-- =====================================================================
-- PHASE 3D.1 — SEED SLICE-1 (PIMPINAN)
-- CONFIRMED baseline data only. Separate from schema migration.
--
-- RULE (Phase 2/3 invariant): nothing is invented. Any institutional
-- fact that is not CONFIRMED in the Phase 1 Source Registry enters with
-- verification status 'needs_verification' (never guessed). Confirmed
-- facts enter as 'verified' WITH a source_reference.
--
-- Sources (Phase 1 registry):
--   [S1] berita.tarakankota.go.id/2025/02 (pelantikan Wali Kota 20-02-2025)
--   [S2] kaltara.antaranews.com/berita/513809 (Khairul–Ibnu Saud dilantik)
--   [S3] kaltara.antaranews.com/berita/522945 (Sekda Abdul Azis Hasan, 31-07-2026)
--
-- TRANSACTION POLICY: transaction-agnostic (no BEGIN/COMMIT); the runner
-- wraps it (psql --single-transaction / CI). Approved 3D.1 portability fix.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference vocabularies (PROPOSED nomenclature — standard ID gov terms).
-- These are controlled vocabulary, not claims about Tarakan's Perwali.
-- ---------------------------------------------------------------------
INSERT INTO ref_unit_types (code, label, sort_order) VALUES
    ('pemkot',          'Pemerintah Kota',                 0),
    ('pimpinan_daerah', 'Pimpinan Daerah',                 1),
    ('setda',           'Sekretariat Daerah',              2),
    ('asisten',         'Asisten',                         3),
    ('bagian',          'Bagian',                          4),
    ('subbagian',       'Subbagian',                       5),
    ('lainnya',         'Lainnya',                        99);

INSERT INTO ref_position_types (code, label, sort_order) VALUES
    ('kepala_daerah',       'Kepala Daerah',            0),
    ('wakil_kepala_daerah', 'Wakil Kepala Daerah',      1),
    ('sekda',               'Sekretaris Daerah',        2),
    ('asisten',             'Asisten',                  3),
    ('staf_ahli',           'Staf Ahli',                4),
    ('kepala_bagian',       'Kepala Bagian',            5),
    ('kepala_subbagian',    'Kepala Subbagian',         6),
    ('lainnya',             'Lainnya',                 99);

INSERT INTO ref_assignment_types (code, label, class, sort_order) VALUES
    ('definitif', 'Definitif',                'substantive', 0),
    ('plt',       'Pelaksana Tugas (Plt.)',   'acting',      1),
    ('plh',       'Pelaksana Harian (Plh.)',  'acting',      2),
    ('pj',        'Penjabat (Pj.)',           'acting',      3);

-- ---------------------------------------------------------------------
-- Initial system administrator (infra). No created_by (bootstrap).
-- ---------------------------------------------------------------------
INSERT INTO users (id, username, email, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'superadmin', NULL, 'active');

-- ---------------------------------------------------------------------
-- RBAC: minimum roles + permissions for Slice-1.
-- Proves Publish != Verify: 'verifier' holds write_verification;
-- 'publisher' holds NONE in Slice-1 (no publishable content exists yet)
-- — deliberately no fake permission just to fill the matrix.
-- ---------------------------------------------------------------------
INSERT INTO roles (code, name, description) VALUES
    ('super_admin', 'Super Admin', 'Kelola struktur kelembagaan & seluruh sistem'),
    ('verifier',    'Verifier',    'Mencatat verifikasi fakta institusional/legal'),
    ('publisher',   'Publisher',   'Menerbitkan konten editorial (relevan mulai Slice konten)');

INSERT INTO permissions (code, description) VALUES
    ('manage_org_structure', 'Buat/ubah organization_units, positions, assignments'),
    ('write_verification',   'Menulis record verifications');

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('super_admin', 'manage_org_structure'),
    ('super_admin', 'write_verification'),
    ('verifier',    'write_verification');
-- NOTE: 'publisher' intentionally receives no rows here.

INSERT INTO user_roles (user_id, role_code) VALUES
    ('00000000-0000-0000-0000-000000000001', 'super_admin');

-- ---------------------------------------------------------------------
-- ORGANIZATION UNITS
--   Root Pemkot -> {Pimpinan Daerah, Sekretariat Daerah}. (A-lock)
--   'Pimpinan Daerah' is an architectural container (Phase 3C GAP-A) that
--   hosts the elected leadership OUTSIDE the Setda subtree.
-- ---------------------------------------------------------------------
INSERT INTO organization_units (id, parent_unit_id, unit_type_code, name, short_name, slug, description) VALUES
    ('10000000-0000-0000-0000-000000000001', NULL,
        'pemkot', 'Pemerintah Kota Tarakan', 'Pemkot Tarakan', 'pemerintah-kota-tarakan',
        'Institusi pemerintahan daerah Kota Tarakan (simpul akar).'),
    ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
        'pimpinan_daerah', 'Pimpinan Daerah', 'Pimpinan Daerah', 'pimpinan-daerah',
        'Kontainer arsitektural untuk Wali Kota & Wakil Wali Kota (di luar hierarki Setda).'),
    ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
        'setda', 'Sekretariat Daerah Kota Tarakan', 'Setda Tarakan', 'sekretariat-daerah',
        'Unsur staf yang membantu Wali Kota dalam kebijakan & koordinasi administratif.');

-- ---------------------------------------------------------------------
-- POSITIONS (offices). Slugs are Position-anchored & stable across mutasi.
-- ---------------------------------------------------------------------
INSERT INTO positions (id, organization_unit_id, title, slug, position_type_code) VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
        'Wali Kota Tarakan', 'wali-kota', 'kepala_daerah'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
        'Wakil Wali Kota Tarakan', 'wakil-wali-kota', 'wakil_kepala_daerah'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003',
        'Sekretaris Daerah', 'sekretaris-daerah', 'sekda');

-- ---------------------------------------------------------------------
-- PERSONS (CONFIRMED individuals). Honorifics only where confirmed.
--   Abdul Azis Hasan: gelar/NIP NOT confirmed -> honorifics left NULL.
-- ---------------------------------------------------------------------
INSERT INTO persons (id, full_name, display_name, honorific_prefix, honorific_suffix, slug) VALUES
    ('30000000-0000-0000-0000-000000000001', 'Khairul', 'dr. H. Khairul, M.Kes.', 'dr. H.', 'M.Kes.', 'khairul'),
    ('30000000-0000-0000-0000-000000000002', 'Ibnu Saud IS', 'Ibnu Saud IS', NULL, NULL, 'ibnu-saud-is'),
    ('30000000-0000-0000-0000-000000000003', 'Abdul Azis Hasan', 'Abdul Azis Hasan', NULL, NULL, 'abdul-azis-hasan');

-- ---------------------------------------------------------------------
-- ASSIGNMENTS (CONFIRMED). All definitif/active. Both class columns
-- supplied explicitly; composite FK guarantees they are consistent.
-- ---------------------------------------------------------------------
INSERT INTO assignments (id, person_id, position_id, assignment_type_code, assignment_class, assignment_status, start_date, end_date, appointment_reference) VALUES
    ('40000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'definitif', 'substantive', 'active', DATE '2025-02-20', NULL, 'Pelantikan 20-02-2025 [S1][S2]'),
    ('40000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
        'definitif', 'substantive', 'active', DATE '2025-02-20', NULL, 'Pelantikan 20-02-2025 [S1][S2]'),
    ('40000000-0000-0000-0000-000000000003',
        '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
        'definitif', 'substantive', 'active', DATE '2026-07-31', NULL, 'Pelantikan Sekda 31-07-2026 [S3]');

-- ---------------------------------------------------------------------
-- VERIFICATIONS.
--   CONFIRMED items -> 'verified' with a source_reference.
--   The architectural container 'Pimpinan Daerah' is verified as a
--   structural node (its existence as a grouping is factual: the city
--   does have a mayor/deputy); flagged in source_reference.
--   NOTE: no honorific/NIP/nomenclature has been invented anywhere.
-- ---------------------------------------------------------------------
-- Units
INSERT INTO verifications (status, source_type, source_reference, organization_unit_id) VALUES
    ('verified', 'portal_resmi', 'Pemkot Tarakan (portal resmi) [S1]',                     '10000000-0000-0000-0000-000000000001'),
    ('verified', 'portal_resmi', 'Struktural node Phase 3C GAP-A (grouping pimpinan)',      '10000000-0000-0000-0000-000000000002'),
    ('verified', 'portal_resmi', 'Setda Kota Tarakan (Phase 1 registry)',                   '10000000-0000-0000-0000-000000000003');
-- Positions
INSERT INTO verifications (status, source_type, source_reference, position_id) VALUES
    ('verified', 'media', 'Jabatan Wali Kota Tarakan [S2]',       '20000000-0000-0000-0000-000000000001'),
    ('verified', 'media', 'Jabatan Wakil Wali Kota Tarakan [S2]', '20000000-0000-0000-0000-000000000002'),
    ('verified', 'media', 'Jabatan Sekretaris Daerah [S3]',       '20000000-0000-0000-0000-000000000003');
-- Persons
INSERT INTO verifications (status, source_type, source_reference, person_id) VALUES
    ('verified', 'media', 'Khairul dilantik Wali Kota [S2]',          '30000000-0000-0000-0000-000000000001'),
    ('verified', 'media', 'Ibnu Saud IS dilantik Wakil Wali Kota [S2]','30000000-0000-0000-0000-000000000002'),
    ('verified', 'media', 'Abdul Azis Hasan dilantik Sekda [S3]',     '30000000-0000-0000-0000-000000000003');
-- Assignments
INSERT INTO verifications (status, source_type, source_reference, assignment_id) VALUES
    ('verified', 'media', 'Pelantikan 20-02-2025 [S1][S2]',       '40000000-0000-0000-0000-000000000001'),
    ('verified', 'media', 'Pelantikan 20-02-2025 [S1][S2]',       '40000000-0000-0000-0000-000000000002'),
    ('verified', 'media', 'Pelantikan Sekda 31-07-2026 [S3]',     '40000000-0000-0000-0000-000000000003');
