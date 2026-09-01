# BB Persistence Decision Report

Tanggal: 30 Agustus 2026  
Scope: decision gate persistence BB; audit read-only; tidak ada import pada phase ini.

## Executive Summary

Phase 12 mengaudit model database lokal, canonical worksheet `Juli26-BB`, dan keputusan yang masih diperlukan sebelum 20 worksheet legacy BB dapat diproses.

Kesimpulan utama:

- Model existing cukup untuk canonical receipt, consumption, coal stock, solar, HOP, target, dan cumulative snapshot dengan batasan mapping yang dicatat di bawah.
- `BIOMASS_STOCK` ditemukan sebagai fakta source yang belum memiliki model/tabel existing. Jika biomass stock wajib dipersistenkan, diperlukan schema additive baru. Tidak ada schema yang dibuat pada fase ini.
- Stock pada source memiliki opening dan closing harian. Import plan saat ini hanya membawa coal closing/consumed; row `coal_stock` Juli 2026 yang diaudit menyimpan `opening_stock=0` dan `received=0`. Ini merupakan persistence/mapping gap yang harus diperbaiki sebelum stock equation dianggap tervalidasi.
- Identity normalized saat ini memakai natural key table dan SHA-256 source/content key. Row number bukan identity permanen, tetapi block/semantic path belum selalu menjadi bagian identity sehingga collision legacy ditemukan.
- 22 duplicate groups pada `Juni23-BB` dan `September25-BB` tetap memerlukan keputusan owner. Tidak ada row yang dihapus, digabung, atau dipilih sebagai pemenang.
- Semua 20 legacy tetap berada pada gate manual. `Juli26-BB` tetap `IMPORT_NOW` sebagai status gate, tetapi tidak ada import dijalankan pada Phase 12.

Final status: **BB PERSISTENCE DECISION -- PASS WITH REVIEW**. Status ini bukan authorization untuk import. Legacy import tetap tertahan sampai manual decision register disetujui.

## Existing Database Model

Database yang diaudit adalah PostgreSQL existing `dashboard_pln`, schema `public`. Audit hanya menggunakan pembacaan metadata, count, aggregate, dan foreign-key checks.

| Domain/model | PostgreSQL table | Grain utama | Row count saat audit | Kondisi |
| --- | --- | --- | ---: | --- |
| Unit | `units` | master Unit | 3 | Unit 1, Unit 2, Unit 3; aktif |
| CoalQuality | `coal_quality` | unit + date | 1.095 | FK ke Unit, unique unit/date |
| CoalConsumption | `coal_consumption` | unit + date | 1.188 | precision existing `NUMERIC(12,2)` |
| CoalStock | `coal_stock` | date | 396 | unique date; tidak memiliki FK unit |
| PowerGeneration | `power_generation` | unit + date | 1.095 | FK ke Unit |
| KpiTarget | `kpi_targets` | unit + date | 1.095 | FK ke Unit |
| BiomassReceipt | `biomass_receipts` | period + supplier | 7 | supplier code/name string; tidak ada supplier master/FK |
| BiomassConsumption | `biomass_consumptions` | unit + reading date | 93 | FK ke Unit, unique unit/date |
| CoalReceipt | `coal_receipts` | period | 1 | unique period |
| SolarReceipt | `solar_receipts` | period | 1 | unique period |
| SolarConsumption | `solar_consumptions` | reading date | 31 | unique date |
| HopReading | `hop_readings` | unit + reading date | 93 | FK ke Unit, unique unit/date |
| BiomassTarget | `biomass_targets` | target year | 1 | unique target year, target positive |
| BiomassCumulativeSnapshot | `biomass_cumulative_snapshots` | period start | 1 | unique period |
| SpreadsheetImportRun | `spreadsheet_import_runs` | import execution | 6 | audit/import lineage level |
| SpreadsheetImportStaging | `spreadsheet_import_staging` | staged source value | 1.862 | source row/address tersedia |
| SyncSource/Worksheet/Run | sync registry | source/worksheet/run | 1/199/8 | discovery and sync state |
| SyncRowState | `sync_row_states` | worksheet + source key | 352 | source key/content hash tersedia |
| SyncSchemaChange | `sync_schema_changes` | worksheet + schema event | 0 | belum ada recorded schema event |

### Keys, indexes, and relationships

