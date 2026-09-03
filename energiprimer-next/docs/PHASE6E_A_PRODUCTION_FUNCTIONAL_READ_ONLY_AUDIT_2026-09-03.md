# PHASE 6E-A — PRODUCTION FUNCTIONAL READ-ONLY AUDIT

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Branch: NextJs  
Tanggal audit: 2026-09-03  
Production canonical URL: https://dashboard-energi-primer.vercel.app

## Overall Status

**PASS WITH FINDINGS**

Aplikasi Production, Auth.js admin flow, route protection, runtime database,
dashboard contract, Google Sheets metadata access, Cron negative protection,
static checks, build, dan migration preflight read-only berhasil. Temuan utama
adalah data dashboard **STALE**: data operasional ternormalisasi terakhir
berakhir pada 2026-07-31, sedangkan audit berjalan pada 2026-09-03.

Tidak ada migration, schema change, destructive operation, authorized
Production sync, perubahan environment, atau commit yang dilakukan. Login
admin E2E tetap dapat memperbarui state authentication seperti
users.last_login_at; hal tersebut merupakan behavior Auth.js yang telah
disepakati.

## 1. Preflight — PASS

Bukti:

- Branch NextJs; local HEAD sama dengan commit Production yang telah
  direkonsiliasi pada Phase 6D.
- package.json, next.config.ts, vercel.json, Auth.js route, protected
  dashboard route, sync route, production schema, dan production migration
  directory tersedia.
- Tidak ada perubahan tracked pada source, schema, migration, vercel.json,
  atau package configuration.
- Production migration directory memiliki 1 migration canonical; root
  prisma/migrations memiliki 5 migration legacy/local-only.
- Untracked artifacts yang terlihat adalah laporan Phase 6D dan
  graphify-out/; keduanya tidak disentuh dalam audit ini.

## 2. Public Routes — PASS

Probe read-only ke Production canonical:

| Route | Result |
| --- | --- |
| / | HTTP 200 |
| /login | HTTP 200; form login/password tersedia |
| /api/auth/providers | HTTP 200; hanya credentials |
| /dashboard tanpa session | HTTP 307 menuju /login |
| /forgot-password | HTTP 404 |
| /reset-password | HTTP 404 |

HTML dan 10 JavaScript assets yang dapat diakses publik berhasil dipindai tanpa
marker secret, private key, database credential, stack trace, atau error
internal.

## 3. Authentication E2E — PASS

Satu controlled admin E2E terbaru dijalankan ke Production menggunakan
credential yang tersedia pada file lokal yang di-ignore Git. Nilai credential,
password, token, dan cookie tidak dicetak.

Bukti tersanitasi:

- /login dan CSRF endpoint berhasil.
- Tepat satu credentials callback berhasil dengan HTTP 302 tanpa error.
- Session authenticated berhasil dengan HTTP 200 dan role admin.
- /dashboard, /dashboard/batubara, /dashboard/biomassa, /dashboard/solar,
  /dashboard/stok, /dashboard/target, /monitoring, /laporan, dan /pengaturan
  berhasil diakses dengan HTTP 200.
- Refresh session dan dashboard tetap authenticated.
- Tepat satu signout berhasil dengan HTTP 302.
- Akses /dashboard setelah logout kembali ditolak dengan HTTP 307 menuju
  /login.
- Supplemental signed non-admin/operator probe diarahkan ke /login dan tidak
  menjalankan business-data write.

## 4. Database Read-Only — PASS

Query aplikasi memakai DATABASE_URL runtime dan hanya melakukan SELECT/count.
Target terbaca sebagai PostgreSQL database postgres, schema public.

| Tabel | Rows | Rentang tanggal / status |
| --- | ---: | --- |
| users | 1 | akun admin tersedia untuk E2E |
| units | 3 | PLTU-1 sampai PLTU-3 |
| coal_consumption | 636 | 2026-01-01 — 2026-07-31 |
| coal_stock | 212 | 2026-01-01 — 2026-07-31 |
| coal_quality | 0 | EMPTY |
| power_generation | 0 | EMPTY |
| kpi_targets | 0 | EMPTY |
| biomass_consumptions | 636 | 2026-01-01 — 2026-07-31 |
| biomass_receipts | 49 | 2026-01-01 — 2026-07-01 |
| sync_runs | 1 | latest status SUCCESS |

Tambahan registry: sync_sources 1 row, sync_worksheets 199 rows, dan
sync_schema_changes terbuka 0 row. Tidak ada error connection tersembunyi
pada query read-only.

## 5. Dashboard Data Contract — PASS

- Unit tersedia tepat sebagai Unit 1, Unit 2, dan Unit 3 dengan code PLTU-1,
  PLTU-2, dan PLTU-3; query per unit menghasilkan 212 row untuk setiap unit.
