# PHASE 2 RESULT — DATABASE & DATA MODEL

**Date:** 2026-09-08  
**Status:** `PASS_WITH_REVIEW`  
**Scope:** schema, migration artifact, deterministic data backfill, and Auth.js/Prisma representation compatibility only.

Phase 2 is technically implementable and is not blocked by database access or
username collisions. The migration artifacts are prepared and validated, but
have not been applied to the live database. Production application remains an
operator-approved deployment step.

## Schema Changes

The same model and migration are present in both repository histories:

- `prisma/schema.prisma` and `prisma/migrations/20260908120000_add_user_management_data_model/migration.sql`
- `prisma/production/schema.prisma` and `prisma/production/migrations/20260908120000_add_user_management_data_model/migration.sql`

The `users` table gains:

- `username TEXT NOT NULL` with a unique index;
- `status UserStatus NOT NULL DEFAULT 'ACTIVE'`;
- `role UserRole NOT NULL DEFAULT 'ADMIN'` after preserving and converting the existing role value.

The migration creates these PostgreSQL enums:

- `UserRole`: `ADMIN`, `USER`;
- `UserStatus`: `ACTIVE`, `DISABLED`;
- `UserAuditAction`: `USER_CREATED`, `USER_UPDATED`, `PASSWORD_RESET`, `ROLE_CHANGED`, `USER_ENABLED`, `USER_DISABLED`.

No existing user row is deleted. `password`, `email`, `last_login_at`,
`created_at`, `updated_at`, and the existing role index are retained.

## User Model

`User` now maps the existing `users` table with the new fields and has two
named relations to `UserAuditLog`: one for rows where the user is the actor and
one for rows where the user is the target. `updatedAt` remains nullable and is
not changed to Prisma-managed `@updatedAt`, preserving the existing session
version behavior.

The model intentionally keeps the legacy `PasswordResetToken` and `Session`
models and their mapped tables. Phase 2 does not activate either legacy flow.

## Role Migration

The approved mapping is deterministic:

| Existing value | New enum value | Evidence/behavior |
|---|---|---|
| `admin` (case-insensitive) | `ADMIN` | The only role found in the current database; active Auth.js login remains admin-only. |
| `user` (case-insensitive) | `USER` | Supported if present in another environment; no current row was found. |
| Any other value or `NULL` | No mapping | Migration raises an exception and stops before changing user rows. |

The migration drops the text default, converts the column to `UserRole` with an
explicit `CASE`, and restores the default as `ADMIN`. It does not silently map
unknown roles.

## Status Model

Account state is represented by the `UserStatus` enum:

- `ACTIVE` is the non-destructive default for existing and newly created rows;
- `DISABLED` is available for the data model but is not enforced by login in this phase.

No UI, user-management action, disable/enable endpoint, or authorization policy
was added. Enforcing status in authentication is intentionally deferred so the
existing login behavior changes only where required by the enum representation.

## Audit Log

`user_audit_logs` contains:

- `id BIGSERIAL` primary key;
- required `actor_user_id` and `target_user_id` foreign keys to `users.id`;
- `action UserAuditAction`;
- nullable `metadata JSONB`;
- `created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`.

Indexes are present for actor, target, and creation time. Both foreign keys use
`ON DELETE RESTRICT` and `ON UPDATE CASCADE`, preventing a user referenced by an
audit record from being removed accidentally. No historical audit rows are
invented during backfill, and no audit-event writer is introduced in Phase 2.
`metadata` is reserved for safe operational context; it must not contain a
password, password hash, temporary password, reset token, secret, cookie, or
private key. Audit rows are retained; no cleanup job is added in this phase.

## Migration

The migration is additive and fail-closed:

1. Create the three enum types.
2. Validate existing roles, username candidates, and candidate collisions.
3. Add `username` and `status`.
4. Backfill `username` from the documented deterministic rule.
5. Convert `role` to `UserRole`.
6. Add the username uniqueness constraint and audit-log table, indexes, and foreign keys.

The SQL contains no `DROP TABLE`, user deletion, password rewrite, email
rewrite, reset-token removal, or session removal. The migration has not been
run against production or the currently inspected database.

## Data Backfill

The backfill rule is:

```text
username = LOWER(SPLIT_PART(email, '@', 1))
```

The rule was selected because the Phase 1 audit found no existing `username`
column, username source, or username flow. It does not normalize or modify the
stored email address.

Read-only inspection of the configured PostgreSQL database found:

- one user row;
- one distinct lowercase `admin` role and no `user` role;
- one non-empty candidate with valid shape;
- zero candidate collision groups and zero rows in collisions;
- one password-present row and one row with `last_login_at` present;
- zero `password_reset_tokens` rows and zero `sessions` rows.

The inspection did not print email addresses, passwords, tokens, or other
credential material. The migration repeats the important safety checks itself:
unknown roles, empty local-parts, and duplicate candidates raise an exception
before the new constraints are created.

## Compatibility

The active Auth.js Credentials flow remains email/password based and continues
to use bcrypt and JWT sessions. The required representation updates are:

- Prisma and runtime role comparisons use `UserRole.ADMIN` / `ADMIN`;
- the session type accepts the target enum values while retaining the existing
  empty-role invalidation sentinel;
- `src/auth.ts` still updates `lastLoginAt` after valid credentials;
- `scripts/create-admin.mjs` accepts an optional username, derives the same
  deterministic default when omitted, and creates `ADMIN`/`ACTIVE` rows;
- the local Phase 6S fixture now includes `username`, `status`, and uppercase
  enum values.

No new user-management UI, mutation action, reset flow, temporary password,
mail delivery, or authorization policy was added. Existing legacy reset/session
tables remain mapped and untouched.

## Validation

Completed checks:

- Prisma schema validation: root and production schemas pass.
- Prisma Client generation: pass.
- TypeScript no-emit check: pass.
- ESLint: pass.
- Auth security static verification: 22 assertions pass; no network or database writes; live E2E environment unavailable.
- Read-only database verification: pass; PostgreSQL `public` schema and existing dashboard data checks pass.
- Read-only user inspection: pass; role, credential-presence, timestamp, reset-token, session, and collision checks are clean.
- Production `prisma migrate status --schema prisma/production/schema.prisma`: read-only connection pass; the Phase 2 migration is detected as pending (exit 1 is expected while unapplied).
- Canonical production migration preflight: `PASS`, `databaseWrites: 0`,
  deploy/resolve `NOT RUN`, with the exact username backfill recorded as the
  only controlled data operation; approval gate remains `REVIEW_REQUIRED`.

The migration itself is validated as an artifact and is pending deployment; a
post-migration schema verification is therefore not claimed here.

## Documentation

The active documentation was synchronized in:

- [`AUTH_IMPLEMENTATION.md`](./AUTH_IMPLEMENTATION.md), for the current `ADMIN`
  representation and Phase 2 model boundary;
- [`DATABASE_MIGRATION.md`](./DATABASE_MIGRATION.md), for migration-history and
  deployment guidance;
- [`PHASE1_AUTH_USER_AUDIT_2026-09-08.md`](./PHASE1_AUTH_USER_AUDIT_2026-09-08.md),
  which remains the preceding audit baseline.

Historical reports retain their original findings and are not rewritten as
current implementation contracts.

## Limitations

- The live database is still pre-Phase-2 until an approved migration deployment.
- `DISABLED` is a stored state only; login enforcement is not part of this phase.
- Audit rows are structurally supported but no application event writer exists.
- There is no last-admin invariant or user-deletion workflow yet.
- Last-admin protection is data-model preparation in Phase 2; enforcement is
  deferred to the authorization/operations phases.
- The current role distribution has no `USER` row, so that mapping is tested by
  migration logic rather than observed in the inspected database.

## Deferred

User Management UI, server actions/API mutations, status enforcement, role and
last-admin invariants, audit-event emission, reset-flow decisions, and post-
migration production verification belong to a separately approved phase.

## Recommendation

Approve the migration artifact for review. Before production deployment, run
the canonical production preflight, take the required backup/change-window
steps, review the pending SQL, and apply it only with the production schema
path explicitly selected. After deployment, verify the user count, unique
username count, role/status distribution, foreign keys, and dashboard/Auth.js
smoke checks. Do not use the root migration history for the Supabase production
target.
