# Mapping KPI Google Sheets — Juni26-BB

Tanggal audit: 31 Agustus 2026  
Status audit: **PASS_WITH_REVIEW**

## Ringkasan

Worksheet `Juni26-BB` berhasil dibaca langsung melalui Google Sheets API menggunakan range `A1:ZZ500`. Data yang diperlukan untuk KPI utama dapat ditemukan dan dipetakan, termasuk fallback yang diverifikasi untuk layout legacy pada beberapa kolom.

Audit mapping awal bersifat **read-only**. Setelah hasil dry-run disetujui, mapping legacy yang sudah diverifikasi dipakai untuk controlled import transaksional. Tidak ada migrasi, `DROP`, `DELETE`, atau perubahan schema/database yang dilakukan.

Status tetap `PASS_WITH_REVIEW` karena beberapa nilai memakai fallback layout legacy dan terdapat perbedaan precision pada tabel batubara existing. Data Juni sekarang sudah tersimpan melalui import run yang tercatat di database.

## Sumber data

| Sumber | Hasil pemeriksaan |
| --- | --- |
| `excels/All database needed.txt` | Digunakan sebagai daftar KPI, sumber tabel, unit, pemasok, dan formula yang diharapkan. |
| `excels/dump-dashboard_pln-202608311006.sql` | File tersedia, format terdeteksi sebagai PostgreSQL custom dump (`PGDMP`). File hanya diperiksa metadata-nya; tidak di-restore dan tidak digunakan untuk menulis database. |
| Google Sheets `Juni26-BB` | Ditemukan dengan pencocokan nama case-insensitive; worksheet yang dibaca adalah `Juni26-BB`, periode Juni 2026. |
| Range live | `A1:ZZ500`, 147 baris raw, 11.388 cell hasil scan, tanpa fallback worksheet. |
| PostgreSQL lokal | Dibaca sebelum dan sesudah import. Setelah import, baris periode Juni 2026 diverifikasi melalui `importRunId 7`. |

Konfigurasi credential tetap server-side melalui konfigurasi aplikasi yang sudah ada. Tidak ada secret, private key, token, atau isi credential yang dicantumkan di sini.

## Hasil controlled import

| Item | Hasil |
| --- | --- |
| Import run | `7` |
| Worksheet | `Juni26-BB` |
| Periode | `2026-06-01` |
| Status | `SUCCESS` |
| Staging rows tervalidasi | `341` |
| Database writes | `341` melalui transactional upsert |
| Migration/schema change | Tidak ada |
| Delete/destructive operation | Tidak ada |

Import bersifat idempotent pada business key yang sudah ada. Verifikasi pasca-import memastikan seluruh staging row terkait ke worksheet `Juni26-BB`, tidak ada row invalid, dan tidak ada write di luar pipeline import.

## Mapping KPI utama

| KPI | Sumber Google Sheets | Formula/transformation | Unit | Target data layer | Hasil Juni 2026 | Status |
| --- | --- | --- | --- | --- | ---: | --- |
| `biomassReceiptMonthly` | `J42`, `K42`, `L42`, `M42`, `N42`, `P42`, `Q42` | Jumlah tujuh pemasok biomassa resmi | ton | `biomass_receipts.period_start`, `supplier_code`, `quantity_ton` | 5.474,35 | RESOLVED |
| `biomassConsumptionMonthly` | `T42`, `W42`, `Z42` dan total sumber `AC42` | Total pemakaian Unit 1–3; divalidasi terhadap total bulanan | ton | `biomass_consumptions.reading_date`, `unit_id`, `quantity_ton` | 3.902,63 | RESOLVED |
| `coalConsumptionMonthly` | `AB42` | Total bulanan; divalidasi dengan `SUM(AB11:AB40)` | ton | `coal_consumption.date`, `unit_id`, `coal_used` | 32.556,994 | RESOLVED_WITH_FALLBACK |
| `coalReceiptMonthly` | `I42` | Total penerimaan batubara bulanan | ton | `coal_receipts.period_start`, `quantity_ton` | 45.255,704 | RESOLVED_WITH_FALLBACK |
| `solarConsumptionMonthly` | `CJ42` | Total pemakaian harian periode; divalidasi dengan jumlah `CJ11:CJ40` | liter | `solar_consumptions.reading_date`, `quantity_liter` | 26.848 | RESOLVED_WITH_FALLBACK |
| `solarReceiptMonthly` | `CC42` | Total penerimaan solar bulanan | liter | `solar_receipts.period_start`, `quantity_liter` | 25.000 | RESOLVED_WITH_FALLBACK |
| `biomassTarget` | Tidak ada tabel/label `Target 2026` yang terdeteksi | Fallback target resmi yang telah disepakati: `70.020` | ton | `biomass_targets.target_year`, `target_ton` | 70.020 | RESOLVED_WITH_FALLBACK |
| `biomassCumulative` | Tabel `TONASE BIOMASSA`, label `TOTAL 2026` di `CL58`, nilai di `CO58` | Pilih total dari tabel `TONASE BIOMASSA`, bukan tabel KWH Green | ton | `biomass_cumulative_snapshots.period_start`, `cumulative_ton` | 25.939,12 | RESOLVED_WITH_FALLBACK |
| `biomassTargetProgress` | Derived dari target dan kumulatif | `MIN(100, cumulative / target × 100)` | % | `cumulative_ton / target_ton` | 37,0453% | RESOLVED |

