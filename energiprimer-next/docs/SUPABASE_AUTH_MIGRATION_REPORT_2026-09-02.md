# Supabase Auth Migration Audit & Decision Report

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Supabase Auth and public
> recovery are not active application authentication. This report is retained
> as migration decision evidence.

> **SUPERSEDED for the no-user-migration strategy.** This is the earlier
> identity-bridge audit. See
> `SUPABASE_AUTH_NO_USER_MIGRATION_REPORT_2026-09-02.md` for the approved
> replacement path.

Tanggal: 2026-09-02  
Status: **BLOCKED**  
Scope: audit arsitektur dan migration gate saja

## Executive summary

Migrasi Auth.js ke Supabase Auth belum dapat diimplementasikan dengan aman pada
tahap ini. Audit menemukan dua blocker utama:

1. Identitas aplikasi saat ini menggunakan `public.users.id` bertipe `BigInt`,
   sedangkan identitas Supabase Auth menggunakan UUID pada `auth.users.id`.
   Belum ada kolom atau tabel bridge `auth_user_id` yang menghubungkan keduanya.
2. Password existing hanya tersedia sebagai hash bcrypt di `public.users` dan
   belum ada alur provisioning/recovery Supabase Auth. Hash tidak boleh ditulis
   manual ke `auth.users` dan tidak boleh dimigrasikan dengan asumsi kompatibel.

Sesuai stop-condition Phase, tidak ada source migration, schema change,
password provisioning, data import, deployment, atau penghapusan Auth.js yang
dilakukan.

## Safety boundary

- `.env.local` tidak dibaca, dicetak, disalin, atau diubah.
- Tidak ada connection string, password, API key, token, private key, atau
  secret yang dimasukkan ke laporan.
- Tidak ada query/write ke database Local atau Supabase pada audit ini.
- Tidak ada `prisma migrate`, `prisma db push`, import, sync, atau deployment.
- Project Laravel tetap read-only.

## 1. Current Auth.js architecture

Source audit menunjukkan arsitektur aktif berikut:

```text
LoginForm
  -> Server Action
  -> Auth.js Credentials Provider
  -> Prisma public.users
  -> bcryptjs.compare
  -> Auth.js JWT cookie
  -> proxy + protected layout + server auth()
  -> dashboard
```

Evidence:

- `src/auth.ts` memakai `next-auth`, `Credentials`, JWT strategy dengan masa
  berlaku dua jam, lookup `role = "admin"`, bcrypt verification, dan validasi
  ulang role/version pada session callback.
- `src/app/login/actions.ts` memanggil `signIn("credentials", ...)`.
- `src/components/auth/SignOutButton.tsx` memanggil Auth.js `signOut()` melalui
  Server Action.
- `src/proxy.ts` memakai wrapper Auth.js.
- `src/app/(protected)/layout.tsx`, `src/app/page.tsx`,
  `src/app/password/change/page.tsx`, dan password action mengambil session
  melalui `auth()`.
- `src/app/api/auth/[...nextauth]/route.ts` masih mengekspor handler Auth.js.

## 2. User identity audit

`prisma/schema.prisma` dan `prisma/production/schema.prisma` mendefinisikan:

| Field | Current design |
|---|---|
| `users.id` | `BigInt`, auto-increment, primary key |
| `users.email` | unique string |
| `users.role` | server-side string, default `admin` |
| `users.password` | required password hash |
| `sessions.user_id` | nullable `BigInt` |
| Password reset identity | email pada `password_reset_tokens` |

`src/auth.ts` mengubah `users.id` menjadi string untuk claim session, dan
`src/app/password/change/actions.ts` mengubah kembali session ID menjadi
`BigInt` sebelum query Prisma. Ini membuat ID numerik existing menjadi bagian
langsung dari authorization dan password-change flow.

Target Supabase Auth memakai:

```text
auth.users.id = UUID
```

Tidak ditemukan `auth_user_id`, foreign key UUID, `auth_identity_links`, atau
adapter Supabase Auth pada schema/source. Pencocokan berdasarkan email saja
tidak cukup sebagai identity bridge yang kuat karena tidak memberi foreign key
identity dan rentan terhadap perubahan alamat email.

