# PHASE 16 — POST-IMPORT PARITY & INTEGRITY REPORT

**Tanggal pelaksanaan audit:** 1 September 2026 (Asia/Makassar)  
**Referensi laporan:** 30 Agustus 2026  
**Status Phase 16:** **PASS WITH REVIEW**  
**Status production gate:** **NOT PASS — menunggu resolusi registry sinkronisasi Jan–Jun 2026**

## 1. Ringkasan

Audit read-only terhadap tujuh worksheet BB berhasil diselesaikan:

| Area | Hasil |
| --- | --- |
| Worksheet wajib terbaca | 7/7 |
| Import plan valid | 7/7 `READY_FOR_IMPORT` |
| Parity source vs database | PASS, 7/7 periode |
| Baris normalized dalam scope | 2.409 source vs 2.409 database |
| Unit | Unit 1, Unit 2, Unit 3 |
| Duplikasi business key | 0 group |
| Orphan relation | 0 |
| Identity/hash self-check | PASS |
| Database write selama audit | 0 |
| Snapshot database sebelum/sesudah | Tidak berubah |
| Dashboard source | PostgreSQL normalized data melalui Prisma |
| Lint, TypeScript, production build | PASS |
| Idempotency automation | PASS untuk Juli; REVIEW untuk Januari–Juni |

Kesimpulan data: data tujuh worksheet yang telah diimport memiliki parity dengan source pada seluruh domain yang diaudit. Kesimpulan operasional: automation gate belum boleh dinyatakan PASS karena enam worksheet belum memiliki schema approval dan row state yang diperlukan untuk membuktikan `SKIP` secara deterministik.

## 2. Scope dan batasan

Audit mencakup hanya:

- `Januari26-BB`
- `Februari26-BB`
- `Maret26-BB`
- `April26-BB`
- `Mei26-BB`
- `Juni26-BB`
- `Juli26-BB` sebagai canonical reference

Range source yang dibaca adalah `A1:ZZ500`. Worksheet dipilih secara case-insensitive berdasarkan nama periode; tidak ditemukan duplicate period match.

Audit ini hanya melakukan pembacaan:

- membaca metadata dan range Google Sheets;
- membaca PostgreSQL melalui Prisma dan query aggregate/read-only;
- membandingkan business key, nilai, tanggal, unit, dan precision;
- menjalankan classifier sync dalam memory sebagai dry-run;
- menjalankan static audit dashboard dan bundle.

