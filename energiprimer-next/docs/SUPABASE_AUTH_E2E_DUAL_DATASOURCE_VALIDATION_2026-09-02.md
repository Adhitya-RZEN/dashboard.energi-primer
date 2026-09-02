# Phase 22E.9 — E2E Dual Datasource Validation

Tanggal audit: 2026-09-02  
Mode: read-only  
Status keseluruhan: **BLOCKED — AUTH E2E login flow belum lulus**

Audit ini memverifikasi arsitektur dua datasource yang dikoreksi pada Phase 22E.9:

- Supabase project non-production/E2E hanya digunakan untuk Supabase Auth.
- PostgreSQL lokal existing digunakan untuk Prisma dan business/dashboard data.
- Tidak ada migration, seed, import, provisioning, deployment, atau database write.

## Architecture

| Fungsi | Datasource | Status |
| --- | --- | --- |
| Supabase Auth login/session/admin role | Supabase E2E/non-production | PASS secara konfigurasi; user E2E sebelumnya telah diverifikasi confirmed dan role admin |
| Prisma/business data/dashboard | PostgreSQL lokal existing | PASS |
| Browser Auth client | Supabase public URL + anon key | PASS; tidak menggunakan service-role key |
| Browser business data | Tidak mengakses Prisma secara langsung | PASS |

`run-e2e-with-env.mjs` memuat environment secara eksplisit dari `.env.e2e.local` dan tidak memiliki fallback ke `.env.local`. Wrapper menjalankan Next.js/Playwright dengan datasource dashboard PostgreSQL. Nilai credential tidak dibaca atau ditampilkan dalam laporan ini.

## Environment Audit

| Check | Result |
| --- | --- |
| E2E environment marker | PASS — `non-production` |
| Supabase Auth target | PASS — target E2E |
| Business `DATABASE_URL` source | PASS — `.env.e2e.local`, diklasifikasikan sebagai PostgreSQL lokal loopback |
| `.env.local` fallback | NONE FOUND |
| Production Supabase fallback | NONE FOUND |
| Production database access | 0 |
| Environment values exposed | NO |

Environment E2E hanya boleh menyediakan nilai yang sesuai kontrak loader. `DATABASE_URL` pada konfigurasi ini harus menunjuk ke PostgreSQL lokal untuk `/dashboard`; Supabase E2E tidak digunakan sebagai business database.

## Supabase Auth E2E Verification

Verifikasi read-only dan hasil phase sebelumnya menunjukkan:

- target Auth adalah project Supabase E2E/non-production;
- test user tersedia;
- email telah dikonfirmasi;
- `app_metadata.role` telah diverifikasi sebagai `admin`;
- provisioning tidak dijalankan pada Phase 22E.9;
- service-role credential tidak masuk browser atau Playwright page context.

Auth protection untuk route tanpa session lulus pada run terbaru. Namun, login-dependent tests belum lulus; sehingga session persistence, dashboard authorization setelah login, dan logout belum dapat dinyatakan PASS pada suite terbaru.

## Local PostgreSQL Verification

Semua pemeriksaan berikut bersifat read-only.

| Check | Result |
| --- | --- |
| Prisma `$connect()` | PASS |
| `SELECT 1` | PASS |
| Database identity | `dashboard_pln` |
| Current role | `postgres` |
| Current schema | `public` |
| PostgreSQL | 18.4 on x86_64-windows |
| Schemas found | `public` |
| Public tables | 32 |
| Total public row count | 13,724 |
| PostgreSQL writes | 0 |

### Prisma schema comparison

- Prisma schema models: 30.
- Missing Prisma model tables: 0.
- Scalar column mismatches: 0.
- Observed constraints: 89.
- Available extension: `plpgsql`.
- Additional existing tables: `_prisma_migrations` dan `migrations`.
- Migration required based on comparison: NO.

The two additional migration-related tables were only observed and were not modified.

### Business table row counts

| Table | Rows |
| --- | ---: |
| `biomass_consumptions` | 636 |
| `biomass_cumulative_snapshots` | 7 |
| `biomass_receipts` | 49 |
| `biomass_targets` | 1 |
| `cache` | 4 |
| `cache_locks` | 0 |
| `coal_consumption` | 1,731 |
| `coal_quality` | 1,095 |
| `coal_receipts` | 7 |
| `coal_stock` | 577 |
| `failed_jobs` | 0 |
| `hop_readings` | 636 |
| `job_batches` | 0 |
| `jobs` | 0 |
| `kpi_targets` | 1,095 |
| `migrations` | 11 |
| `password_reset_tokens` | 1 |
| `power_generation` | 1,095 |
| `sessions` | 2 |
| `solar_consumptions` | 212 |
| `solar_receipts` | 7 |
| `spreadsheet_import_logs` | 0 |
| `spreadsheet_import_runs` | 12 |
| `spreadsheet_import_staging` | 3,919 |
| `sync_row_states` | 2,409 |
| `sync_runs` | 8 |
| `sync_schema_changes` | 0 |
| `sync_sources` | 1 |
| `sync_worksheets` | 199 |
| `units` | 3 |
| `users` | 2 |
| `_prisma_migrations` | 5 |

The counts above are metadata/count results only; no business rows were dumped.

## Prisma Verification

