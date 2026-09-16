# PHASE 3 RESULT

Date: 2026-09-16  
Status: `PASS_WITH_REVIEW`  
Architecture: `PARTIAL_RECONSTRUCTION`  
Automation readiness: `2/4`  
Target: prerequisites for `3/4`; `3/4` is not claimed because the canonical repository commit is not yet the production authority and the HTTP method boundary remains unresolved.

Phase 4 follow-up (2026-09-16): the HTTP method boundary is now resolved in
the implementation—GET is read-only and POST is the explicit execution path.
The remaining canonical repository/durable-state limitations below are still
open, so the Phase 3 readiness rating remains historical.

## Executive Summary

Phase 3 establishes a deterministic mapping boundary for the existing Google Sheets import flow:

```text
Google Sheets read-only client
        ↓
source manifest
        ↓
approved, versioned mapping manifest
        ↓
dynamic parser/analyzer with explicit mapping capability
        ↓
canonical domain records
        ↓
immutable canonical import plan
        ↓
identity, provenance, validation, admission
        ↓
existing bounded repository writer
```

The important safety property is now enforced in code: parser confidence is evidence, not write authority. A high-confidence candidate without an approved mapping context remains `REVIEW_REQUIRED`; ambiguous and low-confidence candidates are `BLOCKED`. Only approved exact, approved structural, and explicitly approved policy-fallback evidence can enter the canonical domain.

The existing bounded Prisma writer remains in place as a compatibility repository boundary. The updated sync and manual-import entry points reach it only after the canonical plan has been built and approved. No production import, production sync, Google Sheets write, schema change, or migration was performed in this phase.

## Scope

Included:

- deterministic mapping authorization for exact, structural, policy-fallback, review, and blocked outcomes;
- a complete canonical mapping manifest for all canonical entities and fields;
- six explicit January–June 2026 legacy mapping profiles;
- source manifest completion with workbook identity, immutable `sheetId`, title snapshot, period, entities, and schema fingerprint;
- provenance granularity for `CELL`, `ROW`, `RANGE`, `WORKSHEET`, and `WORKBOOK`;
- separation of source occurrence identity from business identity;
- one canonical Parsed Source → Canonical Domain → Import Plan transformation;
- canonical gating in the existing preflight, manual import, and sync paths;
- bounded bulk commit preservation and comparison-only legacy mapping behavior;
- in-memory fixture and regression validation.

Not included:

- dashboard or authentication rewrites;
- Prisma schema or migration changes;
- production import/sync;
- Google Sheets mutation;
- removal of legacy audit tooling;
- cutover of the canonical repository commit as the sole database writer.

## Existing Mapping Architecture

The Phase 3 audit found that the repository already had useful read, discovery, parser, registry, row-state, and bounded-write components, but the old dynamic and legacy outputs could be consumed as import candidates without a single explicit mapping authorization contract. The implementation map is:

| Component | Current responsibility | Phase 2 contract | Phase 3 action |
| --- | --- | --- | --- |
| `src/lib/google-sheets.ts` | Read-only Google Sheets metadata/range access | Source boundary | `KEEP`; no Google write capability added |
| `sync/discovery.ts` and registry tables | Source/workbook/worksheet discovery, `sheetId`, registry state, row state | Source manifest and registry/reconciliation contracts | `ADAPT`; feed immutable source identity and preflight gates |
| `sync/schema-detection.ts` | Structural snapshot, fingerprint, drift classification | Schema and fail-closed policy | `ADAPT`; canonical-period schema drift remains review/blocking |
| `dynamic/structure-analyzer.ts` and dynamic parsers | Detect anchors, columns, daily rows, aggregates, and values | Candidate source evidence | `ADAPT`; propagate mapping capability, raw evidence, and aggregate granularity |
| `dynamic/value-resolver.ts` | Resolve numeric candidates around an anchor | No confidence-only write authority | `ADAPT`; exact/structural authorization requires an approved context; ambiguity/low confidence blocks |
| `import/plan.ts` | Convert parsed output into typed import rows and old staging plan | Canonical domain/plan contracts | `ADAPT`; one-way compatibility adapter with explicit source authorization |
| `canonical/*` | Domain records, mapping contract, manifest, provenance, identity, plan, recovery | Phase 2 authoritative contracts | `EXTEND`; add manifest entries, profiles, compatibility gate, and granularity rules |
| `legacy-mapping/mapper.ts` | Historical schema comparison, duplicate/date/identity audit, dry-run classification | Must not be an independent writer | `COMPARISON_ONLY`; result carries `writeAuthorization: COMPARISON_ONLY` |
| `import/commit.ts` and `bulk-upserts.ts` | Repository/database writes and bounded batches | Existing commit/recovery contracts | `KEEP`; still the only database writer, reached after canonical admission |
| `/api/sync/google-sheets` | Authenticated sync trigger | Existing deployment/cron boundary | `KEEP_WITH_REVIEW`; Phase 4 makes `GET` read-only and reserves execution for explicit `POST` |

