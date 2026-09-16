# Phase 1 — Canonical Data Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**
Target after the first reconstruction increment: **3/4**, conditional on deterministic mapping, provenance, and reconciliation evidence.

This document defines the canonical representation between Google Sheets parsing and persistence. It is deliberately independent of Prisma models. The Phase 1 design was read-only; Phase 2 adds a Prisma-independent contract implementation without changing the production schema or data.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

The existing Google Sheets importer and synchronization writer remain the application’s compatibility path. Production data, registry state, Google Sheets, and Prisma migrations were not changed in Phase 2.

### PHASE 2 IMPLEMENTATION

The canonical domain contract is implemented under `src/services/google-sheets/canonical/`: ten entity families, typed values and grains, source manifests, approved mapping/version checks, independent identities, provenance, immutable plans, bounded repository-neutral commits, reconciliation, and recovery semantics. `from-import-plan.ts` is a one-way adapter from the existing typed plan. The commit boundary accepts an approved plan and does not parse or rediscover source meaning.

### FUTURE WORK

Connect the bounded boundary to a reviewed repository and controlled test database, then resolve the coal compatibility-table provenance gap before any controlled production write. Production automation remains at **2/4** readiness.

## 1. Source evidence

| Evidence | What it establishes |
| --- | --- |
| `src/services/google-sheets/import/types.ts:1-125` | Current importer records remain typed for compatibility; `ImportSource` now also carries optional sheet/range/column/raw/version metadata for the canonical adapter |
| `src/services/google-sheets/dynamic/types.ts:1-240` | Current parser has semantic fields, scanned cells, header paths, normalized overview, and diagnostics |
| `src/services/google-sheets/import/plan.ts:326-752` | Current plan converts parsed data into ten entity families and staging rows |
| `src/services/google-sheets/import/commit.ts:138-303` | Current commit consumes a typed plan and writes staging/target/domain data in a transaction |
| `src/services/google-sheets/import/bulk-upserts.ts:54-327` | Current target-table write shapes and conflict keys |
| `prisma/production/schema.prisma:254-542` | Current registry, import, staging, and normalized database models/constraints |
| `docs/GOOGLE_SHEETS_SOURCE_MAP.md` | Phase 0 source ranges, semantic signals, physical legacy offsets, and parser variants |
| `docs/DATABASE_MAPPING.md` | Phase 0 active database mapping and source-of-truth caveats |

The requested literal `/docx` directory is absent. The project’s active documentation directory is `energiprimer-next/docs`, so all Phase 1 design records are stored there.

## 2. Current state

The current pipeline is effectively:

```text
Google cell grid
  → DynamicParserResult / legacy reader result
  → Import record types
  → GoogleSheetsImportPlan
  → staging + normalized/legacy database writes
```

This foundation is valuable. It already validates dates, numeric values, supplier completeness, schema admission, target policy, and duplicate plan keys. However, the boundary object is not yet a canonical domain contract:

- parser types contain source layout concerns and dashboard projections together;
- import record types contain Prisma-oriented field names and `Date` objects but no complete source identity;
- source provenance does not consistently include spreadsheet ID, sheet ID, range, column, mapping version, schema version, parser version, or original raw display value;
- stable identity intentionally excludes workbook/worksheet location (`src/services/google-sheets/sync/identity.ts:21-83`);
- legacy and dynamic mapping can independently produce different interpretations (`src/services/google-sheets/legacy-mapping/mapper.ts:89-142,481-749` versus `src/services/google-sheets/import/plan.ts:326-522`);
- coal compatibility tables do not carry import-run/source fields (`src/services/google-sheets/import/bulk-upserts.ts:98-136`).

## 3. Problem statement

A writable database record must currently pass through several representations that do not share one explicit contract. That makes it difficult to prove, for any row:

1. which approved source field produced it;
2. which real-world business record it represents;
3. whether a second source is allowed to replace it;
4. whether the original displayed value was preserved;
5. whether the committed row and sync state refer to the same immutable plan.

