# Supabase Auth E2E Report — 2026-09-02

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Supabase Auth/recovery
> references describe an earlier verification scope only.

## Status

`BLOCKED — AUTH_E2E_ENV_NOT_AVAILABLE`

Static Supabase Auth and authorization checks pass, but live E2E is not claimed because an isolated E2E environment and a dedicated non-production test admin are not available.

## Safety boundary

- `.env.local` was not read.
- No credential, password, token, connection string, or secret value is recorded here.
- No source code was changed by this task.
- Production database writes: `0`.
- Production deployment: `NOT_RUN`.
- `public.users` and business data were not modified.

## Step 1 — Current E2E audit

| Area | Result |
| --- | --- |
| Application architecture | Next.js App Router with Supabase SSR/browser clients |
| Auth implementation | Supabase Auth login, session, recovery callback, and password update |
| Server authorization | `app_metadata.role` checked server-side by proxy and protected layout |
| Existing E2E runner | `scripts/verify-auth.mjs` |
| Static security verifier | `scripts/verify-auth-security.ts` |
| Playwright/Vitest/Jest config | Not present |
| User provisioning mechanism | Not present; provisioning requires an operator-controlled non-production environment |
| Database dependency | The live script requests `/dashboard`, so the E2E application also requires a non-production business database configuration |

## Static validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run lint` | PASS | No lint errors |
| `npx.cmd tsc --noEmit` | PASS | No TypeScript errors |
| `npm.cmd run auth:security:verify` | PASS | `databaseWrites: 0`, `networkRequests: 0` |
| `npm.cmd run db:validate` | BLOCKED | `DATABASE_URL` was absent from the process environment; `.env.local` was intentionally not loaded |
| Production build | NOT RUN | Would require environment handling that must be supplied separately from `.env.local` |
| Live Supabase Auth E2E | NOT RUN | Isolated E2E environment and test admin are unavailable |

## E2E environment required

The existing live verifier requires these names only; values must be supplied by the operator through a secure, non-production environment and must not be sent through chat:

- `AUTH_TEST_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_TEST_EMAIL`
- `SUPABASE_AUTH_TEST_PASSWORD`
- `DATABASE_URL` pointing to the isolated E2E business database used by the app

The E2E environment must be separate from local development and production Supabase. Do not place production credentials or a production admin in the E2E variables.

## Required manual provisioning

1. Create or select a dedicated non-production Supabase project and, if the dashboard requires it, a dedicated non-production business database.
2. Create a new Supabase Auth user with a test-only email address. Generate a random password and store it in the operator's password manager or secure environment store. Do not hardcode or print it.
3. Set the user's server-controlled `app_metadata.role` to `admin` using an operator-only Supabase Admin API/dashboard mechanism. If using the Admin API, use `auth.admin.updateUserById` with the service-role credential supplied only in the secure operator environment; never expose that credential to the browser or repository.
4. Do not create, update, or map a row in `public.users`. The test admin identity is the Supabase Auth UUID only.
5. Provide the required E2E variables in a local secure env file outside the repository or through the process environment. Keep the file ignored and never commit it.
6. Run the verifier with that isolated environment, for example:

   ```text
   node --env-file="<secure-e2e-env-file-outside-repository>" scripts/verify-auth.mjs
   ```

7. Only after the verifier reports `AUTH_E2E_ENV_AVAILABLE` and all checks pass should the live E2E result be recorded as `PASS`.

## Covered live checks

Once the isolated environment exists, `scripts/verify-auth.mjs` covers:

- login page availability;
- guest redirect from a protected dashboard;
- invalid credentials rejection;
- valid Supabase Auth admin login;
- server session access to the dashboard;
- logout invalidation.

The static security verifier additionally checks the recovery flow, password update delegation, role boundary, redirect safety, and removal of Auth.js runtime.

## Remaining manual steps

`MANUAL CONFIGURATION REQUIRED`: provision the isolated Supabase Auth test user, assign `app_metadata.role=admin`, configure the isolated E2E environment, then run the live verifier. Do not use production credentials, production admin accounts, or production business data.
