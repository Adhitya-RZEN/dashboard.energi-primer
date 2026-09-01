# Phase 21E-S — Supabase Security Exposure Audit

Date: 2026-09-01  
Status: **PASS WITH REVIEW — no remediation performed**

This is a read-only security exposure audit after Phase 21E schema migration.
It does not enable/disable RLS, create/drop policies, grant/revoke privileges,
alter schema, read business rows, or change application configuration.

## Executive summary

The existing application architecture does **not** use Supabase Data API from
the browser. The dashboard calls Next.js server components, server actions,
route handlers, Auth.js, and server-only Prisma.

The Supabase database posture is nevertheless unsafe for importing business
data without a separately approved hardening step:

- 30 application tables plus `_prisma_migrations` exist in `public`.
- Effective privileges for `anon` and `authenticated` are `ALL` on every one
  of those 31 tables (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
  `REFERENCES`, and `TRIGGER`).
- RLS is disabled on 30 public tables; `sessions` is the one table observed
  with RLS enabled.
- There are no policies in the public schema.
- The target currently has no business rows, so there is no current row
  disclosure. After data import, the grant posture would create a conditional
  direct Data API read/write exposure if the public schema is available through
  PostgREST/Data API.
- No Supabase browser client or direct REST/GraphQL access was found in the
  application source.

The distinction is important: **direct browser access in this codebase is NO**,
while **effective database/Data API grant exposure is YES**. Database grants
must be hardened before business data is imported or production traffic is
enabled, subject to manual approval.

## Audit scope and evidence

The audit used `scripts/audit-supabase-security-exposure.mjs` with
`SUPABASE_DIRECT_URL`. It queried only database metadata:

- current database, role, schema, PostgreSQL version, and SSL state;
- public table inventory and RLS flags;
- `pg_policies` policy inventory;
- effective table privileges for `anon`, `authenticated`, and `service_role`;
- public schema privileges and selected role attributes;
- installed extension names/versions.

No business row, password hash, token, payload, exception, or raw table value
was selected. The source audit used static searches and production bundle
marker checks. No database write was executed.

## Supabase metadata result

| Check | Result |
| --- | --- |
| Direct Connection | PASS |
| SSL | PASS |
| PostgreSQL | 17.6 |
| Database / schema | `postgres` / `public` |
| Current audit role | `postgres` |
| Application tables | 30/30 |
| Public base tables including Prisma metadata | 31 |
| Business rows currently present | 0 |
| Public policies | 0 |
| RLS disabled | 30 public tables |
| RLS enabled | `sessions` only |
| `anon` schema USAGE | YES |
| `authenticated` schema USAGE | YES |
| `anon`/`authenticated` schema CREATE | NO |
| Database writes | 0 |
| Schema changed | NO |

The existing Supabase-managed objects in `auth`, `realtime`, `storage`, and
`vault` were not inspected as application tables and were not altered.

Role attributes observed:

| Role | Superuser | Bypass RLS | Can login |
| --- | --- | --- | --- |
| `anon` | NO | NO | NO |
| `authenticated` | NO | NO | NO |
| `service_role` | NO | YES | NO |
| `postgres` | NO | YES | YES |

`service_role` bypassing RLS is a Supabase platform characteristic and is
acceptable only for trusted server-side use. The target administrative
`postgres` role also bypasses RLS; it must not automatically become the
runtime application role without a separate least-privilege decision.

## Table inventory — all application tables

The classification below is based on the schema and application role, not on
reading row content.

Legend: `B` business data, `A` authentication data, `S` sensitive or potentially
sensitive content, `I` internal application state, `Q` cache/queue, and `M`
Prisma migration metadata. Every table is expected to be server-only in the
current architecture.

