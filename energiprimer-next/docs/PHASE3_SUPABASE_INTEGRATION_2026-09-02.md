# Phase 3 — Supabase PostgreSQL Integration Verification

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Any account-recovery/mail
> references below describe an earlier state and are not active runtime flows.

Tanggal pemeriksaan: 2026-09-02  
Mode: read-only verification; tidak ada migration, seed, insert, update, delete, perubahan user, atau perubahan environment deployment.

Label yang digunakan:

- **VERIFIED**: dibuktikan dari source, metadata database, atau command yang berhasil.
- **INFERRED**: kesimpulan kuat dari source dan hasil pembanding, tetapi bukan bukti konfigurasi deployment.
- **UNKNOWN**: tidak dapat dibuktikan dari repository atau tidak diuji pada environment live.
- **BLOCKED**: pemeriksaan membutuhkan credential/keputusan/operator action yang tidak boleh dibuat pada fase ini.

## A. Baseline

- **VERIFIED**: baseline worktree direkam sebelum pemeriksaan. Perubahan dan artefak dari fase sebelumnya dipertahankan; tidak ada reset, clean, checkout, atau operasi destruktif.
- Branch aktif: `NextJs`.
- Commit terakhir saat baseline: `2053890 Production close`.
- Repository memiliki dua sejarah Prisma: `prisma/migrations/` dan `prisma/production/migrations/`.
- **VERIFIED**: Phase 3 tidak mengubah source application, schema, migration SQL, database data, akun, atau credential. File laporan ini adalah satu-satunya deliverable dokumentasi Phase 3.

## B. Prisma Configuration

- **VERIFIED**: tidak ada `prisma.config.ts`.
- `prisma/schema.prisma` dan `prisma/production/schema.prisma` sama-sama menggunakan provider `postgresql` dan datasource `DATABASE_URL`.
- **VERIFIED**: runtime `src/lib/prisma.ts` menggunakan Prisma Client singleton; tidak ada runtime switch otomatis ke `SUPABASE_DIRECT_URL`.
- **VERIFIED**: schema aplikasi dan schema production byte-identical pada pemeriksaan hash.
- **INFERRED**: root history ditujukan untuk database existing/Laravel, sedangkan production history adalah baseline bootstrap terpisah. Pemilihan history deployment harus tetap eksplisit.
- Tidak ditemukan `@supabase/*` atau import Supabase Auth pada `src`; Auth.js/Prisma adalah jalur authentication aktif.

## C. Supabase Database Connectivity

- **VERIFIED**: `DATABASE_URL`, `SUPABASE_DIRECT_URL`, dan `SUPABASE_POOLER_URL` memiliki URL PostgreSQL dengan port yang sesuai: pooler `6543`, direct `5432`.
- **VERIFIED**: read-only Prisma metadata query berhasil pada ketiga endpoint; schema yang dilaporkan database adalah `public` dan server PostgreSQL adalah major version 17.
- **VERIFIED**: Direct Connection lulus pemeriksaan SSL server session dan `sslmode=verify-full` pada probe in-memory.
- **VERIFIED**: overview read-only melalui Direct dan Pooler lulus setelah `pgbouncer=true` diset hanya pada child process.
- **BLOCKED**: konfigurasi `DATABASE_URL` yang sedang dimuat aplikasi tidak lulus query paralel `db:verify`; error tersanitasi adalah Prisma `P2010`/PostgreSQL `42P05` (`prepared statement "s0" already exists`).
- **VERIFIED**: audit parameter URL menemukan `pgbouncer` bukan query key terpisah pada `DATABASE_URL`; teks `?pgbouncer=true` terbaca sebagai bagian dari nilai `sslmode`. A/B test dengan parameter `pgbouncer=true` yang benar di memory lulus, sehingga ini adalah blocker konfigurasi, bukan kegagalan endpoint Supabase.
- `.env.local` tidak diubah karena berisi credential lokal yang harus diperbaiki oleh operator tanpa mengekspos atau merotasi secret.

## D. Schema Verification

Pemeriksaan dilakukan memakai `information_schema`, `pg_catalog`, dan metadata Prisma secara SELECT-only.

| Check | Result |
| --- | --- |
| Application tables | **VERIFIED PASS** — 30 expected, 30 actual, tidak ada tabel aplikasi tak terduga |
| Prisma metadata table | **VERIFIED PASS** — `_prisma_migrations` tersedia |
| Columns | **VERIFIED PASS** — 270/270; type, nullability, default, precision cocok |
| Primary keys | **VERIFIED PASS** — 30/30 |
| Foreign keys | **VERIFIED PASS** — 19/19, nama dan action cocok |
| Indexes | **VERIFIED PASS** — 40/40, termasuk 20 unique indexes |
| `biomass_stock` | **VERIFIED PASS** — tidak ada; tetap future scope |
| Direct SSL | **VERIFIED PASS** |

