# Production Preparation Report

> HISTORICAL / SUPERSEDED FOR CURRENT PRODUCTION STATE (2026-09-05):
> This Phase 20 / Phase 6C preparation report preserves its original
> evidence. Current deployment and controlled-sync evidence is in Phase 6K and
> Phase 6L; current hardening classification is in Phase 6M and documentation
> closure is in Phase 6N.

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Password-recovery/mail entries
> below describe the pre-remediation implementation only.

Date: 2026-09-01  
Project: `energiprimer-next`  
Phase: 20 — Production Preparation  
Scope: preparation-only; no deployment or external production write

## Executive Summary

The Next.js application is structurally compatible with a Vercel + Supabase
target after manual infrastructure configuration. Local type/lint/build,
Prisma read verification, sync-state checks, and static security checks pass.
The Phase 20 gate is **PASS WITH REVIEW**, not a production deployment
approval, because the production database, Vercel environment, Google
credential provisioning, Resend sender/domain, live Auth E2E environment,
distributed rate limiting, and dependency remediation are not completed.

Business data is unchanged. Phase 20 performed no migration, `db push`, bulk
import, Google Sheets write, Supabase connection/write, production sync, email
send, or Vercel deployment.

## Current Architecture

```text
Browser
  │  client-only charts/forms/navigation
  ▼
Next.js App Router (Vercel Node.js Functions)
  ├─ Server pages/layouts ──► Prisma singleton ──► PostgreSQL/Supabase
  ├─ Auth.js Credentials/JWT ─► users / server-side authorization
  ├─ Server Actions ─────────► login, password change/reset
  ├─ /api/auth/[...nextauth] ─► Auth.js handlers
  ├─ /api/sync/google-sheets ─► CRON_SECRET
  │                              └► Google JWT/read API
  │                                  └► dynamic parser/BB policy
  │                                      └► Prisma sync/import transaction
  └─ Server-only mail layer ──► Resend password-reset delivery
```

Verified boundaries:

- App Router is used under `src/app` with a persistent protected shell.
- Database, Google Sheets, mail, crypto, and server-only modules are not
  imported by the ten client component files.
- The sync route is explicitly Node.js, dynamic, and bounded to 300 seconds.
- Pages use server-side data fetching; chart/form interactivity remains in
  client components.
- No public API returns password hashes, private keys, access tokens, or raw
  database credentials.

## Production Architecture

Recommended target:

```text
Vercel Preview/Production
  ├─ Next.js App Router + Node.js runtime
  ├─ Auth.js / Resend (server-only)
  ├─ Vercel Cron every 15 minutes
  │     └─ authenticated sync route
  └─ Supabase PostgreSQL transaction pooler
          ▲
          └─ direct connection reserved for approved migration/backup work
```

The database cutover and Vercel configuration are separate approval gates.
Do not use a local loopback `DATABASE_URL` or local Google JSON file in Vercel.

## Environment Variables

The complete no-value matrix is in [PRODUCTION_ENVIRONMENT_MATRIX.md](./PRODUCTION_ENVIRONMENT_MATRIX.md).
Source inventory found these runtime/test names:

`DATABASE_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`,
`DASHBOARD_DATA_SOURCE`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`,
`CRON_SECRET`, `AUTH_MAILER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`RESEND_TEST_RECIPIENT`, `GOOGLE_SHEETS_CREDENTIALS_PATH`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CACHE_TTL`, `MAIL_MAILER`,
`AUTH_TEST_BASE_URL`, `AUTH_TEST_ADMIN_EMAIL`, `AUTH_TEST_ADMIN_PASSWORD`,
`AUTH_TEST_SECRET`, and framework-managed `NODE_ENV`.

Current local status was checked without printing values: database, auth,
cron, spreadsheet ID, and local credential-file configuration are present;
the Google environment credential pair and `AUTH_URL` are absent locally;
`DASHBOARD_DATA_SOURCE` is unset and therefore falls back to PostgreSQL.

## Secret Management

- `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, and the
  Google private key are server-only.
- No secret uses a `NEXT_PUBLIC_` prefix.
- `.env.example` contains placeholders/non-secret examples only.
- `.env.local` and `credentials/` are ignored; no tracked credential path was
  found.
