# Phase 17A — Historical Sync Registry Reconciliation

Tanggal audit: 1 September 2026 (UTC output: `2026-09-01T07:10:21.507Z`)
Environment: PostgreSQL lokal `dashboard_pln`, Google Sheets read-only
Scope: `Januari26-BB` sampai `Juli26-BB`
Status akhir: **BLOCKED**

## Objective

Memverifikasi bahwa tujuh worksheet historis yang sudah diimpor mempunyai:

- mapping dan schema approval yang dapat dijelaskan;
- stable source identity yang sama antara source, domain database, dan registry;
- content hash yang dapat dipakai untuk mendeteksi perubahan;
- row state yang lengkap untuk idempotency;
- proteksi retry dan concurrency yang telah diuji;
- tidak ada duplicate/orphan pada data domain;
- tidak ada regresi pada data layer/dashboard;
- tidak ada perubahan database selama audit.

Audit ini hanya membaca Google Sheets dan PostgreSQL. Tidak ada importer,
sync commit, migration, `prisma db push`, Supabase write, atau deployment yang
dijalankan.

## Scope

| Item | Hasil |
| --- | --- |
| Worksheet | Januari26-BB, Februari26-BB, Maret26-BB, April26-BB, Mei26-BB, Juni26-BB, Juli26-BB |
| Canonical reference | Juli26-BB |
| Source range | `A1:ZZ500` |
| Expected normalized source rows | 2.409 |
| Actual normalized source rows | 2.409 |
| Google worksheets discovered | 199 |
| Valid BB worksheet names | 55 |
| Required worksheets found | 7/7 |
| Database writes | 0 |
| Import/sync performed | Tidak |
| Database migration/db push | Tidak |
| Supabase | Tidak digunakan |
| `BIOMASS_STOCK` | Di luar scope saat ini |

Semua periode BB yang termasuk scope ditemukan tepat satu kali. Tidak ada
duplicate period pada worksheet historis yang diaudit.

## Current Sync Architecture

Jalur sinkronisasi yang diaudit adalah:

```text
Google Sheets metadata/read
        ↓
stable worksheet identity (sheetId)
        ↓
dynamic parser + legacy/canonical mapping
        ↓
import plan dan stable source identity
        ↓
sync registry: worksheet/schema/row state/content hash
        ↓
existing PostgreSQL domain data
```

Jalur automatic setelah Juli26-BB memakai policy canonical `Juli26-BB` dan
menolak worksheet yang tidak sesuai schema, belum jatuh tempo, duplicate, atau
ambigu. Phase 17A tidak mengaktifkan atau menjalankan jalur write tersebut.

## Existing Registry

| Registry | Hasil audit |
| --- | --- |
| `sync_sources` | 1 source, status `ACTIVE` |
| `sync_worksheets` | 199 worksheet terdaftar |
| `sync_runs` | 8 run tercatat; association bersifat source-level |
| `sync_row_states` | 352 state, seluruhnya untuk Juli26-BB |
| `sync_schema_changes` | 0 open change |
| `spreadsheet_import_runs` | 12 successful provenance/import runs |
| `spreadsheet_import_staging` | 3.919 row |

Untuk enam worksheet legacy, `sync_worksheets.rowCount` bernilai 592 karena
merupakan metadata physical range. Jumlah normalized plan rows yang benar
adalah 352, 319, 352, 341, 352, dan 341. Ini bukan mismatch data; perbedaan
tersebut adalah perbedaan antara physical range dan hasil parser.

## Worksheet Results

| Worksheet | Source rows | Valid | Rejected | Parser | Plan | Family | Registry | Row states | Result |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | --- |
| Januari26-BB | 352 | 352 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| Februari26-BB | 319 | 319 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| Maret26-BB | 352 | 352 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| April26-BB | 341 | 341 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| Mei26-BB | 352 | 352 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| Juni26-BB | 341 | 341 | 0 | 0 error; 16 unresolved; 1 ambiguous; 1 warning | READY_FOR_IMPORT | LEGACY_FAMILY_A | DISCOVERED | 0 | REVIEW registry |
| Juli26-BB | 352 | 352 | 0 | 0 error; 0 unresolved; 0 ambiguous; 2 warnings | READY_FOR_IMPORT | CANONICAL_FAMILY | ACTIVE | 352 | PASS |
| **Total** | **2.409** | **2.409** | **0** | 0 blocking parser errors | — | — | — | **352** | **BLOCKED overall** |