- Primary key domain tables menggunakan `id` auto-increment, kecuali tabel framework tertentu.
- Natural uniqueness yang relevan: `biomass_receipts(period_start, supplier_code)`, `biomass_consumptions(unit_id, reading_date)`, `coal_consumption(unit_id, date)`, `coal_quality(unit_id, date)`, `power_generation(unit_id, date)`, `kpi_targets(unit_id, date)`, `hop_readings(unit_id, reading_date)`, `coal_stock(date)`, `coal_receipts(period_start)`, `solar_receipts(period_start)`, `solar_consumptions(reading_date)`, `biomass_targets(target_year)`, dan `biomass_cumulative_snapshots(period_start)`.
- FK normalized import facts menuju `spreadsheet_import_runs` memakai `ON DELETE RESTRICT`.
- Consumption, quality, generation, dan HOP memiliki FK ke `units`. Canonical unit database terverifikasi sebagai `PLTU-1`/`Unit 1`, `PLTU-2`/`Unit 2`, dan `PLTU-3`/`Unit 3`.
- Sync hierarchy adalah `sync_sources -> sync_worksheets -> sync_row_states/sync_schema_changes`, dengan foreign key restrict.
- Tidak ditemukan model atau tabel supplier. Supplier identity saat ini adalah atribut string pada `biomass_receipts`.
- Tidak ditemukan model atau tabel `biomass_stock`.
- Tidak ada FK langsung dari normalized fact ke `sync_worksheets`; hubungan provenance terutama melalui import run, source worksheet/cell, serta sync registry terpisah.
- Index date/status/source sudah tersedia untuk query dashboard dan audit dasar. Tidak ada index yang ditambahkan pada fase ini.

Relasi yang diuji untuk Unit (`coal_quality`, `coal_consumption`, `biomass_consumptions`, dan `hop_readings`) tidak memiliki orphan row pada saat audit.

## Canonical BB Model

`Juli26-BB` adalah canonical reference untuk struktur, semantics, field position, unit, supplier, dan import shape. Nilai Juli 2026 hanya menjadi reference parity; tidak disalin ke periode lain.

| Canonical source domain | Existing persistence | Status keputusan |
| --- | --- | --- |
| Penerimaan Biomassa tujuh supplier | `biomass_receipts` | Cukup untuk canonical supplier-period fact |
| Pemakaian Biomassa Unit 1-3 harian | `biomass_consumptions` | Cukup; natural key unit/date |
| Penerimaan Batubara periode | `coal_receipts` | Cukup untuk period fact |
| Pemakaian Batubara Unit 1-3 harian | `coal_consumption` | Cukup secara grain; precision 2 desimal harus diterima/review |
| Stok Batubara harian | `coal_stock` | Tabel cukup secara kolom, tetapi current import mapping belum mengisi opening/received |
| Pemakaian/penerimaan Solar | `solar_consumptions`/`solar_receipts` | Cukup untuk canonical grain |
| HOP Unit 1-3 harian | `hop_readings` | Cukup; natural key unit/date |
| Target Biomassa tahunan | `biomass_targets` | Cukup untuk satu current target per year; tidak cukup untuk version history tanpa policy tambahan |
| Realisasi kumulatif | `biomass_cumulative_snapshots` | Cukup untuk satu snapshot per period |
| Stok Biomassa material/scope | none | `SCHEMA_CHANGE_REQUIRED` jika termasuk scope persistence |

Canonical live read menghasilkan parser errors 0, unresolved 0, ambiguous 0, 11.594 scanned cells, dan import plan `READY_FOR_IMPORT` dengan 352 planned rows. Nilai parity reference:

| Metric | Juli26-BB |
| --- | ---: |
| Penerimaan Biomassa tujuh supplier | 3.223,46 ton |
| Pemakaian Biomassa bulanan | 3.740,65 ton |
| Target Biomassa 2026 | 70.020 ton |
| Realisasi kumulatif | 29.103,77 ton |
| Progress | 41,564938...% |

Warning canonical yang tetap berlaku:

1. Label blok current ketiga terbaca sebagai duplicate/typo Unit 2 dan dipetakan sebagai Unit 3 berdasarkan urutan blok Unit 1-3.
2. Candidate dashboard total Biomassa berbeda dari total semantic Unit 1-3; parser mempertahankan total Unit 1-3 sesuai business rule yang telah divalidasi.

## BIOMASS_STOCK Analysis

### Classification

Top-level daily stock fields pada `Juli26-BB` diklasifikasikan sebagai **REPORTED_VALUE candidate**: nilai opening/closing berasal dari cell source, bukan hasil kalkulasi aplikasi.

KWH Green stock blocks belum dapat diberi satu semantics final. Nilai terlihat sebagai blok pelaporan/duplikasi downstream dengan scope Unit 3, NK BM, NK BB, dan blok `1`; status semantics-nya **NEEDS_REVIEW** dan tidak boleh otomatis disamakan dengan stock site-level.

### Fields observed

