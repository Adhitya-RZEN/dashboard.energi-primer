# AGENT_CONTEXT.md — Energi Primer

Last audited: 2026-09-05
Purpose: single source of truth for AI coding agents working in this repository.
Scope: current `energiprimer-next` worktree. Read the actual source after this document before changing anything.

## Evidence status

- **VERIFIED** means source/configuration or a local command proves it.
- **INFERRED** means strongly supported but not tested against live infrastructure.
- **UNKNOWN** means this repository-only audit cannot prove it.

The application is not currently a clean release snapshot. It contains pre-existing untracked audit reports and generated artifacts. Supabase operator scripts remain for historical/operational context, but no Supabase authentication path is active in `src/`. Do not assume that an untracked file is release-ready or that an older report describes current behavior.

Phase 6J is a historical local implementation checkpoint. Its discovery change
is source bootstrap -> lease -> registry snapshot -> pure preparation -> short
atomic registry persistence -> sync run. The 60-second discovery transaction
timeout is unchanged; P2028 is classified safely and is not retried. A
disposable PostgreSQL target is required for write-capable acceptance tests; a
Production database is never a test fixture.

Current operational closure is documented by Phase 6K, Phase 6L, Phase 6M,
and Phase 6N. Production deployment, Auth.js Credentials, protected dashboard,
database/migration gates, and Cron configuration were verified; exactly one
authorized Production sync returned SUCCESS with syncRun ID 2 and P2028 was
not observed. Public recovery is decommissioned; /login is the current public
authentication page. Overall readiness is PRODUCTION READY WITH
LOW-PRIORITY HARDENING.

Phase 6Q followed the Phase 6O static audit with a local-only Report-Only
runtime, Phase 6R completed the production-like loopback run, and Phase 6S
remediated the request-time nonce and dashboard dynamic-style findings. A
disposable PostgreSQL/admin fixture enabled Auth.js Credentials login,
session/logout, protected redirect, all six dashboard routes, Recharts
interaction, and the six known dynamic-style locations. The Phase 6S
Report-Only candidate passed with matching request/DOM nonces, five distinct
nonce requests, and zero `script-src-elem`/`style-src-attr` violations.
Keep the result local-only: Production CSP remains absent and must not be
enforced from this phase.

Phase 6T independently reproduced the Phase 6S candidate after a clean build
in two fresh local runs. Each run completed 10/10 request/DOM nonce matching
and uniqueness, no-flag-first control, Auth.js/dashboard/Recharts checks,
network-failure classification, and cleanup. Production remains unchanged.

## 1. Project Overview

Energi Primer is a Next.js dashboard for PLN Jeranjang energy data: coal, biomass, solar, coal stock, HOP, targets, reports, and monitoring. The active application is `energiprimer-next/`.

Current source-of-truth decisions:

- Authentication: Auth.js/NextAuth Credentials + Prisma `users`.
- Normal dashboard reads: PostgreSQL through Prisma.
- Upstream import/sync: Google Sheets → parser/normalizer → PostgreSQL.
- Direct Google dashboard reads: optional and conditional, not the default.
- Supabase: operator/migration scripts only, not the active auth source.

## 2. Architecture

```text
Browser → Next.js App Router → Auth.js JWT + protected layout
                              → server services → Prisma → PostgreSQL

Vercel Cron/operator → /api/sync/google-sheets
                     → cron secret → metadata → source bootstrap → lease
                     → registry snapshot/preparation/persistence
                     → Google Sheets reader/parser/validation
                     → import plan → PostgreSQL + sync provenance
```

Most page reads are server-component reads. Client components handle forms, charts, filters, and sign-out. The only current custom API route is the Google Sheets sync endpoint; authentication is handled by the Auth.js catch-all route.

## 3. Directory Structure

```text
energiprimer-next/
├── src/app/                 App Router pages, layouts, actions, API routes
├── src/components/          Shared shell, auth UI, charts, dashboard primitives
├── src/lib/                 Prisma, Google API, auth security, throttling
├── src/services/            Dashboard reads, reports, import, parser, sync
├── src/types/               Shared TypeScript types and Auth.js declarations
├── prisma/                  Main schema, migrations, separate production baseline
├── scripts/                 Verification and operator/import commands
├── public/                  Logo and static assets
└── docs/                    Project map, audit, and historical reports
```

