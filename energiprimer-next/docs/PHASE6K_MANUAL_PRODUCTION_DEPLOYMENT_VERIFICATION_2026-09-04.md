# PHASE 6K — MANUAL PRODUCTION DEPLOYMENT VERIFICATION

Project: Energi Primer PLN Jeranjang  
Date: 2026-09-04 (Asia/Makassar)  
Mode: read-only verification  
Repository: energiprimer-next

This is the final Phase 6K verification record. The operator had already
deployed the current Production artifact before this audit. The agent did not
deploy, redeploy, commit, push, migrate, resolve migration history, trigger
Cron, run a valid sync, change an environment variable, or change a secret.

The initial observation in this report encountered a temporary Vercel SSO
boundary. A same-day recheck completed after access recovered and the current
status recorded below supersedes that temporary observation.

## 1. Overall status

**PASS WITH FINDINGS**

The current Vercel Production deployment is READY, its source provenance
matches the current repository HEAD, the Production database/schema gates
pass, all required local regression gates pass, and the latest deployment is
reachable. Public routes, Credentials provider, recovery boundary, guest
redirect, one valid admin login, and authenticated dashboard verification all
pass.

Remaining findings are non-blocking: runtime diagnostic execution was not run
because no Production sync was authorized, CSP is absent, and the deployed
Git commit is marked unverified. A live non-admin token test was not run
because sending a secret-derived token to Production was rejected by the
safety boundary; static authorization verification passed.

## 2. Deployment identity

| Item | Result |
| --- | --- |
| Vercel project | dashboard-energi-primer |
| Vercel context/team | projek-rzen |
| Latest Production deployment ID | dpl_Gj1BecPeA6N7dZkeHE7LmnwbNRRX |
| Latest deployment URL | https://dashboard-energi-primer-k4azudqg1-projek-rzen.vercel.app |
| Target | Production |
| Ready state | READY |
| Created | 2026-09-04T14:26:33.042Z |
| Ready | 2026-09-04T14:27:43.560Z |
| Framework | Next.js |
| Node runtime | 24.x |

The deployment was inspected with Vercel read-only metadata commands. No
deployment command was run by the agent.

## 3. Production URL

The canonical Production alias is:

https://dashboard-energi-primer-projek-rzen.vercel.app

The latest deployment-specific URL is:

https://dashboard-energi-primer-k4azudqg1-projek-rzen.vercel.app

During the recheck, both URLs served application responses instead of the
temporary /sso-api redirect. The accessible
AUTH_TEST_BASE_URL and the latest deployment URL were reachable during the
recheck. The latest deployment-specific URL was used for the single valid
admin login, so the authenticated result is tied to the current deployed
commit rather than the historical diagnostic deployment.

## 4. Repository HEAD

| Item | Value |
| --- | --- |
| Branch | NextJs |
| HEAD | deeea1291b8ebfa563379e307eed7fd93ba133e1 |
| Subject | fix(sync): harden Google Sheets discovery transaction |
| Remote | github.com/Adhitya-RZEN/DASHBOARD-BATU-BARA-PLN-JERANJANG.git |

The working tree contained pre-existing user changes and untracked phase
artifacts. They were preserved; no reset, checkout, cleanup, or destructive
operation was performed.

## 5. Deployed commit

Vercel Git metadata reports:

- commit: deeea1291b8ebfa563379e307eed7fd93ba133e1;
- ref: NextJs;
- message: fix(sync): harden Google Sheets discovery transaction;
- target: Production.

The deployment commit exactly matches local HEAD. GitHub/Vercel marks the
commit verification status as unverified; this is a provenance finding, not a
runtime failure.

## 6. Provenance reconciliation

The following critical files have identical HEAD and working-tree hashes, and
therefore match the deployed commit:

- src/services/google-sheets/sync/discovery.ts
- src/services/google-sheets/sync/engine.ts
- src/services/google-sheets/sync/lease.ts
- src/services/google-sheets/sync/diagnostic-core.ts
- src/services/google-sheets/sync/diagnostics.ts
- src/services/google-sheets/sync/bb-policy.ts
- src/lib/google-sheets.ts
- vercel.json

The implementation path for the policy file is
src/services/google-sheets/sync/bb-policy.ts; the shorter path
src/services/google-sheets/bb-policy.ts does not exist.

**Provenance: PASS**, with Git commit verification remaining unverified.

## 7. Vercel status

Vercel reports the latest deployment as READY, Production-targeted, and
Next.js-based. The deployment has the expected Production aliases and the
expected Cron configuration. No Vercel platform 404 or failed deployment
state was reported.

Application route content could not be independently inspected on the latest
artifact during the initial observation. The recheck reached the latest
artifact and verified the application route matrix, headers, public bundles,
and negative Cron authorization.

## 8. Public routes

### Latest Production artifact

The recheck against the latest deployment URL returned application responses:

| Route | Result |
| --- | --- |
| / | 200 |
| /login | 200 |
| /api/auth/providers | 200; only the Credentials provider |
| /dashboard | 307 to /login for a guest |
| /forgot-password | 404 |
| /reset-password | 404 |
| /password/reset | 404 |
| /api/auth/forgot-password | 400 for malformed request |
| /api/auth/reset-password | 400 for malformed request |
| /api/password/reset | 404 |

The canonical Production alias also returned 200 for / and /login, 200 for
/api/auth/providers, and 307 to /login for a guest /dashboard request. The
latest public route matrix is PASS.

## 9. Authentication

Static verification confirms that Auth.js exposes only the Credentials
provider. Exactly one valid admin login was performed directly against the
latest Production deployment:

- CSRF endpoint: 200;
- credentials callback: 302 without an auth error;
- session cookie: created;
- authenticated dashboard: 200 with the Overview Energi Primer marker;
- ADMIN_E2E: PASS for the latest deployment;
- no password, token, or secret was printed.

last_login_at expected writes: 1.

## 10. Dashboard

The latest authenticated dashboard verification passed. The read-only
Production runtime verifier independently confirmed that the dashboard data
service is src/services/overview-postgres.ts, that the PostgreSQL source is
reachable, and that the expected dashboard route set is wired to the service:

/dashboard, /dashboard/biomassa, /dashboard/batubara, /dashboard/solar,
/dashboard/stok, and /dashboard/target.

The direct runtime check passed July 2026 chart/KPI coverage and the expected
fallback from August 2026 to July 2026. The live authenticated dashboard
request also passed on the latest deployment.

## 11. Migration status and preflight

Both required Production checks passed in read-only mode:

- npm run supabase:production:migrate-status: PASS,
  UP_TO_DATE_OR_NO_PENDING_MIGRATIONS;
- npm run supabase:production:migration:preflight: PASS, no pending
  migration, no unfinished or rolled-back migration, no checksum mismatch,
  no unexpected migration, and empty schema diff.

The canonical Production history contains exactly one migration:

20260901130000_production_schema_baseline

The normalized checksum matched:

f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c

Connection policy also passed: the direct target uses PostgreSQL port 5432
with required SSL and no PgBouncer, while runtime DATABASE_URL remains
separated on the pooler shape at port 6543. Migration deploy and migration
resolve were both NOT RUN.

## 12. Schema verification

The read-only Production schema verifier passed:

| Check | Result |
| --- | --- |
| Application tables | 30 / 30 |
| Application columns | 270 / 270 |
| Primary keys | 30 / 30 |
| Foreign keys | 19 / 19 |
| Application indexes | 40 / 40 |
| Unique-index parity | PASS |
| Migration checksum | PASS |
| SSL/backend session | PASS |
| PostgreSQL | 17.6 |
| Database/schema | postgres / public |
| biomass_stock absent | PASS |
| Application rows | 8952; populated data is allowed |

