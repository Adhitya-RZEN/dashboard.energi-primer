# Dynamic Semantic Table Parser v1

## Status dan tujuan

Implementasi ini adalah prototype internal yang dapat dipanggil dan diuji secara independen. Tujuannya adalah membaca struktur tabel worksheet Google Sheets berdasarkan label, header, unit, hierarchy, dan boundary semantic; bukan berdasarkan indeks kolom/row legacy.

Adapter production memakai hasil parser semantic untuk KPI Google Sheets yang berhasil di-resolve. Mapping legacy tetap tersedia sebagai fallback per-field ketika scan semantic gagal menemukan field tertentu; `biomassReceiptMonthly` memiliki aturan khusus dan hanya valid jika tujuh pemasok terbaru terdeteksi lengkap. API contract, database, Prisma, authentication, authorization, dan Google credential handling tetap tidak berubah.

Laravel dan parser positional lama tetap menjadi source/reference. Tidak ada write ke Google Sheets, PostgreSQL, atau file Laravel.

## Source contract yang diaudit

- Nama worksheet valid: `[NamaBulanIndonesia][2 digit tahun]-BB`, misalnya `Juli26-BB`.
- Nama `DTS`, `ALBES`, `FLYASH`, dan nama lain yang tidak berakhiran `-BB` tidak dianggap sebagai worksheet BB.
- Parser legacy membaca `B11:CO59` dan memakai indeks relatif terhadap kolom `B`.
- Parser semantic memakai scan envelope `A1:ZZ500` pada adapter read-only sebagai area observasi. Envelope ini bukan mapping field; field dicari dari semantic table dan header path.
- Validasi regression mengacu pada baseline legacy yang sudah didokumentasikan untuk `Juli26-BB`, hari 28.

## Arsitektur

Namespace baru berada di `src/services/google-sheets/dynamic/` dan sengaja tidak diimpor oleh production overview service.

```text
dynamic/
├── worksheet-resolver.ts       valid naming dan fallback max 12 worksheet *-BB
├── spreadsheet-scanner.ts      cell metadata, normalisasi label, address
├── anchor-detector.ts          exact/alias/pattern anchor detection
├── table-detector.ts           boundary dan grouping berdasarkan proximity/density
├── table-classifier.ts         dashboard/daily/target/historical classification
├── structure-analyzer.ts       header hierarchy, unit, resource, unit number
├── value-resolver.ts           candidate scoring, validation, ambiguity rejection
├── confidence.ts               score, confidence level, source metadata
├── validators.ts               locale number, tanggal, unit, malformed value
├── normalizer.ts               projection metric/series dan formula progress
├── comparator.ts                legacy baseline vs dynamic result
├── parser.ts                   orchestration entry point
├── reader.ts                   optional server-only Google read adapter
├── definitions/
└── parsers/
    ├── dashboard-parser.ts
    ├── daily-parser.ts
    ├── target-parser.ts
    └── historical-parser.ts
```

Entry point prototype:

```ts
parseDynamicWorksheet(rows, { worksheetName: "Juli26-BB" })
```

Adapter server-side opsional:

```ts
readAndParseDynamicBBWorksheet({ month: 7, year: 2026 })
```

`reader.ts` memakai `import "server-only"`, import relative ke `src/lib/google-sheets.ts`, dan tidak diekspor dari barrel index pure parser. Dengan demikian client component tidak memiliki jalur import ke credential reader.

## Worksheet resolver dan fallback

`resolveBBWorksheet(month, year)` hanya membuat nama dari daftar bulan Indonesia yang eksplisit dan tahun dua digit valid. `parseBBWorksheetName` memakai regex exact; nama yang valid tetapi bukan `*-BB` tidak diterima.

`previousValidBBWorksheets(month, year, 12)` mengembalikan maksimal 12 periode sebelumnya. Adapter mengembalikan metadata:

- requested worksheet/periode;
- effective worksheet/periode;
- `isFallback`;
- `fallbackIndex`;
- daftar worksheet yang dicoba.

