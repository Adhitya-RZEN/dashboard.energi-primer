# Production Readiness — Current Operational Index

> **Current live deployment verification:** [Phase 6V — Production Deployment & CSP Artifact Verification](./PHASE6V_PRODUCTION_DEPLOYMENT_CSP_ARTIFACT_VERIFICATION_2026-09-05.md).
> Phase 6U remains the preceding CSP readiness review and is preserved as
> historical continuity.
> Phase 6N remains the operational documentation closure; this index preserves
> dated Phase 10A/20 evidence below as historical continuity.
> CSP follow-up: [Phase 6O CSP Report-Only Evaluation](./PHASE6O_CSP_REPORT_ONLY_EVALUATION_2026-09-05.md), [Phase 6Q](./PHASE6Q_LOCAL_CSP_RUNTIME_VALIDATION_2026-09-05.md), [Phase 6R](./PHASE6R_PRODUCTION_LIKE_CSP_RUNTIME_VALIDATION_2026-09-05.md), [Phase 6S](./PHASE6S_CSP_REMEDIATION_2026-09-05.md), and the independent [Phase 6T revalidation](./PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md).

> **Phase 6K-A verification (2026-09-04):** The Phase 6J implementation
> checkpoint remains historical and unchanged. Its disposable PostgreSQL
> acceptance tests passed, while its then-blocked Production metadata gates
> have now been reverified read-only: canonical migration status, target
> identity, migration history, checksum, schema diff, and schema parity pass.
> This verification does not authorize migration, deployment, or Production
> sync. See [Phase 6K-A report](./PHASE6K-A_PRODUCTION_MIGRATION_METADATA_REPORT_2026-09-04.md).

## Current Production State

**PHASE 6V FAIL; CANONICAL ARTIFACT MATCHED, BUT 5/6 DASHBOARDS CRASH IN THE BROWSER**

Current evidence chain: Phase 6K -> Phase 6L -> Phase 6M -> Phase 6N -> Phase 6V.

- The canonical Production artifact now matches the newest READY deployment
  `dpl_4AV8aVmD31A2QUnFb5Fh18UN3e1H` and SHA `9de33b7...`. Public routes,
  dynamic login behavior, and one normal Auth.js lifecycle pass.
- Production database, schema, canonical migration history, and migration
  preflight are verified.
- Cron is configured as 0 22 * * * (22:00 UTC / 06:00 WITA).
- One controlled Production sync succeeded in Phase 6L with HTTP 200, status
  SUCCESS, syncRun ID 2, and no reproduced P2028.
- The active Google business source is exactly seven worksheets from
  Januari26-BB through Juli26-BB. The 199-row registry is metadata inventory,
  not 199 required monthly imports.
- Authentication remains Auth.js Credentials -> Prisma -> PostgreSQL -> JWT/
  session -> admin authorization. Supabase Auth, Resend, and public password
  recovery are not active runtime paths.
- CSP remains absent in Production. Phase 6S completed the production-like
  loopback remediation with a disposable PostgreSQL/admin fixture:
  request-time `/login` nonce matching, Auth.js lifecycle, all six dashboard
  routes, Recharts interaction, and the six dynamic-style locations passed
  under Report-Only. The candidate produced zero `script-src-elem` and
  `style-src-attr` violations. No Production CSP enforcement was attempted.
- Runtime diagnostic execution through an authorized sync remains intentionally
  untested in Phase 6V, and Git/Vercel commit signature verification remains
  informational and unverified.
- Phase 6V repeat verification reconciled the canonical alias with the latest
  artifact, but authenticated browser checks found
  `ReferenceError: measureTextWithDOM is not defined` on five of six
  dashboard routes. This is a client bundle/dashboard regression and blocks
  Phase 6W.
- Phase 6V-R locally confirmed the cause as an incomplete Recharts dependency
  patch, fixed the missed call sites, and passed two clean disposable-browser
  runs. Production is still awaiting operator deployment and a new Phase 6V;
  the local PASS does not mark Production fixed.

Phase 6J remediation successfully passed one controlled Production execution in
Phase 6L without reproducing P2028. This is not a permanent-fix claim.

