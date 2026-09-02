# PHASE 21G - SUPABASE CUTOVER RUNBOOK

> HISTORICAL / NON-ACTIVE (Phase 6C, 2026-09-02): Recovery/mail references in
> this preparation runbook are not current application configuration.

Dokumen ini adalah runbook persiapan. Tidak ada langkah cutover pada Phase
21G yang telah dijalankan.

## Current dan target

    CURRENT (operator/local)
    DATABASE_URL -> PostgreSQL local dashboard_pln

    TARGET runtime (Vercel setelah approval)
    DATABASE_URL -> Supabase Transaction Pooler PostgreSQL

    TARGET operator (migration/backup only)
    SUPABASE_DIRECT_URL -> Supabase Direct PostgreSQL, port 5432

DATABASE_URL local tetap unchanged. Jangan memakai host loopback sebagai
database runtime Vercel.

Untuk migration schema, canonical production path selalu
`prisma/production/schema.prisma` dan
`prisma/production/migrations/`. `prisma/schema.prisma` dan
`prisma/migrations/` adalah **LEGACY/LOCAL-ONLY** dan tidak interchangeable.

## Guardrail wajib

- Jangan menjalankan migration/data import ulang untuk cutover ini.
- Jangan menghapus, truncate, update, atau insert business data sebagai bagian
  dari smoke test.
- Jangan mengaktifkan cron sebelum secret dan preview smoke test lulus.
- Jangan mengirim real password-reset email sebelum sender/domain diverifikasi.
- Jangan menyalin .env.local, credential JSON, private key, atau secret ke
  repository.
- Jika parity berubah dari 8.754 rows, hentikan cutover dan lakukan review.

## Pre-cutover checklist

### Database dan Prisma

- [ ] Backup/snapshot Supabase dibuat melalui prosedur infrastructure yang
      disetujui. Ini langkah manual dan tidak dilakukan pada Phase 21G.
- [ ] Restore rehearsal/backup retention policy dikonfirmasi.
- [ ] Direct dan Pooler connectivity, TLS, dan connection limit dikonfirmasi.
- [ ] Keputusan role runtime dibuat; least-privilege role lebih disukai daripada
      memakai role postgres.
- [ ] `npm run supabase:production:migration:preflight` PASS; pemeriksaan ini
      menggunakan `SUPABASE_DIRECT_URL`, `prisma/production/schema.prisma`,
      dan tidak melakukan write.
- [ ] Post-import parity tetap missing 0, extra 0, mismatch 0.
- [ ] Target business rows tetap 8.754.

### Vercel environment

- [ ] Root Directory diset ke energiprimer-next.
- [ ] Node runtime dipilih/pin sesuai kebijakan platform.
- [ ] DATABASE_URL Preview diset ke Supabase endpoint yang disetujui dengan
      SSL/pooling yang benar.
- [ ] AUTH_URL menunjuk origin Preview HTTPS.
- [ ] AUTH_SECRET dan CRON_SECRET unik untuk Preview, bukan credential local
      atau production.
- [ ] NEXT_PUBLIC_APP_URL dan NEXT_PUBLIC_APP_NAME sesuai Preview.
- [ ] Google service-account email/private key dan spreadsheet ID tersedia
      sebagai server-side secrets/config.
- [ ] AUTH_MAILER=resend, RESEND_API_KEY, dan RESEND_FROM_EMAIL hanya diisi
      setelah sender/domain diverifikasi.
- [ ] AUTH_TEST_* hanya memakai account/database isolated dan tidak dibawa ke
      Production.

### Security and operations

- [ ] anon dan authenticated tetap tidak memiliki application-table access.
- [ ] Tidak ada secret pada client bundle.
- [ ] Auth live E2E Preview selesai tanpa membuat/mengubah production user.
- [ ] Password reset controlled test selesai pada Preview jika fitur diaktifkan.
- [ ] Cron request unauthorized ditolak.
- [ ] Cron authorized path hanya diaktifkan setelah deployment dan approval.
- [ ] Dependency HIGH sudah mendapat keputusan security/upgrade manual.

## Preview smoke test (read-only)

Setelah Preview environment disiapkan, jalankan pemeriksaan dari deployment
Preview menggunakan endpoint read-only yang tersedia. Jangan menjalankan
/api/sync/google-sheets dengan credential valid sebagai bagian dari smoke test.

1. Buka /login dan pastikan unauthenticated user tidak dapat masuk ke
   /dashboard.
2. Login dengan isolated Preview admin account.
3. Buka seluruh route:

       /dashboard
       /dashboard/biomassa
       /dashboard/batubara
       /dashboard/solar
       /dashboard/stok
       /dashboard/target

