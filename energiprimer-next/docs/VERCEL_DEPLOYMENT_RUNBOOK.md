# Vercel Deployment Runbook

> CURRENT OPERATIONAL STATE (2026-09-05): Production deployment was verified
> in Phase 6K. Phase 6L authorized exactly one controlled Production sync:
> HTTP 200, status SUCCESS, syncRun ID 2, and P2028 was NOT OBSERVED.
> Current classification from Phase 6M/6N is PRODUCTION READY WITH
> LOW-PRIORITY HARDENING. This document is the operator runbook for the
> verified deployment; the preparation-only statements below are historical.
> Phase 6R validated a production-like local CSP Report-Only runtime using a
> disposable database/admin fixture. Phase 6S remediated the request-time nonce
> and six dynamic-style locations. Auth.js Credentials login/session/logout,
> protected redirect, all six dashboard routes, Recharts interaction, and the
> Report-Only candidate passed with zero `script-src-elem`/`style-src-attr`
> violations. Production CSP remains absent.
> Phase 6T independently revalidated the same local candidate after a clean
> build with two fresh disposable runs and 10/10 nonce match/uniqueness per run;
> no-flag control preceded each candidate. Production CSP remains absent.

> **Phase 6J update (2026-09-04):** This runbook is an operator procedure.
> The USER performs deployment manually after the local and disposable-target
> gates pass. The agent does not deploy, change Cron/environment/secrets, or
> trigger a Production sync. Deployment is not sync approval.

> Wording below that refers to Phase 20 is historical checkpoint evidence. It
> does not establish the current Vercel deployment state; verify deployment
> provenance through the operator-controlled Vercel interface.

> PHASE 6C UPDATE (2026-09-02): Do not provision the former Resend or public
> recovery flow. Deployment authentication is Auth.js Credentials with Prisma
> and PostgreSQL/Supabase.

Historical Phase 20 status: **PREPARED ONLY — NOT DEPLOYED**

This is a future deployment procedure for `energiprimer-next`. No Vercel
project was created and no deployment was performed during Phase 20.

## 1. Project setup

The repository contains the application in the `energiprimer-next` directory.
Configure the Vercel project Root Directory as `energiprimer-next`; this was
verified from the repository structure. Use the detected npm package manager
and the committed `package-lock.json`.

Recommended commands:

```text
Install: npm ci
Build:   npm run build
```

The build remains `next build`; it does not run `prisma migrate deploy`,
`prisma migrate resolve`, `prisma db push`, or any database migration. Schema
migrations are an operator/CI concern and must use the explicit
`prisma/production/schema.prisma` history outside Vercel build, startup,
request, and cron execution.

Vercel manages the production start process for a Next.js deployment; local
production equivalence is `npm run start` after a successful build.

## 2. Runtime

Next.js 16.3.3 declares Node `>=20.9.0`; Prisma 6.19.3 declares Node
`>=18.18`. The local audit used Node 24.17.0. Vercel currently offers Node
24.x, 22.x, and 20.x. Select and pin one major version in Vercel Project
Settings (recommended review target: **24.x**, matching the audited local major)
only after a preview build; `package.json` currently has no `engines.node` pin.

