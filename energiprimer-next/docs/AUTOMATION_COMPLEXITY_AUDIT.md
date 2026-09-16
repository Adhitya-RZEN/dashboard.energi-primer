# Phase 0 — Google Sheets Automation Complexity Audit

Audit date: 2026-09-15
Scope: service responsibilities, coupling, side effects, identity/upsert behavior, import/sync semantics, reliability, security, performance, and reconstruction hotspots.
Overall result: **PASS WITH FINDINGS**. The application is buildable and the read-only runtime path is working, but unattended production sync readiness is **2/4**.

No database, Google Sheets, migration, configuration, or application-source write was performed. The requested `/docx` directory is absent; this report is under `energiprimer-next/docs`, the active project documentation directory.

Phase 2 addendum: the canonical source/mapping/domain/identity/provenance/plan/commit/reconciliation/recovery seams are now implemented under `src/services/google-sheets/canonical/`. The current-model schema verifier finding below is resolved by `scripts/verify-supabase-production-schema.mjs`; the compatibility writer and production readiness remain separately gated.

## 1. Complexity scale

| Score | Meaning |
| ---: | --- |
| 1 | Local, deterministic, low coupling |
| 2 | Small boundary with limited variants |
| 3 | Several dependencies or business rules |
| 4 | Cross-layer state, fallback, or operational coupling |
| 5 | Heuristic, multi-stage, write-capable, or difficult to prove safe |

## 2. Service responsibility map

| Service/function | Primary responsibility | Inputs → outputs | Dependencies | Side effects | Complexity |
| --- | --- | --- | --- | --- | ---: |
| `getGoogleSheetsConfig()` | Validate Sheets deployment configuration | Env/file names → config | Node fs, env | None | 3 |
| `readGoogleSheetsRange()` | Read one values range | worksheet/range → rows | OAuth/fetch/cache | Cache | 3 |
| `listGoogleSheetsWorksheets()` | Read workbook metadata | spreadsheet → worksheet metadata | OAuth/fetch/cache | Cache | 3 |
| `readAndParseDynamicWorksheet()` | Exact sync read and parse | title → dynamic result | reader, scanner, parser | None | 4 |
| `readAndParseDynamicBBWorksheet()` | Dashboard/legacy BB read with fallback | requested period → effective result | metadata, resolver, reader, parser | None | 4 |
| `parseDynamicWorksheet()` | Discover semantic tables | cell grid → structures/records/diagnostics | anchors, classifier, table parsers | None | 5 |
| `resolveAnchorValue()` | Choose a numeric candidate | anchor/region → resolved value | parser/scoring/validators | None | 5 |
| `parseNumericValue()` / date validators | Normalize source values | raw cell → numeric/date status | locale heuristics | None | 3 |
| `buildGoogleSheetsImportPlan...()` | Convert parsed output into typed import rows | parsed result → plan/staging/fingerprint | normalizer, policy, validators | None | 5 |
| `prepareWorksheetPreflight()` | Read-only production readiness check | exact worksheet → preflight | metadata, registry, parser, plan, schema | None | 4 |
| `prepare/persistWorksheetDiscovery()` | Discover and persist registry | metadata → registry state | Prisma, source key | Registry/schema writes | 4 |
| `acquireSyncSourceLease()` | Serialize source operations | source ID → lease | Prisma time/conditional update | Lease write | 3 |
| `classifySyncRows()` | INSERT/UPDATE/SKIP classification | staging/prior states → changes | identity hashes | None | 4 |
| `commitGoogleSheetsImportPlan()` | Persist import and domain rows | approved plan → import result | Prisma, bulk SQL, units, target check | Staging/domain/import-run writes | 5 |
| `persistRowStates()` | Persist per-row incremental state | changes → row states | Prisma transaction | Row-state/worksheet writes | 5 |
| `runGoogleSheetsIncrementalSync()` | Orchestrate the whole sync | options → run counters/status | all sync modules | Many registry/run/lease/domain writes | 5 |
| `/api/sync/google-sheets` | Cron/operator HTTP boundary | authorized request → JSON status | env gate, cron auth, target verification, engine | Can trigger full sync | 4 |
| `getPostgresOverviewData()` | Assemble dashboard data | constrained query → overview DTO | Prisma, date rules | Reads only | 3 |
| `getGoogleSheetsOverviewData()` | Explicit direct-source dashboard fallback | query → overview DTO | Sheets range/semantic parser | Cache only | 4 |
| `verifyWorksheetSyncAfterWrite()` | Post-write consistency check | preflight/result → verification | Prisma + hashes | Reads only | 4 |

