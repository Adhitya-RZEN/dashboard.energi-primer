# Vercel Configuration Readiness

> Historical snapshot from 2026-08-28. The current repository now contains
> `vercel.json` for the Google Sheets sync cron; the Phase 6B governance report
> is the authoritative migration/build separation document.

Tanggal: 2026-08-28  
Target: Vercel, tanpa project mutation atau deployment.

## Recommended configuration

| Item              | Recommendation                                                     | Status                        |
| ----------------- | ------------------------------------------------------------------ | ----------------------------- |
| Root Directory    | energiprimer-next karena repository juga berisi Laravel backend    | REQUIRES MANUAL CONFIGURATION |
| Framework         | Next.js 16.3.3 App Router                                          | PASS                          |
| Install command   | Default npm install dari package-lock.json                         | PASS                          |
| Build command     | npm run build                                                      | PASS locally                  |
| Start command     | Vercel managed; local equivalent npm run start                     | PASS                          |
| Node runtime      | Pin a compatible Node 20/22/24 version; local audit used Node 24.x | REQUIRES MANUAL CONFIGURATION |
| Prisma generation | @prisma/client postinstall generates client; no migration in build | PASS WITH WARNINGS            |
| Runtime           | proxy.ts/server modules require Node-compatible runtime            | PASS WITH WARNINGS            |
| vercel.json       | Contains only the Google Sheets sync cron; no migration hook            | PASS                          |

Vercel documents Node.js 20.x, 22.x, and 24.x as available runtimes; choose one explicitly for reproducibility. See [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Required environment configuration

See PRODUCTION_ENVIRONMENT.md. Required categories:

- reachable PostgreSQL DATABASE_URL;
- Auth.js secret/trust/canonical URL;
- production mail provider;
- Google Sheets server-side credential and spreadsheet ID;
- public-safe app name/URL.

No actual values are documented.

## Runtime dependencies

### PostgreSQL/Prisma

Vercel must reach an externally accessible PostgreSQL endpoint. Pooler, SSL, connection limit, firewall, and timeout are operator decisions. No schema or migration operation is needed for the build.

### Google Sheets

Current code reads a local credential path. The ignored local JSON must not be committed; production needs Vercel secret provisioning or an approved credential-loading refactor. See GOOGLE_SHEETS_VERCEL_READINESS.md.

### Authentication/mail

Auth.js and bcrypt run server-side. The active contract is Credentials → Prisma
→ PostgreSQL/Supabase with JWT sessions. Email/recovery and Resend configuration
are decommissioned by Phase 6C and must not be provisioned for this app.

### Filesystem and jobs

No persistent upload/storage, queue worker, scheduler, or background job requirement was found in the target. Static assets are under public/. Vercel Functions have read-only filesystem semantics; temporary filesystem use is not persistent. See [Vercel Functions runtimes](https://vercel.com/docs/functions/runtimes).

## Deployment risks

1. Root Directory misconfiguration could select the Laravel project instead of the target.
2. Local loopback database cannot serve a Vercel Function.
3. Local Google credential file is absent from deployment.
4. Stale external mail/recovery configuration must be removed or revoked after
   confirming that no other application depends on it.
5. Prisma advisory remediation is unresolved.
6. Auth.js beta and unmeasured preview performance need manual review.

## Manual smoke test after configuration

1. Deploy only a Vercel Preview after approvals.
2. Verify unauthenticated redirect and admin login with disposable/test account.
3. Run read-only database check through application paths.
4. Read the configured Google worksheet/range.
5. Verify Auth.js login/logout with an isolated non-production account.
6. Check build logs, function errors, Web Vitals, and client bundle.

## Status

**READY FOR MANUAL CONFIGURATION, NOT READY FOR DEPLOYMENT.**
