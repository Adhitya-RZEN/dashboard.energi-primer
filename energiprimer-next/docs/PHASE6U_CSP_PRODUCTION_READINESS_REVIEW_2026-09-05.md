# PHASE 6U — FINAL CSP PRODUCTION READINESS REVIEW

Project: Energi Primer PLN Jeranjang
Review date: 2026-09-05
Scope: read-only production-readiness review; no Production enforcement

## 1. Executive Summary

Phase 6U classifies the local CSP candidate as `PASS WITH FINDINGS`. Phase 6S remediation and the independent Phase 6T revalidation demonstrate that the candidate is technically stable in a clean production-like local runtime: request/DOM nonces match and remain unique, `/login` is dynamic, all six dashboards render, Recharts interaction works, and no CSP or application errors were observed.

This is not authorization to enable CSP in Production. Production CSP remains OFF. The remaining findings are operational: the Phase 6S/6T candidate is an uncommitted working-tree change and is not asserted to be in the recorded Production artifact; the deployment identity is documented, but commit-signature verification remains unverified; and the application/deployment rollback target must be explicitly confirmed before enforcement.

Phase 6U performed no Production request, login, POST, deployment, Vercel configuration change, secret change, database operation, migration, Google Sheets operation, Cron execution, commit, or push.

## 2. Phase 6S Baseline

Phase 6S removed the six reviewed source inline-style locations, moved the presentation to `globals.css`, made `/login` explicitly dynamic, and added a loopback-only CSP Report-Only boundary. The local candidate uses a random request nonce and the exact directives recorded in section 5.

Dependency lifecycle patches are local and exact-version guarded for Next.js `16.3.3` and Recharts `3.10.1`. They prevent the reviewed route-announcer, wrapper, surface, measurement, and related generated markup from reintroducing unreviewed inline styles. Production CSP was not enabled.

Evidence: `docs/PHASE6S_CSP_REMEDIATION_2026-09-05.md`.

## 3. Phase 6T Baseline

Phase 6T independently executed two fresh local production-like runs. Each run used `next start`, a fresh disposable PostgreSQL fixture, Chrome/Playwright, `CSP_REPORT_ONLY=true`, and cleanup. The no-flag control ran before each candidate run.

Observed in both runs:

- status `PASS` with `10/10` nonce probes matching the response nonce to the DOM and all probes unique;
- public routes and `/login` returned successfully; Report-Only was present and enforced CSP was absent;
- Auth.js login, session, logout, protected redirect, and generic invalid-credential behavior passed;
- all six dashboards, expected markers, Recharts wrappers/surfaces, tooltip and interaction checks passed;
- embedded `iframe`, `object`, and `embed` elements: `0`; style attributes: `0`;
- CSP violation maps: empty; external browser origins: `[]`;
- application console errors: `0`; page errors: `0`; failed requests were fetches classified as aborted/cancelled while pages rendered successfully;
- no-flag control: status `200`, Report-Only `false`, enforced CSP `false`; cleanup completed.

Across both runs, 20 bounded nonce hashes had no overlap. Raw nonce values were not printed.

Evidence: `docs/PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md`.

## 4. Source Provenance

The recorded Phase6K/6N Production deployment evidence identifies Vercel project `dashboard-energi-primer`, a READY Production deployment, the canonical project alias, and recorded SHA `deeea1291b8ebfa563379e307eed7fd93ba133e1`. The local HEAD matches that recorded SHA and branch.

However, the repository currently contains uncommitted Phase6S/6T application, dependency-patch, harness, package, and documentation changes. Therefore this review does not claim that the CSP candidate is present in the recorded Production artifact. Commit-signature verification also remains unverified. An authorized rollout must verify the exact commit/artifact and Vercel deployment provenance before changing headers.

## 5. CSP Candidate

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

The candidate is exercised only as loopback Report-Only in the local harness. It is not a Production header in this phase.

## 6. Directive-by-Directive Review

