# PHASE 6R — DISPOSABLE POSTGRESQL + PRODUCTION-LIKE CSP RUNTIME VALIDATION

Project: Energi Primer PLN Jeranjang  
Repository: `energiprimer-next`  
Date: 2026-09-05 (Asia/Makassar)  
Mode: CONTROLLED LOCAL LOOPBACK ONLY  
Final classification: **FAIL for the CSP candidate; Production unchanged**

## 1. Objective

Phase 6R validates the CSP Report-Only and nonce design in a production-like
`next start` runtime with a disposable PostgreSQL database and a local admin
fixture. The browser scope covers Auth.js Credentials, session lifecycle,
protected navigation, dashboard data, Recharts interaction, dynamic styles,
headers, cache/dynamic rendering observations, and security leakage.

The phase is strictly local. It does not authorize or perform Preview or
Production deployment, Production sync, Cron, migration execution against
Production, Google Sheets access, secret rotation, commit, or push.

## 2. Phase 6Q baseline

Phase 6Q validated the local-only Report-Only implementation in Next
development mode and was classified **BLOCKED** because no safe disposable
database or admin fixture was available. Its public HTTP/browser evidence
covered `/`, `/login`, `/api/auth/providers`, nonce uniqueness, and the
loopback browser boundary, but not authenticated dashboard behavior.

Phase 6R removes that specific blocker locally. The CSP design reference
remains the official [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy).

## 3. Disposable DB

PostgreSQL 18.4 was initialized in temporary directories and bound only to
loopback ports `55432` and `55433` for two controlled runs. The database
target was never read from the Supabase values in the project environment
files.

The production baseline SQL at
`prisma/production/migrations/20260901130000_production_schema_baseline/migration.sql`
was applied only to the disposable database. The local check observed:

```text
phase6r|127.0.0.1/32|55432|tables=30
phase6r|127.0.0.1/32|55433|tables=30
```

The full dashboard run used one local admin, three units, two dates, and
synthetic rows for coal, biomass, stock, solar, HOP, receipt, target, and
cumulative data. A second fresh disposable target was used to rerun the
Auth.js lifecycle. All fixture rows were disposable; no Production row was
created or changed.

Both clusters, their logs, and their database listeners were removed after
the tests. No Phase 6R disposable cluster remains.

## 4. Local environment

Environment overrides were process-only and were not written to `.env.local`
or `.env.e2e.local`. The runtime used:

- `DATABASE_URL` on `127.0.0.1` only;
- `DASHBOARD_DATA_SOURCE=postgres`;
- `NODE_ENV=production`;
- `CSP_REPORT_ONLY=true`;
- `AUTH_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL` on loopback;
- a generated local-only `AUTH_SECRET` and `CRON_SECRET` held in memory;
- dummy local Google configuration values so no project credential was used.

No secret value, database URL value from the project files, password, cookie,
token, or private key was printed.

## 5. Runtime architecture

The runtime sequence was:

1. apply the canonical production-like schema to disposable PostgreSQL;
2. insert only local admin/data fixtures;
3. run `next build`;
4. run `next start --hostname 127.0.0.1`;
5. use Chrome through Playwright against the loopback origin;
6. stop the server, drop the disposable database, stop PostgreSQL, and remove
   the exact temporary directory.

The full data run used `http://127.0.0.1:3200`. The corrected Auth.js rerun
used `http://127.0.0.1:3201`. A no-flag production-like check used port 3202.

## 6. Build/start procedure

`npm.cmd run build` passed with the local process-only environment. Next.js
reported version `16.3.3`, successful compilation, TypeScript completion,
static page generation, and the expected dynamic protected routes.

The production-like server reached readiness on loopback. No development
server was used for the Phase 6R authenticated run.

The no-flag check returned HTTP 200 for `/login` with both CSP headers absent:

```text
Report-Only: absent
Enforced CSP: absent
```

This confirms that the local Report-Only branch is flag-gated and does not
become an unconditional Production header.

## 7. Browser environment

Chrome was launched from:

```text
C:\Program Files\Google\Chrome\Application\chrome.exe
```

The installed Playwright package was used without downloading a browser.
Every HTTP origin observed by the page was loopback. The browser harness
aborted and recorded any non-loopback HTTP origin; the final external-origin
set was empty.

## 8. CSP Report-Only implementation

`src/proxy.ts` emits exactly one `Content-Security-Policy-Report-Only` header
when both conditions hold:

- `CSP_REPORT_ONLY=true`;
- the request hostname is `127.0.0.1`, `localhost`, or `::1`.

The implementation does not emit `Content-Security-Policy` and does not add
`unsafe-inline`, `unsafe-eval`, wildcard sources, or external origins.

The protected Auth.js path remains responsible for rejecting guests and
non-admin users before protected rendering. Public requests use the local
nonce-bearing Report-Only branch only on loopback.

## 9. Nonce generation

Each local Report-Only request generates a nonce from
`globalThis.crypto.randomUUID()`, Base64 encodes it, places it in the policy,
and forwards it to the Next.js renderer through the request `x-nonce` header.

The nonce is not hard-coded, environment-provided, persisted in PostgreSQL,
written to a server log, or returned in test output. Browser assertions used
bounded SHA-256 hashes and the DOM `element.nonce` property.

## 10. Nonce uniqueness

Repeated local responses received different bounded nonce hashes. The Phase
6Q repeated `/login` assertion also passed with different request nonces. The
production-like protected dashboard responses generated distinct request
nonces and did not reuse a previous response nonce.

No nonce reuse was observed. This result is separate from the static-login
matching failure in the next section.

## 11. Nonce ↔ HTML matching

Production-like dynamic protected responses matched the response policy nonce
to the rendered DOM nonce property. Each dashboard response had one distinct
DOM nonce value across its nonce-bearing elements.

The production-like `/login` response is a finding:

- Report-Only header count: 1;
- enforced CSP header count: 0;
- HTML/DOM nonce-bearing element count: 0;
- policy nonce matched to DOM nonce: false;
- browser `script-src-elem` events were observed for the static login page.

This is not treated as a clean nonce match merely because the page still
renders in Report-Only mode. A nonce-bearing candidate policy must either
force the login route through the framework's dynamic nonce path or use a
different, separately reviewed policy design for that static route.

## 12. Dynamic rendering

The Phase 6R build identified `/login` as static (`○`) and the dashboard and
Auth.js routes as dynamic (`ƒ`). The dynamic protected dashboard responses
received matching nonces and rendered successfully.

The static classification of `/login` is the root of the candidate-policy
finding: the proxy can attach a request nonce to the response policy while
the statically rendered login document contains no matching nonce-bearing
framework elements. The application remains functional because the header is
Report-Only, but this is not suitable evidence for enforcement.

## 13. Cache behavior

