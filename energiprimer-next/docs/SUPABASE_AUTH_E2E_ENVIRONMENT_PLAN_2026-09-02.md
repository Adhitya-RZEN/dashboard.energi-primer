# Supabase Auth E2E Environment Plan — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): This plan is retained for
> audit history. It does not authorize Supabase Auth, recovery, or mail setup.

## Status

`AUTH_E2E_ENVIRONMENT_PLAN_READY`

The environment plan and safe preparation artifacts are ready. Live E2E remains intentionally blocked until the operator creates the isolated non-production Supabase project and test admin.

## Safety scope

- `.env.local` was not read and will not be loaded by the provisioning script.
- Production Supabase, production users, `public.users`, and business data are out of scope.
- No database write, migration, deployment, or git push is performed by this plan.
- A service-role key is accepted only by the operator-only provisioning script and is never printed or exposed to the browser.

## 1. Minimum Supabase E2E environment

### Auth-only E2E

Supabase Auth requires a Supabase project. The project necessarily has the Supabase-managed PostgreSQL infrastructure behind Auth, but an Auth-only test does not require the application's business schema, business tables, or the existing 30 application tables.

The following are not required for an isolated Auth-only flow:

- a `public.users` row;
- a mapping between `auth.users.id` and `public.users.id`;
- business data;
- the production schema migration;
- Google Sheets data;
- the production database.

### Current application E2E

The current live verifier (`scripts/verify-auth.mjs`) logs in through Supabase Auth and then requests `/dashboard`. The dashboard server component calls `getOverviewData`, which uses Prisma/PostgreSQL through the overview services. Therefore the current verifier needs an isolated E2E `DATABASE_URL` if the dashboard access assertion is retained.

There are two safe options:

1. Provide a disposable non-production business database with the schema and fixtures required by `/dashboard`.
2. Later add a dedicated auth-only protected test route/page that does not load business data, then use that route for the Auth-only smoke test. This is not implemented in this phase.

The existing 30 application tables are not intrinsically required by Supabase Auth. They are required only to the extent that the selected protected dashboard route queries them. No production schema or data is copied by this plan.

## 2. Environment variables

Values are intentionally omitted. Provisioning variables use an `E2E`-specific namespace so they cannot be confused with production connection variables.

| Variable | Purpose | Server/Client | Required | Secret/Public |
| --- | --- | --- | --- | --- |
| `SUPABASE_AUTH_E2E_ENVIRONMENT` | Safety marker; must be `non-production` | Operator/server | Required for provisioning and Playwright config | Non-secret control value |
| `SUPABASE_AUTH_E2E_CONFIRMATION` | Explicit provisioning acknowledgement; must be `NON_PRODUCTION_ONLY` | Operator/server | Required for provisioning | Non-secret control value |
| `SUPABASE_AUTH_E2E_URL` | Supabase project target for provisioning | Operator/server | Required for provisioning | Public project URL; do not print |
| `SUPABASE_AUTH_E2E_SERVICE_ROLE_KEY` | Admin API credential used only to create the test Auth user | Server/operator only | Required for provisioning | Secret |
| `SUPABASE_AUTH_E2E_EMAIL` | New test admin email | Operator/server | Required for provisioning | Test identity; do not use a production user |
| `SUPABASE_AUTH_E2E_PASSWORD` | New test admin password | Operator/server | Required for provisioning | Secret; never hardcode or print |
| `AUTH_TEST_BASE_URL` | Base URL of the isolated app under test | Test runner | Required for live verifier and Playwright | Endpoint URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth project URL used by the app/browser | Server/client | Required by app Auth runtime | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key used by the app/browser | Server/client | Required by app Auth runtime | Public; not a service-role key |
| `SUPABASE_AUTH_TEST_EMAIL` | Credentials for the provisioned test admin in the live verifier/Playwright | Test runner | Required for live Auth E2E | Test identity; do not use production user |
| `SUPABASE_AUTH_TEST_PASSWORD` | Password for the provisioned test admin in the live verifier/Playwright | Test runner | Required for live Auth E2E | Secret; never print |
| `DATABASE_URL` | Prisma connection for the isolated business DB used by `/dashboard` | Server only | Required for current dashboard verifier; not required for pure Auth-only test | Secret |
| `NEXT_PUBLIC_APP_NAME` | Application display name | Client | Optional; has a source fallback | Public |
| `NEXT_PUBLIC_APP_URL` | General application URL configuration | Server/client | Optional for current callback implementation; request origin is used for Auth callback | Public |
| `DASHBOARD_DATA_SOURCE` | Selects dashboard data source | Server | Optional for Auth-only; use `postgres` for current dashboard E2E | Non-secret configuration |
| `CI` | Playwright retry/only behavior | Test runner | Optional; supplied by CI | Non-secret runtime value |
| `NODE_ENV` | Next.js/Prisma runtime behavior | Framework | Framework-managed | Non-secret runtime value |

The existing Google Sheets and cron variables are not required for Auth E2E when the dashboard test environment uses PostgreSQL:

- `GOOGLE_SHEETS_CREDENTIALS_PATH`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_CACHE_TTL`
- `CRON_SECRET`

They must not be copied into the E2E browser context. If the selected dashboard fixture explicitly uses a Google source, that is a separate integration test scope and is not part of this Auth environment plan.

## 3. Test admin provisioning

The safest identity chain is:

```text
Supabase Auth user
    ↓
