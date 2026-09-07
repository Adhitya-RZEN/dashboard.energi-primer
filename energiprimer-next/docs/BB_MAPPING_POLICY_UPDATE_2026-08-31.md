# Pembaruan Kebijakan Mapping BB — 31 Agustus 2026

Dokumen ini mencatat keputusan mapping yang diberikan setelah audit workbook
BB. Dokumen ini menjadi addendum terhadap audit dan laporan mapping sebelumnya;
temuan historis tidak dihapus atau ditulis ulang.

## Keputusan yang diterapkan

| No. | Keputusan | Implementasi |
| --- | --- | --- |
| 1 | Nama pemasok dapat berbentuk `[Nama Bahan Biomassa] PT [Perusahaan]`. | Parser menerima nama material `Sawdust`, `Woodchip`, atau `Sekam Padi` dengan badan usaha `PT`/`CV` dan nama perusahaan. Pencarian case-insensitive dan whitespace-insensitive. |
| 2 | Solusi supplier yang sama digunakan untuk variasi pemasok/duplikasi label. | Nama perusahaan berbeda menjadi identity berbeda, bukan ditebak sebagai alias supplier canonical. Kolom dengan identity yang sama dideduplikasi secara deterministik; block pemasok yang paling lengkap dipilih agar summary block tidak dihitung dua kali. |
| 3 | Unit yang benar adalah Unit 1, Unit 2, Unit 3. | Kandidat unit disusun berdasarkan urutan fisik kolom. Jika label Unit 2 berulang pada blok ketiga, blok ketiga diperlakukan sebagai Unit 3 dalam konteks urutan 1–3. |
| 4 | Tanggal yang bergeser diabaikan. | Tanggal kalender invalid atau tanggal di luar bulan/tahun worksheet dikeluarkan dari canonical daily series/import candidates. Nilai source tetap tersedia untuk evidence/audit dan tidak dikoreksi diam-diam. |
| 5 | Formula error akibat kesalahan manusia diabaikan. | Cell `#DIV/0!`, `#REF!`, dan formula error lain tidak diubah menjadi nol. Jika masih ada angka valid, angka tersebut tetap dijumlahkan; bila seluruh kandidat malformed, field tetap unresolved/malformed. |
| 6 | Fallback target boleh digunakan bila tabel `Target [Tahun]` tidak ditemukan. | Parser menggunakan target resmi `70.020` ton untuk tahun worksheet dengan confidence `WARNING` dan source `null`. Target eksplisit yang malformed atau berbeda tidak ditimpa oleh fallback. |
| 7 | `BIOMASS_STOCK` tidak diperlukan user. | Tetap `FUTURE_SCOPE_DATA`, tidak dipetakan ke tabel database, tidak masuk KPI/chart, dan tidak ada perubahan schema. |
| 8 | Precision dikalibrasi sesuai target database. | Nilai source/staging tetap mempertahankan presisi input. Saat menulis ke tabel legacy `coal_consumption`, `coal_stock`, dan `hop_readings`, nilai dibulatkan half-up ke dua desimal sesuai tipe existing. |

## Batas identitas pemasok

Contoh berikut diterima sebagai identity terpisah:

```text
Woodchip PT Bhirawa       -> woodchip-pt-bhirawa
Woodchip PT RAP           -> woodchip-pt-rap
Sawdust PT Syahroni       -> sawdust-pt-syahroni
```

`Woodchip PT Bhirawa` tidak otomatis digabung dengan RAP atau Syahroni.
Label generic seperti `Woodchip` tanpa badan usaha/perusahaan dan material
yang tidak memiliki pola approved tetap tidak dipakai sebagai supplier.

## Penanganan duplicate block

Parser mengelompokkan kolom berdasarkan supplier code hasil normalisasi.
Untuk identity yang sama, prioritas pemilihan adalah:

1. label canonical;
2. coverage angka pada data rows;
3. kolom paling kiri.

Setelah itu kandidat dikelompokkan berdasarkan kedekatan kolom. Block dengan
jumlah canonical supplier terbanyak, jumlah supplier terbanyak, lalu coverage
angka terbaik dipakai sebagai block penerimaan. Tujuannya mencegah block
summary historis yang mengulang nilai detail ikut dijumlahkan.

