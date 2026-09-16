# Google Sheets Sync Audit, Recovery, and Concurrency

> CURRENT PRODUCTION POINTER (Phase 6N, 2026-09-05): The Phase 6J
> discovery/diagnostic implementation described here is retained as the
> technical reference. Production deployment evidence is in Phase 6K and the
> one controlled sync result is in Phase 6L; this document is not a sync
> authorization.

> **Phase 6J update (2026-09-04):** The discovery order and diagnostic rules
> below reflect the implemented local hardening. The Phase 6J report records
> which write-capable cases remain blocked without disposable PostgreSQL.

Status checkpoint: **S5 PASS**

## Phase 4 method boundary (2026-09-16)

The HTTP route now separates read and write semantics. GET performs only target
metadata verification plus Google discovery or worksheet preflight and returns
`write=NOT_EXECUTED`; POST requires an explicit `execute-import` action and a
current canonical plan hash before it can invoke the existing writer. This
supersedes the earlier Phase 3 risk note that both methods shared a
write-capable handler. The existing Vercel GET cron is therefore a read-only
probe until a separately authorized POST execution is used.

## Audit state

Each synchronization run records only operational metadata:

| State | Table | Purpose |
| --- | --- | --- |
| Source registry | `sync_sources` | Identifies the configured Google Sheets source by a hash key. |
| Worksheet registry | `sync_worksheets` | Stores stable Google `sheetId`, title, status, and approved schema/content state. |
| Row state | `sync_row_states` | Stores last seen content hash per worksheet/source key. |
| Run audit | `sync_runs` | Stores trigger, counters, duration, and sanitized failure category. |
| Schema audit | `sync_schema_changes` | Stores blocked schema differences pending review. |
| Import audit | Existing `spreadsheet_import_runs` and staging | Preserves the normalized importer transaction audit. |

No credential, access token, private key, database URL, or raw service-account
document is stored in these tables.

## Current Phase 6J discovery lifecycle

```text
Google metadata read (outside transaction)
  -> bounded retry for eligible Google read failures only
  -> source bootstrap -> atomic source lease
  -> registry snapshot while the lease is held
  -> pure diff/status preparation
  -> short atomic registry persistence
  -> syncRun creation -> selected worksheet processing
```

The original S5 lifecycle is retained below as historical checkpoint evidence.

## Run lifecycle (S5 baseline)

```text
DISCOVER
  ↓ retry transient read failure
ACQUIRE atomic source lease
  ↓
CREATE RUNNING audit row
  ↓
READ / PARSE each selected worksheet
  ↓
schema gate → row change detection → transactional normalized write
  ↓
persist row/worksheet state
  ↓
SUCCESS / PARTIAL / FAILED
```

If one worksheet fails, other selected worksheets can continue and the run is
marked `PARTIAL` when at least one worksheet succeeds. Schema-review and
duplicate-key failures are intentionally not imported.

## Retry policy

Only transient Google failures are retried up to three attempts with exponential
delays (default 500 ms, 1 s, 2 s, capped at 4 s):

- rate limit (`429`);
- timeout (`408`, `504`, or request abort);
- API/network failure without a definitive client status;
- server API status (`5xx`).

Configuration, authentication (`401`), permission (`403`), malformed response,
and validation failures fail fast. Retry details are not written to the client
response.

## Concurrency protection

`sync_sources.lock_token` and `lock_expires_at` form a database lease. The
atomic conditional update means only one process can acquire a live lease. The
orchestrator acquires it before the registry snapshot, renews it before each
worksheet, and releases it by matching the token. A competing invocation
returns `LOCKED` and does not persist worksheet registry or normalized data;
the small source bootstrap operation may have already ensured the source
identity exists.

## Partial recovery

- Google read failure: worksheet becomes `ERROR`; later scheduled execution can
  retry it.
- Schema or duplicate identity failure: worksheet becomes `SCHEMA_REVIEW` and
  automatic selection skips it until review/resolution.
- Import transaction failure: existing importer rolls back normalized writes;
  row state is not advanced, so a later run can retry the source row.
- State persistence failure after a successful upsert can cause a repeat upsert;
  the existing normalized upsert remains idempotent and no delete is attempted.
- Missing source rows are retained. There is no automatic delete/archive policy
  until the business rule is approved.

Database connectivity errors with Prisma transient codes (`P1001`, `P1008`,
`P1017`, `P2024`, and `P2034`) retain the existing bounded retry policy around
the normalized importer transaction. The Phase 6J discovery transaction does
not retry P2028: it records a safe diagnostic and fails fast so an uncertain
transaction is never replayed automatically.

