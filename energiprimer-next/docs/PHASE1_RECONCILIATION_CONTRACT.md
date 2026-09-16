# Phase 1 — Reconciliation Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**

This document makes post-write verification a first-class contract. It also defines how the production schema verifier should compare the current Prisma production model with Supabase. The Phase 2 reconciliation interface and current-model read-only verifier are implemented; no database write, migration, Google Sheets change, environment change, API/cron change, registry repair, or Agustus import was performed.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

The existing post-write verifier remains useful for the compatibility path, but it is not a complete canonical-plan reconciliation proof.

### PHASE 2 IMPLEMENTATION

`canonical/reconciliation.ts` compares plan hash, counts, business keys, duplicates, content hash, source occurrence, and operations, returning `RECONCILED` or `RECONCILIATION_REQUIRED`; its row-state helper separately detects missing, duplicate, and mismatched state projections. `scripts/verify-supabase-production-schema.mjs` now derives its expected model/table/column/primary-key inventory from `prisma/production/schema.prisma`, reads all local production migrations for indexes/foreign keys/history, and reports current versus compatibility objects without a hard-coded 30-table baseline. Its production execution is SELECT-only.

### FUTURE WORK

Connect reconciliation to a reviewed repository and persist evidence for every target. Add the coal provenance bridge before treating coal compatibility projections as fully traceable.

## 1. Source evidence

| Evidence | Current behavior/limitation |
| --- | --- |
| `src/services/google-sheets/sync/post-write-verification.ts:29-190` | Checks sync run counters, one worksheet, registry hashes, row-state presence, and a successful import-run lookup |
| `src/services/google-sheets/sync/post-write-verification.ts:117-164` | Does not directly reconcile every normalized/legacy business table, business-key count, value hash, or complete source provenance |
| `src/services/google-sheets/import/commit.ts:146-168,251-303` | Plan checksum and import-run success/failure are recorded, but current run status is not a complete reconciliation state |
| `src/services/google-sheets/sync/identity.ts:76-116` | Plan/staging content hashes and source keys exist, but source metadata is incomplete |
| `prisma/production/schema.prisma:1-542` | Current production model has 31 tables/models including user audit and ten imported domain targets |
| `scripts/verify-supabase-production-schema.mjs` | Phase 2 verifier derives the current 31-model inventory from `prisma/production/schema.prisma` and reads all local production migrations for structural parity |
| `scripts/verify-supabase-production-runtime.ts:179-323` | Read-only runtime verifier proves dashboard data/series and reports write counters |
| `docs/GOOGLE_SHEETS_SYNC_AUDIT.md` | Phase 0 Agustus/P2028 evidence and zero-commit rollback findings |

## 2. Current state

The current post-write verifier is useful but narrow:

```text
sync run counters
  + worksheet status/hash/row count
  + row-state presence
  + latest successful import-run counters
```

It can report `PASS` or `PASS_WITH_REVIEW`, but it does not prove that every planned business key exists exactly once in its target table, that each value/content hash agrees with the plan, or that legacy target rows are traceable to the import run. A query succeeding is not the same as a reconciliation succeeding.

The former structural verifier compared Supabase to a historical 30-table baseline. Phase 2 replaces that expectation with the current 31-model Prisma inventory and the complete local migration history; compatibility objects are reported separately from current objects.

### 2.1 Problem statement

The current post-write checks can show that selected metadata queries succeeded, but they cannot prove that every planned business key, value, provenance field, and row-state hash agrees with the committed plan. The former structural verifier could report false drift; its Phase 2 replacement now compares the live database with the current Prisma model and migration history.

## 3. Target reconciliation result

The target result is an explicit typed outcome:

```text
ReconciliationResult
  status: RECONCILED | RECONCILIATION_REQUIRED
  planHash
  importRunId
  sourceKey / sheetId / worksheetTitleSnapshot
  expectedRows
  observedRows
  checks[]
  operationCounts
  blockers[]
  warnings[]
  verifiedAt
```

`RECONCILED` means all required checks pass for the approved plan and target scope. `RECONCILIATION_REQUIRED` means any check is missing, contradictory, unknown, or not applicable but required. It is not a soft success and must not permit an automatic replay.

## 4. Reconciliation dimensions