Nama perusahaan yang berbeda tidak dianggap duplicate hanya karena materialnya
sama. Penyamaan dua perusahaan memerlukan keputusan bisnis terpisah.

## Dampak terhadap import

- Worksheet dengan supplier pattern legacy dapat menghasilkan aggregate dan
  row-level candidate.
- Jika tujuh supplier canonical tidak lengkap, plan menambahkan
  `biomass_supplier_schema_legacy` sebagai review gate; hasil parsial tidak
  dihapus dari parser.
- Formula error parsial tidak diubah menjadi nol. Untuk daily unit/series,
  baris sumber tetap dipertahankan sebagai `VALID_EMPTY` dengan nilai `null`;
  aggregate receipt hanya dipersist jika ada nilai numeric.
- Coal stock hanya dipersist jika `closingStock` dan `consumed` sama-sama
  tersedia. Nilai consumed malformed tidak lagi dipaksa menjadi nol.
- Invalid/shifted date tidak menjadi daily import row. Duplicate tanggal yang
  valid tetap memerlukan review karena winner tidak dipilih otomatis.

## Keamanan dan database

Perubahan ini hanya menyentuh parser, mapping, validasi, dan pembulatan payload
import. Tidak ada:

- perubahan Laravel;
- perubahan Prisma schema;
- migration atau `prisma db push`;
- INSERT/UPDATE/DELETE ke database;
- perubahan credential, API contract, authentication, atau authorization.

## Validasi

| Check | Hasil |
| --- | --- |
| `npm run dynamic:verify` | PASS — regression parser dan kasus policy baru lulus |
| `npm run bb:mapping:test` | PASS — 27 assertions |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production build dan seluruh route dashboard terdaftar |
| `scripts/verify-db.mjs` | PASS — read-only; database/schema dan relationship dapat dibaca |
| `scripts/verify-import-data.mjs` | PASS — read-only; Unit 1, Unit 2, Unit 3 dan aggregate baseline tersedia |
| Live Google Sheets read | PASS - metadata dan 43 worksheet BB scope 2023-terbaru berhasil dibaca; tidak ada nilai credential yang ditulis ke output |
| Database/import write | Tidak dijalankan |

## Dry-run Historis Terbaru

Perintah read-only berikut dijalankan setelah kebijakan mapping diterapkan dan parser diperbaiki:

```text
npm run bb:mapping
```

Percobaan sebelumnya **BLOCKED sebelum discovery worksheet selesai** karena API Google Sheets
mengembalikan kegagalan request (`fatalErrorCode: api`). Itu merupakan batasan
network pada environment eksekusi, bukan kegagalan credential atau parser.
Setelah akses jaringan diizinkan, discovery dan pembacaan live berhasil.<!--
bukti bahwa data 2023–2026 sudah tervalidasi. Pembacaan state database tetap
berhasil, snapshot stabil, dan `databaseWrites: 0`.-->

<!-- Konsekuensi pada percobaan lama:

- `Juli26-BB` tetap memiliki regression evidence lokal sebelumnya: 352 row,
  rejected 0, duplicate 0, dan re-import `SKIP 352`.
- Validasi live per worksheet 2023–2026 masih harus diulang setelah akses API
  pulih.
- Tidak ada import yang dijalankan sebagai akibat dari dry-run ini. -->

Hasil live terbaru:

```text
status: PASS_WITH_REVIEW
totalWorksheetsDiscovered: 199
bbWorksheets (2023-terbaru): 43
outOfScopeBbWorksheets (sebelum 2023): 12
fatalErrorCode: null
readFailureCount: 0
databaseWrites: 0
databaseSnapshotStable: true
```

Regression `Juli26-BB`:

```text
planStatus: READY_FOR_IMPORT
rows: 352
insertCandidate: 0
updateCandidate: 0
skipCandidate: 352
rejected: 0
matchesExpected: true
```

