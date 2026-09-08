# Pembaruan Kebijakan Mapping BB — 31 Agustus 2026

Dokumen ini mencatat keputusan mapping yang diberikan setelah audit workbook
BB. Dokumen ini menjadi addendum terhadap audit dan laporan mapping sebelumnya;
temuan historis tidak dihapus atau ditulis ulang.

## Keputusan yang diterapkan

| No. | Keputusan | Implementasi |
| --- | --- | --- |
| 1 | Nama pemasok dapat berbentuk `[Nama Bahan Biomassa] PT [Perusahaan]`. | Parser menerima nama material `Sawdust`, `Woodchip`, atau `Sekam Padi` dengan badan usaha `PT`/`CV` dan nama perusahaan. Pencarian case-insensitive dan whitespace-insensitive. |
| 2 | Solusi supplier yang sama digunakan untuk variasi pemasok/duplikasi label. | Nama perusahaan berbeda menjadi identity berbeda, bukan ditebak sebagai alias supplier canonical. Kolom dengan identity yang sama dideduplikasi secara deterministik; block pemasok yang paling lengkap dipilih agar summary block tidak dihitung dua kali. |
| 3 | Unit yang benar adalah Unit 1, Unit 2, Unit 3. | Kandidat unit disusun berdasarkan urutan fisik kolom. Jika label Unit 2 berulang pada blok ketiga, blok ketiga diperlakukan sebagai Unit 3 dalam konteks urutan 1–3. |
| 4 | Tanggal yang bergeser diabaikan. | Tanggal kalender invalid atau tanggal di luar bulan/tahun worksheet dikeluarkan dari canonical daily series/import candidates. Nilai source tetap tersedia untuk evidence/audit dan tidak dikoreksi diam-diam. |
| 5 | Formula error akibat kesalahan manusia diabaikan. | Cell `#DIV/0!`, `#REF!`, dan formula error lain tidak diubah menjadi nol. Jika masih ada angka valid, angka tersebut tetap dijumlahkan; bila seluruh kandidat malformed, field tetap unresolved/malformed. |
| 6 | Fallback target boleh digunakan bila tabel `Target [Tahun]` tidak ditemukan. | Parser menggunakan target resmi `70.020` ton untuk tahun worksheet dengan confidence `WARNING` dan source `null`. Target eksplisit yang malformed atau berbeda tidak ditimpa oleh fallback. |
| 7 | `BIOMASS_STOCK` tidak diperlukan user. | Tetap `FUTURE_SCOPE_DATA`, tidak dipetakan ke tabel database, tidak masuk KPI/chart, dan tidak ada perubahan schema. |
| 8 | Precision dikalibrasi sesuai target database. | Nilai source/staging tetap mempertahankan presisi input. Saat menulis ke tabel legacy `coal_consumption`, `coal_stock`, dan `hop_readings`, nilai dibulatkan half-up ke dua desimal sesuai tipe existing. |

## Batas identitas pemasok

Contoh berikut diterima sebagai identity terpisah:

```text
Woodchip PT Bhirawa       -> woodchip-pt-bhirawa
Woodchip PT RAP           -> woodchip-pt-rap
Sawdust PT Syahroni       -> sawdust-pt-syahroni
```

`Woodchip PT Bhirawa` tidak otomatis digabung dengan RAP atau Syahroni.
Label generic seperti `Woodchip` tanpa badan usaha/perusahaan dan material
yang tidak memiliki pola approved tetap tidak dipakai sebagai supplier.

## Penanganan duplicate block

Parser mengelompokkan kolom berdasarkan supplier code hasil normalisasi.
Untuk identity yang sama, prioritas pemilihan adalah:

1. label canonical;
2. coverage angka pada data rows;
3. kolom paling kiri.

Setelah itu kandidat dikelompokkan berdasarkan kedekatan kolom. Block dengan
jumlah canonical supplier terbanyak, jumlah supplier terbanyak, lalu coverage
angka terbaik dipakai sebagai block penerimaan. Tujuannya mencegah block
summary historis yang mengulang nilai detail ikut dijumlahkan.

Nama perusahaan yang berbeda tidak dianggap duplicate hanya karena materialnya
sama. Penyamaan dua perusahaan memerlukan keputusan bisnis terpisah.

## Dampak terhadap import

- Worksheet dengan supplier pattern legacy dapat menghasilkan aggregate dan
  row-level candidate.
- Jika tujuh supplier canonical tidak lengkap, plan menambahkan
  `biomass_supplier_schema_legacy` sebagai review gate; hasil parsial tidak
  dihapus dari parser.
- Formula error parsial tidak diubah menjadi nol. Untuk daily unit/series,
  baris sumber tetap dipertahankan sebagai `VALID_EMPTY` dengan nilai `null`;
  aggregate receipt hanya dipersist jika ada nilai numeric.
- Coal stock hanya dipersist jika `closingStock` dan `consumed` sama-sama
  tersedia. Nilai consumed malformed tidak lagi dipaksa menjadi nol.
- Invalid/shifted date tidak menjadi daily import row. Duplicate tanggal yang
  valid tetap memerlukan review karena winner tidak dipilih otomatis.

## Keamanan dan database

Perubahan ini hanya menyentuh parser, mapping, validasi, dan pembulatan payload
import. Tidak ada:

- perubahan Laravel;
- perubahan Prisma schema;
- migration atau `prisma db push`;
- INSERT/UPDATE/DELETE ke database;
- perubahan credential, API contract, authentication, atau authorization.

