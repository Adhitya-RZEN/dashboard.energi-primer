# PHASE 6V — PRODUCTION DEPLOYMENT & CSP ARTIFACT VERIFICATION

Project: Energi Primer PLN Jeranjang  
Review date: 2026-09-05  
Verification continuation: 2026-09-06  
Scope: verification-only after an operator-managed Production deployment.

Follow-up: Phase 6V-R locally identified and remediated the incomplete
Recharts measurement patch. That local PASS does not change this Production
report's FAIL classification until an operator deploys the fix and a new
Phase 6V verifies the canonical artifact.

## Executive Summary

**Final classification: FAIL.**

The repeated read-only verification confirms that the canonical Production
domain now serves the newest READY deployment
`dpl_4AV8aVmD31A2QUnFb5Fh18UN3e1H`, whose Vercel source SHA matches local
HEAD `9de33b7811cf99f64580b84ac8e62a453d4726d9`. The alias/provenance finding
from the first run is therefore resolved at the HTTP and deployment-metadata
boundary.

The repeat found a real authenticated browser regression: five of six
dashboard routes produce a client-side exception,
`ReferenceError: measureTextWithDOM is not defined`. Only
`/dashboard/target` completed the Recharts, tooltip, interaction, and layout
checks. All six authenticated server-rendered HTML responses returned `200`
with valid application markup, so the failure is in the browser client
runtime/bundle path rather than the unauthenticated route boundary. Under the
Phase 6V rules, this is a dashboard/artifact regression and the final result
remains **FAIL**.

Production CSP enforcement remains OFF: neither CSP nor CSP Report-Only was
observed. Read-only database, migration, schema, source-policy, negative Cron,
static regression, and diagnostic gates passed. The normal Auth.js login,
session, dashboard marker, logout, post-logout session, and protected-route
assertions passed. The browser diagnostics used the same locally available
credential without printing its value; only the expected authentication-side
`last_login_at` write may occur.

No deployment, alias promotion, authorized sync, retry, migration, seed,
database business write, secret change, environment change, commit, or push
was performed by the agent. The agent made documentation-only changes and
removed temporary verification scripts.

## Deployment Provenance

| Item | Result |
| --- | --- |
| Local branch | `NextJs` |
| Local HEAD | `9de33b7811cf99f64580b84ac8e62a453d4726d9` |
| Commit subject | `fix(csp): make login nonce-compatible and remove inline styles` |
| Vercel project | `dashboard-energi-primer` |
| Canonical Production domain | `https://dashboard-energi-primer.vercel.app` |
| Deployment state/target | `READY` / `Production` |
| Newest READY Production deployment | `dpl_4AV8aVmD31A2QUnFb5Fh18UN3e1H` |
| Newest deployment URL | `https://dashboard-energi-primer-58bhpi82x-projek-rzen.vercel.app` |
| Newest deployment source | `9de33b7811cf99f64580b84ac8e62a453d4726d9` / ref `NextJs` |
| Newest deployment time | Approximately 2026-09-05 23:30 WITA |
| Canonical domain deployment | `dpl_4AV8aVmD31A2QUnFb5Fh18UN3e1H` |
| Canonical deployment source | `9de33b7811cf99f64580b84ac8e62a453d4726d9` / ref `NextJs` |
| Canonical deployment time | Approximately 2026-09-05 23:30 WITA |

The latest deployment was the newest READY Production deployment returned by
the read-only Vercel listing and its Vercel `gitCommitSha` exactly matches the
local HEAD. A repeat Vercel metadata inspection and HTTP comparison show that
the canonical alias now serves the same deployment as the direct URL. The
Production artifact is therefore **provenance matched** to local source at
the deployment/SHA level. Vercel exposed no verified commit signature
(`githubCommitVerification` was empty); signature verification is therefore
**unverified**, not assumed.

### Source/artifact consistency

The following paths were confirmed present in local HEAD and are included in
the source tree associated with the matched commit:

```text
src/proxy.ts
src/app/login/page.tsx
src/services/google-sheets/sync/discovery.ts
src/services/google-sheets/sync/engine.ts
src/services/google-sheets/sync/lease.ts
src/services/google-sheets/sync/diagnostic-core.ts
src/services/google-sheets/sync/diagnostics.ts
src/services/google-sheets/sync/bb-policy.ts
src/lib/google-sheets.ts
package.json
package-lock.json
vercel.json
```

The committed source contains `export const dynamic = "force-dynamic"` for
the login page and the loopback-only CSP Report-Only boundary in
`src/proxy.ts`. The local dependency patch produces the canvas measurement
symbol `measureTextWithCanvas`; the Production browser finding still reports
the undefined legacy symbol `measureTextWithDOM`, indicating a deployed
Recharts bundle mismatch. The exact deployed JavaScript bytes were not
extracted, so the bundle-mismatch conclusion is an evidence-based inference
from runtime behavior and local artifact inspection.

## Production Routes

Read-only GET/HEAD and browser checks used the canonical domain and the
newest direct deployment URL.

| Route/check | Canonical result | Newest direct result |
| --- | --- | --- |
| `/` | `200`; browser ends at login without a session | `200`; browser ends at login without a session |
| `/login` | `200`; private no-cache behavior | `200`; private no-cache behavior |
| `/api/auth/providers` | `200`; only `credentials` | `200`; only `credentials` |
| `/dashboard` and five dashboard sections | `307` to login | `307` to login; same canonical artifact |

The six protected paths checked were `/dashboard`, `/dashboard/batubara`,
`/dashboard/biomassa`, `/dashboard/solar`, `/dashboard/stok`, and
`/dashboard/target`. Repeated unauthorized checks returned `307` for all six;
the authenticated browser check is recorded separately below.

The provider payload was parsed without printing its body: provider keys were
exactly `credentials`; Supabase, Resend, and recovery providers were absent.
The legacy public recovery paths `/password/reset`, `/forgot-password`, and
`/password/forgot` each returned `404`.

## Login / Nonce Verification

The local build reports `/login` as dynamic (`ƒ`). Five independent fresh
browser requests were made to each Production target, with a unique cache
buster and a fresh browser context per request.

| Target | Requests | HTTP 200 | CSP state | Response nonce | DOM nonce | Style attrs | Console/page errors |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Canonical | 5 | 5/5 | absent | 0/5 | 0/5 | 0 each | 0/0 each |
| Newest direct | 5 | 5/5 | absent | 0/5 | 0/5 | 0 each | 0/0 each |

Because Production CSP is intentionally OFF, the loopback-only Phase 6S
nonce injection is not activated on Vercel. With no CSP header, the
response/DOM nonce comparison is recorded as `not-applicable-csp-off`; there
was no nonce to reuse or leak. This is distinct from the local Report-Only
runtime, where nonce presence, DOM matching, and uniqueness were verified in
Phase 6S/6T. Both Production targets now show the same private no-cache
behavior and zero reviewed style attributes. No nonce is expected while CSP
is OFF; this is not a nonce failure.

No emitted Production response contained `unsafe-inline` or `unsafe-eval`, and
neither CSP enforcement nor Report-Only was enabled.

## Auth.js E2E

One normal valid Credentials authentication flow was completed against the
canonical Production domain, now serving the latest deployment, using
credentials already present in the local `.env.e2e.local`. Secret values were
not printed or requested through chat.

The flow performed:

1. GET `/login` — `200`.
2. GET CSRF — `200`.
3. POST Credentials callback — successful redirect without an error.
4. GET session — authenticated session present.
5. GET `/dashboard` — `200`, minimum marker `Overview Energi Primer` present.
6. POST sign-out — successful redirect.
7. GET session — JSON `null`, confirming invalidation.
8. GET `/dashboard` after logout — `307` back to login.