| Table | Purpose | Class | Business | Credential/auth content | Expected access |
| --- | --- | --- | --- | --- | --- |
| `users` | Auth.js user accounts | A/S/I | NO | Password hash and identity; YES | Server only |
| `password_reset_tokens` | Password-reset token records | A/S/I | NO | Reset token hash; YES | Server only |
| `sessions` | Legacy session records | A/S/I | NO | Session payload; auth data YES | Server only |
| `cache` | Login throttle/application cache | I/Q | NO | No by schema; treat values as internal | Server only |
| `cache_locks` | Cache locks | I/Q | NO | No by schema | Server only |
| `jobs` | Background-job queue | I/Q | NO | Payload is internal | Server only |
| `job_batches` | Job batch state | I/Q | NO | Internal state | Server only |
| `failed_jobs` | Failed job payloads/exceptions | I/Q/S | NO | Potentially sensitive payload/exception | Server only |
| `units` | Operational unit master data | B | YES — reference | No | Server only |
| `coal_stock` | Coal stock measurements | B | YES | No | Server only |
| `coal_quality` | Coal quality measurements | B | YES | No | Server only |
| `coal_consumption` | Coal consumption measurements | B | YES | No | Server only |
| `power_generation` | Power-generation measurements | B | YES | No | Server only |
| `kpi_targets` | Unit KPI target/actual measurements | B | YES | No | Server only |
| `spreadsheet_import_logs` | Import outcome log | I | No — metadata | No by schema | Server only |
| `sync_sources` | Google Sheets source registry | I | No — metadata | No by schema | Server only |
| `sync_worksheets` | Worksheet discovery/sync state | I | No — metadata | No by schema | Server only |
| `sync_runs` | Sync execution state/counters | I | No — metadata | No by schema | Server only |
| `sync_row_states` | Incremental sync identities/hashes | I | No — metadata | No by schema | Server only |
| `sync_schema_changes` | Detected worksheet schema changes | I | No — metadata | No by schema | Server only |
| `spreadsheet_import_runs` | Controlled import execution state | I | No — metadata | No by schema | Server only |
| `spreadsheet_import_staging` | Raw/normalized staging rows | B/I | YES — source content | No by schema; treat raw text as internal | Server only |
| `biomass_receipts` | Biomass receipt measurements | B | YES | No | Server only |
| `coal_receipts` | Coal receipt measurements | B | YES | No | Server only |
| `biomass_consumptions` | Biomass consumption by unit/date | B | YES | No | Server only |
| `solar_receipts` | Solar receipt measurements | B | YES | No | Server only |
| `solar_consumptions` | Solar consumption measurements | B | YES | No | Server only |
| `hop_readings` | Hours-of-operation readings | B | YES | No | Server only |
| `biomass_targets` | Annual Biomassa target records | B | YES | No | Server only |
| `biomass_cumulative_snapshots` | Cumulative Biomassa realization | B | YES | No | Server only |
| `_prisma_migrations` | Prisma migration bookkeeping | M/I | NO | No business data | Server only |

## RLS, policies, and effective grants per table

The following result applies to each listed table. `ALL*` means the effective
privilege set was true for every operation tested: `SELECT`, `INSERT`,
`UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER`.

