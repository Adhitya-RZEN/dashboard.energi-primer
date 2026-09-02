# PHASE 21G - SUPABASE PRODUCTION RUNTIME VALIDATION

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Any recovery/mail references in
> this runtime report are not current application behavior.

Tanggal audit: 2026-09-01
Scope: validasi runtime read-only dan persiapan cutover
Target: Supabase PostgreSQL melalui server-side Prisma

## Status akhir

**PASS WITH REVIEW**

Runtime Prisma, schema, parity data, query dashboard, dan boundary keamanan
lulus. Preview Vercel, production cutover, cron production, Google Sheets sync,
dan deployment tidak dijalankan. Beberapa konfigurasi production masih
memerlukan persetujuan/manual setup.

## Ringkasan hasil

| Area | Status | Bukti/remark |
|---|---|---|
| Supabase Direct Connection | PASS | Reachable, PostgreSQL 17.6, database postgres, schema public |
| Supabase Transaction Pooler | PASS WITH REVIEW | Port 6543, Prisma query PASS, pgbouncer=true dan sslmode=verify-full dipakai di child process; SSL client session tidak dilaporkan oleh backend PgBouncer |
| SSL/TLS | PASS WITH REVIEW | Direct: server session SSL PASS; Pooler: parameter verify-full diterima, pg_stat_ssl backend NOT_REPORTED_BY_POOLER |
| Prisma schema | PASS | prisma/schema.prisma dan prisma/production/schema.prisma valid |
| Migration status | PASS | Direct target UP_TO_DATE_OR_NO_PENDING_MIGRATIONS |
| Database parity | PASS | 16 tabel approved, missing 0, extra 0, mismatch 0 |
| Dashboard read verification | PASS | Query service dashboard lulus pada local, Direct, dan Pooler |
| Auth.js architecture | PASS WITH REVIEW | Source/security checks PASS; live E2E AUTH_E2E_ENV_NOT_AVAILABLE |
| Password reset/Resend | REVIEW | Fixture/mocked provider PASS; real production sender/domain belum diverifikasi |
| Google Sheets | REVIEW | Server-only boundary PASS; Vercel environment pair belum provisioned |
| Cron | REVIEW | Route authorization PASS; declaration ada, production cron belum diaktifkan |
| Supabase Data API exposure | PASS WITH REVIEW | anon dan authenticated tidak memiliki privilege pada application tables; RLS app tables masih disabled dan perlu keputusan policy |
| Client secret scan | PASS | Tidak ada marker secret pada .next/static |
| Local database | UNCHANGED | DATABASE_URL tetap local; local writes 0 |
| Deployment/cutover | NOT RUN | Tidak ada deployment atau perubahan runtime production |

## Database connection dan object inventory

Semua URL hanya dipakai di child process untuk test dan tidak dicetak.

| Endpoint | Connection | SSL evidence | PostgreSQL | Database | Role | Schema | Writes |
|---|---|---|---|---|---|---|---:|
| Local DATABASE_URL | PASS | Tidak diwajibkan untuk local | 18.4 | dashboard_pln | postgres | public | 0 |
| Supabase Direct | PASS | Server session SSL PASS | 17.6 | postgres | postgres | public | 0 |
| Supabase Pooler | PASS | sslmode=verify-full; backend session tidak dilaporkan PgBouncer | 17.6 | postgres | postgres | public | 0 |

Supabase target berisi 31 base tables pada public: 30 application tables dan
_prisma_migrations. Inventory object yang terbaca secara read-only:

- 25 public sequences;
- 1 public function;
- 0 public views/materialized views;
- 5 extensions: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, dan uuid-ossp.

Target bukan database kosong karena memang telah melalui Phase 21F. Jumlah
business/application rows tetap **8.754** pada Direct dan Pooler. Tidak ada
query write pada Phase 21G.

## Data parity dan integrity

Phase 21F parity verifier dijalankan ulang secara read-only. Seluruh 16 tabel
yang diizinkan cocok persis dengan source local untuk scope Januari-Juli 2026:

| Check | Hasil |
|---|---:|
| Source/target row parity | PASS |
| Missing rows | 0 |
| Extra rows | 0 |
| Mismatched rows | 0 |
| Duplicate groups | 0 |
| Orphan foreign keys | 0 |
| Sequence checks | PASS |
| Aggregate checks | PASS |
| Registry worksheet checks | PASS |
| Unit order | Unit 1, Unit 2, Unit 3 |
| Target Biomassa | 70.020 ton |
| BIOMASS_STOCK | Tetap di luar scope |
| Auth/ambiguous sync history | Tetap tidak dimigrasikan |

Non-zero approved table counts pada target:

| Table | Rows |
|---|---:|
| units | 3 |
| coal_stock | 212 |
| coal_consumption | 636 |
| sync_sources | 1 |
| sync_worksheets | 7 |
| sync_row_states | 2.409 |
| spreadsheet_import_runs | 12 |
| spreadsheet_import_staging | 3.919 |
| biomass_receipts | 49 |
| coal_receipts | 7 |
| biomass_consumptions | 636 |
| solar_receipts | 7 |
| solar_consumptions | 212 |
| hop_readings | 636 |
| biomass_targets | 1 |
| biomass_cumulative_snapshots | 7 |

## Prisma validation

Commands yang dijalankan dengan env loader lokal yang eksplisit:

    node --env-file-if-exists=.env.local node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
    node --env-file-if-exists=.env.local node_modules/prisma/build/index.js validate --schema prisma/production/schema.prisma
    npm run supabase:production:migrate-status

Hasil:

- kedua schema valid;
- migration status Direct target PASS dan tidak ada pending migration;
- local DATABASE_URL tidak disentuh oleh status check;
- prisma migrate, prisma migrate deploy, prisma db push, dan reset tidak dijalankan.

## Dashboard read verification

Verifier runtime baru scripts/verify-supabase-production-runtime.ts menggunakan
service production dashboard yang sama, yaitu src/services/overview-postgres.ts.
Tidak ada fetch client atau write dari chart/page.

Hasil Direct dan Pooler identik dengan local baseline untuk Juli 2026:

| Metric | Nilai terverifikasi |
|---|---:|
| Penerimaan Biomassa bulanan | 3.223,46 ton |
| Pemakaian Biomassa bulanan | 3.740,65 ton |
| Penerimaan Batubara bulanan | 30.084,842 ton |
| Pemakaian Solar bulanan | 24.274 liter |
| Penerimaan Solar bulanan | 25.000 liter |
| Kumulatif Biomassa | 29.103,77 ton |
| Target Biomassa | 70.020 ton |
| Progress target | 41,564938...% |
| Pemakaian Biomassa 28 Juli | 183,6 ton |
| Pemakaian Batubara 28 Juli | 1.592,57 ton |
| Pemakaian Solar 28 Juli | 854 liter |
| Urutan unit | Unit 1, Unit 2, Unit 3 |
| Series Juli | 31 titik |

Coverage periode Januari-Juli juga PASS: masing-masing bulan memiliki data,
series chart, dan metric pemakaian Biomassa, Batubara, serta Solar. Fallback
request Agustus 2026 tetap menunjuk data terakhir Juli 2026. Nilai null pada
series tetap diterima sebagai gap data dan tidak dipaksa menjadi angka nol.

Seluruh route berikut memakai service yang sama dan tervalidasi melalui query
read:

    /dashboard
    /dashboard/biomassa
    /dashboard/batubara
    /dashboard/solar
    /dashboard/stok
    /dashboard/target

## Auth.js dan password reset

Source/security fixture audit PASS untuk:

- email normalization dan validation;
- bcrypt password verification path;
- server-side admin authorization;
- JWT session strategy dengan expiration dua jam;
- session role/sessionVersion revalidation;
- safe redirect callback;
- reset token generation, expiry 60 menit, invalidation, dan throttling;
- enumeration-safe forgot-password response;
- HTTP-only/SameSite cookie behavior pada proxy;
- sanitized error path.

Target Supabase memiliki 0 users, 0 sessions, dan 0 password_reset_tokens,
sesuai keputusan Phase 21F bahwa authentication tidak dimigrasikan. Karena
environment E2E terisolasi belum tersedia, live login, role check, dan password
verification terhadap target tidak dijalankan.

Status wajib: **AUTH_E2E_ENV_NOT_AVAILABLE**. Tidak ada user, password,
session, atau credential yang dibuat/diubah.

Password reset hanya divalidasi sebagai konfigurasi dan melalui mock provider.
Real email production tidak dikirim. Status production sender/domain:
**RESEND_PRODUCTION_EMAIL_NOT_READY** sampai konfigurasi Resend diverifikasi
secara manual.

## Google Sheets dan cron

Google Sheets sync production tidak dijalankan. Audit fixture konfigurasi
menunjukkan pasangan service account server-side dikenali dan partial
configuration ditolak. Source boundary menggunakan server-only module; tidak
ada Google private key pada client bundle.

Untuk Vercel, GOOGLE_SERVICE_ACCOUNT_EMAIL dan
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY wajib diprovision sebagai environment
variables server-side. Local credential file fallback tidak dianggap tersedia
di Vercel.

Route /api/sync/google-sheets:

- runtime Node.js;
- CRON_SECRET wajib ada;
- bearer secret benar diterima;
- secret salah atau tidak ada ditolak;
- authorized route tidak dipanggil pada Phase 21G karena akan menjalankan sync;
- scheduler production tidak diaktifkan.

vercel.json saat ini mendeklarasikan route tersebut setiap 15 menit.
Deklarasi tersebut belum menjadi cron production aktif karena belum ada
deployment. Aktivasi tetap menunggu environment secret dan approval manual.

## Security dan environment

Hasil Phase 21E-S2 yang diverifikasi ulang:

- anon: 0 privilege pada 31 public tables; SELECT/INSERT/UPDATE/DELETE denied;
- authenticated: 0 privilege pada 31 public tables; SELECT/INSERT/UPDATE/DELETE denied;
- Prisma/server role dapat membaca application tables;
- tidak ada browser Supabase client pada source;
- tidak ada NEXT_PUBLIC_* untuk database credential, Auth secret, cron secret,
  Resend key, atau Google private key;
- .env.example berisi placeholder tanpa nilai credential;
- .env.local, .env, dan directory credential tidak tracked berdasarkan
  pemeriksaan Git;
- scan .next/static tidak menemukan marker DATABASE_URL, AUTH_SECRET,
  CRON_SECRET, RESEND_API_KEY, Google private key, atau private-key header.

Environment matrix ringkas:

| Variable class | Variables | Local | Preview/Production |
|---|---|---|---|
| Server secret | DATABASE_URL, SUPABASE_DIRECT_URL, SUPABASE_POOLER_URL, AUTH_SECRET, CRON_SECRET, RESEND_API_KEY, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Operator-configured as applicable | Wajib diprovision di Vercel secret environment; belum diubah |
| Server/config | AUTH_URL, AUTH_MAILER, RESEND_FROM_EMAIL, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CACHE_TTL, AUTH_TRUST_HOST, DASHBOARD_DATA_SOURCE | Sebagian tersedia/local fallback | Wajib ditinjau dan diisi sesuai environment |
| Public | NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL | Tersedia | Set canonical preview/production origin |
| Test-only | AUTH_TEST_BASE_URL, AUTH_TEST_ADMIN_EMAIL, AUTH_TEST_ADMIN_PASSWORD, AUTH_TEST_SECRET | Tidak tersedia | Tidak boleh dipakai pada production |

DATABASE_URL operator saat ini tetap menunjuk local PostgreSQL loopback.
Perubahan ke Supabase hanya boleh dilakukan pada Vercel environment setelah
approval cutover; Phase 21G tidak mengubahnya.

## Performance dan Vercel compatibility

Hasil review:

- Prisma client memakai process singleton; global reuse hanya pada development
  hot reload;
- dashboard service menjalankan read query terkontrol dan parallel reads;
- chart tetap client boundary, sementara page/layout/data fetching tetap server-side;
- tidak ditemukan hard navigation window.location.href atau location.reload;
- build production berhasil dengan Next.js 16.3.3/Turbopack;
- route dashboard dan API terdaftar tanpa build error;
- snapshot .next/static/chunks terbesar sekitar 410.842 bytes; ini hanya
  snapshot build, bukan alasan untuk dynamic import tambahan tanpa pengukuran;
- target Transaction Pooler kompatibel dengan query Prisma yang dipakai;
- scale-out Vercel tetap dapat membuat pool per Function instance sehingga
  connection limit/pooler policy wajib dikonfirmasi sebelum cutover;
- maxDuration=300 hanya berlaku pada sync route dan perlu dicocokkan dengan
  plan/runtime Vercel.

vercel.json sudah memiliki cron declaration. Root directory repository tetap
harus diarahkan manual ke energiprimer-next, dan Node runtime perlu dipilih
atau dipin pada Project Settings/configuration yang disetujui.

## Validation commands

| Command | Result | Mode |
|---|---|---|
| npm run supabase:production:runtime:local | PASS | Local read-only dashboard runtime |
| npm run supabase:production:runtime:direct | PASS | Supabase Direct read-only |
| npm run supabase:production:runtime:pooler | PASS | Supabase Pooler read-only |
| npm run supabase:data:verify | PASS | Local-to-target parity read-only |
| npm run auth:security:verify | PASS + AUTH_E2E_ENV_NOT_AVAILABLE | Source/fixture only |
| npm run mail:verify | PASS | Mock provider; real email not requested |
| npm run sync:verify-config | PASS | Fixture only |
| npm run sync:verify-cron-auth | PASS | Fixture only |
| npm run lint | PASS | Local |
| npx tsc --noEmit | PASS | Local |
| npm run build | PASS | Local production build |
| npm run db:verify | PASS | Local read-only baseline |
| npm audit | REVIEW | 3 HIGH transitive Prisma/deepmerge findings |