Tidak ada fallback ke `DTS`, `ALBES`, atau `FLYASH`, dan tidak ada asumsi worksheet name selain hasil resolver.

## Scanner dan normalisasi

Scanner menghasilkan cell metadata berikut:

```ts
{
  row,
  column,
  address,
  rawValue,
  normalizedValue
}
```

`rawValue` dipertahankan untuk parsing angka/tanggal. `normalizedValue` null-safe, NFKC-normalized, trim, repeated whitespace collapsed, dan uppercase. Coordinate hanya metadata/source trace, bukan identitas metric.

Nilai berikut tidak dikonversi menjadi nol:

- null/empty;
- dash/em dash;
- `N/A`;
- formula error seperti `#DIV/0!`.

Nilai kosong menghasilkan `available: false` atau `null`; nilai malformed menghasilkan status `malformed`.

## Anchor dan alias

Anchor metric yang didukung meliputi:

- Biomassa: receipt bulanan, consumption bulanan, current Unit 1–3.
- Batubara: consumption/receipt bulanan, current Unit 1–3, total harian, stok, HOP.
- Solar: pemakaian harian, pemakaian bulanan, penerimaan bulanan.
- Target: `TARGET PEMAKAIAN BIOMASSA`, `TARGET BIOMASSA`, `TARGET 2026`/tahun lain.
- Historical: `KUMULATIF PEMAKAIAN BIOMASSA`, `TOTAL 2026`, `PEMAKAIAN 2026`.
- Struktur: `DASHBOARD`, `SATUAN`, `SUMBER DATA`, `STATUS`, `TANGGAL`/`TGL`, `TOTAL`, `STOK`, `HOP`, `SOLAR`/`HSD`.

`CURENT`, `CURRENT`, dan `TERKINI` diperlakukan sebagai alias. Worksheet live Juli 2026 mempunyai typo/duplicate label pada baris batubara Unit 3 yang tertulis sebagai `UNIT 2 CURENT`; parser hanya memakai urutan blok Unit 1–3 sebagai contextual fallback dan mengeluarkan warning. Nilai tidak diubah.

Exact/alias match selalu diprioritaskan. Fuzzy global terhadap angka tidak digunakan.

## Table detection dan classification

Boundary table diinfer dari:

- structural header dan anchor;
- baris/kolom non-empty;
- repeated pattern dan density;
- proximity anchor;
- blank separator;
- hierarchy/header context;
- unit dan resource label.

Table diklasifikasikan sebagai:

1. `dashboard`: header dashboard dan pola label–unit–value/source–status;
2. `daily`: tanggal dengan hierarchy unit/resource/total/stock/HOP/solar;
3. `target`: label target dan nilai/unit;
4. `historical`: label kumulatif/tahun dan nilai/unit;
5. `unknown`: tidak cukup bukti.

Duplicate table/candidate tidak dipilih berdasarkan angka terdekat. Jika dua candidate bernilai berbeda memiliki score berdekatan, field menjadi `ambiguous`/`UNRESOLVED`.

## Value resolver dan confidence

Candidate resolver memperhitungkan:

- exact match `+40`, alias `+30`, contextual `+20`;
- same row/column;
- adjacency;
- unit yang cocok;
- berada di table boundary;
- numeric validity;
- compatible header;
- distance penalty;
- conflict penalty.

Response field memiliki bentuk berikut:

```ts
{
  value: number | null,
  available: boolean,
  confidence: number,
  level: "HIGH" | "WARNING" | "UNRESOLVED",
  source: { sheet, address, anchor } | null,
  status: "resolved" | "missing" | "malformed" | "ambiguous"
}
```

Threshold:

- `>= 0.90`: `HIGH`;
- `0.70..0.89`: `WARNING`;
- `< 0.70`: `UNRESOLVED` dan tidak boleh diam-diam menggantikan legacy.

## Parser per table

### Dashboard

`dashboard-parser.ts` membaca label metric dan menemukan nilai dari row yang sama dengan unit yang kompatibel. Kolom nilai tidak fixed ke `Y` atau kolom lain. Header `VALUE`/`NILAI`/`REALISASI`/`TOTAL` dan unit dipakai sebagai konteks.