- Client bundle/source scans found no credential values or imports of Prisma,
  Google Sheets, mail, or Auth.js server modules.
- Secret values were not printed by the audit, test commands, or report.

## Node Runtime

Local runtime: Node 24.17.0, npm 11.13.0. `package.json` has no explicit
`engines.node`. Next.js 16.3.3 requires Node `>=20.9.0`; Prisma 6.19.3
requires Node `>=18.18`. Vercel currently lists Node 24.x, 22.x, and 20.x.

Finding: **NODE_RUNTIME_REVIEW_REQUIRED**. Recommended review target is Node
24.x to match the audited local major, pinned in Vercel settings after a
preview build. No runtime pin was changed automatically.

## Prisma

- Prisma and `@prisma/client`: 6.19.3.
- `prisma generate`: PASS.
- Schema validation with `.env.local` loaded: PASS.
- Singleton client uses `server-only` and is reused during warm processes.
- No per-request `$disconnect()` in application code.
- Serverless scale-out can still exhaust a direct PostgreSQL connection limit;
  use an approved pooler and conservative limits.
- Prisma schema and migration files were not changed in Phase 20.

## PostgreSQL

Read-only local verification: **PASS**.

| Check | Result |
|---|---|
| Database/schema | `dashboard_pln` / `public` (value is non-secret identity only) |
| Units | 3 |
| Coal quality rows | 1,095 |
| Coal consumption rows | 1,731 |
| Coal stock rows | 577 |
| Power generation rows | 1,095 |
| KPI target rows | 1,095 |
| Orphan relationship checks | 0 |

The current local URL is loopback and has no configured `sslmode`; it is not a
Vercel production connection. See [Supabase Migration Runbook](./SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md).

## Supabase Compatibility

Static schema compatibility is **PASS WITH REVIEW**. PostgreSQL data types,
constraints, indexes, timestamps, dates, Decimal values, and foreign keys are
compatible in principle. No Supabase connection was made. Backup, restore
rehearsal, pooler choice, baseline handling, migration deployment, and
cutover are manual gates.

Runbook: [SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md](./SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md).

## Google Sheets

Production design is server-side only:

```text
Vercel Cron → authenticated sync route → Google JWT/read API
→ worksheet discovery/BB policy → parser/validation → Prisma transaction
→ sync registry/idempotency state
```

Canonical worksheet: `Juli26-BB`. Historical scope: January–July 2026.
Verified sync registry baseline: 199 worksheets, 7 active worksheets, 2,409
row states, latest successful run scanned 352 and skipped 352, zero open schema
changes, zero active leases. Approved Biomassa target remains 70,020 ton.

The local fallback can read a credential file, but Vercel must use the paired
server-side email/private-key environment variables. Spreadsheet permission
grant is manual. No production sync was invoked.

## Cron

- `vercel.json` declares `/api/sync/google-sheets` at `*/15 * * * *`.
- Handler accepts GET/POST, requires Bearer `CRON_SECRET`, and returns bounded
  status counters without exception details.
- Lease, retry, schema review, BB admission, stable identity, and idempotency
  controls are present and static/mock regression checks pass.
- Actual Vercel plan duration, concurrency, regional behavior, and first
  production invocation remain unverified.

## Auth.js

Auth.js `next-auth@5.0.0-beta.32` uses Credentials Provider, JWT sessions,
two-hour max age, bcrypt verification, server-side admin checks, and current
role/session-version revalidation. Login/logout/reset routes and protected
layouts were statically audited.

Live valid-login/logout E2E was not run because isolated `AUTH_TEST_*`
environment variables are unavailable; running it against the current local
account would mutate `last_login_at`, so it was correctly not substituted with
a production test.

Finding: **AUTHJS_BETA_REVIEW_REQUIRED**. No provider or authentication
architecture change was made.

## Resend

Resend integration code and mock/config checks pass. Resend remains limited to
password-reset delivery. The latest controlled real-mail attempt from the
previous phase did not pass provider sender validation; Phase 20 did not send
email.