## E. Migration State

- **VERIFIED**: `prisma migrate status --schema prisma/production/schema.prisma` mengembalikan `Database schema is up to date`; pemeriksaan wrapper mencatat zero Supabase writes.
- **VERIFIED**: row production baseline `20260901130000_production_schema_baseline` ada, selesai, dan tidak rolled back.
- **BLOCKED**: checksum row database berbeda dari checksum migration SQL yang ada di repository. Schema fisik tetap parity, tetapi migration history belum dapat disebut reproducible tanpa keputusan operator.
- **VERIFIED**: status terhadap root `prisma/schema.prisma` gagal dengan history mismatch: lima migration root belum diterapkan menurut metadata root, sementara database mencatat production baseline yang tidak ada pada root history.
- **UNKNOWN**: apakah CI/Vercel di luar repository menjalankan migration dengan schema/path tertentu.
- Tidak dijalankan `migrate deploy`, `migrate resolve`, `db push`, `db reset`, atau migration repair.

## F. Authentication

- **VERIFIED** dari source: Auth.js Credentials → lookup `users` dengan role `admin` → bcrypt compare → JWT session strategy → session callback revalidasi role/session version → protected route layout/proxy.
- **VERIFIED**: JWT max age dua jam, redirect same-origin, login throttle memakai `pg_advisory_xact_lock`, dan route protected memiliki server-side auth/role checks.
- **VERIFIED** dari aggregate SELECT: `users=0`, `admins=0`, `sessions=0`, `password_reset_tokens=0`, dan tidak ada password bcrypt-like pada database target.
- **BLOCKED — AUTH LOGIN**: login nyata tidak dilakukan. Tidak tersedia credential Auth.js admin yang valid/terotorisasi, dan target database tidak memiliki user admin. Credential Supabase Auth yang ada di file E2E tidak digunakan karena bukan jalur authentication aplikasi.
- **VERIFIED**: `GET /login` dan `GET /forgot-password` mengembalikan 200. Guest `/dashboard` menghasilkan redirect boundary Next.js menuju `/login?callbackUrl=/dashboard`; Next 16 dev dapat mengirim boundary ini sebagai response 200 RSC, bukan redirect HTTP klasik.
- **VERIFIED**: static auth/security suite PASS; E2E auth environment dilaporkan tidak tersedia.

## G. Existing Data

- **VERIFIED**: read-only Prisma data check melalui Direct berhasil: 3 units, 636 coal consumption rows, 212 coal stock rows; coal quality, power generation, dan KPI target saat ini kosong; foreign-key orphan checks lulus.
- **VERIFIED**: dashboard service membaca normalized PostgreSQL data. Overview Juli 2026 lulus dengan 31 daily series rows, Unit 1–3, dan nilai KPI baseline yang diharapkan pada pemeriksaan existing.
- **VERIFIED**: pemeriksaan read-only menghitung total 8.756 rows pada 30 tabel aplikasi. Fixture runtime lama mengharapkan 8.754; selisih 2 dicatat sebagai data/fixture drift dan tidak dihapus.
- **VERIFIED** dari importer: coal memetakan `consumed` dan `closingStock`; `openingStock` dan daily `received` belum dipopulasi oleh current import plan. `null` dibedakan dari numeric zero pada parser dan dashboard.
- **UNKNOWN**: apakah `openingStock` dan `received` pada `coal_stock` dimaksudkan sebagai authoritative source atau derived value untuk business reporting berikutnya.

## H. External Integrations

### Google Sheets

- **VERIFIED**: canonical service-account pair dan credential-file configuration lulus static configuration verifier; nilai credential tidak dicetak.
- **VERIFIED**: PostgreSQL adalah data source default saat Google source tidak dipilih; explicit Google source tidak silent-fallback ke PostgreSQL bila konfigurasi Google incomplete.
- **UNKNOWN**: live Google Sheets read/sync pada Phase 3. Tidak ada sync/import dijalankan.

### Resend

- **VERIFIED**: Resend tidak dipakai/diaktifkan pada environment aplikasi saat ini. Mail boundary tetap tersedia sebagai code path, tetapi tidak ada API call, reset email, atau enablement yang dilakukan.
- **VERIFIED**: password-reset token tidak ditulis ke development log; static mail/security checks lulus.

