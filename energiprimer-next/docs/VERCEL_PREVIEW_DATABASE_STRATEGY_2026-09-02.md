# Phase 22G.2 — Preview Database Strategy & Provisioning

Tanggal: 2026-09-02  
Scope: strategi dan audit database Vercel Preview.  
Tidak ada provisioning, migration, seed, import, sync, deployment, atau database write.

## Current Situation

Phase 22G.1 telah menambahkan public Supabase Auth E2E variables ke environment Preview Vercel. Database Preview masih menjadi blocker.

Temuan terbaru:

- Project Vercel dashboard-energi-primer tersedia.
- Root Directory project: energiprimer-next.
- Environment Preview memiliki entry DATABASE_URL, tetapi targetnya tersembunyi dan belum dapat diklasifikasikan non-production.
- DATABASE_URL pada environment E2E lokal saat ini diklasifikasikan sebagai LOCAL. Datasource tersebut tidak dapat dijangkau oleh Vercel.
- Tidak ditemukan datasource PostgreSQL remote non-production yang sudah terkonfirmasi memiliki schema dan data dashboard.
- Production DATABASE_URL tidak digunakan dan tidak boleh dijadikan fallback.

Kesimpulan: belum ada Preview PostgreSQL target yang aman dan terverifikasi untuk Vercel.

## Existing Local Database

Database lokal existing hanya boleh dipakai sebagai source untuk controlled copy di masa berikutnya.

Baseline audit sebelumnya:

- PostgreSQL 18.4.
- Database dashboard_pln.
- 32 public tables.
- 13.724 total public rows.
- 30 Prisma models.
- 2.409 verified application/import rows pada baseline historis.
- Dashboard overview query: PASS.
- Unit operasional: Unit 1, Unit 2, Unit 3.
- Target Biomassa: 70.020 ton.

Status source database: AVAILABLE AS SOURCE ONLY.

Tidak ada perubahan, delete, write, export Production, atau copy yang dilakukan pada phase ini.

## Candidate Preview Database

| Candidate | Vercel reachable | Schema/data verified | Status |
| --- | --- | --- | --- |
| Local PostgreSQL dashboard_pln | NO | YES dari audit lokal | NOT A VERCEL CANDIDATE |
| Supabase E2E database | UNKNOWN | NO | CANDIDATE UNVERIFIED |
| Vercel Preview DATABASE_URL entry | UNKNOWN | NO; target hidden | TARGET UNVERIFIED |
| Dedicated hosted PostgreSQL non-production | NOT FOUND | NO | NOT PROVISIONED |

Supabase E2E Auth project secara konseptual dapat menjadi kandidat database non-production, tetapi koneksi database, schema aplikasi, data dashboard, dan reachability dari Vercel belum terverifikasi sebagai satu target yang sama. Environment E2E yang dipakai saat ini menunjuk datasource lokal, bukan database remote Vercel.

Status: PREVIEW_DATABASE_NOT_PROVISIONED.

## Architecture

Target arsitektur yang disarankan:

    Local PostgreSQL
          |
          | controlled, sanitized copy
          v
    Preview PostgreSQL non-production
          |
          | Preview DATABASE_URL
          v
    Vercel Preview
          |
          +--> Supabase Auth E2E/non-production
          |
          +--> Prisma server-only
                    |
                    v
             Dashboard business data

Authentication dan business database tetap dipisahkan:

- Supabase Auth E2E menangani identity/session.
- PostgreSQL Preview menangani business data dashboard.
- Browser tidak mengakses PostgreSQL secara langsung.

## Security Boundary

Aturan yang berlaku:

- Local PostgreSQL adalah source only.
- Production PostgreSQL dan Production Supabase tidak boleh dibaca atau ditulis.
- Tidak ada database baru yang dibuat otomatis.
- Tidak ada schema migration, seed, import, atau data copy pada phase ini.
- Tidak ada credential yang dicantumkan dalam dokumentasi.
- Tidak ada DATABASE_URL lengkap yang dicantumkan.

Privacy review terhadap schema lokal menemukan artefak auth legacy yang tidak boleh ikut disalin sebagai business data, termasuk model/table yang berisi:

- User dengan password/remember token.
- PasswordResetToken dengan reset token.
- Session.
- Artefak auth atau token lain bila masih terdapat pada target source.

Karena runtime Auth sekarang menggunakan Supabase Auth, tabel/field legacy tersebut harus dikeluarkan dari controlled business-data copy. Allowlist tabel dan pengecualian sensitif wajib disetujui sebelum import.

## Schema Requirements

Preview PostgreSQL harus kompatibel dengan prisma/schema.prisma tanpa mengubah schema pada phase ini.

Minimum requirement:

- 30 Prisma models.
- Seluruh tabel yang dibutuhkan dashboard.
- Foreign keys.
- Unique constraints.
- Required indexes.
- Expected dashboard tables: coal_consumption, coal_stock, coal_receipts, biomass_receipts, biomass_consumptions, solar_receipts, solar_consumptions, hop_readings, biomass_cumulative_snapshots, dan biomass_targets.

Schema target belum dapat diverifikasi. Migration/schema provisioning harus menjadi tahap terpisah dengan approval manual; tidak dijalankan dalam Phase 22G.2.