## Validasi

| Check | Hasil |
| --- | --- |
| `npm run dynamic:verify` | PASS — regression parser dan kasus policy baru lulus |
| `npm run bb:mapping:test` | PASS — 27 assertions |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — production build dan seluruh route dashboard terdaftar |
| `scripts/verify-db.mjs` | PASS — read-only; database/schema dan relationship dapat dibaca |
| `scripts/verify-import-data.mjs` | PASS — read-only; Unit 1, Unit 2, Unit 3 dan aggregate baseline tersedia |
| Live Google Sheets read | PASS - metadata dan 43 worksheet BB scope 2023-terbaru berhasil dibaca; tidak ada nilai credential yang ditulis ke output |
| Database/import write | Tidak dijalankan |

## Dry-run Historis Terbaru

Perintah read-only berikut dijalankan setelah kebijakan mapping diterapkan dan parser diperbaiki:

```text
npm run bb:mapping
```

Percobaan sebelumnya **BLOCKED sebelum discovery worksheet selesai** karena API Google Sheets
mengembalikan kegagalan request (`fatalErrorCode: api`). Itu merupakan batasan
network pada environment eksekusi, bukan kegagalan credential atau parser.
Setelah akses jaringan diizinkan, discovery dan pembacaan live berhasil.<!--
bukti bahwa data 2023–2026 sudah tervalidasi. Pembacaan state database tetap
berhasil, snapshot stabil, dan `databaseWrites: 0`.-->

<!-- Konsekuensi pada percobaan lama:

- `Juli26-BB` tetap memiliki regression evidence lokal sebelumnya: 352 row,
  rejected 0, duplicate 0, dan re-import `SKIP 352`.
- Validasi live per worksheet 2023–2026 masih harus diulang setelah akses API
  pulih.
- Tidak ada import yang dijalankan sebagai akibat dari dry-run ini. -->

Hasil live terbaru:

```text
status: PASS_WITH_REVIEW
totalWorksheetsDiscovered: 199
bbWorksheets (2023-terbaru): 43
outOfScopeBbWorksheets (sebelum 2023): 12
fatalErrorCode: null
readFailureCount: 0
databaseWrites: 0
databaseSnapshotStable: true
```

Regression `Juli26-BB`:

```text
planStatus: READY_FOR_IMPORT
rows: 352
insertCandidate: 0
updateCandidate: 0
skipCandidate: 352
rejected: 0
matchesExpected: true
```

Status keseluruhan tetap `PASS_WITH_REVIEW`, bukan `PASS`, karena 42 worksheet
historis dalam scope masih memiliki schema legacy, field unresolved, atau
collision tanggal/business key sehingga belum aman di-import otomatis. Tidak
ada import yang dijalankan sebagai akibat dari dry-run ini.

Perbaikan parser yang divalidasi pada pengulangan ini:

- kolom `TON` parsial tidak lagi dianggap sebagai set tiga unit; pemetaan
  menggunakan urutan kolom ketika hanya satu kolom yang memiliki label `TON`;
- baris daily dengan nilai kosong tetap tersedia sebagai `VALID_EMPTY` agar
  parity row dan provenance tidak hilang;
- scope dry-run dibatasi mulai tahun 2023 hingga worksheet terbaru.

## Catatan deployment

Target fallback `70.020` adalah policy value resmi yang sudah ada pada
kontrak import. Karena fallback tidak memiliki source cell, setiap hasil
fallback harus tetap terlihat sebagai `WARNING` pada audit/import report dan
perlu dikonfirmasi sebelum historical bulk import.

## Phase 2 — Solar Provenance Mapping Remediation

### Objective

Menyamakan source provenance `Pemakaian Solar Harian` dengan kolom yang benar-benar dipakai untuk membaca `quantity_liter`, tanpa mengubah schema, formula KPI, atau data historis.

### Root Cause

`daily-parser.ts` memilih kolom Solar melalui `choosePath(...)` berdasarkan coverage nilai numerik. Pada worksheet `Juni26-BB`, kandidat `CF` berlabel `TOTAL COUNTER` kosong pada baris harian, sedangkan `CJ` berlabel `TOTAL` berisi nilai Solar. Karena itu quantity harian berasal dari `CJ`.

`plan.ts` sebelumnya melakukan discovery ulang dengan memilih kandidat Solar pertama yang `resource === "solar" && isTotal`, sehingga memilih `CF` untuk membentuk `source_cell`. `commit.ts` kemudian menyimpan quantity yang benar bersama provenance yang salah.

### Changes

- Metadata `dailyColumns` hasil keputusan parser sekarang diteruskan melalui `DynamicParserResult`.
- Import plan menggunakan kolom Solar yang sama dari metadata parser saat membentuk `source` setiap baris.
- Tidak ada hardcode baru terhadap `CJ`; fixture test menggunakan kolom dinamis yang berbeda dan tetap menghasilkan provenance yang konsisten.
- `quantity_liter`, `reading_date`, formula KPI, receipt mapping, dan schema existing dipertahankan.

### Files Affected

- `src/services/google-sheets/dynamic/types.ts`
- `src/services/google-sheets/dynamic/parser.ts`
- `src/services/google-sheets/dynamic/parsers/daily-parser.ts`
- `src/services/google-sheets/import/plan.ts`
- `scripts/verify-dynamic-parser.ts`
- `scripts/verify-bb-legacy-mapping.ts`

### Validation

