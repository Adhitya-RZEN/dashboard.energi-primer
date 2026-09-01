# Full Database Migration Plan

Status dokumen: **LOCAL MIGRATION PASS — PRODUCTION DEPLOYMENT NOT EXECUTED**  
Scope: migrasi source data dashboard dari pembacaan langsung Google Sheets menjadi PostgreSQL melalui importer server-side.

**Current execution status:** schema additive, staging, transactional commit, parity lokal, dan dashboard cutover code path sudah dijalankan terhadap database lokal. Import yang tervalidasi saat ini mencakup Juli 2026. Import periode berikutnya dan deployment production belum dijalankan.

**Authoritative implementation note:** target source database sekarang mencakup `biomass_receipts`, `biomass_consumptions`, `coal_receipts`, `coal_consumption`, `coal_stock`, `solar_receipts`, `solar_consumptions`, `hop_readings`, `biomass_targets`, dan `biomass_cumulative_snapshots`. Identitas unit adalah Unit 1, Unit 2, dan Unit 3. `DASHBOARD_DATA_SOURCE=google` hanya dipertahankan sebagai rollback path eksplisit.

Dokumen ini semula dibuat sebagai rencana sebelum perubahan schema; bagian status eksekusi
di atas dan report eksekusi menjadi catatan authoritative terbaru. Laravel tetap menjadi
source/reference read-only.

Hasil eksekusi tersedia pada [`DATABASE_MIGRATION_EXECUTION_2026-08-30.md`](./DATABASE_MIGRATION_EXECUTION_2026-08-30.md). Tahap schema additive, staging, commit, dan code cutover sudah dijalankan secara lokal.

## 1. Keputusan arsitektur

Arsitektur yang disetujui:

```text
Google Sheets
    ↓
Server-side importer
    ↓
Dynamic semantic parser
    ↓
Validation + staging
    ↓
PostgreSQL normalized tables
    ↓
Prisma data services
    ↓
Next.js dashboard
```

Google Sheets tetap menjadi sumber input operasional. Setelah cutover berhasil, halaman dashboard hanya membaca PostgreSQL. Credential Google tetap dibutuhkan oleh importer dan tidak boleh dikirim ke browser.

Jika yang dimaksud adalah menghapus Google Sheets sepenuhnya, dibutuhkan mekanisme input data/admin baru. Itu merupakan scope berbeda dan tidak termasuk rencana ini.

## 2. Kondisi saat ini

- Overview dan dashboard detail default memakai PostgreSQL normalized hasil import.
- Google Sheets tetap menjadi sumber input importer dan rollback path eksplisit melalui `DASHBOARD_DATA_SOURCE=google`.
- PostgreSQL sudah memiliki padanan untuk penerimaan/pemakaian Biomassa, Solar, HOP, receipt coal, stock, dan target Biomassa yang tervalidasi.
- `kpi_targets` berisi target SFC/heat rate per unit/tanggal. Tabel tersebut tidak digunakan untuk target Biomassa tahunan.
- Parser semantic saat ini mengenali tujuh supplier Biomassa berikut:
  `Sawdust PT Syahroni`, `Sawdust PT Bintang`, `Woodchip PT Syahroni`,
  `Woodchip PT RAP`, `Woodchip CV Multi Paketindo`, `LRUK`, dan `SRF`.
- Target `70020` sudah menjadi record resmi pada `biomass_targets` untuk tahun 2026.

## 3. Target Biomassa resmi

Untuk tahun 2026, target yang digunakan:

| Field | Nilai |
|---|---:|
| Tahun | 2026 |
| Target internal | `70020` |
| Target tampilan | `70.020 ton` |
| Satuan | ton |
| Status | target resmi, tervalidasi dan terimport pada database lokal |

Formula existing dipertahankan:

```text
progress = min(100, cumulative / 70020 × 100)
sisa = max(0, 70020 - cumulative)
```

Target direkomendasikan disimpan pada tabel `biomass_targets` dengan kunci tahun. Nilai dari worksheet tetap dibandingkan terhadap target resmi. Perbedaan nilai menghasilkan `NEEDS REVIEW`; importer tidak boleh menimpa target secara diam-diam.

## 4. Mapping data yang direncanakan

Nama tabel dan kolom berikut adalah schema additive yang sudah diterapkan pada database lokal.

