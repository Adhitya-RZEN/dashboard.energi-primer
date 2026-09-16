# Phase 1 — Transaction and Recovery Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**

This document designs transaction boundaries and recovery semantics for the Google Sheets import/sync pipeline. Phase 2 implements repository-neutral bounded commit and recovery decisions; it does not change Prisma, migrations, PostgreSQL/Supabase, Google Sheets, environment, API, cron, registry, or production data.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

The existing import writer and row-state orchestration remain the compatibility path and were not executed against production in this phase.

### PHASE 2 IMPLEMENTATION

`canonical/commit.ts` caps commit batches at 200 records and requires an approved plan hash. `canonical/recovery.ts` models lifecycle transitions, classifies unknown outcomes such as P2028 as `RECONCILIATION_REQUIRED`, and allows retry only after exact evidence. The interfaces contain no Prisma or database calls.

### FUTURE WORK

Implement the reviewed repository/use-case adapter with intent, bounded batch, and reconciliation state persistence. Resolve atomicity and repair semantics for business rows versus row state before controlled production use.

## 1. Source evidence

| Evidence | Current behavior |
| --- | --- |
| `src/services/google-sheets/import/commit.ts:147-182` | Exact successful checksum is reused; a `PROCESSING` import run is created before the main transaction |
| `src/services/google-sheets/import/commit.ts:184-303` | One interactive transaction currently contains staging batches, bulk domain upserts, target/cumulative upserts, and success finalization; failure then updates the run to `FAILED` |
| `src/services/google-sheets/import/bulk-upserts.ts:22-51,268-327` | Row-heavy writes use parameterized raw SQL in fixed batches of 200 |
| `src/services/google-sheets/sync/engine.ts:112-168` | Row states and worksheet/schema metadata are persisted in a separate 30-second transaction with one upsert per changed row |
| `src/services/google-sheets/sync/discovery.ts:237-404` | Discovery registry persistence is a separate transaction with `maxWait=10s`, `timeout=60s` |
| `src/services/google-sheets/sync/lease.ts:19-80` | Source bootstrap and source-wide lease are separate writes/conditional operations |
| `docs/GOOGLE_SHEETS_SYNC_AUDIT.md` | 2026-09-15 P2028 timeout incident and bulk-upsert remediation evidence |
| `src/services/google-sheets/sync/retry.ts` | Selected transient DB errors retry; P2028 is not retried |

## 2. Current state and problem

The current main transaction is safer than the historical per-record implementation because staging and bulk domain writes roll back together. It still has a large logical scope: all staging batches, all entity-table statements, target/cumulative work, and final import-run success are held inside one interactive transaction with a 30-second timeout (`commit.ts:184-265`).

The row-state transaction is separate and loops individual upserts (`engine.ts:112-168`). This is a remaining latency hotspot and creates a recoverable but non-atomic boundary:

```text
business rows committed
  + import run successful
  → row state fails or is incomplete
  → business state and sync provenance temporarily disagree
```

The 2026-09-15 production incident shows why a timeout must not be treated as a safe retry. A P2028 response says the client lost the expected transaction outcome; it does not prove that no database statement applied. Blind retry can duplicate or overwrite without reconciliation.

## 3. Transaction design principles

The target is:

- **bounded:** each transaction has a predictable maximum row/statement budget;
- **observable:** every transaction belongs to an import run, plan hash, and batch number;
- **recoverable:** unknown outcomes enter reconciliation rather than blind retry;
- **idempotent:** repeating a known plan/batch has the same business result;
- **source-safe:** no source read occurs inside a database transaction;
- **scope-safe:** registry, business, row-state, and reconciliation records have explicit ownership.

## 4. Target transaction boundaries

The following three boundaries are preferred. They are a design contract, not current behavior.

### Transaction A — intent and approval claim

| Field | Contract |
| --- | --- |
| Scope | Small metadata transaction: create/claim an import intent, plan hash, source manifest reference, mapping/schema/parser versions, requested/effective period, approval state, and execution idempotency key |
| Maximum expected rows | O(1) plan header; no source reads; no business-domain batch |
| Atomic unit | One approved plan claim for one source/worksheet/effective period |
| Failure behavior | No business mutation; intent is `FAILED` or can be safely retried if no claim was recorded |
| Retry rule | Retry only when the claim outcome is known not to exist; unique intent key resolves concurrent attempts |
| Existing projection | `SpreadsheetImportRun` header plus current checksum fields; current schema lacks a dedicated plan/approval object |

