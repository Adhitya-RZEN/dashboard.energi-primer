# Phase 22G — Vercel Preview Deployment

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Recovery/mail references in
> this preview record are retained for evidence only.

Tanggal: 2026-09-02  
Scope: persiapan dan pemeriksaan Vercel Preview dengan target Supabase Auth E2E/non-production.  
Production deployment dan seluruh operasi Production tidak dilakukan.

## Objective

Menyediakan Preview deployment yang menggunakan:

- Supabase Auth E2E/non-production;
- PostgreSQL non-production yang dapat dijangkau Vercel;
- konfigurasi environment Preview terpisah;
- dashboard Next.js tanpa akses ke Production.

## Deployment Target

Target yang diminta: **Vercel Preview**.

Hasil inspeksi:

- Vercel CLI tersedia dan berhasil diautentikasi.
- Project Vercel dashboard-energi-primer ditemukan pada scope aktif.
- Repository lokal belum memiliki .vercel/project.json.
- Tidak ada Preview URL yang dapat digunakan.
- Deployment tidak dijalankan karena target project dan environment Preview belum tersedia.

Project settings yang terbaca secara aman:

- Root Directory: energiprimer-next.
- Node.js Version: 24.x.
- Framework Preset: Other, bukan Next.js yang terdeteksi secara eksplisit.
- Build command yang ditawarkan Vercel: npm run vercel-build atau npm run build.

Framework preset dan repository link perlu dikonfirmasi operator sebelum deployment. Tidak ada perubahan setting yang dilakukan.

## Environment Matrix

Status berikut hanya berasal dari source/configuration dan metadata Vercel yang aman. Nilai secret tidak dibaca atau ditampilkan.

| Variable | Scope | Preview status | Required | Purpose |
| --- | --- | --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Public/client-safe | MISSING | YES | Supabase Auth E2E URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Public/client-safe | MISSING | YES | Supabase Auth E2E browser client |
| NEXT_PUBLIC_APP_URL | Public/client-safe | SET for Preview | Recommended | Preview URL/safe redirect fallback |
| NEXT_PUBLIC_APP_NAME | Public/client-safe | SET for Preview | Optional | Application display name |
| DATABASE_URL | Server-only | SET for Preview, target UNKNOWN | YES | Prisma business data datasource |
| DASHBOARD_DATA_SOURCE | Server-only | NOT CONFIGURED | Recommended | Explicitly select postgres |
| CRON_SECRET | Server-only | SET for Preview | Only if Preview cron enabled | Cron authentication |
| GOOGLE_SHEETS_SPREADSHEET_ID | Server-only | SET for Preview | Only if Preview sync enabled | Sheets sync target |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Server-only | SET for Preview | Only if Preview sync enabled | Sheets service identity |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Server-only | SET for Preview | Only if Preview sync enabled | Sheets service credential |
| GOOGLE_SHEETS_CACHE_TTL | Server-only | SET for Preview | Optional | Sheets cache duration |
| GOOGLE_SHEETS_CREDENTIALS_PATH | Server-only/local | SET for Preview | Optional local alternative | Not suitable as sole Vercel credential |
| SUPABASE_DIRECT_URL | Operator tooling | NOT CONFIGURED | No runtime requirement | Direct operator/preflight connection |
| SUPABASE_POOLER_URL | Operator tooling | NOT CONFIGURED | No runtime requirement | Pooler operator/preflight connection |
| AUTH_SECRET | N/A | NOT USED | No | Supabase Auth runtime does not require it |
| RESEND_API_KEY / RESEND_FROM_EMAIL | N/A | NOT USED | No | Not used by final password recovery runtime |
| E2E provisioning variables | E2E-only | NOT FOR PREVIEW | No | Playwright/provisioning only |

The local E2E environment file remains separate. Its values were not printed and are not automatically transferred to Vercel. The Vercel environment listing also contains legacy AUTH_* and RESEND_* variables; they are not used by the current Supabase Auth runtime and were not removed automatically.

The DATABASE_URL entry is listed for both Production and Preview. Because its value is hidden, this audit cannot establish that the Preview target is non-production. It requires manual verification or replacement with a dedicated non-production datasource before deployment.

## Supabase Auth Preview

Source/configuration readiness:

- Application Auth runtime uses Supabase Auth.
- The intended Auth target is the existing E2E/non-production project.
- Production Supabase Auth is not an allowed target for this phase.
- Existing E2E Auth validation passed in the local E2E flow in the preceding phase.
- Preview Auth cannot be smoke-tested until a Preview URL and Preview environment variables exist.
- Supabase redirect allowlist must later include the exact Preview callback URL.

Status: **BLOCKED — required public Supabase variables are missing from Preview**.

## Database Preview

A Vercel Preview must use a non-production PostgreSQL datasource that is reachable from Vercel.

Current audit result:

- The Vercel project exists, but the repository is not linked locally.
- Preview environment entries exist, but the two required public Supabase variables are missing.
- A Preview DATABASE_URL entry exists, but its target is hidden and cannot be verified as non-production.
- A local developer datasource cannot be used as a Vercel datasource.
- Production DATABASE_URL is explicitly prohibited and was not used.
- Supabase Direct and Transaction Pooler variables are not interchangeable automatically with the application DATABASE_URL.
- The Preview datasource must be configured manually and must use a non-production Supabase/PostgreSQL target.
- Prisma connection, overview query, KPI, and chart runtime cannot be verified remotely before that datasource exists.

Status: **BLOCKED — PREVIEW_DATABASE_NOT_REACHABLE_FROM_VERCEL** (not verifiable as safe/reachable because the Preview datasource target is hidden and the required Auth environment is incomplete).

