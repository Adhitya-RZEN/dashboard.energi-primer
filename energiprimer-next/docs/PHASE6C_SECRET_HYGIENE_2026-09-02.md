# Phase 6C — Secret Hygiene Audit

Tanggal: 2026-09-02  
Project: energiprimer-next  
Mode: read-only audit  
Status: **PASS WITH ROTATION REQUIRED**

> Sections 1–18 are the pre-remediation baseline. Sections 19–28 record the
> Phase 6C remediation and final release gate; baseline findings are retained.

> Tidak ada nilai secret, password, token, private key, connection string lengkap,
> atau isi environment file yang ditulis ke laporan ini.

## 1. Scope

Audit mencakup working tree project, file environment dan nama key, aturan ignore,
file yang tracked, reachable Git history (git log --all), source/server boundary,
Auth.js, Prisma/PostgreSQL, Google Sheets, Vercel Cron, dokumentasi, report
Phase 5, dan artefak .next/static setelah build.

Audit tidak dapat membuktikan isi secret manager Vercel/CI, retensi log terminal/tool,
remote archive, atau deployment live. Pada baseline tidak ada migration, database
write, external API write, credential rotation, atau deployment. Remediation code
deletions are recorded below; no database/data deletion was performed.

## 2. Environment file audit

| File | Status | Hasil aman |
|---|---|---|
| .env.example | tracked | Template berisi placeholder, nilai kosong, dan contoh non-secret; tidak ada nilai credential nyata yang terkonfirmasi. |
| .env.local | exists, ignored | Memuat konfigurasi runtime lokal termasuk database, Auth.js, cron, dan Google; nilai tidak dibaca ke output dan tidak tracked. |
| .env.e2e.local | exists, ignored | Memuat credential E2E dan database E2E; nilai tidak dibaca ke output dan tidak tracked. |
| .env, .env.development, .env.production, .env.test | not found | Tidak ada file tambahan pada working tree yang terdeteksi. |
| credentials/monitoring-ep-a5b4cbfb6cd4.json | exists, ignored, untracked | JSON service-account-shaped lokal dengan field private_key; berada di luar public/ dan tidak tracked. Nilainya tidak dibaca atau dicetak. |

.gitignore mengabaikan .env*, mengecualikan .env.example, dan mengabaikan
credentials/ serta *.pem. Ignore hanya mencegah tracking; itu bukan bukti bahwa
credential lokal sudah aman atau sudah dirotasi.

## 3. Git tracking audit

- git ls-files menemukan .env.example sebagai satu-satunya file environment yang tracked.
- Tidak ada file credentials/, PEM/key, atau file credential service-account yang tracked.
- File .env.local, .env.e2e.local, dan JSON credential lokal berada pada aturan ignore.
- Tidak ada file credential pada public/.

**Hasil: PASS** untuk tracking boundary.

## 4. Git history audit

git log --all dan pickaxe/pattern scan menghasilkan:

- credential PostgreSQL dengan userinfo: **0 commit**;
- AWS access-key marker: **0 commit**;
- Resend live-key marker: **0 commit**;
- JWT-shaped token: **0 commit**;
- PEM private-key marker: hanya pada .env.example historis dan fixture
  scripts/verify-google-config.ts.

Blob historis yang memuat PEM marker tersebut tidak berhasil diparse sebagai private
key valid dan memiliki konteks template/fixture. Tidak ada usable private key yang
terkonfirmasi di reachable Git history.

**Hasil: PASS dengan catatan scope** — audit tidak mencakup log/backup/remote archive
atau output tool di luar reachable Git history.

## 5. Repository secret scan

Static scan pada tracked files dan working tree (dengan environment lokal dikecualikan
dari output) tidak menemukan:

- credential URL dengan password;
- usable PEM private key;
- AWS, Resend, Google API-key, JWT, atau token marker umum;
- secret literal pada dokumentasi/report.

Match private_key yang tersisa hanya berupa field JSON lokal yang di-ignore dan
akses property konfigurasi Google; fixture test memakai placeholder.

**Hasil: PASS untuk committed/repository content; local ignored credential tetap perlu
perlakuan operasional.**

