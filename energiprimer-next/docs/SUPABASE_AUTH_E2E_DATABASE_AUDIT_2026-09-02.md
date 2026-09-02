# Supabase Auth E2E PostgreSQL Runtime Audit — 2026-09-02

## Status

`BLOCKED`

Primary root cause: `CONNECTION_FAILURE`.

Prisma gagal membuka koneksi ke database E2E dengan kode error tersanitasi
`P1003` — database target tidak ditemukan pada endpoint yang dikonfigurasi.
Karena koneksi gagal pada tahap `$connect()`, audit metadata PostgreSQL, schema,
tabel, dan data tidak dilanjutkan.

## Scope dan batas keamanan

- Audit hanya menggunakan `.env.e2e.local` secara internal.
- `.env.local` tidak dibaca.
- Tidak ada provisioning Auth.
- Tidak ada E2E Playwright yang dijalankan.
- Tidak ada migration, import, sync, deployment, atau database write.
- Tidak ada password, key, token, connection string, atau secret value yang dicatat.
- Tidak ada akses atau write ke Production.

## Hasil environment dan target

| Check | Status | Keterangan |
| --- | --- | --- |
| Environment source | PASS | Hanya `.env.e2e.local`; fallback environment Production dinonaktifkan. |
| `SUPABASE_AUTH_E2E_ENVIRONMENT` | PASS | Marker bernilai non-production; nilainya tidak dicatat. |
| `SUPABASE_AUTH_E2E_CONFIRMATION` | PASS | Confirmation marker sesuai kontrak E2E; nilainya tidak dicatat. |
| Supabase E2E URL | PASS | Format dan target project E2E tervalidasi tanpa menampilkan URL. |
| `DATABASE_URL` source | PASS | Diambil dari environment E2E, bukan `.env.local`. |
| Database target correlation | PASS | Host/identity URL berkorelasi dengan Supabase E2E Direct. |
| Database URL structural parse | PASS | URL memiliki komponen koneksi yang diperlukan; nilainya tidak dicatat. |
| Explicit `sslmode` parameter | REVIEW | Tidak dideklarasikan pada URL yang diaudit. |

`DATABASE_TARGET_CORRELATION=SUPABASE_E2E_DIRECT` hanya membuktikan bahwa URL
menunjuk pola endpoint project E2E. Hal tersebut tidak membuktikan bahwa nama
database pada path URL benar-benar tersedia.

## Runtime connection result

| Check | Status | Evidence |
| --- | --- | --- |
| Prisma client initialization | PASS | Client Prisma berhasil dibuat untuk datasource E2E. |
| Prisma `$connect()` | FAIL | Prisma `P1003`. |
| `SELECT 1` | NOT REACHED | Koneksi gagal sebelum query dapat dijalankan. |
| Database identity | NOT VERIFIED | Tidak ada session PostgreSQL yang berhasil. |
| PostgreSQL version | NOT VERIFIED | Tidak ada session PostgreSQL yang berhasil. |
| Database name | NOT VERIFIED | Tidak menampilkan nama; error P1003 menunjukkan database target tidak ditemukan. |
| Current role | NOT VERIFIED | Tidak ada session PostgreSQL yang berhasil. |
| SSL session | NOT VERIFIED | Tidak ada session; `sslmode` juga tidak dinyatakan eksplisit. |

Sanitized error summary:

`Prisma P1003 — database target tidak ditemukan pada database server.`

## Dashboard runtime dependency

`src/app/(protected)/dashboard/page.tsx:24-28` menangkap exception dari
`getOverviewData()` dan merender `OverviewErrorState`. Ini sesuai dengan gejala
E2E sebelumnya: login berhasil dan route `/dashboard` tercapai, tetapi halaman
menampilkan data error.

`src/services/overview.ts:45-49` memilih PostgreSQL sebagai source normal ketika
source Google tidak dipilih. `src/services/overview-postgres.ts:163-243`
menjalankan pembacaan Prisma secara paralel untuk:

- `coal_consumption`;
- `coal_stock`;
- `coal_receipts`;
- `biomass_receipts`;
- `biomass_consumptions`;
- `solar_receipts`;
- `solar_consumptions`;
- `hop_readings`;
- `biomass_cumulative_snapshots`; dan
- `biomass_targets`.

Dengan demikian, dashboard E2E memang membutuhkan PostgreSQL E2E yang dapat
dihubungi. Namun pada audit ini belum dapat ditentukan apakah tabel bisnis,
schema, atau isi data sudah tersedia karena koneksi gagal lebih dahulu.

## Schema, object, dan data

Checklist berikut sengaja dihentikan sesuai stop condition setelah `P1003`:

| Area | Status |
| --- | --- |
| Public schema | NOT VERIFIED |
| Existing tables | NOT VERIFIED |
| Expected dashboard tables | NOT VERIFIED |
| PostgreSQL object count | NOT VERIFIED |
| Prisma migration table | NOT VERIFIED |
| Extensions | NOT VERIFIED |
| Required columns | NOT VERIFIED |
| Business row counts | NOT VERIFIED |
| Unit 1–3 availability | NOT VERIFIED |
| Prisma schema compatibility | NOT VERIFIED |
| Dashboard query success | NOT REACHED |

Tidak ada dasar yang aman untuk menyimpulkan `SCHEMA_FAILURE` atau
`DATA_DEPENDENCY_FAILURE` sebelum koneksi database diperbaiki dan audit read-only
dapat mencapai metadata schema.

## Root-cause classification

| Category | Result | Explanation |
| --- | --- | --- |
| `CONNECTION_FAILURE` | **CONFIRMED** | Prisma `$connect()` gagal dengan `P1003`. |
| `SCHEMA_FAILURE` | NOT DETERMINED | Metadata schema belum dapat dibaca. |
| `DATA_DEPENDENCY_FAILURE` | NOT DETERMINED | Business row counts belum dapat dibaca. |
| `APPLICATION_RUNTIME_FAILURE` | NOT PROVEN | Aplikasi hanya merender error state setelah service database melempar exception. |
| `UNDETERMINED` | Untuk subcheck database | Subcheck schema/data menunggu koneksi yang valid. |

## Recommended next step — Phase 22E.6

`Phase 22E.6` sebaiknya menjadi perbaikan konfigurasi target database E2E oleh
operator, lalu re-audit read-only:

1. Verifikasi ulang detail koneksi Direct project E2E pada dashboard Supabase.
2. Pastikan database name/path dan endpoint sesuai detail project E2E, bukan
   Production atau database lain.
3. Pastikan password/karakter khusus pada URL di-URL-encode oleh operator dan
   gunakan `sslmode=require` untuk koneksi remote.
4. Perbarui hanya `.env.e2e.local` melalui jalur lokal yang aman. Perubahan ini
   tidak dilakukan oleh audit ini.
5. Jalankan kembali audit read-only hingga `SELECT 1`, SSL, metadata schema,
   expected tables, dan row counts dapat diverifikasi.
6. Jangan melakukan schema migration atau business-data seed sebelum audit
   tersebut PASS.

## Validation and safety counters

| Item | Result |
| --- | --- |
| Probe syntax check | PASS (`node --check`; probe sementara kemudian dihapus) |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| Provisioning | NOT RUN |
| Playwright E2E | NOT RUN |
| Local database writes | 0 |
| Supabase E2E writes | 0 |
| Production access | 0 |
| Deployment | NOT RUN |
| Local database state | UNCHANGED |

## Final conclusion

`STATUS: BLOCKED`

Authentication E2E sebelumnya sudah melewati login dan authorization boundary,
tetapi dashboard belum dapat diverifikasi karena datasource PostgreSQL E2E tidak
dapat dibuka. Tidak ada perubahan source runtime, schema, user, metadata Auth,
atau data bisnis yang dilakukan pada fase ini.

## Phase 22E.6 Re-audit update

