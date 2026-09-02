
# Phase 4 — Runtime Database, Admin Authentication & Migration Resolution

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Password-recovery/mail entries
> below are pre-remediation evidence. Current auth is Auth.js Credentials →
> Prisma → PostgreSQL/Supabase.

Tanggal pemeriksaan: 2026-09-02.
Mode: controlled verification. Tidak ada migration, schema change, data deletion, credential rotation, Supabase Auth, Resend, password reset, atau Google Sheets write.

Label: VERIFIED = dibuktikan; INFERRED = kesimpulan kuat tetapi bukan bukti deployment; UNKNOWN = belum dapat dibuktikan; BLOCKED = sengaja tidak dilakukan karena membutuhkan credential/otorisasi atau keputusan operator.

## A. Baseline

- Branch: NextJs.
- Commit terakhir saat recheck: 2053890 Production close.
- Working tree telah memiliki perubahan/dokumentasi Phase 1–3; semuanya dipertahankan.
- Tidak ada reset, clean, checkout, penghapusan perubahan, atau database write.
- Phase 4 hanya menyentuh package.json, menambah scripts/create-admin.mjs, dan menambah laporan ini.
- .env.local tidak diubah; pada recheck separator pgbouncer sudah benar.

## B. DATABASE_URL

- Issue Phase 3: bentuk pooler pernah terbaca seperti sslmode=require?pgbouncer=true, sehingga query paralel gagal dengan P2010/42P05 prepared statement collision.
- VERIFIED: .env.local saat ini mem-parsing sslmode=require dan pgbouncer=true sebagai query key terpisah.
- Tidak ada URL/password yang dicetak, di-hardcode, atau diubah.
- VERIFIED PASS: DATABASE_URL → Prisma Client → Supabase Pooler → PostgreSQL melalui npm run db:verify.
- Schema public terbaca dan PostgreSQL major version 17 tercapai.
- VERIFIED PASS: npm run db:verify-overview membaca normalized PostgreSQL data melalui DATABASE_URL.
- VERIFIED PASS: elevated npm run dev melayani http://localhost:3000.
- /login, /forgot-password, dan /api/auth/session mengembalikan HTTP 200.
- Guest /dashboard menghasilkan redirect boundary Next.js ke login; authenticated dashboard belum dapat diverifikasi karena belum ada admin.

## C. SUPABASE_DIRECT_URL

- VERIFIED: kedua prisma schema hanya mendefinisikan datasource DATABASE_URL.
- Tidak ada prisma.config.ts.
- VERIFIED: src/lib/prisma.ts tidak menggunakan SUPABASE_DIRECT_URL untuk runtime application client.
- VERIFIED: SUPABASE_DIRECT_URL digunakan oleh operator/read-only tooling: migration status, production schema parity, runtime endpoint, security/data migration verifier, dan controlled schema runner.
- Migration status wrapper mengirim Direct URL ke child process sebagai DATABASE_URL; parent environment tidak diubah.
- INFERRED/RECOMMENDED: DATABASE_URL Pooler untuk runtime aplikasi; Direct URL hanya untuk CLI/operator operations yang memang memerlukannya.
- Tidak ada bukti package script default otomatis memilih Direct URL untuk runtime.

## D. Prisma

- Provider PostgreSQL.
- Root schema: prisma/schema.prisma, datasource DATABASE_URL.
- Production schema: prisma/production/schema.prisma, datasource DATABASE_URL.
- Runtime client: singleton Prisma Client di src/lib/prisma.ts.
- VERIFIED PASS: metadata/read probe Direct dan Pooler, db:verify, overview, serta physical schema checks.
- VERIFIED PASS: npm run db:validate.
- VERIFIED PASS: npm run db:generate setelah dev server dihentikan serially. Percobaan saat DLL sedang dikunci dev server sempat EPERM; itu local tooling lock, bukan database failure.

## E. Admin Bootstrap

Script baru: scripts/create-admin.mjs. Command package: admin:create.

Command operator:
npm run admin:create -- --email "admin@example.com" --password "<operator-supplied-password>" --name "Administrator"

Safety behavior:
- Membaca DATABASE_URL dan memvalidasi PostgreSQL Supabase endpoint, SSL, pooler pgbouncer, dan current schema public sebelum write.
- Normalisasi email sama dengan Auth.js: trim dan lowercase.
- Menolak email invalid, name kosong/terlalu panjang, dan password di bawah 12 karakter.
- findUnique duplicate check; user existing tidak di-overwrite dan tidak diubah.
- Hanya jalur user baru yang melakukan satu user.create dengan bcrypt cost 12, role admin, createdAt, dan updatedAt.
- Tidak mencetak password, hash, URL, atau row identifier; disconnect selalu dilakukan.
- VERIFIED: syntax check dan invocation tanpa argumen berhenti sebelum DB access/write.
- BLOCKED — ADMIN NOT CREATED: script tidak dijalankan karena tidak ada credential admin Auth.js yang sah/terotorisasi. Aggregate SELECT menunjukkan users=0 dan admins=0.

