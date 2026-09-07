# PHASE 6V-R — RECHARTS CLIENT BUNDLE INVESTIGATION & LOCAL REMEDIATION

Project: Energi Primer PLN Jeranjang
Date: 2026-09-06
Scope: local investigation and local remediation only.

Follow-up: the operator deployed the reviewed commit and the 2026-09-06
Phase 6V repeat verified all six Production dashboards. The local remediation
and its Production handoff are complete; see the Phase 6V report for the
remaining Direct Supabase migration-verification finding.

## Executive Summary

Phase 6V-R identified the root cause of the Phase 6V Production browser
failure. The existing CSP dependency patch replaced the Recharts
measureTextWithDOM function definition with measureTextWithCanvas, but left two
executable measureTextWithDOM(text, style) call sites in each Recharts
entrypoint, es6 and lib. The resulting module called an identifier that no
longer existed and produced:

    ReferenceError: measureTextWithDOM is not defined

The defect was reproduced after a clean npm ci --ignore-scripts and the
existing patch. The patch script was corrected locally to replace all call
sites, preserve idempotence, and assert that the patched dependency has canvas
call sites and no executable legacy call sites.

The clean production build passed after remediation. Two independent
production-like runs with fresh disposable PostgreSQL clusters and local admin
fixtures passed Auth.js, nonce/CSP checks, all six dashboards, Recharts,
tooltip, interaction, layout, and application-error gates.

PHASE 6V-R final classification: PASS.

This is a local remediation result only. Production is not considered fixed
until an operator deploys this source and a new Phase 6V verifies the
Production artifact. Phase 6W remains blocked.

## Phase 6V Failure Evidence

The preceding Production verification reported:

| Route | Phase 6V Production browser result |
| --- | --- |
| /dashboard | ReferenceError: measureTextWithDOM is not defined |
| /dashboard/biomassa | ReferenceError: measureTextWithDOM is not defined |
| /dashboard/batubara | ReferenceError: measureTextWithDOM is not defined |
| /dashboard/solar | ReferenceError: measureTextWithDOM is not defined |
| /dashboard/stok | ReferenceError: measureTextWithDOM is not defined |
| /dashboard/target | Recharts interaction passed |

All six authenticated server-rendered HTML responses were HTTP 200. The
failure was therefore narrowed to the browser client bundle/runtime path, not
route authorization, server HTML, database migration state, or CSP
enforcement. Production CSP was absent and remained OFF.

## Baseline Environment

| Item | Baseline |
| --- | --- |
| Branch | NextJs |
| HEAD | 9de33b7811cf99f64580b84ac8e62a453d4726d9 |
| Commit subject | fix(csp): make login nonce-compatible and remove inline styles |
| Node.js | v24.17.0 |
| npm | 11.13.0 |
| Next.js | 16.3.3 |
| React / React DOM | 19.2.8 / 19.2.8 |
| Recharts | 3.10.1 |
| package-lock | lockfile version 3 |
| Effective Recharts installations | one |

Requested baseline gates before remediation all passed:

| Gate | Result |
| --- | --- |
| npm.cmd run db:generate | PASS |
| npm.cmd run db:validate | PASS |
| npm.cmd run lint | PASS |
| npx.cmd --no-install tsc --noEmit --incremental false | PASS |
| npm.cmd run build | PASS |

The clean-room install used npm ci --ignore-scripts so the unpatched dependency
could be observed before explicitly running the patch. Its first build stopped
because ignoring lifecycle scripts also left the generated Prisma Client
unavailable. Running npm.cmd run db:generate restored that local generated
client; the subsequent clean build passed. npm ci reported three high-severity
audit advisories; no unrelated dependency upgrade was made.

## Symbol Origin Investigation

The symbol originated in upstream Recharts 3.10.1, not application source.

After clean installation and before the local patch:

| Location | Evidence |
| --- | --- |
| node_modules/recharts/es6/util/DOMUtils.js | one definition and two calls to measureTextWithDOM(text, style) |
| node_modules/recharts/lib/util/DOMUtils.js | one definition and two calls to measureTextWithDOM(text, style) |
| src/ | no application call site or definition |
| scripts/patch-csp-dependencies.mjs | one intentional source-before-patch marker |
| .next after fixed build | no measureTextWithDOM occurrence in executable or source-map search |