## 6. NEXT_PUBLIC exposure audit

- Source aktif hanya membaca NEXT_PUBLIC_APP_NAME dan NEXT_PUBLIC_APP_URL untuk
  konfigurasi publik/URL fallback.
- Tidak ada NEXT_PUBLIC_DATABASE, NEXT_PUBLIC_AUTH, NEXT_PUBLIC_CRON,
  NEXT_PUBLIC_GOOGLE, NEXT_PUBLIC_RESEND, atau NEXT_PUBLIC_SUPABASE pada source
  aktif maupun scripts runtime.
- next.config.ts tidak meneruskan server environment melalui env atau runtime config.
- Nama NEXT_PUBLIC_SUPABASE_* masih muncul pada beberapa dokumen E2E/legacy; itu
  bukan client exposure karena tidak ada browser Supabase Auth client pada source aktif.
  Dokumen tersebut perlu diberi label historical/non-active secara konsisten.

**Hasil: PASS** untuk source dan client exposure.

## 7. Auth.js secret audit

- Auth.js aktif berada pada src/auth.ts dengan Credentials provider, JWT session,
  bcrypt, Prisma, dan server-only.
- Tidak ada hardcoded AUTH_SECRET atau secret session pada source.
- AUTH_SECRET dibaca oleh Auth.js melalui environment convention; startup preflight
  mewajibkan keberadaannya tanpa mencetak nilainya.
- Login, session callback, role check, redirect safety, dan throttle tidak mencetak
  password, token, atau secret.
- Tidak ditemukan Supabase Auth client/dependency pada source aktif.

**Hasil: PASS secara source boundary; rotasi tetap diperlukan karena incident Phase 5
belum dapat dibatasi.**

## 8. Database secret audit

- Prisma dan dashboard/data services memakai server-only.
- DATABASE_URL, SUPABASE_DIRECT_URL, dan SUPABASE_POOLER_URL hanya digunakan
  pada server/runtime atau operator scripts.
- .env.example tidak memuat credential database nyata; URL contoh tidak memiliki
  userinfo credential.
- Production migration preflight hanya mengeluarkan bentuk aman seperti protocol,
  port, host class, SSL mode, dan status; URL lengkap tidak dikeluarkan.
- Environment lokal dan E2E memiliki endpoint database yang ignored; target dan
  credential rotation status tidak dapat dinyatakan aman hanya dari ignore rule.

**Hasil: PASS untuk source/repository exposure; PASS WITH ROTATION REQUIRED untuk
operational secret state.**

## 9. Google credential audit

- src/lib/google-sheets.ts dan adapter/sync Google memakai server-only.
- Tidak ada NEXT_PUBLIC_GOOGLE_* atau private key pada client bundle.
- .env.local memiliki konfigurasi service-account environment pair yang tidak tracked.
- File JSON di credentials/ ignored, untracked, di luar public/, dan mengandung
  field private_key; nilai credential tidak dibuka/dicetak.
- Git history hanya menunjukkan template/fixture PEM marker, tanpa valid private key
  yang terkonfirmasi.

**Hasil: PASS untuk repository/client exposure; PASS WITH ROTATION REQUIRED untuk
credential yang mungkin masuk boundary output Phase 5.**

## 10. Cron secret audit

- vercel.json hanya berisi schedule dan path; tidak berisi CRON_SECRET.
- Route sync memeriksa deployment environment sebelum bearer authorization.
- CRON_SECRET dibandingkan dengan constant-time comparison dan tidak dilog.
- Preview/unknown deployment ditolak sebelum write-capable sync path.
- Nilai lokal CRON_SECRET ignored dan tidak ditampilkan.

**Hasil: PASS untuk implementation; PASS WITH ROTATION REQUIRED untuk operational
secret state.**

## 11. Documentation/report audit

Pattern scan pada docs/, README, report, dan scripts tidak menemukan nilai credential
atau token usable. Namun terdapat hygiene issue dokumentasi:

- docs/INTEGRATION_MAPPING.md masih menyatakan .env.example memiliki nilai admin
  yang tampak nyata, sementara template saat ini berisi placeholder/contoh aman;
