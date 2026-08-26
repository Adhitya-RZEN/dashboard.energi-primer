"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer, type MouseHandlerDataParam, type TooltipPayloadEntry } from "recharts";

export type ChartDataset = {
  key: string;
  label: string;
  color: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: ReactNode;
  unit: string;
  accentColor?: string;
  showTotal?: boolean;
  totalSeriesCount?: number;
  totalLabel?: string;
};

export function formatChartValue(value: unknown, maximumFractionDigits = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("id-ID", { maximumFractionDigits })
    : "—";
}

export function formatChartDate(value: unknown) {
  const raw = String(value ?? "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "Tanggal tidak tersedia";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function chartDateFromState(
  state: MouseHandlerDataParam | null | undefined,
  series: ReadonlyArray<{ date: string }>,
) {
  if (!state) return null;
  if (typeof state.activeLabel === "string") return state.activeLabel;

  const index = typeof state.activeTooltipIndex === "number"
    ? state.activeTooltipIndex
    : typeof state.activeIndex === "number"
      ? state.activeIndex
      : null;
  return index === null ? null : series[index]?.date ?? null;
}

export function ChartFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="h-[320px] min-h-[320px] w-full min-w-0"
    >
      <ResponsiveContainer
        width="100%"
        height={320}
        minWidth={0}
        initialDimension={{ width: 640, height: 320 }}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({
  datasets,
  hidden,
  onToggle,
}: {
  datasets: ReadonlyArray<ChartDataset>;
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 px-2 text-xs text-slate-600" role="group" aria-label="Legenda chart">
      {datasets.map((dataset) => {
        const isHidden = hidden.has(dataset.key);
        return (
          <button
            key={dataset.key}
            type="button"
            aria-label={`${isHidden ? "Tampilkan" : "Sembunyikan"} ${dataset.label}`}
            aria-pressed={!isHidden}
            onClick={() => onToggle(dataset.key)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${isHidden ? "text-slate-400 line-through" : "hover:bg-white"}`}
          >
            <i
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: isHidden ? "#cbd5e1" : dataset.color }}
            />
            {dataset.label}
          </button>
        );
      })}
    </div>
  );
}

export function toggleChartSeries(hidden: ReadonlySet<string>, key: string, total: number) {
  const next = new Set(hidden);
  if (next.has(key)) {
    next.delete(key);
  } else if (next.size < total - 1) {
    next.add(key);
  }
  return next;
}

export function DashboardChartTooltip({
  active,
  payload,
  label,
  unit,
  accentColor = "#2563eb",
  showTotal = false,
  totalSeriesCount,
  totalLabel = "Total",
}: ChartTooltipProps) {
  const entries = (payload ?? []).filter((entry) => entry.value !== null && entry.value !== undefined && entry.hide !== true);
  const numericValues = entries.map((entry) => entry.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const canShowTotal = showTotal
    && numericValues.length === entries.length
    && (totalSeriesCount === undefined || entries.length === totalSeriesCount);

  if (!active || !entries.length) return null;

  return (
    <div
      role="tooltip"
      className="pointer-events-none max-w-[18rem] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm"
      style={{ borderTopColor: accentColor }}
    >
      <p className="font-bold text-slate-950">{formatChartDate(label)}</p>
      <dl className="mt-2 space-y-1.5">
        {entries.map((entry, index) => (
          <div key={`${String(entry.dataKey)}-${index}`} className="flex items-center justify-between gap-4">
            <dt className="flex min-w-0 items-center gap-2 text-slate-600">
              <i
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color ?? accentColor }}
              />
              <span className="truncate">{String(entry.name ?? entry.dataKey ?? "Nilai")}</span>
            </dt>
            <dd className="shrink-0 font-bold text-slate-950">
              {formatChartValue(entry.value)} {String(entry.unit ?? unit)}
            </dd>
          </div>
        ))}
      </dl>
      {canShowTotal ? (
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-2 font-bold text-slate-950">
          <span>{totalLabel}</span>
          <span>{formatChartValue(numericValues.reduce((total, value) => total + value, 0))} {unit}</span>
        </div>
      ) : null}
    </div>
  );
}

export function xAxisTickInterval(length: number) {
  if (length <= 8) return 0;
  if (length <= 16) return 1;
  if (length <= 24) return 2;
  return 3;
}
