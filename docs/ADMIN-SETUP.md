# Admin Pimpinan — setup login (Supabase Auth)

Halaman admin: `/admin` (login di `/admin/login`). Login memakai **Supabase Auth**
(email + kata sandi); izin tetap dari tabel RBAC kita (Authentication ≠ Authorization).

## 1. Buat akun login di Supabase
Dashboard Supabase (project Setda) → **Authentication → Users → Add user**.
Isi email dan kata sandi, centang *Auto Confirm User*. Salin **User UID** (UUID).

## 2. Hubungkan akun itu ke pengguna admin
Di SQL Editor (project yang sama), ganti `<USER-UID>`:

```sql
UPDATE users SET external_auth_id = '<USER-UID>' WHERE username = 'superadmin';
```

Pengguna `superadmin` (dari seed) memegang izin `manage_org_structure` dan `write_verification`.
Akun login yang belum dihubungkan tetap bisa masuk, tetapi hanya melihat ID akunnya
dan **tidak** mendapat akses apa pun.

## 3. Environment variable di Vercel (Preview + Production project dev/pilot)
| Name | Isi |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | publishable / anon key (hanya dipakai memanggil Auth API) |
| `SUPABASE_JWT_SECRET` | *Kosongkan* bila project memakai asymmetric signing keys (default baru). Isi dengan JWT secret bila project masih HS256 (Settings → API → JWT Secret). |

Setelah menyimpan, **Redeploy**. Jangan memakai prefix `NEXT_PUBLIC_` dan jangan memasukkan
`service_role` key — aplikasi tidak memerlukannya.

## 4. Masuk
Buka `<url>/admin/login`. Sesi disimpan di cookie HttpOnly dan berlaku selama masa hidup
access token Supabase (default 1 jam), lalu masuk ulang.

## Peran
- `super_admin`: kelola orang/penugasan dan catat verifikasi.
- `verifier`: hanya mencatat verifikasi.
- `publisher`: belum punya izin apa pun di Slice-1 (belum ada konten yang diterbitkan).
Pemberian peran ke pengguna lain: tambah baris di `users` dan `user_roles` (UI manajemen pengguna belum ada).
