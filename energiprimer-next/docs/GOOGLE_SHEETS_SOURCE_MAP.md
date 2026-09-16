# Phase 0 — Google Sheets Source Map

Audit date: 2026-09-15
Scope: Google Sheets source, reader/auth boundary, worksheet discovery, parser/normalizer, import plan, sync admission, and dashboard fallback.
Mutation policy: this audit performed no Google Sheets writes, database writes, migrations, configuration changes, or source-code changes.

## Output location and evidence rule

The requested literal `/docx` directory does not exist in this repository. The active application is `energiprimer-next`, whose established documentation directory is `energiprimer-next/docs`; this file and the companion Phase 0 reports are therefore stored there. Existing historical documents remain references, not automatic runtime truth. The strongest evidence is the current source, current Prisma schema, migration files, and read-only verifier output.

Values from local environment files are intentionally omitted. Only variable names and code paths are recorded.

## 1. Source and authentication contract

| Concern | Current implementation | Evidence | Assessment |
| --- | --- | --- | --- |
| Spreadsheet identity | `GOOGLE_SHEETS_SPREADSHEET_ID` is required and is not exposed in diagnostics | `src/lib/google-sheets.ts:94-135` | Clear configuration boundary; workbook identity is not part of row identity hashes later in the pipeline |
| Service-account credentials | Either `GOOGLE_SHEETS_CREDENTIALS_PATH`, or `GOOGLE_SERVICE_ACCOUNT_EMAIL` plus `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `src/lib/google-sheets.ts:94-135,176-225` | Supports file and environment deployment modes; partial credentials fail closed |
| OAuth scope | `https://www.googleapis.com/auth/spreadsheets.readonly` | `src/lib/google-sheets.ts:79-81` | Read-only source access is appropriate for the audit contract |
| OAuth/token transport | Service-account JWT, token request, 15-second request abort | `src/lib/google-sheets.ts:225-319` | Timeout and status classification exist; token cache is process-local |
| Spreadsheet API | Sheets v4 values API for ranges and spreadsheets metadata API for worksheets | `src/lib/google-sheets.ts:331-410,423-569` | Separate metadata and value reads are explicit |
| Caching | Range cache and worksheet metadata cache keyed by spreadsheet/range with configured TTL | `src/lib/google-sheets.ts:83-91,331-410,423-569` | Useful for dashboard reads; caches are process-local and unbounded in cardinality |
| Secret handling | Diagnostics use safe categories/statuses; source does not log credential values | `src/lib/google-sheets.ts`, `src/services/google-sheets/sync/diagnostic-core.ts` | No secret value was copied into this audit |

The application has two source consumers:

1. The default dashboard reads PostgreSQL through `src/services/overview-postgres.ts`; `src/services/overview.ts:59-76` selects Google only when `DASHBOARD_DATA_SOURCE=google`.
2. The import/sync path reads Sheets, parses it, validates an import plan, and writes normalized PostgreSQL rows only after its target and admission gates pass.

## 2. Worksheet identity and discovery

The metadata call requests worksheet `sheetId`, title, index, sheet type, and grid dimensions, with `includeGridData=false` (`src/lib/google-sheets.ts:423-569`). The sync registry uses the immutable Google `sheetId` as the worksheet key; the title is mutable display metadata. The registered source key is a SHA-256-derived key from the spreadsheet identity (`src/services/google-sheets/sync/discovery.ts:59-65`).

Supported BB title parsing accepts Indonesian month names and the `MonthYY-BB` shape, including normalized title variants (`src/services/google-sheets/dynamic/worksheet-resolver.ts`). Discovery can observe/register all worksheets, while business policy admits only the supported BB period set. The current automatic policy is:

- canonical schema reference: `Juli26-BB`;
- required monthly source set: `Januari26-BB` through `Juli26-BB`;
- automatic future eligibility: valid BB periods after July 2026 and no later than the current UTC period;
- schema gate: exact semantic match to the approved July snapshot, with observed value-type drift allowed;
- unrelated, future, missing, disabled, schema-review, and error worksheets remain outside the automatic write path.

Evidence: `src/services/google-sheets/sync/bb-policy.ts:12-43,204-239,241-313` and `docs/GOOGLE_SHEETS_WORKSHEET_DISCOVERY.md`.

## 3. Read ranges and physical source layouts

The current dynamic sync reader reads one bounded range for each selected worksheet:

```text
A1:ZZ500
```

Evidence: `src/services/google-sheets/dynamic/reader.ts:15,31-118`. The reader first resolves the exact requested worksheet and does not silently substitute another worksheet in the automatic sync path. The separate dashboard/legacy reader can use a previous valid month as a controlled fallback (`reader.ts:31-89`).

The explicit rollback/dashboard reader also reads:

```text
B11:CO59
```

and concurrently performs a semantic `A1:ZZ500` read. The fixed range is interpreted as a zero-based array returned from column B, so the following are physical offsets in the legacy returned row, not universal source contracts:

| Business value | Returned-row index or row index | Absolute legacy cell/column | Current use | Evidence |
| --- | ---: | --- | --- | --- |
| Daily data rows | rows `0..30` | sheet rows 11–41 | Daily dashboard/legacy fallback | `src/services/google-sheets-overview.ts:45-48,457-484` |
| Total row | `31` | sheet row 42 | Monthly total fallback | `src/services/google-sheets-overview.ts:45-48,447-448` |
| Target row | `45` | sheet row 56 | Legacy target fallback | `src/services/google-sheets-overview.ts:46-49,448-507` |
| Cumulative row | `48` | sheet row 59 | Legacy cumulative fallback | `src/services/google-sheets-overview.ts:47-49,508` |
| Coal receipt | returned index `7` | `I` | Legacy monthly coal receipt | `src/services/google-sheets-overview.ts:56,662` and `src/services/google-sheets/import/plan.ts:216-232` |
| Coal daily total | returned index `26` | `AB` | Legacy daily coal total | `src/services/google-sheets-overview.ts:57,618` |
| Biomass daily total | returned index `27` | `AC` | Legacy daily biomass total | `src/services/google-sheets-overview.ts:52,606` |
| Coal stock | returned index `28` | `AD` | Legacy stock closing/consumed input | `src/services/google-sheets-overview.ts:61,484` |
| Biomass Unit 1/2/3 | returned indexes `18/21/24` | `T/W/Z` | Legacy daily unit values | `src/services/google-sheets-overview.ts:53-55,564-566` |
| Coal Unit 1/2/3 | returned indexes `17/20/23` | `S/V/Y` | Legacy daily unit values | `src/services/google-sheets-overview.ts:58-60,587-589` |
| HOP Unit 3/2/1 | returned indexes `34/35/36` | `AJ/AK/AL` | Legacy HOP values | `src/services/google-sheets-overview.ts:62-64,532-534` |
| Solar receipt | returned index `79` | `CC` | Legacy monthly/daily solar receipt | `src/services/google-sheets-overview.ts:66,642` |
| Solar daily | returned index `86` | `CJ` | Legacy daily solar value | `src/services/google-sheets-overview.ts:65,630` |
| Cumulative | returned index `91` | `CO` | Legacy cumulative/target value | `src/services/google-sheets-overview.ts:67,498-508` |

These coordinates are not a safe generalized schema. `approvedLegacyFallbacks()` deliberately limits fixed `I42`, `CC42`, and cumulative extraction to explicitly reviewed legacy worksheet names (`src/services/google-sheets/import/plan.ts:210-232`). New or unreviewed worksheets must use semantic mapping or remain in review.

## 4. Semantic source map

The dynamic parser scans cells, normalizes text, detects anchors, analyzes header paths, identifies a date column/data rows, classifies table regions, and resolves values. The parser’s typed contract is defined in `src/services/google-sheets/dynamic/types.ts`; its stages are distributed across `spreadsheet-scanner.ts`, `anchor-detector.ts`, `structure-analyzer.ts`, `table-classifier.ts`, `parser.ts`, and the table-specific parsers.

| Source structure / semantic signal | Business meaning | Application record/plan | Database target |
| --- | --- | --- | --- |
| Resource `BIOMASS`, a unit path for Unit 1/2/3, daily date | Biomass consumption by unit and day | `biomassConsumptionRows` | `biomass_consumptions` |
| Resource `COAL`, non-stock/non-HOP total, daily date | Coal consumption total by day | `coalConsumptionRows` plus unit rows | `coal_consumption` (legacy table) |
| Resource `COAL`, unit paths, daily date | Coal consumption by Unit 1/2/3 | `coalConsumptionRows` | `coal_consumption` |
| Resource `COAL`, `STOK AKHIR`/stock path, daily date | Closing coal stock and consumed value | `coalStockRows` | `coal_stock` (legacy table) |
| Seven reviewed biomass supplier labels in the monthly aggregate | Biomass receipt by supplier and month | `receiptRows` | `biomass_receipts` |
| Semantic monthly coal receipt total, or approved legacy fallback | Coal receipt by month | `coalReceiptRows` | `coal_receipts` |
| Resource `SOLAR`, total daily path | Solar consumption by day | `solarConsumptionRows` | `solar_consumptions` |
| Solar monthly receipt path or reviewed legacy fallback | Solar receipt by month | `solarReceiptRows` | `solar_receipts` |
| HOP paths for Unit 1/2/3 | HOP reading by unit and day | `hopRows` | `hop_readings` |
| Explicit target semantic field, otherwise approved fallback `70,020` under policy | Annual biomass target | `targetRows` | `biomass_targets` |
| Cumulative semantic field or reviewed legacy extraction | Biomass cumulative snapshot | `cumulativeRows` | `biomass_cumulative_snapshots` |

