# Phase 22 — Vercel Preview Deployment & Production-like E2E Report

Tanggal audit: 2026-09-01  
Target: Vercel Preview untuk `energiprimer-next`  
Scope: preparation, validation, dan deployment Preview saja

## Status

**BLOCKED — Vercel Preview belum dapat dijalankan karena akses project/deployment tidak tersedia pada workspace ini.**

Status ini bersifat operasional, bukan indikasi bahwa build lokal atau database rusak. Tidak ada deployment, cutover, sync, import, schema migration, atau perubahan data yang dilakukan.

## Safety boundary

- `DATABASE_URL` lokal tidak diubah.
- PostgreSQL lokal tidak menerima write.
- Supabase tidak menerima write.
- Tidak ada `prisma migrate`, `prisma migrate deploy`, `prisma db push`, import, atau Google Sheets sync.
- Tidak ada deployment production dan tidak ada pengaktifan cron secara operasional.
- `.env.local`, credential, API key, password, private key, dan secret tidak dicetak atau disalin.
- Artefak Prisma yang dibuat ulang hanya berada di `node_modules` dan tidak mengubah schema/database.

## Vercel access audit

| Check | Result | Evidence |
|---|---|---|
| Vercel CLI | BLOCKED | `vercel` tidak tersedia pada PATH |
| Local Vercel project metadata | BLOCKED | direktori `.vercel` tidak tersedia |
| Preview URL | BLOCKED | belum ada deployment Preview yang dapat diuji |
| Vercel project/org credential | BLOCKED | tidak tersedia pada environment workspace; tidak ada credential yang ditebak |
| Repository target | PASS | aplikasi berada pada root `energiprimer-next` |
| Vercel config | REVIEW | `vercel.json` mendeklarasikan `/api/sync/google-sheets` setiap 15 menit; jangan mengaktifkan/menjalankan sync pada tahap ini |

## Local validation

| Check | Status | Catatan |
|---|---|---|
| `npm ci` | PASS | clean install selesai; npm melaporkan 3 HIGH dependency findings |
| `npm run db:generate` | PASS | generated Prisma Client lokal dipulihkan setelah clean install; tidak menyentuh database |
| Prisma schema validation (env-loaded) | PASS | `prisma/schema.prisma` valid dengan `.env.local` dimuat tanpa mencetak nilainya |
| `npm run lint` | PASS | ESLint selesai tanpa error |
| `npx tsc --noEmit` | PASS | lulus setelah Prisma Client dibuat ulang |
| `npm run build` | PASS | Next.js production build berhasil |
| Route registration | PASS | seluruh route App Router terdaftar pada output build |
| Client secret scan | PASS | `NO_SECRET_MARKERS_IN_NEXT_STATIC` |
| Internal hard navigation scan | PASS | tidak ditemukan `window.location.href` atau `window.location.reload` pada `src` |
| `npm run db:verify` | PASS | koneksi/read lokal dan orphan check lulus; local writes = 0 |
| `npm run auth:security:verify` | PASS | static/security fixture lulus; live auth E2E belum tersedia |

Route yang terdaftar pada build:

`/`, `/login`, `/forgot-password`, `/reset-password/[token]`, `/password/change`,
`/dashboard`, `/dashboard/biomassa`, `/dashboard/batubara`, `/dashboard/solar`,
`/dashboard/stok`, `/dashboard/target`, `/data-batu-bara`, `/monitoring`,
`/laporan`, `/pengaturan`, `/api/auth/[...nextauth]`, dan
`/api/sync/google-sheets`.

## Dependency finding

`npm audit --omit=dev` melaporkan 3 HIGH pada `deepmerge-ts`, melalui
`@prisma/config` dan `prisma`. Remediasi otomatis yang ditawarkan akan
menggunakan Prisma 6.12.0 dan merupakan perubahan breaking. Perintah
`npm audit fix --force` sengaja tidak dijalankan.

Status: **REQUIRES MANUAL APPROVAL** untuk evaluasi upgrade Prisma atau
mitigasi vendor. Tidak ada perubahan dependency Phase 22 yang diterapkan.

## Supabase and data safety evidence

Phase 21G sebelumnya memverifikasi target Supabase secara read-only:

- Direct Connection: PASS.
- Transaction Pooler: PASS WITH REVIEW; parameter SSL `verify-full` diterima,
  tetapi visibility SSL backend dibatasi oleh PgBouncer.
- PostgreSQL target: 17.6; schema `public`.
- Prisma schema/migration status: PASS.
- Data parity: PASS; 8.754 business/application rows dan 16 tabel approved.
- Dashboard read verification: PASS pada local, Direct, dan Pooler.
- Local `DATABASE_URL`: tetap menunjuk PostgreSQL lokal.

Untuk Phase 22 tidak ada query write atau mutasi target. Baseline lokal yang
disetujui tetap: 2.409 verified rows, duplicate = 0, orphan = 0, Unit 1–3,
dan target biomassa 70.020 ton. Verifikasi lokal tambahan hanya membaca data.

## Environment readiness

Preview harus dikonfigurasi terpisah dari `.env.local`. Nama variable yang
perlu disiapkan operator (nilai tidak dicatat di laporan):

