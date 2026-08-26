# Overview Data Mapping

## Scope

Dokumen ini mencatat implementasi Phase 6 untuk route `/dashboard`. Laravel tetap menjadi source/reference dan tidak diubah. Implementasi Next.js tidak memakai dummy data.

Data source dipilih sebagai berikut:

1. Jika `GOOGLE_SHEETS_CREDENTIALS_PATH` dan `GOOGLE_SHEETS_SPREADSHEET_ID` tersedia, Next.js memakai Google Sheets API v4 dengan parser yang mengikuti `GoogleSheetsDataSource` Laravel.
2. Jika konfigurasi Google Sheets tidak tersedia, Next.js memakai PostgreSQL existing melalui Prisma. Karena schema PostgreSQL belum memuat seluruh domain Overview, metrik yang tidak memiliki padanan dikembalikan sebagai unavailable, bukan angka buatan.

## Laravel source contract

- Service: `backend/app/DataSources/GoogleSheetsDataSource.php`.
- Range: `B11:CO59`.
- Worksheet: `[Bulan Indonesia][2 digit tahun]-BB`, contoh `Juli26-BB`.
- Baris harian: indeks response `0..30`, spreadsheet row 11..41.
- Total bulanan: indeks `31`, spreadsheet row 42.
- Penerimaan biomassa: indeks baris `41`, spreadsheet row 52.
- Target biomassa: indeks baris `45`, spreadsheet row 56.
- Realisasi kumulatif biomassa: indeks baris `48`, spreadsheet row 59.
- Indeks kolom di bawah adalah relatif terhadap kolom B (`B = 0`).

Filter `day` memilih baris tanggal yang cocok. Bila tidak ada, Laravel memilih baris harian terakhir yang memiliki tanggal. Tanpa `day`, Laravel memakai tanggal server (`UTC` pada konfigurasi Laravel). Next.js mempertahankan perilaku tersebut.

## KPI mapping

| KPI | Laravel source/query | Formula dan unit | Next.js mapping | Parity |
|---|---|---|---|---|
| Penerimaan Biomassa | `S` index 17 pada row 52 | Nilai sel; ton; bulanan | `metrics.biomassReceiptMonthly`, Google adapter | Formula sama |
| Pemakaian Biomassa | `AC` index 27 pada row 42 | Nilai sel; ton; bulanan | `metrics.biomassConsumptionMonthly`, Google adapter | Formula sama |
| Pemakaian Batubara | `AB` index 26 pada row 42 | Nilai sel; ton; bulanan | Google: nilai `AB42`; PostgreSQL: `SUM(coal_consumption.coal_used)` pada periode | Google sama; PG adalah padanan schema |
| Stock Batubara | `AD` index 28 pada baris fokus | Nilai sel; ton; harian | Google: nilai `AD` baris fokus; PG: `coal_stock.closing_stock` tanggal fokus | Formula sama pada Google; PG padanan |
| Total Pemakaian Solar | `CJ` index 86 pada row 42 | Nilai sel; liter; bulanan | `metrics.solarConsumptionMonthly`, Google adapter | Formula sama |
| Realisasi Biomassa Kumulatif | `CO` index 91 pada row 59 | Nilai sel; ton; kumulatif sampai periode | `metrics.biomassCumulative`, Google adapter | Formula sama |
| Progress Target Biomassa | target `CO` row 56 dan realisasi `CO` row 59 | `min(100, realisasi / target * 100)`; persen | `metrics.biomassTargetProgress` dan `target` | Formula sama |
| Penerimaan Batubara | `I` index 7 pada row 42 | Nilai sel; ton; bulanan | Google: nilai `I42`; PG: `SUM(coal_stock.received)` pada periode | Google sama; PG padanan |

Target fallback Laravel `70020` ton jika nilai target kosong/invalid/<=0 dipertahankan oleh Google adapter. Format target seperti `70.020` atau `70,020` diperlakukan sebagai 70.020 ton sesuai helper Laravel `targetValue`.