## Phase Evidence Chain

| Phase | Current classification | Evidence |
|---|---|---|
| 6A | Historical/reference | Migration provenance and schema reconciliation |
| 6B | Historical/reference | Migration governance and deployment separation |
| 6C | Historical/reference | Secret hygiene and auth/recovery cleanup |
| 6D | Historical/reference | Vercel live verification |
| 6E | Historical/reference | Production sync incident investigation |
| 6F | Historical/reference | Rollback/manual deployment verification |
| 6G | Historical/reference | Authorized sync investigation |
| 6H | Historical/reference | P2028 root-cause investigation |
| 6I | Superseded design | Remediation design |
| 6J | Historical implementation checkpoint | Discovery remediation implementation |
| 6K | Current evidence | Manual Production deployment verification |
| 6L | Current evidence | Controlled Production sync SUCCESS |
| 6M | Current evidence | Production hardening and release closure |
| 6N | Current evidence | Documentation and operational closure |
| 6Q | Current evidence | Local CSP Report-Only runtime validation; authenticated coverage blocked |
| 6R | Current evidence | Production-like local CSP runtime; Auth.js/dashboard/Recharts covered with findings |
| 6S | Current evidence | CSP remediation; local production-like candidate gate PASS, Production enforcement remains disabled |
| 6T | Current evidence | Independent local CSP Report-Only revalidation; two fresh runs PASS |
| 6U | Current review | CSP candidate readiness review; Production CSP remains OFF |
| 6V | Current verification | FAIL: canonical artifact matched; five authenticated dashboards crash in browser |
| 6V-R | Current local remediation | PASS: Recharts patch fixed locally; Production deployment and new 6V verification pending |

## Historical Phase 20 gate

Phase 20 preparation-only audit: **PASS WITH REVIEW**. Architecture and local
build checks are ready for manual production configuration, but Supabase,
Vercel, production Google credentials, Resend sender/domain, live Auth E2E,
distributed rate limiting, and dependency remediation remain external/manual
gates. No deployment, Supabase write, migration execution, import, or
production sync was performed.

See the historical Phase 20 source documents and current operational runbooks:

- [Production Preparation Report](./PRODUCTION_PREPARATION_REPORT_2026-09-01.md)
- [Production Environment Matrix](./PRODUCTION_ENVIRONMENT_MATRIX.md)
- [Supabase Migration Runbook](./SUPABASE_PRODUCTION_MIGRATION_RUNBOOK.md)
- [Vercel Deployment Runbook](./VERCEL_DEPLOYMENT_RUNBOOK.md)
- [Rollback Runbook](./PRODUCTION_ROLLBACK_RUNBOOK.md)
- [Production Smoke Test Plan](./PRODUCTION_SMOKE_TEST_PLAN.md)

Tanggal audit: 2026-08-28  
Target: `energiprimer-next` pada Vercel.  
Scope: audit dan safe hardening; tidak ada deployment, database migration, atau perubahan pada Laravel.

## Historical Phase 10A Status

**PASS WITH WARNINGS** untuk audit teknis dan safe fixes. Production deployment belum dilakukan dan belum dapat dianggap production-ready.

Fondasi dan local build berhasil diverifikasi, tetapi production belum siap karena endpoint PostgreSQL lokal tidak reachable dari Vercel, credential Google Sheets masih berupa file lokal, konfigurasi sender/domain Resend production belum diverifikasi, dan audit dependency menemukan tiga advisory HIGH pada dependency Prisma. Phase 18 sudah menyediakan code integration Resend dengan status PASS WITH REVIEW.

## Historical Phase 10A Production Readiness

| Area                 | Status                     |
| -------------------- | -------------------------- |
| Project Structure    | PASS WITH WARNINGS         |
| Environment          | FAIL / NEEDS CONFIGURATION |
| Git & Secrets        | PASS WITH WARNINGS         |
| Dependencies         | FAIL                       |
| TypeScript           | PASS                       |
| Build                | PASS                       |
| Authentication       | PASS WITH WARNINGS         |
| Authorization        | PASS WITH WARNINGS         |
| Mail                 | PASS WITH REVIEW           |
| PostgreSQL           | BLOCKED                    |
| Prisma               | PASS WITH WARNINGS         |
| Google Sheets        | BLOCKED                    |
| API Security         | PASS WITH WARNINGS         |
| Error Handling       | PASS WITH WARNINGS         |
| Performance          | PASS WITH WARNINGS         |
| Vercel Compatibility | NOT READY                  |

