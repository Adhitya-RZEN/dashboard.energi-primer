# Project Map — Energi Primer

Audit date: 2026-09-05
Scope: `energiprimer-next` application and its repository-level configuration, scripts, migrations, documentation, and current worktree artifacts.
Mutation policy: this audit did not write to the database, Google Sheets, mail provider, or production source code.

Phase 6J update: local application source, verification scripts, and
documentation may be changed by the implementation checkpoint; no Production
database, Google Sheets, Vercel, environment, secret, migration, or deployment
operation is authorized here.

Phase 6N closure: documentation is aligned with the current Phase 6K
deployment and Phase 6L controlled-sync evidence. Current classification is
DOCUMENTATION OPERATIONALLY ALIGNED; overall readiness remains PRODUCTION
READY WITH LOW-PRIORITY HARDENING. The only current public auth page is
/login; public forgot/reset recovery is decommissioned.

Phase 6O static CSP status was followed by Phase 6Q public-runtime validation,
Phase 6R production-like discovery, and Phase 6S remediation. Phase 6S used a
disposable loopback PostgreSQL/admin fixture and covered request-time `/login`
nonce matching, Auth.js Credentials login/session/logout, protected redirect,
all six dashboard routes, Recharts, and the six known dynamic-style locations.
The local Report-Only candidate gate passed with zero
`script-src-elem`/`style-src-attr` violations. Production CSP remains absent;
no Production header or enforcement change was made.
Phase 6T independently reproduced this result after a clean build in two
fresh disposable loopback runs with 10/10 nonce matching and uniqueness per
run; the no-flag control preceded each candidate run. Production CSP remains
absent and no remote boundary was accessed.

## Evidence convention

- **VERIFIED** — directly observed in source, configuration, or a command result.
- **INFERRED** — supported by multiple source references but not proven by a live production check.
- **UNKNOWN** — cannot be established from the repository or was deliberately not tested against an external system.

The current worktree contains many pre-existing untracked reports and implementation files. This map describes them where they affect behavior, but it does not assume that every untracked file is intended for release. The current source tree and command results take precedence over older reports.

## 1. Executive architecture

The active product is a Next.js App Router dashboard for PLN Jeranjang energy data. Its principal runtime path is Auth.js credentials authentication, server-rendered protected pages, service-layer reads through Prisma, and PostgreSQL persistence. Google Sheets is an import/synchronization source rather than the normal dashboard source of truth.

```text
Browser
  │
  ├── Public Next.js routes: /login only; recovery routes decommissioned
  │       └── Auth.js Credentials → users / cache / password_reset_tokens
  │
  └── Protected route group
          └── Auth.js JWT + server-side admin check
                  └── AppShell / dashboard pages
                          └── overview services
                                  ├── PostgreSQL via Prisma (normal path)
                                  └── Google Sheets overview (only when explicitly selected
                                      and the path-based Google config gate passes)

Vercel Cron or an authorized operator
  └── GET/POST /api/sync/google-sheets
          └── CRON_SECRET check
                  └── Google metadata → source bootstrap → lease
                         → registry snapshot → pure preparation → persistence
                                → dynamic reader/parser/normalizer
                                  → import plan and validation gates
                                          → staging and normalized PostgreSQL upserts
                                                  → sync row state / monitoring
```

Supabase migration/recovery experiments are retained only in operator scripts
and historical reports. No Supabase callback, browser helper, or recovery page
is part of the active application source; Auth.js + Prisma remains the single
authentication architecture.

## 2. Repository inventory

| Area | Verified contents | Architectural meaning | Risk / interpretation |
|---|---|---|---|
| `energiprimer-next/` | Next.js application, Prisma schema/migrations, server services, scripts, assets | Active application boundary | Production-critical |
| `energiprimer-next/src/app/` | App Router layouts, pages, API routes, auth pages | HTTP and UI entry points | High fan-in at layouts/auth |
| `energiprimer-next/src/services/` | Dashboard reads, reports, importer, dynamic parser, sync engine | Business and data orchestration | High risk for data correctness |
| `energiprimer-next/src/lib/` | Prisma, Google API, mail, auth security, throttling, environment helpers | Shared infrastructure | Changes can affect every request |
| `energiprimer-next/prisma/` | Main schema plus incremental history and separate production baseline | Database contract and deployment history | Migration strategy needs explicit governance |
| `energiprimer-next/scripts/` | Verification, import, sync, database/operator commands, CSP dependency patching, and local runtime harness | Operational surface | Some scripts can mutate external/local data; Phase 6S harness is loopback/disposable-only |
| `energiprimer-next/docs/` | Current and older audit/deployment reports | Human/agent context | Several documents are stale or describe planned work |
| root `docs/` | Older architecture/UI material, including Laravel references | Historical repository documentation | Do not use as current runtime truth without source verification |
| root `graphify-out/` | Untracked generated graph containing old Laravel paths | Generated analysis artifact | Stale/untrusted; preserve, do not execute as architecture evidence |
| `energiprimer-next/energiprimer-next/` | Nested empty/scaffold-like directory observed | Likely accidental or abandoned scaffold | Potentially unused; removal requires owner confirmation |
| root `backend/` | No current tracked backend after the `Delete backend directory` history entry | Old architecture boundary | References to it are historical unless source proves otherwise |

