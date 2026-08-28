# Database Production Readiness

Tanggal audit: 2026-08-28  
Scope: audit read-only untuk deployment Next.js ke Vercel.

## Ringkasan

Target menggunakan PostgreSQL existing melalui Prisma 6.19.3. Schema Prisma dan database tidak diubah pada Phase 10. Tidak ada `prisma migrate`, `prisma db push`, `INSERT`, `UPDATE`, atau `DELETE` yang dijalankan.

Status production: **BLOCKED sampai koneksi PostgreSQL yang dapat dijangkau Vercel dan konfigurasi pooling/SSL ditetapkan secara manual.**

## Arsitektur yang diaudit

| Area | Temuan |
| --- | --- |
| Provider | PostgreSQL existing |
| ORM | Prisma 6.19.3 dan `@prisma/client` 6.19.3 |
| Konfigurasi | `prisma/schema.prisma` membaca `DATABASE_URL` |
| Client lifecycle | Singleton global pada development; instance per process pada production |
| Query | Typed Prisma query dan raw aggregate berparameter melalui `Prisma.sql` |
| Decimal | Dikonversi secara eksplisit pada presentation/service layer |
| Date/time | Kolom tanggal PostgreSQL dipetakan sesuai schema; presentation memakai UTC secara konsisten |
| Write operation Phase 10 | Tidak ada |

## Verifikasi read-only

Perintah yang dijalankan terhadap database lokal yang dikonfigurasi, tanpa perubahan data:

```text
node --env-file=.env.local scripts/verify-db.mjs
node --env-file=.env.local node_modules/prisma/build/index.js validate
```

Hasil:

- `verify-db.mjs`: **PASS** — koneksi Prisma, pembacaan tabel, ringkasan ekuivalen Laravel, dan pemeriksaan orphan relationship berhasil.
- `prisma validate`: **PASS**.
- `npm run db:verify` tanpa pemuatan environment tambahan tidak dapat membaca `.env.local`; ini adalah keterbatasan script lokal, bukan kegagalan schema. Untuk verifikasi lokal gunakan bentuk `node --env-file=.env.local ...` di atas.

Nilai data dan URL koneksi tidak dicantumkan pada dokumen ini.

## Temuan production

### 1. Endpoint database belum cocok untuk Vercel — BLOCKER

Konfigurasi lokal saat ini menunjuk ke host loopback. Host tersebut hanya tersedia di mesin development dan tidak dapat dipakai oleh Function Vercel. Production membutuhkan endpoint PostgreSQL existing yang dapat dijangkau dari Vercel, idealnya melalui connection pooler/provider yang direkomendasikan pemilik database.

Yang diperlukan:

- `DATABASE_URL` production yang tidak menunjuk ke loopback.
- TLS/SSL sesuai requirement provider PostgreSQL.
- Pengaturan connection pooling yang sesuai dengan pola serverless.
- Uji read-only dari deployment preview/staging.

Provisioning endpoint, pooler, firewall, atau perubahan infrastructure adalah **REQUIRES MANUAL APPROVAL**. Tidak ada perubahan tersebut yang dilakukan.

### 2. Connection lifecycle

Singleton Prisma mencegah pembuatan client berulang dalam process development. Pada Vercel, setiap instance Function tetap dapat membuat koneksi baru ketika scale-out. Karena itu, singleton saja tidak menyelesaikan batas koneksi database pada concurrent serverless invocation.

Rekomendasi manual: gunakan pooler yang disediakan operator PostgreSQL atau provider yang kompatibel, lalu validasi batas koneksi dan timeout. Jangan mengubah schema sebagai bagian dari perbaikan ini.

### 3. Query dan integritas data

- Query agregasi yang diaudit tidak menunjukkan pola N+1 yang jelas.
- Query raw menggunakan parameter binding, bukan interpolasi input mentah.
- Relasi utama memiliki pemeriksaan orphan pada script verifikasi.
- Belum ada bukti bahwa seluruh data historis dan beban concurrent production sudah diuji dari Vercel.

## Hal yang belum dipastikan

- Host, port, SSL mode, dan pooler production harus dikonfirmasi oleh pemilik PostgreSQL.
- Kebijakan backup, failover, statement timeout, dan observability database belum tersedia di repository.
- Beban query production dan batas koneksi belum diukur.

## Status

**BLOCKED / NOT READY untuk deployment database production.** Implementasi aplikasi dan schema tetap tidak diubah. Blocker ini dapat diselesaikan melalui konfigurasi infrastructure dan environment secara manual tanpa migration database.

