# Controlled Historical Sync Registry Backfill

Tanggal eksekusi: 1 September 2026
Environment: PostgreSQL lokal `dashboard_pln` dan Google Sheets read-only untuk source
Gate A: **PASS**
Gate B: **APPROVED — CONTROLLED METADATA BACKFILL EXECUTED**
Status Phase 17B: **PASS WITH REVIEW**

## Objective

Menjalankan backfill metadata-only untuk enam worksheet historis Januari–Juni
2026 yang business record-nya sudah ada di PostgreSQL tetapi belum memiliki
`sync_row_states` dan content hash pada registry.

Backfill tidak membuat, mengubah, menggabungkan, atau menghapus business data.
Write hanya dijalankan setelah Gate B disetujui secara eksplisit dan dibatasi
oleh guard `--approve-metadata-only`.

## Reason for Backfill

Phase 17A menemukan:

- 2.409/2.409 business records cocok dengan source identity;
- identity mismatch = 0;
- duplicate = 0;
- orphan = 0;
- Juli26-BB memiliki 352 row state lengkap;
- Januari–Juni memiliki 2.057 row valid tanpa row state/content hash;
- registry dry-run menghasilkan `INSERT=2.057`, `SKIP=352`.

Masalahnya adalah metadata registry belum merekam bahwa 2.057 record tersebut
sudah pernah diimpor. Ini bukan indikasi business data hilang.

## Scope

Target backfill hanya:

| Worksheet | Target rows |
| --- | ---: |
| Januari26-BB | 352 |
| Februari26-BB | 319 |
| Maret26-BB | 352 |
| April26-BB | 341 |
| Mei26-BB | 352 |
| Juni26-BB | 341 |
| **Total** | **2.057** |

Juli26-BB tidak menjadi target karena registry-nya sudah lengkap dan akan
digunakan sebagai regression reference.

Tidak diproses:

- worksheet sebelum Januari 2026;
- worksheet tahun/periode lain;
- worksheet setelah Juli26-BB;
- worksheet non-BB;
- `BIOMASS_STOCK`;
- Supabase/Vercel;
- database migration atau schema change.

## Phase 17A Findings

Hasil live read-only terbaru:

| Metric | Result |
| --- | ---: |
| Source rows seluruh Januari–Juli | 2.409 |
| Matched ke projection domain PostgreSQL | 2.409 |
| Historical rows target backfill | 2.057 |
| Historical matched | 2.057 |
| Missing business record | 0 |
| Ambiguous match | 0 |
| Duplicate | 0 |
| Identity review | 0 |
| Existing row states | 352 |
| Open schema changes | 0 |
| Database writes pada audit | 0 |

Periode historical dikenali sebagai `LEGACY_FAMILY_A`, sedangkan Juli26-BB
dikenali sebagai `CANONICAL_FAMILY`. Seluruh historical plan berstatus
`READY_FOR_IMPORT` dan memiliki 0 rejected row.

## Preflight

Gate A dijalankan dengan pembacaan metadata, source, plan, mapping, domain
database, dan registry. Gate A **PASS** karena seluruh prasyarat backfill
terpenuhi:

| Check | Result |
| --- | --- |
| Enam worksheet target ditemukan | PASS, 6/6 |
| Source plan valid | PASS |
| Total target rows | 2.057 |
| Existing business record matched | 2.057/2.057 |
| Missing | 0 |
| Ambiguous | 0 |
| Duplicate | 0 |
| Business-data write classification | 0 |
| Deterministic plan entries | 2.057 |
| Plan fingerprint | `26ffdec5582ed04f` |
| Identity bergantung pada row/cell number | Tidak |
| Database writes sebelum approval | 0 |

Fingerprint hanya digunakan untuk memastikan rencana yang ditinjau sama dengan
rencana yang dieksekusi nanti; raw row, credential, dan secret tidak dicetak.

## Backfill Plan

Rencana metadata-only yang disusun sebelum write:

| Target metadata | Create | Update | Delete | Keterangan |
| --- | ---: | ---: | ---: | --- |
| `sync_row_states` | 2.057 | 0 | 0 | Satu state per stable source identity |
| `sync_worksheets` | 0 | 6 | 0 | Status, schema/content hash, normalized row count, last sync metadata |
| `sync_schema_changes` | 0 | 0 | 0 | Tidak membuat synthetic change; tidak ada OPEN change |
| `sync_runs` | 0 | 0 | 0 | Tidak membuat run synthetic; architecture existing source-level |
| `spreadsheet_import_runs` | 0 | 0 | 0 | Provenance existing tidak ditulis ulang |
| Business tables | 0 | 0 | 0 | Tidak boleh disentuh |