## 3. Verified technology stack

| Concern | Current evidence | Status |
|---|---|---|
| Framework | Next.js `16.3.3`, App Router, typed routes enabled | VERIFIED |
| Language | TypeScript `^5`, strict mode, no emit | VERIFIED |
| UI/runtime | React `19.2.8`, React DOM `19.2.8`, Node runtime for sync route | VERIFIED |
| Styling/charts | Tailwind CSS 4/PostCSS, Recharts | VERIFIED |
| Package manager | npm, `package-lock.json`, npm scripts | VERIFIED |
| ORM/query layer | Prisma `6.19.3` and `@prisma/client` | VERIFIED |
| Database | PostgreSQL through `DATABASE_URL` | VERIFIED in Phase 6K read-only Production checks; runtime pooler and direct migration endpoints separated |
| Authentication | Auth.js/NextAuth v5 beta Credentials provider, JWT session, bcrypt | VERIFIED |
| Google integration | Google Sheets API v4 called with a manually created JWT service-account flow | VERIFIED |
| Mail | No active application mail provider | DECOMMISSIONED in Phase 6C |
| Hosting | `vercel.json` cron configuration; Vercel Production deployment verified in Phase 6K | VERIFIED: READY Production deployment dpl_Gj1BecPeA6N7dZkeHE7LmnwbNRRX; deployed SHA equals audited HEAD |
| Testing | No general test suite/config; Phase 6S local CSP harness and `@playwright/test` dependency are available for production-like local verification | VERIFIED |
| Supabase | No active application helper; operator scripts/reports remain | VERIFIED not active application auth |

The package manifest does not require browser Supabase packages for the active
application. `@playwright/test` is available as the local Phase 6S browser
harness dependency; no separate `playwright` package or browser package is
required by the Production runtime.

## 4. Directory and responsibility map

### `src/app`

| File/group | Responsibility | Consumers / dependencies | Side effects and risk |
|---|---|---|---|
| `layout.tsx`, `globals.css` | Global HTML shell, fonts/styles | Every route | Global UI/runtime behavior |
| `page.tsx` | Root redirect based on Auth.js session and role | Browser root | Exposes the initial auth decision |
| `(protected)/layout.tsx` | Server-side session and admin gate, then `AppShell` | Every protected page | Main authorization boundary; production-critical |
| `(protected)/dashboard/**` | Overview and focused dashboard views | Navigation links | Reads dashboard services; fallback behavior affects KPIs |
| `(protected)/data-batu-bara` | Coal-quality table and summary | Not linked by current navigation | Read-only page; UI/schema mismatch exists |
| `(protected)/monitoring` | Sync-health presentation | Not linked by current navigation | Reads monitoring snapshot; detailed view intentionally limited |
| `(protected)/laporan` | Monthly report presentation | Not linked by current navigation | Read-only report; generate/download controls are disabled |
| `(protected)/pengaturan` | Profile/settings presentation | Navigation | Mostly read-only; links password change |
| `login/**` | Credential login form/action | Public browser | Calls Auth.js; throttle and generic error handling |
| `password/change/**` | Authenticated password change | Protected settings | Mutates password and invalidates prior session material |
| `api/auth/[...nextauth]` | Auth.js GET/POST handler | Auth.js client/server | Authentication boundary |
| `api/sync/google-sheets` | Cron/manual Google Sheets synchronization endpoint | Vercel Cron/operator | Write-capable database endpoint; high deployment risk |

### `src/components`

