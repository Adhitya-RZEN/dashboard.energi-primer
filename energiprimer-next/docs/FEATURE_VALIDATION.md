# Feature Validation — Phase 7

## Scope dan prinsip

Phase 7 memigrasikan lima detail dashboard yang aktif dan halaman read-only yang tercantum pada `FEATURE_MAPPING.md`. Laravel tetap reference dan tidak diubah. Query data dipusatkan di service; component hanya menerima typed data.

| Feature                | Route                 | Source                                                     | Status                        |
| ---------------------- | --------------------- | ---------------------------------------------------------- | ----------------------------- |
| Biomassa               | `/dashboard/biomassa` | Google Sheets `B11:CO59`, atau PostgreSQL fallback         | PASS                          |
| Batubara               | `/dashboard/batubara` | Google Sheets `B11:CO59`, atau PostgreSQL fallback         | PASS                          |
| Stok dan HOP           | `/dashboard/stok`     | Google Sheets `AD/AJ/AK/AL`, atau PostgreSQL stock partial | PASS                          |
| Solar                  | `/dashboard/solar`    | Google Sheets `CC/CJ`, PostgreSQL unavailable              | PASS dengan limitation source |
| Target dan Kinerja     | `/dashboard/target`   | Google Sheets `CO56/CO59`, PostgreSQL unavailable          | PASS dengan limitation source |
| Data kualitas batubara | `/data-batu-bara`     | PostgreSQL `coal_quality` + `units`                        | PASS                          |
| Laporan efisiensi      | `/laporan`            | PostgreSQL `coal_consumption`                              | PASS read-only                |
| Pengaturan profil      | `/pengaturan`         | Auth.js session dari `users`                               | PASS read-only                |
| Monitoring terperinci  | `/monitoring`         | Laravel source masih placeholder                           | NEEDS REVIEW                  |

## 1. Biomassa

- Laravel: `DashboardController@biomassa` memakai `prepareDashboardData()` yang sama dengan Overview.
- Next.js: `DetailDashboard` dengan feature `biomassa` memakai `getOverviewData()`.
- KPI: penerimaan bulanan production dihitung hanya dari tujuh pemasok pada tabel `Penerimaan → Biomassa`; tidak ada fallback `S52`, pemakaian bulanan memakai field semantic/legacy fallback, dan pemakaian harian Unit 1/2/3 dari tabel data.
- Chart: line `biomassa_pemakaian` dan stacked bar `T/W/Z` per hari.
- Filter: `day`, `month`, `year` melalui GET.
- State: loading, empty, unavailable, dan error.
- Kompleksitas: sedang–tinggi.
- Risiko: indeks kolom spreadsheet dan field kosong.

Validation Laravel vs Next, `Juli26-BB`, hari 28:

| Nilai              |                     Laravel |                                                Next.js | Result |
| ------------------ | --------------------------: | -----------------------------------------------------: | ------ |
| Penerimaan bulanan | 3223.46 ton (baseline lama) | 3223.46 ton; seluruh 7 header skema terbaru terdeteksi | PASS   |
| Pemakaian bulanan  |                 3740.65 ton |                                            3740.65 ton | PASS   |
| Unit 1/2/3 harian  |      74.8 / 47.6 / 61.2 ton |                                                   sama | PASS   |
| Chart total harian |                   183.6 ton |                                              183.6 ton | PASS   |

## 2. Batubara

- Laravel: `DashboardController@batubara`, source `I42`, `AB42`, `S/V/Y`, dan `AB` harian.
- Next.js: `DetailDashboard` dengan feature `batubara`.
- KPI: penerimaan bulanan, pemakaian bulanan, unit harian, total harian.
- Chart: line total harian dan stacked bar Unit 1/2/3.
- Filter dan state mengikuti contract Overview.
- Kompleksitas: sedang–tinggi.
- Risiko: normalisasi format angka titik/koma.

Validation `Juli26-BB`, hari 28:

| Nilai              |                         Laravel |       Next.js | Result |
| ------------------ | ------------------------------: | ------------: | ------ |
| Penerimaan bulanan |                   30084.842 ton | 30084.842 ton | PASS   |
| Pemakaian bulanan  |                   34940.444 ton | 34940.444 ton | PASS   |
| Unit 1/2/3 harian  | 565.739 / 651.344 / 375.487 ton |          sama | PASS   |
| Total harian       |                     1592.57 ton |   1592.57 ton | PASS   |

## 3. Stok dan HOP

- Laravel: `DashboardController@stok`, stock `AD`, HOP Unit 3/2/1 `AJ/AK/AL`.
- Next.js: stock KPI, capacity indicator `round(stock / 70000 * 100)`, HOP cards, stock line chart, dan multi-line HOP chart.
- Status: `<10` Kritis, `<15` Perhatian, selain itu Aman.
- Filter: `day`, `month`, `year`.
- Kompleksitas: sedang–tinggi.
- Risiko: kapasitas 70.000 ton dan threshold HOP masih hard-coded sesuai Laravel.

Validation `Juli26-BB`, hari 28:

- Stock Laravel/Next: `19152.296` ton — PASS.
- HOP Unit 1/2/3 Laravel/Next: `31.9 / 16 / 10.64` hari — PASS.
- HOP status: `Aman / Aman / Perhatian` — PASS.

