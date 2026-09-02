# Resend Integration

> HISTORICAL / DECOMMISSIONED (Phase 6C, 2026-09-02): Resend and the related
> account-recovery flow were removed. The content below is retained for audit
> history only and must not be used for provisioning.

Tanggal: 1 September 2026  
Scope: integrasi delivery email password reset pada Next.js tanpa mengganti
Auth.js Credentials flow.

## Purpose

Resend dipakai sebagai transactional mail provider untuk mengirim satu email
reset password ketika Server Action `requestPasswordReset` menerima permintaan
valid dari user. Membuka halaman, login, logout, atau menjalankan dashboard tidak
memicu email.

## Current Auth Architecture

- Auth.js `5.0.0-beta.32` menggunakan `Credentials` provider.
- Session menggunakan JWT, bukan Email Provider atau magic link.
- Authorization tetap memerlukan `role = admin` di server.
- Tidak ada email verification flow yang aktif.
- Password reset tetap menggunakan token random, hash bcrypt pada database,
  expiry 60 menit, dan throttle request 60 detik.
- `src/lib/password-reset.ts` tetap menjadi boundary flow password reset;
  Resend hanya menggantikan delivery adapter.

Audit result: `EMAIL_PROVIDER_NOT_CURRENTLY_CONFIGURED` berlaku untuk kondisi
sebelum Phase 18. Setelah Phase 18, provider Resend tersedia tetapi harus
diaktifkan eksplisit dengan `AUTH_MAILER=resend`.

## Email Flow

```text
/forgot-password
      ↓
requestPasswordReset Server Action
      ↓
admin lookup + generic response + existing token persistence
      ↓
deliverPasswordResetEmail()
      ├── AUTH_MAILER=log (development only)
      └── AUTH_MAILER=resend
              ↓
        server-only sendEmail()
              ↓
        Resend emails.send()
```

Flow existing tidak diubah menjadi Email Provider. Reset token plaintext hanya
berada di memory untuk membentuk link delivery; database hanya menyimpan hash.
Password, API key, session secret, dan database credential tidak pernah masuk ke
isi email.

## Resend Architecture

Service berada pada `src/lib/mail/index.ts` dan memiliki tanggung jawab:

1. membaca mode `AUTH_MAILER`/fallback `MAIL_MAILER`;
2. memeriksa keberadaan API key dan sender tanpa mengembalikan nilainya;
3. memvalidasi recipient, sender, subject, body, dan maksimal 50 recipient;
4. membuat client official `resend` secara lazy di server;
5. mengirim dengan timeout 10 detik dan idempotency key bila tersedia;
6. mengklasifikasikan error menjadi config, auth, rate limit, network,
   validation, provider, atau unknown;
7. mencatat event server dengan recipient masked dan provider message ID saja.

Template reset password dan URL action tetap berada pada
`src/lib/password-reset.ts`. `AUTH_URL` atau `NEXT_PUBLIC_APP_URL` digunakan
sebagai base URL; production menolak URL yang kosong atau bukan HTTPS.

## Environment Variables

| Variable | Required | Boundary | Keterangan |
| --- | --- | --- | --- |
| `AUTH_MAILER` | Saat reset delivery aktif | Server | `log` untuk development atau `resend` untuk provider Resend |
| `RESEND_API_KEY` | Saat `AUTH_MAILER=resend` | Server | API key Resend; tidak boleh memakai `NEXT_PUBLIC_` |
| `RESEND_FROM_EMAIL` | Saat `AUTH_MAILER=resend` | Server | Sender/domain yang sudah diverifikasi di Resend |
| `RESEND_TEST_RECIPIENT` | Test-only | Server/script | Satu recipient untuk smoke test eksplisit; tidak dipakai runtime |
| `AUTH_URL` | Production reset link | Server | Canonical HTTPS application URL |
| `NEXT_PUBLIC_APP_URL` | Fallback | Client-safe | Fallback URL non-secret yang sudah digunakan project |

Nilai aktual tidak ditulis di sini. `.env.example` hanya berisi placeholder;
`.env.local` tidak diubah atau di-commit.

## Local Setup

Untuk development tanpa pengiriman email:

```env
AUTH_MAILER=log
```

Untuk mengaktifkan delivery Resend pada environment lokal, user mengisi sendiri
secret/configuration pada `.env.local`:

```env
AUTH_MAILER=resend
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=<verified sender>
AUTH_URL=http://localhost:3000
```

Jangan menyalin nilai tersebut ke chat, source code, `.env.example`, report,
atau Git.

## Domain/Sender Requirement

`RESEND_FROM_EMAIL` harus berasal dari sender identity atau domain yang
diverifikasi pada akun Resend. Domain, alamat sender, dan DNS record tidak
diasumsikan oleh implementasi. Jika domain belum diverifikasi, statusnya
`SENDER_DOMAIN_SETUP_REQUIRED` dan user harus menyelesaikan konfigurasi manual.