**Gate result: BLOCKED — identity mapping incompatible without an approved
schema/integration design.**

## 3. Explicit migration map

| Current Auth.js | Target Supabase Auth | Audit result |
|---|---|---|
| Credentials Provider | `signInWithPassword()` | Belum dapat dipindahkan sebelum user/password provisioning aman |
| Auth.js JWT/session | Supabase server session dan cookie | Membutuhkan perubahan proxy, protected layout, dan server actions |
| `auth()` | Server-side Supabase session/user retrieval | Membutuhkan identity bridge ke `public.users` |
| `signIn()` | Browser/server Supabase sign-in flow | Belum ada Supabase client atau env reference |
| `signOut()` | Supabase `signOut()` | Belum diimplementasikan |
| `role` pada `public.users` | Tetap server-controlled pada application profile | Dipertahankan; cara lookup menunggu identity bridge |
| `sessionVersion` dari `updatedAt` | Supabase session invalidation + mekanisme aplikasi tambahan | Belum ada padanan yang tervalidasi; tidak boleh dihapus |
| Custom reset token | Supabase recovery flow | Custom flow harus tetap ada sampai recovery E2E lulus |
| Resend custom reset mail | Supabase Auth email/SMTP atau integrasi approved | Jangan uninstall/ubah sebelum keputusan mail dibuat |
| Auth.js route | Supabase Auth integration routes/callback | Tidak boleh dihapus sebelum cutover acceptance |

Target akhir tetap satu sistem authentication utama: Supabase Auth. Namun
selama gate belum lulus, Auth.js harus tetap menjadi sistem aktif agar tidak
terjadi authentication outage.

## 4. Password migration audit

Current code menggunakan `bcryptjs.compare()` terhadap field
`public.users.password` dan membuat hash baru dengan cost 12 pada perubahan atau
reset password. Audit tidak menemukan mekanisme resmi/teruji untuk mengimpor
hash existing ke Supabase Auth.

Karena phase melarang penulisan hash manual ke `auth.users`, pilihan aman adalah
migration flow terkontrol:

```text
Existing application user
  -> Supabase Auth user provisioning pada environment terisolasi
  -> recovery/password reset resmi Supabase Auth
  -> user membuat password baru
  -> login melalui Supabase Auth
```

Provisioning user production dan reset password production adalah operasi
authentication/data yang memerlukan change window, operator approval, dan
audit terpisah. Tidak dilakukan pada phase ini.

## 5. Role and authorization

Role saat ini dipelihara di `public.users.role` dan pemeriksaan server hanya
mengizinkan `admin`. Navigation hiding bukan security boundary; protected
layout, proxy, dan server actions melakukan pemeriksaan server-side.

Rekomendasi target:

- pertahankan role pada application-controlled data;
- jangan menerima role dari browser atau user metadata yang dapat diubah user;
- setelah identity bridge tersedia, resolve `auth.users.id` ke record aplikasi
  di server sebelum membaca role;
- pertahankan pemeriksaan `admin` pada protected route dan server action;
- jangan membuka seluruh business table melalui `anon` atau `authenticated`.

Perubahan role storage atau RLS policy adalah keputusan security/schema terpisah
dan belum dilakukan.

## 6. Session and invalidation

Auth.js saat ini menggabungkan JWT dengan pemeriksaan `users.updatedAt` sebagai
`sessionVersion`. Perubahan role/password membuat session lama tidak lagi
berwenang setelah validasi ulang.

Supabase Auth session tidak boleh dianggap otomatis menggantikan seluruh
fungsi tersebut tanpa test. Sebelum migration:

1. dokumentasikan perilaku revoke/global sign-out;
2. tentukan bagaimana perubahan role dan credential memaksa reauthentication;
3. pertahankan pemeriksaan application profile pada server;
4. uji expired session, revoked session, role change, dan password change pada
   environment terisolasi.

`sessionVersion` tidak dihapus.

## 7. Password reset and Resend impact