| Source field | Scope evidence | Date grain | Value evidence | Decision |
| --- | --- | --- | --- | --- |
| `STOK AWAL > BATUBARA > TON` | site/global | daily | 31/31 numeric | reported opening stock |
| `STOK AKHIR > BATUBARA > TON` | site/global | daily | 31/31 numeric | reported closing stock |
| `STOK AWAL/AKHIR > BIOMASSA SAWDUST` | material; supplier belum terbukti | daily | 31/31 numeric | reported value; supplier relation unknown |
| `STOK AWAL/AKHIR > BIOMASSA WOODCHIP` | material; supplier belum terbukti | daily | 31/31 numeric | reported value; supplier relation unknown |
| `STOK AWAL/AKHIR > BIOMASSA LRUK` | material | daily | opening numeric; closing 25/31 numeric | dash/null harus tetap unknown, bukan otomatis 0 |
| `STOK AWAL/AKHIR > BIOMASSA SRF` | material | daily | 31/31 numeric | reported value |
| `STOK AWAL/AKHIR > BIOMASSA BONGGOL` | material | daily | 31/31 numeric | reported value |
| `KWH GREEN > ... > BIOMASSA > STOK AKHIR ...` | Unit/NK/block | daily | repeated values and mixed scope | NEEDS_REVIEW; jangan deduplicate otomatis |

Minimum logical identity yang diperlukan jika biomass stock dipersistenkan adalah `reading_date + stock_scope + material_code + record_type`, ditambah source/provenance. Supplier tidak boleh dipakai sebagai key sebelum mapping material-to-supplier disetujui.

## Stock Equation

Equation yang diaudit:

```text
opening_stock + receipt - consumption = closing_stock
```

Source memang menyediakan opening dan closing harian untuk coal dan beberapa kategori Biomassa. Namun, current import plan hanya memiliki `CoalStockImportRecord.closingStock` dan `consumed`; `received` pada `CoalReceipt` berada pada grain period, bukan daily stock allocation. Karena itu `calculated_closing_stock` belum dapat divalidasi secara independen untuk seluruh periode.

Contoh source canonical yang aman sebagai evidence, bukan correction:

| Date | Reported opening | Consumed | Reported closing | Implied daily receipt | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 Juli 2026 | 22.841,466 | 793,231 | 22.048,235 | 0,000 | implied only; receipt harian tidak tersedia sebagai source field |
| 2 Juli 2026 | 22.048,235 | 1.189,882 | 26.047,210 | 5.188,857 | implied only; bukan receipt source |

Contoh row database yang diaudit:

- 1 Juli 2026: `opening_stock=0`, `received=0`, `consumed=793,23`, `closing_stock=22.048,24`.
- 31 Juli 2026: `opening_stock=0`, `received=0`, `consumed=0`, `closing_stock=17.985,86`.

Dengan demikian, database row saat ini tidak menjadi bukti bahwa equation source telah tersimpan lengkap. Ini adalah **MAPPING/IMPLEMENTATION GAP**, bukan alasan untuk mengubah source atau melakukan correction. `STOCK_VARIANCE` belum boleh dihitung sebagai business variance sebelum opening dan receipt grain dipetakan.

Keputusan: gunakan **validation-only layer** pada fase berikutnya. Simpan reported values terpisah dari calculated/implied values. Jangan menulis calculated value ke kolom raw source fact dan jangan mengoreksi reported closing stock otomatis.

## Data Provenance

| Required provenance | Kondisi existing | Penilaian |
| --- | --- | --- |
| `source_file` | Source Google Sheets direpresentasikan secara tidak langsung melalui import run/source dan sync source external id; tidak ada file path persistent yang aman | PARTIAL |
| `source_worksheet` | Ada pada staging dan normalized import tables baru; ada pada sync worksheet registry | PASS untuk jalur baru |
| `source_row` | Ada pada `spreadsheet_import_staging.source_row`; tidak ada langsung pada sebagian normalized tables | PARTIAL |
| `source_period` | Ada pada requested/effective period dan period/date fact | PASS dengan validasi periode |
| `source_date` | Ada pada daily fact (`reading_date`/`date`) dan source parser | PASS untuk daily fact |
| `source_hash` | Ada sebagai source/content hash pada sync row state; tidak menjadi kolom langsung pada semua normalized facts | PARTIAL |

Current `SpreadsheetImportRun` menyimpan source, requested/effective worksheet, range, period, checksum, dan status. Staging menyimpan raw value, source row/address, normalized value, dan validation status. Normalized Biomassa/Solar/HOP/target/cumulative menyimpan import run, worksheet, dan sebagian source cell. Existing coal tables tidak semuanya menyimpan import run/provenance.

Keputusan: staging dan sync registry dipertahankan sebagai audit evidence. Untuk full historical traceability, desain provenance direct-link atau provenance table perlu disetujui sebelum bulk legacy import. Ini adalah **SCHEMA_CHANGE_RECOMMENDED**, dan menjadi **SCHEMA_CHANGE_REQUIRED** bila audit row-level wajib dilakukan dari normalized fact tanpa membuka staging/sync registry.

## Identity Strategy

### Existing identity