| Directive | Observed dependency/evidence | Risk and decision |
| --- | --- | --- |
| `default-src 'self'` | Same-origin fallback for otherwise unspecified fetches. | Low residual risk; retain. |
| `script-src 'self' 'nonce-<REQUEST_NONCE>' 'strict-dynamic'` | Nonce response/DOM matches were `10/10` in each run; `script-src-elem` violations were `0`; application/page errors were `0`. | Low runtime risk for reviewed paths; retain and regression-test after framework changes. |
| `style-src 'self' 'nonce-<REQUEST_NONCE>'` | Six source inline styles were converted to classes/CSS; style attributes were `0`; `style-src-attr` findings were `0`. | Low runtime risk; retain without `unsafe-inline`. |
| `img-src 'self'` | Local image boundary passed and `externalOrigins` was `[]`. | Low risk for reviewed UI; retain. |
| `font-src 'self'` | No external font origin was observed. | Low risk; retain. |
| `connect-src 'self'` | No external browser origin was observed. Failed fetches were classified as aborted/cancelled, not CSP blocks. | Low risk for the current same-origin app; review any future browser API, WebSocket, or analytics endpoint. |
| `frame-src 'none'` | `iframe`, `object`, and `embed` assertion found `0` elements. | Appropriate for the current app; retain unless an approved embedded feature is introduced. |
| `object-src 'none'` | No object/embed dependency was found. | Defense in depth; retain. |
| `base-uri 'self'` | No reviewed feature requires a foreign base URL. | Low risk; retain. |
| `form-action 'self'` | Auth forms submit to the application boundary; no external form target was observed. | Appropriate for Auth.js contract; retain. |
| `frame-ancestors 'none'` | The application is not intended to be framed. | Appropriate clickjacking boundary; retain. |
| `upgrade-insecure-requests` | Candidate hardens accidental HTTP subresource references; no insecure dependency was observed in the local run. | Retain; review mixed-content behavior during an authorized rollout. |

No wildcard source, `unsafe-inline`, or `unsafe-eval` is used by the candidate.

## 7. Nonce Architecture

The nonce is generated at request time with a cryptographically random value. The local proxy places the value in the request context and in the Report-Only response policy; framework-rendered DOM nonce attributes use the same request value. The harness compares hashes rather than printing the raw nonce.

Phase6T recorded 10 matching probes and 10 unique values per run, with no overlap across 20 bounded hashes. The nonce is not hard-coded, read from an environment variable, stored in the database, or written to logs. A request-specific nonce is required for any future server-rendered nonce-bearing script or style.

## 8. `/login`

`src/app/login/page.tsx` declares `dynamic = "force-dynamic"`. The local runtime returned `/login` successfully with a request-specific nonce and `private, no-cache, no-store, max-age=0, must-revalidate` caching. This prevents a cached login document from replaying another request's nonce.

Local Auth.js login/session/logout and protected redirect checks passed. Phase6U does not repeat Production authentication and does not perform a Production POST.

## 9. Dynamic Styles

The six reviewed inline-style locations were removed or replaced:

1. `DetailCharts.tsx` chart background color;
2. `InteractiveChartPrimitives.tsx` chart height/min-height;
3. `InteractiveChartPrimitives.tsx` legend background;
4. `InteractiveChartPrimitives.tsx` tooltip border color;
5. `InteractiveChartPrimitives.tsx` tooltip entry background;
6. `OverviewDashboard.tsx` progress width, replaced by the reviewed progress class.

Chart frames, surfaces, colors, borders, progress, and route-announcer presentation are represented in CSS classes. Static search returned no `style=` occurrence under `src` after remediation. Generated framework/dependency markup remains covered by the pinned local patch and runtime checks.

## 10. Recharts

All six dashboards passed wrapper/surface, tooltip, and interaction checks. The observed wrapper/surface counts were overview `1/1`, biomassa `2/2`, batubara `2/2`, solar `2/2`, stok `2/2`, and target `1/1`. Dynamic chart colors and layout markers were present without style attributes.

The Recharts patch retains required classes while removing the reviewed inline-style generation. The pinned-version guard is intentionally narrow. A Next.js or Recharts upgrade must rerun the dependency patch verification, clean build, nonce probes, dashboard interaction checks, and CSP violation checks before any enforcement decision.

## 11. External-Origin Boundary

Both Phase6T runs reported `externalOrigins: []`. The candidate therefore keeps `connect-src`, image, font, and other browser resource access same-origin for the reviewed application. The failed-request records contained only bounded type/category/status information; all were fetches classified as aborted/cancelled and pages rendered successfully.

No external origin should be added speculatively. A real future browser-facing dependency must be identified, justified, added narrowly, and revalidated in Report-Only before enforcement.

## 12. Google Sheets Server Boundary

Google Sheets access remains server-side. Browser CSP does not govern the Next.js server-to-Google or server-to-PostgreSQL connection, and Phase6U did not run discovery or sync.

The documented source policy remains exactly the seven required monthly worksheets `Januari26-BB` through `Juli26-BB`. The 199 metadata rows are a worksheet inventory, not 199 monthly import sources. This distinction is unaffected by CSP.

## 13. Auth.js Security

Local production-like checks passed valid Credentials login, authenticated session visibility, logout, protected-route redirect, and generic invalid-credential behavior without diagnostic leakage. The Auth.js security verifier also passed; its environment-safe result was `AUTH_E2E_ENV_NOT_AVAILABLE` with `databaseWrites=0` and `networkRequests=0`, so it did not substitute a remote test.

