# Auth E2E & Security Hardening Report

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Password-recovery and Resend
> references in this dated report describe the pre-remediation state only.
> Current auth is Auth.js Credentials → Prisma → PostgreSQL/Supabase.

Tanggal audit: 2026-09-01  
Project: `energiprimer-next`  
Scope: Auth.js, Credentials Provider, session, authorization, protected routes,
password reset, Resend, Google Sheets cron authorization, secrets, dan build.

Tidak ada deployment, migration, `db push`, full import, atau perubahan business
data pada phase ini.

## Executive Summary

Core authentication and authorization controls pass static/mock verification.
Credentials Provider tetap dipakai, role `admin` tetap menjadi satu-satunya role
yang diizinkan, password reset memakai token acak yang disimpan dalam bentuk
hash, dan token dihapus setelah reset berhasil. Resend tetap dibatasi untuk
password reset.

Safe hardening yang diterapkan:

- validasi email server-side diperketat;
- redirect Auth.js dibatasi ke application origin;
- session memvalidasi ulang role dan session version terhadap database;
- reset token tepat pada batas 60 menit dan timestamp masa depan ditolak;
- URL/token reset tidak lagi ditulis ke development log;
- production reset URL wajib memakai server-side `AUTH_URL` dan HTTPS;
- baseline security headers ditambahkan;
- fixture security read-only ditambahkan.

Live Auth E2E belum dapat dijalankan karena environment fixture `AUTH_TEST_*`
tidak tersedia. Karena itu final gate adalah **PASS WITH REVIEW**, bukan PASS
production penuh.

## Current Authentication Architecture

Stack yang diaudit:

- Next.js `16.3.3`;
- Auth.js `next-auth@5.0.0-beta.32`;
- Credentials Provider;
- JWT session strategy dengan max age 120 menit;
- Prisma ke PostgreSQL local existing;
- bcryptjs untuk password hash/compare;
- Resend hanya untuk password reset.

```text
Browser
  |
  v
Login form
  |
  v
Server Action -> Auth.js Credentials Provider
  |
  v
Prisma -> existing PostgreSQL.users (role=admin)
  |
  v
JWT httpOnly session cookie
  |
  v
Proxy + protected route layout + server auth()
  |
  v
Dashboard/resource access
```

Password recovery:

```text
Forgot Password
  |
  v
Admin lookup with generic response
  |
  v
Cryptographically random reset token
  |
  v
Bcrypt token hash in password_reset_tokens
  |
  v
Resend (only when AUTH_MAILER=resend)
  |
  v
Reset URL -> token/email verification
  |
  v
Password hash update + reset-token deletion in transaction
```

Tidak ada Email Provider, magic link, OAuth, atau session adapter baru.

## Authorization Model

Database/code saat ini menggunakan field role string. Implementasi hanya
mengizinkan `role = admin`; tidak ada role baru yang dibuat.

- `/dashboard` dan seluruh route di bawah route group `(protected)` memerlukan
  session server-side dan role `admin`.
- `/password/change` memeriksa session dan role lagi di page serta Server Action.
- `/api/sync/google-sheets` memakai `CRON_SECRET` server-side, bukan role UI.
- Navigation hiding bukan security boundary; pemeriksaan server tetap dilakukan.
- Session callback memeriksa user saat ini, role saat ini, dan `updatedAt` sebagai
  session version. Perubahan role/password membuat JWT lama tidak berwenang.

Hasil audit authorization: **PASS pada static/mock boundary**. Live user-to-user
authorization E2E membutuhkan isolated auth test environment.

## Authentication Tests

Fixture: `scripts/verify-auth-security.ts`  
Command: `npm.cmd run auth:security:verify`

Hasil fixture: **PASS**, 0 database write, 0 network request.

