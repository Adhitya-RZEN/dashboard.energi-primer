# Project Audit — Energi Primer

> **HISTORICAL / SUPERSEDED:** This 2026-09-02 audit predates the Phase 6J
> discovery transaction implementation. Findings that describe the old
> discovery write shape or test coverage are retained as evidence; the current
> status is in `PHASE6J_IMPLEMENTATION_REPORT_2026-09-04.md`.

Audit date: 2026-09-02
Auditor scope: static repository and current-worktree audit of `energiprimer-next`.
Mutation policy: no production source code was modified. No database, Google Sheets, mail provider, Vercel project, or other external system was written during this audit.

## Executive conclusion

The application has a coherent Next.js/Prisma dashboard core, server-side admin authorization, a typed Google Sheets import pipeline, and useful static verification scripts. It is not currently a clean release baseline. The highest risks are:

1. the write-capable Google Sheets sync route allows non-local database writes without enforcing production deployment identity;
2. the current worktree does not type-check because an incomplete Supabase recovery path is missing dependencies and conflicts with the Auth.js password form;
3. local ignored files contain actual-looking service credentials and private key material;
4. there are two migration histories with different operational assumptions;
5. the importer/dashboard boundary has verified data-quality and reconciliation gaps; and
6. there is no real unit/integration/E2E test suite for authentication, mutations, or imports.

These findings do not prove that production is compromised or that production data is wrong. Production deployment state, live database contents, Vercel environment wiring, Google workbook contents, and Supabase policies were not queried in this audit and remain **UNKNOWN** unless stated otherwise.

## Evidence and confidence rules

- **VERIFIED** — directly observed in source/configuration or reproduced by a local command.
- **INFERRED** — strongly supported by source relationships but not confirmed against live data.
- **UNKNOWN** — cannot be established from this repository-only audit.
- Finding confidence uses `CONFIRMED`, `LIKELY`, `POSSIBLE`, or `UNKNOWN` as requested.

Older files under `energiprimer-next/docs/`, root `docs/`, and generated `graphify-out/` were treated as historical/context only when they conflicted with current source. The current source and command output are authoritative.

## Verification snapshot

Commands were run from `energiprimer-next` with Windows command wrappers where needed.

| Check | Result | Interpretation |
|---|---|---|
| `npm.cmd run lint` | PASS | ESLint completed successfully |
| `npx.cmd tsc --noEmit --incremental false` | FAIL | Missing Supabase packages, untyped Supabase callback parameters, and unsupported `recovery` prop |
| `npm.cmd run sync:verify-cron-auth` | PASS | Constant-time cron authorization harness passed |
| `npm.cmd run sync:verify-retry` | PASS | Retry classification harness passed |
| `npm.cmd run sync:verify-auto-admission` | PASS | Automatic worksheet admission harness passed |
| `npm.cmd run dynamic:verify` | PASS | Dynamic parser fixture harness passed |
| `npm.cmd run bb:mapping:test` | PASS, 27 assertions | Legacy mapping fixture harness passed |
| `node ... scripts/verify-schema-detection.ts` | PASS | Schema detection harness passed |
| `node ... scripts/verify-preview-write-safety.ts` | FAIL | Expected environment gate is not present in the sync route |
| `npm.cmd run auth:security:verify` | FAIL | Harness is line-ending-sensitive; direct source review confirms the outward reset response is generic |
| `npm test` / Playwright | NOT AVAILABLE | No test script, Playwright dependency, config, or test/spec tree discovered |
| `next build` | NOT completed | TypeScript failure is already a release blocker; no source/build mutation was attempted beyond normal tooling |
| Live DB/Google/Resend/Vercel checks | NOT RUN | Deliberately excluded to avoid external reads/writes and reliance on local secrets |

The auth verifier failure is a test-harness defect/false negative, not evidence that the reset action leaks account existence: the source uses the same generic outward message for known and unknown addresses. The preview safety verifier failure is substantive because the expected route gate is absent.

## Findings, ordered by severity

### SEC-001 — Remote-capable sync has no deployment-environment gate

Category: Security / Deployment
Severity: **HIGH**
Confidence: **CONFIRMED**

Location:

- `src/app/api/sync/google-sheets/route.ts:17-32`
- `src/lib/deployment-environment.ts:39-50` (untracked and unused)
- `scripts/verify-preview-write-safety.ts:24-34`

Evidence: after checking `CRON_SECRET`, the route calls `runGoogleSheetsIncrementalSync` with `allowNonLocalDatabase: true`. The repository contains an `isSyncAllowedEnvironment` helper that would allow production/development and deny preview/unknown, but no production source import uses it. The preview-write-safety verification fails while looking for this gate.

Impact: any deployment that has the cron secret and database/Google credentials can reach a write-capable sync path regardless of whether it is a Vercel Preview, an unknown deployment identity, or an intended production deployment. A preview configured with production-like credentials could write to a remote database. This was not actively exploited.

Recommendation: enforce a fail-closed deployment gate before discovery or database access; use separate preview credentials/database; make the route’s allowed environments explicit; add a route-level test that proves preview/unknown cannot execute the sync engine.

### BUILD-001 — Current worktree does not type-check because the Supabase recovery addition is incomplete

Category: Build / Architecture / Authentication
Severity: **HIGH**
Confidence: **CONFIRMED**

Location:

- `src/app/password/reset/page.tsx:5,29`
- `src/app/password/change/ChangePasswordForm.tsx:9`
- `src/lib/supabase/client.ts`, `server.ts`, `authorization.ts`
- `package.json`

Evidence: TypeScript reports that `ChangePasswordForm` accepts no `recovery` prop; `@supabase/ssr` and `@supabase/supabase-js` cannot be resolved; and `cookiesToSet` callback parameters are implicitly `any`. Neither Supabase package is in `package.json` or `node_modules`. The active login and password-change action still use Auth.js/Prisma and require the current password.

Impact: the current worktree cannot pass strict type-checking. The Supabase recovery page is also functionally incompatible with the form it renders: it authenticates through Supabase but submits an Auth.js/Prisma current-password action. A release including these files is blocked.

Recommendation: decide whether Auth.js/Prisma remains the sole authentication architecture or complete a deliberately tested migration. Do not add an isolated dependency or prop workaround without tracing session, password, callback, role, and deployment behavior end-to-end.

### SEC-002 — Credential and private-key material is present in local ignored files

Category: Secrets / Operational Security
Severity: **HIGH**
Confidence: **CONFIRMED**

Location and types:

- `energiprimer-next/.env.local`: actual-looking database credential material and commented mail credential material were detected; values intentionally omitted.
- `energiprimer-next/.env.e2e.local`: local E2E Supabase service-role/public keys, database URL, and test credentials are present; values intentionally omitted.
- `energiprimer-next/credentials/monitoring-ep-a5b4cbfb6cd4.json`: Google service-account JSON containing a private key; value intentionally omitted.

Impact: ignored does not mean safe if a workstation, archive, log, backup, screenshot, or Git history is exposed. The audit did not establish whether any value was ever committed or used outside the intended local environment.

Recommendation: rotate any credential that may have left the intended machine or history; keep only redacted templates in version control; use a secret manager for deployment; scan Git history and CI artifacts; ensure E2E secrets cannot target production.

### TEST-001 — Critical paths have no real automated test suite

Category: Testing / Release Quality
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location: `package.json`, `energiprimer-next/` test/config inventory, `scripts/verify-*`.

Evidence: no `test` script, Playwright dependency, `playwright.config`, unit-test dependency, or tracked `*.test.*`/`*.spec.*` files were found. Several focused static/operator scripts pass, but they are not a substitute for browser, database-mutation, API-contract, or end-to-end coverage.

Impact: regressions in login/session invalidation, direct protected-route access, password reset, importer transactions, source reconciliation, filter summaries, and cron authorization can ship without a repeatable test signal.

Recommendation: add tests in priority order: authorization and auth actions; importer/parser fixtures and failure cases; database mutation/uniqueness/idempotency; sync route environment/secret gate; dashboard service contracts; then browser E2E with isolated credentials and database.

### DEP-001 — Two migration histories create deployment ambiguity

Category: Deployment / Database Governance
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location:

- `prisma/migrations/0_baseline_existing_laravel_schema/migration.sql`
- `prisma/migrations/20260830*`
- `prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql`
- `prisma/schema.prisma` and `prisma/production/schema.prisma`

Evidence: the main history starts from an existing Laravel schema marker and applies additive migrations. The production directory has a separate full baseline and migration lock. The schemas currently match, but default package commands target the main Prisma location unless scripts explicitly select the production tree.

Impact: a deployment can apply the wrong baseline/history, fail to recognize an existing schema, or drift in migration bookkeeping even when the final model definitions appear equal. Actual production migration status was not checked.

Recommendation: designate one source-of-truth migration history per environment; document bootstrap/resolve procedure; make build/deploy scripts select it explicitly; test a clean database and an existing-Laravel database separately before applying changes.

### DATA-001 — Coal-quality summary ignores active table filters

Category: Bug / Data Presentation
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location: `src/services/coal-quality.ts:54-80`.

Evidence: `findMany` receives the constructed `where`, but `count()`, all three status counts, `aggregate({_avg: { gar: true }})`, and `findFirst` for latest date do not receive the active date/unit/status filter.

Impact: a filtered table can show records for one period/unit/status while its totals, status cards, average GAR, pagination, and latest date describe the entire table. This is a user-visible correctness defect.

Recommendation: define one filter-aware query contract and apply the same effective predicates to table rows, pagination, summary counts, average, and latest date; add a fixture test for each filter dimension.

### DATA-002 — Missing Google numeric values can become misleading zeroes

Category: Data Quality / Transformation
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location: `src/services/google-sheets-overview.ts`, especially the numeric/nullable conversion and metric builders.

Evidence: the legacy `numericValue` helper treats missing/unparseable empty values as `0`. The legacy HOP path casts those values to numbers, and stock, progress, and some solar/daily paths can therefore represent missing data as an available zero. Other semantic paths preserve `null`, so behavior is inconsistent.

Impact: a missing reading can look like zero consumption, zero stock, or a dangerous HOP value instead of “not reported”. KPI status and trend interpretation can be wrong without an exception.

Recommendation: keep missing values nullable through every boundary; make zero an explicit validated source value; require completeness before HOP/status calculations; expose data-quality warnings when a fallback or missing field is used.

### DATA-003 — Import record/schema does not carry all coal-stock fields

Category: Data Mapping / Possible Data Loss
Severity: **MEDIUM**
Confidence: **LIKELY**

Location:

- `src/services/google-sheets/import/types.ts:31-36`
- `src/services/google-sheets/import/commit.ts:187-205`
- `prisma/schema.prisma:123-134`

Evidence: the database model has `openingStock`, `received`, `consumed`, and `closingStock`, while the import record contains only `closingStock` and `consumed`. The commit writes only those two values; created rows rely on database defaults for opening/received.

Impact: if the source workbook contains opening or received stock values, the importer cannot preserve them and may make stock reconciliation mathematically incomplete. Whether those columns are intentionally out of scope is not established.

Recommendation: verify the workbook contract and intended stock equation. Either model and persist all required fields or document that the importer is intentionally limited and prevent consumers from treating omitted defaults as source values.

### DATA-004 — Source-row deletion/reconciliation behavior is not complete or explicit

Category: Import / Data Consistency
Severity: **MEDIUM**
Confidence: **LIKELY**

Location: `src/services/google-sheets/sync/engine.ts:378-418`, `src/services/google-sheets/sync/commit-scope.ts`, `src/services/google-sheets/sync/change-detection.ts`.

Evidence: the engine loads existing row states, computes changed source keys, filters the write plan to changed keys, upserts current rows, and persists current row states. The reviewed path does not delete or tombstone old row states or normalized records whose source keys disappear from a later worksheet snapshot.

Impact: a source row that is blanked or removed can leave stale normalized data in PostgreSQL and continue to appear on the dashboard. The exact intended deletion semantics are not documented and were not verified against live data.

Recommendation: define authoritative snapshot vs append/upsert semantics; implement an explicit reconciliation/tombstone policy if the workbook is authoritative; test removed, blanked, and reintroduced rows before enabling automatic sync.

### CONFIG-001 — Google dashboard configuration gate does not support env-only credentials