### Agregat bulanan Biomassa

Parser juga membaca agregat semantic dari baris total bulanan, tanpa mengunci koordinat row/column:

- Kolom pemasok di bawah hierarchy `PENERIMAAN → BIOMASSA` dijumlahkan sebagai `biomassSupplierReceiptMonthly` hanya jika tujuh header skema terbaru terdeteksi: `Sawdust PT Syahroni`, `Sawdust PT Bintang`, `Woodchip PT Syahroni`, `Woodchip PT RAP`, `Woodchip CV Multi Paketindo`, `LRUK`, dan `SRF`. Kolom kosong serta header generic/lama di luar daftar tidak dihitung.
- Kolom langsung `BIOMASSA UNIT 1`, `UNIT 2`, dan `UNIT 3` pada baris total bulanan dijumlahkan sebagai `biomassUnitConsumptionMonthly`.
- `biomassConsumptionMonthly` memakai agregat Unit 1–3 tersebut apabila tersedia. Ini mencegah nilai dashboard yang stale/contradictory menggantikan definisi konsumsi yang dipakai Laravel.

Total `Penerimaan → Biomassa` dan total pemakaian Unit 1–3 tetap dipisahkan sebagai dua KPI berbeda. Nilai penerimaan hanya dihitung dari tujuh kolom skema terbaru; nilai konsumsi bulanan memakai agregat Unit 1–3. Jika salah satu dari tujuh header belum tersedia, penerimaan ditandai `UNRESOLVED` dan tidak diganti dengan total legacy yang dapat memiliki cakupan berbeda.

### Daily

`daily-parser.ts` membangun header path dari hierarchy. Kolom Unit 1–3 dibedakan oleh resource (`BIOMASSA` atau `BATUBARA`), `TOTAL` batubara dicari dari resource + total header, stock diprioritaskan ke `STOK AKHIR`, HOP dipetakan dari `HOP` + unit number, dan HSD/SOLAR dibedakan dari resource header.

Biomassa harian menggunakan penjumlahan nullable dari tiga unit yang tersedia, sama dengan transformasi legacy. Jika seluruh unit kosong, hasilnya `null`.

### Target

`target-parser.ts` menerima label target pada row/column yang berubah. Format `70.020` dan `70,020` untuk target dibaca sebagai 70.020 ton sesuai target legacy. Tidak ada pencarian angka global.

### Historical

`historical-parser.ts` memprioritaskan anchor `KUMULATIF PEMAKAIAN BIOMASSA`; jika tidak ada, label tahun seperti `TOTAL 2026`/`PEMAKAIAN 2026` dapat dipakai dengan konteks historical.

## Normalization dan formula

Hasil diarahkan ke nama metric yang sama dengan `OverviewData` tanpa mengubah interface production. Projection dynamic mempertahankan:

- `biomassReceiptMonthly`;
- `biomassConsumptionMonthly`;
- `coalConsumptionMonthly`;
- `coalReceiptMonthly`;
- current unit values;
- `coalDailyTotal`, stock, HOP;
- solar daily/monthly/receipt;
- biomass target dan cumulative;
- daily series.

Progress tetap dihitung hanya ketika kedua nilai tersedia:

```text
min(100, cumulative / target * 100)
```

Field hilang tidak diubah menjadi nol dan tidak membuat parser throw untuk struktur optional yang memang tidak tersedia.

Jika nilai dashboard `TOTAL PEMAKAIAN BIOMASSA BULANAN` berbeda dari agregat Unit 1–3 yang valid, parser mempertahankan nilai dashboard sebagai diagnostic candidate, mencatat warning, dan menormalisasi metric dari agregat Unit 1–3. `biomassReceiptMonthly` selalu mengikuti agregat tujuh pemasok terbaru ketika skema lengkap; skema parsial tidak menghasilkan angka penerimaan.

## Dual parser dan regression

