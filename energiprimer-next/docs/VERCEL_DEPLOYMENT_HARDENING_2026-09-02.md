# Vercel Deployment-Ready Hardening

> **Auth note:** the Auth.js/Resend assumptions in this earlier hardening
> report are superseded by
> `SUPABASE_AUTH_NO_USER_MIGRATION_REPORT_2026-09-02.md`. The remaining
> non-auth Vercel findings remain historical audit context.

Tanggal audit: 2026-09-02  
Target: `energiprimer-next` pada Vercel Preview/Production  
Status deployment: **NOT RUN**

## 1. Scope dan batas keamanan

Audit dan hardening ini dilakukan tanpa:

- membaca, menyalin, atau mengubah `.env.local`;
- membaca isi directory `credentials/`;
- menampilkan nilai secret, password, API key, token, private key, atau
  connection string;
- koneksi atau penulisan ke PostgreSQL lokal maupun Supabase;
- migration, `prisma db push`, import, sync, atau reset database;
- deployment Vercel atau pemanggilan endpoint cron.

Validasi build menggunakan staging copy terisolasi tanpa `.env.local`,
`credentials/`, `.git`, `docs/`, dan data Excel. Staging hanya memakai
placeholder environment value untuk proses compile.

## 2. Hasil utama

| Area | Status | Temuan |
| --- | --- | --- |
| Framework | PASS | Next.js 16.3.3 App Router |
| Source structure | PASS | `src/app`, components, lib, services, types, Prisma, public, scripts, docs tersedia |
| Build-time database access | HARDENED | Protected application diberi `force-dynamic` |
| Prisma schema | PASS | `prisma validate` lulus pada staging |
| Production build | PASS (isolated staging) | `next build` lulus tanpa local env/credential/database |
| Environment readiness | NEEDS MANUAL CONFIGURATION | Nilai Vercel tidak dapat diverifikasi dari repository |
| Dependency audit | REVIEW REQUIRED | 3 HIGH pada dev/build tooling Prisma |
| Vercel readiness | **VERCEL_READY_WITH_REVIEW** | Code/build siap ditinjau; konfigurasi eksternal dan dependency finding masih perlu keputusan operator |

## 3. Environment variable audit

Status `NEEDS MANUAL CONFIGURATION` berarti variable harus diisi operator
melalui Vercel Dashboard. Karena `.env.local` dan Vercel Dashboard tidak
dibaca, status tidak menyatakan bahwa suatu variable sudah configured atau valid.

| Variable | Required | Server/Client | Source usage | Preview status |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | YES | Server-only | Prisma datasource dan import service | NEEDS MANUAL CONFIGURATION |
| `SUPABASE_DIRECT_URL` | NO untuk runtime app | Server/operator scripts | Schema/data/preflight scripts | NOT USED |
| `SUPABASE_POOLER_URL` | NO untuk runtime app | Server/operator scripts | Runtime verification scripts | NOT USED |
| `AUTH_SECRET` | YES | Server/framework | Auth.js implicit configuration | NEEDS MANUAL CONFIGURATION |
| `AUTH_TRUST_HOST` | Optional, recommended | Server/framework | Auth.js deployment configuration | OPTIONAL |
| `AUTH_URL` | YES untuk password reset production | Server-only | Password reset URL dan mail configuration | NEEDS MANUAL CONFIGURATION |
| `AUTH_MAILER` | YES jika password reset aktif | Server-only | Resend/log provider selection | NEEDS MANUAL CONFIGURATION |
| `MAIL_MAILER` | NO | Server-only | Legacy fallback | OPTIONAL |
| `RESEND_API_KEY` | YES jika `AUTH_MAILER=resend` | Server-only | Resend client | NEEDS MANUAL CONFIGURATION |
| `RESEND_FROM_EMAIL` | YES jika `AUTH_MAILER=resend` | Server-only | Sender validation | NEEDS MANUAL CONFIGURATION |
| `RESEND_TEST_RECIPIENT` | NO | Server/operator test only | Controlled mail verification | NOT USED |
| `CRON_SECRET` | YES jika Vercel Cron aktif | Server-only | Authorization sync route | NEEDS MANUAL CONFIGURATION |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | YES untuk sync Vercel | Server-only | Google service-account auth | NEEDS MANUAL CONFIGURATION |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | YES untuk sync Vercel | Server-only | Google service-account auth | NEEDS MANUAL CONFIGURATION |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | YES untuk sync Vercel | Server-only | Workbook discovery/read | NEEDS MANUAL CONFIGURATION |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Local-only alternative | Server-only | Local JSON credential loading | OPTIONAL; jangan gunakan sebagai dependency Vercel |
| `GOOGLE_SHEETS_CACHE_TTL` | NO | Server-only | Optional cache duration; default tersedia | OPTIONAL |
| `DASHBOARD_DATA_SOURCE` | NO, default PostgreSQL | Server-only | Dashboard source selector | OPTIONAL; rekomendasi `postgres` |
| `NEXT_PUBLIC_APP_NAME` | NO | Public client/server | UI metadata; fallback tersedia | OPTIONAL |
| `NEXT_PUBLIC_APP_URL` | NO bila `AUTH_URL` tersedia | Public client/server | Public config dan development fallback | OPTIONAL |
| `NODE_ENV` | Platform-provided | Server/client behavior | Next.js runtime mode | OPTIONAL |
| `AUTH_TEST_ADMIN_EMAIL`, `AUTH_TEST_ADMIN_PASSWORD` | NO | Test/operator only | Auth verification script | NOT USED |
| `AUTH_TEST_BASE_URL`, `AUTH_TEST_SECRET` | NO | Test/operator only | Auth verification script | NOT USED |

