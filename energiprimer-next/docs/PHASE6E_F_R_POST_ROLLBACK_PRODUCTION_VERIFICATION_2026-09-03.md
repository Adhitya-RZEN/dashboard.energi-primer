# PHASE 6E-F-R — POST-ROLLBACK PRODUCTION VERIFICATION

Project: Energi Primer PLN — `energiprimer-next`  
Date: 2026-09-03  
Verification scope: read-only post-rollback Production verification

## 1. Overall Status

**PASS WITH FINDINGS**

All required local regression gates and read-only Production functional checks passed. The active Production deployment is healthy and its Vercel Git metadata matches the current rollback commit. Findings are limited to runtime diagnostic log emission not being observed because this phase intentionally did not execute an authorized sync, and GitHub reports the source commit as unverified.

## 2. Operator Rollback Decision

The operator reported that a manual rollback/deployment had been completed before this verification. No target rollback commit was supplied. Per the Phase 6E-F-R procedure, the current repository HEAD was used as the rollback commit; no historical target was guessed.

This phase performed verification only. No rollback, deploy, sync retry, database write, Google Sheets write, environment change, or credential change was performed by the agent.

## 3. Rollback Commit

- Branch: `NextJs`
- Current HEAD: `da5d9914d6e3e7741ed76cb9ad3bc9ca41646344`
- Commit: `SAFE DIAGNOSTIC INSTRUMENTATION FOR PRODUCTION SYNC FAILURE`
- Commit timestamp: `2026-09-03 21:48:29 +08:00`
- Vercel `githubCommitSha`: exact match with the current HEAD
- Vercel `githubCommitRef`: `NextJs`

## 4. Instrumentation Verification

Instrumentation is present in the verified source commit and local working tree:

- `src/services/google-sheets/sync/diagnostic-core.ts`
- `src/services/google-sheets/sync/diagnostics.ts`
- `src/app/api/sync/google-sheets/route.ts`
- discovery and Google client diagnostic integration
- sync engine lease, run, worksheet, import, row-state, and finalization stages

The diagnostic stage contract includes request, environment, Google configuration/OAuth/metadata, discovery, lease, run creation, worksheet, import, row-state, finalization, and completion stages. The deployed artifact includes the `/api/sync/google-sheets` server function, and its Vercel source metadata matches this instrumented commit.

No authorized sync was executed, so no Production diagnostic log emission was intentionally induced or observed.

## 5. Static Regression

| Gate | Result |
| --- | --- |
| `npm run db:generate` | PASS |
| `npm run db:validate` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run sync:verify-config` | PASS |
| `npm run sync:verify-cron-auth` | PASS |
| `npm run sync:verify-preview-write-safety` | PASS; `databaseWrites: 0` |
| `npm run sync:verify-schema` | PASS |
| `npm run sync:verify-retry` | PASS; static mode |
| `npm run sync:verify-auto-admission` | PASS |
| `npm run dynamic:verify` | PASS |
| `npm run auth:security:verify` | PASS; `databaseWrites: 0`, `networkRequests: 0` |

The auth security verifier reported `AUTH_E2E_ENV_NOT_AVAILABLE`; no live credentialed E2E flow was run in this read-only phase.

## 6. Secret Leakage Review

- `.env.local` and `.env.e2e.local` remained ignored and were not modified.
- `credentials/` remained ignored and was not modified.
- Secret values were not printed or included in this report.
- A tracked-HEAD scan found no literal private-key PEM, Google access token, API key, or service-account credential pattern.
- Diagnostic logging uses bounded request ID, stage, status, duration, error category, and error code fields; it does not log raw exception messages, stacks, bearer tokens, or credential values.
- No environment or credential mutation occurred during this phase.

## 7. Production Deployment Evidence

Read-only Vercel inspection identified the active deployment:

- Target: `production`
- State: `READY`
- Created: `2026-09-03 21:48:36 +08:00`
- Ready: `2026-09-03 21:49:31 +08:00`
- Source repository: `Adhitya-RZEN/dashboard.energi-primer`
- Source ref: `NextJs`
- Source SHA: matches `da5d9914d6e3e7741ed76cb9ad3bc9ca41646344`
- Artifact contains page lambdas, Auth.js, and the Google Sheets sync endpoint; it is not the earlier artifact containing only `_global-error`.

## 8. Production Deployment ID

`dpl_Hg43oUhhgMfGCpZD8nmUMMzy4DEc`

## 9. Production URL

- Canonical: `https://dashboard-energi-primer.vercel.app`
- Deployment URL: `https://dashboard-energi-primer-drlt5eh6p-projek-rzen.vercel.app`

