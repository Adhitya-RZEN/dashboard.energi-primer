# Google Sheets Worksheet Discovery — S2 / Phase 6J hardening

> The S2 live evidence below remains a historical local baseline. The current
> implementation and Phase 6J gate status are authoritative in
> `PHASE6J_IMPLEMENTATION_REPORT_2026-09-04.md`.

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
  diff, lifecycle state, stable source key, pure preparation, and atomic
  set-oriented persistence;
- `scripts/verify-worksheet-discovery.ts` — static dan live verification.

Current Phase 6J order is:

```text
Google metadata read
  → source bootstrap
  → source lease acquisition
  → worksheet registry snapshot while the lease is held
  → pure diff/status preparation outside the transaction
  → one short atomic registry transaction
       source metadata + set-oriented current rows + homogeneous missing update
  → syncRun creation and existing worksheet processing
```

Google API read, registry snapshot, and pure preparation are outside the
persistence transaction. The transaction timeout remains `60,000 ms`; no
P2028 retry or timeout increase was introduced. Credential tidak dikembalikan
pada result dan tidak dicatat ke log.

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
npm run sync:verify-discovery:disposable
```

Live command menulis registry discovery ke database lokal melalui transaction.
Database production tidak digunakan. The Phase 6J write-capable scenarios
require a disposable PostgreSQL target; if that target is unavailable they
remain **BLOCKED**, not PASS.

The disposable command requires an explicitly marked loopback PostgreSQL target
on port `55432` and is intended to run against a temporary cluster initialized
from the canonical production baseline. It is not a Production smoke test.

## Required business source set

The registry may contain all metadata returned by Google Sheets. The required
monthly BB contract is exactly these seven worksheet titles:

```text
Januari26-BB, Februari26-BB, Maret26-BB, April26-BB,
Mei26-BB, Juni26-BB, Juli26-BB
```

The observed 199 worksheet metadata rows are an inventory/registry snapshot,
not a requirement to process all 199 as monthly BB business sources. Unrelated
or legacy tabs are registered and retained; they are not deleted and do not
make the seven-source check fail when they are present.

## Batasan S2 yang historis dan tindak lanjut Phase 6J

- S2 discovery tidak membaca cell values untuk menentukan schema atau melakukan import.
- Worksheet invalid/unknown title sudah dapat diregistrasikan, tetapi keputusan
  `SCHEMA_REVIEW` dilakukan bersama schema detector S4.
- Rename detection masih berbasis sheet ID/title; business equivalence belum
  disimpulkan otomatis.
- Row-state/fingerprint dan penghitung INSERT/UPDATE/SKIP tetap berada pada
  tahap worksheet processing setelah discovery; registry discovery sendiri
  hanya menyimpan snapshot metadata.

Phase 6J additionally verifies pure new/rename/missing/empty/recovery behavior,
set-oriented current persistence, missing update batching, lease ordering, and
sanitized diagnostics. Database-write acceptance remains pending a disposable
PostgreSQL fixture.