Finding: **RESEND_PRODUCTION_DOMAIN_REQUIRED**. Configure a verified sender,
DNS, API key, and HTTPS `AUTH_URL` manually, then run one approved controlled
test. Do not put any of those values in source or documentation.

## Security

| Area | Status | Finding |
|---|---|---|
| Auth/authorization | PASS WITH REVIEW | Server-side checks present; live isolated E2E pending |
| IDOR/excessive exposure | PASS | No proven IDOR or sensitive response found in audited surface |
| Redirects | PASS | Auth redirect callback is origin-safe |
| Reset tokens | PASS | Random token, hash storage, expiry, single-use deletion, generic response |
| Headers | PASS WITH REVIEW | HSTS/security headers configured; CSP intentionally deferred |
| Client boundary | PASS | No server-only credential imports detected in client components/bundle |
| Secrets/Git | PASS | No tracked credential file or secret marker found in scoped scan |
| Rate limiting | NEEDS REVIEW | Login/cache throttle exists; distributed Vercel limiter is not present |

CSP finding: **CSP_PRODUCTION_REVIEW_REQUIRED**. Test a nonce/asset policy in
Preview before enabling a restrictive CSP.

## Rate Limiting

Login attempts use the existing PostgreSQL-backed Laravel-compatible cache
throttle. Password reset requests use a per-email 60-second throttle. The
current mechanism is not a complete distributed IP/global abuse-control policy
for independently scaling Vercel instances.

Finding: **PRODUCTION_DISTRIBUTED_RATE_LIMIT_REQUIRED** — choose an approved
durable limiter if threat model/traffic requires it. No Redis or new service
was added.

## Observability

Current application logging is limited to sanitized console events/errors and
sync state tables. Password reset delivery logs mask recipients and exclude
tokens/keys. A production owner should configure Vercel log retention/drain,
alerting for auth failures, 5xx/database errors, sync failures/schema review,
lease anomalies, and Resend provider failures. No observability vendor or
external logging infrastructure was configured.

## Performance

Static review found server-first pages, client-only interactive charts/forms,
parallel dashboard queries, no chart fetches from the browser, and bounded
Google cache behavior. Remaining risks are serverless connection concurrency,
in-memory Google cache per instance, full navigation on some legacy forms,
chart chunk measurement in Preview, and absence of production latency data.
These are **PERFORMANCE_REVIEW** items, not a reason for an architectural
rewrite in Phase 20.

## Vercel

Root Directory: `energiprimer-next` (verified). Build: `npm run build`.
Install: npm lockfile is consistent and `npm ci --dry-run` passes. Node runtime
pin, environment scopes, Supabase URL, Google env credentials, Resend sender,
cron plan limits, and Preview smoke tests are manual.

Runbook: [VERCEL_DEPLOYMENT_RUNBOOK.md](./VERCEL_DEPLOYMENT_RUNBOOK.md).

## Build

Final local checks for Phase 20:

| Check | Result |
|---|---|
| `npm.cmd ci --dry-run --ignore-scripts` | PASS |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd test` | TEST_COMMAND_NOT_AVAILABLE (no script) |
| `git diff --check` | PASS |
| `npm.cmd audit --omit=dev` | 3 HIGH existing findings |

The build did not require a local credential file or a successful external
Google/Resend request. Node emitted non-blocking experimental loader/module
type warnings from the existing TypeScript script runner.

## Database Baseline

Business writes: **0**. Business data changed: **NO**.

The read-only baseline includes 3 units and the operational counts recorded in
the PostgreSQL section. The synchronization row-state baseline is 2,409. No
database migration, `db push`, import, or reset was run.

`BIOMASS_STOCK` remains outside KPI/chart/schema scope and was not added.

## Sync Baseline

| Metric | Baseline |
|---|---:|
| Worksheets registered | 199 |
| Active worksheets | 7 |
| Row states | 2,409 |
| Latest run | SUCCESS |
| Latest run rows scanned | 352 |
| Latest run skipped | 352 |
| Open schema changes | 0 |
| Active leases | 0 |
| Expected idempotent action for verified repeat | INSERT 0 / UPDATE 0 / SKIP 2,409 / FAILED 0 |

No production sync was run during this phase.

## Backup Strategy

The project has no application-managed backup implementation. Future backup
must be provided by Supabase/platform policy plus an operator-controlled
logical backup and restore rehearsal. Use direct administrative connections,
protect dumps outside Git, record checksums/retention, and validate restores.
Details: [SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md](./SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md).

## Rollback Strategy

Application rollback uses a previous known-good Vercel deployment. Database
rollback is backup restore or an approved forward fix; automatic down migration
is not assumed. Sync rollback pauses the cron and preserves registry evidence;
it does not delete business data automatically.

Details: [PRODUCTION_ROLLBACK_RUNBOOK.md](./PRODUCTION_ROLLBACK_RUNBOOK.md).

## Manual Actions

### NOW

- Review this report and approve Gate A architecture readiness.
- Decide the production Node major (review target 24.x) and Vercel Root
  Directory.
- Keep all local secrets/credential files out of Git and do not share them in
  chat.

### AFTER PHASE 20

- Provide an isolated Auth E2E environment and run the approved test matrix.
- Resolve the Prisma/deepmerge-ts HIGH dependency decision without
  `npm audit fix --force`.
- Decide distributed rate limiting and CSP policy.

### BEFORE SUPABASE

- Supabase project/plan, backup, restore rehearsal, pooler/direct connection
  strategy, TLS/network rules, baseline handling, and migration approval.

### BEFORE VERCEL

- Create/configure the Vercel project with Root Directory
  `energiprimer-next`, environment scopes, Node runtime, and cron plan.
- Provision only server-side secrets and the external `DATABASE_URL`.
- Provision Google service-account env pair and grant spreadsheet read access.

### BEFORE PRODUCTION

- Verified Resend domain/sender/DNS and production mail key.
- HTTPS canonical `AUTH_URL`.
- Preview build and smoke test pass.
- Production cutover/rollback owner approval.
- First sync observation and alerting plan.

## Approval Gates

| Gate | Phase 20 result | Status |
|---|---|---|
| Gate A — Production Architecture | Audit, diagram, risks, and runbooks prepared | READY WITH REVIEW; owner approval pending |
| Gate B — Supabase Migration | Not connected or executed | NOT EXECUTED |
| Gate C — Vercel Configuration | No project/configuration applied | NOT EXECUTED |
| Gate D — Deployment | No deployment | NOT EXECUTED |
| Gate E — Production Smoke Test | No production test | NOT EXECUTED |

## Known Risks

1. Local loopback PostgreSQL is not reachable from Vercel.
2. Production Google credentials and spreadsheet permission are not provisioned
   in this environment; local file dependency must not be used in Vercel.
3. Resend sender/domain and real delivery are not verified.
4. Auth.js is still beta `5.0.0-beta.32`.
5. Three existing HIGH advisories remain in the Prisma/`deepmerge-ts` chain;
   the suggested fix is breaking and was not applied.
6. Distributed rate limiting and CSP require design/testing review.
7. Serverless connection limits, cron plan duration, and production latency
   have not been measured in Vercel Preview/Production.
8. No dedicated health endpoint or external alerting integration is currently
   configured; a read-only health-check design is recommended before final
   operations sign-off.

## Recommendations

1. Approve Gate A only as a preparation gate, not as deployment approval.
2. Provision Supabase in a controlled environment, restore/rehearse backup,
   and verify counts before any cutover.
3. Configure Preview first and run the smoke-test plan.
4. Verify Google service-account access and Resend sender/domain manually.
5. Decide the Prisma advisory, Auth.js beta, rate limiting, CSP, Node runtime,
   and observability policies.
6. Re-run all checks after manual configuration and record a separate go/no-go
   decision.

## Final Production Readiness

**PASS WITH REVIEW — NOT READY FOR PRODUCTION DEPLOYMENT YET.**

The application and architecture audit are prepared, but external
configuration and approval gates remain. No Phase 21/next phase was started.

## Database Safety Summary

```text
Business writes:       0
Business data changed: NO
Supabase connected:    NO
Production sync:       NOT RUN
Production email:      NOT SENT
Vercel deployment:     NOT PERFORMED
```
