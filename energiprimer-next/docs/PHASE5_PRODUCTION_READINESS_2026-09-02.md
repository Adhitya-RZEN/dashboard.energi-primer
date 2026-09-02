# Phase 5 — Production Readiness Report

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Recovery/mail references below
> are not active application configuration and must not be provisioned.

Tanggal audit: 2026-09-02  
Project: `energiprimer-next`  
Keputusan akhir: **NOT RELEASE-READY**

Status pada laporan ini memakai label `VERIFIED`, `INFERRED`, `UNKNOWN`, dan `BLOCKED`. Tidak ada `migrate deploy`, `migrate resolve`, `db push`, `migrate reset`, `DROP`, `TRUNCATE`, atau destructive SQL yang dijalankan.

## 1. Executive Summary

- **VERIFIED — Auth.js runtime:** Credentials Provider, bcrypt, Prisma user, JWT/session, role admin, logout, guest rejection, non-admin rejection, dan protected dashboard lulus HTTP E2E.
- **VERIFIED — PostgreSQL/Supabase runtime:** koneksi production schema melalui direct dan transaction pooler lulus; schema public cocok; dashboard membaca normalized PostgreSQL; metric Juli 2026 cocok dengan baseline.
- **VERIFIED — Google Sheets:** dry-run menghasilkan rencana Juli yang siap import tanpa write; POST cron dengan secret benar berhasil setelah timeout discovery diperbaiki; missing/wrong secret dan preview/unknown deployment ditolak.
- **VERIFIED — build/security baseline:** lint, TypeScript, build, header security, browser privilege probes, dan regression statis lulus.
- **UNKNOWN/BLOCKED — migration release path:** database memakai production baseline terpisah dari root history; checksum provenance belum direkonsiliasi. Jangan menjalankan root history terhadap Supabase.
- **UNKNOWN/BLOCKED — Vercel live:** deployment dan Preview runtime tidak diakses. Static build bukan bukti bahwa target `DATABASE_URL` Preview/Production benar.
- **UNKNOWN — deletion policy:** importer mempertahankan row yang hilang dan menandai worksheet `MISSING`; keputusan bisnis retain/tombstone/delete belum ditetapkan.

Kesimpulan: core application sudah dapat diverifikasi, tetapi critical unknown pada migration provenance dan deployment target membuat release production belum dapat disetujui.

## 2. Baseline

### Repository

- **VERIFIED:** branch `NextJs`, tracking `origin/NextJs`.
- **VERIFIED:** commit terakhir pada awal audit adalah `2053890 Production close`; history terakhir juga memuat mapping/render fix dan database/source changes.
- **VERIFIED:** worktree sudah dirty sebelum Phase 5. Perubahan Phase 1–4 dan perubahan user dipertahankan; tidak dilakukan reset/checkout/clean.
- **VERIFIED:** report dan file tambahan Phase 1–4 tetap untracked/dirty sesuai kondisi repository, bukan dihapus atau ditimpa.

### Architecture aktual

- **VERIFIED:** authentication aktif adalah Auth.js/NextAuth v5 Credentials Provider → Prisma → PostgreSQL, dengan bcrypt dan role admin.
- **VERIFIED:** tidak ada import `@supabase/*`, Supabase Auth, atau dual authentication pada `src`/`package.json`.
- **VERIFIED:** Prisma runtime memakai `DATABASE_URL`; migration/operator tooling memakai direct URL bila diperlukan.
- **VERIFIED:** dashboard utama memakai `src/services/overview-postgres.ts` dan normalized tables.
- **VERIFIED:** cron route berada di `/api/sync/google-sheets`; `vercel.json` menjadwalkannya setiap 15 menit.
- **VERIFIED:** password reset/Resend tetap tidak aktif sebagai authentication path; route lama masih ada tetapi bukan source of truth login.

## 3. Auth.js E2E

### Database user preflight