### Vercel

- **VERIFIED** dari repository: cron path `/api/sync/google-sheets` terdaftar setiap 15 menit, dan Preview/unknown deployment gate menolak write path.
- **UNKNOWN**: Vercel project settings, deployment environment variables, cron execution, dan production deployment health.
- Tidak ada perubahan Vercel atau deployment environment.

## I. Test Results

| Test | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npx --no-install tsc --noEmit --incremental false` | PASS |
| `npm run db:generate` | PASS |
| `npm run db:validate` | PASS |
| `npm run db:verify` dengan `DATABASE_URL` saat ini | BLOCKED — pooler prepared statement `P2010/42P05` |
| `scripts/verify-db.mjs` via Direct child override | PASS |
| overview verification via Direct | PASS |
| overview verification via corrected Pooler child override | PASS |
| production `prisma migrate status` | PASS — up to date/no pending reported |
| production schema parity verifier | FAIL only on migration checksum drift dan non-empty baseline data; physical schema checks PASS |
| root `prisma migrate status` | FAIL — intentional root/production history mismatch |
| `npm run build` | PASS — compile, TypeScript, static generation, and route collection |
| `npm run auth:security:verify` | PASS — E2E credential environment unavailable |
| `npm run sync:verify-cron-auth` | PASS |
| `npm run sync:verify-retry` | PASS |
| `npm run sync:verify-auto-admission` | PASS |
| `npm run sync:verify-schema` | PASS |
| `npm run sync:verify-preview-write-safety` | PASS |
| `npm run sync:verify-config` | PASS |
| `npm run bb:mapping:test` | PASS — 27 assertions |
| `npm run dynamic:verify` | PASS |
| `npm run ops:verify-env` | PASS; `secretsPrinted=false` |
| local `GET /login` | PASS — HTTP 200 |
| guest protected-route probe | PASS at redirect boundary; actual authenticated flow BLOCKED |

## J. Changes

- Tidak ada perubahan pada application source, Prisma schema, migration SQL, database state, user account, Auth.js configuration, Google data, Resend, atau Vercel.
- Tidak ada credential yang dicetak, dirotasi, dihapus, atau dikirim ke pihak luar.
- Tidak ada database write. Semua probe Supabase Phase 3 menggunakan SELECT atau Prisma status inspection; wrapper mencatat `supabaseWrites=0`.
- Artefak build/dev lokal (`.next`/generated dependencies) dibiarkan sebagai artefak kerja. `.next` adalah ignored local cache dan tidak boleh dipaketkan atau dibagikan; scan client static chunks tidak menemukan private key atau database URL.

## K. Remaining Blockers

1. Perbaiki `DATABASE_URL` pooler secara lokal/deployment melalui operator: `pgbouncer=true` harus menjadi query parameter terpisah (gunakan delimiter query yang benar), atau gunakan Direct Connection sesuai kebijakan Prisma. Jangan menyalin secret ke laporan.
2. Sediakan atau pulihkan satu admin Auth.js yang sah melalui prosedur provisioning terotorisasi. Phase 3 tidak membuat user, mengubah password, atau memanggil Supabase Auth.
3. Rekonsiliasi checksum migration baseline database terhadap migration artifact repository setelah membuktikan artifact yang benar. Jangan memakai `migrate resolve` untuk menutupi drift tanpa keputusan migration-history.
4. Tetapkan satu deployment migration history yang eksplisit: root existing/Laravel history atau production baseline history; jangan menjalankan root migrations terhadap database yang mencatat production baseline.
5. Konfirmasi mengapa total data aktual 8.756 berbeda dua row dari fixture 8.754 sebelum menjadikan fixture sebagai acceptance gate.
6. Verifikasi live Google Sheets, Vercel settings/cron, dan authenticated login pada environment deployment setelah blocker di atas diselesaikan.

## L. Final Assessment

**CONDITIONAL — NOT RELEASE-READY YET.**

Integrasi teknis Prisma → Supabase PostgreSQL, schema fisik, SSL Direct, normalized dashboard reads, dan regression suite terverifikasi. Namun deployment belum dapat dinyatakan sehat end-to-end karena konfigurasi pooler aplikasi gagal pada prepared statement concurrency, target tidak memiliki admin Auth.js sehingga login nyata BLOCKED, dan migration checksum/history belum konsisten. Tidak ada tindakan destruktif atau write yang dilakukan pada Phase 3.
