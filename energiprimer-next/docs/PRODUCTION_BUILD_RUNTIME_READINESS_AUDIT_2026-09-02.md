# Phase 22F — Production Build & Runtime Readiness Audit

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Any recovery/mail references in
> this audit describe the pre-remediation state only.

Tanggal audit: 2026-09-02  
Scope: audit konfigurasi, source code, build, dependency, dan kesiapan runtime Vercel.  
Deployment tidak dilakukan.

## Executive Summary

Hasil audit teknis tidak menemukan kegagalan build, pelanggaran server/client boundary, atau akses Production yang dilakukan selama audit.

Status keseluruhan: **PASS_WITH_REVIEW**.

Aplikasi siap untuk tahap konfigurasi Preview/Production setelah operator menyelesaikan konfigurasi manual Vercel, Supabase Auth redirect, database pooler, Google Sheets, dan peninjauan vulnerability dependency development.

## Current Production Architecture

Arsitektur runtime yang terdeteksi:

    Browser
      └─ Supabase Auth session (public URL + anon key)
           └─ Next.js Proxy / Server Components
                └─ Prisma server-only
                     └─ PostgreSQL melalui DATABASE_URL

- Browser tidak mengakses PostgreSQL secara langsung.
- Dashboard utama membaca business data melalui Prisma/PostgreSQL.
- Google Sheets hanya digunakan oleh service/importer server-side ketika jalur tersebut diaktifkan.
- DASHBOARD_DATA_SOURCE=postgres direkomendasikan secara eksplisit untuk Production.

## Authentication Architecture

Audit source menunjukkan:

- Login menggunakan Supabase Auth signInWithPassword.
- Session dibaca dan dipertahankan melalui Supabase SSR/session cookie.
- Protected routes menggunakan server-side Supabase session melalui Proxy dan protected layout.
- Authorization admin menggunakan app_metadata.role melalui pemeriksaan server-side.
- Tidak ada dependency runtime wajib pada public.users untuk login admin.
- public.users.id tidak digunakan untuk mencocokkan UUID auth.users.id.
- Tidak ada Auth.js/NextAuth runtime yang tersisa.
- Tidak ada custom bcrypt password authentication.
- Tidak ada custom reset-token/password-recovery runtime.
- Password recovery menggunakan Supabase Auth; Resend bukan dependency recovery runtime.
- Service-role key tidak digunakan di browser/client bundle.

Status authentication boundary: **PASS**.

## Environment Variable Matrix

| Variable | Required | Server/Client | Source Usage | Production Requirement | Status |
| --- | --- | --- | --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | YES | Client-safe | Supabase browser/server client | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | YES | Client-safe public key | Supabase browser/server client | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| DATABASE_URL | YES | Server-only | Prisma datasource and dashboard queries | Supabase Transaction Pooler; port 6543 | MANUAL CONFIGURATION REQUIRED |
| CRON_SECRET | YES when cron enabled | Server-only | Google Sheets cron route authentication | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| GOOGLE_SHEETS_SPREADSHEET_ID | YES when sync enabled | Server-only | Google Sheets sync/reader | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | YES when sync enabled | Server-only | Google Sheets service authentication | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | YES when sync enabled | Server-only | Google Sheets service authentication | Set manually in Vercel | MANUAL CONFIGURATION REQUIRED |
| GOOGLE_SHEETS_CREDENTIALS_PATH | OPTIONAL | Server-only | Local credential-file alternative | Not suitable as the only Vercel configuration | REVIEW |
| GOOGLE_SHEETS_CACHE_TTL | OPTIONAL | Server-only | Google Sheets cache duration | Optional; source has default | OPTIONAL |
| DASHBOARD_DATA_SOURCE | OPTIONAL in source | Server-only | Selects dashboard source | Set explicitly to postgres | RECOMMENDED MANUAL CONFIGURATION |
| NEXT_PUBLIC_APP_URL | OPTIONAL in source | Client-safe | Application URL/safe redirect fallback | Set to final Preview/Production URL | RECOMMENDED MANUAL CONFIGURATION |
| NEXT_PUBLIC_APP_NAME | OPTIONAL | Client-safe | Application display name | Optional; source has default | OPTIONAL |
| SUPABASE_DIRECT_URL | NO for app runtime | Server/operator scripts | Direct connection for operator/preflight tasks | Not a runtime requirement | NOT USED BY PRODUCTION RUNTIME |
| SUPABASE_POOLER_URL | NO for app runtime | Server/operator scripts | Pooler connection for operator/preflight tasks | Not a runtime requirement | NOT USED BY PRODUCTION RUNTIME |
| AUTH_SECRET | NO | N/A | No final Supabase Auth runtime usage found | Do not add solely for this app | NOT USED |
| RESEND_API_KEY / RESEND_FROM_EMAIL | NO | N/A | No final password-recovery runtime usage found | Do not add solely for this app | NOT USED |
| E2E-only variables | NO | E2E-only | Playwright and E2E provisioning | Never use as Production config | NOT USED BY PRODUCTION RUNTIME |

