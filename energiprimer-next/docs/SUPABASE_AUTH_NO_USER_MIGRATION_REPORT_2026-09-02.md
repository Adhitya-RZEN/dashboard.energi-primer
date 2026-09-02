# Supabase Auth Replacement — No User Migration

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Auth.js Credentials remains
> the active boundary. Supabase Auth and recovery references below are evidence
> only.

Tanggal audit: 2026-09-02  
Status implementasi kode: selesai secara statis  
Status cutover: **BLOCKED** sampai konfigurasi operator dan E2E terisolasi selesai

## Keputusan arsitektur

Auth.js/NextAuth diganti sebagai runtime authentication dengan Supabase Auth.
Tidak ada migrasi user dari `public.users` ke `auth.users`.

- User Supabase Auth baru dibuat manual oleh operator.
- Hak admin dibaca dari `app_metadata.role` yang dikendalikan server/operator.
- `user_metadata.role` tidak pernah dipakai untuk authorization.
- Prisma tetap menjadi business-data layer.
- `public.users`, `sessions`, `password_reset_tokens`, BigInt ID, foreign key,
  dan seluruh business data tetap tidak berubah.
- Tidak ada identity bridge, konversi ID, penyalinan bcrypt hash, atau schema
  migration pada implementasi ini.

User legacy pada `public.users` tidak otomatis menjadi user login Supabase.
Hal tersebut disengaja sesuai strategi **NO USER MIGRATION** dan perlu
dikomunikasikan kepada operator sebelum cutover.

## Implementasi

| Area | Implementasi |
| --- | --- |
| Browser client | `src/lib/supabase/client.ts` memakai `createBrowserClient` |
| Server client | `src/lib/supabase/server.ts` memakai cookie session dan `server-only` |
| Session refresh | `src/proxy.ts` memakai `createServerClient` dan `auth.getUser()` |
| Authorization | `src/lib/supabase/authorization.ts`, hanya `app_metadata.role=admin` |
| Protected pages | `src/lib/supabase/auth.ts` dan protected layout melakukan verifikasi server-side |
| Login | `signInWithPassword`; non-admin langsung di-sign-out dan ditolak |
| Logout | `signOut` dari browser client |
| Password recovery | `resetPasswordForEmail` → `/auth/callback` → `/password/reset` → `updateUser({ password })` |
| Password change | `/password/change` memakai `updateUser({ password, current_password })` |
| Redirect | Callback hanya mengizinkan redirect same-origin melalui `resolveSafeRedirect` |
| Auth.js endpoint | Dihapus; tidak ada `/api/auth/[...nextauth]` aktif |
| Legacy reset runtime | Custom token/bcrypt/Resend flow dihapus dari runtime |

Supabase `service_role` key tidak diperlukan oleh runtime aplikasi. Jangan
memasukkannya ke client bundle atau environment Vercel aplikasi. Pengaturan
`app_metadata` harus dilakukan melalui Dashboard Supabase atau mekanisme
server/operator yang disetujui, bukan dari browser.

## Environment yang diperlukan

| Variable | Runtime | Server/client | Keterangan |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Wajib Auth | Public client/server | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Wajib Auth | Public client/server | Anon/publishable key; bukan service-role key |
| `DATABASE_URL` | Wajib business data | Server-only | Tetap dipakai Prisma; konfigurasi target deployment dilakukan operator |
| `CRON_SECRET` | Wajib endpoint cron | Server-only | Tidak terkait session Auth |
| `SUPABASE_DIRECT_URL` | Script migrasi/preflight | Server/script-only | Bukan connection string runtime aplikasi |
| `SUPABASE_POOLER_URL` | Script/preflight | Server/script-only | Bukan pengganti otomatis untuk semua fungsi direct connection |

Node.js deployment requirement setelah penambahan Supabase SDK adalah
`>=22.0.0`; `package.json` dan lockfile sudah diselaraskan dengan requirement
dependency tersebut.