Evidence: `src/lib/google-sheets.ts`; `src/services/google-sheets/dynamic/*`; `src/services/google-sheets/import/{plan,commit,bulk-upserts}.ts`; `src/services/google-sheets/sync/{discovery,lease,identity,change-detection,engine,preflight,post-write-verification}.ts`; `src/app/api/sync/google-sheets/route.ts`; `src/services/{overview,overview-postgres,google-sheets-overview}.ts`.

## 3. Component scores

| Area | Score | Why it is complex | Current control |
| --- | ---: | --- | --- |
| Google auth/client | 3/5 | Service-account file/env alternatives, token/cache/timeout/status handling | Read-only scope, validation, safe errors |
| Worksheet discovery | 4/5 | Broad metadata inventory, mutable titles, immutable sheet IDs, missing/error states, lease | Registry, source key, conditional lease, fail-closed statuses |
| Parser/schema detection | 5/5 | Bounded scan, aliases, anchors, structural heuristics, duplicate labels, semantic and legacy layouts | Canonical July snapshot, confidence gate, schema review |
| Import plan/validation | 4/5 | Ten entity families, supplier completeness, target/cumulative rules, date and duplicate gates | `READY_FOR_IMPORT` gate and explicit blockers |
| Identity/change detection | 4/5 | Cross-model identity normalization and separate content hashes | Unique indexes plus `SyncRowState` |
| Commit/database | 5/5 | Staging, legacy and normalized tables, FK constraints, bulk SQL, transaction timeout, target checks | Fixed batches of 200, transaction rollback, target verification |
| Orchestration | 5/5 | Registry, lease, discovery, canonical admission, per-worksheet writes, retries, finalization | Environment/target gates, safe errors, run state |
| Scheduler/API | 4/5 | Cron auth, deployment gate, production target, GET+POST write route, 300-second route budget | Constant-time secret comparison and route gate |
| Dashboard consumers | 3/5 | PostgreSQL default plus direct Google fallback and period cutoff/fallback | Explicit source switch; runtime verifier |
| Observability/verification | 4/5 | Multiple run/registry/state/import ledgers and verification scripts | Diagnostics, read-only verifiers, post-write check; partial cross-table coverage |

Aggregate implementation complexity: **41/50 (high)**. This is an audit heuristic, not a performance measurement.

## 4. Top ten hotspots

### H1 — Heuristic value resolution can mis-map valid numeric cells (HIGH)

`resolveAnchorValue()` scores all numeric candidates by context and distance. Close competing values or confidence below `0.7` are blocked, but a single wrong candidate above the threshold can still be accepted (`src/services/google-sheets/dynamic/value-resolver.ts:145-239`). This is the highest correctness risk because it occurs before the database identity is generated.

Remedy: require canonical header-path coordinates or a reviewed mapping manifest for every writable field; reserve heuristic resolution for read-only discovery/review.

### H2 — Two mapping systems can disagree (HIGH)

The production sync engine uses the dynamic parser/import plan (`sync/engine.ts:377-621`), while the legacy mapper implements separate schema-family thresholds, path mapping, date gates, supplier mapping, and import readiness (`legacy-mapping/mapper.ts:89-142,481-749`). The legacy mapper is used by audit/operator scripts rather than the engine. This is a policy and behavior fork.

Remedy: make one canonical mapper the only source of writable import rows and make the other an explicitly read-only compatibility adapter.

### H3 — The import and row-state writes use separate transaction boundaries (HIGH)

The normalized import transaction is in `commitGoogleSheetsImportPlan()` (`import/commit.ts:184-265`); row states and worksheet metadata are persisted separately in `persistRowStates()` with a 30-second timeout (`sync/engine.ts:112-168`). A failure between those boundaries can leave domain rows and sync provenance temporarily out of sync.

Remedy: define a durable run state machine and an explicit recovery/reconciliation step; keep domain commit and row-state finalization distinct only if the run can be safely resumed and proven.

### H4 — P2028 history and transaction budget remain material (HIGH)

The 2026-09-15 incident evidence records production P2028 timeout symptoms for the previous per-record transaction pattern. Bulk SQL now batches row-heavy tables at 200 (`import/bulk-upserts.ts:22,36-51,268-327`), but the surrounding interactive transaction remains configured with a 30-second timeout (`import/commit.ts:264`). `persistRowStates()` also uses an individual upsert loop.

