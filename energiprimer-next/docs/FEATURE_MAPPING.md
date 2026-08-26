# Laravel Audit — Feature Mapping

Format setiap item: **Laravel implementation → target Next.js implementation → dependency → database dependency → API dependency → kompleksitas → risiko migrasi**. Tidak ada implementasi Next.js pada fase audit ini.

## 1. Authentication admin

- **Laravel implementation:** session guard, login admin-only, logout, forgot/reset password, change password, CSRF, throttle.
- **Target Next.js:** route protection server-side dan session/auth action yang mempertahankan aturan admin-only. **NEEDS REVIEW** untuk library/session provider dan mail delivery.
- **Dependency:** belum ada dependency auth di project Next.js; perlu dipilih kemudian.
- **Database dependency:** `users`, `sessions`, `password_reset_tokens`.
- **API dependency:** tidak ada endpoint API Laravel; mutation perlu server action/route handler atau backend terpisah.
- **Kompleksitas:** Tinggi.
- **Risiko migrasi:** session compatibility, hash/password reset, CSRF, role enforcement, dan secret management.

## 2. Shell aplikasi dan navigasi

- **Laravel implementation:** `layouts.app`, navbar, sidebar, footer, breadcrumb, status bar, mobile sidebar toggle.
- **Target Next.js:** root layout dan reusable server/client components; pertahankan route active state dan responsive drawer.
- **Dependency:** React/Next.js existing; icon/font choice **NEEDS REVIEW**.
- **Database dependency:** user session untuk nama/avatar/role; dashboard metadata untuk last update.
- **API dependency:** tidak langsung; data status berasal dari source dashboard.
- **Kompleksitas:** Sedang.
- **Risiko migrasi:** Blade conditional/component behavior harus dipetakan tanpa membawa UI yang hanya dummy.

## 3. Dashboard Overview

- **Laravel implementation:** `DashboardController@overview` → `DashboardService` → Google Sheets; KPI executive summary, konsumsi harian, target, HOP, detail bahan bakar, status/error/fallback.
- **Target Next.js:** `/dashboard` dengan data contract dashboard yang terpisah dari presentasi; chart client component hanya bila diperlukan.
- **Dependency:** Chart.js atau library chart yang dipilih; formatter locale Indonesia. Project Next.js belum memasang chart dependency.
- **Database dependency:** tidak membaca PostgreSQL pada implementasi aktif; target/stock/series berasal dari Google Sheets.
- **API dependency:** Google Sheets API v4 atau internal data service yang menggantikannya.
- **Kompleksitas:** Tinggi.
- **Risiko migrasi:** parser index-based (`B11:CO59`), fallback lintas 12 bulan, cache key, dan perbedaan freshness dengan PostgreSQL.

## 4. Dashboard Biomassa

- **Laravel implementation:** KPI penerimaan bulanan, pemakaian bulanan, pemakaian harian Unit 1–3, pemakaian batubara bulanan; line chart total biomassa dan stacked bar per unit.
- **Target Next.js:** `/dashboard/biomassa` memakai dashboard data contract yang sama.
- **Dependency:** Chart.js-compatible charting dan shared dashboard components.
- **Database dependency:** tidak ada pada source aktif; Google Sheets columns S, AC, T, W, Z, AB.
- **API dependency:** Google Sheets read-only.
- **Kompleksitas:** Sedang–tinggi.
- **Risiko migrasi:** arti kolom spreadsheet tidak self-describing dan unit hard-coded pada parser.

## 5. Dashboard Batubara

- **Laravel implementation:** penerimaan bulanan, pemakaian bulanan, pemakaian harian per unit, total pemakaian harian; line chart dan stacked unit bar chart.
- **Target Next.js:** `/dashboard/batubara` dengan series harian dan KPI dari contract tervalidasi.
- **Dependency:** charting + shared dashboard UI.
- **Database dependency:** tidak memakai `coal_consumption` pada dashboard aktif; Google Sheets columns I, S, V, Y, AB.
- **API dependency:** Google Sheets.
- **Kompleksitas:** Sedang–tinggi.
- **Risiko migrasi:** mapping kolom memakai indeks relatif; angka dengan format titik/koma harus konsisten.

## 6. Dashboard Stok dan HOP

- **Laravel implementation:** stock batubara, HOP 3/2/1 unit, status/label, progress kapasitas, line chart stock, trend HOP dengan batas 10 dan 15 hari.
- **Target Next.js:** `/dashboard/stok` dengan status computation teruji dan chart series nullable.
- **Dependency:** charting; shared status/progress components.
- **Database dependency:** source aktif Google Sheets AD, AJ, AK, AL; model `CoalStock` belum dipakai controller dashboard.
- **API dependency:** Google Sheets.
- **Kompleksitas:** Sedang–tinggi.
- **Risiko migrasi:** capacity `70.000` hard-coded; HOP 3 unit dipakai sebagai status overview; threshold harus dikonfirmasi domain owner.

## 7. Dashboard Solar

- **Laravel implementation:** pemakaian harian/bulanan dan penerimaan bulanan; line chart pemakaian dan bar chart penerimaan versus pemakaian.
- **Target Next.js:** `/dashboard/solar` memakai field solar dari data contract.
- **Dependency:** charting + shared dashboard UI.
- **Database dependency:** tidak ada table solar pada migration; Google Sheets CC dan CJ.
- **API dependency:** Google Sheets.
- **Kompleksitas:** Sedang.
- **Risiko migrasi:** source field solar tidak tersedia di schema PostgreSQL dan `solar_penerimaan` pada daily series diambil dari kolom penerimaan yang berkomentar bulanan.

