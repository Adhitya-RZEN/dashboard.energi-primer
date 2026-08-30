# Phase 11 — Automated Google Sheets Synchronization

Tanggal validasi: 2026-08-30  
Scope: implementasi dan validasi lokal terhadap source Google Sheets, database
PostgreSQL lokal, dan build Next.js. Tidak ada deployment Vercel.

## PHASE 11 STATUS

**PASS**

Seluruh acceptance gate implementasi lokal lulus. Aktivasi production masih
membutuhkan konfigurasi manual Vercel untuk secret, database pooled connection,
permission service account, dan review dependency HIGH yang sudah ada.

## Arsitektur final

```text
Google Sheets source of truth
        ↓ metadata discovery + stable sheetId registry
server-only REST client (service-account JWT, read-only)
        ↓ exact worksheet read + existing dynamic parser
schema fingerprint gate
        ↓
stable source key + content hash
        ├── INSERT
        ├── UPDATE
        └── SKIP
        ↓
existing transactional Prisma importer
        ↓
PostgreSQL normalized data + sync audit/state
        ↓
Next.js dashboard and protected monitoring page
```

Dashboard tetap membaca PostgreSQL sesuai arsitektur existing. Chart, browser,
dan Client Component tidak memanggil Google Sheets atau membawa credential.

## Checkpoint status

| Checkpoint | Status | Evidence |
| --- | --- | --- |
| S1 — Architecture & audit | PASS WITH FINDINGS | Existing client, parser, importer, data boundary, dan regression baseline diaudit. |
| S2 — Worksheet discovery | PASS | 199 worksheet live terdeteksi; discovery berulang menghasilkan unchanged; registry memakai stable sheet ID. |
| S3 — Incremental sync | PASS | Live run awal 352 row `INSERT`; run berikutnya 352 row `SKIP`; tidak ada duplicate normalized row. |
| S4 — Schema detection | PASS | Unchanged, reorder, new/missing column, rename, type, ambiguous, duplicate, dan empty header teruji. Live schema snapshot tersimpan. |
| S5 — State/audit/recovery | PASS | Run/row/schema state, retry transient Google/DB, partial failure path, dan lease recovery tersedia. |
| S6 — Scheduler | PASS | Endpoint secure, `vercel.json` cron 15 menit, current-period scope, dan manual local trigger tersedia. |
| S7 — Hardening | PASS WITH WARNINGS | Server boundary, safe errors, environment credential pair, retry, lease renewal, quota/performance guardrail. |
| S8 — Final validation | PASS | Monitoring page, baseline regression, typecheck, lint, dan production build lulus. |

## Acceptance and E2E validation

| Test | Result | Notes |
| --- | --- | --- |
| Existing worksheet tanpa perubahan → SKIP | PASS | Live `Juli26-BB`: 352 skipped. |
| Tambah row → INSERT | PASS | Static classification; source Google Sheets tidak dimutasi. |
| Edit row → UPDATE | PASS | Static classification; source Google Sheets tidak dimutasi. |
| Re-run → no duplicate | PASS | Live repeated sync idempotent. |
| New valid worksheet lifecycle | PASS | Discovery creates `DISCOVERED`; valid plan marks `VALIDATED`; persisted state marks `ACTIVE`. |
| Invalid worksheet | PASS | Unsupported title/plan is routed to `SCHEMA_REVIEW`. |
| New column | PASS | `NEW_COLUMN` → `SCHEMA_REVIEW`. |
| Rename candidate | PASS | `RENAME_CANDIDATE` → `SCHEMA_REVIEW`. |
| Worksheet missing | PASS | Registry becomes `MISSING`; no normalized delete. |
| Google timeout/rate limit | PASS | Bounded retry with exponential backoff; auth/permission fail fast. |
| Database transient error | PASS | Codes `P1001`, `P1008`, `P1017`, `P2024`, `P2034` retry safely around writes; constraint errors fail fast. |
| Concurrent sync | PASS | Live lease test blocked second acquisition atomically. |
| July 2026 parity | PASS | KPI and aggregates remain aligned with imported baseline. |
| Existing explicit importer | PASS | Existing import schema/data verification remains PASS. |
| PostgreSQL dashboard | PASS | Overview service reads normalized PostgreSQL data. |
| Dynamic parser | PASS | Existing dynamic parser verification remains PASS. |
| Unit normalization | PASS | Unit 1, Unit 2, Unit 3 preserved. |
| Target Biomassa 70.020 ton | PASS | Database and overview verification remain `70020`. |

## Live evidence

Discovery and state:

- worksheet registry: 199;
- active worksheet after the tested period sync: 1;
- persisted row state: 352;
- open schema changes: 0;
- active leases after completion: 0.

Incremental sync against the local environment:

| Run | Rows scanned | INSERT | UPDATE | SKIP | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial live sync | 352 | 352 | 0 | 0 | SUCCESS |
| Repeated live sync | 352 | 0 | 0 | 352 | SUCCESS |
| Final post-hardening sync | 352 | 0 | 0 | 352 | SUCCESS |

The live read was limited to the existing worksheet period used for validation.
No source sheet was edited and no production database was targeted.

## Database migrations

Applied to the local PostgreSQL database through `prisma migrate deploy`:

1. `20260830160000_add_sheets_sync_state`
   - `sync_sources`
   - `sync_worksheets`
   - `sync_runs`
   - `sync_row_states`
   - `sync_schema_changes`
2. `20260830170000_add_sync_schema_snapshot`
   - additive `schema_snapshot` column on `sync_worksheets`.

Migration status: **PASS — database schema is up to date**.

No `prisma db push`, `prisma db pull`, `prisma migrate reset`, `DROP`,
`TRUNCATE`, or automatic destructive schema change was executed.

