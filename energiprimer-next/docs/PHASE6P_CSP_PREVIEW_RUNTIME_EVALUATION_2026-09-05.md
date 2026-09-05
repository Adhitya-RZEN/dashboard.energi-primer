# PHASE 6P — CONTROLLED CSP PREVIEW ENABLEMENT & RUNTIME EVALUATION

Project: Energi Primer PLN Jeranjang  
Date: 2026-09-05  
Environment: local repository audit only; Production unchanged  
Classification: BLOCKED

## 1 Objective

Phase 6P evaluates whether Content-Security-Policy-Report-Only can be enabled and observed safely on a controlled Preview deployment. The objective is to collect browser evidence for the existing static CSP baseline, nonce behavior, dynamic rendering, route navigation, Auth.js, dashboard charts, Google API boundaries, and CSP violation reporting.

This phase must not enable enforced CSP, modify Production, run a Production sync, run Cron, perform a migration, write to PostgreSQL or Google Sheets, change Production secrets, or push a deployment without an explicitly authorized Preview workflow.

The runtime objective was not completed because a safe controlled Preview target and a browser runner were unavailable in the current execution context.

## 2 Scope

The scope covered:

- source and configuration review for CSP-sensitive resources;
- availability of a safe Preview target and browser test capability;
- a local regression gate after the documentation-only Phase 6P preparation;
- a Preview-only Report-Only design decision;
- preservation of Production non-interference;
- required evidence and remediation criteria for a future runtime attempt.

The scope did not include a Preview deployment, a Git commit or push, a Vercel deployment, a Production request, a database write, a Google Sheets write, or CSP enforcement.

## 3 Phase 6O baseline

Phase 6O completed a static CSP Report-Only evaluation and was classified as:

    CSP REPORT-ONLY EVALUATION BLOCKED BECAUSE CONTROLLED PREVIEW RUNTIME WAS UNAVAILABLE

The Phase 6O baseline found:

- no Content-Security-Policy header;
- no Content-Security-Policy-Report-Only header;
- no nonce implementation;
- no inline application script;
- no dangerouslySetInnerHTML;
- no eval or new Function usage;
- no iframe, object, embed, worker, service worker, WebSocket, XMLHttpRequest, or client-side external request surface;
- six React dynamic style attributes;
- Google OAuth and Google Sheets calls confined to the server-side Google Sheets module;
- local image assets and a system font stack;
- no browser CSP violation evidence, because no browser runtime was available.

Production therefore remains without CSP enforcement or Report-Only instrumentation.

## 4 Preview availability

No controlled Preview URL, Preview deployment identifier, or Preview artifact tied to an authorized test commit was supplied for Phase 6P.

The repository has no authorized instruction to create a branch, commit changes, push changes, or deploy a Preview. The presence of a Vercel CLI executable is not sufficient authorization to perform an external deployment, so no deployment was invoked.

The available local application build is not a substitute for a deployed Preview response. It cannot prove response headers, nonce propagation, browser console behavior, cache behavior, or CSP violation reports.

Result: BLOCKED.

## 5 CSP Report-Only implementation

No CSP Report-Only implementation was added.

Specifically:

- next.config.ts was not changed;
- src/proxy.ts was not changed;
- no response header named Content-Security-Policy-Report-Only was added;
- no Content-Security-Policy enforced header was added;
- no report endpoint was added;
- no database or durable violation store was added;
- no external reporting service was configured.

This preserves the Phase 6O and Production state. The candidate policy in section 27 is a design candidate only, not an active policy.

## 6 Nonce implementation

No nonce implementation was added or tested.

The source audit found zero nonce occurrences. No hardcoded nonce, environment nonce, database nonce, or logged nonce exists as a result of this phase.

The official Next.js guidance states that a nonce must be unique and generated per request, and that nonce-based CSP requires dynamic rendering with caching and performance implications. The relevant reference is the [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy).

A future Preview implementation must use the official request-time mechanism, verify that framework scripts and styles receive the request nonce, and verify that the nonce is never reused or exposed in logs. Those checks were not possible without a controlled runtime.