Tidak dilakukan `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, import, sync live, migration, `prisma db push`, atau `prisma migrate`. Tidak ada credential, private key, access token, maupun `DATABASE_URL` yang dicetak.

`BIOMASS_STOCK` tetap **OUT_OF_CURRENT_SCOPE**. Tidak ada tabel, import mapping, KPI, chart, atau referensi aktif `BIOMASS_STOCK` yang ditambahkan oleh audit ini. Temuan tersebut bukan blocker Phase 16.

## 3. Database snapshot dan mutation guard

Database existing yang dibaca adalah schema `public` pada database logical `dashboard_pln`; detail connection string tidak didokumentasikan.

### 3.1 Snapshot registry/count sebelum dan sesudah

| Objek | Sebelum | Sesudah | Delta |
| --- | ---: | ---: | ---: |
| `spreadsheet_import_runs` | 12 | 12 | 0 |
| `spreadsheet_import_staging` | 3.919 | 3.919 | 0 |
| `sync_sources` | 1 | 1 | 0 |
| `sync_worksheets` | 199 | 199 | 0 |
| `sync_runs` | 8 | 8 | 0 |
| `sync_row_states` | 352 | 352 | 0 |
| `sync_schema_changes` | 0 | 0 | 0 |
| Unit aktif | 3 | 3 | 0 |
| Tabel normalized/import/sync yang terdeteksi | 21 | 21 | 0 |

`before` dan `after` snapshot identik. Audit script melaporkan `databaseWrites: 0`, `importPerformed: false`, `syncPerformed: false`, dan `schemaChanged: false`.

### 3.2 Aggregate database keseluruhan

Angka berikut adalah snapshot keseluruhan tabel, sehingga tabel yang memiliki data sebelum scope Januari–Juli 2026 dapat mencakup periode lebih lama.

| Tabel | Rows | Aggregate utama | Rentang |
| --- | ---: | ---: | --- |
| `biomass_receipts` | 49 | 31.898,86 ton | 2026-01-01 s.d. 2026-07-01 |
| `biomass_consumptions` | 636 | 29.679,77 ton | 2026-01-01 s.d. 2026-07-31 |
| `coal_receipts` | 7 | 256.358,649 ton | 2026-01-01 s.d. 2026-07-01 |
| `coal_consumption` | 1.731 | 1.348.363,88 ton | 2025-01-01 s.d. 2026-07-31 |
| `coal_stock` | 577 | closing aggregate -58.807.722,66 ton | 2025-01-01 s.d. 2026-07-31 |
| `solar_receipts` | 7 | 200.000 liter | 2026-01-01 s.d. 2026-07-01 |
| `solar_consumptions` | 212 | 201.474 liter | 2026-01-01 s.d. 2026-07-31 |
| `hop_readings` | 636 | 10.969,04 hari | 2026-01-01 s.d. 2026-07-31 |
| `biomass_targets` | 1 | 70.020 ton | tahun 2026 |
| `biomass_cumulative_snapshots` | 7 | 117.452,46 ton | 2026-01-01 s.d. 2026-07-01 |

Aggregate negatif pada `coal_stock` adalah kondisi data existing di luar/sekitar scope yang hanya dicatat, tidak diubah, dan tidak dianggap sebagai hasil audit/import ini. Validasi bisnis terpisah diperlukan bila nilai tersebut hendak dikoreksi.

## 4. Worksheet inventory dan hasil per periode

| Worksheet | Selected | Raw rows terbaca | Normalized plan rows | Unit | Rentang tanggal | Plan | Parity |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| Januari26-BB | exact | 147 | 352 | 1–3 | 2026-01-01–2026-01-31 | READY | PASS |
| Februari26-BB | exact | 147 | 319 | 1–3 | 2026-02-01–2026-02-28 | READY | PASS |
| Maret26-BB | exact | 147 | 352 | 1–3 | 2026-03-01–2026-03-31 | READY | PASS |
| April26-BB | exact | 147 | 341 | 1–3 | 2026-04-01–2026-04-30 | READY | PASS |
| Mei26-BB | exact | 147 | 352 | 1–3 | 2026-05-01–2026-05-31 | READY | PASS |
| Juni26-BB | exact | 147 | 341 | 1–3 | 2026-06-01–2026-06-30 | READY | PASS |
| Juli26-BB | exact/canonical | 148 | 352 | 1–3 | 2026-07-01–2026-07-31 | READY | PASS |

Inventory spreadsheet yang ditemukan berisi 199 worksheet; 55 memiliki format BB yang valid. Tidak ada duplicate period match untuk tujuh worksheet yang diminta.

### 4.1 Matrix per worksheet — controlled import history

| Worksheet | Import run | Status run | Imported rows | Rejected rows | Checksum tercatat |
| --- | ---: | --- | ---: | ---: | --- |
| Januari26-BB | 9 | SUCCESS | 352 | 0 | Tidak |
| Februari26-BB | 10 | SUCCESS | 319 | 0 | Tidak |
| Maret26-BB | 11 | SUCCESS | 352 | 0 | Tidak |
| April26-BB | 12 | SUCCESS | 341 | 0 | Tidak |
| Mei26-BB | 8 | SUCCESS | 352 | 0 | Tidak |
| Juni26-BB | 7 | SUCCESS | 341 | 0 | Tidak |
| Juli26-BB | 6 | SUCCESS | 352 | 0 | Tidak |

Seluruh run historis untuk tujuh worksheet berstatus `SUCCESS` dan `rejectedRows = 0`. Checksum pada record manual import tidak tercatat; ini adalah gap auditability, bukan mismatch nilai.

### 4.2 Matrix per worksheet — required sync dry-run

> Angka `Insert/Update/Skip` di tabel ini adalah **dry-run classifier saat audit**, bukan operasi yang dijalankan. Database tetap tidak berubah.

| Worksheet | Source Rows | DB Rows | Insert | Update | Skip | Failed | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Januari26-BB | 352 | 352 | 352 | 0 | 0 | 0 | REVIEW |
| Februari26-BB | 319 | 319 | 319 | 0 | 0 | 0 | REVIEW |
| Maret26-BB | 352 | 352 | 352 | 0 | 0 | 0 | REVIEW |
| April26-BB | 341 | 341 | 341 | 0 | 0 | 0 | REVIEW |
| Mei26-BB | 352 | 352 | 352 | 0 | 0 | 0 | REVIEW |
| Juni26-BB | 341 | 341 | 341 | 0 | 0 | 0 | REVIEW |
| Juli26-BB | 352 | 352 | 0 | 0 | 352 | 0 | PASS |

Interpretasi `REVIEW` pada Januari–Juni bukan berarti data database berbeda. Registry worksheet untuk enam periode tersebut masih `DISCOVERED`, schema belum `APPROVED`, dan row state belum tersimpan; classifier karena itu tidak boleh mengklaim seluruh baris sebagai `SKIP`.

## 5. Mapping dan parity domain

### 5.1 Aggregate scope Januari–Juli 2026

| Domain | Source | Database | Difference | Status |
| --- | --- | --- | --- | --- |
| Biomass receipt | 49 rows; 31.898,86 ton | 49 rows; 31.898,86 ton | 0 | PASS |
| Biomass consumption | 636 rows; 29.679,77 ton | 636 rows; 29.679,77 ton | 0 | PASS |
| Coal consumption | 636 rows; raw 280.061,921 ton; expected stored 280.062,14 ton | 636 rows; 280.062,14 ton | 0 terhadap expected stored | PASS |
| Coal stock closing | 212 rows; raw 3.423.339,558 ton; expected stored 3.423.339,77 ton | 212 rows; 3.423.339,77 ton | 0 terhadap expected stored | PASS |
| Coal stock consumed | 212 rows; raw 280.061,921 ton; expected stored 280.061,94 ton | 212 rows; 280.061,94 ton | 0 terhadap expected stored | PASS |
| Solar consumption | 212 rows; 201.474 liter | 212 rows; 201.474 liter | 0 | PASS |
| HOP | 636 rows; 10.969,04 hari | 636 rows; 10.969,04 hari | 0 | PASS |
| Coal receipt | 7 rows; 256.358,649 ton | 7 rows; 256.358,649 ton | 0 | PASS |
| Solar receipt | 7 rows; 200.000 liter | 7 rows; 200.000 liter | 0 | PASS |
| Target biomassa | 7 worksheet observations, masing-masing 70.020 ton | 1 canonical row tahun 2026; 70.020 ton | 0 per worksheet; shared `target_year` key | PASS |
| Cumulative snapshot | 7 rows; 117.452,46 ton | 7 rows; 117.452,46 ton | 0 | PASS |

### 5.2 Nilai per worksheet

Nilai source dan database berikut dibandingkan dengan business key. Untuk domain dengan storage precision dua desimal, kolom `stored` adalah hasil pembulatan per row yang memang dapat disimpan schema; hasil tersebut sama dengan database.

| Worksheet | Biomass receipt | Biomass consumption | Coal consumption raw → stored | Stock closing raw → stored | Stock consumed raw → stored | Solar consumption | HOP | Coal receipt | Solar receipt | Cumulative | Target |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Januari26-BB | 4.241,38 | 3.489,20 | 45.280,543 → 45.280,61 | 662.649,485 → 662.649,50 | 45.280,543 → 45.280,54 | 31.973 | 2.208,90 | 15.187,724 | 30.000 | 3.489,20 | 70.020 |
| Februari26-BB | 3.591,67 | 3.290,28 | 35.005,264 → 35.005,28 | 321.138,585 → 321.138,64 | 35.005,264 → 35.005,28 | 28.453 | 1.070,30 | 30.212,086 | 30.000 | 6.779,48 | 70.020 |
| Maret26-BB | 5.048,90 | 5.636,81 | 38.462,929 → 38.462,96 | 434.153,789 → 434.153,84 | 38.462,929 → 38.462,95 | 33.472 | 1.447,40 | 50.459,229 | 35.000 | 12.416,29 | 70.020 |
| April26-BB | 5.380,46 | 5.271,82 | 45.682,319 → 45.682,33 | 414.997,253 → 414.997,31 | 45.682,319 → 45.682,31 | 27.122 | 1.383,30 | 50.193,257 | 25.000 | 17.688,11 | 70.020 |
| Mei26-BB | 4.938,64 | 4.348,38 | 48.133,428 → 48.133,45 | 329.087,589 → 329.087,62 | 48.133,428 → 48.133,43 | 29.332 | 1.005,51 | 34.965,807 | 30.000 | 22.036,49 | 70.020 |
| Juni26-BB | 5.474,35 | 3.902,63 | 32.556,994 → 32.557,03 | 495.945,995 → 495.946,00 | 32.556,994 → 32.556,99 | 26.848 | 1.515,01 | 45.255,704 | 25.000 | 25.939,12 | 70.020 |
| Juli26-BB | 3.223,46 | 3.740,65 | 34.940,444 → 34.940,48 | 765.366,862 → 765.366,86 | 34.940,444 → 34.940,44 | 24.274 | 2.338,62 | 30.084,842 | 25.000 | 29.103,77 | 70.020 |

### 5.3 Precision dan rounding

- `biomass_receipts`, `biomass_consumptions`, receipt solar/coal, cumulative: database scale 3; source dan stored aggregate sama.
- `coal_consumption.coal_used` dan field stock yang dibandingkan: database scale 2; audit membulatkan setiap source row ke scale 2 sebelum dibandingkan.
- `hop_readings.hop_days`: database scale 2; source dan database sama setelah normalisasi.
- Selisih raw-vs-stored pada coal/stock adalah efek precision schema, bukan kehilangan row atau perbedaan mapping. Tidak ada mismatch pada nilai yang benar-benar disimpan.

### 5.4 Supplier Biomassa

Receipt dihitung dari tujuh kolom pada tabel `Penerimaan → Biomassa` dengan identity case/whitespace-insensitive:

1. Sawdust PT Syahroni
2. Sawdust PT Bintang
3. Woodchip PT Syahroni
4. Woodchip PT RAP
5. Woodchip CV Multi Paketindo
6. LRUK
7. SRF

Tidak ada supplier duplicate pada business key periode + supplier di tujuh hasil database yang dibandingkan. Pola nama bahan + `PT/CV` + perusahaan dipertahankan sebagai supplier terpisah sesuai keputusan mapping; tidak ada penggabungan supplier yang tidak terkonfirmasi.

## 6. Parser, unit, tanggal, dan transformasi

| Worksheet group | Parser errors | Unresolved diagnostics | Ambiguous diagnostics | Plan blocking issues | Hasil |
| --- | ---: | ---: | ---: | ---: | --- |
| Januari–Juni | 0 | 16 per worksheet | 1 per worksheet | 0 | Fallback legacy eksplisit menghasilkan plan READY |
| Juli canonical | 0 | 0 | 0 | 0 | Semantic schema penuh; plan READY |

Unresolved/ambiguous diagnostics pada worksheet legacy tidak memilih nilai secara diam-diam. Field yang dibutuhkan import plan ditangani oleh fallback legacy yang sudah disetujui pada mapping, sehingga hasil perbandingan tetap lengkap dan deterministik. Ini tetap dicatat sebagai **NEEDS REVIEW** bila schema legacy hendak dijadikan canonical untuk automation berikutnya.

Transformasi yang diverifikasi:

- tanggal dibentuk sebagai tanggal kalender UTC sesuai bulan worksheet;
- data harian membentuk satu row per tanggal dan unit;
- unit source `PLTU-1`, `PLTU-2`, `PLTU-3` dipetakan menjadi Unit 1, Unit 2, Unit 3;
- receipt Biomassa memakai jumlah tujuh supplier, bukan kolom ringkasan yang berbeda;
- target memakai `Target 2026` dan nilainya 70.020 ton;
- cumulative memakai snapshot periode masing-masing;
- nilai kosong tetap `NULL`/unavailable dan tidak diubah menjadi angka palsu;
- invalid/shifted date tidak dipilih sebagai pemenang oleh mapper.

## 7. Duplicate dan orphan audit

### 7.1 Duplicate business key

| Tabel | Key yang diperiksa | Duplicate groups |
| --- | --- | ---: |
| `biomass_receipts` | `period_start + supplier_code` | 0 |
| `biomass_consumptions` | `unit_id + reading_date` | 0 |
| `coal_receipts` | `period_start` | 0 |
| `coal_consumption` | `unit_id + date` | 0 |
| `coal_stock` | `date` | 0 |
| `solar_receipts` | `period_start` | 0 |
| `solar_consumptions` | `reading_date` | 0 |
| `hop_readings` | `unit_id + reading_date` | 0 |
| `biomass_targets` | `target_year` | 0 |
| `biomass_cumulative_snapshots` | `period_start` | 0 |

Total duplicate groups: **0**.

### 7.2 Orphan relation

FK relation unit dan import-run untuk domain yang diaudit semuanya berjumlah **0 orphan**. Ini mencakup relation unit pada consumption/HOP/quality/generation/KPI serta relation optional import-run pada normalized tables dan staging.

## 8. Identity dan idempotency

Self-check classifier:

| Check | Hasil |
| --- | --- |
| Stable identity ketika row/cell berpindah | PASS |
| Stable content hash ketika row/cell berpindah | PASS |
| Seeded reprocessing | 0 insert, 0 update, 1 skip, 0 duplicate |
| Duplicate stable source key pada self-test | 0 |

Business key tidak bergantung pada nomor row atau alamat cell. Namun, state registry aktual belum konsisten antar worksheet:

| Worksheet | Registry status | Registry row count | Persisted row states | Schema | Dry-run |
| --- | --- | ---: | ---: | --- | --- |
| Januari26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| Februari26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| Maret26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| April26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| Mei26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| Juni26-BB | DISCOVERED | 592 | 0 | NOT_APPROVED | REVIEW |
| Juli26-BB | ACTIVE | 352 | 352 | MATCH | PASS |

`rowCount = 592` pada Jan–Jun adalah metadata physical-range discovery, bukan jumlah normalized plan rows. Karena schema/row state belum dipersistenkan untuk enam worksheet, classifier aman mengklasifikasikan seluruh candidate sebagai `INSERT` pada dry-run. Ini adalah **REQUIRED REVIEW** sebelum automation boleh dijalankan untuk Jan–Jun.

### Rekomendasi yang belum dijalankan

Lakukan controlled registry backfill yang telah disetujui secara manual:

1. gunakan plan dan source hash dari tujuh worksheet yang sudah diverifikasi;
2. buat/approve schema snapshot Jan–Jun;
3. persist row state berdasarkan stable business key dan content hash;
4. jalankan ulang dry-run sampai keenam worksheet menghasilkan `SKIP = source rows`;
5. baru kemudian pertimbangkan sync write terkontrol.

Langkah tersebut sengaja tidak dilakukan pada Phase 16 karena akan mengubah tabel registry database.

## 9. Dashboard source, KPI, dan chart audit

Static audit terhadap service dan active dashboard components menghasilkan:

| Area | Source/query | Formula/behavior | Hasil |
| --- | --- | --- | --- |
| Penerimaan Biomassa bulanan | `biomass_receipts.quantity_ton` | `SUM` tujuh supplier pada periode | PASS |
| Pemakaian Biomassa bulanan | `biomass_consumptions.quantity_ton` | `SUM` Unit 1–3 pada periode | PASS |
| Pemakaian Batubara bulanan | `coal_consumption.coal_used` | `SUM` periode | PASS |
| Penerimaan Batubara | `coal_receipts.quantity_ton` | `SUM` periode; fallback `coal_stock.received` hanya jika receipt normalized tidak tersedia | PASS |
| Stock Batubara | `coal_stock.closing_stock` | nilai tanggal fokus | PASS |
| Pemakaian Solar harian/bulanan | `solar_consumptions.quantity_liter` | tanggal fokus atau `SUM` periode | PASS |
| Penerimaan Solar | `solar_receipts.quantity_liter` | nilai pada grain periode | PASS |
| HOP | `hop_readings.hop_days` | nilai per Unit 1–3; `<10` Kritis, `<15` Perhatian, selain itu Aman | PASS |
| Realisasi kumulatif | `biomass_cumulative_snapshots.cumulative_ton` | snapshot terakhir sampai periode efektif | PASS |
| Target Biomassa | `biomass_targets.target_ton` | lookup `target_year`; target 2026 = 70.020 ton | PASS |
| Progress target | cumulative / target | `min(100, cumulative / target × 100)` | PASS |
| Line chart | `OverviewData.series` dari service PostgreSQL | series harian yang sama dengan KPI source | PASS |
| Bar chart per unit | series Unit 1–3 | memakai data normalized yang sama; tidak fetch tambahan | PASS |
| Target progress pie | progress + sisa | presentation layer Recharts; tidak membuat metric baru | PASS |

Arsitektur dashboard ditemukan pada [overview-postgres.ts](../src/services/overview-postgres.ts) dan [DetailDashboard.tsx](../src/components/dashboard/DetailDashboard.tsx). Chart berada pada client boundary di [DetailCharts.tsx](../src/components/dashboard/DetailCharts.tsx), menggunakan LineChart, BarChart, PieChart, Tooltip, accessibility layer, dan tanpa `fetch` di komponen chart. Data fetching tetap server-side.

Static security/source checks:

- expected Prisma models untuk sembilan domain dashboard ditemukan;
- line chart, bar chart, pie chart, custom tooltip, dan accessibility layer ditemukan;
- chart menggunakan shared `DetailDashboard`/chart primitives;
- `BIOMASS_STOCK` tidak ditemukan pada active dashboard source;
- chart tidak membuat request API/Google Sheets sendiri.

## 10. Import integrity dan source-to-dashboard chain

Chain yang terverifikasi:

```text
Google Sheets worksheet
  → dynamic parser + approved legacy fallback
  → import plan / normalized values
  → existing PostgreSQL normalized tables
  → Prisma server service
  → OverviewData
  → dashboard KPI + Recharts presentation layer
