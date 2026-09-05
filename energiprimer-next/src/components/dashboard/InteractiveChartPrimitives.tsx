"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  MouseHandlerDataParam,
} from "recharts";

export type ChartDataset = {
  key: string;
  label: string;
  color: string;
};

type ChartColorToken =
  | "blue"
  | "green"
  | "green-bright"
  | "green-soft"
  | "blue-bright"
  | "blue-soft"
  | "indigo"
  | "amber"
  | "amber-soft"
  | "violet"
  | "slate"
  | "slate-soft";

// Dashboard series colors are a finite application-level palette. Keeping the
// palette in the stylesheet removes React style attributes while preserving
// the existing color contract for legends and tooltips.
const CHART_COLOR_TOKENS: Record<string, ChartColorToken> = {
  "#2563eb": "blue",
  "#16a34a": "green",
  "#22c55e": "green-bright",
  "#86efac": "green-soft",
  "#3b82f6": "blue-bright",
  "#93c5fd": "blue-soft",
  "#4f46e5": "indigo",
  "#f59e0b": "amber",
  "#fde68a": "amber-soft",
  "#7c3aed": "violet",
  "#e2e8f0": "slate",
  "#cbd5e1": "slate-soft",
};

function chartColorToken(color: string | null | undefined): ChartColorToken {
  return CHART_COLOR_TOKENS[color?.trim().toLowerCase() ?? ""] ?? "blue";
}

export function chartColorClass(color: string | null | undefined) {
  return `chart-color-${chartColorToken(color)}`;
}

export function chartBorderTopClass(color: string | null | undefined) {
  return `chart-border-top-${chartColorToken(color)}`;
}

// Recharts uses these values as a safe first render while ResponsiveContainer
// is measuring the actual parent. The measured responsive dimensions still
// take precedence after the container is ready.
export const CHART_WIDTH_FALLBACK = 640;
export const CHART_HEIGHT = 320;

type SizedChartProps = {
  width?: number;
  height?: number;
};

type ChartTooltipProps = {
  active?: boolean;
  entries?: ReadonlyArray<ChartTooltipEntry>;
  label?: ReactNode;
  unit: string;
  accentColor?: string;
  showTotal?: boolean;
  totalSeriesCount?: number;
  totalLabel?: string;
};

export type ChartTooltipEntry = {
  dataKey?: string | number;
  name?: ReactNode;
  value?: unknown;
  color?: string;
  unit?: string;
  hide?: boolean;
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

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
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

  const index =
    typeof state.activeTooltipIndex === "number"
      ? state.activeTooltipIndex
      : typeof state.activeIndex === "number"
        ? state.activeIndex
        : null;
  return index === null ? null : (series[index]?.date ?? null);
}

export function ChartFrame({
  children,
  label,
  height = CHART_HEIGHT,
  initialWidth = CHART_WIDTH_FALLBACK,
  overlay,
}: {
  children: ReactNode;
  label: string;
  height?: number;
  initialWidth?: number;
  overlay?: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const measuredWidth = Math.floor(frame.getBoundingClientRect().width);
      if (measuredWidth > 0) {
        setWidth((current) =>
          current === measuredWidth ? current : measuredWidth,
        );
      }
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const sizedChildren = isValidElement(children)
    ? cloneElement(children as ReactElement<SizedChartProps>, {
        width,
        height,
      })
    : children;

  const heightClass =
    height === 256 ? "chart-frame-height-256" : "chart-frame-height-320";

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={label}
      className={`relative w-full min-w-0 ${heightClass}`}
    >
      {sizedChildren}
      {overlay}
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
    <div
      className="mb-2 flex flex-wrap items-center justify-end gap-1.5 px-2 text-xs text-slate-600"
      role="group"
      aria-label="Legenda chart"
    >
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
              className={`size-2 rounded-full ${chartColorClass(isHidden ? "#cbd5e1" : dataset.color)}`}
            />
            {dataset.label}
          </button>
        );
      })}
    </div>
  );
}

export function toggleChartSeries(
  hidden: ReadonlySet<string>,
  key: string,
  total: number,
) {
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
  entries: payload,
  label,
  unit,
  accentColor = "#2563eb",
  showTotal = false,
  totalSeriesCount,
  totalLabel = "Total",
}: ChartTooltipProps) {
  const entries = (payload ?? []).filter(
    (entry) =>
      entry.value !== null && entry.value !== undefined && entry.hide !== true,
  );
  const numericValues = entries
    .map((entry) => entry.value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const canShowTotal =
    showTotal &&
    numericValues.length === entries.length &&
    (totalSeriesCount === undefined || entries.length === totalSeriesCount);

  if (!active || !entries.length) return null;

  return (
    <div
      role="tooltip"
      className={`pointer-events-none max-w-[18rem] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm ${chartBorderTopClass(accentColor)}`}
    >
      <p className="font-bold text-slate-950">{formatChartDate(label)}</p>
      <dl className="mt-2 space-y-1.5">
        {entries.map((entry, index) => (
          <div
            key={`${String(entry.dataKey)}-${index}`}
            className="flex items-center justify-between gap-4"
          >
            <dt className="flex min-w-0 items-center gap-2 text-slate-600">
              <i
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${chartColorClass(entry.color ?? accentColor)}`}
              />
              <span className="truncate">
                {String(entry.name ?? entry.dataKey ?? "Nilai")}
              </span>
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
          <span>
            {formatChartValue(
              numericValues.reduce((total, value) => total + value, 0),
            )}{" "}
            {unit}
          </span>
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
