# PHASE 1 RESULT

Status: **PASS_WITH_REVIEW**

Audit date: 2026-09-08 (Asia/Makassar)  
Repository scope: `energiprimer-next/`, branch `NextJs`  
Audit mode: read-only source/documentation review plus safe static validation

This report is the Phase 1 baseline for the future Admin User Management
implementation. It does not authorize or perform source, schema, migration,
database, configuration, dependency, UI, role, password, or account changes.

## Authentication

| Item | Finding | Evidence |
| --- | --- | --- |
| Auth library | Auth.js / NextAuth | `src/auth.ts:2-20` |
| Auth.js / NextAuth version | `next-auth@5.0.0-beta.32` (declared and installed) | `package.json:64-66`, `npm.cmd ls` |
| Authentication provider | Credentials Provider | `src/auth.ts:28-85` |
| Credentials / other | Credentials; input fields are `email` and `password` | `src/auth.ts:29-37`, `src/app/login/LoginForm.tsx:16-49` |
| Session strategy | JWT, `maxAge = 120 * 60` seconds | `src/auth.ts:24-27` |
| Adapter | Not Present; no Auth.js adapter is configured | `src/auth.ts:20-140` |
| Auth configuration path | `src/auth.ts` | `src/auth.ts:1-140` |
| Auth route handler | `src/app/api/auth/[...nextauth]/route.ts` re-exports Auth.js `GET`/`POST` | `src/app/api/auth/[...nextauth]/route.ts:1` |
| Middleware/auth guard | `src/proxy.ts`; protected route group also checks server-side | `src/proxy.ts:6-13,62-127`, `src/app/(protected)/layout.tsx:15-23` |
| Server-side auth helper | `auth()` exported by `src/auth.ts` and used by pages/actions | `src/auth.ts:15-20`, `src/app/(protected)/layout.tsx:15` |
| Callbacks | `authorized`, `redirect`, `jwt`, `session` | `src/auth.ts:87-138` |
| Events | NOT FOUND | No `events` configuration in `src/auth.ts` |
| Pages | Custom sign-in page `/login`; no custom recovery/sign-out page | `src/auth.ts:21-23`, `src/app/login/page.tsx` |

Active architecture:

```text
/login
    ↓ Server Action authenticate()
Auth.js Credentials.authorize()
    ↓ normalize + throttle + Prisma lookup
public.users
    ↓ bcryptjs.compare()
Auth.js JWT httpOnly cookie
    ↓ session role/version revalidation
src/proxy.ts + protected layout + auth()
    ↓
Admin-only dashboard pages
```

The active application authorizes only the lowercase role value `admin`.
There is no active OAuth, Email Provider, magic-link, Supabase Auth, or
database session adapter in the current source.

## Login Flow

LOGIN FLOW:

1. A guest opens `/login`; `src/app/login/page.tsx` renders the email/password
   form in `src/app/login/LoginForm.tsx`.
2. The form invokes the `authenticate` Server Action in
   `src/app/login/actions.ts`. The action trims/lowercases the email, validates
   the email format and non-empty password, then calls
   `signIn("credentials", { email, password, redirectTo: "/dashboard" })`.
3. Auth.js invokes `Credentials.authorize()` in `src/auth.ts`. The provider
   normalizes the email again, rejects malformed/empty input, and consumes the
   existing six-attempt/60-second login throttle keyed by hashed email and
   request IP. The throttle uses the existing `cache` table and a PostgreSQL
   advisory transaction lock.
4. Prisma queries `User` by case-insensitive email and requires
   `role: "admin"`. It selects the numeric ID, name, email, password hash,
   role, and `updatedAt`.
5. `bcryptjs.compare(password, user.password)` verifies the password. Missing
   user, non-admin role, throttle denial, malformed input, and comparison
   failure all return `null` to Auth.js and result in a generic login error.
6. On successful credentials, the application updates `lastLoginAt` and
   returns the user identity, role, and `updatedAt`-derived session version.
7. Auth.js signs a JWT session cookie and redirects to `/dashboard`. Auth.js
   owns CSRF, callback, sign-in, sign-out, and redirect handling.
8. On protected requests, `src/proxy.ts` rejects guests/non-admins and the
   protected layout repeats `auth()` and `role === "admin"` checks before
   rendering the application shell.

Not found in the active login flow:

- username login;
- account `status`/disabled check;
- email verification check;
- temporary password check;
- failed-login audit event;
- last-login update for rejected attempts.

## User Model

The root Prisma schema and canonical production schema have the same auth model
definition. The production baseline migration confirms the corresponding
PostgreSQL columns and indexes.

| Field | Type | Nullable | Unique | Default | DB column | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `BigInt` | No | Primary key | Autoincrement | `id` | JWT subject/user identity; password-change lookup |
| `name` | `String` | No | No | None | `name` | Session/display name |
| `email` | `String` | No | Yes | None | `email` | Login identifier and session field |
| `emailVerifiedAt` | `DateTime?` | Yes | No | None | `email_verified_at` | Present in legacy model; not checked by login |
| `password` | `String` | No | No | None | `password` | Bcrypt-compatible password hash |
| `rememberToken` | `String?` | Yes | No | None | `remember_token` | Legacy compatibility token; rotated by password change |
| `createdAt` | `DateTime?` | Yes | No | None | `created_at` | Timestamp; not used by active auth decisions |
| `updatedAt` | `DateTime?` | Yes | No | None | `updated_at` | Session-version value; explicitly updated by password change |
| `role` | `String` | No | No | `"admin"` | `role` | Login filter and authorization checks; indexed |
| `lastLoginAt` | `DateTime?` | Yes | No | None | `last_login_at` | Updated after successful login |

Evidence: `prisma/schema.prisma:10-24`,
`prisma/production/schema.prisma:10-24`, and
`prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql:5-18,454-458`.

### Username

**USERNAME FIELD: NOT FOUND.** There is no `username` field, unique index, or
username login path in the active schema/source.

### Email

- `email` is required and has a Prisma/database unique constraint.
- Login input is trimmed and lowercased by `normalizeAuthEmail()`.
- The user lookup additionally uses Prisma `mode: "insensitive"`.
- `create-admin.mjs` lowercases the email before duplicate lookup and creation.
- The database unique index itself is an ordinary unique index; the audit could
  not re-query the live data to verify whether existing rows are all lowercase
  or whether case-variant data exists.

The effective login behavior is case-insensitive, but the database constraint
does not by itself prove a lowercase/case-insensitive uniqueness invariant.
This is a Phase 2 migration/design item, not a Phase 1 change.

### Password

- Field: required `String`, mapped to `users.password`.
- Comparison: `bcrypt.compare()` in `src/auth.ts:68`.
- Hashing: `bcrypt.hash(password, 12)` in the password-change action and
  `bcrypt.hash(password, 12)` in `scripts/create-admin.mjs`.
- Plaintext password is accepted transiently as login/form/CLI input, but no
  active auth source stores or returns plaintext.
- No active password-reset handler or temporary-password field was found.

### Role

- Type: free-form required `String`, not an enum.
- Default: lowercase `"admin"`.
- Active authorization value: lowercase `admin`.
- Active checks: `src/auth.ts`, `src/proxy.ts`, protected layout, root page,
  and password-change page/action.
- Frontend display: `UserMenu` displays the role but is not an authorization
  boundary.
- `operator` appears in the negative signed-token fixture in
  `scripts/verify-auth.mjs` and in historical Laravel documentation; it is not
  accepted by the active Credentials lookup.
- Actual database role distribution was not reverified in this audit because
  the safe database probe failed with `NETWORK_ERROR`.

### Status

**STATUS FIELD: NOT FOUND.** No account status column, enum, default, or login
check for `ACTIVE`/`DISABLED` exists in the current User model or auth flow.
Other domain tables have unrelated `status` fields; they are not user account
status.

## Role & Authorization

Authentication means that Auth.js has established a valid user identity.
Authorization means that the identity has the required `admin` role. The
current implementation performs both, but only the `admin` role is allowed to
reach the application pages.

Current authorization locations:

| Location | Behavior |
| --- | --- |
| `src/auth.ts:88-94` | Auth.js `authorized` callback requires `admin` for `/dashboard` paths |
| `src/auth.ts:115-135` | Session callback reads current user and rejects missing/non-admin/version-mismatched users |
| `src/proxy.ts:62-86` | Early redirect for all configured protected prefixes when user is absent or not `admin` |
| `src/app/(protected)/layout.tsx:15-23` | Server-side session and role boundary before shell render |
| `src/app/page.tsx:5-8` | Root redirect based on current session/role |
| `src/app/password/change/page.tsx:9-12` | Page-level session and role check |
| `src/app/password/change/actions.ts:17-20` | Server Action re-checks session and role |
| `src/app/api/sync/google-sheets/route.ts:77-101` | Separate cron authentication using `CRON_SECRET`; not a user-role check |

