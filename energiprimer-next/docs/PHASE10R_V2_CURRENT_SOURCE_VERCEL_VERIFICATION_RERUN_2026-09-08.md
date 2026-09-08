# PHASE 10R-V2 RERUN — CURRENT-SOURCE VERCEL PREVIEW VERIFICATION

**Date:** 2026-09-08  
**Status:** `VERIFIED`

## 1. Objective

This rerun verifies the user-created Vercel Preview deployment for the
current-source remediation commit. It does not create a deployment or alter
the application, database, schema, or Production environment.

## 2. Baseline

- **Phase 10:** `VERIFIED`
- **Phase 10R:** previously `BLOCKED`
- **Phase 10R-V2 previous report:** preserved as historical `BLOCKED` evidence
- **Phase 10R-V3:** `BLOCKED` before the new Preview existed
- **Phase 10R-V4:** `BLOCKED` trigger diagnosis before the new Preview existed
- **Target remediation SHA:** `958a83518fe18ea7ccc357a5e2790d39ff400828`

The user-created Preview now provides the missing current-source deployment
candidate. This rerun verifies that deployment directly rather than relying on
its name or `Ready` status alone.

## 3. Source Verification

- **Current workspace branch:** `preview-production-latest`
- **Current HEAD:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Workspace upstream:** `origin/preview-production-latest`
- **Workspace upstream SHA:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Vercel production branch remote SHA:** `origin/NextJs` points to the same
  target SHA.
- **Verification branch remote SHA:**
  `phase10r-v2-verification-20260908` points to the same target SHA.
- **Remediation source match:** `PASS`
- **Target ancestry:** `PASS`; target SHA is the current HEAD.
- **Application source modification after target:** `NONE`

The committed remediation lifecycle is present in the source:

```text
db:generate = prisma generate --schema=prisma/schema.prisma
postinstall = npm run db:generate && npm run csp:patch-dependencies
prebuild = npm run db:generate && npm run csp:patch-dependencies
```

Only documentation and the pre-existing `graphify-out/` artifact are present
as workspace changes; they are not part of the verified deployment source.

## 4. Vercel Preview

- **Project:** `projek-rzen/dashboard-energi-primer`
- **Repository:** `Adhitya-RZEN/dashboard.energi-primer`
- **Source branch:** `NextJs`
- **Environment:** `Preview`
- **Deployment ID:** `dpl_99HUUjJp6dNoyugWwKwVs1fQQfac`
- **Deployment URL:**
  `https://dashboard-energi-primer-ew2f0xm36-projek-rzen.vercel.app`
- **Status:** `Ready`
- **Created:** 2026-09-08 19:15:47 WITA
- **Source commit:** `958a83518fe18ea7ccc357a5e2790d39ff400828`
- **Source commit match:** `PASS`
- **Vercel target metadata:** `null`, confirmed as Preview by `vercel inspect`
- **Deployment action:** `redeploy` from the current-source Production
  deployment; source SHA and Preview environment were independently verified.

The old Preview from `dc5a0c2` was not used.

## 5. Build Verification

| Check | Result | Evidence |
|---|---|---|
| Dependency installation | `PASS` | Vercel installed 443 packages and continued to build. |
| Git source checkout | `PASS` | Log: branch `NextJs`, commit `958a835`. |
| `postinstall` | `PASS` | Ran `npm run db:generate && npm run csp:patch-dependencies`. |
| Prisma generation | `PASS` | Ran `prisma generate --schema=prisma/schema.prisma`. |
| Prisma Client | `PASS` | Generated Prisma Client `6.19.3`. |
| `prebuild` | `PASS` | Ran the same explicit Prisma generation and CSP patch. |
| TypeScript | `PASS` | Vercel log: `Finished TypeScript`. |
| Next.js production build | `PASS` | Compilation completed successfully. |
| Page generation | `PASS` | `17/17` static pages generated. |
| Deployment output | `PASS` | Vercel output completed and deployment became `Ready`. |

The build generated `/login`, `/pengaturan/users`, and
`/pengaturan/audit-log`. No missing `UserAuditAction`, `UserRole`,
`UserStatus`, `username`, `status`, `userAuditLog`, Prisma stub, or TypeScript
Prisma-symbol error appeared in the build log.

The Vercel build emitted non-blocking npm warnings about an old ESLint version
and pending install-script approvals; these did not fail installation or the
build and are not current-source Prisma errors.

## 6. Preview Smoke Test