Status keseluruhan tetap `PASS_WITH_REVIEW`, bukan `PASS`, karena 42 worksheet
historis dalam scope masih memiliki schema legacy, field unresolved, atau
collision tanggal/business key sehingga belum aman di-import otomatis. Tidak
ada import yang dijalankan sebagai akibat dari dry-run ini.

Perbaikan parser yang divalidasi pada pengulangan ini:

- kolom `TON` parsial tidak lagi dianggap sebagai set tiga unit; pemetaan
  menggunakan urutan kolom ketika hanya satu kolom yang memiliki label `TON`;
- baris daily dengan nilai kosong tetap tersedia sebagai `VALID_EMPTY` agar
  parity row dan provenance tidak hilang;
- scope dry-run dibatasi mulai tahun 2023 hingga worksheet terbaru.

## Catatan deployment

Target fallback `70.020` adalah policy value resmi yang sudah ada pada
kontrak import. Karena fallback tidak memiliki source cell, setiap hasil
fallback harus tetap terlihat sebagai `WARNING` pada audit/import report dan
perlu dikonfirmasi sebelum historical bulk import.

## Phase 2 — Solar Provenance Mapping Remediation

### Objective

Menyamakan source provenance `Pemakaian Solar Harian` dengan kolom yang benar-benar dipakai untuk membaca `quantity_liter`, tanpa mengubah schema, formula KPI, atau data historis.

### Root Cause

`daily-parser.ts` memilih kolom Solar melalui `choosePath(...)` berdasarkan coverage nilai numerik. Pada worksheet `Juni26-BB`, kandidat `CF` berlabel `TOTAL COUNTER` kosong pada baris harian, sedangkan `CJ` berlabel `TOTAL` berisi nilai Solar. Karena itu quantity harian berasal dari `CJ`.

`plan.ts` sebelumnya melakukan discovery ulang dengan memilih kandidat Solar pertama yang `resource === "solar" && isTotal`, sehingga memilih `CF` untuk membentuk `source_cell`. `commit.ts` kemudian menyimpan quantity yang benar bersama provenance yang salah.

### Changes

- Metadata `dailyColumns` hasil keputusan parser sekarang diteruskan melalui `DynamicParserResult`.
- Import plan menggunakan kolom Solar yang sama dari metadata parser saat membentuk `source` setiap baris.
- Tidak ada hardcode baru terhadap `CJ`; fixture test menggunakan kolom dinamis yang berbeda dan tetap menghasilkan provenance yang konsisten.
- `quantity_liter`, `reading_date`, formula KPI, receipt mapping, dan schema existing dipertahankan.

### Files Affected

- `src/services/google-sheets/dynamic/types.ts`
- `src/services/google-sheets/dynamic/parser.ts`
- `src/services/google-sheets/dynamic/parsers/daily-parser.ts`
- `src/services/google-sheets/import/plan.ts`
- `scripts/verify-dynamic-parser.ts`
- `scripts/verify-bb-legacy-mapping.ts`

### Validation