| Test | Hasil | Keterangan |
|---|---|---|
| Valid login | NOT RUN LIVE | `AUTH_TEST_*` tidak tersedia; live login juga memperbarui `last_login_at` pada database existing |
| Invalid email | PASS MOCK/STATIC | Server-side format validation dan generic login error |
| Invalid password | PASS STATIC | Auth.js `authorize()` mengembalikan `null` |
| Empty credentials | PASS STATIC | Ditolak sebelum query user |
| Missing credentials | PASS STATIC | Ditolak sebelum query user |
| Expired session | PASS STATIC | JWT max age dan session-version rejection diaudit |
| Logout | NOT RUN LIVE | Existing HTTP harness membutuhkan E2E fixture |
| Protected route unauthenticated | PASS STATIC | Proxy dan protected layout diaudit |
| Protected API unauthenticated | PASS MOCK | Cron auth fixture menolak secret kosong/salah |

Status environment: **AUTH_E2E_ENV_NOT_AVAILABLE**. Script existing
`verify-auth.mjs` berhenti pada preflight karena `AUTH_TEST_ADMIN_EMAIL` dan
`AUTH_TEST_ADMIN_PASSWORD` tidak tersedia; tidak ada login atau database write
yang dilakukan.

## Authorization Tests

- `admin` adalah role yang digunakan untuk dashboard access: **PASS**.
- Role selain `admin` dikosongkan/ditolak pada authorization boundary: **PASS
  pada fixture/static audit**.
- Direct Server Action password change memeriksa session user dan role:
  **PASS**.
- User tidak dapat memilih `userId` pada password change; ID berasal dari
  session server-side: **PASS**.
- Live User A/User B E2E: **NOT RUN**, isolated auth fixture belum tersedia.

## IDOR Audit

Endpoint aktif yang menerima akses sensitif:

- `/api/sync/google-sheets` tidak menerima spreadsheet ID, worksheet, range,
  user ID, atau database target dari request; request hanya diterima dengan
  `CRON_SECRET` yang benar.
- Password change menggunakan ID dari session yang telah diotorisasi.
- Password reset memakai token hash yang terikat pada email record dan menghapus
  record yang sama setelah sukses.
- Tidak ditemukan endpoint resource-by-ID yang dapat diganti oleh user biasa.

Hasil IDOR source audit: **PASS**, live request fuzzing belum dilakukan karena
tidak ada resource-user test fixture.

## Session Security

- JWT strategy: **PASS**, max age 120 menit tetap eksplisit.
- Session payload hanya membawa `id`, `name`, `email`, dan `role` yang diperlukan.
- Password, password hash, reset token, API key, private key, database URL,
  `CRON_SECRET`, dan `AUTH_SECRET` tidak dimasukkan ke session claims/props.
- Role dan `updatedAt` divalidasi ulang server-side pada session callback.
- Auth.js default cookie behavior tetap digunakan: httpOnly, sameSite, dan
  secure pada production HTTPS.
- Tidak ada perubahan terhadap tabel Laravel `sessions`; Next.js tetap memakai
  JWT sesuai architecture existing.

Hasil: **PASS pada source/static audit**. Cookie attribute live check menunggu
isolated E2E environment.

## Password Security

- Password tidak disimpan plaintext.
- Password existing diverifikasi dengan `bcryptjs.compare`.
- Password baru dibuat dengan `bcryptjs.hash` cost 12.
- Password tidak dikirim melalui email, response, atau log.
- Algorithm existing tidak diganti.

Hasil: **PASS**.

## Password Reset Security

- Token dibuat dengan `randomBytes(32)` dan panjang 64 karakter hexadecimal.
- Database hanya menyimpan bcrypt hash token.
- Expiration adalah 60 menit; token tepat pada batas expiration ditolak.
- Timestamp masa depan ditolak.
- Token terikat pada record email melalui bcrypt comparison.
- Token invalid/expired ditolak dengan pesan generic.
- Token hanya dapat berhasil dipakai sekali karena dihapus dalam transaction
  setelah password update.
- URL reset hanya memakai origin konfigurasi; production memerlukan `AUTH_URL`
  server-side dan HTTPS.