Phase 6Q's repeated `/login` HTTP check observed `Cache-Control: no-cache,
must-revalidate` and different nonces across requests. Phase 6R did not claim
that this header alone solves the production-like static-route issue.

The Phase 6R build still classified `/login` as static, while authenticated
dashboard responses were dynamic. Before enforcement, the static login route
must be revalidated after the nonce strategy is corrected, including cache
behavior and nonce-bearing HTML generation.

## 14. HTTP headers

The production-like browser matrix observed the following bounded results:

| Route/result | Status | Report-Only | Enforced CSP | Nonce result |
| --- | ---: | ---: | ---: | --- |
| `/api/auth/providers` | 200 | 1 | 0 | no HTML nonce required |
| `/login` | 200 | 1 | 0 | no matching DOM nonce; finding |
| `/dashboard` | 200 | 1 | 0 | matched |
| `/dashboard/biomassa` | 200 | 1 | 0 | matched |
| `/dashboard/batubara` | 200 | 1 | 0 | matched |
| `/dashboard/solar` | 200 | 1 | 0 | matched |
| `/dashboard/stok` | 200 | 1 | 0 | matched |
| `/dashboard/target` | 200 | 1 | 0 | matched |
| protected route after logout | 200 final `/login` | 1 | 0 | static-login finding |

No duplicate enforced CSP header was observed. The status 200 on the
protected-after-logout row is the final login document after a redirect.

## 15. Public routes

`/api/auth/providers` returned HTTP 200 and remained same-origin. `/login`
returned HTTP 200 and rendered the Credentials form. The root and public
redirect behavior were already covered by the Phase 6Q baseline.

No OAuth, Supabase Auth, Resend, Google Sheets, or password-recovery flow was
opened by the browser.

## 16. Auth.js Credentials

The corrected production-like Auth.js run passed:

- Credentials provider metadata returned HTTP 200;
- valid local admin credentials redirected to `/dashboard`;
- `/api/auth/session` returned HTTP 200 with `hasUser=true` after login;
- the user menu was opened before clicking the `Keluar` server-action button;
- logout navigated to `/login`;
- `/api/auth/session` returned HTTP 200 with `hasUser=false` after logout;
- `/dashboard` after logout resolved to `/login`;
- a wrong password kept the user on `/login` and displayed the generic error
  state.

The first full data run attempted the logout button while its enclosing
`<details>` menu was closed and therefore timed out. This was a browser
locator issue, not accepted as an application result; the dedicated rerun
opened the menu and passed the lifecycle assertions above.

## 17. Session

The valid-login session was observed in the browser without printing session
JSON, cookies, or tokens. The post-logout session no longer contained a user.
The protected-route middleware and server layout both enforced the admin
boundary.

The observed behavior is consistent with the existing Auth.js JWT strategy,
two-hour session policy, role check, and session-version revalidation. No
Production session or user metadata was changed.

## 18. Dashboard

With the local PostgreSQL fixture, all six protected dashboard routes returned
HTTP 200 and retained their requested route:

```text
/dashboard
/dashboard/biomassa
/dashboard/batubara
/dashboard/solar
/dashboard/stok
/dashboard/target
```

The pages rendered non-empty fixture-backed content. Each route received one
Report-Only header, no enforced CSP, and a matching dynamic DOM nonce.

## 19. Recharts

The browser found rendered SVG/Recharts content and exercised pointer/click
interaction:

- `/dashboard`: 1 Recharts wrapper and 1 surface;
- `/dashboard/biomassa`, `/dashboard/batubara`, `/dashboard/solar`, and
  `/dashboard/stok`: 2 wrappers and 2 surfaces each;
- `/dashboard/target`: 1 wrapper and 1 surface.

Tooltips were observed on all six dashboard routes. Selected-date evidence
was observed on the line/bar chart routes; the target pie tooltip rendered
without the selected-date line, as expected from its component shape.

No page error or non-CSP application console error was observed during chart
rendering or interaction.

## 20. Six dynamic styles

All six known source locations were exercised in the authenticated dashboard
run. The bounded DOM evidence was:

| Source location | Dynamic property | Runtime evidence |
| --- | --- | --- |
| `DetailCharts.tsx:181` | `backgroundColor` | line-chart legend dot rendered on detail routes |
| `InteractiveChartPrimitives.tsx:131` | `height`, `minHeight` | ChartFrame styles observed on all six dashboard routes |
| `InteractiveChartPrimitives.tsx:167` | legend `backgroundColor` | legend styles observed on four detail routes |
| `InteractiveChartPrimitives.tsx:222` | tooltip `borderTopColor` | tooltip style observed on five routes after hover |
| `InteractiveChartPrimitives.tsx:235` | tooltip entry `backgroundColor` | tooltip entry style observed on five routes after hover |
| `OverviewDashboard.tsx:87` | progress `width` | overview target progress element observed |

The candidate policy reported `style-src-attr` events for these inline style
attributes. No `unsafe-inline` exception was added. The styles are therefore
functionally rendered under Report-Only but are not clean for enforcement.

## 21. Google API boundary

The browser observed only the loopback application origin. It did not request
`oauth2.googleapis.com`, `sheets.googleapis.com`, or another Google origin.

Google Sheets remains a server-side import boundary. The Phase 6R dashboard
run used PostgreSQL as the source and did not run a sync or import.

## 22. connect-src

The observed browser network surface required only same-origin connectivity.
The candidate `connect-src 'self'` therefore matched the exercised local
surface. No external origin was added to the policy.

This does not authorize a Production connect-src change; authenticated Google
sync remains outside the browser test scope.

## 23. images/fonts

No external image or font origin was observed. The local logo and existing
font stack rendered without an external browser dependency. The candidate
policy keeps `img-src 'self'` and `font-src 'self'` without `data:` or `blob:`
exceptions.

The bounded request-failure capture contained fetch-type entries from repeated
Next navigation/data activity, not an observed image/font failure. No raw
request URL was emitted.

## 24. frame/object

No iframe, object, or embed requirement was found in the application source or
the exercised pages. The candidate remains:

```text
frame-src 'none'; object-src 'none'
```

The existing anti-framing header behavior was not changed.

## 25. form-action

The Credentials form submitted successfully through its same-origin Server
Action, and the invalid-credentials state returned to the same login page.
No `form-action` CSP violation was observed. The candidate remains:

```text
form-action 'self'
```

## 26. frame-ancestors

No embedding test was performed because no in-scope embedding consumer exists.
The candidate remains `frame-ancestors 'none'`, aligned with the existing
anti-framing posture. No Production framing header changed.

## 27. navigation

The following local transitions passed:

- public provider metadata -> login;
- login -> valid Credentials -> dashboard;
- dashboard -> all five detail dashboards;
- user menu -> logout -> login;
- logout -> protected dashboard request -> login;
- login -> invalid credentials -> generic login error.

No external navigation occurred. No claim is made for browser back/forward,
not-found navigation, or an authenticated password-change flow in this phase.

## 28. error states

The invalid Credentials state rendered the generic user-facing error without
printing provider/database detail. The unauthenticated protected redirect
returned to `/login`.

Not-found, malformed sync API, Google provider failure, and server error-page
browser states were not part of the successful authenticated dashboard matrix.
They remain follow-up coverage rather than being marked as passed.

## 29. CSP violations

Production-like Report-Only findings were collected through
`securitypolicyviolation` events with bounded directive and blocked-kind
values.

In the full data run, the aggregate capture recorded 83 events:

```text
script-src-elem: 33
style-src-attr: 50
```

The static login document produced `script-src-elem` events, including
same-origin script URLs and inline blocked kinds, because the nonce-bearing
candidate uses `strict-dynamic` while the static login document has no matching
nonce. Dynamic dashboard documents produced `style-src-attr` events from the
known React inline styles after chart/progress rendering.

The corrected Auth.js-only rerun independently recorded 55 static-login
`script-src-elem` events across its login lifecycle. No `eval` events were
observed in the production-like runtime; the `eval` findings remain a Phase
6Q development-mode observation.

Report-Only did not prevent rendering. That does not convert these findings
into enforcement readiness.

## 30. Development-vs-production-like comparison

| Concern | Phase 6Q `next dev` | Phase 6R `next start` |
| --- | --- | --- |
| Runtime | development | `NODE_ENV=production` production-like |
| Auth/dashboard fixture | unavailable | disposable PostgreSQL/admin fixture |
| nonce-bearing dashboard HTML | not exercised | matched |
| script CSP findings | `eval`/inline development findings | static `/login` `script-src-elem` findings; no eval observed |
| dynamic style findings | public development style findings | authenticated `style-src-attr` findings |
| enforced CSP | absent | absent |
| external browser origins | none | none |

The comparison demonstrates why development findings cannot be copied into a
Production policy, while also showing that the static login discrepancy only
appears when the production-like build/runtime path is exercised.

## 31. Browser console

The bounded browser capture recorded zero non-CSP console errors/warnings,
zero page errors, and no non-CSP application error during the dashboard and
Auth.js matrix. Console entries classified as CSP messages were kept separate.

The full data harness recorded 53 failed requests, all bounded as `fetch`
resource type; the corrected Auth.js-only run recorded 7. The repeated full
page navigations cancel Next data requests while switching routes, so this is
reported as a follow-up performance observation rather than silently treated
as zero failures. No raw URLs were printed and the pages still rendered.

## 32. Security leakage

The run emitted no raw nonce, secret, password, cookie, Authorization header,
session token, database URL, Google private key, or Production environment
value. Nonces were represented only by bounded hashes in memory/output.

Temporary server logs and browser harness output were removed or bounded. No
diagnostic endpoint or database persistence for CSP reports was added.

## 33. Performance observations

The production-like build completed successfully. Next reported approximately
2.0 seconds for compilation, 2.5 seconds for TypeScript, and 2.4 seconds for
static page generation in the local run; these are local observations, not a
Production SLO measurement.

Dashboard charts rendered with the synthetic two-day fixture and responded to
hover/click interaction. The request-failure counts in section 31 should be
rechecked with a dedicated navigation/network harness before any performance
conclusion is made.

## 34. Production non-interference

Production was not touched:

- Production deployment/redeploy: 0;
- Preview deployment: 0;
- Production sync attempts/retries: 0;
- Production Cron executions: 0;
- Production database writes: 0;
- Production migration execution/resolution: 0;
- Google Sheets reads/writes from the browser run: 0;
- Production environment or secret changes: 0;
- commits: 0;
- pushes: 0.

The scripts `supabase:production:migrate-status` and
`supabase:production:migration:preflight` were deliberately not run because
they load the project Supabase/Production environment and are outside this
local-only phase.

## 35. Regression gates

The local regression gates passed:

```text
npm.cmd run lint                              PASS
npx.cmd --no-install tsc --noEmit --incremental false  PASS
npm.cmd run db:validate                       PASS
npm.cmd run db:generate                       PASS
npm.cmd run build                             PASS
npm.cmd run auth:security:verify              PASS
npm.cmd run sync:verify-diagnostics           PASS
git diff --check                              PASS
```

The project has no dedicated `typecheck` npm script, so the direct TypeScript
command was used. `npm.cmd`/`npx.cmd` were used because the host PowerShell
Execution Policy blocks the `npm.ps1`/`npx.ps1` shims; the system policy was
not changed.

## 36. Candidate CSP

The candidate remains Report-Only/local review only:

```text
default-src 'self'; script-src 'self' 'nonce-<REQUEST_NONCE>' 'strict-dynamic'; style-src 'self' 'nonce-<REQUEST_NONCE>'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