Parser diagnostics `unresolved`/`ambiguous` pada legacy tidak menghasilkan
rejected row dan plan tetap `READY_FOR_IMPORT` berdasarkan mapping legacy yang
sudah disetujui. Nilai tersebut tetap dicatat agar dapat ditinjau bila format
worksheet legacy berubah.

## Schema Approval

Hasil schema approval read-only:

| Worksheet | Approval | Profile | Persisted schema/hash |
| --- | --- | --- | --- |
| Januari26-BB sampai Juni26-BB | APPROVED | Legacy Family A mapping profile | Belum ada pada registry |
| Juli26-BB | APPROVED | Juli26-BB canonical profile | Ada; fingerprint sama dengan canonical |

Juli26-BB mempunyai schema snapshot, schema hash, content hash, dan `lastSync`.
Enam worksheet legacy dikenali sebagai `LEGACY_FAMILY_A`, tetapi approval dan
mapping version belum dipersistenkan sebagai metadata registry. Perbedaan
schema fingerprint legacy terhadap canonical adalah expected karena memakai
profile legacy; bukan bukti bahwa row legacy tidak dapat dimapping.

Fixture schema drift menghasilkan `SCHEMA_REVIEW` untuk perubahan header,
kolom, rename ambigu, type change, duplicate header, dan empty header. Pada
database live tidak ada `sync_schema_changes` berstatus OPEN.

## Identity Reconciliation

Stable identity menggunakan field bisnis canonical, yaitu entity type,
period/date, tahun target bila relevan, unit canonical, supplier canonical, dan
satuan. Nomor row serta alamat cell tidak menjadi bagian identity.

| Metric | Hasil |
| --- | ---: |
| Source rows | 2.409 |
| Matched ke projection domain PostgreSQL | 2.409 |
| New | 0 |
| Changed | 0 |
| Duplicate stable identity | 0 |
| Review | 0 |
| Unexpected database rows | 0 |

Identity reconciliation per worksheet berstatus PASS. Fixture identity juga
lulus untuk row reorder, cross-period separation, new row, unchanged row,
changed value, dan duplicate key.

## Content Hash Reconciliation

Content hash menggunakan stable identity dan normalized value. Nilai `NULL` dan
`0` tetap dibedakan; perubahan posisi row tidak membuat hash berubah.

| Metric | Hasil |
| --- | ---: |
| Unchanged persisted rows | 352 |
| Changed persisted rows | 0 |
| Missing persisted hash | 2.057 |
| Unresolved hash comparison | 0 |

Semua 352 hash Juli26-BB cocok dengan source saat audit. Hash untuk Januari26-BB
sampai Juni26-BB belum tersimpan pada `sync_row_states`, sehingga tidak ada
basis registry untuk membuktikan SKIP pada enam worksheet tersebut.

## Row State

Expected untuk dataset historis tervalidasi adalah satu row state untuk setiap
2.409 stable source identity. Actual saat audit:

```text
expected: 2.409
actual:     352
gap:      2.057
```

352 row state tersebut seluruhnya berasal dari Juli26-BB. Enam worksheet
legacy masih berstatus `DISCOVERED`, dengan row state, schema hash, schema
snapshot, content hash, dan last sync yang belum tersedia.

## Idempotency

Hasil dry-run terhadap registry aktual:

| Source | INSERT | UPDATE | SKIP | DUPLICATE |
| --- | ---: | ---: | ---: | ---: |
| Registry aktual | 2.057 | 0 | 352 | 0 |
| Expected full historical set | 0 | 0 | 2.409 | 0 |
| In-memory source-seeded fixture | 0 | 0 | 2.409 | 0 |

Kesimpulan: algoritme classifier dan identity lulus fixture idempotency,
namun registry aktual belum lengkap. Jika audit hanya melihat Juli26-BB,
hasilnya SKIP 352/352; jika melihat seluruh Januari–Juli, 2.057 row masih
terlihat sebagai kandidat INSERT karena historical row state belum ada.
Tidak ada INSERT yang benar-benar dijalankan selama audit.

## Retry

Fixture retry berstatus PASS. Policy yang diverifikasi:

- rate limit, timeout, dan Google API 5xx diperlakukan transient;
- permission, authentication, validation, schema, dan constraint error gagal
  cepat;