Auth.js remains server-side with the existing Credentials/Prisma/JWT contract. No Production credentials, reset token, mail provider, or authentication setting was changed or tested by Phase6U.

## 14. Dashboard Security

All six protected dashboard paths returned successfully in the local harness. Expected markers, chart structure, tooltip/interaction behavior, and no-embedded-content assertions passed. Application console errors and page errors were `0`, and the candidate did not require an external browser origin.

The dashboard checks are functional CSP evidence, not a claim that Production has received the candidate.

## 15. Cache/Dynamic Rendering

`/` and `/login` returned the private no-cache directive recorded in Phase6T; `/api/auth/providers` returned successfully without the protected document cache behavior. `/login` was dynamically rendered, and no nonce was reused across the bounded probes.

Any route that emits a request nonce must remain request-correct and must not be made statically cached without a deliberate nonce/cache review. Changes to caching, middleware/proxy behavior, or rendering mode require CSP regression.

## 16. Dependency Patch Review

The local patch script is idempotent and guarded to the exact installed Next.js and Recharts versions. It is invoked by the relevant local lifecycle scripts so the production-like build/runtime sees the reviewed markup. Syntax checks for the patch and harness passed.

No dependency upgrade was performed in Phase6U. The patch is not permission to silently patch a future version; a version change requires a new source/runtime review and a clean build.

## 17. Future Feature CSP Change Policy

| Change type | CSP review expectation |
| --- | --- |
| Server-only logic, API/database code, or ordinary sync processing | Normally no CSP change; run ordinary regression and source/data-contract review. |
| Data/source/month worksheet changes | Normally no CSP change; review worksheet admission, parser, and source contract. |
| Browser-facing DOM, CSS, JavaScript, inline event/style, or rendering change | Mandatory CSP review and local Report-Only/runtime regression. |
| New external resource, browser connection, iframe, widget, analytics, WebSocket, or font/image origin | Mandatory narrow directive review and Report-Only observation. |
| Next.js/Recharts/framework/dependency upgrade | Mandatory generated-markup review, patch compatibility check, clean build, and full CSP regression. |

Future violations must not be solved by blindly adding `unsafe-inline`, `unsafe-eval`, wildcard sources, or an unreviewed external origin.

## 18. Production Deployment Provenance

Phase6K/6N provide read-only historical evidence for the Vercel project, canonical alias, READY Production deployment, branch, and recorded SHA. Local HEAD matches the recorded SHA.

That evidence is insufficient to assert that the uncommitted Phase6S/6T candidate is deployed. The signature remains unverified, and Phase6U does not deploy or query Vercel. Before enforcement, an authorized operator must verify the exact source commit, build artifact/deployment, project target, and rollback deployment.

Classification: `REVIEW_REQUIRED` for candidate-to-Production provenance.

## 19. Production CSP Current State

Prior Phase6K read-only evidence recorded the Production CSP header as absent. Phase6U does not re-probe Production, change a Vercel header, or perform an authentication request. Accordingly, the safe recorded state remains `OFF` from prior evidence, not a new live verification in this phase.

Production enforcement is not inferred from the local candidate or from source code. Any future header inspection must be separately authorized and read-only unless explicit enforcement approval is granted.

## 20. Rollout Strategy

This section designs a future rollout; it does not execute one:

1. Verify the exact approved source commit, build artifact, Vercel target, and rollback deployment.
2. Enable the unchanged candidate in Report-Only for the approved deployment.
3. Observe public, login, authenticated dashboard, logout, and protected-redirect paths.
4. Review CSP reports, browser console errors, application errors, and network classifications.
5. Confirm there are no legitimate blocked dependencies or missing origins.
6. Obtain explicit Production enforcement approval, then enforce the unchanged candidate.
7. Monitor authentication, dashboards, errors, and performance, with rollback available.

Google sync, Cron, Prisma migration, and database cutover are separate operational concerns and are not part of CSP rollout.

## 21. Rollback Strategy

Rollback is an application/deployment configuration action, not a database rollback. Retain the prior known-good Vercel deployment identifier, define the operator trigger and approval path, promote or redeploy that artifact, and verify public/auth/dashboard health afterward.

Do not undo Prisma migrations, reset data, run a sync, rotate unrelated credentials, or alter Google worksheet state as a CSP rollback. The rollback target is a remaining operational finding until it is explicitly verified for the enforcement deployment.

## 22. Performance Considerations

Per-request nonce generation and dynamic `/login` rendering add request-time work by design, while private no-cache behavior prevents nonce-bearing login documents from being reused incorrectly. The local evidence showed successful rendering and no application/page errors, but it is not a Production performance benchmark.