## Findings dan required review

### CRITICAL

Tidak ditemukan.

### HIGH

1. **Dependency audit - Prisma/deepmerge-ts.** npm audit melaporkan 3 HIGH
   melalui prisma@6.19.3 -> @prisma/config -> deepmerge-ts@7.1.5 terkait
   recursive object graph stack exhaustion. Fix yang ditawarkan npm adalah
   prisma@6.12.0 melalui npm audit fix --force, yang merupakan perubahan
   breaking/downgrade. Tidak dijalankan. Requires manual dependency/security
   review dan regression test.
2. **Runtime database role terlalu kuat.** Probe target berjalan sebagai role
   postgres, yang memiliki privilege luas. Ini tidak terekspos ke browser dan
   anon/authenticated tetap denied, tetapi production sebaiknya memakai role
   runtime least-privilege yang disetujui. Provisioning role/credential adalah
   **REQUIRES MANUAL APPROVAL** dan tidak dilakukan.

### MEDIUM

1. **Live Auth E2E belum tersedia.** Target auth rows sengaja 0; siapkan
   isolated preview account/database test tanpa memakai credential production.
2. **Resend belum production-ready.** Sender/domain dan real-email smoke test
   production belum diverifikasi; real email sengaja tidak dikirim.
3. **Google production variables belum dipastikan tersedia di Vercel.** Local
   path credential tidak dapat dijadikan dependency runtime Vercel.
4. **Pooler backend SSL visibility terbatas.** Direct SSL terverifikasi penuh;
   Pooler menerima sslmode=verify-full, tetapi pg_stat_ssl pada backend PgBouncer
   tidak melaporkan client session. Lakukan smoke test dari Vercel Preview
   setelah environment diset.
5. **RLS policy review.** Application tables tidak mengaktifkan RLS, namun
   Data API roles tidak memiliki table privilege dan aplikasi tidak memakai
   browser Supabase client. Keputusan mengaktifkan RLS/role policy adalah
   perubahan security architecture dan memerlukan approval.
6. **Verifier lama memiliki assertion pre-import.**
   verify-supabase-phase21es2.mjs dan verify-supabase-production-schema.mjs
   masih menganggap semua application tables harus kosong. Setelah data Phase
   21F yang benar berjumlah 8.754 row, keduanya dapat memberi exit code 1 walau
   schema/security facts lulus. Phase21F parity verifier dan
   verify-supabase-production-runtime.ts menjadi verifier post-import yang
   digunakan pada audit ini. Perbaikan assertion aman dapat dilakukan terpisah.

### LOW / technical debt

1. Script audit TypeScript menampilkan Node experimental loader/module warnings;
   ini tidak mempengaruhi production build, tetapi dapat dirapikan kemudian.
2. prisma validate CLI tidak otomatis memuat .env.local; command audit harus
   memakai env loader eksplisit atau script wrapper yang disetujui.

## Tidak dilakukan

- tidak mengubah DATABASE_URL local maupun production;
- tidak menjalankan prisma migrate, migrate deploy, db push, reset, atau schema migration;
- tidak menjalankan INSERT/UPDATE/DELETE/DROP/TRUNCATE pada local atau Supabase;
- tidak menjalankan data migration ulang;
- tidak menjalankan Google Sheets production sync;
- tidak mengirim real email;
- tidak mengaktifkan cron production;
- tidak melakukan Vercel preview/production deployment;
- tidak mengubah schema, API contract, authentication architecture, atau business logic.

## Manual approval sebelum preview/cutover

1. Tentukan dan provision DATABASE_URL Vercel ke endpoint Supabase yang
   disetujui, dengan pooling/TLS dan connection limit yang sesuai.
2. Putuskan dan provision role runtime least-privilege; jangan memakai role
   superuser sebagai keputusan permanen tanpa review.
3. Provision AUTH_URL, AUTH_SECRET, AUTH_TRUST_HOST, dan isolated Auth E2E
   environment.
4. Provision Google service-account email/private key dan spreadsheet ID di
   Vercel secret environment.
5. Verifikasi Resend sender/domain, API key, dan controlled test recipient.
6. Set Vercel Root Directory energiprimer-next dan Node runtime yang disetujui.
7. Review dependency HIGH dan lakukan patch/regression test yang disetujui.
8. Review cron declaration sebelum deployment; jangan menjalankan sync manual
   sebagai bagian dari Phase 21G.

## Final decision

**PASS WITH REVIEW**

**READY FOR MANUAL PREVIEW CONFIGURATION, NOT READY FOR PRODUCTION CUTOVER**

Phase 21G berhenti di sini. Approval manual diperlukan sebelum preview,
perubahan DATABASE_URL, aktivasi cron, atau deployment.