The sync tables are present in the canonical schema. There is no separate
sync_leases table; lease state is represented by
sync_sources.lock_token and sync_sources.lock_expires_at.

## 13. Source policy

The exact required monthly BB policy is centralized in
src/services/google-sheets/sync/bb-policy.ts and is separate from metadata
discovery:

1. Januari26-BB
2. Februari26-BB
3. Maret26-BB
4. April26-BB
5. Mei26-BB
6. Juni26-BB
7. Juli26-BB

The 199-row metadata registry is an inventory boundary. It is not equivalent
to 199 business imports. Non-required worksheets remain registry/classification
data and are not automatically admitted to the monthly BB pipeline.

## 14. Required worksheet inventory

The Production read-only snapshot contains 199 rows in sync_worksheets. The
source policy contains seven required monthly BB titles. The static
auto-admission, schema, retry, diagnostics, and discovery checks all passed.

No Google Sheets write, worksheet mutation, or sync execution was performed.

## 15. Cron schedule

Both local configuration and Vercel deployment metadata report:

0 22 * * *

This is 22:00 UTC, equivalent to 06:00 WITA the next local day. The
historical */15 or 01:00 schedule is not active in the reviewed
configuration. No Cron trigger was called.

## 16. Negative Cron authorization

The canonical Production alias and latest deployment URL each returned 401 for
each of the following negative POST probes:

- missing Authorization header;
- malformed Bearer header;
- wrong Bearer token.

The same three probes against the current E2E base also returned 401 and
contained no secret or raw Prisma marker. No valid Cron secret was used.

## 17. Runtime diagnostics

Static diagnostic verification passed. The diagnostic contract emits bounded
fields:

- request_id
- stage
- status
- duration_ms
- error_category
- error_code

The verified stage model includes request/environment/configuration,
Google OAuth/metadata, source bootstrap, discovery transaction/registry/
preparation/current persistence/missing persistence/total, source lease,
sync-run creation, worksheet processing, import transaction, row-state
transaction, finalization, and completion.

P2028 maps to error_category=DATABASE and error_code=P2028; P2028 is not
retryable. No authorized Production sync was run, therefore:

RUNTIME_DIAGNOSTIC_EXECUTION=NOT_TESTED

No diagnostic execution is inferred from static verification.

## 18. Security headers

On the latest Production application responses, the selected headers passed:

- Strict-Transport-Security;
- X-Content-Type-Options: nosniff;
- X-Frame-Options: DENY;
- Referrer-Policy: strict-origin-when-cross-origin;
- Permissions-Policy restricting camera, microphone, and geolocation.

The Content-Security-Policy header was absent. This is a LOW/REVIEW finding.
It was not changed in Phase 6K because an unreviewed CSP can break
Next.js/Auth.js/chart runtime behavior.

## 19. Error sanitization and public secret boundary

The static Auth.js/security, diagnostic, Cron-auth, and preview-write-safety
checks passed. Negative public API responses and the latest deployment's nine
fetched JavaScript chunks contained no detected
DATABASE_URL, AUTH_SECRET, CRON_SECRET, Google service-account/private key,
access token, refresh token, raw Prisma, or actionable stack markers.

Malformed recovery responses were bounded 400 responses. The generic
minified-JavaScript heuristic matched the ordinary string " at " in two
chunks; precise raw Prisma/secret/error-leak checks were negative.

## 20. Data safety

The following SELECT-only snapshots were equal before and after the local
regression gates and after the single valid admin login. The expected
last_login_at update is not represented in these sync/import counters:

| Production state | Before | After |
| --- | ---: | ---: |
| sync_runs | 1 | 1 |
| Active leases | 0 | 0 |
| sync_worksheets | 199 | 199 |
| sync_row_states | 2409 | 2409 |
| spreadsheet_import_runs | 12 | 12 |
| spreadsheet_import_staging | 3919 | 3919 |
| Duplicate (source_id, worksheet_key) keys | 0 | 0 |