- Database surrogate key: `id`.
- Operational natural keys: period/supplier, unit/date, date, target year, atau period sesuai tabel di atas.
- `sourceKeyForIdentity` menggunakan hash SHA-256 dari entity type, period/date, unit, supplier, dan unit nilai; row number dan cell address sengaja dikeluarkan.
- `contentHash` membedakan payload normalized value dari source identity.
- `SyncRowState` mengikat source key secara unik dalam worksheet.

### Decision

Canonical choice: **COMPOSITE/NATURAL_KEY + SURROGATE_KEY**.

Untuk canonical normalized facts, natural key existing dipertahankan dan `id` menjadi surrogate internal. Untuk future `BIOMASS_STOCK`, key yang diusulkan adalah:

```text
reading_date + stock_scope + material_code + record_type
```

`source_worksheet`, `source_row`, `source_cell`, dan content hash adalah provenance/evidence, bukan pengganti business key. Row number tidak boleh menjadi permanent identity.

Risk: current source key tidak selalu memasukkan block/semantic path. Pada legacy, dua block yang memiliki date/unit/domain sama dapat menghasilkan BUSINESS_KEY_COLLISION. Block/path harus ditambahkan dalam mapping profile sebelum import legacy, bukan ditambahkan secara diam-diam saat commit.

## Duplicate Strategy

Focus wajib: `Juni23-BB` dan `September25-BB`. Evidence di bawah mempertahankan source rows, values, dan block. `BUSINESS_KEY_COLLISION` berarti identity sama tetapi value/block berbeda. `TRUE_DUPLICATE` berarti identity dan normalized content hash sama menurut audit Phase 11E. Kategori Phase 12 lain (`LEGACY_DUPLICATE`, `SOURCE_DUPLICATE`, `UNKNOWN`) tidak dipaksakan karena evidence belum cukup.

| Worksheet | Business key | Source rows | Values | Block | Classification | Recommended decision | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Juni23-BB | coal_consumption; 2023-06-01; UNIT-1; ton | 11, 11 | 627,15 / NULL | daily 8:52/A:O | BUSINESS_KEY_COLLISION | Retain both evidence; include block in approved identity; no winner automatically | HIGH |
| Juni23-BB | coal_consumption; 2023-06-01; UNIT-2; ton | 11, 11 | 581,14 / NULL | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Retain both; resolve source block/business meaning | HIGH |
| Juni23-BB | coal_consumption; 2023-06-01; UNIT-3; ton | 11, 11 | 604,46 / NULL | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Retain both; resolve source block/business meaning | HIGH |
| Juni23-BB | coal_stock; 2023-06-01; ton | 11, 11 | 70429,979 / 55906,725 | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Do not choose stock winner; resolve scope/block first | HIGH |
| Juni23-BB | biomass_consumption; 2023-06-01; UNIT-1; ton | 11, 11 | 20 / NULL | daily 8:52/A:O | BUSINESS_KEY_COLLISION | Retain both; resolve block and missing-value policy | HIGH |
| Juni23-BB | biomass_consumption; 2023-06-01; UNIT-2; ton | 11, 11 | NULL / NULL | UNRESOLVED_BLOCK | TRUE_DUPLICATE | Retain evidence; no automatic merge/delete | HIGH |
| Juni23-BB | biomass_consumption; 2023-06-01; UNIT-3; ton | 11, 11 | NULL / NULL | UNRESOLVED_BLOCK | TRUE_DUPLICATE | Retain evidence; no automatic merge/delete | HIGH |
| Juni23-BB | solar_consumption; 2023-06-01; liter | 11, 11 | 662 / NULL | daily 4:59/BG:CG | BUSINESS_KEY_COLLISION | Retain both; confirm source block | HIGH |
| Juni23-BB | hop_reading; 2023-06-01; UNIT-1; hari | 11, 11 | 128,1 / 101,6 | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| Juni23-BB | hop_reading; 2023-06-01; UNIT-2; hari | 11, 11 | 64 / 50,8 | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| Juni23-BB | hop_reading; 2023-06-01; UNIT-3; hari | 11, 11 | 42,7 / 33,9 | UNRESOLVED_BLOCK | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| September25-BB | coal_consumption; 2025-09-01; UNIT-1; ton | 11, 11 | 458,691 / NULL | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; include block in approved identity | HIGH |
| September25-BB | coal_consumption; 2025-09-01; UNIT-2; ton | 11, 11 | 575,392 / NULL | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; include block in approved identity | HIGH |
| September25-BB | coal_consumption; 2025-09-01; UNIT-3; ton | 11, 11 | NULL / NULL | daily 6:50/R:AN | TRUE_DUPLICATE | Retain evidence; no automatic merge/delete | HIGH |
| September25-BB | coal_stock; 2025-09-01; ton | 11, 11 | 37958,006 / 53596,06 | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Do not choose stock winner; resolve scope/block first | HIGH |
| September25-BB | biomass_consumption; 2025-09-01; UNIT-1; ton | 11, 11 | 66,4 / NULL | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; resolve missing-value policy | HIGH |
| September25-BB | biomass_consumption; 2025-09-01; UNIT-2; ton | 11, 11 | 61,2 / NULL | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| September25-BB | biomass_consumption; 2025-09-01; UNIT-3; ton | 11, 11 | NULL / NULL | daily 6:50/R:AN | TRUE_DUPLICATE | Retain evidence; no automatic merge/delete | HIGH |
| September25-BB | solar_consumption; 2025-09-01; liter | 11, 11 | 693 / NULL | daily 4:64/BO:CO | BUSINESS_KEY_COLLISION | Retain both; confirm source block | HIGH |
| September25-BB | hop_reading; 2025-09-01; UNIT-1; hari | 11, 11 | 69 / 97,4 | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| September25-BB | hop_reading; 2025-09-01; UNIT-2; hari | 11, 11 | 34,5 / 48,7 | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |
| September25-BB | hop_reading; 2025-09-01; UNIT-3; hari | 11, 11 | 23 / 32,5 | daily 6:50/R:AN | BUSINESS_KEY_COLLISION | Retain both; resolve source block | HIGH |