```

Tidak ada data source terpisah pada chart. Nilai KPI/chart berasal dari tabel normalized existing; source Google Sheets hanya dipakai oleh importer/server-side audit. Seluruh tujuh plan memiliki total row sesuai database dan seluruh per-domain key/value comparison PASS.

## 11. Security audit

| Check | Hasil |
| --- | --- |
| Credential tercetak dalam audit output | Tidak |
| `DATABASE_URL` lengkap tercetak | Tidak |
| Private key/access token tercetak | Tidak |
| `.env.local` tracked | Tidak; di-ignore |
| Folder `credentials/` tracked | Tidak; di-ignore |
| Tracked sensitive config selain `.env.example` | Tidak ditemukan |
| Secret memakai `NEXT_PUBLIC_` | Tidak |
| Sensitive identifier match pada client static bundle | 0 file |
| Google/Prisma client pada active chart client boundary | Tidak |
| Write-capable import/sync dipanggil audit | Tidak |

`excels/dump-dashboard_pln-202608311006.sql` ada secara lokal dan tidak tracked. File dump dapat berisi data database; jangan commit atau membagikannya. Audit tidak membuka atau mencetak isinya dan tidak menghapusnya.

## 12. Dependency dan build validation

### 12.1 Hasil command

| Command | Hasil |
| --- | --- |
| `npm run bb:mapping:test` | PASS — 27 assertions |
| `npm run dynamic:verify` | PASS |
| `npm run sync:verify-incremental` | PASS — static, tidak live |
| `npm run sync:verify-discovery` | PASS — static, tidak live |
| `npm run sync:verify-schema` | PASS |
| `npm run sync:verify-retry` | PASS |
| `npm run sync:verify-cron-auth` | PASS |
| `npm run sync:verify-config` | PASS |
| `npm run db:verify` | PASS |
| `npm run sync:verify-state` | PASS untuk current active state; belum membuktikan Jan–Jun |
| `npm run db:verify-overview` | PASS — KPI/series Juli 2026 |
| `prisma validate` dengan environment existing | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 17 static/dynamic route entries generated |
| `npm test` | Tidak tersedia; tidak ada script test pada `package.json` |
| `npm run auth:verify` | BLOCKED — `AUTH_TEST_*` tidak tersedia; tidak memakai credential palsu |

### 12.2 npm audit

`npm audit` dan `npm audit --omit=dev` sama-sama melaporkan **3 HIGH** pada:

- package transitive `deepmerge-ts < 8.0.0`;
- jalur dependency: `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`;
- fix yang ditawarkan npm menggunakan `npm audit fix --force` dan perubahan Prisma yang breaking.

Tidak dilakukan `npm audit fix --force`, upgrade major, atau perubahan lockfile. Finding ini terutama berada pada Prisma CLI/build-time dependency, tetapi tetap perlu evaluasi dan approval sebelum perubahan dependency. Status: **HIGH / REQUIRES MANUAL APPROVAL**.

## 13. Findings dan kategori

| Severity | Finding | Kategori | Status |
| --- | --- | --- | --- |
| HIGH | Jan–Jun belum memiliki schema approval dan row state; automation dry-run tidak dapat membuktikan idempotent skip | REQUIRED FIX / REVIEW | Terbuka |
| HIGH | `deepmerge-ts` transitive vulnerability pada Prisma CLI; fix npm meminta force/breaking change | REQUIRES MANUAL APPROVAL | Terbuka |
| MEDIUM | Checksum tidak tercatat pada tujuh historical manual import runs | NEEDS REVIEW | Tidak mengubah parity |
| MEDIUM | Dump SQL lokal tidak tracked tetapi berpotensi membawa data database | NEEDS REVIEW | Jangan commit/share |
| LOW | Parser legacy Jan–Jun masih melaporkan unresolved/ambiguous diagnostics sebelum fallback eksplisit | ACCEPTABLE DIFFERENCE / NEEDS REVIEW | Plan/parity PASS |
| LOW | Nilai aggregate `coal_stock` global negatif pada data existing | NEEDS REVIEW | Di luar perubahan audit |
| INFO | `BIOMASS_STOCK` belum dimodelkan | OUT_OF_CURRENT_SCOPE | Non-blocker |

Tidak ditemukan critical security exposure, duplicate business key, orphan relation, data mismatch, atau perubahan database akibat audit.

## 14. Production gate decision

| Gate wajib | Hasil |
| --- | --- |
| Semua 7 worksheet verified | PASS |
| Source-vs-database parity | PASS |
| Tidak ada critical issue | PASS |
| Tidak ada unexpected duplicate | PASS |
| Orphan = 0 | PASS |
| Deterministic identity algorithm | PASS |
| Idempotency semua worksheet | **REVIEW** — Jan–Jun belum seeded |
| Dashboard source/KPI/chart sesuai normalized data | PASS secara static/read verification |
| Database unchanged | PASS |
| Build PASS | PASS |

Karena syarat idempotency belum PASS untuk seluruh scope dan masih ada high dependency finding yang membutuhkan keputusan manual, status final yang benar adalah:

> **PHASE 16: PASS WITH REVIEW**

Ini bukan deklarasi migration/automation production-ready penuh. Production gate baru dapat dinaikkan setelah registry Jan–Jun di-backfill/approve melalui prosedur terkontrol dan dependency finding dievaluasi.

## 15. Files changed oleh audit ini

- [scripts/audit-phase16-post-import.ts](../scripts/audit-phase16-post-import.ts) — read-only audit runner dengan source/database parity, snapshot guard, duplicate/orphan, identity/idempotency dry-run, dashboard static audit, dan mode `--brief`.
- [docs/POST_IMPORT_PARITY_INTEGRITY_REPORT_2026-08-30.md](./POST_IMPORT_PARITY_INTEGRITY_REPORT_2026-08-30.md) — laporan ini.

Perubahan lain yang sudah ada di working tree sebelum audit tidak diubah atau dihapus.

## 16. Cara mengulang audit

Dari folder `energiprimer-next`:

```text
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/audit-phase16-post-import.ts --brief
```

`--brief` tetap membaca Google Sheets dan PostgreSQL secara live, tetapi hanya menampilkan ringkasan. Perintah tersebut tidak memanggil import/sync write. Jangan menambahkan flag atau command import/sync ketika mengulang Phase 16.

## 17. Rekomendasi sebelum phase berikutnya

1. Dapatkan approval untuk controlled registry backfill Jan–Jun.
2. Jalankan backfill dalam dry-run terlebih dahulu dan pastikan `SKIP` penuh untuk data unchanged.
3. Catat checksum untuk import/sync run mendatang.
4. Evaluasi vulnerability Prisma CLI tanpa `--force`; pertahankan Prisma 6.19.3 sampai upgrade aman disetujui.
5. Pastikan dump SQL lokal tetap di luar commit/artefact yang dibagikan.
6. Sediakan `AUTH_TEST_*` hanya pada environment test terisolasi bila end-to-end authentication verification diperlukan.

Tidak ada import, sync write, migration, deployment, atau Phase 17 yang dijalankan pada audit ini.