| Check | Result |
| --- | --- |
| `npm.cmd run dynamic:verify` | PASS |
| `npm.cmd run bb:mapping:test` | PASS — 27 assertions |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run db:verify-kpi:juni` | PASS — 30 Solar rows, 26.848 liter; read-only |
| `npm.cmd run db:verify-overview` | PASS — July 24.274 liter; read-only |
| Live Solar plan Januari–Juli 2026 | PASS — source cell mengikuti `CJ` pada setiap worksheet |

### Status

`PASS_WITH_REVIEW`: remediation code dan regression test lulus. Tidak ada migration, schema change, tabel baru, atau database write.

### Known Issues

Record historis pada `solar_consumptions` masih dapat memiliki `source_cell` lama `CF11:CF40` meskipun `quantity_liter` benar. Historical mutation tidak dilakukan pada Phase 2 karena strategi update dan audit trail belum disetujui.

Status: `NEEDS VERIFICATION` untuk koreksi provenance historis.

### Next Steps

Sebelum import historis ulang atau backfill provenance, verifikasi strategi update yang hanya mengubah `source_cell`, mempertahankan `quantity_liter`, dan menyediakan hasil audit. Phase berikutnya dapat memverifikasi binding KPI/UI tanpa mengubah formula atau source.

## Phase 3 - Solar KPI UI / Data Binding Verification

### Scope and decision

Audit ini memverifikasi jalur data `Pemakaian Solar Harian` dari source asli
sampai KPI dan chart. Tidak ada migration, perubahan schema, tabel baru,
endpoint baru, perubahan UI, atau write ke database.

Keputusan final: `REUSE_EXISTING_SOURCE`.

### Source discovery

Source asli yang tervalidasi adalah worksheet Google Sheets `Juni26-BB`.
Header Solar harian berada pada kolom `CJ` (index relatif `86` terhadap range
`B11:CO59`), dengan data harian pada row spreadsheet `11..40`. Total bulanan
berada pada `CJ42`. Pada runtime dashboard yang aktif saat validasi, Google
Sheets hanya menjadi source importer; page dan chart membaca PostgreSQL
normalized.

| Layer | Evidence | Mapping |
| --- | --- | --- |
| Worksheet/parser | `src/services/google-sheets/dynamic/parsers/daily-parser.ts`, `parseDailyTable` | memilih path `resource === "solar" && isTotal`; hasilnya `dailyColumns.solar`; tanggal berasal dari `structure.dateColumn` |
| Import plan | `src/services/google-sheets/import/plan.ts`, `solarPath` dan `buildRows` | memakai kolom Solar yang sama dari parser; menyimpan `readingDate`, `quantityLiter`, dan source cell per row |
| Normalized database | `prisma/schema.prisma`, model `SolarConsumption` | table `solar_consumptions`; `reading_date DATE`, `quantity_liter DECIMAL(18,3)`, `source_worksheet`, `source_cell`; unique `reading_date` |
| PostgreSQL service | `src/services/overview-postgres.ts`, `loadOverviewRows` | membaca `readingDate` pada periode visible dan `quantityLiter`, terurut tanggal |
| Shared contract | `src/types/overview.ts`, `OverviewMetric` dan `OverviewDailyPoint` | `solarConsumptionDaily` memakai unit `liter`; `series[].solar` memakai date key ISO |
| Page | `src/app/(protected)/dashboard/page.tsx` dan `src/app/(protected)/dashboard/solar/page.tsx` | keduanya memanggil `getOverviewData` dan meneruskan `OverviewData` tanpa API/proxy tambahan |
| KPI UI | `src/components/dashboard/OverviewDashboard.tsx` dan `DetailDashboard.tsx` | kartu `Pemakaian Solar Harian` membaca `data.metrics.solarConsumptionDaily` |
| Chart UI | `src/components/dashboard/DetailDashboard.tsx` dan `DetailCharts.tsx` | `DetailLineChart` menerima `data.series` dengan `dataKey="solar"`; tidak melakukan fetch atau agregasi baru |

### KPI formula and grain

Formula PostgreSQL dashboard adalah:

```text
solarConsumptionMonthly = SUM(solar_consumptions.quantity_liter)
  WHERE reading_date >= period_start
    AND reading_date < visible_period_end

solarConsumptionDaily = SUM(solar_consumptions.quantity_liter)
  WHERE reading_date = focus_date
