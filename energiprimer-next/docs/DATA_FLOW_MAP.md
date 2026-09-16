# Phase 0 — Google Sheets ↔ Service ↔ Prisma ↔ Supabase Data Flow Map

Audit date: 2026-09-15
Scope: end-to-end paths for Google Sheets ingestion, synchronization, dashboard reads, state/provenance, and failure handling.
Mutation policy: read-only audit. No database, Google Sheets, migration, environment, or application-source write was performed by this audit.

The requested `/docx` directory is absent. This report is stored in the active project’s established `energiprimer-next/docs` directory. Historical documents are linked as supporting context where useful; current source and verifier behavior take precedence.

## 1. Architecture diagram

```mermaid
flowchart TD
    G[Google Sheets workbook\nmetadata + values API] --> C[src/lib/google-sheets.ts\nOAuth/read-only client + cache]
    C --> D[Worksheet discovery\nsource bootstrap + lease + registry snapshot]
    D --> R[Exact worksheet read\nA1:ZZ500]
    R --> S[Scanner + anchors + structure\nsemantic table classification]
    S --> P[Parser + normalizer\nBB / daily / aggregate / target / cumulative]
    P --> V[Import plan + validators\ncanonical schema + confidence gates]
    V --> I[Stable source key + content hash\nINSERT / UPDATE / SKIP]
    I --> T{Write allowed?}
    T -- no --> X[SCHEMA_REVIEW / BLOCKED / FAILED\nno business write]
    T -- yes --> TX[Short Prisma transaction\nstaging + bulk normalized upserts + import run]
    TX --> N[(Supabase PostgreSQL\npublic schema)]
    I --> RS[Sync row-state persistence\nworksheet/schema provenance]
    RS --> N
    D --> N
    N --> O[src/services/overview-postgres.ts\nnormalized + legacy operational reads]
    O --> UI[Protected Next.js dashboard\noverview / biomassa / batubara / solar / stok / target]
    C --> F[Explicit Google dashboard fallback\nB11:CO59 + semantic scan]
    F --> UI
    K[Vercel Cron / authorized operator] --> E[/api/sync/google-sheets\nenvironment + cron + target gates]
    E --> D
    E --> TX
```

The diagram intentionally shows two dashboard data paths. PostgreSQL is the default runtime source; direct Google Sheets is an explicit rollback/fallback option. The sync path is not the same as the direct Google dashboard path.

## 2. Stage-by-stage trace

| Stage | Current function/module | Input | Output | Side effect | Main risk/control |
| --- | --- | --- | --- | --- | --- |
| Configuration | `getGoogleSheetsConfig()` | Environment variable names and optional credential file | Validated service-account config | None | Rejects missing/partial credentials; values are not logged |
| OAuth | `readServiceAccount()`, token request | Service-account identity/key | Access token | Process-local token cache | 15-second abort and classified Google errors |
| Metadata | `listGoogleSheetsWorksheets()` | Spreadsheet ID | `sheetId`, title, index, type, grid dimensions | Cache only | Does not inspect formulas, hidden/merged layout, or values |
| Source bootstrap | `ensureSyncSourceForDiscovery()` | Stable spreadsheet source key | `SyncSource` | Upsert before lease | Source registry can be changed before worksheet lease acquisition |
| Lease | `acquireSyncSourceLease()` | Source ID + token | Lease success/failure | Updates lease state | Source-wide lease serializes discovery/sync attempts |
| Discovery | `prepareWorksheetDiscovery()` / `persistGoogleSheetsWorksheetDiscovery()` | Metadata and current registry | Worksheet candidates/statuses | Registry transaction | Missing worksheets are marked; rows are not deleted |
| Read | `readAndParseDynamicWorksheet()` | Exact title + `A1:ZZ500` | `DynamicWorksheetReadResult` | Range cache | Bounded scan may omit data outside range |
| Scan/structure | scanner, anchors, structure analyzer | Cell grid | Normalized cells, header paths, date rows, table regions | None | Heuristic anchors and physical fallback for duplicate unit labels |
| Parse | dynamic parser/table parsers | Structure and cells | Daily/aggregate/target/cumulative records | None | Confidence and malformed-value warnings; some malformed daily values become null |
| Normalize | `normalizer.ts` | Parsed semantic records | Overview metrics/series and diagnostics | None | Derived totals can diverge from source totals and are warned |
| Plan | `buildGoogleSheetsImportPlanFromReadResult()` | Parsed result | Typed rows, staging rows, fingerprint, status | None | Blocks invalid/ambiguous/incomplete supplier/target/cumulative cases |
| Admission | `bb-policy.ts`, plan validation, preflight | Worksheet title, canonical snapshot, plan | Approved or blocked decision | May record schema state in normal sync | Automatic path only admits valid periods after July 2026 and exact canonical schema |
| Identity | `identity.ts`, `change-detection.ts` | Typed/staging rows and prior row state | Source key, content hash, INSERT/UPDATE/SKIP | None | Identity deliberately excludes source row/cell/workbook location |
| Business commit | `commitGoogleSheetsImportPlan()` | Approved plan + verified DB target | Staging/import run + normalized rows | Prisma transaction | Bulk fixed batches of 200; timeout remains 30 seconds |
| Sync state | `persistRowStates()` | Change list and content/schema hashes | `SyncRowState`, worksheet hashes | Separate transaction | One upsert per row is a remaining transaction hotspot |
| Finalization | `runGoogleSheetsIncrementalSync()` | Worksheet results | `SyncRun` counters/status | Updates registry/run and releases lease | Aggregate failure counters can be less precise than per-worksheet details |
| Dashboard read | `getPostgresOverviewData()` | Constrained month/year/day | `OverviewData` | Read-only | Runtime verifier passed for July 2026 |

