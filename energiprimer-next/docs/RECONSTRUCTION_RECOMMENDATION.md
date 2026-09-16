# Phase 0 — Reconstruction Recommendation

Audit date: 2026-09-15
Decision: **PARTIAL_RECONSTRUCTION**
Current unattended automation readiness: **2/4 — controlled preflight/import only**
Audit status: **PASS WITH FINDINGS**

This is a recommendation, not an implementation authorization. The Phase 0 work was read-only: no code, schema, migration, database, Google Sheets, environment, or authentication change was made. The requested `/docx` directory is absent; this report is in `energiprimer-next/docs`, the active project documentation directory.

Phase 2 addendum: the approved pure canonical contract seams and current-model read-only schema verifier were implemented without production writes. Remaining recommendation items are the reviewed repository integration, coal provenance bridge, and controlled repeatable evidence.

## 1. Executive decision

Do not rebuild the application or replace the complete Google Sheets pipeline. Preserve the working reader, canonical schema policy, import plan gates, normalized PostgreSQL model, dashboard service, target checks, lease/state concepts, and read-only verifiers. Reconstruct only the boundaries that currently make correctness and recovery difficult to prove:

1. make writable source mapping deterministic and versioned;
2. consolidate dynamic and legacy mapping policies into one canonical transform;
3. make provenance complete and distinguish business identity from source identity;
4. separate/measure transaction scopes and add resumable reconciliation;
5. make production verification derive from the current schema and expose per-source health;
6. retire direct/legacy write paths only after controlled cutover evidence.

## 2. Why partial reconstruction is the right scope

### Assets worth keeping

- A real read-only Google Sheets client with service-account validation, OAuth, timeout, status classification, and no write scope (`src/lib/google-sheets.ts:79-81,94-135,331-569`).
- A useful metadata registry keyed by Google `sheetId`, source-level lease, worksheet status, schema snapshot, content hash, and row-state model (`src/services/google-sheets/sync/discovery.ts`, `sync/lease.ts`, `sync/schema-detection.ts`).
- A canonical July 2026 BB policy that fails closed on missing/conflicting schema and limits automatic processing to due periods after the canonical boundary (`src/services/google-sheets/sync/bb-policy.ts:12-43,204-313`).
- Typed dynamic parsing, supplier completeness checks, date-period validation, duplicate blocking, and a clear `READY_FOR_IMPORT` plan gate (`src/services/google-sheets/import/plan.ts:527-752`).
- Normalized PostgreSQL tables with unique business constraints, import-run/staging provenance, and a production dashboard path that passed a live read-only runtime verifier.
- Bulk fixed-batch import SQL introduced after the documented P2028 incident (`src/services/google-sheets/import/bulk-upserts.ts:22-51,268-327`).
- Environment/cron/production-target checks and read-only preflight/operator tooling (`src/app/api/sync/google-sheets/route.ts:51-117`; `src/services/google-sheets/sync/preflight.ts`; `sync/production-target.ts`).

### Reasons not to call it complete

- `resolveAnchorValue()` is heuristic; a high-scoring wrong candidate can be accepted even though low-confidence/competing candidates are blocked (`dynamic/value-resolver.ts:145-239`).
- The dynamic import plan and legacy mapper are separate mapping/policy implementations (`import/plan.ts`; `legacy-mapping/mapper.ts:89-142,481-749`).
- Aggregate provenance often has a cell but no row, and raw displayed values are reconstructed from normalized numbers (`import/plan.ts:67-76,292-318`).
- Stable row identity deliberately omits source workbook/worksheet location (`sync/identity.ts:21-83`), while multiple possible sources exist.
- Main import commit and row-state persistence are separate transactions; row-state persistence remains per-row (`sync/engine.ts:112-168`; `import/commit.ts:184-265`).
- The Phase 2 production schema verifier now derives the current 31-model baseline and migration history; the remaining concern is target-level canonical provenance/reconciliation rather than stale table inventory.
- The HTTP route is write-capable through both GET and POST (`src/app/api/sync/google-sheets/route.ts:155-161`).

The live evidence supports preserving the foundation: the PostgreSQL dashboard read path and July data are healthy, while the exact Agustus read/parse path is healthy but blocked before write by a stale/error registry state. That is a boundary/recovery problem, not evidence that the whole system must be discarded.

