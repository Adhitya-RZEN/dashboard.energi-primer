# Vercel Configuration Readiness

> CURRENT CONFIGURATION STATE (2026-09-05): The Next.js Production deployment
> is active and was verified in Phase 6K. The only Cron is
> 0 22 * * * (06:00 WITA daily). No migration runs in build, deployment,
> request, or Cron. Runtime traffic uses the pooler database URL; direct
> PostgreSQL is reserved for the production migration workflow. Authentication
> is Auth.js Credentials with Prisma. Preview and Production remain separate,
> and Phase 6L verified one authorized Production sync. Phase 6O did not add
> CSP to Production. Phase 6R validated a production-like runtime and Phase
> 6S remediated the request-time nonce and six dynamic-style locations on
> loopback with a disposable database/admin fixture. Auth.js, dashboard,
> Recharts, tooltip/interaction behavior, and the Report-Only CSP candidate
> passed with zero `script-src-elem`/`style-src-attr` violations. Production
> CSP remains absent and unchanged.
> Phase 6T independently revalidated the local candidate after a clean build
> with two fresh disposable loopback runs and 10/10 nonce match/uniqueness per
> run. Production CSP remains absent and unchanged.

> HISTORICAL / SUPERSEDED SNAPSHOT (2026-08-28). The current repository now contains
> `vercel.json` for the Google Sheets sync cron; the Phase 6B governance report
> is the authoritative migration/build separation document.

Tanggal: 2026-08-28  
Target: Vercel, tanpa project mutation atau deployment.

## Historical configuration recommendations (2026-08-28)

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

## Historical status at audit date

**READY FOR MANUAL CONFIGURATION, NOT READY FOR DEPLOYMENT.**

## Phase 6S local CSP boundary

The Phase 6S candidate is generated only in the local production-like harness
with `CSP_REPORT_ONLY=true` and loopback origins. The dependency lifecycle patch
is applied locally for the pinned Next.js/Recharts versions so generated
wrapper, surface, measurement, and route-announcer markup does not add
unreviewed inline styles.

No Vercel project, environment variable, secret, Cron, database, Google Sheets
credential, migration, or Production security-header setting was changed by
Phase 6S. The candidate remains Report-Only; CSP enforcement requires a separate
review and authorization. See
`docs/PHASE6S_CSP_REMEDIATION_2026-09-05.md`.

Phase 6T independently reproduced the candidate with no-flag control before
each Report-Only run. This remains local evidence only; no Vercel or remote
header was tested or changed. See
`docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md`.

## Phase 6U CSP readiness boundary

Phase 6U classifies the local CSP candidate as `PASS WITH FINDINGS`: the
request nonce, dynamic `/login`, six dashboard surfaces, Recharts output,
external-origin boundary, and no-flag behavior are technically stable in the
two fresh Phase 6T runs. Production CSP remains OFF. The Phase 6S/6T candidate
is still a working-tree change and is not asserted to be present in the
recorded Production artifact; the deployment identity is documented by
Phase6K/6N, while commit-signature verification remains unverified.

Any future CSP rollout must first verify the exact deployed commit/artifact and
the application/deployment rollback target. The designed sequence is
Report-Only, observe, review reports, confirm that no legitimate dependency is
blocked, enforce, monitor, and keep a tested application/deployment rollback
path. This review did not inspect or change a Vercel header.

Future CSP review is required for browser-facing DOM/CSS/JavaScript changes,
new external resources or browser connections, iframes/widgets/analytics,
WebSockets, and framework or dependency upgrades. Server-only changes and
ordinary data/source/month worksheet changes normally do not change CSP, but a
browser-facing integration still requires the review. Do not resolve a future
violation by adding `unsafe-inline`, `unsafe-eval`, wildcard sources, or an
unreviewed external origin. Evidence:
`docs/PHASE6U_CSP_PRODUCTION_READINESS_REVIEW_2026-09-05.md`.