4. Terapkan filter Juli 2026 dan cocokkan KPI utama:
   - Biomassa receipt: 3.223,46 ton;
   - Biomassa consumption: 3.740,65 ton;
   - Batubara receipt: 30.084,842 ton;
   - Solar consumption: 24.274 liter;
   - Solar receipt: 25.000 liter;
   - cumulative: 29.103,77 ton;
   - target: 70.020 ton;
   - progress: sekitar 41,565%.
5. Pastikan chart memiliki series dan tidak blank; pastikan null tetap gap.
6. Uji Unit 1, Unit 2, Unit 3, supplier, tanggal fokus, HOP, stock, target, dan
   fallback periode tanpa mengubah data.
7. Uji login/logout, protected direct request, role denial, dan safe redirect.
8. Jika password reset digunakan, uji hanya pada recipient yang disetujui dan
   provider/sender Preview.
9. Pastikan response error tidak menampilkan secret, stack trace, atau
   filesystem path.

Preview dinyatakan lulus hanya jika semua read result cocok dengan baseline dan
tidak ada browser hard navigation atau secret exposure.

## Cutover steps (manual approval required)

Langkah berikut belum dijalankan:

1. Catat approval, baseline parity, dan snapshot/backup identifier.
2. Provision Production Vercel environment variables sesuai checklist.
3. Set Production DATABASE_URL ke endpoint Supabase yang telah disetujui.
   Jangan mengubah DATABASE_URL local pada workstation.
4. Deploy ke Preview terlebih dahulu dan ulangi smoke test.
5. Setelah Preview PASS, lakukan promotion/deployment Production melalui
   operator Vercel yang berwenang.
6. Jalankan application read smoke test Production. Jangan menjalankan sync
   atau migration sebagai smoke test.
7. Pastikan metric baseline, route protection, client secret scan, dan logs
   sanitized.
8. Aktifkan/biarkan cron hanya setelah CRON_SECRET, Google credentials,
   permission spreadsheet, dan operational owner disetujui.
9. Monitor error rate, database connection count, latency, auth failures, dan
   sync failures pada observation window yang disepakati.

Tidak ada langkah pada bagian ini yang boleh dianggap sebagai izin deployment;
semuanya memerlukan approval manual terpisah.

## Rollback steps

Rollback harus mempertahankan data Supabase dan tidak melakukan destructive
query.

1. Hentikan promotion/cron melalui Vercel operator.
2. Kembalikan deployment ke build terakhir yang diketahui sehat.
3. Kembalikan Production DATABASE_URL ke endpoint production sebelumnya yang
   reachable dan disetujui. **Jangan** mengarahkannya ke localhost atau
   127.0.0.1, karena endpoint itu tidak reachable dari Vercel.
4. Verifikasi login, protected routes, dan dashboard read pada endpoint
   sebelumnya.
5. Biarkan Supabase tetap utuh untuk forensic/parity comparison; jangan drop,
   truncate, delete, atau overwrite data.
6. Simpan log deployment, error window, dan hasil smoke test untuk manual review.

Jika tidak ada endpoint production sebelumnya yang reachable, rollback database
runtime adalah **REQUIRES MANUAL APPROVAL** dan harus mengikuti rencana
infrastructure/backup provider, bukan improvisasi pada workstation.

## Verification criteria

Cutover dapat dinyatakan berhasil hanya jika:

- Direct/Pooler Prisma connection dan TLS sesuai policy;
- migration status UP_TO_DATE;
- target data 8.754 rows dan parity tetap 0/0/0;
- seluruh route dashboard menampilkan KPI/chart;
- authentication/authorization server-side PASS;
- reset mail provider sesuai status production;
- Google Sheets credential server-side dan sync authorization PASS;
- cron tidak dapat dipanggil tanpa secret;
- tidak ada secret pada client bundle/log;
- database connection count dan latency berada dalam batas yang disetujui;
- tidak ada data/business logic/schema change yang tidak direncanakan.

## Stop conditions

Hentikan proses dan jangan lanjut ke promotion jika terjadi salah satu berikut:

- parity mismatch, row count berubah, duplicate/orphan muncul;
- Prisma query/dashboard route error;
- SSL/Pooler tidak sesuai policy;
- auth/role protection gagal;
- credential atau secret terdeteksi di client/log;
- Google Sheets/Resend production configuration belum verified;
- connection exhaustion atau latency abnormal;
- cron dapat dipanggil tanpa authorization;
- ada permintaan perubahan schema/data yang belum disetujui.

## Phase 21G boundary

Status saat dokumen ini dibuat:

    Runtime validation: PASS WITH REVIEW
    Preview deployment: NOT RUN
    Production cutover: NOT RUN
    Production cron: NOT ACTIVATED
    Local DATABASE_URL: UNCHANGED
    Local writes: 0
    Supabase writes: 0

Tunggu approval manual sebelum melakukan langkah berikutnya.
