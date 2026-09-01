# PHASE 21C — PRODUCTION SCHEMA BASELINE DESIGN

Tanggal audit: 2026-09-01  
Project: `energiprimer-next`  
Status: **PASS WITH REVIEW — DESIGN ONLY**

Dokumen ini hanya mendesain dan memvalidasi baseline schema production untuk
Supabase. Tidak ada migration, `prisma migrate deploy`, `prisma db push`,
data import, Google Sheets sync, atau deployment yang dijalankan.

## Keputusan desain

Target Supabase pada Gate B0 telah dilaporkan kosong pada schema aplikasi
`public`: tidak ada tabel aplikasi, data bisnis, atau `_prisma_migrations`.
Object internal Supabase pada schema lain tidak termasuk schema aplikasi dan
tidak disentuh.

Strategi yang dipilih adalah **Option A — full production baseline baru dari
`prisma/schema.prisma`**. Baseline ini membuat seluruh schema aplikasi yang
diperlukan oleh aplikasi dari keadaan kosong. Baseline Laravel no-op dan
migration additive historis tetap dipertahankan sebagai sejarah lokal, tetapi
tidak boleh langsung dijalankan pada target kosong.

Alasannya:

- `0_baseline_existing_laravel_schema/migration.sql` hanya marker/no-op dan
  tidak membuat tabel Laravel.
- Migration additive berikutnya memiliki foreign key ke tabel seperti
  `units`, sehingga tidak dapat berdiri sendiri pada target Supabase kosong.
- Baseline baru menghilangkan ketergantungan deployment production terhadap
  schema Laravel yang harus sudah dipulihkan sebelumnya.
- SQL baseline digenerate dari source of truth saat ini, yaitu
  `prisma/schema.prisma`, bukan dari data atau asumsi baru.

**Penting:** artifact SQL sengaja diletakkan di `docs/`, bukan di
`prisma/migrations/`, agar tidak dapat ikut dijalankan secara tidak sengaja.
Artifact tersebut tetap membutuhkan review dan packaging ke migration history
production yang disetujui sebelum Phase berikutnya.

## Scope dan safety result

| Item | Hasil Phase 21C |
| --- | --- |
| PostgreSQL / Prisma schema source | `prisma/schema.prisma`, provider PostgreSQL |
| Prisma version | 6.19.3 (project dependency) |
| Prisma models | 30 |
| Enums | 0 |
| Application tables in design | 30 |
| Indexes in design | 40 |
| Primary keys | 30 |
| Foreign keys | 19 |
| Database extensions created | 0 |
| `BIOMASS_STOCK` | Tidak ada di schema maupun artifact |
| Data statements | Tidak ada `INSERT`, `UPDATE`, atau `DELETE` |
| Destructive statements | Tidak ada `DROP` atau `TRUNCATE` |
| Local database writes | 0 |
| Supabase writes | 0 |
| Schema migration executed | NO |
| Data migration executed | NO |
| Google Sheets sync executed | NO |
| Vercel deployment | NO |

## Evidence dari Gate B0 dan local baseline

Gate B0 sebelumnya telah menghasilkan evidence berikut dan tidak diubah oleh
Phase 21C:

- Direct Connection dan Transaction Pooler: PASS.
- SSL evidence: PASS.
- Target PostgreSQL: 17.6.
- Target database/role/schema: `postgres` / `postgres` / `public`.
- Public application tables: 0.
- Public business data: NO.
- Public `_prisma_migrations`: NO.
- Object internal Supabase tetap berada pada schema internal dan tidak
  diperlakukan sebagai object aplikasi.

Local source diverifikasi read-only:

- PostgreSQL local: 18.4, database `dashboard_pln`.
- Baseline business rows: 2.409 verified rows.
- Duplicate: 0.
- Orphan relationship: 0 pada relationship yang diverifikasi.
- Unit: Unit 1, Unit 2, Unit 3.
- Target Biomassa: 70.020 ton.
- Local `DATABASE_URL`: tetap local dan tidak diubah.

Evidence detail Gate B0 tersedia pada [SUPABASE_MIGRATION_EXECUTION_REPORT_2026-09-01.md](./SUPABASE_MIGRATION_EXECUTION_REPORT_2026-09-01.md).