- beberapa report E2E/Vercel menyebut NEXT_PUBLIC_SUPABASE_* sebagai konfigurasi
  public/legacy, tetapi tidak selalu menegaskan bahwa source aplikasi aktif tidak
  memakai Supabase Auth browser client.

**Hasil: PASS WITH WARNINGS** — tidak ada secret value, tetapi klaim stale perlu
perapihan agar operator tidak salah memahami active architecture.

## 12. Phase 5 diagnostic-output exposure assessment

Source dan report saat ini menunjukkan guard berikut:

- environment preflight hanya mengeluarkan status, nama variable, dan missing list;
- Google/mail/sync errors dikategorikan dan tidak mengeluarkan raw provider response,
  token, private key, atau password;
- password-reset response bersifat generic dan tidak mencetak reset token;
- client static bundle tidak mengandung server secret names/markers.

Akan tetapi, Phase 5 sebelumnya memiliki kemungkinan environment content tercetak pada
boundary terminal/tool. Audit repository tidak menemukan salinan nilai tersebut, tetapi
juga tidak dapat memverifikasi apakah output pernah masuk chat log, CI log, screenshot,
backup, atau pihak lain. Karena exposure boundary tidak dapat dibatasi dari repository,
credential aktif harus diperlakukan sebagai berpotensi terpapar.

Selain itu, beberapa diagnostic/verification script opsional masih meneruskan raw
error.message, termasuk scripts/verify-db.mjs dan scripts/verify-auth.mjs.
Tidak ada bukti bahwa error tersebut memuat secret pada run ini, tetapi pola tersebut
belum memenuhi strict secret-hygiene guarantee untuk semua operator failure path.

**Hasil: PASS WITH ROTATION REQUIRED untuk exposure evidence; remediation code masih
required untuk raw diagnostic error paths.**

## 13. Legacy authentication audit

- Tidak ada Supabase Auth runtime aktif pada source aplikasi.
- Auth.js Credentials adalah active authentication path melalui
  src/app/api/auth/[...nextauth]/route.ts → src/auth.ts.
- Referensi Laravel yang tersisa adalah compatibility/data/throttle atau dokumentasi;
  bukan bukti bahwa Laravel/Supabase Auth masih menjadi active provider.
- src/app/password/reset/page.tsx tidak ada pada working tree; open tab IDE tersebut
  bukan file aktif repository.
- Password reset **masih aktif** melalui src/app/forgot-password/actions.ts,
  src/app/reset-password/[token]/, src/lib/password-reset.ts, dan schema token.
- Dependency dan flow Resend **masih aktif** melalui resend, src/lib/mail/index.ts,
  dan password-reset delivery. Dokumentasi AUTH_IMPLEMENTATION.md juga menyatakan
  flow tersebut sebagai active.

Ini bertentangan dengan kriteria Phase 6C yang mensyaratkan tidak ada active
password-reset/Resend authentication flow. Flow tersebut tidak boleh dihapus otomatis
karena penghapusan dapat mengubah authentication contract dan memutus recovery admin.

**Hasil: FAIL terhadap acceptance criterion Phase 6C; owner decision diperlukan untuk
mempertahankan atau mendecommission flow tersebut.**

## 14. Build/client exposure verification

Post-build checks:

- .next/static: 22 files, sekitar 1.18 MB;
- server secret names pada .next/static: **0**;
- forbidden NEXT_PUBLIC_* names pada .next/static: **0**;
- credential URL, PEM, JWT, dan common API-key markers pada .next/static: **0**;
- next.config.ts tidak memiliki public env forwarding.

.next/server tidak diperlakukan sebagai client artifact. Satu regex-like provider
prefix match pada server source map ditelusuri ke internal Next incremental-cache source,
bukan secret value.

**Hasil: PASS.**