The legacy mapper is not imported by the sync engine as a second production mapping policy. Its existing scripts remain audit/comparison tools. The old import plan is also not allowed to bypass the canonical gate in the updated manual import and sync paths.

## Canonical Mapping Architecture

The canonical writable mapping path is:

```text
raw Google Sheets values
  → dynamic scan and structural analysis
  → candidate values with evidence
  → approved mapping capability from a versioned contract
  → ImportSource with authorization and raw provenance
  → canonicalRecordsFromImportPlan()
  → canonical domain validation and identity
  → buildCanonicalImportPlan()
  → approveCanonicalImportPlan()
  → existing bounded repository writer
```

The canonical transformation is `canonicalRecordsFromImportPlan()` in `canonical/from-import-plan.ts`. It is the only authoritative transformation from the existing parsed/import-plan shape into canonical domain records. `buildCanonicalImportPlanFromCompatibilityPlan()` is a one-way adapter into the immutable canonical plan; it does not rediscover or remap source fields.

The parser, mapper, canonical transformer, and import plan have no Prisma, Supabase, or direct SQL dependency. Database mutation remains in the repository/commit layer.

### Mapping authorization

| Evidence | Result |
| --- | --- |
| approved exact anchor | `APPROVED_EXACT` |
| approved alias/structural match and contract allows structural mapping | `APPROVED_STRUCTURAL` |
| approved target policy fallback | `APPROVED_POLICY_FALLBACK` |
| high-confidence but unapproved candidate, pattern/context candidate, or missing approval context | `REVIEW_REQUIRED` |
| ambiguous, conflicting, malformed/low-confidence candidate, or unavailable source | `BLOCKED` |

## Mapping Manifest

The canonical profile is `BB_CANONICAL_V1`, mapping version `BB_CANONICAL_V1@1`, effective from `2026-07-01` with no configured end date. Its source is the configured Google Sheets workbook and its worksheet selector is the approved `[Bulan][YY]-BB` canonical schema. Every entry carries source path, target field, unit, transformation, validation rule, identity rule, and source kind in `canonical/mapping-contract.ts`.