| Dimension | Expected evidence | Failure/blocker examples |
| --- | --- | --- |
| Plan identity | Approved plan hash, source manifest, mapping/schema/parser versions | Plan missing, hash changed, approval absent |
| Row count | Planned/valid/blocked/insert/update/skip counts | Import run counters differ from plan |
| Business-key count | Expected unique keys per entity versus target query | Missing or extra key |
| Duplicate count | Duplicate keys in plan, staging, and target scope | More than one row for a unique business key |
| Content value | Canonical value/hash versus target value | Target value differs from approved plan |
| Import-run association | Target rows link to the committed import run where schema supports it | Wrong/missing `import_run_id` |
| Source provenance | Workbook/source key, sheet ID/title snapshot, range, cell/range, row/column, raw value, versions | Missing or fabricated source reference |
| Operation count | INSERT/UPDATE/SKIP/BLOCK counts | Commit result cannot be tied to plan operations |
| Failed/rejected rows | Staging validation status and run failure counters | Rejected rows in a supposedly clean commit |
| Row-state coverage | One current `SyncRowState` per expected source key, matching content hash | Missing/duplicate/wrong hash |
| Worksheet registry | Active status, schema hash/snapshot, content hash, row count, last sync | Registry says active with mismatching source evidence |
| Source fingerprint | Read plan source/effective worksheet/range/fingerprint | Source changed between approval and commit |
| Temporal scope | Every date/period in requested/effective period | Wrong-period row |

## 5. Per-entity reconciliation contract

| Entity | Target table | Expected checks |
| --- | --- | --- |
| Biomass consumption | `biomass_consumptions` | Plan unit/date keys equal target keys; quantity values match; import run/source fields match; one row per unit/date |
| Coal consumption | `coal_consumption` | Unit/date keys and `coal_used` match; target legacy rows are identified as compatibility projection; provenance bridge required for full PASS |
| Coal stock | `coal_stock` | Date keys and consumed/closing values match; both source fields present; opening/received are not treated as imported; stock scope conflict blocks |
| Biomass receipt | `biomass_receipts` | Seven supplier/period keys, quantities, supplier codes/names, source fields, import run, no duplicate supplier |
| Coal receipt | `coal_receipts` | Period key, quantity, source cell/range, import run, no duplicate period |
| Solar consumption | `solar_consumptions` | Reading-date keys, quantity, import run/source fields, no duplicate date |
| Solar receipt | `solar_receipts` | Period keys, quantity, import run/source fields, no duplicate period |
| HOP | `hop_readings` | Unit/date keys, hop days, import run/source fields, no duplicate unit/date |
| Biomass target | `biomass_targets` | Target year, approved value/source kind, policy fallback marker, import run, no conflicting existing value |
| Biomass cumulative | `biomass_cumulative_snapshots` | Period keys, cumulative value, source/import fields, no duplicate period |

For `coal_consumption` and `coal_stock`, a table-level key/value check can pass while provenance remains incomplete because the current schema has no import-run/source fields. The reconciliation status must report `PASS_WITH_REVIEW` or `RECONCILIATION_REQUIRED` according to the approved compatibility policy; it must not claim full traceability.

## 6. Reconciliation algorithm

```text
1. Load approved plan by planHash.
2. Verify source manifest, mapping/schema/parser versions, target, and effective period.
3. Verify import-run lifecycle and counters.
4. For each entity:
     a. derive expected business-key set from the plan;
     b. query staging by importRunId;
     c. query target rows by business-key set and period;
     d. compare count, duplicate keys, values, operation, provenance, and import link;
     e. record any missing/extra/conflicting key.
5. Verify row-state key/hash coverage for the worksheet.
6. Verify registry schema/content hash and row count.
7. Verify rejected/failed/skipped operations and source fingerprint.
8. Return RECONCILED only when all required checks pass.
```

The algorithm is read-only after a write and must be safe to rerun. Reconciliation may update a run/reconciliation status in a future implementation, but any such write is outside Phase 1.

## 7. Agustus26-BB reconciliation representation

Agustus is not a post-write test in this phase. Its contract evidence is:

```text
source manifest: observed, valid title/sheet identity
read: PASS, exact A1:ZZ500
parse: 352 candidates / 352 valid / 0 invalid / 0 duplicates
admission: BLOCKED, worksheet_registry_error
approved plan: NO
business target rows: 0 observed for Agustus scope
staging rows: 0
row states: 0
duplicates: 0
write: NOT EXECUTED
```

The live read-only verifier reported `productionWrites: 0`. The correct result is `BLOCKED`, not `RECONCILED`, because no approved plan was committed and registry admission is unresolved. Agustus production write eligibility remains **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 8. Current production schema verifier contract

### 8.1 Classification model

The verifier must classify actual objects into:

```text
EXPECTED_CURRENT_OBJECT
  Object represented by the selected current production Prisma schema.

EXPECTED_COMPATIBILITY_OBJECT
  Legacy/auth/framework/operational object intentionally retained by the schema
  and still allowed to exist or be consumed.

UNEXPECTED_OBJECT
  Object not represented by the current schema, approved compatibility allowlist,
  or explicit provider metadata contract.

UNKNOWN / NOT_VERIFIED
  Object class or provider behavior cannot be established safely.
```

