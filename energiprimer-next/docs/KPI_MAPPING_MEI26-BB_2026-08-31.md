# Mapping KPI Google Sheets — Mei26-BB

Tanggal audit: 31 Agustus 2026  
Status mapping: **PASS_WITH_REVIEW**  
Status perbandingan layout dengan `Juni26-BB`: **PASS**
Status controlled import: **SUCCESS** (`importRunId=8`)

## Ringkasan

Worksheet `Mei26-BB` berhasil dibaca langsung melalui Google Sheets API secara
read-only menggunakan range `A1:ZZ500`. Posisi header, kolom KPI, kolom unit,
kolom pemasok, baris total, dan penamaan canonical sama dengan `Juni26-BB`.

Perbedaan jumlah baris harian adalah perbedaan kalender yang diharapkan:
Mei memiliki 31 hari (`row 11–41`), sedangkan Juni memiliki 30 hari
(`row 11–40`). Baris total tetap berada pada `row 42` untuk kedua worksheet.

Setelah fallback legacy yang disetujui diterapkan secara terbatas hanya untuk
`Mei26-BB` dan `Juni26-BB`, dry-run Mei berstatus `READY_FOR_IMPORT` dan
controlled import berhasil. Import ini tidak menjalankan migrasi, `DROP`, atau
`DELETE`; hanya melakukan upsert pada tabel target existing untuk periode Mei.

## Hasil pembacaan dan struktur

| Item | `Mei26-BB` | Perbandingan dengan `Juni26-BB` |
| --- | --- | --- |
| Worksheet yang dibaca | `Mei26-BB` | Nama cocok case-insensitive |
| Periode | Mei 2026 | Sesuai pola worksheet |
| Range | `A1:ZZ500` | Sama |
| Raw rows | 147 | Sama |
| Scanned cells | 11.388 | Sama |
| Parser errors | Tidak ada | Sama |
| Header rows yang terdeteksi | 5, 8, 9, 10 | Sama |
| Kolom nomor hari | `A` | Sama |
| Kolom tanggal lengkap | `B` | Sama |
| Baris harian | 11–41 (31 baris) | Juni 11–40 (30 baris) |
| Baris total bulanan | 42 | Sama |

Kolom `A` berisi nomor hari (`1`–`31`) dan kolom `B` berisi tanggal lengkap,
misalnya `01 Mei 2026`. Parser diperbaiki untuk memprioritaskan tanggal lengkap
pada kolom ber-header `Tanggal`; hal ini mencegah kolom helper `Tgl` dipilih
secara keliru pada bulan yang hanya memiliki 30 hari.

## Mapping kolom utama

| Dataset | Kolom sumber Mei | Baris sumber | Mapping target |
| --- | --- | --- | --- |
| Tanggal | `B` | `B11:B41` | `date` / `reading_date` |
| Biomassa Unit 1 | `T` | `T11:T41`, total `T42` | Unit 1 |
| Biomassa Unit 2 | `W` | `W11:W41`, total `W42` | Unit 2 |
| Biomassa Unit 3 | `Z` | `Z11:Z41`, total `Z42` | Unit 3 |
| Batubara Unit 1 | `S` | `S11:S41` | Unit 1 |
| Batubara Unit 2 | `V` | `V11:V41` | Unit 2 |
| Batubara Unit 3 | `Y` | `Y11:Y41` | Unit 3 |
| Total batubara harian | `AB` | `AB11:AB41`, total `AB42` | Validasi/chart dan total konsumsi |
| Stok batubara | `AD` | `AD11:AD41` | `coal_stock` |
| HOP Unit 1 | `AL` | `AL11:AL41` | Unit 1 |
| HOP Unit 2 | `AK` | `AK11:AK41` | Unit 2 |
| HOP Unit 3 | `AJ` | `AJ11:AJ41` | Unit 3 |
| Pemakaian solar harian | `CJ` | `CJ11:CJ41`, total `CJ42` | `solar_consumptions` |
| Penerimaan solar bulanan | `CC42` | 42 | `solar_receipts` |
| Penerimaan batubara bulanan | `I42` | 42 | `coal_receipts` |

Urutan unit yang digunakan adalah **Unit 1, Unit 2, Unit 3**. Tidak ada
pergeseran unit yang ditemukan.

## Mapping pemasok biomassa

KPI `biomassReceiptMonthly` menggunakan tujuh pemasok resmi pada baris total
`42`. Kolom `O` (Woodchip tanpa pemasok jelas) dan `R` (Bonggol Jagung) tidak
termasuk.

