# Google Sheets Sync Audit, Recovery, and Concurrency

Status checkpoint: **S5 PASS**

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

## Run lifecycle

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
orchestrator renews the lease before each worksheet and releases it by matching
the token. A competing invocation returns `LOCKED` and does not write source or
normalized data.

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
`P1017`, `P2024`, and `P2034`) receive a bounded second attempt around the
transactional write. Constraint and validation errors fail fast; retrying them
could hide a data or schema problem.

## Error safety

Run error summaries contain stable categories such as
`google_sheets_permission`, `google_sheets_rate_limit`, or
`synchronization_failed`; arbitrary exception text is not exposed. API responses
are generic and contain only aggregate counters.

## Verification

Static and local checks cover retry classification, bounded backoff, and atomic
lease behavior:

```bash
npm run sync:verify-retry
npm run sync:verify-retry -- --live
```

The live lease check acquired one local lease, confirmed a second acquisition
was rejected, and released the original lease. No production database was used.

## Manual review required

The following remain explicit review decisions:

1. Business policy for source-row deletion/archive.
2. Approval workflow for a schema change.
3. Production database connection-pool sizing for serverless execution.
4. Alert destination for failed/partial runs.