| Entity / field | Source path | Target field | Unit | Transformation | Identity rule |
| --- | --- | --- | --- | --- | --- |
| `biomass_consumption.quantityTon` | `resource=biomass > daily > unitNumber` | `biomass_consumptions.quantity_ton` | ton | Locale-aware numeric parse; preserve null and source evidence | `unitNumber + readingDate` |
| `coal_consumption.quantityTon` | `resource=coal > daily > unitNumber` | `coal_consumption.coal_used` | ton | Locale-aware numeric parse; preserve null and source evidence | `unitNumber + readingDate` |
| `coal_stock.closingStock` | `resource=coal > stock > closingStock` | `coal_stock.closing_stock` | ton | Locale-aware parse; retain closing stock and consumed as one record | `stockScope + readingDate` |
| `coal_stock.consumed` | `resource=coal > daily total > consumed` | `coal_stock.consumed` | ton | Locale-aware parse; retain closing stock and consumed as one record | `stockScope + readingDate` |
| `biomass_receipt.quantityTon` | `resource=biomass > monthly receipt > supplier` | `biomass_receipts.quantity_ton` | ton | Sum approved supplier columns after locale-aware parse | `supplierCode + periodStart` |
| `coal_receipt.quantityTon` | `resource=coal > monthly receipt > total` | `coal_receipts.quantity_ton` | ton | Locale-aware parse from semantic monthly total | `periodStart` |
| `solar_consumption.quantityLiter` | `resource=solar > daily > total` | `solar_consumptions.quantity_liter` | liter | Locale-aware parse from approved daily total | `readingDate` |
| `solar_receipt.quantityLiter` | `resource=solar > monthly receipt > total` | `solar_receipts.quantity_liter` | liter | Locale-aware parse from semantic monthly receipt total | `periodStart` |
| `hop_reading.hopDays` | `isHop=true > daily > unitNumber` | `hop_readings.hop_days` | day | Locale-aware parse from unit daily HOP column | `unitNumber + readingDate` |
| `biomass_target.targetTon` | `biomassTarget > targetYear` | `biomass_targets.target_ton` | ton | Locale-aware parse; approved 70,020 ton policy fallback only | `targetYear` |
| `biomass_cumulative.cumulativeTon` | `biomassCumulative > period` | `biomass_cumulative_snapshots.cumulative_ton` | ton | Locale-aware parse from approved cumulative period value | `periodStart` |

All canonical fields are required by the write-plan header assertion. The contract hash includes both field definitions and manifest entries. A proposal created by discovery has no mapping version and `writable: false`.

## Legacy Mapper Treatment

The legacy mapper is `COMPARISON_ONLY`, not a production write authority. It still provides historical schema classification, date validation, duplicate evidence, identity summaries, and dry-run counts for audit scripts. Its result is explicitly marked:

```text
writeAuthorization: COMPARISON_ONLY
```

The six fixed historical profiles are registered in `canonical/mapping-profiles.ts`:

| Worksheet | Profile | Mapping version | Explicit fixed references |
| --- | --- | --- | --- |
| `Januari26-BB` | `BB_LEGACY_JANUARI_V1` | `BB_LEGACY_JANUARI_V1@1` | `I42`, `CC42`, and `TONASE BIOMASSA > TOTAL {year} > first numeric cell to the right` |
| `Februari26-BB` | `BB_LEGACY_FEBRUARI_V1` | `BB_LEGACY_FEBRUARI_V1@1` | same approved historical references |
| `Maret26-BB` | `BB_LEGACY_MARET_V1` | `BB_LEGACY_MARET_V1@1` | same approved historical references |
| `April26-BB` | `BB_LEGACY_APRIL_V1` | `BB_LEGACY_APRIL_V1@1` | same approved historical references |
| `Mei26-BB` | `BB_LEGACY_MEI_V1` | `BB_LEGACY_MEI_V1@1` | same approved historical references |
| `Juni26-BB` | `BB_LEGACY_JUNI_V1` | `BB_LEGACY_JUNI_V1@1` | same approved historical references |

These profiles are exact-title, versioned, isolated, and testable. A physical fallback is accepted by the canonical domain only when the selected legacy profile explicitly contains that physical reference and the source carries `APPROVED_EXACT`. The same physical reference is rejected by the July canonical contract. Post-June 2026 titles resolve to the canonical profile only when the separate schema/registry gates also pass; unsupported years/titles resolve to no approved mapping.

The July regression fixture compares legacy-mapper business values with canonical-plan business keys and normalized values. Differences are not silently selected as winners.

## Provenance Model

`SourceManifest` now records:

- `sourceKey`;
- Google `spreadsheetId`;
- immutable worksheet `sheetId`;
- `workbookIdentity` (`sourceKey:spreadsheetId`);
- worksheet title and normalized/title snapshot;
- effective month/year;
- canonical entity set;
- mapping profile/version;
- schema/parser versions;
- schema fingerprint;
- ownership, approval, registry status, and observation time;
- bounded source range.