- Development log hanya mencatat event generic. Token dan reset URL tidak lagi
  dicetak.

Hasil primitive/source verification: **PASS**. Live reset dengan user existing
tidak dijalankan agar tidak mengubah password atau reset-token data.

## Enumeration Protection

Forgot-password mengembalikan pesan generic untuk email admin yang ditemukan
maupun tidak ditemukan. Invalid format hanya menghasilkan validation error dan
tidak mengungkap keberadaan akun.

Hasil source audit: **PASS**.

## Rate Limiting

- Login memakai persistent cache existing dengan kebijakan setara Laravel
  `throttle:6,1` berdasarkan hash email/IP: **PASS static**.
- Password reset memakai throttle per email 60 detik: **PASS fixture**.
- Forgot-password tetap mengembalikan response generic saat throttle aktif.
- Distributed IP/global abuse protection untuk deployment serverless belum
  dikonfigurasi; kebutuhan Redis/provider rate-limit adalah **NEEDS REVIEW**.
- Tidak ada database-heavy atau external rate-limit infrastructure baru yang
  ditambahkan pada phase ini.

## CSRF / Request Security

- Auth.js menangani CSRF untuk credentials callback dan sign-out.
- Next.js Server Actions dipakai untuk login, reset, dan password change.
- Sync endpoint tidak menerima credential dari body/query; hanya Bearer secret.
- Tidak ada perubahan terhadap framework security defaults.

Hasil source audit: **PASS**.

## Open Redirect

Audit terhadap `callbackUrl`, `redirectTo`, dan redirect server:

- Redirect login/logout yang digunakan aplikasi adalah path internal tetap.
- Auth.js sekarang memiliki explicit redirect callback.
- Relative path diterima hanya jika tidak protocol-relative dan tidak memakai
  backslash/control character.
- Absolute URL hanya diterima jika origin sama.
- Foreign-origin/malformed URL fallback ke base URL aplikasi.

Fixture menguji relative, same-origin, foreign-origin, protocol-relative, dan
backslash redirect: **PASS**.

## Security Headers

