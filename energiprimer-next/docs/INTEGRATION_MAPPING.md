# Laravel Audit — Integration Mapping

## 1. Google Sheets API

**Status: aktif untuk dashboard.** `GoogleSheetsDataSource` memakai `google/apiclient` `v2.15.0` dan Google Sheets API v4 dengan scope read-only. Binding interface dilakukan di `AppServiceProvider`:

```text
DataSourceInterface → GoogleSheetsDataSource
```

Konfigurasi:

| Item        | Nilai/source                                                                        |
| ----------- | ----------------------------------------------------------------------------------- |
| Credentials | `GOOGLE_SHEETS_CREDENTIALS_PATH`, default `storage/app/google/service-account.json` |
| Spreadsheet | `GOOGLE_SHEETS_SPREADSHEET_ID`                                                      |
| Cache TTL   | `GOOGLE_SHEETS_CACHE_TTL`, default 120 detik                                        |
| Worksheet   | `[NamaBulanIndonesia][2 digit tahun]-BB`, contoh `Januari26-BB`                     |
| Range       | `B11:CO59`                                                                          |
| Read        | satu request `spreadsheets_values->get()`                                           |
| Write       | tidak ditemukan                                                                     |

Parser mengasumsikan row 11–41 adalah harian, row 42 total bulanan, row 52 penerimaan biomassa, row 56 target biomassa, dan row 59 realisasi kumulatif. Kolom relatif yang digunakan antara lain:

- Biomassa: S, AC, T, W, Z, AB.
- Batubara: I, S, V, Y, AB.
- Stock/HOP: AD, AJ, AK, AL.
- Solar: CC, CJ.
- Target/realisasi: CO.

Parser mendukung angka lokal titik/koma, tanggal angka/string, sel kosong nullable pada series, dan fallback ke baris terakhir jika hari yang diminta tidak tersedia.

`DashboardService` melakukan cache dengan key version `v2`, mencoba sheet bulan yang diminta, lalu fallback mundur maksimal 12 bulan. Saat fallback, response diberi `fallback_notice` dan metadata requested month/year.

**Risiko:** service account secret, range/column position yang rapuh, `verify => false` pada Guzzle, fallback tanpa filter hari, dan ketergantungan pada penamaan worksheet. Target Next perlu kontrak data yang tervalidasi dan verifikasi TLS aktif. **NEEDS REVIEW** untuk strategi sinkronisasi dan ownership spreadsheet.

## 2. PostgreSQL

**Status: aktif sebagian.** `config/database.php` menyediakan koneksi `pgsql`. `CoalDataController` memakai Eloquent untuk count/avg dan query builder untuk join/filter/pagination. `LaporanController` memakai PostgreSQL-specific SQL (`TO_CHAR`, `EXTRACT`, cast `::numeric`, `ROUND`).

Dashboard aktif tidak memakai PostgreSQL karena `DatabaseDataSource::getDashboardData()` masih melempar exception “belum diimplementasikan (Fase 2)”. Tabel dan mapping lengkap ada di [DATABASE_MAPPING.md](./DATABASE_MAPPING.md).

Target Next perlu memilih salah satu pola berikut; keputusan belum dibuat:

- akses DB server-side langsung dari Next;
- API/service backend terpisah;
- sinkronisasi terjadwal Google Sheets ke PostgreSQL lalu dashboard hanya membaca DB.

**NEEDS REVIEW:** target deployment, connection pooling, migrasi schema existing, dan source of truth.

## 3. Mail / password reset

`ForgotPasswordController` memakai native Laravel password broker dan `Password::sendResetLink`. `.env.example` default `MAIL_MAILER=log`, sedangkan opsi SMTP, SES, Postmark, Resend, dan sendmail tersedia di config.

Service yang benar-benar dipanggil source adalah password reset; tidak ditemukan custom Mailable. Target Next perlu memilih provider dan mekanisme token. **NEEDS REVIEW**.

## 4. Frontend build dan asset

`backend/package.json` hanya berisi Vite, Tailwind v4, `@tailwindcss/vite`, `laravel-vite-plugin`, dan `concurrently`. `vite.config.js` memasukkan `resources/css/app.css` dan `resources/js/app.js`, serta font Bunny Instrument Sans.

Namun layout halaman utama memuat asset dari `public/` langsung:

- CSS: `public/css/app.css`, `theme.css`, page CSS (`dashboard`, `data`, `laporan`, `monitoring`, `pengaturan`, `auth`).
- JS: `public/js/app.js`, page scripts, dan `chart.min.js`.
- `resources/css/app.css` hanya starter Tailwind dengan source path vendor/storage; tidak menjadi stylesheet utama halaman terproteksi.

