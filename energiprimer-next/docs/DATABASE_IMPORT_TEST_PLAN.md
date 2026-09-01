# Database Import Test Plan

Status: **SAFE TESTS AND LOCAL WRITE TESTS EXECUTED — PRODUCTION WRITE NOT EXECUTED**  
Referensi utama: [`FULL_DATABASE_MIGRATION_PLAN.md`](./FULL_DATABASE_MIGRATION_PLAN.md)

**Current execution update (2026-08-30):** persetujuan user untuk perubahan additive
database lokal sudah diterapkan. Migration, staging, transactional import, idempotency,
parity, dan dashboard PostgreSQL sudah lulus untuk Juli 2026. Database production dan
deployment belum disentuh.

Test dijalankan bertahap. Dry-run dan unit test tidak boleh menulis database production. Integration test yang membutuhkan write harus menggunakan database staging/isolated yang telah disetujui.

## 1. Test safety dan baseline

| ID | Test | Metode | Expected result |
|---|---|---|---|
| SAFE-001 | Audit schema awal | Read-only introspection | Schema dan jumlah tabel tercatat; tidak ada perubahan |
| SAFE-002 | Audit row count | Query `COUNT` read-only | Jumlah data baseline tersimpan |
| SAFE-003 | Dry-run write guard | Jalankan importer mode dry-run | Tidak ada `INSERT`, `UPDATE`, atau `DELETE` |
| SAFE-004 | Credential redaction | Periksa output/log/artefak | Secret, private key, token, dan URL lengkap tidak muncul |
| SAFE-005 | Laravel immutability | Bandingkan checksum/status source | Tidak ada file Laravel berubah |

## 2. Test Google Sheets dan parser

| ID | Test | Expected result |
|---|---|---|
| PARSE-001 | Worksheet valid dapat dibaca | Range berhasil diproses |
| PARSE-002 | Worksheet tidak tersedia | Status aman `SOURCE_NOT_FOUND`; tidak ada write |
| PARSE-003 | Permission Google ditolak | Status `PERMISSION_ERROR`; detail credential tidak keluar |
| PARSE-004 | Google API rate limit | Status `RATE_LIMITED`; retry terbatas |
| PARSE-005 | API timeout/5xx | Status `API_ERROR`; tidak ada partial commit |
| PARSE-006 | Tujuh supplier lengkap | 7/7 supplier terdeteksi |
| PARSE-007 | Supplier wajib hilang | Import `NEEDS REVIEW` |
| PARSE-008 | Header memiliki whitespace/variasi aman | Alias semantic terpetakan sesuai aturan |
| PARSE-009 | Kolom kosong | Tidak dihitung sebagai angka |
| PARSE-010 | Nilai nol | Dipertahankan sebagai `0`, bukan `NULL` |
| PARSE-011 | Angka desimal koma/titik | Normalisasi menghasilkan nilai yang benar |
| PARSE-012 | Baris tanggal invalid | Baris ditolak dan tercatat |
| PARSE-013 | Unit tidak dikenal | Baris tidak masuk tabel operasional |
| PARSE-014 | Baris duplikat | Terdeteksi sebelum commit |
| PARSE-015 | Seluruh dataset kosong | Empty result yang aman; bukan dummy data |

## 3. Test target Biomassa

| ID | Test | Expected result |
|---|---|---|
| TARGET-001 | Target 2026 bernilai `70020` | Diterima sebagai 70020 ton |
| TARGET-002 | Tampilan target | Ditampilkan sebagai `70.020 ton` |
| TARGET-003 | Target Google sama dengan 70020 | Import dapat lanjut |
| TARGET-004 | Target Google berbeda | Status `NEEDS REVIEW`, tidak overwrite otomatis |
| TARGET-005 | Target kosong | Mengikuti kebijakan target resmi; tidak memakai angka acak |
| TARGET-006 | Cumulative valid | Nilai disimpan dengan precision yang sesuai |
| TARGET-007 | Formula progress | `min(100, cumulative / 70020 × 100)` |
| TARGET-008 | Cumulative melebihi target | Progress maksimum 100%; sisa minimum 0 |

## 4. Test staging dan database

| ID | Test | Expected result |
|---|---|---|
| DB-001 | Mapping supplier | Setiap supplier masuk dengan identity stabil |
| DB-002 | Mapping unit | Unit 1–3 terhubung ke unit database yang benar |
| DB-003 | Mapping tanggal | Tanggal tidak bergeser karena timezone |
| DB-004 | Mapping `NULL` | Nilai kosong tetap NULL sesuai kontrak |
| DB-005 | Mapping Decimal | Tidak terjadi pembulatan prematur |
| DB-006 | Natural key | Kombinasi key menolak duplikasi |
| DB-007 | Import pertama | Data staging/operasional sesuai preview |
| DB-008 | Import ulang worksheet sama | Tidak menambah duplikasi dan hasil tetap sama |
| DB-009 | Import batch gagal | Transaksi rollback seluruh batch |
| DB-010 | Baris invalid | Tidak masuk tabel operasional; error report tersedia |
| DB-011 | Import log | Status, row count, worksheet, dan waktu tercatat |
| DB-012 | Referential integrity | Tidak ada orphan unit/reference |

## 5. Test data parity

Untuk satu periode yang sama, bandingkan Google Sheets dengan PostgreSQL:

| ID | Data | Expected result |
|---|---|---|
| PARITY-001 | Receipt Biomassa tujuh supplier | Total sama dalam tolerance yang disetujui |
| PARITY-002 | Consumption Biomassa bulanan | Nilai sama |
| PARITY-003 | Consumption Biomassa harian | Nilai per tanggal sama |
| PARITY-004 | Consumption per unit | Unit 1–3 sama |
| PARITY-005 | Target Biomassa | 70020 ton |
| PARITY-006 | Cumulative | Nilai sama atau perbedaan terdokumentasi |
| PARITY-007 | Progress | Formula dan hasil sama |
| PARITY-008 | Solar | Nilai dan satuan sama |
| PARITY-009 | HOP | Nilai/status Unit 1–3 sama |
| PARITY-010 | Filter bulan/tahun | Dataset periode sama |
| PARITY-011 | Filter tanggal | Fokus tanggal sama |
| PARITY-012 | Missing period | Empty/fallback state sesuai kebijakan, bukan dummy |

## 6. Test dashboard regression

| ID | Test | Expected result |
|---|---|---|
| UI-001 | Overview dari PostgreSQL | KPI yang sudah dimigrasikan tampil |
| UI-002 | Halaman Biomassa | KPI, chart, filter, loading, dan error tetap bekerja |
| UI-003 | Halaman Batubara | Tidak ada regresi pada data existing |
| UI-004 | Halaman Solar/Stok/Target | Data unavailable ditampilkan aman jika belum dimigrasikan |
| UI-005 | Chart | Chart menggunakan data database tanpa fetch Google dari client |
| UI-006 | Route/query state | URL filter dan deep-link tetap bekerja |
| UI-007 | Authentication | Protected route tetap protected |
| UI-008 | Authorization | Import hanya dapat dipanggil oleh role yang diizinkan |
| UI-009 | Empty state | Dataset kosong tidak menghasilkan angka palsu |
| UI-010 | Error state | Error generik di client, detail terbatas di server |

## 7. Test security boundary

| ID | Test | Expected result |
|---|---|---|
| SEC-001 | Importer diimpor dari Client Component | Tidak diperbolehkan oleh server-only boundary |
| SEC-002 | Prisma di client bundle | Tidak ditemukan pada client chunk |
| SEC-003 | Google credential di client bundle | Tidak ditemukan |
| SEC-004 | Password/hash/token di response | Tidak ada field sensitif |
| SEC-005 | Request tanpa auth | Ditolak sebelum import/query protected |
| SEC-006 | Request role tidak sesuai | Ditolak server-side |
| SEC-007 | Error Google/database | Tidak membocorkan credential/path/stack sensitif |
| SEC-008 | Log inspection | Tidak ada password, token, private key, atau URL credential lengkap |

## 8. Test performance dan operasional

| ID | Test | Expected result |
|---|---|---|
| OPS-001 | Duplicate import request | Tidak membuat data ganda |
| OPS-002 | Concurrent import | Salah satu run dikontrol/ditolak sesuai lock policy |
| OPS-003 | Large worksheet | Memory dan timeout tetap dalam batas |
| OPS-004 | Database connection | Tidak membuat Prisma client berulang tanpa kebutuhan |
| OPS-005 | Freshness | Dashboard dapat menunjukkan import terakhir |
| OPS-006 | Retry | Retry tidak menggandakan data |
| OPS-007 | Failed run | Status gagal dan alasan aman tersedia |
| OPS-008 | Source rollback | Dashboard dapat kembali ke Google Sheets tanpa perubahan schema |

## 9. Build dan regression gate

Perintah yang dijalankan setelah perubahan code yang aman:

```text
npm run lint
npx tsc --noEmit
npm run build
```

Jika test script tersedia, jalankan test yang memang ada. Jangan membuat test palsu hanya untuk mendapatkan status PASS.

Acceptance gate:

- seluruh test safety lulus;
- parser dan dry-run lulus;
- target 2026 = `70020` tervalidasi;
- parity KPI lulus;
- tidak ada secret exposure;
- lint, TypeScript, dan build lulus;
- schema/database production tidak berubah tanpa persetujuan;
- tidak ada regression auth, route, API, atau Google integration.

## 10. Status test

Safe tests sudah dijalankan dan hasil detailnya tersedia pada [`DATABASE_MIGRATION_EXECUTION_2026-08-30.md`](./DATABASE_MIGRATION_EXECUTION_2026-08-30.md).

Hasil safe tests:

- baseline PostgreSQL read-only: PASS;
- Prisma validation: PASS;
- static semantic parser: PASS;
- live Google Sheets read-only: PASS;
- dry-run importer: PASS;
- target Biomassa 2026 `70020`: PASS.

Migration dan write test pada database lokal yang disetujui sudah dijalankan:

- migration baseline + additive migration: PASS;
- staging dan transactional import Juli 2026: PASS;
- import ulang worksheet yang sama: PASS, tidak menambah normalized duplicate;
- parity PostgreSQL terhadap baseline Google Sheets: PASS dengan precision note coal legacy;
- dashboard PostgreSQL overview verification: PASS.

Test production write/deployment tetap **NOT EXECUTED** dan membutuhkan konfigurasi serta
persetujuan operasional terpisah.