## 15. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-6C-001 | HIGH | Phase 5 diagnostic-output exposure tidak dapat dibatasi dari repository/log boundary. | Rotation required |
| SEC-6C-002 | HIGH | Credential service-account JSON dan runtime secrets ada di local ignored environment. | Not tracked; rotate if exposure possible |
| SEC-6C-003 | HIGH | Active password-reset/Resend flow bertentangan dengan explicit Phase 6C acceptance criterion. | Owner decision required |
| SEC-6C-004 | MEDIUM | Raw error.message masih dapat keluar dari beberapa optional diagnostics. | Code hardening required |
| SEC-6C-005 | LOW | Beberapa documentation/report statements stale atau kurang jelas membedakan legacy public config dari active source. | Documentation cleanup required |

Tidak ada committed usable credential yang terkonfirmasi pada audit ini.

## 16. Remediation required

1. Rotasi melalui secret manager, tanpa menyalin nilai ke chat atau repository:
   database password/connection credentials, AUTH_SECRET, CRON_SECRET, Google
   service-account key, Resend API key bila pernah provisioned, serta E2E credentials
   bila ikut masuk boundary Phase 5.
2. Revoke/delete old Google private key pada provider setelah replacement tervalidasi.
3. Audit chat/tool/CI/Vercel logs, screenshot, backup, dan remote Git provider untuk
   memastikan output Phase 5 tidak tersebar.
4. Sanitasi seluruh operator diagnostic failure path agar hanya mengeluarkan kategori
   aman; minimal scripts/verify-db.mjs, scripts/verify-auth.mjs, dan script audit
   lain yang meneruskan raw provider/database error.
5. Putuskan secara eksplisit apakah password reset + Resend adalah fitur Auth.js yang
   dipertahankan. Jika dipertahankan, ubah acceptance/documentation Phase 6C; jika
   didecommission, buat change plan terpisah dengan regression recovery sebelum
   menghapus route/dependency.
6. Perbaiki statement stale di docs/INTEGRATION_MAPPING.md dan beri label
   historical/non-active pada dokumentasi NEXT_PUBLIC_SUPABASE_*.
7. Setelah remediation, ulangi repository/history/client scan dan required regression
   gate dengan output yang tetap ter-redact.

## 17. Credential rotation recommendation

**RECOMMENDED / REQUIRED BEFORE PRODUCTION RELEASE.** Rotasi tidak dijalankan otomatis.
Urutan yang disarankan:

1. AUTH_SECRET — menginvalidasi session/token lama sesuai kebijakan deployment.
2. Database credentials untuk runtime, direct migration endpoint, dan E2E endpoint
   bila berada pada boundary yang sama.
3. CRON_SECRET — lalu verifikasi schedule dengan secret baru.
4. Google service-account key — revoke key lama dan validasi least privilege/read-only.
5. Resend API key jika pernah aktif/provisioned.
6. E2E admin password/test secret jika kemungkinan ikut tercetak.

## 18. Baseline Phase 6C status before remediation

| Check | Status |
|---|---|
| Environment files | PASS WITH WARNINGS — local ignored secrets exist; .env.example safe |
| Git tracking | PASS |
| Git history | PASS WITH SCOPE LIMIT |
| Repository secret scan | PASS — no committed usable secret confirmed |
| NEXT_PUBLIC exposure | PASS |
| Auth.js secrets | PASS WITH ROTATION REQUIRED |
| Database credentials | PASS WITH ROTATION REQUIRED |
| Google credentials | PASS WITH ROTATION REQUIRED |
| Cron secret | PASS WITH ROTATION REQUIRED |
| Documentation | PASS WITH WARNINGS |
| Phase 5 exposure | PASS WITH ROTATION REQUIRED |
| Legacy auth | FAIL — active password reset/Resend conflicts with Phase 6C criterion |
| Client bundle | PASS |
| Lint | PASS (npm run lint) |
| TypeScript | PASS (npx tsc --noEmit --incremental false) |
| Build | PASS (npm run build) |

**PHASE 6C BASELINE STATUS: FAIL**

Reason: no committed secret exposure was confirmed, but production release remains
blocked by unbounded Phase 5 exposure requiring rotation, raw diagnostic error paths,
and the unresolved explicit conflict between the Phase 6C acceptance criterion and the
currently active Auth.js password-reset/Resend implementation.

## 19. Remediation Performed

Phase 6C remediation was completed within the repository and local generated
artifacts only:

- Removed the former `forgot-password` and `reset-password/[token]` route
  files, actions, forms, password-recovery helper, mail adapter, and Resend
  verifier after call-graph review.
- Removed the `resend` package and `mail:verify` script from `package.json` and
  synchronized `package-lock.json`; the installed extraneous packages were
  pruned.
- Added `src/lib/auth-tokens.ts` for the existing authenticated password-change
  compatibility token and updated its caller. This is not a recovery flow.
- Removed the login link to the decommissioned public recovery route.
- Kept `PasswordResetToken` in both Prisma schemas and existing migrations.
  Database-object cleanup requires a separate reviewed migration.
- Added shared safe error categorization for TypeScript and operator scripts,
  and disabled raw Prisma error events at the application client boundary.
- Removed the stale generated `.next` cache and regenerated Prisma Client.

No migration, migration resolve, database/data write, deployment, external API
write, or automatic credential rotation was performed.

## 20. Password Reset / Resend Decommission

The audited call graph had no remaining active import of the removed recovery
routes, helper, mail adapter, or Resend dependency. The only remaining source
mention of `/forgot-password` is an assertion in `scripts/verify-auth-security.ts`
that verifies the login page does not link to it.

The final build route inventory contains `/login` and `/password/change`, but
no public recovery or mail route. The legacy `PasswordResetToken` model/table
is intentionally retained as a schema artifact; removal is deferred to a
separate migration/change window.

## 21. Diagnostic Error Sanitization

`src/lib/safe-error.ts` and `scripts/safe-error.mjs` classify failures as safe
categories such as `AUTHENTICATION_ERROR`, `NETWORK_ERROR`,
`TLS_OR_SSL_ERROR`, `VALIDATION_ERROR`, or `PROVIDER_ERROR` without returning
provider messages, connection targets, headers, tokens, or stack traces.

The hardening covers `verify-db.mjs`, `verify-auth.mjs`, import/schema
verifiers, Supabase privilege preflight, Auth.js security checks, KPI/import
verifiers, mapping/layout audits, worksheet classification, and related
operator diagnostics. Prisma client error logging is disabled so build/runtime
fallbacks do not emit raw provider errors. The final build emitted no
`prisma:error` output.

## 22. Documentation Cleanup

Current contract documents were updated: `AUTH_IMPLEMENTATION.md`,
`ENVIRONMENT_VARIABLES.md`, `PRODUCTION_ENVIRONMENT.md`,
`PRODUCTION_ENVIRONMENT_MATRIX.md`, `AGENT_CONTEXT.md`, `PROJECT_MAP.md`,
`VERCEL_CONFIGURATION.md`, `DEPENDENCY_AUDIT.md`, and `INTEGRATION_MAPPING.md`.
Mail/recovery rows were removed from active maps. Older phase reports,
runbooks, and provider documents were retained and marked
`HISTORICAL`/`DECOMMISSIONED` so their findings remain auditable without
describing active runtime behavior.

## 23. Environment Template Cleanup

`.env.example` contains only placeholders and active names. `AUTH_URL` remains
as the canonical Auth.js deployment origin; it is not a recovery-provider
setting. `AUTH_MAILER`, `MAIL_MAILER`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, and `RESEND_TEST_RECIPIENT` were removed from the active
template and documentation.

Ignored local files were not printed or committed. The post-remediation key-name
inventory found local runtime/E2E configuration and one ignored service-account
JSON with a `private_key` field; no value was exposed. No Resend key name was
present in the inspected local environment files.

## 24. Credential Rotation Gate

No rotation was executed automatically. Operator status is:

| Credential class | Status | Required operator action |
|---|---|---|
| `AUTH_SECRET` | ROTATION REQUIRED | Replace in each environment and invalidate old sessions per policy |
| Runtime/direct/pooler database credentials | ROTATION REQUIRED | Replace separately in runtime, operator, preview, local, and E2E stores |
| `CRON_SECRET` | ROTATION REQUIRED | Replace and verify scheduled sync authorization |
| Google service-account credential | ROTATION REQUIRED | Create least-privilege replacement and revoke the old key |
| E2E admin/password/test secrets | ROTATION REQUIRED | Replace if they crossed the Phase 5 output/log boundary |
| Resend credential | NOT APPLICABLE to active app | Revoke/delete any old external value after dependency confirmation |

