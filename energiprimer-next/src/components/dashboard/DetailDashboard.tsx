import type {
  OverviewData,
  OverviewMetric,
  OverviewUnitValue,
} from "@/types/overview";

import {
  DetailBarChart,
  DetailLineChart,
  DetailMultiLineChart,
  TargetProgressChart,
} from "./DetailCharts";
import { OverviewKpiCard } from "./OverviewKpiCard";
import { OverviewEmptyState, OverviewUnavailable } from "./OverviewState";
import {
  DashboardChartPanel,
  DashboardDataStatus,
  DashboardPageHeader,
  DashboardPanel,
  DashboardSectionHeading,
  DashboardWarning,
} from "./DashboardPrimitives";
import { DashboardFilter } from "./DashboardFilter";

export type DashboardDetailFeature =
  "biomassa" | "batubara" | "stok" | "solar" | "target";

function formatNumber(value: number | null, decimals = 0) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      }).format(value);
}

function metric(
  value: number | null,
  unit: string,
  source: string,
  available = value !== null,
  note?: string,
): OverviewMetric {
  return { value, unit, source, available, note };
}

function activePoint(data: OverviewData) {
  return (
    data.series.find((point) => point.date === data.period.focusDate) ??
    data.series.at(-1) ??
    null
  );
}

function UnitValues({
  rows,
  unit,
  note,
}: {
  rows: OverviewUnitValue[];
  unit: string;
  note: string;
}) {
  if (!rows.length) return <OverviewUnavailable note={note} />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div
          key={row.unit}
          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="text-sm text-slate-600">{row.unit}</span>
          <strong className="text-sm text-slate-950">
            {formatNumber(row.value)}{" "}
            <small className="font-normal text-slate-500">{unit}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}

function PageIntro({
  data,
  title,
  description,
  action,
  themeKey,
}: {
  data: OverviewData;
  title: string;
  description: string;
  action: string;
  themeKey: DashboardDetailFeature;
}) {
  return (
    <>
      <DashboardPageHeader
        title={title}
        description={description}
        themeKey={themeKey}
      />
      <DashboardDataStatus data={data} />
      {data.period.fallbackNotice ? (
        <DashboardWarning>
          <strong>Periode yang diminta belum tersedia.</strong>{" "}
          {data.period.fallbackNotice}
        </DashboardWarning>
      ) : null}
      <DashboardFilter data={data} action={action} themeKey={themeKey} />
      {!data.hasData ? <OverviewEmptyState /> : null}
    </>
  );
}

function BiomassaDashboard({ data }: { data: OverviewData }) {
  return (
    <>
      <section className="space-y-4">
        <DashboardSectionHeading
          themeKey="biomassa"
          eyebrow="Biomassa utama"
          title="Ringkasan Biomassa"
          description={`Data periode · ${data.period.monthLabel}`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewKpiCard
            title="Penerimaan Biomassa"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.biomassReceiptMonthly}
            label="Total 7 pemasok Biomassa"
            tone="green"
          />
          <OverviewKpiCard
            title="Pemakaian Biomassa"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.biomassConsumptionMonthly}
            label="Total pemakaian bulanan"
            tone="green"
          />
          <DashboardPanel>
            <h3 className="text-sm font-bold text-slate-950">
              Pemakaian Biomassa Harian
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {data.period.focusDateLabel}
            </p>
            <div className="mt-4">
              <UnitValues
                rows={data.biomassDaily}
                unit="ton"
                note="Data biomassa tidak tersedia pada source aktif."
              />
            </div>
          </DashboardPanel>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <DashboardChartPanel
          title="Pemakaian Biomassa Harian"
          description="Tren pemakaian berdasarkan tanggal."
        >
          <DetailLineChart
            series={data.series}
            dataKey="biomass"
            label="Pemakaian Biomassa"
            unit="ton"
            color="#16a34a"
          />
        </DashboardChartPanel>
        <DashboardChartPanel
          title="Pemakaian Biomassa per Unit"
          description="Perbandingan kontribusi Unit 1–3."
        >
          <DetailBarChart
            series={data.series}
            datasets={[
              { key: "biomassUnit1", label: "Unit 1", color: "#16a34a" },
              { key: "biomassUnit2", label: "Unit 2", color: "#22c55e" },
              { key: "biomassUnit3", label: "Unit 3", color: "#86efac" },
            ]}
            unit="ton"
            stacked
          />
        </DashboardChartPanel>
      </section>
    </>
  );
}

