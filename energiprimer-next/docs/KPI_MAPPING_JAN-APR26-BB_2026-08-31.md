# Mapping KPI `Januari26-BB` sampai `April26-BB`

Tanggal audit: 31 Agustus 2026  
Metode: Google Sheets API read-only, range `A1:ZZ500`  
Status keseluruhan: **PASS** (seluruh item review disetujui manual; dry-run lulus)  
Status import: **SUCCESS — IMPORTED AND VERIFIED**

## Kesimpulan singkat

Mapping empat worksheet memungkinkan dilakukan. Kolom harian, baris total,
unit, formula KPI, dan kalender dapat dipetakan dengan pola yang sama seperti
`Mei26-BB`. Tidak ada parser error dan tidak ada nilai malformed setelah tanda
`-` diperlakukan sebagai nilai kosong/null.

Namun, worksheet Januari–April tidak identik dengan Mei pada bagian pemasok
biomassa. Pada Januari–April, `Woodchip CV Multi Paketindo` berada di `O42`,
sedangkan pada Mei berada di `N42`. Kolom `N42` Januari–April berisi
`Woodchip` tanpa pemasok. Parser semantic berhasil mengenali nama pemasok,
dan perbedaan posisi ini telah disetujui melalui review manual.

Seluruh item yang sebelumnya berstatus `NEEDS_REVIEW` telah diverifikasi dan
disetujui secara manual oleh pengguna. Allowlist fallback kini diperluas secara
eksplisit hanya untuk empat worksheet tersebut. Dry-run ulang menghasilkan
`READY_FOR_IMPORT` untuk semuanya, dengan `blockingIssues: []`.

Dry-run sebelum commit bersifat read-only dengan `databaseWrites: 0`. Setelah
persetujuan manual, import terkontrol dijalankan satu per satu dan seluruh run
berhasil. Tidak ada migrasi schema, drop tabel, atau delete data yang dilakukan.

## Hasil eksekusi import

| Worksheet | Periode | Import run | Imported rows | Rejected rows | Status |
| --- | --- | ---: | ---: | ---: | --- |
| `Januari26-BB` | 2026-01-01 | 9 | 352 | 0 | `SUCCESS` |
| `Februari26-BB` | 2026-02-01 | 10 | 319 | 0 | `SUCCESS` |
| `Maret26-BB` | 2026-03-01 | 11 | 352 | 0 | `SUCCESS` |
| `April26-BB` | 2026-04-01 | 12 | 341 | 0 | `SUCCESS` |

Verifikasi read-only sesudah import menghasilkan row count dan nilai KPI yang
sesuai mapping. Unit yang tersimpan adalah `PLTU-1`/`Unit 1`, `PLTU-2`/`Unit 2`,
dan `PLTU-3`/`Unit 3`.

Catatan: `coal_consumption` adalah tabel existing dengan penyimpanan 2 angka
desimal. Nilai sumber 3 angka desimal dibulatkan pada setiap baris sesuai batas
schema existing; karena itu agregat database dapat berbeda tipis dari agregat
raw source. Tidak ada perubahan schema dilakukan untuk mengatasi perbedaan ini.

## Keputusan review manual

Persetujuan mencakup fallback `I42` (penerimaan batubara), `CC42` (penerimaan
solar), dan `CO58` (kumulatif biomassa), fallback target resmi `70.020 ton`,
serta pergeseran pemasok `Woodchip CV Multi Paketindo` ke `O42` pada
Januari-April. Mapping pemasok tetap berdasarkan label/supplier code, bukan
posisi kolom global. Placeholder `-` tetap dipertahankan sebagai `null`.

Persetujuan ini diterapkan hanya pada `Januari26-BB`, `Februari26-BB`,
`Maret26-BB`, dan `April26-BB`; worksheet lain tidak ikut mendapatkan fallback
fisik tersebut.

## Worksheet yang ditemukan

Nama worksheet aktual diverifikasi dari metadata Google Sheets. Bentuk singkat
seperti `Jan26-BB` tidak ada; nama yang tersedia menggunakan nama bulan lengkap.