- **VERIFIED:** database read-only aggregate menghasilkan 1 user, 1 admin, dan 0 non-admin.
- **VERIFIED:** email admin dipakai dalam bentuk normalized untuk test; password test dibandingkan secara bcrypt terhadap hash runtime tanpa mencetak email/password/hash ke report.
- **VERIFIED:** hash user disimpan sebagai bcrypt, bukan plaintext; test tidak mengubah role atau password.
- **VERIFIED:** test login hanya memiliki side effect normal `lastLoginAt`.

### Runtime matrix

Actual HTTP E2E melalui `scripts/verify-auth.mjs` lulus:

1. guest `/dashboard` diarahkan ke `/login?callbackUrl=...` sebelum protected rendering;
2. password salah ditolak dengan error generik;
3. password admin benar membuat session cookie dan dashboard merender `Overview Energi Primer`;
4. logout menginvalidasi session dan dashboard kembali protected;
5. signed operator-role session ditolak oleh authorization boundary tanpa perubahan row user;
6. `/forgot-password` dan `/reset-password/[token]` tetap dapat diakses sebagai halaman, tanpa mengaktifkan reset provider.

**VERIFIED:** JWT strategy dan expiration dua jam (`maxAge: 120 * 60`) eksplisit. Session callback membaca ulang role/session version sehingga perubahan authorization dapat menginvalidasi session.

**VERIFIED:** `auth:security:verify` lulus untuk redirect origin safety, normalization email, throttle 6 attempt/60 detik dengan advisory lock, generic reset response, token expiry/invalidation, dan protected server checks.

**VERIFIED:** environment test langsung dengan nama `AUTH_TEST_*` belum lengkap, sehingga command mentah `scripts/verify-auth.mjs` berhenti pada preflight. E2E tetap dijalankan melalui bridge process-only yang mengambil credential test dari environment dan memilih admin runtime; tidak ada credential yang ditulis ke source, fixture, log, atau report.

## 4. Supabase / Prisma

### Connection and schema

- **VERIFIED:** Supabase direct connection ke database `postgres`, schema `public`, PostgreSQL 17.6, SSL `verify-full`/backend SSL PASS.
- **VERIFIED:** transaction pooler SSL parameter PASS; backend session SSL tidak dilaporkan oleh pooler dan dicatat sebagai `PASS_WITH_POOLER_SESSION_NOT_REPORTED`.
- **VERIFIED:** `supabase:production:runtime:direct`, `supabase:production:runtime:pooler`, `supabase:security:verify`, dan production migrate-status melakukan read-only verification dengan `supabaseWrites: 0`.
- **VERIFIED:** public schema memiliki 31 table sesuai production baseline; tidak ada unexpected table pada pemeriksaan yang dilakukan.
- **VERIFIED:** privilege table untuk `anon` dan `authenticated` adalah DENIED; `postgres` dan `service_role` memiliki akses server-side yang diperlukan.
- **UNKNOWN:** project-level Data API setting tidak dapat dibuktikan melalui SQL-only preflight. Source audit menunjukkan tidak ada browser Supabase client; konfigurasi Dashboard Supabase belum diubah.

### Runtime data

- **VERIFIED:** application row count setelah discovery/sync metadata adalah 8.951; 2.406 normalized-data rows menjadi baseline stabil setelah tabel auth/cache/import/sync metadata dikeluarkan sebagai runtime-mutable.
- **VERIFIED:** `db:verify` lulus: 3 unit, coal consumption 636, coal stock 212, tidak ada orphan foreign key.
- **VERIFIED:** direct dan pooler runtime menghasilkan Juli 2026 dengan metric yang sama: biomass receipt 3.223,46 ton; biomass consumption 3.740,65 ton; coal receipt 30.084,842 ton; solar consumption 24.274 liter; solar receipt 25.000 liter; target 70.020 ton; cumulative 29.103,77 ton; progress 41,5649%; series 31 hari.
- **VERIFIED:** coverage Januari–Juli tersedia; permintaan Agustus melakukan fallback eksplisit ke Juli, bukan mengarang nilai.