## 8. Dashboard Target & Kinerja

- **Laravel implementation:** target biomassa, realisasi kumulatif, sisa, progress; doughnut chart. Target diambil row 56/CO dan realisasi row 59/CO; fallback target `70.020` ton.
- **Target Next.js:** `/dashboard/target` mempertahankan formula setelah sumber target diputuskan.
- **Dependency:** charting; target calculation utility.
- **Database dependency:** tidak memakai `kpi_targets` aktif; Google Sheets row/column contract.
- **API dependency:** Google Sheets.
- **Kompleksitas:** Sedang.
- **Risiko migrasi:** target hard-coded/fallback dan tabel `kpi_targets` memiliki definisi berbeda (SFC/heat rate per unit), sehingga source of truth belum jelas.

## 9. Data kualitas batubara

- **Laravel implementation:** `CoalDataController@index` query `coal_quality` join `units`, filter tanggal/unit/status, summary counts, pagination 15; status GAR: On Spec ≥4700, Perhatian 4500–<4700, Off Spec <4500.
- **Target Next.js:** `/data-batu-bara` dengan server-side query/pagination dan filter URL.
- **Dependency:** PostgreSQL client/ORM atau data service; no existing Next DB dependency.
- **Database dependency:** `coal_quality`, `units`.
- **API dependency:** belum ada API Laravel; perlu server-side data access atau API baru pada phase implementasi.
- **Kompleksitas:** Sedang.
- **Risiko migrasi:** UI menyebut supplier, nomor pengiriman, volume, lab PDF, dan total moisture yang tidak ada pada schema/query; `hgi` tampil di kolom mislabeled.

## 10. Monitoring terperinci

- **Laravel implementation:** controller menerima date/unit filter tetapi mengembalikan units kosong, paginator kosong, KPI nol, dan phase notice; view menampilkan tabel/shift/export demonstrasi.
- **Target Next.js:** **NEEDS REVIEW** apakah fitur diaktifkan, dihapus dari scope, atau tetap sebagai placeholder.
- **Dependency:** table/pagination/export library hanya jika fitur disetujui.
- **Database dependency:** seharusnya `units`, `coal_stock`, `coal_quality`, `coal_consumption`; source aktual belum query.
- **API dependency:** belum ada.
- **Kompleksitas:** Tinggi jika diaktifkan; Rendah jika tetap placeholder.
- **Risiko migrasi:** label “Live Monitoring” tidak sesuai behavior; shift tidak ada pada schema; KPI bisa misleading.

## 11. Laporan efisiensi

- **Laravel implementation:** query agregasi bulanan dan summary keseluruhan `coal_consumption`; UI tiga jenis report, selector periode, history table. Generate/preview/download disabled atau simulasi JS.
- **Target Next.js:** `/laporan` read-only dahulu; generate/download hanya setelah format dan persistence disepakati.
- **Dependency:** PDF/Excel generation belum ditemukan; jangan memilih dependency sebelum scope final.
- **Database dependency:** `coal_consumption`; agregat SUM coal, AVG efficiency/heat rate/SFC, date range.
- **API dependency:** tidak ada endpoint report aktif.
- **Kompleksitas:** Sedang untuk read-only; Tinggi untuk generate/download.
- **Risiko migrasi:** UI mengklaim weekly/quality report tetapi controller hanya menghasilkan monthly consumption aggregate; data laporan historis bukan tabel tersendiri.

## 12. Pengaturan profil

- **Laravel implementation:** menampilkan nama/email user readonly; tombol menuju change password. JS settings tabs/save/toggles bersifat dummy dan tidak terlihat dipakai oleh view saat ini.
- **Target Next.js:** `/pengaturan` profil readonly + link change password; fitur save/toggle hanya jika ada requirement nyata.
- **Dependency:** auth/session layer.
- **Database dependency:** `users`.
- **API dependency:** change password mutation.
- **Kompleksitas:** Rendah untuk readonly; Sedang dengan mutation.
- **Risiko migrasi:** tombol berlabel “Lupa Password” pada settings menuju route change password; perlu klarifikasi copy/UX.

## 13. CSV seed/import

- **Laravel implementation:** seeders membaca lima CSV dan `upsert` batch 200; UI “Import CSV” disabled, tidak ada upload endpoint.
- **Target Next.js:** script/worker/admin import terpisah jika dibutuhkan; bukan otomatis menjadi UI.
- **Dependency:** CSV parser/validation belum ditetapkan.
- **Database dependency:** domain tables + unique keys.
- **API dependency:** tidak ada.
- **Kompleksitas:** Sedang.
- **Risiko migrasi:** unknown unit dilewati diam-diam; perlu error report dan idempotency yang eksplisit.

## 14. Cache, fallback, dan error state

- **Laravel implementation:** cache dashboard TTL 120 detik, versioned key; fallback maksimal 12 bulan; empty response dan alert error di view.
- **Target Next.js:** server-side cache/revalidation dengan fallback yang dapat diamati; jangan mengandalkan client-only cache untuk data operasional.
- **Dependency:** built-in Next caching atau cache store target **NEEDS REVIEW**.
- **Database dependency:** tidak ada untuk cache dashboard aktif; session/cache tables tersedia di Laravel.
- **API dependency:** upstream Google Sheets.
- **Kompleksitas:** Tinggi.
- **Risiko migrasi:** fallback menghilangkan filter hari saat berpindah bulan; stale data harus terlihat jelas.
