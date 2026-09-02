# Mail Provider Readiness

> HISTORICAL / DECOMMISSIONED (Phase 6C, 2026-09-02): This document records
> the former mail/recovery experiment. It is not an active runtime contract;
> do not provision its variables or routes.

Tanggal: 2026-09-01
Scope: audit dan integrasi forgot-password/reset-password tanpa mengirim email production.

## Current implementation

| Item             | Result                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Provider         | Resend SDK `6.25.0`, dipanggil melalui `src/lib/mail/index.ts`                              |
| Interface        | `deliverPasswordResetEmail(email, token)` pada `src/lib/password-reset.ts`                  |
| Dependency       | `resend@6.25.0` dengan transitive packages yang tercatat pada dependency audit              |
| Development mode | `AUTH_MAILER=log` membuat development reset link dicatat untuk pengujian lokal               |
| Production mode  | `AUTH_MAILER=resend` membutuhkan API key dan sender terverifikasi; `log` ditolak            |
| Sender           | `RESEND_FROM_EMAIL`, verification masih manual                                               |
| Reset URL        | AUTH_URL lalu fallback NEXT_PUBLIC_APP_URL; default lokal hanya untuk development          |
| Token            | Random token dikirim ke delivery interface; database menyimpan hash, bukan plaintext token |
| Expiry           | 60 menit; token dihapus setelah reset berhasil                                             |

## Required status

**PASS WITH REVIEW — RESEND_PROVIDER_AVAILABLE**

Password reset action tetap mengembalikan respons generik ketika delivery gagal. Ini mencegah email enumeration. Resend code integration tersedia, tetapi delivery production belum dapat dianggap selesai sampai sender/domain/API secret diprovision dan real smoke test dilakukan. Token tetap dapat tersimpan sebelum delivery provider berhasil karena behavior existing dipertahankan; retry/cleanup policy perlu keputusan terpisah.

## Production configuration needed

Pemilik sistem harus menyelesaikan konfigurasi Resend dan menentukan:

- Resend API transport;
- sender address dan verified domain;
- `RESEND_API_KEY` sebagai provider credential/secret;
- timeout, retry, dan failure policy;
- canonical AUTH_URL HTTPS;
- template reset link dan privacy/referrer policy;
- monitoring delivery tanpa mencatat token.

Nama variable `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, dan `RESEND_TEST_RECIPIENT`
telah ditambahkan sebagai placeholder aman. Membuat akun, API key, credential,
sender, DNS, atau mengubah mail architecture tetap **REQUIRES MANUAL APPROVAL**.

## Security

- Password reset response bersifat generic untuk user ada/tidak ada.
- Production tidak mencatat reset URL/token melalui mode log.
- Token tidak dicetak pada laporan ini.
- Tidak ada email production yang dikirim pada audit; mock fixture digunakan.
- Real smoke test masih `SKIP_REAL_EMAIL_TEST` karena recipient test eksplisit
  belum dikonfigurasi.

## Status

**PASS WITH REVIEW — RESEND_PROVIDER_AVAILABLE.** Login tidak bergantung pada
email provider. Forgot/reset code path siap diuji, tetapi activation production
menunggu sender/domain verification, secret provisioning, dan satu controlled
real-email smoke test.
