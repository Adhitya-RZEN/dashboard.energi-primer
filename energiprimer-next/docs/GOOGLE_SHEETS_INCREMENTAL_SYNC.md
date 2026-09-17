# Google Sheets Incremental Sync

> **Phase 7 note (2026-09-17):** Automatic cron execution is a separate,
> fail-closed mode layered on the verified incremental engine. It is disabled
> by default and was not live-canary executed in this implementation turn.

> CURRENT PRODUCTION POINTER (Phase 6N, 2026-09-05): The incremental and
> idempotency design below is the current technical reference. Deployment and
> one controlled Production execution are evidenced by Phase 6K and Phase 6L.
> No additional sync is authorized by this document.

> **Phase 6J update (2026-09-04):** Discovery now uses the lease-guarded,
> set-oriented preparation/persistence path described below. The Phase 6J
> implementation report is the authoritative gate record.

Status checkpoint: **S3 PASS**

## Phase 4 controlled HTTP boundary (2026-09-16)

The API route now separates method semantics. GET performs only target metadata
verification, Google metadata discovery, or exact worksheet preflight and
returns `write=NOT_EXECUTED`. POST requires `action=execute-import`, an exact
worksheet, and the SHA-256 `importPlanId` returned by preflight. POST rebuilds
the plan and rejects a stale or blocked hash before entering the existing sync
engine. The Vercel GET cron therefore remains a read-only probe until the
separate Phase 7 automatic configuration and admission gates are authorized.

## Phase 7 deterministic automatic lifecycle (2026-09-17)

The automatic lifecycle is:

```text
metadata discovery
  -> deterministic NEW/CHANGED/RENAMED/UNCHANGED/MISSING diff
  -> registry status/profile admission
  -> A1:Z10 minimal probe for unverified worksheets
  -> approved canonical schema/profile
  -> bounded full parse and schema fingerprint
  -> canonical mapping/provenance/identity validation
  -> target-state diff and immutable plan
  -> automatic admission
  -> durable bounded batches
  -> reconciliation and monitoring
```

Only `ACTIVE` approved canonical worksheets, or `DISCOVERED` worksheets that
pass the minimal semantic profile probe and the subsequent full canonical
schema check, can reach the writer. Unknown or ambiguous sources remain
`SCHEMA_REVIEW`/unadmitted with zero business writes. The automatic engine is
selected by profile and canonical period policy, not by a worksheet-specific
Agustus/September branch. It allows an approved canonical Juli source for
normal change detection, while the historical Phase 6 canary remains a
separate exact route and is not rerun.

Existing row-state classification now exposes `newRows`, `changedRows`,
`unchangedRows`, and `removedSourceKeys`. A removed source key is audit
evidence only: there is no automatic DELETE operation. Changed business values
become canonical `UPDATE` candidates, unchanged values become `SKIP`, and
repeated execution reuses the durable plan/ledger and target-state comparison.

The automatic route requires the authenticated Vercel Cron trigger, verified
Supabase Production identity, `CANONICAL_IMPORT_LEDGER_ENABLED=true`, explicit
automation enablement, an open kill switch, and bounded worksheet/record
settings. The route remains metadata-only when any gate is absent. See
`docs/PHASE7_DETERMINISTIC_SYNC_PRODUCTION_AUTOMATION_RESULT.md` for the
implementation evidence and remaining live-canary gate.

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

## Canonical schema recognition and retry-safe re-admission

`Juli26-BB` remains the existing `BB_CANONICAL_V1` mapping reference. For an
explicit worksheet, canonical lookup uses the active `Juli26-BB` snapshot on
the same `sync_source` first. If no local anchor exists, the resolver may use a
single unambiguous global profile; conflicting global profiles remain blocked.
This is source provenance selection, not a new mapping or a worksheet-specific
exception.

The schema fingerprint is structural: semantic labels/path metadata and date
column presence are hashed after removing numeric sample values that were
mistakenly carried into a header path. Observed value types remain in the
snapshot for diagnostics and strict checks but do not change the structural
hash. Existing stored v1 snapshots are normalized on read, so this correction
does not require a database migration.

When a new worksheet has an explicit empty marker at the canonical value cell,
the parser records `missing` and does not choose a nearby numeric candidate.
This preserves the established mapping and prevents a false
`ambiguous_fields` validation block. A retryable registry `SCHEMA_REVIEW` with
no approved schema/hash can therefore be prospectively revalidated by the
read-only operator preflight; an authorized successful sync changes the
worksheet to `ACTIVE` and resolves its open schema review in the same row-state
transaction. Reviews with an approved snapshot, disabled/missing/error state,
or a current structural mismatch remain blocked.