- retry dibatasi dan memakai backoff;
- transient database connection/timeout/transaction conflict dapat dicoba
  ulang, sedangkan constraint error tidak diulang membabi buta;
- error operasional diklasifikasikan tanpa mencetak detail credential.

Tidak ada forced retry terhadap source atau database live selama audit.

## Concurrency

Static concurrency fixture berstatus PASS. Lease source-level menggunakan
`lockToken`/`lockExpiresAt` dan conditional update untuk mencegah dua scheduler
memproses source yang sama secara bersamaan.

Live lease contention test tidak dijalankan karena Phase 17A wajib read-only.
Association `sync_runs` tetap source-level; provenance worksheet tersedia lewat
`sync_worksheets`, `sync_row_states`, dan `spreadsheet_import_runs`.

## Schema Drift

Static schema-drift fixture berstatus `SCHEMA_REVIEW` untuk perubahan semantic
schema. Reorder kolom yang tidak mengubah semantic signature tetap diterima.

Live result:

- Juli26-BB fingerprint sama dengan canonical reference;
- legacy worksheet dikenali oleh profile legacy, bukan dipaksa menjadi
  canonical tanpa mapping;
- tidak ada open schema change pada registry;
- mapping version khusus belum menjadi field persisted pada registry.

## Registry Completeness

Registry belum lengkap untuk dataset historis penuh.

| Requirement | Actual | Status |
| --- | --- | --- |
| 7 worksheet ditemukan | 7/7 | PASS |
| 2.409 source rows terbaca | 2.409/2.409 | PASS |
| Stable identity cocok dengan database | 2.409/2.409 | PASS |
| Row state persisted | 352/2.409 | **REQUIRED FIX** |
| Content hash persisted | 352/2.409 | **REQUIRED FIX** |
| Legacy schema approval persisted | 0/6 | **NEEDS REVIEW** |
| Open schema changes | 0 | PASS |
| Duplicate period | 0 | PASS |

## Database Integrity

Semua pemeriksaan bersifat SELECT/read-only.

| Check | Hasil |
| --- | ---: |
| Duplicate business-key groups | 0 |
| Orphan rows | 0 |
| Active units | 3 |
| Unit scope | Unit 1, Unit 2, Unit 3 |
| Target biomass | 70.020 ton |

Snapshot sebelum dan sesudah audit identik. Metadata database/schema, daftar
tabel, unit, dan seluruh count berikut tidak berubah:

| Table/domain | Count |
| --- | ---: |
| `biomass_receipts` | 49 |
| `biomass_consumptions` | 636 |
| `coal_receipts` | 7 |
| `coal_consumption` | 1.731 |
| `coal_stock` | 577 |
| `solar_receipts` | 7 |
| `solar_consumptions` | 212 |
| `hop_readings` | 636 |
| `biomass_targets` | 1 |
| `biomass_cumulative_snapshots` | 7 |
| `spreadsheet_import_runs` | 12 |
| `spreadsheet_import_staging` | 3.919 |
| `sync_sources` | 1 |
| `sync_worksheets` | 199 |
| `sync_runs` | 8 |
| `sync_row_states` | 352 |
| `sync_schema_changes` | 0 |

## Dashboard Non-Regression

Static audit menunjukkan:

- PostgreSQL tetap menjadi source of truth dashboard;
- model `biomassReceipt`, `biomassConsumption`, `coalStock`,
  `biomassTarget`, dan `biomassCumulativeSnapshot` tersedia pada data layer;
- chart tetap berada pada client boundary untuk interaction;
- chart tidak melakukan fetch sendiri;
- `BIOMASS_STOCK` tidak dipakai dan tetap di luar scope;
- route dashboard berhasil terdaftar pada production build.

Pemeriksaan ini tidak menggantikan manual browser verification terhadap setiap
nilai visual KPI/chart. Yang diverifikasi pada Phase 17A adalah non-regression
static/data-layer boundary dan integritas data source.

## Security

| Check | Hasil |
| --- | --- |
| Database URL dicetak | Tidak |
| Credential/private key/token dicetak | Tidak |
| Importer/commit dipanggil | Tidak |
| Supabase digunakan | Tidak |
| Secret log ditambahkan | Tidak |
| Browser/client bundle diperiksa untuk audit path | Audit path hanya server-side script |