## F. Auth.js

- VERIFIED: Credentials provider → Prisma users lookup dengan role admin → bcrypt.compare → JWT/session.
- VERIFIED: JWT expiry dua jam, same-origin redirect, role/session-state revalidation, protected layout/proxy, dan advisory transaction login lock tetap aktif.
- VERIFIED: /login dan guest protected-route boundary.
- BLOCKED — AUTH LOGIN: valid login, session identity, role admin, authenticated dashboard, dan logout end-to-end tidak diuji karena database tidak memiliki admin dan credential E2E Auth.js tidak tersedia.
- Supabase Auth tidak digunakan.
- Password reset tidak diuji atau diaktifkan.

## G. Data Verification

- VERIFIED PASS: db:verify membaca 3 units, 636 coal consumption rows, dan 212 coal stock rows; coal quality, power generation, dan KPI target table kosong; orphan checks lulus.
- VERIFIED PASS: db:verify-overview membaca normalized PostgreSQL data, Unit 1–3, 31 daily series rows, dan baseline KPI Juli 2026.
- VERIFIED PASS: getCoalQualityPage untuk base, on_spec, perhatian, off_spec, dan pagination. Karena tabel kosong, total/status 0, records 0, average GAR null, latest date null, totalPages 0.
- VERIFIED source: active filter scope digunakan untuk rows, total, status counts, average, latest, dan pagination.
- VERIFIED source: importer coal menulis consumed dan closingStock; openingStock serta daily received belum tersedia di current import plan.
- VERIFIED source: empty/unparseable menjadi null; explicit numeric zero tetap 0.
- db:verify-import-data FAIL karena fixture lama mengharapkan 7 biomass receipt rows, sedangkan database memiliki 49. Ini dicatat sebagai fixture/data-contract drift; tidak ada data yang diubah.

## H. Migration History

Root/Laravel history:
- prisma/migrations berisi no-op existing Laravel baseline dan migration additive untuk import domain, coal receipts, sync state, serta schema snapshot.
- Root prisma migrate status terhadap Supabase FAIL: lima migration root tidak tercatat applied, sedangkan database mencatat production baseline yang tidak ada pada root history.

Production history:
- prisma/production/migrations berisi full-schema baseline 20260901130000_production_schema_baseline.
- Physical schema Supabase cocok: 30 tabel aplikasi, 270 kolom, 30 PK, 19 FK, dan 40 index.

Supabase _prisma_migrations:
- VERIFIED: production baseline row ada, finished, dan tidak rolled back.
- Production migrate status melaporkan up to date/no pending migrations.
- BLOCKED: checksum berbeda. Repository/artifact: 309d076106d4de2127733401909fffc1af77bf8cf8c92e7a324b68462ccf60af. Database: f029c5644c9f8f17040039148df423d0619399d4ca12fbf3a575c8c26a7d177c.
- Source discrepancy: evidence menunjuk pada copied/generated baseline artifact saat deployment sebelumnya; exact historical content delta UNKNOWN. Migration file repository saat ini sama dengan executable artifact body.
- Risk: migration history tidak reproducible; operasi migration berikutnya dapat mendeteksi checksum drift meskipun physical schema cocok.
- Remediation: bandingkan artifact deployment asli, tetapkan body canonical, lalu lakukan reconciliation terotorisasi. Jangan rewrite SQL atau memakai migrate resolve hanya untuk menghilangkan warning.

Decision matrix:
- RECOMMENDED Option C — separate histories intentionally maintained.
- Production history dipakai eksplisit untuk Supabase saat ini; root history dipertahankan untuk database Laravel/legacy dan tidak dijalankan terhadap Supabase.
- CI/Vercel migration path masih UNKNOWN dan harus diverifikasi.

## I. Resend / Password Reset

Resend: NOT USED
Password reset: DISABLED
Supabase Auth: NOT USED

- Dependency, mail verifier, dan PasswordResetToken model dipertahankan sebagai code path/cleanup candidate.
- npm run mail:verify hanya memakai fixture/mock; realEmail=NOT_REQUESTED.
- Tidak ada email/API request atau feature enablement.

## J. Security

