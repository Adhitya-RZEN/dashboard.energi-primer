# Production Environment Variables — Phase 10A

Tanggal: 2026-08-28  
Nilai aktual tidak ditulis.

| Variable                       | Required               | Sensitive        | Server/Client | Production                                                  |
| ------------------------------ | ---------------------- | ---------------- | ------------- | ----------------------------------------------------------- |
| DATABASE_URL                   | Yes                    | Yes              | Server        | Required; endpoint harus reachable Vercel                   |
| NEXT_PUBLIC_APP_NAME           | No                     | No               | Client-safe   | Recommended                                                 |
| NEXT_PUBLIC_APP_URL            | No/fallback            | No               | Client-safe   | Recommended sesuai domain                                   |
| AUTH_SECRET                    | Yes                    | Yes              | Server        | Required, random dan production-specific                    |
| AUTH_TRUST_HOST                | Yes for deployment     | No               | Server        | Required sesuai Auth.js/Vercel config                       |
| CRON_SECRET                    | Yes when cron enabled  | Yes              | Server        | Required untuk endpoint sync terjadwal                      |
| AUTH_URL                       | Yes for reset links    | No               | Server        | Required canonical HTTPS URL                                |
| AUTH_MAILER                    | Yes when reset active  | No               | Server        | `resend` untuk production; `log` hanya development            |
| RESEND_API_KEY                 | Yes when `resend`      | Yes              | Server        | Resend API key, Vercel secret                                 |
| RESEND_FROM_EMAIL              | Yes when `resend`      | Config-sensitive | Server        | Verified sender/domain Resend                                 |
| RESEND_TEST_RECIPIENT          | Test only              | No               | Server/script  | Controlled one-recipient smoke test, never required runtime  |
| MAIL_MAILER                    | Optional fallback      | No               | Server        | Legacy fallback only                                        |
| GOOGLE_SHEETS_CREDENTIALS_PATH | Alternative            | Config-sensitive | Server        | Local/file provisioning only                                |
| GOOGLE_SERVICE_ACCOUNT_EMAIL   | Alternative pair       | Yes              | Server        | Recommended Vercel secret configuration                     |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Alternative pair   | Yes              | Server        | Recommended Vercel secret configuration                     |
| GOOGLE_SHEETS_SPREADSHEET_ID   | Yes when Sheets active | Config-sensitive | Server        | Required                                                    |
| GOOGLE_SHEETS_CACHE_TTL        | No                     | No               | Server        | Optional, default 120 seconds                               |
| NODE_ENV                       | Framework              | No               | Server        | Managed by platform                                         |
| AUTH_TEST_BASE_URL             | Test only              | No               | Server/script | Never production                                            |
| AUTH_TEST_ADMIN_EMAIL          | Test only              | Yes              | Server/script | Never production                                            |
| AUTH_TEST_ADMIN_PASSWORD       | Test only              | Yes              | Server/script | Never production                                            |
| AUTH_TEST_SECRET               | Test only              | Yes              | Server/script | Never production                                            |

## Audit conclusions

- Tidak ada secret yang menggunakan prefix NEXT_PUBLIC_.
- Database, Auth.js, Google Sheets, mail configuration, password, dan test secret hanya direferensikan dari server/script.
- .env.local di-ignore dan tidak tracked.
- .env.example hanya memuat placeholder; tidak memuat secret aktual.
- credentials/ di-ignore dan tidak tracked.
- AUTH_URL telah ditambahkan ke .env.example karena dipakai reset URL.
- Resend hanya aktif saat `AUTH_MAILER=resend`; API key dan sender tidak
  pernah memakai prefix `NEXT_PUBLIC_`.
- GOOGLE_SHEETS_WORKSHEET dan GOOGLE_SHEETS_RANGE tidak digunakan karena adapter menentukan worksheet/range. Pasangan GOOGLE_SERVICE_ACCOUNT_EMAIL dan GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY kini mendukung deployment tanpa file credential.

## Manual configuration

Production tetap membutuhkan endpoint database, Auth secret, canonical URL,
Resend API key/sender yang telah diverifikasi, dan Google Sheets credential
provisioning. Jangan menyalin .env.local ke Vercel.

## Status

**PASS untuk inventory dan boundary; NEEDS REVIEW untuk provisioning nilai
production, sender/domain verification, dan smoke test email.**
