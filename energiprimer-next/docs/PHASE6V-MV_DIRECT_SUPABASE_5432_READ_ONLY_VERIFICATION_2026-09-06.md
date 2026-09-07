# PHASE 6V-MV — DIRECT SUPABASE 5432 READ-ONLY VERIFICATION

## Objective

Phase 6V-MV rechecked the Production migration endpoint represented by
`SUPABASE_DIRECT_URL` using read-only diagnostics only. The scope was limited
to environment presence, sanitized endpoint metadata, DNS, TCP 5432
reachability, and a comparison with the working runtime pooler on port 6543.

No deployment, synchronization, migration, migration resolve, schema change,
data write, environment change, secret change, commit, or push was performed.
No credential or complete connection string is recorded here.

## Current Commit / SHA

| Item | Result |
|---|---|
| Branch | `NextJs` |
| Local HEAD | `7a67f6e201c6629c5fcdc2da7b3b09f06416b4f5` |
| Commit subject | `fix(csp): fix incomplete Recharts measurement patch` |
| Local source changes | None observed; existing worktree changes are documentation/audit artifacts |
| Agent deployment/commit/push | None |

The SHA is also the source SHA recorded for the operator-managed READY
Production deployment in the Phase 6V verification. Git/Vercel signature
verification remains unverified; this phase does not infer signature validity
from a matching SHA.

## Deployment / Source Artifact Inventory

The latest operator-managed Production deployment recorded by Phase 6V is:

- deployment ID: `dpl_8AwGQBDB6k9pXcihVgdJnfqfL9f2`
- state: `READY`, Production
- canonical domain: `https://dashboard-energi-primer.vercel.app`
- deployment source SHA: `7a67f6e201c6629c5fcdc2da7b3b09f06416b4f5`
- deployment ref: `NextJs`

The source/artifact consistency set recorded by Phase 6V covers:

```text
src/proxy.ts
src/services/google-sheets/sync/discovery.ts
src/services/google-sheets/sync/engine.ts
src/services/google-sheets/sync/lease.ts
src/services/google-sheets/sync/diagnostic-core.ts
src/services/google-sheets/sync/diagnostics.ts
src/services/google-sheets/sync/bb-policy.ts
src/lib/google-sheets.ts
package.json
package-lock.json
vercel.json
```

The local HEAD equals that recorded deployment source SHA. This is provenance
matching by SHA, not cryptographic signature verification.

## Working Tree Status

The worktree was already non-clean at the start of this verification. Existing
changes are limited to Phase 6 documentation files and a user-owned untracked
`graphify-out/` directory at the workspace level. No application source,
schema, migration, environment, or secret file was changed by Phase 6V-MV.

## Environment Metadata

| Item | Result |
|---|---|
| Node.js | `v24.17.0` |
| npm | `11.13.0` |
| Prisma CLI / client | `6.19.3` / `6.19.3` |
| Next.js | `16.3.3` |
| `DATABASE_URL` | Present; runtime pooler contract, port `6543` |
| `SUPABASE_DIRECT_URL` | Present; Direct contract, port `5432` |
| `SUPABASE_POOLER_URL` | Present; pooler contract, port `6543` |

Only presence and non-secret connection metadata were inspected. Values were
not printed.

The canonical read-only migration scripts are present in `package.json`:
`supabase:production:migrate-status` and
`supabase:production:migration:preflight`. The runtime comparison script
`supabase:production:runtime:pooler` was the only database command rerun in
this phase.

## Direct Endpoint Metadata

The current `SUPABASE_DIRECT_URL` has the following sanitized shape:

- host class: Supabase Direct PostgreSQL (`db.<redacted>.supabase.co`)
- port: `5432`
- database: redacted
- `sslmode`: `require`
- pooler parameter: not present in the Direct endpoint

The Direct endpoint is therefore structurally distinct from the runtime
pooler. The current runtime contract remains `DATABASE_URL` through port
`6543`.

## DNS Result

Read-only DNS resolution for the sanitized Direct host completed with these
observations:

| Query | Result |
|---|---|
| A | Resolver returned a record, but no address was exposed by this runner |
| AAAA | Resolver returned one address |
| CNAME | Resolver returned a record without an address field |

DNS resolution was therefore not a total name-resolution failure. The result
does not by itself prove that PostgreSQL is reachable over the Direct path.

## TCP 5432 Result

Two independent read-only TCP checks were run against the Direct host and port
`5432`:

| Check | Result |
|---|---|
| PowerShell `Test-NetConnection` | Completed; `TcpTestSucceeded=False`; no remote address |
| .NET `TcpClient` with 10-second timeout | Connection exception; `connected=False` |

The current verification environment cannot establish the Direct TCP path.
Because the same environment successfully reaches the Supabase pooler on
`6543`, this is classified as a Direct-port/path reachability finding rather
than evidence of a general application database outage.

## TLS / PostgreSQL Result

TLS negotiation and PostgreSQL protocol verification were **NOT REACHED** in
Phase 6V-MV because the TCP prerequisite failed. No SQL was sent to the
Direct endpoint. A prior read-only Direct runtime probe in the same Phase 6V
verification context also returned Prisma's inability to reach the database
server on port `5432`.

## Pooler 6543 Comparison

The read-only runtime check was rerun against the pooler:

```text
npm run supabase:production:runtime:pooler
```

Result: **PASS**.