## Build Result

| Check | Result |
| --- | --- |
| Source-level Prisma validation from Phase 22F | PASS |
| Source-level Next.js production build from Phase 22F | PASS |
| Vercel Preview build | NOT RUN |
| Production build/deployment | NOT RUN |
| Database write during this phase | 0 |

The previous local build result does not substitute for a Vercel Preview build because the Vercel project and Preview environment are not configured.

## Deployment Result

**NOT RUN**.

Reason:

1. The Vercel project exists, but the repository is not linked locally.
2. Required public Supabase Preview variables are missing.
3. The Preview DATABASE_URL target cannot be verified as non-production without reading its hidden value.
4. The Vercel framework preset is Other and needs manual confirmation for Next.js.
5. Deploying without these controls could create an unusable or unsafe Preview.

No project was created, no project was linked, and no deployment was triggered.

## Preview URL

**NOT AVAILABLE** — Preview deployment was not run.

## Authentication Smoke Test

| Test | Result |
| --- | --- |
| /login | NOT RUN |
| Unauthenticated /dashboard protection | NOT RUN remotely |
| E2E admin login | NOT RUN remotely |
| Redirect to /dashboard | NOT RUN remotely |
| Logout | NOT RUN remotely |
| Protected route after logout | NOT RUN remotely |

The local Supabase Auth E2E result from the preceding phase is not presented as a Preview result.

## Dashboard Smoke Test

| Test | Result |
| --- | --- |
| Dashboard render on Preview | NOT RUN |
| KPI render on Preview | NOT RUN |
| Chart data on Preview | NOT RUN |
| Error state check on Preview | NOT RUN |

## Database Runtime Test

| Check | Result |
| --- | --- |
| Prisma connection from Vercel | NOT RUN |
| SELECT 1 from Preview datasource | NOT RUN |
| Overview query | NOT RUN |
| KPI data | NOT RUN |
| Chart data | NOT RUN |
| Preview database writes | 0 |

The required runtime checks are intentionally deferred until a non-production Preview datasource is configured and reachable.

## Security Verification

Static/source-level checks from Phase 22F remain:

- DATABASE_URL is server-only.
- Google service credential variables are server-only.
- Service-role/admin credentials are not used in browser code.
- Auth tokens and passwords are not logged.
- Production credential values were not read or used.
- Public Supabase variables are the only Supabase values intended for the browser.
- No hardcoded credential was found in the audited source/configuration.
- No deployment payload was sent.
- No Preview cron or Google Sheets sync was invoked.

## Production Safety

Production safety gate:

| Operation | Count |
| --- | ---: |
| Production Auth users created | 0 |
| Production database writes | 0 |
| Production migrations | 0 |
| Production seed | 0 |
| Production import | 0 |
| Production sync | 0 |
| Production deployments | 0 |
| Production Supabase settings changed | 0 |

Additional safeguards:

- .env.local was not read.
- No Production DATABASE_URL was used.
- No Production Supabase Auth target was used.
- No local source authentication/business logic was changed.

## Findings

1. Vercel CLI is available and the intended project dashboard-energi-primer is present.
2. The repository is not linked to a Vercel project.
3. Required public Supabase Preview variables are missing.
4. A non-production PostgreSQL datasource reachable from Vercel is not yet established or verifiable.
5. Supabase Auth redirect URLs cannot be finalized without the Preview URL.
6. Google Sheets should remain disabled for Preview unless a separate non-production sync test is explicitly required.
7. The existing vercel.json contains a daily cron schedule; no cron was invoked. Operator must confirm Preview cannot mutate Production data through that route.
8. The source-level build passed in Phase 22F, but remote Preview build remains untested.
8. Vercel reports Framework Preset Other; operator must confirm/set the project framework to Next.js before deployment.
9. The source-level build passed in Phase 22F, but remote Preview build remains untested.
10. Node requirement is >=22.0.0; the project build/runtime configuration is otherwise compatible at source level.

## Blockers

**BLOCKED — PREVIEW_DATABASE_NOT_REACHABLE_FROM_VERCEL**

The blocker is configuration/availability, not a confirmed database failure: the required public Supabase Preview variables are missing, and the hidden DATABASE_URL target cannot be verified as a non-production datasource reachable from Vercel.

Do not replace the missing Preview datasource with Production DATABASE_URL.

## Recommended Next Phase

Before retrying deployment, the operator should:

1. Link the repository root directory to dashboard-energi-primer, with Root Directory set to energiprimer-next.
2. Confirm the Vercel Framework Preset is Next.js and the build command is npm run build.
3. Configure Preview-only values through Vercel Dashboard:
   - Supabase E2E public URL;
   - Supabase E2E anon key;
   - non-production PostgreSQL DATABASE_URL reachable from Vercel;
   - DASHBOARD_DATA_SOURCE=postgres;
   - NEXT_PUBLIC_APP_URL for the Preview domain.
4. Keep Google Sheets and Preview cron disabled unless a separate non-production configuration is approved.
5. Add the exact Preview Auth callback URL to the Supabase E2E redirect allowlist.
6. Verify the non-production database uses the appropriate remote connection/pooler configuration and SSL; do not reuse a Production target.
7. Run a read-only Preview database smoke check before dashboard testing.
8. Run the Preview deployment without the production flag only after the above checks pass.
9. Run the requested Auth and dashboard smoke tests against the Preview URL.
10. Re-audit that no Production access or writes occurred.

## Final Status

**BLOCKED**

Required Vercel Preview deployment was not performed because required public Supabase variables are missing and the hidden Preview DATABASE_URL cannot be verified as non-production/reachable. No Production resource was touched, and no fallback to Production was attempted.
