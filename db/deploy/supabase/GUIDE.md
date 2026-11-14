# Deploy manual ke Supabase (dev/pilot)

Untuk akun Supabase milik Setda. Seluruh SQL sudah diuji pada PostgreSQL bersih
(termasuk simulasi role `anon`/`authenticated` milik Supabase).

## 0. Syarat
- Project Supabase baru, region `ap-southeast-1`.
- Buka **Database → Extensions**, aktifkan `btree_gist` (jika belum).

## 1. Skema + seed
SQL Editor → New query → tempel isi `01_schema_and_seed.sql` → Run.
Harus selesai tanpa error. Jika error, kirim pesannya ke saya; jangan jalankan ulang
sebagian (file ini satu kesatuan).

> `01_schema_and_seed.sql` dibuat otomatis oleh `build-bundle.sh` dari
> `db/migrations/` dan `db/seed/`. Jangan diedit tangan.

## 2. Hardening + password role
1. Buat dua password acak (min. 24 karakter) dan simpan di password manager.
2. Salin `02_hardening_and_roles.sql` ke editor, ganti `CHANGE_ME_PUBLIC` dan
   `CHANGE_ME_ADMIN` dengan password tadi, lalu Run.
3. **Jangan** menyimpan versi yang sudah berisi password ke repo atau chat.

Bagian hardening mencabut hak `anon` dan `authenticated` pada seluruh objek schema
`public`. Tanpa itu, tabel bisa dibaca lewat Data API Supabase memakai anon key.

## 3. Verifikasi
Jalankan `03_verify.sql`. Keempat baris harus `PASS`.

## 4. Connection string (jangan ditempel di chat)
Di **Connect**, ambil string **Transaction pooler** (port 6543). Ganti user dan password
sesuai role aplikasi; format user pooler biasanya `NAMA_ROLE.<project-ref>`, ikuti contoh
yang ditampilkan Supabase.
- `APP_PUBLIC_DB_URL` → role `app_public`
- `APP_ADMIN_DB_URL`  → role `app_admin`

Untuk migrasi di masa depan gunakan koneksi direct/session, bukan pooler.

## 5. Uji pooler (satu-satunya hal yang belum terbukti)
Dengan `APP_PUBLIC_DB_URL`:
- `select count(*) from v_public_pimpinan;` → harus `3`
- `select 1 from persons limit 1;` → harus `permission denied`

Jika login role kustom ditolak pooler, **jangan ubah aturan bisnis**. Laporkan hasilnya;
fallback-nya sudah didokumentasikan di `db/security/README.md`.

## 6. Vercel
Isi `APP_PUBLIC_DB_URL` dan `APP_ADMIN_DB_URL` sebagai Environment Variables
(scope Preview + Production project dev/pilot), lalu deploy.
