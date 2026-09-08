# SUPABASE -> LOCAL POSTGRESQL MIGRATION REHEARSAL

Project: PKL PLN Jeranjang / Dashboard Energi Primer  
Date: 2026-09-08  
Final status: PASS_WITH_REVIEW

## Executive Summary

The Production Supabase target was inspected read-only, a protected custom
PostgreSQL logical snapshot of the public schema was created, and the snapshot
was restored into a disposable local PostgreSQL cluster. The migration
20260908120000_add_user_management_data_model was then applied successfully
only to the local database.

Schema, enum, index, constraint, foreign-key, migration-history, and
data-preservation checks passed. Prisma generation, TypeScript, lint, Next.js
build, and the focused disposable Phase 2-10 validation also passed.

This is migration rehearsal evidence only. No Supabase Production migration,
write, application mutation, cron, or sync was performed.

## Environment

- Repository: energiprimer-next
- Branch: preview-production-latest
- Commit SHA: 958a83518fe18ea7ccc357a5e2790d39ff400828
- Prisma CLI / client: 6.19.3 / 6.19.3
- Node.js: 24.17.0
- Snapshot client: pg_dump 18.4
- Source PostgreSQL: Supabase Production, PostgreSQL 17.6, Direct TLS port 5432
- Local target PostgreSQL: 18.4
- Local target: 127.0.0.1:55432,
  energiprimer_migration_rehearsal
- Documentation sync policy:
  #-PROJECT-DOCUMENTATION-SYNC-POLICY.txt = NOT FOUND

The working tree contained pre-existing documentation and untracked artifact
changes. No source, Prisma schema, migration, application, or configuration
change was made for this rehearsal.

## Snapshot

- Method: equivalent PostgreSQL logical dump using pg_dump
- Command class: custom format, public schema, schema and data
- Options: no-owner, no-privileges
- Source target: Supabase Production project EnergiPrimer,
  reference sreumdkeifkcqmakrfnc
- Reference: REHEARSAL-20260908-203041-WITA
- Start: 2026-09-08 20:30:41 +08:00
- End: 2026-09-08 20:30:48 +08:00
- Artifact size: 398230 bytes
- SHA-256:
  549CEA8F55127F6F377EAD035E9E6B7EE4A69937EF9F8CDA32E800754B55B11A
- Scope: public schema logical snapshot only
- Format validation: pg_restore table-of-contents PASS, 255 entries
- Storage classification: external LocalAppData directory, user-only ACL,
  EFS encryption PASS, not Git tracked

The Supabase CLI 2.117.0 was verified, but its db dump path requires Docker or
Podman, which were unavailable. The phase explicitly permits an equivalent
PostgreSQL logical dump, so pg_dump 18.4 was used without changing the source
or migration artifact.

The snapshot contained Production data, including sensitive fields. It was
handled only inside the protected disposable workflow, was not printed, was
not used by the application, and was not published. The raw snapshot is
scheduled for cleanup after evidence capture.

## Production Preflight

Production access was limited to read-only metadata, aggregate counts, and
logical dump:

- Database: postgres
- Server version: PostgreSQL 17.6
- Server port: 5432
- Time zone: UTC
- Migration history: one finished baseline migration,
  20260901130000_production_schema_baseline
- Baseline checksum:
  f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c
- Target migration:
  20260908120000_add_user_management_data_model = pending
- Production relevant tables before migration: users and _prisma_migrations
- Production users row count: 1
- Production role aggregate: admin = 1
- Production target enums and user_audit_logs table: absent before migration

No INSERT, UPDATE, DELETE, TRUNCATE, ALTER, CREATE, DROP, GRANT, REVOKE,
migration, application mutation, cron, or sync command was sent to Production.

## Local Restore

- Restore target: disposable local PostgreSQL only
- Host/port: 127.0.0.1:55432
- Database: energiprimer_migration_rehearsal
- Local server version: PostgreSQL 18.4
- First restore attempt: stopped because the empty database already had
  schema public while the dump contained CREATE SCHEMA public
- Corrective retry: pg_restore with clean and if-exists, local target only
- Final restore result: PASS
- Local target guard: PASS; database and port were verified programmatically
- Dump table-of-contents: readable, 255 entries

The restore was never directed at Supabase Production.

## Baseline Data Counts

Before local migration, the restored database contained:

- users: 1 row
- role aggregate: admin = 1
- _prisma_migrations: 1 finished baseline row
- users schema: legacy columns only; no username or status
- audit rows: audit table absent

An internal aggregate digest comparison was used for sensitive fields without
printing values.

## Migration Rehearsal

- Target guard: local 127.0.0.1:55432 only
- Command: npx prisma migrate deploy
  --schema=prisma/production/schema.prisma