`AppShell`, `AuthShell`, `NavigationMenu`, `Sidebar`, `SiteHeader`, `UserMenu`, and `SignOutButton` define the shared shell. Dashboard chart/KPI/filter/state components consume the typed overview data. The application generally keeps page data fetching server-side and uses client components for forms and interactive visual elements.

### `src/lib`

| Module | Responsibility | Important notes |
|---|---|---|
| `auth.ts` | Auth.js configuration and callbacks | Current authentication source of truth; admin-only credential lookup |
| `prisma.ts` | Singleton Prisma client | Server-only; development logging differs from production |
| `env.ts` | Small public app configuration helper | Public values only; full server preflight is in `server-env.ts` and `ops:verify-env` |
| `google-sheets.ts` | Google API auth, metadata/range reads, cache, error classification | Credential path or environment credential mode |
| `auth-tokens.ts` | Compatibility token for authenticated password change | Server-only; not a recovery flow |
| `login-throttle.ts` | Database-backed per-email/IP throttle | Transaction plus PostgreSQL advisory transaction lock; trusted proxy header remains an operational assumption |
| `auth-security.ts` | Safe redirect validation | Rejects external/CRLF/backslash/open-proxy style redirects |
| `deployment-environment.ts` | Vercel environment classification and sync gate | Imported by the sync route; Preview/unknown are denied |

### `src/services`

| Area | Responsibility | Main consumers |
|---|---|---|
| `overview.ts` | Normalizes query/cookies and chooses dashboard source | Dashboard pages |
| `overview-postgres.ts` | Parallel PostgreSQL reads and KPI/series aggregation | Normal dashboard path |
| `google-sheets-overview.ts` | Legacy/semantic direct sheet dashboard adapter | Optional direct Google dashboard path |
| `coal-quality.ts` | Filtered coal-quality records and summary | Coal-quality page |
| `consumption-reports.ts` | Legacy monthly coal-consumption aggregates | Reports page |
| `units.ts` | Unit list queries | Settings/possible future consumers; active-unit export appears unused |
| `google-sheets/dynamic/**` | Workbook scan, worksheet resolution, parsing, validation, confidence | Import plan and sync engine |
| `google-sheets/import/**` | Typed import records, plan, gates, staging, normalized upserts | Manual import and sync |
| `google-sheets/sync/**` | Discovery, lease, change detection, retry, schema policy, monitoring | Cron/API/operator paths |
| `google-sheets/legacy-mapping/**` | Approved legacy mappings and fixtures | Parser/mapping verification and compatibility paths |

### `prisma`

`schema.prisma` is the application data contract. `migrations/` contains a no-op marker for an existing Laravel schema followed by additive dashboard/import/sync migrations. `production/` contains a separately staged full production baseline and migration lock. The two histories are byte-for-byte schema-aligned at the time of audit, but they are separate deployment histories.

### `scripts`

Scripts cover Prisma generation/validation, database verification, import/sync execution, Google configuration, parser/mapping/schema checks, auth/mail checks, and operator workflows. Treat scripts with names containing `import`, `sync`, `commit`, `provision`, `migration`, `operator`, or `production` as potentially state-changing until read and confirmed.

## 5. Routes and entry points

| Entry point | Guard | Main work | Output/failure behavior |
|---|---|---|---|
| `/` | Auth.js session check | Redirect admin to dashboard, unauthenticated user to login, non-admin to unauthorized | Redirects; role is not trusted from client state |
| `/login` + server action | Auth.js Credentials provider | Normalize email, throttle, select admin user, bcrypt compare, update `lastLoginAt` | Generic auth error; no user existence disclosure |
| `/password/change` | Auth.js session plus role in action | Verify current password, hash new password, invalidate remember token, sign out | Form error or sign-out on success |
| `(protected)/*` | Server `auth()` plus `role === "admin"` in protected layout | Render dashboard/data/report/settings pages | Redirects to login/unauthorized before page render |
| `/api/auth/[...nextauth]` | Auth.js protocol | Session/sign-in/sign-out handlers | Auth.js responses |
| `/api/sync/google-sheets` | Deployment gate followed by `CRON_SECRET` bearer comparison | Discovery, lease, automatic worksheet selection, parse/validate/commit | Preview/unknown returns 403; missing secret returns 503 in allowed environments; generic 500 on uncaught failure |

The proxy matcher only covers `/dashboard/:path*`. The protected layout covers all pages in the `(protected)` group, so the current pages outside `/dashboard` remain protected by the layout. The sync API is not protected by Auth.js; its effective boundary is the deployment gate followed by the cron secret.

## 6. Module/dependency graph