Evidence: `src/lib/google-sheets.ts`; `src/services/google-sheets/sync/discovery.ts:153-404`; `sync/lease.ts:19-80`; `sync/engine.ts:112-168,377-621,624-995`; `import/plan.ts:527-752`; `import/commit.ts:138-303`; `sync/post-write-verification.ts:29-190`; `src/services/overview.ts:59-76`; `src/services/overview-postgres.ts`.

## 3. Mutation boundaries in the current application

This table describes the code’s possible effects, not actions performed during this audit.

| Boundary | Possible writes | Code evidence | Audit disposition |
| --- | --- | --- | --- |
| Google client | None; read-only OAuth scope and GET requests | `src/lib/google-sheets.ts:79,331-410,423-569` | Read-only inspected |
| Discovery | `sync_sources`, `sync_worksheets`, missing/status metadata, schema snapshot/change records | `src/services/google-sheets/sync/discovery.ts:237-404`; `sync/engine.ts:624-995` | Not executed by audit |
| Lease | Source lease columns | `sync/lease.ts:46-80` | Not executed by audit |
| Import commit | `spreadsheet_import_runs`, `spreadsheet_import_staging`, normalized/legacy domain tables | `src/services/google-sheets/import/commit.ts:138-303`; `import/bulk-upserts.ts:54-327` | Not executed by audit |
| Row-state commit | `sync_row_states`, worksheet/schema metadata | `src/services/google-sheets/sync/engine.ts:112-168` | Not executed by audit |
| HTTP route | GET and POST both invoke the sync handler | `src/app/api/sync/google-sheets/route.ts:41-161` | Not invoked by audit |
| Dashboard PostgreSQL path | SELECTs only in the reviewed service | `src/services/overview-postgres.ts` | Read-only runtime verifier executed |
| Post-write verifier | SELECTs `SyncRun`, registry, row state, import run | `src/services/google-sheets/sync/post-write-verification.ts:29-190` | Not executed after a write; inspected only |

The route has an environment gate, `CRON_SECRET` requirement, constant-time cron authorization, and a positive production-target check before invoking automatic sync (`route.ts:51-117`). However, the endpoint exposes the same write-capable handler through both GET and POST (`route.ts:155-161`); the operational contract should make the method choice explicit before production scheduling is treated as complete.

## 4. Representative entity traces

### 4.1 Biomass receipt

```text
Supplier labels in monthly aggregate
  → canonical supplier normalization / seven-supplier completeness gate
  → BiomassReceiptImportRecord(periodStart, supplierCode, quantityTon, source)
  → staging entityType=biomass_receipt
  → identity(period + supplier + unit/value unit)
  → biomass_receipts(period_start, supplier_code, quantity_ton, import_run_id, source_worksheet, source_cell)
  → PostgreSQL overview monthly receipt metric
```

The unique database identity is `(period_start, supplier_code)`. The current bulk upsert writes `import_run_id`, supplier name, quantity, worksheet, and cell (`import/bulk-upserts.ts:54-75`). The plan blocks incomplete supplier sets and target mismatches (`import/plan.ts:527-576`).

### 4.2 Biomass, coal, solar, and HOP daily rows

