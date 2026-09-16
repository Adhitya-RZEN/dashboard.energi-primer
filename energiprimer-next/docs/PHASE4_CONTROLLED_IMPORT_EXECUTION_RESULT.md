# PHASE 4 RESULT

Status: `PASS_WITH_REVIEW`  
Architecture: `PARTIAL_RECONSTRUCTION`  
Automation readiness: `2/4`

## Executive Summary

Phase 4 makes the Google Sheets import lifecycle executable through an explicit
read/write boundary and adds bounded recovery evidence without changing the
Prisma schema or writing Production data.

The important implemented controls are:

- `GET /api/sync/google-sheets` performs target metadata verification and
  read-only discovery or worksheet preflight. It returns `write=NOT_EXECUTED`.
- `POST /api/sync/google-sheets` requires `action=execute-import`, an exact
  worksheet, and a 64-character canonical plan hash. The server rebuilds
  preflight and rejects a stale, blocked, or mismatched plan before entering
  the sync engine.
- Canonical commit results now expose per-batch planned identities, completed,
  failed, unknown, and not-executed states, remaining batches, error codes, and
  retry guidance.
- Unknown transaction outcomes, including P2028 signals, are classified as
  `RECONCILIATION_REQUIRED` and are not blindly retried.
- Pure canonical reconciliation covers exact, missing, unexpected, content,
  and operation mismatches. Existing post-write verification remains read-only.

The live compatibility writer is still the database operation authority. The
canonical repository-neutral batch contract is proven with in-memory test
doubles, while the existing Prisma writer remains a single atomic worksheet
transaction containing set-oriented batches. This is why the result remains
`PASS_WITH_REVIEW` and readiness remains `2/4`.

## Scope

Included:

- explicit HTTP method semantics and request validation;
- read-only GET discovery/preflight and bounded response reporting;
- canonical plan hash admission and source-fingerprint recheck;
- immutable/deterministic plan, identity, provenance, and operation tests;
- bounded canonical batch execution evidence and failure injection;
- recovery classification for known rollback and unknown outcomes;
- read-only canonical and compatibility post-write reconciliation checks;
- local/in-memory performance measurements;
- production target/schema/state read-only verification already established by
  the preceding phases.

Not included:

- a Prisma migration or new durable plan/batch/reconciliation tables;
- a production import or Agustus write;
- Google Sheets mutation;
- unattended scheduling or automatic production self-healing;
- replacement of the compatibility writer with a canonical target adapter;
- destructive repair of historical Production state.

## Existing Execution Path

The current write-capable implementation remains in
`src/services/google-sheets/import/commit.ts`. The sync engine performs Google
reads and planning outside its normalized-data transaction, calls the bounded
compatibility writer, and then persists worksheet/row-state projections.

Phase 4 adds `sync/controlled-execution.ts` as the explicit POST boundary. It
does not rediscover a field from the submitted hash or accept a target/range
from the request body. The hash is an admission assertion against a newly
reconstructed plan.

The existing `vercel.json` schedule still calls the endpoint with GET. Because
GET is now read-only, the schedule is a safe discovery/preflight probe and does
not perform an unattended import.

## Write Boundary

| Entry point | Allowed work | Database write |
| --- | --- | ---: |
| GET | target metadata SELECTs, Google discovery, preflight, immutable plan generation | `0` |
| POST without valid JSON/action/worksheet/hash | request validation only | `0` |
| POST with blocked/stale/mismatched plan | target verification and read-only preflight | `0` import writes |
| POST with admitted plan | explicit sync execution, bounded compatibility writer, state/audit finalization, read-only verification | explicit |
| Local CLI with `--commit` | existing explicit operator workflow | explicit, target-guarded |

All HTTP requests retain the existing environment gate and constant-time
`CRON_SECRET` authorization. The POST body is:

```json
{
  "action": "execute-import",
  "worksheet": "Juli26-BB",
  "importPlanId": "<canonical-plan-sha256>"
}
```

The route does not call `runGoogleSheetsIncrementalSync` or the import writer
from GET. The read-only preflight path uses only SELECT-style Prisma access;
discovery persistence, lease acquisition, sync-run creation, and import writes
are not reachable from GET.

## Plan / Admission

The canonical plan carries source manifest identity, entity, grain, typed value,
business identity, source occurrence/provenance, mapping version, schema
version, parser version, validation result, content hash, operation, and
expected operation counts. The mapping manifest supplies the target field for
the compatibility adapter.

