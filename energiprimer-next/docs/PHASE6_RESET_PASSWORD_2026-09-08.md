# PHASE 6 RESULT

**Date:** 2026-09-08 (Asia/Makassar)  
**Status:** `BLOCKED`  
**Scope:** admin-initiated Reset Password for another user only

## Implementation

Reset Password is implemented on the ADMIN-only `/pengaturan/users` route.
The implementation uses the existing Phase 3/5 architecture:

- `src/app/(protected)/pengaturan/users/actions.ts` exports the `resetPassword`
  Server Action and `ResetPasswordState`.
- `src/lib/authorization-policy.ts` adds `assertCanResetPassword()` and the
  `SELF_PASSWORD_RESET` policy error.
- `src/lib/authorization.ts` adds
  `assertCanResetPasswordInTransaction()` using the existing row-lock loader.
- `src/lib/user-management-validation.ts` adds shared password-reset
  validation.
- `src/lib/user-management-mutation.ts` adds the transactional password update
  and `PASSWORD_RESET` audit writer.
- `src/components/user-management/UserManagementClient.tsx` connects the
  Phase 4 Reset Password dialog to the Server Action.

No new authentication system, adapter, hashing dependency, schema, or
migration was introduced.

## Authorization

The Server Action calls `requireAdminUser()` before target/password validation.
The actor ID is taken from the authenticated session. The form cannot provide
`actorUserId`, role, status, username, email, or password hash.

Inside the Serializable transaction, the existing Phase 3 loader locks the
actor, target, and active-admin rows, re-reads both participants, and
revalidates the actor as ACTIVE + ADMIN. A USER, disabled actor, missing actor,
or stale authorization state is rejected with a safe message.

## Self-Target Protection

`assertCanResetPassword()` rejects `actorUserId === targetUserId` with the
policy code `SELF_PASSWORD_RESET`. The row action hides Reset Password for the
current administrator, but the server-side policy remains authoritative.

A failed self-target attempt does not update the password and does not create
a `PASSWORD_RESET` audit row.

## Target Handling

The client may provide only `targetUserId`. The server parses it, then loads
the target inside the locked transaction. Browser display data is not trusted.

Both ACTIVE and DISABLED targets are valid. Reset Password changes neither
target status nor role. It also does not change username, email, or
`lastLoginAt`. A missing/invalid target returns `User not found.` without raw
Prisma, SQL, or table details.

## Password Security

The server validates `newPassword` and `confirmPassword` using the shared
user-management validation module:

- both fields are required;
- the new password must contain at least 12 characters;
- confirmation must match exactly.

The validated password is hashed with `bcryptjs` using 12 rounds before any
database transaction begins. Plaintext password, confirmation, and hash are
not returned, logged, placed in URLs/storage/cookies/telemetry, or included in
errors or audit metadata. The success state contains only a safe message.

## Session Invalidation

The mutation updates `updatedAt` through the existing
`securityVersionUpdate()` helper. Auth.js stores the original `updatedAt`
value in the JWT `sessionVersion` and re-reads the current user on each session
callback. Existing target JWTs therefore become stale after a successful
reset and are rejected; the target must authenticate again with the new
password.

No new session invalidation mechanism is introduced. The legacy Prisma
`Session` table is untouched, and no new session is created.

## Transaction

The operation uses `withUserManagementTransaction()` with Serializable
isolation:

```text
requireAdminUser()
  -> target/password validation
  -> bcryptjs hash
  -> lock/re-read actor and target
  -> assert ACTIVE ADMIN + non-self target
  -> update password + updatedAt
  -> insert PASSWORD_RESET audit
  -> commit
```

The mutation helper updates only `password` and `updatedAt`. If password
update fails, no audit is attempted. If audit insertion fails, the transaction
rolls back the password and security-version update.

## Audit

Each successful reset writes exactly one `UserAuditLog` row:

```text
actorUserId = authenticated ADMIN ID
targetUserId = locked target user ID
action       = PASSWORD_RESET
metadata     = {}
```

The audit contains no password, hash, token, cookie, secret, request header,
password length, or strength information.

## UI Integration

The Reset Password dialog now:

- shows the target's safe name/username/email fields;
- does not prefill or show the old password;
- submits `targetUserId`, `newPassword`, and `confirmPassword` only;
- performs client-side validation for early feedback;
- uses the server action for authoritative validation and mutation;
- disables inputs and duplicate submission while pending (`Resetting...`);
- clears password state after success;
- closes the dialog, refreshes the list, and shows
  `Password reset successfully.`;
- shows safe authorization, target, validation, or generic errors.

The dialog remains available for disabled targets because password state and
account status are separate concerns. Reset Password is hidden for the
current administrator. Edit, Change Role, Enable/Disable, and Delete remain
deferred and presentation-only.

## Tests

The main focused verifier is:

```bash
npm run user-management:reset-password:verify
```

It passed with zero database writes and zero network requests. It covers:

- password validation and confirmation;
- ACTIVE ADMIN, USER, disabled actor, target, and self-target policy matrix;
- ACTIVE/DISABLED target preservation;
- bcrypt hashing and hash verification;
- password/`updatedAt`-only mutation shape;
- actor/target/action audit fields and empty metadata;
- rollback on audit failure and no audit on update failure;
- source checks for guards, row-lock path, allowed fields, safe response, and
  credential exclusion.

The optional disposable verifier is:

```bash
npm run user-management:reset-password:verify:disposable
```

It was attempted against a temporary loopback PostgreSQL cluster. The local
Windows runtime blocked `pg_ctl` with `could not create restricted token:
error code 87`; the temporary directory was cleaned and no database remained.
The result is `BLOCKED`, not a test pass.

## Live E2E

**Status:** `NOT RUN`.

No isolated Auth.js browser environment was available after the disposable
PostgreSQL runtime was blocked. The following lifecycle was therefore not
claimed:

```text
target USER login
  -> ADMIN resets target password
  -> old target JWT rejected
  -> target logs in with new password
```

No Production credential, account, password, or session was used for testing.

## Database

Phase 2 already provides the required fields and enum:

- `users.password`;
- `users.updated_at`;
- `UserAuditAction.PASSWORD_RESET`;
- `user_audit_logs`.

Phase 6 adds no migration and does not modify Prisma schema. The Phase 2
production migration remains pending and was not applied. Production schema
validation is a source/schema check only; it is not proof that the pending
objects exist on the live target.

## Production Verification

**Status:** `NOT PERFORMED`.

No production migration, password reset, account creation, role/status change,
audit write, or session mutation was performed. If the target schema is not
verified after the approved Phase 2 deployment, live Reset Password operation
must remain blocked.

## Regression

The following local checks passed after the implementation:

```text
user-management:reset-password:verify  PASS
user-management:ui:verify              PASS
user-management:add-user:verify        PASS
authz:security:verify                   PASS
auth:security:verify                    PASS
db:validate                             PASS
production Prisma schema validate       PASS
TypeScript                              PASS
ESLint                                  PASS
Next.js production build                PASS
```

The focused checks report zero database/network activity. They do not replace
the blocked disposable transaction or live Auth.js E2E checks.

## Documentation

Updated:

- `docs/AUTH_IMPLEMENTATION.md`;
- `docs/AGENT_CONTEXT.md`;
- `docs/PHASE4_USER_MANAGEMENT_UI_2026-09-08.md` (historical integration note);
- `docs/PHASE5_ADD_USER_2026-09-08.md` (historical scope note).

Created:

- `docs/PHASE6_RESET_PASSWORD_2026-09-08.md`.

## Limitations

- The source implementation and synthetic transaction behavior are tested.
- A disposable PostgreSQL transaction could not start in this Windows runtime
  because `pg_ctl` could not create its restricted token.
- Live Auth.js session invalidation E2E was not run.
- Production migration state and production mutation behavior were not
  reverified in this phase.
- The status is `BLOCKED` under the Phase 6 gate; this is not a claim that the
  implementation failed.

## Deferred

Forgot-password, email reset, temporary passwords, reset tokens, email
delivery, role/status changes, Edit User, Delete User, and any new session
architecture remain out of scope. A future verification run must use a
disposable PostgreSQL/Auth.js environment before a release decision.

## Recommendation

Keep the Reset Password feature behind review until an operator provides a
working isolated PostgreSQL/Auth.js runtime. Run the disposable verifier and
browser session lifecycle there, verify the approved Phase 2 migration on the
intended target, then separately approve any production release. Never use
Production accounts or the pending production database as a test fixture.