Flow existing masih menggunakan:

- `password_reset_tokens`;
- token acak yang di-hash bcrypt;
- expiration 60 menit dan throttle;
- Resend hanya saat mail mode diaktifkan;
- Server Actions untuk request/reset.

Target Supabase Auth seharusnya menggunakan `resetPasswordForEmail()`, recovery
callback, dan `updateUser({ password })`. Custom token table, route, dan mail
service hanya boleh dihapus setelah:

- Supabase recovery link benar-benar diuji pada environment terisolasi;
- password update dan session invalidation lulus;
- invalid/expired recovery token lulus;
- generic response dan anti-enumeration lulus;
- sender/SMTP/email delivery disetujui operator.

Resend tidak di-uninstall dan tidak diubah.

## 8. Supabase client and environment audit

Static scan menemukan:

- tidak ada `@supabase/ssr` atau `@supabase/supabase-js` pada dependency/source;
- tidak ada `NEXT_PUBLIC_SUPABASE_URL` atau
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada `.env.example`/source;
- tidak ada `SUPABASE_SERVICE_ROLE_KEY` pada source;
- tidak ada browser Supabase Auth client.

Environment target yang perlu dirancang pada tahap implementasi:

| Variable | Intended boundary | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser/server public client configuration | MANUAL CONFIGURATION REQUIRED |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server public client configuration | MANUAL CONFIGURATION REQUIRED |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only provisioning/admin operations, jika benar-benar diperlukan | MANUAL CONFIGURATION REQUIRED; jangan ditambahkan sebelum kebutuhan disetujui |
| `DATABASE_URL` | Prisma business data; tetap terpisah dari Auth | UNCHANGED / tidak diverifikasi nilainya |
| `AUTH_SECRET` | Auth.js saat sistem lama aktif | tetap diperlukan sampai cutover selesai |

Tidak ada status `configured` atau `valid` yang diklaim karena `.env.local` tidak
dibaca dan Vercel environment tidak diinspeksi.

## 9. Server/client and RLS boundary

Audit static saat ini menunjukkan Prisma, Auth.js server config, Google Sheets,
Resend, dan password-reset service memakai server-only boundary. Client form
hanya menerima data input dan Server Action reference.

Supabase Auth implementation harus mempertahankan aturan berikut:

- anon key boleh berada pada public browser client sesuai desain Supabase;
- service-role key tidak boleh masuk browser atau client bundle;
- `DATABASE_URL`, Auth.js secret lama, Resend key, Google private key, dan cron
  secret tidak boleh masuk client bundle;
- Prisma tetap menjadi business-data access path server-side;
- jangan menambahkan broad Data API grants/RLS policy hanya untuk mempermudah
  integrasi Auth.

Hardening Data API/RLS Phase 21 sebelumnya dirancang untuk arsitektur Auth.js +
Prisma server-only. Perubahan policy untuk `auth.uid()` memerlukan security
review tersendiri dan tidak dilakukan.

## 10. Blockers and required manual approval

| Severity | Finding | Required decision |
|---|---|---|
| BLOCKER | `BigInt` application user ID tidak sama dengan UUID Supabase Auth ID | Setujui desain bridge: kolom UUID unique pada `users` atau dedicated identity-link table; sertakan FK, uniqueness, backfill, dan rollback plan |
| BLOCKER | Password bcrypt existing belum memiliki jalur import/provisioning aman | Setujui staged provisioning + user-driven Supabase recovery/password reset pada environment terisolasi |
| HIGH | Belum ada Supabase Auth dependency/client/env contract | Setelah dua blocker di atas disetujui, tambahkan package dan env melalui perubahan terkontrol |
| HIGH | `sessionVersion` belum memiliki replacement tervalidasi | Setujui desain revoke/reauthentication dan role-change invalidation |
| HIGH | Auth.js masih menjadi sistem aktif | Jangan hapus sebelum seluruh Supabase Auth E2E dan cutover acceptance lulus |
| MEDIUM | Password reset custom table/Resend masih aktif | Pertahankan sampai recovery E2E dan email delivery lulus |
| MEDIUM | Isolated Supabase Auth E2E environment belum tersedia | Sediakan project/database/auth fixture non-production; jangan gunakan production |
| MEDIUM | RLS/Data API identity policy belum didesain untuk `auth.uid()` | Review terpisah; jangan grant `anon ALL`/`authenticated ALL` |