Category: Configuration / Data Source Selection
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location: `src/services/overview.ts:62-66`, `src/services/google-sheets-overview.ts:682-687`, `src/lib/google-sheets.ts:77-86`.

Evidence: the full Google client accepts either a credentials file path or service-account email/private key plus spreadsheet ID. `isGoogleSheetsOverviewConfigured()` checks only `GOOGLE_SHEETS_CREDENTIALS_PATH` and spreadsheet ID.

Impact: a Vercel deployment configured correctly for env-only Google credentials can silently choose PostgreSQL when `DASHBOARD_DATA_SOURCE=google`. Operators may believe the dashboard is reading Sheets while it is reading a different source.

Recommendation: make the overview gate use the same credential validation as the client and expose the selected source/configuration mode in safe diagnostics. Avoid silent source switching for production dashboards unless explicitly intended.

### AUTH-001 — Auth.js and Supabase recovery paths create dual authentication semantics

Category: Architecture / Authentication
Severity: **MEDIUM**
Confidence: **CONFIRMED**

Location: `src/auth.ts`, `src/app/(protected)/layout.tsx`, `src/app/password/change/**`, untracked `src/lib/supabase/**`, untracked `src/app/auth/callback/route.ts`, untracked `src/app/password/reset/page.tsx`.

Evidence: active login, JWT callbacks, protected layout, and password actions use Auth.js/Prisma. The added Supabase callback/recovery page uses Supabase user lookup but renders the Auth.js current-password form. The Supabase server helper comments that the proxy refreshes Supabase cookies, while the current proxy is Auth.js-oriented and does not perform Supabase refresh.

Impact: users can have different session stores, role sources, password update semantics, and cookie lifecycles depending on entry point. Recovery can be unavailable or update the wrong identity store.

Recommendation: choose one active authentication architecture, write an explicit migration boundary if both must coexist, and test callback, session refresh, role enforcement, password recovery, and sign-out across that boundary.

### AUTH-002 — Login throttle is vulnerable to concurrent under-counting and proxy-header assumptions

Category: Security / Availability
Severity: **MEDIUM**
Confidence: **CONFIRMED** for implementation pattern; deployment exploitability is UNKNOWN

Location: `src/lib/login-throttle.ts`, `src/auth.ts` request-IP extraction.

Evidence: throttle state uses a read-then-update/upsert sequence in the `cache` table rather than an atomic increment/compare operation. Auth.js uses the first `x-forwarded-for` value or `x-real-ip` from the request headers as the IP key.

Impact: simultaneous login attempts can overwrite each other and under-enforce the six-attempt window. If the edge does not sanitize forwarding headers, a direct caller may influence the IP component and reduce per-IP protection.

Recommendation: use an atomic database operation or a dedicated rate-limit primitive; document and enforce the trusted proxy boundary; use a server-derived client identity where available; test concurrent requests and proxy behavior.

### AUTH-003 — Mail delivery failure is hidden without durable operational feedback

Category: Reliability / Authentication Operations
Severity: **LOW**
Confidence: **CONFIRMED**

Location: `src/app/forgot-password/actions.ts`, `src/lib/mail/**`.

Evidence: the forgot-password action intentionally returns a generic success response for anti-enumeration and catches delivery errors. The user therefore receives the same outward result when delivery fails.

Impact: enumeration resistance is good, but users and operators cannot distinguish a queued/sent reset from a provider outage unless logs/monitoring are inspected. Recovery can appear broken.

Recommendation: retain the generic outward response but persist a safe delivery status/correlation ID, alert on classified provider failures, and avoid logging token or secret material.

### PERF-001 — Import commit performs sequential upserts in a 30-second transaction

Category: Performance / Reliability
Severity: **MEDIUM**
Confidence: **POSSIBLE**

Location: `src/services/google-sheets/import/commit.ts`, `src/services/google-sheets/sync/engine.ts:97-135`.

Evidence: each typed row is upserted in a loop inside a Prisma transaction; row-state persistence is also loop-based and has a 30-second transaction timeout. The sync route is configured for a 300-second Node function, but remote pooler latency and row volume were not benchmarked.

Impact: a larger workbook or high-latency remote PostgreSQL connection can exceed transaction timeout, hold locks, and turn an otherwise valid sync into a failed/retried operation.