| Worksheet | Periode | Baris harian | Baris sumber harian | Baris total | Raw rows | Scanned cells | Parser error |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| `Januari26-BB` | Januari 2026 | 31 | 11–41 | 42 | 147 | 11.378 | Tidak ada |
| `Februari26-BB` | Februari 2026 | 28 | 11–38 | 42 | 147 | 11.379 | Tidak ada |
| `Maret26-BB` | Maret 2026 | 31 | 11–41 | 42 | 147 | 11.379 | Tidak ada |
| `April26-BB` | April 2026 | 30 | 11–40 | 42 | 147 | 11.379 | Tidak ada |
| `Mei26-BB` (referensi) | Mei 2026 | 31 | 11–41 | 42 | 147 | 11.388 | Tidak ada |

Kolom `A` berisi nomor hari dan kolom `B` berisi tanggal lengkap. Baris total
tetap `42`, termasuk pada Februari ketika baris harian hanya sampai `38`.

## Mapping kolom harian

Mapping berikut sama pada Januari–April dan Mei:

| Dataset | Kolom | Baris | Database/KPI |
| --- | --- | --- | --- |
| Biomassa Unit 1 | `T` | tanggal 11–41 atau sesuai jumlah hari | `biomass_consumptions`, Unit 1 |
| Biomassa Unit 2 | `W` | tanggal 11–41 atau sesuai jumlah hari | `biomass_consumptions`, Unit 2 |
| Biomassa Unit 3 | `Z` | tanggal 11–41 atau sesuai jumlah hari | `biomass_consumptions`, Unit 3 |
| Batubara Unit 1 | `S` | tanggal 11–41 atau sesuai jumlah hari | `coal_consumption`, Unit 1 |
| Batubara Unit 2 | `V` | tanggal 11–41 atau sesuai jumlah hari | `coal_consumption`, Unit 2 |
| Batubara Unit 3 | `Y` | tanggal 11–41 atau sesuai jumlah hari | `coal_consumption`, Unit 3 |
| Total batubara harian | `AB` | tanggal 11–41 atau sesuai jumlah hari; total `AB42` | Validasi/pemakaian batubara |
| Stok batubara | `AD` | tanggal 11–41 atau sesuai jumlah hari | `coal_stock.closing_stock` |
| HOP Unit 1 | `AL` | tanggal 11–41 atau sesuai jumlah hari | `hop_readings`, Unit 1 |
| HOP Unit 2 | `AK` | tanggal 11–41 atau sesuai jumlah hari | `hop_readings`, Unit 2 |
| HOP Unit 3 | `AJ` | tanggal 11–41 atau sesuai jumlah hari | `hop_readings`, Unit 3 |
| Pemakaian solar harian | `CJ` | tanggal 11–41 atau sesuai jumlah hari; total `CJ42` | `solar_consumptions` |

Urutan unit yang digunakan adalah **Unit 1, Unit 2, Unit 3**.

## Perbedaan kolom pemasok biomassa

### Januari–April

| Kolom total | Label sumber | Status mapping |
| --- | --- | --- |
| `J42` | Sawdust PT Syahroni | Pemasok resmi |
| `K42` | Sawdust PT Bintang | Pemasok resmi |
| `L42` | Woodchip PT Syahroni | Pemasok resmi |
| `M42` | Woodchip PT RAP | Pemasok resmi |
| `N42` | Woodchip | Tidak jelas/tanpa perusahaan; tidak dihitung |
| `O42` | Woodchip CV Multi Paketindo | Pemasok resmi |
| `P42` | LRUK | Pemasok resmi |
| `Q42` | SRF | Pemasok resmi |
| `R42` | BONGGOL JAGUNG | Tidak termasuk KPI biomassa resmi |

Formula KPI Januari–April:

```text
SUM(J42, K42, L42, M42, O42, P42, Q42)
```

Nilai pemasok yang dibaca dari masing-masing baris total:

| Worksheet | `J42` Syahroni Sawdust | `K42` Bintang Sawdust | `L42` Syahroni Woodchip | `M42` RAP | `O42` CV Multi Paketindo | `P42` LRUK | `Q42` SRF | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Januari26-BB` | 531,330 | 509,670 | 2.160,400 | 556,520 | 399,020 | 3,500 | 80,940 | 4.241,380 |
| `Februari26-BB` | 505,280 | 398,320 | 1.241,490 | 726,500 | 660,400 | 3,960 | 55,720 | 3.591,670 |
| `Maret26-BB` | 686,300 | 616,970 | 2.365,480 | 649,940 | 620,400 | 4,310 | 105,500 | 5.048,900 |
| `April26-BB` | 715,310 | 418,160 | 2.942,130 | 524,240 | 647,100 | 8,660 | 124,860 | 5.380,460 |

### Mei sebagai referensi

Pada `Mei26-BB`, `Woodchip CV Multi Paketindo` berada di `N42`, sedangkan
`O42` adalah `Woodchip` tanpa pemasok. Karena itu, implementasi harus memakai
`supplier_code` hasil normalisasi label, bukan mengunci `CV Multi Paketindo`
ke satu nomor kolom untuk semua worksheet.

## Hasil KPI per worksheet

Semua nilai berikut berasal dari pembacaan source dan validasi total harian.
Target `70.020 ton` adalah fallback resmi karena tabel `Target 2026` tidak
ditemukan pada worksheet-worksheet ini.

| Worksheet | Penerimaan biomassa (ton) | Pemakaian biomassa (ton) | Pemakaian batubara (ton) | Penerimaan batubara (ton) | Pemakaian solar (liter) | Penerimaan solar (liter) | Kumulatif biomassa (ton) | Progress target |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Januari26-BB` | 4.241,38 | 3.489,20 | 45.280,543 | 15.187,724 | 31.973 | 30.000 | 3.489,20 | 4,9831% |
| `Februari26-BB` | 3.591,67 | 3.290,28 | 35.005,264 | 30.212,086 | 28.453 | 30.000 | 6.779,48 | 9,6822% |
| `Maret26-BB` | 5.048,90 | 5.636,81 | 38.462,929 | 50.459,229 | 33.472 | 35.000 | 12.416,29 | 17,7325% |
| `April26-BB` | 5.380,46 | 5.271,82 | 45.682,319 | 50.193,257 | 27.122 | 25.000 | 17.688,11 | 25,2615% |

Formula dan sumber KPI:

| KPI | Sumber | Formula/transformation | Unit |
| --- | --- | --- | --- |
| `biomassReceiptMonthly` | `J42`, `K42`, `L42`, `M42`, `O42`, `P42`, `Q42` pada Jan–Apr | Jumlah tujuh pemasok canonical | ton |
| `biomassConsumptionMonthly` | `T42`, `W42`, `Z42`; validasi `AC42` | `SUM(T42, W42, Z42)` | ton |
| `coalConsumptionMonthly` | `AB42`; validasi `SUM(AB11:AB[n])` | Total batubara bulanan | ton |
| `coalReceiptMonthly` | `I42` | Fallback cell legacy | ton |
| `solarConsumptionMonthly` | `CJ42`; validasi `SUM(CJ11:CJ[n])` | Total solar bulanan | liter |
| `solarReceiptMonthly` | `CC42` | Fallback cell legacy | liter |
| `biomassTarget` | Tidak ada tabel `Target 2026` | Fallback resmi `70.020` | ton |
| `biomassCumulative` | `CL55` → `CL58` → `CO58` | Nilai `TOTAL 2026` dari tabel `TONASE BIOMASSA` | ton |
| `biomassTargetProgress` | Target + `CO58` | `MIN(100, cumulative / 70020 × 100)` | % |

## Validasi total harian

| Worksheet | Biomassa Unit 1 + Unit 2 + Unit 3 | Total biomassa | Total batubara harian | Total solar harian | Hasil |
| --- | --- | ---: | ---: | ---: | --- |
| `Januari26-BB` | 1.282,66 + 914,41 + 1.292,13 | 3.489,20 | 45.280,543 | 31.973 | Cocok |
| `Februari26-BB` | 1.162,66 + 613,70 + 1.513,92 | 3.290,28 | 35.005,264 | 28.453 | Cocok |
| `Maret26-BB` | 2.064,00 + 1.379,51 + 2.193,30 | 5.636,81 | 38.462,929 | 33.472 | Cocok |
| `April26-BB` | 1.501,86 + 1.514,90 + 2.255,06 | 5.271,82 | 45.682,319 | 27.122 | Cocok |

Semua validasi source total terhadap penjumlahan harian berstatus cocok.

## Data kosong/placeholder yang perlu direview

Tanda `-` pada cell berikut merupakan placeholder kosong. Parser
mempertahankannya sebagai `null`; tidak dikonversi menjadi nol.

