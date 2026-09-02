# Database Migration — Phase 3

> **Current implementation update 2026-08-30:** schema additive dan importer sudah diterapkan pada database lokal `dashboard_pln`. Import Juli 2026 berhasil dan dashboard dapat diarahkan ke PostgreSQL melalui `DASHBOARD_DATA_SOURCE` (default code path `postgres`; set `google` hanya untuk rollback/dual-read). Tidak ada tabel Laravel existing yang dihapus. Detail command dan hasil ada di [`DATABASE_MIGRATION_EXECUTION_2026-08-30.md`](./DATABASE_MIGRATION_EXECUTION_2026-08-30.md).

## Status dan batasan

- **Status:** data access existing + normalized dashboard import lokal selesai; deployment production belum dijalankan
- **Database target:** PostgreSQL existing, database `dashboard_pln`, schema `public`
- **Schema operation:** migration Prisma additive diterapkan; tidak ada `DROP`, destructive `ALTER`, atau penghapusan data
- **Laravel:** hanya dibaca sebagai source/reference; tidak dimodifikasi
- **Data:** data existing tidak dihapus; data Juli 2026 ditambahkan/upsert setelah dry-run dan parity lulus

Phase 3 menambahkan Prisma sebagai data access layer di Next.js. Schema Prisma
ditulis berdasarkan migration Laravel dan mempertahankan nama tabel/kolom
existing menggunakan `@@map` dan `@map`.

## Migration history policy (Phase 6B)

Repository ini memiliki dua history yang sengaja dipisahkan dan tidak boleh
dipilih berdasarkan kebetulan command berada di root:

- **SUPABASE PRODUCTION:** `prisma/production/schema.prisma`,
  `prisma/production/migrations/`, dan
  `prisma/production/migrations/migration_lock.toml`. Ini adalah history
  canonical untuk database Supabase production.
- **LEGACY/LOCAL ONLY:** `prisma/schema.prisma` dan `prisma/migrations/`.
  History ini merepresentasikan baseline Laravel existing serta migration
  additive lokal. History root tidak aman untuk target Supabase current dan
  tidak boleh dihapus, digabung, di-rename, atau diterapkan ke sana.

Semua command production harus menyebutkan
`--schema prisma/production/schema.prisma` secara eksplisit. Pemeriksaan
read-only yang disediakan untuk operator adalah:

```powershell
npm run supabase:production:migration:preflight
```

Command tersebut memakai `SUPABASE_DIRECT_URL`; `DATABASE_URL` tetap kontrak
runtime aplikasi. Tidak ada migration production yang dijalankan oleh build,
startup, route, atau Vercel cron.

## Implementasi

```text
Next.js Server Components / services
        ↓
src/lib/prisma.ts             # singleton PrismaClient
        ↓
Prisma Client 6.19.3
        ↓
existing PostgreSQL (DATABASE_URL)
```

Files utama:

- `prisma/schema.prisma` — model domain dan tabel sistem.
- `src/lib/prisma.ts` — singleton client untuk server-side use.
- `src/services/units.ts` — unit read queries.
- `src/services/coal-quality.ts` — filtering, pagination, summary, relationship include.
- `src/services/consumption-reports.ts` — aggregate report yang ekuivalen dengan Laravel.
- `scripts/verify-db.mjs` — read-only connection/parity verification.
- `.env.example` — template `DATABASE_URL` tanpa credentials.

Dependency yang ditambahkan:

- `@prisma/client@6.19.3` pada `dependencies` untuk runtime query.
- `prisma@6.19.3` pada `devDependencies` untuk generate/validate schema.

Instalasi npm melaporkan 3 high severity vulnerabilities pada dependency tree.
`npm audit fix --force` tidak dijalankan karena dapat memicu perubahan versi
breaking; perlu ditinjau terpisah sebelum deployment.

Prisma CLI dipakai untuk `generate` dan `validate` pada workflow umum. Untuk
Supabase production, `migrate deploy` hanya boleh dijalankan oleh operator
setelah preflight, backup, change window, review, dan approval lulus; command
deploy canonical harus selalu menunjuk schema production. Phase 6B tidak
menjalankan command tersebut.

## Laravel Model → Prisma Model