```text
src/app/page.tsx
 └── src/auth.ts
      └── Prisma User + Cache/throttle + bcrypt

src/app/(protected)/layout.tsx
 ├── src/auth.ts
 └── src/components/layout/AppShell
      └── NavigationMenu / Sidebar / shared auth UI

dashboard pages
 ├── persisted dashboard query/cookie helpers
 └── src/services/overview.ts
      ├── src/services/overview-postgres.ts
      │    └── src/lib/prisma → PostgreSQL
      └── src/services/google-sheets-overview.ts
           └── src/lib/google-sheets → Google Sheets API

/api/sync/google-sheets
 ├── cron-auth
 └── sync/engine
      ├── sync/discovery → Google metadata + SyncSource/SyncWorksheet
      ├── sync/lease → SyncSource lease
      ├── dynamic/reader → dynamic parsers/validators/normalizer
      ├── import/plan → import types and policy gates
      ├── sync/change-detection/identity → source keys/content hashes
      └── import/commit → Prisma transaction → normalized tables + staging

legacy recovery database artifact
 └── PasswordResetToken model/migrations retained for separate future cleanup
```

High fan-in modules are `src/auth.ts`, `src/lib/prisma.ts`, `src/services/overview.ts`, `src/lib/google-sheets.ts`, the protected layout, and the sync/import identity and plan functions. They are single points where a small change can affect several user-visible flows.

No confirmed circular imports were identified in the reviewed production path. A complete automated graph check is **UNKNOWN**; `graphify-out` is not trusted because it describes an older Laravel tree.

## 7. End-to-end data flows

### Dashboard flow

```text
Query string / dashboard filter cookies
  → persisted query normalization (UTC month/year/day)
  → overview source selection
  → PostgreSQL parallel reads OR optional direct Google reads
  → fallback period resolution when requested month has no rows
  → unit grouping and KPI calculations
  → typed OverviewData
  → server page → chart/KPI client components → browser
```

Important boundaries:

- Month/year/day are clamped and converted with UTC helpers.
- PostgreSQL data is read from both legacy and normalized tables; normalized rows are preferred for current dashboard domains.
- A requested month with no data can display the latest available month in a bounded lookback, while retaining a fallback notice.
- Dashboard source selection uses PostgreSQL unless `DASHBOARD_DATA_SOURCE=google`; explicit Google selection fails clearly when the canonical Google configuration is incomplete.
- Unit identity uses `PLTU|UNIT` plus number `1..3`; unrecognized units are excluded from per-unit metrics but can remain in aggregate coal totals.

### Google Sheets import/sync flow

```text
Google spreadsheet metadata and worksheet ranges
  → worksheet discovery and stable registry identity
  → lease acquisition
  → worksheet selection policy
  → A1:ZZ500 scan / anchors / tables / semantic parsers
  → locale numeric and date normalization
  → confidence, warnings, blocking validation gates
  → typed GoogleSheetsImportPlan
  → source-key/content-hash change detection
  → staging rows and normalized upserts in a Prisma transaction
  → SyncRowState, worksheet snapshot, SyncRun counters
  → monitoring snapshot and PostgreSQL dashboard reads
```

The discovery boundary is lease-guarded: Google metadata is read first, the
source is bootstrapped, the lease is acquired before the registry snapshot, and
diff/status preparation happens in memory before a short atomic registry
transaction. Current worksheet rows use a parameterized set-oriented write;
missing keys use one homogeneous update. The discovery timeout remains 60
seconds and P2028 is diagnostic-only, not an automatic retry.

The registry may contain 199 Google metadata worksheets, while the required
monthly BB source set is exactly `Januari26-BB`, `Februari26-BB`, `Maret26-BB`,
`April26-BB`, `Mei26-BB`, `Juni26-BB`, and `Juli26-BB`. Non-required tabs are
retained metadata and are not deleted or implicitly treated as required sources.

Transformation risks are concentrated in heuristic table detection, ambiguous date formats, hardcoded unit/supplier mappings, and the absence of clear deletion propagation for source rows that disappear. Direct Google metrics now preserve missing values as `null` and explicit source zeros as `0`.

### Decommissioned recovery flow

The former public recovery routes, token helper, mail adapter, and Resend
integration were removed in Phase 6C. They are retained in older reports as
historical evidence only. The Prisma `PasswordResetToken` model and migration
artifacts remain unchanged; database cleanup requires a separate reviewed
migration.

## 8. Database/data model map