## Error safety

Run error summaries contain stable categories such as
`google_sheets_permission`, `google_sheets_rate_limit`, or
`synchronization_failed`; arbitrary exception text is not exposed. API responses
are generic and contain only aggregate counters.

Discovery diagnostics use bounded stages for source bootstrap, lease, registry
read, pure preparation, current persistence, missing persistence, transaction,
and total duration. Only safe `error_category`, `error_code`, duration, request
ID, and bounded Google status are eligible for output; no SQL, stack, URL,
credential, or raw exception text is emitted. The discovery timeout remains
`60,000 ms` and the Phase 6J performance gate is `<=45,000 ms` on a
representative disposable fixture.

## Verification

Static and local checks cover retry classification, bounded backoff, and atomic
lease behavior:

```bash
npm run sync:verify-retry
npm run sync:verify-retry -- --live
npm run sync:verify-diagnostics
```

The live lease check acquired one local lease, confirmed a second acquisition
was rejected, and released the original lease. No production database was used.

## Manual review required

The following remain explicit review decisions:

1. Business policy for source-row deletion/archive.
2. Approval workflow for a schema change.
3. Production database connection-pool sizing for serverless execution.
4. Alert destination for failed/partial runs.

## Production read-only forensic audit — Agustus26-BB P2028 — 2026-09-15

This audit used the existing Production pooler identity check and bounded
SELECT-only queries. No retry, sync, delete, migration, or data repair was
performed.

### Identity and run evidence

The verified target was Supabase Production through the transaction pooler:
`aws-0-ap-southeast-1.pooler.supabase.com:6543`, database `postgres`, schema
`public`, role `postgres`, PostgreSQL `17.6`. Pooler backend SSL was not
reported by the session, while the connection parameter was `sslmode=verify-full`.

`sync_runs.id=16` is a source-level audit row (`source_id=20`; the table has no
worksheet foreign key) with `status=FAILED`, `trigger_type=manual`,
`started_at=2026-09-15T08:17:13Z`, `finished_at=2026-09-15T08:17:48Z`,
`duration_ms=34947`, `rows_scanned=352`, `inserted=352`, `updated=0`,
`skipped=0`, `failed=1`, and persisted `error_summary=sync_database`. The
reported `inserted=352` is the sync result/classification counter, not proof of
committed rows. The verification repeat is `sync_runs.id=17` and failed with
the same `352/0/0` counters.

### Actual Production state

The failed normalized-data transaction **rolled back**:

| Evidence | Result |
| --- | ---: |
| Agustus staging rows for import runs 13 and 14 | 0 |
| Import-linked normalized rows for runs 13 and 14 | 0 in every target table |
| Normalized rows with `source_worksheet=Agustus26-BB` | 0 |
| August 2026 `coal_consumption` rows | 0 |
| August 2026 `coal_stock` rows | 0 |
| Agustus worksheet row states | 0 |
| Stable-key/source-row/business-key duplicate groups | 0 |

Import runs `13` and `14` remain as failed audit metadata outside the data
transaction: both have the same checksum, `imported_rows=0`,
`rejected_rows=352`, and the message `Import transaction failed; no normalized
rows were committed.` This is consistent with the staging and normalized
table reads. The existing unique indexes for the normalized business keys were
also present; no duplicate records were found.

### Worksheet registry and verifier failures

The exact registry row is `sync_worksheets.id=3460`, source `20`, worksheet key
`321088799`, title `Agustus26-BB`. It is `ERROR`, has discovery metadata
`row_count=593`, `last_sync_at=NULL`, and null `content_hash`/`schema_hash`.
The open schema review is record `sync_schema_changes.id=2`, with the earlier
`77f6fc…` fingerprint and the ambiguous-rename resolution.

The post-write verification failures are therefore expected consequences of the
failed transaction and subsequent error handling:

- `worksheet_not_active`: the sync catch path marked the worksheet `ERROR`.
- `worksheet_row_count_mismatch`: the row count remained discovery metadata,
  not successful-plan state.
- `worksheet_content_hash_mismatch` and `worksheet_schema_hash_mismatch`:
  successful row-state persistence never ran, so both hashes stayed null.
- `sync_row_states_missing`: row states are written only after the normalized
  import transaction succeeds; the registry has zero states for this worksheet.
