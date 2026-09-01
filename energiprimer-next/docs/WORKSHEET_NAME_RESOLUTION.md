# Worksheet Name Resolution

## Tujuan

Resolver Google Sheets BB sekarang menerima dua bentuk penamaan periode yang digunakan oleh workbook legacy:

- nama bulan lengkap, misalnya `Januari26-BB`;
- nama bulan singkat, misalnya `Jan26-BB`.

Pencocokan tidak sensitif terhadap huruf besar/kecil. Variasi spasi di sekitar tahun dan tanda hubung juga diterima selama token bulan dan tahun tetap valid.

## Aturan pencocokan

Resolver tidak menebak nama berdasarkan prefix bebas. Token bulan yang diterima ditentukan secara eksplisit:

| Bulan | Token yang diterima |
| --- | --- |
| Januari | `Januari`, `Jan` |
| Februari | `Februari`, `Feb` |
| Maret | `Maret`, `Mar` |
| April | `April`, `Apr` |
| Mei | `Mei` |
| Juni | `Juni`, `Jun` |
| Juli | `Juli`, `Jul`, `July` |
| Agustus | `Agustus`, `Agus`, `Agust`, `Agu` |
| September | `September`, `Sep`, `Sept` |
| Oktober | `Oktober`, `Okt`, `Oct` |
| November | `November`, `Nov` |
| Desember | `Desember`, `Des` |

Contoh yang diterima:

```text
Januari26-BB
Jan26-BB
JANUARI26-bb
jAn26 - bb
```

Contoh yang tidak diterima:

```text
Januari26-DTS
Flyash-Okt
Januari-BB
Jan26
```

## Prioritas jika kedua bentuk ditemukan

Discovery Google Sheets dapat mendaftarkan dua tab berbeda untuk periode yang sama. Pada tahap seleksi read/sync, tab tidak diproses ganda. Prioritasnya adalah:

1. ejaan kanonik bulan lengkap dengan kapitalisasi standar, misalnya `Januari26-BB`;
2. ejaan bulan lengkap yang berbeda kapitalisasi atau spasi;
3. alias bulan singkat, misalnya `Jan26-BB`.

Jika tab lengkap tidak ada, alias yang ditemukan dipakai dengan judul aktualnya. `worksheetKey` Google Sheets tetap menjadi identitas tab; resolver ini hanya menentukan satu kandidat periode untuk pembacaan atau import.

## Lokasi implementasi

- `src/services/google-sheets/dynamic/worksheet-resolver.ts`: parsing, alias, pencocokan, dan prioritas;
- `src/services/google-sheets/dynamic/reader.ts`: discovery metadata dan pemilihan alias untuk read/fallback;
- `src/services/google-sheets/sync/engine.ts`: deduplikasi satu worksheet per periode sebelum sinkronisasi.

`parseBBWorksheetName` tetap pure dan tidak membaca database atau kredensial. `reader.ts` tetap server-side. Tidak ada perubahan schema PostgreSQL/Prisma dan tidak ada proses import yang dijalankan oleh perubahan ini.

## Perilaku sinkronisasi

- `scope: "all"`: satu tab terpilih per periode BB yang valid;
- `scope: "current"`: periode bulan/tahun saat ini dipilih setelah alias resolution;
- `worksheetTitle`: untuk judul BB, pencarian berdasarkan periode dan aturan prioritas yang sama; untuk judul non-BB, pencocokan dilakukan case-insensitive terhadap judul terdaftar;
- `worksheetKey`: tetap memilih tab berdasarkan stable Google Sheets sheet ID.

Dengan demikian, jika `Januari26-BB` dan `Jan26-BB` sama-sama tersedia, hanya satu yang diproses. Jika hanya `Jan26-BB` tersedia, data dibaca/di-import dari `Jan26-BB`.

## Verifikasi

Static regression mencakup:

- bentuk lengkap dan singkat;
- kapitalisasi campuran;
- spasi di sekitar separator;
- prioritas nama lengkap ketika dua bentuk tersedia;
- fallback periode menggunakan alias yang ditemukan;
- penolakan worksheet non-BB.

Command:

```text
npm run dynamic:verify
```

Command tersebut hanya menjalankan parser fixture dan tidak menulis ke Google Sheets maupun PostgreSQL. Live sync/import tetap memerlukan konfigurasi environment dan keputusan operasional terpisah.

## Status

Implemented and statically verified. Tidak ada database write, schema change, atau perubahan Laravel pada implementasi ini.