## 5. Migration Strategy

### Evidence

- **VERIFIED:** `prisma/production/schema.prisma` memiliki production baseline `20260901130000_production_schema_baseline`; `prisma migrate status --schema prisma/production/schema.prisma` menyatakan database up to date.
- **VERIFIED:** root `prisma/schema.prisma` masih memiliki lima migration lokal Laravel-derived yang belum diterapkan pada database tersebut; root status melaporkan last common migration `null` dan production baseline tidak ditemukan di root history.
- **VERIFIED:** row `_prisma_migrations` production berisi satu migration selesai, tidak rolled back.
- **VERIFIED:** SHA-256 artifact migration pada repository adalah `309D076106D4DE2127733401909FFFC1AF77BF8CF8C92E7A324B68462CCF60AF`, sedangkan checksum yang tercatat pada database adalah `f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c`.
- **UNKNOWN:** provenance historis selisih checksum tersebut—apakah SQL pernah diregenerasi, baseline deployed berasal dari artifact lain, atau proses sebelumnya mengubah file—belum dapat dibuktikan dari repository/database saja.

### Decision

**MIGRATION STRATEGY: C — Migration history requires reconciliation.**

Rekomendasi operasional sementara: pertahankan production path terpisah (`prisma/production/schema.prisma` + production migration history), jangan jalankan root Laravel-derived history ke Supabase, dan jangan memperbaiki checksum dengan edit spekulatif atau `migrate resolve`. Sebelum deployment berikutnya, owner harus menetapkan canonical history dan merekonstruksi/menyetujui provenance checksum.

`db:verify-import-schema` masih FAIL karena verifier tersebut mengharapkan root migration history, bukan karena normalized query/runtime schema gagal. Ini dicatat sebagai verifier/migration-path mismatch sampai history canonical diputuskan.

## 6. Data Contract

- **VERIFIED:** Google Sheets dry-run Juli menghasilkan 352 source rows: 31 daily rows, 7 biomass receipt rows, 93 biomass consumption rows, 1 coal receipt, 93 coal consumption, 31 coal stock, 31 solar consumption, 1 solar receipt, 93 HOP, 1 target, dan 1 cumulative snapshot.
- **VERIFIED:** database memiliki 49 legitimate `biomass_receipts` untuk 7 periode, 7 row per bulan Januari–Juli. Verifier lama yang mengharapkan 7 total row diperbaiki agar membatasi assertion pada periode Juli.
- **VERIFIED:** uniqueness biomass receipt adalah `(periodStart, supplierCode)`; import berulang tidak menggandakan row. Juli total receipt cocok 3.223,46 ton.
- **VERIFIED:** numeric parser membedakan explicit zero dari blank/dash/unparseable (`null`), dan invalid values tidak dipaksa menjadi angka valid.
- **VERIFIED:** Unit 1, Unit 2, dan Unit 3 tetap distinct; mapping supplier menggunakan stable business identity.
- **VERIFIED:** `CoalStock` saat ini menerima closing stock dan consumed. Opening stock dan daily receipt allocation tidak tersedia dalam current import plan, sehingga calculated closing stock tidak boleh dipresentasikan sebagai fakta.
- **INFERRED:** perbedaan fixture 7 versus database 49 adalah perbedaan grain assertion (satu periode versus tujuh periode), bukan duplicate production rows.
- **VERIFIED:** warning source Juli tetap ada dan didokumentasikan: label blok ketiga typo/duplicate dinormalisasi berdasarkan urutan Unit 1–3; total dashboard legacy berbeda dari total semantic Unit 1–3 dan parser mempertahankan definisi semantic yang disetujui.

## 7. Google Sheets Sync

### Gate and route