Re-audit dilakukan setelah operator configuration check. Hasil static guard
terbaru:

| Check | Status |
| --- | --- |
| E2E environment marker | PASS |
| E2E confirmation marker | PASS |
| Supabase E2E URL format | PASS |
| Public Supabase URL match | PASS |
| Dashboard source | PASS — PostgreSQL |
| Database target | PASS — Supabase E2E Direct |
| Database name/path | **FAIL** — bukan `postgres` |
| Database port | PASS |
| Database user format | PASS |
| `sslmode=require` | PASS |
| E2E-only environment source | PASS |
| Production fallback | DISABLED |

Karena `DATABASE_NAME_CHECK` gagal, fail-fast menghentikan proses sebelum
Prisma `$connect()`. Dengan demikian tidak ada koneksi database atau query
metadata pada re-audit terbaru. Kode `P1003` pada audit Phase 22E.5 tetap
menjadi bukti historis yang konsisten dengan database name/path yang belum tepat;
tidak ada retry yang memaksa koneksi ke target yang belum lolos guard.

### Latest Phase 22E.6 status

`STATUS: BLOCKED`

`ROOT CAUSE: CONNECTION_FAILURE` — konfigurasi target database E2E belum lolos
guard nama database. `SSL`, schema, expected tables, row counts, Prisma
compatibility, dan dashboard query tetap `NOT VERIFIED` karena belum ada session
PostgreSQL.

Perbaikan otomatis tidak dilakukan. Operator perlu memperbarui hanya komponen
database name/path pada `.env.e2e.local` berdasarkan detail Connect Supabase
project E2E sehingga bernilai `postgres`, tanpa menempelkan atau mengubah
credential di chat. Setelah itu audit ini harus dijalankan ulang. Playwright,
migration, seed, import, sync, dan provisioning tetap tidak boleh dijalankan
sebelum koneksi serta schema/data gate PASS.

## Phase 22E.6 latest re-audit

Konfigurasi E2E terbaru telah memperbaiki database name/path, tetapi masih
menggunakan endpoint **Supabase E2E Pooler**. Phase 22E.6 mensyaratkan
**Direct PostgreSQL**, sehingga fail-fast menghentikan proses sebelum koneksi.

| Check | Status |
| --- | --- |
| E2E environment marker | PASS |
| E2E confirmation marker | PASS |
| Supabase E2E URL format | PASS |
| Public Supabase URL match | PASS |
| Dashboard source | PASS — PostgreSQL |
| Target classification | `SUPABASE_E2E_POOLER` |
| Database name/path | PASS — `postgres` |
| Database port | PASS |
| Database user format | PASS |
| `sslmode=require` | PASS |
| Direct target guard | **FAIL** — host bukan Direct E2E |
| Production fallback | DISABLED |

`PRISMA_CONNECT`, `SELECT 1`, database identity, SSL session, schema, expected
tables, row counts, dan Prisma compatibility belum dijalankan pada re-audit
terbaru karena target belum memenuhi kontrak Direct. Status ini bukan bukti
bahwa Pooler tidak dapat digunakan secara umum; ini adalah penolakan sengaja
untuk memenuhi batasan Phase 22E.6.

`STATUS: BLOCKED`  
`ROOT CAUSE: CONNECTION_FAILURE` — target connection configuration mismatch.

Perbaikan yang diperlukan adalah operator mengganti hanya endpoint host pada
`DATABASE_URL` E2E dengan detail **Direct PostgreSQL** dari project E2E,
mempertahankan database `postgres`, user yang sesuai, dan `sslmode=require`.
Tidak ada perubahan environment, source code, schema, atau data yang dilakukan
oleh audit ini. Setelah itu jalankan re-audit lagi; Playwright tetap menunggu
sampai seluruh database gate PASS.

## Phase 22E.6 repeated re-audit

