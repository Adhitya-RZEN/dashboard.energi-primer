# PHASE 6E-B — CONTROLLED PRODUCTION SYNC REPORT

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Branch: NextJs  
Tanggal: 2026-09-03  
Production: https://dashboard-energi-primer.vercel.app

## Final Status

**FAIL / STOPPED AFTER AUTHORIZED SYNC FAILURE**

B1 (pre-sync read-only validation) selesai dengan PASS. Operator kemudian
memberikan explicit approval untuk tepat satu controlled sync. B2 dijalankan
tepat satu kali, tetapi endpoint Production mengembalikan HTTP 500 dengan
response sanitized FAILED.

Sesuai failure rule, tidak ada retry atau sync kedua. Post-failure verification
read-only menunjukkan tidak ada committed change pada sync registry maupun
normalized business data.

## A. Pre-Sync Validation — PASS

Konfigurasi diperiksa tanpa mencetak value:

| Item | Status |
| --- | --- |
| Production environment gate | VALID |
| GOOGLE_SHEETS_SPREADSHEET_ID | SET |
| Google service-account credentials | SET |
| CRON_SECRET | SET |
| DATABASE_URL | SET |
| Effective Google credential mode | environment service account |
| Database writes during B1 | 0 |
| Google Sheets writes during B1 | 0 |

Static safety verifier juga PASS:

- sync:verify-config
- sync:verify-cron-auth
- sync:verify-preview-write-safety
- sync:verify-schema

## B. Source Identity — PASS / OPERATOR-CONFIRMED

Operator mengonfirmasi bahwa spreadsheet Production yang dikonfigurasi adalah
Google Sheet COPY yang memang dimaksudkan untuk Production dan hanya berisi
data sampai Juli 2026. Spreadsheet ID tidak diganti atau dicetak.

Tidak ada perubahan atau write ke Google Sheet.

## C. Source Metadata — PASS

Metadata Google Sheets dibaca langsung dengan client read-only:

- Total worksheet: 199.
- Tab BB tahun 2026 yang ditemukan: Januari26-BB, Februari26-BB,
  Maret26-BB, April26-BB, Mei26-BB, Juni26-BB, Juli26-BB.
- Tidak ada tab Agustus26-BB atau September26-BB pada source copy yang
  diperiksa; hal ini konsisten dengan fakta operator.
- Registry Production memiliki 199 worksheet, dengan 7 status ACTIVE dan
  192 status DISCOVERED.
- Worksheet ACTIVE yang relevan adalah Januari26-BB sampai Juli26-BB.

Discovery registry live tidak dijalankan karena fungsi discovery resmi
melakukan upsert/update registry. Metadata read-only digunakan sebagai
pengganti yang aman untuk B1.

## D. Sync Plan — PASS / EXPECTED

Source copy hanya memiliki period 2026 sampai Juli dan Production sudah
memiliki data pada period yang sama. Snapshot sebelum sync tidak menunjukkan
duplicate natural key atau schema change terbuka.

Expected result untuk satu controlled sync, berdasarkan source metadata dan
state Production saat ini:

- expected inserted: 0
- expected updated: 0
- existing source rows: tetap konsisten; dapat tercatat sebagai skipped atau
  tidak ada worksheet automatic yang admitted
- expected destructive deletion: 0
- expected migration/schema change: 0

Angka tersebut adalah expectation berbasis snapshot, bukan hasil B2 dan tidak
dipaksakan sebagai hasil aktual.

## B1 Schema / Importer Read-Only Parse — PASS

Tujuh worksheet relevan dibaca dan diparse tanpa commit:

| Worksheet | Plan | Blocking issues | Parser errors | Date column | Series rows |
| --- | --- | ---: | ---: | --- | ---: |
| Januari26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 31 |
| Februari26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 28 |
| Maret26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 31 |
| April26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 30 |
| Mei26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 31 |
| Juni26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 30 |
| Juli26-BB | READY_FOR_IMPORT | 0 | 0 | detected | 31 |

Januari–Juni memiliki diagnostic non-blocking dari parser (warning/unresolved
optional fields); Juli26-BB sebagai canonical schema tidak memiliki unresolved
atau ambiguous field. Tidak ada blocking issue, parser error, atau open schema
change pada registry Production.

## E. Current Production State Before Sync — PASS

Snapshot diperoleh dengan SELECT-only melalui DATABASE_URL runtime:

| Item | Before |
| --- | --- |
| latest sync_run ID | 1 |
| latest sync status | SUCCESS |
| trigger | cron |
| started_at | 2026-09-02T13:38:46Z |
| finished_at | 2026-09-02T13:38:55Z |
| worksheets_scanned | 0 |
| rows_scanned | 0 |
| inserted | 0 |
| updated | 0 |
| skipped | 0 |
| failed | 0 |
| source status | ACTIVE |
| source lease | NONE |
| row-state rows | 2.409 |
| open schema changes | 0 |

Normalized data snapshot:

| Table | Rows | Range |
| --- | ---: | --- |
| coal_consumption | 636 | 2026-01-01 — 2026-07-31 |
| coal_stock | 212 | 2026-01-01 — 2026-07-31 |
| biomass_consumptions | 636 | 2026-01-01 — 2026-07-31 |
| biomass_receipts | 49 | 2026-01-01 — 2026-07-01 |

Duplicate natural-key groups sebelum sync:

- coal_consumption: 0
- coal_stock: 0
- biomass_consumptions: 0
- biomass_receipts: 0

Unit state tetap Unit 1 / PLTU-1, Unit 2 / PLTU-2, dan Unit 3 / PLTU-3, dengan
212 rows per unit pada coal consumption dan biomass consumption.

## F. Pre-Sync Write Safety Review — PASS

Review route /api/sync/google-sheets dan engine:

- Production environment gate aktif sebelum CRON_SECRET dan sebelum engine.
- CRON_SECRET wajib dan bearer comparison timing-safe.
- Target write adalah PostgreSQL melalui transaction.
- Source lease atomic mencegah concurrent execution dan dilepas pada finally.
- Natural key, upsert, checksum, dan sync_row_states mendukung idempotency.
- sync_runs mencatat status dan counters.
- Missing worksheet ditandai MISSING; tidak ada automatic destructive deletion.
- Tidak ada DELETE massal, TRUNCATE, DROP, migration, db push, reset, atau
  schema modification pada flow.

Negative bearer verifier dan Preview write-safety verifier PASS. Authorized
Production route dipanggil tepat satu kali setelah approval.

## G. Approval Gate — PASS / APPROVED

### PRE-SYNC APPROVAL REQUEST

Source: Google Sheet COPY  
Expected source period: sampai Juli 2026  
Current Production latest data: 2026-07-31  
Current latest sync: SUCCESS / 0 changes  
Expected operation: ONE controlled authorized Production sync  
Potential writes: sync registry + normalized upsert/import state sesuai source  
Migration: NONE  
Schema change: NONE  
Destructive deletion: NONE  
Cron change: NONE  
Environment change: NONE

Operator memberikan approval eksplisit untuk tepat satu controlled authorized
Production sync. Approval tersebut hanya mencakup satu request dan tidak
memberikan izin untuk retry otomatis.

## H. Authorized Sync Result — FAIL

Satu dan hanya satu POST authorized dikirim ke endpoint Production.

| Item | Result |
| --- | --- |
| HTTP status | 500 |
| Response status | FAILED |
| Response message | generic sanitized synchronization failure |
| Request count | 1 |
| Retry | 0 |
| Second sync | NOT RUN |
| CRON_SECRET/header/token output | none |

Exact failure category tidak tersedia pada public sanitized response. Snapshot
database menunjukkan latest sync_run tetap ID 1, sehingga kegagalan terjadi
sebelum sync_run baru committed atau transaction write telah rolled back.
Stage yang dapat dipastikan secara aman adalah discovery/initialization sebelum
sync_run persisted; penyebab internal spesifik tidak disimpulkan dari HTTP 500.

## I. Database Before/After — PASS / NO COMMITTED CHANGE OBSERVED

After snapshot diambil dengan SELECT-only melalui DATABASE_URL runtime:

| Item | Before | After |
| --- | --- | --- |
| latest sync_run | ID 1 / SUCCESS | ID 1 / SUCCESS |
| source status | ACTIVE | ACTIVE |
| source lease | NONE | NONE |
| worksheet status | ACTIVE 7 / DISCOVERED 192 | ACTIVE 7 / DISCOVERED 192 |
| row-state rows | 2.409 | 2.409 |
| coal_consumption | 636; through 2026-07-31 | 636; through 2026-07-31 |
| coal_stock | 212; through 2026-07-31 | 212; through 2026-07-31 |
| biomass_consumptions | 636; through 2026-07-31 | 636; through 2026-07-31 |
| biomass_receipts | 49; through 2026-07-01 | 49; through 2026-07-01 |

Tidak ada sync_run baru, penurunan row, lease tertinggal, atau committed
business-data mutation yang teramati. Exact internal rollback tidak dapat
diamati dari luar, tetapi tidak ada efek transaction yang committed.