- **VERIFIED:** route memakai Node runtime, `force-dynamic`, `maxDuration = 300`, deployment environment gate, CRON secret check, dan constant-time bearer comparison.
- **VERIFIED:** missing secret/wrong secret pada local development menghasilkan HTTP 401.
- **VERIFIED:** production-like process tanpa `VERCEL_ENV` ditolak fail-closed dengan HTTP 403; Preview/unknown juga ditolak sebelum auth/engine.
- **VERIFIED:** POST dengan secret benar pada local environment berhasil setelah perbaikan transaction timeout. Latest `sync_run` berstatus `SUCCESS`, `worksheetsScanned: 0`, `rowsScanned: 0`, `inserted: 0`, `updated: 0`, `skipped: 0`, `failed: 0`. Tidak ada worksheet setelah Juli 2026 yang due untuk automatic import pada saat test.
- **VERIFIED:** discovery mendaftarkan 199 Google tabs, dengan 7 worksheet BB aktif/eligible; lease dilepas (`activeLeases: 0`) dan tidak ada orphan/partial business import.

### Safety and correctness

- **VERIFIED:** `sheets:dry-run` memberi `READY_FOR_IMPORT`, `databaseWrites: 0`, tanpa blocking issue, dan metric source cocok.
- **VERIFIED:** static checks lulus untuk stable identity key, insert/update/skip, null-vs-zero, duplicate detection, reorder, retry bounded, advisory lease, schema review, automatic admission, cron auth, preview write safety, dan discovery missing/rename.
- **VERIFIED:** perubahan row memakai upsert/changed-key scope; duplicate stable key menjadi review; invalid/schema change diblokir; tidak ada delete call pada active sync path.
- **VERIFIED:** discovery transaction diberi `maxWait: 10s` dan `timeout: 60s` setelah live test membuktikan default transaction timeout gagal di tengah upsert 199 worksheet. Error route/engine sekarang hanya mencatat bounded category, bukan exception/secret.
- **UNKNOWN:** performa discovery 199 tab (~58 detik pada local test) masih perlu dipantau di Vercel; `maxDuration` 300 detik memberi ruang, tetapi bulk upsert/caching dapat menjadi optimasi berikutnya.

### Deletion/tombstone semantics

- **VERIFIED:** row yang hilang dari worksheet tidak dihapus; worksheet yang tidak ditemukan ditandai `MISSING`; row existing dipertahankan.
- **VERIFIED:** row berubah menjadi UPDATE berdasarkan business identity/content hash; row invalid/schema collision masuk failure/review.
- **UNKNOWN/BLOCKED:** business decision retain-only versus tombstone versus delete belum didefinisikan. Tidak ada deletion otomatis yang ditambahkan berdasarkan asumsi.

## 8. Dashboard Integrity

- **VERIFIED:** `db:verify-overview` dan runtime direct/pooler membuktikan dashboard membaca normalized PostgreSQL dengan active period/date filter Juli 2026 dan 31 daily points.
- **VERIFIED:** unit ordering dan identities `Unit 1`, `Unit 2`, `Unit 3` preserved; null chart values tetap gaps, bukan dipaksa zero.
- **VERIFIED:** dashboard routes `/dashboard`, biomassa, batubara, solar, stok, dan target menggunakan overview PostgreSQL yang sama; fallback bulan tidak menyamarkan unavailable data.
- **VERIFIED:** `coal_quality` kosong (0 row) diklasifikasikan sebagai data quality belum tersedia/outside current importer; halaman menampilkan empty state dan field unavailable, bukan dummy.
- **VERIFIED:** `power_generation` kosong dan belum termasuk approved active mapping/dashboard source; feature tersebut belum memiliki production data contract aktif.
- **VERIFIED:** `kpi_targets` kosong dan bukan source target biomass; target biomass aktif berasal dari normalized `biomass_targets`/Google import. SFC/heat-rate target tetap belum memiliki data.
- **VERIFIED:** monitoring dan laporan menampilkan state unavailable/empty secara eksplisit ketika data belum ada; tidak ditemukan coercion null menjadi klaim data nyata.

## 9. Vercel Readiness

### Static verification