## Inventory model Prisma

Semua tipe di bawah adalah tipe PostgreSQL yang dihasilkan oleh Prisma. `id`
yang bertanda `BIGSERIAL` adalah `BigInt @id @default(autoincrement())`.
Timestamp bertanda `TIMESTAMP(0)` dan tanggal bertanda `DATE`. Nullable tetap
dipertahankan sebagai nullable; tidak ada nilai dummy yang ditambahkan.

| Model → table | Kolom dan tipe penting | Key, index, relation |
| --- | --- | --- |
| `User` → `users` | `id BIGSERIAL`; `name TEXT`; `email TEXT`; `email_verified_at TIMESTAMP(0)` nullable; `password TEXT`; `remember_token VARCHAR(100)` nullable; `created_at`, `updated_at`, `last_login_at TIMESTAMP(0)` nullable; `role TEXT DEFAULT 'admin'` | PK `id`; unique `email`; index `role` |
| `PasswordResetToken` → `password_reset_tokens` | `email TEXT`; `token TEXT`; `created_at TIMESTAMP(0)` nullable | PK `email` |
| `Session` → `sessions` | `id TEXT`; `user_id BIGINT` nullable; `ip_address VARCHAR(45)` nullable; `user_agent TEXT` nullable; `payload TEXT`; `last_activity INTEGER` | PK `id`; indexes `user_id`, `last_activity`; schema saat ini tidak mendefinisikan FK `user_id` |
| `Cache` → `cache` | `key TEXT`; `value TEXT`; `expiration BIGINT` | PK `key`; index `expiration` |
| `CacheLock` → `cache_locks` | `key TEXT`; `owner TEXT`; `expiration BIGINT` | PK `key`; index `expiration` |
| `Job` → `jobs` | `id BIGSERIAL`; `queue TEXT`; `payload TEXT`; `attempts SMALLINT`; `reserved_at INTEGER` nullable; `available_at INTEGER`; `created_at INTEGER` | PK `id`; index `queue` |
| `JobBatch` → `job_batches` | `id TEXT`; `name TEXT`; `total_jobs`, `pending_jobs`, `failed_jobs INTEGER`; `failed_job_ids TEXT`; `options TEXT` nullable; `cancelled_at INTEGER` nullable; `created_at INTEGER`; `finished_at INTEGER` nullable | PK `id` |
| `FailedJob` → `failed_jobs` | `id BIGSERIAL`; `uuid TEXT`; `connection TEXT`; `queue TEXT`; `payload TEXT`; `exception TEXT`; `failed_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP` | PK `id`; unique `uuid`; composite index `connection, queue, failed_at` |
| `Unit` → `units` | `id BIGSERIAL`; `code VARCHAR(20)`; `name VARCHAR(100)`; `status BOOLEAN DEFAULT true`; `created_at`, `updated_at TIMESTAMP(0)` nullable | PK `id`; unique `code`; parent bagi data unit-operasional |
| `CoalStock` → `coal_stock` | `id BIGSERIAL`; `date DATE`; `opening_stock`, `received`, `consumed`, `closing_stock DECIMAL(12,2) DEFAULT 0`; timestamps nullable | PK `id`; unique `date` |
| `CoalQuality` → `coal_quality` | `id BIGSERIAL`; `unit_id BIGINT`; `date DATE`; `gar DECIMAL(8,2)` nullable; `moisture`, `ash DECIMAL(5,2)` nullable; `sulfur DECIMAL(5,3)` nullable; `hgi DECIMAL(5,2)` nullable; timestamps nullable | PK `id`; unique `unit_id, date`; FK `unit_id → units.id`, `ON DELETE CASCADE` |
| `CoalConsumption` → `coal_consumption` | `id BIGSERIAL`; `unit_id BIGINT`; `date DATE`; `coal_used DECIMAL(12,2)` nullable; `sfc DECIMAL(8,2)` nullable; `heat_rate DECIMAL(8,2)` nullable; `boiler_efficiency DECIMAL(5,2)` nullable; timestamps nullable | PK `id`; unique `unit_id, date`; FK ke `units`, `ON DELETE CASCADE` |
| `PowerGeneration` → `power_generation` | `id BIGSERIAL`; `unit_id BIGINT`; `date DATE`; `average_load DECIMAL(8,2)` nullable; `power_generation DECIMAL(12,2)` nullable; timestamps nullable | PK `id`; unique `unit_id, date`; FK ke `units`, `ON DELETE CASCADE` |
| `KpiTarget` → `kpi_targets` | `id BIGSERIAL`; `unit_id BIGINT`; `date DATE`; `target_sfc`, `actual_sfc`, `target_heat_rate`, `actual_heat_rate DECIMAL(8,2)` nullable; timestamps nullable | PK `id`; unique `unit_id, date`; FK ke `units`, `ON DELETE CASCADE` |
| `SpreadsheetImportLog` → `spreadsheet_import_logs` | `id BIGSERIAL`; `source TEXT`; `imported_rows INTEGER DEFAULT 0`; `status TEXT`; `message TEXT` nullable; `imported_at`, `created_at`, `updated_at TIMESTAMP(0)` nullable | PK `id` |
| `SyncSource` → `sync_sources` | `id BIGSERIAL`; `source_key VARCHAR(128)`; `provider VARCHAR(32)`; `external_id VARCHAR(255)`; `status VARCHAR(32)`; `last_discovered_at TIMESTAMP(0)` nullable; lock fields nullable; `created_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP`; `updated_at TIMESTAMP(0)` | PK `id`; unique `source_key`; unique `provider, external_id` |
| `SyncWorksheet` → `sync_worksheets` | `id BIGSERIAL`; `source_id BIGINT`; key/title/status VARCHAR fields; `first_seen_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP`; `last_seen_at TIMESTAMP(0)`; last sync/hash/snapshot fields nullable; `row_count INTEGER DEFAULT 0`; created default now; updated timestamp | PK `id`; unique `source_id, worksheet_key`; index `source_id, status`; FK ke `sync_sources`, `ON DELETE RESTRICT` |
| `SyncRun` → `sync_runs` | `id BIGSERIAL`; `source_id BIGINT`; `trigger_type`, `status VARCHAR(32)`; started default now; finished nullable; scan/result counters default 0; `duration_ms INTEGER` nullable; `error_summary TEXT` nullable; created default now; updated timestamp | PK `id`; indexes `source_id, started_at` and `status`; FK ke `sync_sources`, `ON DELETE RESTRICT` |
| `SyncRowState` → `sync_row_states` | `id BIGSERIAL`; `worksheet_id BIGINT`; `source_key VARCHAR(512)`; `entity_type VARCHAR(64)`; `content_hash VARCHAR(128)`; `last_seen_at TIMESTAMP(0)`; `last_synced_at` nullable; created default now; updated timestamp | PK `id`; unique `worksheet_id, source_key`; index `worksheet_id, last_seen_at`; FK ke `sync_worksheets`, `ON DELETE RESTRICT` |
| `SyncSchemaChange` → `sync_schema_changes` | `id BIGSERIAL`; `worksheet_id BIGINT`; `detected_at DEFAULT CURRENT_TIMESTAMP`; previous/current hash VARCHAR(128); `change_type VARCHAR(32)`; previous/current schema TEXT nullable; status VARCHAR(32); resolution TEXT nullable; created default now; updated timestamp | PK `id`; indexes `worksheet_id, detected_at` and `status`; FK ke `sync_worksheets`, `ON DELETE RESTRICT` |
| `SpreadsheetImportRun` → `spreadsheet_import_runs` | `id BIGSERIAL`; source/requested/effective worksheet and range fields; requested/effective period DATE; status; imported/rejected counters default 0; checksum; message; started/created default now; completed nullable; updated timestamp | PK `id`; indexes `status` and `requested_period`; parent bagi staging dan hasil import |
| `SpreadsheetImportStaging` → `spreadsheet_import_staging` | `id BIGSERIAL`; `import_run_id BIGINT`; entity/source fields; source row/column nullable; period/reading dates nullable; unit/supplier codes; raw text; `normalized_value DECIMAL(18,3)` nullable; validation fields; created default now | PK `id`; indexes `import_run_id` and `entity_type, validation_status`; FK ke `spreadsheet_import_runs`, `ON DELETE RESTRICT` |
| `BiomassReceipt` → `biomass_receipts` | `id BIGSERIAL`; `import_run_id BIGINT` nullable; `period_start DATE`; supplier code/name; `quantity_ton DECIMAL(18,3)` nullable; source worksheet/cell; timestamps | PK `id`; unique `period_start, supplier_code`; index `period_start`; optional FK ke import run, `ON DELETE RESTRICT` |
| `CoalReceipt` → `coal_receipts` | `id BIGSERIAL`; `import_run_id BIGINT` nullable; `period_start DATE`; `quantity_ton DECIMAL(18,3)` nullable; source worksheet/cell; timestamps | PK `id`; unique `period_start`; optional FK ke import run, `ON DELETE RESTRICT` |
| `BiomassConsumption` → `biomass_consumptions` | `id BIGSERIAL`; optional import run; `unit_id BIGINT`; `reading_date DATE`; `quantity_ton DECIMAL(18,3)` nullable; source worksheet/cell; timestamps | PK `id`; unique `unit_id, reading_date`; index `reading_date`; FK ke `units` dan import run, keduanya `ON DELETE RESTRICT` |
| `SolarReceipt` → `solar_receipts` | `id BIGSERIAL`; optional import run; `period_start DATE`; `quantity_liter DECIMAL(18,3)` nullable; source worksheet/cell; timestamps | PK `id`; unique `period_start`; optional FK ke import run, `ON DELETE RESTRICT` |
| `SolarConsumption` → `solar_consumptions` | `id BIGSERIAL`; optional import run; `reading_date DATE`; `quantity_liter DECIMAL(18,3)` nullable; source worksheet/cell; timestamps | PK `id`; unique `reading_date`; optional FK ke import run, `ON DELETE RESTRICT` |
| `HopReading` → `hop_readings` | `id BIGSERIAL`; optional import run; `unit_id BIGINT`; `reading_date DATE`; `hop_days DECIMAL(8,2)` nullable; source worksheet/cell; timestamps | PK `id`; unique `unit_id, reading_date`; index `reading_date`; FK ke `units` dan import run, `ON DELETE RESTRICT` |
| `BiomassTarget` → `biomass_targets` | `id BIGSERIAL`; optional import run; `target_year INTEGER`; `target_ton DECIMAL(18,3)`; `unit VARCHAR(20) DEFAULT 'ton'`; `source VARCHAR(255)`; `status VARCHAR(32) DEFAULT 'approved'`; timestamps | PK `id`; unique `target_year`; optional FK ke import run, `ON DELETE RESTRICT` |
| `BiomassCumulativeSnapshot` → `biomass_cumulative_snapshots` | `id BIGSERIAL`; optional import run; `period_start DATE`; `cumulative_ton DECIMAL(18,3)` nullable; source/cell; timestamps | PK `id`; unique `period_start`; optional FK ke import run, `ON DELETE RESTRICT` |

