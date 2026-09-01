# Google Sheets Synchronization Architecture — S1 Audit

Tanggal audit: 2026-08-30  
Scope: audit arsitektur existing sebelum implementasi Phase 11.  
Status checkpoint S1: **PASS WITH FINDINGS**.

Dokumen ini hanya mencatat kondisi existing, keputusan yang sudah dikonfirmasi,
gap yang harus dikerjakan pada checkpoint berikutnya, dan regression evidence.
S1 tidak membuat endpoint sync, scheduler, schema migration baru, atau operasi
write database tambahan.

## 1. Source of truth dan batasan

Arsitektur yang sudah berjalan:

```text
Google Sheets (source of truth)
        ↓
server-side REST client + service-account JWT
        ↓
dynamic semantic parser + normalizer
        ↓
manual import plan / validation
        ↓
PostgreSQL normalized operational store
        ↓
Prisma data services
        ↓
Next.js dashboard
```

Dashboard default membaca PostgreSQL. Google Sheets tetap dipakai sebagai sumber
input importer dan rollback path eksplisit melalui `DASHBOARD_DATA_SOURCE=google`.
Tidak ditemukan automatic write-back dari PostgreSQL ke Google Sheets.

Batasan yang harus dipertahankan:

- Laravel tetap reference/read-only.
- Unit operasional adalah Unit 1, Unit 2, dan Unit 3.
- Label blok ketiga yang terbaca sebagai duplicate Unit 2 dinormalisasi menjadi
  Unit 3 berdasarkan urutan blok existing.
- Target Biomassa tahun 2026 adalah 70.020 ton.
- Tidak ada penghapusan record ketika worksheet atau row hilang dari source.
- Tidak ada automatic destructive database schema migration.

## 2. Komponen existing yang diaudit

| Area | Implementasi existing | Hasil audit S1 |
|---|---|---|
| Google client | `src/lib/google-sheets.ts`; REST Sheets v4 values endpoint, service-account JWT RSA-SHA256, scope read-only | Reusable; server-only |
| Credential | `GOOGLE_SHEETS_CREDENTIALS_PATH` atau pasangan environment service account, plus `GOOGLE_SHEETS_SPREADSHEET_ID` | Server-only; production secret provisioning masih perlu konfigurasi |
| Timeout/error | Abort timeout 15 detik; kategori configuration, credentials, authentication, permission, rate limit, timeout, API, malformed response | Ada; retry/backoff belum ada |
| Cache | Cache in-memory per spreadsheet/worksheet/range, TTL `GOOGLE_SHEETS_CACHE_TTL` default 120 detik | Mengurangi request identik dalam satu process; bukan sync state durable |
| Worksheet resolver | `worksheet-resolver.ts`; membentuk nama `[BulanIndonesia][YY]-BB` dan fallback maksimal 12 periode | Bukan metadata discovery; belum mengenali sheet ID/rename/missing secara authoritative |
| Reader | `reader.ts`; mencoba worksheet requested lalu periode sebelumnya dan membaca `A1:ZZ500` | Reusable parser entry point; fallback dapat menyamarkan worksheet missing |
| Dynamic parser | `parseDynamicWorksheet()` dan parser dashboard/daily/target/historical | Reusable; hasil memiliki diagnostics, normalized metrics, dan daily series |
| Unit normalization | `plan.ts` dan parser memetakan blok berurutan ke Unit 1–3; `commit.ts` resolve `PLTU-1`–`PLTU-3` | Lulus dan harus dipertahankan |
| Import plan | `buildGoogleSheetsImportPlan()` menghasilkan row-level typed plan, staging preview, validation blockers | Reusable untuk sync engine |
| Import commit | `commitGoogleSheetsImportPlan()` membuat import run, staging, transaksi, dan upsert normalized rows | Atomic untuk satu plan; dibatasi database lokal pada tahap ini |
| Data access | `overview-postgres.ts` dan service domain memakai Prisma | Dashboard PostgreSQL sudah aktif |
| Auth boundary | Auth.js, protected layout, role admin server-side | Sync endpoint belum ada; harus memakai boundary server-side existing |
| API/server actions | Auth.js route handler dan server actions password; tidak ada route sync | Endpoint scheduler masih harus dibuat |
| Verification | `verify-db`, `verify-import-schema`, `verify-import-data`, `verify-postgres-overview`, `dynamic:verify` | Regression evidence tersedia; belum ada sync-specific test suite |
| Monitoring | Halaman `/monitoring` masih placeholder Laravel parity; tidak ada sync metrics UI/service | S8/S6 gap |

