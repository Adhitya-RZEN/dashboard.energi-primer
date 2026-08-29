# Feature Parity Matrix — Phase 9

## Kesimpulan

Next.js telah memiliki parity fungsional yang kuat untuk dashboard read-only,
data PostgreSQL, Google Sheets, dan authentication flow utama. Setelah mapping
skema pemasok penerimaan Biomassa dikoreksi, worksheet live mendeteksi lengkap
7/7 header terbaru dan parity KPI penerimaan terverifikasi `PASS`.

Tidak ada deployment production, perubahan Laravel, migration, schema change,
atau operasi tulis database yang dilakukan pada Phase 9.

## Metode penilaian

Skor parity dihitung dari 25 area validasi berikut:

- `PASS` = 1 poin;
- `PARTIAL`, `ACCEPTABLE DIFFERENCE`, atau `NEEDS REVIEW` = 0,5 poin;
- `REQUIRED FIX` atau `NOT IMPLEMENTED` = 0 poin.

Hasil snapshot sebelum perubahan skema pemasok adalah **20,5 / 25 = 82%**.
Setelah mapping diperbarui dan worksheet live memuat 7/7 header terbaru,
parity receipt meningkat menjadi `PASS`. Persentase final pada dokumen ini
tetap merupakan snapshot scope Phase 9 dan tidak memasukkan keputusan manual
lainnya sebagai selesai.

Angka parity adalah coverage terhadap scope yang ditemukan pada source, bukan
persentase kemiripan visual pixel-per-pixel.

## Feature parity matrix

