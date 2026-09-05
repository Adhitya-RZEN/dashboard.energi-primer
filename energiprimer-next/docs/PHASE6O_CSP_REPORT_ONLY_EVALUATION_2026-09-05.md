# PHASE 6O — CSP REPORT-ONLY EVALUATION

Project: Energi Primer PLN Jeranjang  
Repository: energiprimer-next  
Date: 2026-09-05 (Asia/Makassar)  
Mode: CONTROLLED PREVIEW / CSP REPORT-ONLY  
Final runtime classification: BLOCKED

## 1. Objective

Phase 6O mengevaluasi rancangan Content Security Policy secara aman sebelum
enforcement. Fokus fase ini hanya CSP: resource inventory, script/style
requirements, nonce/hash decision, Auth.js, dashboard, Recharts, navigation,
dan browser violation collection.

Phase 6O tidak mengaktifkan CSP enforced, tidak mengubah Production, dan tidak
membuka kembali investigasi P2028, migration remediation, sync remediation,
atau authentication redesign.

## 2. Scope

Read-only source audit dilakukan terhadap:

- next.config.ts;
- proxy;
- root dan protected layout;
- Auth.js/login route;
- client components;
- Recharts components;
- CSS;
- public assets;
- browser-side request surface;
- script, frame, worker, eval, and inline-style markers.

Controlled Preview runtime tidak dijalankan. Tidak ada Preview artifact yang
diotorisasi pada fase ini dan repository tidak memiliki callable Playwright,
Cypress, atau Puppeteer runner. Vercel CLI tersedia tetapi tidak digunakan
untuk deploy karena deployment Preview tetap merupakan external state change
yang membutuhkan authorization/workflow yang belum diberikan.

## 3. Baseline

Current next.config.ts mengirim header berikut:

- Strict-Transport-Security pada production;
- X-Content-Type-Options: nosniff;
- X-Frame-Options: DENY;
- Referrer-Policy: strict-origin-when-cross-origin;
- Permissions-Policy untuk camera, microphone, dan geolocation.

CSP dan Content-Security-Policy-Report-Only sama-sama absent pada source
configuration. Phase 6M telah mengklasifikasikan CSP absent sebagai
LOW/REVIEW hardening. Phase 6O tidak menambahkan header tersebut.

Official reference yang digunakan:

[Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)

Next.js menjelaskan bahwa nonce harus random per request dan nonce-based CSP
memerlukan dynamic rendering; framework dapat menerapkan nonce ke generated
scripts/styles ketika mekanisme resmi digunakan. Implikasi dynamic rendering
dan caching belum divalidasi untuk aplikasi ini karena Preview runtime tidak
tersedia.

## 4. Source audit

| Audit item | Result | Evidence |
|---|---|---|
| Content-Security-Policy | PASS: absent | Tidak ditemukan pada source/config |
| Content-Security-Policy-Report-Only | PASS: absent | Belum diimplementasikan |
| nonce/hash marker | PASS: absent | Tidak ditemukan nonce, sha256, sha384, atau sha512 |
| application inline script | PASS: none found | Tidak ada script tag inline |
| dangerouslySetInnerHTML | PASS: none found | Tidak ditemukan pada src |
| eval or new Function | PASS: none found | Tidak ditemukan pada application source |
| iframe/object/embed | PASS: none found | Tidak ditemukan pada application source |
| worker/service worker/WebSocket | PASS: none found | Tidak ditemukan pada application source |
| browser fetch/XHR | PASS: none found | Satu fetch berada pada server-only Google module |
| React style attributes | REVIEW | Tepat enam lokasi dynamic style ditemukan |

Search dilakukan repository-wide pada source application dan runtime
configuration tanpa membaca nilai secret.

## 5. Resource inventory

| Resource | Actual application evidence | CSP implication | Classification |
|---|---|---|---|
| Framework scripts | Next.js App Router generated scripts | Need same-origin and, if nonce design is selected, framework nonce handling | Required framework resource |
| Application scripts | No inline script or application-level dynamic script insertion | No unsafe-inline or unsafe-eval supported by source evidence | Required application resource |
| Stylesheet | Tailwind/global CSS imported from app/globals.css | Same-origin style resource | Required application resource |
| Style attributes | Six dynamic attributes in chart/progress/tooltip components | Needs refactor or explicit style-src-attr decision | Required application behavior, unresolved |
| Images | Local public Logo_PLN.svg through next/image | self is sufficient from static evidence | Required local asset |
| Fonts | Arial, Helvetica, Courier New/system stack | No external font origin required | Required local/system resource |
| Browser connections | No client-side fetch/XHR/WebSocket | connect-src self is the starting point | Required same-origin application path |
| Google API | Server-only fetch to oauth2.googleapis.com and sheets.googleapis.com | Must not be added to browser connect-src without browser trace | Server-only, not browser resource |
| Frames | No iframe usage found | frame-src none is appropriate candidate | No application need found |
| Objects/plugins | No object or embed usage found | object-src none is appropriate candidate | No application need found |
| Media/workers | No media or worker usage found | No additional source is justified | No application need found |

