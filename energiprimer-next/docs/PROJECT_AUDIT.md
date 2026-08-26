# Laravel Audit — Project Audit

## Status audit

- **Scope:** `backend/` sebagai SOURCE/REFERENCE.
- **Metode:** inspeksi read-only terhadap source PHP, Blade, migration, seeder/factory, konfigurasi, asset frontend, test, dan route runtime.
- **Tanggal audit:** 2026-08-26.
- **Perubahan selama audit:** tidak ada file Laravel, database, atau implementasi Next.js yang diubah; hanya enam dokumen audit ini yang dibuat di project Next.js.
- **Status:** selesai; dokumentasi ini menjadi baseline sebelum Phase 2.

## Ringkasan arsitektur

Laravel `v13.18.0` (constraint `^13.8`, PHP `^8.3`) menggunakan MVC dengan:

```text
Browser
  └─ routes/web.php
      ├─ Auth controllers ── session auth ── users PostgreSQL
      ├─ DashboardController ── DashboardService ── GoogleSheetsDataSource
      │                              └─ cache + fallback 12 bulan
      ├─ CoalDataController ── Eloquent/query builder ── PostgreSQL
      ├─ LaporanController ── PostgreSQL aggregate queries
      └─ MonitoringController ── placeholder kosong (belum DB)
                    └─ Blade views + public CSS/JS + Chart.js 4.5.1
```

Dashboard Fase 1 menjadikan Google Sheets API sebagai sumber data aktif. PostgreSQL sudah memiliki migration, model, dan data seed, tetapi `DatabaseDataSource` masih stub sehingga belum menjadi sumber dashboard. Halaman data kualitas dan laporan tetap membaca PostgreSQL.

## Struktur project Laravel

```text
backend/
├── app/
│   ├── DataSources/          # interface, Google Sheets, DB stub
│   ├── Http/Controllers/     # dashboard, data, laporan, monitoring, settings, auth
│   ├── Http/Middleware/      # EnsureAdmin
│   ├── Models/               # User + 7 model domain/data
│   ├── Providers/
│   └── Services/             # DashboardService, AuthSessionService
├── bootstrap/app.php
├── config/                  # auth, database, google, queue, session, filesystems, dll.
├── database/
│   ├── data/                # 5 CSV, data operasional 2025
│   ├── factories/
│   ├── migrations/
│   └── seeders/
├── public/
│   ├── css/                 # CSS aplikasi per halaman
│   ├── js/                  # vanilla JS + Chart.js vendored
│   └── images/
├── resources/views/         # Blade layouts, components, pages
├── routes/web.php
├── routes/console.php
├── tests/
└── docs/                    # dokumen arsitektur lama
```

`routes/api.php` tidak ditemukan. `routes/console.php` hanya berisi command contoh `inspire`.

## Modul yang benar-benar ditemukan

| Modul | Implementasi aktual | Kondisi |
|---|---|---|
| Authentication | Login admin, logout, forgot/reset password, change password | Aktif |
| Authorization | Middleware `EnsureAdmin`, role string `admin` | Aktif, hanya satu tingkat izin |
| Dashboard | 6 halaman dashboard melalui satu `DashboardController` | Aktif, sumber Google Sheets |
| Data kualitas batubara | Query `coal_quality` + filter + pagination | Aktif |
| Monitoring | View dan filter UI; controller mengirim data kosong | Placeholder |
| Laporan | Agregasi bulanan/summary `coal_consumption` | Read-only; generate/download dummy |
| Pengaturan | Menampilkan profil; ubah password melalui route auth | Profil readonly |
| Import | Seeder CSV; tidak ada endpoint/UI import aktif | Seeder only |
| Google Sheets | Read-only API v4, parser range tetap | Aktif untuk dashboard |
| PostgreSQL | Eloquent/query builder dan konfigurasi `pgsql` | Aktif untuk sebagian halaman |
| Queue/scheduler | Tabel queue dan config database tersedia | Tidak ada Job/Schedule aktual |
| File upload/storage | Konfigurasi filesystem tersedia | Tidak ada pemakaian aplikasi |

## Database dan data

Terdapat 15 tabel dari migration: 8 tabel sistem Laravel (`users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`) dan 7 tabel domain (`units`, `coal_stock`, `coal_quality`, `coal_consumption`, `power_generation`, `kpi_targets`, `spreadsheet_import_logs`). Detail ada di [DATABASE_MAPPING.md](./DATABASE_MAPPING.md).

