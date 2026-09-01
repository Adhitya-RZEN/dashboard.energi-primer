# Phase 21 — PostgreSQL Local to Supabase Migration

Date: 2026-09-01  
Status: **BLOCKED**  
Blocked gate: **B0 — Supabase preflight**  
Scope: read-only preflight and migration readiness evidence only

## Executive summary

Phase 21 did not migrate the database. Both Supabase target URL variables are
configured locally with a valid non-secret URL shape, but authentication failed
for both the Direct Connection and Transaction Pooler before target metadata
could be read. The mandatory B0 preflight therefore cannot pass. No schema
write, business-data write, migration execution, application cutover,
deployment, sync, authentication test, or mail test was performed.

The local PostgreSQL source was inspected read-only and remains unchanged. A
local SQL backup artifact exists, but a restore rehearsal and independent
backup verification have not been completed. The migration is therefore not
ready to proceed.

## Safety evidence

| Operation | Result |
| --- | --- |
| Local PostgreSQL INSERT/UPDATE/DELETE | 0 executed |
| Local schema change | 0 executed |
| `prisma migrate` / `prisma db push` / reset | 0 executed |
| Supabase read-only connection probe | Direct authentication failed; Pooler metadata read; no writes |
| Supabase schema write | 0 executed |
| Supabase business-data write | 0 executed |
| Application `DATABASE_URL` change | Not performed |
| Google Sheets sync/import | Not performed |
| Deployment/cutover | Not performed |
| `BIOMASS_STOCK` | Remains outside schema/application scope |

## Gate status

| Gate | Scope | Status | Reason |
| --- | --- | --- | --- |
| B0 | Supabase access, SSL, target state, and backup readiness | **BLOCKED** | Direct and pooler authentication failed before metadata could be read; target state cannot be verified |
| B1 | Schema/migration history on Supabase | NOT EXECUTED | B0 did not pass |
| B2 | Controlled business-data migration | NOT EXECUTED | B0 and B1 did not pass |
| B3 | Source/target parity | NOT EXECUTED | No target exists in the evidence set |
| B4 | Application read-only validation/cutover | NOT EXECUTED | No `DATABASE_URL` change is authorized or performed |

### B0 checklist

| Check | Result |
| --- | --- |
| Approved Supabase project identified | PARTIAL — endpoint shapes detected; project metadata not readable |
| Direct target connection available | FAIL — `AUTHENTICATION_FAILED` |
| Transaction pooler connection available | FAIL — `AUTHENTICATION_FAILED` |
| Authentication succeeds | **FAIL** |
| TLS/SSL enforced | NOT VERIFIED — authentication failed before server metadata |
| Database/schema/version/extensions inspected | NOT VERIFIED |
| Roles/permissions inspected | NOT VERIFIED |
| Target empty or explicitly approved for controlled migration | NOT VERIFIED |
| Source backup independently verified | **BACKUP_VERIFICATION_REQUIRED** |
| Local source read-only baseline available | PASS |

The app currently reads `DATABASE_URL` for Prisma. `SUPABASE_DIRECT_URL` and
`SUPABASE_POOLER_URL` are present in `.env.local`, while `DATABASE_URL` remains
classified as a local loopback endpoint. Secret values are intentionally not
included here.

## Supabase connection probe

The probe used the configured variables through Prisma's temporary
`datasourceUrl` override and executed only fixed `SELECT` statements. It did
not change the process-wide `DATABASE_URL` and did not execute DDL or DML.

| Endpoint | URL shape | SSL parameter | Connection | Metadata |
| --- | --- | --- | --- | --- |
| Direct | `postgresql`, port 5432, username/password present | `require` | **FAIL — AUTHENTICATION_FAILED** | Not available |
| Transaction Pooler | `postgresql`, port 6543, username/password present | `require` | **FAIL — AUTHENTICATION_FAILED** | Not available |
| Local `DATABASE_URL` | Existing local endpoint | Not set in URL | PASS | PostgreSQL 18.4, database `dashboard_pln`, schema `public` |