| Check | Result |
| --- | --- |
| `npm.cmd run dynamic:verify` | PASS |
| `npm.cmd run bb:mapping:test` | PASS — 27 assertions |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run db:verify-kpi:juni` | PASS — 30 Solar rows, 26.848 liter; read-only |
| `npm.cmd run db:verify-overview` | PASS — July 24.274 liter; read-only |
| Live Solar plan Januari–Juli 2026 | PASS — source cell mengikuti `CJ` pada setiap worksheet |

### Status

`PASS_WITH_REVIEW`: remediation code dan regression test lulus. Tidak ada migration, schema change, tabel baru, atau database write.

### Known Issues

Record historis pada `solar_consumptions` masih dapat memiliki `source_cell` lama `CF11:CF40` meskipun `quantity_liter` benar. Historical mutation tidak dilakukan pada Phase 2 karena strategi update dan audit trail belum disetujui.

Status: `NEEDS VERIFICATION` untuk koreksi provenance historis.

### Next Steps

Sebelum import historis ulang atau backfill provenance, verifikasi strategi update yang hanya mengubah `source_cell`, mempertahankan `quantity_liter`, dan menyediakan hasil audit. Phase berikutnya dapat memverifikasi binding KPI/UI tanpa mengubah formula atau source.

## Phase 3 - Solar KPI UI / Data Binding Verification

### Scope and decision

Audit ini memverifikasi jalur data `Pemakaian Solar Harian` dari source asli
sampai KPI dan chart. Tidak ada migration, perubahan schema, tabel baru,
endpoint baru, perubahan UI, atau write ke database.

Keputusan final: `REUSE_EXISTING_SOURCE`.

### Source discovery

Source asli yang tervalidasi adalah worksheet Google Sheets `Juni26-BB`.
Header Solar harian berada pada kolom `CJ` (index relatif `86` terhadap range
`B11:CO59`), dengan data harian pada row spreadsheet `11..40`. Total bulanan
berada pada `CJ42`. Pada runtime dashboard yang aktif saat validasi, Google
Sheets hanya menjadi source importer; page dan chart membaca PostgreSQL
normalized.

| Layer | Evidence | Mapping |
| --- | --- | --- |
| Worksheet/parser | `src/services/google-sheets/dynamic/parsers/daily-parser.ts`, `parseDailyTable` | memilih path `resource === "solar" && isTotal`; hasilnya `dailyColumns.solar`; tanggal berasal dari `structure.dateColumn` |
| Import plan | `src/services/google-sheets/import/plan.ts`, `solarPath` dan `buildRows` | memakai kolom Solar yang sama dari parser; menyimpan `readingDate`, `quantityLiter`, dan source cell per row |
| Normalized database | `prisma/schema.prisma`, model `SolarConsumption` | table `solar_consumptions`; `reading_date DATE`, `quantity_liter DECIMAL(18,3)`, `source_worksheet`, `source_cell`; unique `reading_date` |
| PostgreSQL service | `src/services/overview-postgres.ts`, `loadOverviewRows` | membaca `readingDate` pada periode visible dan `quantityLiter`, terurut tanggal |
| Shared contract | `src/types/overview.ts`, `OverviewMetric` dan `OverviewDailyPoint` | `solarConsumptionDaily` memakai unit `liter`; `series[].solar` memakai date key ISO |
| Page | `src/app/(protected)/dashboard/page.tsx` dan `src/app/(protected)/dashboard/solar/page.tsx` | keduanya memanggil `getOverviewData` dan meneruskan `OverviewData` tanpa API/proxy tambahan |
| KPI UI | `src/components/dashboard/OverviewDashboard.tsx` dan `DetailDashboard.tsx` | kartu `Pemakaian Solar Harian` membaca `data.metrics.solarConsumptionDaily` |
| Chart UI | `src/components/dashboard/DetailDashboard.tsx` dan `DetailCharts.tsx` | `DetailLineChart` menerima `data.series` dengan `dataKey="solar"`; tidak melakukan fetch atau agregasi baru |

### KPI formula and grain

Formula PostgreSQL dashboard adalah:

```text
solarConsumptionMonthly = SUM(solar_consumptions.quantity_liter)
  WHERE reading_date >= period_start
    AND reading_date < visible_period_end

solarConsumptionDaily = SUM(solar_consumptions.quantity_liter)
  WHERE reading_date = focus_date
