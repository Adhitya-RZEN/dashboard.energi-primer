# Energi Primer

Dashboard PLN Jeranjang berbasis Next.js App Router. Authentication aktif
adalah Auth.js/NextAuth Credentials dengan Prisma `users`; dashboard normal
membaca PostgreSQL melalui Prisma; Google Sheets adalah source import/sync.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env.local` dan isi konfigurasi server yang
   diperlukan. Jangan commit `.env.local` atau file di `credentials/`.
2. Jalankan:

```powershell
npm install
npm run db:generate
npm run db:validate
npm run ops:verify-env
npm run dev
```

Buka `http://localhost:3000/login`. Login memerlukan akun admin yang sudah ada
di database PostgreSQL.

## Release checks

```powershell
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm run sync:verify-cron-auth
npm run sync:verify-preview-write-safety
npm run sync:verify-retry
npm run sync:verify-auto-admission
npm run dynamic:verify
npm run bb:mapping:test
npm run sync:verify-schema
```

`npm run sync:verify-preview-write-safety` memastikan environment Preview dan
identity deployment yang tidak dikenal tidak dapat mencapai sync write path.

## Data and deployment notes

- **SUPABASE PRODUCTION:** canonical schema adalah
  `prisma/production/schema.prisma` dan canonical history adalah
  `prisma/production/migrations/`. History ini tidak boleh diganti dengan
  history root.
- **LEGACY/LOCAL ONLY:** `prisma/schema.prisma` dan `prisma/migrations/`
  mempertahankan baseline Laravel/local serta migration additive lama. Keduanya
  tidak boleh diterapkan ke Supabase production dan tidak boleh dihapus,
  digabung, atau dianggap interchangeable.
- Pemeriksaan production yang read-only memakai:
  `npm run supabase:production:migration:preflight`. Command ini mengharuskan
  `--schema prisma/production/schema.prisma` secara internal, memakai
  `SUPABASE_DIRECT_URL`, dan tidak menjalankan migration.
- Build Vercel tetap `npm run build` (`next build`). Migration schema tidak
  dijalankan saat build, startup, request, atau cron sync.
- Supabase hanya tersisa sebagai konteks/operator scripts; tidak ada Supabase
  Auth aktif di aplikasi.
- Google credential dapat berupa file JSON server-side atau pasangan email dan
  private key server-side. Jangan menaruhnya di client, log, atau dokumentasi.
- `src/app/(protected)/data-batu-bara` hanya menampilkan field yang tersedia di
  model saat ini; fitur import/export/report yang belum memiliki backend tetap
  disabled.

Dokumen konteks utama untuk coding agent adalah `docs/AGENT_CONTEXT.md`,
`docs/PROJECT_MAP.md`, dan `docs/PROJECT_AUDIT.md`. Keputusan implementasi
stabilisasi terakhir dicatat di
`docs/IMPLEMENTATION_DECISIONS_2026-09-02.md`.