The policy is not approved for Production or enforcement. It contains no
`unsafe-inline`, `unsafe-eval`, wildcard, external HTTP/HTTPS, `data:`, or
`blob:` exception.

## 37. Required remediation

Before another enforcement review:

1. Make `/login` receive the official request-time nonce path, or define and
   separately review a route policy that does not claim nonce coverage for a
   static document. Re-run raw HTTP and browser DOM matching after the change.
2. Remove or refactor the six inline React style attributes into CSP-compatible
   classes, stylesheet rules, or another reviewed rendering mechanism. Do not
   solve the findings by adding `unsafe-inline`.
3. Re-run the production-like browser matrix and require no static-login
   `script-src-elem` mismatch before considering enforcement.
4. Recheck the bounded `fetch` request failures with a navigation-specific
   network test and retain only evidence that can distinguish canceled RSC
   requests from application failures.
5. Revalidate cache behavior for every nonce-bearing response and document the
   dynamic/static route decision.

## 38. Enforcement readiness

**NOT READY.**

Auth.js, session lifecycle, dashboard rendering, Recharts interaction, and all
six dynamic styles are now locally exercised. However, the production-like
static `/login` response has a nonce-bearing candidate header without a
matching HTML nonce and reports `script-src-elem`; the dashboard styles report
`style-src-attr`. The candidate therefore must not be enforced and no
Production CSP change is authorized by Phase 6R.

