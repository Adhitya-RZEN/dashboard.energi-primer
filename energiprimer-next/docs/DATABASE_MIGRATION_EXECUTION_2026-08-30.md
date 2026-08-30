# Database Migration Execution Report

Tanggal: 2026-08-30  
> **Current execution update:** schema additive, staging, transactional commit, parity lokal, dan dashboard cutover code path sudah dijalankan pada database lokal yang disetujui. Coverage data yang tervalidasi adalah Juli 2026. Laravel, credential, dan `.env.local` tidak diubah; production deployment dan scheduler belum dijalankan.

Scope: baseline, parser, additive schema, local import, parity, dan dashboard cutover  
Status: **LOCAL MIGRATION, IMPORT, PARITY, DAN CUTOVER PASS — PRODUCTION DEPLOYMENT BELUM DIJALANKAN**

> Status authoritative: migration additive, import, parity, dan code cutover lokal sudah PASS. Status awal di bagian atas dokumen adalah catatan sebelum persetujuan user.

## 1. Batas eksekusi

Tahap yang dijalankan:

- audit struktur dan konfigurasi project;
- validasi Prisma;
- pembacaan schema PostgreSQL dengan introspection read-only;
- verifikasi row count dan relasi existing;
- static semantic parser test;
- live read-only Google Sheets test;
- dry-run importer;
- migration baseline dan additive pada database lokal yang disetujui;
- staging dan transactional import Juli 2026;
- idempotency import ulang;
- parity PostgreSQL terhadap baseline Google Sheets;
- cutover code path dashboard ke PostgreSQL;
- regression lint, TypeScript, dan build.

Tidak dijalankan:

- `prisma db push` tidak dijalankan; migration dikelola melalui `prisma migrate deploy`;
- operasi destructive (`DROP`, destructive `ALTER`, atau penghapusan data);
- scheduler production.

Laravel, credential, dan `.env.local` tidak diubah. Database lokal menerima migration additive dan row import yang disetujui.

## 2. Perintah dan hasil

| Pemeriksaan | Hasil |
|---|---|
| `node --env-file=.env.local scripts/verify-db.mjs` | PASS |
| `node --env-file=.env.local node_modules/prisma/build/index.js validate` | PASS |
| `npm.cmd run dynamic:verify` | PASS |
| Dynamic parser live verification | PASS |
| `npm.cmd run sheets:dry-run -- --month=7 --year=2026` | PASS |
| `prisma migrate deploy` (local, additive) | PASS |
| `prisma generate` | PASS |
| `sheets:import --month=7 --year=2026 --commit` | PASS (run 3 dan run 4) |
| `db:verify-import-schema` | PASS |
| `db:verify-import-data` | PASS |
| `db:verify-overview` | PASS |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS |

`npm` PowerShell sempat terhalang execution policy lokal; command dijalankan ulang melalui `npm.cmd` tanpa mengubah policy sistem.

## 3. PostgreSQL baseline

Database yang terbaca adalah PostgreSQL existing pada schema `public`.

| Tabel/domain | Jumlah |
|---|---:|
| Units | 3 |
| Coal quality | 1095 |
| Coal consumption | 1095 |
| Coal stock | 365 |
| Power generation | 1095 |
| KPI targets | 1095 |

Pemeriksaan yang lulus:

- koneksi Prisma dan pembacaan tabel;
- kesetaraan agregasi kualitas dengan query pembanding;
- tidak ditemukan orphan relationship pada foreign key unit yang diperiksa.

Introspection juga menemukan tabel framework Laravel `migrations`. Tabel tersebut belum menjadi model domain dan tidak perlu diubah sebagai bagian dari dry-run.

## 4. Google Sheets live baseline

Koreksi data owner: identitas unit operasional yang benar adalah Unit 1, Unit 2, dan Unit 3. Jika label blok ketiga terbaca sebagai duplicate/typo Unit 2, parser menormalisasikannya sebagai Unit 3 berdasarkan urutan blok.