The target is not a wholesale rewrite. The target is a stable, source-independent domain envelope that the existing parser, validation gates, bulk repository, dashboard, and database can adopt incrementally.

## 4. Target canonical contract

### 4.1 Canonical envelope

The following is a design contract, not code to be added in Phase 1:

```ts
type CanonicalEntity =
  | "biomass_consumption"
  | "coal_consumption"
  | "coal_stock"
  | "biomass_receipt"
  | "coal_receipt"
  | "solar_consumption"
  | "solar_receipt"
  | "hop_reading"
  | "biomass_target"
  | "biomass_cumulative";

type CanonicalRecord<TValue> = {
  entity: CanonicalEntity;
  grain: string;
  businessKey: {
    fields: Record<string, string | number>;
    canonical: string;
  };
  value: TValue;
  source: SourceObservation;
  validation: ValidationResult;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
};
```

The contract must not import or depend on `@prisma/client`. A repository adapter may translate a canonical record to Prisma data, but it may not rediscover source meaning, choose a different identity, or reinterpret an operation.

### 4.2 Source observation

`SourceObservation` is defined in detail in `PHASE1_IDENTITY_PROVENANCE_CONTRACT.md`. At minimum it contains:

```text
sourceKey
spreadsheetId
sheetId
worksheetTitleSnapshot
effectivePeriod
sourceRange
cellAddress or sourceRange
row/column when the source exposes a determinate coordinate
rawDisplayValue
normalizedValue
observedAt
mappingVersion
schemaVersion
parserVersion
```

The source observation is not the normalized business value. A value such as `"1.250,50"` and its numeric interpretation `1250.50` are separate evidence fields.

### 4.3 Validation result

The target validation result is structured rather than a free-form warning list:

```text
status: VALID | VALID_EMPTY | REJECTED | AMBIGUOUS | BLOCKED
errors: stable machine-readable codes
warnings: stable machine-readable codes
confidence: 0..1
periodValid: boolean
typeValid: boolean
identityValid: boolean
provenanceComplete: boolean
```

The current parser diagnostics remain useful input to this result (`dynamic/types.ts:210-227`). The canonical contract must preserve the distinction between an observed empty marker, a malformed value, an unresolved candidate, and an absent source field.

## 5. Canonical entity definitions

The table below defines the business representation before persistence. `Google Sheets` is the current external input; database role and authority are separated in the source-of-truth section.

| Entity | Grain | Canonical fields and units | Date semantics | Business key | Current database target |
| --- | --- | --- | --- | --- | --- |
| `biomass_consumption` | 1 unit × 1 reading date | `unitNumber: 1..3`; `quantityTon: decimal ton | null` | Actual day in worksheet period, UTC date-only | `unitNumber + readingDate` | `biomass_consumptions` unique `(unit_id,reading_date)` |
| `coal_consumption` | 1 unit × 1 reading date | `unitNumber: 1..3`; `quantityTon: decimal ton | null` | Actual day in worksheet period, UTC date-only | `unitNumber + readingDate` | `coal_consumption` unique `(unit_id,date)` |
| `coal_stock` | 1 aggregate plant stock observation × 1 date | `closingStock: decimal ton`; `consumed: decimal ton`; opening/received are not mapped by current importer | Actual day in worksheet period, UTC date-only | `plant/stock-scope + readingDate`; current DB only has `readingDate` | `coal_stock` unique `date` |
| `biomass_receipt` | 1 supplier × 1 period | `supplierCode`; `supplierName`; `quantityTon: decimal ton` | First day of source month as period key | `periodStart + supplierCode` | `biomass_receipts` unique `(period_start,supplier_code)` |
| `coal_receipt` | 1 aggregate receipt total × 1 period | `quantityTon: decimal ton` | First day of source month | `periodStart` | `coal_receipts` unique `period_start` |
| `solar_consumption` | 1 aggregate solar consumption observation × 1 reading date | `quantityLiter: decimal liter | null` | Actual day in worksheet period, UTC date-only | `readingDate` | `solar_consumptions` unique `reading_date` |
| `solar_receipt` | 1 aggregate receipt total × 1 period | `quantityLiter: decimal liter | null` | First day of source month | `periodStart` | `solar_receipts` unique `period_start` |
| `hop_reading` | 1 unit × 1 reading date | `unitNumber: 1..3`; `hopDays: decimal day | null` | Actual day in worksheet period, UTC date-only | `unitNumber + readingDate` | `hop_readings` unique `(unit_id,reading_date)` |
| `biomass_target` | 1 target year | `targetYear`; `targetTon: decimal ton`; `status` | Calendar year, represented by target year | `targetYear` | `biomass_targets` unique `target_year` |
| `biomass_cumulative` | 1 cumulative snapshot × 1 period | `cumulativeTon: decimal ton | null` | First day of source month | `periodStart` | `biomass_cumulative_snapshots` unique `period_start` |