function BatubaraDashboard({ data }: { data: OverviewData }) {
  const point = activePoint(data);
  const daily = metric(
    point?.coal ?? null,
    "ton",
    "AB baris harian",
    point?.coal !== null && point?.coal !== undefined,
  );
  return (
    <>
      <section className="space-y-4">
        <DashboardSectionHeading
          themeKey="batubara"
          eyebrow="Batubara utama"
          title="Ringkasan Batubara"
          description={`Data periode · ${data.period.monthLabel}`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewKpiCard
            title="Penerimaan Batubara"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.coalReceiptMonthly}
            label="Total penerimaan bulanan"
            tone="blue"
          />
          <OverviewKpiCard
            title="Pemakaian Batubara"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.coalConsumptionMonthly}
            label="Total pemakaian bulanan"
            tone="blue"
          />
          <DashboardPanel>
            <h3 className="text-sm font-bold text-slate-950">
              Pemakaian Batubara Harian
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {data.period.focusDateLabel}
            </p>
            <div className="mt-4">
              <UnitValues
                rows={data.coalDaily}
                unit="ton"
                note="Tidak ada data batubara pada tanggal fokus."
              />
            </div>
          </DashboardPanel>
          <OverviewKpiCard
            title="Total Pemakaian Harian"
            subtitle={`Semua Unit · ${data.period.focusDateLabel}`}
            metric={daily}
            label="Total pemakaian harian"
            tone="blue"
          />
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <DashboardChartPanel title="Konsumsi Batubara Harian">
          <DetailLineChart
            series={data.series}
            dataKey="coal"
            label="Pemakaian Batubara"
            unit="ton"
            color="#2563eb"
          />
        </DashboardChartPanel>
        <DashboardChartPanel title="Konsumsi Batubara per Unit">
          <DetailBarChart
            series={data.series}
            datasets={[
              { key: "coalUnit1", label: "Unit 1", color: "#2563eb" },
              { key: "coalUnit2", label: "Unit 2", color: "#3b82f6" },
              { key: "coalUnit3", label: "Unit 3", color: "#93c5fd" },
            ]}
            unit="ton"
            stacked
          />
        </DashboardChartPanel>
      </section>
    </>
  );
}