The failure category is sanitized; no password, URL, or raw provider error was
recorded. The most likely next check is to re-copy the database password and
connection strings from the approved Supabase Connect panel into the local
secret store, ensuring special characters are URL-encoded. This is an
operator-side configuration action, not an automatic credential change.

Supabase documents Direct Connection on port 5432 for migrations/backup and
Shared Pooler transaction mode on port 6543 for transient/serverless
application traffic; transaction mode also requires a client configuration
that avoids named prepared statements. See the
[Supabase connection modes documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Requested B0 result

| Check | Result |
| --- | --- |
| Direct Connection | **FAIL** — sanitized `AUTHENTICATION_FAILED` |
| Transaction Pooler | **FAIL** — sanitized `AUTHENTICATION_FAILED` |
| SSL | **NOT VERIFIED** — both target connections failed before server metadata; URL shape requests `sslmode=require` |
| PostgreSQL target version | **NOT VERIFIED** |
| Target authentication | **FAIL** |
| Target public schema | **NOT VERIFIED** |
| Existing target tables | **NOT VERIFIED** |
| Existing target business data | **NOT VERIFIED** |
| Target Prisma migration table | **NOT VERIFIED** |
| Target empty | **NOT VERIFIED**; do not assume empty |
| Prisma compatibility | **NOT VERIFIED for target**; local Prisma schema validation PASS |
| Local `DATABASE_URL` | **UNCHANGED** |
| Local database writes | **0** |
| Supabase writes | **0** |

Because target authentication failed, the safe conclusion is `BLOCKED`, not
`READY_FOR_SCHEMA_MIGRATION` and not a claim that the target is empty.

## Local source baseline (read-only)

The following values are evidence from the local source and are not a
Supabase parity result:

| Area | Observed value |
| --- | ---: |
| Units | 3 (`Unit 1`, `Unit 2`, `Unit 3`) |
| Coal quality rows | 1,095 |
| Coal consumption rows | 1,731 |
| Coal stock rows | 577 |
| Power generation rows | 1,095 |
| KPI target rows | 1,095 |
| Spreadsheet import runs | 12 |
| Spreadsheet staging rows | 3,919 |
| Biomass receipt rows | 49 |
| Biomass consumption rows | 636 |
| Coal receipt rows | 7 |
| Solar receipt rows | 7 |
| Solar consumption rows | 212 |
| HOP rows | 636 |
| Biomass target rows | 1 |
| Biomass cumulative snapshots | 7 |
| Sync worksheets | 199 |
| Active sync worksheets | 7 |
| Sync row states | 2,409 |
| Open schema changes | 0 |
| Active sync leases | 0 |

The read-only overview check passed for July 2026 with the approved Biomassa
target of 70,020 ton, Unit 1–3 daily values, and a populated 31-day series.
The expected historical scope remains January–July 2026 with the approved
canonical worksheet policy.

## Backup evidence

The following artifact was found locally:

- Relative path: `excels/dump-dashboard_pln-202608311006.sql`
- Size: 232,032 bytes
- SHA-256: `D1F9AFF3B48DD10283F5239BB79C1CB711082D09E9EC8B6772F9E4C7E9EAACD1`
- Structural scan: 32 `CREATE TABLE` markers, 21 `CREATE INDEX` markers, 32
  `COPY` markers, and 170 `ALTER TABLE` markers
- Secret-marker scan: no `DATABASE_URL`, `AUTH_SECRET`, or `PRIVATE KEY`
  marker was found; this is not a substitute for a controlled secret review

The file is inside the application directory and has not been restored into a
disposable database. It must be copied to protected operator storage and
verified there before migration. The repository now ignores
`excels/dump-*.sql`; the existing file was not deleted or moved by this phase.

## Migration contract review

The repository contains a no-op baseline marker for the existing Laravel
schema and four additive migration files dated 2026-08-30. Static inspection
found table/index creation and additive alterations only. No migration command
was run. The Prisma schema remains PostgreSQL-based and includes `BigInt`,
`Decimal`, `Date`, timestamps, foreign keys, indexes, and unique constraints.

The existing application uses a Prisma singleton and server-side database
access. No schema change or new migration was created for Phase 21.

## Read-only verification results

| Check | Result | Note |
| --- | --- | --- |
| Prisma schema validation with `.env.local` | PASS | Schema parsed successfully |
| Local DB connectivity and baseline | PASS | Read-only `db:verify` |
| Import schema verification | PASS when invoked with `.env.local` | Existing npm wrapper does not load `.env.local` and fails before connecting |
| Import data verifier | FAIL / REVIEW | Existing expectation is 7 biomass receipt rows; source currently has 49; no write occurred |
| Overview PostgreSQL verification | PASS | KPI and 31-day July series populated |
| Sync registry state | PASS | 199 worksheets, 2,409 row states, no open changes/leases |
| Schema-detection verification | PASS | Review routing checks pass |
| Automatic BB admission verification | PASS | Canonical schema/future worksheet safeguards pass |
| Historical registry audit | FAIL_READ_ONLY_AUDIT | Error category `api`; `databaseWrites: 0`, importer/migration not called |
| Auth security verification | PASS | No DB writes/network requests |
| Supabase B0 read-only probe | BLOCKED | Both endpoints returned sanitized `AUTHENTICATION_FAILED`; no target metadata read |
| Backup metadata scan | PARTIAL | Artifact/hash found; no restore rehearsal |

The two verifier warnings are read-only/tooling findings and were not
corrected by changing business data during this phase.

## Manual actions required before continuing

1. Re-copy and validate the approved Supabase database password and both
   connection strings through an operator-controlled secret manager or local
   shell. Do not paste the connection string, password, or tokens into chat,
   source code, or docs.
2. Verify the target is empty or obtain explicit approval for its current
   contents. An unexpected non-empty target must stop the migration.
3. Verify TLS, database version, schema, extensions, roles, permissions, and
   connection mode. Decide direct administrative connection versus pooler for
   Vercel separately.
4. Move/copy the backup to protected operator storage, calculate and record
   its checksum there, and perform a restore rehearsal into a disposable
   database. Confirm the approved baseline including Unit 1–3 and target
   70,020 ton.
5. Request explicit approval before the first Supabase schema write.
6. Request separate explicit approval before the first Supabase business-data
   write.
7. Keep the application on the local `DATABASE_URL` until B0–B3 pass and a
   separate cutover approval is issued.

## Final decision

**BLOCKED — DO NOT PROCEED TO SUPABASE SCHEMA OR DATA MIGRATION.**

The next safe action is to configure the approved target out-of-band and rerun
Gate B0. This report does not authorize a Supabase write or application
cutover.

## Files changed by this phase

- `.gitignore` — added a targeted ignore rule for local SQL dump filenames.
- `.env.example` — documented blank operator-only Supabase preflight variables.
- `docs/SUPABASE_MIGRATION_EXECUTION_REPORT_2026-09-01.md` — this report.
- `scripts/verify-supabase-b0.ts` — sanitized, SELECT-only B0 verifier.
- `docs/SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md` — recorded B0 blocker and
  current execution state.
- `docs/PRODUCTION_ROLLBACK_RUNBOOK.md` — recorded that Phase 21 did not
  execute a cutover or require rollback.

No database, Prisma schema, application environment value, Google Sheet,
Supabase project, or production deployment was changed.

## Gate B0 rerun update — 2026-09-01

This addendum supersedes the earlier B0 endpoint result above. The rerun
remained read-only and executed no DDL or DML.

| Check | Result |
| --- | --- |
| Direct Connection | **FAIL** — sanitized `AUTHENTICATION_FAILED` |
| Transaction Pooler | **PASS** for read-only metadata using an in-memory `pgbouncer=true` compatibility probe |
| Pooler SSL | **FAIL for Gate B0** — server-side SSL probe returned `false`; URL requested `sslmode=require` |
| Target PostgreSQL | **PASS** through Pooler: 17.6 |
| Target database / role / schema | `postgres` / `postgres` / `public` |
| Public application tables | **0** |
| Public business data | **NO** |
| Public `_prisma_migrations` | **NO** |
| Supabase-managed objects | **PRESENT**: 35 tables, 3 views, 2 sequences, 114 indexes, 98 functions |
| Target literal emptiness | **NO** — managed platform objects exist; application schema is empty |
| Local `DATABASE_URL` | **UNCHANGED** |
| Local writes | **0** |
| Supabase writes | **0** |

The managed tables are in `auth`, `realtime`, `storage`, and `vault`; they
were not treated as application business tables and were not modified. No
unexpected application table or business row was found in `public`.

The configured Pooler URL does not contain `pgbouncer`. An exact-URL rerun
returned a sanitized Prisma `P2010` error after the first probe, while adding
`pgbouncer=true` only in memory succeeded. The environment file was not
changed. This configuration requires operator review before any application
connection is approved.

## Gate B0 decision

**BLOCKED** — Direct authentication is not verified and Pooler SSL is not
verified. Do not proceed to B1, schema migration, data migration, import,
cutover, or deployment. The public application schema appears empty, but the
database is not literally empty because Supabase-managed objects are present.

## Gate B0 rerun update 2 — 2026-09-01

This update supersedes the previous rerun addendum. The latest probe remained
read-only and performed no DDL or DML.

| Check | Result |
| --- | --- |
| Direct Connection | **PASS** |
| Direct SSL | **PASS** via PostgreSQL SSL metadata |
| Transaction Pooler | **PASS** |
| Pooler SSL transport | **PASS** via PostgreSQL SSLRequest/TLS handshake, TLS 1.3; certificate authorization was not accepted by the local Node trust store |
| Pooler backend SSL field | `false`; recorded separately because the Pooler mediates the client transport |
| Authentication | **PASS** for both endpoints |
| PostgreSQL target | **PASS** — 17.6 |
| Database / role / schema | `postgres` / `postgres` / `public` |
| `public` schema privileges | **PASS** — CONNECT, USAGE, and CREATE for current role |
| Public application tables | **0** |
| Public business data | **NO** |
| Public `_prisma_migrations` | **NO** |
| Supabase-managed objects | **PRESENT** — expected platform schemas only |
| Target literal emptiness | **NO** — managed platform objects exist |
| Public application schema empty | **YES** |
| Local `DATABASE_URL` | **UNCHANGED** |
| Local database writes | **0** |
| Supabase writes | **0** |

The target exposes PostgreSQL 17.6 while the local source reports PostgreSQL
18.4. Static comparison against `prisma/schema.prisma` found standard
PostgreSQL-compatible types and constraints only; Prisma schema validation is
PASS. No migration dry-run or migration command was executed. The target has
no application object in `public` that could be overwritten. Managed
`auth`, `realtime`, `storage`, and `vault` objects were not altered.

The configured Pooler URL still omits `pgbouncer`. A compatibility probe with
`pgbouncer=true` was used only in memory and succeeded; `.env.local` was not
changed. Operator review remains required before using the Pooler in the
application.

## Updated Gate B0 decision

**BLOCKED** — connectivity and target application emptiness are now verified,
but the Pooler certificate chain is not independently trusted by the local
Node trust store and the Pooler Prisma compatibility setting is not present
in the configured URL. Do not proceed to B1, schema migration, data
migration, import, cutover, or deployment until these operator-side checks
are explicitly resolved.

## Gate B0 final rerun — 2026-09-01

The final B0 verification remained read-only. No DDL, DML, migration, import,
or configuration write was performed.

| Check | Result |
| --- | --- |
| Direct Connection | **PASS** |
| Transaction Pooler | **PASS** |
| Direct SSL | **PASS** — server SSL metadata and in-memory `sslmode=verify-full` probe |
| Pooler SSL transport/certificate | **PASS** — PostgreSQL SSLRequest/TLS 1.3 and in-memory `sslmode=verify-full` probe |
| Authentication | **PASS** for both endpoints |
| PostgreSQL target | **PASS** — 17.6 |
| Database / role / schema | `postgres` / `postgres` / `public` |
| `public` schema privileges | **PASS** — CONNECT, USAGE, and CREATE |
| Public application tables | **0** |
| Public business data | **NO** |
| Public `_prisma_migrations` | **NO** |
| Existing target objects | **YES**, but only expected Supabase-managed schemas (`auth`, `realtime`, `storage`, `vault`) |
| Target literal emptiness | **NO** — managed platform objects are present |
| Public application schema empty | **YES** |
| Existing application data collision | **NO** detected |
| Local `DATABASE_URL` | **UNCHANGED** |
| Local database writes | **0** |
| Supabase writes | **0** |

`SUPABASE_NOT_EMPTY` was not triggered for unexpected application content:
the non-public objects are standard Supabase platform objects and no business
table or business row exists in `public`. They were not altered.

The target PostgreSQL version is 17.6 and the local source is 18.4. Static
comparison with `prisma/schema.prisma` passed for the PostgreSQL provider,
BigInt, Decimal, Date/Timestamp, indexes, unique constraints, and foreign-key
features used by the application. No migration command or dry-run was run.

The configured Pooler URL still omits `pgbouncer`. A Pooler compatibility
probe with `pgbouncer=true` and `sslmode=verify-full` succeeded only in
memory. This remains an application/Vercel configuration warning and was not
changed during B0.

## Final Gate B0 decision

**PASS — READY_FOR_SCHEMA_MIGRATION**

This status authorizes only readiness to consider the next phase. Per the
requested stop condition, B1, schema migration, data migration, import,
cutover, and deployment were not executed and require separate manual
approval.

## Phase 21B — Gate B1 schema migration preflight — 2026-09-01

Gate B1 was **BLOCKED before execution**. The required `prisma migrate
deploy` command was not run because the target does not contain the existing
Laravel application schema assumed by the project's no-op baseline migration.

### Migration inventory

| Item | Result |
| --- | --- |
| Migration count | 5 directories |
| Migration history on local source | 5 applied, no rollback, baseline applied with 0 steps |
| Destructive SQL found | None; `ON UPDATE CASCADE` foreign-key clauses are non-destructive |
| Enums | 0 |
| Extensions created by migrations | 0 |
| Additive tables in migrations | 15 |
| Additive indexes in migrations | 26 |
| Constraints in migrations | 31 |
| Snapshot alteration | `sync_worksheets.schema_snapshot` added by an additive `ALTER TABLE ... ADD COLUMN` |

Migration names:

1. `0_baseline_existing_laravel_schema` — intentional no-op baseline.
2. `20260830140000_add_dashboard_import_domain`.
3. `20260830150000_add_coal_receipts`.
4. `20260830160000_add_sheets_sync_state`.
5. `20260830170000_add_sync_schema_snapshot`.

The baseline migration explicitly assumes that the existing Laravel-managed
tables already exist. The Supabase B0 probe confirmed that `public` contains
zero application tables. Consequently, applying the additive migrations now
would encounter missing dependencies such as `units` and other existing
Laravel tables referenced by foreign keys. This violates the B1 precondition
that migration history be valid for the target.

### Gate B1 result

| Check | Result |
| --- | --- |
| Target rechecked before migration | PASS — Direct/Pooler connection, SSL, metadata, and public emptiness unchanged |
| Migration history valid for this target | **FAIL** — no-op baseline does not create the missing Laravel schema |
| `prisma migrate deploy` | **NOT RUN** |
| Application tables after migration | Not created; target remains public-application-empty |
| Business rows | 0 |
| Local database | UNCHANGED |
| Supabase schema writes | 0 |
| Data migration | NOT RUN |
| Google Sheets sync | NOT RUN |
| Vercel deployment | NOT RUN |

### Required manual decision

**REQUIRES MANUAL APPROVAL:** choose one controlled baseline strategy before
B1 can execute:

- provision/restore the approved existing Laravel `public` schema into
  Supabase, then run the additive Prisma migrations; or
- prepare and review a real initial schema migration that creates every model
  required by `prisma/schema.prisma`, without changing business semantics.

Neither strategy was applied automatically. `prisma db push`, manual DDL,
schema reset, and data import remain prohibited in this phase.

**Final B1 status: BLOCKED.** Do not proceed to B2 or import the 2,409 rows
until the baseline strategy is approved and its preflight is rerun.