```

Implementasi `buildSeries` membentuk bucket berdasarkan `dateKey(readingDate)`
dan mengisi `point.solar` dari `quantity_liter`; `focusPoint.solar` kemudian
dijadikan `metrics.solarConsumptionDaily`. Karena tabel memiliki unique
`reading_date`, grain hari bersifat deterministik. Tidak ada pembagian angka
bulanan, estimasi, proxy KPI, atau interpolasi. Nilai kosong tetap `null` dan
`available` menjadi `false`; nilai `0` tetap dianggap tersedia.

Date mapping menggunakan `DATE` PostgreSQL yang dibaca sebagai UTC date-only
dan dinormalisasi ke key `YYYY-MM-DD`. `defaultFocusDateForMonth` menerapkan
query hari dan dashboard cutoff `Asia/Makassar`; pada query Juli 2026 dengan
hari 28, focus date adalah `2026-07-28`.

`solar_receipts.quantity_liter` tidak dipakai sebagai proxy. Receipt memiliki
grain bulanan sendiri dan hanya mengisi `solarReceiptMonthly`.

### Existing versus new table

Pola terdekat adalah `biomass_consumptions` dan `coal_consumption`: keduanya
menyimpan nilai konsumsi dengan tanggal operasional lalu service membentuk
agregat harian berdasarkan tanggal. `solar_consumptions` memiliki pola yang
sama, dengan perbedaan bahwa Solar tidak dipecah per unit dan memiliki satu
baris unik per `reading_date`. Perbedaan ini tidak fundamental dan justru
sesuai dengan grain source Solar.

`solar_receipts` tidak cocok untuk KPI ini karena grain-nya satu row per
periode/bulan. Menggunakannya sebagai pengganti atau membagi receipt bulanan
menjadi hari akan melanggar definisi KPI. Oleh sebab itu tabel existing
`solar_consumptions` dapat digunakan; proposal tabel baru tidak diperlukan.

### Root cause classification

Primary classification: `NO_CODE_BUG_FOUND`.

Tidak ditemukan `UI_BINDING_BUG`, `SERVICE_MAPPING_BUG`,
`DB_SOURCE_BUG`, `DATE_ALIGNMENT_BUG`, atau `FORMATTER_OR_NULL_BUG` pada
jalur aktif. Temuan `PROVENANCE_MAPPING_BUG` dari Phase 2 sudah diperbaiki
untuk import berikutnya: plan kini menggunakan kolom yang sama dengan parser
untuk `source_cell`. Record historis yang masih menyimpan provenance `CF`
belum diubah dan tetap berstatus `NEEDS VERIFICATION`; hal tersebut tidak
mengubah `quantity_liter` yang dibaca service.

### KPI and chart verification

Read-only service verification pada PostgreSQL menghasilkan:

| Check | Result |
| --- | --- |
| Effective source | `PostgreSQL normalized data` |
| Focus date | `2026-07-28` |
| `solarConsumptionDaily` | `854 liter` |
| Focus chart point `series[date=2026-07-28].solar` | `854 liter` |
| `solarConsumptionMonthly` | `24,274 liter` |
| `solarReceiptMonthly` | `25,000 liter` dari `solar_receipts` |
| Daily series length | `31` rows |
| Missing-value behavior pada `2026-07-30` | metric `null`, `available=false`, chart point `solar=null` |

Dengan demikian kartu KPI dan line chart mengonsumsi source/point yang sama;
tidak ada source terpisah yang dapat menyebabkan angka kartu dan chart berbeda.

### Implementation and validation

Tidak ada perubahan runtime. Verifier read-only existing diperkuat di
`scripts/verify-postgres-overview.ts` dengan assertion untuk:

- metric harian, unit, dan source field;
- kesamaan metric dengan focus-date chart point;
- perilaku `null`/unavailable pada hari tanpa nilai;
- output nilai `solarConsumptionDaily` pada report.

Validation:

| Command/check | Result |
| --- | --- |
| `npm.cmd run db:verify-overview` | PASS; service, daily metric, chart alignment, dan null semantics |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run build` | PASS; route `/dashboard/solar` terdaftar |
| Local protected route check | `/dashboard/solar?...` -> `307 /login`; `/login` -> `200` |
| Database writes | `0`; tidak ada migration/schema operation |

Visual verification setelah login admin tidak dapat dijalankan karena tidak
ada credential test admin pada environment. Karena itu status tidak dinaikkan
menjadi `VERIFIED`.

### Historical data and known issues

Tidak ada historical mutation. `quantity_liter` dan record historis tetap
dipertahankan. Koreksi `source_cell` historis `CF11:CF40` ke kolom Solar yang
benar memerlukan strategi update dan audit trail terpisah.

Known review item:

1. lakukan authenticated manual visual check pada `/dashboard` dan
   `/dashboard/solar` untuk memastikan label, angka `854 liter`, tanggal fokus,
   dan line chart terlihat sesuai;
2. bila diperlukan, lakukan remediation provenance historis terpisah dengan
   approval, tanpa mengubah nilai kuantitas.

Status Phase 3: `PASS_WITH_REVIEW`.

## Phase 4 - Authenticated Visual & Runtime Verification

### Objective and scope

Phase 4 memverifikasi implementasi `Pemakaian Solar Harian` pada aplikasi
yang berjalan setelah authenticated login. Verifikasi meliputi `/dashboard`,
`/dashboard/solar`, focus date, nilai KPI, unit, chart, tooltip, missing-data
semantics, runtime errors, dan loading sederhana. Tidak ada perubahan schema,
migration, tabel, endpoint, formula, source mapping, atau historical data.

Keputusan source dari Phase 3 tetap `REUSE_EXISTING_SOURCE`: dashboard aktif
membaca PostgreSQL normalized `solar_consumptions`, bukan
`solar_receipts` atau proxy lain.

### Environment and authentication

Environment authenticated menggunakan deployment target yang dikonfigurasi
oleh `AUTH_TEST_BASE_URL` dan credential admin yang sudah tersedia melalui
`AUTH_TEST_ADMIN_EMAIL` / `AUTH_TEST_ADMIN_PASSWORD` pada `.env.e2e.local`.
Nilai credential tidak dicatat.

| Check | Result | Evidence |
| --- | --- | --- |
| Login form dengan credential valid | PASS dengan catatan navigasi | Session cookie terbentuk; sesudah server action URL browser masih `/login`, lalu navigasi authenticated langsung ke `/dashboard` menghasilkan `200` dan marker overview |
| Auth.js CSRF | PASS | `GET /api/auth/csrf` -> `200` |
| Auth.js credentials callback | PASS | `POST /api/auth/callback/credentials` -> redirect `302`, session cookie terbentuk |
| Protected dashboard | PASS | `/dashboard?month=7&year=2026&day=28` -> `200`; halaman authenticated tampil |

