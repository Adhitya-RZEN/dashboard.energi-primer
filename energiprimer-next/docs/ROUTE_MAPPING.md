# Laravel Audit — Route Mapping

Sumber utama: `backend/routes/web.php`, `backend/bootstrap/app.php`, dan verifikasi `php artisan route:list --except-vendor` (21 route). `backend/routes/api.php` tidak ada.

## Middleware

- `guest`: route login dan password reset hanya untuk guest.
- `auth`: membutuhkan session login.
- `admin`: alias `App\Http\Middleware\EnsureAdmin`; hanya user dengan `role === 'admin'`, selain itu HTTP 403.
- Group dashboard/admin memakai `['auth', 'admin']`.
- Guest diarahkan ke `/login`; user yang sudah login diarahkan ke `/dashboard` melalui bootstrap.

## Daftar route

| Method | Path | Name | Handler | Middleware | Target Next.js | Kompleksitas |
|---|---|---|---|---|---|---|
| GET|HEAD | `/` | — | Redirect `/dashboard` | auth, admin | Redirect route/root protected | Rendah |
| GET|HEAD | `/login` | `login` | `LoginController@create` | guest | `/login` page | Rendah |
| POST | `/login` | `login.store` | `LoginController@store` | guest, throttle 6/1 menit | Auth action + persistent cache throttle | Sedang |
| POST | `/logout` | `logout` | `LoginController@destroy` | auth, admin | Auth.js signOut Server Action | Rendah |
| GET|HEAD | `/forgot-password` | `password.request` | `ForgotPasswordController@create` | guest | `/forgot-password` page | Rendah |
| POST | `/forgot-password` | `password.email` | `ForgotPasswordController@store` | guest, throttle 6/1 menit | Forgot-password Server Action + hashed token | Sedang |
| GET|HEAD | `/reset-password/{token}` | `password.reset` | `ResetPasswordController@create` | guest | `/reset-password/[token]` page | Sedang |
| POST | `/reset-password` | `password.store` | `ResetPasswordController@store` | guest, throttle 6/1 menit | Reset-password Server Action + hashed token | Sedang |
| GET|HEAD | `/password/change` | `password.edit` | `ChangePasswordController@edit` | auth, admin | `/password/change` page | Rendah |
| POST | `/password/change` | `password.update` | `ChangePasswordController@update` | auth, admin | Change-password Server Action + bcrypt + signOut | Sedang |
| GET|HEAD | `/dashboard` | `dashboard.overview` | `DashboardController@overview` | auth, admin | `/dashboard` page | Sedang |
| GET|HEAD | `/dashboard/biomassa` | `dashboard.biomassa` | `DashboardController@biomassa` | auth, admin | `/dashboard/biomassa` page | Sedang |
| GET|HEAD | `/dashboard/batubara` | `dashboard.batubara` | `DashboardController@batubara` | auth, admin | `/dashboard/batubara` page | Sedang |
| GET|HEAD | `/dashboard/stok` | `dashboard.stok` | `DashboardController@stok` | auth, admin | `/dashboard/stok` page | Sedang |
| GET|HEAD | `/dashboard/solar` | `dashboard.solar` | `DashboardController@solar` | auth, admin | `/dashboard/solar` page | Sedang |
| GET|HEAD | `/dashboard/target` | `dashboard.target` | `DashboardController@target` | auth, admin | `/dashboard/target` page | Sedang |
| GET|HEAD | `/dashboard/filter/reset` | `dashboard.filter.reset` | Closure in `routes/web.php` | auth, admin | `?reset=1` menghapus filter cookies; route khusus tidak diperlukan | Rendah |
| GET|HEAD | `/monitoring` | `monitoring` | `MonitoringController@index` | auth, admin | `/monitoring` page | Sedang |
| GET|HEAD | `/data-batu-bara` | `data-batu-bara` | `CoalDataController@index` | auth, admin | `/data-batu-bara` page | Sedang |
| GET|HEAD | `/laporan` | `laporan` | `LaporanController@index` | auth, admin | `/laporan` page | Sedang |
| GET|HEAD | `/pengaturan` | `pengaturan` | `PengaturanController@index` | auth, admin | `/pengaturan` page | Rendah |

## Route behavior details

### Dashboard routes

Semua enam halaman dashboard memanggil `DashboardController::prepareDashboardData()`. Parameter query yang digunakan: `month`, `year`, dan `day`. Nilai juga disimpan ke session (`dashboard_filter_month`, `dashboard_filter_year`, `dashboard_filter_day`). Bulan dibatasi 1–12, tahun 2024 sampai tahun berjalan + 1, dan hari disesuaikan dengan jumlah hari pada bulan terpilih.

`dashboard.filter.reset` menghapus tiga key session kemudian redirect ke parameter `redirect`. Nilai redirect tidak terlihat divalidasi di source. **NEEDS REVIEW** untuk mencegah open redirect pada target.

### Data kualitas

`/data-batu-bara` menerima `date_from`, `date_to`, `unit_id`, `status` (`on_spec`, `perhatian`, `off_spec`). Response dipaginasi 15 baris dan query string dipertahankan.

### Monitoring

`/monitoring` menerima `date_from`, `date_to`, `unit_id`, tetapi controller tidak menjalankan query. `units` dan `records` kosong serta KPI bernilai nol. Tombol shift/export di view hanya UI demonstrasi.

### Laporan

`/laporan` tidak menerima parameter dari controller. Ia menghitung daftar agregat bulanan dan summary keseluruhan dari `coal_consumption`. Selector bulan/tahun dan tombol generate di Blade/JS belum mengubah query atau membuat file.

## API route audit

Tidak ada `routes/api.php`, route `apiPrefix`, route handler, endpoint JSON, atau controller API yang ditemukan. Konfigurasi exception hanya menyatakan request `api/*` seharusnya JSON; itu bukan bukti endpoint API tersedia.

## Route/view anomaly

`resources/views/dashboard/index.blade.php` tidak dipakai oleh route `/dashboard`, yang memakai `dashboard.overview`. View legacy tersebut memiliki `route('dashboard.index')`, sedangkan `dashboard.index` tidak terdaftar. **NEEDS REVIEW** sebelum target route ditetapkan.
