# PHASE 5 RESULT

Date: 2026-09-16

## Status and decision

Phase 5 is `PASS_WITH_REVIEW`. The canonical target-state adapter, immutable
plan integration, bounded durable-ledger implementation, conservative restart
recovery, read-only target reconciliation, and Production canary gates are
implemented and covered by local fixtures. Production execution remains
blocked: the ledger tables are not deployed, the exact canary authorization is
absent, and the current Juli target-aware preflight found a real provenance
conflict. No Production write, migration, schema change, or Google Sheets write
was performed.

The architecture remains `PARTIAL_RECONSTRUCTION`. The existing bulk importer
is retained as a one-way compatibility writer behind the canonical boundary;
the legacy coal tables still do not carry complete source/provenance columns.

## Scope and invariant

The implemented path is:

```text
Google Sheets read
  -> discovery and approved mapping
  -> canonical records and source manifest
  -> canonical target-state SELECTs
  -> deterministic target diff
  -> immutable approved plan
  -> explicit admission / POST canary gate
  -> bounded durable batches
  -> compatibility writer
  -> durable batch observations
  -> read-only target reconciliation
  -> verifiable result
```

The target-state layer is independent of UI state and arbitrary sync-row
position. It resolves canonical business identity against the normalized target
models and records target model, existence, values, source/provenance,
last-known sync state, last sync marker, version marker, target id, and blocking
issues. Values that cannot be derived are represented as `NOT AVAILABLE`; the
current normalized tables do not provide an authoritative sync-state or
separate sync-completion timestamp, so `lastKnownSyncState` and `lastSyncAt`
are intentionally `NOT AVAILABLE`.

The deterministic diff vocabulary is:

```text
INSERT | UPDATE | NO-OP | SKIP | BLOCK
```

There is no `DELETE` operation. Ambiguous target identity, unresolved identity,
duplicate matches, conflicting provenance, invalid canonical records, and
blocked plans fail closed.

## Target-state and live preflight evidence

The new target repository performs one exact Unit lookup and at most one
set-oriented query per represented canonical entity. The live Juli read-only
preflight resolved all 352 canonical identities in 11 target queries:

| Evidence | Result |
| --- | ---: |
| Worksheet | `Juli26-BB` |
| Source rows / candidate / valid records | 31 / 352 / 352 |
| Invalid rows / duplicate source keys | 0 / 0 |
| Target states read | 352 |
| Target lookup queries | 11 |
| Target lookup duration | 2,350.34 ms |
| Target diff INSERT / UPDATE | 0 / 116 |
| Target diff NO-OP / SKIP | 185 / 50 |
| Target diff BLOCK | 1 |
| Write | `NOT EXECUTED` |

The one blocked identity is the plant biomass target for 2026. Its current
target row is linked to `April26-BB`, while the approved current source is
`Juli26-BB`; the target-aware planner emits `PROVENANCE_ERROR` and does not
overwrite it. The resulting canonical plan is `PLANNED`, not approved, with
`0 INSERT`, `116 UPDATE`, `235 SKIP`, and `1 BLOCK`.

The live Agustus read-only audit remains conservative:

```text
worksheet: Agustus26-BB
worksheetKey: 321088799
registry: SCHEMA_REVIEW
source rows / candidate / valid records: 31 / 352 / 352
invalid rows / duplicate source keys: 0 / 0
Production Agustus target/staging/row-state evidence: 0
duplicate target groups: 0
Production writes: 0
```

Agustus was not remapped, retried, imported, or otherwise bypassed.

## Durable ledger and recovery

The application schema contains additive `CanonicalImportRun` and
`CanonicalImportBatch` models. The run records the plan id/hash, immutable plan
snapshot, source manifest, mapping/schema/parser fingerprints, source identity,
approval, planned counts, execution id, timestamps, and failure state. Each
batch records order, plan hash, affected business-key manifest, item count,
status, attempt/heartbeat timestamps, execution owner, retryability, failure
details, committed item count, and observation snapshot. Batch manifests and
batch-level committed counts are authoritative; no separately maintained run
aggregate can drift from the durable batch ledger.

The supported run states are:

```text
APPROVED -> COMMITTING -> COMMITTED -> RECONCILED
                    \-> FAILED -> COMMITTING (explicit recovery only)
                    \-> RECONCILIATION_REQUIRED
```