The candidate keeps browser connections and resources same-origin for the reviewed app and removes repeated inline-style generation in the reviewed components. After any authorized rollout, monitor function duration, authentication latency, dashboard load, client errors, and Web Vitals.

## 23. Regression Gates

Phase6S/6T and the final local checks passed:

- `npm.cmd run csp:patch-dependencies`;
- `npm.cmd run db:generate`;
- `npm.cmd run db:validate`;
- `npm.cmd run lint`;
- `npx.cmd --no-install tsc --noEmit --incremental false`;
- clean `npm.cmd run build`;
- `npm.cmd run auth:security:verify`;
- `npm.cmd run sync:verify-diagnostics`;
- `node --check scripts/patch-csp-dependencies.mjs`;
- `node --check scripts/phase6s-local-runtime.mjs`;
- `git diff --check`.

The browser-specific two-run evidence is the Phase6T baseline described in section 3. No Production database/preflight, sync, migration, deployment, or remote header gate was run.

## 24. Documentation Changes

Phase6U adds this report and aligns the active operational documents with the readiness boundary, provenance finding, rollout/rollback design, Google server boundary, and future CSP change policy:

- `docs/PRODUCTION_READINESS.md`;
- `docs/PROJECT_MAP.md`;
- `docs/AGENT_CONTEXT.md`;
- `docs/VERCEL_CONFIGURATION.md`;
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`;
- `docs/GOOGLE_SHEETS_SYNC_HARDENING.md`.

Historical Phase6R, Phase6S, and Phase6T reports are preserved.

## 25. Decision Matrix

| Area | Result | Risk/decision |
| --- | --- | --- |
| Nonce | PASS | Matching and unique in both fresh runs; retain architecture. |
| `/login` dynamic | PASS | Explicitly dynamic and private no-cache; retain. |
| `script-src` | PASS | Nonce/strict-dynamic candidate passed local checks; re-test on framework changes. |
| `style-src` | PASS | Reviewed inline styles eliminated; no unsafe-inline; retain. |
| Recharts | PASS | Six dashboards and interaction passed; upgrade review required. |
| External origins | PASS | None observed; keep same-origin until a reviewed dependency requires otherwise. |
| Google browser boundary | PASS | Sheets access remains server-side; no CSP expansion required. |
| Auth.js | PASS | Local login/session/logout/protected/invalid flows passed. |
| Dashboard | PASS | Six dashboards, markers, errors, and embedded-content checks passed. |
| Cache | PASS | Nonce-bearing login remained dynamic/private no-cache. |
| Production CSP | REVIEW | Production remains OFF; no Phase6U live header request; separate approval required. |
| Rollback | REVIEW | Design exists; exact enforcement deployment target must be verified. |
| Provenance | REVIEW | Recorded deployment identity exists, but signature and candidate artifact inclusion are unverified. |

## 26. Remaining Findings

1. Production CSP is intentionally OFF. This is a controlled state, but enforcement requires a new explicit approval.
2. The local Phase6S/6T candidate is uncommitted and therefore not asserted to be in the recorded Production deployment.
3. Commit-signature verification and exact candidate-to-artifact provenance remain unverified.
4. The rollback deployment identifier and operator trigger require confirmation for the future enforcement window.

These findings do not invalidate the local technical evidence; they prevent an unqualified Production-enforcement classification.

## 27. Enforcement Readiness

The candidate is technically mature and suitable for a separately authorized Report-Only/Production review. It is not yet an unconditional Production-enforcement green light in this phase because provenance and rollback controls are operationally unresolved, and Production was intentionally not re-probed.

After exact artifact/signature and rollback verification, a future explicit approval may evaluate the designed Report-Only-to-enforcement sequence. Phase6U stops here and does not auto-enable or schedule that phase.

## 28. Safety Counters

| Action | Phase6U count |
| --- | ---: |
| Production deployment | 0 |
| Preview deployment | 0 |
| Production CSP/header change | 0 |
| Production header/auth request | 0 |
| Production sync or Cron execution | 0 |
| Database migration/reset/seed | 0 |
| Production database operation | 0 |
| Google Sheets Production operation | 0 |
| Secret/environment/Vercel setting change | 0 |
| Commit or push | 0 |

## 29. Final Classification

# PHASE 6U — PASS WITH FINDINGS

## CSP CANDIDATE READY FOR REVIEW WITH LOW-PRIORITY OPERATIONAL FINDINGS

Production CSP remains OFF.

The local technical candidate passed the Phase6S remediation baseline, the two-run Phase6T browser revalidation, and the listed static regression gates. Production enforcement remains a separate explicit decision after exact provenance/signature and rollback verification. No automatic next phase is started.


