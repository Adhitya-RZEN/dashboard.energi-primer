# PHASE 21F — CONTROLLED SUPABASE DATA MIGRATION

Tanggal eksekusi: 1 September 2026  
Source: PostgreSQL lokal `dashboard_pln`  
Target: Supabase PostgreSQL Direct Connection  

## Status

- Controlled data migration: `PASS`
- Post-import parity and integrity verification: `PASS_WITH_REVIEW`
- Final Phase 21F status: `PASS WITH REVIEW`
- Cutover: belum dilakukan
- Gate B1 dan deployment: belum dijalankan

Review hanya tersisa untuk data yang memang dikecualikan dari scope: authentication, riwayat sync yang ambigu, dan `BIOMASS_STOCK` sebagai future scope. Approved business data telah terverifikasi.

## Scope dan guard

Data yang dipindahkan hanya data approved worksheet berikut:

- `Januari26-BB`
- `Februari26-BB`
- `Maret26-BB`
- `April26-BB`
- `Mei26-BB`
- `Juni26-BB`
- `Juli26-BB`

Rentang tanggal: `2026-01-01` inklusif sampai `2026-08-01` eksklusif.

Guard yang berhasil diterapkan:

- Source harus PostgreSQL lokal `dashboard_pln` pada loopback.
- Target write hanya Supabase Direct port `5432` dengan SSL `verify-full` di memori.
- Pooler tidak digunakan untuk write.
- ID dan foreign key source dipertahankan.
- Urutan insert mengikuti dependency: unit/source/import run/worksheet, data business, staging, lalu row state.
- Target harus tidak memiliki row yang tidak approved pada tabel yang dilewati.
- Mismatch, extra row, duplicate, orphan, atau target conflict menghentikan transaksi.
- Tidak ada schema migration, reset, drop, truncate, Google Sheets sync, atau cutover.

## Hasil source dan target

| Tabel | Source scope | Target setelah import | Hasil |
| --- | ---: | ---: | --- |
| `units` | 3 | 3 | PASS |
| `sync_sources` | 1 | 1 | PASS |
| `spreadsheet_import_runs` | 12 | 12 | PASS |
| `sync_worksheets` | 7 | 7 | PASS |
| `coal_stock` | 212 | 212 | PASS |
| `coal_consumption` | 636 | 636 | PASS |
| `biomass_receipts` | 49 | 49 | PASS |
| `coal_receipts` | 7 | 7 | PASS |
| `biomass_consumptions` | 636 | 636 | PASS |
| `solar_receipts` | 7 | 7 | PASS |
| `solar_consumptions` | 212 | 212 | PASS |
| `hop_readings` | 636 | 636 | PASS |
| `biomass_targets` | 1 | 1 | PASS |
| `biomass_cumulative_snapshots` | 7 | 7 | PASS |
| `spreadsheet_import_staging` | 3.919 | 3.919 | PASS |
| `sync_row_states` | 2.409 | 2.409 | PASS |
| **Total** | **8.754** | **8.754** | **PASS** |

Seluruh row imported memiliki ID yang sama dengan source dan hash row exact match. Hasil parity: missing `0`, extra `0`, mismatch `0`.

## Integritas data

- Duplicate pada seluruh natural/unique key yang diperiksa: `0` group / `0` row.
- Orphan foreign key yang diperiksa: `0`.
- Unit terdaftar: `Unit 1`, `Unit 2`, `Unit 3`.
- Target biomassa: `70.020 ton`.
- Tabel `BIOMASS_STOCK`: belum ada dan tidak dibuat.
- Sequence target: seluruh sequence yang digunakan sudah berada minimal pada maximum imported ID.

Agregat numerik source dan target sama:

| Agregat | Nilai |
| --- | ---: |
| `biomass_consumptions.quantity_ton` | 29.679,77 ton |
| `biomass_receipts.quantity_ton` | 31.898,86 ton |
| `solar_consumptions.quantity_liter` | 201.474 liter |
| `coal_consumption.coal_used` | 280.062,14 ton |

Registry approved juga konsisten: jumlah row state sama dengan row count worksheet untuk ketujuh worksheet (`352`, `319`, `352`, `341`, `352`, `341`, `352`).

## Idempotency

Pass pertama:

- Insert: `8.754` row
- Update: `0`
- Skip: `0`
- Failed: `0`
- Sequence adjustment: `16`

Rerun terkontrol:

- Insert: `0`
- Update: `0`
- Exact skip: `8.754`
- Failed: `0`
- Sequence adjustment: `0`

Rerun tidak menjalankan write kedua.

## Data yang sengaja tidak dipindahkan

| Kelompok | Tabel | Alasan |
| --- | --- | --- |
| Authentication | `users`, `password_reset_tokens`, `sessions` | Dipisahkan dari data business; membutuhkan approval auth tersendiri. |
| Transient | `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | Tidak diperlukan untuk baseline data aplikasi. |
| Legacy di luar scope | `coal_quality`, `power_generation`, `kpi_targets` | Tidak memiliki data pada scope Jan–Jul 2026 approved. |
| Ambiguous sync history | `sync_runs`, `sync_schema_changes` | Identitas periode/history belum cukup aman untuk dipindahkan. |
| Empty metadata | `spreadsheet_import_logs` | Source kosong. |
| Future scope | `BIOMASS_STOCK` | Tidak ada pada schema/source approved dan tidak dibuat. |

Semua tabel excluded tetap `0` row di Supabase.

## Safety evidence

- Local `DATABASE_URL`: tetap lokal dan tidak diubah.
- Local database writes: `0`.
- Supabase schema writes: `0`.
- Supabase data rows written: `8.754` pada pass pertama.
- Supabase sequence adjustments: `16` pada pass pertama.
- Supabase writes pada parity verifier: `0`.
- Google Sheets sync saat migration: tidak dijalankan.
- Vercel deployment: tidak dijalankan.
- Credential, password, private key, API key, dan connection string lengkap tidak dicatat di laporan.

## Catatan perbaikan runner

Percobaan awal dihentikan oleh `PrismaClientValidationError` sebelum transaksi berhasil menulis. Root cause adalah perbedaan field Prisma `sourceSheet` dan `sourceWorksheet` untuk kolom database `source_worksheet`. Adapter kemudian dibuat per-tabel; percobaan berikutnya berhasil dan parity diverifikasi. Tidak ada partial row yang tertinggal dari percobaan gagal.

## Manual approval yang masih diperlukan

1. Keputusan terpisah jika user ingin memigrasikan authentication data.
2. Keputusan terpisah untuk memasukkan `sync_runs` atau `sync_schema_changes` setelah identity/history mapping ditetapkan.
3. Keputusan terpisah untuk scope dan mapping `BIOMASS_STOCK` pada phase berikutnya.
4. Approval cutover aplikasi dari local `DATABASE_URL` ke Supabase; belum dilakukan pada Phase 21F.

## Script yang tersedia

- `scripts/plan-supabase-data-migration.mjs` — read-only dry-run.
- `scripts/run-supabase-data-migration.mjs` — guarded controlled migration, wajib `--execute`.
- `scripts/verify-supabase-data-migration.mjs` — read-only parity/integrity verifier.

Package aliases:

- `npm run supabase:data:plan`
- `npm run supabase:data:migrate`
- `npm run supabase:data:verify`

Phase 21F berhenti di sini. Tidak ada cutover dan tidak dilanjutkan otomatis ke gate berikutnya.
