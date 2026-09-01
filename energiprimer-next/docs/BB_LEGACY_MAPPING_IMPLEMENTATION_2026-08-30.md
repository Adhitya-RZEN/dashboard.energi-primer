# BB Legacy Mapping Implementation — 30 Agustus 2026

> **Addendum 31 Agustus 2026:** aturan supplier pattern, deduplikasi block,
> ordered Unit 3, pengabaian tanggal rollover/formula error, fallback target,
> dan precision calibration pada implementasi terbaru dicatat di
> [`BB_MAPPING_POLICY_UPDATE_2026-08-31.md`](./BB_MAPPING_POLICY_UPDATE_2026-08-31.md).
> Bagian historis di bawah tetap menjadi baseline audit; jika berbeda, addendum
> tersebut adalah aturan terbaru.

Status implementasi: **PASS WITH REVIEW**

Fase ini hanya membuat dan memverifikasi mapping profile serta dry-run read-only. Tidak ada full import, tidak ada perubahan database, dan tidak ada perubahan pada project Laravel.

## Scope

Scope mencakup seluruh worksheet dengan nama yang memenuhi pola persis:

```text
[Bulan Indonesia][2 digit tahun]-BB
```

Hasil discovery live:

| Item | Hasil |
| --- | ---: |
| Total worksheet spreadsheet | 199 |
| Worksheet BB valid | 21 |
| Worksheet non-BB | 178 |
| Worksheet canonical | `Juli26-BB` |
| Worksheet legacy | 20 |
| Range read | `A1:ZZ500` |
| Database writes | 0 |

Worksheet BB yang diperiksa adalah `Juli26-BB`, tiga worksheet tahun 2022, tiga worksheet tahun 2023, serta empat belas worksheet dari Mei 2025 sampai Juni 2026 yang terdaftar pada hasil discovery Phase 11E/12.

Tidak termasuk dalam fase ini:

- import atau persistensi data legacy;
- perubahan schema PostgreSQL/Prisma;
- `prisma migrate`, `prisma db push`, atau operasi destructive;
- perubahan Google Sheets atau project Laravel;
- pembuatan table/model baru untuk `BIOMASS_STOCK`;
- perubahan KPI, chart, route, authentication, authorization, atau business logic dashboard.

## Business Rule

1. Hanya worksheet dengan title yang valid yang dapat masuk proses mapping.
2. `Juli26-BB` adalah canonical reference, bukan sumber asumsi untuk mengubah nilai historis.
3. Mapping harus berbasis semantic header dan konteks domain, bukan nomor baris/kolom fisik.
4. Hanya field dengan confidence tinggi yang dapat menjadi kandidat auto-map.
5. Family B dan Family C tidak menghasilkan canonical record otomatis.
6. Nilai kosong tetap `null`; tidak diubah menjadi nol atau angka buatan.
7. Tanggal, nilai, unit, supplier, dan provenance sumber dipertahankan; tidak ada auto-correction diam-diam.
8. Duplicate tidak digabung, dihapus, atau dipilih pemenangnya pada fase ini.
9. Target resmi aplikasi tetap **70.020 ton**.
10. `BIOMASS_STOCK` dicatat sebagai `FUTURE_SCOPE_DATA` dan dikeluarkan dari persistence/dashboard saat ini.

## Canonical Reference

`Juli26-BB` berhasil dibaca ulang secara read-only dan menghasilkan baseline:

| Metric | Hasil canonical |
| --- | ---: |
| Daily rows | 31 |
| Biomass receipt rows | 7 |
| Biomass consumption rows | 93 |
| Coal receipt rows | 1 |
| Coal consumption rows | 93 |
| Coal stock rows | 31 |
| Solar consumption rows | 31 |
| Solar receipt rows | 1 |
| HOP rows | 93 |
| Target rows | 1 |
| Cumulative rows | 1 |
| Total staging rows | 352 |
| Plan status | `READY_FOR_IMPORT` |
| Parser errors | 0 |
| Parser ambiguous fields | 0 |

Nilai reference yang tetap dipertahankan:

- penerimaan Biomassa: sekitar 3.223,46 ton;
- pemakaian Biomassa: sekitar 3.740,65 ton;
- target Biomassa: 70.020 ton;
- realisasi kumulatif: sekitar 29.103,77 ton;
- progress: sekitar 41,5649%.

## Schema Families

Klasifikasi live dibandingkan dengan semantic snapshot canonical:

| Family | Worksheet | Semantic coverage | Keputusan |
| --- | ---: | --- | --- |
| `CANONICAL_FAMILY` | 1 | 100% exact fingerprint | Mapping canonical; regression wajib lulus |
| `LEGACY_FAMILY_A` | 14 | sekitar 98,2%–100% | Kandidat mapping semantic; tetap menunggu issue plan/date selesai |
| `LEGACY_FAMILY_B` | 3 | sekitar 24%–25% | Tidak auto-map; `BLOCKED` |
| `LEGACY_FAMILY_C` | 3 | sekitar 50%–51% | Tidak auto-map; `BLOCKED` |

### Family A

Family A mencakup:

`Mei25-BB`, `Juni25-BB`, `Juli25-BB`, `Agustus25-BB`, `September25-BB`, `Oktober25-BB`, `November25-BB`, `Desember25-BB`, `Januari26-BB`, `Februari26-BB`, `Maret26-BB`, `April26-BB`, `Mei26-BB`, dan `Juni26-BB`.

Physical column order dan sebagian label berubah, tetapi semantic coverage cukup tinggi untuk membuat kandidat mapping. Kandidat ini belum menjadi izin import karena masih terdapat unresolved fields, historical target review, cumulative/solar/coal receipt review, parser ambiguity, duplicate, atau date issue sesuai worksheet.

### Family B

Family B mencakup `Mei22-BB`, `Juni22-BB`, dan `Juli22-BB`. Semantic overlap rendah dan domain meaning tidak aman untuk diinferensikan dari canonical. Seluruh nilai tetap manual review.

### Family C

Family C mencakup `Mei23-BB`, `Juni23-BB`, dan `Juli23-BB`. Ada partial overlap, perubahan block/identity, dan pada `Juni23-BB` terdapat duplicate date. Tidak ada nilai yang auto-map.

## Mapping Profiles

Profile diimplementasikan pada:

`src/services/google-sheets/legacy-mapping/profiles.ts`

| Profile | Auto-map entity types | Gate default | Implementasi |
| --- | --- | --- | --- |
| Canonical | Existing supported import entities | `IMPORT_READY` | Dipakai untuk regression canonical |
| Family A | Existing supported import entities | `IMPORT_AFTER_REVIEW` | Kandidat semantic mapping; issue sumber tetap memblokir bila perlu |
| Family B | Tidak ada | `BLOCKED` | Manual mapping wajib |
| Family C | Tidak ada | `BLOCKED` | Manual mapping wajib |
| Unknown | Tidak ada | `BLOCKED` | Di luar profile yang disetujui |

Profile tidak menambahkan entity type baru dan tidak mengubah public API/import contract.

## Field Mapping

Mapping domain berikut diarahkan ke target yang sudah ada pada import plan dan Prisma. Mapping ini adalah presentation/import mapping; fase ini tidak menjalankan persistence.

| Domain sumber | Canonical field | Target existing | Unit/identity | Keputusan |
| --- | --- | --- | --- | --- |
| `BIOMASS_RECEIPT` | `biomassReceipt.quantityTon` | `biomass_receipts.quantity_ton` | periode + supplier | High confidence pada canonical/Family A |
| `BIOMASS_CONSUMPTION` | `biomassConsumption.quantityTon` | `biomass_consumptions.quantity_ton` | tanggal + Unit 1–3 | High confidence pada canonical/Family A |
| `COAL_RECEIPT` | `coalReceipt.quantityTon` | `coal_receipts.quantity_ton` | periode | High confidence pada canonical/Family A |
| `COAL_CONSUMPTION` | `coalConsumption.coalUsed` | `coal_consumption.coal_used` | tanggal + Unit 1–3 | High confidence pada canonical/Family A |
| `COAL_STOCK` | `coalStock.closingStock` | `coal_stock.closing_stock` | tanggal | Existing coal stock target |
| `SOLAR_RECEIPT` | `solarReceipt.quantityLiter` | `solar_receipts.quantity_liter` | periode | High confidence pada canonical/Family A |
| `SOLAR_CONSUMPTION` | `solarConsumption.quantityLiter` | `solar_consumptions.quantity_liter` | tanggal | High confidence pada canonical/Family A |
| `HOP` | `hopDays` | `hop_readings.hop_days` | tanggal + Unit 1–3 | High confidence pada canonical/Family A |
| `BIOMASS_TARGET` | `biomassTarget.targetTon` | `biomass_targets.target_ton` | target year | Historical value preserved |
| `BIOMASS_CUMULATIVE` | `biomassCumulative.cumulativeTon` | `biomass_cumulative_snapshots.cumulative_ton` | periode snapshot | Existing snapshot target |
| `BIOMASS_STOCK` | `biomassStock.closingStock` | Tidak ada target existing | supplier/stock dimension belum disetujui | `FUTURE_SCOPE_DATA` |