Worksheet yang diuji:

```text
Juli26-BB
```

Hasil pembacaan:

- worksheet requested dan effective sama;
- tidak menggunakan fallback worksheet;
- 11.594 cell ter-scan;
- 31 data harian, tanggal 2026-07-01 sampai 2026-07-31;
- 7/7 supplier penerimaan Biomassa terdeteksi;
- parser errors: 0;
- unresolved fields: 0;
- ambiguous fields: 0.

Warning non-blocking yang tetap dicatat:

1. Label Unit 3 terdeteksi sebagai duplicate/typo Unit 2 dan dipetakan berdasarkan urutan blok Unit 1–3.
2. Kandidat total dashboard Biomassa berbeda dari agregat Unit 1–3; parser mempertahankan agregat Unit 1–3 sesuai definisi yang telah divalidasi.

## 5. Dry-run normalized preview

| Metric | Nilai |
|---|---:|
| Penerimaan Biomassa tujuh supplier | 3223.46 ton |
| Pemakaian Biomassa bulanan | 3740.65 ton |
| Target Biomassa 2026 | 70020 ton |
| Realisasi kumulatif | 29103.77 ton |
| Progress target | 41.564938588974584% |

Rencana baris yang hanya dihitung untuk preview:

| Entitas | Jumlah rencana |
|---|---:|
| Biomassa receipt supplier | 7 |
| Biomassa daily unit values | 93 |
| Coal receipt periode | 1 |
| Coal consumption Unit 1–3 | 93 |
| Coal stock harian | 31 |
| Solar consumption harian | 31 |
| Solar receipt periode | 1 |
| HOP Unit 1–3 | 93 |
| Target Biomassa | 1 |
| Cumulative Biomassa | 1 |
| **Total** | **352** |

Jumlah tersebut menjadi gate import dan kemudian berhasil ditulis secara transaksional
ke database lokal setelah persetujuan diberikan.

## 6. Verifikasi target Biomassa

Target parser sama dengan target yang disetujui:

```text
parsed target   = 70020
approved target = 70020
```

Target dapat dilanjutkan ke tahap schema review. Bila worksheet periode lain berisi target berbeda, importer harus menghasilkan `NEEDS_REVIEW` dan tidak melakukan overwrite otomatis.

## 7. Files yang ditambahkan/diperbarui pada safe stage

- `scripts/dry-run-google-sheets-import.ts`
- `scripts/import-google-sheets.ts`
- `scripts/verify-import-data.mjs`
- `scripts/verify-import-schema.mjs`
- `scripts/verify-postgres-overview.ts`
- `src/services/google-sheets/import/`
- `src/services/overview-postgres.ts`
- `prisma/schema.prisma` dan additive migrations
- `package.json` — menambahkan command `sheets:dry-run`
- `docs/FULL_DATABASE_MIGRATION_PLAN.md`
- `docs/DATABASE_IMPORT_TEST_PLAN.md`
- `docs/DATABASE_MIGRATION_EXECUTION_2026-08-30.md`

Tidak ada file Laravel, credential, atau `.env.local` yang diubah. `prisma/schema.prisma`
dan database lokal berubah hanya melalui schema additive yang tercatat pada migration.

## 8. Temuan dan keputusan eksekusi

1. Kontrak row-level supplier sudah diterapkan untuk tujuh supplier Biomassa.
2. Natural key dan upsert idempotent sudah diterapkan pada normalized tables serta tabel existing coal yang menjadi target import.
3. Schema additive Biomassa, Solar, HOP, target, cumulative, coal receipt, import run, dan staging sudah diterapkan.
4. Target 2026 dikunci melalui validation gate pada `70020` ton.
5. Precision `coal_consumption` existing adalah `NUMERIC(12,2)`; perbedaan terhadap source tiga desimal tetap didokumentasikan.