The grain definitions are based on the current importer record types, database unique constraints, and bulk SQL—not on table names alone. Evidence: `src/services/google-sheets/import/types.ts:9-73`, `src/services/google-sheets/import/bulk-upserts.ts:54-260`, and `prisma/production/schema.prisma:415-542`.

### 5.1 Null and empty policy

The target policy preserves source evidence without silently inventing business values:

| Source condition | Canonical result | Business operation |
| --- | --- | --- |
| Numeric value parses and required context is valid | `VALID`, typed value | INSERT/UPDATE/SKIP according to identity/hash |
| Explicit empty marker (`-`, `N/A`, blank) in an optional daily metric | `VALID_EMPTY`, typed `null`, retained in plan/staging evidence | SKIP business mutation by default; preserve staging evidence |
| Explicit empty marker in a required monthly receipt/target/cumulative field | `BLOCKED` | BLOCK; no business mutation |
| Malformed number/date or wrong period | `REJECTED` | BLOCK or row rejection according to import policy; never coerce silently |
| Ambiguous candidate or duplicate business identity | `AMBIGUOUS`/`BLOCKED` | BLOCK |
| Approved policy fallback | `VALID` with `source.kind=POLICY_FALLBACK` | Requires explicit approval; not source-observed data |

This target behavior must be reconciled with the current behavior where daily null rows can remain in staging (`src/services/google-sheets/import/plan.ts:579-707`) and where some bulk writes accept nullable values. That reconciliation is future implementation work, not a Phase 1 mutation.

## 6. Canonical field-to-source rules

The canonical record accepts only a field from an approved mapping contract. The source mapping contract defines the exact semantic path and any reviewed physical fallback. The canonical layer receives a resolved observation; it never searches the cell grid.

```text
approved source field
  → resolved observation
  → canonical record
  → business identity + source provenance
  → validation
  → immutable plan operation
```

Heuristic discovery can propose the first arrow. It cannot authorize the canonical record for writing unless `approvalState=APPROVED` and the mapping version is known.

## 7. Source-of-truth contract summary

