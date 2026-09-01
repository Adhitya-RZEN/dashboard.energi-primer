# Phase 21E — Controlled Supabase Schema Migration

Date: 2026-09-01  
Status: **PASS — schema-only migration completed**

This report records the approved Phase 21E operation after the final Gate B0
preflight passed. It supersedes the earlier “not executed” status in the
preparation reports. Phase 21E did not import business data, run Google Sheets
sync, change the application cutover, or deploy to Vercel.

## Scope and safety boundary

- Target: Supabase Direct Connection only.
- Operation: one controlled Prisma baseline migration.
- Source: the Phase 21D-validated production baseline generated from
  `prisma/schema.prisma`.
- Local `DATABASE_URL`: unchanged and still points to the local PostgreSQL
  source.
- Local database writes: `0`.
- Supabase business-data writes: `0`.
- Supabase schema operation: one approved schema migration; this created the
  application schema and Prisma migration metadata only.
- No `prisma db push`, reset, destructive DDL, DML, data import, Sheets sync,
  cutover, or deployment was run.

## Gate B0 evidence used immediately before migration

The final read-only preflight confirmed:

| Check | Result |
| --- | --- |
| Supabase Direct Connection | PASS |
| Supabase Transaction Pooler | PASS |
| Direct SSL / in-memory `verify-full` probe | PASS |
| Pooler SSL / in-memory `verify-full` probe | PASS |
| Authentication | PASS for both endpoints |
| PostgreSQL | 17.6 |
| Database / role / schema | `postgres` / `postgres` / `public` |
| Public application tables before migration | `0` |
| Public business rows before migration | `0` |
| Public `_prisma_migrations` before migration | absent |
| Unexpected public application object | none |
| Supabase-managed objects | present only in expected platform schemas; untouched |
| Local `DATABASE_URL` | unchanged |

The target was application-schema-empty, not literally empty: Supabase-managed
objects in `auth`, `realtime`, `storage`, and `vault` were present and were not
altered. The inspected extensions were the existing platform extensions; no
extension was created or modified by this phase.

## Migration history strategy

The five legacy entries in `prisma/migrations` were not used for this target.
The first entry is a no-op marker that assumes a pre-existing Laravel schema,
while the Supabase target had no application tables. Running that history on an
empty target would not produce the approved baseline.

A clean production history was therefore packaged separately and kept
reproducible:

```text
prisma/production/schema.prisma
prisma/production/migrations/migration_lock.toml
prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql
```

`prisma/production/schema.prisma` is byte-identical to the application
`prisma/schema.prisma`. The migration SQL is byte-identical to the executable
SQL body of the validated Phase 21D artifact. Baseline SQL checksum:

```text
f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c
```

The legacy local migration directories were left unchanged. Future production
schema changes must use the production history deliberately; they must not be
added accidentally to the legacy history without a reviewed migration-history
decision.

## Execution result

The controlled runner used `prisma migrate deploy` with the Direct Connection
in a child process only. The process-level local `DATABASE_URL` was not
replaced.

| Result | Value |
| --- | --- |
| Migration | `20260901130000_production_schema_baseline` |
| Deploy command | `prisma migrate deploy` |
| Deploy exit code | `0` |
| Migration status exit code | `0` |
| Migration status | `UP_TO_DATE` |
| Migration metadata row | 1 finished, not rolled back |
| Migration checksum match | PASS |

## Read-only post-migration verification

The target was inspected again using only metadata queries and `COUNT(*)`.

| Check | Expected | Observed | Result |
| --- | ---: | ---: | --- |
| Application tables | 30 | 30 | PASS |
| Application columns | 270 | 270 | PASS |
| Primary keys | 30 | 30 | PASS |
| Foreign keys | 19 | 19 | PASS |
| Application indexes | 40 | 40 | PASS |
| Unique indexes | 20 | 20 | PASS |
| Column type/nullability/default/precision parity | exact | exact | PASS |
| Foreign-key names/actions | exact | exact | PASS |
| Prisma migration metadata | finished | finished | PASS |
| Application business rows | 0 | 0 | PASS |
| `BIOMASS_STOCK` | absent | absent | PASS |
| SSL | enabled | enabled | PASS |

The target remains ready for a separately approved data-migration phase. No
business table was populated by Phase 21E.

## Local source protection

The local source was checked after migration:

- `npm.cmd run db:verify`: **PASS**.
- Local database remains `dashboard_pln` with the established baseline of
  2,409 verified rows, duplicate `0`, orphan `0`, Unit 1–3, and Biomassa target
  70,020 ton.
- No local schema, data, authentication record, Google Sheets mapping, or
  business calculation was changed by Phase 21E.

## Application validation

| Validation | Result |
| --- | --- |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS |
| Next.js production route generation | PASS |
| Production schema `prisma validate` | PASS |
| Production migration `prisma migrate status` against Supabase | PASS — up to date |

The production build compiled successfully and retained the existing App
Router routes. No client bundle, auth flow, API contract, chart calculation,
or data mapping was changed by this phase.

## Files added for Phase 21E

- `scripts/run-phase21e-schema-migration.mjs` — guarded schema-only runner;
  requires an explicit `--execute` flag and refuses non-Direct/non-SSL URL
  shapes.
- `scripts/verify-supabase-production-schema.mjs` — read-only post-migration
  inventory, parity, checksum, and empty-data verifier.
- `prisma/production/schema.prisma` — reproducible clean production schema
  source, identical to the application schema.
- `prisma/production/migrations/migration_lock.toml` — PostgreSQL migration
  provider lock.
- `prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql`
  — executable baseline matching the validated artifact.
- `docs/SUPABASE_PHASE21E_SCHEMA_MIGRATION_REPORT_2026-09-01.md` — this report.

Existing `prisma/schema.prisma`, local legacy migrations, PostgreSQL local
business data, Supabase business data, and Supabase-managed platform objects
were not altered except for the approved creation of the target application
schema and Prisma migration metadata.

## Requires manual approval / not performed

The following remain outside Phase 21E and require a separate approval:

1. Importing the 2,409 local business rows or any historical Google Sheets
   data into Supabase.
2. Source/target KPI and row-level parity after data migration.
3. Changing the production application `DATABASE_URL` to Supabase.
4. Selecting the Vercel runtime pooler configuration and connection limits.
5. Google Sheets sync activation against Supabase.
6. Vercel deployment, cron activation, and production cutover.
7. Any rollback or destructive schema operation.

## Final Phase 21E decision

**PASS — READY FOR THE SEPARATE DATA-MIGRATION REVIEW.**

Per the stop condition, Phase 21E ends here. Gate B2/data migration, cutover,
sync, and deployment were not started.