The original patch used replaceSection beginning at the upstream function
definition and ending at getStringSize. It replaced the definition body but
did not rename the two calls inside getStringSize. This explains the observed
partial transformation: a valid measureTextWithCanvas definition remained
alongside calls to the undefined legacy symbol.

No duplicate Recharts version was found. The failure was reproducible from the
clean lockfile plus the local patch, so a Vercel cache or arbitrary dependency
version is not required to explain it.

## Recharts Dependency Analysis

The clean dependency tree was:

    recharts@3.10.1
      react@19.2.8 (deduped)
      react-dom@19.2.8 (deduped)
    next@16.3.3
    react@19.2.8
    react-dom@19.2.8

package.json, package-lock.json, and node_modules/recharts/package.json all
agree on Recharts 3.10.1. The lockfile resolves the standard
recharts-3.10.1.tgz package. No package version, registry entry, or lockfile
was changed.

## Patch Analysis

The local patch in scripts/patch-csp-dependencies.mjs was corrected with the
smallest change that closes the verified defect:

1. applyReplacements now uses replaceAll so repeated call sites are all
   transformed.
2. The idempotence check remains before replacement, preserving the Next
   route-announcer patch behavior.
3. Every executable measureTextWithDOM(text, style) call is changed to
   measureTextWithCanvas(text, style) in both es6 and lib files.
4. The stale comment Measure using DOM is changed to Measure using canvas.
5. A post-patch assertion fails if an executable legacy call remains or a
   canvas call path is absent.

The patch script was run twice after a clean install. Both runs passed. The
Next route-announcer constants remained declared exactly once, confirming that
idempotence was preserved.

The canvas implementation creates a canvas, applies relevant font and
text-transform properties, calls context.measureText, accounts for letter
spacing, returns width and height, and falls back to zero dimensions on
failure. No dashboard business logic was changed.

## Build Pipeline Analysis

The project lifecycle is:

    npm install / npm ci
      -> postinstall: npm run csp:patch-dependencies
    npm run build
      -> prebuild: npm run csp:patch-dependencies
      -> next build
    npm run start
      -> prestart: npm run csp:patch-dependencies

The clean-room verification used npm ci --ignore-scripts, applied the patch
explicitly, generated Prisma Client locally, and then ran next build. The
normal prebuild hook ran the patch again and passed.

The exact Vercel lifecycle was not changed or redeployed in Phase 6V-R. The
previous Production symptom is now explained by the incomplete patch logic.
Whether a particular deployment invoked the patch through postinstall or
prebuild remains an operator deployment-log concern.

## .next Bundle Analysis

After the fixed clean build:

| Search | Result |
| --- | ---: |
| .next files containing measureTextWithDOM | 0 |
| .next executable JavaScript files containing measureTextWithDOM | 0 |
| .next files containing measureTextWithCanvas | 2 source-map entries |
| Recharts executable files containing measureTextWithDOM(text, style) | 0 |
| Recharts executable files containing measureTextWithCanvas(text, style) | 2 |

The minified Turbopack JavaScript does not preserve the helper source identifier
in every executable chunk. The dependency-source assertion and full browser
runtime tests are therefore the authoritative symbol-specific checks. The
source maps retain the expected canvas implementation evidence.

## Root Cause

Confirmed root cause: the local Recharts dependency patch was partial. It
renamed the measureTextWithDOM declaration to measureTextWithCanvas but left
the two getStringSize call sites unchanged in both Recharts module formats.
Runtime execution then raised a ReferenceError when the affected dashboard
charts measured text.

The clean-room reproduction rules out duplicate dependency versions and stale
node_modules as the primary cause. The Production symptom is consistent with
this exact partial patch. Deployed-byte extraction was not performed in this
local-only phase, so the exact historical Production bundle remains an
operator deployment artifact question; the source patch defect itself is
confirmed.

## Remediation Applied

Only scripts/patch-csp-dependencies.mjs was changed for the application
remediation. The change preserves:

- Recharts 3.10.1, Next.js 16.3.3, and React 19.2.8;
- Auth.js and Prisma architecture;
- dashboard data contracts and business logic;
- Google Sheets source policy and sync/Cron code;
- migration history and security headers;
- Production CSP OFF state.

No Production deployment, configuration, environment, secret, database, or
Google Sheets action was performed.

## Files Changed

Application/remediation source:

    scripts/patch-csp-dependencies.mjs