Header yang tidak dapat dipetakan dengan confidence cukup tinggi tetap `UNMAPPED`/manual review. `power_generation` tetap merupakan existing database domain, tetapi bukan entity yang dihasilkan oleh current BB staging plan sehingga tidak diperlakukan sebagai import target baru pada fase ini.

## Unit Normalization

Normalisasi hanya menerima identity yang eksplisit dan terbukti:

| Input | Canonical identity |
| --- | --- |
| `Unit 1`, `UNIT-1`, `PLTU-1` | `UNIT-1` |
| `Unit 2`, `UNIT-2`, `PLTU-2` | `UNIT-2` |
| `Unit 3`, `UNIT-3`, `PLTU-3` | `UNIT-3` |

Unit selain 1–3 tidak ditebak dan masuk manual review. Rule existing untuk label duplicate `Unit 2` pada block ketiga dipertahankan hanya pada konteks ordered Unit 1–3 yang sudah dibuktikan oleh parser existing; tidak dibuat sebagai rule global untuk semua worksheet.

## Supplier Normalization

Supplier canonical yang disetujui adalah tujuh identity berikut:

1. `Sawdust PT Syahroni` — `sawdust-pt-syahroni`
2. `Sawdust PT Bintang` — `sawdust-pt-bintang`
3. `Woodchip PT Syahroni` — `woodchip-pt-syahroni`
4. `Woodchip PT RAP` — `woodchip-pt-rap`
5. `Woodchip CV Multi Paketindo` — `woodchip-cv-multi-paketindo`
6. `LRUK` — `lruk`
7. `SRF` — `srf`

Normalizer menerima nama/alias yang sama setelah normalisasi case dan whitespace serta kode canonical internal. Supplier baru, typo yang belum terbukti, atau supplier yang hanya mirip tidak digabung otomatis.

## Date Validation

Validator mempertahankan raw source date dan membedakan:

- `INVALID_DATE`: tanggal tidak mungkin secara kalender atau tidak dapat diparse;
- `PERIOD_MISMATCH`: tanggal valid tetapi periodenya berbeda dari title worksheet;
- `DATE_FORMAT_VARIATION`: format tanggal dalam satu worksheet berbeda;
- `DUPLICATE_DATE`: tanggal bisnis muncul lebih dari sekali tanpa memilih winner.

Hasil live menemukan issue pada tujuh worksheet:

| Worksheet | Issue |
| --- | --- |
| `Juni23-BB` | `DUPLICATE_DATE` |
| `Juni25-BB` | `INVALID_DATE` |
| `September25-BB` | `DUPLICATE_DATE` |
| `November25-BB` | `INVALID_DATE` |
| `Februari26-BB` | `INVALID_DATE` |
| `April26-BB` | `INVALID_DATE` |
| `Juni26-BB` | `INVALID_DATE` |

Tanggal tidak digeser ke tanggal terdekat dan tidak dihapus dari source evidence.

## Identity Strategy

Identity menggunakan stable SHA-256 business/source key dari existing sync identity layer. Row number dan cell address tidak menjadi permanent identity sehingga sorting atau penyisipan baris tidak membuat record baru.

Dimensi identity meliputi:

- entity type;
- periode atau reading date;
- target year bila relevan;
- unit bila relevan;
- supplier bila relevan;
- unit value (`ton`, `liter`, atau `hari`).

Content hash menyertakan nilai normalized atau content seed. Perubahan isi pada business key yang sama diklasifikasikan sebagai update/collision sesuai konteks, bukan insert baru tanpa pemeriksaan.

## Duplicate Strategy

Duplicate evidence dihitung dari seluruh parser-produced staging rows, termasuk row yang masih blocked untuk manual mapping. Tidak ada merge, delete, winner selection, atau database write.

Hasil live:

| Classification | Jumlah group |
| --- | ---: |
| `TRUE_DUPLICATE` | 4 |
| `BUSINESS_KEY_COLLISION` | 18 |
| Total | 22 |