### Database contract

- Provider: PostgreSQL in both Prisma schemas.
- Primary keys: mostly auto-incrementing `BigInt`; token/cache/session-style tables use string keys.
- Operational uniqueness: unit code/name, one coal stock row per date, one quality/consumption/power/KPI row per unit/date, one normalized receipt/solar/cumulative row per period, and one target per year.
- Foreign keys use `Cascade` for legacy unit measurements and `Restrict` for most import/provenance relationships.
- The `BiomassTarget.targetTon` migration includes a positive-value check constraint.
- No Prisma-defined enums were found for roles, statuses, or entity types; these are free-form strings.
- No views, database functions, or triggers were found in the reviewed migrations.

### Tables by domain

**Laravel-compatible and legacy operational tables**

`users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `units`, `coal_stock`, `coal_quality`, `coal_consumption`, `power_generation`, `kpi_targets`, and `spreadsheet_import_logs`.

**Synchronization/provenance tables**

`sync_sources`, `sync_worksheets`, `sync_runs`, `sync_row_states`, and `sync_schema_changes`.

**Normalized import domain**

`spreadsheet_import_runs`, `spreadsheet_import_staging`, `biomass_receipts`, `coal_receipts`, `biomass_consumptions`, `solar_receipts`, `solar_consumptions`, `hop_readings`, `biomass_targets`, and `biomass_cumulative_snapshots`.

### Relationship map

```text
Unit
 ├── CoalQuality (unit_id, cascade)
 ├── CoalConsumption (unit_id, cascade)
 ├── PowerGeneration (unit_id, cascade)
 ├── KpiTarget (unit_id, cascade)
 ├── BiomassConsumption (unit_id, restrict)
 └── HopReading (unit_id, restrict)

SyncSource
 ├── SyncWorksheet (source_id, restrict)
 └── SyncRun (source_id, restrict)

SyncWorksheet
 ├── SyncRowState (worksheet_id, restrict)
 └── SyncSchemaChange (worksheet_id, restrict)

SpreadsheetImportRun
 ├── SpreadsheetImportStaging
 ├── BiomassReceipt
 ├── CoalReceipt
 ├── BiomassConsumption
 ├── SolarReceipt
 ├── SolarConsumption
 ├── HopReading
 ├── BiomassTarget
 └── BiomassCumulativeSnapshot
```

`sessions.user_id` is indexed but is not represented as a Prisma relation/foreign key in the current schema. The application uses JWT sessions rather than this Laravel session table.

### Read/write matrix

| Data | Reads | Writes | Notes |
|---|---|---|---|
| `users` | Auth.js, settings, reset/change actions | Login timestamp, password/reset invalidation | Role is checked server-side; admin is the only accepted login role |
| `cache` | Login throttle | Throttle counter/expiry | Shared table with transaction plus PostgreSQL advisory transaction lock |
| `units` | Overview, import unit resolution, quality | No normal page mutation found | Import requires exactly identities for Units 1/2/3 |
| Legacy coal tables | Overview, reports, coal-quality | Import may update consumption/stock; no quality importer verified | Legacy data remains part of dashboard fallback/read path |
| Normalized receipt/consumption tables | PostgreSQL overview | Google import commit upserts | Unique keys provide idempotent upsert boundaries |
| `biomass_targets`/cumulative | Overview | Import plan commit | Target gate expects approved annual target |
| Sync/provenance tables | Monitoring and sync engine | Discovery, lease, run, row state, schema review | Important for incremental behavior and auditability |
| `spreadsheet_import_staging`/runs | Import verification/history | Manual and sync commit | Atomic normalized transaction, but reconciliation semantics need verification |

## 9. API/backend flow map

The application has a small HTTP API surface. Most business reads happen in server-rendered pages rather than JSON endpoints.

### `/api/sync/google-sheets`

Phase 6J execution order after the deployment and cron gates is:
metadata read -> source bootstrap -> lease -> registry snapshot -> pure
preparation -> atomic registry persistence -> `syncRun.create` -> existing
worksheet processing. A failed lease or discovery transaction cannot create a
sync run or persist worksheet registry data. The user deploys manually, and a
new explicit approval is required before any Production sync.

```text
Request
  → check allowed deployment environment
  → check CRON_SECRET exists
  → constant-time bearer comparison
  → runGoogleSheetsIncrementalSync({ triggerType: "cron", scope: "automatic",
                                     allowNonLocalDatabase: true })
  → discovery / lease / read / parse / validate / commit
  → JSON counters or generic error
