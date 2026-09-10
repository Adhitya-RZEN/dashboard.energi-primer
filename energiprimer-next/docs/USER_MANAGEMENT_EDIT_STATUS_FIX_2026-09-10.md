# User Management Edit User + Deactivate/Activate Fix — 2026-09-10

**Status:** `VERIFIED`  
**Scope:** Edit User persistence, Deactivate/Activate UI labels and flow, and
Phase 5-9/Auth regression verification

## Result

Edit User now persists `username`, `name`, and `email` for the current ADMIN,
another ADMIN, and USER targets. The server derives the actor from the active
session, rechecks ACTIVE ADMIN authorization inside the serializable
user-management transaction, rejects duplicate identity fields safely, and
records one credential-free `USER_UPDATED` audit row.

Deactivate and Activate now use the existing Phase 8 `changeStatus` action and
mutation helper. The UI labels are `Deactivate` and `Activate`; the persisted
status transitions and audit actions remain `USER_DISABLED` and `USER_ENABLED`.

The earlier
`docs/USER_MANAGEMENT_ACTIONS_FIX_2026-09-10.md` report intentionally recorded
Edit User as presentation-only. This phase closes that persistence gap without
creating a second status backend or changing the Prisma schema/migration.

## Implementation

- Added shared Edit User normalization and validation using the existing
  username/name/email rules.
- Added `assertCanEditUserInTransaction`, which permits an ACTIVE ADMIN to edit
  self or another user while retaining the server-side authorization boundary.
- Added `assertUserProfileUnique` and `updateUserProfileAndAudit`.
- The profile update payload contains only `username`, `name`, and `email`.
  It does not update `password`, `role`, `status`, or `updatedAt`; profile
  edits therefore do not invalidate the actor's session. Role, status, and
  password mutations retain their existing security-version invalidation.
- Added `editUser` Server Action with safe validation, duplicate mapping,
  no-op handling, transaction boundary, revalidation, and safe user-facing
  errors.
- Wired the existing Edit User dialog to `useActionState`, named form fields,
  pending-state protection, field/server errors, success feedback, close, and
  list refresh.
- Changed status presentation to `Deactivate <username>?` and
  `Activate <username>?`, including the login warning for deactivation.
- Extended the disposable role-management browser flow to persist and restore
  profile fields for own ADMIN, other ADMIN, and USER targets while asserting
  password, role, and status preservation.
- Added focused static/fake-transaction coverage in
  `scripts/verify-edit-user.ts`.

No Prisma schema or migration file was changed. No second status or password
backend was introduced.

## Authorization and data-safety confirmation

- User Management remains server-guarded to ACTIVE ADMIN accounts.
- A USER is denied by the server even if a client submits the action directly.
- Edit User does not accept actor identity, role, status, password, hash,
  token, JWT, cookie, or secret fields from the client.
- Duplicate username/email responses are field-scoped and do not reveal
  database details.
- `USER_UPDATED` metadata contains only changed field names; it contains no
  profile values, password, hash, token, session, or secret material.
- Existing status rules remain in force: only ACTIVE↔DISABLED, self-disable
  rejection, last active administrator protection, role preservation, session
  invalidation, and correct enabled/disabled audit actions.
- No credential, password, hash, token, JWT, cookie, private key, or secret
  was recorded in this report or verifier output.

## Focused tests and validation

| Check | Result | Boundary |
|---|---|---|
| `npm.cmd run user-management:edit-user:verify` | PASS | zero database writes/network requests; validation, duplicate preflight, payload allowlist, audit, action, UI, and status reuse |
| `npm.cmd run user-management:ui:verify` | PASS | zero database writes/network requests |
| `npm.cmd run user-management:add-user:verify` | PASS | zero database writes/network requests |
| `npm.cmd run user-management:reset-password:verify` | PASS | zero database writes/network requests |
| `npm.cmd run user-management:role-management:verify` | PASS | zero database writes/network requests |
| `npm.cmd run user-management:status-management:verify` | PASS | zero database writes/network requests |
| `npm.cmd run user-management:audit-log:verify` | PASS | zero database writes/network requests |
| `npm.cmd run authz:security:verify` | PASS | zero database writes/network requests |
| `npm.cmd run auth:security:verify` | PASS | static security checks; live auth fixture not available |
| `npm.cmd run db:validate` | PASS | read-only Prisma validation |
| Production schema validation | PASS | read-only Prisma validation; no migration/deploy |
| `npx.cmd tsc --noEmit --incremental false` | PASS | TypeScript |
| `npm.cmd run lint` | PASS | ESLint |
| `npm.cmd run build` | PASS | Next production build |
| Role/action-menu browser E2E | PASS | disposable loopback PostgreSQL only; Edit persistence for own/other ADMIN/USER, all profile fields, security-field preservation, audit, and USER denial |
| Account status browser E2E | PASS | disposable loopback PostgreSQL only; Deactivate/Activate, session rejection, role preservation, audits, and admin invariant |
| Reset Password browser E2E | PASS | disposable loopback PostgreSQL only |
| Audit Log browser E2E | PASS | disposable loopback PostgreSQL only; read boundary and mutation audit regression |
| `git diff --check` | PASS | working-tree whitespace check |

The disposable browser suites created and cleaned up temporary local
PostgreSQL databases. No Production database, user, migration, cron, sync,
deployment, or external application mutation was used.

## Documentation-first record

Inspected the Phase 5-9 reports, Phase 10/10R reports, current Production
Migration and post-migration reports, `docs/AUTH_IMPLEMENTATION.md`,
`docs/AGENT_CONTEXT.md`, the current User Management action/UI/backend files,
the production Prisma schema, and the approved user-management migration.

The referenced `#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt` was searched for in
the project locations and is **NOT FOUND**. No replacement documentation
policy was invented.

Updated:

- `src/app/(protected)/pengaturan/users/actions.ts`
- `src/components/user-management/UserManagementClient.tsx`
- `src/lib/authorization.ts`
- `src/lib/user-management-mutation.ts`
- `src/lib/user-management-validation.ts`
- focused status/UI/E2E verifiers and `package.json`
- `docs/AUTH_IMPLEMENTATION.md`
- `docs/AGENT_CONTEXT.md`

Created:

- `scripts/verify-edit-user.ts`
- this report

## Production boundary

Production migration, user mutation, profile edit, password reset, role/status
mutation, audit write, cron, sync, and deployment were **not performed** in
this phase. All runtime writes were disposable local test writes only.

## Final status

`VERIFIED`

Edit User persistence, Deactivate/Activate reuse of the Phase 8 backend,
authorization/security invariants, audit behavior, browser regression, and
TypeScript/ESLint/build gates all passed.
