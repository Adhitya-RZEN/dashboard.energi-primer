import type { OverviewData, OverviewMetric, OverviewUnitValue } from "@/types/overview";

import { EnergyConsumptionChart } from "./EnergyConsumptionChart";
import { OverviewKpiCard } from "./OverviewKpiCard";
import { OverviewEmptyState, OverviewUnavailable } from "./OverviewState";
import { DashboardChartPanel, DashboardDataStatus, DashboardPageHeader, DashboardPanel, DashboardSectionHeading, DashboardWarning } from "./DashboardPrimitives";
import { DashboardFilter } from "./DashboardFilter";

type OverviewDashboardProps = { data: OverviewData };

function formatNumber(value: number | null, decimals = 0) {
  return value === null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
}

function metricLabel(metric: OverviewMetric, fallback: string) {
  return metric.available ? metric.source : fallback;
}

function UnitValues({ rows, emptyNote }: { rows: OverviewUnitValue[]; emptyNote: string }) {
  if (!rows.length) return <OverviewUnavailable note={emptyNote} />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.unit} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <span className="text-sm text-slate-600">{row.unit}</span>
          <strong className="text-sm text-slate-950">{formatNumber(row.value)} <small className="font-normal text-slate-500">ton</small></strong>
        </div>
      ))}
    </div>
  );
}

function TargetPanel({ data }: { data: OverviewData }) {
  if (!data.target) return <OverviewUnavailable note="Target dan realisasi biomassa Laravel berasal dari Google Sheets row 56/59 kolom CO. Tabel kpi_targets PostgreSQL hanya berisi SFC dan heat rate, bukan target biomassa." />;
  const target = data.target;
  const progress = Math.min(100, Math.max(0, target.progress));
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold text-slate-600">Target Biomassa Tahun {data.query.year}</p><p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{formatNumber(target.progress, 1)}<span className="ml-1 text-lg text-slate-500">%</span></p></div>
        <span className="rounded-full bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold text-violet-700">{formatNumber(progress, 1)}% tercapai</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div><span className="block text-[10px] text-slate-500">Target Tahunan</span><strong className="text-sm text-slate-950">{formatNumber(target.target)} <small className="font-normal text-slate-500">ton</small></strong></div>
        <div><span className="block text-[10px] text-slate-500">Realisasi Kumulatif</span><strong className="text-sm text-slate-950">{formatNumber(target.cumulative)} <small className="font-normal text-slate-500">ton</small></strong></div>
        <div><span className="block text-[10px] text-slate-500">Sisa Target</span><strong className="text-sm text-slate-950">{formatNumber(target.remaining)} <small className="font-normal text-slate-500">ton</small></strong></div>
      </div>
    </div>
  );
}

