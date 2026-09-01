# Supabase Production Migration Runbook

> Phase 21 status (2026-09-01): **BLOCKED at Gate B0**. The read-only
> preflight detected both target URL variables, but Direct Connection and
> Transaction Pooler authentication failed before metadata could be read. See
> [the execution report](./SUPABASE_MIGRATION_EXECUTION_REPORT_2026-09-01.md).

Status: **PREPARED ONLY — NOT EXECUTED**

This runbook describes a controlled future migration from the existing local
PostgreSQL database to Supabase PostgreSQL. Phase 20 did not connect to,
create, alter, or write to Supabase.

## Safety boundary

- Do not run `prisma migrate`, `prisma db push`, `prisma migrate reset`,
  `TRUNCATE`, `DROP`, `DELETE`, or bulk import as part of preparation.
- Do not place a connection string, password, or Supabase project identifier
  in this document or in source control.
- Execute the migration only after an owner-approved change window and a
  verified backup.
- The existing Laravel schema/data and the additive Next.js tables are both in
  scope for a future controlled migration; the Laravel project remains
  read-only.

## Current schema compatibility assessment

The Prisma datasource is PostgreSQL. The schema uses PostgreSQL-compatible
`BigInt`, `Decimal`, `Date`, and timestamp columns, ordinary indexes, unique
constraints, and foreign keys. No custom PostgreSQL extension, UUID-specific
type, or unsupported Prisma type was found in `prisma/schema.prisma`.

The migration history contains one no-op baseline marker for the existing
Laravel schema and four additive migrations dated 2026-08-30. The SQL audit
found table/index creation and additive alteration only; it found no `DROP`,
`TRUNCATE`, `DELETE`, `UPDATE`, or `INSERT` statements in the migration files.
Foreign-key `ON DELETE` behavior remains part of the schema contract and must
be reviewed before any data operation.

## 1. Pre-migration backup gate

Before any Supabase operation:

1. Confirm the source database and target project are the intended systems.
2. Take a verified logical backup using a protected operator workstation or
   approved backup service. Keep the dump outside Git and outside the web
   application directory.
3. Record backup timestamp, source database identity (without credentials),
   schema list, row-count baseline, checksum, and restore owner.
4. Perform a restore rehearsal into a disposable, access-controlled database.
5. Verify that the rehearsal contains the expected Laravel tables, additive
   import/sync tables, three units (`Unit 1`, `Unit 2`, `Unit 3`), and the
   approved Biomassa target of 70,020 ton.

No backup or restore was run by Phase 20.

## 2. Supabase project and connection setup

Manual actions:

1. Create or select the approved Supabase project.
2. Configure database password, network access, region, PITR/backup plan, and
   owner access according to organizational policy.
3. Obtain connection strings from the Supabase Connect panel without pasting
   them into chat or documentation.
4. Keep a direct connection for administrative work such as backup, restore,
   and migration.
5. Use the Supavisor transaction pooler for Vercel application traffic when
   the selected Supabase plan/network requires serverless pooling. For Prisma
   transaction pooling, verify whether the connection string needs the
   provider-documented `pgbouncer=true` parameter.

Reference: [Supabase PostgreSQL connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. Environment and pooling strategy

The application currently reads only `DATABASE_URL` for Prisma. Do not add a
second URL or alter the schema automatically. The production owner must decide
which approved URL is used by the application and which direct URL is reserved
for CLI/backup operations.

Recommended separation:

- Vercel runtime: Supabase transaction-pooler URL, TLS enabled, conservative
  `connection_limit`/pool settings, and an explicit connection timeout.
- Migration/backup workstation: Supabase direct URL, never exposed to the
  browser or bundled into the application.
- Prisma client: retain the existing module singleton and do not call
  `$disconnect()` per request in Vercel Functions.

Prisma documents that each serverless function instance can have its own
connection pool, so pooler selection and concurrency limits must be validated
against the selected Supabase plan. See [Prisma serverless connection guidance](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).

## 4. Migration strategy

The approved operator should use this order in a controlled environment:

1. Restore the verified source backup into the approved Supabase project or
   an approved staging clone.
2. Confirm the restored Laravel schema matches the no-op baseline assumption.
3. Apply only the repository migration history in order using the direct
   administrative connection, after explicit approval.
4. Run Prisma Client generation in the build environment; do not use `db push`.
5. Run the read-only database verification and application smoke test.
6. Freeze the cutover decision until all counts, KPI values, relationships,
   auth records, and sync registry values match the recorded baseline.
7. Change Vercel `DATABASE_URL` only during the approved cutover window.

`prisma migrate deploy` is intentionally not run in Phase 20. A fresh target
with an existing Laravel schema requires an operator decision about how the
baseline migration is marked/applied; do not infer that decision from a clean
database.

## 5. Data verification checklist

Verify before enabling application traffic:

- PostgreSQL connection and `public` schema.
- All expected tables and migration history.
- No orphan unit relationships.
- Unit names/order: Unit 1, Unit 2, Unit 3.
- Biomassa target: 70,020 ton.
- Sync registry baseline: 199 worksheets, 7 active worksheets, 2,409 row
  states, zero open schema changes, zero active leases.
- KPI and dashboard read results for the approved July 2026 baseline.
- Password hashes and reset-token table are present without exposing values.
- `BIOMASS_STOCK` remains outside the schema/application scope.

## 6. Rollback strategy

If restore or verification fails, stop the cutover and keep the old database
unchanged. Use the [production rollback runbook](./PRODUCTION_ROLLBACK_RUNBOOK.md).
Do not delete or partially repair target rows by hand. A migration rollback is
not assumed to be a down migration; restore the verified backup or use an
approved forward fix after impact analysis.

## Manual approval required

- Supabase project and plan selection.
- Backup/restore window and retention.
- Direct versus pooler connection strings and limits.
- Baseline handling and migration execution.
- Cutover/rollback owner and acceptance thresholds.