The existing canonical operation names are:

| Phase 4 meaning | Existing contract |
| --- | --- |
| INSERT | `INSERT` |
| UPDATE | `UPDATE` |
| NO-OP | `SKIP` |
| BLOCKED | `BLOCK` |

DELETE is not part of the current Google Sheets import contract. Missing source
rows are not propagated as deletes.

Plans are deep-frozen and hashed from their content. The commit layer verifies
the plan hash and refuses an unapproved or blocked plan. Admission fails closed
for mapping, identity, provenance, validation, schema, registry, source
fingerprint, stale-plan, and unsupported-operation failures.

The current compatibility preflight does not load a complete canonical target
state. It therefore reports canonical candidate operations separately from the
existing sync-row-state INSERT/UPDATE/SKIP classification that controls the
legacy writer. A canonical target-state adapter is a remaining limitation, not
silently inferred as complete.

## Commit Architecture

The repository-neutral `commitApprovedCanonicalPlan()` partitions writable
canonical records into bounded batches and accepts a repository double. For
each batch it validates returned plan hash, entity, business identity, content
hash, source occurrence, and one-observation-per-record coverage before marking
the batch committed.

The current production-compatible path is:

```text
approved canonical plan
        ↓
existing sync-row-state classification
        ↓
filtered legacy import plan
        ↓
commitGoogleSheetsImportPlan()
        ↓
set-oriented Prisma bulk upserts inside one worksheet transaction
```

This preserves the P2028 remediation: no per-row transaction loop and no Google
network call inside the normalized-data transaction.

## Transaction / Batch Strategy

| Boundary | Actual strategy |
| --- | --- |
| Canonical fixture runner | maximum 200 writable records per repository batch; independent batch evidence; exact failed/remaining scope |
| Existing normalized writer | at most 200 rows per set-oriented SQL statement; all populated target statements remain in one worksheet transaction |
| Existing writer timeout | `30,000 ms`; not increased by Phase 4 |
| Discovery persistence | separate set-oriented transaction, `60,000 ms`, not reachable from GET |
| Row-state persistence | separate bounded transaction after successful normalized import |
| Google read/parse/map/validate | outside the normalized-data transaction |
| Failure boundary | canonical fixture batch, or full compatibility worksheet transaction in the current writer |
| Retry boundary | exact missing batch after known rollback; reconcile first for unknown outcome; no blind retry |

The existing database writer is atomic per selected worksheet, not independently
committed per 200-row SQL statement. A constraint failure rolls back that
transaction; an unknown outcome is recorded as requiring reconciliation. The
repository-neutral batch runner demonstrates the finer-grained recovery shape
needed by a future durable canonical adapter.

## Idempotency

The fixture test commits one approved plan twice through an identity-aware
repository double. The first execution produces INSERT observations; the same
plan on retry produces SKIP observations and does not grow the business-key
store. UPDATE planning is also covered with the same business identity and a
changed content hash.

The current compatibility path retains database unique business keys,
set-oriented `ON CONFLICT DO UPDATE`, stable source-row state, and successful
checksum short-circuiting. No delete is attempted. Application memory is not
the sole duplicate protection.

## Failure Handling

| Failure class | Phase 4 handling |
| --- | --- |
| Validation or mapping | block before the writer; no import write |
| Identity/provenance conflict | `BLOCK`; no import write |
| Known database constraint/rollback | record `FAILED`, retain exact failed scope, allow exact-scope retry only |
| P2028/timeout/connection-reset or unknown outcome | `RECONCILIATION_REQUIRED`; no blind retry |
| Eligible Google transient error | existing bounded read retry policy |
| Unknown non-outcome error | fail closed; no automatic replay |

The compatibility import audit no longer claims that every row was rejected
when the transaction outcome is unknown. It records
`RECONCILIATION_REQUIRED` with a reconciliation-required message and preserves
the original error for the caller's safe classification.

## Recovery

The existing Phase 2 lifecycle vocabulary is retained. The canonical batch
result exposes:

- plan hash and import-run correlation;
- batch number and planned entity/business identity/operation;
- `COMMITTED`, `FAILED`, `UNKNOWN`, or `NOT_EXECUTED` batch state;
- committed item count;
- failed batch and remaining batch numbers;
- bounded error code and retry decision.

`decideBatchRecovery()` remains the recovery decision point:

- `ABSENT` → resume the exact missing batch;
- `COMMITTED` → advance state only;
- `CONFLICTING` → block;
- `UNKNOWN` → reconcile first.

The current Prisma schema has no durable canonical batch ledger. `sync_runs` and
`spreadsheet_import_runs` provide existing run/audit evidence, while detailed
per-batch evidence is currently in the repository-neutral execution result and
test doubles. Durable recovery state is a next-phase requirement.

## Reconciliation

`reconcileCanonicalPlan()` is read-only and compares expected versus observed
plan hash, count, entity, business identity, content hash, source occurrence,
and operation. Phase 4 tests cover:

- exact match → `RECONCILED`;
- missing business identity → `RECONCILIATION_REQUIRED`;
- unexpected business identity → `RECONCILIATION_REQUIRED`;
- INSERT/content mismatch → `RECONCILIATION_REQUIRED`;
- UPDATE/content mismatch → `RECONCILIATION_REQUIRED`.

`verifyWorksheetSyncAfterWrite()` remains a read-only compatibility verifier for
sync-run counters, worksheet registry state, stable row states, and successful
import-audit traceability. It performs no corrective write. A discrepancy is
reported for review rather than repaired automatically.

Full per-target canonical value/provenance reconciliation is not yet available
for every legacy table. In particular, the current compatibility writer does
not return canonical observations for all target rows, and the coal target
provenance bridge remains a known limitation.

## Production Verification

No Phase 4 Production import or write was executed. The retained read-only
verification evidence covers:

- Supabase transaction-pooler target identity and required-table checks;
- Production schema parity: 31/31 tables, 278/278 columns, 31/31 primary-key
  checks, 21/21 foreign-key checks, and 44/44 index checks;
- Agustus26-BB read-only state: no business/evidence rows, no duplicate groups,
  and `productionWrites=0` in the prior forensic verification;
- no Google Sheets writes, schema changes, migrations, deletes, truncates, or
  historical repair.

The full Agustus execution remains deliberately unperformed. A future run must
be separately authorized after fresh read-only preflight, plan/hash approval,
identity/provenance review, and a reversible canary decision.

Fresh read-only probes on 2026-09-16 returned:

| Worksheet | Preflight | Evidence | Write |
| --- | --- | --- | --- |
| `Juli26-BB` | `PASS` | 352 valid records; canonical plan `302 INSERT / 0 UPDATE / 50 SKIP / 0 BLOCK` | `NOT EXECUTED` |
| `Agustus26-BB` | `BLOCKED` | 352 valid records but registry status `SCHEMA_REVIEW`; canonical plan not admitted | `NOT EXECUTED` |

The Agustus `SCHEMA_REVIEW` blocker was not changed or bypassed.

## Test Results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | `PASS` | `node_modules\\.bin\\tsc.cmd --noEmit` |
| Lint | `PASS` | `npm.cmd run lint` |
| Phase 2 canonical contract | `PASS` | `npm.cmd run phase2:verify` |
| Phase 3 deterministic mapping | `PASS` | `npm.cmd run phase3:verify` |
| Phase 4 controlled fixtures | `PASS` | `npm.cmd run phase4:verify` |
| Dynamic parser | `PASS` | `npm.cmd run dynamic:verify` |
| Legacy mapping | `PASS` | `npm.cmd run bb:mapping:test` |
| Schema detection | `PASS` | `npm.cmd run sync:verify-schema` |
| Auto-admission | `PASS` | `npm.cmd run sync:verify-auto-admission` |
| GET/preview write safety | `PASS` | `npm.cmd run sync:verify-preview-write-safety`; `databaseWrites: 0` |
| Cron authentication | `PASS` | `npm.cmd run sync:verify-cron-auth` |
| Prisma validation | `PASS` | `npm.cmd run db:validate` |
| Build | `PASS` | `npm.cmd run build` |
| Diff hygiene | `PASS` | `git diff --check` |

No failure was injected into Production. Failure injection used only in-memory
repository doubles.

## Performance Results

The Phase 4 fixture reports separate elapsed measurements for a five-record
in-memory path. One representative run returned:

| Stage | Time |
| --- | ---: |
| Mapping | 0.21 ms |
| Validation | 0.01 ms |
| Planning | 0.30 ms |
| Commit fixture | 0.63 ms |
| Reconciliation | 0.81 ms |