No policy, permission table, granular permission helper, user-management
endpoint, admin action authorization helper, or audit-log authorization path
was found. No admin-only User Management route exists.

## Session

Current session implementation:

- Strategy: JWT; two-hour maximum age (`src/auth.ts:24-27`).
- Adapter: none. Auth.js does not use Prisma `Session` as its adapter.
- Identity: the Auth.js token subject is the numeric `User.id`; role and a
  session version derived from `User.updatedAt` are included in the JWT path.
- Server lookup: `auth()` is used by the proxy, protected layout, root page,
  settings page, password-change page, and password-change action.
- Revalidation: the session callback queries the current user and clears the
  effective role if the user is missing, no longer `admin`, or its `updatedAt`
  differs from the token version.
- Logout: `signOut({ redirectTo: "/login" })` is used by the server-side
  `SignOutButton` action; password change signs out the active browser session.
- Expiry: Auth.js JWT expiry is two hours. There is no application cleanup job
  for JWTs.
- Password change: changes the password, rotates `remember_token`, sets
  `updatedAt`, and signs out the current browser. The version check is intended
  to reject older JWTs at the auth boundary.
- Account disable: NOT FOUND because there is no user status field/check.

The legacy `Session` Prisma model/table exists with `id`, nullable `user_id`,
IP/user-agent, payload, and `last_activity`, but no active source queries or
writes it for Auth.js sessions. It has no Prisma relation to `User`.

### Invalidate all sessions for one user

**PARTIAL.** There is no explicit session-store revoke or
`invalidateAllSessionsForUser()` implementation. Updating `User.updatedAt`
can cause existing JWTs to fail the session-version check when they reach the
Auth.js/session boundary, so password change has an indirect invalidation
primitive. It is not yet exposed as an admin reset operation and does not
physically delete JWTs or legacy `sessions` rows.

## Password / bcrypt

| Item | Finding | Evidence |
| --- | --- | --- |
| Hashing library | `bcryptjs` | `package.json:64`, `src/auth.ts:1`, password-change action, create-admin script |
| Installed version | `3.0.3` | `npm.cmd ls bcryptjs --depth=0` |
| Hashing location | Password change and admin bootstrap; cost 12 | `src/app/password/change/actions.ts:47-55`, `scripts/create-admin.mjs:145-155` |
| Compare location | Credentials `authorize()` and current-password change check | `src/auth.ts:68`, `src/app/password/change/actions.ts:43-45` |
| Plaintext persistence | Not found in active auth source | Source scan of `src`, `scripts`, `prisma` |
| Password reset hashing | Not found in active flow | No reset handler/source reference |

The active code uses the `bcryptjs` implementation rather than the native
`bcrypt` package. Existing stored hash compatibility was not revalidated in
this audit because the database probe was unavailable.

## Password Reset / Legacy

```text
Password reset implementation: UNUSED / LEGACY OBJECT RETAINED
```

Evidence:

- `PasswordResetToken` remains in both Prisma schemas and the production
  baseline migration (`prisma/schema.prisma:26-32`).
- The active source has no `forgot-password` page/action, no
  `reset-password/[token]` route, no token generator, no token validator, no
  mail/reset handler, and no frontend reference.
- The active contract in `docs/AUTH_IMPLEMENTATION.md` identifies recovery,
  mail, and public reset routes as decommissioned while intentionally retaining
  the database object until a separately approved migration.
- Existing migration/inspection scripts mention the table as an authentication
  table, but that is inventory/migration handling, not an active application
  reset flow.

The legacy table is **SAFE TO RETAIN** for this phase and requires a separate
deprecation/migration review before removal. Historical reports such as
`docs/API_SECURITY_AUDIT.md`, `docs/AUTH_REGRESSION_TEST.md`, and the dated
E2E hardening report retain pre-decommissioning reset descriptions; those
descriptions are not current source evidence.

## Admin Provisioning

### `scripts/create-admin.mjs`

The script is registered as `npm run admin:create` and was inspected but not
executed. It:

- accepts `--email`, `--password`, and `--name`;
- trims/lowercases email and trims name;
- validates email, non-empty name, name length up to 255, and password length
  of at least 12 characters;
- requires a PostgreSQL Supabase-shaped URL, SSL, and public schema;
- checks for an existing exact normalized email and refuses to modify it;
- hashes the supplied password with `bcryptjs` cost 12;
- creates a user with role `admin`, name, email, password hash, and timestamps;
- performs one database write only on the new-account path.

It does not set `username`, `status`, or `lastLoginAt`, and it does not protect
the last-admin invariant or prevent a future admin from creating another admin.
The password is supplied as a CLI argument; the script does not print it, but
operator shell history/process-list exposure is a separate operational risk.

No registration page, general account-creation utility, Prisma seed, or active
admin user-management action was found. `scripts/phase6s-local-runtime.mjs`
contains disposable local-runtime fixture provisioning, not production account
management.

## Admin Account Audit

- Initial/admin bootstrap mechanism found: `scripts/create-admin.mjs`.
- Schema default role: `admin`.
- Hardcoded admin email/account: NOT FOUND.
- Existing admin count: **NEEDS VERIFICATION** in this audit. A prior
  read-only production evidence block in `docs/AUTH_IMPLEMENTATION.md` records
  one admin, but the current safe probe could not reconnect to the configured
  database (`NETWORK_ERROR`). That historical evidence is not presented as a
  fresh count.
- More than one admin: NEEDS VERIFICATION.
- Last-admin preservation: NOT FOUND in source.
- Admin self-disable/self-role-change protections: NOT FOUND because the target
  operations do not exist.

No account, role, password, or production data was changed.

## Environment / Config

Only presence was audited; no secret, credential, token, password, or private
key value is recorded here.

| Variable | `.env.local` presence | Contract/evidence |
| --- | --- | --- |
| `DATABASE_URL` | PRESENT | `.env.example`, `src/lib/server-env.ts:35` |
| `AUTH_SECRET` | PRESENT | `.env.example`, `src/lib/server-env.ts:35` |
| `AUTH_TRUST_HOST` | PRESENT | `.env.example`; not included in the startup-required list |
| `AUTH_URL` | PRESENT | Optional canonical Auth.js origin in `.env.example` |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | NOT FOUND in active contract | `docs/AUTH_IMPLEMENTATION.md`, source scan |

`npm.cmd run ops:verify-env` passed with `secretsPrinted: false`. The checker
requires only `DATABASE_URL` and `AUTH_SECRET` for startup; deployment trust and
canonical URL presence are not independently enforced by that checker.

## Routes

Route group `(protected)` is an implementation grouping; each listed page is
effectively **admin-only**, not merely authenticated, because the proxy and
protected layout require `role === "admin"`.

| Route/Page | Purpose | Protection | Role Requirement |
| --- | --- | --- | --- |
| `/` | Session-aware entry redirect | Public entry; server checks session | Admin redirects to dashboard; other session redirects to login error |
| `/login` | Credentials login page | Public | None; login accepts only an existing admin account |
| `/api/auth/[...nextauth]` | Auth.js protocol (CSRF, callback, session, sign-out) | Auth.js-managed public protocol surface | Auth.js/provider rules |
| `/dashboard` | Overview | Admin-only | `admin` |
| `/dashboard/biomassa` | Biomass dashboard | Admin-only | `admin` |
| `/dashboard/batubara` | Coal dashboard | Admin-only | `admin` |
| `/dashboard/solar` | Solar dashboard | Admin-only | `admin` |
| `/dashboard/stok` | Coal stock dashboard | Admin-only | `admin` |
| `/dashboard/target` | Target/performance dashboard | Admin-only | `admin` |
| `/data-batu-bara` | Coal quality data | Admin-only | `admin` |
| `/laporan` | Reports | Admin-only | `admin` |
| `/monitoring` | Monitoring page | Admin-only | `admin` |
| `/pengaturan` | Profile/settings display | Admin-only | `admin` |
| `/password/change` | Authenticated self password change | Admin-only; proxy + page + action | `admin` |
| `/api/sync/google-sheets` | Scheduled synchronization | Not UI-session protected; Bearer `CRON_SECRET` and deployment gate | Cron secret, not user role |
| `/admin/*` or User Management route | Target admin management | NOT FOUND | NOT FOUND |
| `/forgot-password` | Public recovery page | NOT FOUND in active source | NOT FOUND |
| `/reset-password/[token]` | Public reset page | NOT FOUND in active source | NOT FOUND |