- Start: 2026-09-08 20:33:36 WITA
- End: 2026-09-08 20:33:38 WITA
- Exit code: 0
- Result: migration applied successfully
- Migration history after execution: baseline and target both finished
- Target migration checksum in local history matched the approved artifact

Migration artifact SHA-256:
C1EC53D7A1C41A8FC587EE0BA683E79AD86A54B10D13DA5EFFD2861A0416004E

The root and production migration copies were unchanged and hash-identical.

## Post-Migration Verification

### Enums

- UserRole: ADMIN, USER
- UserStatus: ACTIVE, DISABLED
- UserAuditAction: USER_CREATED, USER_UPDATED, PASSWORD_RESET,
  ROLE_CHANGED, USER_ENABLED, USER_DISABLED

### users

- username: text, NOT NULL
- status: UserStatus, NOT NULL, default ACTIVE
- role: UserRole, NOT NULL, default ADMIN
- users_username_key: unique index present
- existing primary key, email unique index, and role index preserved

### UserAuditLog

- user_audit_logs table exists
- actor_user_id and target_user_id are NOT NULL bigint foreign keys
- action is UserAuditAction
- metadata is jsonb
- created_at is NOT NULL with current-timestamp default
- actor, target, and created-at indexes present
- actor and target foreign keys use ON DELETE RESTRICT and ON UPDATE CASCADE
- audit row count after schema migration: 0

### Migration history

- baseline migration: finished
- user-management migration: finished
- rolled-back state: false
- failed migration state: none observed

## Data Preservation

Production pre-snapshot aggregate versus local post-migration aggregate:

- row count: MATCH
- minimum and maximum existing IDs: MATCH
- non-null email count: MATCH
- distinct email count: MATCH
- password-presence count: MATCH
- sensitive-field aggregate digest: MATCH
- existing role mapping: admin -> ADMIN
- status default: ACTIVE
- username backfill policy: matching count 1, null username count 0
- duplicate username result: none
- audit rows created implicitly by migration: none

No password hash, email value, token, or other sensitive record value was
included in this report.

## Application Validation

- Prisma generate: PASS
- TypeScript no-emit: PASS
- ESLint: PASS
- Next.js build: PASS
- Next.js version: 16.3.3
- Static pages generated: 17/17
- Focused disposable Phase 2-10 validation: PASS
- Disposable validation reported productionMutation=false and
  productionUserRead=false
- Optional local browser validation: NOT RUN

The build used process-local database environment overrides pointing at the
disposable database. .env.local was not modified.

## Security

- Supabase Production was read-only throughout.
- No Production migration was executed.
- No Production user, auth, session, audit, cron, or sync mutation occurred.
- No credential, password, password hash, token, cookie, JWT, private key, or
  service-role key was logged.
- The snapshot and local cluster were stored outside the repository with
  user-only ACL and EFS encryption.
- The snapshot was not committed or uploaded.
- The disposable cluster and raw snapshot are to be stopped and removed after
  evidence capture.

## Documentation Sync

Inspected documentation included Phase 2, Phase 10, Phase 10R, Production
Migration Gate, Production Migration Gate rerun, Phase 6V direct Supabase
verification, database migration/readiness documents, Supabase runbooks,
AUTH_IMPLEMENTATION.md, and AGENT_CONTEXT.md.

Updated:

- docs/AUTH_IMPLEMENTATION.md
- docs/AGENT_CONTEXT.md
- docs/PRODUCTION_MIGRATION_GATE_2026-09-08.md

Created:

- docs/PRODUCTION_LOCAL_MIGRATION_REHEARSAL_2026-09-08.md

Historical migration and Phase 10R reports were preserved.

## Known Limitations

- The snapshot scope is public schema only; Supabase-managed schemas such as
  auth/storage were not included.
- PostgreSQL local rehearsal used major version 18.4 versus Production 17.6.
- Optional browser validation was not run against the local restored database.
- The raw Production snapshot was not sanitized because the application was
  not run against it; it remained protected and disposable.
- Supabase CLI db dump could not run without Docker/Podman; equivalent pg_dump
  was used as explicitly allowed by this gate.
- This rehearsal does not prove Production migration safety by itself.
- Production backup retention and Production change-window approval remain
  separate decisions.

## Final Decision

MIGRATION REHEARSAL = PASS_WITH_REVIEW

Production Migration = NOT PERFORMED

Production Migration Gate = NOT READY

The rehearsal is usable evidence for a future controlled Production Migration
Gate, subject to review of the limitations above, a current Production
read-only preflight, an approved recoverable backup/reference, and explicit
authorization for any Production mutation. No Production mutation is
authorized by this report.