Root `graphify-out/` is an untracked generated graph of an older Laravel tree. The nested `energiprimer-next/energiprimer-next/` directory is an empty/scaffold-like artifact. Both are context only, not active architecture.

## 4. Runtime

- Next.js `16.3.3`, React `19.2.8`, TypeScript 5, strict/no-emit.
- npm with `package-lock.json`.
- Prisma `6.19.3` against PostgreSQL.
- Tailwind CSS 4 and Recharts.
- Sync API uses Node runtime and `maxDuration = 300`.
- Production security headers are configured in `next.config.ts`; HSTS is enabled only when `NODE_ENV=production`.
- The CSP candidate is generated only by the local Phase 6S harness with `CSP_REPORT_ONLY=true`; it is not a Production header or enforcement switch.
- The stabilization pass makes `tsc --noEmit --incremental false` and `npm run lint` pass. Production database availability and migration gates were verified in Phase 6K; local environment availability remains environment-dependent.

## 5. Frontend

Public routes include `/login`. The authenticated `/password/change` route is
protected. Other dashboard detail pages include `/data-batu-bara`,
`/monitoring`, `/laporan`, and `/pengaturan`.

The protected layout performs the server-side session/admin check. Dashboard filter state uses month/year/day query parameters and HTTP-only cookies maintained by `src/proxy.ts`. Dashboard pages render loading/error states and typed KPI/series data.

`/data-batu-bara`, `/monitoring`, and `/laporan` are protected but not linked in the current navigation. Report/import/export/PDF controls are disabled placeholders. Do not interpret UI hiding or disabled buttons as backend authorization.

## 6. Backend

There are two backend styles:

1. Server-rendered page services and server actions using Prisma.
2. The Google Sheets sync API using a bearer cron secret.

Important server modules:

- `src/auth.ts`: Auth.js provider, throttle, bcrypt, JWT/session callbacks.
- `src/services/overview.ts`: query normalization and data-source selection.
- `src/services/overview-postgres.ts`: PostgreSQL KPI and series aggregation.
- `src/services/google-sheets-overview.ts`: optional direct Sheets adapter.
- `src/services/google-sheets/sync/engine.ts`: discovery-to-commit orchestration.
- `src/services/google-sheets/import/plan.ts`: typed plan and validation gates.
- `src/services/google-sheets/import/commit.ts`: database guard and upserts.
- `src/app/api/sync/google-sheets/route.ts`: remote-capable write trigger.

The sync route checks the deployment environment before `CRON_SECRET` and constant-time bearer authorization, then passes `allowNonLocalDatabase: true` only within the allowed production/local-development boundary. Preview and unknown deployment identities are denied before the write-capable engine runs.

## 7. Database

`prisma/schema.prisma` uses PostgreSQL. The model groups are:

- Laravel-compatible/auth/queue/cache: `User`, `PasswordResetToken`, `Session`, `Cache`, `CacheLock`, `Job`, `JobBatch`, `FailedJob`.
- Legacy operational: `Unit`, `CoalStock`, `CoalQuality`, `CoalConsumption`, `PowerGeneration`, `KpiTarget`, `SpreadsheetImportLog`.
- Sync/provenance: `SyncSource`, `SyncWorksheet`, `SyncRun`, `SyncRowState`, `SyncSchemaChange`.
- Normalized import: `SpreadsheetImportRun`, `SpreadsheetImportStaging`, `BiomassReceipt`, `CoalReceipt`, `BiomassConsumption`, `SolarReceipt`, `SolarConsumption`, `HopReading`, `BiomassTarget`, `BiomassCumulativeSnapshot`.

Unique keys provide idempotency for most normalized entities. Unit measurement relations use cascade; import/provenance relations mostly use restrict. Statuses, roles, and entity types are strings rather than enums. No views, triggers, or database functions were found in reviewed migrations.

