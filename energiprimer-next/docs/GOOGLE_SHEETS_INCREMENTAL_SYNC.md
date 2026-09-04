# Google Sheets Incremental Sync

> **Phase 6J update (2026-09-04):** Discovery now uses the lease-guarded,
> set-oriented preparation/persistence path described below. The Phase 6J
> implementation report is the authoritative gate record.

Status checkpoint: **S3 PASS**

Dokumen ini menjelaskan mekanisme import incremental Phase 11. Google Sheets
tetap menjadi source of truth, sedangkan PostgreSQL menyimpan state operasional
dan hasil normalisasi untuk dibaca dashboard. Tidak ada penghapusan data sumber
atau propagasi delete otomatis pada checkpoint ini.

## Current Phase 6J discovery order

```text
Google metadata read (outside transaction)
  -> source bootstrap -> source lease
  -> registry snapshot while lease is held
  -> pure diff/status preparation (outside transaction)
  -> short atomic registry persistence
  -> syncRun creation and existing worksheet processing
```

Discovery registry persistence uses one parameterized set-oriented current-row
write and one homogeneous `updateMany` for missing keys. The metadata request
and in-memory preparation are never held inside the Prisma transaction. The
discovery transaction keeps the existing `60,000 ms` timeout; P2028 is
diagnostic-only and is not retried.

## Baseline S3 flow

```text
Google Sheets metadata
        ↓
worksheet registry (sheetId sebagai key stabil)
        ↓
read exact registered worksheet
        ↓
existing dynamic parser + existing import plan
        ↓
stable source key + content hash
        ↓
INSERT / UPDATE / SKIP
        ↓
existing transactional normalized import
        ↓
sync row state + sync run audit
```

Chart, dashboard, authentication, Prisma model operasional, dan mapping Google
Sheets yang sudah ada tidak mengambil data tambahan dari browser.

## Stable source key

Source key dibuat dengan SHA-256 dari identitas bisnis berikut:

- entity type;
- period start atau reading date;
- target year jika berlaku;
- unit 1–3 jika berlaku;
- supplier code jika berlaku;
- satuan nilai.

Nomor baris, alamat cell, urutan row, dan posisi kolom tidak menjadi bagian dari
source key. Dengan demikian sorting atau penyisipan baris tidak membuat row baru
selama identitas bisnisnya tetap sama.

Content hash berisi source key dan nilai normalisasi. Nilai `NULL` dan `0`
dibedakan agar koreksi data kosong menjadi nol tetap terdeteksi sebagai UPDATE.

## Keputusan tindakan

| Kondisi | Action | Perlakuan |
| --- | --- | --- |
| Source key belum ada | INSERT | Row diteruskan ke importer transactional yang sudah ada. |
| Source key ada, content hash berubah | UPDATE | Row diteruskan ke upsert existing. |
| Source key dan content hash sama | SKIP | Tidak ada normalized write tambahan. |
| Source key ganda pada satu worksheet | SCHEMA_REVIEW | Sync worksheet dihentikan untuk review. |

Staging dan audit hanya menyimpan metadata row yang aman untuk operasional:
entity type, period/date, unit/supplier identity, nilai normalisasi, dan sumber
worksheet/cell. Credential tidak pernah masuk ke staging, response, atau log.

## Database state

- `sync_sources`: satu registry source Google Sheets yang diidentifikasi dengan
  hash source key; spreadsheet ID tidak ditampilkan pada UI/log.
- `sync_worksheets`: registry worksheet berdasarkan Google `sheetId`, termasuk
  title terbaru, status, schema/content hash, dan waktu observasi.
- `sync_row_states`: content hash terakhir untuk setiap worksheet/source key.
- `sync_runs`: counter INSERT/UPDATE/SKIP/FAILED dan durasi eksekusi.
- `spreadsheet_import_runs` serta tabel staging/normalized lama tetap digunakan
  oleh importer transactional yang sudah tervalidasi.

The registry is allowed to contain the complete Google metadata inventory. The
required monthly BB source contract is exactly:

```text
Januari26-BB, Februari26-BB, Maret26-BB, April26-BB,
Mei26-BB, Juni26-BB, Juli26-BB
```

The observed 199 registry rows are not the required monthly processing set.
Non-required tabs remain visible in the registry and do not get deleted or
treated as required monthly sources.

## Idempotensi verification

Verifikasi live terbatas dilakukan terhadap worksheet `Juli26-BB` pada database
lokal:

| Eksekusi | Rows scanned | INSERT | UPDATE | SKIP |
| --- | ---: | ---: | ---: | ---: |
| Pertama | 352 | 352 | 0 | 0 |
| Kedua | 352 | 0 | 0 | 352 |

Hasil ini membuktikan bahwa pembacaan ulang tanpa perubahan source tidak
menghasilkan duplicate normalized write.

Perintah:

```bash
npm run sync:verify-incremental
npm run sync:verify-incremental -- --live
```

Live verification memerlukan environment lokal yang valid dan tidak boleh
diarahkan ke database production tanpa approval terpisah.

## Batasan dan risiko

1. Delete pada Google Sheets belum diterapkan sebagai delete PostgreSQL. Row
   yang hilang dari source dipertahankan untuk mencegah kehilangan data; aturan
   rekonsiliasi/archive membutuhkan keputusan bisnis.
2. Duplicate business identity diblokir, bukan dipilih secara otomatis.
3. After discovery, sync still calls the existing importer transactionally per
   selected worksheet; Google network reads and discovery preparation remain
   outside the database transaction.
4. Manual/verification commit tetap local-only secara default. Endpoint cron
   production baru boleh mengaktifkan target non-local setelah konfigurasi dan
   approval deployment tersedia. Deployment is manual by the user, and any
   Production sync requires a separate explicit approval.

## Files utama

- `src/services/google-sheets/sync/identity.ts`
- `src/services/google-sheets/sync/change-detection.ts`
- `src/services/google-sheets/sync/commit-scope.ts`
- `src/services/google-sheets/sync/engine.ts`
- `src/services/google-sheets/import/commit.ts`
- `scripts/verify-incremental-sync.ts`