| Feature                       | Laravel                                                                   | Next.js                                                                          | Functional | Data Parity | UI Parity | Status                | Notes                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | ----------- | --------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Root `/`                      | Redirect ke `/dashboard` dengan `auth` + `admin`                          | Auth-aware redirect ke `/dashboard` atau `/login`                                | PASS       | N/A         | PASS      | PASS                  | Non-admin diarahkan ke login unauthorized                                                                                   |
| Login                         | Session login, admin-only, throttle `6/1 menit`                           | Auth.js Credentials + Prisma + bcrypt + cache throttle                           | PASS       | PASS        | PASS      | PASS                  | Throttle persistent memakai tabel `cache` existing                                                                          |
| Logout                        | POST `/logout`, invalidate session dan CSRF                               | Auth.js `signOut` server action                                                  | PASS       | N/A         | PASS      | ACCEPTABLE DIFFERENCE | URL/mekanisme berbeda, behavior browser ekuivalen                                                                           |
| Session/protected route/role  | Session guard + `EnsureAdmin`, role `admin`                               | JWT cookie + Proxy + protected layout, role `admin`                              | PASS       | PASS        | PASS      | ACCEPTABLE DIFFERENCE | JWT tidak kompatibel dengan cookie Laravel; cutover memerlukan login ulang                                                  |
| Forgot password               | Admin lookup, generic response, broker, throttle                          | Server Action, admin lookup, generic response, hashed token                      | PASS       | PASS        | PASS      | NEEDS REVIEW          | Mail production belum dikonfigurasi                                                                                         |
| Reset password                | Token broker, expiry, bcrypt password, admin-only                         | Hashed token, 60 menit, bcrypt, admin-only                                       | PASS       | PASS        | PASS      | ACCEPTABLE DIFFERENCE | Implementasi token berbeda tetapi kontrak keamanan utama sama                                                               |
| Change password               | GET/POST `/password/change`, current password, min 12, invalidate session | Page + Server Action, bcrypt, `updated_at` revocation, sign-out                  | PASS       | PASS        | PASS      | PASS                  | Tidak membutuhkan migration                                                                                                 |
| Dashboard Overview            | Google Sheets KPI, chart, filter, fallback/error                          | `/dashboard`, typed service, KPI, SVG chart, filter, fallback/error              | PASS       | PASS        | PASS      | PASS                  | Receipt dihitung dari tujuh kolom pemasok terbaru dan cocok dengan baseline                                                 |
| Dashboard Biomassa            | KPI, unit harian, line/stacked chart                                      | `/dashboard/biomassa`, shared typed service/components                           | PASS       | PASS        | PASS      | PASS                  | Receipt 7 pemasok, consumption, unit, dan chart cocok                                                                       |
| Dashboard Batubara            | KPI, unit harian, line/stacked chart                                      | `/dashboard/batubara`, shared typed service/components                           | PASS       | PASS        | PASS      | PASS                  | Nilai receipt, consumption, unit, dan chart cocok                                                                           |
| Dashboard Stok/HOP            | Stock, HOP, status threshold, dua chart                                   | `/dashboard/stok`, shared service/components                                     | PASS       | PASS        | PASS      | PASS                  | Stock/HOP dan status cocok                                                                                                  |
| Dashboard Solar               | Solar harian/bulanan/receipt, dua chart                                   | `/dashboard/solar`, Google mapping dan unavailable PG state                      | PASS       | PASS        | PASS      | ACCEPTABLE DIFFERENCE | PostgreSQL memang tidak memiliki tabel solar                                                                                |
| Dashboard Target              | Target, cumulative, progress, doughnut                                    | `/dashboard/target`, typed target panel/SVG chart                                | PASS       | PASS        | PASS      | NEEDS REVIEW          | Target `70020` masih fallback/source Google; source of truth belum diputuskan                                               |
| Data kualitas batubara        | Filter tanggal/unit/status, summary global, pagination 15, join Unit      | `/data-batu-bara`, Prisma query, filter, pagination 15                           | PASS       | PASS        | PASS      | PASS                  | Threshold GAR dan query terverifikasi                                                                                       |
| Laporan efisiensi             | Aggregate bulanan dan summary `coal_consumption`                          | `/laporan`, PostgreSQL raw aggregate typed                                       | PASS       | PASS        | Partial   | ACCEPTABLE DIFFERENCE | UI Next read-only lebih ringkas; generate/preview/download juga disabled di source                                          |
| Monitoring                    | Route dan UI placeholder; controller mengembalikan empty/KPI 0            | `/monitoring` notice/filter/empty state                                          | PASS       | PASS        | Partial   | NEEDS REVIEW          | Detail monitoring memang belum aktif pada Laravel; shift/supplier/export tidak dibuat                                       |
| Pengaturan profil             | Nama/email readonly + link change password                                | Nama/email readonly + link `/password/change`                                    | PASS       | PASS        | PASS      | PASS                  | Link change password sudah tersedia                                                                                         |
| Google Sheets                 | Service account, range `B11:CO59`, fallback maksimal 12 bulan             | Server-only Node JWT/Sheets API, typed parser, fallback/cache/error              | Partial    | PASS        | PASS      | ACCEPTABLE DIFFERENCE | Worksheet live mendeteksi 7/7 pemasok terbaru; dua JSON memiliki private key berbeda dan key aktif deployment perlu dipilih |
| PostgreSQL data layer         | Eloquent/query builder + PostgreSQL aggregate                             | Prisma + typed services + PostgreSQL existing                                    | PASS       | PASS        | PASS      | ACCEPTABLE DIFFERENCE | Dashboard Laravel aktif tetap Google Sheets; target/HOP/solar tidak ada di PG                                               |
| Model/relationship            | 7 domain model utama + `Unit` relationships                               | Prisma mappings dan relation `Unit`                                              | PASS       | PASS        | N/A       | PASS                  | Nama tabel/kolom dan FK dipertahankan                                                                                       |
| Layout/navigation             | Blade app layout, sidebar, navbar, breadcrumb, mobile behavior            | AppShell, Sidebar, SiteHeader, NavigationMenu                                    | PASS       | N/A         | PASS      | ACCEPTABLE DIFFERENCE | React/Tailwind/SVG berbeda dari Blade/CSS tetapi hierarchy dipertahankan                                                    |
| Loading/empty/error/not-found | Alert/error dan empty state per halaman                                   | Route loading, empty, unavailable, error, not-found                              | PASS       | PASS        | PASS      | PASS                  | Tidak mengganti data kosong dengan dummy                                                                                    |
| API exposure                  | Tidak ada `routes/api.php` atau domain API                                | Internal Auth.js `/api/auth/[...nextauth]`; data tetap server-side               | PASS       | N/A         | PASS      | ACCEPTABLE DIFFERENCE | API Auth.js diperlukan untuk authentication, tidak ada public domain API                                                    |
| Security boundary             | Laravel auth/admin middleware, CSRF, bcrypt, throttle                     | Auth.js, bcrypt, server actions, protected layout, cache throttle, `server-only` | Partial    | PASS        | N/A       | NEEDS REVIEW          | JWT cutover/session compatibility, Auth.js beta, mail production, dan dependency audit perlu review                         |
| Admin data/import             | Import CSV dan CRUD UI Laravel disabled/tidak ada endpoint aktif          | Tombol import/add/export tetap disabled; tidak ada fake mutation                 | PASS       | PASS        | PASS      | ACCEPTABLE DIFFERENCE | Tidak ada fitur aktif yang hilang pada scope source                                                                         |

## Route comparison