- **VERIFIED:** `vercel.json` valid dan cron `/api/sync/google-sheets` dijadwalkan setiap 15 menit.
- **VERIFIED:** Next production build PASS; route list mencakup auth API, sync API, protected dashboard routes, dan reset page; `ƒ Proxy (Middleware)` terkompilasi.
- **VERIFIED:** Node runtime/maxDuration/dynamic route settings berada pada sync route; environment preflight menemukan startup, Google sync, dan non-production mail requirements tanpa mencetak secret.
- **VERIFIED:** Preview/unknown sync write safety static test PASS dan environment gate tidak memblokir development/production yang dikenali.
- **VERIFIED:** tracked sensitive paths hanya `.env.example`; `.env.local`, `.env.e2e.local`, credential directory, dan `.next` bukan tracked deployment source. Static artifact scan tidak menemukan private-key/database-url/secret material pada `.next/static`.

### Live status

**VERCEL LIVE VERIFICATION: BLOCKED.** Tidak ada actual Vercel deployment/Preview URL yang diakses pada Phase 5. Target dan reachability `DATABASE_URL` Preview, production domain `AUTH_URL`, cron execution Vercel, dan deployment health belum terbukti. Local build serta local production-like checks tidak cukup untuk menyatakan Vercel runtime PASS.

## 10. Security

- **VERIFIED:** bcrypt Credentials login, origin-safe redirect, JWT/session version revalidation, admin authorization, login throttle/advisory lock, generic reset response, secure token generation/expiry/invalidation, dan security headers lulus targeted checks.
- **VERIFIED:** Supabase direct/pooler role probes menunjukkan `anon`/`authenticated` tidak memiliki SELECT/INSERT/UPDATE/DELETE table access; server roles tetap tersedia.
- **VERIFIED:** tidak ada Supabase browser client pada source; service-account credential dipakai server-side saja.
- **VERIFIED:** verifier outputs menandai `credentialsPrinted: false`, `tokensPrinted: false`, `databaseUrlPrinted: false`; invalid login log yang diamati hanya generic Auth.js `CredentialsSignin`, tanpa password/token/hash.
- **UNKNOWN:** project Dashboard Supabase Data API setting belum diverifikasi melalui API provider; current recommendation tetap no app-table grants for browser roles.
- **OPERATOR ACTION REQUIRED:** satu diagnostic environment pada audit sempat menghasilkan content env ke output tool. Nilai tidak disalin ke source/report, tetapi sebelum membagikan transcript/worktree atau deploy, pastikan output tersebut tetap di dalam operator boundary; jika tidak, rotate active database/auth/cron/Google credentials. Nilai secret tidak dicantumkan di report ini.

## 11. Regression Results

### PASS

- `npm run lint`
- `npx --no-install tsc --noEmit --incremental false`
- `npm run build`
- `npm run db:validate`
- `npm run db:verify`
- `npm run db:verify-overview`
- `npm run db:verify-import-data`
- `npm run db:verify-kpi:juni`
- `npm run db:verify-kpi:mei`
- `npm run supabase:production:runtime:direct`
- `npm run supabase:production:runtime:pooler`
- `npm run supabase:production:migrate-status`
- `npm run supabase:security:verify`
- `npm run auth:security:verify`
- actual Auth.js HTTP E2E via `scripts/verify-auth.mjs`
- `npm run bb:mapping:test` (27 assertions)
- `npm run dynamic:verify`
- sync discovery/incremental/retry/schema/auto-admission/cron/preview/config/state verifiers
- `npm run sync:verify-historical-registry` (2.409/2.409 row-state, idempotency 0 insert/0 update/2.409 skip, databaseWrites 0)
- `npm run sheets:dry-run` (databaseWrites 0)
- `npm run mail:verify` (real email not requested)
- `npm run ops:verify-env`
- HTTP negative sync checks and HTTP correct-secret sync check
- `git diff --check`

### FAIL / REVIEW, with root cause