The seven canonical supplier codes are maintained in `src/services/google-sheets/legacy-mapping/profiles.ts:39-67`. Aggregate parsing chooses a summary `TOTAL` row when it has sufficient numeric coverage, otherwise it uses a supplier data block; duplicate supplier labels are reduced by canonical match, coverage, and leftmost position (`src/services/google-sheets/dynamic/monthly-aggregate-parser.ts`). The import gate still requires the complete reviewed supplier set (`src/services/google-sheets/import/plan.ts:527-576`).

## 5. Normalization and parser variants

### Text and worksheet variants

Cell text is normalized with Unicode normalization, non-breaking-space removal, whitespace collapse, and uppercase comparison (`dynamic/spreadsheet-scanner.ts`). Worksheet resolution recognizes Indonesian month variants and normalizes punctuation/spacing (`dynamic/worksheet-resolver.ts`). Dashboard aliases include known spelling variants and the existing `CURENT` typo (`dynamic/dashboard-table.ts`).

### Numeric variants

`parseNumericValue()` accepts JavaScript numbers, decimal strings, comma decimals, dot decimals, mixed separators, percentages, parentheses for negative values, and empty markers such as `-`, `N/A`, `NA`, and `NULL` (`dynamic/validators.ts:12-56`). `parseTargetNumber()` treats a single three-digit separator as a thousands-form target (`validators.ts:58-70`).

This remains a correctness boundary: a three-digit dot/comma separator can be either a thousands separator or a decimal separator in an Indonesian/English source. The generic parser resolves this heuristically, while target parsing has a special case. Percent signs are stripped but the numeric value is not scaled to a fraction. Both behaviors must be part of any future source contract.

### Dates and empty values

Day values may be numbers, ISO-like strings, slash/dash dates, or day-only strings. Two-digit years are interpreted as 2000-based; dates are converted to UTC and must match the requested month/year (`dynamic/validators.ts:73-125`). Empty daily values are retained as valid empty records in staging, while empty receipt/stock/solar receipt records are dropped by the plan builder (`import/plan.ts:579-707`).

### Formulas, display formatting, and worksheet presentation

The values reader does not request formula text, formula metadata, hidden-row/column metadata, merged-cell structure, or worksheet visibility in its API fields (`src/lib/google-sheets.ts:331-410,423-569`). The effective source contract is therefore the returned value grid plus limited worksheet metadata. Formula provenance and presentation-level distinctions are **NOT VERIFIED**; a source workbook review is required before relying on formulas, merged headers, hidden columns, or display formatting as business semantics.

## 6. Mapping confidence and source risks

The value resolver scans candidate numeric cells in a heuristic region and scores them by labels, units, row/column context, adjacency, and distance. It returns `ambiguous` when close candidates disagree or confidence is below `0.7` (`src/services/google-sheets/dynamic/value-resolver.ts:145-239`). This is a useful fail-closed control, but the mapping is not equivalent to an immutable coordinate contract.

The principal source risks are:

1. Duplicate or weakly labeled Unit 2/Unit 3 columns can fall back to physical order (`import/plan.ts:78-109`), which is safe only when the workbook layout has already passed the canonical schema gate.
2. Legacy fixed coordinates and semantic paths coexist. A value can be available through one reader and unavailable through the other.
3. `sourceFromResolved()` records the cell address but sets the row to `null` (`import/plan.ts:67-76`); daily rows have better row provenance through `dailySource()` (`plan.ts:272-290`).
4. Staging `rawValue` is reconstructed from the parsed number (`plan.ts:292-318`), so the original displayed string is not retained for most semantic values.
5. A source key excludes worksheet/workbook location by design; the consequences are documented in `DATABASE_MAPPING.md` and `AUTOMATION_COMPLEXITY_AUDIT.md`.

Production write eligibility for `Agustus26-BB`: **NOT VERIFIED — WRITE OPERATION REQUIRED**. A metadata-only registry reconciliation would be required before a controlled write could be considered, and that operation is outside this audit.

## 7. Readiness conclusion for the source layer

Source-layer readiness: **2/4 — controlled import/preflight only**.

The reader, title resolver, semantic parser, schema snapshot, canonical July policy, and dry-run gates are substantial and currently verifiable. Unattended production readiness is not established because the source mapping remains partly heuristic, legacy and semantic paths coexist, formula/presentation provenance is incomplete, and the current production registry has an `ERROR` row for `Agustus26-BB` that blocks the exact dry-run from becoming a write.

Read-only evidence on 2026-09-15:

- live exact dry-run: `Agustus26-BB`, 352 candidates, 352 valid, 0 invalid, 0 duplicates, write not executed because `worksheet_registry_error`;
- live production-state verifier: 0 Agustus business/staging/row-state records and 0 duplicate groups, `productionWrites: 0`;
- dynamic parser static verification: PASS.

See `DATA_FLOW_MAP.md`, `DATABASE_MAPPING.md`, `AUTOMATION_COMPLEXITY_AUDIT.md`, and `RECONSTRUCTION_RECOMMENDATION.md` for the downstream and remediation implications.