The canonical alias resolved to the inspected READY Production deployment.

## 10. Public Route Verification

Requests were read-only GET requests to the canonical Production URL.

| Route | Result | Evidence |
| --- | --- | --- |
| `/` | PASS | HTTP 200, HTML |
| `/login` | PASS | HTTP 200, HTML |
| `/api/auth/providers` | PASS | HTTP 200, JSON |
| `/dashboard` | PASS | HTTP 307 to `/login?callbackUrl=%2Fdashboard` |

No required public route returned 404.

## 11. Auth Providers Verification

`GET /api/auth/providers` returned HTTP 200 with JSON and one provider key: `credentials`. The response body was not included in the report.

## 12. Guest Dashboard Verification

An unauthenticated `GET /dashboard` returned HTTP 307 with the expected login redirect:

`https://dashboard-energi-primer.vercel.app/login?callbackUrl=%2Fdashboard`

No guest dashboard content was exposed.

## 13. Sync Endpoint Verification

The deployed artifact contains the `/api/sync/google-sheets` server function. The endpoint exists and was tested only with unauthorized POST requests. No valid `CRON_SECRET` was read or used.

## 14. Negative Cron Authorization

| Test | Result |
| --- | --- |
| POST without `Authorization` | HTTP 401 JSON |
| POST with `Authorization: Bearer WRONG_TEST_SECRET` | HTTP 401 JSON |

Both unauthorized requests were rejected before an authorized sync could occur. A 404 was not observed.

## 15. Diagnostic Artifact Verification

Vercel deployment metadata directly confirms the source SHA, branch, READY state, and deployed sync function. Local source inspection confirms the diagnostic instrumentation at that exact SHA.

Runtime diagnostic output was not independently observed from Production because doing so would require an authorized sync or a separate log-access workflow. This is the only artifact/runtime verification finding.

## 16. Cron Schedule Verification

- Path: `/api/sync/google-sheets`
- Schedule in `vercel.json`: `0 22 * * *`
- Schedule in deployed Vercel build metadata: `0 22 * * *`

The configured schedule is consistent between source and active Production artifact.

## 17. Database/Migration Safety

- No Production SQL query, migration, `db push`, migration resolve, or schema write was executed.
- `db:generate` generated the local Prisma client only.
- `db:validate` passed.
- Preview write-safety verification passed with `databaseWrites: 0`.
- Auth security verification passed with `databaseWrites: 0`.
- No Google Sheets write or import was executed.

## 18. Git Safety

- No source file was changed by the agent in this phase.
- No `git reset`, checkout, restore, commit, or push was run.
- Existing untracked artifacts were preserved: the earlier Phase 6E-F report and `../graphify-out/`.
- The required Phase 6E-F-R report is the only new documentation artifact created by this phase.

## 19. Production Safety Counters

| Counter | Value |
| --- | ---: |
| Authorized Production sync executions | 0 |
| Production database/Google Sheets writes | 0 |
| Production migrations, `db push`, or resolve operations | 0 |
| Environment/credential mutations by agent | 0 |
| Agent Production deployments or rollbacks | 0 |
| Agent commits | 0 |
| Agent pushes | 0 |
| Operator manual rollback/deployment | 1, informational and excluded from agent deployment count |

The two negative authorization probes are verification requests, not sync executions.

## 20. Remaining Unknowns

1. A valid authorized Production sync has not been executed in this phase, by design.
2. Runtime diagnostic log emission has not been observed from a real sync execution.
3. Live credentialed Auth E2E was not available to the verifier (`AUTH_E2E_ENV_NOT_AVAILABLE`).
4. Production database migration state and data freshness were not queried or changed in this read-only phase.
5. Historical `08P01`/`08006` database errors remain candidate evidence only.

## 21. Root Cause Classification

**ROOT CAUSE NOT YET IDENTIFIED**

The current Production artifact is functionally healthy after the operator rollback/deployment, but this verification does not establish the root cause of the earlier broken artifact or historical database errors.

## 22. Recommended Next Step

Keep Production unchanged and wait for a new explicit approval for **one authorized Production sync**. Any such sync must be separately approved and monitored using the deployed diagnostic instrumentation.