## J. Data Integrity — PASS / BASELINE PRESERVED

Post-failure read-only comparison mempertahankan baseline:

- duplicate groups: 0 untuk coal consumption, coal stock, biomass consumption,
  dan biomass receipts;
- NULL/zero contract tidak berubah;
- Unit 1 / PLTU-1, Unit 2 / PLTU-2, dan Unit 3 / PLTU-3 tetap tersedia;
- coal, stock, dan biomass range tetap sama;
- empty domain tables tidak diisi;
- tidak ada unexpected deletion.

## K. Idempotency Review — PASS / NO SECOND SYNC

Static review dan existing read-only verifier PASS untuk unique key, upsert,
checksum, row-state, source lease, dan sync run accounting.

Tidak ada second Production sync yang dijalankan atau direncanakan dalam
phase ini.

## L. Dashboard Post-Sync — NOT TESTED / STOPPED AFTER FAILURE

Post-sync dashboard E2E tidak dijalankan karena failure rule mewajibkan STOP
setelah authorized sync FAILED. Baseline Phase 6E-A sebelumnya menunjukkan
admin E2E dan seluruh internal dashboard route PASS. Expected source freshness
tetap: latest available source data = 2026-07-31.

## M. Security Regression — EXPECTED / BASELINE PASS

Tidak ada perubahan source atau environment sejak baseline Phase 6E-A.
Baseline yang tetap berlaku:

- guest /dashboard → HTTP 307 ke /login;
- wrong/missing Cron bearer → HTTP 401;
- password recovery routes → HTTP 404;
- /api/auth/providers → hanya Credentials;
- Preview/unknown deployment ditolak sebelum sync engine.

Valid CRON_SECRET tidak digunakan untuk browser/public test.

## N. Migration Safety — PASS

- prisma migrate deploy: NOT RUN
- prisma migrate reset: NOT RUN
- prisma migrate resolve: NOT RUN
- prisma db push: NOT RUN
- DDL/schema modification: NOT RUN
- Production migration history tidak diubah.
- B1 hanya menggunakan SELECT/read-only dan static checks.

## Result Table

| Check | Status | Evidence |
|---|---|---|
| Production config availability | PASS | Required variables SET/VALID tanpa value dicetak |
| Source identity | PASS | Operator-confirmed Google Sheet COPY |
| Source metadata | PASS | 199 worksheets; BB 2026 sampai Juli |
| Relevant worksheet parse | PASS | 7 plans READY_FOR_IMPORT, 0 blocking issue |
| Current Production snapshot | PASS | Latest run 1 SUCCESS, 0 changes, lease NONE |
| Pre-sync duplicate check | PASS | 0 duplicate natural-key groups |
| Sync write-safety review | PASS | Gate, bearer, transaction, lease, upsert, no delete |
| Expected sync result | EXPECTED | 0 inserted/updated expected from identical source copy |
| Operator approval | PASS | Explicit approval diberikan untuk tepat satu sync |
| Authorized Production sync | FAIL | One POST returned HTTP 500 / sanitized FAILED |
| Database before/after | PASS | No committed change observed in SELECT-only comparison |
| Dashboard post-sync E2E | NOT TESTED | STOP condition after sync failure |
| Migration safety | PASS | No migration/DDL/write performed |

## Findings

| ID | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| F-6E-B-01 | INFO | Source copy memang berhenti pada Juli | Metadata source memiliki tab BB 2026 Januari–Juli dan tidak memiliki Agustus/September 2026 | Pertahankan source copy sesuai keputusan operator; update source resmi bila data periode berikutnya diperlukan |
| F-6E-B-03 | HIGH | Authorized Production sync gagal | Satu POST setelah approval mengembalikan HTTP 500 / sanitized FAILED; tidak ada sync_run baru | Operator perlu menganalisis failure pada Production secara tersanitasi dan memperbaiki penyebab sebelum meminta approval sync baru; jangan retry otomatis |

Data Juli tetap diklasifikasikan **EXPECTED SOURCE STALENESS**, bukan finding,
berdasarkan konfirmasi operator. Finding HIGH hanya berasal dari authorized
sync yang gagal.

## Stop Condition

Phase 6E-B berhenti setelah satu authorized sync gagal dan post-failure
read-only verification selesai. Jangan menjalankan sync kedua, retry,
perubahan source, perubahan environment, perubahan cron, migration, atau
commit sebelum penyebab dianalisis dan operator memberikan approval baru.
