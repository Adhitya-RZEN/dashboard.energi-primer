# Database Migration — Phase 3

## Status dan batasan

- **Status:** selesai untuk read-only data access
- **Database target:** PostgreSQL existing, database `dashboard_pln`, schema `public`
- **Schema operation:** tidak ada `prisma migrate`, `prisma db push`, `DROP`, `ALTER`, atau operasi tulis yang dijalankan
- **Laravel:** hanya dibaca sebagai source/reference; tidak dimodifikasi
- **Data:** tidak dihapus atau diubah

Phase 3 menambahkan Prisma sebagai data access layer di Next.js. Schema Prisma
ditulis berdasarkan migration Laravel dan mempertahankan nama tabel/kolom
existing menggunakan `@@map` dan `@map`.

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

Prisma CLI hanya dipakai untuk `generate` dan `validate`. Tidak ada folder
`prisma/migrations/` karena Phase 3 tidak mengubah schema existing.

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

Dashboard Laravel aktif membaca Google Sheets, bukan tabel domain PostgreSQL;
`DatabaseDataSource` Laravel masih stub. Phase 3 tidak memindahkan dashboard
ke database dan tidak membuat Google Sheets client. Prisma service hanya
menutup akses tabel yang memang dipakai oleh halaman kualitas/laporan dan
query reusable yang terverifikasi.

## Read verification

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

Script hanya menjalankan `SELECT` dan Prisma read methods. Tidak ada insert,
update, delete, migration, atau schema push.

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