| Worksheet | Dataset | Cell placeholder | Jumlah |
| --- | --- | --- | ---: |
| `Januari26-BB` | Biomassa Unit 2 | `W34`, `W35`, `W38`, `W39`, `W40`, `W41` | 6 |
| `Januari26-BB` | Batubara Unit 2 | `V34`, `V35`, `V38`, `V39`, `V40`, `V41` | 6 |
| `Februari26-BB` | Biomassa Unit 1 | `T25`, `T26`, `T27` | 3 |
| `Februari26-BB` | Biomassa Unit 2 | `W11`, `W14`–`W29` | 17 |
| `Februari26-BB` | Batubara Unit 1 | `S25`, `S26`, `S27` | 3 |
| `Februari26-BB` | Batubara Unit 2 | `V11`, `V14`–`V28` | 16 |
| `Maret26-BB` | Biomassa Unit 2 | `W17`–`W23` | 7 |
| `Maret26-BB` | Batubara Unit 2 | `V17`–`V22` | 6 |
| `April26-BB` | Biomassa Unit 1 | `T31`, `T32`, `T34`–`T40` | 9 |
| `April26-BB` | Biomassa Unit 2 | `W15`–`W18` | 4 |
| `April26-BB` | Biomassa Unit 3 | `Z39` | 1 |
| `April26-BB` | Batubara Unit 2 | `V15`–`V17` | 3 |

Tidak ditemukan nilai malformed pada field yang diaudit. Yang perlu diputuskan
secara operasional hanya apakah placeholder tersebut memang berarti tidak ada
operasi atau perlu dikoreksi pada sumber; mapping saat ini mengikuti kebijakan
aman: tetap `null`.

## Seluruh item review (disetujui manual)

Bagian ini menyimpan temuan dari audit awal. Berdasarkan verifikasi manual
pengguna, seluruh item di bawah telah disetujui dan tidak lagi menjadi blocker
import untuk empat worksheet yang disebutkan di atas.

### 1. Penerimaan batubara

Semantic parser belum menemukan field canonical, sehingga import-plan meminta
review fallback berikut:

| Worksheet | Source cell | Nilai |
| --- | --- | ---: |
| `Januari26-BB` | `I42` | 15.187,724 ton |
| `Februari26-BB` | `I42` | 30.212,086 ton |
| `Maret26-BB` | `I42` | 50.459,229 ton |
| `April26-BB` | `I42` | 50.193,257 ton |

Blocker import: `coal_receipt_unresolved`.

### 2. Penerimaan solar

Semantic parser belum menemukan field canonical, sehingga import-plan meminta
review fallback berikut:

| Worksheet | Source cell | Nilai |
| --- | --- | ---: |
| `Januari26-BB` | `CC42` | 30.000 liter |
| `Februari26-BB` | `CC42` | 30.000 liter |
| `Maret26-BB` | `CC42` | 35.000 liter |
| `April26-BB` | `CC42` | 25.000 liter |

Blocker import: `solar_receipt_unresolved`.

### 3. Kumulatif biomassa

Pada keempat worksheet, jalur kandidat yang terdeteksi adalah:

```text
CL55 = TONASE BIOMASSA
CL58 = TOTAL 2026
CO58 = nilai kumulatif
```

| Worksheet | Source cell final | Nilai |
| --- | --- | ---: |
| `Januari26-BB` | `CO58` | 3.489,20 ton |
| `Februari26-BB` | `CO58` | 6.779,48 ton |
| `Maret26-BB` | `CO58` | 12.416,29 ton |
| `April26-BB` | `CO58` | 17.688,11 ton |

Field ditandai ambigu oleh semantic parser karena ada tabel lain yang memiliki
label total. Fallback dibatasi ke tabel `TONASE BIOMASSA`; tetap memerlukan
review eksplisit sebelum allowlist import diperluas.

Blocker import: `biomass_cumulative_unresolved` dan `ambiguous_fields`.

### 4. Target biomassa 2026

Tabel dengan label `Target 2026` tidak ditemukan pada empat worksheet. Nilai
yang digunakan adalah kebijakan resmi yang sudah disepakati: **70.020 ton**.
Tidak ada source cell target pada worksheet. Ini bukan blocker baru pada
struktur, tetapi tetap tercatat sebagai `RESOLVED_WITH_FALLBACK` dan harus
dipertahankan konsisten ketika import.