- Coal consumption terbaca per unit dan per tanggal. Tidak ada nilai zero
  aktual pada snapshot ini; nilai NULL tetap ada sebagai NULL.
- Coal stock memiliki 212 row, seluruh closing_stock tidak NULL dan tidak
  zero. Model/source tidak menyediakan opening stock atau daily received
  sebagai field yang boleh diinventasikan, dan dashboard tidak membuat angka
  tersebut.
- coal_quality, power_generation, dan kpi_targets benar-benar EMPTY.
  Dashboard mempertahankan empty/unavailable state, bukan mengarang data.
- Biomass memiliki 636 consumption rows dan 49 receipt rows dalam scope
  historis yang terbaca. Jumlah 49 receipt rows konsisten dengan period scope
  audit sebelumnya.
- db:verify-overview PASS: source PostgreSQL normalized, July 2026 KPI
  baseline dan 31-row daily series berhasil dibaca, termasuk Unit 1–3.

## 6. Null vs Zero — PASS

Review service dan komponen dashboard menunjukkan:

- null/missing dipertahankan oleh decimalToNumber, sum, dan metric available;
  UI menampilkan dash, unavailable, atau empty state.
- Nilai numerik 0 tidak difilter sebagai missing dan akan diformat sebagai 0.
- Chart mengabaikan titik NULL tanpa menyambungkan garis melalui nilai NULL.
- DetailBarChart hanya menghitung total setelah semua series yang terlihat
  benar-benar memiliki nilai numerik.
- Tidak ditemukan value || 0 pada jalur metric dashboard.
- Penggunaan ?? 0 yang ditemukan berada pada agregasi/chart atau metadata
  internal dengan guard yang sesuai, bukan pengganti NULL menjadi angka
  dashboard.

Snapshot database menunjukkan 84 nilai NULL pada coal_used dan 105 nilai NULL
pada quantity_ton biomass; zero aktual pada kedua field tersebut adalah 0
row. Nilai NULL tidak diubah saat ditampilkan.

## 7. Google Sheets Configuration — PASS

Bukti:

- npm run sync:verify-config PASS untuk service-account environment pair,
  partial configuration rejection, dan credential-file fallback.
- Effective local configuration terdeteksi sebagai
  environment-service-account; spreadsheet ID terkonfigurasi. Nilai secret
  tidak dicetak.
- Scope client Google Sheets adalah read-only
  (spreadsheets.readonly).
- Metadata worksheet berhasil dibaca langsung secara read-only: 199
  worksheets.
- Registry Production juga memiliki 199 worksheet; 7 worksheet aktif yang
  relevan adalah Januari26-BB sampai Juli26-BB. Worksheet aktif tidak
  mengalami schema review terbuka.
- Verifier discovery statis PASS. Live discoverGoogleSheetsWorksheets() tidak
  dipanggil karena implementasinya melakukan upsert/update registry setelah
  membaca metadata; sebagai gantinya metadata client read-only dipanggil
  langsung.

Ketersediaan pasangan environment dan file fallback tidak membuktikan
value-level separation Production/Preview. Pemeriksaan nilai tersebut tetap
menjadi tanggung jawab operator yang berwenang.

## 8. Sync Code Audit — PASS

Review source terhadap /api/sync/google-sheets dan engine menunjukkan:

- Environment gate dijalankan sebelum autentikasi dan sebelum engine write.
  Preview/unknown deployment ditolak fail-closed.
- CRON_SECRET wajib tersedia dan bearer comparison memakai timing-safe
  equality.
- Google Sheets adalah upstream; commit plan menulis target PostgreSQL.
- Discovery dan sync mencatat sync_sources, sync_worksheets, sync_row_states,
  dan sync_runs.
- Source lease atomic mencegah concurrent sync; lease dilepas pada finally
  dan diperbarui selama proses.
- Import memakai transaction, unique natural keys, checksum/idempotent
  successful-run check, dan upsert.
- Worksheet yang hilang ditandai MISSING; tidak ada delete otomatis terhadap
  data Production. Tidak ditemukan destructive deletion pada commit path.
- Retry hanya untuk error Google/database transient yang diklasifikasikan;
  transaction memiliki timeout.
- Browser menerima status/kategori error terbatas; exception detail tidak
  dikembalikan.
- Advisory transaction lock digunakan pada login throttle; concurrency sync
  menggunakan source lease atomic yang sesuai dengan registry.

Authorized Production sync **NOT TESTED** karena endpoint tersebut
write-capable dan Phase 6E-A read-only.

## 9. Cron Security — PASS

Negative tests ke POST /api/sync/google-sheets:

- Tanpa Authorization: HTTP 401.
- Bearer secret salah: HTTP 401.
- Response JSON aman dan tidak memuat token, connection string, stack trace,
  atau detail internal.