## Historical Phase 10A Matrix

| Area                 | Status                         | Severity | Notes                                                                                     |
| -------------------- | ------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| Authentication       | PASS WITH WARNINGS             | MEDIUM   | Full valid-login/logout regression needs isolated test environment.                       |
| Authorization        | PASS                           | MEDIUM   | Server-side admin checks are present.                                                     |
| PostgreSQL           | BLOCKED                        | HIGH     | Production endpoint/pooler/SSL not configured for Vercel.                                 |
| Prisma               | PASS WITH WARNINGS             | HIGH     | Three HIGH npm audit findings require manual remediation decision.                        |
| Google Sheets        | BLOCKED                        | HIGH     | Production credential provisioning is unresolved.                                         |
| Mail                 | PASS WITH REVIEW                | HIGH     | Resend adapter tersedia; sender/domain, secret provisioning, dan real smoke test masih manual. |
| Environment          | BLOCKED                        | HIGH     | Production values are not provisioned in the audited environment.                         |
| Secrets              | PASS WITH WARNINGS             | HIGH     | No tracked credential path or public bundle exposure found; local secrets remain ignored. |
| API Security         | PASS WITH WARNINGS             | MEDIUM   | Public reset rate-limit policy and trusted forwarded IP need review.                      |
| Error Handling       | PASS WITH WARNINGS             | LOW      | Generic UI errors pass; provider/runtime log policy needs production review.              |
| Performance          | PASS WITH WARNINGS             | MEDIUM   | Local code review passes; preview measurement and some full navigations remain.           |
| Vercel Compatibility | READY FOR MANUAL CONFIGURATION | HIGH     | Root Directory, runtime, database, Google, and mail require manual setup.                 |
| Build                | PASS                           | LOW      | Lint, typecheck, and production build pass locally.                                       |

## Audit evidence

Local checks:

```text
npm run lint                         PASS
npx tsc --noEmit                     PASS
npm run build                        PASS
npm ls --depth=0                     PASS
node --env-file=.env.local scripts/verify-db.mjs  PASS (read-only)
node --env-file=.env.local node_modules/prisma/build/index.js validate PASS
npm test                             NOT AVAILABLE (no test script)
```

`npm audit --omit=dev --json` selesai dengan exit code 1 dan melaporkan 3 advisory HIGH. Tidak dijalankan `npm audit fix --force`.

Auth end-to-end script tidak dijalankan pada Phase 10A karena script tersebut melakukan login valid dan memperbarui metadata login user. Menjalankannya terhadap database existing akan melanggar scope read-only audit ini. Static/server-side review tetap dilakukan.

## Security findings

| Severity | Finding                                                                                                  | Status                   |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| CRITICAL | Tidak ada credential exposure kritis yang terkonfirmasi melalui static scan                              | PASS                     |
| HIGH     | `DATABASE_URL` local loopback tidak dapat dipakai oleh Vercel; production endpoint belum dikonfigurasi   | BLOCKER                  |
| HIGH     | Google Sheets service masih bergantung pada credential file lokal yang tidak tersedia otomatis di Vercel | BLOCKER                  |
| HIGH     | Resend sender/domain/API secret production belum diprovision dan real smoke test belum dijalankan        | NEEDS REVIEW             |
| HIGH     | Audit npm menemukan advisory pada dependency chain Prisma                                                | REQUIRES MANUAL APPROVAL |
| MEDIUM   | Auth.js beta, JWT cutover, operator role, dan session policy legacy perlu regression/keputusan manual    | NEEDS REVIEW             |
| MEDIUM   | Security headers eksplisit belum dikonfigurasi pada next.config.ts                                       | NEEDS REVIEW             |
| LOW      | Beberapa dokumen historis Phase 0-9 masih menyebut keadaan sebelum Recharts/auth/foundation terbaru      | DOCUMENTATION DEBT       |

