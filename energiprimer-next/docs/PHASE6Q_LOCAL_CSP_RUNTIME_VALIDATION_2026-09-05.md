# PHASE 6Q — LOCAL CONTROLLED CSP REPORT-ONLY RUNTIME VALIDATION

Project: Energi Primer PLN Jeranjang  
Date: 2026-09-05  
Runtime: local disposable Next.js development server on 127.0.0.1  
Production: unchanged  
Final classification: BLOCKED

## 1. Objective

Phase 6Q was intended to remove the Phase 6P runtime blocker by providing a
local controlled runtime for Content-Security-Policy-Report-Only, request-time
nonces, dynamic rendering, cache behavior, Auth.js, dashboard routes, Recharts,
six dynamic style attributes, browser violations, console findings, and actual
browser network requests.

The local public runtime portion was validated. Full authenticated coverage
was not completed because no disposable loopback database/admin fixture was
available. Production was not used.

The official implementation reference was the [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy).

## 2. Phase 6P blocker

Phase 6P was classified BLOCKED because:

- no controlled Preview artifact was available;
- no browser runner was initially available in the project;
- CSP Report-Only and nonce behavior had not been implemented or observed;
- the six dynamic style attributes had not been tested;
- authenticated local coverage had no safe fixture.

Phase 6Q resolved the first three public-runtime limitations locally:

- a local-only Report-Only path was implemented;
- a request-specific nonce was attached through the Next.js proxy request
  header;
- Chrome was launched against 127.0.0.1;
- HTTP and browser evidence was collected for public routes.

The Auth.js credential, dashboard, Recharts, and six-style blocker remains.

## 3. Local runtime architecture

The controlled runtime used:

- Next.js 16.3.3;
- Next development server at http://127.0.0.1:3100;
- process-only flag CSP_REPORT_ONLY=true;
- NODE_ENV not equal to production;
- no change to .env.local or .env.e2e.local;
- no Vercel, Preview, or Production endpoint.

src/proxy.ts now has a local-only Report-Only branch. When the local flag is
active, it:

- generates a random request-specific nonce using globalThis.crypto.randomUUID;
- encodes the nonce as Base64;
- sets x-nonce on the request forwarded to Next.js rendering;
- sets Content-Security-Policy-Report-Only on the response;
- never sets Content-Security-Policy;
- does not persist or log the nonce.

The policy branch is disabled when NODE_ENV is production. Without the flag,
the default local runtime was separately verified to emit neither CSP header.
The existing protected-path authorization path remains in place.

No CSP report endpoint or database persistence was added. Browser console and
securitypolicyviolation events were used for local evidence.

## 4. Tooling availability

Observed tooling:

- Node.js 24.17.0;
- Next.js 16.3.3;
- Chrome executable at C:/Program Files/Google/Chrome/Application/chrome.exe;
- Microsoft Edge executable also present;
- Playwright was available through the existing global installation and was
  used without an install command;
- the final worktree also contains Playwright package entries in
  package.json and package-lock.json; those changes were observed and
  preserved, not created by a Phase 6Q patch;
- Puppeteer and Cypress were not available;
- no automatic dependency installation was performed by this phase.

The browser test connected only to the loopback runtime. No Production URL was
opened.

## 5. Disposable DB status

A PostgreSQL 18 Windows service was running and 127.0.0.1:5432 was reachable.
However:

- psql access without a password was rejected;
- .env.e2e.local DATABASE_URL was not a loopback URL and contained a Supabase
  host;
- .env.local DATABASE_URL was not a loopback URL and contained a Supabase
  host;
- no disposable database/schema was provisioned;
- no database fixture or local admin user was created;
- no database write, reset, push, migration, or seed was attempted.

The local PostgreSQL service therefore was not treated as a safe fixture.
Auth.js credential submission and authenticated dashboard testing remained
BLOCKED rather than using a Supabase or Production database.

## 6. Browser availability

Chrome was launched headlessly through Playwright against:

    http://127.0.0.1:3100

The public browser matrix completed for:

- /;
- /login;
- /api/auth/providers.

The browser observed only the loopback origin. No external browser origin,
Google API origin, or Production origin was requested.

Authenticated browser testing was not performed because no local/disposable
admin credential fixture existed.

## 7. CSP Report-Only implementation

The local implementation emits exactly one:

    Content-Security-Policy-Report-Only

It does not emit:

    Content-Security-Policy

The active local policy contains no wildcard, unsafe-inline, unsafe-eval,
http:, or https: source. The implementation is activated only by the
process-local flag and non-production runtime condition.

The default runtime without the flag was tested separately on port 3101:

- / returned 200 with Report-Only absent and enforced CSP absent;
- /login returned 200 with Report-Only absent and enforced CSP absent;
- /api/auth/providers returned 200 with Report-Only absent and enforced CSP
  absent.

No Production configuration or environment variable was changed.

## 8. Nonce implementation

Each local Report-Only request generates a new nonce from
globalThis.crypto.randomUUID and Base64 encodes it. The nonce is:

- request-specific;
- not hard-coded;
- not read from an environment variable;
- not stored in PostgreSQL;
- not written to a diagnostic log;
- not returned in test output;
- passed to Next.js through the request x-nonce header.

The raw HTTP response for /login contained generated nonce-bearing framework
markup whose nonce matched the nonce referenced by the response policy.

Chrome intentionally hides the nonce through getAttribute. Browser validation
therefore used the DOM nonce property rather than treating an empty
getAttribute value as a mismatch.

## 9. Nonce uniqueness test

Two independent HTTP requests to /login produced:

- Report-Only header present on both responses;
- one policy header on each response;
- different nonce hashes;
- the response policy nonce matching the HTML nonce on each response.

The uniqueness assertion passed:

    Request 1 nonce != Request 2 nonce

No raw nonce value was printed. Only bounded hashes were used while testing.

The Chrome browser test also verified that the /login response policy nonce
matched the rendered DOM nonce property.

## 10. Dynamic rendering

The local runtime generated request-time responses. Repeated /login requests
did not reuse a nonce. The local Next.js build also identified the
authenticated route group and API routes as dynamic server-rendered routes.

The public browser test rendered /login successfully with:

- Report-Only header present;
- enforced CSP absent;
- framework nonce attributes present;
- nonce property matching the response policy;
- zero page JavaScript errors.

The root route is a server redirect to /login. Its direct HTTP response
contained a matching nonce. Browser navigation ultimately resolved to the
login page; the initial root response and the final redirected document must
be treated as separate responses when comparing nonce values.

## 11. Cache behavior

The repeated /login responses returned:

    Cache-Control: no-cache, must-revalidate

The two response nonces were different. No cached HTML carrying a previous
request nonce was observed.

The authenticated dashboard cache behavior was not tested because the route
redirected unauthenticated access and no local admin fixture was available.

## 12. HTTP headers

HTTP validation on port 3100 produced:

| Route | Status | Report-Only | Enforced CSP | Nonce evidence |
| --- | ---: | --- | --- | --- |
| / | 200 | exactly one | absent | direct HTTP HTML match |
| /login | 200 | exactly one | absent | header and HTML match |
| /api/auth/providers | 200 | exactly one | absent | header only; JSON has no HTML nonce |
| /dashboard | 307 | exactly one | absent | redirect response only |

The candidate policy did not contain a wildcard. No duplicate CSP header was
observed in the local HTTP checks.

The unauthenticated /dashboard redirect location reflected the local
NEXTAUTH_URL configuration at http://localhost:3000/login. This is a local
configuration mismatch for a port-3100 test and not a Production request.

## 13. Public routes

The following public routes were tested:

- / — HTTP 200; Report-Only present; enforced CSP absent; direct response
  nonce matched the HTML;
- /login — HTTP 200; Report-Only present; enforced CSP absent; Chrome rendered
  the page and matched the nonce;
- /api/auth/providers — HTTP 200; Report-Only present; enforced CSP absent;
  no HTML nonce required.

Chrome reported no non-CSP application console error, no page error, and no
failed resource request for these public pages.

## 14. Auth.js

The local provider endpoint was tested successfully:

- /api/auth/providers returned HTTP 200;
- it remained same-origin;
- no external OAuth flow was invoked;
- no Supabase Auth, Resend, or password recovery flow was invoked.

The login page rendered successfully under Report-Only.

Full Auth.js coverage was BLOCKED:

- no disposable PostgreSQL fixture;
- no local admin user;
- no local Credentials submission;
- no successful local session;
- no logout/session invalidation flow.

The existing auth:security:verify script passed with
AUTH_E2E_ENV_NOT_AVAILABLE, confirming that the static security checks pass
without pretending that authenticated E2E is available.

## 15. Dashboard

Unauthenticated HTTP access to /dashboard returned HTTP 307 with a
Report-Only header and no enforced CSP. The route did not render protected
dashboard content.

The following dashboard routes were not authenticated or rendered:

- /dashboard;
- /dashboard/biomassa;
- /dashboard/batubara;
- /dashboard/solar;
- /dashboard/stok;
- /dashboard/target.

Status: BLOCKED because no safe local admin fixture was available.

## 16. Recharts

DetailCharts, InteractiveChartPrimitives, and EnergyConsumptionChart could not
be exercised through an authenticated dashboard browser session.