The flow passed functionally. The login flow may update `last_login_at`, which
is the expected Auth.js authentication write and is not a business-data sync
write. Additional authenticated browser diagnostics were run to inspect the
six dashboard routes; they are counted explicitly under Safety Counters.

## Dashboard / Recharts Verification

The authenticated server-rendered HTML fetch for all six routes returned
`200`, valid `<main>` markup, no application-error text, and Recharts markup.
The browser runtime result was:

| Route | Browser result |
| --- | --- |
| `/dashboard` | **FAIL** — client-side exception: `ReferenceError: measureTextWithDOM is not defined` |
| `/dashboard/biomassa` | **FAIL** — same client-side exception |
| `/dashboard/batubara` | **FAIL** — same client-side exception |
| `/dashboard/solar` | **FAIL** — same client-side exception |
| `/dashboard/stok` | **FAIL** — same client-side exception |
| `/dashboard/target` | **PASS** — marker, Recharts surface, tooltip, interaction, progress/layout checks; zero reviewed style attrs |

The five failures were observed as a browser console `ReferenceError`, not a
network cancellation or CSP violation. `/dashboard/target` rendered normally
with tooltip/interaction. The browser diagnostic recorded five console errors,
zero page errors, and no bad HTTP responses in the final run. This is a real
client-side Production regression despite the successful server HTML and
Auth.js HTTP checks.

## CSP Production State

`Content-Security-Policy` and `Content-Security-Policy-Report-Only` were absent
from sampled responses on both the canonical domain and newest direct
deployment. Therefore:

**Production CSP enforcement = OFF.**

The following remains a design candidate only and was not enabled:

```text
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
upgrade-insecure-requests;
```

Phase 6V did not add `unsafe-inline`, `unsafe-eval`, wildcard sources, or
Google origins, and did not change Production CSP configuration.

## Security Headers

The canonical and newest direct responses retained the following baseline:

```text
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

No evidence of secret, cookie, credential, service-account, `DATABASE_URL`,
Prisma raw error, or stack-trace leakage was found in the inspected headers or
sanitized route probes. Response bodies containing credentials or tokens were
not printed.

## Database Read-Only Verification

All Production database checks in this phase were read-only. The migration
status and preflight verifiers reported:

- canonical Production migration directory: `prisma/production`;
- one applied migration: `20260901130000_production_schema_baseline`;
- zero pending, failed, rolled-back, duplicate, unfinished, or unexpected migrations;
- schema diff: `EMPTY`;
- runtime pooler: port `6543`;
- migration/direct connection: port `5432`;
- `migrate deploy` and `migrate resolve`: not run;
- database writes and destructive operations: `0`.

Direct and transaction-pooler runtime read-only checks both identified
database `postgres`, schema `public`, PostgreSQL 17.6, and the expected
application data. Direct SSL verification was `PASS` with `verify-full`; the
pooler reported `PASS_WITH_POOLER_SESSION_NOT_REPORTED` while its connection
verification was `verify-full`. The observed counts were 8,954 application
rows and 2,406 stable-data rows. The July 2026 overview and January–July
monthly coverage passed, including the expected Unit 1/2/3 order; the July
overview had 31 rows and target/progress values consistent with the current
production data.

The synchronization state read-only check reported:

```text
worksheet registry rows: 199
active required worksheets: 7
sync row states: 2409
latest sync run: SUCCESS
latest run rows/skipped: 0/0
open schema changes: 0
active leases: 0
```

A separate static SELECT metadata check reported:

| Metadata | Result |
| --- | ---: |
| Application tables | 30 |
| Public base tables including `_prisma_migrations` | 31 |
| Application columns | 270 |
| Public columns | 278 |
| Application primary keys | 30 |
| Application foreign keys | 19 |
| Application indexes (`pg_indexes`) | 70 |
| Natural-key duplicate groups across 16 checked contracts | 0 |

No INSERT, UPDATE, DELETE, TRUNCATE, ALTER, DROP, reset, seed, migration, or
resolve operation was executed.

## Google Source Policy

No Google Sheets discovery, read, authorized sync, retry, or Google write was
executed in Phase 6V. The exact required business source set remains:

```text
Januari26-BB
Februari26-BB
Maret26-BB
April26-BB
Mei26-BB
Juni26-BB
Juli26-BB
```

The 199 worksheet registry is an inventory/metadata registry, not a plan to
import all 199 worksheets. The Google COPY currently has source business data
through July 2026. Missing August 2026 or later tabs are therefore
**EXPECTED SOURCE STALENESS**, not an importer failure. Source policy was not
changed.

## Cron Verification

`vercel.json` remains configured with:

```text
0 22 * * *
```

That is 22:00 UTC, equivalent to 06:00 WITA on the following day. Six
negative POST authorization probes were sent to the canonical sync endpoint
during the repeated verification window (two rounds of each probe):

| Probe | Result |
| --- | ---: |
| Missing bearer (2 probes) | `401` |
| Malformed bearer (2 probes) | `401` |
| Deliberately wrong bearer (2 probes) | `401` |

No valid `CRON_SECRET` was used. The route's authorization boundary rejected
all six requests before the sync engine. No authorized Cron or sync was
triggered.

## Sync Diagnostic Artifact

The matched source artifact includes the Phase 6E-E/6E-G/6J diagnostic fields
and mapping used by the sync boundary:

```text
request_id
stage
status
duration_ms
errorCategory / error_category
safe_error_code / error_code
optional attempt
optional google_http_status
```

Static diagnostic verification passed the required mapping:

```text
SafeDiagnosticError.category -> errorCategory
P2028 -> category DATABASE, error_code P2028
P2028 -> NON-RETRYABLE
```

Runtime diagnostic execution through an authorized sync was not performed,
because that would be a write-capable Production operation. The static and
local production-like diagnostic evidence remains PASS.

## Regression Gates

| Gate | Result |
| --- | --- |
| `npm.cmd run db:generate` | PASS |
| `npm.cmd run db:validate` | PASS |
| `npm.cmd run lint` | PASS |
| `npx.cmd --no-install tsc --noEmit --incremental false` | PASS |
| `npm.cmd run build` | PASS; `/login` remains dynamic |
| `npm.cmd run csp:patch-dependencies` | PASS via `prebuild` |
| `npm.cmd run auth:security:verify` | PASS; no remote E2E environment, writes 0 |
| `npm.cmd run sync:verify-diagnostics` | PASS |
| `npm.cmd run supabase:production:migrate-status` | PASS; up to date |
| `npm.cmd run supabase:production:migration:preflight` | PASS; diff empty |
| Production direct/pooler runtime read-only checks | PASS |
| `npm.cmd run sync:verify-state` | PASS |
| Source file presence / SHA consistency | PASS for newest direct artifact |
| Production route/browser public smoke | PASS; canonical now matches newest artifact |
| Authenticated server-rendered dashboard HTML | PASS; all six routes returned `200` |
| Authenticated dashboard browser UI | **FAIL; 5/6 routes crash with `measureTextWithDOM` ReferenceError** |
| `/dashboard/target` Recharts interaction | PASS |
| `git diff --check` | PASS |

The package has no `git:diff-check` script; the equivalent read-only Git gate
`git diff --check` passed. Node experimental/module-type warnings were
non-fatal warnings only.

## Safety Counters

| Operation | Count/result |
| --- | ---: |
| Authorized Production sync / sync-engine executions | 0 |
| Unauthorized Cron endpoint probes | 6, all rejected `401` |
| Production sync retries | 0 |
| Production business DB writes | 0 |
| Google writes | 0 |
| Migrations | 0 |
| Migration resolves | 0 |
| DB reset/seed | 0 |
| Environment changes | 0 |
| Secret changes | 0 |
| Agent deployments/redeployments/promotions | 0 |
| Agent commits | 0 |
| Agent pushes | 0 |
| Auth.js credential submissions/flows | 7 observed: 1 normal E2E PASS + 6 browser diagnostic sessions |

The authentication submissions may perform the expected Auth.js `last_login_at`
update; no business-data sync write was performed. The six unauthorized
endpoint probes are counted separately from authorized Production sync
requests. Browser diagnostic sessions were test-only login/logout flows; no
account, password, role, or business data mutation was requested.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | BLOCKER | Five of six authenticated Production dashboard routes crash in the browser with `ReferenceError: measureTextWithDOM is not defined`; this is a real dashboard/client artifact regression. |
| F-02 | HIGH | Local patched Recharts output uses `measureTextWithCanvas`, while the Production runtime still references the undefined legacy symbol. The exact deployed bytes were not extracted; the bundle mismatch is an evidence-based inference and requires a separate authorized code/deployment fix. |
| F-03 | RESOLVED | The canonical alias now serves `dpl_4AV8aVmD31A2QUnFb5Fh18UN3e1H` with SHA `9de33b7...`; the prior alias mismatch is resolved. |
| F-04 | REVIEW | Vercel commit signature/verification metadata is absent; no cryptographic signature is claimed. |
| F-05 | INFO | Production CSP and Report-Only are absent; nonce checks are not applicable while CSP is OFF. |
| F-06 | CONTROL PASS | Auth.js HTTP lifecycle, public routes, headers, read-only database state, Cron authorization boundary, and static gates passed. |

## Risk Classification

There is no evidence from the repeated public artifact, static gates, or
read-only database checks of a CSP enforcement regression, migration
inconsistency, security-header regression, or data-contract duplicate. The
release is nevertheless **FAIL** because authenticated browser traffic has a
real Recharts/client-runtime regression on five dashboard routes. This is not
caused by CSP enforcement (CSP is absent) and is not permission for the agent
to patch or redeploy Production.

## Documentation Updated

The following active documentation was reviewed or updated without deleting
historical phase records:

- `docs/PRODUCTION_READINESS.md`
- `docs/PROJECT_MAP.md`
- `docs/AGENT_CONTEXT.md`
- `docs/VERCEL_CONFIGURATION.md`
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`
- `docs/GOOGLE_SHEETS_SYNC_HARDENING.md`
- `docs/GOOGLE_SHEETS_WORKSHEET_DISCOVERY.md`
- `docs/PHASE6V_PRODUCTION_DEPLOYMENT_CSP_ARTIFACT_VERIFICATION_2026-09-05.md`