| Laravel model          | Prisma model           | PostgreSQL table          | Relationship                                             |
| ---------------------- | ---------------------- | ------------------------- | -------------------------------------------------------- |
| `User`                 | `User`                 | `users`                   | Tidak ada domain relation pada Laravel                   |
| `Unit`                 | `Unit`                 | `units`                   | `Unit` has many quality, consumption, generation, target |
| `CoalStock`            | `CoalStock`            | `coal_stock`              | Tidak ada relation; satu row per tanggal                 |
| `CoalQuality`          | `CoalQuality`          | `coal_quality`            | belongs to `Unit` melalui `unit_id`                      |
| `CoalConsumption`      | `CoalConsumption`      | `coal_consumption`        | belongs to `Unit` melalui `unit_id`                      |
| `PowerGeneration`      | `PowerGeneration`      | `power_generation`        | belongs to `Unit` melalui `unit_id`                      |
| `KpiTarget`            | `KpiTarget`            | `kpi_targets`             | belongs to `Unit` melalui `unit_id`                      |
| `SpreadsheetImportLog` | `SpreadsheetImportLog` | `spreadsheet_import_logs` | Tidak ada relation                                       |

Tabel framework Laravel juga dipetakan untuk menjaga kelengkapan schema:
`PasswordResetToken`, `Session`, `Cache`, `CacheLock`, `Job`, `JobBatch`, dan
`FailedJob`. Mapping tersebut belum dipakai untuk authentication atau queue.

## Laravel table → PostgreSQL/Prisma mapping

| Table                     | Key fields                             | Prisma type mapping                  | Constraint yang dipertahankan          |
| ------------------------- | -------------------------------------- | ------------------------------------ | -------------------------------------- |
| `units`                   | `id`, `code`, `name`, `status`         | `BigInt`, `String`, `Boolean`        | PK `id`, unique `code`                 |
| `coal_stock`              | `date`, stock amounts                  | `Date`, `Decimal(12,2)`              | unique `date`                          |
| `coal_quality`            | `unit_id`, `date`, GAR metrics         | `BigInt`, `Date`, nullable Decimal   | unique `(unit_id,date)`, FK ke `units` |
| `coal_consumption`        | `unit_id`, `date`, consumption metrics | `BigInt`, `Date`, nullable Decimal   | unique `(unit_id,date)`, FK ke `units` |
| `power_generation`        | `unit_id`, `date`, load/generation     | `BigInt`, `Date`, nullable Decimal   | unique `(unit_id,date)`, FK ke `units` |
| `kpi_targets`             | `unit_id`, `date`, SFC/heat rate       | `BigInt`, `Date`, nullable Decimal   | unique `(unit_id,date)`, FK ke `units` |
| `spreadsheet_import_logs` | source/status/import metadata          | `String`, `Int`, nullable `DateTime` | tidak ada unique tambahan              |

Tabel normalized yang ditambahkan pada eksekusi lokal: `biomass_receipts`, `biomass_consumptions`, `coal_receipts`, `solar_receipts`, `solar_consumptions`, `hop_readings`, `biomass_targets`, `biomass_cumulative_snapshots`, serta `spreadsheet_import_runs` dan `spreadsheet_import_staging`. Tabel `coal_consumption` dan `coal_stock` existing dipakai untuk coverage Juli 2026.

Semua kolom `created_at` dan `updated_at` dipetakan sebagai nullable
`DateTime` karena migration Laravel memakai `$table->timestamps()`.
Decimal tidak dikonversi ke JavaScript `number` di service utama; Prisma
`Decimal` dipertahankan untuk menghindari kehilangan presisi.

## Relationship mapping

```text
Unit 1 ──── * CoalQuality
Unit 1 ──── * CoalConsumption
Unit 1 ──── * PowerGeneration
Unit 1 ──── * KpiTarget
```

Foreign key mengikuti Laravel `constrained('units')->cascadeOnDelete()`.
Phase 3 tidak menjalankan penghapusan; aturan cascade hanya direpresentasikan
di client schema untuk mencerminkan database existing.

`sessions.user_id` hanya memiliki index pada migration Laravel, bukan foreign
key eksplisit, sehingga tidak dibuat sebagai Prisma relation ke `User`.

## Query mapping

### Unit list

Laravel:

```php
Unit::orderBy('name')->get();
```

