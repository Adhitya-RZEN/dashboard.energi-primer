# Phase 1 — Import and Sync Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**

This document defines the canonical import lifecycle and deterministic synchronization behavior. Phase 2 implements the plan/lifecycle boundary but does not invoke a production write. No source data, schema, migration, database, Google Sheets, environment, API, cron, registry, or Agustus state was changed.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

The existing `GoogleSheetsImportPlan` and current writer remain compatible application paths. They are not silently replaced by the Phase 2 repository boundary.

### PHASE 2 IMPLEMENTATION

`canonical/import-plan.ts` creates a deterministic, deeply frozen plan with explicit `INSERT`, `UPDATE`, `SKIP`, and `BLOCK` operations. `canonical/from-import-plan.ts` adapts the current typed plan one way. Plan approval is required before `canonical/commit.ts` can call a bounded repository; commit does not reparse Sheets or rerun heuristic mapping.

### FUTURE WORK

Introduce a reviewed application/use-case adapter and controlled test-database repository, then reconcile row-state and business persistence under the approved lifecycle before production cutover.

## 1. Source evidence

| Evidence | Current behavior |
| --- | --- |
| `src/services/google-sheets/import/types.ts:91-125` | Current `GoogleSheetsImportPlan` contains requested/effective period, range, status, row families, staging rows, and counters |
| `src/services/google-sheets/import/plan.ts:326-752` | Plan builds ten entity families, applies validation gates, and emits `READY_FOR_IMPORT` or `NEEDS_REVIEW` |
| `src/services/google-sheets/sync/engine.ts:377-621,624-995` | Automatic sync reads exact worksheets, applies canonical policy, classifies rows, commits changes, persists row state, and finalizes run status |
| `src/services/google-sheets/sync/change-detection.ts:31-66` | Current actions are INSERT, UPDATE, SKIP; duplicate keys in the current plan are collected |
| `src/services/google-sheets/import/commit.ts:138-303` | Current commit checks target/plan/checksum, creates an import run, writes inside a transaction, and marks success/failure |
| `src/services/google-sheets/sync/bb-policy.ts:204-313` | Automatic future BB admission is period and canonical-schema gated |
| `src/services/google-sheets/sync/retry.ts` | Selected Google/database failures retry; P2028 is not retried |
| `docs/DATA_FLOW_MAP.md` and `docs/AUTOMATION_COMPLEXITY_AUDIT.md` | Phase 0 flow, transaction, provenance, and failure findings |

## 2. Current state

The current system has separate but related state machines:

| Current artifact | Current statuses/meaning | Limitation |
| --- | --- | --- |
| `SyncWorksheet.status` | `DISCOVERED`, `VALIDATED`, `ACTIVE`, `SCHEMA_REVIEW`, `MISSING`, `DISABLED`, `ERROR` | Registry health, not full import lifecycle |
| `SpreadsheetImportRun.status` | `PROCESSING`, `SUCCESS`, `FAILED` in current usage | No explicit planned/committing/reconciliation state |
| `GoogleSheetsImportPlan.status` | `READY_FOR_IMPORT`, `NEEDS_REVIEW` | In-memory plan; no immutable approved plan artifact |
| `SyncRun.status` | String status for orchestration, including running/success/failure/lock outcomes | Exact status contract is not a Prisma enum |
| `SyncRowState` | Last content hash/last-seen/synced per worksheet/source key | Persisted separately from main import transaction |
| `SyncSchemaChange.status` | Schema review/resolution evidence | Mapping approval is not the same as schema change status |

The current checksum shortcut is useful: an exact successful source/range/period/checksum returns the prior import result (`import/commit.ts:147-168`). It is not a substitute for an immutable plan, complete source provenance, or post-write reconciliation.

### 2.1 Problem statement

The current plan, import-run, worksheet, row-state, and schema-review statuses describe related concerns but do not form one explicit lifecycle. Without a durable approved plan and reconciliation state, a commit or retry can be correct in isolation while the overall import outcome remains ambiguous.

## 3. Target canonical lifecycle

The target lifecycle is:

```text
DISCOVERED
    ↓
READ
    ↓
PARSED
    ↓
VALIDATED
    ↓
PLANNED ───────────────→ BLOCKED
    ↓                         ↑
APPROVED ─────────────────────┘
    ↓
COMMITTING
    ↓
COMMITTED ─────────────→ RECONCILIATION_REQUIRED
    ↓                              ↓
RECONCILED                    RECONCILED

Any unexpected failure from READ onward → FAILED or RECONCILIATION_REQUIRED
depending on whether side effects may have occurred.
```

### 3.1 State definitions