server-controlled app_metadata.role = admin
    ↓
proxy/protected layout authorization
```

`public.users` is not involved. The test user must be new, non-production, and separate from all existing administrators.

### Dashboard versus Admin API

The Supabase Dashboard can create the user. Assigning `app_metadata.role=admin` must use a Dashboard mechanism that explicitly writes app metadata, or an operator-only Supabase Admin API call. Do not put the role in `user_metadata`; the application does not use that field for authorization.

The Admin API is the reliable option when the Dashboard does not expose app metadata editing. It requires the service-role credential in an operator-controlled process. That credential must not be entered into browser code, committed, or sent through chat.

### Prepared provisioning script

Added:

`scripts/provision-supabase-auth-e2e-admin.mjs`

The script:

- reads only explicit `SUPABASE_AUTH_E2E_*` process variables;
- never loads `.env.local` or a dotenv file;
- requires the environment marker `non-production` and confirmation marker;
- requires an HTTPS Supabase project URL;
- creates a new Auth user with `app_metadata.role=admin`;
- fails instead of modifying an existing user;
- never calls Prisma or touches `public.users`;
- never writes business data;
- never prints the password, service-role key, email, or user token.

Provisioning has not been run.

The provisioning variables and runtime test variables are intentionally separate names. The operator may provide the same test user's values to both secure environments, but the provisioning service-role key must never be included in the runtime/browser environment.

## 4. Password recovery E2E

The application flow is already Supabase Auth based:

```text
resetPasswordForEmail()
    ↓
Supabase recovery callback
    ↓
exchangeCodeForSession()
    ↓
updateUser()
```

No Resend, custom reset token, bcrypt reset, or production email is required by the application flow.

For a real browser recovery test, the isolated Supabase project's Auth email delivery must be configured to a test-only mailbox/capture service. Use one of these operator-controlled options:

- a dedicated test mailbox whose credentials are not production credentials;
- a local/test SMTP capture service connected only to the E2E project;
- a Supabase-supported test email workflow available in the isolated project.

Do not use an existing production mailbox or production user. If email capture is not available, login/protected-route/logout can be tested first, while recovery remains `NEEDS MANUAL CONFIGURATION`.

## 5. Playwright decision

Playwright is appropriate because the required scenarios involve browser cookies, redirects, protected navigation, recovery callback behavior, and password update UI. A plain Node verifier remains useful for a fast integration smoke test, but it is not a complete browser E2E replacement.

Prepared without test specs:

- `@playwright/test` `1.51.1` added as a development dependency;
- `playwright.config.ts` added;
- `auth:e2e` package script added;
- config refuses to load unless `AUTH_TEST_BASE_URL` is set and `SUPABASE_AUTH_E2E_ENVIRONMENT=non-production`.

No Playwright test has been created or run before the environment is available.

## 6. Prisma validation and E2E scope

`prisma/schema.prisma` declares `url = env("DATABASE_URL")`. Prisma CLI therefore requires the variable at validation time even when validation is not connecting to the database.

Safe validation options:

- use a non-secret placeholder URL supplied only to the validation process when the command does not connect;
- use a secure non-production E2E `DATABASE_URL` in the operator environment;
- use `node --env-file=<secure-file-outside-repository> ...` rather than loading `.env.local`.

Do not print the value. Do not use the production URL for Auth-only E2E. Prisma is not an Auth dependency, but it is a dependency of the current `/dashboard` assertion in `scripts/verify-auth.mjs`.

## 7. Manual Supabase E2E checklist

- [ ] Create a dedicated non-production Supabase project.
- [ ] Do not use the Production Supabase project for E2E.
- [ ] Enable the email/password provider for the E2E project.
- [ ] Configure the E2E project's Site URL and redirect URL for the isolated app, including `/auth/callback`.
- [ ] Create a new test-only Auth user.
- [ ] Generate and store a random test password securely.
- [ ] Set `app_metadata.role=admin` through a server-controlled Dashboard/Admin API operation.
- [ ] Confirm the test user is not an existing production user.
- [ ] Do not create or modify a `public.users` row.
- [ ] Obtain the E2E project's public URL and anon key.
- [ ] Prepare an isolated business database only if `/dashboard` is retained as the protected-route assertion.
- [ ] Configure the required E2E variables outside `.env.local` and outside the repository.
- [ ] Configure a test-only email mailbox/capture path before recovery E2E.
- [ ] Run provisioning only against the E2E project.
- [ ] Run the live verifier and later Playwright tests only after all variables are available.

## 8. Safe run commands after manual preparation

Provisioning (operator-controlled E2E target only):

```text
node --env-file="<secure-e2e-provisioning-file-outside-repository>" scripts/provision-supabase-auth-e2e-admin.mjs
```

Live smoke verifier:

```text
node --env-file="<secure-e2e-runtime-file-outside-repository>" scripts/verify-auth.mjs
```

Playwright, only after test specs and environment are available:

```text
npm.cmd run auth:e2e
```

None of these commands should be run with `.env.local` or Production credentials.

## Remaining state

`AUTH_E2E_ENVIRONMENT_PLAN_READY`

Live E2E is still `BLOCKED` until the operator completes the manual checklist. No test admin has been provisioned by this task, and no E2E test has been run.