| Artifact | Status | Evidence |
| --- | --- | --- |
| .env.local | IGNORED / UNTRACKED | .gitignore, git check-ignore, git ls-files |
| .env.e2e.local | IGNORED / UNTRACKED | .gitignore, git check-ignore, git ls-files |
| credentials/*.json | IGNORED / UNTRACKED | credentials/ ignored; no tracked entries |
| .next/ | IGNORED / UNTRACKED | .gitignore, git check-ignore, git ls-files |
| .next/static | VERIFIED CLEAN | no private-key header, PostgreSQL URL, AUTH_SECRET, CRON_SECRET, atau Google private-key marker |
| .next/dev/cache | LOCAL GENERATED ARTIFACT | marker database URL/secret names ada; private-key header tidak ada; jangan dipaketkan/dibagikan |

Tidak ada credential value, password, hash, token, atau full connection string di laporan. Tidak ada confirmed literal provider/database credential pada audit Git/docs Phase 3.

## K. Regression Tests

| Check | Result | Evidence |
| --- | --- | --- |
| npm install | PASS | up to date |
| lint | PASS | npm run lint |
| TypeScript | PASS | npx --no-install tsc --noEmit --incremental false |
| Prisma generate | PASS | serial retry setelah DLL lock dilepas |
| Prisma validate | PASS | npm run db:validate |
| DB connection | PASS | npm run db:verify, Pooler, read-only |
| Supabase schema | PASS physical / BLOCKED history | structure PASS; checksum drift |
| Admin bootstrap | BLOCKED | script/guard tested; not executed |
| Auth.js login | BLOCKED | admin credential/user unavailable |
| Protected dashboard | PASS guest boundary / BLOCKED authenticated | guest redirect; no admin |
| Build | PASS | npm run build |
| npm run dev | PASS | elevated server port 3000; smoke checks |
| db:verify-import-schema | FAIL known | root-oriented verifier expects Laravel migration rows |
| db:verify-import-data | FAIL known | fixture expects 7; actual 49 |
| db:verify-overview | PASS | normalized dashboard verification |
| Auth/security verifiers | PASS static | E2E environment unavailable |
| Sync/security verifiers | PASS | cron, retry, admission, schema, preview safety, Google config, mapping, dynamic, env |
| Resend verifier | PASS | mock/fixture only |

Node warnings tentang experimental loader dan MODULE_TYPELESS_PACKAGE_JSON VERIFIED sebagai tooling warnings; build/runtime tetap lulus dan tidak menjadi blocker.

## L. Source Changes

scripts/create-admin.mjs
- Problem: tidak ada provisioning path aman untuk admin pertama.
- Evidence: database users/admins kosong.
- Change: guarded argument parsing, Supabase/public-schema check, duplicate no-overwrite, bcrypt, one explicit create, safe error, clean disconnect.
- Risk: satu INSERT hanya bila operator menjalankan command manual; tidak dijalankan Phase 4.
- Verification: node --check PASS dan missing-argument guard berhenti sebelum DB access.

package.json
- Problem: tidak ada admin:create; db:verify-import-schema tidak memuat .env.local secara eksplisit.
- Change: menambah admin:create dan env-file loading untuk import-schema verifier.
- Risk: admin command write-capable hanya pada explicit invocation; verifier tetap read-only.
- Verification: npm install, lint, TypeScript, Prisma checks, DB verification, dan build PASS.

docs/PHASE4_RUNTIME_AUTH_MIGRATION_2026-09-02.md
- Laporan Phase 4 ini ditambahkan.
- Perubahan Phase 1–3 lainnya tidak disentuh.

## M. Remaining Blockers

BLOCKER
- Tidak ada admin Auth.js di Supabase users; actual login dan authenticated dashboard belum dapat diuji.
- Production baseline checksum berbeda dari repository artifact; migration history perlu rekonsiliasi operator.

HIGH
- Konfirmasi CI/Vercel memilih production history dan tidak menjalankan root Laravel migrations terhadap Supabase.
- Rekonsiliasi fixture/data-contract 49 versus 7 biomass receipts.
- Verifikasi live Vercel deployment/cron dan Google Sheets read.

MEDIUM
- coal_quality, power_generation, dan kpi_targets kosong; business completeness perlu konfirmasi owner.
- .next/dev/cache harus tetap lokal dan tidak dibagikan.

LOW
- Node module-type warnings adalah cleanup kosmetik.
- Resend/password-reset cleanup dapat dilakukan fase berikutnya tanpa mengaktifkan fitur.

UNKNOWN
- Exact historical SQL body untuk checksum database.
- Actual Vercel/CI migration command dan environment values.
- Valid operator-owned Auth.js test credential.

## N. Final Assessment

CONDITIONAL — NOT PRODUCTION-READY YET.

Runtime path DATABASE_URL → Supabase Pooler → Prisma → PostgreSQL sekarang terverifikasi. Direct URL usage terdokumentasi, physical schema kompatibel, bootstrap admin opt-in tersedia, dan build/dev/regression boundaries sehat. Production readiness masih conditional karena database tidak memiliki admin, migration checksum/history belum direkonsiliasi, sebagian verifier memakai fixture lama, dan live Vercel/Google state belum diverifikasi.

Tidak terjadi migration, reset, schema modification, deletion, external write, credential rotation, Supabase Auth activation, Resend activation, atau password-reset activation pada Phase 4.
