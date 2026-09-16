# Phase 0 — Active Prisma / Supabase Database Mapping

Audit date: 2026-09-15
Scope: active Prisma models, production migration history, source-to-table mapping, identities, constraints, dashboard reads, and actual Supabase runtime evidence.
Mutation policy: read-only audit. No INSERT, UPDATE, DELETE, UPSERT, ALTER, migration, or external source write was performed.

Phase 2 status: the canonical contract modules and the current-model read-only schema verifier were added without a schema migration or production data mutation. The verifier now reports the current 31-model schema and separates compatibility objects from current objects.

The previous version of this document was a Laravel-only database audit. It is retained in repository history but is replaced here as the active mapping because `energiprimer-next` is the current runtime. The requested literal `/docx` directory is absent; this active report is stored in the established `energiprimer-next/docs` directory.

## 1. Database identity and migration history

| Item | Current evidence | Assessment |
| --- | --- | --- |
| ORM/provider | Prisma 6.19.3, PostgreSQL, `public` schema | `prisma/production/schema.prisma:1-10` |
| Active production schema | `prisma/production/schema.prisma` | 31 mapped application models, 3 user-management enums |
| Local application schema | `prisma/schema.prisma` | Byte-for-byte SHA-256 match with production schema at audit time (`435ACA5D…4484A1`); local and production migration histories are not interchangeable |
| Production history | `20260901130000_production_schema_baseline`, then `20260908120000_add_user_management_data_model` | Full production baseline followed by user/audit additions |
| Local history | Laravel no-op baseline, additive dashboard/import/coal/sync migrations, then user/audit migration | Represents a different deployment history |
| Runtime | Supabase transaction pooler, database `postgres`, schema `public`, PostgreSQL 17.6 | Read-only runtime verifier PASS on 2026-09-15 |
| DB views/triggers/functions | None found in reviewed migrations | **NOT VERIFIED** against every provider object outside the reviewed migration files |
| RLS/policies/Data API privileges | No current evidence in this audit | **NOT VERIFIED**; Prisma server path is the reviewed application boundary |

The production schema has 31 models because `UserAuditLog` and the user-management fields are part of the current schema (`prisma/production/schema.prisma:1-63`). The Phase 2 `scripts/verify-supabase-production-schema.mjs` now derives its table/column/primary-key inventory from that schema and its indexes/foreign keys/migration history from all local production migrations.

The current schema validation commands passed:

- local Prisma schema: PASS;
- production Prisma schema: PASS;
- production build TypeScript phase: PASS.

## 2. Model inventory by responsibility

### Authentication, framework, and legacy operational models

| Prisma model | Table | Role in current system | Key constraints/relations |
| --- | --- | --- | --- |
| `User` | `users` | Auth.js credentials and user management | Unique email/username; role/status enums; role index |
| `UserAuditLog` | `user_audit_logs` | User-management audit trail | Actor/target user FKs; action enum; indexes on actor, target, created time |
| `PasswordResetToken` | `password_reset_tokens` | Password reset | Email primary key |
| `Session` | `sessions` | Auth/session storage compatibility | Primary key and user index |
| `Cache` / `CacheLock` | `cache` / `cache_locks` | Framework cache | Key primary keys; expiration indexes |
| `Job` / `JobBatch` / `FailedJob` | `jobs` / `job_batches` / `failed_jobs` | Queue compatibility | Queue/batch indexes; failed-job UUID unique |
| `Unit` | `units` | Unit reference data | Unique `code`; referenced by unit-grain operational/import tables |
| `CoalStock` | `coal_stock` | Legacy daily stock ledger reused by import | Unique `date`; aggregate rather than unit-grain; opening/received/consumed/closing decimals |
| `CoalQuality` | `coal_quality` | Legacy quality data | Unique `(unit_id,date)`; FK to `units` |
| `CoalConsumption` | `coal_consumption` | Legacy coal consumption table reused by import | Unique `(unit_id,date)`; FK to `units`; has `coal_used` and additional nullable legacy KPI fields |
| `PowerGeneration` | `power_generation` | Legacy/reference operational data | Unique `(unit_id,date)`; FK to `units` |
| `KpiTarget` | `kpi_targets` | Legacy per-unit KPI target data | Unique `(unit_id,date)`; FK to `units` |
| `SpreadsheetImportLog` | `spreadsheet_import_logs` | Legacy import-log compatibility | No domain unique key beyond ID |

