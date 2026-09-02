# Phase 22G.4A - Preview Production Write-Safety Hardening

## Status

**PASS_WITH_REVIEW**

Environment-aware write protection telah diterapkan pada boundary sync API. Vercel Preview ditolak sebelum autentikasi cron dan sebelum sync engine dipanggil. Verifikasi target database Production tetap belum dilakukan dan masih menjadi blocker terpisah dari Phase 22G.4.

## Problem

Preview direncanakan membaca Supabase Production PostgreSQL. Source sebelumnya mengizinkan route sync memanggil engine dengan `allowNonLocalDatabase: true`, sehingga invocation yang terotorisasi dapat memulai import dan mutation business data pada database non-local.

Tujuan hardening adalah menjaga fitur sync Production tetap aktif, tetapi membuat Preview menjadi dashboard read-only.

## Environment Detection

Canonical policy berada di `src/lib/deployment-environment.ts` dan memprioritaskan `VERCEL_ENV`. `NODE_ENV` tidak dipakai untuk menyimpulkan deployment Production.

| Deployment identity | Policy |
| --- | --- |
| `VERCEL_ENV=production` | Production; sync allowed |
| `VERCEL_ENV=preview` | Preview; sync denied |
| `VERCEL_ENV=development` atau `VERCEL_ENV` tidak tersedia | Development; existing behavior preserved |
| Nilai `VERCEL_ENV` tidak dikenal | Denied fail-closed |

Ini membedakan Vercel Preview dari Vercel Production walaupun keduanya dapat menjalankan Next.js production build/runtime.

## Sync Route

`src/app/api/sync/google-sheets/route.ts` sekarang menjalankan environment gate pada awal handler.

| Environment | Sync API | Google Sheets mutation |
| --- | --- | --- |
| Production | ALLOWED setelah `CRON_SECRET` valid | ALLOWED sesuai behavior existing |
| Preview | DENIED dengan HTTP 403 | DENIED; engine tidak dipanggil |
| Development | Existing behavior | Existing behavior |
| Unknown | DENIED dengan HTTP 403 | DENIED; fail-closed |

Response Preview/unknown tidak menyertakan database identity, credential, atau detail internal. Guard terjadi sebelum pemeriksaan `CRON_SECRET` dan sebelum `runGoogleSheetsIncrementalSync`.

## Cron

`vercel.json` tidak diubah. Schedule Production tetap `0 1 * * *` untuk `/api/sync/google-sheets`.

Cron authorization melalui `CRON_SECRET` tetap dipertahankan. Authorization tidak dapat melewati environment gate karena Preview ditolak lebih dahulu. Jika Preview menerima invocation apa pun, route berhenti dengan HTTP 403 tanpa memulai sync.

Preview scheduling belum diuji melalui deployment, sesuai scope phase. Application-level guard menjadi defense-in-depth.

## Write Paths

| Path | Mutation | Preview Reachable | Protection |
| --- | --- | --- | --- |
| `src/app/api/sync/google-sheets/route.ts` | Memulai sync/import | No after environment gate | `isSyncAllowedEnvironment()` before cron check and engine invocation |
| `src/services/google-sheets/sync/engine.ts` | Registry/run-state updates and import orchestration | No through guarded Preview route | Boundary guard at exposed route; service behavior unchanged |
| `src/services/google-sheets/import/commit.ts` | Create/upsert/update normalized business data | No through guarded Preview route | Commit behavior unchanged; only Production/development allowed entry remains |
| `src/services/google-sheets/sync/cron-auth.ts` | No business mutation | Auth helper | Retained; cannot bypass Preview gate |
| Dashboard services under `src/services/*` | Prisma read queries | Yes | Read-only dashboard path |
| CLI migration/import/maintenance scripts | Maintenance mutations | Not Vercel startup path | Not executed; documented as operator-only |

Static audit did not identify another exposed `src/app/api` business-write route. Existing import/sync write implementation was not modified.

## Files Changed

- `src/lib/deployment-environment.ts`
- `src/app/api/sync/google-sheets/route.ts`
- `scripts/verify-preview-write-safety.ts`
- `package.json`
- `docs/VERCEL_PREVIEW_WRITE_SAFETY_HARDENING_2026-09-02.md`

No dependency was added, so `package-lock.json` was not changed.

## Files Not Changed

- `vercel.json` and Production cron configuration
- database schema and Prisma migrations
- Production environment variables
- `.env.local`
- Supabase Production database
- Google Sheets data and sync semantics
- Authentication and authorization architecture
- `src/services/google-sheets/import/commit.ts` business logic

## Validation

| Validation | Result |
| --- | --- |
| `npm run verify:preview-write-safety` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| Preview policy test | PASS; denied before cron auth and sync engine |
| Production policy test | PASS; allowed by environment policy |
| Development compatibility test | PASS; existing behavior preserved |
| Unknown environment test | PASS; denied fail-closed |
| Database writes | 0 |
| Migration | 0 |
| Seed | 0 |
| Import | 0 |
| Sync | 0 |
| Cron execution | 0 |
| Deployment | 0 |

No provisioning, E2E, database preflight, or Vercel deployment was run.

## Production Behavior Regression Check

Production behavior remains available when Vercel identifies the deployment as `production`. The following were not changed:

- `allowNonLocalDatabase: true` in the Production sync route invocation;
- cron schedule and cron secret validation;
- Google Sheets import mapping and commit semantics;
- dashboard read queries;
- database schema and authentication configuration.

Local development without `VERCEL_ENV` continues to use the existing behavior. An unknown explicit deployment identity is denied to avoid accidental mutation.

## Security Decision

The Preview sync route is now protected at the application boundary and cannot reach the sync/import mutation path through a normal Preview request, including a request carrying a valid cron authorization header.

However, Preview is not yet declared fully ready to use Supabase Production PostgreSQL as a read-only datasource because Phase 22G.4 could not verify the Preview `DATABASE_URL` target through a safe secret path. The earlier Vercel CLI fallback to `.env.local` was intentionally not used as evidence.

Decision: **Preview write path hardened; overall Production DB readiness remains under review.**

## Next Gate

`BLOCKED - PRODUCTION_DB_TARGET_UNVERIFIED`

Phase 22G.4B must not run until an operator provides a safe, non-leaking way to verify the Vercel Preview database target, SSL, Prisma connectivity, schema, and dashboard read queries. Phase 22G.4B and deployment were not run.

## Manual Approval Required

Any additional change to disable sync through Vercel configuration, split Preview/Production cron configuration, or introduce a separate database target requires separate operator approval. No such change was made in this phase.