| Table | RLS | Policy | `anon` | `authenticated` | `service_role` | Data API grant indicator |
| --- | --- | --- | --- | --- | --- | --- |
| `users` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `password_reset_tokens` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sessions` | Enabled | 0 | ALL* | ALL* | ALL* | YES — RLS may deny non-owner rows without policy |
| `cache` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `cache_locks` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `jobs` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `job_batches` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `failed_jobs` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `units` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `coal_stock` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `coal_quality` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `coal_consumption` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `power_generation` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `kpi_targets` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `spreadsheet_import_logs` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sync_sources` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sync_worksheets` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sync_runs` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sync_row_states` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `sync_schema_changes` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `spreadsheet_import_runs` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `spreadsheet_import_staging` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `biomass_receipts` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `coal_receipts` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `biomass_consumptions` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `solar_receipts` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `solar_consumptions` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `hop_readings` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `biomass_targets` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `biomass_cumulative_snapshots` | Disabled | 0 | ALL* | ALL* | ALL* | YES |
| `_prisma_migrations` | Disabled | 0 | ALL* | ALL* | ALL* | YES |

`Data API grant indicator` is a database-level result from effective grants. It
does not claim that the dashboard currently calls PostgREST. Actual Data API
endpoint exposure depends on Supabase project/API configuration, which was not
changed or queried through an application key in this audit.

## Architecture audit

### Direct browser Supabase access

Static searches found no usage of:

- `supabase-js`;
- Supabase REST `/rest/v1/`;
- Supabase GraphQL `/graphql/v1/`;
- `createBrowserClient` or `createServerClient`;
- `NEXT_PUBLIC_SUPABASE_*`;
- a Supabase browser client.

`DIRECT_BROWSER_SUPABASE_ACCESS = NO`.

`SUPABASE_DIRECT_URL` and `SUPABASE_POOLER_URL` are used by operator-side
scripts/environment documentation, not by browser components. No sensitive
database marker was found in `.next/static/chunks` for `DATABASE_URL`, Prisma,
PostgreSQL connection strings, password-reset table names, or PostgreSQL
catalog access.

### Prisma boundary

- `src/lib/prisma.ts` imports `server-only` and maintains the Prisma singleton.
- Prisma-backed services such as `overview-postgres`, `coal-quality`, and
  `consumption-reports` are server-only.
- Auth.js, password actions, route handlers, and protected layouts execute on
  the server before database access.
- No client component imports Prisma or the Prisma server module.

`PRISMA_SERVER_ONLY = YES`.

### Auth.js and authorization

- Credentials Provider performs normalized email validation, login throttling,
  admin-role filtering, and bcrypt password verification server-side.
- The protected route layout calls `auth()` and redirects unless the session
  role is `admin`.
- Auth.js `authorized` also protects `/dashboard` for the admin role.
- The session callback rechecks the current database user role and
  `updatedAt`-based session version, so role/password changes invalidate older
  JWTs.
- Password change is a Server Action that checks session and role before
  querying/updating the user.
- Password reset stores a bcrypt hash, uses generic responses, validates
  expiry, and changes the password in a transaction.
- Google Sheets sync is protected by a server-side bearer `CRON_SECRET`, not a
  browser role.

`AUTHORIZATION_BEFORE_PRISMA = YES` for protected application paths. Existing
Auth.js live/browser E2E evidence remains governed by the Phase 19 report; this
Phase 21E-S did not create a test user or mutate auth data.

## Security Advisor classification

| Group | Tables | Finding interpretation |
| --- | --- | --- |
| A. Public/reference data | `units` | Currently no direct browser app use; effective public-role grants still expose it conditionally through Data API |
| B. Auth data | `users`, `password_reset_tokens`, `sessions` | Sensitive; must remain server-only and be excluded from public Data API access |
| C. Business data | All coal, biomass, solar, HOP, KPI, and target tables | No rows currently; future imported data would be conditionally readable and writable through effective grants |
| D. Internal application data | Sync and import tables, including staging/logs | Internal metadata/raw source content; not browser data |
| E. Migration metadata | `_prisma_migrations` | Internal schema history; never public |
| F. Cache/queue | `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | Internal operational state; failed payloads may be sensitive |
| G. Sensitive data | `users`, `password_reset_tokens`, `sessions`, potentially `failed_jobs` and staging raw text | Highest protection requirement |

## Findings and risk assessment

### CRITICAL — unrestricted auth/sensitive-table privilege path

`anon` and `authenticated` have effective `ALL*` privileges on `users`,
`password_reset_tokens`, `sessions`, and potentially sensitive operational
tables. `users` contains password hashes and role values; reset-token records
are security-sensitive. If the public Data API exposes these tables, an
attacker could potentially read or modify authentication material, including
creating/modifying account role data. There are currently zero rows, but that
does not make the posture safe for import or production.

This is a conditional database/API exploitability finding, not evidence that
the current Next.js browser calls Supabase directly.

### HIGH — unrestricted business and internal table privilege path