| State | Entry condition | Exit condition | Write allowed |
| --- | --- | --- | ---: |
| `DISCOVERED` | Metadata identifies source/worksheet | Source manifest prepared | No |
| `READ` | Exact worksheet range returned and shape validated | Parser receives immutable read snapshot | No |
| `PARSED` | Parser emits structured fields/diagnostics | Mapping and data validation runs | No |
| `VALIDATED` | Types, dates, required fields, duplicates, and confidence pass or produce explicit blockers | Immutable plan generated | No |
| `PLANNED` | Plan contains source, versions, keys, values, provenance, validations, and operations | Approval policy accepts plan | No |
| `BLOCKED` | Any unresolved schema, mapping, identity, ownership, required value, or target issue | Human/policy resolution creates a new approved plan | No |
| `APPROVED` | Mapping, source ownership, target, and plan are approved | Commit begins with same plan hash | Yes, through commit engine |
| `COMMITTING` | Bounded batch commit has started | All batches committed or an outcome becomes unknown | Yes, bounded |
| `COMMITTED` | Business writes and import ledger have committed | Reconciliation passes or finds a discrepancy | No further reinterpretation |
| `RECONCILIATION_REQUIRED` | Write outcome or state evidence is incomplete/inconsistent | Reconciliation resolves or blocks | No business retry until resolved |
| `RECONCILED` | Plan/run/staging/business/state/provenance checks agree | Terminal for that plan | No |
| `FAILED` | No uncertain side effect, or failure is recorded with enough evidence | Retry/resume only through policy | No direct retry |

`SyncWorksheet.ACTIVE` may be a prerequisite for `APPROVED`, but it is not an approval substitute. `SpreadsheetImportRun.PROCESSING` maps to the target’s `COMMITTING`; `SUCCESS` maps to `COMMITTED` only after reconciliation evidence is available; `FAILED` remains a failure record.

## 4. Immutable import plan contract

Before any business write, the plan must contain:

```text
planId / planHash
sourceManifest
mappingProfile
mappingVersion
schemaVersion / schemaHash
parserVersion
requestedPeriod
effectivePeriod
sourceRange
entity
grain
businessKey
sourceIdentity / sourceProvenance
typedValue
rawDisplayValue
contentHash
validationResult
operation: INSERT | UPDATE | SKIP | BLOCK
approvalState
```

The plan is immutable after approval. A changed source value, mapping version, schema hash, ownership decision, or target must produce a new plan hash and re-enter validation/approval. The commit layer consumes the plan; it does not rescan Google Sheets, infer a new field, choose another supplier, or change an operation.

### 4.1 Operation rules

| Operation | Meaning | Commit behavior |
| --- | --- | --- |
| `INSERT` | No matching business key exists and source is approved | Create one target projection row |
| `UPDATE` | Business key exists and content/provenance changed | Update that projection row and record new observation |
| `SKIP` | Same approved business key/content, or valid optional empty observation with no business mutation | No business row mutation; retain plan/staging evidence as policy allows |
| `BLOCK` | Mapping, validation, identity, ownership, target, or reconciliation condition prevents safe write | No business mutation; record stable blocker |

There is no default `DELETE` operation. Source absence becomes a flag/reconciliation candidate. A delete contract requires separate business approval, tombstone semantics, and an independently tested migration/deprecation plan.

## 5. Deterministic sync contract

| Entity | INSERT | UPDATE | SKIP | BLOCK | DELETE | Identity |
| --- | --- | --- | --- | --- | --- | --- |
| Biomass consumption | Approved unit/date row | Same unit/date, new value/source observation | Same content or valid empty policy | Ambiguous path, wrong period, duplicate/ownership conflict | Never automatic | Unit + reading date |
| Coal consumption | Approved unit/date row | Same unit/date, new value/source observation | Same content or valid empty policy | Collision with unowned legacy row; invalid/duplicate | Never automatic | Unit + date |
| Coal stock | Both closing and consumed approved for date | Same date, changed stock observation | Same content | Missing either required field, unknown stock scope, source collision | Never automatic | Stock scope + date; current DB only date |
| Biomass receipt | One canonical supplier/period | Same supplier/period, changed quantity | Same content | Missing supplier, duplicate supplier, incomplete seven-set, invalid value | Never automatic | Period + supplier |
| Coal receipt | Approved monthly aggregate | Same period, changed quantity | Same content | Missing/competing receipt source | Never automatic | Period |
| Solar consumption | Approved date value | Same date, changed value | Same content or valid empty policy | Invalid/missing required mapping | Never automatic | Reading date |
| Solar receipt | Approved monthly value | Same period, changed value | Same content | Missing/competing receipt source | Never automatic | Period |
| HOP | Approved unit/date value | Same unit/date, changed value | Same content or valid empty policy | Duplicate unit/date or ambiguous path | Never automatic | Unit + date |
| Biomass target | Approved explicit/policy target | Same year, changed approved target | Same content | Explicit source/policy conflict | Never automatic | Target year |
| Biomass cumulative | Approved period snapshot | Same period, changed value | Same content | Missing/competing cumulative source | Never automatic | Period |

## 6. Source-of-truth contract

