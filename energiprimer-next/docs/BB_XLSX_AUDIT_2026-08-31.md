# Audit Workbook BB Excel — 31 Agustus 2026

## Status

Status audit: **READ-ONLY COMPLETE**.

Audit dilakukan terhadap:

`excels/MONITORING EP - Juli26-BB.xlsx`

Tidak ada perubahan pada source code, Laravel, database, schema Prisma, Google Sheets, credential, atau file Excel.

## Inventory Workbook

| Item | Hasil |
| --- | ---: |
| Total worksheet workbook | 199 |
| Worksheet dengan nama mengandung `BB` | 65 |
| Worksheet yang memenuhi resolver sebelum perluasan alias (case-sensitive) | 21 |
| Worksheet BB-like di luar resolver aktif | 44 |
| Worksheet canonical | `Juli26-BB` |

Workbook merupakan salinan historis yang lebih luas daripada scope live Google Sheets Phase 13. Pada saat audit ini dibuat, resolver hanya menerima format persis:

```text
[Nama bulan Indonesia][2 digit tahun]-BB
```

Contoh valid: `Mei22-BB`, `Juni23-BB`, `Juli26-BB`.

Worksheet seperti `MEI24-BB`, `JUNI24-BB`, `Jan25-BB`, `JAN22 - BB`, `JULY24-BB`, dan nama bulan singkat lainnya saat itu belum masuk scope resolver karena perbedaan format nama. Catatan ini adalah baseline audit historis; resolver saat ini sudah menerima token alias yang disetujui secara case-insensitive, dengan prioritas satu worksheet per periode.

## Scope Dipilih: 2023 sampai Terbaru

Atas permintaan audit, scope dibatasi ke worksheet BB dengan tahun **2023 sampai periode terbaru yang tersedia** pada workbook. Periode terbaru yang ditemukan adalah **Juli 2026**; tidak ditemukan worksheet `Agustus26-BB` pada file ini.

| Kategori | Jumlah |
| --- | ---: |
| Seluruh worksheet BB tahun 2023–2026 | 43 |
| Sudah sesuai resolver aktif | 18 |
| Varian nama legacy | 25 |

18 worksheet yang sudah sesuai resolver adalah:

`Mei23-BB`, `Juni23-BB`, `Juli23-BB`, `Mei25-BB`, `Juni25-BB`, `Juli25-BB`, `Agustus25-BB`, `September25-BB`, `Oktober25-BB`, `November25-BB`, `Desember25-BB`, `Januari26-BB`, `Februari26-BB`, `Maret26-BB`, `April26-BB`, `Mei26-BB`, `Juni26-BB`, dan `Juli26-BB`.

25 worksheet lainnya dari 2023–2026 tersedia sebagai varian nama, antara lain penggunaan singkatan bulan (`Jan23-BB`, `Feb23-BB`, `Apr25-BB`), kapitalisasi berbeda (`MEI24-BB`, `JUNI24-BB`), nama bulan Inggris (`JULY24-BB`), atau format legacy lainnya. Data varian tersebut belum dipetakan otomatis.

Pembatasan tahun ini hanya mengubah scope audit/pemetaan yang direncanakan. Tidak ada data yang di-import dalam audit tersebut. Perluasan resolver alias dilakukan setelah audit ini melalui perubahan terpisah yang didokumentasikan di `WORKSHEET_NAME_RESOLUTION.md`.

## Canonical `Juli26-BB`

Struktur canonical ditemukan pada baris header 8–10 dengan domain utama:

- `STOK AWAL`;
- `PENERIMAAN`;
- konsumsi per Unit 1–3;
- `TOTAL`;
- `STOK AKHIR`;
- `HOP`;
- belt weigher/bucket;
- Biomassa;
- HSD/coal handling;
- KWH Green;
- NK BM dan NK BB.

Kolom penerimaan Biomassa yang sesuai dengan supplier canonical adalah:

1. Sawdust PT Syahroni;
2. Sawdust PT Bintang;
3. Woodchip PT Syahroni;
4. Woodchip PT RAP;
5. Woodchip CV Multi Paketindo;
6. LRUK;
7. SRF.

Kolom generic `Woodchip` dan `BONGGOL JAGUNG` tetap dipertahankan sebagai source field, tetapi tidak digabung otomatis ke tujuh supplier canonical.

## Canonical Parity Check

Daily block `Juli26-BB` berisi 31 hari dan menghasilkan:

| Metric | Nilai dari XLSX | Baseline aplikasi |
| --- | ---: | ---: |
| Penerimaan Biomassa 7 supplier | 3.223,46 ton | 3.223,46 ton |
| Pemakaian Biomassa Unit 1–3 | 3.740,65 ton | 3.740,65 ton |
| Pemakaian Batubara Unit 1–3 | 34.940,44 ton | 34.940,44 ton |