Recommendation: measure realistic row counts and remote latency before optimizing; then consider bounded batching, set-based writes, or a staging/reconciliation job while preserving atomicity and idempotency.

### UI-001 — Coal-quality UI contract contains placeholder and mislabeled fields

Category: Frontend / Maintainability
Severity: **LOW**
Confidence: **CONFIRMED**

Location: `src/app/(protected)/data-batu-bara/page.tsx`, `prisma/schema.prisma` `CoalQuality`.

Evidence: the page displays `hgi` under “Total Moisture”, uses a synthetic `LAB-{id}` shipment number, shows no volume, and renders a static PDF action although the model has no shipment/volume/report document field. Add/import/export controls are disabled.

Impact: operators can misread a quality attribute and may assume document/export functionality exists. This is a contract/documentation defect, not evidence of a database corruption bug.

Recommendation: align labels with schema, mark placeholders explicitly, and only enable actions once their backend contract and authorization are implemented.

### TEST-002 — Authentication verification harness is brittle to CRLF line endings

Category: Test Infrastructure
Severity: **LOW**
Confidence: **CONFIRMED**

Location: `scripts/verify-auth-security.ts` and CRLF-formatted auth source files.

Evidence: `auth:security:verify` fails its “enumeration-safe response” source-string assertion, while direct inspection of the action shows the generic response. The checker assumes a particular LF string representation.

Impact: a harmless checkout/formatting difference produces a false failure and can reduce trust in the verification suite.

Recommendation: normalize line endings or test behavior through imported functions/fixtures instead of raw source substring matching.

### OPS-001 — Required environment variables fail late rather than at startup

Category: Operations / Configuration
Severity: **LOW**
Confidence: **CONFIRMED**

Location: `src/lib/env.ts`, `src/lib/google-sheets.ts`, `src/lib/mail/**`, Prisma initialization, sync route.

Evidence: `lib/env.ts` validates only small public app settings. Database, cron, Google, Auth.js, and mail requirements are checked only when the relevant path executes.

Impact: a deployment can appear healthy while a critical page, cron, or recovery path fails only on first use. Missing Google env-only credentials also trigger the silent PostgreSQL fallback described above.

Recommendation: add a server-only environment contract/check command and deployment preflight. Keep secrets out of client bundles and report only variable names, never values.

### PII-001 — Reset URL includes email as query data

Category: Privacy / Authentication Hardening
Severity: **LOW**
Confidence: **POSSIBLE**

Location: `src/lib/password-reset.ts` reset URL builder.

Evidence: the generated reset link carries the email alongside the token in the URL. The token itself is random and stored hashed.

Impact: email addresses can enter browser history, referrer metadata, proxy logs, or analytics if the URL is captured. This is distinct from token security.

Recommendation: use an opaque token-only route or short-lived server-side state if compatible with the product flow; ensure referrer policy and logging do not disclose credentials/tokens.

### SEC-003 — Supabase RLS/policy posture is not verifiable from this application source

Category: Security / Data Access
Severity: **LOW / INFORMATIONAL**
Confidence: **UNKNOWN**

Location: no migration/policy files for Supabase Data API were found; partial helpers are under untracked `src/lib/supabase/**`.

Evidence: the active application uses server-only Prisma rather than direct browser database access. No RLS policy state can be inferred from the repository.

Impact: if a future Supabase client path is enabled, public anon-key access must not be assumed safe without verified RLS policies. Current source does not prove a live exposure.

Recommendation: obtain and review the actual Supabase policies before enabling browser reads/writes; keep service-role credentials server-only.

### DOC-001 — Repository documentation and generated architecture artifacts are stale or contradictory

Category: Maintainability / Agent Context
Severity: **LOW**
Confidence: **CONFIRMED**

Location: scaffold `README.md`, older `energiprimer-next/docs/*` reports, root Laravel docs, untracked `graphify-out/`, and nested scaffold directory.

Evidence: the README remains close to the create-next-app template. Older reports describe Supabase/Auth.js completion and Playwright files that are absent from current source. `graphify-out` describes an older Laravel backend.