Tidak ada bypass middleware, fake user, perubahan `AUTH_SECRET`, atau
provisioning user. Endpoint callback yang dipakai untuk cross-check adalah
endpoint Auth.js resmi yang sama dengan konfigurasi aplikasi.

### Route and UI verification

| Check | Actual result | Status |
| --- | --- | --- |
| Overview route | `/dashboard` -> `200`; `Overview Energi Primer` tampil | PASS |
| Daily KPI label | `Pemakaian Solar Harian` | PASS |
| Focus date | `28 Juli 2026` | PASS |
| Daily KPI value | `854 liter` | PASS |
| Monthly KPI value | `24.274 liter` | PASS |
| Solar detail route | `/dashboard/solar` -> `200`; `Ringkasan Solar` tampil | PASS |
| Detail KPI parity | Daily `854 liter`, focus date, dan monthly `24.274 liter` sama dengan Overview | PASS |

Nilai UI di atas cocok dengan hasil service/database Phase 3: focus date
`2026-07-28` pada `solar_consumptions.quantity_liter` adalah `854`, dan SUM
periode Juli adalah `24,274` liter. Kartu dan detail chart menggunakan
`OverviewData` yang sama; tidak ditemukan divergence pada runtime.

### Solar chart and tooltip

Chart `Pemakaian Solar Harian` pada `/dashboard/solar` tampil dengan satu SVG,
satu line, dan 29 titik bernilai dari series Juli. 29 titik sesuai dengan 31
hari periode dan dua nilai Solar yang null pada data source. Binding runtime
terverifikasi melalui chart label `Grafik Pemakaian Solar`, series `solar`,
dan unit `liter`.

Hover pada titik focus menghasilkan tooltip yang memuat:

- tanggal `28 Juli 2026`;
- label `Pemakaian Solar`;
- nilai `854`;
- unit `liter`.

Nilai tooltip sama dengan KPI dan tidak mengambil `solarReceipt`.

### NULL and missing-data verification

Pada query `day=30`:

| Surface | Actual behavior | Status |
| --- | --- | --- |
| Overview daily panel | `30 Juli 2026`, `Data belum tersedia`, dan catatan source aktif | PASS |
| Solar detail KPI | `30 Juli 2026`, dash, `liter`; tidak menjadi `0 liter` | PASS |
| Solar chart | Tetap tampil; null point tidak difabrikasi/interpolasi | PASS |

Behavior ini konsisten dengan service: `solar = null` dan metric
`available = false`. Tidak ada pembagian angka bulanan, estimasi, dummy data,
atau penggunaan receipt sebagai pengganti.

### Runtime and loading observation

Authenticated browser run mencatat:

- console errors: `0`;
- page errors: `0`;
- HTTP response `4xx/5xx`: `0`;
- route render sampai marker UI: sekitar `3.7-5.7` detik per navigasi yang
  diuji;
- tidak ada infinite loading, blank chart, hydration error, atau crash.

Beberapa request `GET` prefetch dan `POST /login` tercatat aborted saat
navigasi halaman pada headless browser, tetapi tidak menghasilkan HTTP error;
session tetap terbentuk dan protected route berhasil. Ini dicatat sebagai
observasi auth/navigation, bukan error Solar.

### Database safety and code changes

Tidak ada INSERT/UPDATE/DELETE terhadap tabel Solar, tidak ada migration,
schema modification, reimport, atau historical provenance mutation. Dengan
demikian business-data/schema/migration writes Phase 4 adalah `0`.

Catatan penting: alur login valid memang menjalankan `prisma.user.update` pada
`users.last_login_at` sesuai desain Auth.js. Ini adalah side effect metadata
authentication yang diharapkan, bukan perubahan data KPI; jumlah pastinya
tidak diinstrumentasi.

Tidak ada code change runtime pada Phase 4. Verifier dan screenshot sementara
untuk observasi sudah dihapus setelah inspeksi; hanya entry dokumentasi ini
yang ditambahkan.

### Validation

| Command/check | Result |
| --- | --- |
| Authenticated Playwright UI run dengan credential valid | PASS untuk Overview, Solar detail, chart, tooltip, focus date, dan null semantics |
| Temporary screenshot inspection | PASS; card, unit, tanggal, chart, dan missing-data state terlihat benar |
| `npm.cmd run db:verify-overview` | PASS; final read-only rerun mengonfirmasi daily `854`, monthly `24,274`, chart alignment, dan null semantics |
| `npm.cmd run dynamic:verify` | PASS pada Phase 3 baseline |
| `npm.cmd run bb:mapping:test` | PASS pada Phase 3 baseline; 27 assertions |
| `node --env-file=.env.e2e.local scripts/verify-auth.mjs` | `VALIDATION_ERROR` tersanitasi pada verifier existing; direct Auth.js callback + authenticated browser route tetap PASS. Perlu review terpisah bila verifier dipakai sebagai gate |

### Root cause and known issues

Root cause Solar: `NO_CODE_BUG_FOUND`. Tidak ada bukti runtime untuk
`DATA_QUERY_BUG`, `SERVICE_MAPPING_BUG`, `KPI_COMPONENT_BUG`,
`CHART_BINDING_BUG`, `DATE_ALIGNMENT_BUG`, `FORMATTER_BUG`, atau
`NULL_SEMANTICS_BUG`.