function StokDashboard({ data }: { data: OverviewData }) {
  return (
    <>
      <section className="space-y-4">
        <DashboardSectionHeading
          themeKey="stok"
          eyebrow="Stok dan HOP"
          title="Kesiapan Operasi"
          description={`Posisi inventori · ${data.period.focusDateLabel}`}
        />
        <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <OverviewKpiCard
            title="Stock Batubara"
            subtitle={`Coal Yard · ${data.period.focusDateLabel}`}
            metric={data.metrics.coalStock}
            label={
              data.metrics.coalStock.progressPercent === null
                ? "Tidak ada data stok"
                : `Kapasitas 70.000 ton · ${data.metrics.coalStock.progressPercent}%`
            }
            tone="amber"
          />
          <DashboardPanel>
            <h3 className="text-sm font-bold text-slate-950">
              HOP (Hari Operasi)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Threshold: &lt;10 kritis, &lt;15 perhatian
            </p>
            {data.hop ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {data.hop.map((row) => (
                  <div
                    key={row.unit}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <span className="text-xs text-slate-500">{row.unit}</span>
                    <strong className="mt-1 block text-xl text-slate-950">
                      {formatNumber(row.value, 1)}{" "}
                      <small className="text-xs font-normal text-slate-500">
                        hari
                      </small>
                    </strong>
                    <span
                      className={`mt-1 block text-xs font-semibold ${row.status === "danger" ? "text-red-700" : row.status === "warning" ? "text-amber-700" : "text-emerald-700"}`}
                    >
                      {row.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <OverviewUnavailable note="HOP hanya tersedia pada kolom AJ/AK/AL Google Sheets." />
              </div>
            )}
          </DashboardPanel>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <DashboardChartPanel title="Stok Batubara">
          <DetailLineChart
            series={data.series}
            dataKey="stock"
            label="Stok Batubara"
            unit="ton"
            color="#4f46e5"
          />
        </DashboardChartPanel>
        <DashboardChartPanel title="Tren HOP">
          <DetailMultiLineChart
            series={data.series}
            datasets={[
              { key: "hop3", label: "HOP 3 Unit", color: "#4f46e5" },
              { key: "hop2", label: "HOP 2 Unit", color: "#16a34a" },
              { key: "hop1", label: "HOP 1 Unit", color: "#f59e0b" },
            ]}
            unit="hari"
            referenceLines={[
              { value: 10, label: "Batas 10 hari", color: "#f59e0b" },
              { value: 15, label: "Batas 15 hari", color: "#16a34a" },
            ]}
          />
        </DashboardChartPanel>
      </section>
    </>
  );
}

function SolarDashboard({ data }: { data: OverviewData }) {
  return (
    <>
      <section className="space-y-4">
        <DashboardSectionHeading
          themeKey="solar"
          eyebrow="Solar utama"
          title="Ringkasan Solar"
          description={`Data periode · ${data.period.monthLabel}`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewKpiCard
            title="Pemakaian Solar Harian"
            subtitle={data.period.focusDateLabel}
            metric={data.metrics.solarConsumptionDaily}
            label="Pemakaian harian"
            tone="amber"
          />
          <OverviewKpiCard
            title="Total Pemakaian Solar"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.solarConsumptionMonthly}
            label="Total pemakaian bulanan"
            tone="amber"
          />
          <OverviewKpiCard
            title="Penerimaan Solar"
            subtitle={`Bulanan · ${data.period.monthLabel}`}
            metric={data.metrics.solarReceiptMonthly}
            label="Total penerimaan bulanan"
            tone="amber"
          />
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <DashboardChartPanel title="Pemakaian Solar Harian">
          <DetailLineChart
            series={data.series}
            dataKey="solar"
            label="Pemakaian Solar"
            unit="liter"
            color="#f59e0b"
          />
        </DashboardChartPanel>
        <DashboardChartPanel title="Penerimaan vs Pemakaian Solar">
          <DetailBarChart
            series={data.series}
            datasets={[
              {
                key: "solarReceipt",
                label: "Penerimaan Solar",
                color: "#fde68a",
              },
              { key: "solar", label: "Pemakaian Solar", color: "#f59e0b" },
            ]}
            unit="liter"
          />
        </DashboardChartPanel>
      </section>
    </>
  );
}

function TargetDashboard({ data }: { data: OverviewData }) {
  if (!data.target)
    return (
      <OverviewUnavailable note="Target biomassa hanya tersedia pada row 56/59 kolom CO Google Sheets." />
    );
  const target = data.target;
  return (
    <>
      <section className="space-y-4">
        <DashboardSectionHeading
          themeKey="target"
          eyebrow="Target biomassa"
          title="Target dan Kinerja"
          description={`Pencapaian tahun ${data.query.year}.`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewKpiCard
            title="Target Biomassa"
            subtitle={`Tahun ${data.query.year}`}
            metric={metric(
              target.target,
              "ton",
              "Target biomassa tahunan",
              true,
            )}
            label="Target tahunan"
            tone="violet"
          />
          <OverviewKpiCard
            title="Realisasi Kumulatif"
            subtitle={`s.d. ${data.period.monthLabel}`}
            metric={data.metrics.biomassCumulative}
            label={`Sisa: ${formatNumber(target.remaining)} ton`}
            tone="violet"
          />
          <OverviewKpiCard
            title="Progres Target"
            subtitle="Realisasi / target tahunan"
            metric={data.metrics.biomassTargetProgress}
            label={`Pencapaian terhadap target ${formatNumber(target.target)} ton`}
            tone="violet"
          />
        </div>
      </section>
      <DashboardChartPanel
        title="Progres Target Biomassa"
        description="Realisasi kumulatif terhadap target tahunan."
      >
        <TargetProgressChart progress={target.progress} />
      </DashboardChartPanel>
    </>
  );
}

export function DetailDashboard({
  feature,
  data,
}: {
  feature: DashboardDetailFeature;
  data: OverviewData;
}) {
  const config = {
    biomassa: {
      title: "Dashboard Biomassa",
      description:
        "Monitoring penerimaan dan pemakaian biomassa untuk operasi harian.",
      action: "/dashboard/biomassa",
    },
    batubara: {
      title: "Dashboard Batubara",
      description:
        "Monitoring penerimaan, konsumsi, dan distribusi batubara per unit.",
      action: "/dashboard/batubara",
    },
    stok: {
      title: "Dashboard Stok Batubara",
      description: "Pantau ketersediaan stok dan kesiapan operasi unit.",
      action: "/dashboard/stok",
    },
    solar: {
      title: "Dashboard Solar",
      description:
        "Monitoring penerimaan dan pemakaian solar pada periode terpilih.",
      action: "/dashboard/solar",
    },
    target: {
      title: "Dashboard Target & Kinerja",
      description: "Pantau target, realisasi, dan progres biomassa tahunan.",
      action: "/dashboard/target",
    },
  }[feature];
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <PageIntro
        data={data}
        title={config.title}
        description={config.description}
        action={config.action}
        themeKey={feature}
      />
      {feature === "biomassa" ? <BiomassaDashboard data={data} /> : null}
      {feature === "batubara" ? <BatubaraDashboard data={data} /> : null}
      {feature === "stok" ? <StokDashboard data={data} /> : null}
      {feature === "solar" ? <SolarDashboard data={data} /> : null}
      {feature === "target" ? <TargetDashboard data={data} /> : null}
    </div>
  );
}
