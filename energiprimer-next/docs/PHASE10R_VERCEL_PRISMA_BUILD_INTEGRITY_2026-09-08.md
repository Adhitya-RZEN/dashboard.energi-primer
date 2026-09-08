# PHASE 10R — VERCEL / PRISMA BUILD INTEGRITY GATE

**Date:** 2026-09-08  
**Status:** `BLOCKED`  
**Scope:** Diagnose and remediate the reported Vercel build failures caused by an incomplete Prisma Client, then rerun the Phase 10 validation boundary without touching Production.

## Trigger

Phase 10R was triggered by a reported Vercel build in which application code
could not see Prisma enums, fields, or delegates that exist in the repository
schema. The gate requires a clean-install diagnosis, an explicit Prisma
generation lifecycle, and a fresh local regression pass before any Production
readiness decision.

No Vercel project link, build URL, raw build log, preview URL, or Vercel
authentication context was available in the workspace. The initial error
patterns below therefore record the supplied trigger, not an independently
retrieved Vercel log.

## Initial Vercel Error

The reported error patterns were:

- `@prisma/client` had no exported `UserAuditAction`, `UserRole`, or
  `UserStatus`.
- `UserWhereInput` had no `status` field.
- `PrismaClient` had no `userAuditLog` delegate.
- `UserWhereUniqueInput` had no `username` field.

These are consistent with TypeScript compiling against Prisma's ungenerated
stub client, but the root cause was not assumed until the clean-install
reproduction below.

## Documentation Baseline

The Phase 10R review read the repository authentication, authorization,
database, audit-log, and Phase 10 validation documentation before changing
the build lifecycle. The referenced
`#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt` was not present; its rules were not
inferred or invented.

The existing Phase 10 evidence remained the validation baseline. Phase 10R
adds this build-integrity evidence and synchronizes
`docs/AUTH_IMPLEMENTATION.md` and `docs/AGENT_CONTEXT.md`.

## Repository / Prisma Discovery

- Application code imports `@prisma/client`; no custom Prisma output path was
  found.
- `prisma/schema.prisma` uses the default `prisma-client-js` generator and
  `env("DATABASE_URL")`.
- `prisma/production/schema.prisma` uses the same generator and is currently
  byte-identical to the application schema for this contract. SHA-256 for
  both files was
  `435ACA5DF10B2F008C93A0056D78348BC0581EB1C267EBDD1C4AC0C73E4484A1`.
- No `prisma.config.*`, custom client output, `.npmrc`, or Vercel install/build
  override was found. `vercel.json` contains cron configuration only.
- Before this phase, `package.json` had a manual `db:generate` script but no
  explicit Prisma generation in `postinstall` or `prebuild`.
- The existing local generated client contained the expected symbols, which
  explained why an already-prepared workspace could build while a clean
  install could not.

## Prisma Source-of-Truth

The application Prisma source of truth is:

```text
prisma/schema.prisma
  -> prisma generate --schema=prisma/schema.prisma
  -> node_modules/@prisma/client
  -> application imports from @prisma/client
```

`prisma/production/schema.prisma` remains the production migration/preflight
schema boundary. The current byte-identical content was verified, but no
Production database was connected, migrated, read, or mutated.

## Build Lifecycle

Before remediation:

1. `npm ci` installed `@prisma/client` and its dependency postinstall emitted
   a warning that the Prisma CLI should be installed.
2. That generation attempt did not produce the generated client and its
   failure was swallowed by the dependency postinstall, leaving the Prisma
   stub in place while the install still exited successfully.
3. The root `postinstall` only ran the CSP patch.
4. `prebuild` also did not run Prisma generation.
5. Clean TypeScript and build reproduced the missing enum, field, model, and
   delegate errors.

After remediation:

```json
"prebuild": "npm run db:generate && npm run csp:patch-dependencies",
"postinstall": "npm run db:generate && npm run csp:patch-dependencies",
"db:generate": "prisma generate --schema=prisma/schema.prisma"
```

The explicit root lifecycle runs after the full dependency tree is available
and fails the build/install path if Prisma generation fails.

## Root Cause

The root cause was a missing reliable explicit Prisma generation step in the
application lifecycle. In a clean install, the dependency-level
`@prisma/client` postinstall could not resolve the Prisma CLI early enough,
left the stub client, and returned without making the root install fail. The
subsequent TypeScript compiler therefore saw no generated enums, model input
fields, or delegates.

The repository schema already contained the required User Management data
model. No schema mismatch, missing feature implementation, dependency
version mismatch, `any`, `@ts-ignore`, or feature removal was used to explain
or mask the failure.

## Remediation

- Added explicit `prisma generate --schema=prisma/schema.prisma` to the
  `db:generate` script.
- Added `npm run db:generate` to both `postinstall` and `prebuild`.
- Kept the existing CSP dependency patch after Prisma generation.
- Did not change Prisma, Next.js, TypeScript, or application dependency
  versions.
- Did not change the schema, remove User Management features, suppress type
  errors, or add a build bypass.

## Clean Checkout Verification

A clean archive was created from commit
`55a5deb9e357944e1d438b766c24317ec198dc17`. It had no existing
`node_modules`, `.next`, generated Prisma client, or `graphify-out/`. The
Phase 10R `package.json` lifecycle change was then applied as the only source
change in that disposable copy.

Pre-remediation clean verification:

- `npm ci --foreground-scripts`: exited successfully but left the Prisma
  stub after the dependency postinstall warning.
- Generated client inspection: no User Management enums/models/delegates.
- `tsc --noEmit --incremental false`: failed with the reported Prisma symbol
  errors.
- `npm run build`: failed during TypeScript for the same reason.