| Sumber semantic | Target database yang direncanakan | Grain |
|---|---|---|
| Penerimaan Biomassa tujuh supplier | `biomass_receipts` | tanggal + supplier |
| Pemakaian Biomassa Unit 1–3 | `biomass_consumptions` | tanggal + unit |
| Penerimaan Solar | `solar_receipts` | tanggal atau periode sesuai source |
| Pemakaian Solar | `solar_consumptions` | tanggal atau unit sesuai source |
| HOP Unit 1–3 | `hop_readings` | tanggal + unit |
| Target Biomassa | `biomass_targets` | tahun |
| Satu proses import | `spreadsheet_import_runs` | satu run |
| Baris mentah/hasil validasi | staging import | satu source row/field |

Tabel existing seperti `units`, `coal_consumption`, `coal_stock`, `coal_quality`, dan `power_generation` dipertahankan. Tabel `kpi_targets` tidak direpurpose.

## 5. Tahapan eksekusi

### Tahap A — Baseline read-only

1. Snapshot metadata schema dan jumlah data tanpa mengubah database.
2. Baca worksheet periode yang dipilih.
3. Simpan hasil baseline KPI secara lokal sebagai artefak test, tanpa credential.
4. Tetapkan tolerance perbandingan dan aturan pembulatan.

Output: baseline dan mapping yang dapat direview.

### Tahap B — Data contract

1. Verifikasi header, supplier, unit, tanggal, range, dan tipe angka.
2. Tetapkan perbedaan `NULL` dan `0`.
3. Tetapkan timezone dan aturan periode.
4. Tetapkan natural key dan kebijakan overwrite.
5. Tetapkan aturan target 2026 = `70020` ton.

Output: data contract yang disetujui.

### Tahap C — Additive schema review

1. Membuat rancangan Prisma model tambahan.
2. Membuat migration additive hanya setelah persetujuan manual.
3. Tidak mengubah atau menghapus tabel existing.
4. Menjalankan validasi schema tanpa `db push` atau migration destructive.

Output: schema siap staging.

Persetujuan user untuk database lokal sudah diberikan dan migration additive sudah diterapkan.
Production schema tetap memerlukan persetujuan operasional terpisah.

### Tahap D — Importer dry-run

1. Membaca Google Sheets secara server-side.
2. Menjalankan parser semantic yang sudah ada.
3. Normalisasi nilai ke tipe database.
4. Menampilkan preview jumlah baris, agregat, error, dan warning.
5. Tidak melakukan `INSERT`, `UPDATE`, atau `DELETE`.

Output: laporan dry-run `READY` atau `NEEDS REVIEW`.

### Tahap E — Staging import

1. Menyimpan source metadata dan hasil validasi ke staging.
2. Menolak baris invalid dari tabel operasional.
3. Menyimpan error per row/field secara aman.
4. Menandai import sebagai `SUCCESS`, `PARTIAL`, atau `FAILED`.

Staging lokal sudah ditulis secara transaksional setelah dry-run lulus. Production staging
belum dijalankan.

### Tahap F — Transactional commit

1. Memastikan preview disetujui.
2. Melakukan upsert berdasarkan natural key.
3. Menjalankan seluruh batch dalam transaksi.
4. Rollback bila ada kegagalan yang melanggar aturan.
5. Mencatat import run dan checksum/source metadata.

Commit lokal sudah dijalankan melalui upsert idempotent. Commit production belum dijalankan.

### Tahap G — Parity validation

Bandingkan Google Sheets dan PostgreSQL untuk periode yang sama:

- penerimaan Biomassa tujuh supplier;
- pemakaian Biomassa bulanan dan harian;
- pemakaian per unit;
- target `70020` ton;
- cumulative dan progress;
- Solar dan HOP;
- filter bulan, tahun, dan tanggal.

Dashboard belum dipindahkan ke PostgreSQL sebelum parity lulus.

### Tahap H — Dashboard cutover

1. Menambahkan pemilihan source yang dapat dikontrol melalui konfigurasi server.
2. Menjadikan Prisma/database service sebagai source dashboard.
3. Mempertahankan route, UI, auth, API contract, dan kalkulasi existing.
4. Menyediakan fallback operasional yang terdokumentasi selama masa validasi.

