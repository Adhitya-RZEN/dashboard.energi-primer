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