Static scan tidak menemukan `DATABASE_URL`, `AUTH_SECRET`, Google secret names/values, private-key marker, password hash, atau token field pada public client chunks. Nilai environment dan isi credential tidak dicantumkan pada laporan.

## Dependency findings

| Package/chain                                               | Severity | Issue                                                           | Recommendation                                                                                                                         |
| ----------------------------------------------------------- | -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts` melalui `@prisma/config` dan `prisma` 6.19.3 | HIGH     | Advisory recursive stack exhaustion yang dilaporkan `npm audit` | Review advisory dan compatibility; pilih patch/upgrade Prisma yang disetujui, lalu regression test. Jangan downgrade/upgrade otomatis. |
| `@prisma/config` 6.19.3                                     | HIGH     | Terkena dependency chain audit                                  | Manual Prisma release review.                                                                                                          |
| `prisma` 6.19.3                                             | HIGH     | Terkena dependency chain audit                                  | Manual Prisma release review.                                                                                                          |

`@prisma/client` dan `prisma` tetap 6.19.3 pada Phase 10. Major/minor dependency change tidak dilakukan.

## Files changed

Safe changes yang dilakukan:

- [`energiprimer-next/.gitignore`](../.gitignore) — mengizinkan `.env.example` aman untuk dilacak, sementara `.env.local` dan `credentials/` tetap di-ignore.
- [`energiprimer-next/.env.example`](../.env.example) — mengganti secret-looking value menjadi placeholder dan menambahkan nama `AUTH_URL` yang memang digunakan reset-password.
- [`energiprimer-next/src/auth.ts`](../src/auth.ts) — menyimpan `sessionVersion` ke JWT agar perubahan password/reset dapat membatalkan session lama sesuai pemeriksaan session callback.
- [`energiprimer-next/src/app/error.tsx`](../src/app/error.tsx) — tidak lagi merender error digest internal ke DOM.
- Historical removed path src/app/forgot-password/actions.ts — retained only as evidence that the former recovery action was removed; it is not an active source path.
- [`energiprimer-next/docs/ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md)
- [`energiprimer-next/docs/DEPENDENCY_AUDIT.md`](./DEPENDENCY_AUDIT.md)
- [`energiprimer-next/docs/DATABASE_PRODUCTION_READINESS.md`](./DATABASE_PRODUCTION_READINESS.md)
- [`energiprimer-next/docs/GOOGLE_SHEETS_PRODUCTION.md`](./GOOGLE_SHEETS_PRODUCTION.md)
- [`energiprimer-next/docs/PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md)
- [`energiprimer-next/docs/VERCEL_DEPLOYMENT_READINESS.md`](./VERCEL_DEPLOYMENT_READINESS.md)
- [`energiprimer-next/docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md)
- [`energiprimer-next/docs/RESEND_INTEGRATION.md`](./RESEND_INTEGRATION.md) dan [`energiprimer-next/docs/RESEND_INTEGRATION_REPORT_2026-09-01.md`](./RESEND_INTEGRATION_REPORT_2026-09-01.md)

Tidak ada file Laravel, Prisma schema, database record, credential file, atau `.env.local` yang diubah.

## Phase 10A files and boundary hardening

Phase 10A juga menambahkan atau memperbarui:

- docs/AUTH_REGRESSION_TEST.md
- docs/POSTGRESQL_VERCEL_READINESS.md
- docs/PRISMA_DEPENDENCY_REVIEW.md
- docs/GOOGLE_SHEETS_VERCEL_READINESS.md
- docs/MAIL_PROVIDER_READINESS.md
- docs/PRODUCTION_ENVIRONMENT.md
- docs/API_SECURITY_AUDIT.md
- docs/PERFORMANCE_READINESS.md
- docs/VERCEL_CONFIGURATION.md
- src/lib/prisma.ts, src/lib/password-reset.ts, dan data services dengan server-only guard.

