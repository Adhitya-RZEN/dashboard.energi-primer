# PRODUCTION BACKUP PRE-MIGRATION GATE

Project: PKL PLN Jeranjang / Dashboard Energi Primer  
Date: 2026-09-08  
Status: BLOCKED

## 1. Objective

The objective was to create and verify a logical backup of the Production
Supabase database before a separate Production Migration Gate.

This phase did not run a migration, schema modification, application
mutation, cron, or synchronization.

Baseline references:

- Verified application source SHA:
  958a83518fe18ea7ccc357a5e2790d39ff400828
- Migration ID:
  20260908120000_add_user_management_data_model
- Migration artifact SHA-256:
  C1EC53D7A1C41A8FC587EE0BA683E79AD86A54B10D13DA5EFFD2861A0416004E

## 2. Environment

- Provider: Supabase, as specified by the phase brief
- Plan: Free Plan, as specified by the phase brief
- Environment: PRODUCTION, confirmed by repository evidence and Supabase
  project metadata
- Supabase CLI: 2.117.0 verified

The canonical backup command was started, but Supabase CLI failed before
invoking pg_dump because Docker and Podman are not available on PATH. No
arbitrary replacement such as npx, direct pg_dump, Prisma, or a custom script
was used.

## 3. Target Confirmation

- Project reference: sreumdkeifkcqmakrfnc
- Database identity: db.sreumdkeifkcqmakrfnc.supabase.co
- Connection mode: Supabase Direct PostgreSQL TLS, port 5432
- Target confirmation: PASS

The Supabase CLI project list matched project EnergiPrimer, the reference
above, region ap-southeast-1, and ACTIVE_HEALTHY status. Repository Phase 6V
evidence identifies SUPABASE_DIRECT_URL on port 5432 as the Production
migration endpoint. No credential value was printed. The local .env.local
file is Git-ignored.

## 4. Backup

- Method: supabase db dump --schema public attempted
- Start: 2026-09-08 20:14:18 +08:00
- End: 2026-09-08 20:14:19 +08:00
- Scope: public schema logical backup; schema and data-only components
- Artifact: production-public-schema.sql, failed partial artifact
- Size: 0 bytes
- SHA-256: E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855
- Reference: NOT VALIDATED; failed attempt directory
  BACKUP-20260908-201354-WITA

The schema dump exited with code 1 before pg_dump could run:
Docker and Podman were not found. The data-only component was not attempted
after this failure. The zero-byte partial artifact was preserved and is not a
valid backup.

## 5. Backup Integrity

- File exists: YES, but zero-byte failed partial
- Readable: YES, zero bytes only
- Format: NOT VALID
- Content sanity: NOT RUN
- Completeness: NOT RUN

No user data or raw database records were printed.

## 6. Recovery Validation

- Restore target: NONE
- Disposable environment: NOT CREATED
- Restore result: NOT RUN
- Schema verification: NOT RUN
- Cleanup: NOT APPLICABLE

Recovery confirmation cannot be claimed because no logical dump was created.

## 7. Secure Storage

- Location: C:\Users\ADVAN\AppData\Local\PKL-PLN-Jeranjang\production-backups\BACKUP-20260908-201354-WITA
- Access: user-only ACL PASS; EFS encryption PASS
- Git tracked: NO; location is outside the repository
- Retention: local operator-managed location; no valid backup retained

The protected directory was created before the dump. It contains only the
failed zero-byte partial artifact from this attempt.

## 8. Production Safety

- Production mutation: NONE
- Migration: NONE
- Cron: NONE
- Sync: NONE
- Application mutation: NONE
- User, password, role, status, and audit operations: NONE

The database was not connected to or modified during this phase.

## 9. Known Limitations

- Docker and Podman are not installed or available on PATH. Supabase CLI
  2.117.0 requires one of them for db dump.
- The target was confirmed, but the canonical dump failed before pg_dump.
- No valid backup artifact, backup reference, or restore evidence exists.
- The schema-only default was explicitly inspected; a data-only dump was not
  attempted after the schema component failed.
- The repository documentation sync policy file
  #-PROJECT-DOCUMENTATION-SYNC-POLICY.txt was NOT FOUND.
- This phase did not substitute another backup tool or infer backup
  availability from Vercel, Supabase plan metadata, or environment variables.

## 10. Final Status

Production Backup Gate = BLOCKED

Production Migration Gate = NOT READY

Production Migration = NOT PERFORMED

The next safe action is to provide Docker Desktop or Podman in the approved
execution environment, then rerun the canonical Supabase CLI dump from target
confirmation. Do not use direct pg_dump as an undocumented replacement. Only
after a real schema and data logical dump, artifact integrity verification,
secure storage, and adequate disposable restore evidence may the backup gate
be considered for VERIFIED or PASS_WITH_REVIEW.

## Rerun verification - 2026-09-08

The Supabase CLI is now available at version 2.117.0. The first version check
required local CLI profile/telemetry filesystem access and then completed
successfully.

Target metadata inspection was read-only. The CLI project listing returned
project EnergiPrimer with reference sreumdkeifkcqmakrfnc, region
ap-southeast-1, and ACTIVE_HEALTHY status. The local secure configuration has
the following sanitized connection shapes:

- Direct endpoint: host db.sreumdkeifkcqmakrfnc.supabase.co, port 5432
- Pooler endpoint: host aws-0-ap-southeast-1.pooler.supabase.com, port 6543
- Connection mode intended for backup: Supabase Direct PostgreSQL

Repository Phase 6V evidence identifies the Direct 5432 endpoint as the
Production migration endpoint. The target confirmation therefore passed
without printing any credential value.

The canonical supabase db dump --schema public command was attempted and
exited with code 1 before pg_dump because Docker and Podman were unavailable.
The preserved partial schema artifact is zero bytes with SHA-256
E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855. The
data-only dump was not attempted after the schema failure. The external
directory has user-only ACL and EFS encryption, but it contains no valid
backup and no recovery evidence.

Current rerun decision:

Production Backup Gate = BLOCKED

No valid Production logical backup or disposable restore exists. Migration,
application mutation, database mutation, cron, and sync remain NOT PERFORMED.