## 6. Initial CSP design

The following is a design baseline only. It was not inserted into
next.config.ts, proxy, Production, or a Preview deployment:

default-src 'self'

script-src 'self' plus a fresh per-request nonce and strict-dynamic

style-src 'self' plus a fresh per-request nonce

img-src 'self'

font-src 'self'

connect-src 'self'

frame-src 'none'

object-src 'none'

base-uri 'self'

form-action 'self'

frame-ancestors 'none'

upgrade-insecure-requests

No wildcard, unsafe-eval, or unsafe-inline is justified by the static audit.
The final directive string cannot be approved until browser evidence is
collected.

## 7. Preview implementation

Status: NOT PERFORMED.

No Content-Security-Policy-Report-Only header was added. No nonce mechanism,
report endpoint, preview-only environment branch, or CSP config helper was
implemented. This avoids introducing an unvalidated header into a future
deployment while no controlled Preview/browser test is available.

Production was not redeployed, and no Production environment variable or
secret was changed.

## 8. Browser test matrix

| Test area | Phase 6O result | Reason |
|---|---|---|
| Public root | BLOCKED / not run | No controlled Preview artifact |
| Login page | BLOCKED / not run | No browser runner and no Preview CSP header |
| Auth.js providers | BLOCKED / not run | CSP-specific runtime behavior unavailable |
| Credentials submission | BLOCKED / not run | Would require controlled Preview and test account |
| Session creation/logout | BLOCKED / not run | Same constraint |
| Dashboard overview | BLOCKED / not run | No CSP Report-Only response |
| Biomassa/Batubara/Solar/Stok/Target | BLOCKED / not run | No controlled Preview |
| Recharts rendering | BLOCKED / not run | Browser console/visual trace unavailable |
| Tooltip/progress/dynamic styles | BLOCKED / not run | Style violation collection unavailable |
| Client navigation/back-forward | BLOCKED / not run | Browser runner unavailable |
| Error/unauthorized states | BLOCKED / not run | No controlled Preview |

Phase 6K and Phase 6L contain non-CSP Production Auth.js/dashboard evidence.
Evidence tersebut tidak boleh diperlakukan sebagai CSP Report-Only runtime
evidence.

## 9. CSP violations

No browser CSP violations were collected because no Report-Only header was
served by a controlled Preview and no browser DevTools/log collection was
available.

Therefore:

- zero observed violations is NOT claimed;
- no blocked URI is classified as clean;
- no violation is whitelisted;
- no report endpoint was configured.

## 10. Auth.js result

Static result: Auth.js Credentials route, login form, server action, protected
layout, and server-side admin authorization remain within same-origin
application boundaries.

Non-CSP baseline: Phase 6K verified one valid admin login, session creation,
authenticated dashboard, and guest redirect.

Phase 6O CSP-specific result: BLOCKED / NOT TESTED. Auth.js must be retested
under Report-Only before enforcement is considered.

## 11. Dashboard result

Static result: dashboard pages are server-first and protected by Auth.js
proxy/layout checks. The data services do not add browser-side external
connections.

Phase 6O CSP-specific result: BLOCKED / NOT TESTED. No claim is made that all
dashboard pages render under a CSP header.

## 12. Recharts/chart result

Recharts is used by client components:

- DetailCharts.tsx;
- InteractiveChartPrimitives.tsx;
- EnergyConsumptionChart.tsx.

Six dynamic style attributes were found across charts, tooltip presentation,
progress presentation, colors, borders, and responsive sizing. These are the
main unresolved style-src-attr candidates.

Phase 6O CSP-specific Recharts result: BLOCKED / NOT TESTED. No
style-src-attr exception has been added.

## 13. Navigation result

Static navigation uses same-origin Next.js links and protected routes. No
external navigation API, iframe, or browser WebSocket was found.

Client navigation, full reload, back/forward, and logout redirect were not
executed under Report-Only because the controlled Preview/browser matrix was
unavailable.

## 14. Error-state result

The application contains App Router error, loading, and not-found components.
Static audit found no inline script or dangerous HTML injection in these
paths.

Malformed/unauthorized endpoint behavior was not re-exercised under a CSP
header. Existing Phase 6K route/auth evidence remains non-CSP baseline only.

## 15. Security boundary result

Result: STATIC PASS WITH CSP EVALUATION BLOCKED.

- Existing security headers were preserved.
- X-Frame-Options remains DENY.
- No CSP enforcement header was added.
- No unsafe-eval or unsafe-inline was added.
- No external wildcard origin was added.
- Google OAuth and Sheets URLs remain server-only and were not proposed for
  browser connect-src.
- No credentials, token, nonce, or secret was generated, stored, logged, or
  sent.

The absence of a browser violation trace means this is not an enforcement
readiness approval.

## 16. Production non-interference

