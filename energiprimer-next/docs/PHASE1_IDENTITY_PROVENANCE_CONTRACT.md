# Phase 1 — Identity and Provenance Contract

Design date: 2026-09-15
Design status: **PASS_WITH_REVIEW — Phase 1 contract approved for controlled Phase 2 implementation**
Current automation readiness: **2/4**

This document separates business identity from source identity and defines the evidence required to trace a committed value back to Google Sheets. The Phase 1 design was read-only; Phase 2 implements the contract in application code without changing the Prisma schema, migrations, database, Google Sheets, environment, API, cron, registry, or production data.

## Phase 2 implementation status

### CURRENT IMPLEMENTATION

The existing staging/row-state identity remains the compatibility path. It continues to serve current consumers while the canonical identity boundary is exercised independently.

### PHASE 2 IMPLEMENTATION

`canonical/identity.ts` now separates deterministic business identity, source-occurrence identity, and content hash. `canonical/provenance.ts` and the extended `ImportSource` preserve cell/range coordinates, raw display values, normalized values, mapping/schema/parser versions, and plan-level `importRunId` evidence. Moved rows keep the business key; changed values keep the source occurrence but change content hash.

### FUTURE WORK

Add the reviewed persistence bridge needed to retain complete provenance for `coal_consumption` and `coal_stock`, and decide source-observation retention policy. No production write is authorized by this phase.

## 1. Source evidence

| Evidence | Current behavior |
| --- | --- |
| `src/services/google-sheets/sync/identity.ts:21-83` | Stable source key hashes entity/date/target/unit/supplier/value-unit; worksheet/workbook/cell are deliberately excluded |
| `src/services/google-sheets/sync/identity.ts:85-188` | Staging/import-record source keys and content hashes are derived from typed fields and normalized values |
| `src/services/google-sheets/sync/change-detection.ts:31-66` | Current plan duplicates are detected; rows classify as INSERT/UPDATE/SKIP against `SyncRowState` |
| `src/services/google-sheets/import/types.ts:3-7,75-89` | Current source has worksheet/cell/row; staging has source row/column/address, raw/normalized values, and validation status |
| `src/services/google-sheets/import/plan.ts:67-76,272-318` | Aggregate source row is commonly null; daily source can locate cell and row; raw staging value is reconstructed from a number |
| `prisma/production/schema.prisma:321-335,390-413,415-542` | Sync row state, staging, and normalized table constraints/provenance fields |
| `src/services/google-sheets/import/bulk-upserts.ts:54-327` | Target tables do not all receive the same provenance fields; coal legacy writes are especially sparse |

## 2. Current identity model

### 2.1 Current business-like identity

The current identity payload is:

```text
entityType
periodStart
readingDate
targetYear
unitNumber/unitCode
supplierCode
valueUnit
```

It is hashed by `sourceKeyForIdentity()` and intentionally excludes source row/cell to survive sorting or inserted rows (`identity.ts:46-74`). This is a sound principle for business identity, but the current name and use blur business identity with synchronization source identity.

### 2.2 Current gaps

1. A second workbook or worksheet can generate the same key for the same business fields; there is no source-ownership rule in the identity payload.
2. A changed source cell usually changes the content hash but not the source key, which is correct for UPDATE, but the source occurrence is not independently recorded as a first-class identity.
3. `SyncRowState` is worksheet-scoped, while normalized database unique keys are often plant/business-scoped; those scopes are not explicitly linked.
4. Existing duplicate database rows are not independently detected by `classifySyncRows()`; it detects duplicate current plan keys and relies on database constraints for target uniqueness.
5. `ImportSource` cannot represent spreadsheet ID, immutable sheet ID, range, column, mapping version, schema version, parser version, raw display value, or observation timestamp.
6. `coal_consumption` and `coal_stock` have no import-run/source columns, so their business rows cannot be traced using current target tables alone (`bulk-upserts.ts:98-136`).

### 2.3 Problem statement

The current hash is stable enough to prevent duplicates when a source row moves, but source ownership and source observation are not first-class. A value can therefore be correctly updated by business key while still being impossible to prove as the authorized observation that should own that key.

## 3. Target identity vocabulary

### 3.1 Business identity

Business identity answers: **what real-world record is this?** It is independent of where the observation was found.

```text
BusinessIdentity
  entity
  keyFields
  canonicalKey
  scope
```