- `successful_import_run_not_found`: imports 13/14 are `FAILED`, not `SUCCESS`.
- `sync_run_counters_mismatch`: the verifier requires `sync_runs.status=SUCCESS`
  and `failed=0`; run 16 is `FAILED`/`failed=1` even though its attempted-write
  counters are 352/0/0.

### P2028 boundary and retry decision

The importer performs `spreadsheet_import_staging.createMany` followed by
sequential per-record normalized `upsert` calls and a final import-run update
inside one Prisma interactive transaction configured with `timeout: 30_000`.
It does not perform Google network reads inside that transaction. Row-state
and worksheet registry persistence occur afterward in a separate transaction;
they were not reached after the importer failed. The two failed import runs
each lasted exactly about 30 seconds, while sync run 16 lasted 34.947 seconds.

The strongest supported root cause is transaction expiry at the configured
30-second interactive-transaction boundary while sequential normalized writes
were still executing. The evidence does not distinguish the lower-level cause
(query time, connection/pooler behavior, lock wait, or another transaction
lifecycle event), and no such cause is inferred from the post-incident empty
`pg_stat_activity`/lock view.

The database is currently consistent with a rollback and has no visible active
transaction, waiting lock, or source lease. A new Production sync is **not safe
to run now**: the implementation and 30-second transaction exposure remain
unchanged, the worksheet remains `ERROR`, and the request explicitly forbids a
retry. Remediation and a fresh read-only preflight must precede any separately
authorized write.

Implementation changes: **NONE**. Production writes during this audit: **NONE**.

## Import transaction remediation — Agustus26-BB P2028 — 2026-09-15

This addendum preserves the forensic incident above as historical evidence. It
documents the local remediation of the normalized importer; it is not a
Production write authorization.

### Root cause and transaction sequence before remediation

The retained evidence establishes transaction expiry at the configured
30-second Prisma interactive-transaction boundary while approximately 352
normalized rows were still being written. The lower-level cause (query time,
pooler/connection behavior, lock wait, or another lifecycle event) remains
unproven. Google reads were already outside the transaction. The importer did
not configure an explicit `maxWait` or `isolationLevel`; only the 30-second
transaction timeout was set.

Before the change, one import followed this sequence:

```text
validate plan and target
  -> content-hash short circuit
  -> create spreadsheet_import_runs = PROCESSING
  -> one interactive transaction, timeout 30,000 ms:
       staging createMany for the complete plan
       sequential per-record normalized upserts
       target guard and upsert
       cumulative upserts
       import run = SUCCESS
  -> separate row-state and worksheet-registry finalization
```

If the transaction failed, the catch path persisted `FAILED` import metadata
outside the transaction. Staging and normalized writes were rolled back, and
row state was not advanced.

### Atomicity classification

The following operations remain atomic for one import plan:

- staging rows;
- all normalized target writes, including the approved-target mismatch guard;
- cumulative and target persistence; and
- the final `spreadsheet_import_runs = SUCCESS` marker.

Staging and normalized rows are batched for parameter/statement bounds, but
the batches are not independently committed. Row-state, worksheet-registry,
and sync-run finalization still occur only after a successful normalized import
in the existing downstream transaction. They remain recoverable/idempotent
post-import state rather than a reason to split the normalized data commit.
Transient Google/database errors retain the existing bounded policy; P2028 is
not added to automatic retry.

### Remediation and transaction sequence after remediation

The transaction timeout remains `30,000 ms`; it was not increased. No explicit
`maxWait` or `isolationLevel` was added. The
row-heavy normalized upserts now use parameterized `INSERT ... ON CONFLICT DO
UPDATE` statements in fixed batches of at most 200 rows per target table. The
staging `createMany` is also bounded to 200-row batches. The transaction now
follows:

```text
Google read / parse / validation / preflight (outside transaction)
  -> source fingerprint and import-run PROCESSING audit row
  -> one short interactive transaction, timeout 30,000 ms:
       bounded staging batches
       bounded set-oriented normalized upsert batches
       existing target guard and upsert
       bounded cumulative upsert batches
       import run = SUCCESS
  -> existing row-state, worksheet-registry, and sync-run finalization
```

All dynamic values are still passed as parameters; table and column identifiers
are static. No `DELETE`, `TRUNCATE`, or `DROP` operation was added. The source
fingerprint, worksheet identity, canonical parser/mapping gate, no-delete
policy, Production target gate, and failed-run handling are unchanged.

`transactionDurationMs` and `transactionStatementCount` are returned by the
commit result for bounded local diagnostics. The statement count represents
logical Prisma calls executed inside the transaction; it excludes the
out-of-transaction `PROCESSING` create and failed-run catch update.

