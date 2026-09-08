# PHASE 10R-V4 — VERCEL PREVIEW TRIGGER / DEPLOYMENT BOUNDARY DIAGNOSIS

**Date:** 2026-09-08  
**Status:** `BLOCKED`

## 1. Objective

This phase diagnoses why current-source commit
`958a83518fe18ea7ccc357a5e2790d39ff400828`, already present on the temporary
verification branch and used by Vercel Production, did not produce a matching
Vercel Preview deployment.

The diagnosis is limited to the boundary:

```text
GitHub branch → Vercel Git integration → deployment trigger → Preview
```

No application change, configuration mutation, deployment, or database
operation is part of this phase.

## 2. Baseline

- **Phase 10:** `VERIFIED`
- **Phase 10R:** `BLOCKED`
- **Phase 10R-V2:** `BLOCKED`
- **Phase 10R-V3:** `BLOCKED`
- **Current-source commit:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Verification branch:** `phase10r-v2-verification-20260908`
- **Known current-source Production build:** `PASS`
- **Known current-source Preview:** `NOT AVAILABLE`
- **Production database/migration/mutation:** not performed

The existing Preview from commit `dc5a0c299552738f8434fac0942d1c37d07e7166`
remains invalid evidence for the current source.

## 3. Documentation Baseline

The following documentation was inspected and historical reports were
preserved:

- `docs/PHASE10R_VERCEL_PRISMA_BUILD_INTEGRITY_2026-09-08.md`
- `docs/PHASE10R_V2_CURRENT_SOURCE_VERCEL_VERIFICATION_2026-09-08.md`
- `docs/PHASE10R_V3_CURRENT_SOURCE_VERCEL_PREVIEW_2026-09-08.md`
- `docs/PHASE10_FULL_VALIDATION_PRODUCTION_READINESS_2026-09-08.md`
- `docs/AUTH_IMPLEMENTATION.md`
- `docs/AGENT_CONTEXT.md`
- `docs/VERCEL_CONFIGURATION.md`
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`
- `docs/VERCEL_DEPLOYMENT_READINESS.md`
- `docs/VERCEL_PREVIEW_DEPLOYMENT_2026-09-02.md`
- `docs/PHASE22_VERCEL_PREVIEW_REPORT_2026-09-01.md`
- `docs/PHASE22_VERCEL_PREVIEW_RUNBOOK.md`

`#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt`: **`NOT FOUND`**. No policy was
created or inferred.

The runbooks consistently require a separately verified Preview and prohibit
using Production or an old Preview as a substitute.

## 4. Git State

- **Local branch:** `NextJs`
- **Local HEAD:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **HEAD parent:** `55a5deb9e357944e1d438b766c24317ec198dc17`
- **Remote verification branch:** `phase10r-v2-verification-20260908`
- **Remote verification SHA:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Remote production branch SHA:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Remote match:** `PASS`
- **Ancestry:** target SHA is an ancestor of local HEAD; exact equality also
  holds.
- **Push/rewrite during V4:** `NOT PERFORMED`; the existing branch was not
  pushed again and no history was rewritten.

The Git remote reports that the repository moved to the canonical
`Adhitya-RZEN/dashboard.energi-primer` location. The Vercel project is linked
to that canonical repository metadata.

## 5. Vercel Project

- **Project:** `projek-rzen/dashboard-energi-primer`
- **Project ID:** `prj_CuwETLeUjPrqWErbWJHcw8a0ZB05`
- **Repository:** `Adhitya-RZEN/dashboard.energi-primer`
- **Connected provider:** GitHub, as reported by the project link metadata
- **Production branch:** `NextJs`
- **Root directory:** `energiprimer-next`
- **Framework:** Next.js
- **Node runtime:** `24.x`
- **Build command:** default (`buildCommand` is null in project metadata)
- **Install command:** default (`installCommand` is null in project metadata)
- **Source outside root:** disabled (`sourceFilesOutsideRootDirectory=false`)
- **Git deployment creation:** `enabled` via
  `gitProviderOptions.createDeployments`

Read-only protection/check evidence:

- SSO/deployment authentication protection: `null` in the protection query.
- Git fork protection: `true`.
- Deployment checks: none configured.
- Full Preview branch restrictions, Preview protection mode, and organization
  deployment policy: **`NOT AVAILABLE FROM CURRENT TOOLING`**.

The project API response did not expose an Ignore Build Step field or command.
Therefore:

```text
Ignore Build Step configuration = NOT AVAILABLE FROM CURRENT TOOLING
Ignore Build Step execution/exit code = NOT AVAILABLE FROM CURRENT TOOLING
```

No configuration was changed.

## 6. Deployment History