## 39. Documentation changes

Phase 6R updated these active operational documents:

- `docs/PRODUCTION_READINESS.md`;
- `docs/PROJECT_MAP.md`;
- `docs/AGENT_CONTEXT.md`;
- `docs/VERCEL_CONFIGURATION.md`;
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`;
- `docs/GOOGLE_SHEETS_SYNC_HARDENING.md`.

This document is the new mandatory Phase 6R report:

- `docs/PHASE6R_PRODUCTION_LIKE_CSP_RUNTIME_VALIDATION_2026-09-05.md`.

Historical Phase 6O, Phase 6P, and Phase 6Q reports were not rewritten.
Existing `package.json`/`package-lock.json` Playwright entries were observed
and preserved; they were not authored by this report update.

## 40. Safety counters

Phase 6R counters:

- local CSP implementation source files adjusted for production-like gating: 1 (`src/proxy.ts`);
- active documentation files updated: 6;
- new Phase 6R report files: 1;
- disposable PostgreSQL targets used for controlled runs: 2;
- disposable schema/data writes: local-only and removed;
- remaining disposable database listeners: 0;
- remaining temporary cluster directories: 0;
- Production database writes: 0;
- Production migration executions/resolutions: 0;
- Production sync attempts/retries: 0;
- Production Cron executions: 0;
- Preview/Production deployments: 0;
- Google Sheets writes: 0;
- Production environment/secret changes: 0;
- raw nonce values logged: 0;
- observed secret leakage events: 0;
- external browser HTTP origins: 0;
- commits: 0;
- pushes: 0.

Prisma generation and Next build artifacts were local generated artifacts only.

## 41. Final classification

**FAIL — CSP candidate not ready for enforcement.**

Reason:

```text
Production-like local runtime is functional under Report-Only, including
Auth.js Credentials login/session/logout, protected redirect, all six
dashboard routes, Recharts, and all six dynamic-style locations. The candidate
still fails the nonce/HTML contract on static /login and reports
script-src-elem there; authenticated pages report style-src-attr for the six
inline style locations.
```

This classification is scoped to the CSP candidate and its production-like
runtime evidence. It does not mean the deployed Production application was
changed or that Production is unavailable. Production remains without CSP
enforcement, and Phase 6R performed no Production deployment, sync, migration,
Google write, environment change, commit, or push.