The claim must be atomically unique on the execution intent/plan hash. A check-then-insert idempotency pattern is not sufficient; the database unique constraint must select the winner. The client-provided/request-originated idempotency key must be reused for retries, not regenerated by the retrying layer.

### Transaction B — one bounded business batch

| Field | Contract |
| --- | --- |
| Scope | One bounded batch for one approved plan: staging evidence plus the corresponding normalized/compatibility upserts |
| Maximum expected rows | At most 200 source rows per SQL batch, subject to measured statement/time budget |
| Atomic unit | Batch staging and business projection commit together |
| Failure behavior | Known rollback → batch remains uncommitted; unknown outcome → `RECONCILIATION_REQUIRED` |
| Retry rule | Retry only after exact plan/batch reconciliation proves no partial effect or confirms idempotent prior success |
| Source reads | None inside transaction |
| Existing projection | Current `commitGoogleSheetsImportPlan()` uses one transaction for all entity batches; target splits by bounded batch/checkpoint |

The business batch must use the approved plan rows exactly. It must not call the parser, resolver, Google API, or source fallback. Bulk SQL remains preferred, with parameterized queries and the existing unique constraints.

### Transaction C — state and reconciliation finalization

| Field | Contract |
| --- | --- |
| Scope | Row-state changes, worksheet content/schema observation, import-run batch counters, and reconciliation result |
| Maximum expected rows | One source/worksheet change set, bulked by fixed size |
| Atomic unit | State projection for a plan whose business batches are already known |
| Failure behavior | Business rows remain untouched; run becomes `RECONCILIATION_REQUIRED` |
| Retry rule | Safe to retry after verifying the plan hash and source/worksheet identity; no business re-import |
| Existing projection | `persistRowStates()` is separate but uses per-row upserts and also updates worksheet hashes in one 30-second transaction |

Transaction C may be retried independently because it only advances provenance/state after business evidence exists. If its result is unknown, reconcile state and domain rows before retrying.

## 5. Registry and lease boundaries

Registry discovery and lease are not part of the business batch:

```text
target verification
  → source bootstrap
  → acquire source lease
  → read metadata outside transaction
  → persist registry observation
  → prepare/read/parse/plan outside transaction
  → Transaction A
  → Transaction B per bounded batch
  → Transaction C / reconciliation
  → release lease
```

The current source bootstrap can upsert before lease acquisition (`sync/lease.ts:19-44`; `engine.ts:624-732`). This is acceptable only as metadata preparation; it must not be interpreted as business approval. A stale `ERROR` or `SCHEMA_REVIEW` registry state must never be bypassed by a business commit.

## 6. State machine and failure recovery

```text
PLANNED
  ├─ validation/approval failure → BLOCKED
  ├─ claim failure with no side effect → FAILED → safe retry by policy
  └─ claim success → APPROVED → COMMITTING

COMMITTING
  ├─ known transaction rollback → FAILED
  ├─ all batches known committed → COMMITTED
  ├─ business outcome unknown → RECONCILIATION_REQUIRED
  └─ process crash → RECONCILIATION_REQUIRED

COMMITTED
  ├─ state/reconciliation complete → RECONCILED
  └─ state missing/mismatch → RECONCILIATION_REQUIRED

RECONCILIATION_REQUIRED
  ├─ evidence proves missing batch → RESUME missing batch
  ├─ evidence proves batch already committed → advance state only
  ├─ evidence proves conflict/duplicate → BLOCK and investigate
  └─ evidence insufficient → remain blocked; no blind retry
```

### 6.1 Recovery decision table

| Failure point | Evidence to inspect | Allowed outcome | Forbidden outcome |
| --- | --- | --- | --- |
| Before business commit | Plan claim, import run, approval, no batch evidence | Mark FAILED or retry same plan intent | Reparse and silently create a new plan |
| During Transaction B with known rollback | Transaction error and no committed batch evidence | Retry exact batch if idempotency claim permits | Change mapping or retry a different plan |
| During Transaction B with timeout/unknown result | Batch staging/domain key counts, content/provenance, DB transaction/run evidence | `RECONCILIATION_REQUIRED`; resume only missing work | Blind full-plan retry |
| After business commit, before state finalization | Import run, domain rows, batch evidence, row-state coverage | Transaction C/state-only retry or reconcile | Rewrite business rows unnecessarily |
| Process crash with `COMMITTING` | Lease/run age, batch checkpoints, plan/source/schema/content hashes | Reconcile then resume or fail | Assume rollback from process exit |
| Registry write failure before plan approval | Registry status/hash/change record | Keep write blocked; metadata-only reconciliation later | Reset ERROR/SCHEMA_REVIEW automatically |
| Partial source read/parser failure | Read snapshot and diagnostics | FAILED/BLOCKED; no business write | Use previous worksheet unless fallback policy explicitly applies |