CSV seed berisi data 2025-01-01 sampai 2025-12-31:

- `coal_stock.csv`: 365 baris.
- `coal_quality.csv`, `coal_consumption.csv`, `power_generation.csv`, `kpi_target.csv`: masing-masing 1.095 baris (365 hari × 3 unit).
- Semua CSV yang diperiksa tidak memiliki field kosong dan memakai `Unit 1`, `Unit 2`, `Unit 3`.

## Frontend Laravel

- Blade memakai `layouts.app` untuk area terproteksi dan `layouts.auth` untuk auth.
- Layout aplikasi memuat Poppins dan Material Symbols dari Google Fonts CDN.
- CSS utama berada di `public/css/app.css`, dilengkapi `theme.css`, `dashboard.css`, `data.css`, `laporan.css`, `monitoring.css`, `pengaturan.css`, dan `auth.css`.
- JavaScript adalah vanilla JS. Chart.js `4.5.1` disimpan langsung sebagai `public/js/chart.min.js`, bukan dependency Composer/npm.
- Vite/Tailwind hanya mengompilasi `resources/css/app.css` dan `resources/js/app.js`; halaman utama memakai asset CSS/JS dari `public/` secara langsung.

## Temuan audit dan ambiguitas

1. `resources/views/dashboard/index.blade.php` adalah view dashboard legacy yang tidak menjadi target route aktif; route `/dashboard` memanggil `dashboard.overview`.
2. View legacy memanggil `route('dashboard.index')`, tetapi route bernama tersebut tidak ada. **NEEDS REVIEW** bila view legacy akan dipertahankan.
3. `backend/docs/backend-architecture.md` menyebut `SpreadsheetImportService`, `KPIService`, dan `StockCalculationService`, tetapi class tersebut tidak ditemukan di `app/`; source aktual hanya memiliki `DashboardService` dan `AuthSessionService`. **NEEDS REVIEW** untuk status dokumen lama.
4. `coal_quality` dipakai sebagai kualitas data, tetapi UI menampilkan `unit_name` pada kolom “Supplier”, membuat nomor lab sintetis dari `id`, dan menampilkan `hgi` pada header “Total Moisture”. Tidak ada field supplier, nomor pengiriman, volume, atau file PDF pada schema. Ini adalah mismatch UI-versus-data yang harus diklarifikasi.
5. Dashboard dan halaman laporan/data memakai dua sumber data berbeda (Google Sheets versus PostgreSQL). Konsistensi, freshness, dan prioritas sumber harus diputuskan sebelum migrasi.
6. Monitoring diberi label live, tetapi controller mengembalikan koleksi kosong, KPI nol, dan paginator kosong. **NEEDS REVIEW**: apakah fitur ini hanya placeholder atau harus diaktifkan.
7. Target biomassa `70.020 ton` adalah fallback hard-coded di source, bukan tabel `kpi_targets`. Makna dan sumber target tahunan perlu dikonfirmasi.
8. Google Sheets client mematikan verifikasi SSL (`verify => false`). Ini merupakan risiko keamanan yang perlu diperbaiki pada desain target.

## Rekomendasi urutan migrasi

1. Kunci kontrak sumber data dan definisi KPI; selesaikan seluruh item **NEEDS REVIEW**.
2. Tetapkan schema target dan strategi sinkronisasi Google Sheets → PostgreSQL.
3. Migrasikan shell layout, route protection, dan authentication.
4. Migrasikan dashboard overview beserta parser/kontrak data yang sudah tervalidasi.
5. Migrasikan dashboard detail: biomassa, batubara, stok/HOP, solar, target.
6. Migrasikan data kualitas dengan memperbaiki mapping field yang salah label.
7. Aktifkan monitoring hanya setelah sumber dan granularitas shift tersedia.
8. Migrasikan laporan setelah definisi generate/download disepakati.
9. Tambahkan admin/data management, import/export, jobs, dan upload hanya jika memang diperlukan oleh scope final.

## Kesimpulan

Laravel lama adalah dashboard internal admin berbasis Blade, dengan dashboard utama read-only dari Google Sheets dan data operasional PostgreSQL yang sudah disiapkan namun belum sepenuhnya dipakai. Tidak ditemukan API route publik, CRUD aktif untuk data domain, job terjadwal, upload, atau integrasi eksternal aktif selain Google Sheets dan mail reset password.