`comparator.ts` hanya membandingkan hasil dynamic terhadap baseline legacy yang diberikan oleh test. Adapter production membaca hasil semantic untuk seluruh KPI yang tersedia. Mapping range/index legacy tetap dipertahankan sebagai fallback per-field untuk KPI biasa ketika field semantic belum ter-resolve; `biomassReceiptMonthly` dikecualikan dan tetap strict terhadap skema tujuh pemasok.

Baseline `Juli26-BB`, hari 28:

- biomassa receipt `3223.46`;
- biomassa consumption `3740.65`;
- batubara consumption `34940.444`;
- batubara receipt `30084.842`;
- stock `19152.296`;
- solar daily/monthly/receipt `854 / 24274 / 25000`;
- cumulative/target/progress `29103.77 / 70020 / 41.564938588974584`;
- biomassa Unit 1–3 `74.8 / 47.6 / 61.2`;
- batubara Unit 1–3 `565.739 / 651.344 / 375.487`;
- HOP Unit 1–3 `31.9 / 16 / 10.64`.

### Static fixtures

Static verification PASS untuk:

- target label/value yang dipindah vertikal;
- target table yang dipindah horizontal;
- dashboard table yang dipindah dari area `V:Y` ke area lain;
- changed header order melalui semantic label;
- locale numeric value;
- null/empty/malformed value;
- missing daily/solar structure;
- monthly Biomassa aggregate dari baris total, termasuk supplier receipt dan Unit 1–3 consumption;
- duplicate anchor dan conflicting candidate;
- invalid worksheet name;
- fallback hanya untuk valid `*-BB`.

Command:

```text
npm run dynamic:verify
```

Pada shell Windows dengan execution policy yang memblokir shim PowerShell, gunakan `npm.cmd run dynamic:verify`.

### Live read-only verification

Live read ke worksheet `Juli26-BB` berhasil menggunakan environment lokal yang tersedia. Requested dan effective worksheet sama sehingga tidak terjadi fallback. Semua field dashboard selain penerimaan Biomassa parity dengan baseline dalam tolerance test; penerimaan mengikuti validasi skema tujuh pemasok terbaru:

| Field | Legacy baseline | Dynamic semantic | Source | Status |
|---|---:|---:|---|---|
| `biomassConsumptionMonthly` | `3740.65` | `3740.65` | agregat Biomassa Unit 1–3 pada baris total (`T42` sebagai source pertama) | `PASS` |

| Agregat/metric | Nilai live | Source | Status |
|---|---:|---|---|
| `biomassSupplierReceiptMonthly` | `3223.46` (baseline lama) | `3223.46`; 7/7 header terbaru terdeteksi | `PASS` |
| production `metrics.biomassReceiptMonthly` | `3223.46` (baseline lama) | `3223.46`; total tujuh kolom, tanpa fallback `S52` | `PASS` |

Worksheet live saat ini memakai seluruh header skema tujuh pemasok terbaru dan smoke test read-only menghasilkan parity receipt `PASS`. Kolom kosong di antara header bernama diabaikan. Mismatch kandidat dashboard konsumsi tetap dipisahkan dari agregat Unit 1–3.

Status source/dashboard yang berbeda tetap `NEEDS REVIEW` pada level data owner apabila angka pada worksheet perlu diperbaiki.

Nilai current coal pada dashboard live tampil dengan presisi lebih rendah daripada baseline (`565.74`, `651.34`, `375.49`); perbedaannya berada dalam tolerance display/source rounding. Daily source tetap exact pada baseline.

Perintah live, hanya di environment yang sudah dikonfigurasi:

```text
node --env-file=.env.local --experimental-strip-types --experimental-loader ./scripts/ts-strip-loader.mjs scripts/verify-dynamic-parser.ts --live
```

Perintah ini read-only. Output tidak menampilkan spreadsheet ID, email service account, private key, access token, atau isi credential.

## Missing/error behavior