### Remediation validation

The guarded disposable PostgreSQL harness
`sync:verify-import-transaction:disposable` ran against the checked-in
Production schema on loopback port 55432. It covered both `Juli26-BB` and
`Agustus26-BB`, each with exactly 352 staging/normalized-plan records:

| Check | Result |
| --- | ---: |
| Juli transaction duration | 90 ms |
| Agustus transaction duration | 105 ms |
| Logical calls per 352-row transaction | 14 |
| Safety budget | `<=22,500 ms` inside the unchanged 30,000 ms timeout |
| P2028 | NOT REPRODUCED in the disposable fixture |
| Exact repeat import run | Same run ID for both worksheets |
| Rollback after target mismatch | Normalized/staging state unchanged |
| Failed import audit row | Persisted with `imported_rows=0`, `rejected_rows=352` |
| Business-key duplicate groups | 0 |

The timings are controlled local evidence, not a claim about Production
latency. The canonical mapping and schema tests, the 199-worksheet discovery
test, and the dry-run target/safety tests also passed. The exact live dry-run
reached the worksheet and independently validated the 352-record plan, but its
overall status remained `BLOCKED` by the pre-existing
`worksheet_registry_error` state; it still reported `write=NOT_EXECUTED`.
That state was not changed during remediation.

### Production read-only state and next execution boundary

The post-remediation verification remains read-only. Agustus Production must
still be confirmed as zero records and zero duplicate groups immediately before
any separately authorized write. The next operator sequence is:

1. run the exact canonical Agustus dry-run with `--production --dry-run`;
2. verify the live target identity, schema/canonical admission, 352-record
   plan, invalid-row count, duplicate count, and `write=NOT_EXECUTED`;
3. obtain a new explicit Production-write approval; and
4. only then run the explicit worksheet write plus idempotency verification.

The exact Production dry-run result on this date was:

```text
worksheet=Agustus26-BB
mapping=APPROVED
candidate_records=352
valid_records=352
invalid_rows=0
potential_duplicates=0
status=BLOCKED
blocker=worksheet_registry_error (historical failed-run state)
write=NOT_EXECUTED
```

The read-only Production state verifier then confirmed `records=0`,
`duplicates=0`, zero Agustus period rows, zero Agustus staging rows, and zero
Agustus row states. No registry reset was attempted because that would be a
Production write outside this remediation scope. The existing write gate must
remain closed until an operator separately reviews and resolves the historical
`ERROR` registry state, then repeats the fresh read-only dry-run.

Final local validation gates:

```text
npm run lint                                      PASS
npx tsc --noEmit --incremental false              PASS
npm run build                                     PASS (after final code check)
npm run sync:verify-import-transaction:disposable PASS
npm run sync:verify-discovery:disposable          PASS
npm run bb:mapping:test                           PASS (27 assertions)
npm run dynamic:verify                            PASS
npm run sync:verify-auto-admission                PASS
npm run sync:verify-diagnostics                   PASS
npm run sync:verify-retry                         PASS (P2028 not retryable)
npm run sync:verify-preview-write-safety          PASS (databaseWrites=0)
npm run sync:verify-local-production              PASS
npm run sync:verify-incremental                   PASS (static)
npm run sync:verify-cron-auth                     PASS
npm run sync:verify-config                        PASS
npm run supabase:production:runtime:pooler        PASS (read-only; supabaseWrites=0)
npm run supabase:production:verify-agustus-state  PASS (read-only; records=0, duplicates=0)
```

This remediation phase executed no Production write and did not authorize a
retry of the failed Agustus run. Status: **PASS WITH REVIEW — local importer
remediation accepted; Production write and post-deployment authorization remain
separate**.

## Production registry-error audit and guarded reconciliation — Agustus26-BB — 2026-09-15

This addendum is the read-only forensic follow-up to the P2028 incident above.
It does not replace or erase the earlier failed-run evidence. The audit used
the verified Supabase Production transaction pooler and the current Google
worksheet read; the audit query path performed zero database writes.

### Registry error and root cause

The exact registry row is `sync_worksheets.id=3460`, with `source_id=20`,
`worksheet_key=321088799`, title `Agustus26-BB`, normalized title
`AGUSTUS26-BB`, status `ERROR`, `created_at=2026-09-15T05:25:57Z`, and
`updated_at=2026-09-15T08:18:26Z`. Its `first_seen_at` is
`2026-09-15T05:25:52Z`, `last_seen_at=2026-09-15T08:17:50Z`,
`last_sync_at=NULL`, `row_count=593`, and `content_hash`, `schema_hash`, and
`schema_snapshot` are all `NULL`. `sync_worksheets` has no persisted error
message column; the `ERROR` status is the marker and related run tables carry
the messages/categories.