Known issues yang tidak memblokir KPI Solar:

1. Record historis `solar_consumptions` masih dapat menyimpan provenance
   `source_cell` lama `CF11:CF40`; Phase 4 tidak mengubahnya.
2. Login form membentuk session tetapi headless observation tetap berada di
   `/login` sampai route protected dinavigasi; direct `/dashboard` authenticated
   tetap `200`. Existing `auth:verify` juga mengembalikan error tersanitasi,
   sehingga auth verifier/navigation perlu follow-up terpisah bila dijadikan
   release gate.

### Final status

`PASS_WITH_REVIEW` untuk Phase 4 secara keseluruhan karena observasi auth
verifier/navigation di atas. Seluruh verifikasi authenticated Solar KPI
sendiri lulus: Overview dan detail menampilkan `854 liter` pada `28 Juli
2026`, monthly `24.274 liter`, chart dan tooltip konsisten, serta null date
`30 Juli 2026` tidak berubah menjadi angka fabricated.

Phase 5 untuk perbaikan Solar KPI: `NO`. Jika diperlukan, investigasi auth
verifier/post-login navigation dilakukan sebagai pekerjaan terpisah dan tidak
boleh mengubah source, formula, schema, atau historical Solar data.

## Phase 6 — Historical BB Mapping Remediation

### Status dan batas fase

Review date: 2026-09-08 (Asia/Makassar).

Status Phase 6: **`PASS_WITH_REVIEW`**.

Phase ini hanya melakukan discovery, schema classification, mapping evidence,
duplicate/collision analysis, dan dry-run read-only. Tidak ada import,
backfill, seed, migration, schema change, database correction, Google Sheets
write, Auth.js change, Solar change, atau dashboard change.

`/docx` tidak tersedia pada repository ini. Dokumen mapping policy existing
ini digunakan sebagai source of truth dan diperbarui; laporan historis lain
tetap dipertahankan sebagai historical evidence, bukan sebagai hasil live
Phase 6.

### Existing pipeline dan source of truth

Phase 6 memakai implementation existing, bukan scanner baru:

| Layer | Existing implementation | Evidence |
| --- | --- | --- |
| Worksheet metadata | `listGoogleSheetsWorksheets()` | `src/lib/google-sheets.ts` |
| Worksheet eligibility | `parseBBWorksheetName()` | `src/services/google-sheets/dynamic/worksheet-resolver.ts` |
| Read range | `A1:ZZ500` | `src/services/google-sheets/dynamic/reader.ts` |
| Cell scanner | `scanSpreadsheet()` | `src/services/google-sheets/dynamic/spreadsheet-scanner.ts` |
| Structure/header/table detection | `parseDynamicWorksheet()` dan `analyzeTableStructure()` | `src/services/google-sheets/dynamic/parser.ts` |
| Daily semantic mapping | `parseDailyTable()` | `src/services/google-sheets/dynamic/parsers/daily-parser.ts` |
| Import staging plan | `buildGoogleSheetsImportPlanFromReadResult()` | `src/services/google-sheets/import/plan.ts` |
| Schema family | `classifySchemaFamily()` | `src/services/google-sheets/legacy-mapping/mapper.ts` |
| Legacy mapping and gate | `mapLegacyWorksheet()` | `src/services/google-sheets/legacy-mapping/mapper.ts` |
| Dry-run runner | `run-bb-legacy-mapping.ts` | `scripts/run-bb-legacy-mapping.ts` |

Policy identity tetap eksplisit: worksheet BB valid harus memakai token bulan
yang disetujui, dua digit tahun, dan suffix `-BB`. Alias seperti `Jan`, `Feb`,
`Sept`, `Okt`, atau `Des` diterima hanya karena secara eksplisit terdaftar di
resolver; kolom tidak dipilih berdasarkan huruf/posisi saja.

### Historical discovery

Dry-run live menggunakan `scripts/run-bb-legacy-mapping.ts --compact` tanpa
`--write-report`. Hasil source-of-truth aktual:

| Discovery | Count |
| --- | ---: |
| Semua worksheet metadata | 199 |
| BB in-scope (`2023` sampai terbaru) | 43 |
| BB out-of-scope sebelum 2023 | 12 |
| Non-BB / bukan source database BB pada fase ini | 144 |
| Read failure | 0 |
| Database writes | 0 |
| Database snapshot | Stable |

Worksheet BB out-of-scope yang ditemukan:

`JAN22 - BB`, `FEB22-BB`, `Mar22-BB`, `Apr22-BB`, `Mei22-BB`,
`Juni22-BB`, `Juli22-BB`, `Agus22-BB`, `Sep22-BB`, `Okt22-BB`,
`Nov22-BB`, `Des22-BB`.

### Inventory in-scope

Status mapping di bawah ini adalah status worksheet-level dan tidak menggantikan
status per-field. `CONFIRMED*` berarti seluruh entity yang didukung plan
memiliki candidate deterministik dan tidak memiliki blocking issue pada dry-run;
worksheet tersebut tetap memerlukan review provenance/future-scope sebelum
Phase 7. `UNRESOLVED + COLLISION` sengaja dihitung overlap, bukan kategori
mutually exclusive.