| Cell | Nama pemasok | `supplier_code` | Nilai Mei (ton) |
| --- | --- | --- | ---: |
| `J42` | Sawdust PT Syahroni | `sawdust-pt-syahroni` | 652,36 |
| `K42` | Sawdust PT Bintang | `sawdust-pt-bintang` | 483,27 |
| `L42` | Woodchip PT Syahroni | `woodchip-pt-syahroni` | 2.217,95 |
| `M42` | Woodchip PT RAP | `woodchip-pt-rap` | 458,13 |
| `N42` | Woodchip CV Multi Paketindo | `woodchip-cv-multi-paketindo` | 914,56 |
| `P42` | LRUK | `lruk` | 9,17 |
| `Q42` | SRF | `srf` | 203,20 |
|  | **Total** |  | **4.938,64** |

Formula:

```text
SUM(J42, K42, L42, M42, N42, P42, Q42) = 4.938,64 ton
```

## Mapping KPI

| KPI | Sumber | Formula/transformation | Unit | Hasil Mei 2026 | Status |
| --- | --- | --- | --- | ---: | --- |
| `biomassReceiptMonthly` | `J42`, `K42`, `L42`, `M42`, `N42`, `P42`, `Q42` | Jumlah tujuh pemasok canonical | ton | 4.938,64 | RESOLVED |
| `biomassConsumptionMonthly` | `T42`, `W42`, `Z42`, validasi `AC42` | `SUM(T42, W42, Z42)` | ton | 4.348,38 | RESOLVED |
| `coalConsumptionMonthly` | `AB42`, validasi `SUM(AB11:AB41)` | Total konsumsi batubara bulanan | ton | 48.133,428 | RESOLVED_WITH_FALLBACK |
| `coalReceiptMonthly` | `I42` | Total penerimaan batubara bulanan | ton | 34.965,807 | RESOLVED_WITH_FALLBACK |
| `solarConsumptionMonthly` | `CJ42`, validasi `SUM(CJ11:CJ41)` | Total pemakaian solar bulanan | liter | 29.332 | RESOLVED_WITH_FALLBACK |
| `solarReceiptMonthly` | `CC42` | Total penerimaan solar bulanan | liter | 30.000 | RESOLVED_WITH_FALLBACK |
| `biomassTarget` | Tidak ada label `Target 2026` | Fallback resmi yang disepakati | ton | 70.020 | RESOLVED_WITH_FALLBACK |
| `biomassCumulative` | `TONASE BIOMASSA` → `TOTAL 2026` → `CO58` | Nilai total kumulatif pada tabel yang benar | ton | 22.036,49 | RESOLVED_WITH_FALLBACK |
| `biomassTargetProgress` | target + `CO58` | `MIN(100, cumulative / target × 100)` | % | 31,4717% | RESOLVED |

`CO56` tidak dipakai sebagai target karena pada layout ini merupakan nilai
kumulatif Unit 1 pada tabel `TONASE BIOMASSA`, bukan target tahunan.

## Validasi data harian

Pembacaan live menghasilkan 31 record harian dari `2026-05-01` sampai
`2026-05-31`.

| Validasi | Hasil source | Hasil pembanding | Match |
| --- | ---: | ---: | --- |
| Total tujuh pemasok biomassa | 4.938,64 | Aggregate parser 4.938,64 | Ya |
| Total biomassa harian Unit 1–3 | 819,28 + 1.543,00 + 1.986,10 = 4.348,38 | `AC42` = 4.348,38 | Ya |
| Total batubara harian | `SUM(AB11:AB41)` = 48.133,428 | `AB42` = 48.133,428 | Ya |
| Total solar harian | `SUM(CJ11:CJ41)` = 29.332 | `CJ42` = 29.332 | Ya |
| Progress target | 22.036,49 / 70.020 × 100 | Derived KPI = 31,4717% | Ya |

Coverage penting:

- Biomassa Unit 1: 28 numeric, 3 kosong, 0 malformed.
- Biomassa Unit 2: 31 numeric, 0 kosong, 0 malformed.
- Biomassa Unit 3: 31 numeric, 0 kosong, 0 malformed.
- Batubara Unit 1–3: masing-masing 31 numeric.
- Total batubara, stok, HOP Unit 1–3, dan solar: masing-masing 31 numeric.