There are two migration histories with a fixed policy: **SUPABASE
PRODUCTION** uses `prisma/production/schema.prisma` and
`prisma/production/migrations/`; **LEGACY/LOCAL-ONLY** uses
`prisma/schema.prisma` and `prisma/migrations/`. They are not interchangeable.
The read-only production gate is `npm run
supabase:production:migration:preflight`; it requires the Direct URL and
explicitly guards the production schema/history.

## 8. Authentication

The active flow is:

```text
Credentials → Auth.js authorize → throttle → Prisma admin user → bcrypt
           → JWT (id/role/sessionVersion) → session callback re-reads user
```

Session max age is 120 minutes. Passwords use bcrypt. New and changed
passwords require at least 12 characters. Password update actions also update
user invalidation fields and/or sign out as implemented in the relevant action.

The former custom recovery flow is decommissioned. Do not add Supabase Auth,
email recovery, magic links, or OTP without a separately approved contract and
security review. The legacy Prisma token model remains only as a database
compatibility artifact until a separate migration is approved.

## 9. Authorization

Authorization is server-side for pages: `(protected)/layout.tsx` calls `auth()` and requires `session.user.role === "admin"`. Auth.js `authorize` also selects only admin users, and the session callback rechecks the current user and session version.

The proxy matcher covers `/dashboard/:path*` for Auth.js/filter-cookie behavior, while the protected layout covers the complete protected route group. The sync API is not user-session protected; its boundary is the deployment gate followed by `CRON_SECRET`. Production and explicit local development are allowed; Preview and unknown deployment identities are denied before authentication or sync execution.

Supabase RLS/policies are UNKNOWN and must be verified before any browser Supabase access is enabled. No browser Supabase helper is part of the active application source.

## 10. External Integrations

| Integration | Role | Safe handling |
|---|---|---|
| PostgreSQL | Auth, dashboard, reports, normalized import, sync registry | Server-only Prisma; never expose `DATABASE_URL` |
| Google Sheets API v4 | Workbook discovery/read/import | Service-account JSON or env credential mode; private key is server-only |
| Auth.js | Credential/JWT session | `AUTH_SECRET` and standard Auth.js env must be deployment-managed |
| Vercel | Intended hosting and cron | `vercel.json` runs sync at `0 22 * * *` (06:00 WITA daily); verify environment isolation |
| Supabase | Operator/migration work | Not active application authentication; browser access is not enabled |

No secret values may be copied into commits, docs, logs, issue text, or agent responses. Local credential files were detected during the audit; treat them as sensitive.

## 11. Data Flow

### Dashboard

```text
URL/cookie filters
 → UTC-normalized OverviewQuery
 → source choice
 → PostgreSQL parallel reads OR optional direct Sheets reads
 → fallback-month resolution if no rows
 → unit grouping/KPI calculations
 → OverviewData
 → server page and charts
```

`DASHBOARD_DATA_SOURCE=google` explicitly selects the direct Google path. The canonical overview configuration check accepts either credential-file mode or the service-account email/private-key pair plus spreadsheet ID; incomplete Google configuration fails explicitly instead of silently selecting PostgreSQL.

### Import

For the sync route, discovery is ordered as Google metadata read -> source
bootstrap -> source lease -> registry snapshot -> pure preparation -> short
atomic registry persistence -> `syncRun.create` -> worksheet processing. The
lease is held across discovery and the existing sync flow, and is released on
failure paths. Registry current rows are persisted set-oriented; missing keys
use one homogeneous update. A failed discovery transaction must not create a
sync run.

```text
Google ranges → raw grid → anchors/tables → typed semantic records
             → locale/date normalization → validation/confidence
             → source keys/content hashes → staging/normalized upserts
             → sync row/worksheet/run state → dashboard reads
```

Keep missing values as `null` unless the source explicitly contains zero. Verify date locale and deletion semantics before changing parsers or commit behavior.

## 12. Import Pipeline

The dynamic pipeline uses metadata discovery, worksheet resolution, an `A1:ZZ500` scan, heuristic structure/table detection, semantic parsers, validators, confidence/warnings, and a plan gate. Automatic sync prefers a canonical July 2026 BB worksheet schema and sends changed schemas to review.

