# PHASE 6E-F — DEPLOY & VERIFY SAFE DIAGNOSTIC INSTRUMENTATION

## 1. Overall Status

FAIL / STOP

Deployment API melaporkan READY, tetapi artifact Production hanya berisi
_global-error. Read-only verification pada seluruh route publik menghasilkan
HTTP 404 dengan X-Vercel-Error: NOT_FOUND. Karena itu deployment tidak lulus
functional verification dan instrumentation Production belum dapat dianggap
aktif.

Tidak ada retry deployment, rollback, authorized sync, Cron trigger,
database write, migration, environment Production change, commit, atau push
setelah temuan ini.

## 2. Objective

Phase ini bertujuan mendeploy hanya safe diagnostic instrumentation Phase
6E-E dan memverifikasi source provenance, build, route publik, negative Cron
authorization, secret safety, serta database/migration safety tanpa
menjalankan authorized Production sync.

Static/local objective tercapai. Deployment functional objective gagal karena
artifact route tidak tersedia.

## 3. Source Provenance

Source of truth yang dipakai adalah working tree lokal repository
energiprimer-next pada branch NextJs. Sebelum deployment:

- instrumentation Phase 6E-E ada di source;
- commit/source saat ini sudah memuat instrumentation dan laporan Phase 6E-E;
- working tree tidak memiliki perubahan source baru; hanya graphify-out/
  untracked yang sudah ada;
- tidak ada reset, revert, delete, atau perubahan commit history.

Deployment dijalankan dari direktori lokal energiprimer-next ke project
Vercel yang sudah diverifikasi, bukan ke project baru.

## 4. HEAD / Branch

| Item | Value |
|---|---|
| Branch | NextJs |
| HEAD | da5d9914d6e3e7741ed76cb9ad3bc9ca41646344 |
| Remote relation | HEAD -> origin/NextJs |
| HEAD subject | SAFE DIAGNOSTIC INSTRUMENTATION FOR PRODUCTION SYNC FAILURE |
| Pre-deployment untracked item | ../graphify-out/ |
| HEAD/source consistency | PASS; instrumentation tersedia |

## 5. Instrumentation Files Verified

| File | Verification |
|---|---|
| src/app/api/sync/google-sheets/route.ts | request ID, environment gate, terminal diagnostics, sanitized responses |
| src/services/google-sheets/sync/engine.ts | lease, worksheet, import, row-state, syncRun create/finalize |
| src/services/google-sheets/sync/discovery.ts | Google config dan discovery transaction |
| src/lib/google-sheets.ts | OAuth, metadata, cache hit, bounded Google errors |
| src/services/google-sheets/sync/diagnostic-core.ts | randomUUID, bounded fields, monotonic duration, safe logger |
| src/services/google-sheets/sync/diagnostics.ts | safe error details dan rethrow wrapper |

Static source verification PASS:

- request ID dibuat dengan crypto.randomUUID();
- request ID tidak masuk public response;
- diagnostic logger hanya mengeluarkan bounded fields;
- tidak ada raw error object, stack trace, token, private key, SQL, atau
  response body pada logger;
- operation semantics Phase 6E-E tetap berada di HEAD yang dideploy.

## 6. Forbidden Files Check

Status: PASS sebelum dan sesudah deployment.

Tidak ada diff pada:

- prisma/schema.prisma
- prisma/production/schema.prisma
- prisma/migrations/
- prisma/production/migrations/
- .env.local
- .env.e2e.local
- package.json
- package-lock.json
- vercel.json

vercel.json tetap memiliki cron schedule 0 22 * * *.

Catatan tooling: vercel link sempat menambahkan VERCEL_OIDC_TOKEN lokal ke
.env.local. Baris tersebut segera dihapus dengan apply_patch tanpa mencetak
nilainya; setelah itu key tidak ada lagi. Tidak ada perubahan pada
Production environment variable.

## 7. Static Regression

| Command | Result |
|---|---|
| npm run db:generate | PASS |
| npm run db:validate | PASS |
| npm run lint | PASS |
| npx tsc --noEmit | PASS |
| npm run build | PASS locally |
| npm run sync:verify-config | PASS |
| npm run sync:verify-cron-auth | PASS |
| npm run sync:verify-preview-write-safety | PASS, databaseWrites=0 |
| npm run sync:verify-schema | PASS |
| npm run sync:verify-retry | PASS, static mode |
| npm run sync:verify-auto-admission | PASS |
| npm run dynamic:verify | PASS |
| npm run auth:security:verify | PASS, networkRequests=0, databaseWrites=0 |

