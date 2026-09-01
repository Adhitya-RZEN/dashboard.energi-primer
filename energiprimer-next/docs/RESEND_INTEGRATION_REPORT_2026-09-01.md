# Resend Integration Report

Tanggal: 1 September 2026  
Project: `energiprimer-next`  
Scope: Phase 18 — Resend Integration & Auth Mail.

## Executive Summary

Resend berhasil diintegrasikan sebagai delivery adapter server-side untuk flow
forgot-password yang sudah ada. Auth.js tetap memakai Credentials Provider,
session JWT, role authorization, password hashing, token expiry, dan route yang
sama. Tidak ada perubahan database, business data, sync registry, Google Sheets,
Laravel, Supabase, atau deployment.

Status code integration: **PASS**. Status Phase 18: **PASS WITH REVIEW** karena
sender/domain production dan real email smoke test masih memerlukan konfigurasi
manual user.

## Current Auth Architecture

- Auth.js `5.0.0-beta.32`.
- `Credentials` provider; Email Provider dan magic-link tidak digunakan.
- JWT session strategy dengan server-side role check `admin`.
- Password reset menggunakan existing Server Action dan model
  `password_reset_tokens`.
- Tidak ada email verification flow yang aktif.

Audit finding sebelum integrasi: `EMAIL_PROVIDER_NOT_CURRENTLY_CONFIGURED`.
Finding tersebut diselesaikan untuk delivery reset password tanpa mengganti
mekanisme login.

## Email Requirement

Email provider diperlukan untuk mengirim reset password. Resend tidak digunakan
untuk login, verification email, notification loop, atau email yang terpicu
hanya karena halaman dibuka.

Flow yang diaktifkan:

```text
requestPasswordReset Server Action
  → deliverPasswordResetEmail
  → sendEmail server-only
  → Resend emails.send
```

Mode development `AUTH_MAILER=log` tetap tersedia untuk mempertahankan behavior
Laravel lokal. Mode Resend harus dipilih secara eksplisit dengan
`AUTH_MAILER=resend`.

## Resend Architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Mail service | `src/lib/mail/index.ts` | Config, validation, lazy Resend client, timeout, idempotency, error taxonomy, safe logging |
| Password-reset adapter | `src/lib/password-reset.ts` | Existing token policy, reset URL, text/HTML template, explicit mail mode |
| Existing trigger | `src/app/forgot-password/actions.ts` | Existing admin lookup, throttle, token persistence, generic response |
| Fixture | `scripts/verify-resend-mail.ts` | Mock-only failure/success and security-oriented mail tests |

Resend SDK dipanggil tanpa fetch tambahan dari Client Component. Recipient pada
log dimasking, message ID provider dicatat hanya ketika delivery diterima, dan
tidak ada automatic retry loop. Timeout service dibatasi 10 detik.

## Files Changed

- `.env.example` — menambahkan placeholder `RESEND_*`.
- `package.json` — menambahkan script `mail:verify` dan dependency Resend.
- `package-lock.json` — lockfile untuk `resend@6.25.0` dan transitive packages.
- `src/lib/mail/index.ts` — mail service server-only.
- `src/lib/password-reset.ts` — adapter delivery Resend, template, URL safety,
  dan idempotency key.
- `scripts/verify-resend-mail.ts` — mock/fixture verification.
- `docs/RESEND_INTEGRATION.md` — konfigurasi dan manual setup.
- `docs/RESEND_INTEGRATION_REPORT_2026-09-01.md` — laporan Phase 18.
- `docs/MAIL_PROVIDER_READINESS.md` — status provider diperbarui.
- `docs/ENVIRONMENT_VARIABLES.md` — inventory environment diperbarui.
- `docs/PRODUCTION_ENVIRONMENT.md` — konfigurasi Resend production diperbarui.
- `docs/AUTH_IMPLEMENTATION.md` — mapping delivery reset diperbarui.
- `docs/VERCEL_DEPLOYMENT_READINESS.md` dan `docs/VERCEL_CONFIGURATION.md` —
  kebutuhan Resend Vercel diperbarui.
