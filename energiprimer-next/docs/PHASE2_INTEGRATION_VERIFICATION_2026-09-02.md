# Phase 2 Integration Verification — 2026-09-02

> HISTORICAL BASELINE (Phase 6C, 2026-09-02): Recovery/mail references in
> this phase report are retained for evidence only; they are not active config.

Dokumen ini adalah hasil verifikasi repository-only untuk Phase 2. Nilai
credential, private key, password, token, dan connection string tidak dicatat.

## Security and local credentials

- `.env.local`, `.env.e2e.local`, dan satu file credential JSON tersedia hanya
  pada filesystem lokal.
- File tersebut di-ignore dan tidak muncul sebagai tracked path atau filename
  credential pada Git history.
- Pencarian history menemukan marker/contoh `PRIVATE KEY` pada source, example,
  dan report lama, tetapi tidak menemukan credential literal yang terkonfirmasi.
- `.next` adalah artifact ignored. Dev cache lokal terdeteksi memuat material
  berbentuk database URL; client static chunks tidak memuat private-key marker,
  database URL, atau secret variable yang diperiksa. Artifact ini tidak boleh
  dibagikan sebagai bagian release.
- Tidak ada credential yang dirotasi, dihapus, atau dicetak selama verifikasi.

## Authentication integration

**VERIFIED dari source:** `/login` menggunakan Auth.js Credentials, lookup
Prisma admin, bcrypt, JWT, session callback dengan role/version revalidation,
dan protected layout. Forgot-password, reset-password, dan change-password
tetap memakai Prisma/Auth.js architecture. Tidak ada Supabase dependency aktif
di source aplikasi.

**UNKNOWN secara integration runtime:** valid admin login, session creation, dan
authenticated/non-admin route behavior memerlukan database yang reachable serta
credential test environment. Database target dari environment lokal tidak dapat
dijangkau pada audit ini.

## Migration strategy

### VERIFIED

- Default Prisma schema dan command package memakai `prisma/schema.prisma`.
- Main history dimulai dari no-op marker existing Laravel lalu migration
  additive.
- `prisma/production/migrations/` memiliki full production baseline terpisah.
- Kedua schema saat ini memiliki SHA-256 yang sama.
- `vercel.json` hanya mendefinisikan cron; tidak ada bukti deployment memilih
  production migration directory.

### INFERRED

- Main history dimaksudkan untuk database Laravel existing.
- Production baseline dimaksudkan untuk clean production bootstrap.

### UNKNOWN

- Migration history yang benar-benar diterapkan pada deployment production.
- Apakah deployment pipeline eksternal menjalankan `prisma migrate deploy`.
- Status migration dan kompatibilitas database production saat ini.

Tidak ada migration, reset, `db push`, atau database write yang dijalankan.

## Data contracts

### Stock fields

- `CoalStock` schema memiliki `openingStock`, `received`, `consumed`, dan
  `closingStock`, dengan default database untuk field non-null.
- Import type/parser/plan/commit hanya membuktikan kontrak `closingStock` dan
  `consumed` pada daily coal-stock path.
- `coal_receipts` adalah data penerimaan pada grain periode terpisah.
- Dashboard dapat memakai `coal_stock.received` sebagai fallback legacy ketika
  normalized receipt tidak tersedia, tetapi importer tidak mengisi field itu.
- Status authoritative-vs-derived untuk `openingStock` dan `received` adalah
  **UNKNOWN**. Keduanya tetap di luar scope importer sampai kontrak workbook dan
  consumers dikonfirmasi.

### Deletion/tombstone

- Sync melakukan classification berdasarkan stable source key dan content hash,
  lalu append/upsert hanya untuk row yang hadir dan berubah.
- `lastSeenAt` dicatat untuk row yang terlihat, tetapi tidak ada reconciliation
  yang menghapus atau membuat tombstone untuk row yang hilang.
- Status source sebagai authoritative snapshot adalah **UNKNOWN**; behavior
  saat ini diperlakukan sebagai append/upsert dan tidak diubah.

### Null versus zero and coal-quality filters

**VERIFIED:** empty/unparseable direct Google values tetap `null`, sedangkan
source numeric zero tetap `0`. Coal-quality rows, total, status counts, average
GAR, latest date, dan pagination memakai effective filter scope yang sama.

## Test gap

Static/source verification tersedia dan lulus. Database-backed authentication,
authenticated browser flow, real Google sync, mail delivery, and deployment
verification remain unavailable without a safe test environment and reachable
external services. Tidak ada integration test palsu yang dibuat.