Bearer secret Production yang benar tidak digunakan dan tidak diuji.

## 10. Vercel Cron — PASS

vercel.json tetap:

/api/sync/google-sheets → 0 22 * * *

Interpretasi: 22:00 UTC, yaitu 06:00 WITA pada hari berikutnya, satu kali
per hari. Deployment Production READY pada commit yang telah direkonsiliasi
Phase 6D dan tidak ada perubahan schedule dalam audit ini.

## 11. Security Regression — PASS

- Guest dashboard protection PASS.
- Signed non-admin/operator request tidak dapat membuka admin dashboard.
- Auth.js Credentials adalah satu-satunya provider.
- Supabase Auth dan Resend tidak digunakan pada active application path.
- Password recovery route tidak tersedia.
- auth:security:verify PASS.
- Header dasar Strict-Transport-Security, X-Content-Type-Options,
  X-Frame-Options, dan header keamanan terkait terpasang.
- Public HTML/JS tidak memuat database credential, Auth secret, Cron secret,
  Google private key, atau JWT-like secret marker.
- sync:verify-preview-write-safety PASS: Preview dan unknown deployment
  ditolak sebelum sync engine.

CSP belum tersedia pada response yang diuji dan dicatat sebagai LOW/REVIEW,
tanpa perubahan pada phase read-only ini.

## 12. Error Handling — PASS

Public route dan negative sync probes tidak membocorkan stack trace, SQL,
Prisma internal error, database host, credentials, password, atau JWT secret.
Status yang diamati sesuai kontrak: route recovery 404, guest protection 307,
dan unauthorized sync 401. Internal authenticated route E2E juga tidak
menunjukkan application/internal server/unhandled runtime error marker.

## 13. Data Freshness — BLOCKED / STALE

Snapshot read-only pada 2026-09-03:

- Coal consumption terbaru: 2026-07-31.
- Coal stock terbaru: 2026-07-31.
- Biomass consumption terbaru: 2026-07-31.
- Biomass receipt terbaru: 2026-07-01.
- Power generation: EMPTY, sehingga tidak ada tanggal terbaru.
- Latest sync_runs: mulai 2026-09-02 13:38:46, selesai 13:38:55,
  SUCCESS, trigger cron, seluruh counter inserted/updated/skipped/failed 0.
- Latest successful import records berada pada 2026-08-31 dan mencatat period
  historis, bukan data setelah 2026-07-31.

Status sync terakhir berhasil tidak dengan sendirinya membuktikan adanya data
harian baru. Penyebab data berhenti pada Juli belum ditentukan oleh audit
read-only ini. Tidak ada sync yang dijalankan untuk memaksa freshness.

## 14. Idempotency Review — PASS

Review source, schema, dan verifier read-only menunjukkan:

- Natural unique keys dan upsert dipakai untuk entity normalized.
- Successful import dengan checksum/period/worksheet yang sama dikembalikan
  tanpa membuat import run baru.
- sync_row_states menyimpan content hash untuk membedakan SKIP/insert/update.
- sync_runs mencatat status dan counter.
- Source lease atomic mencegah concurrent duplicate execution.
- Schema detection menahan perubahan/rename/duplicate header untuk review.
- sync:verify-state, sync:verify-schema, dan
  sync:verify-preview-write-safety PASS.

Repeated authorized Production sync tidak dijalankan karena write approval
tidak termasuk Phase 6E-A.

## 15. Production Write Safety — PASS

| Write-capable path | Authentication / authorization | Audit treatment |
| --- | --- | --- |
| Auth.js Credentials callback | Valid credentials, admin role lookup | Satu login E2E diizinkan; auth state write yang diharapkan dapat memperbarui last_login_at |
| Login throttle cache | Server-side login attempt path; advisory transaction lock | Terjadi sebagai bagian behavior auth, bukan business-data sync |
| Password-change Server Action | Session valid dan role admin; current password wajib benar | Tidak dieksekusi |
| Auth.js signout | Auth.js server action / callback | Logout E2E diuji; tidak ada business-data write |
| /api/sync/google-sheets GET/POST | Production environment gate + CRON_SECRET bearer | Tidak ada authorized request; endpoint write-capable |
| Dashboard/filter routes | Protected admin layout untuk data; filter hanya cookie/query state | Tidak ada database mutation |

Tidak ada route API PUT/PATCH/DELETE business lain yang ditemukan. Tidak ada
password reset, password recovery, import, authorized sync, data deletion,
atau manual database write yang dilakukan.

## 16. Build / Static Regression — PASS