Duplicate focus berada pada `Juni23-BB` dan `September25-BB`, masing-masing 11 group. `TRUE_DUPLICATE` berarti business key dan content hash sama. `BUSINESS_KEY_COLLISION` berarti business key sama tetapi content berbeda; group tersebut wajib diputuskan owner data sebelum import.

## Historical Target

Target resmi aplikasi adalah **70.020 ton** (`OFFICIAL_BIOMASS_TARGET = 70_020`).

Jika worksheet historis memiliki target berbeda, nilai historis/source tidak ditimpa, tidak dinormalisasi menjadi 70.020 secara diam-diam, dan tidak digunakan untuk mengganti target resmi saat ini. Worksheet tersebut mendapat `HISTORICAL_TARGET_REVIEW` dan tetap menunggu keputusan bisnis.

## Provenance

Minimal provenance yang dipertahankan adalah worksheet, source cell, dan source row bila parser dapat menyediakannya.

Pada canonical terdapat empat summary records dengan source cell tetapi `sourceRow = null` pada existing staging contract:

| Entity | Source cell |
| --- | --- |
| `coal_receipt` | `Y60` |
| `solar_receipt` | `Y69` |
| `biomass_target` | `Y70` |
| `biomass_cumulative` | `Y71` |

Kondisi ini dicatat sebagai `PROVENANCE_GAP` dan menyebabkan canonical gate menjadi `IMPORT_AFTER_REVIEW`, walaupun regression change count tetap tepat. Tidak ada source row yang dibuat-buat pada fase ini.

## Database Mapping

Target mapping hanya menggunakan table/model existing, antara lain:

- `biomass_receipts` / `BiomassReceipt`;
- `biomass_consumptions` / `BiomassConsumption`;
- `coal_receipts` / `CoalReceipt`;
- `coal_consumption` / `CoalConsumption`;
- `coal_stock` / `CoalStock`;
- `solar_receipts` / `SolarReceipt`;
- `solar_consumptions` / `SolarConsumption`;
- `hop_readings` / `HopReading`;
- `biomass_targets` / `BiomassTarget`;
- `biomass_cumulative_snapshots` / `BiomassCumulativeSnapshot`.

Jika mapping membutuhkan table yang belum ada, keputusan harus menjadi `SCHEMA_REQUIRED` dan menunggu approval. Phase 13 tidak membuat table, model, migration, atau schema change.

## Biomass Stock Scope

`BIOMASS_STOCK` **tidak digunakan** oleh KPI/chart/dashboard saat ini dan tidak dipetakan ke `coal_stock`. Source fields yang terdeteksi dicatat sebagai:

```text
decision = FUTURE_SCOPE_DATA
database target = NO_DATABASE_TARGET
```

Tidak ada model/table `biomass_stock`, tidak ada staging entity baru, tidak ada persistence, dan tidak ada perubahan pada KPI Stock Batubara. Pengembangan Biomass Stock memerlukan business key, supplier/stock dimension, schema design, dan approval terpisah.

## Dry Run

Command:

```bash
npm run bb:mapping
```

Command tersebut membaca metadata/range Google Sheets dan state sync PostgreSQL secara read-only. Output live terakhir:

| Metric | Hasil |
| --- | ---: |
| Worksheet discovered | 199 |
| BB worksheet read | 21 |
| Read failure | 0 |
| Source rows | 2.962 |
| Scanned cells | 211.373 |
| Staging rows (what-if) | 7.265 |
| Candidate records (what-if) | 5.224 |
| Insert candidates | 4.861 |
| Update candidates | 0 |
| Skip candidates | 352 |
| Rejected | 0 |
| Manual review rows | 2.052 |
| Duplicate groups | 22 |
| Database writes | 0 |
| Database snapshot | Stable |

Ringkasan family:

| Family | Worksheet | Staging rows | Candidate | Insert | Update | Skip | Manual review | Duplicate groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canonical | 1 | 352 | 352 | 0 | 0 | 352 | 0 | 0 |
| Family A | 14 | 4.872 | 4.872 | 4.861 | 0 | 0 | 11 | 11 |
| Family B | 3 | 1.015 | 0 | 0 | 0 | 0 | 1.015 | 0 |
| Family C | 3 | 1.026 | 0 | 0 | 0 | 0 | 1.026 | 11 |

Import gate:

- canonical: `IMPORT_AFTER_REVIEW` karena `PROVENANCE_GAP`; bukan karena perubahan data;
- Family A: `BLOCKED` karena unresolved/ambiguous/date/target issues pada source legacy;
- Family B: `BLOCKED` karena low-confidence semantic schema;
- Family C: `BLOCKED` karena partial schema/identity/date/duplicate review.

## Test Cases

Test case yang dilaksanakan pada regression script:

| Test | Hasil |
| --- | --- |
| Valid title `Juli26-BB` | PASS |
| Invalid title `Flyash-Okt` | PASS — ditolak |
| Exact canonical fingerprint | PASS |
| Family A semantic overlap | PASS |
| Family B semantic overlap | PASS |
| Family C semantic overlap | PASS |
| Unit 1/2/3 normalization | PASS |
| Unknown unit rejection | PASS |
| Seven supplier identity/alias | PASS |
| Unknown supplier rejection | PASS |
| Official target 70.020 | PASS |
| Duplicate date detection | PASS |
| Invalid calendar date detection | PASS |
| Period mismatch detection | PASS |
| Date format variation detection | PASS |
| `BIOMASS_STOCK` future-scope mapping | PASS |
| Coal stock existing target mapping | PASS |
| True duplicate classification | PASS |
| Business key collision classification | PASS |
| Idempotency 352 rows | PASS |

## Regression Test

Command:

```bash
npm run bb:mapping:test
```

Hasil: **25 assertions passed**.

Canonical live regression:

```text
rows             = 352
INSERT           = 0
UPDATE           = 0
SKIP             = 352
REJECTED         = 0
FAILED           = 0
matchesExpected  = true
```

Database snapshot sebelum dan sesudah dry-run: **stable**. Snapshot digunakan untuk count verification dan tidak melakukan mutation.

## Performance

- Worksheet dibaca secara sequential dengan concurrency 1.
- Jeda antar range request adalah 1,5 detik untuk mengurangi risiko rate limit.
- Google Sheets transient error memakai maksimal tiga percobaan melalui existing retry policy.
- Tidak ada request write ke Google Sheets.
- Tidak ada request data tambahan dari komponen UI/chart.
- Existing source-key/content-hash classification digunakan kembali.
- Tidak ada transformasi database atau full import selama dry-run.

## Database Safety

Phase 13 tidak menjalankan:

- `prisma migrate`;
- `prisma db push`;
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, atau `TRUNCATE`;
- importer/commit function;
- perubahan schema atau data production.

Database snapshot live menunjukkan `databaseWrites = 0` dan `databaseSnapshotStable = true`. Laravel tetap tidak disentuh.

## Known Limitations

1. Family B dan Family C belum aman untuk import otomatis dan memerlukan semantic approval dari owner data.
2. Family A sudah dapat menghasilkan kandidat mapping, tetapi seluruh worksheet legacy masih memiliki issue dari import plan atau validasi yang harus diselesaikan satu per satu.
3. Terdapat 22 duplicate evidence; tidak ada winner yang dipilih.
4. Terdapat date anomalies pada tujuh worksheet legacy.
5. Empat summary record canonical masih memiliki `sourceRow` null pada existing staging contract.
6. `BIOMASS_STOCK` belum memiliki target schema dan sengaja tetap future scope.
7. Full historical import belum dilakukan. Kandidat insert pada dry-run bukan izin untuk menulis ke database.
8. `power_generation` tidak menjadi entity staging baru dalam fase ini.

## Next Phase

Sebelum controlled import historical BB:

1. Owner data menyetujui mapping Family A per worksheet.
2. Owner data memutuskan semua Family B/C domain dan block identity.
3. Duplicate group diselesaikan sebagai `TRUE_DUPLICATE` atau `BUSINESS_KEY_COLLISION` dengan evidence sumber.
4. Date anomalies diperbaiki di source atau diberi keputusan eksplisit tanpa mengubah source diam-diam.
5. Provenance summary rows dilengkapi atau diterima sebagai review exception.
6. Historical target policy dikonfirmasi; target resmi 70.020 tetap tidak ditimpa.
7. Jalankan preflight dan dry-run per worksheet yang sudah disetujui.
8. Controlled import hanya boleh dijalankan dengan scope eksplisit, snapshot before/after, dan approval terpisah.

Status fase ini bukan `PASS` penuh karena legacy mapping belum mendapat keputusan manual. Status yang tepat adalah **PASS WITH REVIEW**: implementasi profile, safety gate, live discovery, canonical regression, dan read-only dry-run berhasil; import legacy masih diblokir sampai review selesai.