Tidak ada file Laravel, Prisma schema, database record, credential file, atau environment lokal yang diubah.

## Safe fixes applied

Perubahan otomatis dibatasi pada hardening yang tidak mengubah schema, API contract, auth architecture, atau business calculation:

1. `.env.example` tidak lagi berisi nilai yang tampak seperti secret.
2. `.env.example` dapat dilacak, tetapi secret lokal tetap di-ignore.
3. Session JWT sekarang membawa versi session yang diverifikasi terhadap user record.
4. Error digest internal tidak diekspos ke response DOM.
5. Error object arbitrary tidak dicetak pada password-reset action.
6. Prisma, Auth.js, password-reset, dan data services diberi explicit server-only boundary.

## Requires Manual Approval

- Menetapkan endpoint PostgreSQL production, pooler, TLS, firewall, dan connection limits.
- Menentukan patch/upgrade dependency Prisma yang aman terhadap advisory HIGH.
- Memindahkan/provision credential Google Sheets ke konfigurasi secret Vercel atau mengubah credential-loading architecture.
- Memberikan permission service account pada spreadsheet production.
- Memverifikasi sender/domain Resend, menyimpan API key sebagai secret, dan menjalankan satu real-email smoke test terkontrol.
- Mengubah storage architecture bila kebutuhan upload/persistent file ditemukan kemudian.
- Menetapkan Node runtime/root directory Vercel dan menjalankan preview deployment.
- Menentukan kebijakan Auth.js beta/session cutover dan role selain admin.

## Blockers

1. PostgreSQL production belum reachable dari Vercel.
2. Google Sheets production credential provisioning belum tersedia.
3. Password reset production belum diaktifkan sampai sender/domain Resend dan real-email smoke test selesai.
4. Dependency audit HIGH belum mendapat keputusan remediation.

## Vercel Readiness

**READY FOR MANUAL CONFIGURATION.** Local TypeScript/lint/build lulus. Deployment belum boleh dilakukan sebelum database endpoint, Google credential, mail provider, dan dependency remediation diselesaikan atau diterima secara eksplisit oleh pemilik sistem.

## Phase 10A evidence

- [AUTH_REGRESSION_TEST.md](./AUTH_REGRESSION_TEST.md) — regression result dan test yang sengaja diblokir karena dapat menulis database.
- [POSTGRESQL_VERCEL_READINESS.md](./POSTGRESQL_VERCEL_READINESS.md) — Prisma/serverless/database compatibility.
- [PRISMA_DEPENDENCY_REVIEW.md](./PRISMA_DEPENDENCY_REVIEW.md) — investigasi 3 advisory HIGH.
- [GOOGLE_SHEETS_VERCEL_READINESS.md](./GOOGLE_SHEETS_VERCEL_READINESS.md) — credential dan Vercel compatibility.
- [MAIL_PROVIDER_READINESS.md](./MAIL_PROVIDER_READINESS.md) — Resend provider status dan manual production setup.
- [PRODUCTION_ENVIRONMENT.md](./PRODUCTION_ENVIRONMENT.md) — environment variable inventory.
- [API_SECURITY_AUDIT.md](./API_SECURITY_AUDIT.md) — route handler dan Server Action review.
- [PERFORMANCE_READINESS.md](./PERFORMANCE_READINESS.md) — HIGH/MEDIUM/LOW impact findings.
- [VERCEL_CONFIGURATION.md](./VERCEL_CONFIGURATION.md) — manual Vercel configuration.

## Rekomendasi sebelum Phase 11

1. Konfirmasi environment production tanpa mencetak secret.
2. Uji read-only PostgreSQL dari Vercel preview dengan endpoint/pooler yang disetujui.
3. Sediakan Google credential server-side dan lakukan read-only worksheet/range smoke test.
4. Konfigurasi mail provider dan uji reset password tanpa membocorkan token.
5. Putuskan remediation advisory Prisma dan jalankan ulang lint/typecheck/build/audit.
6. Ukur preview dengan Web Vitals/Lighthouse; kemudian evaluasi form yang masih menyebabkan full document navigation.
7. Setelah semua blocker selesai, ulangi checklist ini dan baru pertimbangkan Phase 11. Tidak ada deployment yang dilakukan pada Phase 10.