```

Implementasi `buildSeries` membentuk bucket berdasarkan `dateKey(readingDate)`
dan mengisi `point.solar` dari `quantity_liter`; `focusPoint.solar` kemudian
dijadikan `metrics.solarConsumptionDaily`. Karena tabel memiliki unique
`reading_date`, grain hari bersifat deterministik. Tidak ada pembagian angka
bulanan, estimasi, proxy KPI, atau interpolasi. Nilai kosong tetap `null` dan
`available` menjadi `false`; nilai `0` tetap dianggap tersedia.

Date mapping menggunakan `DATE` PostgreSQL yang dibaca sebagai UTC date-only
dan dinormalisasi ke key `YYYY-MM-DD`. `defaultFocusDateForMonth` menerapkan
query hari dan dashboard cutoff `Asia/Makassar`; pada query Juli 2026 dengan
hari 28, focus date adalah `2026-07-28`.

`solar_receipts.quantity_liter` tidak dipakai sebagai proxy. Receipt memiliki
grain bulanan sendiri dan hanya mengisi `solarReceiptMonthly`.

### Existing versus new table

Pola terdekat adalah `biomass_consumptions` dan `coal_consumption`: keduanya
menyimpan nilai konsumsi dengan tanggal operasional lalu service membentuk
agregat harian berdasarkan tanggal. `solar_consumptions` memiliki pola yang
sama, dengan perbedaan bahwa Solar tidak dipecah per unit dan memiliki satu
baris unik per `reading_date`. Perbedaan ini tidak fundamental dan justru
sesuai dengan grain source Solar.

`solar_receipts` tidak cocok untuk KPI ini karena grain-nya satu row per
periode/bulan. Menggunakannya sebagai pengganti atau membagi receipt bulanan
menjadi hari akan melanggar definisi KPI. Oleh sebab itu tabel existing
`solar_consumptions` dapat digunakan; proposal tabel baru tidak diperlukan.

### Root cause classification

Primary classification: `NO_CODE_BUG_FOUND`.

Tidak ditemukan `UI_BINDING_BUG`, `SERVICE_MAPPING_BUG`,
`DB_SOURCE_BUG`, `DATE_ALIGNMENT_BUG`, atau `FORMATTER_OR_NULL_BUG` pada
jalur aktif. Temuan `PROVENANCE_MAPPING_BUG` dari Phase 2 sudah diperbaiki
untuk import berikutnya: plan kini menggunakan kolom yang sama dengan parser
untuk `source_cell`. Record historis yang masih menyimpan provenance `CF`
belum diubah dan tetap berstatus `NEEDS VERIFICATION`; hal tersebut tidak
mengubah `quantity_liter` yang dibaca service.

### KPI and chart verification

Read-only service verification pada PostgreSQL menghasilkan:

| Check | Result |
| --- | --- |
| Effective source | `PostgreSQL normalized data` |
| Focus date | `2026-07-28` |
| `solarConsumptionDaily` | `854 liter` |
| Focus chart point `series[date=2026-07-28].solar` | `854 liter` |
| `solarConsumptionMonthly` | `24,274 liter` |
| `solarReceiptMonthly` | `25,000 liter` dari `solar_receipts` |
| Daily series length | `31` rows |
| Missing-value behavior pada `2026-07-30` | metric `null`, `available=false`, chart point `solar=null` |

Dengan demikian kartu KPI dan line chart mengonsumsi source/point yang sama;
tidak ada source terpisah yang dapat menyebabkan angka kartu dan chart berbeda.

### Implementation and validation

Tidak ada perubahan runtime. Verifier read-only existing diperkuat di
`scripts/verify-postgres-overview.ts` dengan assertion untuk:

- metric harian, unit, dan source field;
- kesamaan metric dengan focus-date chart point;
- perilaku `null`/unavailable pada hari tanpa nilai;
- output nilai `solarConsumptionDaily` pada report.

Validation:

| Command/check | Result |
| --- | --- |
| `npm.cmd run db:verify-overview` | PASS; service, daily metric, chart alignment, dan null semantics |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS; route `/dashboard/solar` terdaftar |
| Local protected route check | `/dashboard/solar?...` -> `307 /login`; `/login` -> `200` |
| Database writes | `0`; tidak ada migration/schema operation |

Visual verification setelah login admin tidak dapat dijalankan karena tidak
ada credential test admin pada environment. Karena itu status tidak dinaikkan
menjadi `VERIFIED`.

### Historical data and known issues

Tidak ada historical mutation. `quantity_liter` dan record historis tetap
dipertahankan. Koreksi `source_cell` historis `CF11:CF40` ke kolom Solar yang
benar memerlukan strategi update dan audit trail terpisah.

Known review item:

1. lakukan authenticated manual visual check pada `/dashboard` dan
   `/dashboard/solar` untuk memastikan label, angka `854 liter`, tanggal fokus,
   dan line chart terlihat sesuai;
2. bila diperlukan, lakukan remediation provenance historis terpisah dengan
   approval, tanpa mengubah nilai kuantitas.

Status Phase 3: `PASS_WITH_REVIEW`.