Canonical `SourceObservation` records retain the source key, spreadsheet/workbook identity through the manifest, sheet identity, title snapshot, range, raw display value, normalized value, mapping/schema/parser versions, and import run ID. Source coordinates are represented using explicit granularity:

| Granularity | Coordinates allowed |
| --- | --- |
| `CELL` | cell address, row, and column are required |
| `ROW` | row is required; cell/column are not fabricated |
| `RANGE` | cell/row/column are null; component addresses/raw values may be retained |
| `WORKSHEET` | cell/row/column are null; used for approved policy fallback |
| `WORKBOOK` | cell/row/column are null |

The adapter never substitutes a normalized number for missing raw source evidence. For example, an observed display value such as `"1.250,50"` remains separate from normalized `1250.5`. Aggregate values do not receive a fabricated total raw string; their component addresses and exact display values are retained when available.

Where the existing staging schema already has a slot, the bounded writer now persists the available source column instead of discarding it. Fields not represented by the existing schema (for example, full mapping-version metadata) remain available in the canonical plan and are not fabricated into legacy columns.

## Identity Model

Business identity and source identity are separate:

```text
business identity = entity + scope + business key fields
source occurrence = sourceKey + spreadsheetId + sheetId + range/cell/row/column
                    + granularity + source component addresses + mapping version
```

Examples of business keys:

- consumption/HOP: `unitNumber + readingDate`;
- coal stock: `stockScope + readingDate`;
- biomass receipt: `supplierCode + periodStart`;
- period aggregates: `periodStart`;
- target: `targetYear`.

Moving a source cell changes the source occurrence key but preserves the business identity and content hash when the typed business value is unchanged. A second source for an existing business key is handled by the canonical ownership/precedence and reconciliation policy; it is not treated as a new business record solely because the source coordinates differ.

## Fixture Coverage

The fixture and regression checks cover:

- valid July worksheet/header/daily/aggregate inputs, formulas represented as source values, empty nullable values, and the observed Indonesian/European numeric formats;
- unapproved high-confidence candidates, pattern candidates, ambiguous/conflicting candidates, low-confidence candidates, review-only source rows, and unsupported worksheet titles;
- canonical and legacy mapping manifest resolution;
- exact legacy physical reference admission and canonical-profile physical-reference rejection;
- source manifest fingerprint/title snapshot and immutable plan hash;
- aggregate range provenance with component raw values and null coordinates;
- source movement versus business identity;
- duplicate business-key blocking and existing Phase 2 numeric/date/layout fixtures;
- legacy-vs-canonical value and business-key equivalence on the July regression fixture.

The full invalid-layout matrix requested for future work—especially every combination of reordered/hidden/merged columns, duplicate headers, unexpected units, malformed dates, and malformed numbers—does not yet have a dedicated Phase 3 fixture for every case. Existing schema and parser gates cover the relevant blocking behavior, but this gap is retained as a next-phase test expansion rather than inferred as complete coverage.

## Validation Results

| Validation | Result | Evidence |
| --- | --- | --- |
| TypeScript | `PASS` | `node_modules\\.bin\\tsc.cmd --noEmit` |
| ESLint | `PASS` | `npm.cmd run lint` |
| Build | `PASS` | `npm.cmd run build` |
| Prisma/database validation | `PASS` | `npm.cmd run db:validate`; no schema/migration diff |
| Phase 2 canonical fixtures | `PASS` | `npm.cmd run phase2:verify`; in-memory commit/reconciliation/recovery checks, `productionWrites: 0` |
| Phase 3 deterministic mapping | `PASS` | `npm.cmd run phase3:verify`; 23 assertions |
| Dynamic parser regression | `PASS` | `npm.cmd run dynamic:verify`; July regression, approved canonical plan, legacy comparison, locale/solar/duplicate checks |
| Existing mapping regression | `PASS` | `npm.cmd run bb:mapping:test`; 27 assertions |
| Schema detection fixtures | `PASS` | `npm.cmd run sync:verify-schema`; new/missing/reordered/renamed/duplicate/empty/type-drift cases |
| Auto-admission regression | `PASS` | `npm.cmd run sync:verify-auto-admission` |
| Preview/write-safety regression | `PASS` | `npm.cmd run sync:verify-preview-write-safety`; database writes `0` |
| Production schema verification | `PASS` | Read-only check: 31/31 tables, 278/278 columns, 31/31 PKs, 21/21 FKs, 44/44 indexes; migration parity/checksums passed |
| Production Agustus state | `PASS` | Read-only check: Agustus26-BB business/evidence records and duplicates `0`; writes `0` |
| Diff hygiene | `PASS` | `git diff --check`; only normal CRLF conversion warnings |