## 7 Dynamic rendering/caching impact

The nonce and caching impact was not runtime-validated.

The current application contains dynamic authenticated routes and a protected layout that calls Auth.js session resolution. The local build identifies dynamic server-rendered routes, but a build result does not establish how a nonce-bearing response behaves through the Preview cache.

A future Preview test must verify:

- a fresh nonce for separate requests;
- no nonce reuse across users or cache hits;
- dynamic rendering of every response that carries a request-specific nonce;
- no accidental static caching of nonce-bearing HTML;
- preservation of Auth.js redirects and session behavior;
- acceptable response and cache behavior after Report-Only is removed.

## 8 Resource inventory

The Phase 6O static inventory remains the applicable inventory:

- application scripts: no custom inline script found;
- framework scripts: not observed at runtime in this phase;
- styles: globals.css plus six React dynamic style attributes;
- images: local public assets, including the local PLN logo;
- fonts: system font stack; no external font provider;
- connections: no browser fetch, XMLHttpRequest, WebSocket, EventSource, worker, or service-worker surface found;
- frames: no iframe;
- objects: no object or embed;
- forms: login and application forms are same-application flows;
- Google APIs: server-side only in src/lib/google-sheets.ts.

This is a static inventory. It is not a claim that a browser emitted zero requests.

## 9 Browser test environment

No supported browser automation runner is available in the repository:

- package.json does not declare Playwright, Puppeteer, or Cypress;
- node_modules/.bin did not provide a Playwright or Cypress command;
- no browser session or DevTools console was available;
- no controlled Preview URL was available.

Consequently, the required browser matrix was not executed. This is the direct blocker for a runtime classification.

## 10 Public route results

No CSP-specific browser result was collected for the public routes.

The local production build completed and identified the public/static route baseline, including /, /login, and /_not-found. The build confirms compilation and route generation only; it does not validate CSP response headers or browser navigation.

Status: BLOCKED — runtime evidence unavailable.

## 11 Auth.js results

No CSP-specific Auth.js browser test was executed.

The existing authentication design remains Credentials through Auth.js, Prisma/PostgreSQL, JWT/session handling, and admin authorization. The Auth.js route is same-origin at /api/auth/[...nextauth]. The source audit found no external OAuth browser script or client-side Google authentication flow.

The following could not be validated:

- login navigation under Report-Only;
- failed-login and successful-login console output;
- session cookie navigation;
- protected-route redirect behavior with a nonce-bearing response;
- whether any Auth.js-generated response creates a CSP violation.

Status: BLOCKED — no browser runtime.

## 12 Dashboard results

No CSP-specific dashboard browser test was executed.

The local build confirms that the dashboard routes compile as dynamic routes. The dashboard contains client chart and navigation components, but no browser request, response header, console, or Report-Only violation was collected.

Status: BLOCKED — no controlled Preview.

## 13 Recharts results

No CSP-specific Recharts browser test was executed.

The source inventory identifies Recharts-based dashboard components and React client components. No inline script or external chart runtime was found in the static audit. The chart rendering path still requires browser validation because CSP behavior must be observed from an actual rendered page.

Status: BLOCKED — no browser evidence.

## 14 Dynamic style results

Six dynamic React style attributes remain in the source:

- src/components/dashboard/DetailCharts.tsx:181 — backgroundColor;
- src/components/dashboard/InteractiveChartPrimitives.tsx:131 — height and minHeight;
- src/components/dashboard/InteractiveChartPrimitives.tsx:167 — backgroundColor;
- src/components/dashboard/InteractiveChartPrimitives.tsx:222 — borderTopColor;
- src/components/dashboard/InteractiveChartPrimitives.tsx:235 — backgroundColor;
- src/components/dashboard/OverviewDashboard.tsx:87 — progress width.

No CSP Report-Only browser result was collected for these attributes. A nonce on a style element must not be assumed to resolve style-attribute behavior. A future Preview test must capture whether the browser reports or permits each attribute under the candidate policy and then choose the narrowest evidence-based remediation.

