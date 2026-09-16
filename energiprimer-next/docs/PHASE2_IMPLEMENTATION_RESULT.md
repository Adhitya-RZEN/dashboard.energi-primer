# Phase 2 Implementation Result

**Date:** 2026-09-15  
**Status:** `PASS_WITH_REVIEW`  
**Scope:** Controlled canonical contract implementation for the Google Sheets → service → Prisma/Supabase boundary

## Executive result

Phase 2 is implemented as a Prisma-independent canonical contract layer with explicit source identity, approved mapping, typed values, independent business/source/content identities, complete provenance, immutable plans, bounded commit/recovery interfaces, and read-only reconciliation helpers.

The implementation is suitable for the next controlled integration phase. It does not authorize or perform a production import. No Prisma schema, migration, Google Sheet, Agustus registry, or production data was modified by this Phase 2 work.

`PASS_WITH_REVIEW` is intentional. The contract and fixture boundary is complete, but the production writer has not been rewired to consume the canonical plan, durable plan/batch/reconciliation state is not yet persisted, and the existing coal target tables still lack import provenance. These are Phase 3 integration prerequisites, not silent omissions.

**Automation readiness:** `2/4` remains unchanged. Phase 2 does not claim controlled repeatable production import readiness.

**Schema changes:** `NONE`  
**Migration:** `NONE`

## Safety boundary and production evidence

The following operations were not performed:

- production `INSERT`, `UPDATE`, `DELETE`, or `UPSERT`;
- production sync/import or Agustus repair/import;
- Google Sheet writes;
- Prisma schema or migration changes;
- registry reset or destructive cleanup.

Read-only production verification completed successfully:

- current production schema: 31/31 application tables, 278/278 columns, 31/31 primary keys, 21/21 foreign keys, and 44/44 indexes;
- local production migration history: both migrations applied, finished, and checksum-matching;
- production SSL/database identity: verified (`postgres`, public schema, PostgreSQL 17.6);
- populated production application rows: 9,179, within the verifier's allowed populated state;
- `biomassStock` absence: verified as an intentional current-schema condition;
- Agustus registry state: Agustus26-BB records 0, duplicate records 0, Agustus-scoped business/staging/row-state records 0, production writes 0;
- local database writes: 0; Supabase writes: 0.

The schema verifier now derives its expected tables, columns, primary keys, foreign keys, and indexes from `prisma/production/schema.prisma` plus local production migration history. It no longer relies on the stale hard-coded 30-table/19-FK baseline.

## Final safety assertion

```text
Production database writes: 0
Production INSERT: 0
Production UPDATE: 0
Production DELETE: 0
Production UPSERT: 0
Agustus production import: NOT EXECUTED
Agustus registry: UNCHANGED / BLOCKED
Google Sheets writes: 0
```

## Implemented contract surfaces

### Source manifest and mapping

Implemented in:

- `src/services/google-sheets/canonical/source-manifest.ts`
- `src/services/google-sheets/canonical/mapping-contract.ts`

The source manifest requires immutable `spreadsheetId` and `sheetId` identity, retains `sourceKey`, records the mutable worksheet title as a snapshot, and validates effective period, precedence, schema version, and parser version. Title renames therefore do not create a new source identity.

`BB_CANONICAL_V1@1` is the approved/versioned mapping contract for the ten canonical entity families. Heuristic and legacy mappings remain proposal/comparison-only and are not write-authorized. The only policy fallback admitted to the canonical contract is the explicitly flagged biomass target fallback; it is not treated as Google evidence.

### Canonical domain

Implemented in:

- `src/services/google-sheets/canonical/types.ts`
- `src/services/google-sheets/canonical/domain.ts`
- `src/services/google-sheets/canonical/date.ts`
- `src/services/google-sheets/canonical/numeric.ts`

The ten supported grains are:

1. biomass consumption, unit + day;
2. coal consumption, unit + day;
3. coal stock, stock scope + day;
4. biomass receipt, period + supplier;
5. coal receipt, period;
6. solar consumption, day;
7. solar receipt, period;
8. HOP reading, unit + day;
9. biomass target, year;
10. biomass cumulative, period.

The domain is Prisma-independent and uses explicit typed values. Numeric parsing rejects ambiguous separators, preserves zero and negative values, distinguishes empty/invalid input, and retains the original display text. Date parsing distinguishes ISO, Indonesian slash dates, ambiguous dates, invalid dates, and approved day-only/month-boundary cases.

### Identity and provenance

Implemented in:

- `src/services/google-sheets/canonical/identity.ts`
- `src/services/google-sheets/canonical/provenance.ts`

Business identity, source occurrence identity, and content identity are separate:

- business identity answers which real-world row/grain is represented;
- source occurrence identity answers where the observation came from;
- content hash answers whether the canonical content changed.

The source observation retains raw display value, normalized value, source range/cell/row/column, immutable workbook/sheet identity, title snapshot, effective period, mapping/schema/parser versions, and import-run context. Provenance is required for writable source observations; policy fallback is explicitly marked and cannot masquerade as a source cell.

### Immutable import plan

Implemented in:

- `src/services/google-sheets/canonical/from-import-plan.ts`
- `src/services/google-sheets/canonical/import-plan.ts`

The compatibility adapter is one-way: it translates the existing import plan into canonical records while preserving raw values and provenance. The canonical planner produces a deeply frozen plan with deterministic ordering, plan hash, import run ID, approved manifest/mapping versions, and explicit `INSERT`, `UPDATE`, `SKIP`, or `BLOCK` decisions.

The planner blocks duplicate current business keys, duplicate existing keys, and cross-source ownership conflicts unless an explicit source precedence rule authorizes the winner. Moved rows preserve business/content identity while changing source occurrence identity; changed values preserve business/source occurrence identity while changing content identity.

Plan integrity is re-derived rather than trusted from caller-provided hashes. Derived identity, provenance, mapping, schema/parser versions, and canonical field sets are checked before approval and before commit.

### Bounded commit and recovery interfaces

Implemented in:

- `src/services/google-sheets/canonical/commit.ts`
- `src/services/google-sheets/canonical/recovery.ts`

The repository-neutral commit boundary accepts only an approved, intact canonical plan and batches writable items at a maximum of 200. It requires one strong observed result per writable item and verifies plan hash, operation, business identity, content hash, and source occurrence before reporting success.

Known commit errors classify as `FAILED` with an exact rollback/retry action. Transaction-closed, timeout, connection-reset, interruption, and unknown-outcome failures classify as `RECONCILIATION_REQUIRED`; they cannot be blindly retried.

The lifecycle model covers `DISCOVERED → READ → PARSED → VALIDATED → PLANNED → APPROVED → COMMITTING → COMMITTED → RECONCILED`, with explicit `BLOCKED`, `FAILED`, and `RECONCILIATION_REQUIRED` outcomes. Batch recovery distinguishes absent, committed, conflicting, and unknown state.

### Reconciliation

Implemented in:

- `src/services/google-sheets/canonical/reconciliation.ts`
- `scripts/verify-supabase-production-schema.mjs`

Canonical plan reconciliation checks plan identity, counts, business keys, duplicate observations, content hashes, source occurrence hashes, and operations. An idempotent re-observation of an intended `INSERT` or `UPDATE` may be observed as `SKIP` when its canonical content and provenance match.

The row-state helper is read-only. It reports missing, unexpected, duplicate, wrong-content, wrong-source-occurrence, and count mismatches, and turns a blocked plan or incomplete evidence into `RECONCILIATION_REQUIRED`. It is deliberately not a repair command.

## Validation evidence

The Phase 2 executable fixture verifier covers:

- six worksheet layout cases;
- numeric formats, ambiguity, zero, negative values, empty markers, and malformed values;
- ISO, Indonesian, ambiguous, invalid, and day-only date cases;
- title rename, moved row, changed value, raw-versus-normalized value, source range, policy fallback, and missing provenance;
- approved mapping versus unwritable proposal;
- deterministic plan hashing and deep immutability;
- first-run `INSERT` followed by idempotent `SKIP`;
- `UPDATE`, duplicate-current-key, duplicate-existing-key, and cross-source conflict decisions;
- explicit precedence resolution;
- bounded 200-row batching;
- known failure versus unknown-outcome recovery;
- canonical and row-state reconciliation;
- lifecycle transitions and blocked terminal conditions.

The final validation run reported:

```text
phase2:verify                         PASS; productionWrites: 0; INSERT then idempotent SKIP
dynamic:verify                        PASS
bb:mapping:test                       PASS; 27 assertions
sync:verify-auto-admission            PASS
sync:verify-preview-write-safety      PASS; databaseWrites: 0
db:validate                           PASS
lint                                  PASS
tsc --noEmit                          PASS
build                                 PASS
git diff --check                      PASS
```

The Phase 2 fixture command recorded `productionWrites: 0` and used only in-memory repository behavior. The production schema and Agustus checks were read-only verification commands and both reported `productionWrites: 0`.

## Files changed for Phase 2

### New files