Perubahan source lokal sudah dilakukan setelah parity Juli 2026 lulus. Rollback ke Google
tetap tersedia melalui konfigurasi eksplisit.

### Tahap I — Scheduling dan observability

Setelah import manual stabil:

- jadwal import berkala;
- status import terakhir;
- freshness indicator;
- retry terbatas;
- notifikasi kegagalan;
- audit trail.

Pilihan Vercel Cron atau worker eksternal diputuskan setelah kebutuhan runtime dikonfirmasi.

## 6. Natural key dan idempotensi

Desain awal:

```text
biomass receipt  = period + date + supplier
biomass usage    = period + date + unit
solar reading    = period + date + unit/type
hop reading      = period + date + unit
biomass target   = year
```

Import worksheet yang sama dua kali harus menghasilkan nilai database yang sama, bukan baris duplikat. Natural key final wajib direview jika source memiliki grain berbeda.

## 7. Risiko utama dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Google Sheets dan PostgreSQL berbeda | Dry-run, baseline, dual-read, dan parity gate sebelum cutover |
| Header/supplier berubah | Semantic schema validation; hentikan import jika field wajib hilang |
| Import ganda | Natural key, upsert idempotent, checksum, dan import run |
| Data malformed/kosong | Staging, error per baris, dan larangan commit data invalid |
| Target tidak konsisten | `biomass_targets` sebagai source target; 2026 = `70020`; mismatch menjadi `NEEDS REVIEW` |
| Partial write | Transaksi atomik dan rollback |
| Data stale | Freshness timestamp, status import, retry dan alert |
| Rounding/timezone berbeda | Simpan Decimal, tetapkan timezone, tolerance dan aturan pembulatan |
| Koneksi serverless berlebih | Pooler PostgreSQL, batas koneksi, timeout, dan preview load test |
| Credential Google bocor | Server-only importer dan secret environment tanpa `NEXT_PUBLIC_` |
| Perubahan tidak dapat dilacak | Simpan import run, worksheet, range, checksum, dan source cell |
| Rollback sulit | Jangan overwrite tanpa jejak; pertahankan import version dan feature source switch |

## 8. Batas keamanan

Tidak boleh dilakukan:

- mengubah project Laravel;
- membuat database baru tanpa persetujuan;
- `DROP TABLE` atau destructive alter;
- `prisma migrate` terhadap production tanpa persetujuan eksplisit;
- `prisma db push` terhadap database existing;
- `INSERT`, `UPDATE`, atau `DELETE` pada database production tanpa persetujuan eksplisit;
- mengubah user/password/authentication production;
- membuat credential palsu atau mencetak secret;
- menaruh Google credential, password hash, token, atau `DATABASE_URL` di client;
- mengubah business logic hanya untuk menyesuaikan hasil import.

## 9. Persetujuan manual yang masih diperlukan

Item berikut belum dilakukan otomatis:

1. Import periode berikutnya dan penjadwalan sinkronisasi production.
2. Penentuan kebijakan overwrite dan tolerance parity production.
3. Konfigurasi scheduler, connection pooler, SSL, dan freshness monitoring production.
4. Keputusan menerima precision legacy coal dua desimal atau melakukan perubahan schema; perubahan schema membutuhkan review terpisah.
5. Deployment dan konfigurasi environment Vercel.

## 10. Rollback

Rollback teknis dilakukan dengan cara:

- membatalkan transaksi yang gagal;
- tidak menghapus data historis secara otomatis;
- mengembalikan konfigurasi dashboard ke Google Sheets selama masa dual-read;
- menonaktifkan import scheduler jika berulang kali gagal;
- menggunakan import run/audit trail untuk investigasi.

Rollback tidak dilakukan dengan `git reset`, penghapusan tabel, atau penghapusan data production.

## 11. Status

Status saat ini: **LOCAL MIGRATION PASS - PRODUCTION DEPLOYMENT NOT EXECUTED**. Pernyataan status pre-approval di bawah dipertahankan sebagai catatan historis rencana, bukan status eksekusi terbaru.

**LOCAL DATABASE MIGRATION, IMPORT, PARITY, DAN CUTOVER PASS**

Schema additive dan record import database lokal sudah berubah melalui prosedur yang tercatat.
Source Laravel, credential, dan konfigurasi production tidak diubah melalui dokumen ini.