| Route | Expected | Actual | Result |
|------|----------|--------|--------|
| `/login` | `200` | `200` | `PASS` |
| `/pengaturan/users` | Authentication boundary | `307` to `https://dashboard-energi-primer.vercel.app/login?callbackUrl=%2Fpengaturan%2Fusers` | `PASS` |
| `/pengaturan/audit-log` | Authentication boundary | `307` to `https://dashboard-energi-primer.vercel.app/login?callbackUrl=%2Fpengaturan%2Faudit-log` | `PASS` |

The smoke test was anonymous and did not follow redirects. No credentials,
cookies, login, account creation, password reset, role/status mutation, or
audit mutation was used.

## 7. Prisma Runtime

- **Preview request logs:** `PASS`; smoke requests were logged as Preview,
  branch `NextJs`, with `/login` `200` and protected routes `307`.
- **Runtime errors:** none observed in the retrieved request logs; no
  `PrismaClientInitializationError`, missing model/delegate/field, or invalid
  generated-client error appeared.
- **Generated-client contract:** `PASS` on the same committed source after
  local generation. The client exposed `UserRole` (`ADMIN`, `USER`),
  `UserStatus` (`ACTIVE`, `DISABLED`), `UserAuditAction`, `user`, and
  `userAuditLog`; the DMMF contained `User.username`, `User.status`, and
  `UserAuditLog`.
- **Prisma runtime sanity:** `PASS` for anonymous boot/auth-boundary paths.

An authenticated database-backed route was intentionally not exercised. The
phase forbids Production credentials and mutations; this does not block the
required anonymous Prisma/runtime sanity check because the Preview booted and
reached the protected-route boundary without generated-client errors.

## 8. Regression

The current application source is unchanged from the previously verified
remediation commit, so the Phase 10R local regression baseline remains valid:

- Prisma generation: `PASS`
- TypeScript: `PASS`
- lint: `PASS`
- Next.js build: `PASS`
- focused auth/authorization/User Management verifiers: `PASS`
- disposable verification: `PASS` on the successful reruns
- browser E2E baseline: `PASS`

The additional local Prisma contract check in this rerun also passed. No
application source change required a broader regression rerun.

## 9. Production Safety

```text
Production DB: NOT TOUCHED
Production migration: NOT PERFORMED
Production mutation: NOT PERFORMED
Production user mutation: NOT PERFORMED
Production audit mutation: NOT PERFORMED
Production cron/sync: NOT EXECUTED
Production credentials: NOT USED
```

No Production deployment or configuration was changed by this rerun.

## 10. Documentation Synchronization

- **Created:** `docs/PHASE10R_V2_CURRENT_SOURCE_VERCEL_VERIFICATION_RERUN_2026-09-08.md`
- **Updated:** `docs/AUTH_IMPLEMENTATION.md`
- **Updated:** `docs/AGENT_CONTEXT.md`
- **Updated:** `docs/PRODUCTION_MIGRATION_GATE_2026-09-08.md` with the new
  Phase 10R prerequisite evidence; the gate itself was not executed.
- **Preserved:** Phase 10R, Phase 10R-V2 previous, Phase 10R-V3, and Phase
  10R-V4 reports.
- **Policy file:** `#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt` — `NOT FOUND`

No secret, token, cookie, password, connection string, private key, or raw
authentication header is recorded.

## 11. Known Limitations

1. Protected Preview routes redirect to the canonical login alias
   `dashboard-energi-primer.vercel.app` rather than retaining the Preview host.
   The authentication boundary itself is correct (`307`) and no redirect
   configuration was changed in this verification phase.
2. No authenticated session or database-backed mutation path was tested by
   design. The required anonymous boot and authorization-boundary checks
   passed.
3. Vercel emitted non-blocking npm warnings described in the build section.

These limitations do not invalidate current-source build integrity or the
required anonymous Preview smoke test.

## 12. Final Status

All required Phase 10R-V2 rerun conditions passed:

```text
Current source == target SHA: PASS
Preview exists: PASS
Environment == Preview: PASS
Preview source commit matches: PASS
Vercel build: PASS
Prisma generation: PASS
Prisma Client contract: PASS
TypeScript: PASS
Next.js build: PASS
/login: PASS
/pengaturan/users auth boundary: PASS
/pengaturan/audit-log auth boundary: PASS
Prisma runtime sanity: PASS
Local regression baseline: PASS
Production untouched: PASS
Documentation synchronized: PASS
```

**Phase 10R-V2 RERUN = `VERIFIED`**  
**Phase 10R = `VERIFIED`**  
**Production Migration Gate = `READY FOR SEPARATE CONTROLLED EXECUTION`**

The Production Migration Gate remains a separate phase and was not run here.