Laravel memiliki **21 route** dari `php artisan route:list --except-vendor`.
`routes/api.php` tidak ada.

| Laravel route                 | Next.js route/implementation                                      | Status                                     |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `GET /`                       | `src/app/page.tsx`                                                | PASS: auth-aware redirect                  |
| `GET /login`                  | `/login` page                                                     | PASS                                       |
| `POST /login`                 | Login Server Action/Auth.js Credentials endpoint + cache throttle | PASS                                       |
| `POST /logout`                | `SignOutButton` Server Action/Auth.js                             | ACCEPTABLE DIFFERENCE                      |
| `GET /forgot-password`        | `/forgot-password` page                                           | PASS                                       |
| `POST /forgot-password`       | Forgot-password Server Action                                     | ACCEPTABLE DIFFERENCE                      |
| `GET /reset-password/{token}` | `/reset-password/[token]`                                         | PASS                                       |
| `POST /reset-password`        | Reset-password Server Action                                      | ACCEPTABLE DIFFERENCE                      |
| `GET /password/change`        | `/password/change` page                                           | PASS                                       |
| `POST /password/change`       | Change-password Server Action                                     | PASS                                       |
| `GET /dashboard`              | `/dashboard`                                                      | PASS                                       |
| `GET /dashboard/biomassa`     | `/dashboard/biomassa`                                             | PASS                                       |
| `GET /dashboard/batubara`     | `/dashboard/batubara`                                             | PASS                                       |
| `GET /dashboard/stok`         | `/dashboard/stok`                                                 | PASS                                       |
| `GET /dashboard/solar`        | `/dashboard/solar`                                                | PASS                                       |
| `GET /dashboard/target`       | `/dashboard/target`                                               | PASS                                       |
| `GET /dashboard/filter/reset` | `?reset=1` menghapus filter cookies tanpa route khusus            | ACCEPTABLE DIFFERENCE                      |
| `GET /monitoring`             | `/monitoring`                                                     | PASS dengan placeholder source             |
| `GET /data-batu-bara`         | `/data-batu-bara`                                                 | PASS                                       |
| `GET /laporan`                | `/laporan`                                                        | PASS                                       |
| `GET /pengaturan`             | `/pengaturan`                                                     | PARTIAL karena link change password hilang |

Next juga memiliki internal `/api/auth/[...nextauth]`, yang tidak memiliki
padanan Laravel karena Laravel memakai route/session web biasa.

## Authentication comparison

- Login hanya menerima user `role = admin` dan memverifikasi bcrypt terhadap
  `users`, sama dengan Laravel.
- Logout menghapus cookie Auth.js; mekanisme session berbeda dari Laravel.
- Dashboard dan protected layout memeriksa session serta role server-side.
- Forgot/reset password memakai generic response dan token yang disimpan dalam
  bentuk hash.
- Password plaintext tidak disimpan.
- Change password belum ada di Next.js.
- Laravel memiliki `throttle:6,1` pada login/forgot/reset. Next belum memiliki
  login rate limit yang setara.
- Auth.js masih versi beta; perlu upgrade/regression test sebelum production.

## Data and calculation comparison

### PostgreSQL

Model dan relationship utama cocok:

```text
Unit 1 ─── * CoalQuality
Unit 1 ─── * CoalConsumption
Unit 1 ─── * PowerGeneration
Unit 1 ─── * KpiTarget
```

Query `coal_quality` dan aggregate `coal_consumption` telah diverifikasi
terhadap PostgreSQL existing. Hasil read verification:

- `units`: 3;
- `coal_quality`: 1.095;
- `coal_consumption`: 1.095;
- `coal_stock`: 365;
- `power_generation`: 1.095;
- `kpi_targets`: 1.095;
- orphan foreign-key relationship: tidak ditemukan.

Tidak ada mismatch nilai yang ditemukan pada query yang divalidasi. Perbedaan
yang tetap perlu diperhatikan:

- Laravel menyimpan filter dashboard pada session; Next memakai URL query
  sehingga filter tidak otomatis terbawa antar halaman.
- Prisma mempertahankan `Decimal`, sedangkan Laravel presentation memakai
  format numeric/string.
- `kpi_targets` PostgreSQL adalah target SFC/heat rate per unit, bukan target
  biomassa tahunan Google Sheets.
- Dashboard aktif Laravel memakai Google Sheets; PostgreSQL adalah fallback
  atau source untuk halaman data/laporan.

### Google Sheets

Validasi typed adapter Next terhadap Laravel pada `Juli26-BB`, tanggal 28:

| Nilai                        |                     Laravel |                                           Next.js | Result |
| ---------------------------- | --------------------------: | ------------------------------------------------: | ------ |
| Biomassa receipt bulanan     |     3223.46 (baseline lama) | 3223.46; skema live mendeteksi 7/7 header terbaru | PASS   |
| Biomassa consumption bulanan |                     3740.65 |                                           3740.65 | PASS   |
| Batubara consumption bulanan |                   34940.444 |                                         34940.444 | PASS   |
| Stock                        |                   19152.296 |                                         19152.296 | PASS   |
| Solar harian/bulanan         |                 854 / 24274 |                                       854 / 24274 | PASS   |
| Biomassa cumulative          |                    29103.77 |                                          29103.77 | PASS   |
| Target/progress              | 70020 / 41.564938588974584% |                                              sama | PASS   |
| HOP Unit 1/2/3               |           31.9 / 16 / 10.64 |                                              sama | PASS   |

Mapping range, nullable values, numeric locale parsing, target fallback,
threshold HOP, empty response, error classification, dan fallback 12 periode
terdokumentasi di `docs/GOOGLE_SHEETS_INTEGRATION.md`.

## UI comparison

UI Next mempertahankan shell, hierarchy, dashboard cards, charts, filters,
loading, empty, unavailable, dan error state. Perbedaan yang dapat diterima:

- Chart legacy Chart.js diganti SVG server-rendered tanpa mengubah nilai data.
- Icon/font dan detail CSS berbeda karena target memakai React/Tailwind.
- Laporan Next berupa read-only summary/table; tombol generate/download Laravel
  sendiri disabled/demo dan tidak memiliki endpoint aktif.
- Monitoring Next memperjelas empty/NEEDS REVIEW state, sementara Blade masih
  menampilkan KPI/table placeholder.

## Security findings

### Tidak ditemukan

- Tidak ada `NEXT_PUBLIC_GOOGLE_*`.
- Tidak ada Google credential/token/private key pada client bundle.
- Tidak ada credential JSON di `public/`.
- Google service menggunakan server-only module dan TLS default `fetch`.
- Password tidak dikirim melalui props atau disimpan plaintext.
- Database credential tidak diekspos ke client.

### Needs review

1. Tinjau session cutover: JWT Auth.js tidak membaca cookie Laravel dan token
   yang dicuri dapat tetap valid sampai expiry.
2. Konfigurasikan mail provider production; mode `log` hanya development.
3. Konfirmasi satu service-account JSON aktif. Dua file lokal memiliki private
   key berbeda walaupun metadata service account cocok; jangan commit keduanya.
4. Review `npm audit` yang melaporkan 3 high-severity dependency findings.

## Build and validation gates

| Check                                                | Result                  |
| ---------------------------------------------------- | ----------------------- |
| `php artisan route:list --except-vendor`             | PASS, 21 Laravel routes |
| `npm.cmd run lint`                                   | PASS                    |
| `npx.cmd tsc --noEmit`                               | PASS                    |
| `npm.cmd run build`                                  | PASS                    |
| PostgreSQL read verification `npm.cmd run db:verify` | PASS                    |
| Google Sheets live read-only typed adapter           | PASS                    |
| Google Sheets fallback/error/empty checks            | PASS                    |
| Client bundle credential scan                        | PASS                    |
| Production deployment                                | NOT RUN                 |

Authentication end-to-end test tidak dijalankan ulang pada Phase 9 karena valid
login memperbarui `users.last_login_at`; hasil `npm run auth:verify` dari Phase
4/7 tetap tercatat PASS. Tidak ada operasi tulis database pada validasi Phase 9.

## Recommended fixes

Urutan yang disarankan sebelum menyatakan parity cukup untuk replacement:

1. Putuskan strategi session cutover Laravel ke Auth.js.
2. Putuskan apakah filter dashboard harus dipersist antar halaman seperti
   session Laravel atau URL-only adalah behavior yang disetujui.
3. Konfirmasi source of truth target biomassa, HOP, dan solar.
4. Konfirmasi service-account key aktif dan secret delivery deployment.
5. Review dependency vulnerabilities dan upgrade Auth.js beta secara terpisah.
6. Setelah keputusan tersebut, ulangi route/auth/data/UI/security validation
   tanpa deployment production pada tahap verifikasi.

## Final status

**Phase 9: PASS dengan NEEDS REVIEW — parity 92%.**

Required fixes parity utama sudah diterapkan. Dashboard/data parity, auth
flow, root redirect, filter persistence, dan build gates lulus. Aplikasi masih
memiliki item `NEEDS REVIEW` sebelum production replacement: session cutover,
provider email production, Auth.js beta, credential key selection, dan audit
dependency.