Exhaustive field and annotation source tetap berada di
[`prisma/schema.prisma`](../prisma/schema.prisma). Tabel inventory di atas
merangkum seluruh field, precision, nullability, default, key, dan relation
yang dipakai oleh baseline.

## Dependency graph dan urutan pembuatan

Tidak ada cycle pada foreign-key graph. Urutan logis yang dihasilkan oleh
Prisma adalah:

```text
Root / tanpa FK
├── users
├── password_reset_tokens
├── sessions
├── cache
├── cache_locks
├── jobs
├── job_batches
├── failed_jobs
├── units
├── coal_stock
├── spreadsheet_import_logs
├── sync_sources
└── spreadsheet_import_runs

Unit-dependent
└── units
    ├── coal_quality              (CASCADE)
    ├── coal_consumption          (CASCADE)
    ├── power_generation          (CASCADE)
    ├── kpi_targets               (CASCADE)
    ├── biomass_consumptions      (RESTRICT; juga import run)
    └── hop_readings               (RESTRICT; juga import run)

Synchronization registry
└── sync_sources (RESTRICT)
    ├── sync_worksheets
    │   ├── sync_row_states        (RESTRICT)
    │   └── sync_schema_changes    (RESTRICT)
    └── sync_runs

Import domain
└── spreadsheet_import_runs (RESTRICT)
    ├── spreadsheet_import_staging
    ├── biomass_receipts
    ├── coal_receipts
    ├── solar_receipts
    ├── solar_consumptions
    ├── biomass_targets
    └── biomass_cumulative_snapshots
```

