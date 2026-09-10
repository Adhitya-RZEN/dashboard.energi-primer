# Authentication & Authorization — Current Contract

> Phase 1 audit baseline (2026-09-08): see
> [`PHASE1_AUTH_USER_AUDIT_2026-09-08.md`](./PHASE1_AUTH_USER_AUDIT_2026-09-08.md).
>
> Phase 2 data-model update (2026-09-08): see
> [`PHASE2_DATABASE_DATA_MODEL_2026-09-08.md`](./PHASE2_DATABASE_DATA_MODEL_2026-09-08.md).
>
> Phase 3 authorization/security policy update (2026-09-08): see
> [`PHASE3_AUTHORIZATION_SECURITY_POLICY_2026-09-08.md`](./PHASE3_AUTHORIZATION_SECURITY_POLICY_2026-09-08.md).
>
> Phase 4 User Management UI update (2026-09-08): see
> [`PHASE4_USER_MANAGEMENT_UI_2026-09-08.md`](./PHASE4_USER_MANAGEMENT_UI_2026-09-08.md).
>
> Phase 5 Add User update (2026-09-08): see
> [`PHASE5_ADD_USER_2026-09-08.md`](./PHASE5_ADD_USER_2026-09-08.md).
>
> Phase 6 Reset Password update (2026-09-08): see
> [`PHASE6_RESET_PASSWORD_2026-09-08.md`](./PHASE6_RESET_PASSWORD_2026-09-08.md).
>
> Phase 7 Role Management update (2026-09-08): see
> [`PHASE7_ROLE_MANAGEMENT_2026-09-08.md`](./PHASE7_ROLE_MANAGEMENT_2026-09-08.md).
>
> Phase 8 Account Status Management update (2026-09-08): see
> [`PHASE8_ACCOUNT_STATUS_MANAGEMENT_2026-09-08.md`](./PHASE8_ACCOUNT_STATUS_MANAGEMENT_2026-09-08.md).

## Status

- **Status:** Active Auth.js Credentials flow
- **Date:** 2026-09-08
- **Production verification:** Phase 6K deployment/auth/dashboard checks PASS;
  Phase 6L post-checks retained the authenticated dashboard result
- **Reference application:** Laravel remains an immutable reference only
- **Database:** Existing PostgreSQL/Supabase `users` data; Phase 2 migration prepared, Phase 3 policy requires the new status column before deployment

## Active architecture

```text
Login form
    ↓ server action
Auth.js / next-auth Credentials
    ↓ bcryptjs + Prisma
PostgreSQL/Supabase users
    ↓
JWT httpOnly session cookie
    ↓
src/proxy.ts + protected layout + server auth()
```

Auth.js owns credentials callback, CSRF, sign-in/sign-out, redirect handling,
and the JWT session boundary. Prisma reads the existing `users` table and
allows only `ACTIVE` `ADMIN`/`USER` accounts through the authentication and
dashboard boundaries. The reusable server-side policy authorizes `ADMIN` for
future User Management resources. Passwords are compared with `bcryptjs`;
plaintext passwords are never sent to the client or stored.

The Phase 2 migration adds a unique `username` backfilled from the lowercase
email local-part, preserves `password`, `email`, `last_login_at`, and existing
timestamps, and adds the `user_audit_logs` table. It does not add user-management
UI or mutation actions.

Disabled accounts are rejected at login and during JWT session revalidation.
Role/status changes must advance `updatedAt` so the existing session-version
check invalidates older JWTs. The legacy `Session` table is not used as an
Auth.js adapter.

## Active files

- `src/auth.ts` — Auth.js configuration, credentials provider, role callback,
  and session-version revalidation.