- worksheet invalid: rejected by resolver dan menghasilkan diagnostic error;
- empty range: no data/field unavailable, bukan angka nol;
- missing optional table/column: field `null`, warning/diagnostic;
- malformed numeric: status `malformed`;
- duplicate/conflicting candidate: status `ambiguous`;
- low confidence: `UNRESOLVED`, tidak mengganti legacy;
- authentication/permission/API/timeout: tetap ditangani oleh `src/lib/google-sheets.ts` dengan error code generik yang sudah ada;
- fallback: maksimal 12 worksheet sebelumnya yang valid `*-BB`.

## Security boundary

Parser pure tidak membaca credential. Adapter `reader.ts` hanya server-side dan memakai service yang sudah ada. Tidak ada Google client pada Client Component, tidak ada env variable baru, tidak ada private key/token pada result, dan tidak ada logging secret.

## Keterbatasan v1

1. Google Sheets API yang digunakan saat ini tidak melakukan discovery daftar semua worksheet; fallback mencoba nama valid yang dibangkitkan, lalu mengandalkan response API.
2. `A1:ZZ500` adalah scan envelope untuk adapter prototype. Jika table dipindah di luar envelope, envelope perlu diperluas secara konfigurasi/keputusan Phase 2; extraction field tetap tidak memakai fixed coordinate.
3. Merged cell dan header hierarchy yang sangat tidak beraturan dapat menghasilkan `WARNING` atau `UNRESOLVED` dan harus direview.
4. Label bisnis yang contradictory tetap dilaporkan. Untuk kasus kandidat dashboard dan agregat Unit 1–3 yang berbeda, v1 menggunakan agregat Unit 1–3 sebagai source konsumsi efektif; koreksi nilai dashboard di worksheet tetap membutuhkan keputusan/data-owner review.
5. Adapter production sudah memakai field semantic untuk KPI Google Sheets yang dapat dipetakan; mapping legacy tetap tersedia sebagai fallback per-field untuk KPI biasa. `biomassReceiptMonthly` tetap strict terhadap tujuh pemasok dan tidak memiliki fallback legacy. Perubahan business definition tetap membutuhkan approval parity.
6. Static test menggunakan Node type stripping karena project belum memiliki test runner. Tidak ada dependency test baru yang ditambahkan.

## Rekomendasi Phase 2

Perbaikan rekomendasi Phase 2 yang sudah diterapkan pada prototype:

1. Tujuh kolom pemasok (`Sawdust PT Syahroni`, `Sawdust PT Bintang`, `Woodchip PT Syahroni`, `Woodchip PT RAP`, `Woodchip CV Multi Paketindo`, `LRUK`, dan `SRF`) di bawah `Penerimaan → Biomassa` sekarang dideteksi secara semantic dan dijumlahkan sebagai `biomassSupplierReceiptMonthly`. Kolom kosong dan kolom lama/generic di luar daftar tidak ikut dihitung.
2. `biomassConsumptionMonthly` sekarang memiliki source policy yang jelas: total bulanan Biomassa Unit 1–3, bukan total penerimaan pemasok.
3. Konflik dashboard `195.2` dicatat sebagai warning dan tidak lagi menyebabkan parity failure ketika agregat Unit 1–3 valid.
4. Regression fixture menguji table yang bergeser, nilai locale, baris total, agregat pemasok, agregat Unit 1–3, dan fallback source policy.

Sebelum mengaktifkan dynamic parser sebagai production default, tetap diperlukan:

1. persetujuan data owner bahwa kolom pemasok memang merupakan penerimaan; jika ingin dipakai sebagai konsumsi, statusnya `NEEDS REVIEW` dan memerlukan perubahan definisi KPI yang disetujui;
2. fixture raw worksheet yang versioned dan tidak mengandung credential;
3. dual-run untuk seluruh worksheet/periode relevan;
4. observability dan fallback untuk hasil low-confidence/ambiguous;
5. feature flag dan rollback path ke legacy parser.

**Status:** agregat semantic tujuh pemasok, static regression, pengalihan KPI production ke semantic-first, dan validasi live terhadap worksheet dengan skema terbaru `PASS`. `biomassReceiptMonthly` tidak menggunakan fallback legacy `S52`.