Documentation updated:

    docs/PHASE6V-R_RECHARTS_CLIENT_BUNDLE_REMEDIATION_2026-09-06.md
    docs/PHASE6V_PRODUCTION_DEPLOYMENT_CSP_ARTIFACT_VERIFICATION_2026-09-05.md
    docs/PRODUCTION_READINESS.md
    docs/PROJECT_MAP.md
    docs/AGENT_CONTEXT.md
    docs/VERCEL_CONFIGURATION.md
    docs/VERCEL_DEPLOYMENT_RUNBOOK.md
    docs/GOOGLE_SHEETS_SYNC_HARDENING.md
    docs/GOOGLE_SHEETS_WORKSHEET_DISCOVERY.md

Temporary Phase 6V diagnostic scripts were removed after use. No unrelated
application source file was modified.

## Dependency Changes

No dependency or lockfile change was made.

    next       16.3.3  (unchanged)
    react      19.2.8  (unchanged)
    react-dom  19.2.8  (unchanged)
    recharts   3.10.1  (unchanged)

## Disposable PostgreSQL

Two independent local runs used scripts/phase6s-local-runtime.mjs.

- PostgreSQL 18.4 was started on loopback port 55434 by the harness.
- Each run created a fresh temporary cluster and phase6s database.
- Each run created a random local admin fixture and local dashboard data.
- Each run used a local random Auth.js secret and local Cron secret.
- Each run stopped the runtime and removed the temporary database directory.
- Cleanup reported disposableDatabaseRemoved: true and
  temporaryDirectoryRemoved: true.
- No Production database URL was passed to the runtime; the harness overrides
  DATABASE_URL with the loopback disposable URL.

The first sandbox-only harness attempt was blocked by Windows restricted-token
permissions while starting PostgreSQL. Elevated execution was still
loopback-only and completed successfully; this was an environment permission
issue, not an application result.

## Local Production-Like Runtime

Both successful runs used:

    NODE_ENV=production
    next start
    DASHBOARD_DATA_SOURCE=postgres
    CSP_REPORT_ONLY=true
    browser origin: loopback-only

A no-flag control also passed in both runs:

    /login status: 200
    Content-Security-Policy-Report-Only: absent
    Content-Security-Policy: absent

The report-only header and nonce behavior were confined to the local loopback
harness. Production CSP remains OFF and was not changed.

## Browser Test Matrix

| Gate | Run A | Run B |
| --- | --- | --- |
| Production-like runtime started | PASS | PASS |
| Fresh disposable PostgreSQL/admin fixture | PASS | PASS |
| Auth.js valid login/session/logout | PASS | PASS |
| Invalid credentials generic behavior | PASS | PASS |
| Five fresh nonce probes | 5/5 match and unique | 5/5 match and unique |
| CSP violations / external origins | 0 / none | 0 / none |
| Application console errors | 0 | 0 |
| Page errors | 0 | 0 |
| Dashboard routes | 6/6 PASS | 6/6 PASS |
| Cleanup | PASS | PASS |

The harness reported fetches aborted/cancelled during navigation while every
tested page rendered successfully. They were classified as browser
cancellation artifacts, not application failures.

## Six Dashboard Results

Both Run A and Run B passed every route:

| Route | HTTP | Marker | Recharts | Tooltip | Interaction | Style attrs |
| --- | ---: | --- | --- | --- | --- | ---: |
| /dashboard | 200 | PASS | PASS | PASS | PASS | 0 |
| /dashboard/biomassa | 200 | PASS | PASS | PASS | PASS | 0 |
| /dashboard/batubara | 200 | PASS | PASS | PASS | PASS | 0 |
| /dashboard/solar | 200 | PASS | PASS | PASS | PASS | 0 |
| /dashboard/stok | 200 | PASS | PASS | PASS | PASS | 0 |
| /dashboard/target | 200 | PASS | PASS | PASS | PASS | 0 |

No ReferenceError, React page error, hydration error, or application console
error was reported in either successful run.

## Recharts Results

Recharts rendered on all six routes in both runs. The harness verified SVG
surfaces, chart targets, tooltip visibility, mouse/legend interaction,
responsive chart frames, progress/layout evidence where applicable, and zero
embedded elements. The gates dashboardPass and applicationErrorPass were true
in both runs.

## measureTextWithDOM Verification

Post-remediation checks produced:

    application source executable call sites: 0
    Recharts executable measureTextWithDOM(text, style) call sites: 0
    Recharts measureTextWithCanvas(text, style) call paths: 2 files (es6 + lib)
    .next executable JavaScript measureTextWithDOM references: 0