## 4. Solar

- Laravel: konsumsi harian/bulanan dari `CJ`, penerimaan bulanan dari `CC`.
- Next.js: `solarConsumptionDaily`, `solarConsumptionMonthly`, `solarReceiptMonthly`, line chart konsumsi, dan grouped bar penerimaan vs konsumsi.
- PostgreSQL belum memiliki tabel solar; fallback menampilkan unavailable, bukan nol buatan.
- Kompleksitas: sedang.
- Risiko: `solar_penerimaan` pada daily series Laravel berasal dari field `CC` yang diberi komentar bulanan.

Validation `Juli26-BB`, hari 28:

- Solar harian Laravel/Next: `854` liter — PASS.
- Solar bulanan Laravel/Next: `24274` liter — PASS.
- Penerimaan bulanan Laravel/Next: `25000` liter — PASS.

## 5. Target dan Kinerja

- Laravel: target `CO56`, realisasi kumulatif `CO59`.
- Next.js: KPI target/realisasi/progress, sisa target, dan native SVG progress chart.
- Formula: `progress = min(100, realisasi / target * 100)` dan `sisa = max(0, target - realisasi)`.
- Target fallback `70020` ton dipertahankan.
- Kompleksitas: sedang.
- Risiko: PostgreSQL `kpi_targets` memiliki definisi SFC/heat rate, bukan target biomassa.

Validation `Juli26-BB`:

- Target Laravel/Next: `70020` ton — PASS.
- Realisasi Laravel/Next: `29103.77` ton — PASS.
- Progress Laravel/Next: `41.564938588974584%` — PASS.
- Sisa Laravel/Next: `40916.23` ton — PASS.

## 6. Data kualitas batubara

- Laravel: `CoalDataController@index`, filter tanggal/unit/status, pagination 15, summary global.
- Next.js: `/data-batu-bara`, service `getCoalQualityPage`, typed filter, pagination, table, dan empty/error state.
- Formula status GAR: `>=4700` On Spec, `4500.. <4700` Perhatian, `<4500` Off Spec.
- Field supplier, nomor pengiriman, volume, dan PDF tetap mengikuti source UI sebagai placeholder karena tidak ada kolom/query sumbernya.
- Kompleksitas: sedang.
- Risiko: beberapa label view legacy tidak sesuai schema aktual.

Validation PostgreSQL:

- Total entri: Laravel-equivalent query dan Next `1095`.
- On Spec: `0`.
- Perhatian: `0`.
- Off Spec: `1095`.
- Average GAR: `4350`.
- Filter `off_spec`, unit, dan page 2 berhasil dirender HTTP 200.

## 7. Laporan efisiensi

- Laravel: agregasi bulanan `coal_consumption` dan summary keseluruhan.
- Next.js: `listMonthlyConsumptionReports()` dan `getConsumptionSummary()` pada halaman `/laporan`.
- Formula: SUM coal, AVG efficiency/heat rate/SFC, COUNT DISTINCT date.
- Generate/preview/download tetap disabled karena Laravel tidak memiliki persistence atau endpoint aktif.
- Kompleksitas: sedang untuk read-only; tinggi untuk generate/download.
- Risiko: laporan mingguan/kualitas pada UI Laravel masih demonstrasi, sedangkan controller hanya menghasilkan agregasi bulanan.

Validation PostgreSQL:

- Total konsumsi: `1068301.74` ton.
- Efisiensi keseluruhan: `87.78%`.
- Heat rate keseluruhan: `2950` kCal/kWh.
- Periode: `2025-01-01` sampai `2025-12-31`.
- Monthly reports: `12` baris.
- Desember 2025: `91379` ton, efisiensi `87.62%`, heat rate `2950`, SFC `454.2`, `31` hari.
- Nilai dan aggregation query cocok dengan controller Laravel.

## 8. Pengaturan profil

- Laravel hanya menampilkan nama/email user dan link change password.
- Next.js menampilkan nama/email dari Auth.js session secara readonly.
- Mutation profile dan ganti password tidak diaktifkan ulang pada Phase 7 karena belum ada flow mutation yang disepakati pada source target.
- Kompleksitas: rendah untuk readonly.
- Validation: authenticated request HTTP 200 dan marker profil tampil — PASS.

## 9. Monitoring terperinci

- Laravel `MonitoringController` sengaja mengirim units kosong, paginator kosong, KPI placeholder, dan `phase1Notice`.
- Next.js mempertahankan notice `NEEDS REVIEW`, filter tampilan, dan empty state tanpa mengarang data shift/supplier/KPI.
- Status: NEEDS REVIEW, bukan klaim bahwa monitoring operasional sudah selesai.
- Implementasi penuh membutuhkan keputusan source query untuk shift, supplier, dan KPI serta validasi owner domain.

## Cross-feature checks

- `npm.cmd run lint`: PASS.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run build`: perlu dijalankan sebagai final gate setelah semua page selesai.
- Authenticated smoke test seluruh dashboard detail: HTTP 200 dan source/period marker — PASS.
- Authenticated smoke test data, laporan, pengaturan, monitoring: HTTP 200 — PASS.
- Tidak ada dependency baru.
- Tidak ada perubahan Laravel, database schema, atau data database.