## Files created

Documentation:

- `docs/GOOGLE_SHEETS_SYNC_ARCHITECTURE.md`
- `docs/GOOGLE_SHEETS_WORKSHEET_DISCOVERY.md`
- `docs/GOOGLE_SHEETS_INCREMENTAL_SYNC.md`
- `docs/GOOGLE_SHEETS_SCHEMA_DETECTION.md`
- `docs/GOOGLE_SHEETS_SYNC_AUDIT.md`
- `docs/GOOGLE_SHEETS_SYNC_SCHEDULER.md`
- `docs/GOOGLE_SHEETS_SYNC_HARDENING.md`
- `docs/GOOGLE_SHEETS_AUTOMATION_FINAL_REPORT.md`

Implementation and verification files:

- `src/app/api/sync/google-sheets/route.ts`
- `src/services/google-sheets/sync/` (discovery, identity, change detection,
  commit scope, engine, lease, retry, schema detection, cron auth, monitoring)
- `scripts/run-google-sheets-sync.ts`
- `scripts/verify-cron-auth.ts`
- `scripts/verify-google-config.ts`
- `scripts/verify-incremental-sync.ts`
- `scripts/verify-schema-detection.ts`
- `scripts/verify-sync-retry.ts`
- `scripts/verify-sync-state.ts`
- `scripts/verify-worksheet-discovery.ts`
- `prisma/migrations/20260830160000_add_sheets_sync_state/migration.sql`
- `prisma/migrations/20260830170000_add_sync_schema_snapshot/migration.sql`
- `vercel.json`

## Files modified

- `.env.example` — added safe placeholders for `CRON_SECRET` and optional
  server-side service-account environment credentials.
- `package.json` — added sync/manual verification scripts; no new dependency.
- `prisma/schema.prisma` — additive sync registry/state models and schema
  snapshot field.
- `src/lib/google-sheets.ts` — worksheet metadata discovery and optional Vercel
  environment credential source; existing REST/auth/error behavior retained.
- `src/services/google-sheets/dynamic/reader.ts` — exact worksheet reader for
  stable registry association.
- `src/services/google-sheets/import/types.ts`, `plan.ts`, `commit.ts` — source
  identity seed and controlled sync commit scope.
- `src/app/(protected)/monitoring/page.tsx` — sync health counters/status UI.
- Existing environment/deployment documentation was updated to describe the
  scheduler and serverless credential option.

`package-lock.json` was not changed because no dependency was added or upgraded.
Pre-existing unrelated workspace artifacts were preserved.

## Security verification

- Google client and sync services use `server-only`.
- `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, and Google credentials remain
  server-side.
- `.env.local` and `credentials/` remain ignored and are not tracked.
- `.env.example` contains placeholders only.
- Cron endpoint requires `Authorization: Bearer CRON_SECRET` and constant-time
  comparison.
- Endpoint does not accept arbitrary spreadsheet ID, worksheet, range, or DB
  target from request input.
- Client bundle scan found no sensitive credential markers in `.next/static`.
- Error responses and sync audit summaries do not expose credentials, tokens,
  private keys, database URLs, or arbitrary stack traces.

## Build and regression result

| Check | Result |
| --- | --- |
| `npm run sync:verify-discovery` | PASS |
| `npm run sync:verify-incremental` | PASS |
| `npm run sync:verify-schema` | PASS |
| `npm run sync:verify-retry` | PASS |
| `npm run sync:verify-cron-auth` | PASS |
| `npm run sync:verify-config` | PASS |
| `npm run sync:verify-state` | PASS |
| `npm run dynamic:verify` | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS |
| Existing database/import/overview verification | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Sensitive marker scan in client bundle | PASS |

Verification scripts emit non-blocking Node warnings about the experimental
TypeScript loader and module type detection. They do not affect lint,
typecheck, build, or data integrity.

## Dependency finding

`npm audit --omit=dev --json` returned:

- 0 CRITICAL;
- 0 MODERATE;
- 0 LOW;
- 3 HIGH findings in `prisma@6.19.3` / `@prisma/config` / `deepmerge-ts@7.1.5`.

The reported advisory concerns recursive object-graph stack exhaustion. npm
offered Prisma `6.12.0` as the available remediation, which is a version
downgrade and can affect generated/runtime behavior. It was not applied.
Prisma dependency remediation is **REQUIRES MANUAL APPROVAL**; do not use
`npm audit fix --force`.

## Known limitations

1. Google Sheets row deletion is not propagated as PostgreSQL deletion. Missing
   rows are retained until an explicit archive policy is approved.
2. Schema changes are blocked and audited, but approval/resolution remains a
   controlled operator action rather than an automatic migration.
3. Range/metadata cache is process-local; durable idempotency is provided by
   PostgreSQL sync state.
4. Existing normalized importer writes are sequential inside a transaction and
   require load testing before very large historical backfills.
5. Production alert delivery for failed/partial sync runs is not configured.
6. A local credential file is not available automatically on Vercel; production
   should use the server-only service-account environment pair or an approved
   secret/file provisioning mechanism.

## Manual actions required before production scheduling

1. Configure `CRON_SECRET` in the Vercel environment.
2. Configure `GOOGLE_SHEETS_SPREADSHEET_ID` and either the approved credential
   file mechanism or both `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
3. Grant the service account read access to the source spreadsheet and run a
   read-only Preview smoke test.
4. Configure an approved pooled PostgreSQL `DATABASE_URL` reachable from Vercel.
5. Review the Prisma/deepmerge HIGH advisory and decide whether a tested version
   change is approved.
6. Decide alerting, schema-review ownership, and source-row archive policy.

These actions are configuration/infrastructure decisions and were intentionally
not performed in this phase. No deployment was made.