The one old identifier in scripts/patch-csp-dependencies.mjs is the literal
upstream marker used to locate the exact dependency function before replacing
it. The post-patch assertion rejects any executable occurrence in the two
patched Recharts files. This marker is not shipped application runtime code.

## Regression Gates

| Command / gate | Result |
| --- | --- |
| npm ci --ignore-scripts | PASS; clean lockfile install |
| npm.cmd run csp:patch-dependencies | PASS; first and second runs |
| npm.cmd run db:generate | PASS |
| npm.cmd run db:validate | PASS |
| npm.cmd run lint | PASS |
| npx.cmd --no-install tsc --noEmit --incremental false | PASS |
| npm.cmd run build | PASS after generated Prisma Client and fixed patch |
| npm.cmd run auth:security:verify | PASS |
| npm.cmd run sync:verify-diagnostics | PASS |
| git diff --check | PASS |
| Run A local production-like browser harness | PASS |
| Run B local production-like browser harness | PASS |

Node experimental/module-type warnings were non-fatal. No git:diff-check script
exists; the equivalent read-only git diff --check gate passed.

## Safety Counters

| Production operation | Count/result |
| --- | ---: |
| Production sync requests | 0 |
| Production sync retries | 0 |
| Production DB writes | 0 |
| Production migrations | 0 |
| Production migration resolves | 0 |
| Production seed/reset | 0 |
| Production environment changes | 0 |
| Production secret changes | 0 |
| Production Cron changes | 0 |
| Production deployments/promotions | 0 |
| Production commits | 0 |
| Production pushes | 0 |
| Google Sheets reads/writes | 0 |

Allowed local-only activity:

- two temporary loopback PostgreSQL fixture creations, including local fixture
  writes removed during cleanup;
- two local Auth.js login/logout test runs with random fixture credentials;
- local dependency installation, Prisma generation, patching, and builds.

No Production credential was requested or printed. No Production last_login_at
write occurred because the Auth.js tests used disposable local admins.

## Documentation Updated

The active documentation now records the confirmed local patch root cause, the
minimal remediation, clean-room/build/browser evidence, and the Production
boundary:

- docs/PRODUCTION_READINESS.md
- docs/PROJECT_MAP.md
- docs/AGENT_CONTEXT.md
- docs/VERCEL_CONFIGURATION.md
- docs/VERCEL_DEPLOYMENT_RUNBOOK.md
- docs/GOOGLE_SHEETS_SYNC_HARDENING.md
- docs/GOOGLE_SHEETS_WORKSHEET_DISCOVERY.md
- docs/PHASE6V_PRODUCTION_DEPLOYMENT_CSP_ARTIFACT_VERIFICATION_2026-09-05.md
- this Phase 6V-R report

Historical Phase 6V evidence was preserved. The earlier Production FAIL is not
rewritten as resolved: it remains the last verified Production state until a
new operator deployment and Phase 6V verification.

## Remaining Production Action

1. Review the local patch change.
2. Operator manually deploys the reviewed source through the approved workflow.
3. Run a new Phase 6V Production verification on the canonical domain.
4. Confirm six authenticated dashboard browser routes, Recharts, tooltip,
   interaction, and zero measureTextWithDOM runtime references.
5. Keep Production CSP enforcement OFF until the new Phase 6V is PASS.
6. Only then consider Phase 6W with separate operator approval.

Phase 6V-R did not deploy, promote, modify Vercel settings, modify Production
environment variables, run sync, run migration, or enable CSP.

## Final Classification

# PHASE 6V-R — PASS

The root cause was identified with clean dependency evidence, the minimal local
patch was applied, the clean production build passed, the legacy executable
call path was removed, and two independent disposable production-like browser
runs passed all six dashboards and Recharts gates.

PHASE 6V-R PASS was the local result at the time of this report. The
operator-managed deployment and the new Phase 6V verification subsequently
completed; Production now passes the six-dashboard browser matrix. See the
current Phase 6V report for the remaining Direct Supabase verification finding.

## Follow-up after operator deployment

The 2026-09-06 Phase 6V repeat verified deployment
`dpl_8AwGQBDB6k9pXcihVgdJnfqfL9f2` from commit `7a67f6e...`. The former
`measureTextWithDOM` browser regression was not reproduced. Production CSP
remains OFF.