Stock card juga menampilkan persentase kapasitas dengan formula `round(stock / 70000 * 100)`. Nilai ini adalah indikator kapasitas display, bukan KPI tambahan dari database.

## Daily detail mapping

| Detail | Laravel column | Next.js |
|---|---|---|
| Biomassa Unit 1/2/3 | `T/W/Z` index `18/21/24` | `biomassDaily` |
| Batubara Unit 1/2/3 | `S/V/Y` index `17/20/23` | `coalDaily` |
| Solar harian | `CJ` index `86` | `metrics.solarConsumptionDaily` |
| HOP Unit 1/2/3 | `AL/AK/AJ` index `36/35/34` | `hop` |

Nilai harian kosong tetap `null` pada adapter Google. Jumlah konsumsi biomassa harian hanya dijumlahkan dari unit yang hadir; jika seluruh unit kosong, hasilnya `null`. Ini mengikuti `nullableVal` dan `sumNullableValues` Laravel.

Status HOP dipetakan sama: `<10` = `Kritis`, `10.. <15` = `Perhatian`, `>=15` = `Aman`.

## Chart mapping

Chart `Konsumsi Energi Primer Harian` memakai `daily_series` Laravel:

- sumbu X: `day` dari baris harian;
- dataset batubara: `batubara_pemakaian` / kolom `AB` index 26;
- dataset biomassa: `biomassa_pemakaian`, yaitu jumlah nullable unit `T + W + Z`;
- unit: ton;
- aggregation: satu nilai per hari, tanpa rolling average atau interpolasi;
- empty state: ditampilkan jika tidak ada nilai pada kedua dataset.

Next.js merender chart sebagai SVG server component sehingga tidak menambahkan dependency Chart.js pada Phase 6. Skala dan path hanya visualisasi dari data service; tidak ada perubahan pada nilai.

## Filter, fallback, dan state

- Query: `month`, `year`, `day` pada URL `/dashboard`.
- Input dinormalisasi dan dibatasi pada bulan valid, tahun 2024 sampai current year + 1, serta jumlah hari valid pada bulan tersebut.
- Jika Google worksheet periode yang diminta gagal dibaca, adapter mencoba hingga 12 worksheet sebelumnya dan menampilkan `fallbackNotice`.
- Jika PostgreSQL tidak memiliki baris pada periode yang diminta, service mencari bulan paling baru dalam jendela 12 bulan dan menampilkan notice.
- Error koneksi/data service menghasilkan error state; data tidak diganti dengan dummy.
- Data source, worksheet/periode efektif, dan notice fallback ditampilkan di UI agar perbedaan periode tidak tersembunyi.

## Laravel → Next.js feature mapping

| Laravel implementation | Target Next.js implementation | Dependency | Database/API dependency | Complexity | Migration risk |
|---|---|---|---|---|---|
| `DashboardController@overview` + `DashboardService` | `getOverviewData` + server page `/dashboard` | Next App Router, Prisma client, native server `fetch` | Google Sheets API atau PostgreSQL existing | High | High: source Google dan cache/fallback harus konsisten |
| `overview-kpis.blade.php` | `OverviewDashboard`, `OverviewKpiCard` | React, Tailwind | Tidak langsung | Medium | Medium: format/null state harus parity |
| Chart.js `daily_series` | `EnergyConsumptionChart` SVG | React/SVG native | Data daily series | Medium | Medium: visual berbeda, data contract sama |
| Filter GET Laravel | HTML GET form pada `/dashboard` | App Router search params | Query period ke source aktif | Low | Medium: fallback tanggal/periode |
| Target/HOP panel | `TargetPanel`, `HopPanel` | React, Tailwind | Kolom Google; belum ada padanan PG | Medium | High: PostgreSQL tidak memiliki data ini |

## Validation

### PostgreSQL existing