The batch states are `PENDING`, `RUNNING`, `COMMITTED`, `FAILED`, and
`RECONCILIATION_REQUIRED`. A failed run cannot silently resume. A recent
`RUNNING` heartbeat remains owned by its active worker; a stale running batch
is marked reconciliation-required before any retry. Committed batches are
skipped, known rolled-back failures retry in exact scope, and unknown outcomes
require target evidence before retry. An observation or plan-hash mismatch is
not repaired automatically.

The bounded executor partitions writable canonical items into batches of at
most 200. The existing compatibility writer remains set-oriented and bounded;
there is no whole-import transaction around the Phase 5 batch lifecycle. The
ledger transition methods use conditional state updates in the Prisma adapter;
the business writer and ledger are intentionally reconciled conservatively if
the process stops between their separate short transactions.

The compatibility writer's read-after-write probe may describe a successfully
verified writable row as final-state `SKIP`; the executor normalizes that
observation to the approved `INSERT`/`UPDATE` operation before persisting the
batch count, without issuing another write.

Local Phase 5 fixtures pass for:

* immutable plan snapshot/hash association;
* `PENDING -> RUNNING -> COMMITTED` lifecycle;
* committed-batch skip on repeat execution;
* known constraint failure followed by exact-scope retry;
* unknown timeout followed by read-only `COMMITTED` evidence;
* active-worker ownership protection;
* unexpected identity, duplicate/ambiguous identity, value, and provenance
  reconciliation cases;
* absent canary authorization and maximum-scope enforcement.

## Target reconciliation

Reconciliation is read-only. It compares the approved plan with actual target
state and reports missing, unexpected, ambiguous, existence, value, and
provenance mismatches. It returns `RECONCILIATION_REQUIRED` /
`RECONCILIATION_MISMATCH` evidence; it does not insert, update, delete, upsert,
or auto-fix a discrepancy.

The local Phase 5 verifier exercises `INSERT` match, `UPDATE` value mismatch,
NO-OP mismatch, missing state, unexpected identity, duplicate identity, and
provenance conflict. The live Juli preflight also demonstrates the intended
behavior for a real target provenance conflict. A post-write Production
reconciliation could not be evidenced because the canary was not executed.

## Production canary boundary

The canary requires all of the following:

```text
GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION=
  I_ACKNOWLEDGE_PHASE5_PRODUCTION_CANARY
GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF=<non-empty approved reference>
CANONICAL_IMPORT_LEDGER_ENABLED=true
GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS=1..25
```

The explicit HTTP POST still requires the existing deployment and cron-secret
authentication, an exact worksheet, and the immutable canonical plan id. The
CLI requires an explicit Production target and local operator execution. The
engine and lower-level writer enforce the same canary and durable-ledger gate,
so an internal direct writer call cannot select the legacy Production path.

The canary was not executed. No authorization, approval reference, ledger
capability, narrow approved scope, or clean Juli admitted plan was available.
The controlled result is therefore `BLOCKED` / `NOT EXECUTED` with
`productionWrites: 0`.

## Production read-only evidence

All checks in this section used read-only metadata or data `SELECT`s:

| Check | Result |
| --- | --- |
| Supabase target | `aws-0-ap-southeast-1.pooler.supabase.com:6543`, database `postgres`, schema `public`, role `postgres`, PostgreSQL `17.6` |
| Pooler TLS parameter | `sslmode=verify-full`; pooler backend SSL session not reported |
| Runtime normalized baseline | `stableDataRows: 2406`; KPI/dashboard parity PASS |
| Production schema history | PASS; only `20260901130000_production_schema_baseline` |
| Phase 5 ledger capability | `canonical_import_runs` and `canonical_import_batches`: absent |
| Agustus registry/state audit | PASS read-only; remains `SCHEMA_REVIEW`; zero Agustus evidence |
| Juli target-aware preflight | Read-only completed; blocked by one `PROVENANCE_ERROR`; zero writes |

The separate `prisma/production/schema.prisma` and
`prisma/production/migrations/` contract was not changed. The additive ledger
migration at
`prisma/migrations/20260916100000_add_canonical_import_ledger/migration.sql`
is an application/local artifact only and was not applied to Production.

## Performance reporting

No Production commit latency is claimed. The available measurements are kept
separate:

| Stage | Evidence |
| --- | --- |
| Target-state lookup | 2,350.34 ms, 11 queries for Juli read-only preflight |
| Canonical planning | Included in the read-only preflight; not separately timed in this run |
| Batch commit | Production `NOT EXECUTED`; prior local bounded writer evidence remains non-Production |
| Ledger persistence | Production `NOT EXECUTED`; local lifecycle fixture PASS |
| Target reconciliation | Production post-write `NOT EXECUTED`; read-only mismatch fixture PASS |
| Total Production execution | `NOT EXECUTED` |

## Conservative gates

Gate 1 is satisfied by the canonical target adapter, deterministic identity
lookup, live 352-state read, and blocking provenance behavior. Gate 2 is
satisfied by the implementation and local ledger fixture, but Production
readiness remains dependent on deploying the additive ledger tables. Gate 3
and Gate 4 are satisfied as implementation/fixture gates with conservative
unknown-outcome handling. Gate 5 is not executed. Gate 6 therefore fails and
automation readiness remains `2/4`.

## Final result format

```text
# PHASE 5 RESULT

Status:
PASS_WITH_REVIEW

Architecture:
PARTIAL_RECONSTRUCTION

Automation readiness:
2/4

Gate 1 - Target-State Integrity:
PASS

Gate 2 - Durable Ledger:
PASS

Gate 3 - Restart-Safe Recovery:
PASS

Gate 4 - Target Reconciliation:
PASS

Gate 5 - Production Canary:
NOT_EXECUTED

Gate 6 - Automation Readiness:
FAIL

Canonical target-state:
PASS

Compatibility dependency:
PRESENT

Durable batch ledger:
PASS

Restart recovery:
PASS

Idempotency:
PASS

Target reconciliation:
PASS

Production canary:
NOT EXECUTED

Production INSERT:
0

Production UPDATE:
0

Production DELETE:
0

Production UPSERT:
0

Schema changes:
0 Production; 2 pending application ledger tables

Migration:
0 applied to Production

Google Sheets writes:
0

Critical findings:
1. Production does not contain the two Phase 5 durable ledger tables.
2. Juli target-aware preflight blocks the 2026 biomass target because its
   existing provenance points to April26-BB rather than Juli26-BB.
3. Agustus26-BB remains SCHEMA_REVIEW and has zero Production data/staging/
   row-state evidence; legacy coal targets still lack complete provenance.

Remaining blockers:
1. Apply the reviewed additive application ledger migration to the intended
   Production target, then rerun the read-only capability and schema checks.
2. Resolve the Juli target provenance ownership decision and obtain explicit
   approval for a narrow <=25-record canary; do not bypass the block or Agustus
   SCHEMA_REVIEW.

Known limitations:
1. No Production post-write reconciliation or commit latency is available
   because the canary was not executed.
2. `lastSyncAt` is `NOT AVAILABLE` for current normalized target rows because
   row `updatedAt` is not treated as a sync-completion marker.
3. The compatibility writer remains necessary until legacy coal provenance and
   the Production ledger rollout are separately completed.

Validation:
- TypeScript: PASS (`tsc --noEmit`)
- Lint: PASS (`npm run lint`)
- Build: PASS (`npm run build`)
- Prisma: PASS (`npm run db:validate`; Production schema history read-only PASS)
- Phase 2: PASS (`npm run phase2:verify`)
- Phase 3: PASS (`npm run phase3:verify`)
- Phase 4: PASS (`npm run phase4:verify`)
- Phase 5: PASS (`npm run phase5:verify`)
- Production read-only: PASS; Juli preflight correctly BLOCKED by provenance
- Production canary: NOT EXECUTED; Production writes 0

Documentation:
- Created: this Phase 5 result, target/ledger implementation notes, and the
  reproducible `phase5:verify` plus Production ledger capability verifier
- Updated: `GOOGLE_SHEETS_SYNC_SCHEDULER.md`,
  `GOOGLE_SHEETS_INCREMENTAL_SYNC.md`, and `PROJECT_MAP.md`

Next recommended phase:
Deploy and verify the reviewed additive ledger schema in a separate change
window; resolve the explicit Juli provenance decision; then perform only a
narrow, explicitly authorized Production canary with bounded commit,
durable-ledger evidence, read-only reconciliation, and a repeat-plan
idempotency check. Keep Agustus in `SCHEMA_REVIEW` until its mapping is
explicitly approved.
```