- `src/types/next-auth.d.ts` — session/user type augmentation.
- `src/proxy.ts` — early guest and role protection for dashboard paths.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/(protected)/layout.tsx` — repeated server-side authentication and
  active dashboard authorization boundary.
- `src/lib/authorization-policy.ts` — pure role/status, self-target, and
  last-admin policy with deterministic error codes.
- `src/lib/authorization.ts` — server-only session/admin guards and the
  serializable transaction/row-lock path for future user mutations.
- `src/app/login/*` — login form and action.
- `src/app/password/change/*` — authenticated password-change flow.
- `src/lib/auth-tokens.ts` — non-recovery token used by the existing password
  change compatibility path.
- `src/lib/auth-security.ts` and `src/lib/login-throttle.ts` — redirect,
  email-validation, and persistent login-throttle helpers.

User Management files are:

- `src/app/(protected)/pengaturan/users/*` — ADMIN-only User Management route,
  route loading state, safe error boundary, and Add User/Reset Password/Change
  Role/Enable/Disable server actions.
- `src/components/user-management/*` — user table, filters, server-backed
  role-change/reset/status/add dialogs, safe UI types, and accessible modal
  primitives.
- `src/lib/user-management-validation.ts` — pure Add User/password-reset
  validation and canonical user-ID/role input checks.
- `src/lib/user-management-errors.ts` — safe duplicate-constraint mapping.
- `src/lib/user-management-mutation.ts` — transaction-scoped user creation,
  role-change, status-change, and password-reset mutations with
  `USER_CREATED`/`ROLE_CHANGED`/`USER_ENABLED`/`USER_DISABLED`/`PASSWORD_RESET`
  audit writers.
- `src/services/user-management.ts` — ADMIN-guarded, allowlisted user-list
  query.
- `scripts/verify-user-management-ui.ts` — zero-write static UI boundary
  verification.
- `scripts/verify-add-user.ts` — zero-database-write Add User validation,
  hashing, audit, rollback, and source-boundary verification.
- `scripts/verify-reset-password.ts` — zero-database-write Reset Password
  policy, hashing, session-version, audit, rollback, and source-boundary
  verification.
- `scripts/verify-reset-password-disposable.mjs` — disposable PostgreSQL
  transaction and rollback verification.
- `scripts/verify-reset-password-e2e.mjs` — isolated Auth.js/Playwright
  browser lifecycle verification; it never loads `.env.local` credentials.
- `scripts/verify-role-management.ts` — zero-write role policy, mutation,
  audit, rollback, and source-boundary verification.
- `scripts/verify-role-management-disposable.mjs` — disposable PostgreSQL
  role transaction, rollback, and concurrency verification.
- `scripts/verify-role-management-e2e.mjs` — isolated Auth.js/Playwright role
  lifecycle verification; it never loads `.env.local` credentials.

- `scripts/verify-account-status.ts` — zero-write status policy, mutation,
  rollback, and source-boundary verification.
- `scripts/verify-account-status-disposable.mjs` — disposable PostgreSQL
  status transaction, rollback, last-admin, and concurrency verification.
- `scripts/verify-account-status-e2e.mjs` — isolated Auth.js/Playwright
  enable/disable lifecycle verification; it never loads `.env.local` credentials.

## Phase 3 authorization policy

`src/lib/authorization-policy.ts` contains the pure role/status, self-target,
and last-admin guards. `src/lib/authorization.ts` contains server-only active
session/admin guards and the serializable transaction/row-lock path for future
user mutations. The protected layout and proxy use the active dashboard policy;
future User Management resources must use the ADMIN policy.

Disabled accounts are rejected at login and during JWT session revalidation.
Role/status mutations must advance `updatedAt` so the existing session-version
check invalidates older JWTs. The legacy `Session` table is not an Auth.js
adapter.

## Phase 4 User Management UI

The current presentation route is `/pengaturan/users`. The server page calls
`requireAdminUser()` before rendering, and the shell passes the authenticated
role to navigation so the `User Management` entry is only shown to `ADMIN`.
The page still has a server-side boundary; hiding the link is not treated as
authorization.

At the Phase 4 baseline, the page contained a responsive horizontal-scroll user table with Username,
Name, Email, Role, Status, and Actions columns. Search covers username, name,
and email; Role and Status filters can be combined. The action menu opens
presentation-only Edit User, Reset Password, Change Role, and Enable/Disable
dialogs. Phase 5 retained those deferred dialogs and connected Add User to the
server action described below.

Phase 4 used an isolated UI development fixture because no safe read-only
user-list service existed at that point. Phase 5 replaces it with the
server-only `listUsersAfterAdminGuard()` query and an allowlisted selection;
the pending Phase 2 migration is still an operator-approved deployment step.
The query and UI contain no password, token, or secret fields.

Edit User remains deferred. Phase 6 connects Reset Password, Phase 7 connects
Change Role, and Phase 8 connects Enable/Disable to the server-side mutation
boundary described below. See the Phase 4 report for the historical
presentation baseline, the Phase 5 report for Add User, the Phase 7 report for
role mutation, and the Phase 8 report for account status.

## Phase 5 Add User

The ADMIN-only `/pengaturan/users` Add User form now submits to the server
action in `src/app/(protected)/pengaturan/users/actions.ts`. The action calls
`requireAdminUser()` before validation and again locks/rechecks the actor inside
the Phase 3 serializable `withUserManagementTransaction()` boundary. It reads
only username, name, email, password, confirmPassword, and role from the
request; status and actor identity are server-controlled.

Validation is shared between the client UX and server authority. Username and
email are trimmed/lowercased, username has a canonical safe format, role must
be exactly `ADMIN` or `USER`, and status is always `ACTIVE`. Passwords are
hashed with `bcryptjs` using 12 rounds. The plaintext, hash, and confirmation
value are never returned, logged, or included in audit metadata.

The transaction creates the user and its `USER_CREATED` audit row atomically.
The audit actor is the authenticated administrator and the target is the new
user ID. Audit metadata is limited to the created username and role. Duplicate
username/email preflight errors and final Prisma unique-constraint errors are
mapped to safe field messages; raw database errors are not exposed.

The route reads production user data only after the ADMIN guard and selects
`id`, `username`, `name`, `email`, `role`, and `status`. No Phase 5 production
migration or account mutation was executed. The implementation therefore
requires the pending Phase 2 migration before the route can be enabled against
a database that does not yet have the new columns/table. Local verification is
recorded in `PHASE5_ADD_USER_2026-09-08.md`.

## Phase 6 Reset Password

Reset Password is an ADMIN-initiated mutation for another user from the same
`/pengaturan/users` route. `resetPassword()` calls `requireAdminUser()` before
input validation, accepts only `targetUserId`, `newPassword`, and
`confirmPassword`, and obtains the actor ID from the authenticated session.

The target is parsed and then loaded/locked inside the Phase 3 serializable
`withUserManagementTransaction()` path. The actor is re-read and revalidated
as ACTIVE + ADMIN in that transaction. `assertCanResetPassword()` rejects
self-targets with `SELF_PASSWORD_RESET`; it permits both ACTIVE and DISABLED
targets without changing their status or role.

The new password is validated through the shared user-management validation
module and hashed with `bcryptjs` using 12 rounds before the transaction. The
transaction updates only `password` and `updatedAt` through
`securityVersionUpdate()`, then writes one `PASSWORD_RESET` audit row with the
authenticated actor, target, and empty metadata. The password update and audit
are atomic; an audit failure rolls back the password update.

Auth.js session revalidation compares each JWT's `sessionVersion` with the
current user's `updatedAt`, so existing target JWTs become stale after a
successful reset. The legacy `Session` table, password-reset-token model,
email delivery, temporary passwords, role, status, and `lastLoginAt` remain
untouched.

The Reset Password dialog is now a real Server Action form with target
presentation fields, client/server validation, pending duplicate-submission
protection, safe errors, cleared password state, and success refresh. It is
hidden for the current administrator in the row menu; the server self-target
policy remains mandatory. The client-owned initial action states stay outside
the module-level `"use server"` file so they are serialized as values rather
than mistaken for server references by the production bundle.

## Phase 6R runtime verification

The earlier Windows `pg_ctl` restricted-token error was isolated to the
`pg_ctl start` path. Phase 6R starts PostgreSQL 18.4 directly with
`postgres.exe`, applies the existing production schema to a temporary loopback
database, and removes the cluster after the run. The disposable transaction
verifier and the Playwright Auth.js lifecycle both pass. The browser run
confirmed active-target reset/session invalidation, disabled-target rejection,
stale-admin rejection, empty `PASSWORD_RESET` metadata, and last-admin
preservation. No Production endpoint, credential, account, session, or write
was used. Details are in
[`PHASE6_RESET_PASSWORD_2026-09-08.md`](./PHASE6_RESET_PASSWORD_2026-09-08.md).

## Phase 7 Role Management

Change Role is an ADMIN-only server action that accepts only `targetUserId` and
the canonical `newRole` value `ADMIN` or `USER`. The actor always comes from the
authenticated session. The target, current role, current status, and active
administrator count are re-read inside the existing serializable transaction;
the actor and target plus all active-admin rows are locked with `FOR UPDATE`.

The pure policy rejects self-role changes, no-op changes, non-admin/disabled
actors, invalid targets/roles, and any demotion that would remove the last
ACTIVE ADMIN. A DISABLED target may change role, but the mutation never changes
its status, so a DISABLED ADMIN remains unable to log in. Successful changes
update only `role` and `updatedAt` through `securityVersionUpdate()`, then write
one `ROLE_CHANGED` audit row with `fromRole` and `toRole` metadata in the same
transaction. Audit failure rolls the role and session-version update back.

The Change Role dialog now submits through `useActionState`, disables duplicate
submission, reports safe errors, closes after success, refreshes the user list,
and hides the action for the current administrator and the only active admin.
The server remains authoritative regardless of UI visibility. The existing
Auth.js JWT/session-version revalidation invalidates stale USER/ADMIN sessions
after a role change; no new authentication or session architecture was added.

## Phase 8 Account Status Management

Enable/Disable is now an ADMIN-only server action that accepts only
`targetUserId` and canonical `desiredStatus` (`ACTIVE` or `DISABLED`). The actor
comes from the authenticated session. The target, current status, role, and
active-administrator count are re-read inside the existing serializable
transaction; the actor and target plus all active-admin rows are locked with
`FOR UPDATE`.

The status policy rejects USER or DISABLED actors, self-disable, invalid or
missing targets/statuses, no-op transitions, and any disablement that would
remove the last ACTIVE ADMIN. Enable/Disable never changes role, username, or
email. A DISABLED ADMIN can be enabled by another ACTIVE ADMIN and remains an
ADMIN.

Successful status changes update only `status` and `updatedAt` through
`securityVersionUpdate()`, then write exactly one `USER_ENABLED` or
`USER_DISABLED` audit row with minimal `fromStatus`/`toStatus` metadata in the
same transaction. Audit failure rolls the status and session-version update
back. Auth.js login and session revalidation reject DISABLED accounts, so an
existing target session is invalidated after disablement and a re-enabled user
must complete the normal login lifecycle.

The Enable/Disable dialog now submits through `useActionState`, shows the
current status and safe target identity, blocks duplicate submission, reports
safe feedback, closes after success, and refreshes the list. The current
administrator and only ACTIVE ADMIN do not receive a destructive disable action
in the UI; server policy remains authoritative.

## Laravel behavior mapping

| Laravel behavior | Active Next.js implementation |
|---|---|
| `Auth::attempt` with legacy `role=admin` | Auth.js Credentials `authorize()` + Prisma + bcrypt; current value is `ADMIN` |
| Web session guard | Auth.js JWT httpOnly cookie, two-hour max age |
| `last_login_at` update | Prisma update after valid credentials |
| Logout/invalidation | Auth.js sign-out and session-version checks |
| `EnsureAdmin` middleware | Active dashboard proxy/layout boundary; reusable ADMIN policy for admin-only resources |
| `/login` | `src/app/login/page.tsx` |
| `/password/change` | Authenticated page/action with current-password check |

## Decommissioned flows

Supabase Auth, email delivery, Resend, magic links, OTP, and public account
recovery routes are not part of the active application contract. The former
`/forgot-password` and `/reset-password/[token]` routes, mail adapter, and
Resend verifier were removed during Phase 6C. Do not reintroduce them without
a separate approved design and security review.

The Prisma `PasswordResetToken` model and existing migration artifacts remain
intentionally unchanged. Removing the legacy database object requires a
separate reviewed migration and is outside this zero-write remediation.

## Environment boundary

Required server configuration:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST` for deployment host trust

Optional deployment configuration:

- `AUTH_URL` as the canonical HTTPS Auth.js origin
- `CRON_SECRET` when scheduled sync is enabled

Google Sheets configuration remains server-only. No `NEXT_PUBLIC_*` variable
may contain database, authentication, cron, Google, Supabase, mail, or token
material.

## Verification

Static Auth.js security verification covers email normalization, safe redirects,
cron authorization, protected route checks, session revalidation, login
throttling, and security headers. Live credential E2E is an operator action and
must use an isolated test account/database; it is not run by the Phase 6C
zero-write remediation.

`authz:security:verify` covers the Phase 3 role/status access matrix,
self-target guards, last-admin guards, session-version primitive, and the
transaction-safe future mutation path without database writes.

`user-management:ui:verify` covers the route guard, role-aware navigation
wiring, table/filter/dialog surface, accessibility hooks, and absence of UI
database mutations. It performs no database or network work.

`user-management:add-user:verify` covers pure input normalization and
validation, bcrypt hashing, forced `ACTIVE` status, audit actor/target/action,
safe duplicate mapping, rollback when audit creation fails, and source-boundary
checks. It uses synthetic transaction doubles and performs zero database writes
and zero network requests.

`user-management:reset-password:verify` covers the reset-password validation
and authorization matrix, self-target policy, disabled-target preservation,
bcrypt hashing, `updatedAt` security-version update, `PASSWORD_RESET` audit
contents, rollback on audit/update failure, target/actor lock wiring, and UI
source boundaries. It uses synthetic transaction doubles and performs zero
database writes and zero network requests. The disposable and browser runtime
checks are available through `user-management:reset-password:verify:disposable`
and `user-management:reset-password:verify:e2e`; both use only temporary local
fixtures and clean up after completion.

`user-management:role-management:verify` covers the role policy matrix,
canonical input validation, no-op behavior, role/security-version mutation,
`ROLE_CHANGED` metadata, rollback, and UI/server source boundaries without
database writes or network requests. The disposable and browser runtime checks
are available through `user-management:role-management:verify:disposable` and
`user-management:role-management:verify:e2e`; both use only temporary local
fixtures and clean up after completion.

`user-management:status-management:verify` covers the status policy matrix,
canonical input validation, self/no-op/last-admin protection, status/security
version mutation, role preservation, `USER_ENABLED`/`USER_DISABLED` metadata,
rollback, and UI/server source boundaries without database writes or network
requests. The disposable and browser runtime checks are available through
`user-management:status-management:verify:disposable` and
`user-management:status-management:verify:e2e`; both use only temporary local
fixtures and clean up after completion.

The Phase 4 report retains its historical fixture-backed findings. The Phase 5
report retains its Add User scope. The Phase 6 report distinguishes local
implementation checks from isolated runtime verification and Production
verification; neither report authorizes applying the pending migration or
mutating a Production account.

## Phase 4A-R2 - Production CredentialsSignin Root-Cause Remediation

### Status and scope

Review date: 2026-09-07 (Asia/Makassar).

Scope is limited to the Auth.js production credentials path. Solar parser,
Solar mapping, Solar KPI calculation, dashboard data, Prisma schema,
migrations, historical Solar data, and Google Sheets integration were not
changed.

Production result: `PASS_WITH_REVIEW`.

The exact Vercel log event supplied for this phase remains `INCONCLUSIVE` as
to the user's input because the log excerpt has no request ID or scenario
correlation. The execution semantics are confirmed: an intentional invalid
password returns `CredentialsSignin` through the `authorize() -> null` path,
while the known admin credential completes authentication successfully.
There is no evidence that Auth.js, the production user record, the stored
password hash, session, cookie, or protected route is generally broken.

### Production evidence

The production target configured by `AUTH_TEST_BASE_URL` was exercised with
credential values already present in `.env.e2e.local`; no value was printed.

| Stage | Evidence | Result |
|---|---|---|
| Guest boundary | `GET /dashboard` | `307` to `/login` |
| CSRF | `GET /api/auth/csrf` | `200` |
| Intentional invalid credentials | Credentials callback with an invalid password | `302` to `/login`, `CredentialsSignin`, no session |
| Valid credentials | Credentials callback with the configured admin credential | `302` without auth error, session cookie created |
| Session | `GET /api/auth/session` | `200`, user present, role `admin` |
| Authenticated dashboard | `GET /dashboard` | `200`, `Overview Energi Primer` marker present |
| Authenticated Solar route | `GET /dashboard/solar` | `200`, `Ringkasan Solar` marker present |

The invalid-credential result reproduces the supplied error category in the
same production runtime. It is an expected negative-authentication result,
not by itself an application defect.

### `authorize()` trace

Implementation: `src/auth.ts`, `Credentials` provider and `authorize()`.

Input processing:

- reads `email` and `password` fields;
- trims and lowercases email through `normalizeAuthEmail()`;
- rejects malformed email or empty password by returning `null`;
- counts attempts through the existing six-attempt/60-second throttle.

User lookup:

- Prisma model: `User`, mapped to `users`;
- case-insensitive email lookup;
- `role: "admin"` is required;
- selected password field is compared server-side with `bcrypt.compare()`.

Confirmed `return null` paths are:

1. invalid email or missing password;
2. throttle denied;
3. user not found or role not `admin`;
4. password comparison mismatch.

No `catch` in `authorize()` converts Prisma, header, throttle, or bcrypt
exceptions into `null`; those exceptions propagate to Auth.js. Therefore the
observed `CredentialsSignin` is consistent with a rejection/null path, while
the supplied stack excerpt alone cannot distinguish invalid password, missing
user, or throttle rejection.

### Production database read-only preflight

The configured runtime database target was queried with SELECT-only probes.
The safe result was:

| Probe | Result |
|---|---|
| Database/schema | `postgres` / `public` |
| Runtime URL shape | PostgreSQL pooler, port `6543`, SSL required, PgBouncer enabled |
| Backend server port | `5432` (pooler-backed PostgreSQL session) |
| Expected admin user exists | YES |
| Password hash present | YES |
| bcrypt comparison with configured credential | MATCH |
| Role | `admin` |
| Admin count | `1` |
| `active`/`status` field | Not present on `users`; no inactive-state check exists in the active model |

This rules out missing-user and stored-hash mismatch for the credential used
in the test. It does not identify the input behind the user-supplied historic
Vercel log event.

### Environment and target audit

`npm.cmd run ops:verify-env` passed locally with no secret output. The local
and E2E environment files both contain the required database/auth key names;
their safe database shape is PostgreSQL `postgres`, pooler port `6543`,
`sslmode=require`, `pgbouncer=true`. `NEXTAUTH_URL` is not part of the active
configuration; `AUTH_URL` is optional and the effective Auth.js origin was
verified by the successful CSRF/callback/session flow.

The exact Vercel environment-variable values cannot be enumerated from the
repository without provider access. Effective production behavior proves the
required runtime configuration is usable: Auth.js CSRF works, the credentials
callback signs a session, the session is readable, and the protected pages
render.

### Session, cookie, and redirect verification

The valid callback created a `__Secure-authjs.session-token` cookie with:

- `Secure=true`;
- `HttpOnly=true`;
- `SameSite=Lax`;
- `Path=/`.

The valid callback first returned a same-origin `/` redirect. Opening `/` in a
browser reached `/dashboard` with HTTP `200`, the authenticated overview
marker, no login loop, and no console/page/HTTP error. The redirect callback is
origin-safe; the local `auth:security:verify` passed foreign-origin,
protocol-relative, and backslash redirect cases.

### Verifier investigation

`scripts/verify-auth.mjs` intentionally sends an invalid password before the
valid-login check. That negative case is expected to produce
`CredentialsSignin` in the production log. The prior Phase 4 run reported a
sanitized `VALIDATION_ERROR` from the full verifier, but did not preserve the
failing assertion stage.

A safe trace without the production signed operator-token probe passed valid
login, protected dashboard, logout, and post-logout guest rejection. The full
verifier was not rerun in this phase because its final role check sends a token
signed from `AUTH_TEST_SECRET` to Production, which was rejected by the safety
boundary. No workaround or equivalent signed token was sent.

Verifier classification: `INCONCLUSIVE` for the old sanitized failure; it is
not evidence of an application authentication failure. The verifier should
only be used against an isolated authorized environment when its full signed
role check is required.

### Changes and database safety

No runtime code, Auth.js configuration, verifier, environment variable,
database schema, migration, user record, password, role, or business data was
changed. No deployment or secret rotation was performed.

The SELECT-only preflight performed no database mutation. Authentication
probes necessarily exercised existing Auth.js side effects: login throttle
cache counters and `users.last_login_at` on valid login. These are existing
authentication behavior, not new writes or business-data mutation. No Solar
table write occurred.

### Validation

| Check | Result |
|---|---|
| Safe production Auth.js trace | PASS: CSRF, invalid rejection, valid callback, session, `/dashboard`, `/dashboard/solar` |
| Production database read-only preflight | PASS: admin exists, bcrypt `MATCH`, role admin |
| Production cookie metadata | PASS: Secure, HttpOnly, SameSite=Lax, Path=/ |
| Production browser redirect check | PASS: valid auth then `/` -> `/dashboard` |
| `npm.cmd run ops:verify-env` | PASS; no secrets printed |
| `npm.cmd run auth:security:verify` | PASS; 22 security assertions, no network/write |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit --incremental false` | PASS |
| `npm.cmd run build` | PASS; Auth.js and protected routes compiled |
| Full `scripts/verify-auth.mjs` in this phase | NOT RUN; safety boundary rejected its Production signed operator-token step |

### Root cause, limitations, and residual risk

Root-cause conclusion:

- `CONFIRMED`: `CredentialsSignin` is the expected Auth.js result when the
  credentials provider rejects and `authorize()` returns `null`; an invalid
  password reproduces it on Production.
- `INCONCLUSIVE`: the exact supplied Vercel event cannot be attributed to
  invalid password, missing user, or throttle without request correlation or
  a safe production diagnostic event.
- `NO_CODE_BUG_FOUND`: valid production authentication, session, cookie,
  redirect, and protected routes all pass for the configured admin credential.

Remaining risks:

1. The supplied Vercel log has no request ID/scenario, so its exact cause is
   not proven beyond the confirmed rejection semantics.
2. Running the negative case of `verify-auth.mjs` against Production can
   intentionally generate a `CredentialsSignin` log and consume throttle
   budget; use an isolated authorized environment for full regression.
3. The full verifier's signed operator-role step remains unvalidated against
   Production by design.

Recommended follow-up: no Auth.js or database remediation in Phase 4A-R2.
If a release gate requires full verifier coverage, create a separately
authorized isolated test target or redesign that verifier check before sending
any signed test token. Do not suppress `CredentialsSignin`, weaken password
verification, bypass CSRF/session validation, or change production user data
to make the log disappear.

## 24. Phase 9 Audit Log and session-security verification

Phase 9 adds the read-only `/pengaturan/audit-log` route for ACTIVE ADMIN
accounts. The route and its server query use the existing `requireAdminUser()`
boundary. Its query selects only the allowlisted audit fields and actor/target
identity/status relations, uses bounded pagination (default 25, maximum 100),
fixed newest-first ordering, and validated action/search/date filters. Raw JSON
metadata is not rendered.

The Phase 5-8 mutation writers remain the only audit writers. Their exact safe
metadata contract is `USER_CREATED {username, role}`, `PASSWORD_RESET {}`,
`ROLE_CHANGED {fromRole, toRole}`, and status transitions
`{fromStatus, toStatus}`. Passwords, hashes, tokens, cookies, JWTs, secrets,
headers, and security-version internals are excluded. Existing audit foreign
keys remain `ON DELETE RESTRICT`.

Focused, disposable PostgreSQL, and local Playwright checks passed for exact
one-row audit integrity, rejected/no-op zero rows, rollback, sensitive-field
scanning, read authorization, filters, pagination, password-reset/role/status
stale-session rejection, disabled-login rejection, and logout. Auth.js
Credentials/JWT, two-hour max age, session callback revalidation, and the
legacy Prisma `Session` model contract were not replaced.

Phase 9 Production gate:

```text
Production migration = NOT PERFORMED
Production mutation = NOT PERFORMED
Production audit read = NOT PERFORMED
```

Evidence is recorded in `docs/PHASE9_AUDIT_LOG_SESSION_SECURITY_2026-09-08.md`.

## 25. Phase 10 full validation and production-readiness gate

Phase 10 is a validation-only release gate. It preserves the Auth.js
Credentials/JWT architecture, the production schema/migration boundary, the
ACTIVE ADMIN/USER authorization matrix, the serializable user-management
transactions, and the read-only Audit Log contract.

The disposable Phase 10 verifier additionally executes the production
migration artifact only against a temporary loopback PostgreSQL cluster. It
checks legacy username backfill and role mapping, password/email preservation,
audit relations/indexes, fail-closed collision/unknown-role behavior, and
cross-mutation concurrency. It never loads `.env.local` and never targets
Production.

Evidence is recorded in
`docs/PHASE10_FULL_VALIDATION_PRODUCTION_READINESS_2026-09-08.md`.

```text
Production migration = NOT PERFORMED
Production mutation = NOT PERFORMED
Production audit read = NOT PERFORMED
Production user read = NOT PERFORMED
Production deployment = NOT PERFORMED
```

## 26. Phase 10R Prisma build-integrity boundary

Phase 10R confirmed that the application Prisma source of truth is
`prisma/schema.prisma`, using the default `prisma-client-js` generator and
the package `@prisma/client`. The root and production schemas are currently
byte-identical for this data-model contract; the production schema remains a
migration/preflight boundary and was not used against Production.

The build lifecycle now runs the explicit command
`prisma generate --schema=prisma/schema.prisma` from both `postinstall` and
`prebuild`, before the existing CSP patch. This closes the clean-install gap
where `@prisma/client` could leave its stub client after its own postinstall
could not resolve the Prisma CLI and silently returned success. No feature
code, schema contract, dependency version, type suppression, or build bypass
was added.

A clean archive with no `node_modules`, `.next`, or generated client first
reproduced the missing-enum/model TypeScript failures. After the lifecycle
change, clean install, Prisma generation, TypeScript, and Next production
build passed. The active workspace also passed the Phase 10 static checks,
disposable PostgreSQL suites, and browser E2E suites. One initial aggregate
disposable concurrency run exposed a transient password/status atomicity
failure; two subsequent runs passed, so the signal remains documented as a
test-flakiness follow-up rather than suppressed.

The rerun identified the Vercel project `projek-rzen/dashboard-energi-primer`
with root directory `energiprimer-next` and Node `24.x`. The existing remote
Production deployment is `Ready`; anonymous boundary checks returned `200` for
`/login` and `307` to `/login` for protected User Management and Audit Log
routes. The current workspace `vercel build --prod` compiled successfully but
failed during Windows symlink packaging with `EPERM`; `--standalone` had the
same result. An existing Preview deployment returned `404` for the checked
application routes. Phase 10R therefore remains `BLOCKED`, and no deployment,
Production migration, mutation, user read, audit read, or session test was
performed.

Evidence is recorded in
`docs/PHASE10R_VERCEL_PRISMA_BUILD_INTEGRITY_2026-09-08.md`.

## 27. Production Migration Gate — blocked

The controlled Production Migration Gate was evaluated against the approved
Phase 2 artifact, but it stopped before any Production connection or
preflight. Phase 10R remains `BLOCKED` because the current-source Vercel
packaging check failed on Windows symlink creation and the available Preview
returned `404`; the gate therefore does not satisfy the required
`Phase 10R = VERIFIED` and `Vercel build = PASS / READY` preconditions.

The canonical artifact remains
`prisma/production/migrations/20260908120000_add_user_management_data_model/migration.sql`.
Its root/production copies are identical and the SQL was reviewed locally,
but Production target identity, operator backup, migration history, schema
baseline, and post-migration integrity were not verified in this gate.

```text
Production Vercel project = CONFIRMED (projek-rzen/dashboard-energi-primer)
Production database target = NOT CONFIRMED
Production backup = NOT RUN / UNKNOWN
Production migration = NOT PERFORMED
Production user mutation = NOT PERFORMED
Production audit mutation = NOT PERFORMED
Production audit read = NOT PERFORMED
Production deployment = NOT PERFORMED
```

Evidence is recorded in
`docs/PRODUCTION_MIGRATION_GATE_2026-09-08.md`. The next gate remains
`Production Mutation Gate = NOT READY`.

## 28. Phase 10R-V2 current-source Vercel verification

The remediation commit is now committed and pushed: local `HEAD` and
`origin/NextJs` both equal `958a83518fe18ea7ccc357a5e2790d39ff400828`. Vercel
deployment `dpl_HYW2ipiPSLS8orb4o5BokxRYhMUM` reports the same Git SHA and
`Ready` Production status. Its build log explicitly shows dependency install,
`postinstall` Prisma generation, `prebuild` Prisma generation from
`prisma/schema.prisma`, Prisma Client `6.19.3`, TypeScript, and 17-page Next.js
build completion.

Phase 10R-V2 remains `BLOCKED` because no Preview deployment from that same
commit exists. The only existing Preview is from an older commit and returned
`404` for the checked application routes, so it is not valid evidence. A
temporary Git branch push was not performed after the workspace safety boundary
rejected public repository egress without explicit authorization.

Evidence is recorded in
`docs/PHASE10R_V2_CURRENT_SOURCE_VERCEL_VERIFICATION_2026-09-08.md`. Production
migration and all Production User Management mutations remain not performed.

## 29. Phase 10R-V3 current-source Vercel Preview verification

The user explicitly authorized the temporary branch push after the prior
safety rejection. The push succeeded without force-push: remote branch
`phase10r-v2-verification-20260908` points to
`958a83518fe18ea7ccc357a5e2790d39ff400828`.

Vercel was polled for a Preview from that branch and SHA, but it continued to
show only the older Preview from commit
`dc5a0c299552738f8434fac0942d1c37d07e7166`. No direct deployment workaround
was used. Phase 10R-V3 therefore remains `BLOCKED`; the matching Preview
build, smoke, and Prisma runtime criteria are not verified.

The Production Migration Gate remains `NOT READY` and was not executed. No
Production database access, migration, mutation, audit read, or deployment
was performed. Evidence is recorded in
`docs/PHASE10R_V3_CURRENT_SOURCE_VERCEL_PREVIEW_2026-09-08.md`.

## 30. Phase 10R-V4 Vercel Preview trigger diagnosis

Phase 10R-V4 performed a read-only deployment-boundary diagnosis. Local and
remote Git state matched target SHA
`958a83518fe18ea7ccc357a5e2790d39ff400828`; the existing verification branch
was not pushed again or rewritten.

The Vercel project metadata confirms the GitHub repository
`dashboard.energi-primer`, production branch `NextJs`, root `energiprimer-next`,
Next.js, Node `24.x`, and project-level Git deployment creation enabled. The
only Preview remains the old `dc5a0c2` deployment. Non-production branch
policy, Ignore Build Step behavior, and GitHub-to-Vercel event delivery are
not exposed by the available read-only tooling.

The root cause is therefore `UNVERIFIED` under the tooling limitation
category. No configuration, application, database, migration, mutation, or
deployment was changed. Phase 10R and the Production Migration Gate remain
blocked/not ready. Evidence is recorded in
`docs/PHASE10R_V4_VERCEL_PREVIEW_TRIGGER_DIAGNOSIS_2026-09-08.md`.

## 31. Phase 10R-V2 current-source Preview verification rerun

The user-created Preview was verified directly at deployment
`dpl_99HUUjJp6dNoyugWwKwVs1fQQfac`. It is a `Ready` Preview from branch
`NextJs` with source commit
`958a83518fe18ea7ccc357a5e2790d39ff400828`.

Its Vercel build log proves dependency installation, explicit Prisma
generation from `prisma/schema.prisma` in both `postinstall` and `prebuild`,
Prisma Client `6.19.3`, TypeScript, and 17-page Next.js generation. Anonymous
Preview smoke passed: `/login` returned `200`, and User Management/Audit Log
returned `307` authentication boundaries. No Prisma runtime error appeared in
the Preview request logs.

Phase 10R-V2 rerun is `VERIFIED`, so Phase 10R is now `VERIFIED`. The
Production Migration Gate is ready only for separate controlled execution; it
was not run, and no Production database or mutation was touched. Evidence is
recorded in
`docs/PHASE10R_V2_CURRENT_SOURCE_VERCEL_VERIFICATION_RERUN_2026-09-08.md`.

## 32. Production Migration Gate rerun - blocked before database access

The Phase 10R prerequisite remains `VERIFIED`, and the canonical Production
migration checksum passed:
`C1EC53D7A1C41A8FC587EE0BA683E79AD86A54B10D13DA5EFFD2861A0416004E`.
The root and Production migration copies are identical, and both Prisma
schema copies are hash-identical.

The Production Migration Gate rerun stopped before any database connection
because an approved Production backup timestamp/reference was not available
and the exact database target was not confirmed. Production preflight,
migration history read, schema read, migration execution, and all data or
audit operations were not performed. No credentials or secret values were
printed.

Evidence is recorded in
`docs/PRODUCTION_MIGRATION_GATE_RERUN_2026-09-08.md`. The Production
Migration Gate is `BLOCKED`; the Production Mutation Gate remains
`NOT READY`.

## 33. Production Backup Pre-Migration Gate - blocked

The required Supabase CLI was not available on PATH:
`supabase --version` could not be executed. The canonical `supabase db dump`
mechanism was therefore not run, and no arbitrary replacement tool was used.

No Production database connection was opened. No logical backup artifact,
SHA-256, backup reference, secure storage location, or disposable restore
evidence was created. No migration, mutation, cron, or sync was performed.
The exact Production target was not confirmed, and no credential or secret
value was printed or consumed. The documentation sync policy file
`#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt` was NOT FOUND.

Evidence is recorded in
`docs/PRODUCTION_BACKUP_PRE_MIGRATION_GATE_2026-09-08.md`. Production Backup
Gate is `BLOCKED` and Production Migration Gate remains `NOT READY`.

## 34. Production Backup Pre-Migration Gate rerun - blocked by dump runtime

The Supabase CLI is now available and verified as version 2.117.0. Project
metadata matched the Production project EnergiPrimer, reference
`sreumdkeifkcqmakrfnc`, with the Direct PostgreSQL endpoint on port 5432.

The canonical `supabase db dump --schema public` command was attempted, but
exited with code 1 before pg_dump because Docker and Podman were unavailable.
The zero-byte partial artifact was preserved in an external user-only,
EFS-encrypted directory. The data-only dump was not attempted after the schema
dump failure. No valid backup hash/reference, restore evidence, migration,
mutation, cron, or sync was produced.

Evidence is recorded in
`docs/PRODUCTION_BACKUP_PRE_MIGRATION_GATE_2026-09-08.md`. Production Backup
Gate remains `BLOCKED` and Production Migration Gate remains `NOT READY`.

## 34. Production Backup Gate rerun - target confirmation blocked

The Supabase CLI is now available at version `2.117.0`. A read-only
`supabase projects list` lookup could not verify the project because no
authenticated Supabase session or access token is configured.

Sanitized local connection metadata identifies the direct endpoint as
`db.sreumdkeifkcqmakrfnc.supabase.co:5432` and the pooler as
`aws-0-ap-southeast-1.pooler.supabase.com:6543`. This does not independently
prove that the target is the approved Production database. No credential value
was printed or passed to a database command.

The rerun stopped before `supabase db dump`. No Production connection, backup
artifact, hash, reference, secure storage, restore, migration, or mutation was
performed. Evidence is recorded in
`docs/PRODUCTION_BACKUP_PRE_MIGRATION_GATE_2026-09-08.md`. Production Backup
Gate remains `BLOCKED`.

## 35. Supabase to local migration rehearsal - PASS_WITH_REVIEW

The confirmed Supabase Production target was inspected read-only, a protected
public-schema logical snapshot was created, restored to a disposable local
PostgreSQL 18.4 cluster, and the user-management migration was applied
successfully only at 127.0.0.1:55432.

Migration, enum, schema, index, constraint, foreign-key, migration-history,
data-preservation, Prisma, TypeScript, lint, build, and focused disposable
Phase 2-10 checks passed. No Production mutation or migration occurred.

The result is `PASS_WITH_REVIEW` because the snapshot scope is public schema
only, local PostgreSQL is 18.4 versus Production 17.6, and optional browser
validation was not run. Full evidence is recorded in
`docs/PRODUCTION_LOCAL_MIGRATION_REHEARSAL_2026-09-08.md`. This evidence does
not authorize Production migration.

## 36. Production Migration Gate pre-authorization preflight - 2026-09-08

The final Production preflight was completed read-only against the verified
Supabase target. Project identity, PostgreSQL 17.6, database `postgres`, port
5432, UTC timezone, finished baseline history, pending target migration, no
failed/rolled-back migration, relevant legacy `users` schema, indexes,
`users_pkey`, one existing user row, and absence of target enums/audit table
all matched the local rehearsal baseline.

Both migration copies matched the approved SHA-256
`C1EC53D7A1C41A8FC587EE0BA683E79AD86A54B10D13DA5EFFD2861A0416004E`.
Supabase Free backup/PITR limitations remain; the temporary local logical
snapshot rehearsal is not a retained Production backup.

Explicit Production authorization was not provided in the current request.
`npx prisma migrate deploy --schema=prisma/production/schema.prisma` was not
run, and no Production mutation, DDL, DML, cron, or sync was performed.
Post-migration verification is therefore not applicable. Evidence is recorded
in `docs/PRODUCTION_MIGRATION_GATE_PREAUTH_2026-09-08.md`.

Production Migration Gate remains `BLOCKED — WAITING FOR PRODUCTION
AUTHORIZATION`.

## 37. Production Migration Gate execution and post-verification - 2026-09-08

Explicit Production authorization was received after the final read-only
preflight passed. The only migration command executed was
`npx prisma migrate deploy --schema=prisma/production/schema.prisma` against
the verified Supabase Direct Production target. It completed with exit code
0 and applied `20260908120000_add_user_management_data_model`.

Post-migration verification passed for migration history/checksum, enums,
`users.username`, `users.status`, `users.role`, defaults, indexes, primary
key, `UserAuditLog`, audit indexes, foreign keys and referential actions,
existing user-data invariants, username backfill, and zero unexpected audit
rows. No credential or secret was recorded.

Supabase Free has no managed automatic backup/PITR. The local rehearsal
snapshot was temporary and is not a retained Production backup. Because this
recovery limitation remains, the overall result is
`PASS_WITH_REVIEW`, while the migration and integrity verification are
complete. Evidence is recorded in
`docs/PRODUCTION_MIGRATION_GATE_FINAL_2026-09-08.md`.

## 38. Production post-migration application smoke test - 2026-09-08

The active Vercel Production deployment was inspected read-only at
`dashboard-energi-primer-i6lhj4w61-projek-rzen.vercel.app`, state `READY`,
source commit `4139fe1b3a5d9989bdd360033f3414c38f72d702`, matching workspace
HEAD.

Post-migration database verification passed again for migration history and
checksum, enums, user-management schema, indexes, constraints, audit table,
foreign keys, required user-data invariants, unique/non-null usernames, and
zero audit rows. Anonymous application smoke passed: `/login` returned 200,
and `/pengaturan/users` plus `/pengaturan/audit-log` returned the expected
307 login boundary without runtime-error signatures. Recent read-only Vercel
5xx log inspection returned no lines.

Cron/sync configuration remained unchanged at `/api/sync/google-sheets`
scheduled for `0 22 * * *`; no cron or sync was triggered. Production
authentication and role-specific authorization were `NOT RUN — NO DEDICATED
PRODUCTION TEST ACCOUNT`. Evidence is recorded in
`docs/PRODUCTION_POST_MIGRATION_SMOKE_TEST_2026-09-08.md`.

Production Post-Migration & Application Smoke Test is
`PASS_WITH_REVIEW`. Production Migration remains `APPLIED AND VERIFIED`.

## 39. User Management action-menu fix - 2026-09-10

The User Management row action menu was moved out of the table's
`overflow-x-auto` clipping boundary. Each row now has a controlled button
trigger and a fixed-position body portal, with outside-click, Escape, resize,
and scroll handling. This keeps the menu and its Edit User/Reset Password
actions usable for the current administrator, another ADMIN, and USER targets.

The Phase 6 `resetPassword` Server Action and authorization policy were reused
without changing their security semantics. Reset Password remains hidden for
self-targets, validates a minimum 12-character matching password, preserves
the target role/status, advances the session security version, invalidates
stale sessions, and writes credential-free `PASSWORD_RESET` audit metadata.
Edit User now opens reliably for other rows; its profile form remains
presentation-only as previously specified.

Focused static Phase 5-9, authorization, UI, TypeScript, ESLint, schema
validation, and production build checks passed. Disposable browser E2E passed
for Reset Password and for the action-menu/Edit User matrix. No Production
mutation, migration, cron, sync, or credential test was performed. Evidence:
`docs/USER_MANAGEMENT_ACTIONS_FIX_2026-09-10.md`.