Auth security verifier melaporkan AUTH_E2E_ENV_NOT_AVAILABLE. Tidak ada
valid live auth E2E pada phase ini.

## 8. Secret Leakage Review

Status: PASS.

Static inspection menemukan hanya reference implementasi yang diperlukan,
misalnya private_key, access_token, Bearer, dan CRON_SECRET. Tidak ada nilai
secret yang dicetak atau dimasukkan ke diagnostic output.

Tidak ada penggunaan raw console.error(error), error.message, error.stack,
Authorization header, Bearer token, private key, DATABASE_URL, SQL, atau
response body pada diagnostic logger.

Vercel CLI membuat temporary protection-bypass token secara internal ketika
read-only curl membutuhkan deployment protection. Nilainya tidak ditampilkan,
disalin, atau dimasukkan ke source/log/report. Ini bukan credential rotation
atau perubahan application environment.

## 9. Vercel Deployment Evidence

Pre-deployment project inspection PASS:

| Setting | Observed |
|---|---|
| Scope/project | projek-rzen/dashboard-energi-primer |
| Framework | Next.js |
| Root Directory | energiprimer-next |
| Node.js | 24.x |
| Canonical Production domain | https://dashboard-energi-primer.vercel.app |
| Cron schedule | 0 22 * * * |

Perintah deployment instrumentation-only dijalankan tepat satu kali:
vercel deploy --prod --yes --scope projek-rzen

CLI melaporkan API status ok, readyState READY, dan alias Production
berhasil dipasang. Namun inspect sesudah deployment hanya menampilkan
_global-error output items dan tidak menampilkan App Router routes atau
sync function. Temuan ini membuat deployment functional verification FAIL.

Indikasi teknis yang perlu ditinjau kemudian: project Root Directory adalah
energiprimer-next sementara CLI dijalankan dari direktori energiprimer-next.
Kombinasi ini mungkin menyebabkan root diterapkan dua kali, tetapi hal itu
belum dikonfirmasi dan tidak diperbaiki otomatis pada phase ini.

## 10. Deployment ID

Deployment ID:

dpl_Fs5Xyyjf5TxNJ3qMqTQ334Q5NenS

Deployment inspector:

https://vercel.com/projek-rzen/dashboard-energi-primer/Fs5Xyyjf5TxNJ3qMqTQ334Q5NenS

Vercel reported status: READY.

## 11. Production URL

Deployment URL:

https://dashboard-energi-primer-4769mx7fj-projek-rzen.vercel.app

Canonical alias:

https://dashboard-energi-primer.vercel.app

Local source identifier used:

branch NextJs, HEAD da5d9914d6e3e7741ed76cb9ad3bc9ca41646344.

## 12. Public Route Verification

Read-only HEAD/GET-equivalent checks were made against the new Production
deployment. No cookies, application authorization, or sync credentials were
sent.

| Route | Expected | Actual | Result |
|---|---|---|---|
| / | not platform-level 404 | HTTP 404, X-Vercel-Error NOT_FOUND | FAIL |
| /login | HTTP 200 | HTTP 404, X-Vercel-Error NOT_FOUND | FAIL |
| /api/auth/providers | HTTP 200 | HTTP 404, X-Vercel-Error NOT_FOUND | FAIL |
| /dashboard | redirect to /login | HTTP 404, X-Vercel-Error NOT_FOUND | FAIL |

Canonical alias root verification also returned HTTP 404
X-Vercel-Error: NOT_FOUND.

## 13. Cron Negative Authorization Verification

Only the explicitly allowed negative tests were sent to the new deployment.
No valid CRON_SECRET was used.

| Request | Expected | Actual | Result |
|---|---|---|---|
| POST /api/sync/google-sheets without Authorization | HTTP 401 | HTTP 404 NOT_FOUND | FAIL / route absent |
| POST with Bearer WRONG_TEST_SECRET | HTTP 401 | HTTP 404 NOT_FOUND | FAIL / route absent |

These requests did not reach the application route, did not invoke the sync
engine, and did not write to a database. The 404 indicates missing deployment
artifact, not an authentication bypass.