### Database endpoint rule

- Local development tetap menggunakan `DATABASE_URL` lokal yang sudah ada.
- Vercel Preview harus mengisi `DATABASE_URL` manual dengan Supabase
  Transaction Pooler pada port `6543`.
- Aplikasi Prisma membaca `DATABASE_URL`; aplikasi tidak otomatis
  menggantinya dengan `SUPABASE_POOLER_URL`.
- `SUPABASE_DIRECT_URL` hanya untuk script operator yang memerlukan direct
  connection.
- Parameter pooling/TLS tambahan adalah keputusan provider/operator dan tidak
  diubah otomatis.

## 4. Server/client boundary

| Boundary | Hasil |
| --- | --- |
| Prisma | `src/lib/prisma.ts` menggunakan `server-only` dan module singleton |
| Auth.js | `src/auth.ts` menggunakan `server-only`, bcrypt, dan Prisma server-side |
| Google Sheets | `src/lib/google-sheets.ts` menggunakan `server-only` dan Node APIs |
| Resend | `src/lib/mail/index.ts` menggunakan `server-only` |
| Data services | Dashboard, reports, monitoring, dan unit services ditandai server-only |
| Client components | Chart/filter/navigation/form tidak mengimpor Prisma, Auth.js, credential Google, Resend, atau service server |
| Public variables | Hanya `NEXT_PUBLIC_APP_NAME` dan `NEXT_PUBLIC_APP_URL` sebagai public config |

Static source/config scan tidak menemukan secret dengan prefix `NEXT_PUBLIC_`.
Credential directory dan `.env*` (kecuali `.env.example`) di-ignore Git.
Tracked sensitive-name check tidak menemukan `.env.local` atau path credential.

## 5. Next.js, routing, dan build-time access

- Project menggunakan App Router di `src/app`.
- Root `/` melakukan redirect berbasis session.
- Protected layout melakukan authorization role `admin` server-side.
- Semua dashboard/data page berada di bawah protected layout dan membaca data
  melalui service server.
- Tidak ditemukan `output: "export"`, `generateStaticParams`, atau
  static generation untuk dashboard data.
- `next.config.ts` mempertahankan security headers, `typedRoutes`,
  dan `poweredByHeader=false`.
- Root Directory Vercel harus diset manual ke `energiprimer-next`.

Safe fixes yang diterapkan:

1. Protected layout diberi `dynamic = "force-dynamic"` agar authenticated shell
   dan child route dievaluasi saat request.
2. Root page dan password-change page diberi dynamic guard karena membaca session.
3. Auth.js route diberi runtime `nodejs` dan `force-dynamic`.
4. `package.json` dan `package-lock.json` mendeklarasikan Node `>=20.9.0`.

Perubahan tersebut tidak mengubah query, API contract, business logic, schema,
atau authentication flow.

## 6. Vercel configuration audit

| Item | Repository finding | Status |
| --- | --- | --- |
| Root Directory | Repository juga memiliki project lain; gunakan `energiprimer-next` | NEEDS MANUAL CONFIGURATION |
| Framework | Next.js App Router | PASS |
| Install command | Default npm install/ `npm ci` dari lockfile | PASS |
| Build command | `npm run build` | PASS pada isolated staging |
| Local start | `npm run start` pada isolated staging | PASS; `/login` 200 dan anonymous `/dashboard` menghasilkan streaming redirect marker |
| Node.js | Next engine `>=20.9.0`; runtime Vercel belum dipin dari repository | NEEDS MANUAL CONFIGURATION |
| API runtime | Auth dan Google sync route Node.js | PASS |
| Cron | `/api/sync/google-sheets` dengan `0 1 * * *` | PASS |
| Persistent filesystem | Tidak ditemukan storage/upload persistence app | PASS |
| Docker/Procfile | Tidak ditemukan | PASS |

Cron tidak dipanggil pada audit ini. Sync engine tetap tidak diubah.

## 7. Prisma/PostgreSQL review

- `prisma/schema.prisma` memakai provider PostgreSQL dan `DATABASE_URL`.
- `src/lib/prisma.ts` membuat client pada module scope dan memakai global
  singleton untuk non-production development reload.
