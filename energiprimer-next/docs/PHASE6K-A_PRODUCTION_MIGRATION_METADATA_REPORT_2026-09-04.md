# PHASE 6K-A — PRODUCTION MIGRATION METADATA READ-ONLY REVERIFICATION

Project: Energi Primer PLN Jeranjang  
Date: 2026-09-04 (Asia/Makassar)  
Scope: read-only Production migration metadata, canonical history, checksum,
target identity, schema parity, and preflight verification.

## 1. Status

**PASS — read-only Production migration metadata re-verification completed.**

The Phase 6J Production status/preflight blocker was not reproducible on the
successful canonical Prisma runs. The current target is reachable through the
approved Prisma path, is up to date, and matches the canonical production
schema and migration history. No migration, deployment, sync, or credential
change was performed.

## 2. Phase Objective

This phase reverified, without changing Production:

- the exact Production target identity and SSL state;
- the canonical history at `prisma/production/migrations/`;
- the baseline migration `20260901130000_production_schema_baseline`;
- `_prisma_migrations` existence, readability, completion, rollback state,
  unexpected rows, and checksum;
- Prisma migration status and schema diff; and
- read-only schema parity against `prisma/production/schema.prisma`.

## 3. Phase 6J Blocker

Phase 6J recorded:

- `supabase:production:migrate-status`: exit 1 with output suppressed for
  secret safety; and
- `supabase:production:migration:preflight`: blocked while querying target
  metadata/history, with local artifact and connection-policy checks passing.

During this re-verification, two auxiliary `psql` probes returned exit code 2
with a hostname-resolution failure before SQL execution. The canonical Prisma
child process subsequently connected successfully, and the official status,
preflight, metadata, history, and schema verifiers all passed. The Phase 6J
failure is therefore classified as a transient/runner-level connection
resolution observation, not a persistent migration-history or schema failure.

The original Phase 6J raw error cannot be reconstructed because that report
intentionally suppressed command output. No secret-bearing output was enabled
to recover it.

## 4. Verification Environment

| Item | Result |
| --- | --- |
| Project | `energiprimer-next` |
| Date/time zone | 2026-09-04, Asia/Makassar |
| Node.js | v24.17.0 |
| Prisma / client | 6.19.3 / 6.19.3 |
| Canonical schema | `prisma/production/schema.prisma` |
| Canonical migrations | `prisma/production/migrations/` |
| Operator migration endpoint | `SUPABASE_DIRECT_URL`, Direct PostgreSQL port 5432, TLS required |
| Runtime endpoint | `DATABASE_URL`, pooler port 6543, kept separate from Direct |
| Secret handling | Values, passwords, host, and connection strings were not printed |
| Database activity | SELECT/read-only inspection only; Production was not used as a fixture |

## 5. Script Inspection

The relevant scripts were inspected before execution:

1. `scripts/verify-supabase-production-migrate-status.mjs` validates the Direct
   URL shape and starts Prisma `migrate status` with a child-only
   `DATABASE_URL` override. The parent runtime URL remains unchanged and the
   command captures/suppresses failure output.
2. `scripts/verify-supabase-production-migration-preflight.mjs` inventories
   only `prisma/production/migrations/`, normalizes line endings for checksums,
   checks for forbidden data/destructive operations, reads target metadata and
   `_prisma_migrations`, and runs read-only status/diff commands. Its result
   explicitly reports `migrationDeploy: NOT RUN`, `migrationResolve: NOT RUN`,
   `databaseWrites: 0`, and `destructiveOperations: NONE`.
3. `scripts/verify-supabase-production-schema.mjs` uses the production schema
   and baseline artifact, then performs SELECT-only table, column, constraint,
   index, migration, and row-count checks.

No verifier bug was identified. The official scripts used the canonical paths
and passed without modification in this phase. No script, schema, migration,
`vercel.json`, environment file, or runtime source was changed for the
re-verification.

## 6. Production Target Identity

The sanitized environment contract and direct Prisma metadata query agree:

| Check | Result |
| --- | --- |
| Direct URL protocol | `postgresql:` |
| Direct endpoint port | `5432` |
| Direct host class | Supabase Direct host; no pooler marker |
| Direct TLS parameter | `sslmode=require` |
| Direct `pgbouncer` parameter | Absent |
| `current_database()` | `postgres` |
| `current_schema()` | `public` |
| Backend server port | `5432` |
| Backend SSL session | `true` |
| PostgreSQL version | `17.6` |
| Runtime separation | `DATABASE_URL` remains pooler port `6543`; separated from Direct |

## 7. `_prisma_migrations` Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Table exists | PASS | `information_schema.tables` SELECT returned `_prisma_migrations` |
| Table readable | PASS | Direct Prisma SELECT returned the history row |
| Canonical baseline | PASS | `20260901130000_production_schema_baseline` is present |
| Applied migration count | PASS | Canonical count 1; Production count 1 |
| Unfinished rows | PASS | 0; baseline has `finished_at` |
| Rolled-back rows | PASS | 0; baseline has no `rolled_back_at` |
| Unexpected/duplicate rows | PASS | `unexpectedNames: []`, `duplicateNames: []` |
| Pending migrations | PASS | `pendingNames: []` |
| Checksum | PASS | Production checksum equals normalized-LF local checksum `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c` |
| Applied steps | PASS | Baseline `applied_steps_count = 1` |

