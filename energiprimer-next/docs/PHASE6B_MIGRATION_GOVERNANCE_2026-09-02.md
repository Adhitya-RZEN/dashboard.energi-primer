# Phase 6B — Migration Governance & Deployment Workflow

Tanggal: 2026-09-02  
Repository: `energiprimer-next`  
Branch: `NextJs`  
Target: Supabase PostgreSQL production  
Status: **CONDITIONALLY RESOLVED**

## 1. Executive Summary

Phase 6B menetapkan workflow migration yang eksplisit dan fail-closed untuk
target Supabase. `prisma/production/schema.prisma` dan
`prisma/production/migrations/` sekarang diperlakukan sebagai **SUPABASE
PRODUCTION** canonical. `prisma/schema.prisma` dan `prisma/migrations/`
tetap dipertahankan sebagai **LEGACY/LOCAL-ONLY** dan tidak interchangeable.

Read-only production preflight lulus terhadap target saat ini: database
`postgres`, schema `public`, Direct Connection TLS, satu canonical baseline,
checksum normalized yang cocok, `migrate status` up-to-date, dan schema diff
empty. Tidak ada `migrate deploy`, `migrate resolve`, DDL, DML, import, sync,
atau deployment yang dijalankan pada Phase 6B.

Status bersyarat dipilih karena backup/change-window/owner approval merupakan
bukti operasional yang belum tersedia pada workstation ini dan belum ada
dedicated CI migration workflow. Manual operator workflow sudah didefinisikan;
automatic migration tidak diaktifkan.

## 2. Current Migration Architecture

| Area | Canonical path/behavior | Scope |
| --- | --- | --- |
| Application/runtime schema | `prisma/schema.prisma`, datasource `DATABASE_URL` | Runtime client contract; currently byte-identical to production schema |
| Root history | `prisma/migrations/` | Laravel-derived baseline plus additive local history; legacy/local only |
| Supabase production schema | `prisma/production/schema.prisma` | Explicit production migration target |
| Supabase production history | `prisma/production/migrations/` | Full production history; currently one baseline |
| Production provider lock | `prisma/production/migrations/migration_lock.toml` | PostgreSQL |
| Vercel build | `npm run build` → `next build` | No migration |
| Vercel cron | `vercel.json` → `/api/sync/google-sheets` | Sync only; no migration |

Root history currently has five directories and no production baseline row. The
production history has one directory and its own PostgreSQL lock. No root
history was deleted, merged, renamed, or rewritten.

## 3. Canonical Production History

The canonical Supabase history is:

```text
prisma/production/schema.prisma
prisma/production/migrations/migration_lock.toml
prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql
```

The current production database records exactly the finished baseline
`20260901130000_production_schema_baseline`. Phase 6A and the Phase 6B
preflight verified the following without changing the database:

- 30 application tables and 270 application columns;
- 40 application indexes, 30 primary keys, and 19 foreign keys;
- `_prisma_migrations` contains the canonical baseline with no rollback or
  unfinished state;
- normalized LF checksum matches the database record;
- root history status intentionally fails because its history is unrelated;
- production schema diff is empty.

The production migration SQL was not changed in Phase 6B.

## 4. Development vs Production Workflow

Development/staging schema work must name the production schema when the
change is intended for Supabase:

```powershell
npx prisma migrate dev --schema prisma/production/schema.prisma --name <descriptive_name>
```

The generated directory must be under
`prisma/production/migrations/`. Review the SQL and run schema/diff checks in a
disposable or approved staging database before requesting production approval.

The production command is defined but was not run:

```powershell
$env:DATABASE_URL = $env:SUPABASE_DIRECT_URL
node node_modules/prisma/build/index.js migrate deploy --schema prisma/production/schema.prisma
Remove-Item Env:DATABASE_URL
```

The command is never part of `build`, `start`, application requests, or cron.
Before it is considered, the operator runs the read-only preflight, reviews the
diff, confirms backup/change-window evidence, and obtains explicit approval.
Afterward the operator runs status, schema verification, and application smoke
checks. Rollback is handled by the approved recovery policy, not an assumed
automatic down migration.

## 5. Connection Policy

- Runtime application traffic uses `DATABASE_URL`. Vercel runtime policy is
  Supabase Transaction Pooler/TLS, currently classified locally as pooler port
  `6543` with `pgbouncer`.
- Migration and backup tooling uses `SUPABASE_DIRECT_URL` only. The production
  preflight requires PostgreSQL Direct port `5432`, Supabase `db.*.supabase.co`
  host shape, TLS mode `require`, `verify-ca`, or `verify-full`, and no pooler
  or `pgbouncer` parameter.
- The preflight supplies the Direct URL only to its Prisma client and child CLI
  process. It never prints a URL, password, user, token, or connection error.
