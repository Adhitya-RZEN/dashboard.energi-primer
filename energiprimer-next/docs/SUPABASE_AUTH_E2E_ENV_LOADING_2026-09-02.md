# Supabase Auth E2E Environment Loading — 2026-09-02

## Status

`READY`

The explicit E2E loader is implemented and the current `.env.e2e.local`
configuration passes the boolean and non-secret format audit. Provisioning and
E2E execution were not run.

## Safety boundary

- `.env.local` was not read or changed.
- `.env.e2e.local` was not changed; only boolean/format checks were performed.
- No Production credential was used.
- No provisioning, E2E test, database write, Supabase write, schema change, deployment, or git push was performed.
- Authentication and business logic were not changed.

## Files implementing the mechanism

- `scripts/run-e2e-with-env.mjs`
- `playwright.config.ts`
- `package.json`
- `package-lock.json`
- this documentation file

## Explicit loading mechanism

`auth:e2e`, `auth:verify`, and `auth:e2e:provision` invoke
`scripts/run-e2e-with-env.mjs`. The wrapper:

1. Resolves only the project `.env.e2e.local` path.
2. Does not load `.env.local`, `dotenv`, or any Production environment file.
3. Parses the file without emitting values.
4. Rejects unsupported variable names.
5. Requires `SUPABASE_AUTH_E2E_ENVIRONMENT=non-production` and explicit confirmation.
6. Validates the isolated Supabase URL and requires it to match the public application URL for runtime commands.
7. Requires all required runtime variables; optional application variables may be omitted.
8. Builds a clean child environment rather than inheriting arbitrary parent secrets.
9. Passes the service-role key only to the provisioning child process.
10. Passes no test credentials or service-role key to the Next.js process.
11. Defaults the dashboard source to PostgreSQL and rejects a Google source for Auth E2E.

## `npm run auth:e2e`

```text
npm run auth:e2e
    ↓
run-e2e-with-env.mjs playwright
    ↓
validated E2E environment
    ↓
Playwright
    ↓
run-e2e-with-env.mjs next
    ↓
Next.js dev server with isolated application variables
```

`playwright.config.ts` additionally requires the non-production marker,
confirmation, matching Supabase URLs, local base URL with explicit port,
E2E credentials, PostgreSQL `DATABASE_URL`, and a PostgreSQL dashboard source.
`reuseExistingServer: false` prevents attaching to an unknown server process.

## `npm run auth:e2e:provision`

```text
npm run auth:e2e:provision
    ↓
run-e2e-with-env.mjs provision
    ↓
validated provisioning-only environment
    ↓
provision-supabase-auth-e2e-admin.mjs
```

The provisioning process requires only the six provisioning variables:

- `SUPABASE_AUTH_E2E_ENVIRONMENT`
- `SUPABASE_AUTH_E2E_CONFIRMATION`
- `SUPABASE_AUTH_E2E_URL`
- `SUPABASE_AUTH_E2E_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_E2E_EMAIL`
- `SUPABASE_AUTH_E2E_PASSWORD`

The provisioning script creates only the isolated Supabase Auth admin with
`app_metadata.role=admin`; it does not access `public.users`, Prisma, or
business data. It was not run.

## Current variable audit

All required variables are `SET` under the exact names expected by the source.
The following are optional and currently `NOT SET`: `DASHBOARD_DATA_SOURCE`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`, and `CI`. No unsupported variable
name was found. Secret values are not included in this document.

## Database requirement

The current `/dashboard` verifier needs `DATABASE_URL` because the page uses
the PostgreSQL/Prisma overview path by default. The E2E database must be
isolated and non-production. The wrapper validates PostgreSQL URL format and
prevents silent fallback to the parent process's database environment.

## Production fallback result

`NONE` for the configured E2E commands. The wrapper reads only
`.env.e2e.local`, uses a clean child environment, and Playwright does not reuse
an existing server. Ordinary Next.js launch outside these commands remains
outside the E2E contract.

## Validation

- Required variables: PASS
- Non-production marker and confirmation: PASS
- Supabase URL matching: PASS
- Local base URL: PASS
- PostgreSQL database URL format: PASS
- Unsupported-name check: PASS
- `npm.cmd run lint`: PASS
- `npx.cmd tsc --noEmit`: PASS
- `node --check scripts/run-e2e-with-env.mjs`: PASS
- `node --check scripts/provision-supabase-auth-e2e-admin.mjs`: PASS
- `npx.cmd prisma validate` with a non-secret placeholder: PASS
- Playwright availability: PASS
- Provisioning: NOT RUN
- E2E: NOT RUN

## Final result

`STATUS: READY`