`GOOGLE_*`, `DASHBOARD_DATA_SOURCE`, dan environment lain yang dipakai service
existing tetap mengikuti konfigurasi aplikasi saat ini. `.env.example` hanya
menambahkan konfigurasi public Supabase Auth dan menghapus konfigurasi Auth.js/
Resend yang sudah tidak dipakai runtime.

## Data dan database

Tidak ada operasi database yang dilakukan oleh implementasi ini.

| Item | Hasil |
| --- | --- |
| Database write | `0` |
| Data migration | Tidak dijalankan |
| Schema migration | Tidak dijalankan |
| Prisma schema | Tidak diubah |
| `public.users` | Dipertahankan |
| `password_reset_tokens` | Dipertahankan sebagai legacy DB artifact; tidak lagi dipanggil runtime |
| Business data | Tidak diubah |

Penghapusan tabel legacy, penghapusan field password, atau pengubahan relasi
tetap menjadi pekerjaan terpisah dan memerlukan approval manual.

## Validasi yang sudah dijalankan

- `npm run lint` — **PASS**
- `npx tsc --noEmit` — **PASS**
- `npm run auth:security:verify` — **PASS**
  - validasi email dan redirect
  - role admin dari `app_metadata`
  - penolakan role non-admin dan `user_metadata.role`
  - proxy/session boundary
  - login/recovery/change-password source boundary
  - Auth.js runtime/API route sudah tidak ada
  - database writes `0`, network requests `0`
- `npm run auth:verify` — **BELUM DIJALANKAN**; membutuhkan environment E2E
  terisolasi dan user Supabase Auth test.
- `npm run build` — **BELUM DIJALANKAN** pada environment ini karena proses Next
  dapat memuat `.env.local`, yang tidak boleh dibaca pada fase ini. Jalankan di
  environment Preview/CI terisolasi setelah konfigurasi manual tersedia.

Tidak ada deployment atau request autentikasi live yang dilakukan.

## Manual gate sebelum cutover

1. Buat satu user admin baru secara manual pada Supabase Auth. Jangan memakai
   user legacy sebagai asumsi identity otomatis.
2. Set `app_metadata` user tersebut menjadi role admin melalui mekanisme
   operator/server yang disetujui. Jangan memakai `user_metadata`.
3. Daftarkan URL aplikasi Preview dan callback `/auth/callback` pada Supabase
   Auth URL configuration.
4. Konfigurasikan `NEXT_PUBLIC_SUPABASE_URL` dan
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada environment Preview.
5. Konfigurasikan `DATABASE_URL` Preview sesuai keputusan deployment, yaitu
   Supabase Transaction Pooler bila itu yang ditetapkan pada Phase 22; gunakan
   port `6543` dan SSL sesuai connection details operator.
6. Jalankan `npm run auth:verify` dari environment terisolasi dengan hanya
   variable test yang diperlukan:
   `AUTH_TEST_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_AUTH_TEST_EMAIL`, dan
   `SUPABASE_AUTH_TEST_PASSWORD`.
7. Uji manual recovery email dan perubahan password. Pastikan user kembali ke
   `/password/reset`, dapat menetapkan password baru, lalu session diakhiri.
8. Jalankan lint, typecheck, dan build pada Preview/CI. Jangan menggunakan
   database production untuk negative/role tests.

## Status akhir

**BLOCKED — SUPABASE_AUTH_CUTOVER_REQUIRES_ISOLATED_E2E**

Kode replacement sudah terpasang dan pemeriksaan statis lulus, tetapi status
tidak dinaikkan menjadi `SUPABASE_AUTH_READY` karena login valid, protected
dashboard, logout, authorization pada user Supabase, dan recovery email belum
diuji dengan user/configuration E2E terisolasi. Tidak ada perubahan terhadap
database atau deployment yang dilakukan.