Phase 6O made no Production deployment, redeploy, environment change, secret
change, sync request, retry, Cron invocation, migration, database write, or
Google write.

Production deployment identity and CSP-absent baseline remain inherited from
Phase 6K/6M evidence. Because no Preview implementation or deployment
occurred, there was no Preview-to-Production comparison request to execute.

Production CSP was not changed and remains absent. No automatic rollback or
Production action was needed.

## 17. Required policy adjustments

Before a future controlled Preview evaluation:

1. Provide an explicitly authorized Preview artifact without changing
   Production.
2. Provide a callable browser runner or approved browser test workflow.
3. Decide whether the official Next.js nonce mechanism can be used without
   unacceptable dynamic-rendering and caching impact.
4. Review the current proxy matcher, which presently focuses on dashboard
   paths, before using a nonce for login and all other relevant pages.
5. Refactor or explicitly test the six dynamic style attributes. A nonce for
   script-src is not a substitute for a style-src-attr decision.
6. Collect violations by directive, URI, source page, resource type, browser,
   functionality impact, and remediation class.
7. Keep connect-src limited to self unless browser evidence proves an external
   browser API.
8. Do not add unsafe-eval, unsafe-inline, wildcard, or broad https origins
   without explicit browser evidence and review.

## 18. Final CSP proposal

The following is a candidate for a separately authorized Report-Only Preview,
not an enforcement-ready Production policy:

default-src 'self'

script-src 'self' nonce-per-request strict-dynamic

style-src 'self' nonce-per-request

style-src-attr 'none' only after the six dynamic style attributes are
refactored or otherwise proven compatible

img-src 'self'

font-src 'self'

connect-src 'self'

frame-src 'none'

object-src 'none'

base-uri 'self'

form-action 'self'

frame-ancestors 'none'

upgrade-insecure-requests

The nonce wording is a placeholder for the official framework mechanism, not
a literal header value. The style-src-attr line is an unresolved design gate,
not an instruction to deploy an exception. No final policy is approved in
Phase 6O.

## 19. Enforcement readiness

**BLOCKED**

CSP enforcement is NOT READY. The blocking conditions are:

- no controlled Preview runtime with Report-Only response;
- no browser runner or DevTools violation collection;
- no Auth.js/dashboard/Recharts CSP matrix;
- six dynamic style attributes still require a refactor or evidence-based
  style-src-attr decision;
- nonce and dynamic-rendering implications remain unvalidated.

This is not a CSP failure and not a Production security regression. It is an
incomplete controlled evaluation.

## 20. Documentation changes

Active documentation updated:

- docs/PRODUCTION_READINESS.md
- docs/PROJECT_MAP.md
- docs/AGENT_CONTEXT.md
- docs/GOOGLE_SHEETS_SYNC_HARDENING.md
- docs/VERCEL_DEPLOYMENT_RUNBOOK.md
- docs/VERCEL_CONFIGURATION.md

New report:

- docs/PHASE6O_CSP_REPORT_ONLY_EVALUATION_2026-09-05.md

Historical Phase 6N and earlier reports were not rewritten. They remain
evidence with their existing historical/superseded classification.

## 21. Remaining findings

1. CSP is still absent from Production.
2. Controlled Preview Report-Only runtime was not available.
3. Browser violation collection was not available.
4. Six dynamic style attributes remain unresolved for strict style policy.
5. Nonce-based rendering/caching implications are not validated.
6. No report endpoint or durable CSP violation collection path is configured.
7. Existing Phase 6M runtime diagnostic and commit-verification findings
   remain outside Phase 6O scope.

None of these findings authorizes a Production CSP change.

## 22. Safety counters

| Operation | Count |
|---|---:|
| Production sync | 0 |
| Production sync retry | 0 |
| Production Cron invocation | 0 |
| Production database write | 0 |
| Production migration | 0 |
| Google write | 0 |
| Production environment change | 0 |
| Production secret change | 0 |
| Production deployment | 0 |
| Production redeploy | 0 |
| Preview deployment | 0 |
| Git commit | 0 |
| Git push | 0 |
| Code change | 0 |
| Configuration change | 0 |
| Documentation files modified | 6 |
| New documentation files | 1 |

No CSP Report-Only header was implemented. The six documentation files and
this report are the only Phase 6O changes. Existing Phase 6N worktree changes
and pre-existing Phase 6K/L/M reports were preserved and are not recounted as
Phase 6O new files.

## 23. Final classification

**CSP REPORT-ONLY EVALUATION BLOCKED BECAUSE CONTROLLED PREVIEW RUNTIME WAS UNAVAILABLE**

Correct operational statement:

CSP Report-Only evaluation was blocked because a safe controlled Preview
artifact and callable browser test environment were unavailable. Production
CSP remains absent. No CSP enforcement was enabled, and no Production
deployment or operational write was performed.

CSP enforcement requires a separate explicitly authorized phase after a
controlled Preview Report-Only matrix is completed. Phase 6O stops here.
