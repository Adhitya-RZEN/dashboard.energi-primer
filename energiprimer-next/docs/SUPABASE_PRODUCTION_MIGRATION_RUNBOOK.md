# Supabase Production Migration Runbook

> CURRENT PRODUCTION MIGRATION STATE (2026-09-05): Read-only migration
> status and preflight PASS. The canonical production history is
> prisma/production/ with baseline 20260901130000_production_schema_baseline;
> there are no pending migrations, drift, checksum mismatch, unfinished
> migrations, or schema diff. Runtime uses the pooler on port 6543; migration
> checks use the direct TLS connection on port 5432. No migration deploy or
> resolve is authorized by this documentation closure.

> Phase 21 status (2026-09-01): **BLOCKED at Gate B0**. The read-only
> preflight detected both target URL variables, but Direct Connection and
> Transaction Pooler authentication failed before metadata could be read. See
> [the execution report](./SUPABASE_MIGRATION_EXECUTION_REPORT_2026-09-01.md).

Historical Phase 21/6B status: **PREPARED ONLY — NOT EXECUTED**

This runbook describes the governed schema migration workflow for the current
Supabase PostgreSQL target. Phase 6B does not execute a migration, resolve a
history row, or change Supabase data/schema.

## Safety boundary

- Do not run `prisma migrate`, `prisma db push`, `prisma migrate reset`,
  `TRUNCATE`, `DROP`, `DELETE`, or bulk import as part of preparation.
- Do not place a connection string, password, or Supabase project identifier
  in this document or in source control.
- Execute the migration only after an owner-approved change window and a
  verified backup.
- **SUPABASE PRODUCTION** is only
  `prisma/production/schema.prisma` plus
  `prisma/production/migrations/`.
- `prisma/schema.prisma` plus `prisma/migrations/` is
  **LEGACY/LOCAL-ONLY**. It is not interchangeable with the production
  history and must not be run against the current Supabase database.
- The Laravel project, application data, and `_prisma_migrations` rows remain
  read-only during preparation.

## Current schema compatibility assessment

The Prisma production datasource is PostgreSQL. The schema uses PostgreSQL-compatible
`BigInt`, `Decimal`, `Date`, and timestamp columns, ordinary indexes, unique
constraints, and foreign keys. No custom PostgreSQL extension, UUID-specific
type, or unsupported Prisma type was found in `prisma/production/schema.prisma`.

The canonical production history currently contains one finished full-schema
baseline, `20260901130000_production_schema_baseline`. The SQL audit found
schema-only table/index/constraint creation and no `DROP`, `TRUNCATE`,
`DELETE`, `UPDATE`, or `INSERT` statement. The root history's no-op Laravel
baseline and additive migrations are a separate local/legacy contract.

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

The application reads `DATABASE_URL` for Prisma runtime traffic. Migration and
backup tooling reads `SUPABASE_DIRECT_URL` only. These roles are deliberately
separated; an operator must not make a migration command inherit a pooler URL.

Recommended separation:

- Vercel runtime `DATABASE_URL`: Supabase transaction-pooler URL, TLS enabled,
  conservative `connection_limit`/pool settings, and an explicit connection
  timeout.
- Migration/backup workstation `SUPABASE_DIRECT_URL`: Supabase Direct URL on
  port 5432 with TLS, never exposed to the browser or bundled into the
  application.
- Prisma client: retain the existing module singleton and do not call
  `$disconnect()` per request in Vercel Functions.

Prisma documents that each serverless function instance can have its own
connection pool, so pooler selection and concurrency limits must be validated
against the selected Supabase plan. See [Prisma serverless connection guidance](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).

## 4. Migration strategy

### Development and staging

When `prisma/production/schema.prisma` changes, generate the next migration
only under the production history in a disposable/local or approved staging
database:

```powershell
npx prisma migrate dev --schema prisma/production/schema.prisma --name <descriptive_name>
```

Review the generated SQL, verify that it is schema-only and additive unless a
separately approved exception exists, and run the required schema/diff checks.
Never run this command with the root schema for a Supabase production change.

### Production operator sequence

The approved operator should use this order in a controlled change window:

1. Confirm a verified backup/restore point, owner, and change window.
2. Run `npm run supabase:production:migration:preflight` from an operator
   environment containing `SUPABASE_DIRECT_URL`. This is read-only and must
   pass target identity, history, checksum, status, and schema-diff checks.
3. Review the planned migration and its diff, then obtain explicit owner
   approval. For a planned migration, the operator may use the preflight's
   `--planned-migration=<name>` and `--mode=execution-gate` checks; these still
   do not execute a migration.
4. Apply only the canonical production history with the Direct URL. The
   command is defined below but was **not run in Phase 6B**.
5. Run `migrate status`, the read-only production schema verifier, and the
   application smoke test after deployment.
6. Freeze the cutover decision until counts, KPI values, relationships, auth
   records, and sync registry values match the recorded baseline.
7. Change Vercel runtime `DATABASE_URL` only during the separately approved
   application cutover window.

### Defined production deploy command — not executed

The command below is the canonical operator command. It is intentionally not a
package script, Vercel build step, startup hook, route, or cron action. The
operator must set `DATABASE_URL` in the child process from the Direct URL only
after the gates above pass:

```powershell
$env:DATABASE_URL = $env:SUPABASE_DIRECT_URL
node node_modules/prisma/build/index.js migrate deploy --schema prisma/production/schema.prisma
Remove-Item Env:DATABASE_URL
```

Do not substitute `prisma/schema.prisma`, `prisma/migrations/`, a pooler URL,
`prisma migrate resolve`, `prisma db push`, or `prisma migrate reset`.

`prisma migrate deploy` is intentionally not run in Phase 6B. The current
Supabase target already records the canonical production baseline and is
up-to-date; a future migration must be planned explicitly rather than inferred
from the root legacy history.

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