No unsafe-inline, unsafe-eval, wildcard source, or broad external origin was added to accommodate this unresolved item.

## 15 Google API browser/server boundary

The only identified Google API fetch is in src/lib/google-sheets.ts, a server-side module. The identified Google endpoints are:

- oauth2.googleapis.com/token;
- sheets.googleapis.com/v4/spreadsheets;
- the Google authorization scope used by the server integration.

The static audit found no browser Google API call. CSP connect-src controls browser connections and does not govern the server's outbound fetch. The browser-visible sync path, if exercised by an authenticated user, must be tested through the same-origin application route rather than by allowing Google origins in connect-src.

No browser boundary test was executed in Phase 6P.

## 16 connect-src results

No client-side fetch, XMLHttpRequest, WebSocket, EventSource, worker, or service-worker connection was found in the source/configuration audit.

The candidate connect-src self is therefore a provisional fit for the currently identified browser request surface, but it is not a runtime PASS. A future Preview run must inspect actual browser requests and Report-Only violations before finalizing the directive.

Server-side Google requests are outside the browser connect-src decision.

## 17 image/font results

The source inventory found local public images and a system font stack using Arial, Helvetica, and Courier New. No external font host was identified, and no data or blob image source was identified in the application source audit.

The candidate image and font directives remain provisional until a browser run confirms all emitted resource URLs. No browser result was collected.

## 18 frame/object results

The static audit found no iframe, object, or embed usage.

The candidate frame-src none and object-src none were not runtime-tested. The existing X-Frame-Options DENY header remains in next.config.ts and was not changed. No embedded-resource navigation was performed.

## 19 form-action result

No browser form submission test was executed.

The candidate form-action self is intended to keep form submissions on the application origin. Login, error, and authenticated form behavior remain unvalidated under Report-Only because there was no Preview browser session.

## 20 frame-ancestors result

No framing test was executed.

The candidate frame-ancestors none was not added to any response. The existing X-Frame-Options DENY header remains the active framing protection in the current configuration. No Production header or behavior was changed.

## 21 Navigation results

No CSP-specific navigation matrix was executed.

The local build completed for the application route set, including public, authentication, dashboard, data, report, monitoring, settings, password, and API routes. Build-time route discovery is not equivalent to browser navigation, so the following remain unverified:

- public-to-login navigation;
- login-to-dashboard navigation;
- protected-route redirects;
- dashboard sub-route navigation;
- back/forward navigation;
- error and not-found navigation under Report-Only.

## 22 Error-state results

No browser error-state test was executed.

There was no controlled way to observe CSP reporting during failed login, unauthorized access, missing routes, invalid dashboard parameters, sync errors, or server error responses. No error-state response was modified.

## 23 CSP violations

No CSP violation report was collected.

This must be interpreted as no data collected, not as zero violations. There was no Report-Only header, no report endpoint, no browser runner, and no Preview response to inspect.

No durable CSP violation storage was created, and no Production observability destination was changed.

## 24 Browser console findings

No browser console was available for Phase 6P. Therefore:

- no console CSP warning was observed;
- no console CSP warning can be ruled out;
- no JavaScript runtime error claim is made;
- no chart or navigation console result is claimed.

The local build's successful compilation is recorded separately and does not replace browser-console evidence.

## 25 Security regression

No source or runtime configuration security regression was introduced by Phase 6P.

The following security controls remain unchanged:

- Production CSP remains absent;
- no enforced CSP header was added;
- no Report-Only header was added;
- X-Content-Type-Options nosniff remains configured;
- X-Frame-Options DENY remains configured;
- Referrer-Policy remains configured;
- Permissions-Policy remains configured;
- Production HSTS remains configured for production responses.

Because no Preview runtime was available, CSP-specific regressions were not demonstrated or ruled out. The correct status is blocked, not pass.

## 26 Production non-interference

Production was not touched.

No Production deployment or redeploy was performed. No Production sync, retry, Cron execution, migration, PostgreSQL write, Google Sheets write, environment change, secret change, Auth.js change, sync-path change, or P2028 operation was performed.