Impact: a new coding agent can choose the wrong framework boundary, authentication source, test commands, or deployment assumptions.

Recommendation: use the three current audit documents as the maintained context source; label historical reports; update README/CI after the architecture is settled; do not delete artifacts until their ownership is confirmed.

### DEAD-001 — Several exports/routes/models appear unused or legacy

Category: Dead Code / Maintainability
Severity: **LOW**
Confidence: **CONFIRMED** for no in-repository consumer; requiredness remains UNKNOWN

Locations include `listActiveUnits`, `isPostgresOverviewConfigured`, `getSupabaseUser`, the browser Supabase client, and the unconsumed deployment helper. Protected pages `/data-batu-bara`, `/monitoring`, and `/laporan` are not navigation-linked. Legacy models such as Laravel sessions/jobs, `SpreadsheetImportLog`, `PowerGeneration`, and `KpiTarget` have no active page/service consumer in the reviewed path.

Impact: unused-looking code increases ambiguity and can be mistaken for the active architecture. Legacy tables may still be required for compatibility, migration, or external operators.

Recommendation: classify and remove only after usage search, deployment/operator confirmation, and database compatibility review. Do not delete during a documentation audit.

## Positive controls verified

- Protected page access has a server-side `auth()` and `role === "admin"` check in the protected layout.
- Auth.js credentials lookup selects admin users and the session callback rechecks the current user/role/version.
- Passwords and reset tokens are bcrypt-hashed; reset tokens are stored hashed and expire after 60 minutes.
- Safe redirect handling rejects protocol-relative, backslash, CRLF, and cross-origin targets.
- Cron bearer comparison uses a constant-time comparison helper.
- Google and mail clients are server-only; no server-only Prisma credential path was observed in client components.
- Import writes use unique keys/upserts and a transaction; manual commit mode has a loopback/database-name guard.
- Reviewed report queries use static Prisma SQL without request interpolation; no SQL injection path was confirmed.
- The parser and sync policy have useful fixture-level checks and schema-review gates.

## Data-flow audit

| Boundary | Input | Output | Validation/normalization | Verified risk |
|---|---|---|---|---|
| Filter input → query | URL/cookie month/year/day | Clamped `OverviewQuery` | UTC dates, month/year bounds | Historical focus date defaults to current UTC day unless an earlier available date is selected; business intent should be confirmed |
| Google API → raw grid | Spreadsheet metadata/range strings | A1 cell matrix | API error classification, timeout, in-process cache | Cache is instance-local in serverless environments (inferred) |
| Raw grid → semantic records | Anchors/tables/labels | Dynamic typed records | Heuristic detector, parser warnings/errors, confidence | Layout changes or ambiguous labels can route to schema review or incorrect candidate selection |
| Raw numeric/date → normalized values | Locale strings, blanks, slash dates | numbers/UTC dates/null | Locale parser and date validators | Direct overview zero-coercion and ambiguous date conventions |
| Records → import plan | Entity records | typed rows + staging | required paths, supplier set, target `70,020`, nonempty series, parser gates | Opening/received stock not modeled; fallback plans can be blocked or selected differently |
| Plan → database | Changed source keys | staging + normalized upserts | unit resolution, unique keys, transaction | No explicit source deletion/tombstone propagation; sequential transaction timeout risk |
| PostgreSQL → UI | Decimal/date/unit records | KPI/series/summary | UTC grouping, unit regex, fallback month | Coal-quality summaries ignore active filters; missing/unrecognized units can disappear from per-unit metrics |

### Import pipeline stages

```text
SOURCE
  → READ (metadata/ranges, timeout/cache)
  → PARSE (anchors/tables/semantic parsers)
  → NORMALIZE (locale numbers, dates, unit/supplier identity)
  → VALIDATE (confidence, required fields, target/supplier gates)
  → TRANSFORM (typed import records and staging rows)
  → DEDUPLICATE (stable source keys/content hashes)
  → UPSERT (unique normalized records in transaction)
  → VERIFY (run counters, row state, worksheet/schema snapshot)
```

The sync engine also uses source discovery, a database lease, automatic admission policy, canonical July 2026 schema comparison, transient retry classification, and monitoring state. It processes selected worksheets sequentially.

## Database audit summary