## Security Verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run lint` | PASS | ESLint completed without findings |
| `npm.cmd run auth:security:verify` | PASS | 22 static/security assertions; 0 network requests and 0 database writes; `AUTH_E2E_ENV_NOT_AVAILABLE` |
| `npm.cmd run db:validate` | PASS | Root Prisma schema valid |
| Production schema validation | PASS | `prisma/production/schema.prisma` valid with local env loaded |
| `npx.cmd tsc --noEmit --incremental false` | PASS | TypeScript check completed |
| `npm.cmd run ops:verify-env` | PASS | Required startup and Google sync names present; no secrets printed |
| `npm.cmd run db:verify` | FAIL / NOT VERIFIED | Read-only verifier ended with `NETWORK_ERROR`; no write was attempted |
| `npm.cmd run auth:verify` | NOT RUN | Existing script performs invalid/valid login, throttle writes, `lastLoginAt` update, logout, and signed-role probe; not safe against the current database under Phase 1 read-only rules |
| `npm.cmd run build` | NOT RUN | `prebuild` invokes a dependency patching script; omitted to avoid altering installed dependency artifacts during audit |

`auth:security:verify` covers email normalization, redirect safety, cron
authorization, session/version checks, JWT max age, login throttle source
markers, recovery-route absence from the login page, protected layout/proxy
checks, and security headers. It does not prove live credentials, live cookie
behavior, or current database contents.

## Current State Matrix

| Area | Current State | Evidence | Risk / Impact |
| --- | --- | --- | --- |
| Login | EXISTS: Auth.js Credentials login for existing admins | `src/app/login/*`, `src/auth.ts` | No non-admin login path; live DB flow not rerun in this audit |
| Email login | EXISTS with trim/lowercase input and case-insensitive lookup | `src/lib/auth-security.ts:5-12`, `src/auth.ts:35,53-56` | DB unique index case behavior may not match lookup behavior |
| Username | MISSING | User schema and source scan | Target requires new field/migration |
| Password | EXISTS: bcryptjs compare; new hashes cost 12 | `src/auth.ts:68`, change/create-admin | Existing hash population not freshly checked due DB network failure |
| bcrypt | EXISTS: `bcryptjs@3.0.3` | `package.json`, installed package | Auth.js remains beta and should be regression-tested before upgrades |
| Role | PARTIAL: free string/default lowercase `admin`; only admin enforced | Prisma schema, `src/auth.ts`, `src/proxy.ts` | Target enum/case and `USER` role are absent |
| Status | MISSING | User schema/source scan | Disabled-user rule cannot be implemented by current model |
| Session | PARTIAL: active JWT; legacy DB session table unused | `src/auth.ts`, Prisma `Session` model | No central revoke store or explicit session deletion |
| Password reset | UNUSED legacy table/model; active route/flow NOT FOUND | Prisma schemas, source scan, current auth contract | Retention/deprecation needs separate reviewed decision |
| Admin authorization | EXISTS for current dashboard/protected pages | `src/proxy.ts`, protected layout | No User Management surface yet |
| Account creation | PARTIAL: bootstrap `admin:create`; no registration/admin CRUD | `scripts/create-admin.mjs` | No username/status/last-admin invariant/audit log |
| Audit log | NOT FOUND | Source/schema scan | Administrative accountability target is absent |

## Gap Analysis

### Target data model

| Requirement | Classification | Evidence / finding |
| --- | --- | --- |
| `username UNIQUE` | MISSING | No field or index in `User` |
| `name` | EXISTS | Required `User.name` |
| `email UNIQUE` | EXISTS | Required `User.email @unique` and production unique index |
| `password` | EXISTS | Required `User.password`; bcrypt compare/hash present |
| `role ADMIN \| USER` | PARTIAL | Current free string, default lowercase `admin`; no enum and no active `USER` authorization path |
| `status ACTIVE \| DISABLED` | MISSING | No user status field/check |
| `lastLoginAt` | EXISTS | `last_login_at` and successful-login update |
| timestamps | PARTIAL | `createdAt`/`updatedAt` exist but are nullable and have no User-level Prisma default/`@updatedAt` behavior |

### Target security