The status reflects possible Phase 5 diagnostic exposure and local ignored
secret material, not a claim that a value was printed in this report.

## 25. Post-Remediation Secret Scan

All scans were performed without printing matching content or secret values:

| Scan | Result |
|---|---|
| Tracked sensitive paths | PASS — only `.env.example` is tracked among environment/credential path patterns |
| Current tracked/worktree high-confidence markers | PASS — no credential URL with userinfo, AWS key, live Resend key, JWT, or PEM marker |
| Reachable Git history high-confidence markers | PASS WITH SCOPE LIMIT — no credential URL, AWS key, live Resend key, or JWT; historical PEM markers remain only in non-runtime/fixture/report context |
| Active source forbidden provider/recovery imports | PASS — no active import or dependency; verifier assertion is intentional |
| `NEXT_PUBLIC_*` usage | PASS — only `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_URL` |
| `.next/static` client bundle | PASS — zero server-secret names, forbidden public names, credential URLs, PEM, or JWT markers |
| Package manifest/lockfile | PASS — JSON valid and no `resend` declaration |

## 26. Regression Results

| Command/check | Result |
|---|---|
| `npm run db:generate` | PASS |
| `npm run db:validate` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS — clean build output; no raw Prisma error log |
| `npm run supabase:production:migrate-status` | PASS — up to date; read-only; `supabaseWrites=0` |
| `npm run supabase:production:migration:preflight` | PASS — canonical history, empty schema diff, read-only |
| `npm run auth:security:verify` | PASS — static Auth.js boundary; `databaseWrites=0`, `networkRequests=0` |
| `npm run sync:verify-cron-auth` | PASS |
| `npm run sync:verify-preview-write-safety` | PASS — `databaseWrites=0` |
| `npm run sync:verify-config` | PASS — values not printed |
| `npm run ops:verify-env` | PASS — `secretsPrinted=false` |

Live `npm run auth:verify` was not run: its valid-login scenario updates
`users.last_login_at`, which violates this phase's zero-write constraint, and
the isolated auth E2E environment was not available under the verifier's
expected names. Run that test later with a disposable account/database after
rotation.

## 27. Remaining Operator Actions

1. Audit chat, tool, CI, Vercel, terminal, backup, and remote Git retention for
   the earlier Phase 5 diagnostic exposure.
2. Rotate/revoke the credential classes listed in section 24 through the
   relevant secret managers and providers; do not paste replacement values into
   the repository or chat.
3. Remove obsolete Resend/provider values from external environments if no
   other system depends on them.
4. Run isolated live Auth.js login/logout E2E after rotation, accepting only
   the test account's expected login timestamp update.
5. Design and approve a separate migration if the retained
   `PasswordResetToken` database object is to be removed.
6. Re-run the release gates in CI/Vercel with redacted logs before deployment.

## 28. Final Phase 6C Gate

| Gate | Status |
|---|---|
| Password recovery decommission | PASS |
| Resend decommission | PASS |
| Active Auth.js boundary | PASS — Auth.js Credentials → Prisma → PostgreSQL/Supabase |
| Diagnostic error sanitization | PASS |
| Environment template | PASS |
| Git tracking | PASS |
| Git history | PASS WITH SCOPE LIMIT |
| Repository secret scan | PASS |
| `NEXT_PUBLIC_*` exposure | PASS |
| Client bundle exposure | PASS |
| Documentation classification | PASS |
| Prisma generate/validate | PASS |
| Lint/type-check | PASS |
| Migration status/preflight | PASS — read-only, no pending migration, empty diff |
| Build | PASS |
| Database writes | `0` |
| Migration deploy/resolve | `0` / `0` — NOT RUN |
| Deployment | `0` — NOT RUN |
| Credential rotation | REQUIRED — operator gate remains |

**PHASE 6C STATUS: PASS WITH ROTATION REQUIRED**

Code and repository hygiene meet the Phase 6C acceptance criteria. Production
release remains gated on external credential rotation/revocation and the
operator log-retention review; those actions were intentionally not automated.