- `src/services/google-sheets/canonical/` — canonical types, domain, identity, provenance, mapping, source manifest, planning, commit, recovery, reconciliation, date, and numeric contracts;
- `scripts/fixtures/phase2-canonical-fixtures.ts` — deterministic layout, numeric, and date fixtures;
- `scripts/verify-phase2-canonical-contract.ts` — executable Phase 2 contract and failure-simulation verifier;
- `docs/PHASE2_IMPLEMENTATION_RESULT.md` — this result report.

### Modified files

- `src/services/google-sheets/import/types.ts` and `src/services/google-sheets/import/plan.ts` — preserve raw/source metadata and label policy versus physical fallback provenance;
- `src/services/google-sheets/legacy-mapping/types.ts` and `mapper.ts` — explicitly mark legacy mapping as comparison-only;
- `scripts/verify-supabase-production-schema.mjs` — derive current schema expectations from Prisma schema and migration history;
- `package.json` — add `phase2:verify`;
- the Phase 1 contract and reconstruction/audit documents — record the Phase 2 implementation status, evidence, and remaining boundaries.

The worktree was already substantially dirty and contains unrelated user changes. Those changes were preserved; no reset, checkout, clean, destructive delete, production write, or schema migration was performed.

### File diff summary

| Area | Files changed | Purpose |
| --- | --- | --- |
| Source | `canonical/source-manifest.ts`, `import/types.ts`, `import/plan.ts` | Immutable workbook/worksheet identity and source metadata preservation |
| Mapping | `canonical/mapping-contract.ts`, `legacy-mapping/types.ts`, `legacy-mapping/mapper.ts` | Approved versioned mapping and comparison-only legacy boundary |
| Domain | `canonical/types.ts`, `domain.ts`, `date.ts`, `numeric.ts` | Prisma-independent typed canonical records and explicit parsers |
| Identity | `canonical/identity.ts` | Deterministic business, source-occurrence, and content identities |
| Provenance | `canonical/provenance.ts`, `canonical/from-import-plan.ts` | Raw display values, cell/range provenance, and compatibility translation |
| Import | `canonical/import-plan.ts`, `canonical/from-import-plan.ts` | Immutable deterministic plan and explicit operations |
| Commit | `canonical/commit.ts` | Approved-plan-only, bounded repository-neutral batches |
| Reconciliation | `canonical/reconciliation.ts`, `scripts/verify-supabase-production-schema.mjs` | Plan/row-state evidence and current-schema read-only parity |
| Recovery | `canonical/recovery.ts` | Lifecycle transitions and unknown-outcome handling |
| Tests | `scripts/fixtures/phase2-canonical-fixtures.ts`, `scripts/verify-phase2-canonical-contract.ts`, `package.json` | Fixture matrix, failure simulation, and `phase2:verify` command |
| Docs | Phase 1 contract docs, `DATABASE_MAPPING.md`, `AUTOMATION_COMPLEXITY_AUDIT.md`, `RECONSTRUCTION_RECOMMENDATION.md`, this report | Synchronized current/Phase 2/future status and evidence |

**Unrelated files changed:** `YES` — the worktree already contained user changes from the preceding audit/reconstruction work. They were preserved and not broadened by Phase 2. The out-of-scope groups are `docs/AGENT_CONTEXT.md`, `docs/BB_MAPPING_POLICY_UPDATE_2026-08-31.md`, `docs/DATABASE_IMPORT_TEST_PLAN.md`, the existing `docs/GOOGLE_SHEETS_*.md` and `docs/PROJECT_MAP.md`; the pre-existing sync/API scripts under `scripts/` and `src/app/api/`; the existing dynamic/import/sync implementation files outside the canonical adapter boundary; `scripts/fixtures` items not used by the Phase 2 verifier; `tasks/`; and `graphify-out/`. These were left intact because they belong to the user's existing work and are not required to implement the canonical contract.

## Deliberately not changed

- `prisma/production/schema.prisma`;
- production migration files;
- the production database and Supabase data;
- Google Sheets contents;
- the Agustus registry/data;
- the active production commit wiring;
- current dashboard/UI behavior;
- unrelated worktree changes.

## Required Phase 3 gates

Before any controlled production write is considered, Phase 3 must provide:

1. a reviewed repository/use-case adapter that maps canonical records to the current schema without heuristic authorization;
2. a test database or disposable transaction harness for repository integration and rollback/recovery tests;
3. durable plan, batch, import-run, and reconciliation state;
4. an explicit coal target provenance bridge or a formally approved compatibility policy;
5. row-state verification tied to the actual write target and an operator-approved recovery workflow;
6. a repeatable, narrow-scope import with source ownership, approval, audit, monitoring, and rollback evidence;
7. a separately approved production runbook. 

Until those gates are satisfied, the canonical plan is a contract and review artifact, not production write authorization.