- The main and production Prisma schemas are currently byte-for-byte aligned, but migration histories are separate.
- Unique constraints provide useful idempotency for most normalized entities: period/supplier, unit/date, period, date, and target year.
- `Restrict` relationships protect import provenance from accidental parent deletion; legacy unit measurements use cascade.
- Roles/statuses/entity types are strings rather than enums/check-constrained values, so application validation carries more responsibility.
- No seed file was found. Current live row counts, orphan records, actual indexes generated in production, and migration table status were not queried.
- No confirmed N+1 pattern was found in the main overview; it performs a bounded set of parallel reads. Import loops are a separate write-performance concern.
- No unsafe dynamic SQL was found in the reviewed reporting path.

## Security audit summary

### Confirmed controls

Server-side admin authorization, bcrypt credential handling, generic reset responses, safe redirects, constant-time cron secret comparison, server-only integration modules, and no observed client exposure of Prisma/Google private credentials.

### Confirmed concerns

The remote-capable sync route lacks an environment gate; local secret material exists; login throttle updates are non-atomic; reset delivery failures are operationally silent; the incomplete Supabase path is not safe to activate by assumption.

### Not proven

Production Vercel environment isolation, actual `CRON_SECRET` rotation, Git-history exposure, Supabase RLS policies, edge proxy header sanitization, database TLS settings, and production deployment status.

## Error-handling audit

- Google client errors are classified for authentication, authorization, rate limiting, timeout, API, and malformed responses.
- Sync retries are limited to selected transient Google/database conditions; the lease is acquired/renewed/released around the run.
- Worksheet parse/schema failures are recorded as review/error states rather than silently committed.
- Database import transactions are intended to prevent normalized partial writes; run/worksheet state can still reflect failure.
- Dashboard page catches are user-friendly but not a substitute for structured server observability.
- Password recovery deliberately suppresses mail errors outward; this must be paired with monitoring.
- No blanket `catch { return null }` was confirmed in the critical reviewed path, but the mail/reset suppression is a deliberate silent operational boundary.

## Performance audit

### Confirmed/observed

- Overview PostgreSQL reads are issued as a bounded parallel group, with additional bounded fallback-month queries.
- Google direct overview can issue both a fixed legacy range read and a semantic scan read for one worksheet.
- Import/sync loops are sequential and can perform many remote upserts inside 30-second transactions.
- Google credentials/range data use in-process caches; serverless persistence is not guaranteed.

### Potential, not measured

Remote transaction timeout, connection-pool pressure, Google API latency, and client bundle size. No optimization should be made until realistic row counts and production-like latency are measured.

## Dead-code and redundancy inventory

| Classification | Items | Caution |
|---|---|---|
| CONFIRMED UNUSED export/consumer | `listActiveUnits`, `isPostgresOverviewConfigured`, `getSupabaseUser`, browser Supabase client, deployment gate helper in production path | No in-repository consumer found; deployment/operator use outside repo is UNKNOWN |
| POTENTIALLY UNUSED route/UI | Auxiliary protected pages not linked in navigation | Could be intentionally staged or deep-linked |
| LEGACY BUT POSSIBLY REQUIRED | Laravel session/jobs/cache tables, `SpreadsheetImportLog`, `PowerGeneration`, `KpiTarget`, old reports | Migration/backward compatibility may require them |
| STALE/UNTRUSTED ARTIFACT | root `graphify-out`, old Laravel docs, scaffold README, nested empty scaffold | Preserve until owner confirms removal |
| NOT DEAD | Legacy mapping and fixtures used by verification/sync policy | Do not remove based on “legacy” naming alone |

## Business-rule consistency audit

The principal duplicated rules are unit identity (`PLTU|UNIT` plus 1–3), GAR thresholds, UTC period construction, the 70,020 biomass target, seven-supplier receipt completeness, and 70,000-ton stock capacity. The same threshold/capacity values appear in more than one service, so changes must be synchronized or centralized after intended business values are confirmed.

Known semantic uncertainties:

- Whether the dashboard should ever show a fallback month for a requested empty month.
- Whether the focus day should be current UTC day, latest available day, or a business-selected day for historical periods.
- Whether zeros in the source mean zero or missing.
- Whether Google Sheets is authoritative for deletions and opening/received stock.
- Whether monthly report averages should be row-weighted or weighted by generation/consumption.