The 2026-09-15 exact dry-runs for `Juli26-BB` and `Agustus26-BB` both passed:
31 source rows, 352 candidate/valid records, 0 invalid rows, 0 potential
duplicates, and `write=NOT_EXECUTED`. The two established parser warnings were
preserved.

## Idempotensi verification

Verifikasi live terbatas dilakukan terhadap worksheet `Juli26-BB` pada database
lokal:

| Eksekusi | Rows scanned | INSERT | UPDATE | SKIP |
| --- | ---: | ---: | ---: | ---: |
| Pertama | 352 | 352 | 0 | 0 |
| Kedua | 352 | 0 | 0 | 352 |

Hasil ini membuktikan bahwa pembacaan ulang tanpa perubahan source tidak
menghasilkan duplicate normalized write.

### Import transaction P2028 remediation (2026-09-15)

The normalized importer retains one atomic transaction per selected worksheet,
but no longer performs one Prisma `upsert` per normalized record. Staging
rows and the eight row-heavy normalized targets use parameterized, set-oriented
`INSERT ... ON CONFLICT DO UPDATE` batches of at most 200 rows. The existing
target mismatch guard, cumulative persistence, and final successful import-run
update remain in that same transaction. Batching reduces transaction duration
without creating independently committed partial imports.

The transaction timeout remains `30,000 ms`; P2028 is not retried. The
successful import transaction is followed by the existing row-state,
worksheet-registry, and sync-run finalization path. A transaction failure keeps
those states unadvanced, rolls back staging/normalized writes, and records the
failed import audit row outside the transaction. Source fingerprinting,
worksheet identity, canonical mapping, and the no-delete policy are unchanged.

The guarded disposable regression
`npm run sync:verify-import-transaction:disposable` exercised both
`Juli26-BB` and `Agustus26-BB` with 352 records each. Both completed in 14
logical transaction calls (90/105 ms in the recorded run), repeated imports
reused their successful run IDs, the forced target mismatch rolled back all
staging/normalized changes, and the database reported zero duplicate business
keys.

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
3. After discovery, sync calls the bulk-batched importer transactionally per
   selected worksheet. The normalized transaction is still interactive and
   retains a 30-second timeout, so database availability and pool capacity
   remain operational prerequisites. Google network reads and discovery
   preparation remain outside the database transaction; P2028 is not retried.
4. Direct importer calls and verification scripts remain local-only by
   default. The controlled local Production operator path is a separate,
   explicit `sheets:sync -- --worksheet=<title> --production` flow: it verifies
   the live Supabase transaction-pooler identity before discovery and again at
   the normalized-write boundary. No target is selected from an arbitrary
   request parameter, and no write is permitted without the explicit worksheet
   and Production target flags.

## Files utama

- `src/services/google-sheets/sync/identity.ts`
- `src/services/google-sheets/sync/change-detection.ts`
- `src/services/google-sheets/sync/commit-scope.ts`
- `src/services/google-sheets/sync/engine.ts`
- `src/services/google-sheets/sync/operator-contract.ts`
- `src/services/google-sheets/sync/production-target.ts`
- `src/services/google-sheets/sync/preflight.ts`
- `src/services/google-sheets/sync/post-write-verification.ts`
- `src/services/google-sheets/import/commit.ts`
- `src/services/google-sheets/import/bulk-upserts.ts`
- `scripts/verify-import-transaction-disposable.ts`
- `scripts/run-google-sheets-sync.ts`

## Phase 5 canonical target and durable execution

Before a Production write, the sync now resolves the canonical business
identity against the normalized target tables and emits deterministic
`INSERT`/`UPDATE`/`NO-OP`/`SKIP`/`BLOCK` differences. Approved writable items
are partitioned into bounded batches and associated with an immutable durable
plan snapshot; committed batches are skipped on restart, known rollbacks can be
retried in the exact scope, and unknown outcomes require read-only
reconciliation. No DELETE is generated. Production remains blocked until the
separate ledger rollout and explicit canary authorization are complete. See
`docs/PHASE5_CANONICAL_TARGET_STATE_DURABLE_LEDGER_RESULT.md` for evidence.

