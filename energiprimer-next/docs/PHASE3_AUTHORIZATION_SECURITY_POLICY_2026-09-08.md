# PHASE 3 RESULT — AUTHORIZATION & SECURITY POLICY

**Date:** 2026-09-08  
**Status:** `PASS_WITH_REVIEW`  
**Scope:** server-side authentication boundary, authorization policy, account status enforcement, self-target guards, last-admin invariant path, session revalidation, security tests, and documentation.

Phase 3 does not add User Management UI, CRUD actions, role/status mutation
actions, password reset, temporary passwords, or audit-event writing.

## Authorization Model

The access model is now:

| Account state | Dashboard | Future User Management policy |
|---|---:|---:|
| `ACTIVE` + `ADMIN` | Allow | Allow |
| `ACTIVE` + `USER` | Allow | Reject |
| `DISABLED` | Reject | Reject |
| Guest/invalid session | Reject | Reject |

The reusable policy is split into:

- `src/lib/authorization-policy.ts`: pure, database-independent role/status and
  invariant rules;
- `src/lib/authorization.ts`: server-only `requireActiveSession`,
  `requireDashboardUser`, `requireAdminUser`, and future mutation guards.

No frontend visibility check is used as an authorization boundary.

## Active / Disabled Enforcement

Auth.js Credentials now selects only users with a supported role and
`status = ACTIVE`. The session callback re-reads `role`, `status`, and
`updatedAt`; it invalidates the session role when the account is disabled, the
role no longer matches the JWT, or the session version is stale.

The proxy and protected layout allow both supported dashboard roles and reject
guests, disabled sessions, and unsupported role values before protected content
renders. The legacy `Session` table remains untouched and is not converted to
an Auth.js adapter. The existing self-password-change flow now uses the active
session guard; this is not a password-reset flow.

## Admin Policy

`requireAdminUser()` performs server-side authentication, active-status
validation, current-user revalidation, and `ADMIN` role validation. Future User
Management resources must call this policy before target validation, database
mutation, password work, or audit writing.

`requireAuthenticatedUser()` / `requireActiveSession()` provide the common
active-session boundary for non-admin authenticated resources.

## Self-Target Protection

The pure policy rejects:

- any self role change;
- self-disable;
- any administrative transition attempted by a `USER` or inactive account.

The guards are available as `assertCanChangeRole`, `assertCanChangeStatus`, and
`assertCanManageUser`. Enable operations remain possible for another target;
actual mutations are deferred.

## Last-Admin Protection

`assertLastAdminSafe` prevents an operation that would remove the final
`ACTIVE + ADMIN` account through role change to `USER` or disablement.

The transaction-safe path is exposed by `withUserManagementTransaction` and
the `assertCan*InTransaction` helpers. It uses PostgreSQL serializable
transactions, locks all active-admin rows plus actor/target rows with
`FOR UPDATE`, then counts active admins inside the same transaction. Future
role/status mutations must invoke the guard and perform their mutation before
the transaction completes. No database trigger or mutation action was added.

## Session Security

The existing JWT/session-version design remains in use:

```text
security-sensitive user change
        ↓
updatedAt changes
        ↓
JWT version becomes stale
        ↓
Auth.js session callback rejects the session
```

`securityVersionUpdate()` provides the common `{ updatedAt }` update shape for
future role/status/password operations. Role equality is also checked, so a
security-sensitive mutation cannot leave an old JWT with administrator
privilege even if a caller forgets to advance the version.

## Security Tests

Added `scripts/verify-authorization-security.ts` and the
`authz:security:verify` package command. The test is isolated and performs no
database writes or network requests. It covers:

- guest, active USER, active ADMIN, and DISABLED dashboard access;
- ADMIN-only User Management policy;
- disabled-account rejection;
- valid role/status transitions;
- self-role and self-disable rejection;
- last-admin role/status rejection;
- USER administrative-policy rejection;
- session-version primitive;
- source integration checks for Auth.js, proxy/layout, and transaction locking.

The existing `auth:security:verify` assertions were retained and updated for
the active-status and both-role session boundary.

## Validation

Completed checks:

- `npm run authz:security:verify`: PASS; isolated, 0 database writes, 0 network requests.
- `npm run auth:security:verify`: PASS; existing security assertions retained.
- `npm run lint`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run db:validate`: PASS.
- Root and production Prisma schemas remain valid.
- `npm run build`: PASS; Next.js production build and middleware compilation completed.

Production database migration/deployment was not run. Live credential E2E was
not run because the required isolated test-account environment is unavailable.

## Documentation

Updated:

- [`AUTH_IMPLEMENTATION.md`](./AUTH_IMPLEMENTATION.md)
- [`AGENT_CONTEXT.md`](./AGENT_CONTEXT.md)

Created:

- This Phase 3 result document.

Phase 1 and Phase 2 reports remain historical baselines and are not rewritten.

## Limitations

- No production user mutation or real session invalidation was performed.
- Post-migration live schema/auth E2E remains an operator responsibility because
  the Phase 2 migration is still pending deployment.
- The transaction helpers define the enforcement path; actual role/status CRUD
  remains intentionally absent.
- The existing password-change screen/action remains outside the new
  User-Management mutation surface.

## Deferred

User Management UI, user list/create actions, role/status mutation actions,
audit-event writer/UI, password reset, temporary passwords, email reset, and
operational retry handling for serialization conflicts belong to later phases.

## Recommendation

Apply the Phase 2 migration through the approved production change process
before deploying code that selects `status`. Future administrative operations
must use `requireAdminUser()`, `withUserManagementTransaction()`, the relevant
`assertCan*InTransaction` guard, and `securityVersionUpdate()` in one
transaction. Validate those operations against an isolated database before any
production account change.
