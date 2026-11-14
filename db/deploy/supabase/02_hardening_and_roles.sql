-- =====================================================================
-- SUPABASE-ONLY: hardening + login roles. Jalankan SETELAH 01_schema_and_seed.sql
-- 1) Ganti dua placeholder password di bawah (CHANGE_ME_*) SEBELUM menjalankan.
-- 2) Jangan commit file yang sudah berisi password.
-- =====================================================================

-- A. Cabut akses Data API (PostgREST) ke semua objek kita.
--    Supabase memberi anon/authenticated hak default di schema public;
--    aplikasi ini TIDAK memakai Data API, jadi semua dicabut.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;

-- B. Aktifkan login untuk role aplikasi (password kuat, minimal 24 karakter acak).
ALTER ROLE app_public LOGIN PASSWORD 'CHANGE_ME_PUBLIC';
ALTER ROLE app_admin  LOGIN PASSWORD 'CHANGE_ME_ADMIN';