These are product/data-contract decisions, not safe refactoring assumptions.

## Top 10 risks

1. Remote-capable cron sync can write without a production-only environment gate.
2. Current worktree type-check fails because the Supabase recovery addition is incomplete.
3. Local ignored files contain database/mail/Supabase test credentials and a Google private key.
4. Auth.js/Prisma and Supabase recovery paths have inconsistent session/password semantics.
5. Two migration histories make production bootstrap and deployment bookkeeping ambiguous.
6. Google missing values can surface as zeros and distort KPI/HOP/stock interpretation.
7. Coal-quality summaries disagree with filtered table results.
8. Source-row deletion/reconciliation semantics are not explicit and likely leave stale rows.
9. No real automated test suite covers auth, API mutations, import, or database contracts.
10. Google dashboard source selection can silently fall back to PostgreSQL with env-only credentials.

## Top 10 important files

1. `src/auth.ts` — active Auth.js credentials/session/role behavior.
2. `src/app/(protected)/layout.tsx` — server-side page authorization boundary.
3. `src/proxy.ts` — dashboard filter cookies and Auth.js proxy matcher.
4. `src/app/api/sync/google-sheets/route.ts` — write-capable external trigger.
5. `src/services/google-sheets/sync/engine.ts` — discovery-to-commit orchestration.
6. `src/services/google-sheets/import/plan.ts` — source mapping, gates, target/supplier policy.
7. `src/services/google-sheets/import/commit.ts` — database target guard and normalized writes.
8. `src/services/overview.ts`, `overview-postgres.ts`, `google-sheets-overview.ts` — dashboard source/KPI semantics.
9. `prisma/schema.prisma` and both migration trees — database contract/deployment compatibility.
10. `package.json`, `next.config.ts`, `vercel.json`, `.env.example` — build/runtime/deployment contract.

## Top 10 business-critical flows

1. Admin credential login and throttle.
2. Auth.js session revalidation and role revocation.
3. Protected dashboard authorization.
4. Dashboard period selection and data fallback.
5. Google Sheets discovery and worksheet registry.
6. Dynamic parse/normalize/validation of BB worksheets.
7. Automatic cron admission and schema-review gate.
8. Idempotent normalized database import and sync provenance.
9. Password reset/change and session invalidation.
10. Monitoring/report/coal-quality read paths and their KPI summaries.

## Top 10 recommended next actions

1. Add and verify the deployment-environment gate before allowing remote sync writes.
2. Resolve the authentication architecture; make the worktree type-check clean before release.
3. Rotate and quarantine detected local secrets; audit history and deployment secret stores.
4. Select and document one migration history per environment and rehearse bootstrap paths.
5. Fix filter propagation in coal-quality summaries and add regression tests.
6. Preserve null vs zero through Google adapters and make completeness visible.
7. Decide and test importer reconciliation, deletion/tombstone behavior, and stock-field coverage.
8. Add isolated unit/integration/E2E coverage for the critical paths listed above.
9. Add server environment preflight and safe observability for cron/mail/source selection failures.
10. Update README/agent docs and mark historical reports/artifacts so future agents use current source truth.

## Project status

```text
PROJECT STATUS
---------------
Architecture:    CONCERNING
Security:        CONCERNING
Data Layer:      CONCERNING
API:             CONCERNING
Frontend:        ACCEPTABLE
Testing:         CRITICAL
Deployment:      CONCERNING
Maintainability: CONCERNING
```

The “Frontend” rating reflects a generally sensible server/client split and usable protected pages, while acknowledging placeholder UI and hidden auxiliary routes. The “API” rating reflects a small and mostly guarded surface, offset by the high-impact sync deployment gap.

## Audit boundary and non-actions

No refactoring, source fix, migration application, secret rotation, database cleanup, external API write, or deletion of stale artifacts was performed. Findings are recommendations only. Before any implementation agent changes the high-risk files, it must read `AGENT_CONTEXT.md`, verify the intended business contract, inspect current callers, and run an isolated test/preflight appropriate to the boundary.