Catatan:

- `RESOLVED_WITH_FALLBACK` berarti nilainya ditemukan dan divalidasi dari layout Juni, tetapi belum di-resolve oleh semantic parser generik sebagai field canonical.
- Untuk `biomassConsumptionMonthly`, nilai `3.902,63` cocok dengan total `AC42` dan penjumlahan nilai Unit 1–3 pada baris total (`T42 + W42 + Z42`).
- `CO56` tidak digunakan sebagai target. Pada layout Juni, nilai tersebut merupakan kumulatif Unit 1 di tabel `TONASE BIOMASSA`, bukan target tahunan.
- Nilai kosong harian tetap diperlakukan sebagai `null`, bukan diubah menjadi angka nol.

## Mapping pemasok biomassa

Tujuh kolom yang digunakan oleh KPI `biomassReceiptMonthly` adalah:

| Cell total bulanan | Nama pemasok | `supplier_code` yang disarankan | Nilai Juni (ton) |
| --- | --- | --- | ---: |
| `J42` | Sawdust PT Syahroni | `sawdust-pt-syahroni` | 676,31 |
| `K42` | Sawdust PT Bintang | `sawdust-pt-bintang` | 509,31 |
| `L42` | Woodchip PT Syahroni | `woodchip-pt-syahroni` | 2.853,66 |
| `M42` | Woodchip PT RAP | `woodchip-pt-rap` | 431,73 |
| `N42` | Woodchip CV Multi Paketindo | `woodchip-cv-multi-paketindo` | 793,00 |
| `P42` | LRUK | `lruk` | 5,56 |
| `Q42` | SRF | `srf` | 204,78 |
|  | **Total** |  | **5.474,35** |

Kolom `O` (Woodchip tanpa pemasok yang jelas) dan `R` (Bonggol Jagung) tidak dimasukkan karena bukan bagian dari tujuh pemasok biomassa resmi yang dikonfirmasi.

## Mapping data harian untuk chart dan KPI fokus tanggal

Worksheet memiliki 30 baris data harian untuk Juni 2026. Urutan unit yang digunakan adalah **Unit 1, Unit 2, Unit 3**.