function HopPanel({ data }: { data: OverviewData }) {
  if (!data.hop) return <OverviewUnavailable note="HOP Unit 1–3 hanya tersedia sebagai kolom AJ/AK/AL Google Sheets; PostgreSQL existing tidak menyimpan HOP per unit." />;
  return (
    <div>
      <div className="grid grid-cols-[1fr_.8fr_1fr] gap-3 border-b border-slate-200 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400"><span>Unit</span><span className="text-right">HOP</span><span className="text-right">Status</span></div>
      {data.hop.map((row) => <div key={row.unit} className="grid grid-cols-[1fr_.8fr_1fr] items-center gap-3 border-b border-slate-100 py-3 last:border-0 last:pb-0"><strong className="text-sm text-slate-950">{row.unit}</strong><span className="text-right text-sm font-bold text-slate-800">{formatNumber(row.value, 1)} <small className="font-normal text-slate-500">hari</small></span><span className={`text-right text-xs font-bold ${row.status === "danger" ? "text-red-700" : row.status === "warning" ? "text-amber-700" : "text-emerald-700"}`}><i className={`mr-1 inline-block size-1.5 rounded-full ${row.status === "danger" ? "bg-red-500" : row.status === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} />{row.label}</span></div>)}
    </div>
  );
}

export function OverviewDashboard({ data }: OverviewDashboardProps) {
  const { metrics, period } = data;
  const focusLabel = period.focusDateLabel;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <DashboardPageHeader themeKey="overview" title="Overview Energi Primer" description="Ringkasan kondisi energi primer, konsumsi, target, dan kesiapan operasi." />
      <DashboardDataStatus data={data} />
      {period.fallbackNotice ? <DashboardWarning><strong>Periode yang diminta belum tersedia.</strong> {period.fallbackNotice}</DashboardWarning> : null}
      <DashboardFilter data={data} action="/dashboard" themeKey="overview" />
      {!data.hasData ? <OverviewEmptyState /> : null}

      <section aria-labelledby="summary-title" className="space-y-4">
        <DashboardSectionHeading themeKey="overview" eyebrow="Ringkasan eksekutif" title="Executive Summary" description="Indikator utama pada periode terpilih." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewKpiCard href="/dashboard/biomassa" title="Penerimaan Biomassa" subtitle={`Bulanan · ${period.monthLabel}`} metric={metrics.biomassReceiptMonthly} label={metrics.biomassReceiptMonthly.available ? metrics.biomassReceiptMonthly.source : "Tidak ada data biomassa"} tone="green" />
          <OverviewKpiCard href="/dashboard/biomassa" title="Pemakaian Biomassa" subtitle={`Bulanan · ${period.monthLabel}`} metric={metrics.biomassConsumptionMonthly} label={metrics.biomassConsumptionMonthly.available ? metrics.biomassConsumptionMonthly.source : "Tidak ada data biomassa"} tone="green" />
          <OverviewKpiCard href="/dashboard/batubara" title="Pemakaian Batubara" subtitle={`Bulanan · ${period.monthLabel}`} metric={metrics.coalConsumptionMonthly} label={metricLabel(metrics.coalConsumptionMonthly, "Tidak ada data konsumsi")} tone="blue" />
          <OverviewKpiCard href="/dashboard/stok" title="Stock Batubara" subtitle={`Harian · ${focusLabel}`} metric={metrics.coalStock} label={metrics.coalStock.progressPercent === null ? "Tidak ada stok pada tanggal fokus" : `Kapasitas 70.000 ton · ${metrics.coalStock.progressPercent}%`} tone="amber" />
          <OverviewKpiCard href="/dashboard/solar" title="Total Pemakaian Solar" subtitle={`Bulanan · ${period.monthLabel}`} metric={metrics.solarConsumptionMonthly} label={metrics.solarConsumptionMonthly.available ? metrics.solarConsumptionMonthly.source : "Tidak ada data solar"} tone="amber" />
          <OverviewKpiCard title="Realisasi Biomassa Kumulatif" subtitle={`s.d. ${period.monthLabel}`} metric={metrics.biomassCumulative} label={metrics.biomassCumulative.available ? metrics.biomassCumulative.source : "Tidak ada data biomassa"} tone="violet" />
          <OverviewKpiCard href="/dashboard/target" title="Progress Target Biomassa" subtitle="Realisasi / target tahunan" metric={metrics.biomassTargetProgress} label={metrics.biomassTargetProgress.available ? metrics.biomassTargetProgress.source : "Target biomassa belum tersedia"} tone="violet" />
          <OverviewKpiCard href="/dashboard/batubara" title="Penerimaan Batubara" subtitle={`Bulanan · ${period.monthLabel}`} metric={metrics.coalReceiptMonthly} label={metricLabel(metrics.coalReceiptMonthly, "Tidak ada data penerimaan")} tone="blue" />
        </div>
      </section>

      <section aria-labelledby="consumption-title" className="space-y-4">
        <DashboardSectionHeading themeKey="overview" eyebrow="Tren harian" title="Konsumsi Energi Primer" description={`Perbandingan pemakaian harian · ${period.monthLabel}.`} />
        <DashboardChartPanel title="Konsumsi Energi Primer Harian" description="Batubara dan biomassa mengikuti source aktif."><EnergyConsumptionChart series={data.series} /></DashboardChartPanel>
      </section>

      <section aria-label="Target dan status operasional" className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4"><DashboardSectionHeading themeKey="target" eyebrow="Kinerja tahunan" title="Target & Realisasi" /><DashboardPanel><TargetPanel data={data} /></DashboardPanel></div>
        <div className="space-y-4"><DashboardSectionHeading themeKey="stok" eyebrow="Kesiapan operasi" title="Status Operasional (HOP)" /><DashboardPanel><HopPanel data={data} /></DashboardPanel></div>
      </section>

      <section aria-labelledby="detail-title" className="space-y-4">
        <DashboardSectionHeading themeKey="overview" eyebrow="Supporting information" title="Detail Operasional" description="Rincian pemakaian harian dan penerimaan bahan bakar." />
        <div className="grid gap-4 sm:grid-cols-2">
          <DashboardPanel><h3 className="text-sm font-bold text-slate-950">Pemakaian Biomassa Harian</h3><p className="mt-1 text-xs text-slate-500">{focusLabel}</p><div className="mt-4"><UnitValues rows={data.biomassDaily} emptyNote="Tidak ada data biomassa di source aktif." /></div></DashboardPanel>
          <DashboardPanel><h3 className="text-sm font-bold text-slate-950">Pemakaian Batubara Harian</h3><p className="mt-1 text-xs text-slate-500">{focusLabel}</p><div className="mt-4"><UnitValues rows={data.coalDaily} emptyNote="Tidak ada data konsumsi pada tanggal fokus." /></div></DashboardPanel>
          <DashboardPanel><h3 className="text-sm font-bold text-slate-950">Pemakaian Solar Harian</h3><p className="mt-1 text-xs text-slate-500">{focusLabel}</p><div className="mt-4">{metrics.solarConsumptionDaily.available ? <div className="text-3xl font-extrabold text-slate-950">{formatNumber(metrics.solarConsumptionDaily.value)} <small className="text-xs font-normal text-slate-500">liter</small></div> : <OverviewUnavailable note="Tidak ada data solar di PostgreSQL existing." />}</div></DashboardPanel>
          <DashboardPanel><h3 className="text-sm font-bold text-slate-950">Penerimaan Batubara</h3><p className="mt-1 text-xs text-slate-500">Bulanan · {period.monthLabel}</p><div className="mt-4 text-3xl font-extrabold text-slate-950">{formatNumber(metrics.coalReceiptMonthly.value)} <small className="text-xs font-normal text-slate-500">ton</small></div><p className="mt-2 text-xs leading-5 text-slate-500">{metrics.coalReceiptMonthly.note}</p></DashboardPanel>
        </div>
      </section>
    </div>
  );
}
