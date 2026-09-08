# Production Migration Gate — Final Report

Date: 2026-09-08  
Project: PKL PLN Jeranjang / Dashboard EnergiPrimer

## Final status

`PASS_WITH_REVIEW`

The authorized Production migration completed successfully and all required
post-migration integrity checks passed. The review item is Production
recovery coverage: Supabase Free has no managed automatic backup/PITR, and no
retained Production backup is claimed in this report.

## 1. Evidence and authorization

- Phase 10: `VERIFIED`
- Phase 10R / 10R-V2: `VERIFIED`
- Local Migration Rehearsal: `PASS_WITH_REVIEW`
- Migration: `20260908120000_add_user_management_data_model`
- Approved SHA-256:
  `C1EC53D7A1C41A8FC587EE0BA683E79AD86A54B10D13DA5EFFD2861A0416004E`
- Explicit Production authorization: received before mutation

## 2. Production target and preflight

The final preflight was read-only and passed immediately before migration:

- Supabase project: `EnergiPrimer`, ref `sreumdkeifkcqmakrfnc`
- Region/status: `ap-southeast-1` / `ACTIVE_HEALTHY`
- Database/schema: `postgres` / `public`
- Direct port: `5432`
- PostgreSQL/time zone: `17.6` / `UTC`
- Root and Production migration artifact hashes matched the approved SHA-256.
- `_prisma_migrations` contained one finished baseline migration and no
  failed or rolled-back migration.
- The target migration was pending before execution.
- Pre-migration `users` schema, indexes, primary key, target-object absence,
  and existing one-row data baseline matched the rehearsal.

## 3. Production migration

Only the authorized command was executed:

`npx prisma migrate deploy --schema=prisma/production/schema.prisma`

Result:

- Exit code: `0`
- Target migration: applied successfully
- No reset, db push, manual DDL, unrelated DML, user mutation, cron, or sync
  command was executed.

## 4. Post-migration read-only verification

All checks passed:

- Migration history: two finished migrations, zero failed/rolled-back rows.
- Target migration checksum matched the approved SHA-256.
- Enums:
  - `UserRole`: `ADMIN`, `USER`
  - `UserStatus`: `ACTIVE`, `DISABLED`
  - `UserAuditAction`: `USER_CREATED`, `USER_UPDATED`,
    `PASSWORD_RESET`, `ROLE_CHANGED`, `USER_ENABLED`, `USER_DISABLED`
- `users.username`, `users.status`, and `users.role` exist with the expected
  types, required constraints, and defaults.
- Existing user indexes plus `users_username_key` are present.
- `user_audit_logs` exists with the expected columns and primary key.
- Audit indexes are present.
- Both audit foreign keys use `ON DELETE RESTRICT` and
  `ON UPDATE CASCADE`.
- Existing user data invariants passed: one existing row retained, legacy
  required fields remain populated, role/status mapping is valid, and the
  deterministic username backfill matched the documented rule.
- Audit row count is zero; no unexpected audit data was created.
- No unexpected data loss was detected by the read-only aggregate checks.

No credential, password, token, JWT, cookie, private key, or secret was
recorded in this report.

## 5. Recovery review and limitation

- Supabase Free does not provide managed automatic backup/PITR.
- The local logical snapshot rehearsal succeeded and was restored to a
  disposable local PostgreSQL instance.
- The rehearsal snapshot and disposable restore were temporary evidence and
  were cleaned up; they are not a retained Production backup.
- Production recovery remains a review item for future change windows.

No Production backup is claimed as available.

## Final gate result

`Production Migration Gate = PASS_WITH_REVIEW`  
`Production Migration = APPLIED AND VERIFIED`  
`Production Mutation Gate = CLOSED FOR THIS CHANGE`