## 3. Current data model dan audit state

Migration Prisma yang sudah diterapkan:

1. `0_baseline_existing_laravel_schema`
2. `20260830140000_add_dashboard_import_domain`
3. `20260830150000_add_coal_receipts`

Tabel import yang sudah ada:

- `spreadsheet_import_runs`: metadata run yang diminta/efektif, periode, status,
  counts, checksum field, message, dan timestamp.
- `spreadsheet_import_staging`: hasil row/field validation dengan source worksheet,
  row/address, period/date, unit/supplier, raw value, normalized value, dan status.
- `biomass_receipts`, `biomass_consumptions`, `coal_receipts`, `solar_receipts`,
  `solar_consumptions`, `hop_readings`, `biomass_targets`, dan
  `biomass_cumulative_snapshots`: normalized operational data.
- Existing `coal_consumption` dan `coal_stock`: dipakai untuk data coal yang sudah
  dipetakan.

Natural key yang saat ini tersedia melalui unique constraint:

```text
biomass receipt       = period_start + supplier_code
biomass consumption   = unit_id + reading_date
coal receipt          = period_start
coal consumption      = unit_id + date
coal stock            = date
solar receipt         = period_start
solar consumption     = reading_date
HOP                   = unit_id + reading_date
target                = target_year
cumulative snapshot   = period_start
```

Natural key tersebut cukup untuk mencegah duplicate pada import plan yang sama,
tetapi belum membedakan apakah row yang ditemukan adalah INSERT, UPDATE, atau SKIP.
Belum ada row-level source key/fingerprint durable dan belum ada worksheet registry.

## 4. Existing import behavior

Alur saat ini:

```text
CLI `sheets:import --month --year --commit`
        ↓
read requested worksheet / fallback previous worksheet
        ↓
parse + normalize + validate
        ↓
stop bila ada blocking issue
        ↓
create `spreadsheet_import_runs` = PROCESSING
        ↓
one database transaction:
  staging createMany
  normalized upserts
  run SUCCESS
        ↓
on exception: run FAILED
```

Perilaku yang sudah tersedia:

- flag `--commit` wajib untuk write;
- plan harus berstatus `READY_FOR_IMPORT`;
- target mismatch memblokir commit;
- transaction tidak menahan network call Google;
- import ulang worksheet Juli 2026 tidak membuat duplicate normalized rows;
- error response CLI bersifat generik dan tidak mencetak credential.

Gap terhadap kebutuhan automated synchronization:

1. CLI masih manual dan hanya mengizinkan target database lokal `dashboard_pln`.
2. Semua row tervalidasi di-upsert; belum ada pre-comparison dengan fingerprint.
3. `importedRows` berarti jumlah row plan, bukan jumlah INSERT/UPDATE/SKIP.
4. `checksum` pada model run belum diisi sebagai content fingerprint yang dapat
   dipakai untuk short-circuit no-change sync.
5. Run baru dapat dibuat bersamaan; belum ada database lock atau active-run guard.
6. Tidak ada retry terbatas dengan exponential backoff atau resume state.
7. Tidak ada recovery detail per worksheet/row/schema change.

## 5. Worksheet discovery audit

Existing code hanya menghitung nama worksheet dari periode yang diminta dan mencoba
range values. Belum ada pemanggilan metadata `spreadsheets.get` untuk membaca daftar
worksheet dan `sheetId`.

Akibatnya, kondisi berikut belum dapat dibedakan secara aman:

- worksheet belum pernah terlihat;
- worksheet valid tetapi title berubah;
- worksheet hilang;
- worksheet kosong;
- worksheet gagal diakses karena permission;
- worksheet baru dengan schema yang tidak dikenal.

Rencana S2, yang belum diimplementasikan pada audit ini:

- tambahkan server-only metadata read untuk spreadsheet yang sudah dikonfigurasi;
- gunakan worksheet ID sebagai identity utama dan title sebagai metadata;
- gunakan resolver/parser existing setelah metadata discovery;
- simpan lifecycle `DISCOVERED`, `VALIDATED`, `ACTIVE`, `SCHEMA_REVIEW`,
  `DISABLED`, `MISSING`, dan `ERROR` pada entity additive yang disetujui;
- worksheet missing hanya mengubah state, tidak menghapus normalized data.

Nama entity dan migration final masih **NEEDS REVIEW** sampai desain S2 selesai.

## 6. Schema detection audit

Dynamic parser existing mendeteksi anchor, table region, header path, data row,
unit, dan field semantic. Namun belum ada schema fingerprint yang membandingkan
struktur worksheet antar-run.

S4 harus menggunakan output parser/scanner existing untuk membangun fingerprint
yang stabil terhadap whitespace normalization dan perubahan urutan yang aman, lalu
mendeteksi minimal:

- `UNCHANGED`;
- `CHANGED`;
- `NEW_COLUMN`;
- `MISSING_COLUMN`;
- `RENAME_CANDIDATE`;
- `TYPE_CHANGE`;
- `SCHEMA_REVIEW`.

Kolom unknown, rename yang ambigu, atau perubahan tipe tidak boleh memicu
`ALTER TABLE`, `DROP COLUMN`, atau generate Prisma migration otomatis.

## 7. Target incremental sync architecture

Rencana implementasi setelah S1:

```text
Vercel Cron / manual protected trigger
        ↓
sync orchestrator
        ↓
worksheet metadata discovery
        ↓
schema fingerprint and lifecycle decision
        ↓
existing dynamic reader/parser/normalizer
        ↓
stable source key + content fingerprint
        ↓
compare against persisted state
        ├── INSERT
        ├── UPDATE
        └── SKIP
        ↓
short database transaction
        ↓
sync run / row state / audit outcome
```

Prinsip implementasi:

- network read dan parsing dilakukan sebelum transaction;
- database transaction hanya menyimpan hasil yang sudah tervalidasi;
- source key tidak boleh memakai nomor row sebagai identity permanen;
- hash/fingerprint dibuat dari business key dan canonical content, tanpa secret;
- duplicate source key atau ambiguous mapping masuk `SCHEMA_REVIEW`/failure policy;
- update hanya dilakukan jika fingerprint berbeda;
- row identik diklasifikasikan `SKIP`;
- row yang tidak lagi terlihat tidak dihapus otomatis.

Entity sync state final belum dibuat. Pilihan extend `spreadsheet_import_runs`
atau menambah tabel `sync_sources`, `sync_worksheets`, `sync_row_states`, dan
`sync_schema_changes` harus ditetapkan pada S2–S5 sebelum migration additive.

## 8. Scheduler dan security boundary audit

Saat ini tidak ada:

- `/api/sync` atau route handler sync;
- `vercel.json`/cron configuration;
- secret cron trigger;
- sync authorization check;
- sync status endpoint/UI;
- production retry worker.

Target scheduler Vercel memerlukan keputusan/configuration manual berikut:

- secret trigger server-side, misalnya `CRON_SECRET` atau mekanisme setara;
- penolakan request tanpa secret yang benar;
- tidak menerima arbitrary `spreadsheetId` dari query/body;
- interval configurable sekitar 10–15 menit;
- preview/development tidak menjalankan production sync tanpa sengaja;
- timeout sesuai batas serverless dan lock untuk concurrent invocation.

Nama environment variable scheduler dan runtime deployment belum ditambahkan.
Penambahan tersebut dilakukan pada S6 setelah desain sync state dan endpoint aman
disetujui.

Security yang terverifikasi pada S1:

- `src/lib/google-sheets.ts` memakai `server-only`;
- credential directory dan `.env.local` di-ignore Git;
- tidak ada credential file tracked;
- database credential, Google credential, Auth.js secret, dan mail secret tidak
  digunakan di Client Component;
- Google access token hanya disimpan in-memory server process dan tidak dikirim ke UI;
- source error yang dikembalikan bersifat generik.

Production Google credential masih berupa gap deployment karena implementasi saat ini
membaca file path lokal. Refactor ke Vercel secret/environment tidak dilakukan pada S1.

## 9. Risks and mitigations

| Risiko | Dampak | Mitigasi yang direncanakan |
|---|---|---|
| Worksheet title berubah | Sync salah target atau fallback ke periode lama | Worksheet ID registry dan title-change detection pada S2 |
| Worksheet hilang | Data tampak stale atau terhapus | State `MISSING`; tidak ada delete otomatis |
| Header/column berubah | Nilai salah masuk database | Schema fingerprint dan `SCHEMA_REVIEW` pada S4 |
| Row number berubah | Identity row rusak setelah sort/insert | Stable business/source key; bukan row number |
| Import ganda | Duplicate atau audit noise | Fingerprint, natural key, lock, dan idempotency |
| Dua cron bersamaan | Conflicting update/duplicate run | Database-level lock/active-run guard; desain S5/S6 |
| Google transient failure | Run gagal tanpa pemulihan | Bounded exponential backoff dan retry classification |
| Partial failure | Data hanya sebagian tersimpan | Parse-before-transaction, atomic commit, per-row/run state |
| Stale PostgreSQL | Dashboard menampilkan data lama | Last successful sync, freshness status, dan alert |
| Precision legacy coal | Parity angka tiga desimal berbeda | Pertahankan precision existing; review terpisah, bukan Phase 11 otomatis |
| Credential file lokal pada Vercel | Production sync gagal auth | Secret provisioning/refactor manual sebelum deployment |
| Route sync terbuka | Arbitrary spreadsheet access/write | Auth/cron secret, input allowlist, server-only handler |

## 10. S1 regression evidence

Perintah berikut dijalankan terhadap project dan database lokal existing:

| Checkpoint | Hasil |
|---|---|
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| `prisma validate` | PASS |
| `prisma migrate status` | PASS — database schema up to date |
| `npm.cmd run dynamic:verify` | PASS |
| `scripts/verify-db.mjs` | PASS |
| `scripts/verify-import-schema.mjs` | PASS |
| `scripts/verify-import-data.mjs` | PASS |
| `npm.cmd run db:verify-overview` | PASS |
| `npm.cmd run build` | PASS |

Baseline yang tetap lulus:

- Unit 1, Unit 2, Unit 3;
- target Biomassa 70.020 ton;
- import Juli 2026 dan parity KPI;
- existing normalized row counts dan idempotency;
- dashboard source PostgreSQL.

Package tidak memiliki script `test` umum. Verification scripts existing dipakai
sesuai scope. `auth:verify` membutuhkan environment test khusus dan tidak dijalankan
tanpa test credential; tidak ada secret yang dibuat atau dicetak.

Beberapa verification script menampilkan Node `ExperimentalWarning` terkait loader
TypeScript dan `MODULE_TYPELESS_PACKAGE_JSON`. Warning ini tidak menyebabkan lint,
typecheck, atau production build gagal dan tidak mengubah data.

## 11. S1 checkpoint decision

S1 dinyatakan **PASS WITH FINDINGS** karena:

- existing components, data flow, schema, auth boundary, environment, dan test entry
  points sudah diaudit;
- regression gate lulus;
- tidak ada operasi database baru pada proses audit S1;
- gap untuk worksheet discovery, incremental classification, schema detection,
  sync state, concurrency, retry, scheduler, monitoring, dan production credential
  sudah teridentifikasi.

Phase 11 secara keseluruhan **belum dapat dinyatakan PASS**. S2 hanya boleh dimulai
setelah desain entity worksheet registry dan metadata discovery ditetapkan. Tidak ada
perubahan production database atau deployment dilakukan pada checkpoint ini.