Read verification tanpa migration/schema write:

- database: `dashboard_pln`, schema `public`;
- units: 3;
- `coal_consumption`: 1.095 rows;
- `coal_stock`: 365 rows;
- `power_generation`: 1.095 rows;
- Prisma read and relationship checks: PASS.

Route verification pada query `month=12&year=2025&day=26`:

| Nilai | PostgreSQL query yang dipakai Next.js | Next.js rendered result |
|---|---:|---:|
| Pemakaian batubara bulanan | `SUM(coal_consumption.coal_used)` = `91379` ton | `91379` ton (`91.379` display) |
| Penerimaan batubara bulanan | `SUM(coal_stock.received)` = `41975` ton | `41975` ton (`41.975` display) |
| Stock tanggal fokus | `coal_stock.closing_stock` = `-360889.96` ton | `-360889.96` ton (display dibulatkan sesuai card) |
| Batubara Unit 1 tanggal fokus | `1047.7` ton | `1047.7` ton |
| Batubara Unit 2 tanggal fokus | `1003.64` ton | `1003.64` ton |
| Batubara Unit 3 tanggal fokus | `923` ton | `923` ton |

### Google Sheets

Validasi source Laravel dan render Next.js dijalankan read-only untuk worksheet `Juli26-BB`, tanggal 28. Request sempat mengembalikan HTTP `503 UNAVAILABLE`, kemudian berhasil saat pengujian diulang.

| Nilai | Laravel result | Next.js result | Status |
|---|---:|---:|---|
| Penerimaan biomassa bulanan | `3223.46` ton | `3223.46` ton | PASS |
| Pemakaian biomassa bulanan | `3740.65` ton | `3740.65` ton | PASS |
| Pemakaian batubara bulanan | `34940.444` ton | `34940.444` ton | PASS |
| Stock batubara tanggal 28 | `19152.296` ton | `19152.296` ton | PASS |
| Pemakaian solar harian | `854` liter | `854` liter | PASS |
| Pemakaian solar bulanan | `24274` liter | `24274` liter | PASS |
| Realisasi biomassa kumulatif | `29103.77` ton | `29103.77` ton | PASS |
| Target biomassa | `70020` ton | `70020` ton | PASS |
| Progress target | `41.564938588974584%` | `41.564938588974584%` | PASS |
| Penerimaan batubara bulanan | `30084.842` ton | `30084.842` ton | PASS |
| Biomassa Unit 1/2/3 harian | `74.8 / 47.6 / 61.2` ton | `74.8 / 47.6 / 61.2` ton | PASS |
| Batubara Unit 1/2/3 harian | `565.739 / 651.344 / 375.487` ton | `565.739 / 651.344 / 375.487` ton | PASS |
| HOP Unit 1/2/3 | `31.9 / 16 / 10.64` hari | `31.9 / 16 / 10.64` hari | PASS |

Chart row validation untuk hari ke-28 juga sama: biomass `183.6` ton (`74.8 + 47.6 + 61.2`) dan batubara `1592.57` ton dari kolom `AB` harian.

## Files

- `src/types/overview.ts`: shared Overview contract.
- `src/services/overview.ts`: source selection, PostgreSQL aggregation, fallback.
- `src/services/google-sheets-overview.ts`: read-only Google Sheets adapter and Laravel-compatible parser.
- `src/components/dashboard/OverviewDashboard.tsx`: page composition, filters, KPI/detail panels, states.
- `src/components/dashboard/OverviewKpiCard.tsx`: reusable KPI card.
- `src/components/dashboard/EnergyConsumptionChart.tsx`: daily chart.
- `src/components/dashboard/OverviewState.tsx`: empty, unavailable, and error states.
- `src/app/(protected)/dashboard/page.tsx`: authenticated server route.
- `src/app/(protected)/dashboard/loading.tsx`: route loading state.

No dependency was added for Phase 6. Laravel files and database schema were not modified.