- `docs/DEPENDENCY_AUDIT.md` — dependency dan audit Resend diperbarui.

`.env.local`, credential file, Laravel source, Prisma schema, dan database tidak
diubah.

## Dependency Changes

| Package | Version | Result |
| --- | ---: | --- |
| `resend` | `6.25.0` | Added as official server-side SDK |
| `postal-mime` | `2.7.5` | Resend transitive dependency |
| `standardwebhooks` | `1.0.0` | Resend transitive dependency |

`npm audit --omit=dev` tetap melaporkan **3 HIGH** pada dependency chain Prisma
(`deepmerge-ts` / `@prisma/config` / `prisma`). Tidak ada `npm audit fix --force`
dan tidak ada perubahan Prisma. Tidak ada finding baru yang teridentifikasi
dari Resend.

## Environment Variables

| Variable | Use | Boundary | Status |
| --- | --- | --- | --- |
| `AUTH_MAILER` | Select `log` or `resend` | Server | Documented |
| `RESEND_API_KEY` | Resend API credential | Server | Placeholder documented; value never reported |
| `RESEND_FROM_EMAIL` | Verified sender | Server | Placeholder documented; manual verification required |
| `RESEND_TEST_RECIPIENT` | One-recipient real smoke test | Server/script | Optional, test-only |
| `AUTH_URL` | Canonical reset URL | Server | Existing configuration path retained |

No sensitive variable uses `NEXT_PUBLIC_`. `.env.local` remains ignored and was
not modified.

## Email Flow

Password reset behavior remains:

- admin lookup is case-insensitive;
- response is generic for known/unknown email;
- request throttle is 60 seconds;
- token is random and only its bcrypt hash is stored;
- token expiry is 60 minutes;
- Resend delivery uses text and HTML reset template;
- idempotency key is derived from a SHA-256 digest of the in-memory token;
- password/reset database behavior remains the existing implementation.

No email is sent on page access, login, dashboard render, or Google Sheets sync.

## Auth.js Integration

Auth.js provider, callbacks, session strategy, role checks, adapter decision,
password hashing, and authorization routes were not replaced or changed. Resend
is called below the existing password-reset Server Action only. Credentials
login remains independent of Resend availability.

## Error Handling

The service maps provider and runtime failures to safe categories:

`RESEND_CONFIG_MISSING`, `RESEND_CONFIG_INVALID`, `RESEND_AUTH`,
`RESEND_RATE_LIMIT`, `RESEND_NETWORK`, `RESEND_VALIDATION`,
`RESEND_PROVIDER`, and `RESEND_UNKNOWN`.

The public forgot-password action returns the existing generic response and
does not expose provider details. The service does not log API keys, tokens,
private credentials, full provider errors, or unmasked recipients.

## Security

| Check | Result |
| --- | --- |
| Resend SDK server-only | PASS — `src/lib/mail/index.ts` imports `server-only` |
| API key in client props/API response | PASS — no such path |
| `NEXT_PUBLIC_RESEND_API_KEY` | PASS — not used |
| API key in logs/report | PASS — values are never printed |
| Token/password in Resend logs | PASS — provider logs contain only safe event fields |
| Auth bypass through email | PASS — Resend does not participate in authorization |
| Sender/URL validation | PASS — invalid sender and non-HTTPS production URL rejected |
| Automatic duplicate-prone retry | PASS — no retry loop; idempotency key supplied |

Static bundle scan after build found no Resend API key environment name or
private-key marker in public client chunks. The SDK remains on the server path.

## Manual Configuration

### MANUAL ACTION REQUIRED

User/operator must:

1. Create or access a Resend account.
2. Verify a sender identity or sending domain.
3. Apply DNS records provided by Resend when domain verification requires it.
4. Create a Resend API key and store it only in `.env.local`/Vercel secret
   configuration.
5. Set `AUTH_MAILER=resend` and the verified `RESEND_FROM_EMAIL`.
6. Set canonical HTTPS `AUTH_URL` for production.
7. Optionally set one `RESEND_TEST_RECIPIENT` for a controlled smoke test.
8. Run the real smoke test once after configuration.