Audit script membaca konfigurasi server-side melalui environment yang tersedia,
tanpa menyalin atau mencetak nilainya. Spreadsheet identifier tidak ditulis ke
laporan ini karena tidak diperlukan untuk rekonsiliasi.

## Validation

| Command/check | Result |
| --- | --- |
| Live Phase 17A read-only audit | PASS execution; final gate BLOCKED karena registry gap |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run db:verify` | PASS |
| `npm run sync:verify-auto-admission` | PASS |
| `npm run sync:verify-incremental` | PASS |
| `npm run sync:verify-retry` | PASS |
| `npm run sync:verify-schema` | PASS |
| `npm run sync:verify-state` | PASS; 199 worksheets, 352 row states, 0 open schema changes |
| `npm run sync:verify-config` | PASS; credential values tidak dicetak |
| `npm run sync:verify-cron-auth` | PASS |
| `git diff --check` | PASS; hanya warning normal line-ending Git |
| `npm test` | Tidak tersedia; project tidak memiliki script `test` |

Build mendaftarkan route dashboard dan API yang ada; tidak ada production
deployment yang dilakukan.

## Database Safety

```text
databaseWrites: 0
importPerformed: false
syncPerformed: false
migrationsPerformed: false
prisma db push: not run
importer commit: not called
Supabase write: not used
```

Snapshot before/after identik (`unchanged: true`).

## Issues

### REQUIRED FIX — Historical row-state/content-hash gap

`sync_row_states` baru mencakup 352 row Juli26-BB. Sebanyak 2.057 row
Januari26-BB sampai Juni26-BB belum memiliki row state dan content hash.
Akibatnya dry-run terhadap registry aktual menghasilkan 2.057 kandidat INSERT,
walaupun identity/data domain sudah cocok.

### NEEDS REVIEW — Persisted mapping provenance

Legacy profile approval belum memiliki mapping-version/schema-approval metadata
persisted pada registry. Saat ini approval dapat direkonstruksi dari code
profile dan hasil audit, tetapi belum menjadi provenance yang tersimpan.

### NEEDS REVIEW — Worksheet association pada sync run

`sync_runs` masih source-level. Keterkaitan worksheet dijelaskan melalui
`sync_worksheets`, row states, dan import runs, tetapi tidak berupa foreign key
langsung pada setiap sync run.

### Informational — Legacy parser diagnostics

Setiap worksheet Januari–Juni memiliki 16 unresolved, 1 ambiguous, dan 1
warning pada parser scan, tetapi 0 rejected row, plan READY_FOR_IMPORT, dan
identity reconciliation PASS. Jika format legacy akan digunakan lagi, angka ini
perlu dipantau sebagai regression signal.

## Recommendations

1. Jangan menyatakan historical registry idempotency lengkap sebelum dilakukan
   controlled backfill row state/content hash untuk 2.057 row legacy.
2. Backfill harus memakai stable identity dan content hash yang sama dengan
   classifier saat ini, dijalankan dalam dry-run terlebih dahulu, lalu ditinjau
   hasilnya sebelum write. Backfill/write memerlukan approval eksplisit karena
   Phase 17A sendiri read-only.
3. Persistasikan provenance mapping legacy (profile dan versi) atau dokumentasi
   registry yang ekuivalen jika additive schema change disetujui.
4. Setelah backfill, ulangi audit ini dan targetkan hasil registry dry-run
   `INSERT=0`, `UPDATE=0`, `SKIP=2.409`, `DUPLICATE=0`, serta row state `2.409`.
5. Pertahankan automatic admission setelah Juli26-BB hanya untuk worksheet
   yang due dan fingerprint-nya sama dengan canonical Juli26-BB.

## Final Gate

**BLOCKED**

Alasan blocking hanya pada kelengkapan registry historis: data source dan
domain database sudah dapat direkonsiliasi penuh, tetapi persisted row state
dan content hash baru tersedia untuk Juli26-BB. Dengan kondisi ini, Phase 17A
belum memenuhi syarat final `SKIP` untuk seluruh 2.409 row.

Tidak ada perubahan database atau data produksi yang dilakukan untuk mengatasi
blocker tersebut. Phase berikutnya yang melakukan backfill registry harus
dipisahkan sebagai controlled write dan memerlukan persetujuan manual.