Effective `ALL*` grants cover every business table, import staging table, sync
registry table, cache/queue table, and migration metadata table. If public Data
API access is available, this permits conditional read/write/tamper exposure.
The risk becomes material immediately after business data is imported.

### HIGH — administrative/bypass-RLS role must not be runtime default

The inspected Direct Connection role `postgres` has `rolbypassrls = true`, as
does `service_role`. This is acceptable for controlled administrative
migration, but not a least-privilege runtime role. Selecting a dedicated
non-bypass application role is a production configuration decision and was
not performed.

### MEDIUM — Security Advisor RLS warning and inconsistent RLS state

RLS is disabled on 30 public tables and there are zero policies. This matches
the Security Advisor warning. `sessions` is the exception with RLS enabled but
no policy, which is not a complete authorization design. RLS alone is not a
substitute for restricting public grants, and blindly enabling policies would
not map Auth.js JWT identity to Supabase `auth.uid()`.

### LOW — no direct browser Supabase integration found

No direct browser Supabase client or API call was found. This is a positive
architecture result, not a vulnerability. It does not remove the need to
correct database-level grants before external API exposure or data import.

## Strategy recommendation

**Option B — server-only Prisma architecture plus restricted Data API exposure,
with RLS only where it is needed — is the better fit.**

Reasons:

- The existing dashboard already fetches through Next.js server components and
  server-only services.
- Auth.js owns identity and authorization; the browser does not receive a
  Supabase session context.
- Introducing Supabase Auth/RLS policies for every table would add a second
  identity model and could break imports, cron, and Prisma queries.
- Restricting `anon`/`authenticated` access and reserving trusted roles for
  server-side operations directly matches the current architecture.

Option A (RLS plus policies for every public table) is appropriate only if a
future requirement deliberately adds Supabase Data API clients or multi-tenant
database-enforced isolation. It would require policy design, identity
bridging, role testing, indexes for policy predicates, and a separate approved
architecture change.

## Recommended manual hardening sequence

No item below was executed in Phase 21E-S:

1. Confirm whether the Supabase Data API public schema is required at all. The
   current application needs no direct browser Data API access.
2. Revoke `anon`/`authenticated` table privileges for all internal, auth,
   business, staging, queue, and migration tables; also review default
   privileges so future tables do not inherit `ALL*` access.
3. Keep only explicitly approved read-only public views, if a future external
   consumer actually needs them.
4. Decide whether defense-in-depth RLS is needed and, if yes, design/test
   policies against the actual Auth.js/server role model. Do not enable RLS
   blindly on all tables.
5. Use a dedicated least-privilege runtime database role; reserve the Direct
   administrative role for migration/backup operations.
6. Re-run Security Advisor and read-only effective-privilege checks, then run
   negative API tests before any business-data import.

Privilege changes, policies, role creation, schema moves, and production API
configuration are **REQUIRES MANUAL APPROVAL**. They were intentionally not
automated.

## Final report

| Item | Result |
| --- | --- |
| Tables audited | 30/30 application tables (+ `_prisma_migrations`) |
| Direct browser Supabase access | NO |
| Prisma server-only | YES |
| Data API exposure | YES at effective-grant level for all 31 public tables; actual app browser use NO |
| RLS disabled | 30 public tables |
| RLS enabled | `sessions` only |
| Critical findings | 1 class — auth/sensitive tables have unrestricted effective public-role privileges |
| High findings | 2 classes — business/internal grants; runtime role bypass-RLS review |
| Medium findings | 1 class — Security Advisor RLS warning/inconsistent RLS design |
| Low findings | 1 positive architecture observation |
| Database writes | 0 |
| Schema changed | NO |
| Remediation performed | NO |
| Production blocker | YES until grants/API exposure/runtime role are reviewed before data import |

**Final: PASS WITH REVIEW**

The audit itself passed and the database remained unchanged. Production data
import, API exposure, privilege remediation, RLS policy work, cutover, and
deployment must wait for separate manual approval.
