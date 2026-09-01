# Google Sheets Worksheet Discovery — S2

Tanggal: 2026-08-30  
Status S2: **PASS**.

## Implementasi

Discovery memakai metadata Google Sheets API, bukan menebak seluruh worksheet dari
nama periode. Request metadata hanya mengambil properties worksheet yang diperlukan:

- `sheetId` sebagai identity stabil;
- `title` sebagai metadata yang dapat berubah;
- index/type dan ukuran grid sebagai metadata operasional.

Implementasi:

- `src/lib/google-sheets.ts` — `listGoogleSheetsWorksheets()`;
- `src/services/google-sheets/sync/discovery.ts` — source registry, worksheet registry,
  diff, lifecycle state, dan stable source key;
- `scripts/verify-worksheet-discovery.ts` — static dan live verification.

Google API read diselesaikan terlebih dahulu sebelum transaction database dimulai.
Credential tidak dikembalikan pada result dan tidak dicatat ke log.

## Registry database

Migration additive yang dipakai:

```text
20260830160000_add_sheets_sync_state
```

Entity yang dibuat:

- `sync_sources`: provider, hashed source key, spreadsheet identity internal,
  status, discovery timestamp, dan lease fields untuk checkpoint concurrency;
- `sync_worksheets`: source relation, `worksheet_key` berisi `sheetId`, title,
  normalized title, lifecycle status, first/last seen, row count, dan hash fields.

Worksheet yang hilang hanya diubah menjadi status `MISSING`. Tidak ada normalized
data yang dihapus.

## Lifecycle

Status yang disediakan:

```text
DISCOVERED → VALIDATED → ACTIVE
                    ↘ SCHEMA_REVIEW
MISSING / DISABLED / ERROR
```

Behavior discovery:

- sheet ID baru: `DISCOVERED`;
- sheet ID yang sama dengan title berubah: terdeteksi `RENAMED`, title diperbarui,
  status existing dipertahankan;
- sheet ID yang sama tanpa perubahan: `UNCHANGED`;
- sheet ID yang tidak lagi dikembalikan metadata: `MISSING`;
- daftar metadata kosong: seluruh registry existing menjadi `MISSING`, tanpa delete;
- API/auth/permission/malformed error: proses berhenti sebelum registry write.

Title rename belum otomatis dianggap sebagai business mapping baru. Validasi schema
dan keputusan apakah title baru tetap mewakili periode yang sama dilakukan pada S4.

## Stable source identity

Source key internal dibuat dari hash provider + spreadsheet identity. Nilai spreadsheet
ID tidak ditulis ke dokumentasi atau output verification. Worksheet identity database
menggunakan `sheetId`, bukan row number dan bukan title.

## Verification

Static test:

- new worksheet: PASS;
- repeated discovery: PASS;
- rename title dengan sheet ID tetap: PASS;
- missing worksheet: PASS;
- empty worksheet list: PASS;
- HTTP authentication/permission/rate-limit/timeout/API classification: PASS.

Live test terhadap spreadsheet terkonfigurasi:

```text
status          = PASS
worksheets      = 199
new             = 0
renamed         = 0
missing         = 0
unchanged       = 199
```

Command:

```text
npm run sync:verify-discovery
npm run sync:verify-discovery -- --live
```

Live command menulis registry discovery ke database lokal melalui transaction.
Database production tidak digunakan.

## Batasan S2 dan tindak lanjut

- Discovery belum membaca cell values untuk menentukan schema atau melakukan import.
- Worksheet invalid/unknown title sudah dapat diregistrasikan, tetapi keputusan
  `SCHEMA_REVIEW` dilakukan bersama schema detector S4.
- Rename detection masih berbasis sheet ID/title; business equivalence belum
  disimpulkan otomatis.
- Registry belum memiliki row state/fingerprint dan belum menghitung INSERT/UPDATE/SKIP.

Checkpoint berikutnya adalah S3 incremental synchronization dengan parser dan
normalization existing.