The documentation records the reconciled direct/canonical provenance, the
five-route browser regression, CSP OFF state, route/auth/database results,
Cron 06:00 WITA, exact seven worksheets, July source boundary, and the fact
that authorized sync was not run in the repeated Phase 6V verification.
Phase6W is documented as a future hardening stage, not as enabled.

## Final Classification

# PHASE 6V — FAIL

**Canonical artifact provenance now matches the expected deployment, but five
authenticated dashboard routes fail in the browser with an undefined
Recharts measurement symbol.**

Production CSP enforcement remains OFF. Phase 6V must be rerun after an
authorized developer/operator fixes and redeploys the Recharts client bundle,
then verifies the six authenticated dashboard routes on canonical traffic.

## Recommended Next Phase

The next action is a separately authorized code/dependency-bundle remediation
for the `measureTextWithDOM` Production client failure, followed by a new
operator-managed deployment and a clean Phase 6V rerun. The agent must not
patch or promote Production under this verification. Only after a successful
canonical Phase 6V rerun may the team
consider **PHASE 6W — PRODUCTION CSP REPORT-ONLY ROLLOUT**, which requires a
separate operator approval/action. CSP enforcement remains out of scope and
disabled.

STOP. No deployment, sync, migration, secret/environment change, CSP
enablement, commit, or push is authorized by this report.