```

There is no request-body schema because the route uses GET/POST only as a trigger. The route is write-capable and denies Preview/unknown deployment identities before cron authentication or sync execution.

### Server actions

- Login action delegates to Auth.js; the action does not implement an independent password check.
- Password change action checks the current Auth.js session and current password before mutation.

### Error handling

The sync route returns generic `500` JSON on uncaught errors. The sync engine classifies Google/database errors, retries selected transient failures, marks worksheet/run states, and stores safe summaries. Dashboard pages catch service failures and render a generic overview error state. Public recovery/mail behavior is decommissioned; password-change behavior remains authenticated and server-side.

## 10. Authentication and authorization map

```text
User submits email/password
  → Auth.js Credentials.authorize
  → throttle by normalized email + request IP
  → Prisma users query constrained to role=admin
  → bcrypt.compare
  → JWT contains id/role/sessionVersion
  → session callback re-reads current user and version
  → protected layout requires session.role=admin
  → protected page/resource
```

The proxy persists dashboard query filters in HTTP-only cookies and invokes Auth.js only for the dashboard matcher. The protected layout is the broader server authorization boundary for page routes. UI hiding in `NavigationMenu` is not treated as authorization; direct page access is protected by the layout.

The sync API is a separate machine-to-machine boundary: deployment gate, bearer `CRON_SECRET`, constant-time comparison, then sync. Auth.js user sessions do not protect it. The route retains `allowNonLocalDatabase: true` only after the explicit production/local-development gate; Preview and unknown deployment identities are denied.

## 11. External integration map

| Service | Purpose | Credentials/config | Entry points | Failure behavior |
|---|---|---|---|---|
| PostgreSQL | Operational and normalized dashboard data | `DATABASE_URL`; direct/pooler operator variants also documented | Prisma services, import/sync, auth | Prisma errors, retry for selected transient sync cases; live availability UNKNOWN |
| Google Sheets API v4 | Source workbook discovery, reads, import/sync, optional direct overview | Service-account JSON path or email/private key plus spreadsheet ID | `src/lib/google-sheets.ts`, dynamic reader, overview adapter | 15s read timeout, classified API/auth/rate-limit/malformed errors, bounded fallback in overview path |
| Auth.js | Credential authentication and JWT session | `AUTH_SECRET`, optional auth URL/trust settings via standard env | `src/auth.ts`, auth route, protected layout | Generic auth errors and redirects |
| Supabase | Operator/migration context only | Values belong to separate operator scripts/environments | No active application route | Not enabled by the application |
| Vercel | Verified Production hosting and scheduled trigger | `vercel.json`, Vercel environment variables | Cron route | READY deployment and source SHA verified in Phase 6K |

No persistent user-upload storage or email/analytics integration beyond the above was verified.

## 12. Environment/configuration map

Secret values are intentionally omitted. The local files contain actual-looking credentials; see the audit document’s `SECRET DETECTED` finding.

| Variable | Referenced by | Purpose / exposure class | Notes |
|---|---|---|---|
| `DATABASE_URL` | Prisma, import commit, overview config | Server-only database connection | Required by runtime paths; checked by the explicit `ops:verify-env` startup preflight |
| `SUPABASE_DIRECT_URL`, `SUPABASE_POOLER_URL` | Operator/verification scripts | Database transport choices | Not normal app runtime reads |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` | `lib/env` | Public app identity/base URL | Client-safe only |
| `DASHBOARD_DATA_SOURCE` | `services/overview` | Selects `google` vs PostgreSQL adapter | Any other value falls back to PostgreSQL |
| `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL` | Auth.js conventions | Session/signing/base URL | `AUTH_URL` is the canonical deployment origin |
| `CRON_SECRET` | Sync API and cron auth | Machine trigger bearer secret | Preview/unknown deployment identities return 403 before secret validation; missing secret returns 503 in allowed environments |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Google config/overview/import | Local/service-account JSON path | Canonical overview gate supports this mode with spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google API config | Vercel/env-only service-account mode | Canonical overview gate supports this mode with spreadsheet ID |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google API/discovery/overview | Workbook identity | Required for Google path |
| `GOOGLE_SHEETS_CACHE_TTL` | Google API | In-process cache TTL | Serverless cache lifetime is instance-local (inferred) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase operator/migration scripts | Separate operator configuration | No active application consumer |
| `VERCEL_ENV`, `NODE_ENV` | Deployment helper / security headers / auth | Deployment identity and mode | Sync allows production/explicit local development and denies Preview/unknown |