`biomass_consumptions` dan `hop_readings` berada pada dua cabang sekaligus:
keduanya membutuhkan `units` dan dapat memiliki `import_run_id`. Seluruh
relasi tersebut tercermin sebagai 19 FK di artifact.

## Audit migration history yang ada

Migration directory saat ini memiliki lima entry dan tidak diedit pada Phase
21C:

| Migration | Isi | Kesimpulan |
| --- | --- | --- |
| `0_baseline_existing_laravel_schema` | No-op marker untuk schema Laravel yang sudah ada | Tidak membuat tabel; valid hanya jika schema legacy sudah dipulihkan |
| `20260830140000_add_dashboard_import_domain` | 9 tabel domain import/dashboard, 14 index, dan relation ke `units`/import run | Additive; tidak standalone pada target kosong karena membutuhkan `units` |
| `20260830150000_add_coal_receipts` | `coal_receipts`, index, dan FK ke import run | Additive; membutuhkan `spreadsheet_import_runs` |
| `20260830160000_add_sheets_sync_state` | 5 tabel registry/sync dan 10 index | Additive; mempunyai dependency internal antar tabel sync |
| `20260830170000_add_sync_schema_snapshot` | `ADD COLUMN schema_snapshot` pada `sync_worksheets` | Additive terhadap history lama; sudah tercermin pada model sekarang |