Sel kosong pada sumber tetap dipertahankan sebagai `null`, bukan diubah menjadi
nol.

## Status parser dan import

Perbandingan structural read-only `Mei26-BB` terhadap `Juni26-BB` berstatus
**PASS**:

- seluruh header/label canonical dan kolom yang dibandingkan sama;
- header rows sama;
- kolom tanggal sama (`B`);
- nama dan kode tujuh pemasok sama;
- posisi sel summary sama;
- anchor kumulatif sama;
- perbedaan nilai supplier hanya mencerminkan periode Mei dan Juni yang berbeda;
- perbedaan jumlah baris harian hanya akibat jumlah hari kalender.

Pada audit awal, rencana import generik berstatus `NEEDS_REVIEW` karena
beberapa field legacy (penerimaan batubara, penerimaan solar, kumulatif)
memerlukan fallback. Setelah persetujuan fallback exact worksheet dan dry-run
ulang, rencana `Mei26-BB` berstatus `READY_FOR_IMPORT`, kemudian berhasil
diimport sebagai run `8`. Fallback fisik yang digunakan hanya:

- penerimaan batubara: `I42`;
- penerimaan solar: `CC42`;
- kumulatif biomassa: `CO58`;
- target biomassa: fallback resmi `70.020` karena label target tahunan tidak
  ditemukan pada worksheet.

### Hasil controlled import dan verifikasi database

| Check | Hasil |
| --- | --- |
| Import run | `8` |
| Worksheet efektif | `Mei26-BB` |
| Periode | `2026-05-01` |
| Baris staging/imported | `352` |
| Baris rejected | `0` |
| Invalid staging rows | `0` |
| Status database | `SUCCESS` |
| Perubahan schema | Tidak ada |
| Operasi destructive | Tidak ada |

Entity yang tersimpan: 7 receipt biomassa, 93 konsumsi biomassa, 1 receipt
batubara, 93 konsumsi batubara, 31 stok batubara, 1 receipt solar, 31
konsumsi solar, 93 HOP, 1 target, dan 1 snapshot kumulatif.

Verifikasi read-only `db:verify-kpi:mei` berstatus **PASS**. Nilai KPI yang
terbaca dari database:

| KPI | Nilai database |
| --- | ---: |
| Penerimaan biomassa | `4.938,64 ton` |
| Pemakaian biomassa | `4.348,38 ton` |
| Penerimaan batubara | `34.965,807 ton` |
| Pemakaian batubara sumber | `48.133,428 ton` |
| Pemakaian batubara tersimpan | `48.133,45 ton` |
| Penerimaan solar | `30.000 liter` |
| Pemakaian solar | `29.332 liter` |
| Target biomassa | `70.020 ton` |
| Kumulatif biomassa | `22.036,49 ton` |
| Progress target | `31,4717%` |

Perbedaan `0,022 ton` antara pemakaian batubara sumber dan aggregate database
merupakan efek pembulatan per baris ke `DECIMAL(12,2)` pada tabel existing, bukan
perubahan formula atau data source. Unit yang diverifikasi adalah Unit 1, Unit
2, dan Unit 3; setiap dataset harian memiliki 31 tanggal Mei.

## Perubahan teknis yang aman

- Parser tanggal sekarang memprioritaskan kolom ber-header `Tanggal` jika
  terdapat nilai tanggal lengkap.
- Ditambahkan regression test untuk kasus kolom helper `Tgl` berisi 1–31 dan
  kolom `Tanggal` berisi tanggal lengkap.
- Ditambahkan audit perbandingan layout live Mei–Juni.
- Tidak ada perubahan schema Prisma, API, authentication, Google Sheet, atau
  data sumber.
- Controlled import hanya melakukan upsert data Mei ke tabel existing melalui
  transaksi; tidak ada migrasi, `DROP`, atau penghapusan data.
- Verifikasi pasca-import hanya membaca database dan tidak melakukan write.

## Cara menjalankan ulang

Dari folder `energiprimer-next`:

```bash
npm run kpi:map:mei
npm run kpi:compare:mei-juni
npm run dynamic:verify
npm run db:verify-kpi:mei
```

Perintah mapping, perbandingan, parser, dan verifikasi melakukan pembacaan saja.
Import dilakukan sebelumnya melalui dry-run yang berstatus
`READY_FOR_IMPORT`, kemudian command import terkontrol dengan flag `--commit`.
Jangan menjalankan import ulang tanpa dry-run dan review periode yang sesuai.