Codex tidak membuat akun, mengubah DNS, meminta API key melalui chat, atau
mengubah `.env.local`.

## Local Test

Command:

```text
npm run mail:verify
```

Result: **PASS**. Mock fixture mencakup missing configuration, invalid sender,
provider success, idempotency forwarding, auth error, rate limit, network
failure, timeout, dan safe configuration status. Tidak ada email yang dikirim.

## Real Email Smoke Test

Controlled smoke test dijalankan setelah konfigurasi lokal tersedia:

```text
npm run mail:verify -- --real
```

Hasil aktual: **NOT SENT / PROVIDER VALIDATION**. Percobaan dengan akses jaringan
berhasil mencapai Resend, tetapi provider terbaru mengembalikan HTTP 422 karena
field `from` tidak mengikuti format `email@example.com` atau `Name
<email@example.com>`. Percobaan sebelumnya juga pernah ditolak HTTP 403 karena
domain sender belum diverifikasi. Tidak ada email yang terkirim. Gunakan alamat
sender valid dari domain/sender identity yang telah diverifikasi, lalu jalankan
ulang command yang sama. Tidak ada mass send atau loop.

## Authentication Regression

- Static Auth.js provider/callback/session/authorization audit: **PASS**.
- Existing Credentials login flow: **unchanged**.
- `auth:verify` live valid-login test: **NOT RUN** pada database existing karena
  harness memperbarui `users.last_login_at`; disposable auth environment tetap
  dibutuhkan untuk E2E (`AUTH_E2E_ENV_REQUIRED`).
- Resend tidak bypass authorization: **PASS**.

## Google Sheets Regression

- Existing Google Sheets client/parser/importer/sync registry code: unchanged.
- Read-only registry/config/incremental/retry/schema checks: **PASS**.
- Production sync write: **NOT RUN**.

## Database Regression

- Database writes during Phase 18: **0**.
- Prisma schema/migrations/db push: **unchanged/not run**.
- Business data import/update/delete: **0**.
- Existing verified record baseline remains 2.409; duplicate/orphan baseline 0.
- Unit baseline remains Unit 1, Unit 2, Unit 3.
- Biomass target remains 70.020 ton.

## Build Validation

| Check | Result |
| --- | --- |
| `npm ls resend` | PASS — `resend@6.25.0` |
| `npm audit --omit=dev` | 3 HIGH existing Prisma-chain findings; no force fix |
| `npm run mail:verify` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm test` | `TEST_COMMAND_NOT_AVAILABLE` |

Build output contained only existing Node experimental loader/module-type
warnings; no compile or production build failure.

## Known Limitations

1. Resend account, sender/domain verification, DNS, and Vercel secret
   provisioning are manual.
2. Real email delivery masih belum tervalidasi karena Resend menolak sender
   dengan HTTP 422 (format `from` invalid); recipient dan API key tidak
   ditampilkan atau dicatat.
3. Auth.js still uses beta `5.0.0-beta.32`; upgrade requires separate approval.
4. Existing password-reset action persists the hashed reset token before
   delivery; failure policy remains unchanged to preserve auth behavior and
   should be reviewed separately if transactional rollback is desired.
5. Existing Prisma dependency audit has three HIGH findings requiring a
   separate manual compatibility decision.

## Production Checklist

- [ ] Resend account and sender/domain verified.
- [ ] DNS records applied if required.
- [ ] `RESEND_API_KEY` stored as a server-side deployment secret.
- [ ] `RESEND_FROM_EMAIL` matches verified sender.
- [ ] `AUTH_MAILER=resend` configured for production.
- [ ] Canonical HTTPS `AUTH_URL` configured.
- [ ] One controlled real-email smoke test passed.
- [ ] Vercel database/Google/Auth prerequisites resolved separately.
- [ ] Prisma audit findings reviewed separately.

## Final Status

**PASS WITH REVIEW**

Code integration, server/client boundary, error handling, mock tests, existing
auth architecture preservation, database safety, lint, TypeScript, and build
validation pass. Production activation remains subject to manual Resend
sender/API configuration and one controlled real-email smoke test. Phase 19 is
not started.