Remedy: measure statement/row budgets per entity, bulk row-state persistence, and use bounded transaction scopes with a recovery protocol rather than simply increasing timeouts.

### H5 — Provenance is incomplete and asymmetric (HIGH)

Most semantic aggregate sources store a cell but no source row (`import/plan.ts:67-76`); staging reconstructs `rawValue` from the normalized number (`plan.ts:292-318`). Normalized biomass/solar/HOP/receipt tables carry import-run/source fields, while legacy coal consumption and stock do not (`import/bulk-upserts.ts:98-136`). Post-write verification does not directly reconcile every normalized table and business key (`sync/post-write-verification.ts:117-164`).

Remedy: define a common source reference with workbook/source key, sheet ID, title snapshot, range, address, row, column, raw display value, and parser version. Add table-by-table reconciliation checks.

### H6 — Identity excludes workbook and worksheet location (HIGH)

The stable identity deliberately excludes source row/cell to survive sorting (`sync/identity.ts:67-74`). Its payload contains entity/date/unit/supplier/value-unit but not spreadsheet source or worksheet (`identity.ts:21-60`). The database unique keys can therefore cause two source locations to converge on the same business row, which is correct only if there is one authoritative source for that business key.

Remedy: distinguish business identity from source provenance. Keep business-key upserts where intentional, but reject competing source keys or record a source ownership rule before writing.

### H7 — Target fallback is a policy value, not verified source data (MEDIUM/HIGH)

The import plan uses `APPROVED_BIOMASS_TARGET = 70_020` and may construct a target when the semantic target is unavailable (`import/plan.ts:34,466-497`); validation blocks values different from 70,020 (`plan.ts:527-576`). This protects the approved policy but can mask a missing source field.

Remedy: separate “explicit source target” from “approved operational target” and require an operator approval record for the latter.

### H8 — GET and POST both expose a write-capable sync handler (MEDIUM/HIGH)

Both HTTP methods call `handle()` (`src/app/api/sync/google-sheets/route.ts:41-161`). Authentication and environment gates are present, but method semantics are not differentiated. An accidental GET, retry, or health probe can request a write-capable execution.

Remedy: reserve POST for writes, make GET a read-only preflight/status endpoint, and require an explicit idempotency/request contract for operator execution.

### H9 — Production schema verifier was stale against the current schema (RESOLVED IN PHASE 2)

The original finding was caused by a verifier that hard-coded 30 application tables, 30 primary keys, 19 foreign keys, and only the baseline migration. Phase 2 replaced it with current `schema.prisma`/migration-history derivation; the read-only live check now passes 31 tables, 278 columns, 31 primary keys, 21 foreign keys, and 44 indexes.

Resolution: keep verification derived from the selected production Prisma schema and migration history, with compatibility and unexpected-object classification. This does not authorize a production data write.

### H10 — Monitoring is source-narrow (MEDIUM)

The monitoring snapshot chooses one source based on `updatedAt` and reports that source’s latest run, worksheets, and open schema changes (`src/services/google-sheets/sync/monitoring.ts`). With broad worksheet discovery and possible multiple source records, this can hide another source’s failure.

Remedy: return per-source status and aggregate health; make stale/error registry states visible independently of latest-source selection.

## 5. Cross-axis findings

### Correctness

- Strong: exact worksheet reads, explicit period validation, canonical schema gates, supplier completeness, duplicate blocking, stable unique constraints, and rollback of the main import transaction.
- Weak: heuristic candidate acceptance, physical fallback for duplicate unit labels, legacy/semantic divergence, and target fallback.
- Missing evidence: actual formula/merged/hidden-cell semantics, source ownership across multiple workbooks, and full current database object parity.

### Security and privacy

- Google scope is read-only; cron authentication is explicit and uses safe error output.
- Production target checks pooler URL shape, database/schema identity, required tables, and SSL status (`sync/production-target.ts:104-151,205-299`).
- The target fingerprint omits role, server version, and Supabase project ID (`production-target.ts:175-185`), so it is not a complete target identity.
- Local env files contain sensitive-looking credentials; no values are reproduced in this report. A secret rotation or exposure response was not authorized/performed.
- RLS/policies and Supabase Data API privilege state are **NOT VERIFIED** by this audit; the app’s Prisma path uses PostgreSQL directly.