Hasil ini konsisten dengan baseline dashboard/database yang telah diverifikasi pada Phase 12–13. Copy XLSX dapat digunakan sebagai evidence canonical dan pembanding legacy.

## Bukti Perbedaan Schema

### Family A

Family A memiliki struktur yang sangat dekat dengan `Juli26-BB`. Header supplier tujuh canonical tersedia, tetapi tetap terdapat field tambahan generic dan block stock/KWH Green. Mapping dapat dijadikan kandidat berdasarkan semantic header, dengan review pada anomaly dan field unresolved.

### Family B

Contoh `Mei22-BB` memiliki posisi kolom yang berbeda dan hanya menampilkan agregat Biomassa pada beberapa block. Header supplier tujuh canonical tidak tersedia secara eksplisit. Copy XLSX menguatkan keputusan bahwa Family B tidak aman untuk auto-map tanpa profile bisnis/manual.

### Family C

Contoh `Mei23-BB`, `Juni23-BB`, dan `Juli23-BB` memakai supplier lama seperti `Woodchip PT Bhirawa`, `Woodchip PT BBM (BRIUK)`, dan `Sekam Padi`. Supplier tersebut belum terbukti ekuivalen dengan supplier canonical sehingga tidak boleh digabung otomatis.

## Date Findings

XLSX menyimpan tanggal sebagai Excel serial date. Pada beberapa worksheet, tanggal kolom `B` sudah mengalami rollover ke bulan berikutnya:

| Worksheet | Evidence XLSX | Interpretasi |
| --- | --- | --- |
| `Juni23-BB` | baris akhir daily block memiliki `2023-07-01`; kolom nomor berulang `28` | kemungkinan typo/rollover; tanggal yang dimaksud belum pasti |
| `September25-BB` | baris nomor `31` memiliki `2025-10-01` | kemungkinan tanggal 31 September yang di-rollover; tidak boleh dikoreksi otomatis |

Evidence ini membantu manual review, tetapi belum cukup untuk memilih apakah tanggal harus dipertahankan sebagai tanggal Excel, dikembalikan ke hari sumber, atau dikeluarkan dari import.

## Formula and Data Quality

Pada daily block `Juli26-BB` terdapat 27 cached formula error `#DIV/0!`:

| Kolom | Jumlah |
| --- | ---: |
| `U` | 5 |
| `X` | 20 |
| `AA` | 2 |

Error berada pada kolom persentase/rasio dan tidak mengubah total penerimaan atau konsumsi yang digunakan sebagai baseline. Nilai tersebut tidak boleh diubah menjadi nol secara otomatis.

Workbook Excel berisi hasil formula yang tersimpan/cache. Audit ini tidak memaksa recalculation Excel; nilai formula harus tetap diperlakukan sebagai source evidence, bukan perhitungan baru.

## Dampak terhadap Manual Review

Copy XLSX membantu mempersempit masalah berikut:

- schema Family B dan C dapat dibandingkan langsung terhadap header canonical;
- supplier legacy dapat dikatalogkan sebelum alias disetujui;
- row/cell evidence untuk anomaly tanggal tersedia;
- total canonical dapat dikalibrasi terhadap dashboard/database;
- generic `Woodchip`, `BONGGOL JAGUNG`, dan material legacy dapat dipisahkan dari tujuh supplier resmi.

Copy XLSX belum secara otomatis menyelesaikan:

- tanggal invalid atau rollover;
- duplicate dengan nilai berbeda;
- target historis versus target resmi 70.020 ton;
- keputusan persistensi `BIOMASS_STOCK`;
- perluasan scope 44 worksheet BB-like di luar resolver aktif.

## Keputusan yang Diperlukan

1. Apakah 44 worksheet BB-like lama akan dimasukkan ke scope migrasi?
2. Apakah supplier legacy tertentu dianggap alias resmi supplier canonical?
3. Bagaimana memperlakukan tanggal rollover pada `Juni23-BB` dan `September25-BB`?
4. Bagaimana memilih/menangani duplicate dan business key collision?
5. Apakah `BIOMASS_STOCK` tetap dikecualikan dari persistence?

## Kesimpulan

File XLSX valid dan dapat dibaca. Data canonical `Juli26-BB` konsisten dengan baseline aplikasi. File ini cukup untuk meningkatkan kualitas mapping dan evidence manual review, tetapi belum menjadi dasar untuk import otomatis seluruh worksheet.

Status rekomendasi: **READY FOR MAPPING REVIEW — NO IMPORT PERFORMED**.
