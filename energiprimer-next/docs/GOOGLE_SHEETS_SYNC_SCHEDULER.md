# Google Sheets Sync Scheduler

> **Phase 7 implementation boundary (2026-09-17):** The route supports an
> authenticated, separately configured automatic branch, but unattended
> Production writes remain disabled unless the environment explicitly enables
> `GOOGLE_SHEETS_AUTOMATION_MODE=ENABLED`, sets
> `GOOGLE_SHEETS_AUTOMATION_KILL_SWITCH=DISABLED`, and keeps the durable ledger
> enabled. The Phase 7 live automation canary was not executed in this turn.

> CURRENT PRODUCTION OPERATIONAL CONTRACT (2026-09-05): Phase 6K verified
> the Production deployment and Phase 6L verified exactly one authorized
> controlled sync with HTTP 200, status SUCCESS, syncRun ID 2, and no observed
> P2028. The exact seven-source policy and the 22:00 UTC schedule below are
> current. Phase 6J deployment-pending language is historical.

> **Phase 6J update (2026-09-04):** The local sync path now acquires the
> source lease before the worksheet registry snapshot and uses short,
> set-oriented discovery persistence. The user deploys manually; no deployment
> or Production sync is performed by the agent in Phase 6J.

Historical Phase 6J checkpoint: **local implementation; manual deployment verification pending**

## Phase 4 method boundary (2026-09-16)

`GET /api/sync/google-sheets` is now read-only. It performs target metadata
verification and either workbook discovery or an explicit worksheet preflight;
it does not bootstrap the registry, acquire a lease, create a sync run, or
write import data. This deliberately makes the existing Vercel Cron GET a
read-only safety probe until a separately authorized caller invokes POST.

Production execution is reserved for an authenticated JSON POST with:

```json
{
  "action": "execute-import",
  "worksheet": "Juli26-BB",
  "importPlanId": "<canonical-plan-sha256>"
}
```

The server rebuilds preflight and compares the submitted hash before calling
the existing bounded writer. A stale, blocked, or mismatched plan is rejected
without an import write.

## Phase 7 automatic cron boundary

The Phase 4 behavior remains the safe default. A normal authenticated GET,
including a manually replayed request without the Vercel Cron user agent,
performs read-only target verification and metadata discovery. It returns
`write=NOT_EXECUTED` when automatic admission is not complete.

The Vercel Cron GET may enter the automatic engine only when all of these gates
pass:

1. the deployment environment is allowed and `CRON_SECRET` authenticates the
   request;
2. the request has the Vercel Cron trigger marker;
3. automatic mode is explicitly enabled and the kill switch is explicitly
   disabled;
4. `CANONICAL_IMPORT_LEDGER_ENABLED=true` and the Supabase Production target
   is positively verified;
5. worksheet and record bounds are valid; and
6. each selected source is an active approved canonical profile or passes the
   minimal `A1:Z10` semantic probe before its bounded full read.

The safe defaults are:

```text
GOOGLE_SHEETS_AUTOMATION_MODE=DISABLED
GOOGLE_SHEETS_AUTOMATION_KILL_SWITCH=ENABLED
GOOGLE_SHEETS_AUTOMATION_MAX_WORKSHEETS=12
GOOGLE_SHEETS_AUTOMATION_MAX_RECORDS=2000
```

Unknown, ambiguous, schema-changed, disabled, missing, and errored sources do
not reach the canonical writer. New source metadata may be registered, but a
new worksheet receives only the minimal probe until its approved profile,
mapping, provenance, identity, target-state plan, and admission checks pass.
The automatic engine reuses the existing lease, canonical target diff, durable
ledger, bounded compatibility writer, reconciliation, and row-state idempotency
path. Source absence is evidence only; it never produces a DELETE.

The route emits bounded structured automation events for `STARTED`,
`BLOCKED`, and `COMPLETED` states. Events contain request/run identifiers and
counters, not raw cell values, credentials, or connection strings. Monitoring
also reports the mode, kill-switch state, last cron run, and conservative alert
classification.

## Endpoint

```text
GET  /api/sync/google-sheets
POST /api/sync/google-sheets
```

The endpoint is a server-only Vercel Cron target. It does not accept a
spreadsheet ID, worksheet ID, range, or arbitrary database target from the
request. Those values are read from server-side configuration and the local
worksheet registry.

## Authentication

The request must contain:

```http
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` is compared server-side with a constant-time comparison. It is
never returned, logged, prefixed with `NEXT_PUBLIC_`, or passed to a component.
Missing configuration returns a generic `503`; invalid authorization returns a
generic `401`.

## Scope and schedule

`vercel.json` configures:

```text
0 22 * * *  → /api/sync/google-sheets (06:00 WITA daily)
```

The configured cron invocation is a GET. With the Phase 7 environment defaults
it performs read-only workbook discovery and returns
`write=NOT_EXECUTED`; with every automatic gate above explicitly admitted it
uses the existing bounded canonical writer and durable ledger.
The explicit POST path admits one requested worksheet when all of these
conditions hold:

1. the title is a valid, case-insensitive BB period name such as
   `Agustus26-BB` or `September26-BB`;
2. the period is after the approved `Juli26-BB` boundary and is not later than
   the current UTC operational period;
3. its semantic schema structure matches the approved `BB_CANONICAL_V1`
   profile. Observed cell value types may vary between monthly files without
   creating a schema review; header semantics, column presence, duplicate
   headers, ambiguous renames, and the date column remain strict. The profile
   is taken from an active `Juli26-BB` snapshot across the registered
   workbooks, so a changed spreadsheet file ID does not create a new schema
   baseline; and
4. it passes the existing parser/import validation and duplicate stable-key
   checks.

The read-only GET does not register new tabs or import future monthly data. A
future-dated tab, unrelated tab, duplicate period title, or schema-drifted tab
is reported for review. Conflicting active canonical profiles, missing required
fields, renamed fields, structural schema changes, and ambiguous mappings remain
blocked. Historical/backfill synchronization remains a separately controlled
operation and is not triggered by arbitrary request parameters.

The registry may contain all 199 metadata worksheets. That inventory is not the
required monthly BB processing set. The required business source set is exactly
`Januari26-BB`, `Februari26-BB`, `Maret26-BB`, `April26-BB`, `Mei26-BB`,
`Juni26-BB`, and `Juli26-BB`; non-required tabs remain retained metadata.

## Response safety

GET discovery responses contain only bounded worksheet metadata. Worksheet
preflight responses contain source/worksheet identity, mapping/parser versions,
plan hash, operation counts, validation blockers, identity conflicts, and
provenance counts; raw cell values and credentials are not returned. POST
responses additionally return bounded execution counters and read-only
post-write verification.

The plan uses the existing canonical vocabulary `SKIP` for the requested
`NO-OP` meaning and `BLOCK` for blocked items. DELETE is not part of the current
Google Sheets import contract.

## Runtime requirements

- Node.js runtime is explicitly selected in the route.
- Google Sheets access remains server-side.
- Prisma access remains server-side.
- The Vercel project must provide `DATABASE_URL`, Google Sheets configuration,
  `AUTH_SECRET` for the application, and `CRON_SECRET`.
- The production database must be reachable with a suitable pooled/serverless
  connection configuration. Choosing a pooler or changing production database
  infrastructure requires manual approval.

## Local verification

Authorization logic:

```bash
npm run sync:verify-cron-auth
```

## Controlled local Production worksheet ingestion (2026-09-15)

The existing `sheets:sync` operator command now supports one explicitly
selected worksheet at a time. It is local-only at the execution boundary and
targets Supabase Production only when the operator selects that target
explicitly:

```bash
npm run sheets:sync -- --worksheet=Agustus26-BB --production --dry-run
npm run sheets:sync -- --worksheet=Agustus26-BB --production --verify-idempotency
```

`--worksheet` wajib dan harus cocok dengan satu judul metadata Google Sheets;
the command never guesses a tab or falls back to another period. Production
mode reads `SUPABASE_POOLER_URL`, probes the live identity and required tables
read-only, and requires a local process with no Vercel deployment identity.
Only the existing dynamic parser, mapping policy, stable row keys, lease,
registry, row-state classifier, and transactional importer are used.

The dry-run reports source discovery, `A1:ZZ500`, schema classification,
structural/data/business validation, row-level malformed date/numeric issues,
and INSERT/UPDATE/SKIP/duplicate counts. It performs no registry, lease,
sync-run, staging, or normalized-data writes. A source fingerprint prevents a
Production write when the sheet changes between dry-run and import.

The write command prints a safe identity (host, port, database, schema, role,
and PostgreSQL version) without credentials. Existing data is never deleted or
truncated; unchanged stable keys are skipped and changed keys follow the
existing upsert policy. `--verify-idempotency` runs the same explicit worksheet
again and is required before the CLI can report `VERIFIED`; without it, a
successful import remains `PASS_WITH_REVIEW`.

The scheduler route remains the protected automatic path with scope
`automatic`. The operator command is not a replacement for that schedule and
does not process the full registry.

### Canonical recognition correction (2026-09-15)

The explicit worksheet operator path now resolves the existing canonical
`Juli26-BB` profile from the same registered Google source before considering a
global profile. This fixes the case where another workbook has a conflicting
active Juli snapshot while preserving fail-closed behavior for conflicts on the
same source and for ambiguous global fallback. No Agustus-specific allowlist or
business mapping was added.

The structural fingerprint removes numeric sample values accidentally carried
as header labels and excludes observed value type from the structural hash.
Strict comparison still retains value-type diagnostics, while canonical
automatic admission tolerates observed `numeric`/`empty`/`mixed` drift. An
explicit `-` value at a canonical dashboard cell is treated as missing, so the
resolver never substitutes a nearby row's number.

Read-only validation on 2026-09-15:

```text
Juli26-BB     PASS  schema=UNCHANGED  rows=31  records=352  invalid=0  duplicates=0
Agustus26-BB  PASS  schema=APPROVED    rows=31  records=352  invalid=0  duplicates=0
schemaHash=2bed9745…
write=NOT_EXECUTED
```

Both runs retain the established Unit 2/Unit 3 ordering warning and the
semantic Unit 1–3 consumption-total warning. Agustus remains registry
`SCHEMA_REVIEW` in this report because dry-run is read-only; its empty
schema/hash review is retryable after current canonical validation and is
resolved atomically by the later authorized sync.

### Importer P2028 remediation (2026-09-15)

The importer still keeps staging, normalized writes, target validation,
cumulative data, and the successful import-run marker in one atomic
per-worksheet transaction. Staging and normalized rows are now written in
parameterized batches of at most 200 rows; the previous sequential
per-record-upsert pattern was removed. The importer timeout remains 30 seconds
and P2028 is not automatically retried. Row-state, worksheet-registry, and
sync-run finalization remain after successful import, as before.

The guarded disposable regression passed for both Juli26-BB and Agustus26-BB
(352 records each; 14 logical transaction calls; 90/105 ms recorded; rollback,
repeat-run idempotency, and zero duplicate business-key groups). These are
local acceptance measurements, not Production latency evidence.

The next Production operation is still two-step: run the exact read-only
Agustus dry-run and fresh target/state verification, then obtain separate
approval before running the explicit write with idempotency verification. This
remediation did not execute or authorize that write.

The targeted state check is read-only and reports the Agustus period/staging/
row-state evidence plus normalized business-key duplicate groups:

```bash
npm run supabase:production:verify-agustus-state
```

On 2026-09-15 it returned `records=0`, `duplicates=0`, and
`productionWrites=0`. The historical `ERROR` registry state still requires
separate operator review before a write can pass the existing gate.

### Guarded stale registry reconciliation (2026-09-15)

The read-only Agustus26-BB forensic audit established that registry row
`3460` (`321088799`) is a stale post-rollback `ERROR`: current canonical
validation is `APPROVED`, the plan is 352/352 valid with zero duplicates, and
Production contains no Agustus rows, staging rows, or row states. The failed
import and sync records remain the authoritative history.

The repository now provides a narrowly scoped application-level recovery path;
discovery itself still preserves `ERROR` and the importer is not bypassed:

```bash
npm run supabase:production:reconcile-agustus-registry
npm run supabase:production:reconcile-agustus-registry -- --approve-metadata-only
```

The first command is a read-only plan. The explicit approval form verifies the
Production target and current stale predicate again, takes the normal source
lease, locks/rechecks the exact row, changes only `ERROR` to `DISCOVERED`, and
resolves existing open schema-review metadata without deleting it. It preserves
the null sync/content/schema state and creates no row state or business data.
The command was not executed against Production in this phase because the task
forbids Production data/registry writes. The registry consequently remains
`ERROR`, and the exact dry-run remains blocked until that separate decision is
made.

For a future environment change, the route must be tested in a local server
with a test-only `CRON_SECRET`. The current schedule is daily at 22:00
UTC (06:00 WITA), not the historical 15-minute schedule described by Phase 17.

## Historical Phase 6J deployment and sync approval boundary

After local gates and disposable PostgreSQL write tests pass, the USER performs
the reviewed Vercel deployment manually. The agent must not change
`vercel.json`, environment variables, secrets, or the Cron schedule. Deployment
does not authorize a Production sync: a new explicit Production sync approval
is required, and post-deployment checks remain read-only until that approval.

## Historical Vercel configuration checklist

The current Production configuration was verified in Phase 6K and the
controlled sync result was verified in Phase 6L. Any later change to
environment variables, credentials, Cron, database endpoints, or source
policy requires a separate reviewed approval and post-change verification.

1. Set `CRON_SECRET` as an encrypted Vercel Environment Variable for the target
   environment.
2. Set the server-only Google Sheets credential path/configuration supported by
   the deployment packaging strategy; a workstation-only credential file is not
   sufficient on Vercel.
3. Set the production PostgreSQL URL with an approved connection-pooling plan.
4. Confirm the service account has read access to the configured spreadsheet.
5. Confirm the Vercel plan/runtime limit is compatible with the selected sync
   duration and daily schedule.

## Phase 5 execution boundary (2026-09-16)

The canonical sync path now resolves target state before planning, persists an
immutable approved plan and bounded batch ledger, resumes only from durable
batch state, and performs read-only target reconciliation. Production writes
remain fail-closed until `CANONICAL_IMPORT_LEDGER_ENABLED=true`, the ledger
tables are deployed, and the exact canary authorization plus approval reference
are present. The lower-level writer and engine enforce the same gate, so a
direct internal caller cannot select the legacy Production path.

The Phase 5 evidence and current blockers are recorded in
`docs/PHASE5_CANONICAL_TARGET_STATE_DURABLE_LEDGER_RESULT.md`.