- database: `postgres`
- schema: `public`
- PostgreSQL: `17.6`
- connection parameter: `sslmode=verify-full`
- pooler backend session SSL detail: not reported by the pooler
- stable data rows: `2406`
- application rows: `8956`
- `localDatabaseWrites`: `0`
- `supabaseWrites`: `0`
- July 2026 dashboard baseline: PASS
- January–July 2026 coverage: PASS
- August fallback to July: expected source-staleness behavior

This establishes that the runtime transaction-pooler path is healthy and is
not a substitute for a successful Direct migration preflight.

## Migration Status Result

The canonical migration status command was **NOT RUN in Phase 6V-MV** because
Direct TCP 5432 was already proven unreachable. Running Prisma migration
metadata verification before that prerequisite succeeds would not add useful
evidence and could obscure the layer that failed.

The prior same-environment Phase 6V read-only attempt returned exit code `1`
with its detailed output suppressed by the script's secret-safety boundary;
the associated Direct connectivity probe could not reach port `5432`.

No `prisma migrate deploy` or other migration command was run.

## Migration Preflight Result

The canonical production migration preflight was likewise **NOT RUN in Phase
6V-MV** because its Direct 5432 connectivity precondition was unmet. The
prior Phase 6V preflight classified the target as `BLOCKED` after the
read-only target metadata/history query failed. It reported canonical local
artifacts as valid, Direct connection policy as structurally valid, runtime
pooler separation as valid, and zero database writes.

No migration resolve, reset, seed, schema push, or destructive SQL was run.

## Schema / Migration Evidence

The following evidence is read-only and must be interpreted with the endpoint
boundary above:

- **HISTORICAL — Phase 6K-A (2026-09-04):** Direct 5432/TLS was reachable;
  canonical status and preflight passed; the schema diff was empty; the
  canonical production history contained exactly one finished baseline,
  `20260901130000_production_schema_baseline`, with checksum
  `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c`.
- **Current pooler corroboration:** a read-only `_prisma_migrations` query
  observed one finished baseline row, with no rollback flag. This corroborates
  the known production history but does not replace Direct Prisma
  status/preflight.
- **Current pooler schema metadata:** 31 public tables, 30 application
  tables, 278 public columns, 270 application columns, 30 application primary
  keys, 19 application foreign keys, and 70 application indexes were observed
  by read-only checks.
- **Current sync-state read-only checks:** 199 worksheet registry rows, 7
  active required worksheets, 2,409 row-state rows, latest run `SUCCESS`, zero
  active leases, and zero open schema changes.

There is no current evidence of migration drift from these checks. Direct
Supabase 5432 connectivity remains unresolved from the current verification
environment; this does not constitute evidence of migration drift.

## Root-Cause Classification

Finding code: `DIRECT_DATABASE_CONNECTIVITY_FINDING`.

The narrowest supported conclusion is that DNS information is available but
the current environment cannot complete an outbound TCP connection to the
Supabase Direct PostgreSQL endpoint on port `5432`, while the Supabase
transaction pooler on port `6543` works. The evidence cannot distinguish
endpoint-side filtering, network/firewall policy, IPv4/IPv6 path behavior, or
another port-specific reachability condition. No speculative URL replacement
was attempted.

This is a connectivity verification finding, not a migration failure and not
evidence of schema drift.

## Production Safety Verification

| Counter | Phase 6V-MV result |
|---|---:|
| Production sync requests | 0 |
| Production sync retries | 0 |
| Production business DB writes | 0 |
| Google writes | 0 |
| Migrations | 0 |
| Migration resolves | 0 |
| DB reset/seed | 0 |
| Environment changes | 0 |
| Secret changes | 0 |
| Agent deployments | 0 |
| Agent commits | 0 |
| Agent pushes | 0 |

No authentication login was performed in this Direct-endpoint verification,
so there was no expected `last_login_at` write to record.

## Documentation Updated

- `docs/PHASE6V-MV_DIRECT_SUPABASE_5432_READ_ONLY_VERIFICATION_2026-09-06.md`
- `docs/AGENT_CONTEXT.md`
- `docs/DATABASE_PRODUCTION_READINESS.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/PRODUCTION_PREPARATION_REPORT_2026-09-01.md`
- `docs/SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md`
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`
- `docs/PHASE6V_PRODUCTION_DEPLOYMENT_CSP_ARTIFACT_VERIFICATION_2026-09-05.md`

Historical Phase 6K-A evidence was preserved and not rewritten.

## Remaining Findings

1. Direct TCP 5432 connectivity is not currently re-verifiable from this
   environment. When it becomes reachable, rerun only the read-only canonical
   migration status and preflight checks.
2. Phase 6K-A's successful Direct verification remains historical rather than
   a claim about today's network path.
3. Runtime pooler health is verified, but it cannot by itself prove the Direct
   migration endpoint's live Prisma metadata status.
4. Commit signature verification remains unverified, as recorded by Phase 6V.

## Final Classification

**PASS WITH FINDINGS**

The classification is based on strong current pooler/schema corroboration and
preserved historical Direct migration evidence, with the non-critical but
unresolved inability to reverify Direct port `5432` today. No actual
migration, schema, data, or runtime failure was found.

## Recommended Next Phase

Do not retry migration status/preflight until the Direct endpoint is reachable
from the authorized verification environment. Do not change URLs, firewall
rules, secrets, environment variables, or Production configuration based only
on this report.

Phase 6V-MV does not authorize Google Sheets sync, migration, deployment, or
CSP changes. Any future Production CSP Report-Only rollout remains a separate,
explicitly approved operator action.

STOP after this report.