`.env.example` documents the main names, but it does not constitute runtime validation. `lib/env.ts` only exposes app name, app URL, and node environment.

## 13. Frontend map

- Server components own page data access and auth decisions.
- Client components are used for forms, sign-out, dashboard interactions, filters, charts, and presentation state.
- Dashboard pages have loading states and a generic error state.
- The main dashboard has month/year/day filtering persisted by proxy cookies.
- `/data-batu-bara`, `/monitoring`, and `/laporan` exist and are protected but are not linked by the current navigation menu. This may be intentional staging, but is not verified.
- Report generation, export, PDF, and import buttons are visibly present but disabled; treat them as placeholders, not implemented backend capabilities.
- The coal-quality table labels `hgi` as “Total Moisture”, fabricates a `LAB-{id}` display shipment number, displays a dash for volume, and presents a static PDF action. These are not fields backed by the current `CoalQuality` model.

## 14. Deployment and environment map

```text
Local development
  → npm run dev / operator scripts
  → local PostgreSQL is required for commit mode

Build
  → next build (Phase 6J local gate: PASS)

Vercel runtime (intended)
  → Next.js Node route for cron
  → /api/sync/google-sheets at 0 22 * * * (06:00 WITA daily) from vercel.json
  → Google Sheets + remote PostgreSQL
```

The manual import commit guard only allows loopback `DATABASE_URL` with database name `dashboard_pln` unless the caller passes `allowNonLocalDatabase`. The cron route passes that override only after the deployment-environment gate (production/development allowed; preview/unknown denied).

There is no current `.github` CI workflow evidence. Local TypeScript/lint/build
and read-only migration/preflight results are release gates, but a disposable
PostgreSQL write fixture is required for the Phase 6J discovery acceptance
matrix remains a separate Phase 6J acceptance concern. Phase 6K verified the
Production deployment and Phase 6L verified exactly one authorized Production
sync. The user deploys manually; the agent does not deploy or trigger another
Production sync.

## 15. Business-rule map

| Rule | Source | Effect |
|---|---|---|
| Exactly Units 1, 2, and 3 are recognized | Overview grouping and import commit unit resolver | Unknown/other unit labels are excluded from per-unit values or rejected by commit |
| GAR `>= 4700` is `on_spec` | `services/coal-quality.ts` and page label logic | Quality classification |
| GAR `4500..4699` is `perhatian`; `<4500` is `off_spec` | Same | Quality classification |
| HOP `<10` danger, `<15` warning, otherwise safe | PostgreSQL overview HOP builder | Monitoring/KPI presentation; all three unit values are required for a complete row |
| Annual biomass target is `70,020 ton` | Import plan and target parser | Import gate and target progress |
| Coal-stock capacity is `70,000 ton` | Both overview adapters | Percentage calculation, capped at 100% |
| Seven biomass suppliers are required for the strict receipt schema | Import plan/normalizer | Missing supplier set blocks the plan |
| Automatic future BB sync uses the canonical July 2026 schema reference | Sync policy/engine | Later worksheets with schema changes go to review |
| Period/date calculations use UTC | Overview, parsers, validators, pages | Prevents local timezone drift, but source date ambiguity remains possible |
| Passwords require at least 12 characters | Password forms/actions | Reset/change validation |
| Reset token lifetime is 60 minutes | `password-reset.ts` | Expiry boundary |
| Auth.js session max age is 120 minutes | `auth.ts` | JWT session lifetime |
| Dashboard with no rows can fall back to an available month within a bounded lookback | PostgreSQL/Google overview | May show a different effective period with a notice |

## 16. Critical paths