These are local fixture timings, not Production latency targets. The bounded
commit test also proves a 201-record plan is partitioned as `[200, 1]`. The
existing disposable PostgreSQL evidence from the preceding phase recorded
90/105 ms for the two 352-record local cases; it remains non-Production
evidence.

## Known Limitations

1. The canonical compatibility plan defaults to no loaded canonical target
   state; live INSERT/UPDATE/SKIP authority remains the existing sync-row-state
   classifier and legacy writer.
2. The current database writer is atomic per worksheet with internal 200-row
   SQL batches, not a durable independently committed canonical batch ledger.
3. No Prisma schema or migration was authorized, so plan, batch, and
   reconciliation state is not durable as a first-class model.
4. Post-write verification is read-only but does not yet compare every legacy
   target value and full canonical provenance observation.
5. The existing Vercel GET schedule is now read-only; explicit POST execution
   must be separately invoked and authorized.

## Remaining Risks

1. A live Production canary has not proven the new HTTP POST path.
2. A future canonical target adapter could change operation classification unless
   its existing-state and identity contract is completed first.
3. Unknown transaction outcomes require operator reconciliation because durable
   per-batch evidence is not yet present.
4. The current compatibility writer's broad worksheet transaction remains
   sensitive to pool capacity and the 30-second transaction boundary.

## Automation Readiness

```text
0 = unknown
1 = manual/read-only
2 = controlled preflight/import
3 = repeatable controlled production automation
4 = unattended monitored automation
```

Readiness is `2/4`. Deterministic mapping, immutable plan admission, explicit
POST semantics, bounded commit logic, recovery classification, and fixture
reconciliation are evidenced. Readiness is not raised to `3/4` because the
canonical operation authority, durable recovery ledger, complete target-level
reconciliation, and authorized repeatable Production canary remain unresolved.

## Next Phase Recommendation

1. Define and review the canonical target adapter and load existing target state
   without weakening identity or provenance checks.
2. Add an approved expand/contract migration for durable plan, batch, approval,
   and reconciliation state only if operational authority requires it.
3. Add disposable PostgreSQL integration tests that observe actual target
   identities, values, retries, and rollback boundaries.
4. Run a separately authorized, narrow, reversible Production canary with
   read-only reconciliation and explicit rollback criteria.
5. Keep the Vercel GET schedule read-only until an explicitly controlled POST
   caller and monitoring/approval process are in place.

## Actual Architecture Diagram

```text
                         ┌────────────────────┐
                         │   Google Sheets    │
                         └─────────┬──────────┘
                                   │ read-only
                                   ▼
                         ┌────────────────────┐
                         │ Source discovery   │
                         │ / target SELECTs   │
                         └─────────┬──────────┘
                                   │
             GET                   │                   POST
   ┌───────────────────────┐       │       ┌─────────────────────────┐
   │ discovery / preflight  │◄──────┴──────►│ action=execute-import   │
   │ immutable plan report  │               │ worksheet + plan hash   │
   │ 0 import writes        │               └────────────┬────────────┘
   └───────────────────────┘                            │ rebuild + admit
                                                        ▼
                                             ┌─────────────────────────┐
                                             │ Canonical mapping/domain │
                                             │ validation + hash gate   │
                                             └────────────┬────────────┘
                                                          │
                                                          ▼
                                             ┌─────────────────────────┐
                                             │ Existing bounded writer  │
                                             │ <=200-row SQL batches    │
                                             │ one worksheet transaction│
                                             └──────┬──────────┬─────────┘
                                                    │          │
                                             success│          │failure/unknown
                                                    ▼          ▼
                                             ┌──────────┐ ┌──────────────┐
                                             │ read-only│ │ recovery     │
                                             │ verify   │ │ / reconcile  │
                                             └────┬─────┘ └──────┬───────┘
                                                  └──────┬───────┘
                                                         ▼
                                             ┌─────────────────────────┐
                                             │ Final result / operator │
                                             │ review; no auto-repair  │
                                             └─────────────────────────┘
```

## Final Safety Record

```text
Write boundary: PASS
GET production writes: 0 (read-only path; no Phase 4 production route write executed)
POST explicit write: PASS (implemented; not invoked against Production)
Production INSERT: NOT EXECUTED
Production UPDATE: NOT EXECUTED
Production DELETE: NOT EXECUTED
Production UPSERT: NOT EXECUTED
Schema changes: 0
Migration: 0
Google Sheets writes: 0
Agustus import: NOT EXECUTED
```