Tidak ada delete, merge, update, winner selection, atau import sebagai bagian dari analisis ini.

## Date Strategy

Gunakan dua konsep terpisah:

```text
worksheet_period = periode yang ditentukan dari nama worksheet
source_date      = tanggal yang dibaca dari cell source
```

Keputusan: gunakan **validation-only layer**, bukan silent period normalization. Format yang berbeda tetapi tanggal semantically valid diberi `DATE_FORMAT_VARIATION`. Tanggal yang berbeda bulan/tahun diberi `PERIOD_MISMATCH` (`DATE_PERIOD_MISMATCH` pada laporan Phase 11E). Tanggal kalender mustahil diberi `INVALID_DATE`. Tidak ada shifting, overwrite, atau assignment ke worksheet lain.

| Worksheet | Finding | Decision |
| --- | --- | --- |
| Juni23-BB | duplicate date 2023-06-01 | manual identity/block review; jangan deduplicate otomatis |
| Juni25-BB | `A41=31` pada Juni | quarantine/review; jangan ubah menjadi 30 |
| September25-BB | duplicate date 2025-09-01 | manual identity/block review; jangan deduplicate otomatis |
| November25-BB | `A41=31` pada November | quarantine/review; jangan ubah menjadi 30 |
| Februari26-BB | `A39=29`, `A40=30`, `A41=31` | quarantine/review; jangan memperbaiki otomatis |
| April26-BB | `A41=31` pada April | quarantine/review; jangan ubah menjadi 30 |
| Juni26-BB | `A41=31` pada Juni | quarantine/review; jangan ubah menjadi 30 |

## Historical Target

Official current target: **70.020 ton**.

- `biomass_targets` saat ini memiliki satu row target year 2026 dengan value 70.020 ton dan uniqueness `target_year`.
- Importer menolak overwrite bila existing target year memiliki nilai berbeda. Guard ini dipertahankan.
- Legacy target yang hilang/tidak terbukti sama diklasifikasikan `UNKNOWN` atau `MANUAL_REVIEW`, bukan current target.
- Historical target tidak boleh ditimpa oleh 70.020 ton.
- Jika historical target harus disimpan sebagai normalized historical fact, uniqueness `target_year` saja tidak cukup. Diperlukan target version/effective-period design (`SCHEMA_CHANGE_RECOMMENDED`, dan menjadi required untuk historical target persistence penuh).

## Unit Strategy

Canonical identity adalah **Unit 1, Unit 2, Unit 3**, dengan database codes `PLTU-1`, `PLTU-2`, dan `PLTU-3`.

Business rule existing bahwa ordered duplicate Unit 2 block dipetakan menjadi Unit 3 tetap dipertahankan sebagai **proposal yang harus dikonfirmasi**, bukan keputusan baru pada phase ini. Unit number tidak boleh ditebak hanya dari posisi jika block semantics berbeda.

## Supplier Strategy

Canonical supplier identities:

| Supplier | Code |
| --- | --- |
| Sawdust PT Syahroni | `sawdust-pt-syahroni` |
| Sawdust PT Bintang | `sawdust-pt-bintang` |
| Woodchip PT Syahroni | `woodchip-pt-syahroni` |
| Woodchip PT RAP | `woodchip-pt-rap` |
| Woodchip CV Multi Paketindo | `woodchip-cv-multi-paketindo` |
| LRUK | `lruk` |
| SRF | `srf` |