Next.js: `listUnits()` memakai `prisma.unit.findMany`, order `name asc`, dan
select hanya `id`, `code`, `name`, `status`. `listActiveUnits()` menambahkan
filter `status = true`.

### Coal quality summary dan listing

Laravel `CoalDataController@index` melakukan:

- total record `coal_quality`;
- status GAR: On Spec `>= 4700`, Perhatian `4500 <= GAR < 4700`, Off Spec `< 4500`;
- average GAR dibulatkan ke 0;
- filter tanggal, unit, dan status;
- join `units` untuk nama unit;
- order tanggal descending lalu nama unit;
- pagination 15 record.

Next.js: `getCoalQualityPage()` mempertahankan aturan tersebut dengan Prisma
`count`, `aggregate`, `findMany`, relation include, `skip`, dan `take`.
`page` minimal 1, `perPage` dibatasi 1–100 agar boundary service aman.
Summary tetap global seperti Laravel; filter hanya diterapkan ke listing.

### Monthly consumption report

Laravel `LaporanController@index` memakai PostgreSQL aggregate:

- grouping `YYYY-MM`;
- `SUM(coal_used)`;
- `AVG(boiler_efficiency)`, `AVG(heat_rate)`, `AVG(sfc)`;
- jumlah hari distinct;
- summary dataset keseluruhan.

Next.js: `listMonthlyConsumptionReports()` dan `getConsumptionSummary()` memakai
`prisma.$queryRaw` dengan `Prisma.sql` dan result type eksplisit. Query
PostgreSQL dipertahankan karena Laravel memang menggunakan `TO_CHAR`,
`EXTRACT`, cast numeric, dan `ROUND`. Query tidak menerima input user pada
fungsi ini, sehingga tidak ada interpolasi SQL dinamis.

### Dashboard source of truth

Dashboard Next.js aktif membaca PostgreSQL normalized melalui
`src/services/overview-postgres.ts`. Google Sheets tetap menjadi input
importer server-side dan rollback path eksplisit, bukan source default dashboard.

## Read verification (baseline sebelum import Juli 2026)

Command:

```text
npm run db:verify
```

Hasil terhadap database existing:

```text
status: PASS
database: dashboard_pln
schema: public
units: 3
coal_quality: 1095
coal_consumption: 1095
coal_stock: 365
power_generation: 1095
kpi_targets: 1095
quality total: 1095
quality on_spec: 0
quality perhatian: 0
quality off_spec: 1095
quality average_gar: 4350
```

Verification juga membandingkan summary Prisma dengan query PostgreSQL yang
merepresentasikan kondisi `CoalDataController`, serta memeriksa orphan
relationship pada `coal_quality`, `coal_consumption`, `power_generation`, dan
`kpi_targets`; seluruhnya lulus.

Script pada baseline ini hanya menjalankan `SELECT` dan Prisma read methods. Hasil
eksekusi migrasi/import terbaru dicatat terpisah pada
`DATABASE_MIGRATION_EXECUTION_2026-08-30.md`.

## Perbedaan dan keputusan belum pasti

1. Laravel casts decimal sebagai string berformat 2/3 desimal, sedangkan
   Prisma mengembalikan `Prisma.Decimal`. Presentation layer harus memformat
   nilai secara eksplisit; jangan melakukan cast global ke `number`.
2. `coal_stock` tidak memiliki `unit_id`, sehingga tidak boleh diasumsikan
   sebagai stok per unit.
3. `kpi_targets` berbeda makna dengan target biomassa tahunan di Google Sheets;
   source of truth tetap **NEEDS REVIEW**.
4. Dashboard Google Sheets dan halaman PostgreSQL dapat memiliki freshness dan
   nilai yang berbeda; strategi sinkronisasi tetap **NEEDS REVIEW**.
5. Status kualitas untuk `gar = NULL` tidak masuk tiga kategori, sama seperti
   predicate SQL Laravel. Perilaku UI untuk data null tetap **NEEDS REVIEW**.
6. Prisma schema memetakan tabel framework, tetapi auth/session/queue belum
   diimplementasikan sesuai batas Phase 3.
7. Connection pooling, SSL mode production, dan runtime deployment belum
   diputuskan. `DATABASE_URL` harus diisi oleh deployment environment, bukan
   disimpan di repository.