Prisma read probes for all dashboard dependencies passed. There is no missing Prisma model table and no scalar-column mismatch requiring a schema change.

The E2E design therefore does not require a separate business schema in the Supabase Auth project. The local PostgreSQL connection remains the business-data dependency for the dashboard test process.

Static/source validation covered `scripts/run-e2e-with-env.mjs`, `playwright.config.ts`, `src/lib/supabase/config.ts`, `src/lib/supabase/server.ts`, `src/lib/prisma.ts`, `src/services/overview.ts`, `src/services/overview-postgres.ts`, and `e2e/supabase-auth.spec.ts`.

## Dashboard Query Verification

The read-only `getPostgresOverviewData({ month: 7, year: 2026, day: 28 })` probe passed.

| Check | Result |
| --- | --- |
| Data source | PostgreSQL normalized data |
| Series rows | 31 |
| Biomass daily rows | 3 |
| Coal daily rows | 3 |
| `biomassReceiptMonthly` | Available |
| `biomassConsumptionMonthly` | Available |
| `coalConsumptionMonthly` | Available |
| `coalStock` | Available |
| `solarConsumptionDaily` | Available |
| `solarConsumptionMonthly` | Available |
| `solarReceiptMonthly` | Available |
| `biomassCumulative` | Available |
| `biomassTargetProgress` | Available |
| `coalReceiptMonthly` | Available |

All ten expected dashboard dependencies exist and are non-empty where data is expected:

- `coal_consumption`
- `coal_stock`
- `coal_receipts`
- `biomass_receipts`
- `biomass_consumptions`
- `solar_receipts`
- `solar_consumptions`
- `hop_readings`
- `biomass_cumulative_snapshots`
- `biomass_targets`

Existing nullable measurement values were observed in the local data (`coal_used`, `quantity_ton`, and `quantity_liter`). They did not prevent the service-level dashboard query from returning the required metric set and were not changed.

## Validation

| Check | Result |
| --- | --- |
| ESLint (`npm run lint`) | PASS |
| TypeScript (`npx tsc --noEmit`) | PASS |
| Playwright discovery | PASS — 5 tests discovered |
| Playwright execution | BLOCKED — 1 passed, 4 failed |

## Playwright E2E Results

Command executed through the E2E wrapper:

```text
npm run auth:e2e
```

Visible result from the latest suite:

| Result | Count |
| --- | ---: |
| Tests discovered | 5 |
| Passed | 1 |
| Failed | 4 |
| Skipped | 0 |

### Passed

- Unauthenticated protected route: the request without a session remained protected.

### Failed

The four login-dependent tests failed in the shared `loginAsAdmin` helper. The focused rerun reproduced the sanitized failure:

```text
page.waitForURL: Test timeout of 30000ms exceeded
waiting for navigation until "load"
```

The wait is at `e2e/supabase-auth.spec.ts:31`, waiting for a pathname beginning with `/dashboard` after the Login button is clicked. The latest run did not show the earlier Auth HTTP 400. No credential value was printed, and the current output does not prove a bad credential; it proves that the expected post-login navigation was not observed within the test timeout.

Because login did not complete in the test flow:

- Admin dashboard authorization after login: NOT VERIFIED.
- Session persistence after reload: NOT VERIFIED.
- Logout/session invalidation: NOT VERIFIED.
- Dashboard UI assertion in those four tests: NOT REACHED.

The Playwright runner did not emit a clean final process summary after the visible failures and was stopped through the existing runner handle. This does not change the visible per-test result above.

## Production Safety

| Safety check | Result |
| --- | --- |
| Production Supabase access | 0 |
| Production database access | 0 |
| Production deployment | NOT RUN |
| Auth provisioning | NOT RUN |
| Migration/seed/import/sync | NOT RUN |
| Credential rotation | NOT RUN |
| Source authentication architecture change | NOT RUN |

## Database Write Audit

- Local PostgreSQL writes: **0**.
- Supabase business-data writes: **0**.
- Supabase Auth admin/provisioning writes: **0**.
- Schema changes: **0**.
- The audit used connection tests, metadata queries, row counts, Prisma read probes, and one read-only overview query.

## Findings

1. **PASS — dual datasource configuration.** Supabase E2E is isolated for Auth, while local PostgreSQL is used for Prisma/dashboard data.
2. **PASS — local business database readiness.** All 30 Prisma model tables exist, scalar columns match, expected dashboard tables are present, and the service-level overview query returns data.
3. **PASS — environment isolation.** E2E execution uses `.env.e2e.local` through the wrapper and has no silent `.env.local` or production fallback.
4. **BLOCKER — Playwright login flow.** Four tests do not observe navigation to `/dashboard` after login within 30 seconds. This is an E2E authentication-flow failure that requires a separate diagnostic/remediation step.
5. **NO ACTION — migration artifacts.** `_prisma_migrations` and `migrations` were observed but not changed; schema comparison does not require migration.

## Conclusion

The **dual-datasource database gate is PASS**: the Auth E2E target and local PostgreSQL business datasource are correctly separated, and local Prisma/dashboard data is available.

The **overall Phase 22E.9 status is BLOCKED** because the current Playwright suite has four login-dependent failures. No migration or database preparation is needed for this blocker. The next safe step is a separate investigation of the browser login request/redirect/session behavior, followed by a rerun of the five tests. No production access or write operation was performed.
