# Vercel Deployment Runbook

> PHASE 6C UPDATE (2026-09-02): Do not provision the former Resend or public
> recovery flow. Deployment authentication is Auth.js Credentials with Prisma
> and PostgreSQL/Supabase.

Status: **PREPARED ONLY — NOT DEPLOYED**

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
- The cron declaration is in `vercel.json` at `0 1 * * *` for
  `/api/sync/google-sheets` (once daily).
- Confirm the selected Vercel plan permits the declared function duration and
  cron frequency before activation.
- The cron endpoint requires the server-only `CRON_SECRET`, uses a lease, and
  keeps idempotent row state. Do not invoke it against production during this
  preparation phase.
- `vercel.json` contains only the Google Sheets sync cron. No migration command
  is attached to the cron, and no migration command is present in the Vercel
  runtime path.

## 4. Environment configuration

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

## 5. Google Sheets and Resend gates

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

## 7. Preview-to-production sequence

1. Complete Gate A architecture review.
2. Provision and verify Supabase in a controlled staging/preview environment.
3. Configure Preview variables and run build/smoke tests.
4. Review logs for sanitized errors only.
5. Obtain explicit approval for production database cutover and Vercel config.
6. Configure Production variables and cron, then deploy during the window.
7. Execute the production smoke test and monitor the first sync cycle.

Gates B, C, D, and E were not executed by Phase 20.