Remaining items adalah import periode berikutnya, review precision jika tiga desimal diwajibkan,
connection pooling/SSL production, scheduler, dan freshness monitoring.

## 9. Status tahap

| Tahap | Status |
|---|---|
| Baseline read-only | PASS |
| Data contract preliminary | PASS dengan 2 warning sumber |
| Parser/dry-run | PASS |
| Target 70020 validation | PASS |
| Additive schema lokal | PASS |
| Staging import lokal | PASS |
| Transactional commit lokal | PASS |
| Idempotency import ulang | PASS |
| Parity database lokal | PASS dengan precision note coal |
| Dashboard cutover lokal | PASS |
| Production deployment | NOT EXECUTED |

## 10. Regression build gate

Production build berhasil setelah importer, data service, dan chart rendering diperbarui:

- lint: PASS;
- TypeScript: PASS;
- production build: PASS;
- route generation: PASS untuk route yang sudah tersedia.

Build tidak menjalankan import dan tidak menulis database.

## Current execution results

### Migration history lokal

1. `0_baseline_existing_laravel_schema` - no-op Prisma baseline; tidak membuat ulang atau mengubah tabel Laravel existing.
2. `20260830140000_add_dashboard_import_domain` - tabel normalized Biomassa, Solar, HOP, target, cumulative, import run, dan staging.
3. `20260830150000_add_coal_receipts` - tabel receipt coal pada grain periode.

Tidak ada statement `DROP`, `DELETE`, atau destructive `ALTER`. Tabel existing `units`, `coal_consumption`, dan `coal_stock` menerima data Juli 2026 melalui upsert natural key setelah dry-run lulus. `coal_consumption` mempertahankan precision existing `NUMERIC(12,2)`, sehingga nilai source 3 desimal mengalami pembulatan pada batas storage.

### Import and parity

- run 3: `SUCCESS`, 352 validated rows;
- run 4: `SUCCESS`, 352 validated rows;
- normalized rows tidak bertambah saat run kedua;
- staging: 1.158 row untuk empat run (dua run awal 227 row dan dua run current 352 row);
- PostgreSQL Overview service: `PASS` untuk Juli 2026.

| Metric | PostgreSQL result | Baseline |
|---|---:|---:|
| Biomassa receipt tujuh supplier | 3223.46 ton | 3223.46 ton |
| Biomassa consumption | 3740.65 ton | 3740.65 ton |
| Solar consumption | 24274 liter | 24274 liter |
| Solar receipt | 25000 liter | 25000 liter |
| Target Biomassa | 70020 ton | 70020 ton |
| Cumulative | 29103.77 ton | 29103.77 ton |
| Progress | 41.564938588974584% | 41.564938588974584% |
| Biomassa Unit 1/2/3 hari 28 | 74.8 / 47.6 / 61.2 ton | sama |

Dashboard source selection:

- default: PostgreSQL normalized data;
- `DASHBOARD_DATA_SOURCE=postgres`: PostgreSQL eksplisit;
- `DASHBOARD_DATA_SOURCE=google`: jalur Google Sheets legacy untuk rollback/dual-read bila konfigurasi tersedia.

### Remaining work

1. Import dan parity periode berikutnya harus dilakukan dengan dry-run yang sama.
2. Precision coal legacy perlu diterima atau direview bila parity tiga desimal diwajibkan.
3. Connection pooling/SSL production, scheduler, dan freshness monitoring belum dikonfigurasi.
4. Production deployment belum dilakukan.

## 11. Kesimpulan

Tahap lokal yang disetujui telah selesai: baseline, parser, schema additive, staging,
transactional import, idempotency, parity, dan dashboard cutover lulus. Unit operasional
yang digunakan adalah Unit 1, Unit 2, dan Unit 3. Tidak ada operasi destructive.

**Overall status: LOCAL MIGRATION PASS — PRODUCTION DEPLOYMENT NOT EXECUTED.**