| Worksheet | Tahun | In scope | Schema | Mapping status |
| --- | ---: | --- | --- | --- |
| Jan23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_B | UNRESOLVED |
| Feb23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_B | UNRESOLVED |
| Mar23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_C | UNRESOLVED |
| Apr23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_C | UNRESOLVED |
| Mei23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_C | UNRESOLVED |
| Juni23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_C | UNRESOLVED + COLLISION |
| Juli23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_C | UNRESOLVED |
| Agust23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Sept23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Okt23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Nov23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Des23-BB | 2023 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Jan24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Feb24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Mar24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| APR24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| MEI24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| JUNI24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| JULY24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| AGUS24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| SEPT24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Okt24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Nov24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Des24-BB | 2024 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Jan25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Feb25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Mar25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Apr25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Mei25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Juni25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Juli25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Agustus25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| September25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED + COLLISION |
| Oktober25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| November25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Desember25-BB | 2025 | IN_SCOPE | LEGACY_FAMILY_A | UNRESOLVED |
| Januari26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| Februari26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| Maret26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| April26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| Mei26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| Juni26-BB | 2026 | IN_SCOPE | LEGACY_FAMILY_A | CONFIRMED* |
| Juli26-BB | 2026 | IN_SCOPE | CANONICAL_FAMILY | CONFIRMED* |

### Schema classification dan cluster

Schema family dihitung dari semantic-key coverage dan label coverage terhadap
`Juli26-BB`, bukan dari tahun atau column letter:

| Schema cluster | Count | Semantic coverage live | Structural interpretation |
| --- | ---: | --- | --- |
| `CANONICAL_FAMILY` | 1 | 100% | `Juli26-BB`; current canonical reference |
| `LEGACY_FAMILY_A` | 35 | 90.7%–100% | Semantic fields largely equivalent, tetapi physical order, aliases, receipt/cumulative resolution, provenance, atau duplicate evidence perlu review |
| `LEGACY_FAMILY_B` | 2 | 37.0%–44.4% | Meaning tidak aman untuk auto-map; seluruh field value menunggu owner mapping |
| `LEGACY_FAMILY_C` | 5 | 47.2%–50.9% | Partial overlap; block/identity semantics ambiguous dan tidak auto-map |

Canonical/representative structural evidence:

| Worksheet | Read range | Detected range | Header rows | Date | Solar quantity | Daily rows |
| --- | --- | --- | --- | --- | --- | ---: |
| `Juli26-BB` | `A1:ZZ500` | `A4:DJ148` | `5, 8, 9, 10` | `B` / column 2 | `CJ` / column 88, `HSD > COAL HANDLING > BIOMASSA > TOTAL` | 31 |
| `Januari26-BB`–`Juni26-BB` | `A1:ZZ500` | `A1/A4:DJ147` sesuai worksheet | `5, 8, 9, 10` | `B` / column 2 | `CJ` / column 88, semantic Solar total | 28–31 |

Legacy Family A produces deterministic supported plan rows on the 2026 set,
but older Family A worksheets remain blocked by unresolved receipt/cumulative
fields, ambiguous fields, provenance gaps, or collision evidence. Family B/C
does not produce canonical records because its profile explicitly has no
auto-mapped entity types.

### Mapping policy dan provenance

Mapping contract existing tetap digunakan:

| Source semantic field | Existing target | Grain/unit | Decision |
| --- | --- | --- | --- |
| `BIOMASS_RECEIPT` | `biomass_receipts.quantity_ton` | period + supplier / ton | auto-map hanya canonical/Family A dengan evidence |
| `BIOMASS_CONSUMPTION` | `biomass_consumptions.quantity_ton` | date + unit / ton | auto-map hanya canonical/Family A dengan evidence |
| `COAL_RECEIPT` | `coal_receipts.quantity_ton` | period / ton | unresolved jika source receipt tidak terbukti |
| `COAL_CONSUMPTION` | `coal_consumption.coal_used` | date + unit / ton | semantic mapping existing |
| `COAL_STOCK` | `coal_stock.closing_stock` | date / ton | existing target; tidak disamakan dengan biomass stock |
| `SOLAR_RECEIPT` | `solar_receipts.quantity_liter` | period / liter | bukan pengganti Solar daily |
| `SOLAR_CONSUMPTION` | `solar_consumptions.quantity_liter` | date / liter | existing target; source daily semantic |
| `HOP` | `hop_readings.hop_days` | date + unit / hari | semantic mapping existing |
| `BIOMASS_TARGET` | `biomass_targets.target_ton` | target year / ton | historical value tidak ditimpa |
| `BIOMASS_CUMULATIVE` | `biomass_cumulative_snapshots.cumulative_ton` | snapshot / ton | unresolved jika kandidat ambiguous |
| `BIOMASS_STOCK` | no existing target | — | `FUTURE_SCOPE_DATA`, tidak dipersist |

Untuk canonical `Juli26-BB`, provenance yang terbukti adalah:

- requested read range `A1:ZZ500`;
- detected range `A4:DJ148`;
- date header `NO > TGL`/`TANGGAL > TGL` pada kolom `B`, daily row `11..41`;
- Solar header `HSD > COAL HANDLING > BIOMASSA > TOTAL` pada `CJ`;
- first daily Solar source cell `CJ11`, satu source cell per row berikutnya;
- monthly Solar receipt source `Y69`;
- plan menghasilkan 31 `solarConsumptionRows`, 1 `solarReceiptRow`, dan total 352 staging rows.

Probe existing parser terhadap `Januari26-BB` sampai `Juni26-BB` juga
menghasilkan Solar source pertama `CJ11`, dengan 28–31 daily Solar rows sesuai
jumlah hari valid. `ImportStagingRecord.source` mempertahankan worksheet, cell,
dan row untuk candidate daily records. Summary records tertentu masih dapat
memiliki `sourceRow = null`; kondisi ini dicatat sebagai `PROVENANCE_GAP`, bukan
diisi dengan row tebakan.