| Entity | Source of truth | Authority | Override allowed | Sync direction | Conflict resolution |
| --- | --- | --- | --- | --- | --- |
| Biomass/solar/HOP observations and biomass receipts | `GOOGLE_SHEETS` within approved source scope | Approved manifest and mapping version | No implicit override | Sheets → PostgreSQL | Block competing source |
| Coal consumption and coal stock | `MIXED` until legacy rows are source-owned | Per-source approved scope | No implicit override | Sheets → compatibility projection | Block unknown ownership; no last-write-wins |
| Coal receipt | `GOOGLE_SHEETS` for approved source field | Worksheet/profile approval | No implicit override | Sheets → PostgreSQL | Block missing/competing source |
| Biomass target | `MIXED`: explicit Google value or policy fallback | Source owner or policy owner | Explicit approval only | Sheets/policy → PostgreSQL | Policy fallback is labeled, not source-observed |
| Biomass cumulative | `GOOGLE_SHEETS` when observed; otherwise `UNKNOWN` | Approved source field | No implicit fallback | Sheets → PostgreSQL | Block missing/competing source |

The database is the default dashboard projection/read model. It is not a license for database-to-Sheets writes. Evidence: `src/services/overview.ts:59-76` and `docs/DATABASE_MAPPING.md`.

## 7. Agustus26-BB isolation contract

Agustus is a contract test case only:

```text
Agustus26-BB
  → source manifest: valid observed worksheet
  → read: exact A1:ZZ500 succeeds
  → parse: 352 candidates / 352 valid / 0 invalid / 0 duplicates
  → admission: BLOCKED by worksheet registry ERROR/schema-review state
  → plan: not approved for write
  → database: no write
```

The read-only production verifier reported zero Agustus business rows, staging rows, row states, and duplicates, with `productionWrites: 0`. The correct contract result is `BLOCKED` with an explicit `worksheet_registry_error` reason. Agustus eligibility remains **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**. No repair, reconciliation, or import is included in Phase 1.

## 8. Current state versus target state

### Current state

- Plan validation and canonical policy gates exist.
- Plan is primarily an in-memory structure; commit performs its own checksum/idempotency lookup.
- Import runs have processing/success/failure, but no explicit reconciliation state.
- Sync row state is persisted separately from business commit.
- Source absence is not a delete.

### Target state

- Every approved write consumes one immutable plan hash.
- Operations are explicit and cannot be reinterpreted by persistence code.
- Registry health, mapping approval, import lifecycle, and reconciliation state are separate but linked.
- Source ownership conflicts and missing source rows become explicit blockers/flags.
- A successful commit is not final until reconciliation produces `RECONCILED`.

### Future work after Phase 2

The states, plan artifact, operation field, and repository boundary are implemented in `src/services/google-sheets/canonical/`. Durable approval/batch state and the reviewed application/use-case integration remain separately authorized work.

## 9. Decision and rationale

Adopt a canonical lifecycle that retains the current statuses as compatibility projections but adds explicit conceptual states for planning, approval, commit, and reconciliation. Treat `INSERT`, `UPDATE`, `SKIP`, and `BLOCK` as plan decisions. Never allow a commit function to rediscover source semantics or interpret an absent source row as delete.

This keeps the existing gated spine while making retries, audits, and recovery deterministic and explainable.

## 10. Not verified

- Exact current `SyncRun` status values are strings rather than a declared enum; full status inventory requires a current production read or code-wide enumeration.
- The current schema has no dedicated immutable import-plan or batch-checkpoint table.
- Source deletion/retraction semantics have not been approved by the business owner.
- Human approval actor/role and approval retention are unknown.
- Phase 2 fixture execution covers explicit operations, immutable approval, idempotency, and duplicate/cross-source blocking; it does not write production.
- Agustus production write is **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 11. Future work after Phase 2

The compatibility plan remains in `import/plan.ts`; canonical plan/commit/reconciliation modules are under `src/services/google-sheets/canonical/`. Durable plan/batch/approval/reconciliation state and application integration may require schema review; no migration is authorized now.

## 12. Acceptance criteria for the design

- [ ] Lifecycle states and transitions are explicit and distinguish registry health from import state.
- [ ] Immutable plan contents include source, versions, entity, business key, typed value, provenance, validation, content hash, and operation.
- [ ] Commit consumes the plan without rediscovering source semantics.
- [ ] All ten entity families have explicit INSERT/UPDATE/SKIP/BLOCK/DELETE behavior.
- [ ] Source disappearance is not an automatic database deletion.
- [ ] Agustus is represented as valid parse + blocked admission + no write.
- [ ] Source-of-truth and conflict policy are explicit for every entity.

## 13. Open questions

1. Must an approved plan be persisted in PostgreSQL, or can a signed/hashed operator artifact be retained outside the database initially?
2. Should `VALID_EMPTY` daily observations be staging-only or produce nullable target rows?
3. What business policy authorizes source retractions or deletes?
4. Which statuses must remain backward-compatible in existing monitoring/API consumers?