`canonicalKey` is deterministic, normalized, and built only from business fields. It must not include cell address, row number, worksheet title, or attempt timestamp.

### 3.2 Source identity

Source identity answers: **where did this observation come from?**

```text
SourceIdentity
  sourceKey              // stable application source/workbook key
  spreadsheetId          // immutable Google workbook identity
  sheetId                // immutable Google worksheet identity
  worksheetTitleSnapshot // mutable display metadata at observation time
  sourceOccurrenceKey    // source field/range occurrence, not business key
  mappingVersion
  schemaVersion
```

The `sourceOccurrenceKey` may be a hash of source key, sheet ID, canonical entity/field, semantic path, and resolved source coordinate/range. It is evidence and conflict-detection material; it is not the database upsert key.

### 3.3 Content identity

Content identity is a hash over canonical identity plus the normalized value and relevant nullable fields. It distinguishes `NULL` from a numeric value and determines whether an existing business record needs UPDATE or can SKIP. It must include mapping/schema/parser version when a mapping change could alter interpretation; a version change must not silently look like a value-only update.

## 4. Business key catalogue

| Entity | Business key | Source identity | Database unique constraint | Upsert key | Conflict rule |
| --- | --- | --- | --- | --- | --- |
| `biomass_consumption` | `unitNumber + readingDate` within plant/source ownership scope | workbook + sheet + semantic unit/date field + mapping version | `biomass_consumptions(unit_id, reading_date)` | unit/date | Different source owner blocks unless precedence is approved |
| `coal_consumption` | `unitNumber + readingDate` within plant/source ownership scope | workbook + sheet + semantic unit/date field + mapping version | `coal_consumption(unit_id, date)` | unit/date | Legacy/source collision blocks; target lacks provenance |
| `coal_stock` | stock scope + `readingDate`; current DB only represents date | workbook + sheet + stock/consumed fields + mapping version | `coal_stock(date)` | date | Block if source scope cannot be proven; no implicit cross-source overwrite |
| `biomass_receipt` | `periodStart + supplierCode` | workbook + sheet + supplier source field + mapping version | `biomass_receipts(period_start, supplier_code)` | period/supplier | Duplicate supplier identity blocks |
| `coal_receipt` | `periodStart` | workbook + sheet + receipt aggregate field + mapping version | `coal_receipts(period_start)` | period | Competing source blocks |
| `solar_consumption` | `readingDate` within plant/source ownership scope | workbook + sheet + solar daily field + mapping version | `solar_consumptions(reading_date)` | date | Competing source blocks |
| `solar_receipt` | `periodStart` within plant/source ownership scope | workbook + sheet + receipt field + mapping version | `solar_receipts(period_start)` | period | Competing source blocks |
| `hop_reading` | `unitNumber + readingDate` | workbook + sheet + HOP unit/date field + mapping version | `hop_readings(unit_id, reading_date)` | unit/date | Duplicate unit/date blocks |
| `biomass_target` | `targetYear` | workbook + sheet + target field/policy approval + mapping version | `biomass_targets(target_year)` | year | Explicit source conflicting with policy/source owner blocks |
| `biomass_cumulative` | `periodStart` | workbook + sheet + cumulative field + mapping version | `biomass_cumulative_snapshots(period_start)` | period | Competing source blocks |

The current database constraints are evidence of intended business identity, not proof that the source ownership policy is complete. Evidence: `prisma/production/schema.prisma:415-542`.

## 5. Identity test cases and decisions

| Case | Required result | Reason |
| --- | --- | --- |
| Same business record, same source, same value | `SKIP`; update observation timestamps only if contract allows | Stable business key and unchanged content hash |
| Same business record, same source, changed value | `UPDATE` | Same business identity; new content hash; source provenance updated |
| Same business record, same semantic field, source row moved | `UPDATE` or `SKIP`, never duplicate | Row/cell is source evidence, not business identity |
| Same source cell, changed value | `UPDATE` | Same source occurrence and business key, different content hash |
| Same business key from different approved source with explicit precedence | Apply declared winner; record losing observation/conflict | Ownership policy, not last-write-wins timing, decides |
| Same business key from different source without precedence | `BLOCK` with `SOURCE_OWNERSHIP_CONFLICT` | Prevent silent cross-workbook overwrite |
| Two source rows map to same business key in one plan | `BLOCK` with `DUPLICATE_BUSINESS_KEY` | Ambiguous source semantics; current classifier already detects duplicate plan keys |
| Existing database duplicates before import | `BLOCK` with `DATABASE_DUPLICATE_BUSINESS_KEY` | Source import must not hide existing structural corruption |
| Source record disappears | `FLAG`/`RECONCILIATION_REQUIRED`; no automatic DELETE | Current pipeline has no safe delete contract and history must be preserved |
| Policy fallback `70,020` used | `INSERT/UPDATE` only after explicit policy approval; source kind is `POLICY_FALLBACK` | It is not a Google observation (`plan.ts:34,466-497`) |

