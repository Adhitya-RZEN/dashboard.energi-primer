# Environment Variables — Current Contract

## Scope

This document lists the current server/client configuration boundary. Actual
values are never recorded here. `.env.local`, `.env.e2e.local`, and credential
files remain local/ignored and must not be copied into source control.

## Active inventory

| Variable | Required when | Boundary | Sensitive |
|---|---|---|---|
| `DATABASE_URL` | Application/runtime access | Server | Yes |
| `AUTH_SECRET` | Auth.js sessions | Server | Yes |
| `AUTH_TRUST_HOST` | Deployment host trust | Server | No |
| `AUTH_URL` | Canonical deployment origin | Server | No |
| `CRON_SECRET` | Scheduled Google Sheets sync | Server | Yes |
| `NEXT_PUBLIC_APP_NAME` | App branding | Client-safe | No |
| `NEXT_PUBLIC_APP_URL` | Public app URL/fallback | Client-safe | No |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Local Google Sheets access | Server | Path/config |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Environment credential pair | Server | Yes |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Environment credential pair | Server | Yes |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets access | Server | Config-sensitive |
| `GOOGLE_SHEETS_CACHE_TTL` | Optional Sheets cache tuning | Server | No |
| `DASHBOARD_DATA_SOURCE` | Optional source selection | Server | No |
| `SUPABASE_DIRECT_URL` | Operator-only read-only checks | Operator script | Yes |
| `SUPABASE_POOLER_URL` | Operator/runtime transport checks | Operator/server | Yes |
| `AUTH_TEST_BASE_URL` | Isolated auth E2E only | Test script | No |
| `AUTH_TEST_ADMIN_EMAIL` | Isolated auth E2E only | Test script | Yes |
| `AUTH_TEST_ADMIN_PASSWORD` | Isolated auth E2E only | Test script | Yes |
| `AUTH_TEST_SECRET` | Isolated auth E2E only | Test script | Yes |

`NODE_ENV` and `VERCEL_ENV` are platform/framework values. They are not
credentials. The application exposes only the two app-identity variables with
the `NEXT_PUBLIC_` prefix.

## Decommissioned configuration

`AUTH_MAILER`, `MAIL_MAILER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
`RESEND_TEST_RECIPIENT` are not active application configuration. They must not
be added to `.env.example`, Vercel, CI, or new local setups. If an old provider
credential is still provisioned outside this repository, revoke/delete it as an
operator action after confirming no other application depends on it.

The former public recovery routes and email provider were removed in Phase 6C.
The Prisma legacy token model is retained only until a separately reviewed
database cleanup migration is approved.

## Security rules

- Never use `NEXT_PUBLIC_` for database, auth, cron, Google, Supabase, mail, or
  token material.
- Keep production, preview, local, and E2E database credentials separate.
- Do not print environment values in diagnostics, reports, or CI logs.
- Use `.env.example` only as a placeholder template.
- Rotate credentials through the secret manager; this repository remediation
  performs no automatic rotation.

## Status

**PASS WITH ROTATION REQUIRED:** active names have a server-only boundary and
the template contains no mail/recovery provider variables. External secret
rotation and provider-log review remain operator actions.