The originating sequence is persisted, not inferred:

- `sync_runs.id=13`, `14`, and `15` failed during earlier canonical/schema
  admission (`canonical_schema_unavailable`, then `schema_review`), with the
  open `sync_schema_changes.id=2` recording the ambiguous-rename review;
- `sync_runs.id=16` (manual) and `id=17` (verification) failed with
  `error_summary=sync_database` after scanning 352 rows and attempting the
  importer transaction; and
- `spreadsheet_import_runs.id=13` and `id=14` both remain `FAILED`, each with
  `imported_rows=0`, `rejected_rows=352`, the same checksum, and the message
  `Import transaction failed; no normalized rows were committed.`

The P2028 transaction failure is therefore the event that left the current
`ERROR` marker after schema-review history had already been recorded. The
normalized importer remediation is documented above; it did not itself clear
the registry marker.

### Historical or active

The exact current read proves `STALE_HISTORICAL_ERROR` under the application’s
existing canonical policy:

| Check | Result |
| --- | --- |
| Google worksheet identity | `321088799 / Agustus26-BB` matches the registry and source `20` |
| Current mapping/schema | `PASS / APPROVED`; canonical structural comparison `UNCHANGED` |
| Current plan | 31 source rows, 352 candidates, 352 valid, 0 invalid, 0 potential duplicates |
| Canonical hash detail | persisted Juli snapshot embeds legacy `780c…`; normalized schema-v1 hash is `2bed…`, matching the current structural hash |
| Advanced Agustus state | none: last sync, schema/content hashes, and row states are absent |
| Failed history | 2 worksheet import runs and 5 source-level sync runs retained |
| Production evidence | 0 Agustus staging/normalized rows, 0 row states, 0 duplicate groups |

The raw Juli hash discrepancy is a backward-compatible snapshot-normalization
effect, not a current structural mismatch. The resolver’s normalized comparison
is the same comparison that produced `schemaClassification=APPROVED`; no
business mapping was changed.

### Recovery path

The existing discovery persistence intentionally preserves an `ERROR` status,
and the normal successful sync path would write normalized business data before
finalizing row state. No current registry-only recovery command existed. The
smallest supported replacement is now a guarded application service and
operator command:

```bash
npm run supabase:production:reconcile-agustus-registry
npm run supabase:production:reconcile-agustus-registry -- --approve-metadata-only
```

Without the approval flag, the command is read-only. With the explicit flag it
requires the same verified Production target, re-reads the worksheet plan,
requires the stale predicate above, acquires the normal source lease, locks and
rechecks the exact source/worksheet rows, and changes only `ERROR` to
`DISCOVERED`. It resolves the existing open schema-review row by adding a
resolution while retaining its original hashes, snapshots, type, and ID. It
does not create row states, change `last_sync_at`, invent schema/content
fingerprints, touch staging/normalized tables, or delete any record.

The disposable regression passed these guards and preservation checks. The
Production approval flag was **not executed** because this task explicitly
forbids a Production data/registry write. Consequently the live registry still
has status `ERROR`; no claim of post-remediation Production state is made.

### Current dry-run and Production boundary

The exact permitted read-only command was rerun after the reconciliation attempt
was refused:

```text
worksheet=Agustus26-BB
worksheet registry status=ERROR
mapping=PASS
schemaClassification=APPROVED
candidate_records=352
valid_records=352
invalid_rows=0
potential_duplicates=0
status=BLOCKED
blocker=worksheet_registry_error
write=NOT_EXECUTED
```

The read-only state verifier returned `records=0`, `duplicates=0`, zero
Agustus staging/normalized rows, zero row states, and `productionWrites=0`.
The importer command with `--verify-idempotency` remains prohibited. The live
acceptance state is therefore **PASS WITH REVIEW — stale condition proven;
metadata-only reconciliation implemented and locally verified, but not applied
to Production under the explicit no-write constraint**.

The remaining operator decision is limited to the guarded metadata-only command
above. After that command is separately authorized and succeeds, the exact
Production dry-run and the read-only state verifier must be rerun; only then can
the registry state and dry-run be reported as reconciled. No Production business
data write is authorized by this addendum.