## 6. Provenance contract

### 6.1 Target source observation

```text
SourceObservation
  sourceKey: string
  spreadsheetId: string
  sheetId: string
  worksheetTitleSnapshot: string
  effectivePeriod: { month: number; year: number } | null
  sourceRange: string
  cellAddress: string | null
  row: number | null
  column: number | null
  rawDisplayValue: string | null
  normalizedValue: string | number | null
  observationKind: SOURCE_CELL | SOURCE_RANGE | POLICY_FALLBACK
  mappingVersion: string
  schemaVersion: string
  parserVersion: string
  observedAt: timestamp
```

`cellAddress` and `sourceRange` are not interchangeable. A displayed total may have one source cell; a calculated aggregate may require a range. If no single cell exists, `cellAddress=null` and the source range/semantic path must be recorded. No row or column may be fabricated.

### 6.2 Observation versus normalized value

```text
rawDisplayValue = "1.250,50"
normalizedValue = 1250.50
```

The raw display value preserves what the source reader observed. The normalized value is the typed business input. The current `stagingRecord()` converts the latter back to `String(number)` (`src/services/google-sheets/import/plan.ts:292-318`); the target contract forbids that loss for committed source observations.

## 7. Provenance requirement matrix

| Entity | Cell | Row | Column | Raw value | Mapping version | Import run | Required |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Biomass consumption | Yes | Yes | Yes | Yes | Yes | Yes after commit | All source observations |
| Coal consumption | Yes | Yes | Yes | Yes | Yes | Yes after commit | All source observations; legacy target requires bridge/provenance extension |
| Coal stock closing/consumed | Yes for each field or approved range | Yes when source row exists | Yes when source column exists | Yes | Yes | Yes after commit | Both fields required for writable stock observation; legacy target requires bridge/provenance extension |
| Biomass receipt supplier cell | Yes | Yes when supplier/total row is determinate | Yes | Yes | Yes | Yes after commit | Seven canonical suppliers |
| Coal receipt | Yes for scalar total, otherwise range | Yes when determinate | Yes when determinate | Yes | Yes | Yes after commit | Required; approved legacy fallback may be scalar |
| Solar consumption | Yes | Yes | Yes | Yes | Yes | Yes after commit | Required |
| Solar receipt | Yes for scalar total, otherwise range | Yes when determinate | Yes when determinate | Yes | Yes | Yes after commit | Required |
| HOP | Yes | Yes | Yes | Yes | Yes | Yes after commit | Required |
| Biomass target from source | Yes or approved source range | Yes/column when determinate | Yes when determinate | Yes | Yes | Yes after commit | Required |
| Biomass target policy fallback | No source cell | No | No | No source raw value | Yes: policy version | Yes if persisted | Policy approval evidence required |
| Biomass cumulative | Yes or source range | Yes when determinate | Yes when determinate | Yes | Yes | Yes after commit | Required |

Aggregate exception: when a total is calculated from several cells and the source API exposes no formula/range provenance, preserve the resolved scalar cell if one exists; otherwise preserve the source range and semantic path. Do not invent a row/column or claim formula provenance not returned by the client.

## 8. Source-of-truth ownership