Pada local database, lima migration tersebut tercatat applied dan baseline
no-op memiliki `applied_steps_count = 0`. Itu membuat history tersebut valid
untuk database lokal yang memang sudah berisi schema Laravel, tetapi tidak
membuatnya valid untuk target Supabase yang benar-benar kosong.

### Mengapa history lama tidak langsung dipakai

Jika `prisma migrate deploy` dijalankan pada target kosong dengan history lama,
entry no-op tidak membuat `users`, `units`, dan tabel legacy lain. Migration
additive kemudian gagal saat membuat foreign key ke tabel yang belum ada atau
menghasilkan schema yang tidak lengkap. Perintah tersebut sengaja **tidak**
dijalankan.

## Perbandingan local schema dengan Prisma

Perbandingan dilakukan menggunakan `prisma migrate diff` secara read-only.
Tidak ada output diff yang dieksekusi. Local public schema berisi 32 tabel:
30 tabel model Prisma ditambah metadata Laravel `migrations` dan metadata
Prisma `_prisma_migrations`.

### Sama / sesuai secara inventory aplikasi

- Seluruh 30 tabel yang dipetakan oleh model Prisma tersedia pada local
  database.
- Tidak ada model Prisma yang hilang dari local database.
- Tidak ada `BIOMASS_STOCK` pada model Prisma maupun baseline design.
- Data dan business semantics local tetap menjadi baseline 2.409 rows;
  Phase 21C tidak mengubahnya.

### Perbedaan legacy yang terdeteksi

| Area | Temuan read-only | Dampak pada baseline baru |
| --- | --- | --- |
| Metadata table | Local memiliki tabel Laravel `migrations`; tabel ini tidak didefinisikan sebagai model Prisma | Tidak dibuat oleh baseline aplikasi; bukan business table Prisma |
| Legacy scalar types | Beberapa field Laravel pada `users`, `sessions`, `password_reset_tokens`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, dan `spreadsheet_import_logs` memiliki tipe legacy yang berbeda dari deklarasi Prisma saat ini | Baseline mengikuti `schema.prisma`; tidak melakukan ALTER terhadap local |
| Timestamp defaults | Local memiliki default `now()` pada beberapa `updated_at`/`last_seen_at`, sedangkan `@updatedAt` dan field tanpa `@default(now())` pada Prisma tidak meminta DB default | Baseline mengikuti deklarasi Prisma; application client tetap bertanggung jawab atas `@updatedAt` |
| Foreign-key actions | Diff menunjukkan beberapa FK unit pada local perlu remove/add untuk menyamai action yang dideklarasikan Prisma | Tidak diperbaiki di local; baseline baru membuat action eksplisit dari schema |
| Index names | Local memakai nama historis seperti suffix `_unique`/`_index`; Prisma menghasilkan suffix `_key`/`_idx` | Perbedaan nama/history, bukan perubahan KPI atau data mapping |
| `coal_receipts` index | Local memiliki index tambahan pada `import_run_id` yang tidak didefinisikan oleh model saat ini | Tidak dibawa ke baseline agar artifact tetap 1:1 dengan Prisma; review performance dapat dilakukan terpisah |