Canonical mapping dari `Juli26-BB` memiliki confidence tinggi. Family A memiliki label overlap tinggi tetapi tetap perlu mapping profile. Family B dan C tidak memiliki evidence supplier canonical yang cukup; spelling/abbreviation/semantic variation harus `MANUAL_REVIEW`. Tidak ada supplier rename atau aggregation otomatis.

## Raw vs Derived Data

| Category | Contoh | Persistence decision |
| --- | --- | --- |
| RAW SOURCE FACT | source opening stock, reported closing stock, source receipt, source consumption, source target, source cumulative | simpan sebagai reported/source fact dengan provenance |
| NORMALIZED FACT | BiomassReceipt, BiomassConsumption, CoalReceipt, CoalConsumption, CoalStock, Solar, HOP | simpan pada table domain sesuai grain dan natural key |
| DERIVED VALUE | monthly sums, progress, remaining target, implied receipt, calculated closing stock | hitung di service/view/derived layer; jangan menyamarkan sebagai raw fact |
| VALIDATION RESULT | `STOCK_VARIANCE`, malformed, date mismatch, duplicate classification | simpan sebagai audit/staging decision evidence bila diperlukan; jangan mengoreksi raw value |

KPI `biomassConsumptionMonthly` dan target progress tetap derived dari source/domain yang sudah disetujui. Nilai derived tidak menjadi source of truth baru.

## Proposed Database Model

Proposal berikut konseptual; tidak ada migration atau schema change yang dijalankan.

| Proposal | Table | Purpose | Primary key | Foreign keys | Unique constraints | Required fields | Provenance | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canonical operational facts | Existing normalized tables | receipt, consumption, solar, HOP, target, cumulative | existing `id` | existing import run/unit FKs | existing grain keys | existing required fields | partial-to-good depending table | precision/provenance gaps |
| Coal stock completion | Existing `coal_stock` | one site-level coal stock row/day | existing `id` | none | `date` | date, opening, received, consumed, closing | currently weak; existing table has no source fields | importer must map source opening/received; no schema required for columns already present |
| Biomass stock | Proposed `biomass_stock` | reported biomass stock by date/material/scope | `id` | optional `import_run_id`, optional approved unit FK | date + scope + material + record type | reading date, material code, scope type/key, reported opening/closing | worksheet, row, cell, period, hash | scope/material semantics unresolved; schema required if persisted |
| Stock calculation/validation | Derived view/service or approved derived table | calculate closing/implied receipt and variance | derived, not raw identity | references raw fact conceptually | formula/version + date/scope | formula inputs and validation status | source fact references | risk of presenting calculation as reported value |
| Provenance completion | Additive provenance design | direct row-level traceability for normalized facts | `id` | design-dependent | source + entity/business key + hash | source worksheet/row/date/hash | full minimum provenance | polymorphic relation must be designed carefully |
| Historical target versions | Proposed version/history table or approved staging policy | preserve target values by effective period/source | `id` | optional import run | year + effective period/source version | target year, value, unit, classification | source worksheet/row/hash | current unique target year prevents multiple versions |

### Biomass stock proposal details

The proposed table must distinguish at least:

- `material_code`: sawdust, woodchip, LRUK, SRF, bonggol, or an owner-approved extension;
- `scope_type`/`scope_key`: site/global, unit, NK, or block;
- `reported_opening_stock` and `reported_closing_stock` as source facts;
- optional `calculated_closing_stock`, `implied_receipt`, and `variance_status` only in a derived/validation layer;
- `reading_date` and `worksheet_period` separately;
- source worksheet, source row/cell, source hash, and import run.

No supplier FK should be added until material and supplier semantics are confirmed.

## Schema Change Assessment

| Area | Assessment | Decision |
| --- | --- | --- |
| Canonical receipts/consumption/Solar/HOP/target/cumulative | `NO_SCHEMA_CHANGE` for current canonical grain | Use existing tables after mapping/validation |
| Coal stock opening/received mapping | `NO_SCHEMA_CHANGE` at table shape; implementation mapping fix required | Populate existing columns only after approved dry-run; no correction now |
| Biomass stock persistence | `SCHEMA_CHANGE_REQUIRED` if in persistence scope | Design/additive migration requires separate approval |
| Direct full provenance on all normalized facts | `SCHEMA_CHANGE_RECOMMENDED`; required for strict direct row traceability | Approve provenance design first |
| Historical target versions | `SCHEMA_CHANGE_RECOMMENDED`; required if historical targets must be normalized | Never reuse current target row |
| Coal three-decimal parity | `SCHEMA_CHANGE_RECOMMENDED` if exact source precision is mandatory | Existing `NUMERIC(12,2)` needs manual decision |
| Legacy family A/B/C | `NO_SCHEMA_CHANGE` until mapping evidence proves otherwise | Prefer mapping profile/parser extension before schema |

Execution assessment for this phase is **SCHEMA_CHANGE_BLOCKED_FOR_EXECUTION** because Phase 12 is read-only and no manual design approval has been recorded.

