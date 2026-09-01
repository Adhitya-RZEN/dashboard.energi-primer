# Phase 22 — Vercel Preview Runbook

Runbook ini hanya untuk Preview. Jangan gunakan untuk production cutover,
schema migration, data migration, Google Sheets import, atau aktivasi cron
production.

## 1. Project setup

Dilakukan oleh operator yang memiliki akses Vercel:

1. Buat atau link project dari repository yang sesuai.
2. Set **Root Directory** ke `energiprimer-next`.
3. Pilih framework Next.js.
4. Install command: `npm ci`.
5. Build command: `npm run build`.
6. Pilih Node runtime yang kompatibel dan konsisten dengan hasil audit lokal
   (lokal menggunakan Node 24.17.0). Keputusan pin runtime harus dicatat.

CLI dan project linking tidak dijalankan oleh Phase 22 karena akses Vercel
belum tersedia pada workspace.

## 2. Preview environment

Buat variable **Preview** secara terpisah. Jangan menyalin `.env.local` dan
jangan memakai secret production.

Required categories:

- Supabase-backed `DATABASE_URL` dan `DASHBOARD_DATA_SOURCE=postgres`.
- `AUTH_SECRET`, `AUTH_TRUST_HOST`, dan `AUTH_URL` HTTPS yang menunjuk ke
  Preview URL.
- `NEXT_PUBLIC_APP_URL` yang menunjuk ke origin Preview.
- `CRON_SECRET` khusus Preview.
- Google service-account email/private-key pair dan spreadsheet ID untuk
  read-only test. Jangan konfigurasi path credential file lokal.
- `AUTH_MAILER`, `RESEND_API_KEY`, dan verified `RESEND_FROM_EMAIL` hanya jika
  real reset-email test sudah disetujui.

Jangan mencatat nilai variable, private key, token, password, atau connection
string lengkap pada evidence.

## 3. Preview deployment

Setelah configuration review selesai, operator dapat melakukan Preview deploy
melalui Vercel Dashboard atau CLI resmi yang telah di-login. Simpan hanya
deployment ID dan Preview URL yang sudah disanitasi sesuai kebijakan.

`vercel.json` berisi deklarasi cron untuk `/api/sync/google-sheets` satu kali
sehari pada `0 1 * * *`. Jangan mengirim request cron yang terotorisasi pada Phase 22 karena
request tersebut dapat memulai sinkronisasi. Jangan mengaktifkan cron
production.

## 4. Read-only smoke test

Dengan Preview URL, jalankan checklist berikut secara manual:

1. Buka `/login`, `/forgot-password`, dan setiap dashboard route.
2. Pastikan unauthenticated request ditolak/redirect.
3. Login hanya dengan akun uji terisolasi dan pastikan role authorization
   diterapkan server-side.
4. Periksa Overview, Biomassa, Batubara, Solar, Stok, dan Target.
5. Uji filter periode, KPI, chart tooltip, legend, point/bar selection, dan
   touch interaction.
6. Verifikasi query dashboard membaca Supabase dan tidak mengarah ke local
   loopback.
7. Bila Google test disetujui, baca satu worksheet/range secara read-only.
8. Uji cron hanya dengan request tanpa/wrong bearer untuk memastikan 401/403
   atau response penolakan yang sesuai. Jangan uji bearer yang benar.
9. Jangan menjalankan import, sync, `POST` authorized cron, atau operasi DML.
10. Periksa log dan response agar tidak memuat secret, token, password, atau
    stack trace sensitif.

## 5. Resend gate

Real email hanya boleh diuji setelah sender/domain Resend verified dan satu
recipient Preview disetujui. Gunakan mailbox uji, bukan mailbox production.
Jika gate belum terpenuhi, catat `RESEND_E2E=BLOCKED` dan gunakan fixture/mock
verification yang sudah ada.

## 6. Stop conditions

Hentikan Preview test jika ditemukan:

- response 5xx atau stack trace;
- redirect/auth/authorization yang tidak sesuai;
- data source bukan Supabase Preview;
- perubahan row count atau operasi write tidak direncanakan;
- cron authorized terpanggil;
- secret/token/password/private key pada response atau log;
- KPI/chart/filter mismatch;
- dependency/build error pada deployment.

## 7. Rollback Preview

Jika Preview bermasalah, operator dapat menonaktifkan atau menghapus deployment
Preview dari Vercel dan menghapus Preview environment variables. Tindakan ini
tidak boleh menyentuh production deployment, Supabase schema/data, atau
`.env.local`.

Catat deployment ID, waktu, gejala, dan langkah rollback tanpa mencatat
credential atau URL yang mengandung token.

## 8. Handoff back to Phase 22

Setelah Preview URL tersedia, ulangi validasi dan lengkapi:

- deployment ID/status;
- route smoke matrix;
- auth E2E result;
- Supabase read-only runtime result;
- chart/filter result;
- Google read-only result;
- Resend result atau `RESEND_E2E=BLOCKED`;
- sanitized logs/Web Vitals;
- dependency finding disposition.

Production cutover tetap memerlukan approval dan phase terpisah.