No row decrease, duplicate key, active lease, schema change, business-data
write, migration write, Google write, or sync execution was observed.

## 21. Safety counters

| Counter | Value |
| --- | ---: |
| Authorized Production sync requests | 0 |
| Production sync retries | 0 |
| Database business writes | 0 |
| Migration writes | 0 |
| Google writes | 0 |
| Environment/secret changes | 0 |
| Agent deployments | 0 |
| Git commits | 0 |
| Git pushes | 0 |
| Auth.js last_login_at expected writes | 1 |
| Valid Cron invocations | 0 |

The operator's previously completed manual deployment is informational and
excluded from the agent deployment counter.

## 22. Documentation review

The active readiness index already records the Phase 6K-A metadata
reverification and keeps the Phase 6J checkpoint historical:

[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)

Historical reports were preserved. Search results still contain dated
pre-deployment, old migration, old Cron, and old rollback wording in
phase-specific reports. Those statements are historical evidence, not current
deployment status. GOOGLE_SHEETS_SYNC_SCHEDULER.md retains its
phase-specific checkpoint wording; this Phase 6K recheck supersedes its
temporary manual-verification-pending status.

No historical report was deleted or rewritten, and no code/configuration
change was made for documentation cleanup in this phase.

## 23. Regression gates

All required local gates passed:

| Command | Result |
| --- | --- |
| npm run db:generate | PASS |
| npm run db:validate | PASS |
| npm run lint | PASS |
| npx tsc --noEmit --incremental false | PASS |
| npm run build | PASS |

Supporting static gates also passed:

sync:verify-auto-admission, sync:verify-diagnostics,
sync:verify-retry, sync:verify-cron-auth,
sync:verify-preview-write-safety, auth:security:verify,
ops:verify-env, dashboard:verify-cutoff, sync:verify-schema, and
dynamic:verify.

Only normal Node experimental-loader and module-type warnings were reported;
there were no gate failures.

## 24. Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | Review | Runtime diagnostic execution was not tested because no authorized Production sync was allowed in this phase. |
| F-02 | Low/Review | CSP is absent on the latest application responses. |
| F-03 | Informational | Vercel/GitHub reports the deployed commit as unverified. |
| F-04 | Review | Live non-admin token verification was not run because the safety boundary rejected sending a secret-derived token to Production; static authorization verification passed. |
| F-05 | Informational | Historical documents retain dated pre-deployment or old-schedule statements; they are preserved as historical records. |

## 25. Blockers

**None currently.** The temporary Vercel SSO access block cleared during the
recheck. The latest public route, Auth.js login, authenticated dashboard, and
application-level negative Cron-auth checks are now verified.

## 26. Recommendation

Keep the current migration history unchanged and do not run a sync or migration
as part of this verification. Review and approve a CSP separately before
changing it. If runtime diagnostic execution is required, authorize a
separate controlled sync and record it independently; it was intentionally not
performed here.

## 27. Release classification

| Area | Classification |
| --- | --- |
| Source/deployment provenance | PASS |
| Vercel deployment state | PASS |
| Production migration status/preflight | PASS |
| Production schema/runtime read-only verification | PASS |
| Source policy and 199-row inventory boundary | PASS |
| Local regression gates | PASS |
| Latest public route/auth/dashboard verification | PASS |
| Latest runtime diagnostic execution | NOT TESTED |
| Security headers | PASS WITH LOW/REVIEW CSP finding |
| Overall Phase 6K | **PASS WITH FINDINGS** |

## 28. Authorization and stop record

Phase 6K is closed at this report boundary. One valid admin login was
performed as explicitly permitted by Phase 6K and may update last_login_at.
This phase did not authorize a Production sync, migration, Cron invocation,
deployment, or secret change. Any future Production sync or migration requires
separate explicit authorization and its own controlled verification record.