Audit diulang setelah konfigurasi endpoint diarahkan ke Direct E2E. Static
guard sekarang lolos seluruhnya: environment marker non-production, URL Auth
dan URL aplikasi cocok, target terklasifikasi sebagai Direct E2E, nama database
`postgres`, port/user, dan `sslmode=require` sesuai kontrak.

| Check | Status |
| --- | --- |
| E2E-only environment source | PASS |
| Production fallback | DISABLED |
| E2E environment/confirmation marker | PASS |
| Supabase URL match | PASS |
| Database target | PASS — Direct E2E |
| Database name/path | PASS |
| Database port | PASS |
| Database user format | PASS |
| `sslmode=require` | PASS |
| Prisma `$connect()` | **FAIL — P1001** |
| `SELECT 1` | NOT REACHED |
| Database identity/version/role | NOT VERIFIED |
| SSL session | NOT VERIFIED |
| Public schema/tables/objects | NOT VERIFIED |
| Expected dashboard tables | NOT VERIFIED |
| Business row counts | NOT VERIFIED |
| Playwright | NOT RUN |

`P1001` adalah error koneksi Prisma tersanitasi yang berarti server database
belum dapat dijangkau dari runtime audit. Hasil ini belum membuktikan masalah
schema, data, atau password karena belum ada session PostgreSQL yang berhasil.
Audit berhenti sebelum query pertama sesuai fail-fast policy.

### Repeated re-audit conclusion

`STATUS: BLOCKED`

`ROOT CAUSE: CONNECTION_FAILURE` — target sudah benar secara struktur sebagai
Direct E2E, tetapi endpoint database belum reachable (`P1001`). Operator perlu
memeriksa status project E2E dan detail koneksi Direct pada Supabase Dashboard,
serta memastikan URL-encoding password dan akses jaringan runtime. Periksa
hanya `.env.e2e.local`; jangan menempelkan credential ke chat.

Tidak ada perubahan source code, schema, user, metadata Auth, atau business
data. Migration, seed, import, sync, provisioning, deployment, dan Playwright
tetap tidak dijalankan.

### Re-audit validation

| Validation | Result |
| --- | --- |
| Temporary audit probe syntax | PASS (`node --check`); probe kemudian dihapus |
| `npm.cmd run lint` | PASS |
| `npx.cmd tsc --noEmit` | PASS |
| Local database writes | 0 |
| Supabase E2E writes | 0 |
| Production access | 0 |
| `.env.local` read | NO |
| `.env.local`/`.env.e2e.local` modified | NO |

## Phase 22E.6 repeated audit — latest run

Audit read-only diulang kembali. Guard environment dan target tetap berhasil:
`.env.e2e.local` adalah satu-satunya source, marker non-production sesuai,
Supabase URL aplikasi cocok dengan project E2E, dan `DATABASE_URL` memiliki
struktur Direct E2E dengan database `postgres`, port/user sesuai, serta
`sslmode=require`.

Hasil runtime tetap:

| Check | Status |
| --- | --- |
| Direct E2E target guard | PASS |
| Prisma `$connect()` | **FAIL — P1001** |
| `SELECT 1` | NOT REACHED |
| Database identity/version/role | NOT VERIFIED |
| SSL session | NOT VERIFIED |
| Public schema/tables/object count | NOT VERIFIED |
| Expected dashboard tables | NOT VERIFIED |
| Business row counts | NOT VERIFIED |
| Playwright | NOT RUN |
| Database writes | 0 |
| Production access | 0 |

`P1001` merupakan kode error Prisma yang tersanitasi untuk database server yang
belum dapat dijangkau. Karena tidak ada session PostgreSQL, audit tidak
menebak apakah penyebab lanjutannya adalah status project, jaringan, endpoint,
atau credential. Tidak ada pesan error mentah yang dicatat.

`STATUS: BLOCKED`  
`CLASSIFICATION: CONNECTION_FAILURE`

Tidak ada perubahan source code, schema, environment file, Auth user/metadata,
atau business data. Migration, seed, import, sync, provisioning, deployment,
dan E2E tetap tidak dijalankan.