| Entity | Source of truth | Authority | Override allowed | Sync direction | Current caveat |
| --- | --- | --- | --- | --- | --- |
| Biomass consumption | `GOOGLE_SHEETS` for approved source scope | Approved source manifest | No implicit manual override | Sheets → DB projection | Current target has good source fields |
| Coal consumption | `MIXED` until legacy rows are source-owned | Approved source scope only | No implicit override | Sheets → compatibility table | `coal_consumption` lacks provenance |
| Coal stock | `MIXED`/`UNKNOWN` until scope is declared | Explicit stock source owner | No implicit override | Sheets → compatibility table | Aggregate date-only key and legacy fields |
| Biomass receipt | `GOOGLE_SHEETS` for canonical seven-supplier scope | Approved worksheet/profile | No implicit override | Sheets → DB projection | Supplier completeness gate exists |
| Coal receipt | `GOOGLE_SHEETS` for approved semantic/legacy source | Approved worksheet/profile | No implicit override | Sheets → DB projection | Legacy fallback needs profile evidence |
| Solar consumption/receipt | `GOOGLE_SHEETS` for approved source scope | Approved worksheet/profile | No implicit override | Sheets → DB projection | Source fields are retained in normalized tables |
| HOP | `GOOGLE_SHEETS` for approved source scope | Approved worksheet/profile | No implicit override | Sheets → DB projection | Unit/date identity enforced |
| Biomass target | `MIXED`: explicit Google observation or policy fallback | Source owner for explicit; policy owner for fallback | Explicit approval only | Sheets/policy → DB projection | `70,020` is not source proof |
| Biomass cumulative | `GOOGLE_SHEETS` when observed; otherwise `UNKNOWN` | Approved source field | No implicit fallback | Sheets → DB projection | Legacy extraction must remain reviewed |

The database is the dashboard projection/read model for the default runtime, not automatically the source of truth for new Sheets observations. `src/services/overview.ts:59-76` confirms PostgreSQL is the default dashboard source.

## 9. Decision and rationale

Use three separate identities:

1. `BusinessIdentity` for the real-world row and database upsert key.
2. `SourceIdentity`/`sourceOccurrenceKey` for workbook/sheet/field evidence and ownership conflicts.
3. `ContentHash` for deciding whether the business projection changed.

This preserves the current “row moved does not duplicate” behavior while making cross-source conflicts visible. It also gives reconciliation enough evidence to explain whether a changed row is a legitimate UPDATE, a competing source, or a duplicate source observation.

## 10. Current state versus target state

### Current state

- Business-like identity is stable and excludes source row/cell.
- Source evidence is incomplete and uneven across target tables.
- Raw display values are lost for most semantic records.
- Cross-source ownership is not encoded in the key or target tables.
- Import-run checksum provides plan-level idempotency, but not a complete row-level provenance contract.

### Target state

- Business key remains independent of source location.
- Every committed observation has source identity, source occurrence, versions, raw/normalized values, and import-run link.
- Different sources with the same business key are resolved by explicit ownership policy or blocked.
- A moved row updates the same business record.
- A source deletion is flagged, never silently deleted.

### Future work after Phase 2

The identity/provenance types are implemented under `src/services/google-sheets/canonical/`. Persistence fields and the bridge for coal legacy tables still require separate schema review and authorization.

## 11. Not verified

- Whether multiple production workbooks currently produce overlapping business keys is not verified beyond the existing registry/runtime evidence.
- Existing duplicates in every normalized/legacy table were not exhaustively re-counted in this Phase 1 design turn; Phase 0 recorded zero duplicates for the Agustus scope.
- Formula text, source range dependency, merged cells, hidden columns, and display formatting are not available from the current client contract.
- Source ownership approvers and retention requirements for raw source values are unknown.
- Production write eligibility for Agustus is **NOT VERIFIED — PRODUCTION WRITE NOT AUTHORIZED**.

## 12. Future work after Phase 2

The compatibility fields were extended in `import/types.ts` and the canonical source/provenance modules live under `src/services/google-sheets/canonical/`. Remaining database work is the reviewed provenance bridge and any durable plan/batch/source-ownership records; migrations remain out of scope.

## 13. Acceptance criteria for the design

- [ ] Business identity is defined independently from source identity for all ten entities.
- [ ] Source identity includes immutable workbook/sheet identity and mutable title snapshot.
- [ ] Same-source updates, moved rows, changed values, duplicate source rows, and cross-source conflicts have explicit outcomes.
- [ ] Raw display value and normalized value are separate contract fields.
- [ ] Provenance matrix covers cell, row, column, raw value, mapping/schema/parser version, and import run with aggregate exceptions.
- [ ] Legacy coal target provenance limitations are explicit rather than hidden.
- [ ] Source-of-truth, authority, override, direction, and conflict policy are recorded for every entity.

## 14. Open questions

1. What is the authoritative plant/stock scope identifier for the date-only `coal_stock` table?
2. Should source observations be retained indefinitely, or only for a defined audit period?
3. Do legacy rows require a new provenance bridge table, or can an additive target-column extension be approved?
4. Who approves source ownership conflicts and policy fallback targets?