| Requirement | Classification | Evidence / finding |
| --- | --- | --- |
| 1. Login menggunakan email | EXISTS | Login form/provider and normalized email lookup |
| 2. Only ADMIN accesses User Management | MISSING | User Management route/actions do not exist; current dashboard admin guard is present |
| 3. Password uses bcrypt | EXISTS | `bcryptjs.compare` and cost-12 hashing |
| 4. No forgot-password requirement | EXISTS | No active recovery route/handler; legacy table retained only |
| 5. No temporary password | EXISTS | No temporary-password field or flow found |
| 6. Direct admin reset | MISSING | No admin reset action/UI |
| 7. Reset invalidates related sessions | PARTIAL | `updatedAt` version check plus self password-change sign-out exists; no admin reset operation or explicit revoke function |
| 8. Disabled user cannot login | MISSING | No status field or check |
| 9. Admin cannot disable self | MISSING | No disable operation or self-target invariant |
| 10. Admin cannot change own role | MISSING | No role-change operation or self-target invariant |
| 11. System cannot lose last admin | MISSING | No count/invariant/transaction guard |
| 12. All administrative actions enter audit log | MISSING | No audit-log model or writer |
| 13. Password/hash excluded from audit log | UNKNOWN | No audit-log implementation exists to verify this invariant |

The target feature set is therefore not ready for implementation without a
schema/security design phase. The baseline is sufficient to begin that design,
not to claim target-feature support.

## Legacy / Conflict Detection

| Existing item | Classification | Reason |
| --- | --- | --- |
| Role default `"admin"` | REQUIRES MIGRATION / REFACTOR | Target names uppercase `ADMIN \| USER`; current DB/code uses free lowercase string |
| No `username` | REQUIRES MIGRATION | Target requires unique username and future edit/list behavior |
| No user `status` | REQUIRES MIGRATION | Target requires `ACTIVE \| DISABLED` and login enforcement |
| `PasswordResetToken` model/table | SAFE TO RETAIN; REQUIRES DEPRECATION REVIEW | Active recovery is gone, but destructive removal is outside Phase 1 |
| JWT session strategy | SAFE TO RETAIN with REFACTOR | Existing version check can support reset invalidation, but admin reset must call a deliberate revoke/version path |
| Legacy `sessions` table | SAFE TO RETAIN | It is not the active Auth.js adapter; do not confuse it with JWT sessions |
| Existing `role === "admin"` checks | SAFE TO RETAIN for current boundary; REQUIRES REFACTOR for target roles | They protect current routes but are not a generalized admin-management policy |
| `scripts/create-admin.mjs` | SAFE TO RETAIN with REFACTOR | Useful bootstrap, but lacks target fields and last-admin safeguards |
| Historical recovery/security docs | DEPRECATION/DOCUMENTATION REVIEW | Several dated reports describe removed reset/mail code; current contract marks them historical |

No destructive decision or migration was made.

## Files / Components

Inventory only; no Phase 2 file was changed.

### Auth

- `src/auth.ts`
- `src/types/next-auth.d.ts`
- `src/lib/auth-security.ts`
- `src/lib/auth-tokens.ts`
- `src/lib/login-throttle.ts`
- `src/app/api/auth/[...nextauth]/route.ts`

### Database

- `prisma/schema.prisma`
- `prisma/production/schema.prisma`
- `prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql`
- legacy Prisma migration history under `prisma/migrations/`

### API / Server Actions

- `src/app/login/actions.ts`
- `src/app/password/change/actions.ts`
- future admin user-management Server Actions/route handlers: NOT FOUND

### UI

- `src/app/login/*`
- `src/app/password/change/*`
- `src/app/(protected)/pengaturan/page.tsx`
- `src/components/auth/UserMenu.tsx`
- `src/components/auth/SignOutButton.tsx`
- `src/components/layout/NavigationMenu.tsx`
- future User Management UI: NOT FOUND

### Middleware

- `src/proxy.ts`
- `src/app/(protected)/layout.tsx`

### Tests / Verification

- `scripts/verify-auth.mjs`
- `scripts/verify-auth-security.ts`
- `scripts/verify-environment.ts`
- `scripts/verify-db.mjs`
- `docs/AUTH_REGRESSION_TEST.md`

### Scripts

- `scripts/create-admin.mjs`
- disposable fixture provisioning in `scripts/phase6s-local-runtime.mjs`

### Documentation