Update `sync_worksheets` hanya menggunakan field metadata existing:
`status`, `lastSyncAt`, `schemaHash`, `schemaSnapshot`, `contentHash`, dan
normalized `rowCount`. Tidak ada penambahan kolom atau tabel.

Planned state untuk existing business records adalah equivalent `SYNCED`, yaitu
row state tersedia dengan `lastSyncedAt`, bukan `READY_FOR_INSERT`.

## Manual Approval

Gate B telah disetujui secara eksplisit oleh user untuk:

```text
controlled metadata backfill untuk 2.057 row historis Januari–Juni 2026
```

Command dijalankan dengan guard `--approve-metadata-only`. Guard tersebut
mencegah command menulis jika flag approval eksplisit tidak diberikan.

Hanya target yang tercantum pada scope report ini yang diproses.

## Execution Result

Transaction metadata-only berhasil:

| Metric | Actual |
| --- | ---: |
| Historical row states created | 2.057 |
| `sync_worksheets` updated | 6 |
| Business INSERT | 0 |
| Business UPDATE | 0 |
| Business DELETE | 0 |
| Destructive operations | 0 |
| Migration/db push | Tidak dijalankan |

## Metadata Changes

Metadata yang dibuat/diperbarui setelah Gate B disetujui:

- 2.057 `sync_row_states` dengan `sourceKey`, `entityType`, `contentHash`,
  `lastSeenAt`, dan `lastSyncedAt`;
- enam `sync_worksheets` dengan status `ACTIVE`, schema fingerprint,
  schema snapshot, worksheet content hash, normalized row count, dan metadata
  last sync;
- tidak ada perubahan pada business table;
- tidak ada mapping-version column pada schema existing, sehingga tidak ada
  fake mapping version yang ditulis.

Tidak ada row yang memerlukan business-data write. Transaction berhasil commit
setelah seluruh guard metadata-only terpenuhi.

## Business Data Protection

Snapshot read-only preflight:

| Domain | Count |
| --- | ---: |
| `biomass_receipts` | 49 |
| `biomass_consumptions` | 636 |
| `coal_receipts` | 7 |
| `coal_consumption` | 1.731 |
| `coal_stock` | 577 |
| `solar_receipts` | 7 |
| `solar_consumptions` | 212 |
| `hop_readings` | 636 |
| `biomass_targets` | 1 |
| `biomass_cumulative_snapshots` | 7 |
| `spreadsheet_import_staging` | 3.919 |

Integrity baseline:

- duplicate business-key groups: 0;
- orphan rows: 0;
- active units: Unit 1, Unit 2, Unit 3;
- target biomass: 70.020 ton;
- source/domain identity mismatch: 0.

Snapshot database metadata dan count sebelum/sesudah preflight read-only tetap
identik. Ini adalah baseline perlindungan, bukan post-backfill snapshot.

## Post-Backfill Snapshot

Post-backfill snapshot berhasil diambil setelah transaction commit.

- business-data fingerprint sebelum/sesudah: `0a9dc55dc1ad3a0b` / `0a9dc55dc1ad3a0b`;
- business data changed: **NO**;
- seluruh count tabel business yang diaudit tetap sama;
- unit tetap Unit 1, Unit 2, Unit 3 dan target biomass tetap 70.020 ton;
- duplicate business-key group, orphan, dan identity mismatch tetap 0;
- perubahan hanya terjadi pada metadata registry sesuai execution plan;
- transaction backfill selesai tanpa rollback atau error.

Count business pasca-backfill tetap: `biomass_receipts=49`,
`biomass_consumptions=636`, `coal_receipts=7`, `coal_consumption=1.731`,
`coal_stock=577`, `solar_receipts=7`, `solar_consumptions=212`,
`hop_readings=636`, `biomass_targets=1`,
`biomass_cumulative_snapshots=7`, `power_generation=1.095`,
`coal_quality=1.095`, `kpi_targets=1.095`, dan
`spreadsheet_import_staging=3.919`.

## Registry State

Actual sebelum backfill:

| Registry item | Actual |
| --- | --- |
| `sync_sources` | 1, ACTIVE |
| `sync_worksheets` | 199 |
| Target worksheet rows | 6, status DISCOVERED |
| Juli26-BB worksheet | ACTIVE |
| `sync_row_states` | 352, Juli26-BB saja |
| Historical row states | 0 |
| `sync_schema_changes` OPEN | 0 |

Actual setelah backfill:

```text
historical row states: 2.057
all-scope row states:   2.409
historical state:       SYNCED/equivalent
target worksheets:      6 ACTIVE
content hash missing:   0
```

`sync_row_states` berubah dari 352 menjadi 2.409: 352 state Juli26-BB yang
sudah ada tetap utuh dan 2.057 state historis berhasil dibuat. Enam worksheet
target berubah dari `DISCOVERED` menjadi `ACTIVE` dan seluruh metadata hash serta
schema snapshot telah tersimpan.

## Content Hash

Hash akan dihitung dari canonical normalized source row menggunakan implementasi
existing. Stable identity dan normalized value digunakan; row number, cell
address, formatting, dan whitespace non-signifikan tidak digunakan.

Actual metadata:

- 2.057 row content hash berhasil dibuat;
- enam worksheet aggregate content hash berhasil disimpan;
- hash Juli26-BB tidak diubah;
- seluruh 2.409 row state memiliki content hash setelah backfill.

Preflight menemukan 2.057 row hash belum ada; post-backfill hash yang hilang
menjadi 0 dan 352 hash Juli26-BB tetap unchanged.

## Schema Fingerprint

Enam worksheet target memiliki schema fingerprint deterministic dan dikenali
sebagai `LEGACY_FAMILY_A`. Juli26-BB memiliki canonical fingerprint yang sudah
tersimpan.

Metadata-only update berhasil menyimpan `schemaHash` dan `schemaSnapshot` pada
enam existing `sync_worksheets`. Tidak ada Prisma migration atau perubahan
schema pada Phase ini.

## Mapping Version

Implementation memiliki canonical policy `BB_CANONICAL_V1` untuk jalur canonical
setelah Juli26-BB. Legacy mapping yang dipakai preflight tersedia sebagai
`Legacy Family A mapping profile`, tetapi tidak memiliki field mapping-version
persisted pada schema registry existing.

Karena itu:

- tidak membuat version fiktif seperti `BB_FAMILY_A_V1`;
- tidak melakukan migration untuk menambah field;
- metadata gap dicatat sebagai `MAPPING_VERSION_GAP`;
- mapping dapat ditelusuri melalui profile code, fingerprint, worksheet, dan
  report ini.

## Provenance

Source provenance yang tersedia:

- stable source dari Google Sheets registry;
- stable `worksheetKey`/sheet identity pada `sync_worksheets`;
- worksheet title dan period;
- source identity per entity;
- mapping profile;
- schema fingerprint dan snapshot;
- existing `spreadsheet_import_runs` dan staging rows.

Source row number/cell bila ada hanya dianggap sebagai referensi provenance,
bukan permanent identity.

Tidak ada synthetic `sync_run` yang direncanakan karena `sync_runs` pada
arsitektur existing masih source-level. Existing import run provenance tidak
ditimpa.

## Idempotency

Actual registry/dry-run setelah backfill:

| Scope | INSERT | UPDATE | SKIP | FAILED |
| --- | ---: | ---: | ---: | ---: |
| Januari–Juli live registry | 0 | 0 | 2.409 | 0 |
| Juli26-BB regression | 0 | 0 | 352 | 0 |
| Source-seeded isolated fixture | 0 | 0 | 2.409 | 0 |

Full live dry-run pasca-backfill menghasilkan `INSERT=0`, `UPDATE=0`,
`SKIP=2.409`, `FAILED=0`. Tidak ada duplicate plan.

## Retry

Fixture retry existing berstatus PASS untuk:

- transient Google rate limit, timeout, dan API 5xx;
- transient database connection/timeout/transaction conflict;
- bounded retry dengan backoff;
- fail-fast untuk permission, authentication, validation, schema, dan
  constraint error.

Backfill metadata dijalankan dalam transaction Prisma; transaction berhasil
commit dan business data tidak disentuh.

## Concurrency

Static lease/concurrency fixture berstatus PASS. Existing source-level lease
`lockToken`/`lockExpiresAt` mencegah dua orchestrator memproses source yang sama.

Live contention test tidak dijalankan karena preflight wajib read-only. Controlled
backfill harus dijalankan serial dengan scheduler sync dihentikan/diisolasi
secara operasional atau menggunakan lease existing sesuai implementation.

## Cron Security

Endpoint `/api/sync/google-sheets` tetap dilindungi `CRON_SECRET` server-side.
Static cron auth test:

- valid bearer: diterima;
- invalid bearer: ditolak;
- authorization tidak ada: ditolak.

Preflight tidak memanggil endpoint cron dan tidak menjalankan sync production.

## Regression

Regression pasca-backfill:

