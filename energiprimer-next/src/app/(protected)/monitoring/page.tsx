import Link from "next/link";

import { getSyncMonitoringSnapshot } from "@/services/google-sheets/sync/monitoring";

function formatDate(value: string | null) {
  if (!value) return "Belum ada";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  }).format(new Date(value));
}

export default async function MonitoringPage() {
  const sync = await getSyncMonitoringSnapshot();
  const statusLabel = {
    NOT_CONFIGURED: "Belum dikonfigurasi",
    NEVER_RUN: "Belum pernah berjalan",
    HEALTHY: "Sehat",
    WARNING: "Perlu perhatian",
    ERROR: "Tidak tersedia",
    UNAVAILABLE: "Tidak dapat dibaca",
  }[sync.status];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500"
      >
        <Link href="/dashboard">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-sky-700">Monitoring</span>
      </nav>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
          Energi Primer
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Monitoring Efisiensi Batu Bara
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Pantau data operasional batu bara secara terperinci per unit, shift,
          dan periode waktu.
        </p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
              Google Sheets Sync
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              Status sinkronisasi data
            </h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              sync.status === "HEALTHY"
                ? "bg-emerald-100 text-emerald-800"
                : sync.status === "WARNING"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Run terakhir</p>
            <p className="mt-1 font-semibold text-slate-900">
              {sync.lastRunStatus ?? "Belum ada"}
            </p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(sync.lastRunAt)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Worksheet aktif</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{sync.worksheetsActive}</p>
            <p className="mt-1 text-xs text-slate-500">
              Missing {sync.worksheetsMissing}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Perlu review</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{sync.worksheetsReview}</p>
            <p className="mt-1 text-xs text-slate-500">
              Schema terbuka {sync.openSchemaChanges}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Rows terakhir</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {sync.lastRunCounters?.rowsScanned ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Skip {sync.lastRunCounters?.skipped ?? 0} · Failed {sync.lastRunCounters?.failed ?? 0}
            </p>
          </div>
        </div>
      </section>
      <div
        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900"
        role="alert"
      >
        <strong>NEEDS REVIEW — Monitoring terperinci belum tersedia.</strong>
        <p className="mt-1 text-xs leading-5">
          Source Laravel masih mengirim collection kosong dan KPI placeholder
          karena belum memiliki query operasional. Halaman ini mempertahankan
          status tersebut tanpa membuat angka monitoring.
        </p>
      </div>
      <form
        method="get"
        action="/monitoring"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <span className="mr-2 pb-2 text-sm font-semibold text-slate-700">
          Filter
        </span>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500 sm:flex-none">
          Mulai
          <input
            type="date"
            name="date_from"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500 sm:flex-none">
          Sampai
          <input
            type="date"
            name="date_to"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Filter
        </button>
        <Link
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          href="/monitoring"
        >
          Reset
        </Link>
      </form>
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-base font-bold text-slate-700">
          Data monitoring belum tersedia
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Shift, supplier, dan KPI operasional belum memiliki source query yang
          aktif.
        </p>
      </section>
    </div>
  );
}