| Entity | Source of truth | Authority | Override allowed | Sync direction | Conflict resolution |
| --- | --- | --- | --- | --- | --- |
| Biomass consumption | `GOOGLE_SHEETS` for imported source scope | Approved worksheet/source manifest | No implicit manual override | Sheets → PostgreSQL | Competing source blocks unless ownership policy approves one |
| Coal consumption | `MIXED` at current table level; Google is authoritative only for an approved import scope | Source manifest for new import scope; legacy ownership is not recorded | Not implicit | Sheets → compatibility projection | Block cross-source collision; do not last-write-wins |
| Coal stock | `MIXED` / unresolved at current table level | Must be declared per source scope | No implicit override | Sheets → compatibility projection | Block if legacy/source ownership cannot be proven |
| Biomass receipt | `GOOGLE_SHEETS` for the seven approved suppliers | Approved monthly worksheet | No implicit override | Sheets → PostgreSQL | Duplicate supplier/business key blocks |
| Coal receipt | `GOOGLE_SHEETS` when semantic/approved legacy field is present | Approved worksheet/profile | No implicit override | Sheets → PostgreSQL | Missing/competing source blocks |
| Solar consumption | `GOOGLE_SHEETS` for approved worksheet | Approved worksheet/profile | No implicit override | Sheets → PostgreSQL | Competing source blocks |
| Solar receipt | `GOOGLE_SHEETS` for approved worksheet/profile | Approved worksheet/profile | No implicit override | Sheets → PostgreSQL | Competing source blocks |
| HOP | `GOOGLE_SHEETS` for approved worksheet | Approved worksheet/profile | No implicit override | Sheets → PostgreSQL | Duplicate unit/date blocks |
| Biomass target | `MIXED`: explicit Google target or approved policy fallback | Explicit source when present; policy owner for fallback | Only explicit approval | Sheets/policy → PostgreSQL | Explicit source must not silently disagree with policy |
| Biomass cumulative | `GOOGLE_SHEETS` when explicitly observed; otherwise `UNKNOWN` | Approved source field | No implicit fallback without approval | Sheets → PostgreSQL | Missing/competing source blocks |

The `70,020` target is a policy fallback, not proof that the worksheet contained that value (`src/services/google-sheets/import/plan.ts:34,466-497`; `legacy-mapping/profiles.ts:8-9`).

## 8. Decision

Adopt a Prisma-independent canonical domain envelope with explicit grain, business key, source observation, mapping/schema/parser versions, validation result, and operation. Retain the current typed import plan as a compatibility boundary during implementation, but make it an output of the canonical transform rather than the place where source semantics are discovered.

## 9. Rationale

- It preserves the proven reader, parser, policy, plan gate, bulk upserts, and dashboard path.
- It separates parsing from persistence and makes the commit layer intentionally boring.
- It permits legacy compatibility targets without allowing legacy tables to define source meaning.
- It gives the recovery/reconciliation layer a stable plan hash and business-key set.
- It makes source ownership and conflicting workbooks explicit instead of hiding them inside a SHA-256 identity.

## 10. Not verified

- Exact formula text/display-value behavior, merged headers, hidden rows/columns, and source presentation semantics are not verified (`src/lib/google-sheets.ts:331-569`).
- A complete source ownership policy across all possible workbooks is not present in the current schema.
- The updated current-schema-to-live verifier is read-only and passed against the 31-model production schema; provider/RLS objects remain outside this check.
- Phase 2 fixture execution passes through `scripts/verify-phase2-canonical-contract.ts`; it is a contract test, not a production import.
- Production write eligibility for Agustus is **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 11. Future work after Phase 2

The Phase 2 contract modules are in `src/services/google-sheets/canonical/` and do not require a schema change. Remaining work is the reviewed repository/use-case integration, complete coal provenance bridge, and controlled test-database evidence. See `PHASE2_IMPLEMENTATION_RESULT.md`.

## 12. Acceptance criteria for the design

- [ ] Every imported entity has an explicit grain, typed fields, unit, date semantics, business key, and target table.
- [ ] Canonical record types are conceptually independent of Prisma.
- [ ] Source observation and normalized business value are separate.
- [ ] Empty, malformed, ambiguous, fallback, and valid values have distinct outcomes.
- [ ] Source-of-truth ownership is explicit, including mixed/unknown legacy tables.
- [ ] A commit layer can consume a canonical plan without searching the source grid.
- [ ] The target representation is reviewable before implementation begins.

## 13. Open questions

1. What plant/stock scope should be encoded in the `coal_stock` business key if a second plant or source is introduced?
2. Should valid empty daily observations be staging-only (`SKIP`) or persisted as nullable business rows for dashboard completeness?
3. Who owns approval of policy fallback targets and competing source workbooks?
4. What parser/version identifier is acceptable as a stable production contract?