| Path | Entry point | Key dependencies | Security boundary | Main failure points | Risk |
|---|---|---|---|---|---|
| Login | `/login` action | Auth.js, bcrypt, Prisma, throttle | Credentials + admin role | Bad credentials, database failure, trusted proxy assumptions | High |
| Session revalidation | Auth.js callbacks | JWT, User lookup | Server callback | Deleted/changed role, version mismatch, DB failure | High |
| Protected page access | `(protected)/layout.tsx` | `auth()`, AppShell | Server admin check | Missing/expired session, redirect | High |
| Dashboard load | `/dashboard` | Query persistence, overview service, Prisma/Google | Protected layout | Missing data, fallback, DB/API error | High |
| Coal-quality view | `/data-batu-bara` | `coal-quality.ts`, `CoalQuality` | Protected layout | Missing source fields, database failure | Medium |
| Google worksheet discovery | Sync engine | Google metadata, discovery registry, Prisma | Deployment gate + cron secret upstream | Credential/API/registry error | High |
| Dynamic parse/validation | Sync engine | Reader, parsers, validators, plan | Worksheet/schema gates | Ambiguous structure/date/value, schema review | High |
| Database import commit | Import commit | Unit resolver, Prisma transaction, unique keys | Local CLI guard or route override | Remote write, timeout, partial source reconciliation | Critical |
| Cron synchronization | `/api/sync/google-sheets` | CRON_SECRET, deployment helper, sync engine, Vercel | Deployment gate + bearer secret | Cron misconfiguration, external provider/database failure | Critical |
| Monitoring/report presentation | `/monitoring`, `/laporan` | Sync monitoring, legacy report SQL | Protected layout | Read-only/disabled controls, hidden routes | Medium |

## 17. Source-of-truth decisions for future agents

1. Current authentication source of truth is Auth.js + Prisma `users`, not Supabase; inactive Supabase app recovery files were removed.
2. Current normal dashboard source is PostgreSQL through Prisma. Direct Google dashboard reads are conditional and explicitly fail when selected without complete server configuration.
3. Google Sheets is the intended upstream import/sync source for normalized data.
4. `prisma/production/schema.prisma` and `prisma/production/migrations/` are
   the canonical Supabase production contract. `prisma/schema.prisma` and
   `prisma/migrations/` remain legacy/local-only and are not interchangeable.
   Use `npm run supabase:production:migration:preflight` for the read-only
   production gate.
5. Current source code wins over older reports, root Laravel diagrams, and generated `graphify-out` output.
6. The active worktree is not a clean release snapshot: untracked reports and operator artifacts remain part of the audit context and must be classified before commit.

## 18. High-risk change boundaries

Do not change without first tracing callers and running an appropriate verification:

- `src/auth.ts`, protected layout, proxy, and all password actions/forms — session and authorization semantics.
- `src/app/api/sync/google-sheets/route.ts` and sync engine — remote write boundary.
- Dynamic readers, parsers, normalizer, import plan, identity, and commit — source mapping/idempotency/data correctness.
- `prisma/schema.prisma`, both migration trees, and production schema — database compatibility and deployment state.
- `src/services/overview*.ts` — KPI/source selection/fallback behavior.
- `.env*`, `vercel.json`, `next.config.ts`, `package.json`, and operator scripts — runtime and security configuration.

The companion `AGENT_CONTEXT.md` expands these safety rules for day-to-day coding agents. The companion `PROJECT_AUDIT.md` records the findings, evidence, impact, and recommended order of work.

## 19. CSP and nonce runtime map

Phase 6S keeps the CSP candidate outside Production. The request-time `/login`
route is dynamically rendered so the framework-generated nonce can be compared
with the response nonce on every request. Dashboard dynamic presentation uses
finite CSS classes, while the six dashboard routes retain Recharts wrappers,
surfaces, tooltip behavior, and interactions.

The local lifecycle patch in `scripts/patch-csp-dependencies.mjs` makes the
pinned Next.js route announcer and Recharts wrapper/surface/measurement paths
class-based without changing the Production dependency contract at runtime.
The disposable verification harness in `scripts/phase6s-local-runtime.mjs`
starts `next start` with a loopback PostgreSQL fixture, exercises Auth.js and
all dashboards, checks bounded CSP violations, and removes its temporary
resources. Evidence is recorded in
`docs/PHASE6S_CSP_REMEDIATION_2026-09-05.md`.
Independent Phase 6T evidence is recorded in
`docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md`.

Phase 6U reviews the candidate as technically stable with low-priority
operational findings: Production CSP remains OFF, deployment commit signature
is unverified, and the local Phase 6S/6T candidate is not asserted to be in
the deployed artifact. The current Production evidence remains the Phase
6K/6N record; no live Production header request is made in Phase 6U.

The CSP change policy is: server-only and data/source changes normally need
no CSP review; adding a monthly Google worksheet still requires source/import
policy review but not CSP modification; browser-facing DOM/CSS/JS, external
resources, WebSocket, analytics, iframe, or framework/dependency changes
require CSP regression. The active source set remains exactly seven worksheets
from Januari26-BB through Juli26-BB, while the 199-row registry is metadata
inventory rather than 199 required monthly imports.