- Vercel must not receive `SUPABASE_DIRECT_URL`; the direct endpoint is an
  operator/CI secret, not a browser or runtime fallback.

## 6. Production Target Guard

Implemented in `scripts/verify-supabase-production-migration-preflight.mjs`.
The guard fails closed unless all of the following hold:

1. `--environment=production` and `--history=production` are supplied.
2. The fixed production schema, migration directory, PostgreSQL lock, and SQL
   artifacts exist.
3. `SUPABASE_DIRECT_URL` has the approved Direct/TLS shape; a pooler URL is
   rejected before database access.
4. The connected identity is database `postgres`, schema `public`, and SSL is
   active.
5. Every database migration row belongs to the canonical production directory;
   duplicate, unfinished, rolled-back, missing, or unexpected rows fail.
6. Each applied row checksum matches the LF-normalized repository SQL.
7. The canonical baseline is present, and pending migrations require explicit
   `--planned-migration=<name>` rather than being silently accepted.

The guard output reports names, statuses, counts, and safe connection classes
only. It sets `databaseWrites: 0`, `migrationDeploy: NOT RUN`, and
`migrationResolve: NOT RUN`.

## 7. Preflight

The package command is:

```powershell
npm run supabase:production:migration:preflight
```

It performs read-only artifact checks, target metadata queries, migration
history/checksum comparison, `prisma migrate status --schema
prisma/production/schema.prisma`, and a Prisma schema diff using the child
process Direct URL. CLI output containing SQL or connection details is
suppressed.

Technical mode returns `PASS` only when the current target is canonical,
up-to-date, and schema-parity empty. It does not imply permission to deploy;
the output keeps approval as `REVIEW_REQUIRED`. `--mode=execution-gate` is an
additional read-only gate for a named planned migration and requires the
non-secret process evidence flags `MIGRATION_BACKUP_CONFIRMED=true`,
`MIGRATION_CHANGE_WINDOW_CONFIRMED=true`, and a non-empty
`MIGRATION_APPROVAL_ID`. It still cannot execute a migration.

The preflight fails closed for wrong history, wrong Direct URL shape, wrong
database/schema, non-TLS connection, unexpected history, checksum mismatch,
unfinished/rolled-back history, unplanned pending migration, or unexpected
schema diff.

## 8. Migration Creation Workflow

The required sequence for a future production schema change is:

```text
production schema edit
        ↓
generate under prisma/production/migrations/
        ↓
review SQL + checksum/path + schema diff
        ↓
disposable/staging validation
        ↓
read-only production preflight
        ↓
backup + change window + explicit owner approval
        ↓
operator deploy with --schema prisma/production/schema.prisma
        ↓
post-status + schema verifier + application smoke test
```

No future Supabase migration may be generated accidentally under the root
history. Data migrations/imports are separate workflows and are not a substitute
for this schema migration process.

## 9. Root Legacy History Policy

`prisma/migrations/` is **LEGACY/LOCAL-ONLY**. Its no-op Laravel baseline
assumes existing Laravel tables and its later directories describe the local
incremental history. It is not a representation of the current Supabase
`_prisma_migrations` table.

The root history must not be run against the current Supabase database, used in
the production deploy command, or merged with `prisma/production/migrations/`.
The files remain in place for local compatibility and historical traceability;
no delete/merge/rename was performed.

## 10. Vercel / CI Separation

Repository evidence:

- `package.json` build is `next build`; no `vercel-build` or migration build
  hook exists.
- `vercel.json` contains only the Google Sheets sync cron.
- No `.github/workflows` directory exists.
- No migration deploy is called by startup, request, or cron code.
- The new package script is read-only preflight only; no production deploy
  script was added.

Options considered:

| Option | Assessment | Decision |
| --- | --- | --- |
| A. Manual operator | Concrete now, direct connection and approval remain outside Vercel | **Recommended now** |
| B. Dedicated CI migration job | Strong repeatability after secret environment, protected approval, backup evidence, and audit log are provisioned | Future option; not implemented |
| C. Automatic build/startup/cron migration | Couples deploy to schema mutation, has wrong-target/approval risk, and is unsuitable for Vercel serverless | **Rejected/not enabled** |

The current workflow classification is **MANUAL**. A protected CI job can be
added later without changing the runtime build contract.

## 11. Backup and Rollback Governance

Before any future production deploy, the owner must record a verified backup or
snapshot identifier, restore/rehearsal result, target identity, backup time,
change-window identifier, operator, approval reference, and post-deploy
acceptance thresholds. These records are intentionally not fabricated by this
phase.

Rollback means stopping promotion/cron, reverting the application deployment
when appropriate, and either restoring the verified database recovery point or
applying an approved forward corrective migration after impact analysis. It
does not mean assuming `migrate resolve` is a rollback, editing
`_prisma_migrations` by hand, or issuing destructive data commands.

## 12. Documentation Changes

Phase 6B clarified the active policy in:

- `README.md`;
- `docs/DATABASE_MIGRATION.md`;
- `docs/SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md`;
- `docs/SUPABASE_PHASE21G_CUTOVER_RUNBOOK.md`;
- `docs/PRODUCTION_ENVIRONMENT_MATRIX.md`;
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`;
- `docs/VERCEL_CONFIGURATION.md` and `docs/VERCEL_DEPLOYMENT_READINESS.md`
  (historical snapshots now point to the current policy);
- `docs/AGENT_CONTEXT.md` and `docs/PROJECT_MAP.md`.

Historical Phase 2–6A reports remain evidence reports and were not rewritten to
alter their recorded historical results.

## 13. Automated Verification

Added:

- `scripts/verify-supabase-production-migration-preflight.mjs` — deterministic,
  secret-safe, read-only target/history/checksum/status/diff guard;
- `supabase:production:migration:preflight` package command;
- canonical production paths in `scripts/validate-production-schema-disposable.mjs`;
- populated-production handling in `scripts/verify-supabase-production-schema.mjs`;
  `--expect-empty` remains available when an empty target is specifically
  required.

Verified guard behavior:

- `--history=root` fails closed with `wrong canonical history` and no database
  access;
- replacing Direct with the runtime pooler shape fails closed before database
  access;
- current Direct production preflight returns `PASS` with zero writes;
- migration/status/diff child output is suppressed from the report.

## 14. Safe-Target Test Results

The disposable validator was invoked with the isolated E2E environment. Its
`DATABASE_URL` is a remote pooler, not a loopback PostgreSQL endpoint. The
validator therefore returned:

```text
BLOCKED — SAFE MIGRATION EXECUTION TARGET UNAVAILABLE
```

No disposable database was created or dropped. Supabase production was not
used as a migration execution test target; the production checks above were
metadata/status/diff reads only. A local PostgreSQL or approved staging target
is required before testing `migrate dev`/`migrate deploy` behavior.

## 15. Regression Results

This section records the final Phase 6B command results after implementation.
The Windows `.cmd` launcher is equivalent where PowerShell execution policy
rejects the extensionless `npm`/`npx` shim.

| Command | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run db:validate` | PASS |
| `npm run db:generate` | PASS — Prisma Client 6.19.3 generated successfully |
| `npm run db:verify-import-schema` | PASS — production history, import tables, and Unit 1–3 read verification |
| `npm run supabase:production:migrate-status` | PASS — up to date, read-only |
| `npm run build` | PASS — exit 0; framework logged non-fatal unreachable pooler reads during page generation |
| `npm run supabase:production:migration:preflight` | PASS; read-only production preflight |
| `node --env-file-if-exists=.env.local scripts/verify-supabase-production-schema.mjs` | PASS — structural parity and populated production data allowed |
| `node scripts/verify-production-schema-baseline-design.mjs` | PASS — static-only artifact check |
| Regression gate overall | **PASS** |
| Production database writes | `0` |
| Production migration deploy | `NOT RUN` |
| Production migration resolve | `NOT RUN` |
| Destructive operations | `NONE` |

## 16. Recommended Operating Procedure

1. Keep Vercel runtime on `DATABASE_URL`; keep Direct credentials out of
   Vercel runtime.
2. For a schema change, edit production schema and generate/review only under
   `prisma/production/migrations/`.
3. Validate on disposable/staging infrastructure and preserve the reviewed
   diff/checksum.
4. Run the production preflight from a protected operator/CI environment.
5. Obtain verified backup, change window, explicit owner approval, and an
   auditable approval reference.
6. Run the defined deploy command once with the Direct URL and explicit
   production schema path.
7. Immediately run status, schema verifier, application read smoke tests, and
   observation/rollback monitoring.

## 17. Remaining Risks

- No disposable/local PostgreSQL execution target is configured in the current
  E2E environment.
- Backup/restore evidence, change-window identifier, and owner approval are
  external operational responsibilities and were not supplied.
- No protected CI migration job or immutable operator deployment log exists in
  the repository.
- Production schema and root schema are currently byte-identical, so accidental
  root use may appear to work physically even though its migration history is
  wrong; always require the explicit production path and guard.
- The canonical checksum is line-ending-normalized; future tooling must keep
  the same deterministic normalization policy and review artifact changes.
- Runtime pooler capacity, Vercel environment values, backup retention, and
  post-deploy smoke acceptance still require owner/platform verification.

## 18. Final Decision

**CONDITIONALLY RESOLVED.**

The canonical production history, connection policy, deploy command,
fail-closed target guard, read-only preflight, creation workflow, Vercel
separation, backup/rollback policy, and manual operating procedure are now
concrete and documented. The current Supabase target passed the technical
preflight without writes. Production deployment remains intentionally outside
this phase pending owner approval/change evidence and, if desired, a future
protected CI implementation.