| Dataset | Kolom sumber | Data layer | Catatan |
| --- | --- | --- | --- |
| Pemakaian biomassa Unit 1 | `T11:T40` | `biomass_consumptions` + unit 1 | Jalur header terverifikasi `UNIT 1 > BIOMASSA > TON`. |
| Pemakaian biomassa Unit 2 | `W11:W40` | `biomass_consumptions` + unit 2 | Jalur header terverifikasi `UNIT 2 > BIOMASSA > TON`. |
| Pemakaian biomassa Unit 3 | `Z11:Z40` | `biomass_consumptions` + unit 3 | Jalur header terverifikasi `UNIT 3 > BIOMASSA > TON`. |
| Pemakaian batubara Unit 1 | `S11:S40` | `coal_consumption` + unit 1 | Urutan unit diverifikasi dari layout; label TON pada kolom ini tidak konsisten. |
| Pemakaian batubara Unit 2 | `V11:V40` | `coal_consumption` + unit 2 | Urutan unit diverifikasi dari layout. |
| Pemakaian batubara Unit 3 | `Y11:Y40` | `coal_consumption` + unit 3 | Jalur header memuat `TON`. |
| Total batubara harian | `AB11:AB40` | Validasi/chart total; total DB dapat dihitung dari unit | Tidak membuat metric bisnis baru; digunakan untuk cross-check sumber. |
| Stok batubara | `AD11:AD40` | `coal_stock.closing_stock` | 30/30 baris numeric. |
| HOP Unit 1 | `AL11:AL40` | `hop_readings` + unit 1 | Header `HOP > 1 UNIT`. |
| HOP Unit 2 | `AK11:AK40` | `hop_readings` + unit 2 | Header `HOP > 2 UNIT`. |
| HOP Unit 3 | `AJ11:AJ40` | `hop_readings` + unit 3 | Header `HOP > 3 UNIT`. |
| Pemakaian solar harian | `CJ11:CJ40` | `solar_consumptions` | 30/30 baris numeric. |

### Coverage hasil pembacaan

| Series | Numeric | Empty | Malformed |
| --- | ---: | ---: | ---: |
| Biomassa Unit 1 | 23/30 | 7 | 0 |
| Biomassa Unit 2 | 11/30 | 19 | 0 |
| Biomassa Unit 3 | 30/30 | 0 | 0 |
| Batubara Unit 1 | 26/30 | 4 | 0 |
| Batubara Unit 2 | 11/30 | 19 | 0 |
| Batubara Unit 3 | 30/30 | 0 | 0 |
| Total batubara harian | 30/30 | 0 | 0 |
| Stok batubara | 30/30 | 0 | 0 |
| HOP Unit 1–3 | 30/30 masing-masing | 0 | 0 |
| Solar harian | 30/30 | 0 | 0 |

Sel kosong di kolom unit merupakan kondisi yang memang ada pada worksheet Juni. Saat diimpor atau digunakan chart, sel tersebut harus tetap `null` supaya menjadi gap dan tidak menyatakan konsumsi nol tanpa dasar.

### Sampel tanggal fokus 30 Juni 2026

| Data | Nilai |
| --- | --- |
| Biomassa Unit 1 / 2 / 3 | `null` / `null` / `106,38` ton |
| Batubara Unit 1 / 2 / 3 | `null` / `null` / `485,543` ton |
| Total batubara harian | `485,543` ton |
| Stok batubara | `22.841,466` ton |
| HOP Unit 1 / 2 / 3 | `38,1` / `19` / `12,69` hari |
| Pemakaian solar | `827` liter |

## Validasi formula dan data

Validasi source berikut dilakukan dari hasil live read sebelum import:

| Validasi | Hasil source | Hasil pembanding | Match |
| --- | ---: | ---: | --- |
| Total tujuh pemasok biomassa | 5.474,35 | Aggregate parser 5.474,35 | Ya |
| Total pemakaian biomassa harian per Unit 1–3 | 1.128,85 + 678,20 + 2.095,58 = 3.902,63 | `AC42` = 3.902,63 | Ya |
| Total batubara harian | `SUM(AB11:AB40)` = 32.556,994 | `AB42` = 32.556,994 | Ya |
| Total solar harian | `SUM(CJ11:CJ40)` = 26.848 | `CJ42` = 26.848 | Ya |
| Progress target | `25.939,12 / 70.020 × 100` = 37,0453% | Derived KPI | Ya |

Catatan precision: tabel existing `coal_consumption` menggunakan `DECIMAL(12,2)`. Nilai sumber batubara tiga desimal dibulatkan per baris ketika disimpan; hasil aggregate PostgreSQL setelah import adalah `32.557,03` ton, dibandingkan source `32.556,994` ton. Schema tidak diubah.

## Status parser dan rencana import

Dynamic parser menghasilkan:

- parser errors: tidak ada;
- 30 daily records terdeteksi;
- `biomassReceiptMonthly` dan `biomassConsumptionMonthly` terdeteksi secara semantic;
- beberapa field legacy belum terdeteksi secara semantic: konsumsi/penerimaan batubara, daily coal fields, stock, HOP, solar, cumulative, dan progress;
- `biomassCumulative` tetap ditandai ambiguous oleh parser generik karena terdapat beberapa tabel kumulatif; audit ini menyelesaikannya dengan membatasi pencarian pada tabel `TONASE BIOMASSA`;
- target 2026 menggunakan fallback `70.020` karena tabel/label `Target 2026` tidak ditemukan.

Sebelum fallback legacy diterapkan, rencana import generik berstatus `NEEDS_REVIEW` dengan blocking issue berikut:

- `solar_receipt_unresolved`;
- `coal_receipt_unresolved`;
- `biomass_cumulative_unresolved`;
- `ambiguous_fields`.

Setelah fallback approved untuk `Juni26-BB` diterapkan, dry-run menghasilkan status `READY_FOR_IMPORT` dengan ringkasan:

- 30 daily rows;
- 7 biomass receipt rows;
- 1 coal receipt row;
- 90 biomass consumption rows;
- 90 coal consumption rows;
- 30 coal stock rows;
- 30 solar consumption rows;
- 1 solar receipt row;
- 90 HOP rows;
- 1 target fallback row;
- 1 cumulative row;
- total staging: 341 rows.

Pipeline tersebut kemudian berhasil di-commit sebagai import run `7`.

Artinya, mapping KPI sudah digunakan untuk import Juni. Periode berikutnya tetap harus melalui dry-run dan review karena layout legacy tidak boleh diasumsikan sama tanpa verifikasi.

## Perbandingan database lokal

Pemeriksaan read-only terhadap schema normalized menemukan tabel target dan unit berikut:

- tabel normalized yang diharapkan tersedia, termasuk receipts, consumptions, stock, HOP, target, dan cumulative snapshot;
- unit yang tersedia: `Unit 1`, `Unit 2`, `Unit 3`;
- target tahun 2026 tersedia dengan nilai `70.020` ton dan terkait ke import run `7`;
- `biomass_receipts`: 7 rows;
- `biomass_consumptions`: 90 rows;
- `coal_receipts`: 1 row;
- `coal_consumption`: 90 rows pada Juni;
- `coal_stock`: 30 rows pada Juni;
- `solar_receipts`: 1 row;
- `solar_consumptions`: 30 rows;
- `hop_readings`: 90 rows;
- `biomass_cumulative_snapshots`: 1 row, source cell `CO58`.

Verifikasi pasca-import berstatus **PASS**. Nilai KPI utama cocok dengan mapping source, dengan satu perbedaan precision batubara yang dijelaskan di atas.

## Kesimpulan dan langkah aman berikutnya

**Kesimpulan:** Data pada `Juni26-BB` cukup untuk membentuk mapping dan mengisi KPI Juni. Data sudah diimport dengan controlled transactional upsert; fallback legacy dan batas precision schema tetap perlu diperhatikan untuk periode lain.

Langkah berikutnya yang aman:

1. Pertahankan fixture/verifier `Juni26-BB` sebagai regression test.
2. Jalankan dry-run seluruh worksheet 2023–2026 dan bandingkan total terhadap baris total tiap worksheet.
3. Review hasil dry-run per periode sebelum import berikutnya.
4. Jangan mengubah precision `coal_consumption` tanpa persetujuan schema/database.

## Cara menjalankan ulang

Dari folder `energiprimer-next`:

```bash
npm run kpi:map:juni
```

Untuk dry-run import Juni:

```bash
npm run sheets:dry-run -- --month=6 --year=2026
```

Untuk verifikasi database setelah import:

```bash
npm run db:verify-kpi:juni
```

Perintah audit/dry-run membaca worksheet dan database tanpa write. Perintah import yang digunakan untuk controlled commit membutuhkan flag `--commit` eksplisit. Credential tidak dicetak dan tidak dikembalikan ke client.