- `db:verify-import-schema`: **FAIL/REVIEW** because it checks root migration history while the current Supabase database uses production baseline history. This is tied to the unresolved migration strategy, not a failed production schema query.

The remaining schema-verifier review is a migration-path mismatch. Period-scoped July, June, and May import/KPI verifiers all pass against the repeated-import database.

## 12. Changes Made

Phase 5 changes based on concrete runtime evidence:

- `src/proxy.ts`: protected path guard now rejects guest/non-admin before protected child rendering; this fixed a verified dashboard content exposure behind a redirect boundary.
- `src/app/api/sync/google-sheets/route.ts`: deployment gate and bounded safe error category logging.
- `src/services/google-sheets/sync/discovery.ts`: explicit 10-second transaction wait and 60-second transaction timeout for large worksheet discovery.
- `src/services/google-sheets/sync/engine.ts`: bounded sync error logging and reuse of sanitized error category in `syncRun.errorSummary`.
- `scripts/verify-auth-security.ts`: proxy/throttle security assertions and CRLF-normalized source reading.
- `scripts/verify-import-data.mjs`: period-scoped assertions and latest successful run selection by effective period/completion time; cumulative snapshot scope corrected.
- `scripts/verify-kpi-juni26-import.ts` and `scripts/verify-kpi-mei26-import.ts`: annual target assertions now respect the global 2026 target grain while preserving month-specific cumulative provenance.
- `scripts/verify-supabase-phase21es2.mjs`: security baseline now distinguishes stable normalized data from runtime-mutable auth/cache/import/sync metadata instead of requiring a populated production database to be empty.
- `scripts/verify-supabase-production-runtime.ts`: same stable normalized-data baseline treatment for direct/pooler runtime verification.
- `.env.local`: corrected a non-secret malformed `GOOGLE_SHEETS_CACHE_TTL` suffix that made Next's dotenv parser reject runtime Google configuration. This file remains local/ignored and is not a release artifact.
- `docs/PHASE5_PRODUCTION_READINESS_2026-09-02.md`: this report.

No migration history was deleted/merged, no migration was deployed/resolved, no user was provisioned by this phase, and no dummy dashboard data was inserted.

## 13. Remaining Blockers

1. **CRITICAL — migration provenance/checksum:** choose canonical production history and reconcile the recorded checksum with an approved artifact. Do not use automatic `resolve` or edit SQL blindly.
2. **HIGH — Vercel live verification:** verify actual Preview and Production deployment, non-production Preview database target, production HTTPS `AUTH_URL`, cron execution, and health logs.
3. **HIGH — secret hygiene:** confirm the operator boundary for local/tool logs and rotate active secrets if any environment content left that boundary.
4. **HIGH/MEDIUM — deletion policy:** define retain-only, tombstone, or deletion semantics for rows removed from Google Sheets, including audit/restore expectations.
5. **MEDIUM — schema verifier mode:** update `db:verify-import-schema` to report/validate the selected production migration history without treating the intentionally separate root history as the active Supabase path.
6. **MEDIUM — feature data coverage:** decide whether coal quality, power generation, and SFC/heat-rate KPI target data are required for the first release; current UI empty states are honest, but those features are not data-complete.
7. **MEDIUM — sync discovery performance:** monitor the ~58-second local discovery of 199 tabs and consider bulk/upsert optimization before large spreadsheet growth.

## 14. Final Decision

**NOT RELEASE-READY.**

Auth.js, database connectivity, normalized July data contract, dashboard overview, Google dry-run/cron gate, security privilege probes, and production build are verified. The release decision remains blocked by unresolved migration provenance/checksum, unavailable Vercel live verification, required secret-hygiene confirmation, and an undecided deletion/tombstone contract.

Next action: operator approves the canonical migration/checksum reconciliation plan, verifies Vercel environment/deployment targets, confirms secret rotation as needed, and decides deletion semantics. Then rerun the full Phase 5 regression gate and only promote to `RELEASE-READY` when no critical `UNKNOWN`/`BLOCKED` item remains.
