# Vercel Deployment Readiness

Tanggal audit: 2026-08-28  
Target: Vercel, tanpa deployment pada Phase 10.

## 1. Framework dan build

| Item           | Konfigurasi/temuan                                                                                                  | Status                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Framework      | Next.js 16.3.3, App Router, TypeScript                                                                              | PASS                        |
| Root directory | Repository memiliki `backend` dan `energiprimer-next`; Vercel Root Directory harus diarahkan ke `energiprimer-next` | MANUAL CONFIGURATION        |
| Install        | `package-lock.json` tersedia; gunakan `npm install`/deteksi default Vercel                                          | PASS                        |
| Build          | `npm run build`                                                                                                     | PASS pada local environment |
| Lint/typecheck | `npm run lint`, `npx tsc --noEmit`                                                                                  | PASS pada local environment |
| Node           | Package Next mensyaratkan Node >=20.9.0; local audit memakai Node 24.x                                              | MANUAL PINNING              |
| `vercel.json`  | Tidak diperlukan saat ini; tidak ada file tersebut                                                                  | PASS                        |

Vercel mendukung Node.js 20.x, 22.x, dan 24.x; versi project sebaiknya dipilih dan dipin secara eksplisit pada Project Settings atau `engines.node` setelah operator menyetujui target runtime. Referensi resmi: [Vercel Node.js runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 2. Environment yang diperlukan

Daftar lengkap ada pada [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md). Minimal production configuration harus menyediakan:

- `DATABASE_URL` untuk PostgreSQL existing yang dapat dijangkau dari Vercel;
- `AUTH_SECRET`, `AUTH_TRUST_HOST`, dan `AUTH_URL`;
- `NEXT_PUBLIC_APP_NAME` dan `NEXT_PUBLIC_APP_URL` sesuai domain;
- `AUTH_MAILER=resend`, `RESEND_API_KEY`, dan `RESEND_FROM_EMAIL` dari sender/domain yang diverifikasi;
- Google Sheets credential configuration dan spreadsheet ID server-side.

Nilai secret tidak dicantumkan pada dokumentasi.

## 3. Prisma dan PostgreSQL

`@prisma/client` memiliki postinstall generation pada install dependency. Tidak diperlukan migration pada build. Prisma harus berjalan terhadap endpoint PostgreSQL production yang reachable dan sesuai connection limit.

Konfigurasi local saat ini bersifat loopback sehingga **tidak siap langsung** untuk Vercel. Detail blocker dan kebutuhan pooler ada di [`DATABASE_PRODUCTION_READINESS.md`](./DATABASE_PRODUCTION_READINESS.md).

## 4. Google Sheets

Service saat ini membutuhkan path credential file lokal. File ignored tersebut tidak boleh di-commit dan tidak otomatis tersedia di Vercel. Production membutuhkan secret provisioning atau refactor konfigurasi yang disetujui manual.

Detail ada di [`GOOGLE_SHEETS_PRODUCTION.md`](./GOOGLE_SHEETS_PRODUCTION.md).

## 5. Authentication

Auth.js Credentials berjalan server-side dengan bcrypt dan JWT. Protected layout melakukan pemeriksaan session/role di server. Reset password menggunakan mail service server-side; `AUTH_MAILER=log` hanya untuk development, sedangkan production harus memakai Resend dengan sender terverifikasi.

Risiko yang belum selesai:

- Auth.js masih berada pada beta release dan perlu regression test/keputusan upgrade manual.
- Sender/domain Resend dan controlled real-email smoke test belum diverifikasi pada environment production.
- Kebijakan role selain admin dan cutover session JWT versus tabel session legacy perlu konfirmasi.

## 6. Runtime, filesystem, dan background work

- `proxy.ts` digunakan dengan runtime Node yang kompatibel dengan Next 16.
- Tidak ditemukan persistent upload/storage yang dibutuhkan aplikasi target.
- Tidak ditemukan queue worker atau scheduled job aktif pada target.
- File credential lokal tidak boleh dijadikan persistent runtime dependency.
- Static assets berada di `public/`.

Vercel Functions memiliki filesystem read-only; hanya directory temporary `/tmp` yang dapat dipakai untuk kebutuhan sementara dan bukan persistent storage. Referensi resmi: [Vercel Functions runtimes](https://vercel.com/docs/functions/runtimes).

## 7. Known limitations dan manual configuration

Sebelum deployment:

1. Set Vercel Root Directory ke `energiprimer-next`.
2. Pilih/pin Node runtime yang kompatibel.
3. Sediakan `DATABASE_URL` production yang reachable, pooling, TLS, dan firewall yang benar.
4. Sediakan Google Sheets credential secara aman dan pastikan service account memiliki permission Viewer pada spreadsheet.
5. Sediakan Resend sender/domain terverifikasi dan konfigurasi `AUTH_MAILER=resend`, `RESEND_API_KEY`, serta `RESEND_FROM_EMAIL`.
6. Jalankan read-only smoke test pada preview environment.
7. Review vulnerability Prisma sebelum production approval.

Item 3–5 adalah **REQUIRES MANUAL APPROVAL** dan tidak dilakukan pada Phase 10.

## Status

**NOT READY untuk deployment Vercel.** Build aplikasi lokal lulus, tetapi database loopback, credential file Google lokal, sender/domain Resend, dan dependency findings masih harus diselesaikan/dikonfirmasi.