The current model has a 31-table expected inventory. The ten normalized import targets, five sync/provenance targets, `units`, auth/framework tables, and legacy operational tables are all expected according to the current schema. “Legacy” describes compatibility role, not an unexpected table.

### 8.2 Expected inventory generation

Generate the expected object inventory from:

1. `prisma/production/schema.prisma`: mapped table names, columns, types, nullability, defaults, primary keys, unique constraints, indexes, relations/FKs, enums, and relation actions;
2. `prisma/production/migrations`: migration names/checksums/status relevant to the selected production history;
3. an explicit compatibility classification file if the verifier needs to label legacy tables, without weakening exact current-schema parity;
4. a safe provider allowlist for system schemas/objects that are intentionally outside `public` application scope.

The verifier should query `information_schema` and `pg_catalog` read-only, compare names and definitions, and report expected/missing/unexpected separately. It must not hard-code `30`, `19`, or one historical baseline as the current truth.

### 8.3 Required verifier result

```text
SchemaVerificationResult
  status: PASS | PASS_WITH_REVIEW | FAIL | NOT_VERIFIED
  expectedCurrentObjects
  expectedCompatibilityObjects
  missingObjects[]
  mismatchedObjects[]
  unexpectedObjects[]
  migrationStatus
  providerIdentity
  readOnlyWrites: 0
```

`PASS_WITH_REVIEW` is appropriate when the current application schema matches but provider/RLS/privilege or intentionally external compatibility details are not verified. A stale verifier must be reported as stale, not used to claim current drift.

## 9. Current state versus target state

### Current state

- Post-write verifier checks run/registry/row-state/import-run surfaces.
- Direct table-level business-key/value reconciliation is incomplete.
- Legacy coal targets lack provenance fields.
- Structural verifier now derives the current model/history inventory and classifies compatibility objects separately.
- Phase 0 read-only runtime evidence proves dashboard compatibility but not full import reconciliation.

### Target state

- Every approved plan has an explicit, rerunnable reconciliation result.
- All ten entity families are compared by business key, value, operation, provenance, and import association.
- Compatibility limitations are visible in the result.
- Schema verification derives expected current objects from the selected production schema/history.
- Agustus remains blocked until a separately authorized metadata recovery and import test.

### Future work after Phase 2

Phase 2 adds the pure reconciliation interface and current-model read-only verifier. Future work may add target-table adapters, result persistence, and the coal provenance bridge; no production mutation is part of this phase.

## 10. Decision and rationale

The pure reconciliation boundary now implements the required result state. The next increment must connect it to target-table evidence and persist the result; `RECONCILED` remains limited to complete evidence and `RECONCILIATION_REQUIRED` to unknown/partial outcomes.

This makes the P2028/partial-state case recoverable, prevents false green status, and avoids treating legacy tables as unexpected merely because they are not normalized import targets.

## 11. Not verified

- Current schema/table/column/constraint/index/migration parity passed in the updated read-only verifier; RLS/policies, Data API privileges, and provider-side objects outside reviewed migrations remain unverified.
- RLS/policies, Data API privileges, provider-side objects outside reviewed migrations, and project ownership are not verified.
- No reconciliation query or recovery simulation was executed in Phase 1.
- Phase 2 reconciliation and recovery fixtures pass locally; no production import was used as a test.
- Agustus production write eligibility is **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 12. Future work after Phase 2

The compatibility post-write verifier remains in `sync/post-write-verification.ts`; canonical reconciliation is under `src/services/google-sheets/canonical/reconciliation.ts`. Persistent reconciliation/plan/batch state and any change to legacy target provenance require separate schema/migration authorization.

## 13. Acceptance criteria for the design

- [ ] Reconciliation has explicit `RECONCILED` and `RECONCILIATION_REQUIRED` outcomes.
- [ ] Dimensions include counts, business keys, duplicates, values/content hashes, import association, provenance, operations, failures, skips, row state, and registry fingerprints.
- [ ] Every imported entity has target-specific checks.
- [ ] Legacy provenance limitations cannot be hidden by a successful SELECT.
- [ ] Agustus is represented as valid read/parse plus blocked admission and zero write.
- [ ] Schema verification derives expected current objects from the production Prisma schema/history and classifies compatibility/unexpected objects separately.
- [ ] Read-only verifiers report their write counter as zero.

## 14. Open questions

1. Which normalized/legacy fields are sufficient for a full PASS when compatibility tables cannot retain import provenance?
2. Should reconciliation results be persisted in the current import-run tables or a dedicated table/artifact?
3. What compatibility objects should be explicitly allowed outside the Prisma model inventory?
4. What is the operational SLA for resolving `RECONCILIATION_REQUIRED`?