Catatan keamanan: audit hanya memeriksa nama, source usage, dan konfigurasi non-secret. Nilai .env.local tidak dibaca atau diverifikasi. Nilai Production harus dimasukkan operator melalui Vercel Dashboard.

## Prisma / Database Architecture

- prisma/schema.prisma memakai DATABASE_URL sebagai datasource.
- Prisma client berada pada module server-only dan menggunakan singleton lifecycle yang sesuai untuk server runtime.
- Prisma tidak diimpor oleh Client Component.
- Schema validation berhasil.
- Tidak ada migration, db push, seed, import, atau write yang dijalankan dalam audit ini.
- Untuk Vercel, DATABASE_URL harus diarahkan ke Supabase Transaction Pooler, bukan connection string local.
- Port pooler yang ditargetkan adalah 6543.
- Source tidak menambahkan parameter pooler secara otomatis; operator harus memverifikasi connection string Supabase yang dipilih kompatibel dengan Prisma/transaction pooler, termasuk parameter pooler yang diwajibkan oleh koneksi tersebut.

Status Prisma/build compatibility: **PASS_WITH_REVIEW** karena nilai dan validitas connection string Production belum diverifikasi dalam audit yang dilarang membaca .env.local.

## Dashboard Runtime Audit

- Dashboard utama, KPI, chart, unit breakdown, stock, target, dan halaman fuel menggunakan server-side data access.
- Query dashboard utama menggunakan cutoff tanggal real-world berdasarkan timezone operasional Asia/Makassar, yaitu satu calendar day sebelum tanggal saat ini.
- Filter tanggal membatasi pilihan terhadap cutoff dan query server kembali melakukan constraint.
- Data setelah cutoff tidak dihapus atau diubah.
- Tidak ditemukan pengiriman object database mentah yang sensitif ke client pada jalur dashboard utama.
- Halaman auxiliary /data-batu-bara dan /laporan memiliki jalur filter/report tersendiri yang tidak seluruhnya menerapkan cutoff dashboard utama. Ini tidak menggagalkan build, tetapi perlu review bila kebijakan cutoff harus berlaku identik pada seluruh halaman historis.

Status main dashboard runtime: **PASS**.  
Status auxiliary historical cutoff parity: **REVIEW**.

## Production Build

Validasi dilakukan di workspace sementara yang terisolasi dari .env.local, dengan environment non-production yang di-allowlist. Workspace sementara telah dibersihkan setelah validasi.

| Check | Result |
| --- | --- |
| Prisma schema validation | PASS |
| Next.js compilation | PASS |
| TypeScript phase during build | PASS |
| Static route generation | PASS |
| Route compilation | PASS |
| Security headers configuration | PASS |
| Build cache | WARNING — cache belum tersedia, non-blocking |
| Production deployment | NOT RUN |

Route utama dan route handler berhasil dikompilasi, termasuk dashboard, auth callback, protected pages, dan cron sync route.

Peringatan workspace root/lockfile yang muncul berasal dari temporary build harness, bukan perubahan project source dan bukan konfigurasi Production yang diverifikasi.