## 3. Recommended target architecture

```text
Source manifest (workbook + sheetId + title + schema version + ownership)
        │
        ├── read-only metadata/value adapter
        │
        ├── deterministic mapping manifest / reviewed semantic paths
        │       └── read-only heuristic discovery may propose candidates
        │
        ├── canonical typed domain transform
        │       └── one validator and one identity/provenance contract
        │
        ├── immutable import plan + approval/reconciliation decision
        │
        ├── bounded repository transactions
        │       ├── staging/import ledger
        │       ├── normalized/legacy business tables
        │       └── sync row-state / registry finalization
        │
        └── table-by-table post-write reconciliation + per-source monitoring
```

The important change is ownership: the parser may discover and explain a candidate, but only a versioned approved mapping manifest should authorize a writable field.

## 4. Ordered reconstruction plan

### Phase 0A — Freeze and document the contract

Deliverables:

- Canonical source manifest for the workbook, immutable `sheetId`, normalized title, effective period, mapping profile/version, and owner.
- Entity contract for all ten imported families: grain, unit, date/period, business key, allowed empty behavior, scale, target table, and source reference.
- Explicit distinction between `sourceKey` (where data came from) and business key (what row it represents).
- Current-schema verifier generated from `prisma/production/schema.prisma` plus selected migration history.

Exit gate: a reviewer can answer “which source owns this database row?” and “which exact source field produced it?” for every writable entity.

### Phase 0B — Make mapping deterministic

Deliverables:

- Versioned mapping manifest for `Juli26-BB` and every admitted future layout.
- Semantic header paths resolved to stable normalized labels plus approved coordinates/relative relationships.
- Candidate resolver changed to produce a review proposal, not an automatic write decision, when no approved path exists.
- Explicit handling for duplicate Unit 2 labels, three-digit numeric separators, percentage units, formulas, merged headers, and hidden columns.
- Retain fixed legacy coordinates only inside named, reviewed profiles such as `Januari26-BB`–`Juni26-BB`.

Exit gate: fixture workbooks with reordered columns, duplicate labels, missing headers, malformed values, formulas, empty markers, and locale number formats produce either the expected typed rows or a blocking review state—never a silent alternative mapping.

### Phase 0C — Consolidate transforms

Deliverables:

- One canonical transformation from parsed source fields to `GoogleSheetsImportPlan`.
- Legacy mapper becomes either an adapter that emits the same plan type or a read-only comparison tool.
- One supplier dictionary, one target policy, one date policy, and one duplicate policy.
- Remove or flag direct write paths that bypass the canonical plan (`scripts/import-google-sheets.ts`, legacy commit callers) after replacement is proven.

Exit gate: dynamic sync, explicit operator import, and audit/reconciliation scripts produce byte-equivalent plan rows for the same fixture.

### Phase 0D — Complete provenance and identity

Deliverables:

- Add/standardize source reference fields: source key, Google sheet ID, title snapshot, range, address, row, column, raw display value, normalized value, parser/mapping version, and import-run ID.
- Preserve the original raw value instead of reconstructing it from a number.
- Define source ownership and conflict behavior when two sources produce the same business key.
- Decide whether legacy `coal_consumption` and `coal_stock` remain compatibility targets or receive a provenance bridge table.

Exit gate: an operator can trace each written business row to one source field and can distinguish “same business value” from “same source occurrence.”

### Phase 0E — Rebuild transaction/recovery boundaries

Deliverables:

- Keep the successful fixed-batch approach, but measure statements, rows, elapsed time, and pooler behavior per entity.
- Bulk persist `SyncRowState` rather than one upsert per changed row.
- Define durable statuses for `PLANNED`, `COMMITTING`, `COMMITTED`, `RECONCILIATION_REQUIRED`, `FAILED`, and `ROLLED_BACK`.
- Add a read-only reconciliation query set that compares import-run row counts/checksum, staging rows, normalized rows, legacy rows, and row states by business key.
- Make registry/schema metadata repair an explicit metadata-only operation with an approval record; never silently change ERROR to ACTIVE.

Exit gate: an interrupted run can be identified, resumed or reconciled, and proven not to have silently duplicated or partially advanced business state.

### Phase 0F — Harden production operation

Deliverables:

- POST-only write route; GET returns read-only preflight/status.
- Per-source monitoring with stale/error/schema-review visibility.
- Production schema verifier based on the current model/history; include unexpected tables/columns/constraints separately from expected compatibility objects.
- Target identity includes the approved project/endpoint identity at an appropriate safe level, not only host/database/schema.
- Read-only preflight is the mandatory operator step; dry-run output is retained as the approval artifact.

Exit gate: two consecutive controlled runs on an approved future worksheet, idempotency repeat, failure/recovery simulation, and table-by-table post-write reconciliation all pass without manual data repair.

### Phase 0G — Deprecate compatibility paths

Only after the prior gates pass:

- retire direct Google dashboard fallback if operationally no longer needed;
- retire legacy write callers;
- keep legacy tables and read routes until their consumers are proven migrated;
- update root README and historical docs to point to the active architecture;
- remove no schema/table without a separately approved deprecation/migration plan.

## 5. Acceptance invariants

The reconstructed boundary should enforce these invariants:

1. A source field maps to at most one writable entity field in a plan.
2. A writable entity field has an approved source path and mapping version.
3. A business key is unique within its declared source ownership domain.
4. A source change produces UPDATE, not a second business row.
5. A source deletion is never silently treated as no-op; it is reported for reconciliation.
6. A malformed, ambiguous, incomplete, wrong-period, or schema-drifted source cannot reach the write repository.
7. A target fallback is visibly labeled as policy-approved fallback, not source-observed data.
8. Each written row is traceable to an import run and source reference, including legacy compatibility rows through a bridge.
9. A successful run has matching ledger, staging, domain, row-state, and checksum/counter evidence.
10. All production writes require explicit target verification and an approved execution scope.
11. Repeating the same plan is idempotent across import-run, business rows, and row-state records.
12. No retry or recovery operation can turn an unresolved registry ERROR/SCHEMA_REVIEW state into an active write without explicit metadata approval.

## 6. Decision matrix

| Candidate action | Decision | Rationale |
| --- | --- | --- |
| Keep current app/dashboard/schema | KEEP | Live read-only runtime is healthy; replacing it adds risk without evidence |
| Keep Google read-only client | KEEP | Safe scope and reusable boundary |
| Keep canonical July schema policy | KEEP | Strongest current admission control |
| Keep dynamic parser | KEEP as analyzer; REFACTOR for writes | Useful discovery, insufficient as sole deterministic writable contract |
| Keep legacy mapper | REFACTOR into adapter/comparison only | Avoid two policies and two outputs |
| Keep bulk SQL | KEEP and measure | Direct response to P2028; fixed batches are safer than row-by-row |
| Add row-state bulk/recovery | REQUIRED | Closes the remaining state/latency gap |
| Update current schema verifier | COMPLETE IN PHASE 2 | Current model/history derivation passes read-only live parity |
| Full application rewrite | REJECT | Not justified by current evidence |
| Database migration/data repair during Phase 0 | OUT OF SCOPE | User explicitly prohibited writes |

## 7. Readiness ladder

| Level | Definition | Current status |
| ---: | --- | --- |
| 0 | Mapping unknown; no safe read path | Exceeded |
| 1 | Read-only source inspection and manual interpretation | Exceeded |
| 2 | Controlled preflight/dry-run/import with explicit review | **Current** |
| 3 | Repeatable production import with complete provenance/reconciliation | Not proven |
| 4 | Unattended automatic production sync with monitored recovery | Not ready |

The exact Agustus dry-run illustrates the current level: source parsing and validation passed, but a registry error blocked the write. The correct next step is approved metadata recovery/reconciliation followed by a controlled write test under a separately authorized task—not an automatic bypass and not a full rebuild.

Agustus production write eligibility: **NOT VERIFIED — WRITE OPERATION REQUIRED**. No registry reconciliation or import write was authorized or executed in Phase 0.

## 8. Phase 0 handoff

Recommended immediate follow-up work, in order:

1. Review and approve the four Phase 0 mapping/flow findings in this documentation set.
2. Build the current-schema structural verifier in a separate change.
3. Design the source manifest/provenance contract and fixture cases.
4. Consolidate the dynamic and legacy mapping outputs.
5. Only then authorize a metadata-only registry reconciliation and separately controlled import test.

No such write or reconciliation was performed in this audit.
