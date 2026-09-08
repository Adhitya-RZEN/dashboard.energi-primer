# Authentication & Authorization — Current Contract

> Phase 1 audit baseline (2026-09-08): see
> [`PHASE1_AUTH_USER_AUDIT_2026-09-08.md`](./PHASE1_AUTH_USER_AUDIT_2026-09-08.md).
>
> Phase 2 data-model update (2026-09-08): see
> [`PHASE2_DATABASE_DATA_MODEL_2026-09-08.md`](./PHASE2_DATABASE_DATA_MODEL_2026-09-08.md).

## Status

- **Status:** Active Auth.js Credentials flow
- **Date:** 2026-09-08
- **Production verification:** Phase 6K deployment/auth/dashboard checks PASS;
  Phase 6L post-checks retained the authenticated dashboard result
- **Reference application:** Laravel remains an immutable reference only
- **Database:** Existing PostgreSQL/Supabase `users` data; Phase 2 additive user-model migration prepared, not applied to production

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
and the JWT session boundary. Prisma reads the existing `users` table and only
authorizes the `ADMIN` role. The Phase 2 model represents roles as `ADMIN` and
`USER`, and account state as `ACTIVE` or `DISABLED`; status enforcement remains
deferred. Passwords are compared with `bcryptjs`; plaintext passwords are never
sent to the client or stored.

The Phase 2 migration adds a unique `username` backfilled from the lowercase
email local-part, preserves `password`, `email`, `last_login_at`, and existing
timestamps, and adds the `user_audit_logs` table. It does not add user-management
UI or mutation actions.

## Active files

- `src/auth.ts` — Auth.js configuration, credentials provider, role callback,
  and session-version revalidation.
- `src/types/next-auth.d.ts` — session/user type augmentation.
- `src/proxy.ts` — early guest and role protection for dashboard paths.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/(protected)/layout.tsx` — repeated server-side authentication and
  admin authorization boundary.
- `src/app/login/*` — login form and action.
- `src/app/password/change/*` — authenticated password-change flow.
- `src/lib/auth-tokens.ts` — non-recovery token used by the existing password
  change compatibility path.
- `src/lib/auth-security.ts` and `src/lib/login-throttle.ts` — redirect,
  email-validation, and persistent login-throttle helpers.

## Laravel behavior mapping

| Laravel behavior | Active Next.js implementation |
|---|---|
| `Auth::attempt` with legacy `role=admin` | Auth.js Credentials `authorize()` + Prisma + bcrypt; current value is `ADMIN` |
| Web session guard | Auth.js JWT httpOnly cookie, two-hour max age |
| `last_login_at` update | Prisma update after valid credentials |
| Logout/invalidation | Auth.js sign-out and session-version checks |
| `EnsureAdmin` middleware | Proxy `authorized` callback plus protected layout |
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

Historical Phase 4/5 reports retain their original findings and must not be
treated as the current authentication contract.

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