## 14. Diagnostic Instrumentation Verification

Local source and local build: PASS.

Deployment metadata/source artifact: FAIL to verify. The post-deployment
inspect output contained only _global-error entries, with no route artifact
for the App Router or /api/sync/google-sheets. Therefore:

- deployed diagnostic-core.ts: NOT CONFIRMED;
- deployed diagnostics.ts: NOT CONFIRMED;
- deployed route/engine/discovery/Google instrumentation: NOT CONFIRMED;
- Production request_id/stage/error logs: NONE observed;
- no authorized sync was performed to force diagnostic execution.

The correct interpretation is deployment artifact failure, not that the
instrumentation itself has been proven faulty.

## 15. Database/Migration Safety

Status: PASS.

- Production sync engine invocations: 0;
- authorized Production retries: 0;
- database writes: 0;
- Google Sheet writes: 0;
- migrations: 0;
- db push: 0;
- migration resolve: 0;
- sync_run created by Phase 6E-F: 0;
- schema/migration files unchanged.

The two negative authorization probes were not authorized sync executions
and both terminated at platform 404.

## 16. Git Safety

Status: PASS.

After deployment:

- HEAD remained unchanged;
- no git add, commit, or push was run;
- no rollback or second deployment was run;
- git diff --check passed;
- tracked source diff was empty because Phase 6E-E instrumentation was
  already present in HEAD;
- only pre-existing ../graphify-out/ remains untracked;
- .vercel local link metadata is ignored and contains no application source
  change.

## 17. Production Safety Counters

| Counter | Expected | Actual | Notes |
|---|---:|---:|---|
| Authorized Production sync request | 0 | 0 | No valid CRON_SECRET used |
| Production retry | 0 | 0 | No retry |
| Production database write | 0 | 0 | No engine reached |
| Google Sheet write | 0 | 0 | No sync |
| Migration | 0 | 0 | No migration command |
| db push | 0 | 0 | Not run |
| migration resolve | 0 | 0 | Not run |
| Production environment change | 0 | 0 | No Vercel env mutation |
| Application credential change | 0 | 0 | No rotation/change |
| Deployment | 1 | 1 | dpl_Fs5Xyyjf5TxNJ3qMqTQ334Q5NenS |
| Commit | 0 | 0 | HEAD pre-existed |
| Push | 0 | 0 | Not run |

Separate local tooling note: one temporary VERCEL_OIDC_TOKEN line was added
by vercel link and then removed. Its value was never printed; final local
.env.local state has no such key.

## 18. Remaining Unknowns

- Why the direct local deployment produced only _global-error is not yet
  conclusively established.
- Root Directory handling between Vercel project configuration and local CLI
  working directory is the leading hypothesis, not a confirmed root cause.
- Production route/auth behavior cannot be evaluated until a corrected
  artifact is deployed under a separately approved remediation.
- No Production diagnostic log exists because no authorized sync was run.
- The historical Google Sheets sync HTTP 500 root cause remains unknown.

The current canonical Production alias is serving platform-level 404 for the
verified deployment. No automatic remediation was attempted.

## 19. Root Cause Classification

Original sync incident:

J. UNKNOWN — INSUFFICIENT EVIDENCE

Phase 6E-F deployment incident:

DEPLOYMENT ARTIFACT NOT FOUND — SOURCE/ROOT DIRECTORY MISMATCH SUSPECTED

The second classification describes the observed deployment symptom only. It
does not prove the configuration hypothesis and does not change the original
sync root-cause classification. Historical PostgreSQL 08P01/08006 events
remain candidate correlations, not confirmed causality.

## 20. Recommended Next Step

1. Keep the current phase stopped; do not run authorized sync, retry, Cron
   trigger, rollback, or another deployment automatically.
2. Review the deployment inspector and confirm the correct Vercel
   Root Directory/source packaging strategy. A separate approval is required
   for deployment remediation.
3. After a corrected deployment is explicitly approved, rerun only
   read-only public route and negative-auth verification.
4. Confirm /login, /api/auth/providers, guest /dashboard protection, and
   /api/sync/google-sheets negative 401 behavior before any sync.
5. Wait for NEW EXPLICIT APPROVAL FOR ONE AUTHORIZED PRODUCTION SYNC.

Do not run that sync in Phase 6E-F.