Perbedaan tersebut adalah alasan baseline production tidak boleh dibuat dengan
menyalin schema local secara membuta atau menjalankan diff rollback terhadap
local. Tidak ada ALTER, DROP, atau data correction yang dilakukan.

## Artifact baseline

Artifact yang digenerate secara read-only dari Prisma CLI:

[SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql](./SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql)

Karakteristik artifact:

- `CREATE SCHEMA IF NOT EXISTS public`.
- Membuat 30 tabel sesuai model Prisma.
- Membuat 40 index (unique dan non-unique sesuai `@@unique`/`@@index`).
- Membuat 19 foreign key dengan `ON DELETE` dan `ON UPDATE` sesuai schema.
- Mempertahankan precision decimal, timestamp precision, nullable, default,
  dan unique key.
- Tidak membuat enum, extension, tabel Laravel `migrations`, atau
  `_prisma_migrations`; tabel `_prisma_migrations` dikelola oleh Prisma Migrate
  saat deployment yang sudah disetujui.
- Tidak berisi business data, credential, environment value, atau Google
  Sheets content.
- Bukan migration executable sampai dipindahkan ke history production yang
  telah disetujui.

Static validator:

```text
node scripts/verify-production-schema-baseline-design.mjs
```

Hasil validator:

```text
PASS
modelCount       = 30
tableCount       = 30
indexCount       = 40
foreignKeyCount  = 19
database writes  = 0
SQL execution    = 0
```

## Option A vs Option B

| Kriteria | Option A — clean full production baseline | Option B — restore Laravel schema lalu old migrations |
| --- | --- | --- |
| Target kosong | Langsung cocok secara desain | Harus dipopulasi schema legacy terlebih dahulu |
| Ketergantungan Laravel | Tidak menjadi prerequisite deployment | Menjadi prerequisite wajib |
| Migration history | Perlu production history baru/terpisah yang disetujui | Memakai history lama tetapi baseline no-op tetap harus dipenuhi |
| Risiko duplicate object | Rendah setelah history baru dipastikan clean | Tinggi jika baseline/additive dijalankan pada state yang tidak tepat |
| Kesesuaian Prisma | Langsung digenerate dari current schema | Bergantung pada kompatibilitas schema legacy dan additive chain |
| Data lama | Tidak disentuh karena target kosong | Memerlukan keputusan restore/copy schema dan kemungkinan data |
| Future migrations | Lebih jelas: baseline tunggal lalu additive migration baru | Harus terus membawa konteks Laravel legacy |
| Rollback | Restore target sebelum data import; tidak ada auto-down migration | Rollback lebih rumit karena legacy dan additive objects bercampur |
| Rekomendasi | **Dipilih** | Tidak dipilih |

### Catatan history production

Jangan sekadar menambahkan file baseline ini sebagai migration timestamp baru
di samping lima migration lama. Prisma akan tetap mencoba menjalankan semua
entry lama pada target kosong dan dapat membuat object duplicate atau gagal
karena dependency. Packaging yang aman membutuhkan salah satu keputusan manual
berikut:

1. membuat release/branch production dengan migration history bersih yang
   berisi baseline penuh ini; history local lama tetap disimpan sebagai
   historical reference; atau
2. memilih prosedur resmi lain untuk menandai history lama sebagai applied dan
   menguji seluruh urutannya pada disposable target.

Phase 21C hanya mendesain dan tidak memilih perubahan repository/history
production tersebut secara otomatis.

## Rencana validasi sebelum eksekusi (belum dijalankan)

Urutan aman yang direkomendasikan setelah manual approval:

1. Review checksum artifact dan review `prisma/schema.prisma` pada commit yang
   sama.
2. Buat disposable validation database yang kompatibel PostgreSQL/Supabase;
   jangan memakai target production untuk eksperimen.
3. Pakai migration history production yang disetujui dan jalankan deploy hanya
   pada disposable target.
4. Verifikasi inventory 30 tabel, 40 index, 30 PK, 19 FK, precision, default,
   nullable, dan absence of `BIOMASS_STOCK`.
5. Jalankan `prisma migrate diff` dari hasil disposable target ke
   `schema.prisma`; target valid apabila tidak ada diff yang tidak diharapkan.
6. Jalankan aplikasi dengan environment disposable/read-only untuk smoke test
   auth, dashboard, KPI, chart, sync registry, dan import metadata tanpa
   mengubah business data production.
7. Ambil backup/snapshot target sebelum schema migration production. Simpan
   checksum dan waktu backup.
8. Hanya setelah schema gate dan approval berikutnya lulus, rencanakan data
   migration/import secara terpisah.

Tidak ada langkah di atas yang dieksekusi pada Phase 21C.

## Rollback dan recovery design

Tidak ada down migration otomatis yang dibuat. Untuk target yang masih kosong,
recovery paling aman adalah:

- sebelum deploy, simpan backup/snapshot target dan checksum;
- jika migration gagal sebelum commit, hentikan proses dan baca status
  `_prisma_migrations`; jangan menjalankan drop otomatis;
- jika target disposable, buang/recreate target disposable sesuai prosedur
  infrastrukur yang disetujui;
- jika target production sudah menerima sebagian schema, lakukan recovery
  berdasarkan backup/snapshot atau prosedur Prisma yang direview manual;
- jangan memakai `DROP`, `TRUNCATE`, `prisma migrate reset`, atau rollback
  destruktif otomatis pada target bersama;
- business-data import tidak boleh dimulai sebelum schema dan parity gate
  dinyatakan lulus.

Pembuatan down migration atau prosedur penghapusan object production
memerlukan **REQUIRES MANUAL APPROVAL**.

## Review items / manual approval

Phase 21C menghasilkan desain yang konsisten, tetapi item berikut tetap harus
disetujui secara manual sebelum Phase 21D atau eksekusi apa pun:

1. History production: clean history baru (Option A) atau prosedur resmi
   `migrate resolve`/history lain yang telah diuji.
2. Apakah tabel metadata Laravel `migrations` perlu dipertahankan di Supabase
   untuk kebutuhan operasional di luar Prisma. Baseline Prisma tidak
   membutuhkannya.
3. Disposisi database local lama dan perbedaan tipe/default legacy; Phase 21C
   tidak mengubah local agar data 2.409 rows tetap aman.
4. Backup/snapshot dan owner recovery sebelum schema migration.
5. Pengujian Supabase disposable yang kompatibel dengan extension/permission
   yang dibutuhkan.
6. Approval terpisah untuk data migration dan perubahan `DATABASE_URL` setelah
   schema parity dinyatakan lulus.

## Final Phase 21C report

| Check | Status |
| --- | --- |
| Semua model Prisma diinventarisasi | PASS — 30/30 |
| Field, precision, nullability, default diaudit | PASS berdasarkan `schema.prisma` dan generated artifact |
| Dependency graph | PASS — tidak ada cycle; 19 FK terpetakan |
| Existing migration history diaudit | PASS WITH REVIEW — no-op baseline tidak standalone |
| Local vs Prisma read-only comparison | PASS WITH REVIEW — legacy differences terdokumentasi |
| Empty-target baseline artifact | PASS — 30 tabel, 40 index, 19 FK |
| Destructive operation dijalankan | NO |
| Local database berubah | NO |
| Supabase berubah | NO |
| Business data berubah | NO |
| Initial migration siap deploy | **REVIEW — belum dipackage ke `prisma/migrations`** |
| Phase 21C | **PASS WITH REVIEW** |

### Required stop condition

Phase 21C selesai pada dokumen dan artifact desain ini. Jangan menjalankan
Phase 21D, schema migration, data migration, import, sync, cutover, atau
deployment tanpa approval manual dan history production yang sudah dipilih.