Evidence: `prisma/production/schema.prisma:29-252`. Legacy models are not safe to delete merely because the current normalized dashboard path does not populate all of them.

### Synchronization and provenance models

| Prisma model | Table | Grain and purpose | Key fields/constraints |
| --- | --- | --- | --- |
| `SyncSource` | `sync_sources` | One registered external spreadsheet source | Unique `source_key`; unique `(provider,external_id)`; lease fields |
| `SyncWorksheet` | `sync_worksheets` | One worksheet identity inside a source | Unique `(source_id,worksheet_key)`; title, status, schema/content hashes, row count |
| `SyncRun` | `sync_runs` | One orchestration attempt | Source, trigger, status, counters, duration/error summary; source/time/status indexes |
| `SyncRowState` | `sync_row_states` | Last-seen content per worksheet business/source key | Unique `(worksheet_id,source_key)`; content hash and last-seen/synced timestamps |
| `SyncSchemaChange` | `sync_schema_changes` | Detected schema transition/review record | Worksheet, previous/current snapshot/hash, change type/status |
| `SpreadsheetImportRun` | `spreadsheet_import_runs` | One typed import plan/commit attempt | Requested/effective worksheet and period, source range, checksum, status, row counters |
| `SpreadsheetImportStaging` | `spreadsheet_import_staging` | Row-level validated import evidence | Import-run FK; entity/date/unit/supplier/raw/normalized/source fields; validation status |

Evidence: `prisma/production/schema.prisma:254-413`.

### Normalized import models

| Prisma model/table | Source grain | Business identity | Written fields | Dashboard/use |
| --- | --- | --- | --- | --- |
| `BiomassReceipt` / `biomass_receipts` | Month × canonical supplier | Unique `(period_start,supplier_code)` | Import run, period, supplier code/name, tons, worksheet, cell | Biomass monthly receipt and supplier breakdown |
| `CoalReceipt` / `coal_receipts` | Month | Unique `period_start` | Import run, period, tons, worksheet, cell | Coal monthly receipt |
| `BiomassConsumption` / `biomass_consumptions` | Day × unit | Unique `(unit_id,reading_date)` | Import run, unit, day, tons, worksheet, cell | Biomass daily/unit series and monthly sum |
| `CoalConsumption` / `coal_consumption` | Day × unit | Unique `(unit_id,date)` | Unit, day, `coal_used` only in current bulk import | Coal daily/unit series and monthly sum |
| `CoalStock` / `coal_stock` | Day, aggregate | Unique `date` | `consumed`, `closing_stock` only in current bulk import | Stock series/current stock |
| `SolarReceipt` / `solar_receipts` | Month | Unique `period_start` | Import run, period, liters, worksheet, cell | Solar monthly receipt |
| `SolarConsumption` / `solar_consumptions` | Day | Unique `reading_date` | Import run, day, liters, worksheet, cell | Solar daily/monthly consumption |
| `HopReading` / `hop_readings` | Day × unit | Unique `(unit_id,reading_date)` | Import run, unit, day, HOP days, worksheet, cell | HOP daily/unit status |
| `BiomassTarget` / `biomass_targets` | Year | Unique `target_year` | Import run, target, unit, source, status | Target/progress metric |
| `BiomassCumulativeSnapshot` / `biomass_cumulative_snapshots` | Month | Unique `period_start` | Import run, period, cumulative tons, source, cell | Cumulative/progress metric |

Evidence: `prisma/production/schema.prisma:415-542`; write behavior: `src/services/google-sheets/import/bulk-upserts.ts:54-327`.

## 3. Canonical source-to-Prisma mapping