### Mapping status, coverage, dan collision

Status worksheet-level tidak mutually exclusive pada collision:

| Mapping classification | Count | % of 43 in-scope | Evidence |
| --- | ---: | ---: | --- |
| `CONFIRMED*` | 7 | 16.3% | canonical + Januari–Juni 2026; candidate deterministik, no blocking issue |
| `UNRESOLVED` tanpa collision | 26 | 60.5% | field/source semantics atau profile belum cukup untuk auto-map |
| `COLLISION` overlap | 10 | 23.3% | duplicate date/source-key evidence; juga memiliki unresolved review |

Dry-run gate totals:

| Gate | Count |
| --- | ---: |
| `IMPORT_AFTER_REVIEW` | 7 |
| `BLOCKED` | 36 |

Duplicate/collision evidence dari seluruh staging rows, tanpa memilih winner:

| Duplicate classification | Groups |
| --- | ---: |
| `BUSINESS_KEY_COLLISION` | 117 |
| `TRUE_DUPLICATE` | 26 |
| Total duplicate groups | 143 |

`TRUE_DUPLICATE` tetap tidak dihapus atau di-merge pada Phase 6.
`BUSINESS_KEY_COLLISION` memerlukan keputusan owner data karena business key
sama tetapi content berbeda. Tanggal duplicate juga tetap blocking; source row
tidak digeser atau dipilih secara otomatis.

### Dry-run output

| Metric | Result |
| --- | ---: |
| Source rows read | 6,093 |
| Scanned cells | 429,953 |
| Staging rows | 14,834 |
| Candidate records | 12,473 |
| Insert candidates (not executed) | 9,932 |
| Update candidates (not executed) | 0 |
| Existing rows skipped | 2,409 |
| Rejected rows | 0 |
| Manual-review rows | 2,493 |
| Blocking issue entries | 175 |
| Database writes | 0 |

`Juli26-BB` regression tetap match: 352 rows, `insertCandidate = 0`,
`updateCandidate = 0`, `skipCandidate = 352`, `rejected = 0`.

### Parser compatibility dan code change decision

| Cluster | Compatibility | Decision |
| --- | --- | --- |
| Canonical | SUPPORTED | Jangan refactor; gunakan sebagai reference |
| Family A | PARTIALLY_SUPPORTED | Existing semantic mapping menghasilkan candidates, tetapi issue review tetap blocking; tidak ada hardcoded worksheet-specific column letter |
| Family B | NOT_SUPPORTED for automatic value mapping | Tetap `UNRESOLVED`; perlu approved mapping profile |
| Family C | NOT_SUPPORTED for automatic value mapping | Tetap `UNRESOLVED`; perlu approved mapping profile |

Keputusan Phase 6: **NO CODE CHANGE**. Parser dan mapping layer sudah mampu
mendeteksi schema family, provenance, unresolved, dan collision. Menambahkan
fallback atau memaksa mapping pada 36 worksheet blocked akan bersifat
speculative dan melanggar policy.

### Validation

| Command/check | Result |
| --- | --- |
| `npm.cmd run dynamic:verify` | PASS |
| `npm.cmd run bb:mapping:test` | PASS — 27 assertions |
| Live `run-bb-legacy-mapping.ts --compact` | PASS_WITH_REVIEW — 199 metadata, 43 in-scope, 0 read failure |
| Database snapshot around dry-run | PASS — stable, `databaseWrites: 0` |
| `npx.cmd tsc --noEmit --incremental false` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` | PASS |

Percobaan pertama di sandbox berhenti sebelum discovery dengan `fatalErrorCode:
api` karena network restriction. Rerun read-only dengan akses jaringan yang
diizinkan berhasil dan menjadi evidence Phase 6. Tidak ada `--write-report`,
`sheets:import`, sync write, backfill, atau command mutasi yang dijalankan.

### Database, Auth.js, dan Solar safety

- Database: **READ-ONLY**; snapshot sebelum/sesudah stabil; writes `0`.
- Migration/schema/seed/import/backfill: **NONE**.
- Auth.js/login/session/proxy: **UNCHANGED**.
- Solar parser, Solar mapping, Solar database data, KPI/UI/chart: **UNCHANGED**.
- Source worksheet: **UNCHANGED**.

### Phase 7 entry gate

Phase 7: **`NOT READY`**.

Sebelum import/backfill, owner harus menyetujui mapping contract untuk Family A,
menentukan mapping manual untuk Family B/C, menyelesaikan 117
`BUSINESS_KEY_COLLISION`, mendokumentasikan perlakuan 26 `TRUE_DUPLICATE`, dan
menutup `UNRESOLVED`/`PROVENANCE_GAP` per worksheet. Phase 7 tidak boleh memilih
winner, mengisi fallback speculative, membagi nilai monthly menjadi daily, atau
mengimpor hasil dry-run ini tanpa approval.

### Phase 6 conclusion

Inventory dan evidence mapping telah selesai. Hasilnya bukan “semua worksheet
berhasil diparse”, melainkan kontrak yang membedakan mapping deterministik dari
legacy/unresolved/collision. Karena unresolved dan collision legitimate masih
ada, status yang benar adalah **`PASS_WITH_REVIEW`** dan rekomendasi final
adalah **jangan import/backfill sampai Phase 7 entry gate disetujui**.