No claim is made that Recharts runtime behavior or chart tooltips passed under
Report-Only. The local build compiled the chart code successfully, but build
success is not a browser chart result.

Status: BLOCKED.

## 17. Six dynamic styles

The six source locations remain:

1. DetailCharts.tsx:181 — backgroundColor;
2. InteractiveChartPrimitives.tsx:131 — height and minHeight;
3. InteractiveChartPrimitives.tsx:167 — backgroundColor;
4. InteractiveChartPrimitives.tsx:222 — borderTopColor;
5. InteractiveChartPrimitives.tsx:235 — backgroundColor;
6. OverviewDashboard.tsx:87 — progress width.

They were not browser-evaluated because the dashboard could not be opened
with a local authenticated fixture.

The browser did observe style-src-elem Report-Only findings in development,
but those findings were not attributed to these six React style attributes.
A future local authenticated run must identify each exact element and decide
whether a CSS class, CSS variable, stylesheet rule, or data attribute removes
the violation.

No unsafe-inline exception was added.

## 18. Google API boundary

The browser network inventory contained only:

    http://127.0.0.1:3100

No browser request was made to:

- oauth2.googleapis.com;
- sheets.googleapis.com;
- any other Google origin.

The source audit continues to identify Google OAuth token exchange and Sheets
requests only in the server-side Google Sheets module. No Google origin was
added to connect-src.

## 19. connect-src

The local browser observed no external connect-src requirement. The candidate
connect-src self therefore matched the observed public browser network
surface.

This is not proof for authenticated dashboard or sync interactions because
those were not exercised. No wildcard or external origin was added.

## 20. image/font

Public browser navigation completed without failed image or font requests.
The source inventory contains local public assets and a system font stack.

No external font or image origin was observed. No data: or blob: source was
added to the candidate policy.

## 21. frame/object

The source audit found no iframe, object, or embed requirement. No browser
frame or object navigation was performed.

The candidate remains:

    frame-src 'none'; object-src 'none'

The existing X-Frame-Options DENY configuration was not changed.

## 22. form-action

The login page loaded, but a Credentials form submission was not attempted
without a safe local admin fixture.

The candidate remains:

    form-action 'self'

No form-action violation result can be claimed. Status: BLOCKED.

## 23. frame-ancestors

No embedding test was performed. The candidate remains:

    frame-ancestors 'none'

The existing X-Frame-Options DENY behavior was not changed. No Production
framing header was changed.

## 24. navigation

Public navigation to /, /login, and /api/auth/providers completed locally.
The root route resolved to the login flow. No external navigation occurred.

The following were not tested:

- authenticated login-to-dashboard navigation;
- client navigation among dashboard subroutes;
- logout redirect;
- protected-route navigation with a valid session;
- back and forward behavior after authentication.

Status: PARTIAL / BLOCKED for authenticated navigation.

## 25. error states

No destructive error-state action was performed.

The unauthenticated dashboard redirect was observed. The following were not
browser-tested:

- not-found page;
- authenticated unauthorized dashboard;
- malformed public API;
- invalid route;
- sync error page;
- authenticated error state.

Status: BLOCKED for the untested matrix.

## 26. CSP violations

Chrome securitypolicyviolation evidence was collected in Report-Only mode.
Observed public-page findings in Next development mode were:

- / — 65 events, directives script-src and style-src-elem, blocked kinds eval
  and inline;
- /login — 66 events, directives script-src and style-src-elem, blocked kinds
  eval and inline;
- /api/auth/providers — 0 securitypolicyviolation events.

The application still rendered. There were no page JavaScript errors and no
failed resource requests in the public browser run.

The script-src eval findings are consistent with Next development tooling and
must not be carried into a Production policy without a production-like
runtime check. The style-src-elem inline findings remain a required
remediation/evidence item. They were not hidden by adding unsafe-inline.

These findings prevent a clean runtime PASS and require another local
iteration before any enforcement design.

## 27. Browser console

The Chrome run produced no non-CSP console error and no pageerror for the
tested public routes. CSP-related console messages were observed and
classified together with the securitypolicyviolation events.

No chart JavaScript console result is claimed because no authenticated
dashboard was rendered.

## 28. Security leakage

The runtime test did not create a persistent log file. Test output emitted
only bounded nonce hashes and never emitted a raw nonce.

The local diagnostic verification confirmed that bounded sync diagnostics do
not emit DATABASE_URL, password, private_key, SELECT, or stack content.

No cookies, Authorization values, session tokens, database URLs, Google
private key, client secret, or Production secret was printed by the Phase 6Q
runtime checks. Environment values were not displayed.

## 29. Production non-interference

Production was not touched:

- Production deployment/redeploy: 0;
- Preview deployment: 0;
- Production sync: 0;
- Production retry: 0;
- Production Cron: 0;
- migration execution or resolution: 0;
- database writes: 0;
- Google Sheets writes: 0;
- Production environment changes: 0;
- Production secret changes: 0;
- commit: 0;
- push: 0.

The local default runtime without CSP_REPORT_ONLY was verified to emit no CSP
header. Production remains without CSP enforcement and without Report-Only
instrumentation.

## 30. Regression gates

The mandatory local gates passed:

- npm run db:generate — PASS;
- npm run db:validate — PASS;
- npm run lint — PASS;
- npx --no-install tsc --noEmit --incremental false — PASS;
- npm run build — PASS.

Additional safe checks:

- npm run auth:security:verify — PASS;
- npm run sync:verify-diagnostics — PASS;
- git diff --check — PASS, with normal line-ending warnings only;
- default-flag local HTTP check — PASS, CSP headers absent.

The repository has no npm run typecheck script, so the direct TypeScript
command was used.

Production migration status/preflight was deliberately not run. Those scripts
load Supabase/Production environment values and would violate the Phase 6Q
local-only boundary.

## 31. Final candidate policy

The candidate remains Preview/local Report-Only only:

    default-src 'self'; script-src 'self' 'nonce-<REQUEST_NONCE>' 'strict-dynamic'; style-src 'self' 'nonce-<REQUEST_NONCE>'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests

This is not an enforcement policy and is not approved for Production.
REQUEST_NONCE must be generated per request. No unsafe-inline, unsafe-eval,
wildcard, http:, https:, data:, or blob: exception was added.

The development eval findings and unresolved style findings must be explained
or remediated before a separate enforcement design/review phase.

## 32. Enforcement readiness

Enforcement readiness: NOT READY.

The local public runtime proves that the Report-Only header and nonce path can
operate for public routes. It does not prove:

- local Credentials login;
- authenticated session caching;
- dashboard rendering;
- Recharts behavior;
- six dynamic styles;
- authenticated navigation;
- authenticated error states;
- Production-like runtime behavior.

Phase 6Q therefore does not authorize CSP enforcement, Preview deployment,
Production deployment, or any Production CSP change.

## 33. Documentation changes

Phase 6Q updated these active documentation files:

- docs/PRODUCTION_READINESS.md;
- docs/PROJECT_MAP.md;
- docs/AGENT_CONTEXT.md;
- docs/VERCEL_CONFIGURATION.md;
- docs/VERCEL_DEPLOYMENT_RUNBOOK.md;
- docs/GOOGLE_SHEETS_SYNC_HARDENING.md.

This is the new mandatory report:

- docs/PHASE6Q_LOCAL_CSP_RUNTIME_VALIDATION_2026-09-05.md.

Historical Phase 6O and Phase 6P reports were not rewritten.

The implementation files changed for this phase are:

- src/proxy.ts — local-only Report-Only and nonce path;
- scripts/verify-auth-security.ts — assertion updated to accept the response
  wrapper used by the nonce-bearing redirect.

The final worktree also contains package.json and package-lock.json
Playwright modifications that were observed and preserved; they were not
introduced by the Phase 6Q patch.

## 34. Safety counters

Phase 6Q counters:

- local CSP implementation source files changed: 1;
- local regression assertion files changed: 1;
- Production configuration files changed: 0;
- Production environment files changed: 0;
- Production deployments/redeployments: 0;
- Preview deployments: 0;
- Production sync attempts: 0;
- Production sync retries: 0;
- Production Cron executions: 0;
- database writes: 0;
- database migrations/resolutions: 0;
- Google Sheets writes: 0;
- secret rotations: 0;
- local disposable database created: 0;
- raw nonce values logged: 0;
- observed secret leakage events: 0;
- active documentation files modified: 6;
- new Phase 6Q report files: 1;
- commits: 0;
- pushes: 0.

The local Next.js build and Prisma generation produced local generated/build
artifacts only. They did not contact or mutate Production.

## 35. Final classification

BLOCKED

Reason:

    Local public CSP Report-Only runtime validated, but full Phase 6Q runtime validation is BLOCKED because no disposable loopback database/admin fixture was available for Auth.js Credentials, dashboard, Recharts, six dynamic styles, authenticated navigation, and authenticated error-state testing.

The local Report-Only path, HTTP headers, nonce uniqueness, public browser
routes, and local non-interference checks passed. Development CSP findings
remain documented and the candidate policy is not ready for enforcement.

This result means only:

    Local CSP Report-Only runtime partially validated; authenticated coverage blocked.

It does not mean Production CSP is ready, CSP is enforced, or Production
deployment is authorized.
