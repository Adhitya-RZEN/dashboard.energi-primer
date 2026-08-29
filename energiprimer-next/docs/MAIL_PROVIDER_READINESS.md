# Mail Provider Readiness

Tanggal: 2026-08-28  
Scope: audit forgot-password/reset-password tanpa mengirim email production.

## Current implementation

| Item             | Result                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Provider         | Belum ada SMTP atau transactional email provider                                           |
| Interface        | deliverPasswordResetEmail(email, token) pada src/lib/password-reset.ts                     |
| Dependency       | Tidak ada nodemailer, SDK email, atau API mail client pada package.json                    |
| Development mode | AUTH_MAILER=log membuat development reset link dicatat untuk pengujian lokal               |
| Production mode  | Mode log ditolak; fungsi melempar error dan action mengembalikan pesan generik             |
| Sender           | Belum dikonfigurasi                                                                        |
| Reset URL        | AUTH_URL lalu fallback NEXT_PUBLIC_APP_URL; default lokal hanya untuk development          |
| Token            | Random token dikirim ke delivery interface; database menyimpan hash, bukan plaintext token |
| Expiry           | 60 menit; token dihapus setelah reset berhasil                                             |

## Required status

**MAIL_PROVIDER_REQUIRED**

Password reset action saat ini tetap mengembalikan respons generik ketika delivery gagal. Ini mencegah email enumeration, tetapi bukan delivery production yang selesai. Token dapat tersimpan sebelum delivery provider berhasil sehingga operator perlu menentukan retry/cleanup behavior saat provider sudah tersedia.

## Production configuration needed

Pemilik sistem harus memilih provider dan menentukan:

- SMTP/API transport;
- sender address dan verified domain;
- provider credential/secret;
- timeout, retry, dan failure policy;
- canonical AUTH_URL HTTPS;
- template reset link dan privacy/referrer policy;
- monitoring delivery tanpa mencatat token.

Nama variable provider belum ditambahkan karena provider belum dipilih. Membuat akun, API key, credential, atau mengubah mail architecture adalah **REQUIRES MANUAL APPROVAL**.

## Security

- Password reset response bersifat generic untuk user ada/tidak ada.
- Production tidak mencatat reset URL/token melalui mode log.
- Token tidak dicetak pada laporan ini.
- Tidak ada email production yang dikirim pada audit.

## Status

**BLOCKED — MAIL_PROVIDER_REQUIRED.** Login tidak bergantung pada email provider, tetapi forgot/reset password belum dapat dinyatakan production-ready.
