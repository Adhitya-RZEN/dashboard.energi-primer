# Phase 22G.4 - Production DB Read-Only Preflight

## Status

**BLOCKED - PRODUCTION_DB_TARGET_UNVERIFIED**

Additional blocker: **PREVIEW_PRODUCTION_WRITE_RISK**.

Phase 22G.4 tidak dapat menyatakan Vercel Preview aman menggunakan Supabase Production PostgreSQL karena secret `DATABASE_URL` tidak dapat diambil secara aman melalui Vercel CLI. Tidak ada nilai lokal yang digunakan sebagai bukti target Preview.

## Architecture

- Preview Auth: Supabase Auth E2E/non-production public configuration.
- Preview Database: operator menyatakan Supabase Production PostgreSQL melalui Transaction Pooler, tetapi target belum terverifikasi secara independen.
- Phase scope: read-only preflight saja.

## Vercel Preview Environment

| Variable | Status | Notes |
| --- | --- | --- |
| `DATABASE_URL` | PRESENT as Vercel entry; runtime retrieval UNVERIFIED | Secret value tidak dibaca/ditampilkan; target provider, host, database, dan environment belum dapat dipastikan. |
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT | Public configuration tersedia pada probe terisolasi; diperlakukan sebagai E2E/non-production berdasarkan konfigurasi Phase 22G.1. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PRESENT | Nilai tidak dibaca atau ditampilkan. |
| `SUPABASE_AUTH_E2E_URL` | NOT AVAILABLE to isolated CLI probe | Tidak diperlukan untuk browser runtime jika public URL sudah digunakan; identitas E2E tidak dicetak. |
| `SUPABASE_POOLER_URL` | NOT AVAILABLE to isolated CLI probe | Secret reference tidak dapat ditarik; tidak digunakan untuk menggantikan `DATABASE_URL`. |

### Environment retrieval safety

Percobaan `vercel env run` dari repository menghasilkan pesan bahwa secret Preview tidak dapat ditarik dan CLI mencoba memuat `.env.local`. Hasil tersebut tidak diterima sebagai bukti Preview dan tidak digunakan untuk verifikasi target.

Probe kedua dijalankan dari direktori sementara yang tidak memiliki `.env.local`. Hasilnya:

- `DATABASE_URL`: MISSING pada child process karena secret Preview tidak dapat ditarik oleh CLI;
- `NEXT_PUBLIC_SUPABASE_URL`: PRESENT;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: PRESENT;
- tidak ada nilai environment yang dicetak.

Kesimpulan: mekanisme `vercel env run` lokal saat ini tidak menyediakan jalur aman untuk memverifikasi secret Preview tanpa fallback file lokal. Jangan menggunakan fallback tersebut sebagai proof of target.

## Database Target

| Attribute | Result |
| --- | --- |
| Provider | UNVERIFIED; operator menyatakan Supabase |
| Host | REDACTED / UNVERIFIED |
| Port | UNVERIFIED; operator menyatakan Transaction Pooler |
| Database | UNVERIFIED |
| Environment | UNVERIFIED |
| Production target verified | NO |
| Connection mode | UNVERIFIED; expected pooler |
| SSL | UNVERIFIED |
| E2E database excluded | NOT PROVEN from Preview secret |
| Local database excluded | Not used as verification source |

The target cannot be classified as the intended Supabase Production PostgreSQL without accessing the Preview secret through an approved, non-leaking verification path. No full connection string, username, password, API key, or token is recorded here.

## PostgreSQL Validation

| Check | Result | Notes |
| --- | --- | --- |
| DNS | NOT VERIFIED against a confirmed Preview target | No safe target value was available. |
| TCP | NOT VERIFIED against a confirmed Preview target | No safe target value was available. |
| TLS | NOT VERIFIED against a confirmed Preview target | SSL parameters could not be inspected. |
| `SELECT 1` | NOT COMPLETED against a confirmed Preview target | No target proof. |
| PostgreSQL metadata | NOT VERIFIED | Database, role, schema, and version are unknown for the Preview target. |
| Prisma connection | BLOCKED | An invalid fallback run reached Prisma and returned sanitized class `P2010` / PostgreSQL `26000` (`prepared statement does not exist`). This result is not accepted as Preview-target validation. |

No automatic remediation was attempted. No migration, introspection, seed, import, sync, or write was executed.

## Dashboard Read Validation

Because the target database could not be verified, the following checks were not accepted as passed:

- required dashboard tables: NOT VERIFIED;
- Unit 1, Unit 2, Unit 3: NOT VERIFIED;
- Biomass target 70,020 tons: NOT VERIFIED for the Preview target;
- representative KPI query: NOT VERIFIED;
- representative chart aggregation: NOT VERIFIED;
- representative relations/foreign keys: NOT VERIFIED;
- dashboard cutoff behavior: source-level read logic exists, but database runtime validation was not completed.

The previously recorded local/Production baselines are not substituted for a current verified Preview connection.

## Write Safety Audit

| Area | Finding | Risk | Status |
| --- | --- | --- | --- |
| Dashboard read service | `src/services/overview-postgres.ts` uses Prisma read operations for dashboard data | Read-only during normal dashboard rendering | READ / REVIEW |
| Sync API | `src/app/api/sync/google-sheets/route.ts:26-31` calls the incremental sync engine with `allowNonLocalDatabase: true` | A valid authorized request can start a business-data write against a non-local database | FOUND - BLOCKING RISK |
| Cron authorization | `src/services/google-sheets/sync/cron-auth.ts:15-21` checks `CRON_SECRET` with timing-safe comparison | Authorization reduces exposure but does not make Preview writes harmless | REVIEW |
| Import commit | `src/services/google-sheets/import/commit.ts:324-464` contains create/upsert/update operations | Writes import and normalized business data | FOUND - not executed |
| Sync engine | `src/services/google-sheets/sync/engine.ts:99-568` updates registry/run state and invokes import commit | Writes when sync route is invoked | FOUND - not executed |
| CLI migration/data scripts | `package.json` and `scripts/` contain migration/data-admin commands | Maintenance capability; not invoked by the build | NOT STARTUP-ACTIVE |

The source-level write path is intentional for the synchronization feature, but it is not safe to classify a Preview deployment connected to Production as fully read-only while this route is available and configured for non-local writes. No source change was made because automatic hardening would change runtime behavior and requires a separate approval.

## Cron Safety

`vercel.json` declares `/api/sync/google-sheets` with schedule `0 1 * * *`.

The route accepts GET and POST, requires `CRON_SECRET`, and passes `allowNonLocalDatabase: true`. No cron was run. Preview scheduling behavior was not deployed or exercised, so the absence of a Preview cron invocation cannot be claimed from this audit.

Decision: **BLOCKED - PREVIEW_PRODUCTION_WRITE_RISK** until an explicit deployment policy prevents Preview from invoking the Production-mutating sync path, or an approved isolation/control change is made.

## Migration / Seed Safety

- `package.json` build script is `next build`; it does not invoke migration, seed, import, or sync.
- `next.config.ts` contains headers and development-origin configuration only.
- No `prisma migrate deploy`, `prisma db push`, seed, import, or sync was run.
- Existing maintenance scripts remain available but were not executed.

## Production Safety

- DB writes: 0
- Migration: 0
- Seed: 0
- Import: 0
- Sync: 0
- Deployment: 0
- Production schema changes: 0
- Production configuration changes: 0
- Supabase Auth provisioning: 0
- `.env.local` used as accepted verification evidence: 0

The first Vercel CLI attempt exposed an unsafe fallback behavior message indicating `.env.local` was loaded. That run was discarded as target evidence and its database result was not used. No credential value is included in this report. The safe isolated probe confirmed that the Preview secret was unavailable without that fallback.

## Validation

| Validation | Result |
| --- | --- |
| ESLint | PASS |
| TypeScript | PASS |
| Prisma schema/build validation | Existing Phase 22F PASS; no environment-backed Prisma validation run in this phase |
| Vercel Preview environment probe | PARTIAL; public variables PRESENT, secret database variable unavailable to isolated CLI |
| Read-only DB preflight against verified Preview target | NOT COMPLETED |
| Production access | 0 accepted verification accesses; no write |
| Database writes | 0 |

## Decision

`BLOCKED - PRODUCTION_DB_TARGET_UNVERIFIED`

The additional static risk is `BLOCKED - PREVIEW_PRODUCTION_WRITE_RISK`.

Phase 22G.5 must not run.

## Manual Action Required

1. Provide a Vercel-supported, operator-controlled read-only verification path for the Preview `DATABASE_URL` secret without pulling it into chat, `.env.local`, or this repository.
2. Confirm the target is the intended Supabase Production PostgreSQL, with SSL and the intended pooler mode.
3. Decide and document whether Preview is allowed to share Production business data.
4. Before any deployment, prevent Preview from invoking the Production-mutating Google Sheets sync route, or obtain separate approval for a source/configuration hardening change.
5. Because a database connection credential appeared in the editor/chat context, rotate that database password manually and update the affected Vercel/local configuration through the operator's secret-management process. Do not send the replacement credential through chat.

These actions are manual and were not performed by Phase 22G.4.