| Deployment | Environment | Branch | SHA | Status | Created (UTC) | Valid Evidence |
|------------|-------------|--------|-----|--------|---------------|----------------|
| `dpl_HYW2ipiPSLS8orb4o5BokxRYhMUM` | Production | `NextJs` | `958a83518fe18ea7ccc357a5e2790d39ff400828` | `READY` | 2026-09-08 09:34:07 | Yes for current-source Vercel build; no for Preview gate |
| `dpl_FNJQNG9shnrN4dm9PFCjR72ATa3U` | Preview | `NextJs` | `dc5a0c299552738f8434fac0942d1c37d07e7166` | `READY` | 2026-09-02 16:41:37 | No; old SHA, PR 4 |
| `dpl_6Mmu5U865kmCCCmV9aYoh4DDvCQ2` | Production | `NextJs` | `55a5deb9e357944e1d438b766c24317ec198dc17` | `ERROR` | 2026-09-08 08:55:02 | No; different SHA |
| — | Preview | `phase10r-v2-verification-20260908` | `958a83518fe18ea7ccc357a5e2790d39ff400828` | `NOT FOUND` | — | No deployment record |

The project history contains a current-source Production deployment, but no
deployment record for the verification branch or a Preview using the target
SHA. No attempted/failed/cancelled deployment for that branch was exposed.

## 7. Preview Trigger Diagnosis

| Diagnostic | Result | Evidence boundary |
|------------|--------|-------------------|
| GitHub project link | `PASS` | Project link reports GitHub repository `dashboard.energi-primer`. |
| Production branch | `NextJs` | Project link metadata. |
| Git deployment creation | `ENABLED` | `gitProviderOptions.createDeployments=enabled`. |
| Non-production branch Preview behavior | `NOT AVAILABLE` | No project field/CLI output exposed the branch policy. |
| Ignore Build Step | `NOT AVAILABLE` | No ignore command/exit result exposed. |
| Deployment protection | `PARTIAL` | SSO null, fork protection true; full Preview policy unavailable. |
| Deployment checks | `NONE CONFIGURED` | Project checks query returned an empty list. |
| Verification branch excluded | `NOT PROVEN` | No branch restriction evidence available. |
| Git integration disabled | `NOT PROVEN` | Project Git link and creation setting are active. |
| Deployment delayed | `NOT PROVEN` | Repeated history polling found no pending record. |
| Deployment failed before creation | `NOT PROVEN` | No branch-specific failed deployment was exposed. |

The available evidence confirms the project boundary and that Git-created
deployments are enabled at project level, but it does not reveal whether a
push to this non-production branch should create a Preview, whether the branch
is excluded, or whether an external Git event was rejected before deployment
creation.

## 8. Event Correlation

- **Git push:** the remote branch exists at the target SHA; V4 did not push or
  rewrite it.
- **Vercel event for target SHA:** activity history exposes the current
  Production deployment on branch `NextJs`, but no event for the verification
  branch.
- **Deployment creation:** current-source Production deployment exists; no
  matching Preview deployment exists.
- **GitHub webhook delivery / Vercel receipt:** **`EVENT CORRELATION NOT
  AVAILABLE`** from the available tooling.
- **Git push timestamp:** local Git/ref inspection does not expose the remote
  push event timestamp; the original push output did not include one.

The absence of a matching activity event is recorded as an evidence
limitation. It is not treated as proof that a webhook failed.

## 9. Current-source Preview

```text
Exists: NO
SHA: NOT AVAILABLE
URL: NOT AVAILABLE
Build: NOT RUN / NOT VERIFIED
Prisma generation: NOT VERIFIED on Preview
TypeScript: NOT VERIFIED on Preview
Next.js build: NOT VERIFIED on Preview
/login smoke: NOT RUN
Protected-route smoke: NOT RUN
Runtime sanity: NOT VERIFIED
```

The current-source Production build is not substituted for these Preview
criteria. The old Preview is not used.

## 10. Production Safety

```text
Production DB: NOT TOUCHED
Production migration: NOT PERFORMED
Production mutation: NOT PERFORMED
Production audit read/mutation: NOT PERFORMED
Production deployment/configuration change: NOT PERFORMED
```

V4 used read-only repository, Vercel project, protection, checks, activity,
and deployment-history inspection only.

## 11. Root Cause

**Root cause category:** `10. Tooling cannot expose required evidence`  
**Root cause decision:** `ROOT CAUSE UNVERIFIED`

The facts are high-confidence: the branch and SHA match, the Vercel project
is linked to the expected repository, the production branch is `NextJs`, Git
deployment creation is enabled, and no matching Preview exists. The specific
trigger explanation has low confidence because non-production branch policy,
Ignore Build Step behavior, and GitHub-to-Vercel event delivery are not
available from the current read-only tooling.

No claim was made that Preview is disabled, the branch is excluded, the
webhook failed, or the deployment was ignored.

## 12. Required Next Action

An authorized project operator must inspect the Vercel Dashboard/Git
integration event details for branch
`phase10r-v2-verification-20260908` and the project’s non-production branch
deployment policy. Any configuration change or alternate trigger (such as a
PR-based Preview) requires a separate explicit authorization. Do not change
the project settings as part of V4.

## 13. Final Status

**Phase 10R-V4 = `BLOCKED`**

The deployment boundary is partially verified, but the required
current-source Preview does not exist and its trigger cause cannot be proven
from available tooling. Phase 10R remains `BLOCKED`, and the Production
Migration Gate remains `NOT READY`.

This phase does not authorize or initiate Production migration.
