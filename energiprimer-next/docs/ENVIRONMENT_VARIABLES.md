# Environment Variables — Phase 10

## Scope

Dokumen ini mencatat environment variable yang direferensikan oleh source
Next.js, Prisma, authentication, Google Sheets, dan script verifikasi.
Nilai aktual sengaja tidak ditulis. File `.env.local` tetap bersifat lokal dan
tidak boleh di-commit.

## Inventory

| Variable                         | Required                         | Server/Client | Sensitive               | Used By                                                            | Production Required                       |
| -------------------------------- | -------------------------------- | ------------- | ----------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| `DATABASE_URL`                   | Yes                              | Server        | Yes                     | Prisma schema, `src/lib/prisma.ts`, data services, `verify-db.mjs` | Yes                                       |
| `NEXT_PUBLIC_APP_NAME`           | Optional                         | Client-safe   | No                      | `src/lib/env.ts`, metadata, auth shell                             | Optional                                  |
| `NEXT_PUBLIC_APP_URL`            | Optional                         | Client-safe   | No                      | `src/lib/env.ts`, reset URL fallback                               | Recommended                               |
| `AUTH_SECRET`                    | Yes                              | Server        | Yes                     | Auth.js session/JWT signing                                        | Yes                                       |
| `AUTH_TRUST_HOST`                | Yes for deployment configuration | Server        | No                      | Auth.js host trust                                                 | Yes                                       |
| `CRON_SECRET`                    | Yes when scheduled sync is enabled | Server      | Yes                     | Vercel Cron synchronization endpoint                               | Yes when scheduled sync is enabled        |
| `AUTH_MAILER`                    | Optional in development          | Server        | No                      | Password-reset delivery mode                                       | Yes, after a real provider is implemented |
| `AUTH_URL`                       | Recommended                      | Server        | No                      | Canonical password-reset URL                                       | Yes for production reset links            |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | Yes when Sheets is active        | Server        | Yes/config path         | Google Sheets service                                              | Yes when Sheets is active                 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`   | Alternative with private key    | Server        | Yes                     | Google Sheets service                                              | Recommended for Vercel when no file mount |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Alternative with email       | Server        | Yes                     | Google Sheets service                                              | Recommended for Vercel when no file mount |
| `GOOGLE_SHEETS_SPREADSHEET_ID`   | Yes when Sheets is active        | Server        | Configuration-sensitive | Google Sheets service                                              | Yes when Sheets is active                 |
| `GOOGLE_SHEETS_CACHE_TTL`        | Optional                         | Server        | No                      | Google Sheets in-memory range cache                                | Optional; defaults to `120`               |
| `MAIL_MAILER`                    | Optional fallback                | Server        | No                      | Legacy-compatible fallback in password reset helper                | No; prefer `AUTH_MAILER`                  |
| `NODE_ENV`                       | Framework-provided               | Server        | No                      | Next.js, cookie `secure` behavior, logging                         | Managed by platform                       |
| `AUTH_TEST_BASE_URL`             | Test-only                        | Server/script | No                      | `scripts/verify-auth.mjs`                                          | No                                        |
| `AUTH_TEST_ADMIN_EMAIL`          | Test-only                        | Server/script | Yes                     | `scripts/verify-auth.mjs`                                          | No                                        |
| `AUTH_TEST_ADMIN_PASSWORD`       | Test-only                        | Server/script | Yes                     | `scripts/verify-auth.mjs`                                          | No                                        |
| `AUTH_TEST_SECRET`               | Test-only                        | Server/script | Yes                     | `scripts/verify-auth.mjs`                                          | No                                        |

## Configuration decisions

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` dapat
  digunakan berpasangan sebagai alternatif serverless terhadap file JSON.
  `GOOGLE_SHEETS_CREDENTIALS_PATH` tetap didukung untuk local development.
  `GOOGLE_SHEETS_WORKSHEET` dan `GOOGLE_SHEETS_RANGE` tidak digunakan karena
  worksheet/range ditentukan oleh adapter dan registry.
- `AUTH_MAILER=log` hanya untuk development. Implementasi saat ini belum
  memiliki SMTP/transactional provider untuk production.
- `AUTH_URL` dipakai agar reset link tidak bergantung pada URL preview atau
  URL lokal. `NEXT_PUBLIC_APP_URL` hanya fallback non-secret.
- `DATABASE_URL` pada environment lokal menunjuk ke host loopback. Nilai
  production harus diganti dengan PostgreSQL yang dapat dijangkau Vercel dan
  tidak ditulis di repository.

## Security checks

- Tidak ada secret yang menggunakan prefix `NEXT_PUBLIC_`.
- `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, Google configuration, password, dan token
  hanya direferensikan pada server atau script lokal.
- `.env.local` tetap di-ignore.
- `.env.example` sekarang di-unignore agar dapat dicatat di repository, tetapi
  hanya berisi placeholder; tidak berisi secret aktual.
- Direktori `credentials/` tetap di-ignore.
- `AUTH_SECRET` pada `.env.example` telah diganti placeholder non-secret pada
  Phase 10.
- Jangan mengisi environment test dengan credential production.

## Deployment gaps

Vercel masih membutuhkan konfigurasi manual untuk `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_TRUST_HOST`, `AUTH_URL`, dan konfigurasi Google Sheets. Credential file
lokal tidak otomatis tersedia pada deployment. Detailnya ada di
[`GOOGLE_SHEETS_PRODUCTION.md`](./GOOGLE_SHEETS_PRODUCTION.md) dan
[`VERCEL_DEPLOYMENT_READINESS.md`](./VERCEL_DEPLOYMENT_READINESS.md).

## Status

**PASS untuk inventory dan source boundary; NEEDS REVIEW untuk nilai production
dan delivery secret/provider.**