**REQUIRES MANUAL APPROVAL:** seluruh schema/identity bridge, provisioning user,
password reset migration, session invalidation design, dan production cutover.

### Security note

Nilai credential koneksi database terlihat pada active-editor context yang
diberikan. Nilai tersebut tidak disalin atau ditampilkan ulang dalam laporan.
Operator sebaiknya melakukan rotation melalui secret manager sebelum memakai
credential itu untuk production; rotation tidak dilakukan oleh audit ini.

## 11. Validation performed

| Check | Result | Notes |
|---|---|---|
| Source/Auth.js audit | PASS | Current Auth.js flow and protected boundaries identified |
| Prisma user schema audit | BLOCKED | BigInt user identity; no UUID bridge |
| Password migration safety audit | BLOCKED | No approved hash import/provisioning path |
| Supabase Auth dependency/source scan | NOT FOUND | No Supabase Auth client or env reference |
| `npm.cmd run auth:security:verify` | FAIL | Existing fixture assertion for enumeration-safe source is brittle against current line endings; no migration/write was run |
| `git diff --check` | PASS WITH NORMAL WARNINGS | Only existing LF/CRLF conversion warnings reported |
| Supabase production writes | 0 | No database connection/write executed |
| Local database writes | 0 | `DATABASE_URL` not read or changed |
| Production deployment | NOT RUN | No Vercel/deployment command |
| Source/schema changes | 0 | No implementation was applied because gate is blocked |

The existing production baseline reports remain the source of prior database
parity evidence. This audit did not re-read database rows or credentials.

## 12. Files changed/created/removed

### Created

- `docs/SUPABASE_AUTH_MIGRATION_REPORT_2026-09-02.md`
- `docs/AUTH_MIGRATION_SCHEMA_PLAN.md` — design-only schema bridge plan;
  execution requires manual approval.

### Changed

- None for the Supabase Auth migration.

The working tree already contained changes from the preceding Vercel hardening
phase; those files were not modified by this audit.

### Removed

- None. Auth.js, custom reset infrastructure, Resend, Prisma schema, and all
  production artifacts were intentionally retained.

## 13. Safe next steps after approval

1. Produce and approve an identity-bridge schema plan without changing
   production.
2. Create an isolated Supabase Auth test project and non-production users.
3. Add official Supabase Auth client packages and server/browser boundary.
4. Implement login, logout, server session retrieval, role lookup, and recovery
   flow in a feature-isolated branch/environment.
5. Run the full isolated E2E matrix: login success/failure, protected route,
   logout, expiry/revocation, role authorization, recovery, password update,
   invalid recovery, and open-redirect protection.
6. Compare dashboard/KPI/chart/data-page regression behavior.
7. Run client bundle secret scan and production build without loading local
   secrets into logs.
8. Prepare an owner-approved provisioning/cutover/rollback window.
9. Only after acceptance, switch the primary system and remove Auth.js in a
   separate approved cleanup change.

## 14. Rollback strategy

Until cutover acceptance:

- keep Auth.js and the existing reset flow operational;
- do not remove `password_reset_tokens`, Resend code, `AUTH_SECRET`, or current
  route handlers;
- keep business Prisma schema/data unchanged;
- if staged Supabase Auth testing fails, discard only the isolated application
  change and retain the current deployment;
- after any approved identity bridge, rollback must be a reviewed forward/restore
  procedure, not an ad-hoc production delete/update.

No rollback action is required for this audit because no production state was
changed.

## Final status

```text
BLOCKED
```

The project is not ready for Supabase Auth migration until the identity bridge,
password provisioning/recovery, session invalidation, and isolated E2E strategy
are explicitly approved and validated. No Phase implementation or deployment
was started.
