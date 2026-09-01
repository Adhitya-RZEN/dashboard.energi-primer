# Phase 22A — Dashboard One-Day Reporting Lag

Tanggal implementasi: 1 September 2026

## Status

**IMPLEMENTED — PASS WITH REVIEW**

Koreksi requirement telah diterapkan pada read/query layer dashboard. Cutoff
tidak lagi ditentukan dari tanggal terbaru di PostgreSQL, Google Sheets, row
import, atau timestamp sinkronisasi.

## Aturan cutoff final

Dashboard memakai formula berikut:

```text
dashboard_cutoff_date = real-world calendar date in Asia/Makassar - 1 calendar day
```

Contoh yang diverifikasi:

| Real-world date | Dashboard cutoff |
| --- | --- |
| 2026-08-01 | 2026-07-31 |
| 2026-08-02 | 2026-08-01 |
| 2026-09-01 | 2026-08-31 |

Timezone `Asia/Makassar` sudah digunakan oleh source project pada halaman
monitoring. Nilai yang sama kini dipusatkan untuk kebijakan cutoff dashboard;
tidak ada timezone baru yang ditebak. Audit sebelumnya menemukan sebagian
date-only dashboard memakai UTC dan belum memiliki konfigurasi timezone pusat,
sehingga konfirmasi operator tetap dicatat sebagai **NEEDS_REVIEW** bila
timezone operasional harus dapat diubah melalui konfigurasi deployment.

## Perubahan yang diterapkan

- Menambahkan helper date-only bersama di `src/lib/dashboard-date.ts`.
- Mengubah default dan normalisasi query agar tahun/bulan/tanggal tidak dapat
  melampaui cutoff real-world.
- Menambahkan `dashboardCutoffDate` pada kontrak `OverviewData.period` agar
  filter client memakai cutoff dari server, bukan jam browser.
- PostgreSQL dashboard membatasi query data harian dengan batas eksklusif
  `cutoff + 1 calendar day`. Tanggal cutoff tetap ikut terlihat.
- Google Sheets dashboard memfilter series dan focus record dengan aturan yang
  sama sebelum data dikirim ke UI.
- KPI/unit breakdown yang berasal dari baris data dashboard menggunakan hasil
  read yang sudah dibatasi; kalkulasi bisnis dan schema tidak diubah.
- Date picker membatasi tanggal bulan cutoff dan menolak query yang dibuat
  manual melalui server-side normalization.
- Filter tahun/bulan tetap dapat memilih periode historis yang lebih lama,
  sedangkan periode masa depan tidak ditawarkan pada tahun cutoff.
- `vercel.json` diubah menjadi cron `0 1 * * *` (satu kali sehari). Sync engine,
  schema, dan kontrak API tidak diubah.

## Data preservation

Tidak ada operasi tulis database. Data setelah cutoff:

- tidak dihapus;
- tidak diubah;
- tidak ditandai invalid;
- hanya dikeluarkan dari hasil dashboard normal.

Database local dan Supabase tidak diakses pada implementasi ini. Nilai source
date tetap dipertahankan.

## Coverage dashboard

Seluruh halaman dashboard menggunakan jalur `getOverviewData` bersama, sehingga
aturan diterapkan pada:

- Overview;
- Biomassa;
- Batubara;
- Solar;
- Stok Batubara;
- Target & Kinerja;
- KPI periode, chart harian, focus date, unit breakdown, dan date filter.

Target tahunan dan snapshot period-grain tetap memakai model data yang sudah
ada; tidak dibuat metric atau struktur baru.

## Validation

| Pemeriksaan | Status | Catatan |
| --- | --- | --- |
| Real-world cutoff fixture | PASS | Tiga contoh tanggal requirement lulus |
| Timezone calculation | PASS WITH REVIEW | `Asia/Makassar` eksplisit di source; central deployment setting belum ada |
| Post-cutoff preservation | PASS | Pure read-layer filtering; tidak ada DML |
| KPI query path | PASS | Semua dashboard memakai service overview bersama |
| Chart series path | PASS | PostgreSQL dan Google Sheets series difilter |
| Date filter ceiling | PASS | Server normalization dan opsi client dibatasi |
| Daily cron | PASS | `0 1 * * *` di `vercel.json` |
| `dashboard:verify-cutoff` | PASS | Tidak memakai environment atau database |
| TypeScript | PASS | `npx.cmd tsc --noEmit` |
| Lint | PASS | `npm.cmd run lint` |
| Production build | NOT RUN | Requirement melarang pembacaan `.env.local`; Next build otomatis memuatnya |
| Database writes | 0 | Tidak ada database command |
| Sync runs | 0 | Cron tidak dipanggil |
| Production deployment | NOT RUN | Sesuai requirement |

## Files changed for Phase 22A

- `src/lib/dashboard-date.ts`
- `src/types/overview.ts`
- `src/services/overview.ts`
- `src/services/overview-postgres.ts`
- `src/services/google-sheets-overview.ts`
- `src/components/dashboard/DashboardFilter.tsx`
- `src/components/dashboard/OverviewDashboard.tsx`
- `src/components/dashboard/DetailDashboard.tsx`
- `scripts/verify-dashboard-cutoff.ts`
- `package.json`
- `vercel.json`
- `docs/VERCEL_DEPLOYMENT_RUNBOOK.md`
- `docs/PHASE22_VERCEL_PREVIEW_RUNBOOK.md`
- `docs/OVERVIEW_DATA_MAPPING.md`

## Remaining review

1. Operator perlu mengonfirmasi bahwa `Asia/Makassar` adalah timezone
   operasional deployment untuk seluruh dashboard. Perubahan timezone melalui
   environment/configuration adalah pekerjaan terpisah.
2. Jalankan production build pada environment yang memang diizinkan memuat
   konfigurasi deployment setelah audit secret selesai.
3. Preview smoke test perlu dilakukan pada deployment Vercel terpisah; tidak
   dijalankan pada Phase 22A.