| Google meaning | Parser/plan field | Prisma table/columns | Upsert key | Provenance quality |
| --- | --- | --- | --- | --- |
| Seven canonical biomass supplier totals | `receiptRows` / `BiomassReceiptImportRecord` | `biomass_receipts.period_start`, `supplier_code`, `supplier_name`, `quantity_ton`, `import_run_id`, `source_worksheet`, `source_cell` | `(period_start,supplier_code)` | Cell retained; aggregate row often null |
| Daily biomass by Unit 1–3 | `biomassConsumptionRows` | `biomass_consumptions.unit_id`, `reading_date`, `quantity_ton`, source/import fields | `(unit_id,reading_date)` | Daily source cell/row generally available |
| Monthly coal receipt | `coalReceiptRows` | `coal_receipts.period_start`, `quantity_ton`, source/import fields | `period_start` | Semantic or approved legacy cell |
| Daily coal by Unit 1–3 | `coalConsumptionRows` | `coal_consumption.unit_id`, `date`, `coal_used` | `(unit_id,date)` | No import run/source fields in target table |
| Daily coal stock closing/consumed | `coalStockRows` | `coal_stock.date`, `consumed`, `closing_stock` | `date` | No import run/source fields; opening/received not imported |
| Daily solar consumption | `solarConsumptionRows` | `solar_consumptions.reading_date`, `quantity_liter`, source/import fields | `reading_date` | Daily cell retained |
| Monthly solar receipt | `solarReceiptRows` | `solar_receipts.period_start`, `quantity_liter`, source/import fields | `period_start` | Cell retained |
| Daily HOP by Unit 1–3 | `hopRows` | `hop_readings.unit_id`, `reading_date`, `hop_days`, source/import fields | `(unit_id,reading_date)` | Daily cell retained |
| Explicit annual biomass target | `targetRows` | `biomass_targets.target_year`, `target_ton`, source/status/import | `target_year` | Explicit source when present |
| Approved target fallback | `targetRows` with `70,020` | Same `biomass_targets` columns | `target_year` | Source cell can be null; policy value, not source proof |
| Monthly cumulative biomass | `cumulativeRows` | `biomass_cumulative_snapshots.period_start`, `cumulative_ton`, source/import fields | `period_start` | Semantic/legacy cell; source row may be absent |

Plan construction evidence: `src/services/google-sheets/import/plan.ts:326-522,579-707`. The import source range recorded in `SpreadsheetImportRun` is `A1:ZZ500` for the dynamic path (`plan.ts:710-752`).

## 4. Identity, idempotency, and collision behavior

### Application identity

`sourceKeyForIdentity()` hashes entity type, date/period, target year, unit, supplier code, and value unit. It intentionally omits worksheet, workbook, row, and cell (`src/services/google-sheets/sync/identity.ts:21-83`). `contentHashForIdentity()` adds the normalized value and distinguishes `NULL` from a number (`identity.ts:76-83`).

The synchronization classifier maps a staging row to INSERT, UPDATE, or SKIP; duplicate current source keys in one plan are blocked (`sync/change-detection.ts:31-66`). The classifier does not independently identify pre-existing duplicate business rows; database unique constraints remain the final structural guard.

### Database identity

The normalized unique constraints are the authoritative upsert keys listed above. They make repeated imports idempotent for one business source, but they also mean two workbooks or two worksheets can converge on one row if they produce the same business key. This is safe only under an explicit source-ownership rule. Provenance and business identity should be separated rather than silently relying on the same hash.

### Import-run idempotency

`commitGoogleSheetsImportPlan()` computes a staging-row checksum and returns the previous successful import run when the source, requested/effective worksheet/period, range, checksum, and status match (`src/services/google-sheets/import/commit.ts:138-168`). This prevents duplicate work for an exact repeated plan. It does not by itself prove that every target row still matches the successful run unless post-write verification is run.

## 5. Transaction and write semantics

The normal import sequence is:

1. verify the explicit production target when required;
2. return an existing successful checksum match when present;
3. create a processing `SpreadsheetImportRun`;
4. inside one Prisma transaction, create staging in batches of 200, bulk-upsert row-heavy tables, upsert target/cumulative records, and mark the import run successful;
5. on error, mark the import run failed after the transaction rollback.

Evidence: `src/services/google-sheets/import/commit.ts:138-303`; batch implementation: `import/bulk-upserts.ts:22-51,268-327`.

The transaction timeout remains 30 seconds (`commit.ts:264`). The 2026-09-15 production incident report records P2028 timeout symptoms from the previous row-by-row implementation. Bulk SQL materially reduced local disposable timing, but the row-state persistence path still loops one `SyncRowState.upsert()` per change in a separate 30-second transaction (`src/services/google-sheets/sync/engine.ts:112-168`).

The import pipeline does not delete source-absent business rows. This is conservative for history, but it means corrections/removals in Google Sheets require a separately defined reconciliation policy.

## 6. Dashboard source-of-truth map

