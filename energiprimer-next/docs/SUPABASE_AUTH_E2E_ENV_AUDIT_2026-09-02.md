# Supabase Auth E2E Environment Audit — 2026-09-02

## Status

`READY`

The isolated E2E environment file is present, all required E2E variables are
non-empty under the expected names, and no unsupported variable name was found.
This status is an environment/configuration audit result only. Provisioning and
E2E execution remain intentionally stopped.

## Safety boundary

- `.env.local` was not read, changed, or used.
- `.env.e2e.local` was read only for boolean presence and non-secret format checks; no value was printed or recorded.
- No Production Supabase or Production database operation was performed.
- No provisioning, E2E test, deployment, migration, or database write was performed.
- No source authentication or business logic was changed during this audit.

## 1. Source configuration contract

| Source | Variables read or required |
| --- | --- |
| `scripts/provision-supabase-auth-e2e-admin.mjs` | `SUPABASE_AUTH_E2E_ENVIRONMENT`, `SUPABASE_AUTH_E2E_CONFIRMATION`, `SUPABASE_AUTH_E2E_URL`, `SUPABASE_AUTH_E2E_SERVICE_ROLE_KEY`, `SUPABASE_AUTH_E2E_EMAIL`, `SUPABASE_AUTH_E2E_PASSWORD` |
| `scripts/verify-auth.mjs` | `AUTH_TEST_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_AUTH_TEST_EMAIL`, `SUPABASE_AUTH_TEST_PASSWORD` |
| `playwright.config.ts` | E2E marker, confirmation, E2E/public Supabase URLs, `AUTH_TEST_BASE_URL`, `DATABASE_URL`, optional `DASHBOARD_DATA_SOURCE`, optional `CI` |
| `src/lib/supabase/config.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Current dashboard/Prisma path | `DATABASE_URL` |
| General application configuration | Optional `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` |

## 2. Environment variable audit

`SET`/`NOT SET` is based only on non-empty presence. Secret values are not
shown. `Status` reflects the current E2E contract.

| Variable | Terisi | Required | Server/Client | Fungsi | Status |
| --- | --- | --- | --- | --- | --- |
| `SUPABASE_AUTH_E2E_ENVIRONMENT` | YES | Provisioning/runtime | Runner/server | Non-production safety marker | REQUIRED |
| `SUPABASE_AUTH_E2E_CONFIRMATION` | YES | Provisioning/runtime | Runner/server | Explicit E2E safety confirmation | REQUIRED |
| `SUPABASE_AUTH_E2E_URL` | YES | Provisioning/runtime | Runner/server | Isolated Supabase project URL | REQUIRED |
| `SUPABASE_AUTH_E2E_SERVICE_ROLE_KEY` | YES | Provisioning only | Server-only | Supabase Auth Admin API credential | REQUIRED |
| `SUPABASE_AUTH_E2E_EMAIL` | YES | Provisioning only | Server/runner | E2E admin email to provision | REQUIRED |
| `SUPABASE_AUTH_E2E_PASSWORD` | YES | Provisioning only | Server/runner | E2E admin password to provision | REQUIRED |
| `AUTH_TEST_BASE_URL` | YES | Verifier/Playwright | Runner | Local application base URL | REQUIRED |
| `NEXT_PUBLIC_SUPABASE_URL` | YES | App/verifier/Playwright | Client-visible public config | Isolated Supabase Auth URL | REQUIRED |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YES | App/verifier/Playwright | Client-visible public config | Supabase public anon key | REQUIRED |
| `SUPABASE_AUTH_TEST_EMAIL` | YES | Verifier/Playwright | Runner only | Existing E2E admin email | REQUIRED |
| `SUPABASE_AUTH_TEST_PASSWORD` | YES | Verifier/Playwright | Runner only | Existing E2E admin password | REQUIRED |
| `DATABASE_URL` | YES | Current `/dashboard` test | Server/Prisma | Isolated E2E PostgreSQL database | REQUIRED |
| `DASHBOARD_DATA_SOURCE` | NOT SET | Optional | Server | Defaults to PostgreSQL in wrapper | OPTIONAL |
| `NEXT_PUBLIC_APP_URL` | NOT SET | Optional | Client-visible config | General application URL | OPTIONAL |
| `NEXT_PUBLIC_APP_NAME` | NOT SET | Optional | Client-visible config | Application display name | OPTIONAL |
| `CI` | NOT SET | Optional | Runner | Playwright CI behavior | OPTIONAL |

No unsupported variable name was found in `.env.e2e.local`. The file is
ignored by Git through the project `.env*` rule.

## 3. Is `.env.e2e.local` automatically loaded?

It is not loaded automatically by Next.js, Playwright, or the two underlying
Node scripts. The configured package commands now load it explicitly through
`scripts/run-e2e-with-env.mjs`:

```text
npm run auth:e2e
    ↓