| Check | Actual |
| --- | --- |
| Historical match | 2.057/2.057 |
| Full identity mismatch | 0 |
| Duplicate | 0 |
| Orphan | 0 |
| Units | Unit 1, Unit 2, Unit 3 |
| Target biomass | 70.020 ton |
| Juli26 insert/update/skip | 0 / 0 / 352 |
| Full insert/update/skip/failed | 0 / 0 / 2.409 / 0 |

New-row, changed-row, unchanged-row, row-reorder, retry, schema-drift, dan
concurrency isolated fixtures tetap PASS. Regression live pasca-write juga
PASS.

## Validation

| Command/check | Result |
| --- | --- |
| Live preflight `sync:verify-historical-registry` | PASS Gate A; stopped before write |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run db:verify` | PASS |
| `sync:verify-auto-admission` | PASS |
| `sync:verify-incremental` | PASS |
| `sync:verify-retry` | PASS |
| `sync:verify-schema` | PASS |
| `sync:verify-state` | PASS; 199 worksheets, 2.409 states, 0 open changes, 0 active leases |
| `sync:verify-config` | PASS; credential values tidak dicetak |
| `sync:verify-cron-auth` | PASS |
| `sync:backfill-historical-registry -- --approve-metadata-only` | PASS; 2.057 row states dibuat, 6 worksheet metadata diperbarui, business writes 0 |
| `npm test` | `TEST_COMMAND_NOT_AVAILABLE` |

Production build tidak dijalankan untuk deployment; build validation lokal
berhasil.

## Database Safety

```text
Business INSERT: 0
Business UPDATE: 0
Business DELETE: 0
Business data changed: NO
Metadata writes before Gate B: 0
Metadata writes in approved transaction: 2.063 (2.057 create + 6 update)
Destructive operations: NONE
Migration: NOT RUN
Prisma db push: NOT RUN
Supabase: NOT USED
Google Sheets changed: NO
Laravel changed: NO
Credentials changed: NO
```

## Issues

### Gate B executed successfully

Persetujuan eksplisit diterima dan guard `--approve-metadata-only` berhasil
melewati seluruh preflight. Transaction metadata-only selesai tanpa business
INSERT/UPDATE/DELETE.

### MAPPING_VERSION_GAP — existing schema limitation

Registry belum memiliki field mapping version untuk legacy profile. Tidak ada
migration yang dilakukan; profile dan fingerprint tetap didokumentasikan.

### SYNC_RUN_ASSOCIATION_GAP — existing architecture limitation

`sync_runs` masih source-level dan tidak memiliki worksheet foreign key langsung.
Worksheet provenance tetap tersedia pada `sync_worksheets`, row states, import
runs, dan staging.

### Legacy parser diagnostics — informational

Januari–Juni masing-masing memiliki diagnostics scan non-blocking (16
unresolved, 1 ambiguous, 1 warning), tetapi 0 rejected row, plan READY, dan
identity reconciliation PASS. Nilai ini harus tetap dipantau pada sync berikutnya.

## Final Status

**PHASE 17B — PASS WITH REVIEW**

Gate A: **PASS**

- target 2.057;
- matched 2.057;
- missing 0;
- ambiguous 0;
- duplicate 0;
- planned dan actual business INSERT/UPDATE/DELETE 0;
- deterministic metadata plan fingerprint `26ffdec5582ed04f` cocok;
- metadata backfill: 2.057 row state dibuat dan 6 worksheet diperbarui;
- post-backfill business fingerprint tidak berubah;
- full idempotency: `INSERT=0`, `UPDATE=0`, `SKIP=2.409`, `FAILED=0`;
- Juli26-BB regression: `INSERT=0`, `UPDATE=0`, `SKIP=352`;
- seluruh validasi database, registry, fixture, TypeScript, lint, dan build PASS.

Gate B: **PASS — APPROVED AND EXECUTED**

Status `PASS WITH REVIEW` mempertahankan dua catatan arsitektur non-blocking:
`MAPPING_VERSION_GAP` dan `SYNC_RUN_ASSOCIATION_GAP`. Keduanya tidak mengubah
business data dan tidak menghalangi hasil controlled backfill ini. Tidak ada
blocker operasional pada Phase 17B.

## Files Changed in Phase 17B

- `scripts/audit-historical-sync-registry-reconciliation.ts` — preflight dan
  audit pasca-backfill;
- `scripts/backfill-historical-sync-registry.ts` — guarded metadata-only
  transaction;
- `package.json` — script backfill terkontrol;
- `docs/CONTROLLED_HISTORICAL_SYNC_REGISTRY_BACKFILL_2026-09-01.md` — report
  execution dan validasi.