## Data Requirements

Preview dashboard harus memiliki data valid yang cukup untuk:

- KPI penerimaan dan pemakaian.
- Chart harian.
- Overview.
- Breakdown Unit 1–3.
- Stock dan HOP.
- Target/performance Biomassa.
- Target Biomassa 70.020 ton.
- Historical period yang diperlukan untuk smoke test.

Business data yang dapat dipertimbangkan untuk controlled copy berasal dari local PostgreSQL existing. Copy harus menggunakan allowlist business tables dan mengecualikan:

- users/auth legacy;
- password/reset token;
- session/token;
- credential/API key/private key;
- data operator yang tidak dibutuhkan dashboard;
- tabel staging atau artefak sementara yang tidak diperlukan runtime.

Tidak boleh membuat dummy data ketika source valid tersedia, dan tidak boleh menyalin data sebelum target serta privacy review disetujui.

## Network Requirements

Preview database harus:

- remote dan persistent;
- dapat dijangkau dari Vercel;
- menggunakan SSL sesuai provider;
- menyediakan DNS/network access dari Vercel;
- tidak menggunakan localhost atau 127.0.0.1;
- menggunakan connection pooling bila provider mensyaratkannya;
- memiliki connection limit yang sesuai runtime serverless.

Jika menggunakan Supabase Transaction Pooler, operator harus menggunakan port 6543 dan parameter pooler/Prisma yang sesuai, termasuk pgbouncer=true bila diwajibkan oleh connection string tersebut.

Reachability dari Vercel belum dapat diuji karena Preview deployment belum dilakukan.

## Prisma Requirements

- Runtime Prisma membaca DATABASE_URL.
- DATABASE_URL Preview harus menunjuk PostgreSQL non-production remote.
- Prisma client tetap server-only.
- Koneksi runtime dan koneksi migration/admin harus dipisahkan bila provider memerlukannya.
- Tidak ada prisma migrate, prisma migrate deploy, prisma db push, seed, atau reset pada phase ini.
- Tidak ada perubahan prisma/schema.prisma.
- Prisma compatibility baru dapat dinyatakan PASS setelah target tersedia dan read-only verification berhasil.

## Provisioning Status

Status provisioning:

PREVIEW_DATABASE_NOT_PROVISIONED

Tidak ada provider yang diprovision otomatis karena:

- provider/target belum dipilih secara eksplisit;
- database target Production tidak boleh digunakan;
- provisioning adalah tindakan eksternal;
- schema creation/migration dan data copy membutuhkan approval terpisah;
- privacy allowlist belum diterapkan pada target.

Tidak ada data yang disalin dari local PostgreSQL ke database lain.

## Production Safety

| Operation | Result |
| --- | --- |
| Production database access | 0 |
| Production database writes | 0 |
| Production migration | 0 |
| Production seed | 0 |
| Production import | 0 |
| Production sync | 0 |
| Production Auth changes | 0 |
| Production deployment | 0 |
| Local source database writes | 0 |
| Preview database provisioning | 0 |
| Preview data copy | 0 |

.env.local tidak dibaca. Tidak ada credential atau connection string yang ditampilkan.

## Blockers

### Primary blocker

BLOCKED — PREVIEW_DATABASE_NOT_AVAILABLE

Belum ada database PostgreSQL non-production remote yang terkonfirmasi:

- dapat dijangkau dari Vercel;
- kompatibel dengan Prisma;
- memiliki schema aplikasi;
- memiliki data dashboard;
- terpisah dari Production.

### Related blocker

PREVIEW_DATABASE_TARGET_UNVERIFIED

Entry DATABASE_URL Preview Vercel tersedia, tetapi target nilainya tersembunyi sehingga tidak aman untuk diasumsikan sebagai non-production. Datasource E2E lokal juga tidak valid sebagai datasource Vercel.

## Recommended Next Action

1. Operator memilih satu target PostgreSQL non-production remote:
   - database non-production khusus pada provider hosted; atau
   - database Supabase E2E yang memang disetujui untuk business data Preview.
2. Operator mengonfigurasi connection secara manual tanpa mengirim credential melalui chat.
3. Lakukan read-only identity, SSL, schema, table, dan reachability preflight dari jalur yang aman.
4. Pisahkan schema migration dari data copy dan minta approval manual untuk keduanya.
5. Terapkan allowlist business tables dan exclude seluruh tabel/field auth legacy serta token/credential.
6. Copy data dari local PostgreSQL hanya setelah target, schema, privacy, dan rollback plan disetujui.
7. Jalankan read-only Prisma dashboard query terhadap Preview database.
8. Setelah seluruh check PASS, ulangi Phase 22G.1/22G untuk deployment Preview.

Preferred strategy: gunakan dedicated non-production PostgreSQL remote yang terisolasi dari Production. Supabase Auth E2E dan business database Preview boleh berada pada provider/project yang sama hanya setelah isolation, schema, data, dan credential boundary diverifikasi.

## Final Status

BLOCKED — PREVIEW_DATABASE_NOT_AVAILABLE

Phase 22G.2 berhenti pada audit dan strategi. Tidak ada database baru dibuat, tidak ada schema/data yang diubah, dan tidak ada deployment Vercel yang dilakukan.

