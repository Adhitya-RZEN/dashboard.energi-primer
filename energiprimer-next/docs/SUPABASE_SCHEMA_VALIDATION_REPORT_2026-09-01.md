# PHASE 21D — PRODUCTION SCHEMA MIGRATION VALIDATION

Tanggal: 2026-09-01  
Status: **PASS — READY_FOR_SUPABASE_SCHEMA_MIGRATION**

Phase ini hanya memvalidasi baseline pada database disposable. Tidak ada
migration terhadap Supabase production, import business data, Google Sheets
sync, perubahan `DATABASE_URL`, atau deployment.

## Final result

| Check | Hasil |
| --- | --- |
| Baseline artifact | `docs/SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql` |
| Prisma models | 30 |
| Tables | 30/30 |
| Columns | 270/270 |
| Primary keys | 30/30 |
| Foreign keys | 19/19 |
| Foreign keys and relation actions | PASS |
| Non-primary indexes | 40/40 |
| Unique indexes | 20/20 |
| Defaults | PASS |
| Nullable/non-nullable | PASS |
| Numeric precision/scale | PASS |
| Date/timestamp types | PASS |
| Prisma schema validation | PASS |
| Prisma read-only schema diff | PASS — exit code 0 |
| Disposable database empty after apply | PASS — 0 rows |
| Local `dashboard_pln` | UNCHANGED |
| Supabase | UNCHANGED |
| Business data migration | NOT RUN |
| Google Sheets | NOT RUN |
| Production migration | NOT RUN |
| Deployment | NOT RUN |

## Disposable database validation

Disposable PostgreSQL dibuat pada local PostgreSQL instance yang sama, tetapi
menggunakan database baru yang terpisah dari `dashboard_pln`. Script menolak
URL non-loopback sehingga tidak dapat secara tidak sengaja memakai Supabase
atau database remote.

Command yang dijalankan:

```text
node --env-file=.env.local scripts/validate-production-schema-disposable.mjs
```

Hasil penting:

```text
status                  PASS
appliedStatements       90
tables                  30/30
columns                 270/270
primaryKeys             30/30
foreignKeys             19/19
nonPrimaryIndexes       40/40
uniqueIndexes           20/20
businessRows            0
prismaCompatibility     true
disposable cleanup      PASS
```

90 statement terdiri dari 1 schema statement, 30 `CREATE TABLE`, 40 index,
dan 19 foreign key. DDL tersebut hanya dijalankan pada database disposable.
Tidak ada `INSERT`, `UPDATE`, `DELETE`, `DROP`, atau `TRUNCATE` terhadap
database aplikasi. `DROP DATABASE` cleanup hanya menargetkan database
disposable unik yang dibuat oleh script tersebut setelah validasi selesai.

Tidak ada user production, dashboard data, Google Sheets data, sync data,
credential, atau production record pada database disposable.

## Artifact review

Artifact dihasilkan dari `prisma/schema.prisma` menggunakan Prisma 6.19.3 dan
berstatus non-deployable:

[SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql](./SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql)

Validator statis:

[verify-production-schema-baseline-design.mjs](../scripts/verify-production-schema-baseline-design.mjs)

Validator memastikan:

- semua 30 model memiliki tabel yang sesuai;
- artifact berada di luar `prisma/migrations`;
- 30 table, 40 index, dan 19 FK terdeteksi;
- setiap model memiliki field yang direpresentasikan artifact;
- tidak ada `BIOMASS_STOCK`;
- tidak ada operasi data/destruktif pada artifact.

Validasi disposable menambahkan pemeriksaan runtime untuk 270 kolom,
nullability, default presence, PostgreSQL type/precision, primary key, foreign
key, action, index, Prisma diff, dan row count.

Inventory field lengkap, mapping, dependency graph, dan precision tersedia pada
[SUPABASE_SCHEMA_BASELINE_DESIGN_2026-09-01.md](./SUPABASE_SCHEMA_BASELINE_DESIGN_2026-09-01.md).

## Migration history strategy

Migration history existing tidak diubah. Entry
`0_baseline_existing_laravel_schema` tetap diperlakukan sebagai historical/no-op
karena tidak membuat schema Laravel. Lima migration existing valid untuk local
database yang sudah memiliki tabel legacy, tetapi tidak standalone untuk target
Supabase kosong.

Strategi production yang divalidasi adalah **clean full baseline history**:

1. gunakan artifact penuh ini sebagai candidate initial schema;
2. package ke production migration history baru yang telah disetujui;
3. jangan menaruhnya berdampingan dengan history lama pada deployment yang sama,
   karena migration lama akan tetap dicoba dan berpotensi membuat duplicate
   object atau gagal dependency;
4. validasi ulang candidate pada disposable target sebelum deployment;
5. schema migration Supabase baru boleh dipertimbangkan setelah manual approval
   dan gate deployment terpisah.

Artifact ini **belum** dipindahkan ke `prisma/migrations` dan belum dijalankan
terhadap Supabase.

## Local safety check

Local verification sebelum dan sesudah disposable test tetap menunjukkan:

- database `dashboard_pln` dapat dibaca melalui Prisma;
- 3 unit tersedia;
- `coal_quality`: 1.095 rows;
- `coal_consumption`: 1.731 rows;
- `coal_stock`: 577 rows;
- `power_generation`: 1.095 rows;
- `kpi_targets`: 1.095 rows;
- relationship orphan check: 0;
- baseline keseluruhan tetap 2.409 verified rows;
- duplicate: 0;
- Unit: Unit 1–3;
- Target Biomassa: 70.020 ton.

`db:verify` hanya melakukan SELECT/Prisma read dan lulus setelah disposable
cleanup. `DATABASE_URL` file tidak diubah.

## Rollback/recovery plan

Tidak ada down migration otomatis yang dibuat. Sebelum schema migration nyata:

- ambil backup/snapshot Supabase dan checksum;
- lakukan deploy lebih dulu pada disposable target;
- jika migration gagal, hentikan proses dan inspeksi `_prisma_migrations`;
- jangan menjalankan `prisma migrate reset`, `DROP`, atau `TRUNCATE` otomatis pada
  target bersama;
- gunakan restore/snapshot atau prosedur recovery manual yang disetujui;
- mulai data migration hanya setelah schema parity dan smoke test lulus.

Pembuatan rollback destruktif atau perubahan migration history production tetap
memerlukan **REQUIRES MANUAL APPROVAL**.

## Validation commands

Semua command berikut lulus tanpa perubahan database aplikasi:

```text
node scripts/verify-production-schema-baseline-design.mjs   PASS
node --env-file=.env.local scripts/validate-production-schema-disposable.mjs PASS
node --env-file-if-exists=.env.local node_modules/prisma/build/index.js validate --schema=prisma/schema.prisma PASS
npx tsc --noEmit                                           PASS
npm run lint                                               PASS
npm run build                                              PASS
node --env-file-if-exists=.env.local scripts/verify-db.mjs PASS
```

## Final status and stop condition

**READY_FOR_SUPABASE_SCHEMA_MIGRATION** berarti baseline telah terbukti dapat
membangun schema kosong dan siap masuk ke gate approval berikutnya; status ini
bukan izin untuk menjalankan migration sekarang.

Setelah Phase 21D, proses berhenti. Jangan menjalankan schema migration ke
Supabase, data migration, Google Sheets import/sync, perubahan production
`DATABASE_URL`, atau Vercel deployment sampai user memberikan approval manual
dan production migration history telah dipackage secara resmi.