## API Key Handling

- API key dibaca hanya pada `src/lib/mail/index.ts` yang memiliki
  `import "server-only"`.
- Tidak ada `NEXT_PUBLIC_RESEND_API_KEY`.
- API key tidak ditempatkan pada props, serialized data, API response, log, atau
  report.
- Client Component tidak mengimpor mail service; pemanggilan terjadi melalui
  Server Action.

## Server-Side Security

Resend SDK, environment secret, password-reset token, dan provider response
berada di server boundary. Response forgot-password tetap generik untuk user
yang dikenal maupun tidak dikenal. Log hanya berisi event, kategori error,
recipient masked, timestamp dari log system, dan message ID provider ketika
delivery diterima.

Tidak ada database, sync registry, Google Sheets, Supabase, Laravel, atau
authentication schema yang diubah pada Phase 18.

## Error Handling

Public action tidak membocorkan detail provider dan tetap mengembalikan pesan
generic. Service internal menggunakan kategori berikut:

| Code | Kondisi |
| --- | --- |
| `RESEND_CONFIG_MISSING` | API key/sender/URL atau mode provider belum tersedia |
| `RESEND_CONFIG_INVALID` | Mode atau konfigurasi sender/URL tidak valid |
| `RESEND_AUTH` | API key/permission provider ditolak |
| `RESEND_RATE_LIMIT` | Rate limit atau quota provider tercapai |
| `RESEND_NETWORK` | Network failure atau timeout 10 detik |
| `RESEND_VALIDATION` | Recipient, sender, subject, atau body invalid |
| `RESEND_PROVIDER` | Provider/API 5xx atau response tidak valid |
| `RESEND_UNKNOWN` | Error yang tidak dapat dikategorikan |

Tidak ada automatic retry loop. Idempotency key digunakan pada reset delivery
untuk mencegah pengiriman ganda ketika request yang sama diulang oleh provider.

## Testing

Fixture server-side dijalankan dengan:

```bash
npm run mail:verify
```

Fixture tidak mengirim email dan mencakup missing config, invalid sender,
success mock, idempotency key, auth error, rate limit, network failure,
timeout, dan safe configuration status.

Real smoke test hanya dapat dijalankan secara eksplisit:

```bash
npm run mail:verify -- --real
```

Command tersebut hanya mengirim satu email jika `AUTH_MAILER=resend`, API key,
sender, dan `RESEND_TEST_RECIPIENT` tersedia. Tanpa recipient tersebut test
menjadi `SKIP_REAL_EMAIL_TEST`.

## Vercel Environment Setup

Pada Vercel, tambahkan sebagai Environment Variables server-side:

- `AUTH_MAILER=resend`;
- `RESEND_API_KEY`;
- `RESEND_FROM_EMAIL`;
- `AUTH_URL` canonical HTTPS;
- environment variables Auth.js dan database yang sudah didokumentasikan.

Jangan mengunggah `.env.local` atau file credential. Pastikan sender/domain
Resend sudah diverifikasi sebelum preview smoke test.

## Production Checklist

- [ ] Resend account tersedia.
- [ ] Sending domain atau sender identity diverifikasi.
- [ ] DNS record Resend diterapkan jika diminta.
- [ ] API key dibuat dan disimpan hanya sebagai secret environment.
- [ ] `AUTH_MAILER=resend` diset pada environment target.
- [ ] `RESEND_FROM_EMAIL` cocok dengan sender terverifikasi.
- [ ] `AUTH_URL` menggunakan HTTPS production.
- [ ] Satu controlled smoke test ke mailbox non-production berhasil.
- [ ] Tidak ada API key pada source, client bundle, log, atau dokumentasi.
- [ ] Error provider dan rate limit dipantau tanpa mencatat token reset.

## Troubleshooting

- `RESEND_CONFIG_MISSING`: periksa mode, API key, sender, dan URL pada
  environment server; jangan menaruh nilai pada source code.
- `RESEND_CONFIG_INVALID`: periksa format sender dan pastikan URL production
  menggunakan HTTPS.
- `RESEND_AUTH`: buat/rotasi API key melalui akun Resend secara manual; jangan
  mengirim key melalui chat.
- `RESEND_VALIDATION`: pastikan sender sudah diverifikasi dan recipient valid.
- `RESEND_RATE_LIMIT`: hentikan retry manual berulang dan periksa quota.
- `RESEND_NETWORK`: periksa konektivitas/timeout; tidak ada retry loop otomatis.
- Email tidak masuk: periksa status provider, domain verification, spam folder,
  dan message ID server log yang sudah dimasking.

## Status

**PASS WITH REVIEW** — code integration, server boundary, mock fixture, dan
build telah disiapkan. Real email smoke test, sender/domain verification, dan
provisioning Vercel tetap membutuhkan tindakan manual user.