## Legacy Family Strategy

| Family | Worksheets | Evidence | Strategy | Import consequence |
| --- | ---: | --- | --- | --- |
| CANONICAL_FAMILY | 1 (`Juli26-BB`) | canonical structure; parser and plan pass | `CANONICAL_MAPPING` | `IMPORT_NOW` gate; no execution in Phase 12 |
| Family A | 14 | 97% label overlap, physical order/block/value-type differences | `MAPPING_PROFILE` using existing parser output | clean members may be `IMPORT_AFTER_MAPPING`; date/identity anomalies remain manual |
| Family B | 3 (`Mei22`, `Juni22`, `Juli22`) | 25% semantic overlap; material resource/domain ambiguity | `PARSER_EXTENSION` after semantic approval; separate handler only as fallback | `MANUAL_REVIEW` |
| Family C | 3 (`Mei23`, `Juni23`, `Juli23`) | 51% semantic overlap; legacy blocks and identity collisions | `PARSER_EXTENSION` after semantic approval; separate handler only as fallback | `MANUAL_REVIEW` |

Priority remains: existing parser -> mapping profile -> parser extension -> separate legacy handler only when unavoidable. No parser was modified.

## Import Gate

Gate status is a decision result, not an instruction to run import.

| Target | Gate | Reason |
| --- | --- | --- |
| `Juli26-BB` | `IMPORT_NOW` | canonical parser/plan pass; existing controlled import facts are approved; no import executed in Phase 12 |
| Family A clean members: `Mei25-BB`, `Juli25-BB`, `Agustus25-BB`, `Oktober25-BB`, `Desember25-BB`, `Januari26-BB`, `Maret26-BB`, `Mei26-BB` | `IMPORT_AFTER_MAPPING` | only after family mapping profile, target policy, supplier policy, and dry-run approval |
| Family A date/identity anomaly members: `Juni25-BB`, `September25-BB`, `November25-BB`, `Februari26-BB`, `April26-BB`, `Juni26-BB` | `MANUAL_REVIEW` | invalid/duplicate dates and/or identity evidence |
| Family B: `Mei22-BB`, `Juni22-BB`, `Juli22-BB` | `MANUAL_REVIEW` | semantic overlap too low for safe automatic mapping |
| Family C: `Mei23-BB`, `Juni23-BB`, `Juli23-BB` | `MANUAL_REVIEW` | legacy semantics and duplicate/identity issues |

All 20 legacy worksheets remain non-imported. The conditional `IMPORT_AFTER_MAPPING` classification does not override target/date/supplier/identity manual decisions.

## Manual Decision Register

| ID | Worksheet | Issue | Decision | Options | Recommendation | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| MD-01 | All BB with biomass stock | No existing biomass stock target | Pending | Exclude from current persistence; create additive `biomass_stock`; persist only approved scopes | Exclude from current canonical import unless full stock persistence is explicitly approved; design table separately | HIGH |
| MD-02 | `Juli26-BB` and legacy | Top-level biomass stock vs KWH Green/NK/block semantics | Pending | Treat as same fact; separate scope; quarantine ambiguous block | Separate by scope/material and quarantine ambiguous KWH Green fields | HIGH |
| MD-03 | `Juli26-BB` and legacy | Daily stock equation lacks explicit daily receipt allocation | Pending | Validation-only; derive implied receipt; owner supplies daily receipt mapping | Validation-only; never overwrite reported closing | HIGH |
| MD-04 | Existing normalized facts | `source_row`/`source_hash` not direct on every fact | Pending | Accept staging/sync trace; additive provenance design | Approve provenance design before historical bulk import | HIGH |
| MD-05 | All legacy families | Block/semantic path absent from some current keys | Pending | Expand business key; retain source duplicate; separate handler | Include approved block/path in legacy identity profile | HIGH |
| MD-06 | `Juni23-BB` | 11 duplicate identity groups | Pending | Retain both; classify collision/true duplicate; choose winner | No delete/merge/winner automatically; owner resolves each group | HIGH |
| MD-07 | `September25-BB` | 11 duplicate identity groups | Pending | Retain both; classify collision/true duplicate; choose winner | No delete/merge/winner automatically; owner resolves each group | HIGH |
| MD-08 | `Juni25`, `November25`, `Februari26`, `April26`, `Juni26` | Invalid calendar days | Pending | Quarantine; owner confirms source correction; reject row | Preserve source and quarantine; no date shift | HIGH |
| MD-09 | `Juni23`, `September25` | Duplicate date at 1st day | Pending | Treat as block duplicate; source duplicate; unknown | Resolve block/identity before import | HIGH |
| MD-10 | All legacy | Target value missing/not proven current | Pending | Historical target; calculated target; unknown; version table | Keep historical/unknown separate; never overwrite with 70.020 | HIGH |
| MD-11 | Family B/C | Supplier aliases and resource semantics unresolved | Pending | Map to seven canonical suppliers; legacy supplier code; quarantine | Manual supplier mapping per family | HIGH |
| MD-12 | All BB | Unit 2 duplicate ordered block | Pending | Retain Unit 2; map ordered third block to Unit 3; quarantine | Confirm existing Unit 1-3 rule per family before import | HIGH |
| MD-13 | Coal source/database | Source has three decimals; existing coal tables store two decimals | Pending | Accept rounding; additive precision change; retain exact staging only | Decide parity tolerance before further imports | MEDIUM |
| MD-14 | Historical targets | `target_year` unique allows one normalized target only | Pending | Keep only current; staging history; target version table | Use history/version design if legacy targets are business records | MEDIUM |