- `docs/AUTH_IMPLEMENTATION.md`
- `docs/AUTH_MAPPING.md`
- `docs/AUTH_MIGRATION_SCHEMA_PLAN.md`
- `docs/AUTH_REGRESSION_TEST.md`
- `docs/AUTH_E2E_SECURITY_HARDENING_REPORT_2026-09-01.md`
- `docs/API_SECURITY_AUDIT.md`
- `docs/ENVIRONMENT_VARIABLES.md`
- `docs/ROUTE_MAPPING.md`
- this Phase 1 report

## Validation

Validation results are recorded in the Security Verification section above.
The database verifier was intentionally left at read-only mode and failed before
returning database facts because the configured connection was unreachable from
the audit environment. No migration, `db push`, seed, admin creation, login,
password change, role change, or user/account write was executed.

## Documentation

Documentation-first review found no `/docx` directory. The project’s relevant
documentation is under `energiprimer-next/docs/`.

The following current/historical documents were reviewed for the audit:

- `AUTH_IMPLEMENTATION.md` — active Auth.js contract and current decommissioned
  recovery boundary;
- `AUTH_MAPPING.md` — historical Laravel reference, explicitly marked as such;
- `AUTH_MIGRATION_SCHEMA_PLAN.md` — superseded design-only Supabase bridge plan;
- `AUTH_REGRESSION_TEST.md` — historical regression matrix with current-boundary
  notice;
- `AUTH_E2E_SECURITY_HARDENING_REPORT_2026-09-01.md` — historical hardening
  report; its old recovery sections are not active source evidence;
- `API_SECURITY_AUDIT.md` — historical endpoint audit that still lists removed
  reset actions;
- `ENVIRONMENT_VARIABLES.md` — current secret/configuration boundary;
- `ROUTE_MAPPING.md` and `DATABASE_MIGRATION.md` — historical/reference route
  and schema mapping.

This report is a dedicated Phase 1 audit document rather than a duplicate of
the shorter active contract. Existing dated reports were not rewritten because
their historical findings must remain attributable to their original phase.
No secret, password, hash, token, private key, database credential, or cookie
value is included.

## Limitations

1. The safe Prisma/database probe and `npm.cmd run db:verify` failed with
   `NETWORK_ERROR`; current admin count, role distribution, reset-token row
   count, session row count, and live email normalization could not be freshly
   verified.
2. `AUTH_E2E_ENV_NOT_AVAILABLE` was returned by the static verifier process;
   live valid-login/logout/cookie behavior was not rerun because the available
   `auth:verify` script performs database-affecting auth operations.
3. Source inspection proves what the current branch implements; it cannot prove
   external deployment configuration or production database state.
4. Historical documentation contains pre-decommissioning reset/mail claims;
   the current source and `AUTH_IMPLEMENTATION.md` contract take precedence.
5. The audit did not run build/prebuild because the prebuild hook patches
   installed dependency artifacts, which is outside a strict read-only audit.

## Recommendation for Phase 2

Before implementing Admin User Management:

1. Approve the target schema migration: `username` unique/canonicalization,
   `status`, and the representation/migration of lowercase `admin` to the
   target role vocabulary without losing the existing admin account.
2. Establish a safe read-only database access window or isolated clone to
   verify admin count, role distribution, email case/uniqueness, legacy token
   rows, and session-table contents. Do not use production credentials in E2E.
3. Keep server-side authorization as the boundary and add a dedicated admin
   policy/helper for list/create/edit/reset/role/status operations.
4. Design a transaction-level invariant for last-admin preservation and
   self-target restrictions before exposing role/status mutations.
5. Choose and test explicit user-session invalidation for admin reset. The
   existing `updatedAt` JWT-version primitive may be retained only after tests
   prove it rejects all relevant old tokens at every protected boundary.
6. Add an audit-log model/writer with an explicit allowlist of event metadata;
   never serialize password, password hash, reset token, or credential values.
7. Decide the retention/deprecation path for `PasswordResetToken` and legacy
   `sessions` separately. Do not delete them as part of user-management work
   without a reviewed migration and rollback plan.
8. Extend isolated verification for admin/non-admin access, disabled login,
   self-disable/self-role-change rejection, last-admin protection, reset
   invalidation, audit-log redaction, and email case behavior.

Phase 1 is complete with review required. No Phase 2 implementation is included
in this report.