```text
date column + semantic resource/unit paths
  → daily parser / date-period validation
  → per-unit typed records
  → staging rows and content hashes
  → unit lookup for Unit 1/2/3
  → unique date/unit upserts
  → dashboard daily series and monthly sums
```

Biomass, solar, and HOP rows retain import-run and source worksheet/cell fields in their normalized tables. Coal consumption is written into the legacy `coal_consumption` table with `(unit_id, date, coal_used)` only; the current bulk query does not write import provenance (`import/bulk-upserts.ts:98-116`).

Coal stock is more constrained: only rows with both `closingStock` and `consumed` are writable, and the query updates `consumed` and `closing_stock` by unique date (`bulk-upserts.ts:119-136`). `opening_stock` and `received` exist in Prisma but are not populated by this import path. A full stock reconciliation must not be inferred from the current sync.

### 4.3 Target and cumulative

```text
semantic target/cumulative field
  → approved target / cumulative policy
  → BiomassTargetImportRecord / BiomassCumulativeImportRecord
  → biomass_targets / biomass_cumulative_snapshots
  → target/progress dashboard metrics
```

The plan accepts the explicit semantic target or an approved legacy fallback of `70,020`; it blocks values that do not match the approved target (`import/plan.ts:34,466-497,527-576`). The fallback path may have no source cell and therefore needs source-level confirmation before it is treated as a permanent source of truth.

## 5. Agustus26-BB production trace

The 2026-09-15 exact dry-run provides the clearest current end-to-end evidence:

1. Worksheet metadata was read from the live workbook.
2. The exact `Agustus26-BB` worksheet was read through the bounded semantic range.
3. Canonical policy recognized the source layout; the parser produced 352 candidates, 352 valid rows, 0 invalid rows, and 0 duplicate rows.
4. The write gate stopped at `worksheet_registry_error` because the live registry row remains `ERROR`/schema review from a previous failed attempt.
5. No business rows, staging rows, row states, or duplicates were present for Agustus; the read-only verifier reported `productionWrites: 0`.

Historical production evidence in `docs/GOOGLE_SHEETS_SYNC_AUDIT.md` records failed sync runs 16 and 17 with P2028/transaction-timeout symptoms and zero committed normalized rows. The current state verifier confirms the absence of Agustus records; it does not authorize registry repair or import.

Agustus production write eligibility: **NOT VERIFIED — WRITE OPERATION REQUIRED**. The required registry metadata change was intentionally not performed.

## 6. Failure and retry flow

```text
Google/API error ──classified──> transient? ──yes──> bounded retry
                                      │
                                      no
                                      │
                              worksheet/run failure

Plan/schema/identity failure ───────────────> BLOCKED / review, no domain write

Database transaction error ────────────────> rollback transaction
                                              + FAILED import run update
                                              + sync failure status
```

Google retries include rate-limit, timeout, and server errors; database retries include selected connection/transaction errors; P2028 is not retried (`src/services/google-sheets/sync/retry.ts`). The import transaction rolls back staging and normalized writes together, but the surrounding import-run row is created before the transaction and later marked failed (`import/commit.ts:147-182,184-303`).

## 7. Provenance and observability gaps

- `ImportStaging` has source worksheet/cell, but `sourceFromResolved()` sets source row to `null` for most resolved aggregate values (`import/plan.ts:67-76`).
- Staging stores `String(number)` for `rawValue`, losing the original displayed representation (`import/plan.ts:292-318`).
- Current post-write verification checks sync-run counters, registry hashes, row-state presence, and a successful import run, but it does not directly count every normalized table by business key or compare an import-run checksum to every written row (`sync/post-write-verification.ts:117-164`).
- Monitoring selects the first source by `updatedAt` and reports only that source’s latest run/worksheets/open changes (`sync/monitoring.ts`); multi-source visibility is not verified.
- The production target fingerprint includes host, port, database, and schema but not role, server version, or a Supabase project identifier (`sync/production-target.ts:175-185`). Target verification still checks current database/schema and required tables (`production-target.ts:205-290`).

## 8. Flow-level conclusion

The system has a coherent ingest spine with real gates and useful provenance tables, but it is not a single deterministic source-to-table contract yet. The major seams are the heuristic semantic resolver, legacy coordinate fallback, separate legacy mapper, separate row-state transaction, and differing provenance across normalized versus legacy target tables. Recommendation: retain the working spine and perform a partial reconstruction of the mapping/commit boundaries. See `RECONSTRUCTION_RECOMMENDATION.md`.