Reference: [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Finding: `NODE_RUNTIME_REVIEW_REQUIRED` — no automatic runtime change was made.

## 3. Runtime and route behavior

- App Router and TypeScript are used.
- Pages and data services remain server-first; charts/forms/navigation are the
  client boundaries.
- The Google Sheets sync handler explicitly uses Node.js runtime,
  `force-dynamic`, and `maxDuration = 300`.
  - The cron declaration is in `vercel.json` at `0 22 * * *` for
  `/api/sync/google-sheets` (06:00 WITA daily).
- Confirm the selected Vercel plan permits the declared function duration and
  cron frequency before activation.
- The cron endpoint requires the server-only `CRON_SECRET`, uses a lease, and
  keeps idempotent row state. Do not invoke it against production during this
  preparation phase.
- `vercel.json` contains only the Google Sheets sync cron. No migration command
  is attached to the cron, and no migration command is present in the Vercel
  runtime path.

## Current Production environment contract

The verified Production contract uses the runtime PostgreSQL pooler URL,
Auth.js credentials, the protected Cron secret, and server-only Google Sheets
credentials. The migration direct URL is used only by the explicit
production migration workflow, not by the Vercel runtime.

Required server-side categories are:

- DATABASE_URL through the approved runtime pooler;
- AUTH_SECRET, AUTH_TRUST_HOST, and canonical HTTPS AUTH_URL;
- CRON_SECRET;
- GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID;
- public-safe application variables only where required.

Supabase Auth, Resend, public password recovery, and reset-mail provisioning
are not active application requirements and must not be provisioned for this
contract.

## Historical environment configuration (pre-Phase 6C)

Configure variables separately for Local, Preview, and Production using the
[Production Environment Matrix](./PRODUCTION_ENVIRONMENT_MATRIX.md). Never
copy `.env.local` into Vercel and never put a secret in a `NEXT_PUBLIC_*`
variable.

Production requires, according to enabled features:

- external Supabase `DATABASE_URL` suitable for Vercel serverless traffic;
- `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, and HTTPS `AUTH_URL`;
- `CRON_SECRET` for the scheduled sync;
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, and
  `GOOGLE_SHEETS_SPREADSHEET_ID`;
- `AUTH_MAILER=resend`, `RESEND_API_KEY`, and a verified
  `RESEND_FROM_EMAIL` if password-reset email is enabled;
- public, non-secret branding variables only where needed.

Do not configure `GOOGLE_SHEETS_CREDENTIALS_PATH` as a production dependency;
the local JSON file is ignored and is not guaranteed to exist in a Vercel
Function. The application already supports the server-side email/private-key
alternative, including escaped-newline normalization.

## Historical Google Sheets and recovery gates

Before production activation:

1. Share the spreadsheet with the service-account email using the minimum
   required read permission. This is a manual Google Cloud/Sheets action.
2. Verify the canonical `Juli26-BB` policy and future worksheet admission in a
   preview environment.
3. Verify Resend sender/domain and DNS. Production reset links must use the
   canonical HTTPS `AUTH_URL`.
4. Run the controlled smoke-test plan without printing credentials or reset
   tokens.

## 6. Filesystem and assets

Static assets are under `public/`. No persistent uploads, queue worker, or
background filesystem store was found. The only runtime credential-file read
is the local-development fallback in `src/lib/google-sheets.ts`; use
environment variables for Vercel. Vercel filesystem state must not be treated
as durable storage.

## Historical preview-to-production sequence

1. Complete Gate A architecture review.
2. Provision and verify Supabase in a controlled staging/preview environment.
3. Configure Preview variables and run build/smoke tests.
4. Review logs for sanitized errors only.
5. Obtain explicit approval for production database cutover and Vercel config.
6. Configure Production variables and cron, then deploy during the window.
7. Execute the production smoke test and monitor the first sync cycle.

Gates B, C, D, and E were not executed by Phase 20.

## Phase 6S local-only CSP verification

Run the local build and production-like harness only after the static gates pass:

- `npm.cmd run build` applies the idempotent local CSP dependency patch.
- `node scripts/phase6s-local-runtime.mjs` starts `next start` with
  `NODE_ENV=production`, Chrome/Playwright, `CSP_REPORT_ONLY=true`, and a
  disposable loopback PostgreSQL/admin fixture.
- The harness checks request/DOM nonce matching, Auth.js login/session/logout,
  protected redirects, all six dashboards, Recharts interaction, dynamic-style
  locations, bounded CSP violations, and a no-flag regression.
- Cleanup removes the disposable database, temporary directory, and local
  runtime servers.

Never point this harness at a remote database, Production credentials, Google
Sheets, Preview, or a Vercel deployment. A future CSP enforcement decision is
a separately reviewed phase and is not implied by this local PASS. Evidence:
`docs/PHASE6S_CSP_REMEDIATION_2026-09-05.md`.

Phase 6T repeatability evidence: two fresh `next start` runs with
`NODE_ENV=production`, Chrome/Playwright, disposable loopback PostgreSQL,
`CSP_REPORT_ONLY=true`, and cleanup. Each run passed Auth.js, all six
dashboards, Recharts, dynamic-style, CSP, and network-classification gates.
The no-flag control was executed before each candidate run. Evidence:
`docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md`.

## Phase 6U CSP readiness and rollout design

Phase 6U records `PASS WITH FINDINGS` for the local candidate. The candidate
is technically stable for a separately authorized Production enforcement
review, but Production CSP remains OFF. The Phase 6S/6T implementation is an
uncommitted working-tree change and is not claimed to be in the recorded
Production deployment. Phase6K/6N provide the known project, alias,
deployment-READY, and recorded-SHA evidence; the commit signature remains
unverified and must be checked before rollout.

The rollout design is:

1. Enable the exact candidate in Report-Only for the approved deployment.
2. Observe representative public, login, authenticated dashboard, logout,
   and protected-redirect paths.
3. Review violation reports and browser/application errors.
4. Confirm that no legitimate dependency or origin is blocked and that the
   no-CSP control remains healthy.
5. Enforce the unchanged candidate only after explicit approval.
6. Monitor errors, authentication, dashboard rendering, and network behavior.
7. Roll back application/deployment configuration if the verified health
   criteria regress.

Rollback is an application/deployment action, not a database rollback: retain
the prior known-good Vercel deployment identifier, define the operator trigger,
promote or redeploy that known-good artifact, and verify public/auth/dashboard
health afterward. Do not undo Prisma migrations or run a data sync as a CSP
rollback.

For future changes, server-only code and ordinary data/source/month worksheet
updates normally need no CSP review. Browser-facing DOM/CSS/JavaScript,
external resources/connections, iframes/widgets/analytics/WebSockets, and
framework or dependency upgrades require a CSP review and the local runtime
regression. Never add `unsafe-inline`, `unsafe-eval`, wildcard sources, or an
unreviewed external origin merely to make a violation disappear. The Google
Sheets sync remains server-side and is outside the browser CSP boundary; no
sync, Cron, credential, migration, or Production setting was changed by
Phase6U. See
`docs/PHASE6U_CSP_PRODUCTION_READINESS_REVIEW_2026-09-05.md`.