The plan recognizes typed records for biomass receipts/consumption, coal receipts/consumption/stock, solar receipts/consumption, HOP, annual target, cumulative snapshots, and staging. It requires the approved `70,020` ton annual target, the seven-supplier biomass receipt schema, required daily paths, and no blocking parser ambiguity.

The required monthly BB source set is exactly `Januari26-BB`,
`Februari26-BB`, `Maret26-BB`, `April26-BB`, `Mei26-BB`, `Juni26-BB`, and
`Juli26-BB`. Google metadata discovery may register 199 worksheets, but that
inventory is not the seven-source business requirement; non-required tabs are
retained and are not deleted or implicitly imported.

The commit resolves exactly Unit 1/2/3, uses unique-key upserts, and wraps normalized writes in a Prisma transaction. Manual commit mode is restricted to loopback database host plus database name `dashboard_pln`; the sync route overrides that restriction only after its deployment gate. The importer models coal stock only as closing/consumed, while the database also has opening/received fields—verify the source contract before assuming full stock reconciliation.

Change detection writes only changed source keys. Current code does not make source-row deletion/tombstone propagation explicit; verify this before treating a workbook as an authoritative snapshot.

## 13. Critical Business Rules

- Recognized units are Unit 1, Unit 2, and Unit 3, identified by `PLTU`/`UNIT` labels.
- GAR `>= 4700`: `on_spec`.
- GAR `4500..4699`: `perhatian`.
- GAR `< 4500`: `off_spec`.
- HOP `< 10`: danger; `< 15`: warning; otherwise safe. Complete HOP presentation expects all three unit values.
- Approved annual biomass target: `70,020 ton`.
- Coal stock capacity for progress display: `70,000 ton`.
- Seven biomass suppliers are required by the strict receipt schema.
- Dates and period grouping use UTC.
- Empty requested periods may fall back to a recent available period and display a notice.
- Monthly report aggregates use legacy coal-consumption data; verify weighting/business meaning before changing averages.

When business rules change, search all occurrences and update parser, import plan, dashboard adapter, reports, and tests together.

## 14. Environment Variables

Server/runtime names include `DATABASE_URL`, `SUPABASE_DIRECT_URL`,
`SUPABASE_POOLER_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`,
`CRON_SECRET`, `GOOGLE_SHEETS_CREDENTIALS_PATH`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
`GOOGLE_SHEETS_SPREADSHEET_ID`, and `GOOGLE_SHEETS_CACHE_TTL`.

Public-intended names include only `NEXT_PUBLIC_APP_NAME` and
`NEXT_PUBLIC_APP_URL`. Historical `NEXT_PUBLIC_SUPABASE_*` names are not part
of the active browser contract. `DASHBOARD_DATA_SOURCE`, `NODE_ENV`, and
`VERCEL_ENV` affect behavior/configuration.

`src/lib/env.ts` remains a small public configuration helper; the full server contract is checked explicitly by `ops:verify-env` rather than by exposing values in source. Do not add values to source or documentation. Use `.env.example` for names only and inspect local env files without printing values.

## 15. Deployment

`vercel.json` schedules `/api/sync/google-sheets` with `0 22 * * *` (06:00
WITA daily). The route is Node-based and allows up to 300 seconds. Actual
Phase 6K verified the Vercel Production deployment and Phase 6L verified one
authorized Production sync. The user deploys manually; the agent does not
deploy or change the Cron schedule.

The deployment policy in `src/lib/deployment-environment.ts` is production/local development allowed and preview/unknown denied for sync, and is wired into the route before cron authentication and the write-capable sync engine. A preview must never have production database/Google credentials or a production cron secret.

There is no verified `.github` CI workflow. Treat lint/type-check/build and migration preflight as release gates that must be made explicit.

## 16. Testing

No general unit/E2E test suite or tracked spec tree was found. Focused scripts exist
for cron auth, retry, auto-admission, dynamic parsing, legacy mapping, and schema
detection. Phase 6S adds a local-only production-like browser harness and a
reproducible dependency patch script; these do not replace a general test suite
and never target Production or a remote database.

Current local results:

- Lint: PASS.
- TypeScript: PASS after removing the inactive Supabase recovery path and correcting the root layout prop type.
- Parser/mapping/schema/retry/cron static checks: PASS.
- Preview write-safety check: PASS; Preview, unknown, and production-without-deployment-identity are denied before sync.
- Auth security check: PASS after normalizing CRLF/LF source text and verifying the atomic throttle boundary; deployed admin-login E2E is recorded in Phase 6K, while no separate local credential fixture is assumed.
- Environment preflight: PASS against the local environment without printing secret values.
- Production deployment, Auth.js/dashboard, migration status, and Cron were
  verified in Phase 6K; one controlled sync was verified in Phase 6L.
- A general browser E2E suite remains a separate coverage limitation; Phase 6S
  local browser coverage is recorded above and does not authorize another
  Production sync.
- Phase 6S local browser E2E: PASS against `next start` with `NODE_ENV=production`,
  disposable loopback PostgreSQL/admin fixture, Auth.js lifecycle, protected
  redirect, all six dashboards, Recharts interaction, nonce uniqueness/matching,
  CSP Report-Only violation checks, and no-flag regression.

Phase 6J focused static/pure checks additionally cover source-lease ordering,
new/rename/missing/empty/recovery preparation, exact seven-source admission,
set-oriented registry persistence, and P2028 diagnostic mapping. Write-capable
discovery/idempotency/atomicity/concurrency/performance cases require a
disposable PostgreSQL fixture and must be reported BLOCKED if that fixture is
unavailable; the Production database cannot substitute for it.

## 17. Remaining Risks After Release Verification

These are low-priority hardening or operational follow-up items after the
critical release gates passed:

1. Runtime diagnostic coverage and incomplete non-admin/browser E2E coverage.
2. Sensitive local credential/private-key material.
3. Ambiguous migration history/deployment bootstrap.
4. Source deletions/stale rows and incomplete stock fields.
5. Trusted-proxy-header assumption and the limits of the distributed throttle design.
6. Production mail/provider configuration and external integration availability.

## 18. Known Technical Debt

- Scaffold README and older reports do not describe the active system accurately.
- Many operator scripts are ad hoc and may perform state-changing operations; their safety assumptions are not centralized.
- Legacy Laravel tables/models coexist with normalized import/sync tables.
- Auxiliary pages exist outside navigation and several controls are placeholders.
- Unused-looking exports include `listActiveUnits` and `isPostgresOverviewConfigured`; the deployment gate is now part of the sync route.
- Some static source-substring verification remains intentionally brittle by design; the auth verifier normalizes CRLF/LF before matching.
- `ops:verify-env` now groups startup, sync, mail, and password-reset checks; live external availability still requires deployment-level verification.

Do not remove legacy tables, routes, scripts, reports, or generated artifacts solely because no current page imports them.

## 19. Important Files

| File | Why it matters |
|---|---|
| `src/auth.ts` | Active auth, role, session, throttle boundary |
| `src/app/(protected)/layout.tsx` | Server-side protected-page authorization |
| `src/proxy.ts` | Dashboard filter cookies and proxy matcher |
| `src/app/api/sync/google-sheets/route.ts` | Write-capable cron/API boundary |
| `src/services/google-sheets/sync/engine.ts` | Sync selection, lease, change detection, commit orchestration |
| `src/services/google-sheets/import/plan.ts` | Parsing output, target/supplier gates, plan status |
| `src/services/google-sheets/import/commit.ts` | Unit resolution, local guard, normalized database writes |
| `src/services/overview.ts` | Dashboard source selection and query normalization |
| `src/services/overview-postgres.ts` | Primary dashboard aggregation and fallback behavior |
| `src/services/google-sheets-overview.ts` | Optional direct Google adapter with explicit null/zero handling |
| `prisma/production/schema.prisma` | Supabase production schema contract |
| `prisma/production/migrations/` | Supabase production canonical history |
| `prisma/schema.prisma` and `prisma/migrations/` | Legacy/local-only schema/history |
| `package.json` | Scripts/dependencies; no browser Supabase package is required by the active app |
| `next.config.ts`, `vercel.json`, `.env.example` | Runtime/security/cron/environment contract |