No decision above is treated as approved by this report. The report only records evidence and recommendation.

## Risks

| Level | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| HIGH | Biomass stock has no existing target model/table | Full field parity cannot be achieved for stock | Decide scope; design additive model only after approval |
| HIGH | Coal stock current rows omit source opening/received | Stock equation and variance can be wrong | Map reported fields in a later dry-run; do not correct existing rows in this phase |
| HIGH | Legacy Family B/C semantic overlap is low | Automatic mapping may assign wrong domain/unit | Owner semantic mapping and parser extension review |
| HIGH | 22 duplicate groups/collisions | Upsert could overwrite or merge different source facts | Block import; resolve identity with block/source evidence |
| HIGH | Invalid dates | Silent shifting changes historical facts | Quarantine and source-owner decision |
| HIGH | Historical target ambiguity | Current 70.020 ton could overwrite historical meaning | Preserve historical/unknown; use version policy |
| HIGH | Supplier aliases are not proven | Biomass receipt total may be assigned to wrong supplier | Manual alias mapping; no automatic rename |
| MEDIUM | Coal precision is two decimals in existing tables | Exact three-decimal parity may be lost | Approve rounding tolerance or schema precision design |
| MEDIUM | Merged-cell metadata is unavailable from values-only reader | Block/layout semantics may be incomplete | Obtain approved metadata read before relying on merges |
| MEDIUM | Provenance not direct on all normalized facts | Row-level audit requires staging/sync lookup | Approve direct provenance design |

## Recommended Next Phase

1. Record owner decisions for MD-01 through MD-14, beginning with biomass stock scope and identity.
2. Approve canonical mapping profile and the exact supported import domains.
3. Decide whether current `coal_stock` rows must be reloaded/reconciled; any data write requires a separately approved controlled operation.
4. Approve provenance and precision policy before bulk historical import.
5. Produce family-specific mapping profiles for Family A, then resolve parser extension requirements for Family B/C.
6. Resolve invalid/duplicate dates and the 22 duplicate groups without changing source evidence.
7. Run family-specific static tests and complete dry-run; compare row counts, natural keys, hashes, and aggregates.
8. Obtain explicit import approval per worksheet/family before any staging or commit.

## Database Safety

Phase 12 was strictly read-only.

- Database writes: **0**.
- INSERT/UPDATE/DELETE: **not executed**.
- `prisma migrate`: **not executed**.
- `prisma db push`: **not executed**.
- Schema modification: **not executed**.
- Google Sheets write: **not executed**.
- Import/synchronization write: **not executed**.
- Parser and production application code: **not modified**.
- Laravel project: **not modified**.
- Deployment: **not executed**.

Read-only validation results:

| Check | Result |
| --- | --- |
| PostgreSQL connection/schema read | PASS |
| Existing DB count/aggregate verification | PASS |
| Import schema metadata verification | PASS |
| Orphan Unit relationship checks | PASS; 0 orphan rows in tested relations |
| Canonical `Juli26-BB` live read/parser | PASS |
| Canonical dry-run plan | PASS; 352 rows, 0 blocking issues |
| Database snapshot mutation check | PASS; no mutation observed |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |

Node emitted only the known experimental loader/module-type warnings while executing TypeScript audit scripts; they did not fail validation and are not database findings.

## Final Status

| Metric | Result |
| --- | --- |
| Canonical worksheet | `Juli26-BB` |
| Legacy worksheets | 20 |
| Schema families | canonical 1; Family A 14; Family B 3; Family C 3 |
| Duplicate groups | 22; focus `Juni23-BB`, `September25-BB` |
| Official target | 70.020 ton |
| Biomass stock table | not present; manual schema decision required for full persistence |
| Legacy import gate | manual review / after mapping, none executed |
| Database writes | 0 |
| Schema changed | NO |

Final status: **BB PERSISTENCE DECISION -- PASS WITH REVIEW**.

Phase 12 stops here. Do not import, migrate, push, modify schema, modify parser, or modify production code until the manual decision register is approved.