The existing Production state from the prior phases remains the reference state, including the absence of CSP enforcement and Report-Only instrumentation.

## 27 Candidate final CSP

The following is the initial Preview-only candidate requested for evidence collection. It is not active and is not a final enforcement policy:

    default-src 'self'; script-src 'self' 'nonce-<per-request>' 'strict-dynamic'; style-src 'self' 'nonce-<per-request>'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests

The nonce placeholder must be replaced by a fresh request-specific nonce. The candidate must not be copied to Production before a controlled Preview browser evaluation proves that framework scripts, styles, charts, navigation, forms, and error states operate as intended.

The six dynamic style attributes are an explicit open question. The policy must not be broadened with unsafe-inline or broad external origins merely to hide violations.

## 28 Required remediation

Before a future runtime evaluation:

1. Provide an explicitly authorized Preview workflow and a stable Preview URL or artifact tied to a known revision.
2. Provide a supported browser runner or an approved manual browser/DevTools test environment.
3. Implement Report-Only only in Preview using the official Next.js request-time nonce mechanism.
4. Confirm dynamic rendering and prevent caching of nonce-bearing HTML.
5. Test all six dynamic style attributes and document the narrowest compliant treatment.
6. Execute public, Auth.js, dashboard, Recharts, form, navigation, error-state, frame, image, font, and Google boundary tests.
7. Capture response headers, browser console findings, and CSP reports without storing sensitive request data in Production.
8. Reconcile every observed violation against the source inventory.
9. Keep Production CSP absent and unchanged until Preview evidence is complete and a separate authorization exists for any Production action.

## 29 Enforcement readiness

Enforcement readiness: NOT READY.

Local regression results for the documentation-only Phase 6P preparation:

- npm run db:generate — PASS;
- npm run db:validate — PASS;
- npm run lint — PASS;
- npx --no-install tsc --noEmit --incremental false — PASS;
- npm run build — PASS.

The package has no npm run typecheck script, so the repository's direct TypeScript command was used instead. These gates validate local compilation and static quality only; they do not validate CSP runtime behavior.

The absence of a controlled Preview and browser evidence prevents a PASS classification and prevents CSP enforcement.

## 30 Documentation changes

Phase 6P updated six existing documentation files:

- docs/PRODUCTION_READINESS.md;
- docs/PROJECT_MAP.md;
- docs/AGENT_CONTEXT.md;
- docs/GOOGLE_SHEETS_SYNC_HARDENING.md;
- docs/VERCEL_DEPLOYMENT_RUNBOOK.md;
- docs/VERCEL_CONFIGURATION.md.

This report is the one new Phase 6P documentation artifact:

- docs/PHASE6P_CSP_PREVIEW_RUNTIME_EVALUATION_2026-09-05.md.

No application source, Next.js configuration, environment file, migration, auth flow, sync logic, or Production deployment configuration was changed by Phase 6P.

## 31 Safety counters

The Phase 6P counters are:

- Production sync attempts: 0;
- Production sync retries: 0;
- Production Cron executions: 0;
- database writes: 0;
- database migrations: 0;
- Google Sheets writes: 0;
- Production environment changes: 0;
- Production secret changes: 0;
- Production deployments or redeployments: 0;
- Preview deployments: 0;
- Git commits: 0;
- Git pushes: 0;
- application source/configuration changes: 0;
- existing documentation files modified by Phase 6P: 6;
- new documentation files created by Phase 6P: 1.

The local Prisma generate and Next build produced local generated/build artifacts only; they did not write to the Production database or change tracked application source/configuration.

## 32 Final classification

BLOCKED

Reason:

    CSP Report-Only runtime evaluation blocked because a safe controlled Preview and browser evidence were unavailable.

The static inventory and local regression gates are healthy, and Production non-interference was preserved. However, a static audit and successful build cannot prove nonce propagation, dynamic rendering and caching behavior, browser console behavior, route behavior, or CSP violation results. Phase 6P must remain blocked until an explicitly authorized Preview runtime and browser test environment are available.

No CSP enforcement is authorized or enabled as a result of this phase.