| Consumer | Default source | Tables/read path | Alternative |
| --- | --- | --- | --- |
| Overview and detail dashboard pages | PostgreSQL | `src/services/overview-postgres.ts` reads normalized tables plus legacy coal tables | Direct Google only when `DASHBOARD_DATA_SOURCE=google` |
| Biomass | `biomass_receipts`, `biomass_consumptions`, target/cumulative | `getPostgresOverviewData()` | Google semantic/legacy fallback |
| Batubara | `coal_receipts`, `coal_consumption`, `coal_stock` | `getPostgresOverviewData()` | Google legacy/semantic fallback |
| Solar | `solar_receipts`, `solar_consumptions` | `getPostgresOverviewData()` | Google legacy/semantic fallback |
| Stock | `coal_stock` | `getPostgresOverviewData()` | Google legacy fallback |
| Target/progress | `biomass_targets`, `biomass_cumulative_snapshots` | `getPostgresOverviewData()` | Google fallback with approved target constant |
| Quality/data report | `coal_quality`, `units`, legacy query services | Existing app services/routes | No proven Sheets normalized mapping |
| Monitoring | Sync registry/run state | `sync/monitoring.ts` | No multi-source proven aggregate |

`src/services/overview.ts:59-76` is the source-selection boundary. Read-only production runtime evidence on 2026-09-15 returned:

- July 2026 biomass receipt: `3223.46`;
- biomass consumption: `3740.6500000000005`;
- coal receipt: `30084.842`;
- solar consumption: `24274`;
- solar receipt: `25000`;
- biomass cumulative: `29103.77`;
- target: `70020`;
- progress: `41.564938588974584%`;
- daily chart order: Unit 1, Unit 2, Unit 3;
- Agustus request fallback: effective July 2026.

The runtime verifier reported 9,177 application rows and 2,406 stable data rows, with `localDatabaseWrites: 0` and `supabaseWrites: 0`.

## 7. Actual Supabase comparison and drift status

### What was verified

- The pooler target connected to database `postgres`, schema `public`, PostgreSQL 17.6.
- All required synchronization/import tables were reachable through the application’s production target verifier.
- The runtime dashboard read path returned expected July metrics/series and fallback behavior.
- The read-only Agustus state verifier found zero Agustus business rows, staging rows, row states, or duplicates and reported `productionWrites: 0`.

### What is structurally unresolved

The updated read-only structural verifier compares Supabase against the current production schema and migration history. The 2026-09-15 run reported 31/31 application tables, 278/278 columns, 31/31 primary keys, 21/21 foreign keys, 44/44 indexes, complete migration-history parity, and 9,179 application rows. It classifies retained auth/framework/legacy/operational tables as compatibility objects rather than unexpected objects.

Therefore:

- current-schema-to-live **runtime compatibility: PASS** for the verified dashboard/required-table path;
- current-schema-to-live **full object parity: PASS** for the reviewed tables, columns, constraints, indexes, and local migration history;
- RLS/policies, Data API privileges, and provider-side objects outside reviewed migrations remain **NOT VERIFIED**.

No migration or corrective database operation is authorized by this Phase 0 audit.

## 8. Mapping gaps and decisions

1. `coal_consumption` and `coal_stock` are legacy tables with no import-run/source provenance. Keep them for compatibility, but add a deliberate provenance/reconciliation boundary before expanding automation.
2. `coal_stock` has opening/received fields in the schema, but the current importer writes only consumed/closing. Do not call the current import a complete stock ledger.
3. `SpreadsheetImportStaging` stores both source columns and validation status, but most resolved aggregate rows lack source row and original raw text.
4. Seven supplier completeness is enforced in the plan; supplier aliases/patterns in the legacy mapper must not bypass the gate.
5. No `biomass_stock` table exists; a separate stock concept must not be inferred from `coal_stock`.
6. No current Google mapping was proven for `coal_quality`, `power_generation`, or `kpi_targets`; these remain legacy/reference domains.
7. RLS/policy status, external Supabase Data API access, and database project ownership are **NOT VERIFIED** in this audit.

## 9. Database readiness conclusion

Database mapping readiness: **3/4 for controlled reads and dry-run planning; 2/4 for unattended writes**.

The schema has useful normalized entities, stable unique keys, provenance tables, and a working PostgreSQL dashboard path. It still needs a current structural verifier, common provenance, an explicit source-ownership rule, bulk row-state persistence, and a tested reconciliation model before automatic production import can be called ready.