| Check | Result |
| --- | --- |
| npm run db:generate | PASS |
| npm run db:validate | PASS |
| npx tsc --noEmit --incremental false | PASS |
| npm run lint | PASS |
| npm run build | PASS |
| npm run auth:security:verify | PASS |
| npm run sync:verify-config | PASS |
| npm run sync:verify-cron-auth | PASS |
| npm run sync:verify-preview-write-safety | PASS |
| npm run sync:verify-state | PASS |
| npm run sync:verify-schema | PASS |
| npm run dashboard:verify-cutoff | PASS |

Build menghasilkan seluruh route dashboard dan API yang diharapkan.

## 17. Migration Safety — PASS

- prisma migrate deploy: NOT RUN.
- prisma migrate reset: NOT RUN.
- prisma migrate resolve: NOT RUN.
- prisma db push: NOT RUN.
- DDL/schema modification: NOT RUN.
- Production data mutation: NOT RUN.
- prisma/production/schema.prisma valid.
- Canonical preflight read-only PASS: 1 canonical migration, 1 applied,
  baseline present, checksum mismatch 0, pending migration 0, schema diff
  empty, dan database/schema identity sesuai postgres/public.
- supabase:production:migrate-status PASS dengan supabaseWrites: 0.
- Root prisma/migrations tetap legacy/local-only dan tidak diterapkan.
- Approval gate backup/change-window/operator approval tetap
  REVIEW_REQUIRED; tidak ada execution yang dilakukan.

## Findings

| ID | Severity | Finding | Evidence | Recommendation | Production Impact |
| --- | --- | --- | --- | --- | --- |
| F-6E-01 | HIGH | Dashboard data Production stale | Coal, stock, dan biomass consumption berhenti pada 2026-07-31; latest cron run 2026-09-02 SUCCESS tetapi 0 perubahan | Operator review source period/worksheet admission dan lakukan controlled sync hanya setelah approval; jika data memang historis, tampilkan status freshness secara eksplisit | Dashboard dapat berfungsi tetapi belum dapat dianggap merepresentasikan kondisi operasional harian terkini |
| F-6E-02 | MEDIUM | Production/Preview secret value separation belum terbukti | Metadata nama variable dan scope tersedia; value tidak dibandingkan demi secret hygiene | Lakukan verifikasi value separation melalui prosedur Vercel operator yang aman dan rotasi bila ada reuse | Assurance konfigurasi antar-environment masih PARTIAL |
| F-6E-03 | LOW | CSP belum terpasang/teramati | Header keamanan dasar PASS, CSP tidak terlihat pada public response | Tinjau dan deploy CSP sebagai perubahan terpisah setelah policy asset diuji | Defense-in-depth browser policy belum maksimal; bukan blocker runtime saat ini |
| F-6E-04 | INFO | Tiga domain table masih EMPTY | coal_quality, power_generation, dan kpi_targets masing-masing 0 row | Konfirmasi scope data upstream dan isi hanya melalui change/import yang disetujui | Fitur kualitas, generation, dan KPI target menampilkan unavailable/empty state |
| F-6E-05 | INFO | Nilai NULL upstream masih ada pada consumption | coal_used NULL 84 row dan biomass quantity_ton NULL 105 row; zero aktual 0 row | Konfirmasi apakah NULL legitimate pada source; jangan mengisi otomatis sebagai zero | Sebagian titik per-unit dapat tampil unavailable, namun kontrak UI tidak menyesatkan |

Tidak ada CRITICAL finding. Tidak ada bukti duplicate, destructive deletion,
schema drift, unauthorized sync acceptance, atau secret leakage pada probe ini.

## Final Summary

- Overall Phase 6E-A: **PASS WITH FINDINGS**.
- Status section: **PASS 16**, **FAIL 0**, **BLOCKED 1**, **NOT TESTED 0**.
- Operasi write-capable authorized Production sync: **NOT TESTED (1)**.
- Critical findings: **0**.
- High findings: **1** — F-6E-01 data freshness stale.
- Medium findings: **1** — F-6E-02 value separation belum terbukti.
- Low findings: **1** — F-6E-03 CSP review.
- Info findings: **2** — F-6E-04 empty domain tables dan F-6E-05 legitimate/null upstream values.
- Migration/schema/destructive writes: **0**.
- Business-data sync writes: **0**.
- Auth E2E write yang diizinkan: hanya behavior authentication yang dapat
  memperbarui state login seperti users.last_login_at.

Production belum aman untuk langsung masuk Phase 6E-B. Alasannya adalah
freshness data masih HIGH/STALE dan controlled sync belum memperoleh approval
operator. Phase 6E-B tidak dimulai otomatis.

Production authorized sync intentionally not executed because Phase 6E-A is read-only and the sync endpoint is write-capable.

Phase 6E-A berhenti di sini. Controlled Production sync, perubahan data,
migration, cron change, environment change, dan commit menunggu approval
eksplisit operator.