## 7. P2028 policy

P2028 is an **unknown-outcome** error for the transaction boundary. It is not in the current database retry list (`src/services/google-sheets/sync/retry.ts`). The target contract retains that non-retry rule and adds a required reconciliation path:

1. mark the import/run outcome as `RECONCILIATION_REQUIRED` if the outcome cannot be proven;
2. inspect batch/run/staging/domain/state evidence by exact plan hash and business keys;
3. classify each batch as committed, absent, conflicting, or unknown;
4. resume only absent idempotent batches under the same approved plan;
5. keep conflicting/unknown batches blocked for operator review.

The prior bulk remediation is retained as an implementation input, not a proof that any future transaction is below the limit. The budget must be measured on the target pooler with production-like row counts.

## 8. Lease and concurrency contract

- One source-wide lease prevents concurrent discovery/sync for the same workbook.
- A lease expiry does not prove the prior run rolled back.
- A second attempt must inspect the prior run/plan outcome before acquiring a new business claim.
- A duplicate approved plan intent must return the existing result or a deliberate pending/conflict outcome; it must not enter a second business commit.
- Lease release is cleanup, not a success signal; run/reconciliation state is authoritative.

## 9. Current state versus target state

### Current state

- Bulk normalized SQL runs inside one 30-second interactive transaction.
- Import run header is created before the main transaction.
- Row-state writes are separate, per-row, and 30-second bounded.
- P2028 is not retried, but there is no fully specified recovery state/contract.
- Registry and lease operations are separate from business commit.

### Target state

- A small approved intent is claimed once.
- Business writes are bounded per batch and linked to a plan/batch checkpoint.
- State finalization is independently retryable and reconciliable.
- Unknown outcomes never trigger blind replay.
- All recovery decisions use plan hash, batch evidence, business keys, and source ownership.

### Future work after Phase 2

Phase 2 supplies repository-neutral bounded commit and recovery interfaces. A durable plan/batch/approval state, row-state repository, and application integration remain for a separately reviewed implementation.

## 10. Decision and rationale

Adopt bounded per-batch business transactions plus a separate, retryable state/reconciliation transaction. Keep the current bulk SQL and source lease concepts. Do not expand the interactive transaction timeout as the primary remedy, and do not retry unknown transaction outcomes without evidence.

This addresses the documented P2028 failure while preserving atomic staging/business behavior at the smallest useful unit and allowing row-state repair without re-importing business data.

## 11. Not verified

- Actual pooler transaction budgets under a full production-sized plan were not measured in this design phase.
- The current schema has no dedicated batch checkpoint/plan approval table.
- Exact PostgreSQL transaction outcome semantics for every provider/network failure mode require a controlled disposable test and production-like integration test.
- Recovery simulation passes in `scripts/verify-phase2-canonical-contract.ts` for known failure, unknown P2028 outcome, duplicate retry, and missing reconciliation evidence.
- Agustus production eligibility remains **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 12. Future work after Phase 2

The compatibility writer remains in `import/commit.ts`; Phase 2 repository-neutral commit/recovery lives under `src/services/google-sheets/canonical/`. Durable batch/reconciliation/provenance state and production integration require separate schema review. No production write is included here.

## 13. Acceptance criteria for the design

- [ ] Transaction A, B, and C have distinct scopes, row budgets, failure behavior, and retry rules.
- [ ] No source API/read occurs inside a business transaction.
- [ ] P2028/timeout/unknown outcomes enter reconciliation rather than blind retry.
- [ ] Business commit and row-state finalization can be reconciled independently.
- [ ] Source lease expiry is not treated as rollback evidence.
- [ ] The target preserves fixed-batch bulk writes and adds measured budgets.
- [ ] Recovery can resume only missing idempotent batches under the original approved plan.

## 14. Open questions

1. Should the plan/batch checkpoint be persisted in PostgreSQL or in a durable operator artifact initially?
2. What maximum batch size meets the pooler latency budget for each entity/table?
3. How long should `COMMITTING` runs remain eligible for reconciliation before being declared abandoned?
4. Which operator role may resolve an unknown transaction outcome?
