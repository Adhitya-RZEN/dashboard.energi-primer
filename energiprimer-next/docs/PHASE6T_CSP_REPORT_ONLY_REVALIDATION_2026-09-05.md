# PHASE 6T — CSP REPORT-ONLY REVALIDATION

Project: Energi Primer PLN Jeranjang
Repository: energiprimer-next
Date: 2026-09-05
Mode: CONTROLLED LOCAL PRODUCTION-LIKE REVALIDATION ONLY
Status: PASS

## 1. Executive Summary

Phase 6T independently reproduced the Phase 6S CSP candidate after a clean
production build. Two fresh disposable PostgreSQL/browser/server runs passed
the complete local matrix: 10/10 request-to-DOM nonce matching and uniqueness
per run, no-flag control before each candidate, Auth.js lifecycle, protected
redirect, all six dashboards, Recharts interaction, six dynamic-style checks,
dependency-generated-style checks, and CSP violation capture.

Both runs recorded zero script-src-elem, style-src-attr, unsafe-eval,
unsafe-inline-related, and unexpected external-origin violations. Network
failures were classified as cancelled/follow-up fetch requests after pages
rendered successfully; no application failure was reproduced.

Production CSP remains absent and unchanged. This report establishes only an
independent local Report-Only result and does not authorize Production CSP
enforcement.

## 2. Phase 6S Baseline

Phase 6S established the remediation baseline:

- /login uses request-time dynamic rendering.
- Five independent nonce probes matched the DOM and were unique.
- The six application dynamic-style locations use CSS-backed presentation.
- Pinned Next.js/Recharts generated-style paths use the exact-version local
  dependency patch.
- Auth.js, dashboards, Recharts, and CSP Report-Only passed in one local run.
- Production and Preview remained untouched.

Phase 6T rechecked that baseline without adding application remediation.

## 3. Source Provenance

The Phase 6S source state was inspected before execution, including /login,
src/proxy.ts, globals.css, all affected dashboard components, SiteHeader,
package.json/package-lock.json, the exact-version dependency patch, and the
disposable runtime harness.

The only Phase 6T implementation change was test-enabling instrumentation in
scripts/phase6s-local-runtime.mjs:

- configurable 10-probe mode;
- no-flag-first ordering;
- bounded response nonce hash and Content-Type evidence;
- expected dashboard-marker and iframe/object/embed assertions;
- per-request network failure classification without raw URLs.

No application behavior, dependency version, vercel.json, environment file,
schema, migration, credential, or Production configuration was changed by
Phase 6T.

## 4. Local Disposable PostgreSQL

Each repeatability run created PostgreSQL 18.4 on loopback port 55434 with a
fresh temporary data directory and a fresh database fixture. The canonical
production baseline migration SQL was used only to initialize the disposable
local database.

The fixture contained a local admin, three units, and the minimum dashboard,
chart, target, and progress data. Passwords and Auth.js/Cron secrets were
random process-only values; no raw values were printed or persisted.

Both runs dropped the database, stopped PostgreSQL, removed temporary
directories, and stopped all local runtime servers. No Supabase or Production
database was used.

## 5. Build/Runtime

A generated .next artifact was removed only after its exact path was verified.
A clean build then passed with npm.cmd run build. The build applied the
idempotent exact-version patch for Next.js 16.3.3 and Recharts 3.10.1.

Each candidate run used NODE_ENV=production, next start, loopback-only
application traffic, Chrome/Playwright, CSP_REPORT_ONLY=true, and a fresh
disposable database. next dev was not used as evidence.

The build route table classified /login and the protected/application routes
as dynamic (ƒ).

## 6. No-Flag Control Run

The control run was executed before the candidate run in both Run A and Run B.
It started a fresh next start process without CSP_REPORT_ONLY and requested
/login.

| Run | HTTP | Report-Only CSP | Enforced CSP |
|---|---:|---:|---:|
| A | 200 | absent | absent |
| B | 200 | absent | absent |

This proves the candidate header is not unconditional.

## 7. CSP Candidate

The candidate remained limited to Content-Security-Policy-Report-Only:

```
default-src 'self';
script-src 'self' 'nonce-<REQUEST_NONCE>' 'strict-dynamic';
style-src 'self' 'nonce-<REQUEST_NONCE>';
img-src 'self';
font-src 'self';
connect-src 'self';
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

No unsafe-inline, unsafe-eval, wildcard, data:, blob:, or external Google
origin was added. Google Sheets remains server-side.

## 8. Nonce Validation

Each run performed 10 independent /login browser requests. Raw nonce values
were never printed; only bounded SHA-256 evidence was retained.

| Run | Policy-to-DOM match | Unique nonces | Probe complete |
|---|---:|---:|---:|
| A | 10/10 | 10/10 | true |
| B | 10/10 | 10/10 | true |

Every probe returned HTTP 200, one Report-Only header, zero enforced CSP
headers, 13 nonce-bearing DOM elements, and one DOM nonce hash matching the
response policy hash. The 20 bounded hashes across both runs had no overlap.

No hard-coded nonce, persistence, database storage, environment storage, or
raw nonce logging was observed.

## 9. /login Dynamic Rendering

The clean build classified /login as dynamic (ƒ). The route exports the
request-time dynamic setting, and every candidate response carried a nonce
that matched its own rendered DOM. No request reused a nonce from an earlier
request or earlier repeatability run.

Framework-generated nonce-bearing scripts/styles therefore remained aligned
with the request context in both runs.

## 10. Cache Validation

All 10 repeated /login requests in each run returned the compatible cache
policy:

private, no-cache, no-store, max-age=0, must-revalidate

The root HTML route returned the same safe non-cacheable behavior. No stale
nonce, reusable nonce, or cross-request nonce reuse was observed.

## 11. Auth.js

The disposable admin matrix passed in both runs:

| Check | Result |
|---|---|
| /api/auth/providers | HTTP 200 |
| Login page and valid Credentials login | PASS, final path /dashboard |
| Session after login | HTTP 200, hasUser true |
| Dashboard access and user-menu interaction | PASS |
| Logout | PASS, final path /login |
| Session after logout | HTTP 200, hasUser false |
| Protected route after logout | redirect to /login |
| Invalid credentials | generic error, diagnosticLeak false |

No password, cookie, JWT, session token, AUTH_SECRET, database URL, Prisma
error, or stack trace was exposed.

## 12. Dashboard Matrix

All six routes passed HTTP, expected-marker, content, CSP, chart, and browser
error checks in both runs:

| Route | HTTP | Marker | Recharts | Tooltip | Interaction | Style attrs | Embedded |
|---|---:|---:|---:|---:|---:|---:|---:|
| /dashboard | 200 | true | 1/1 | true | true | 0 | 0 |
| /dashboard/biomassa | 200 | true | 2/2 | true | true | 0 | 0 |
| /dashboard/batubara | 200 | true | 2/2 | true | true | 0 | 0 |
| /dashboard/solar | 200 | true | 2/2 | true | true | 0 | 0 |
| /dashboard/stok | 200 | true | 2/2 | true | true | 0 | 0 |
| /dashboard/target | 200 | true | 1/1 | true | true | 0 | 0 |

The overview progress element remained functional with max 100 and a rendered
width. Every route had an empty bounded violation map.

## 13. Recharts

Recharts was not removed or disabled. Every dashboard retained the expected
recharts-wrapper and SVG/surface structure. Hover and click/legend interaction
was exercised, and the tooltip was visible on every route.

The pinned Recharts 3.10.1 wrapper, RootSurface, and measurement paths were
revalidated after the local exact-version patch.

## 14. Dynamic Style Regression

The six original application locations passed in both runs:

| Original location | Result |
|---|---|
| DetailCharts.tsx backgroundColor | CSS class-backed; style attrs 0 |
| InteractiveChartPrimitives.tsx height/minHeight | CSS frame class; style attrs 0 |
| InteractiveChartPrimitives.tsx legend backgroundColor | finite color class; style attrs 0 |
| InteractiveChartPrimitives.tsx tooltip borderTopColor | finite border class; style attrs 0 |
| InteractiveChartPrimitives.tsx tooltip entry backgroundColor | finite color class; style attrs 0 |
| OverviewDashboard.tsx progress width | native progress/CSS; style attrs 0 |

The source scan found no remaining JSX style assignment in the inspected
application source, and browser evidence reported styledElements = [] on all
dashboard routes.

## 15. Dependency Runtime Regression

The following generated-style paths were revalidated in both fresh runs:

- Next.js route announcer;
- Recharts wrapper;
- Recharts RootSurface;
- Recharts DOM measurement path.

The lifecycle patch remained exact-version guarded and idempotent. No
dependency upgrade occurred during Phase 6T. The resulting dashboard/browser
matrix produced zero style-src-attr violations.

## 16. CSP Violation Matrix

| Signal | Run A | Run B |
|---|---:|---:|
| script-src-elem | 0 | 0 |
| style-src-attr | 0 | 0 |
| unsafe-eval | 0 | 0 |
| unsafe-inline-related | 0 | 0 |
| Unexpected external-origin violations | 0 | 0 |
| All captured securitypolicyviolation events | 0 | 0 |

The candidate gate used bounded securitypolicyviolation fields only and
failed closed on any captured directive violation.

## 17. External-Origin Boundary

Both runs reported externalOrigins = []. Browser application traffic remained
loopback-only. No direct browser access to oauth2.googleapis.com,
sheets.googleapis.com, or another external origin occurred.

The candidate retained connect-src 'self'; Google Sheets remains behind the
Next.js server and was not accessed by this phase.

## 18. Browser Console

| Signal | Run A | Run B | Classification |
|---|---:|---:|---|
| CSP console messages | 22 | 22 | reporting noise; no matching violations |
| Non-CSP application console errors | 0 | 0 | PASS |
| Page errors | 0 | 0 | PASS |

The CSP console messages were cross-checked against the empty
securitypolicyviolation maps. They were not treated as violations without
corresponding event evidence.

## 19. Network Failure Classification

The dedicated capture recorded every failed request using only resource type,
status category, navigation sequence, cancellation state, and render state.
Raw URLs were not emitted.

| Run | Failed requests | Resource type | Error category | Page rendered | Classification |
|---|---:|---|---|---|---|
| A | 52 | fetch (52) | aborted/cancelled (52) | true for all | HARNESS/CANCELLED |
| B | 61 | fetch (61) | aborted/cancelled (61) | true for all | HARNESS/CANCELLED |

The failures occurred around follow-up/cancelled RSC navigation sequences.
They did not prevent route rendering, create application/page errors, or
produce CSP violations. No reproducible real request failure was found.

## 20. Repeatability

| Property | Run A | Run B |
|---|---|---|
| Fresh disposable PostgreSQL | PASS | PASS |
| Fresh next start process | PASS | PASS |
| Fresh browser context | PASS | PASS |
| No-flag control before candidate | PASS | PASS |
| Nonce probes | 10/10 match and unique | 10/10 match and unique |
| Auth/dashboard/CSP gates | PASS | PASS |
| Cleanup | PASS | PASS |

The two runs used different process-generated secrets, temporary databases,
browser contexts, and request nonces. No cross-run nonce hash was reused and
no cross-run fixture state was retained.

## 21. Regression Gates

All required gates passed after the Phase 6T harness change:

```
node --check scripts/phase6s-local-runtime.mjs
npm.cmd run csp:patch-dependencies
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run lint
npx.cmd --no-install tsc --noEmit --incremental false
npm.cmd run build
npm.cmd run auth:security:verify
npm.cmd run sync:verify-diagnostics
git diff --check
```

The clean build completed after removing the verified generated .next artifact.
The auth verifier reported PASS with zero database writes/network requests,
and sync diagnostics reported PASS. Node experimental loader/module warnings
were non-blocking.

## 22. Security Leakage

No raw secret, credential, password, database URL, cookie, JWT, session token,
private key, stack trace, or raw nonce was printed. Nonce evidence was hashed
and truncated. Invalid credentials remained generic and diagnosticLeak was
false.

The harness used no Production credential and no remote database connection.

## 23. Production Non-Interference

Phase 6T performed none of the following:

- Production or Preview deployment;
- Vercel project or environment mutation;
- Production sync or Cron execution;
- Google Sheets Production access or write;
- Production database write, migration, reset, or seed;
- secret rotation, credential change, commit, or push.

vercel.json, environment files, credentials, Prisma schemas, and migration
trees were not modified by Phase 6T. Historical Phase 6R and Phase 6S
reports remain intact.

## 24. Documentation Changes

Active documentation was reviewed and updated with the Phase 6T result and
local-only boundary:

- docs/PRODUCTION_READINESS.md
- docs/PROJECT_MAP.md
- docs/AGENT_CONTEXT.md
- docs/VERCEL_CONFIGURATION.md
- docs/VERCEL_DEPLOYMENT_RUNBOOK.md
- docs/GOOGLE_SHEETS_SYNC_HARDENING.md
- docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md

No historical report was rewritten.

## 25. Remaining Findings

1. Production CSP is intentionally absent and was not tested or changed.
2. The local Report-Only candidate has not been promoted to a Production
   header.
3. The browser produces cancelled/follow-up RSC fetch failures; they are
   classified as HARNESS/CANCELLED because all pages render and no application
   error follows. Broader E2E coverage may still be useful.
4. Final policy, live Production header strategy, rollback criteria, and
   enforcement authorization remain a separate Phase 6U review.

## 26. Enforcement Readiness

| Boundary | Result |
|---|---|
| Local request-time nonce candidate | PASS |
| Local Report-Only browser candidate | PASS |
| Production CSP enforcement | NOT ENABLED / NOT AUTHORIZED |

The local candidate has no nonce mismatch, script-src-elem, style-src-attr,
unsafe-eval, unsafe-inline-related, or unexpected-origin finding. This does
not make Production enforcement ready: Phase 6T is local-only and deliberately
did not test or modify Production headers.

## 27. Final Classification

PHASE 6T — PASS

CSP REPORT-ONLY REVALIDATION PASSED

READY FOR PHASE 6U

This classification applies only to the independent local production-like
candidate. STOP after this report. Do not automatically start Phase 6U.

## 28. Safety Counters

| Counter | Value |
|---|---:|
| Production deployments | 0 |
| Preview deployments | 0 |
| Production syncs | 0 |
| Production Cron executions | 0 |
| Production database writes | 0 |
| Production migrations | 0 |
| Production environment changes | 0 |
| Production secret changes | 0 |
| Google Production accesses | 0 |
| Google Production writes | 0 |
| Commits | 0 |
| Pushes | 0 |

FINAL STOP.

DO NOT DEPLOY.
DO NOT COMMIT.
DO NOT PUSH.
DO NOT RUN PRODUCTION SYNC.
DO NOT RUN PRODUCTION MIGRATION.
DO NOT ENABLE PRODUCTION CSP.