`next.config.ts` sekarang mengatur:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` untuk menutup camera, microphone, dan geolocation;
- `Strict-Transport-Security: max-age=31536000` hanya pada production;
- `poweredByHeader: false`.

Content-Security-Policy belum dipaksakan otomatis karena perlu audit nonce/inline
script, Auth.js, chart, dan asset loading pada browser. CSP adalah **NEEDS REVIEW**
sebelum production hardening final.

## Server/Client Boundary

Audit menemukan:

- Prisma hanya digunakan oleh server modules/actions/pages.
- Google Sheets dan credential environment hanya digunakan server-side.
- Resend client berada di `src/lib/mail/index.ts` yang memakai `server-only`.
- Client Components tidak mengimpor Auth.js server config, Prisma, mail service,
  Google client, atau secret environment.
- Reset form hanya menerima Server Action reference dan data form yang memang
  diperlukan.

Hasil scan:

```text
CLIENT_BUNDLE_SECRET_SCAN=PASS
CLIENT_SOURCE_BOUNDARY=PASS
CLIENT_STATIC_FILE_COUNT=22
REPOSITORY_SECRET_MARKERS=NONE
TRACKED_ENV_TEMPLATE=OK
ENV_LOCAL_IGNORED=YES
```

Tidak ada nilai secret yang dicetak dalam report.

## Resend Security

- Resend SDK hanya dibuat di server-only mail service.
- `RESEND_API_KEY` tidak dikembalikan melalui response, props, log, atau client
  bundle.
- Sender/recipient divalidasi sebelum request.
- Timeout 10 detik, error classification, safe logging, dan idempotency key
  tersedia.
- Scope tetap hanya password reset.
- Real smoke test Phase 18 terakhir mencapai Resend tetapi ditolak provider
  karena validasi sender/domain; tidak ada email yang terkirim. Phase 19 tidak
  mengulang pengiriman email.

Hasil source/security audit: **PASS**. Sender/domain verification production:
**NEEDS REVIEW**.

## Google Sheets Cron Security

Endpoint `/api/sync/google-sheets`:

- missing `CRON_SECRET`: tidak dikonfigurasi/ditolak;
- missing authorization: **DENY**;
- wrong bearer secret: **DENY**;
- correct bearer secret: **CONTINUE**;
- comparison menggunakan constant-time `timingSafeEqual`;
- response hanya berisi aggregate counters;
- detail credential/error tidak dikembalikan.

Command `npm.cmd run sync:verify-cron-auth`: **PASS**. Production sync write
tidak dijalankan.

## Error Handling

- Login/auth error ke client menggunakan pesan generic.
- Forgot-password tidak mengungkap user existence.
- Reset error invalid/expired generic.
- Mail error diklasifikasikan ke pesan aman; detail provider tidak diteruskan ke
  client.
- Sync endpoint memakai response generic untuk unauthorized, not configured, dan
  failure.
- Root error boundary tidak menampilkan stack trace.
- Server log pada mail service hanya memakai code/status aman dan recipient yang
  dimask; token/API key tidak dicatat.

Hasil: **PASS**, dengan catatan Prisma/SDK error logging production tetap perlu
dipantau agar deployment log tidak menambahkan payload sensitif.

## Secret Scan

Static scan setelah build:

- client bundle secret markers: **NONE**;
- client source server-only references: **NONE**;
- repository secret markers: **NONE**;
- tracked credential path: **NONE**;
- `.env.local`: ignored;
- `.env.example`: template only, tidak berisi credential nyata.

Fixture Google service-account diubah dari marker PEM palsu menjadi placeholder
non-PEM agar scanner tidak menghasilkan false positive. Tidak ada file credential
nyata yang diubah.

Hasil: **PASS**.

## Dependency Security

`npm audit` penuh menemukan tiga HIGH yang sudah diketahui pada dependency chain
Prisma:

| Package | Severity | Issue | Recommendation |
|---|---|---|---|
| `deepmerge-ts <8.0.0` melalui `@prisma/config`/`prisma` | HIGH | Stack exhaustion pada recursive object graph (GHSA-ggr8-5vv4-36mx) | Evaluasi upgrade Prisma/compatibility secara terpisah |

NPM menawarkan `npm audit fix --force` yang akan melakukan perubahan breaking ke
Prisma `6.12.0`. Perintah tersebut **tidak dijalankan**. Tidak ada vulnerability
baru dari dependency Resend yang terdeteksi pada audit ini.

Status dependency: **NEEDS REVIEW**, bukan blocker Phase 19 karena tidak ada
critical finding dan perubahan major memerlukan approval terpisah.

## Database Integrity

Command `npm.cmd run db:verify`: **PASS**.

- Database/schema terbaca: `dashboard_pln` / `public`.
- Unit: 3.
- Relasi unit yang diuji tidak memiliki orphan.
- Target Biomassa tetap 70.020 ton.
- Business data changed: **NO**.
- Business writes: **0**.
- Prisma migration/db push: **NOT RUN**.

## Sync Regression

Read-only/static regression: **PASS**.

- `sync:verify-state`: PASS; row state 2.409, active worksheet 7, open schema
  changes 0, active leases 0.
- `sync:verify-incremental`: PASS; fixture idempotency, NULL/zero, reorder,
  stable key, dan 2.409-row skip behavior.
- `sync:verify-retry`: PASS.
- `sync:verify-schema`: PASS.
- `sync:verify-auto-admission`: PASS.
- `sync:verify-config`: PASS tanpa mencetak credential.
- `sync:verify-cron-auth`: PASS.
- Google Sheets production write/full import: **NOT RUN**.

Tidak ada perubahan auth yang menjalankan sync atau mengubah business rows.

## Build Validation

| Check | Result |
|---|---|
| `npm.cmd run auth:security:verify` | PASS; `AUTH_E2E_ENV_NOT_AVAILABLE`; 0 DB write/network request |
| `npm.cmd run sync:verify-cron-auth` | PASS |
| `npm.cmd run sync:verify-config` | PASS |
| `npm.cmd run db:verify` | PASS |
| `npm.cmd run sync:verify-state` | PASS |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS |
| `npm audit` | 3 existing HIGH Prisma-chain findings |
| `npm test` | `TEST_COMMAND_NOT_AVAILABLE` |
| `git diff --check` | PASS; only normal LF/CRLF conversion warnings |

Build routes tetap terdaftar, termasuk dashboard, Auth.js API, sync API,
forgot/reset password, dan protected pages.

## Files Changed

Phase 19 mengubah/menambahkan:

- `src/lib/auth-security.ts`;
- `src/auth.ts`;
- `src/app/login/actions.ts`;
- `src/app/forgot-password/actions.ts`;
- `src/lib/password-reset.ts`;
- `next.config.ts`;
- `scripts/verify-auth-security.ts`;
- `scripts/verify-google-config.ts` (fixture placeholder non-secret);
- `docs/AUTH_IMPLEMENTATION.md`;
- file report ini.

`.env.local`, file credential, Prisma schema, database, Google Sheets source,
Laravel, dan production deployment tidak diubah.

## Manual Actions Required

1. Sediakan isolated auth E2E environment dan fixture admin khusus untuk
   `AUTH_TEST_BASE_URL`, `AUTH_TEST_ADMIN_EMAIL`, `AUTH_TEST_ADMIN_PASSWORD`,
   dan `AUTH_TEST_SECRET`. Jangan gunakan credential production untuk test.
2. Pastikan production `AUTH_URL` adalah origin HTTPS canonical.
3. Verifikasi Resend sender/domain dan DNS; gunakan `RESEND_FROM_EMAIL` yang
   benar-benar diverifikasi.
4. Simpan `RESEND_API_KEY`, `AUTH_SECRET`, `DATABASE_URL`, dan `CRON_SECRET`
   hanya di secret manager/deployment environment.
5. Setelah sender verified, jalankan satu controlled real-email smoke test.
6. Evaluasi distributed rate limiting untuk deployment Vercel.
7. Review dan test CSP sebelum mengaktifkannya.
8. Review Prisma/deepmerge-ts HIGH findings secara terpisah; jangan memakai
   `npm audit fix --force` tanpa compatibility approval.

## Known Limitations

- Live Auth E2E belum tersedia (`AUTH_E2E_ENV_NOT_AVAILABLE`).
- Valid login/logout/live cookie checks belum dijalankan pada isolated test
  environment.
- Real Resend delivery belum PASS karena sender/domain belum tervalidasi.
- Per-account reset throttle tersedia; distributed anti-abuse limiter belum ada.
- CSP belum diaktifkan.
- Auth.js masih beta `5.0.0-beta.32`.
- Prisma dependency chain memiliki tiga HIGH existing findings.
- Existing reset action menyimpan token hash sebelum delivery; perubahan rollback
  transactional policy memerlukan review terpisah agar behavior tidak berubah.

## Recommendations

Prioritas sebelum production:

1. Siapkan isolated auth E2E database/environment dan jalankan seluruh HTTP test
   matrix tanpa menyentuh database business/production.
2. Verifikasi sender/domain Resend, lalu ulangi satu smoke test.
3. Tambahkan rate-limit provider yang durable/distributed bila threat model dan
   volume production memerlukannya.
4. Review CSP dengan browser regression test.
5. Buat keputusan manual untuk upgrade Prisma/deepmerge-ts dan Auth.js beta.

## Final Gate

**PASS WITH REVIEW**

Tidak ditemukan authentication bypass, authorization bypass, IDOR yang
terbukti, reset-token vulnerability, secret exposure, atau build failure.
Namun live Auth E2E, Resend sender verification, CSP review, distributed rate
limiting, dan dependency HIGH findings masih membutuhkan konfigurasi/keputusan
manual. Phase berikutnya tidak dimulai otomatis.
