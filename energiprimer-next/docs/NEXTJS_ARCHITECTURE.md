# Next.js Architecture — Phases 2–5

## Status

- **Phase:** 5 — Layout & Navigation
- **Status:** selesai
- **Tanggal:** 2026-08-26
- **Scope:** foundation, authentication boundary, dan reusable dashboard layout/navigation
- **Di luar scope Phase 5:** dashboard KPI/chart penuh, API baru, upload, dan integrasi eksternal

Foundation ini mengikuti hasil audit Laravel pada dokumen di folder `docs/`.
Laravel tetap diperlakukan sebagai source/reference dan tidak diubah.

## Struktur saat ini

```text
src/
├── app/
│   ├── error.tsx           # segment error boundary; Client Component
│   ├── globals.css         # Tailwind import dan global baseline
│   ├── layout.tsx          # root layout dan metadata
│   ├── loading.tsx         # route loading UI
│   ├── not-found.tsx       # 404 UI
│   ├── page.tsx            # foundation landing page, bukan dashboard
│   ├── (protected)/
│   │   ├── layout.tsx      # auth/role guard + authenticated AppShell
│   │   └── dashboard/page.tsx
│   ├── login/              # public auth pages tanpa dashboard shell
│   ├── forgot-password/
│   └── reset-password/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx     # authenticated dashboard shell
│   │   ├── AuthShell.tsx    # public authentication shell
│   │   ├── NavigationMenu.tsx
│   │   ├── Sidebar.tsx
│   │   └── SiteHeader.tsx
│   ├── auth/
│   │   ├── SignOutButton.tsx
│   │   └── UserMenu.tsx
│   └── ui/
│       └── LoadingState.tsx
├── lib/
│   └── env.ts              # public environment configuration
├── services/
│   └── README.md           # service boundary; implementasi ditunda
└── types/
    └── navigation.ts       # shared navigation type
```

Audit documents tetap tersedia di folder `docs/`, termasuk route, database,
auth, feature, dan integration mapping.

## Architecture decisions

### App Router, route group, dan `src/`

Routing menggunakan `src/app` dan konvensi file App Router. Root layout
menyediakan HTML shell, metadata, dan global stylesheet. Dashboard shell
dipasang hanya oleh `src/app/(protected)/layout.tsx`, setelah server-side
session dan role guard berhasil. Dengan boundary ini, login dan recovery
pages tidak menerima sidebar/header dashboard secara tidak semestinya.

### Server-first component boundary

Shell layout, header, sidebar, user menu, dan landing page tetap Server
Components. `NavigationMenu` menjadi Client Component kecil karena active
route state membutuhkan `usePathname`; ini mengikuti konvensi App Router dan
tidak memindahkan seluruh shell ke client. `app/error.tsx` juga Client
Component karena error boundary memerlukan directive `use client`.

Menu mobile memakai elemen HTML `details`, sehingga foundation tidak perlu
state management atau dependency UI tambahan.

### Reusable UI

`AppShell`, `SiteHeader`, `Sidebar`, `NavigationMenu`, `UserMenu`, `AuthShell`,
dan `LoadingState` menjadi komponen dasar yang dapat dipakai oleh route
berikutnya. `/dashboard` adalah route dashboard yang tersedia saat ini.
Item navigasi Laravel yang belum memiliki page Next.js ditampilkan sebagai
disabled `Segera`, sehingga tidak membuat route palsu atau placeholder
production-ready.

### Service dan type boundaries

`src/services` menjadi tempat business/data service. Pada Phase 2 folder ini
masih sengaja kosong dari implementasi; Phase 3 menambahkan read-only Prisma
service yang didokumentasikan di `docs/DATABASE_MIGRATION.md`. Belum ada API
client atau dashboard data mock. Kontrak Google Sheets versus PostgreSQL
tetap mengikuti item `NEEDS REVIEW` pada audit.

### Environment configuration

`src/lib/env.ts` hanya mengekspos konfigurasi non-secret:

- `NEXT_PUBLIC_APP_NAME` — nama aplikasi, fallback `Energi Primer`.
- `NEXT_PUBLIC_APP_URL` — URL publik opsional.
- `NODE_ENV` — dibaca sebagai environment bawaan Next.js.

Next.js memuat file `.env*` dari root project, bukan dari `src/`. File `.env*`
tidak boleh di-commit. Credential database, Google service account, password,
dan secret lain tidak boleh dimasukkan ke `publicEnv` atau diberi prefix
`NEXT_PUBLIC_`.

### Import alias

Alias `@/*` diarahkan ke `./src/*` melalui `tsconfig.json`, sehingga import
lintas folder tidak bergantung pada relative path yang panjang.

### Styling dan responsive layout

Tailwind CSS v4 digunakan melalui `@tailwindcss/postcss` yang sudah ada.
Layout memakai breakpoint Tailwind dan CSS grid: sidebar tampil pada layar
besar (mulai breakpoint `lg`), sedangkan tablet/mobile menggunakan disclosure
menu native di header. Active route diberi `aria-current="page"` dan penanda
visual. Tidak ada font, chart, atau component library tambahan.

### Error, loading, dan not-found

- `app/loading.tsx` menyediakan fallback loading untuk segment root.
- `app/error.tsx` menangani uncaught rendering error dan menyediakan retry.
- `app/not-found.tsx` menyediakan 404 fallback untuk route yang tidak ada.

Detail error tidak ditampilkan kepada pengguna. Logging dan error reporting
terpusat ditunda sampai kebutuhan observability ditetapkan.

## Configuration baseline

- Next.js `16.3.3`
- React `19.2.8`
- TypeScript `^5`
- ESLint `^9` dengan `eslint-config-next` `16.3.3`
- Tailwind CSS `^4` dengan PostCSS plugin Next.js
- `typedRoutes: true` pada `next.config.ts`
- TypeScript strict mode aktif
- `typescript.ignoreBuildErrors` tidak diaktifkan
- Prisma `6.19.3` untuk PostgreSQL data access

## Deliberately deferred

Item berikut tetap menunggu keputusan dan verifikasi dari audit Laravel:

1. Page dashboard fitur dan kontrak KPI/chart.
2. Pemilihan source of truth dan kontrak Google Sheets/PostgreSQL.
3. Strategi akses data: server-side database, backend API, atau sinkronisasi.
4. Status monitoring yang saat ini masih placeholder di Laravel.
5. Format laporan generate/download.
6. Queue, scheduler, upload, dan external service lain yang belum terbukti aktif.

Tidak ada Phase 3 yang dijalankan pada pekerjaan ini.
