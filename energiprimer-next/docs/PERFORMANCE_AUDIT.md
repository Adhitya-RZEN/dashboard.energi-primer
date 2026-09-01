# Performance Audit

Tanggal audit: 2026-08-28  
Scope: review performance tanpa mengubah database, API contract, authentication, Google Sheets, atau business logic.

## Ringkasan

Fondasi App Router sudah mendukung navigasi client-side dan persistent dashboard shell. Tidak ditemukan hard navigation pada `NavigationMenu`; chart tidak melakukan fetch sendiri. Masih ada beberapa area yang perlu ditangani sebelum production, terutama form legacy yang masih melakukan navigasi dokumen penuh dan konfigurasi data production.

## Temuan berdasarkan area

| Area                          | Hasil                                                                                              | Status            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| Internal dashboard navigation | Menggunakan Next `Link`, `usePathname`, dan pending state                                          | PASS              |
| Persistent shell              | `(protected)/layout.tsx` membungkus child page dengan shell                                        | PASS              |
| Hard navigation               | Tidak ditemukan `window.location.href`/`reload` pada dashboard navigation                          | PASS              |
| Dashboard filter              | Menggunakan transition dan `router.push(..., { scroll: false })`                                   | PASS              |
| Legacy data/report forms      | Beberapa form GET di `data-batu-bara`, `monitoring`, dan `laporan` menyebabkan document navigation | NEEDS REVIEW      |
| Server/client split           | Page/data fetching tetap Server Component; interaksi chart/filter berada di Client Component       | PASS              |
| Client data fetch             | Tidak ditemukan pola `useEffect` fetch untuk chart/dashboard utama                                 | PASS              |
| Duplicate chart fetch         | Chart menerima data dari page dan tidak memanggil DB/API                                           | PASS              |
| Query parallelism             | Query utama menggunakan `Promise.all`/aggregate query yang tersedia                                | PASS              |
| Chart code split              | Recharts berada pada route/client chunks; tidak ada dynamic import tambahan                        | PASS WITH WARNING |
| Loading boundary              | `loading.tsx` tersedia pada route dashboard utama                                                  | PASS              |
| Error isolation               | Route error boundary tersedia; granular per-widget belum diterapkan                                | NEEDS REVIEW      |
| Google cache                  | Cache in-memory per process, bukan shared cache antar instance                                     | NEEDS REVIEW      |

## High impact findings

### 1. Database endpoint lokal tidak dapat dipakai Vercel

Ini adalah blocker operasional yang juga memengaruhi latency dan reliability. Production membutuhkan PostgreSQL endpoint eksternal/pooler yang dapat dijangkau Vercel. Detailnya dicatat pada `DATABASE_PRODUCTION_READINESS.md`.

### 2. Navigasi penuh pada form tertentu

Dashboard utama sudah memakai mekanisme App Router, tetapi halaman data/report tertentu masih memakai form GET biasa. Ini dapat membuat header dan sidebar terasa reload ketika user menggunakan filter pada halaman tersebut.

Perbaikan aman berikutnya: evaluasi per form apakah query state dapat dipindahkan ke controlled Client Component dengan `router.push`/`router.replace` tanpa mengubah route semantics. Ini belum dilakukan karena perlu validasi perilaku tiap feature dan status parity.

### 3. Google Sheets cache tidak shared

`Map` in-memory mengurangi request berulang dalam satu instance, tetapi tidak berbagi cache antar serverless instances. Distributed cache adalah perubahan infrastructure/architecture dan **REQUIRES MANUAL APPROVAL**. Jangan menambah caching agresif sebelum freshness requirement disepakati.

## Bundle dan rendering

Production build menunjukkan chunk client terbesar yang terkait chart sekitar 411 KB raw pada disk, dengan chunk chart lain sekitar 52 KB raw. Angka tersebut bukan ukuran gzip/Brotli dan belum menjadi baseline Lighthouse.

Recharts hanya diimpor pada Client Components chart. Tidak ada bukti credential atau database environment masuk ke public chunks berdasarkan static scan build. Dynamic import tambahan tidak dipaksakan karena manfaatnya belum diukur.

## Query, render, dan interaksi

- Tidak ada N+1 yang jelas pada service yang diaudit.
- Data disiapkan di Server Component/service lalu diteruskan ke chart.
- Chart tidak membuat request tambahan.
- Re-render chart dapat terjadi saat filter/visibility berubah sesuai kebutuhan interaksi.
- Tidak ada memoization global atau state global baru yang perlu ditambahkan.
- Skeleton route menjaga shell tetap tersedia, tetapi granular loading/error per widget masih merupakan improvement terpisah.

## Low impact / technical debt

- Tidak ada Lighthouse/real-user measurement dalam repository.
- Tidak ada test framework atau `npm test` script.
- Asset starter di `public/` dan directory nested kosong terdeteksi sebagai artefak yang belum dibersihkan; tidak dihapus pada Phase 10.
- Dokumentasi Phase 0-9 masih memiliki beberapa pernyataan historis yang menyebut SVG/no chart dependency atau fitur auth belum ada. Ini tidak mengubah runtime, tetapi perlu dirapikan sebelum handoff.

## Rekomendasi berurutan

1. Sediakan database dan Google Sheets production configuration.
2. Ukur preview deployment dengan Web Vitals/Lighthouse.
3. Perbaiki form legacy yang terbukti melakukan full document navigation.
4. Evaluasi granular widget loading/error berdasarkan hasil measurement.
5. Evaluasi cache lintas instance hanya jika freshness dan biaya request membenarkannya.

## Status

**PASS WITH WARNINGS untuk fondasi runtime; NOT READY untuk performance sign-off production** karena deployment environment belum dapat diuji dan beberapa form masih menggunakan navigasi dokumen penuh.