The production checks were read-only. Existing production rows were not treated as disposable test data and no production import was executed.

## Known Limitations

1. The canonical compatibility gate currently builds a canonical plan before the existing bounded writer, but its default compatibility input does not load canonical repository state. Consequently, canonical operation planning is not yet the authoritative INSERT/UPDATE/SKIP decision for live persistence; existing sync row-state classification still controls the compatibility writer.
2. The canonical repository-neutral commit/reconciliation contracts are validated in memory, but the production sync engine still commits through the existing Prisma/bulk-upsert repository after canonical admission. A production cutover requires a separate controlled phase.
3. The legacy mapper remains a comparison/audit API. The fixed January–June profile metadata is canonical and versioned, but full real-workbook equivalence evidence for every historical month is still required before deprecating historical audit paths.
4. Schema fingerprints are carried into the source manifest and schema drift is fail-closed through preflight/sync gates. Mapping profiles are currently selected by the approved worksheet-period policy; a user-managed mapping registry is outside this phase because it would require additional persistence/design authority.

## Remaining Risks

1. Phase 3's route-safety issue is resolved by the Phase 4 method boundary: `GET` is discovery/preflight only, while `POST` is explicit execution. The existing Vercel GET schedule is consequently read-only until a separate POST caller is authorized.
2. The existing compatibility writer remains a material production write boundary. Canonical admission now gates it, but the canonical plan is not yet the sole persisted operation authority.
3. The broad historical fixture matrix and operator approval workflow for a newly observed schema are not complete enough for unattended automation.
4. No production write was used to prove the new path, so live write behavior remains an explicit future controlled-verification task rather than an implied result of these tests.

## Automation Readiness

Current rating: `2/4`.

```text
0 = unknown
1 = manual/read-only
2 = controlled preflight/import
3 = repeatable controlled production automation
4 = unattended monitored automation
```

The implementation now has a deterministic canonical admission prerequisite and preserves controlled preflight/import controls. It is not rated `3/4` because the canonical repository commit is not yet the sole operation authority, the route method boundary is unresolved, and no authorized production canary has been executed. It is not rated `4/4` because monitoring/rollback evidence for unattended operation is not established by this phase.

## Next Phase Recommendation

Phase 4 should address the remaining operational boundary in this order:

1. keep the Phase 4 HTTP method contract: GET read-only/preflight and POST explicit writes;
2. load canonical existing state and make canonical `INSERT`/`UPDATE`/`SKIP`/`BLOCK` operations the authoritative input to a repository adapter while preserving bounded batches;
3. run complete January–June real-fixture equivalence tests and expand the invalid schema fixture matrix;
4. add persisted mapping/approval metadata only if the chosen operations model requires it, with an expand/contract migration plan;
5. perform a separately authorized, monitored, reversible production canary with post-write reconciliation.

Until those items are complete, keep production import and sync execution disabled for Phase 3 verification.

## Final Safety Record

```text
Production writes: 0
Production INSERT/UPDATE/DELETE/UPSERT: 0
Production schema changes: 0
Production migrations: 0
Google Sheets writes: 0
Agustus import executed: no
Agustus production state changed: no
```
