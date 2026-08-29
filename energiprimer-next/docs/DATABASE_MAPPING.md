# Laravel Audit — Database Mapping

Sumber: `backend/database/migrations`, `backend/app/Models`, `backend/database/seeders`, `backend/database/factories`, dan `backend/config/database.php`.

## Database engine

- Default runtime pada `.env.example`: PostgreSQL (`DB_CONNECTION=pgsql`).
- Host/port/database/user/password berasal dari `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
- PostgreSQL config memakai schema `public`, prefix kosong, dan `sslmode` dari `DB_SSLMODE` (default `prefer`).
- Migration menggunakan foreign key dan unique constraint; tidak ada soft delete pada model/domain table.
- Audit ini tidak membuka, mengubah, atau menjalankan operasi terhadap database aktual.

## Tabel domain

| Tabel                     | Kolom                                                                                                                                                                                        | Constraint/relasi                                                | Pemakai aktual                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `units`                   | `id` BIGINT PK; `code` varchar(20); `name` varchar(100); `status` boolean default true; timestamps                                                                                           | `code` unique                                                    | `CoalDataController`, model `Unit`, seeder                                         |
| `coal_stock`              | `id`; `date` date; `opening_stock`, `received`, `consumed`, `closing_stock` decimal(12,2) default 0; timestamps                                                                              | `date` unique; tidak punya `unit_id`                             | Model `CoalStock`; monitoring direncanakan, tetapi controller saat ini tidak query |
| `coal_quality`            | `id`; `unit_id`; `date`; `gar` decimal(8,2) nullable; `moisture` decimal(5,2) nullable; `ash` decimal(5,2) nullable; `sulfur` decimal(5,3) nullable; `hgi` decimal(5,2) nullable; timestamps | FK `unit_id → units.id` cascade delete; unique(`unit_id`,`date`) | `CoalDataController`, model `CoalQuality`                                          |
| `coal_consumption`        | `id`; `unit_id`; `date`; `coal_used` decimal(12,2) nullable; `sfc` decimal(8,2) nullable; `heat_rate` decimal(8,2) nullable; `boiler_efficiency` decimal(5,2) nullable; timestamps           | FK cascade; unique(`unit_id`,`date`)                             | `LaporanController`, model `CoalConsumption`                                       |
| `power_generation`        | `id`; `unit_id`; `date`; `average_load` decimal(8,2) nullable; `power_generation` decimal(12,2) nullable; timestamps                                                                         | FK cascade; unique(`unit_id`,`date`)                             | Model/seeder; tidak ada controller/view aktif                                      |
| `kpi_targets`             | `id`; `unit_id`; `date`; `target_sfc`, `actual_sfc`, `target_heat_rate`, `actual_heat_rate` decimal(8,2) nullable; timestamps                                                                | FK cascade; unique(`unit_id`,`date`)                             | Model/seeder; dashboard target aktif memakai Google Sheets, bukan tabel ini        |
| `spreadsheet_import_logs` | `id`; `source` varchar; `imported_rows` unsigned int default 0; `status` varchar; `message` text nullable; `imported_at` timestamp nullable; timestamps                                      | Tidak ada FK/unique tambahan                                     | Model saja; tidak ada service/controller pemakai                                   |

## Tabel sistem

| Tabel                   | Struktur penting                                                                                                                                                              | Fungsi                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `users`                 | `id`, `name`, unique `email`, `email_verified_at`, `password`, `remember_token`, timestamps; migration berikutnya menambah `role` indexed default `admin` dan `last_login_at` | User auth dan role      |
| `password_reset_tokens` | PK `email`, `token`, `created_at`                                                                                                                                             | Native password broker  |
| `sessions`              | PK `id`, nullable/indexed `user_id`, IP, user agent, payload, indexed `last_activity`                                                                                         | Session driver database |
| `cache` / `cache_locks` | key PK, value/owner, expiration indexed                                                                                                                                       | Cache framework         |
| `jobs`                  | queue, payload, attempts, reserved/available/created timestamps integer                                                                                                       | Database queue storage  |
| `job_batches`           | batch id/name, totals, failed ids, lifecycle timestamps                                                                                                                       | Queue batching          |
| `failed_jobs`           | uuid unique, connection, queue, payload, exception, failed_at; composite index                                                                                                | Queue failures          |

Total migration menghasilkan 15 tabel. Migration `2026_08_21_000008_add_role_and_last_login_at_to_users_table.php` defensif terhadap table/column yang sudah ada.

## Model dan relationship

| Model                  | Table                     | Fillable/casts utama                                                                    | Relationship                                                       |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `User`                 | `users`                   | name, email, password, role, last_login_at; verified/login datetime dan hashed password | Tidak ada domain relationship                                      |
| `Unit`                 | `units`                   | code, name, status; status boolean                                                      | `hasMany` CoalQuality, CoalConsumption, PowerGeneration, KpiTarget |
| `CoalQuality`          | `coal_quality`            | unit/date/GAR/moisture/ash/sulfur/HGI; decimal casts                                    | `belongsTo Unit`                                                   |
| `CoalConsumption`      | `coal_consumption`        | unit/date/coal_used/SFC/heat_rate/efficiency; decimal casts                             | `belongsTo Unit`                                                   |
| `PowerGeneration`      | `power_generation`        | unit/date/load/generation; decimal casts                                                | `belongsTo Unit`                                                   |
| `KpiTarget`            | `kpi_targets`             | unit/date/target dan actual SFC/heat rate; decimal casts                                | `belongsTo Unit`                                                   |
| `CoalStock`            | `coal_stock`              | date/opening/received/consumed/closing; decimal casts                                   | Tidak ada relationship                                             |
| `SpreadsheetImportLog` | `spreadsheet_import_logs` | source/row count/status/message/imported_at                                             | Tidak ada relationship                                             |

Tidak ditemukan observer, repository, custom cast, policy, atau soft-delete implementation.

## Seeders, factories, dan data reference

`DatabaseSeeder` memanggil secara berurutan: `AdminUserSeeder`, `UnitSeeder`, `CoalStockSeeder`, `CoalQualitySeeder`, `CoalConsumptionSeeder`, `PowerGenerationSeeder`, `KpiTargetSeeder`. Tidak ada seeder untuk `spreadsheet_import_logs`.

- `UnitSeeder` membuat/memperbarui `PLTU-1`–`PLTU-3` dengan nama `Unit 1`–`Unit 3`, aktif.
- Lima seeder data membaca CSV, melewati header, memetakan nama unit, lalu `upsert` per batch maksimal 200 baris.
- Baris CSV dengan unit yang tidak dikenal dilewati.
- `UserFactory` membuat user Faker dengan password default factory `password` dan tidak menetapkan role.
- `UnitFactory` menghasilkan unit random; bukan data produksi.
- Data CSV: stock 365 baris; quality/consumption/generation/target masing-masing 1.095 baris; rentang 2025 penuh; tidak ditemukan field kosong saat inspeksi.

## Mapping source-of-truth

| Area                      | Source aktif                                      | Tabel terkait               | Catatan                                              |
| ------------------------- | ------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| Dashboard overview/detail | Google Sheets API                                 | Tidak membaca tabel domain  | `DatabaseDataSource` masih melempar RuntimeException |
| Data kualitas             | PostgreSQL query builder + `coal_quality`/`units` | Ya                          | Filter dan pagination aktif                          |
| Laporan                   | PostgreSQL aggregate `coal_consumption`           | Ya                          | Hanya laporan bulanan/summary                        |
| Monitoring                | Tidak ada query aktual                            | Seharusnya `coal_*`         | Placeholder kosong                                   |
| Target dashboard          | Google Sheets row 56/59                           | Tidak memakai `kpi_targets` | Target fallback hard-coded 70.020 ton                |

## Risiko dan NEEDS REVIEW

1. Dashboard akan membandingkan data Google Sheets dengan data PostgreSQL yang dapat berbeda periode/freshness.
2. Tidak ada unique constraint gabungan untuk sumber Google Sheets; strategi deduplikasi/sinkronisasi ke PostgreSQL belum diimplementasikan. **NEEDS REVIEW**.
3. `coal_stock` hanya satu record per tanggal, sedangkan tabel lain per unit; granularitas harus dipertahankan atau diubah secara sadar.
4. Tidak ada supplier, nomor pengiriman, volume, lab PDF, shift, atau kolom biomassa/solar pada schema PostgreSQL. UI yang menampilkan informasi tersebut saat ini bukan data database aktual. **NEEDS REVIEW**.
5. `kpi_targets` menyimpan target per unit/tanggal, tetapi target aktif dashboard adalah target biomassa tahunan dari spreadsheet. Hubungan keduanya belum ditentukan. **NEEDS REVIEW**.
6. `cascadeOnDelete` pada data operasional perlu dipertimbangkan ulang karena penghapusan unit akan menghapus seluruh data historis unit.
7. Migration `down()` pada users menghapus tiga tabel sekaligus; risiko operasional perlu diperhatikan bila rollback dipakai.