## 20. Things Agents Must NOT Change Without Verification

Before changing any item below, read callers and consumers, identify the data/security boundary, verify the intended contract, and run a focused test or preflight:

- **Authentication/session** — `src/auth.ts`, Auth.js route, JWT/session callbacks, login throttle, password actions. Changes can lock out admins or leave stale sessions.
- **Authorization** — protected layout, proxy, role checks, sync secret gate, and any future Supabase role/RLS code. UI hiding is not sufficient.
- **Importer/parsers/normalizers** — dynamic reader, date/number validators, semantic parsers, import plan, identities, mappings. Small changes can shift historical data or create duplicates.
- **Database schema/migrations** — `schema.prisma`, production schema, both migration trees. Verify current database state and migration history before applying anything.
- **Import commit/reconciliation** — `commit.ts`, `commit-scope.ts`, sync engine. Preserve transaction, idempotency, unit resolution, and explicit deletion behavior.
- **Dashboard source/fallback/KPI code** — overview adapters and report services. Confirm whether a value is source data, fallback data, null, or zero.
- **Cron/deployment/environment** — sync route, `vercel.json`, `.env*`, Next config, deployment helper. Never broaden remote write permissions casually.
- **Secrets and credentials** — never print, commit, copy, rotate, or delete without an approved operational plan. Values must not appear in agent output.
- **Legacy tables/routes/scripts/artifacts** — search all consumers and confirm migration/operator compatibility before removal.

### Required agent workflow

1. Read this file and the relevant section of `PROJECT_MAP.md`.
2. Inspect the actual implementation and every in-repository caller.
3. Classify assumptions as verified, inferred, or unknown.
4. For data changes, compare source fields, parser output, database fields, and UI consumers.
5. For auth/deployment changes, verify server-side boundaries and isolated credentials/environment behavior.
6. Run focused checks plus lint/type-check; do not treat a passing static helper as full E2E proof.
7. Keep secrets out of patches and output.
8. Update these documents when architecture, source-of-truth, business rules, or safety constraints change.

The initial audit that produced the historical snapshot was documentation-only. The subsequent stabilization pass made only scoped source, verifier, and documentation changes; it did not mutate a database, apply migrations, write to external APIs, rotate credentials, or delete user-owned reports/artifacts.

## 21. Phase 6S CSP guardrails

- Request-time `/login` is forced dynamic so the framework-generated nonce is
  available to generated scripts and styles; static nonce assumptions are not
  valid evidence.
- The candidate policy stays Report-Only and loopback-only. No `unsafe-inline`,
  `unsafe-eval`, wildcard, or broad `data`/`blob` source is accepted.
- Dashboard dynamic presentation uses finite stylesheet classes and a native
  progress element. Recharts wrapper/surface/measurement and the Next route
  announcer receive deterministic class-based local patches through the pinned
  lifecycle script.
- Run `node scripts/phase6s-local-runtime.mjs` only with its disposable
  database setup and cleanup path. Never substitute a Production database or
  remote credentials, and never turn the candidate into enforced CSP without
  a separately reviewed phase.
- Evidence and known limits are recorded in
  `docs/PHASE6S_CSP_REMEDIATION_2026-09-05.md`.
- Independent revalidation is recorded in
  `docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md`.

## 22. Phase 6U CSP production-readiness review

Phase 6U classifies the local CSP candidate as PASS WITH FINDINGS: the
technical nonce/style/browser gates are stable for a separately authorized
enforcement review, while Production CSP remains OFF. Phase 6K/6N records the
Production deployment identity and deployed SHA; commit-signature verification
is unverified, and the current Phase 6S/6T working-tree candidate is not
asserted to be deployed.

CSP change policy: server-only or database/data/source changes normally do not
require CSP review. Adding a monthly Google worksheet requires source/import
policy review but not CSP modification. Browser-facing DOM/CSS/JS, external
resources, iframe, WebSocket, analytics, or framework/dependency changes
require CSP regression. Never solve a violation by blindly adding unsafe-inline,
unsafe-eval, wildcard, or external origins.
