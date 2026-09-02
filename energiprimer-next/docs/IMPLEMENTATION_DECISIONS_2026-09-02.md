# Implementation Decisions — 2026-09-02

> PHASE 6C UPDATE: The decisions below predate the secret-hygiene remediation
> where applicable. Current auth excludes email recovery, Resend, magic links,
> and OTP; see `docs/AUTH_IMPLEMENTATION.md`.

Dokumen ini mencatat keputusan stabilisasi yang sudah dibuktikan dari source
repository. Nilai credential dan detail koneksi sengaja tidak dicantumkan.

## Authentication

- Auth.js/NextAuth Credentials + Prisma `users` tetap menjadi satu-satunya
  authentication flow aplikasi.
- Path recovery Supabase yang tidak terpakai di `src/app/` dan `src/lib/`
  dihapus karena hanya saling mereferensikan, tidak dipanggil oleh route aktif,
  tidak memiliki dependency package, dan bertentangan dengan password-change
  Auth.js/Prisma.
- Script operator Supabase di `scripts/` tidak diaktifkan atau dihapus; script
  tersebut bukan bagian dari request authentication aplikasi.

## Sync and deployment

- `/api/sync/google-sheets` sekarang menolak environment Preview dan identity
  yang tidak dikenal sebelum pemeriksaan cron secret atau discovery/database.
- Local development tetap diizinkan sesuai policy existing; production tetap
  diizinkan. `allowNonLocalDatabase` tetap dipakai hanya setelah gate route.
- `sync:verify-preview-write-safety` didaftarkan sebagai npm script dan lulus.

## Google configuration

- `getGoogleSheetsConfig()` menjadi sumber validasi credential mode dan
  spreadsheet ID. Dashboard memakai `isGoogleSheetsConfigComplete()` yang
  mendelegasikan ke validator yang sama.
- File credential atau pasangan email/private key sama-sama didukung. Nilai
  credential tidak dicetak.
- Jika `DASHBOARD_DATA_SOURCE=google` tetapi konfigurasi tidak lengkap,
  dashboard gagal secara eksplisit; aplikasi tidak diam-diam beralih ke
  PostgreSQL. PostgreSQL tetap source normal ketika Google tidak dipilih.

## Data correctness

- Filter coal-quality dibangun melalui `buildCoalQualityWhere()` dan dipakai
  untuk rows, count, status summary, average GAR, dan latest date.
- Adapter legacy Google mempertahankan `null` untuk nilai kosong/unparseable;
  angka nol eksplisit tetap menjadi `0`. HOP baru dianggap memiliki status bila
  ketiga nilai Unit 1–3 tersedia.
- UI coal-quality tidak lagi membuat nomor pengiriman `LAB-*`; volume dan lab
  report ditampilkan sebagai belum tersedia karena tidak ada field backend.

## Import scope that remains unresolved

- Parser daily saat ini hanya memiliki kontrak authoritative untuk closing stock
  dan coal consumed. Tidak ada bukti source/parser yang cukup untuk menambahkan
  opening stock atau received ke importer; database defaults tidak boleh dibaca
  sebagai fakta source.
- Sync engine saat ini bersifat incremental append/upsert: row yang tidak
  muncul pada snapshot berikutnya tidak dihapus atau ditombstone. Tidak ada
  model tombstone dan tidak ada bukti kontrak workbook yang menetapkan Sheets
  sebagai authoritative deletion snapshot. Perubahan deletion behavior ditunda
  sampai kontrak workbook dan consumers dikonfirmasi.
- Dua migration histories tetap dipertahankan. Main history memakai baseline
  existing Laravel lalu migration additive; `prisma/production/` memakai full
  production baseline. Tidak ada migration yang diterapkan ke database eksternal
  selama stabilisasi ini.

## Verification boundary

- Local source/build checks dapat membuktikan compile dan route rendering login.
- Build compile berhasil, tetapi prerender data-dependent pages mencatat bahwa
  database target pada environment lokal tidak dapat dijangkau. Live database,
  Google Sheets, Resend, Vercel, migration status, dan browser E2E tetap
  unverified.