### 5. Pergeseran kolom pemasok

| Periode | CV Multi Paketindo | Woodchip tanpa perusahaan | Dampak |
| --- | --- | --- | --- |
| Januari–April | `O42` | `N42` | Berbeda dari Mei; mapping harus berdasarkan label/supplier code |
| Mei–Juni | `N42` | `O42` | Pola referensi terbaru |

Saat ini tujuh pemasok tetap dapat dipetakan dan total supplier cocok, tetapi
perbedaan ini perlu direview sebelum menjalankan import Januari–April.

### 6. Diagnostic unresolved semantic parser

Daftar berikut muncul sebagai `parser.unresolved` walaupun path legacy dan
nilai source berhasil ditemukan oleh audit manual:

```text
biomassUnit1Current
biomassUnit2Current
biomassUnit3Current
coalConsumptionMonthly
coalUnit1Current
coalUnit2Current
coalUnit3Current
coalDailyTotal
coalStock
coalHop
solarConsumptionDaily
solarConsumptionMonthly
solarReceiptMonthly
biomassCumulative
biomassTargetProgress
```

Entri tersebut tidak semuanya berarti data hilang. Field daily sudah memiliki
kolom dan tanggal yang benar; yang belum dapat diputuskan otomatis oleh
import-plan adalah fallback legacy di atas. Nilai `parser.ambiguous` pada semua
worksheet adalah `biomassCumulative`.

## Import-plan per worksheet

| Worksheet | Daily rows | Receipt rows | Coal receipt rows | Coal consumption rows | Stock rows | Biomass consumption rows | Solar consumption rows | Solar receipt rows | HOP rows | Target rows | Cumulative rows | Total rows | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `Januari26-BB` | 31 | 7 | 1 | 93 | 31 | 93 | 31 | 1 | 93 | 1 | 1 | 352 | `READY_FOR_IMPORT` |
| `Februari26-BB` | 28 | 7 | 1 | 84 | 28 | 84 | 28 | 1 | 84 | 1 | 1 | 319 | `READY_FOR_IMPORT` |
| `Maret26-BB` | 31 | 7 | 1 | 93 | 31 | 93 | 31 | 1 | 93 | 1 | 1 | 352 | `READY_FOR_IMPORT` |
| `April26-BB` | 30 | 7 | 1 | 90 | 30 | 90 | 30 | 1 | 90 | 1 | 1 | 341 | `READY_FOR_IMPORT` |

Blocker pada audit awal sebelum persetujuan manual:

```text
solar_receipt_unresolved
coal_receipt_unresolved
biomass_cumulative_unresolved
ambiguous_fields
```

Hasil dry-run setelah persetujuan manual untuk setiap worksheet adalah
`blockingIssues: []`. Peringatan yang tersisa hanya penggunaan fallback target
resmi `70.020 ton` karena tabel `Target 2026` memang tidak ditemukan.

`databaseWrites` pada dry-run: `0`; commit import sesudahnya menghasilkan
`352 + 319 + 352 + 341 = 1.364` imported rows.

## Keputusan dan langkah berikutnya

- Mapping harian Januari–April dapat digunakan; seluruh review fallback telah
  disetujui secara manual.
- Allowlist fallback import telah diperluas secara eksplisit ke empat worksheet
  ini dan dry-run semuanya berstatus `READY_FOR_IMPORT`.
- Import aktual telah dijalankan setelah persetujuan manual dan diverifikasi
  melalui query read-only.
- Data placeholder `-` tetap `null`; tidak dibuat menjadi angka nol.
- Tidak ada perubahan pada PostgreSQL, Prisma schema, Google Sheets, API,
  authentication, atau source Laravel.

## Cara menjalankan ulang audit

Dari folder `energiprimer-next`:

```bash
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/audit-kpi-juni26.ts --worksheet=Januari26-BB
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/audit-kpi-juni26.ts --worksheet=Februari26-BB
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/audit-kpi-juni26.ts --worksheet=Maret26-BB
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/audit-kpi-juni26.ts --worksheet=April26-BB
```

Seluruh perintah di atas bersifat read-only dan tidak memiliki flag `--commit`.