The local migration file is stored with CRLF line endings. After the same
CRLF-to-LF normalization used by the preflight, its checksum matches
Production exactly. The raw CRLF byte hash is not the Prisma history checksum
and was not used for comparison.

## 8. Migration Status

| Gate | Result |
| --- | --- |
| `npm.cmd run supabase:production:migrate-status` | PASS; exit 0 |
| Official status state | `UP_TO_DATE_OR_NO_PENDING_MIGRATIONS` |
| Preflight `migrateStatus` | PASS; `UP_TO_DATE` |
| Preflight schema diff | PASS; `EMPTY` |
| Canonical migration inventory | PASS; one baseline, all SQL files present |
| Forbidden migration operations | PASS; none detected |

No pending, failed, unfinished, rolled-back, or drift-reported migration was
observed.

## 9. Schema Verification

`node --env-file-if-exists=.env.local scripts/verify-supabase-production-schema.mjs`
returned **PASS** with no failures:

| Schema check | Result |
| --- | --- |
| Application tables | 30 expected / 30 present; no unexpected tables |
| Application columns | 270 expected / 270 present; parity true |
| Primary keys | 30 expected / 30 present |
| Foreign keys | 19 expected / 19 present; names/actions match |
| Application indexes | 40 expected / 40 present |
| Unique indexes | 20 expected; parity true |
| Baseline migration record | Finished, not rolled back, checksum match |
| `biomass_stock` absence | PASS |
| Business data | 8,952 rows observed; populated data allowed by verifier |
| SSL | PASS |

The preflight also confirmed the canonical PostgreSQL migration lock and an
empty schema diff against the production schema contract.

## 10. Root Cause Classification

**CONNECTION**

Evidence supports a transient or runner-specific hostname-resolution issue
during the failed checkpoint/re-verification attempt. The auxiliary `psql`
client observed hostname resolution failure, while the canonical Node/Prisma
path later reached the same sanitized Direct target and all official gates
passed. There is no evidence for authentication, target identity, migration
history, checksum, schema, permission, TLS, Prisma CLI/schema, environment
resolution, or verifier failure in the successful run.

## 11. Preflight Result

`npm.cmd run supabase:production:migration:preflight` returned **PASS** in
technical read-only mode.

| Preflight field | Result |
| --- | --- |
| Environment guard | PASS: `production` |
| Canonical history guard | PASS: `SUPABASE PRODUCTION` |
| Target connection policy | PASS: Direct 5432/TLS/no pooler |
| Target identity | PASS: `postgres` / `public` / SSL |
| Migration history | PASS |
| Prisma migrate status | PASS: up to date |
| Schema diff | PASS: empty |
| Approval gate | `REVIEW_REQUIRED`; no backup, change-window, or owner-approval evidence was supplied to the technical verifier |
| Migration deploy | `NOT RUN` |
| Migration resolve | `NOT RUN` |
| Database writes | `0` |

The approval review state is an execution-control requirement, not a failure
of the read-only metadata gate.

## 12. Documentation Review

The canonical guidance in `docs/AGENT_CONTEXT.md` and
`docs/SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md` correctly separates:

- `prisma/production/schema.prisma` and `prisma/production/migrations/` for
  Supabase Production; and
- `prisma/schema.prisma` and `prisma/migrations/` for legacy/local-only use.

The Phase 6J report remains unchanged as a historical record of its earlier
blocked checkpoint. The active `docs/PRODUCTION_READINESS.md` index was
corrected to mark that checkpoint historical, point to this Phase 6K-A report,
and record the successful read-only re-verification. No historical evidence was
rewritten. No further documentation change is required for this metadata gate.

## 13. Required Manual Action

The operator may proceed to the next manual Phase 6K deployment-verification
review, subject to the separate backup, change-window, and owner-approval
controls. Preserve the canonical production schema/history selection and keep
the runtime pooler URL separate from the Direct migration endpoint.

This report does not instruct the agent to deploy, migrate, resolve history,
change Vercel configuration, or run a Production sync. A future schema change
must still be explicitly planned and approved; an up-to-date status is not a
reason to run a migration command.

## 14. Production Safety Counters

| Counter | Actual |
| --- | ---: |
| Production SELECT/read-only queries | >0 (allowed; metadata/history/schema checks only) |
| Production INSERT / UPDATE / DELETE | 0 |
| Production sync requests | 0 |
| Production sync retries | 0 |
| Production Google Sheets writes | 0 |
| Migration deploy | 0 |
| Migration resolve | 0 |
| `db push` / reset / dev against Production | 0 |
| Production schema changes | 0 |
| Environment changes | 0 |
| Secret/credential changes | 0 |
| Vercel deployments by agent | 0 |
| Git commits by agent | 0 |
| Git pushes by agent | 0 |

## 15. Deployment Readiness

**READY FOR PHASE6K MANUAL DEPLOYMENT VERIFICATION.**

All Phase 6K-A technical read-only migration gates pass. This is readiness for
manual operator verification only; it is not an agent deployment authorization
and does not override the approval gate.

## 16. Production Sync Gate

**NO PRODUCTION SYNC PERFORMED IN PHASE 6K-A.**

No sync route, Cron trigger, retry, Google Sheets write, import, or normalized
data write was sent.

## 17. Final Decision

**PASS — Phase 6K-A complete.**

The Phase 6J Production metadata blocker is cleared for the current verified
run: the canonical baseline is recorded, finished, not rolled back, checksum
matched, schema is aligned, and Prisma reports the target up to date. The next
step is a manual Phase 6K deployment-verification decision by the operator.