- Prisma tidak diimpor oleh Client Component.
- Tidak ada migration atau `prisma db push` yang dijalankan.
- Tidak ada local atau Supabase database write.
- Isolated production build menghasilkan dashboard/data route sebagai dynamic
  server-rendered route, tanpa query ke placeholder database.

Connection pooling Supabase, TLS, firewall, dan connection limit belum dapat
diverifikasi tanpa konfigurasi endpoint operator:
`NOT VERIFIED — requires operator verification`.

## 8. Authentication, Google Sheets, Resend, dan cron review

- Authorization admin dilakukan di Auth.js callback dan protected layout.
- Auth route dan sync route berjalan sebagai dynamic Node.js route.
- Sync route menolak request tanpa `CRON_SECRET`, membandingkan bearer secret
  secara constant-time, dan mengembalikan response agregat tanpa raw rows/credential.
- Google private key hanya dibaca dari server-side environment atau path file
  server; path credential lokal tidak boleh dijadikan dependency Vercel.
- Password reset production memerlukan `AUTH_URL`, `AUTH_MAILER=resend`,
  `RESEND_API_KEY`, dan `RESEND_FROM_EMAIL` yang diverifikasi operator.
- Tidak ada real-email smoke test, Google API call, cron call, atau auth E2E
  terhadap environment production/Preview pada task ini.

## 9. Dependency findings

`npm audit --omit=dev` mencapai registry tetapi berakhir exit code 1:

| Package | Severity | Issue | Scope | Recommendation |
| --- | --- | --- | --- | --- |
| `deepmerge-ts` `<8.0.0` | HIGH | Stack exhaustion pada recursive object graph | Rantai dev/build Prisma | Manual dependency review |
| `@prisma/config` `6.19.3` | HIGH | Terpengaruh dependency `deepmerge-ts` | Dev/build tooling | Jangan `npm audit fix --force` |
| `prisma` `6.19.3` | HIGH | Membawa rantai vulnerable config dependency | Direct devDependency | Upgrade/downgrade terkontrol dan regression test |

Audit menyarankan `npm audit fix --force` dengan perubahan Prisma breaking.
Perintah tersebut sengaja tidak dijalankan. Tidak ada major dependency upgrade otomatis.

## 10. Validation yang dijalankan

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run dashboard:verify-cutoff` | PASS; timezone `Asia/Makassar`, database writes `0` |
| `prisma generate` pada isolated staging | PASS |
| `prisma validate` pada isolated staging | PASS |
| `npm run build` pada isolated staging tanpa local env/credential | PASS |
| `npm run start` + anonymous route smoke pada isolated staging | PASS; temporary server/port sudah dihentikan |
| `npm audit --omit=dev` | REVIEW REQUIRED; 3 HIGH Prisma tooling findings |
| Database writes | `0` |
| Supabase writes | `0` |
| Migration/import/sync | NOT RUN |
| Vercel deployment | NOT RUN |

Build staging menampilkan warning workspace-root karena staging copy berada di
bawah project yang memiliki lockfile induk. Ini artefact validasi lokal, bukan
konfigurasi runtime Vercel; Root Directory Vercel tetap harus
`energiprimer-next`.

## 11. Requires manual approval/configuration

1. Set Vercel Root Directory ke `energiprimer-next`.
2. Pin Node.js runtime Vercel ke versi yang memenuhi `>=20.9.0`.
3. Isi `DATABASE_URL` Preview dengan Supabase Transaction Pooler port
   `6543`; jangan mengubah `DATABASE_URL` workstation.
4. Isi `AUTH_SECRET`, `AUTH_URL`, dan trust-host config sesuai domain.
5. Jika password reset aktif, isi `AUTH_MAILER`, `RESEND_API_KEY`, dan
   `RESEND_FROM_EMAIL` dengan sender/domain terverifikasi.
6. Isi Google service-account variables dan spreadsheet ID sebagai encrypted
   server-side variables; jangan upload `credentials/*.json`.
7. Isi `CRON_SECRET` dan pastikan batas waktu sync sesuai plan Vercel.
8. Putuskan remediation Prisma HIGH melalui upgrade/patch terkontrol, lalu ulangi
   audit dan regression validation.
9. Setelah konfigurasi selesai, lakukan Preview smoke test untuk redirect/login,
   dashboard read/chart, reset-mail non-production, dan cron authorization.

## 12. Final verdict

**VERCEL_READY_WITH_REVIEW**

Code hardening dan isolated production build sudah lulus. Project belum dapat
dinyatakan fully ready untuk deployment karena Root Directory, runtime pinning,
external environment values, Supabase pooler connectivity, Google credential
provisioning, Resend sender, dan HIGH dependency finding belum diverifikasi atau
membutuhkan keputusan manual.

Tidak ada deployment, migration, sync, import, atau database write yang dilakukan.