## Phase 6S CSP remediation status

Phase 6S is PASS for the local production-like Report-Only candidate.
The login route is request-time dynamic, the response nonce matches the
framework-generated DOM nonce, and five independent requests produced distinct
nonces with non-cacheable responses. All six dashboards retain Recharts
wrappers/surfaces, tooltip behavior, interaction, and stylesheet-backed
dynamic presentation. Browser CSP violations were zero for script element,
style attribute, unsafe-inline-related directives, and external origins.

Production remains NO CSP ENFORCEMENT. This phase does not authorize
deployment, Production configuration changes, or a policy switch from
Report-Only to enforced CSP. See the
[Phase 6S report](./PHASE6S_CSP_REMEDIATION_2026-09-05.md).

## Phase 6T CSP Report-Only revalidation status

Phase 6T independently reproduced the local production-like candidate after
a clean build: two fresh disposable PostgreSQL/browser/server runs, 10/10
nonce match and uniqueness in each run, Auth.js/dashboard/Recharts PASS, and
zero main CSP violations. The no-flag control ran before each candidate run.
Production CSP remains absent and no remote boundary was accessed. See the
[Phase 6T report](./PHASE6T_CSP_REPORT_ONLY_REVALIDATION_2026-09-05.md).

## Phase 6U CSP production-readiness review (HISTORICAL)

Phase 6U classifies the CSP candidate as **PASS WITH FINDINGS**: the
request-time nonce, /login dynamic rendering, six dynamic-style remediations,
dependency-generated-style controls, Auth.js, dashboards, Recharts, and local
CSP gates are technically stable. The candidate is mature for a separately
authorized enforcement review, but Production CSP remains OFF.

The current Production deployment evidence is recorded in Phase 6K/6N:
project dashboard-energi-primer, deployment
dpl_Gj1BecPeA6N7dZkeHE7LmnwbNRRX, canonical alias, READY state, and deployed
SHA matching the recorded local HEAD. Git/Vercel commit signature verification
is still unverified, and the Phase 6S/6T CSP changes in this working tree are
not asserted to be deployed. This is an operational provenance finding for a
future authorized rollout.

The active monthly source remains exactly seven worksheets—Januari26-BB through
Juli26-BB. The 199-row registry remains metadata inventory, not 199 required
monthly imports. Server-side Google Sheets sync does not require a browser CSP
origin. Future browser-facing, DOM/CSS/JS, external-resource, analytics,
iframe, WebSocket, or framework/dependency changes require CSP regression;
server-only/data/source changes normally require source-policy review instead.
See the [Phase 6U report](./PHASE6U_CSP_PRODUCTION_READINESS_REVIEW_2026-09-05.md).

## Phase 6V Production deployment and CSP artifact verification

Phase 6V is the current live verification record. The latest READY Production
deployment is traceable to commit `9de33b7...` and its direct deployment URL
serves the Phase6S/6T-compatible `/login` artifact: private no-cache behavior,
zero reviewed inline-style attributes, no browser/page errors, and no CSP or
Report-Only header. The six protected dashboard routes return the expected
unauthenticated redirect without credentials.

The canonical `https://dashboard-energi-primer.vercel.app` domain now serves
the same latest READY deployment and SHA. The alias/provenance discrepancy is
resolved. However, authenticated browser checks fail on five of six dashboard
routes with `ReferenceError: measureTextWithDOM is not defined`; the
server-rendered HTML and `/dashboard/target` interaction pass. This is a
client bundle regression, not a CSP failure. Production CSP remains OFF, and
Phase6W must not begin until the bundle is fixed, redeployed by an authorized
operator, and Phase6V passes.

Phase 6V-R confirmed the local root cause: the dependency patch renamed the
Recharts measurement definition but left executable call sites using
`measureTextWithDOM`. The patch now replaces all call sites and asserts the
canvas path. Two clean local production-like runs passed all six dashboards.
This local result does not alter the Production FAIL classification or
authorize deployment.
