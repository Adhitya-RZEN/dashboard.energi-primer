# Google Sheets Integration — Phase 8

## Status

Implementasi server-side selesai secara static dan code-level. Integrasi live harus dijalankan pada deployment yang memiliki service-account JSON valid, akses spreadsheet, dan environment variables yang benar.

Tidak ada perubahan pada `backend`, database, schema Prisma, atau data. Tidak dijalankan migration, `db push`, `INSERT`, `UPDATE`, atau `DELETE`.

## Source audit

Laravel yang diaudit:

- `backend/config/google.php`
- `backend/app/DataSources/GoogleSheetsDataSource.php`
- `backend/.env.example`
- `backend/storage/app/google/` untuk service-account JSON

Tidak ditemukan folder root `credentials/` yang menjadi sumber Laravel. Next.js memiliki folder `energiprimer-next/credentials/` yang berisi JSON dengan metadata service account yang sama, tetapi private key-nya berbeda dari file Laravel. Ini dapat berarti rotasi key atau file yang tidak sinkron dan diberi label **NEEDS REVIEW**. Runtime harus menggunakan satu file yang valid dan email service account terkait harus memiliki akses Viewer ke spreadsheet.

Nilai Spreadsheet ID, email, project ID, dan private key tidak ditulis di dokumentasi.

## Spreadsheet, worksheet, dan range

| Item                | Kontrak Laravel/Next.js                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Spreadsheet         | Spreadsheet operasional yang ID-nya dikonfigurasi server-side; nilai dirahasiakan di dokumen ini |
| Worksheet           | `${NamaBulanIndonesia}${2 digit tahun}-BB`, misalnya `Juli26-BB`                                 |
| Range               | `B11:CO59`                                                                                       |
| Baris harian        | response index `0..30`, spreadsheet row `11..41`                                                 |
| Total bulanan       | response index `31`, spreadsheet row `42`                                                        |
| Penerimaan biomassa | response index `41`, spreadsheet row `52`                                                        |
| Target biomassa     | response index `45`, spreadsheet row `56`                                                        |
| Realisasi kumulatif | response index `48`, spreadsheet row `59`                                                        |

## Authentication

Laravel memakai `google/apiclient` dengan service-account JSON dan scope `spreadsheets.readonly`. Next.js mempertahankan kontrak tersebut dengan JWT RS256 server-side, OAuth 2.0 service-account token exchange, lalu Google Sheets API v4 read-only.

`googleapis` tidak ditambahkan. Native Node `crypto`, `fs`, dan `fetch` sudah mencukupi untuk protokol yang sama, menjaga dependency tetap kecil, dan menghindari perubahan perilaku client yang tidak diperlukan.

## Environment variables

Variabel berikut tersedia di `energiprimer-next/.env.example` dan tidak memiliki nilai rahasia:

| Variable                         | Fungsi                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` | path server-side ke service-account JSON; tidak boleh berada di `public/`        |
| `GOOGLE_SHEETS_SPREADSHEET_ID`   | ID spreadsheet operasional                                                       |
| `GOOGLE_SHEETS_CACHE_TTL`        | cache in-memory per range dalam detik; default `120` agar sejalan dengan Laravel |

Laravel `.env.example` juga mendefinisikan ketiga nama tersebut. `GOOGLE_SHEETS_WORKSHEET` dan `GOOGLE_SHEETS_RANGE` tidak ditambahkan karena source memakai worksheet dinamis dan range tetap `B11:CO59`.

`.env.example` hanya berisi placeholder. Jangan menyalin file credential atau membuat `.env.local` menjadi bagian commit.

## Column mapping dan transformation

Semua indeks berikut relatif terhadap range yang dimulai dari kolom `B` (`B = 0`):

| Data                         |                                        Spreadsheet column |         Relative index | Transformation                                                                     |
| ---------------------------- | --------------------------------------------------------: | ---------------------: | ---------------------------------------------------------------------------------- |
| Biomassa receipt bulanan     | tabel `Penerimaan → Biomassa` skema tujuh pemasok terbaru | tidak ada fallback KPI | semantic total tujuh pemasok; unavailable jika scan gagal atau skema tidak lengkap |
| Biomassa consumption bulanan |       semantic dashboard/Unit 1–3; legacy `AC42` fallback |      27 untuk fallback | semantic numeric parser                                                            |
| Batubara receipt bulanan     |                 semantic dashboard; legacy `I42` fallback |       7 untuk fallback | semantic numeric parser                                                            |
| Batubara consumption bulanan |                semantic dashboard; legacy `AB42` fallback |      26 untuk fallback | semantic numeric parser                                                            |
| Biomassa Unit 1/2/3          |                                            `T/W/Z` harian |               18/21/24 | nullable numeric                                                                   |
| Batubara Unit 1/2/3          |                                            `S/V/Y` harian |               17/20/23 | nullable numeric                                                                   |
| Stock                        |                                               `AD` harian |                     28 | numeric parser                                                                     |
| HOP Unit 3/2/1               |                                         `AJ/AK/AL` harian |               34/35/36 | nullable numeric; `<10` danger, `<15` warning, otherwise success                   |
| Solar consumption            |                                                      `CJ` |                     86 | harian dari row fokus, bulanan dari row 42                                         |
| Solar receipt                |                semantic dashboard; legacy `CC42` fallback |      79 untuk fallback | semantic numeric parser                                                            |
| Target/realisasi             |   semantic target/historical; legacy `CO56/CO59` fallback |      91 untuk fallback | target fallback `70020`; progress `min(100, cumulative / target * 100)`            |

Parser mempertahankan perilaku Laravel untuk angka lokal titik/koma, tanggal angka atau string, tanda dash sebagai `null`, penjumlahan biomassa hanya dari unit yang hadir, dan fallback ke baris harian terakhir jika hari yang dipilih tidak tersedia. Query `month`, `year`, dan `day` tetap diproses oleh service overview; data fallback mundur maksimal 12 worksheet.

### Agregat penerimaan Biomassa production

`biomassSupplierReceiptMonthly` dihitung dari tabel `Penerimaan → Biomassa` melalui scan semantic `A1:ZZ500`, lalu dipetakan ke `metrics.biomassReceiptMonthly` pada adapter production Google Sheets. Hanya tujuh header pemasok berikut yang termasuk:

- Sawdust PT Syahroni;
- Sawdust PT Bintang;
- Woodchip PT Syahroni;
- Woodchip PT RAP;
- Woodchip CV Multi Paketindo;
- LRUK;
- SRF.

Parser menjumlahkan nilai pada baris `TOTAL` tabel tersebut. Jika baris `TOTAL` tidak tersedia, parser menjumlahkan baris data tabel sebagai fallback. Kolom kosong dan kolom pemasok lama/generic di luar daftar tujuh nama tidak ikut dihitung. Jika scan semantic gagal atau header tujuh pemasok belum lengkap, metric ditandai unavailable agar tidak terjadi undercount. KPI ini tidak lagi memakai fallback `S52`.

## Service architecture

- `src/lib/google-sheets.ts`
  - membaca environment configuration;
  - membaca dan memvalidasi bentuk service-account JSON;
  - menormalisasi `\\n` pada private key;
  - membuat JWT dan token OAuth read-only;
  - membaca range Google Sheets;
  - memberi timeout 15 detik dan cache in-memory 120 detik;
  - mengembalikan `GoogleSheetsReadResult` atau error terklasifikasi.
- `src/services/google-sheets-overview.ts`
  - membangun nama worksheet;
  - membaca range legacy `B11:CO59` sebagai fallback per-field;
  - membaca scan semantic `A1:ZZ500` untuk KPI dan agregat tujuh pemasok Biomassa;
  - memetakan raw rows ke `OverviewData` dan shared TypeScript types;
  - memakai semantic field sebagai source utama KPI biasa, dengan fallback legacy per-field bila diperlukan;
  - menjalankan formula, nullable handling, daily series, HOP, target, serta fallback Laravel.
- `src/services/overview.ts`
  - memilih Google Sheets jika konfigurasi lengkap;
  - meneruskan data typed ke dashboard server page.

`src/lib/google-sheets.ts` memakai import `server-only`, Node `crypto`, dan filesystem. Modul tersebut tidak boleh diimpor dari Client Component, props serialisasi, atau environment variable `NEXT_PUBLIC_*`.

## Validation dan error handling

Raw response diverifikasi sebagai object dengan `values` berupa array of rows dan scalar cells. Response kosong dikembalikan sebagai typed empty state: metric unavailable, series kosong, HOP/target `null`; tidak ada dummy KPI.

Error internal memakai kategori aman tanpa menyimpan credential atau raw response: configuration, credentials, authentication, permission, rate limit, timeout, API, dan malformed response. HTTP `401`, `403`, `429`, `408/504`, dan error API diklasifikasikan sesuai kategori. Error UI tetap generik; token, private key, client secret, dan access token tidak dikembalikan.

Tidak ada logging raw exception yang dapat membawa URL, token, atau response Google. Jika perlu observability production, log hanya kategori error, status, dan worksheet yang sudah tidak memuat secret.

## Security verification

- Credential berada di luar `public/` dan tidak diimpor oleh UI client.
- `.env.example` memakai placeholder, tanpa secret aktual.
- Tidak ada `NEXT_PUBLIC_GOOGLE_*`.
- `credentials/` di-ignore oleh `.gitignore`.
- Tidak ada private key, client secret, access token, atau credential JSON yang ditulis ke dokumentasi.
- TLS default `fetch` dipertahankan; tidak ada padanan Laravel `verify => false`.

## Test dan keterbatasan deployment

Static checks yang dijalankan mencakup validasi bentuk dua JSON service-account tanpa mencetak nilai, pencocokan metadata konfigurasi tanpa mencetak ID/email, lint, TypeScript, dan build.

Read-only verification terbaru berhasil pada worksheet `Juli26-BB`, hari ke-28. KPI selain penerimaan Biomassa tetap sama dengan baseline Laravel: konsumsi Biomassa `3740.65`, konsumsi/penerimaan Batubara `34940.444`/`30084.842`, solar, cumulative, target/progress, unit, dan HOP. Skema penerimaan terbaru mendeteksi lengkap `7/7` header pemasok, sehingga `biomassReceiptMonthly` dihitung dari total tujuh kolom dan menghasilkan `3223.46` ton. Kolom kosong tidak ikut dihitung dan KPI ini tidak memakai fallback `S52`.

Untuk verifikasi ulang:

```text
npm run lint
npx tsc --noEmit
npm run build
```

Live integration test **BLOCKED** bila environment deployment tidak menyediakan path credential yang valid atau spreadsheet tidak dibagikan ke service account. File path lokal tidak cocok untuk serverless kecuali credential disediakan melalui secret manager atau mekanisme deployment yang aman. Jangan menyalin JSON credential ke repository.

## Manual configuration required

1. Pilih service-account JSON yang valid; dua file yang terdeteksi memiliki private key berbeda dan perlu dikonfirmasi sebagai key aktif.
2. Set `GOOGLE_SHEETS_CREDENTIALS_PATH` pada server Next.js.
3. Set `GOOGLE_SHEETS_SPREADSHEET_ID` tanpa prefix `NEXT_PUBLIC_`.
4. Set `GOOGLE_SHEETS_CACHE_TTL` bila berbeda dari default Laravel `120` detik.
5. Pastikan service-account email memiliki akses baca ke spreadsheet dan nama worksheet mengikuti kontrak.

**Phase 8 status: PASS untuk implementasi, static verification, dan code-level security. Live deployment status: NEEDS REVIEW/BLOCKED sampai credential file yang dipilih dan akses deployment dikonfirmasi.**