- `DATABASE_URL` — endpoint Supabase untuk Preview, bukan loopback lokal.
- `DASHBOARD_DATA_SOURCE` — `postgres`.
- `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`.
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`.
- `CRON_SECRET` — secret Preview terpisah; jangan gunakan secret production.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
  `GOOGLE_SHEETS_SPREADSHEET_ID`, dan `GOOGLE_SHEETS_CACHE_TTL`.
- `AUTH_MAILER`, `RESEND_API_KEY`, dan `RESEND_FROM_EMAIL` jika reset email
  diuji pada Preview.

`GOOGLE_SHEETS_CREDENTIALS_PATH` tidak boleh menjadi dependency file lokal pada
Vercel. Credential Google harus menggunakan pasangan environment server-side.
Tidak ada variable sensitif yang memakai prefix `NEXT_PUBLIC_`. Audit key lokal
menunjukkan `AUTH_URL` dan `VERCEL_*` tidak tersedia di `.env.local`; keduanya
harus disiapkan/diatur oleh operator pada Preview sesuai kebutuhan, bukan
ditebak oleh agent.

## Auth, Resend, Google Sheets, and cron

| Area | Status | Reason |
|---|---|---|
| Auth source/security checks | PASS | authorization server-side, safe redirect, cookie/session checks lulus pada fixture |
| Live Preview login E2E | `AUTH_E2E_ENV_NOT_AVAILABLE` | belum ada Preview URL dan akun uji terisolasi |
| Resend real-email E2E | BLOCKED | belum ada Preview sender/domain terverifikasi dan recipient approval |
| Google Sheets Preview read | NOT EXECUTED | tidak ada Preview; Phase 22 melarang production sync/import |
| Cron unauthorized request | PASS (existing fixture) | route menolak authorization yang hilang/salah |
| Cron authorized request | NOT EXECUTED | dapat memulai sync; sengaja tidak dipanggil |

## Performance and boundary review

- Build menggunakan Next.js 16.3.3 dan App Router.
- Data fetching tetap server-side; chart/client interaction tidak melakukan
  fetch tambahan.
- Prisma, Google credential, Auth secret, Resend key, dan cron secret tetap di
  server boundary.
- Client static output tidak mengandung marker secret pada scan.
- Node lokal yang digunakan adalah 24.17.0. `package.json` belum mem-pin
  `engines.node`; pemilihan Node 20/22/24 pada Vercel memerlukan keputusan
  deployment manual.
- Web Vitals dan ukuran Preview function belum dapat diukur tanpa deployment.

## Preview E2E result

Tidak ada Preview URL, sehingga smoke/E2E berikut **belum dijalankan**:

- redirect unauthenticated dan login akun uji;
- authorization direct request;
- forgot/reset flow dan email delivery;
- dashboard route dan filter;
- tooltip/legend/touch chart;
- read-only Supabase runtime dari URL Preview;
- Google worksheet read-only;
- log/function error/Web Vitals.

Ini diklasifikasikan sebagai **BLOCKED**, bukan PASS atau FAIL, karena
environment pengujian belum tersedia.

## Files changed by Phase 22

- `docs/PHASE22_VERCEL_PREVIEW_REPORT_2026-09-01.md`
- `docs/PHASE22_VERCEL_PREVIEW_RUNBOOK.md`

Worktree telah memiliki banyak perubahan dari phase sebelumnya. File-file
tersebut tidak diubah atau diklaim sebagai perubahan Phase 22.

## Safe fixes applied

1. Menjalankan `npm ci` untuk clean dependency validation.
2. Menjalankan `npm run db:generate` untuk memulihkan generated Prisma Client
   lokal yang tidak lengkap setelah clean install.
3. Mengulang lint, TypeScript, build, secret scan, database read verification,
   dan auth security verification.

Tidak ada perubahan pada source business logic, API contract, Prisma schema,
database, authentication architecture, Google Sheets data, atau dependency
version.

## Requires manual approval

- Membuat/link project Vercel dan memberikan akses Preview deployment.
- Menentukan dan mem-pin Node runtime Vercel.
- Provisioning seluruh Preview environment variable dengan secret terpisah.
- Menyediakan akun Auth E2E terisolasi.
- Verifikasi sender/domain Resend dan persetujuan satu recipient uji.
- Memberikan akses Google Sheets read-only untuk Preview.
- Keputusan remediation 3 HIGH dependency finding Prisma/deepmerge-ts.
- Aktivasi cron dan production cutover pada phase terpisah.

## Blockers

1. Vercel CLI/project metadata/Preview URL tidak tersedia, sehingga Preview
   deployment dan production-like E2E tidak dapat dilaksanakan.
2. Live Auth E2E environment belum tersedia.
3. Real Resend email test belum memenuhi sender/recipient gate.

## Final recommendation

Ikuti [Phase 22 Preview Runbook](./PHASE22_VERCEL_PREVIEW_RUNBOOK.md) secara
manual melalui Vercel Dashboard atau CLI yang telah di-login oleh operator.
Setelah Preview URL dan deployment ID tersedia, jalankan ulang smoke/E2E
read-only dan review findings sebelum membahas production cutover.

**Phase 22 final status: `BLOCKED`.**

**Production deployment: NOT EXECUTED.**