## Supabase Connection Configuration

Konfigurasi runtime Production yang diperlukan:

- Supabase Auth URL dan anon key: client-safe, dikonfigurasi melalui NEXT_PUBLIC_*.
- Prisma business data: DATABASE_URL server-only.
- Vercel Preview/Production: DATABASE_URL harus menggunakan Supabase Transaction Pooler port 6543.
- SUPABASE_DIRECT_URL dan SUPABASE_POOLER_URL hanya digunakan oleh tooling/operator tertentu; keduanya tidak interchangeable dengan DATABASE_URL secara otomatis.
- Validasi terhadap nilai Production tidak dilakukan karena audit tidak membaca .env.local.

## Cron Audit

vercel.json mendefinisikan:

    /api/sync/google-sheets
    schedule: 0 1 * * *

- Frekuensi: satu kali per hari.
- Route meminta CRON_SECRET dan menggunakan perbandingan constant-time.
- Credential Google Sheets dipakai server-side.
- Cron route memang write-capable terhadap data aplikasi ketika dipanggil dengan konfigurasi yang valid, tetapi tidak dipanggil dalam audit ini.
- Operator harus memastikan plan Vercel mendukung maxDuration=300 dan batas runtime cron yang dipakai.

Status cron source hardening: **PASS**.  
Status operational Vercel plan/configuration: **REVIEW**.

## Date Cutoff Audit

- Timezone operasional didefinisikan eksplisit sebagai Asia/Makassar.
- Cutoff dihitung dari real-world calendar date dikurangi satu hari kalender.
- Cutoff tidak bergantung pada tanggal terbaru di database, Google Sheets, atau timestamp sync.
- KPI/chart/filter dashboard utama menerapkan batas tanggal tersebut.
- Data post-cutoff tetap dipertahankan di database.

Status: **PASS** untuk dashboard utama; **REVIEW** untuk parity halaman auxiliary yang disebutkan di atas.

## Security Audit

Hasil pemeriksaan statis:

- Tidak ditemukan hardcoded credential, password, API key, atau private key pada source/configuration yang diaudit.
- Secret server-side tidak menggunakan prefix NEXT_PUBLIC_.
- Google service account module memakai server-only.
- Prisma module memakai server-only.
- Auth secret/service-role key tidak masuk client bundle berdasarkan import boundary yang diaudit.
- Proxy dan route handlers tidak mencetak secret/token.
- Security headers tersedia; HSTS diterapkan pada Production.
- Credential directory dan environment files sensitif di-ignore Git; .env.example tidak berisi credential nyata.
- Tidak ada Production database write, Supabase write, deployment, migration, seed, import, atau sync yang dilakukan.

Status security source audit: **PASS**.

## Vercel Readiness

| Area | Result |
| --- | --- |
| Framework | Next.js 16.3.3 |
| Node requirement | >=22.0.0; audit runner menggunakan Node 24.17.0 |
| Build command | npm run build / Next build |
| Install command | Vercel default install atau npm ci sesuai konfigurasi project |
| Root Directory | Harus dikonfigurasi manual sebagai energiprimer-next |
| Runtime | Node.js server runtime; cron route Node runtime |
| Prisma | Compatible setelah DATABASE_URL pooler Production dikonfigurasi dan diverifikasi |
| Supabase Auth | Compatible; redirect allowlist masih perlu konfigurasi domain final |
| Google Sheets | Compatible server-side; gunakan env credential, bukan file lokal |
| Filesystem persistence | Tidak ditemukan kebutuhan persistent uploads/storage untuk dashboard runtime utama |
| Background jobs | Tidak ada worker persisten; sync menggunakan Vercel Cron route |
| File uploads | Tidak ditemukan dependency persistent upload pada runtime utama |
| Known limitation | Vercel filesystem ephemeral; jangan menambah persistence lokal tanpa storage eksternal/manual approval |

## Auth Callback Readiness

/auth/callback menggunakan server-side code exchange dan safe redirect handling. Sebelum Preview/Production:

- tambahkan URL callback Preview/Production yang benar pada Supabase Auth redirect allowlist;
- set NEXT_PUBLIC_APP_URL sesuai domain yang digunakan bila diperlukan oleh safe redirect fallback;
- verifikasi domain, cookie, dan HTTPS melalui Vercel Preview secara manual.

Tidak ada perubahan Supabase Production yang dilakukan oleh audit ini.

## Dependency Audit

npm audit menghasilkan **5 HIGH vulnerability findings**, tanpa CRITICAL, MODERATE, atau LOW pada hasil audit.

| Package / dependency | Severity | Production usage | Finding / recommendation |
| --- | --- | --- | --- |
| @playwright/test | HIGH | Development/test only | Review and update to a supported compatible version; no automatic update performed |
| playwright | HIGH | Development/test only | Review safe patch for browser-download SSL issue; no automatic update performed |
| prisma / @prisma/config | HIGH | Build/operator tooling; Prisma client is runtime dependency | Review manually because dependency graph and version compatibility must be preserved |
| deepmerge-ts | HIGH | Transitive Prisma tooling dependency | No safe automatic remediation established; audit recommendation requires manual review |

npm audit fix --force tidak dijalankan. Tidak ada major dependency upgrade yang dilakukan.

Status dependency gate: **REVIEW**, bukan build blocker; peninjauan dan patch terkontrol tetap diperlukan sebelum penggunaan Production.

## Production Safety

Audit ini:

- tidak membaca .env.local;
- tidak mengubah .env.local atau environment file lain;
- tidak menggunakan credential Production;
- tidak menghubungi atau menulis ke Production Supabase/PostgreSQL;
- tidak menjalankan migration, db push, seed, import, sync, atau deployment;
- tidak mengubah source code atau authentication architecture.

## Findings

### Non-blocking findings

1. Konfigurasi environment Vercel belum dapat dinyatakan configured/valid tanpa tindakan operator melalui Vercel Dashboard.
2. DATABASE_URL Production harus dipastikan memakai Supabase Transaction Pooler port 6543 dan parameter yang sesuai untuk Prisma.
3. Supabase Auth redirect allowlist dan final application URL harus dikonfigurasi untuk Preview/Production.
4. Google Sheets production credential harus dipasang sebagai environment variables server-side bila cron sync diaktifkan.
5. Dependency audit memiliki lima HIGH findings pada tooling/dependency graph dan membutuhkan review manual.
6. Auxiliary historical/report pages perlu review bila one-day cutoff harus berlaku pada seluruh halaman, bukan hanya dashboard utama.
7. Dukungan plan Vercel terhadap cron dan maxDuration=300 perlu diverifikasi operator.

## Blockers

Tidak ada blocker teknis yang terdeteksi pada source/build audit.

Preview tetap belum boleh dianggap siap dijalankan sampai konfigurasi manual pada bagian Findings selesai diverifikasi oleh operator.

## Recommended Next Phase

1. Konfigurasikan environment Preview di Vercel tanpa menampilkan secret ke chat.
2. Set DATABASE_URL Preview ke Supabase Transaction Pooler port 6543 dan lakukan runtime smoke test read-only.
3. Konfigurasikan Supabase Auth redirect URL untuk domain Preview.
4. Konfigurasikan Google Sheets dan CRON_SECRET hanya jika cron sync akan diaktifkan pada Preview.
5. Tinjau patch dependency HIGH secara terkontrol tanpa force upgrade.
6. Putuskan apakah cutoff one-day juga wajib untuk /data-batu-bara dan /laporan.
7. Jalankan Preview deployment hanya setelah manual configuration gate disetujui.

## Final Status

**PASS_WITH_REVIEW**

Build dan source-level runtime readiness telah lulus. Item yang tersisa adalah konfigurasi operator dan review dependency/auxiliary behavior yang tidak dapat diselesaikan secara aman tanpa keputusan manual. Tidak ada deployment yang dilakukan dan Phase berikutnya tidak dijalankan otomatis.