Target Next perlu menyatukan pipeline asset dan menghindari duplikasi source CSS/JS. **NEEDS REVIEW** apakah seluruh legacy CSS dipertahankan atau hanya dijadikan referensi visual.

## 5. Chart.js

`public/js/chart.min.js` berisi Chart.js `v4.5.1` vendored. Tidak tercantum di `backend/package.json`. Chart dibuat dari `window.chartSeries` atau `window.targetBiomassaData` yang diserialisasi Blade.

Chart aktif:

- Overview: energy line, target bar legacy tersembunyi.
- Biomassa: line + stacked unit bar.
- Batubara: line + stacked unit bar.
- Stok: stock line + HOP trend dengan batas 10/15 hari.
- Solar: line + comparison bar.
- Target: progress doughnut.

Chart empty state ditampilkan bila semua nilai series null/kosong. Target Next perlu memilih library chart dan memastikan null/locale/unit behavior sama. **NEEDS REVIEW**; tidak ada dependency chart pada project Next saat audit.

## 6. Fonts, icons, dan external CDN

- Poppins dari Google Fonts CDN pada `layouts.app` dan `layouts.auth`.
- Material Symbols Outlined dari Google Fonts CDN.
- Bunny Instrument Sans dikonfigurasi pada Vite.
- Logo PLN disimpan lokal di `public/images/Logo_PLN.svg` dan `resources/assets/images/Logo_PLN.svg`.

Tidak ditemukan integrasi analytics, payment, maps, webhook, atau external service aktif lain.

## 7. Configured but unused external services

`config/services.php` menyediakan key config untuk Postmark, Resend, SES, Slack, dan AWS/S3 filesystem. Tidak ditemukan pemanggilan service tersebut pada app code yang diaudit. AWS juga muncul sebagai template filesystem/config, bukan bukti upload atau pemakaian runtime.

## 8. Queue dan scheduler

- `.env.example`: `QUEUE_CONNECTION=database`.
- Migration membuat `jobs`, `job_batches`, `failed_jobs`.
- Composer `dev` menjalankan `php artisan queue:listen` sebagai proses development.
- Tidak ada class di `app/Jobs`, dispatch call, custom command selain `inspire`, atau scheduler yang ditemukan.

Kesimpulan: queue infrastructure tersedia, tetapi tidak ada pekerjaan background aktual. Dokumentasi lama menyebut scheduler untuk sinkronisasi, namun source implementasinya tidak ada. **NEEDS REVIEW**.

## 9. Storage dan upload

Filesystem local/private/public/S3 dikonfigurasi dan symlink `public/storage` didefinisikan. Tidak ditemukan `Storage::`, `UploadedFile`, `store()`, atau form file upload. Direktori `storage/app/google` ditujukan untuk credentials service account, bukan upload pengguna.

Kesimpulan: tidak ada fitur upload/storage domain yang aktif. Jangan membuatnya pada target tanpa requirement.

## 10. Environment variables

Nama variabel yang ditemukan di `.env.example`:

| Kelompok        | Variabel                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| App             | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `APP_FAKER_LOCALE`, maintenance vars |
| DB              | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_URL`, `DB_SSLMODE`                          |
| Auth/session    | `AUTH_GUARD`, `AUTH_PASSWORD_BROKER`, `AUTH_MODEL`, `AUTH_PASSWORD_RESET_TOKEN_TABLE`, `AUTH_PASSWORD_TIMEOUT`, `SESSION_*`         |
| Initial admin   | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`                                                                                       |
| Google          | `GOOGLE_SHEETS_CREDENTIALS_PATH`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_CACHE_TTL`                                         |
| Queue/cache     | `QUEUE_CONNECTION`, `DB_QUEUE_*`, `CACHE_STORE`, `CACHE_PREFIX`                                                                     |
| Redis/memcached | `REDIS_*`, `MEMCACHED_HOST`                                                                                                         |
| Mail            | `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`     |
| Cloud/service   | `AWS_*`, `POSTMARK_*`, `RESEND_API_KEY`, `SLACK_*` (config/template)                                                                |
| Vite            | `VITE_APP_NAME`                                                                                                                     |

Nilai secret tidak disalin ke dokumentasi. `.env.example` sendiri memuat nilai admin yang tampak nyata; ini dicatat sebagai risiko dan harus diperlakukan sebagai secret exposure.