Post-remediation clean verification:

- `npm ci --foreground-scripts`: `PASS`; the explicit root `postinstall`
  generated Prisma Client v6.19.3 before applying the CSP patch.
- The successful clean install used approved disposable registry/engine
  access after the sandbox-only attempt was blocked by network policy.
- The install added 442 packages and reported three high-severity npm audit
  findings; no audit-fix mutation was attempted.
- `npm run db:generate`: `PASS`.
- `tsc --noEmit --incremental false`: `PASS`.
- `npm run build`: `PASS`.

## Prisma Client Verification

The clean generated client was verified to contain:

- `UserRole`, `UserStatus`, and `UserAuditAction`.
- `PrismaClient.userAuditLog` and the `Prisma.UserAuditLogDelegate`.
- `username` and `status` in the generated User input/model contract.

The generated client version was Prisma `6.19.3`, matching the repository
package versions. No credentials or environment values were printed.

## TypeScript Verification

- Clean disposable copy after remediation: `PASS`.
- Active workspace after remediation: `PASS`.
- The original missing-enum/model errors were not present after explicit
  generation.

## Local Build Verification

The active workspace `npm run build` passed after the lifecycle change. The
build ran `prebuild`, explicitly generated Prisma Client v6.19.3, applied the
CSP patch, compiled with Next.js 16.3.3/Turbopack, completed TypeScript, and
generated all 17 pages. The protected User Management routes were present:

```text
/pengaturan/users
/pengaturan/audit-log
```

## Vercel Build Verification

**Result:** `NOT RUN / BLOCKED`

No `.vercel` project link, `VERCEL_*` project context, project ID, target,
token, or controlled Vercel build target was available. The installed Vercel
CLI was version `59.11.0`, but `whoami` could not complete because the local
CLI cache/network access was unavailable. No project linking or deployment
was attempted, and no Vercel build result is claimed.

## Preview Smoke Test

**Result:** `NOT RUN / BLOCKED`

No preview deployment or URL was available. Browser E2E was run only against
the local disposable harness and is not a substitute for a Vercel preview
smoke test.

## Regression

The Phase 10 core validations were rerun after the lifecycle change:

- Auth security, authorization security, Add User, Reset Password, Role,
  Status, Audit Log, and UI focused checks: `PASS`.
- Root and production schema validation: `PASS`.
- TypeScript, lint, and environment verification: `PASS`.
- Reset Password, Role, Status, Audit Log, and aggregate Phase 10 disposable
  PostgreSQL verification: final observed `PASS`.
- One initial aggregate disposable run reported
  `PASSWORD_STATUS_PASSWORD_ATOMICITY_FAILED`; two immediate reruns passed,
  with one valid serialization rejection in the password/status pair. This
  is recorded as a flaky-test follow-up and was not suppressed or bypassed.
- Reset Password, Role, Status, and Audit Log browser E2E: `PASS`.
- Final active-workspace production build: `PASS`.

All database writes in these checks used disposable loopback PostgreSQL only.

## Environment Safety

- No `.env.local` value, password, hash, token, cookie, JWT, header, or secret
  was printed.
- No Production database connection was used.
- Disposable PostgreSQL clusters were created and removed by the existing
  verification scripts.
- No Vercel deployment, project link, migration, sync, Cron invocation, or
  external production write was performed.
- The existing user artifact `graphify-out/` was preserved untouched.

## Git Changes

Intentional Phase 10R changes:

- `package.json`: explicit Prisma generation in `db:generate`, `postinstall`,
  and `prebuild`.
- `docs/PHASE10R_VERCEL_PRISMA_BUILD_INTEGRITY_2026-09-08.md`: this report.
- `docs/AUTH_IMPLEMENTATION.md`: Phase 10R lifecycle and boundary entry.
- `docs/AGENT_CONTEXT.md`: Phase 10R operating boundary entry.

The pre-existing untracked `graphify-out/` artifact was not removed or
modified. No reset, checkout, migration, or destructive workspace operation
was used.

## Documentation Synchronization

The Phase 10R report, `AUTH_IMPLEMENTATION.md`, and `AGENT_CONTEXT.md` were
updated together. The repository documentation synchronization policy file
`#-PROJECT-DOCUMENTATION-SYNC-POLICY.txt` was not found, so no undocumented
policy was assumed.

## Production Boundary

```text
Production migration = NOT PERFORMED
Production mutation = NOT PERFORMED
Production user read = NOT PERFORMED
Production audit read = NOT PERFORMED
Production session test = NOT PERFORMED
Deployment = NOT PERFORMED
```

## Known Limitations

- Vercel build and preview smoke verification remain unavailable; the final
  status cannot be `VERIFIED` without that evidence.
- The local runtime used Node `v24.17.0`; the repository has no explicit
  `engines`, `.nvmrc`, or `.node-version` constraint, so the Vercel Node
  runtime is not independently confirmed.
- Clean install reported three high-severity npm audit findings. They were
  not changed in this build-integrity phase and were not used to bypass
  verification.
- The aggregate disposable concurrency verifier showed one transient failure
  before two passing reruns. If it recurs, treat it as a real regression
  investigation item.
- Production migration state and post-migration production controls remain
  unverified by design.

## Final Recommendation

**Phase 10R status: `BLOCKED`.**

The evidence-based remediation is complete and the clean local install,
generated Prisma Client, TypeScript, local production build, disposable
validation, and browser E2E gates pass. The gate remains blocked solely
because a controlled Vercel build and preview smoke test could not be
verified from this workspace. Provide the authorized Vercel project/build
context, run the build and preview checks, then reassess the Production
Migration Gate.

**Production Migration Gate: `NOT READY`.**
