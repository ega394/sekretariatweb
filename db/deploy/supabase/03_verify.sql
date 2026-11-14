-- Verifikasi (SQL Editor, sebagai postgres). Semua baris harus 'PASS'.
SELECT 'public holders = 3' AS check,
       CASE WHEN (SELECT count(*) FROM v_public_pimpinan) = 3 THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL
SELECT 'anon TIDAK punya hak di tabel kita',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
         WHERE grantee IN ('anon','authenticated') AND table_schema='public') THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'app_public hanya SELECT di view publik',
       CASE WHEN (SELECT count(*) FROM information_schema.role_table_grants
                  WHERE grantee='app_public' AND table_schema='public') = 4
             AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                  WHERE grantee='app_public' AND table_schema='public' AND privilege_type <> 'SELECT')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL
SELECT 'btree_gist aktif',
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname='btree_gist') THEN 'PASS' ELSE 'FAIL' END;