run-e2e-with-env.mjs playwright
    ↓
Playwright with a clean E2E environment
    ↓
run-e2e-with-env.mjs next
    ↓
Next.js with the same isolated application environment
```

The wrapper reads only the project `.env.e2e.local`, rejects unsupported names,
requires the non-production marker, and does not inherit arbitrary parent
environment secrets. Ordinary `npm run dev` is outside the E2E contract and
must not be used as the managed E2E server.

## 4. `DATABASE_URL` requirement for `/dashboard`

`DATABASE_URL` is required for the current protected-route assertion because
the verifier requests `/dashboard`, the dashboard calls `getOverviewData`, and
the default data source uses Prisma/PostgreSQL. A pure Auth-only route would not
need Prisma or business tables, but the current verifier does not use one.

The configured value must point to an isolated non-production E2E database.
The loader validates PostgreSQL URL format and prevents silent inheritance of a
parent `DATABASE_URL`; the exact destination remains an operator-controlled
configuration item and is not displayed by this audit.

## 5. Non-secret format and boundary checks

| Check | Result |
| --- | --- |
| Required variable presence | PASS |
| `SUPABASE_AUTH_E2E_ENVIRONMENT` non-production marker | PASS |
| Explicit non-production confirmation | PASS |
| E2E Supabase URL shape | PASS |
| Public Supabase URL shape | PASS |
| Public Supabase URL matches E2E URL | PASS |
| Local `AUTH_TEST_BASE_URL` with explicit port | PASS |
| PostgreSQL `DATABASE_URL` format | PASS |
| Dashboard source is PostgreSQL/default | PASS |
| Unsupported variable names | PASS — none found |
| Server secret under `NEXT_PUBLIC_*` | PASS — none found |

## 6. Production fallback audit

| Path | Result |
| --- | --- |
| `npm run auth:e2e` | No silent fallback; wrapper loads only `.env.e2e.local` |
| `npm run auth:e2e:provision` | No silent fallback; provisioning variables come only from `.env.e2e.local` |
| `npm run auth:verify` | No silent fallback; runtime variables come only from `.env.e2e.local` |
| Next.js managed by Playwright | E2E wrapper, with `reuseExistingServer: false` |
| Service-role key in runtime/browser process | Not passed |
| `.env.local` loaded by E2E wrapper/scripts | None |
| Production Supabase fallback | None in configured E2E command path |
| Production `DATABASE_URL` fallback | None in configured E2E command path; explicit E2E value is required |

**Configured-command production fallback risk: `NONE`.** This does not replace
the operator's responsibility to keep the E2E database and Supabase project
isolated.

## 7. E2E test inventory

`playwright.config.ts` and `@playwright/test` are available, but no `e2e/`
directory/specification was found during this audit. No test was created or run.

## 8. Safe next step

The environment is ready for a separately approved provisioning/E2E phase.
Do not run that phase as part of this audit, and do not send any credential
value through chat.

## Final result

`STATUS: READY`