### Performance and reliability

- The previous row-by-row transaction pattern caused the documented P2028 failure. Fixed-batch raw SQL materially reduces statement count and passed the local disposable timing test described in `docs/GOOGLE_SHEETS_SYNC_AUDIT.md`.
- A 30-second interactive transaction budget remains, as does per-row row-state upsert behavior.
- Google and metadata caches are process-local; serverless instances do not share cache state.
- The `A1:ZZ500` bound is predictable but can silently exclude an expanded source layout unless the parser or preflight detects it.
- Retry classification is bounded, but P2028 is intentionally not retried (`sync/retry.ts`), so recovery depends on a later operator/cron run.

### Maintainability

- The active sync spine is discoverable, typed, and backed by several verifier scripts.
- Responsibility is spread across dynamic parsing, legacy mapping, direct dashboard parsing, sync planning, and import commit; the same source concept can have different implementations.
- Current docs have historical contradictions (for example, old migration-pending statements versus later production-applied notes in `docs/AGENT_CONTEXT.md`). Documentation should label historical snapshots and current evidence separately.
- The root README still describes Laravel as the primary architecture, while `energiprimer-next` is the active runtime (`docs/PROJECT_MAP.md:83-84,165,222`). This increases agent/operator orientation cost.

## 6. What is proven versus not proven

### Proven in this audit

- `npm.cmd run lint`: PASS.
- TypeScript `--noEmit`: PASS.
- Local and production Prisma schema validation: PASS.
- Dynamic semantic parser static verification: PASS.
- Production build: PASS; Next route inventory includes the sync route and all dashboard routes.
- Read-only production runtime verifier: PASS; PostgreSQL 17.6, public schema, 9,177 application rows, 2,406 stable data rows, July 2026 dashboard metrics/series, Unit 1/2/3 ordering, and August fallback to July.
- Read-only Agustus state verifier: PASS; zero Agustus rows/duplicates/staging/row states and `productionWrites: 0`.

### Not proven / not performed

- No import or sync write was performed; no registry reset/reconciliation was performed.
- No Google Sheets write was possible or attempted.
- The Phase 2 current-model production schema verifier passes its reviewed read-only parity checks.
- RLS/policies, Supabase Data API privileges, and project-ID-level target ownership are not verified here.
- No full browser/e2e sync run was performed; no `npm test` script exists in `package.json`.

## 7. Keep/refactor decision matrix

| Component | Decision | Reason |
| --- | --- | --- |
| Read-only Google client and metadata discovery | KEEP | Clear boundary, useful error taxonomy, safe scope |
| Worksheet registry/lease/state model | KEEP, then harden | Provides operational memory; current error recovery needs explicit reconciliation |
| Canonical July schema policy | KEEP | Appropriate fail-closed admission boundary |
| Dynamic parser as read-only analysis | KEEP | Valuable for varied source layouts and diagnostics |
| Dynamic parser as sole automatic writable mapper | REFACTOR | Replace heuristic persistence decisions with reviewed mapping manifests |
| Legacy fixed-coordinate fallback | KEEP as reviewed compatibility adapter | Useful for known historical layouts; never generalize |
| Separate legacy mapper | REFACTOR/CONSOLIDATE | Prevent policy and mapping divergence |
| Bulk normalized upserts | KEEP, measure | Correct direction; retain fixed batches and add budgets |
| Per-row `SyncRowState` upsert loop | REFACTOR | Remaining transaction/latency hotspot |
| Direct Google dashboard fallback | KEEP temporarily | Operational rollback path; label freshness/source clearly |
| Stale production schema verifier | REFACTOR | Derive expected objects from current production schema/history |
| Full rewrite of the application | REJECT | Existing runtime, schema, guards, and verified dashboard path are valuable and functioning |

## 8. Complexity conclusion

The automation is high-complexity because it combines a mutable external workbook, heuristic parsing, a canonical schema policy, multiple data models, incremental identity, transaction-heavy writes, registry/lease state, and a write-capable scheduler. Complexity is manageable only if the writable mapping contract becomes deterministic and the state/reconciliation boundaries are made explicit.

Recommendation: **PARTIAL_RECONSTRUCTION**, preserving the reader, policy, schema, dashboard, and database foundations while consolidating mapping, provenance, transaction/recovery, and verification. See `RECONSTRUCTION_RECOMMENDATION.md`.
