# Controlled Import `Januari26-BB` sampai `April26-BB`

Tanggal: 31 Agustus 2026  
Mode: import terkontrol setelah persetujuan manual  
Sumber: Google Sheets, range `A1:ZZ500`  
Status: **PASS**

## Scope dan keamanan

Import dilakukan satu per satu untuk worksheet yang sudah diverifikasi:

- `Januari26-BB`
- `Februari26-BB`
- `Maret26-BB`
- `April26-BB`

Guard import hanya mengizinkan database lokal `dashboard_pln`. Tidak ada
`prisma migrate`, `prisma db push`, perubahan schema, `DROP`, `DELETE`, atau
perubahan pada source Laravel.

## Hasil import

| Worksheet | Periode | Import run | Rows tervalidasi | Rejected | Status |
| --- | --- | ---: | ---: | ---: | --- |
| `Januari26-BB` | 2026-01-01 | 9 | 352 | 0 | `SUCCESS` |
| `Februari26-BB` | 2026-02-01 | 10 | 319 | 0 | `SUCCESS` |
| `Maret26-BB` | 2026-03-01 | 11 | 352 | 0 | `SUCCESS` |
| `April26-BB` | 2026-04-01 | 12 | 341 | 0 | `SUCCESS` |

Total rows tervalidasi: **1.364**.

## KPI yang diverifikasi

| Worksheet | Biomassa receipt | Biomassa consumption | Batubara receipt | Batubara consumption di DB | Solar receipt | Solar consumption | Kumulatif biomassa |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Januari26-BB` | 4.241,38 ton | 3.489,20 ton | 15.187,724 ton | 45.280,610 ton | 30.000 liter | 31.973 liter | 3.489,20 ton |
| `Februari26-BB` | 3.591,67 ton | 3.290,28 ton | 30.212,086 ton | 35.005,280 ton | 30.000 liter | 28.453 liter | 6.779,48 ton |
| `Maret26-BB` | 5.048,90 ton | 5.636,81 ton | 50.459,229 ton | 38.462,960 ton | 35.000 liter | 33.472 liter | 12.416,29 ton |
| `April26-BB` | 5.380,46 ton | 5.271,82 ton | 50.193,257 ton | 45.682,330 ton | 25.000 liter | 27.122 liter | 17.688,11 ton |

Target biomassa tersimpan sebagai **70.020 ton**. Snapshot kumulatif berasal
dari `CO58`. Supplier biomassa menggunakan tujuh kode resmi; pada Januari–April
`Woodchip CV Multi Paketindo` dipetakan dari `O42` berdasarkan label, bukan
dengan mengasumsikan posisi kolom yang sama seperti Mei/Juni.

## Coverage dan unit

- Biomassa consumption: 93, 84, 93, dan 90 rows untuk Januari–April.
- Batubara consumption: 93, 84, 93, dan 90 rows.
- Coal stock: 31, 28, 31, dan 30 rows.
- Solar consumption: 31, 28, 31, dan 30 rows.
- HOP: 93, 84, 93, dan 90 rows.
- Unit database: `Unit 1`, `Unit 2`, `Unit 3` dengan code `PLTU-1`, `PLTU-2`,
  `PLTU-3`.
- Placeholder `-` tetap dipertahankan sebagai nilai kosong/null sesuai mapping.

## Catatan presisi batubara

Sumber Google Sheets memiliki nilai batubara tiga angka desimal, sedangkan
tabel `coal_consumption` existing menyimpan dua angka desimal. Import mengikuti
batas penyimpanan existing per baris. Akibatnya agregat DB menjadi sedikit
berbeda dari agregat raw source, misalnya Januari `45.280,543` dari source
menjadi `45.280,610` di DB. Ini adalah perbedaan presisi storage, bukan perubahan
formula bisnis atau schema.

## Verifikasi

Verifikasi pasca-import dilakukan read-only dan menghasilkan:

- semua import run `SUCCESS`;
- semua `rejectedRows` bernilai `0`;
- staging rows sama dengan rows tervalidasi pada setiap run;
- tujuh supplier biomassa tersedia pada setiap periode;
- cumulative snapshot terhubung ke import run dan source cell `CO58`;
- target 2026 bernilai `70.020` ton;
- seluruh row date berada pada bulan masing-masing.

Perintah import yang digunakan memiliki flag `--commit` eksplisit dan dijalankan
satu per satu melalui script `sheets:import`. Dokumen mapping awal tetap berada
di [KPI_MAPPING_JAN-APR26-BB_2026-08-31.md](./KPI_MAPPING_JAN-APR26-BB_2026-08-31.md).
