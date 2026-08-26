"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
  type TooltipPayloadEntry,
} from "recharts";

import type { OverviewDailyPoint } from "@/types/overview";

import {
  ChartFrame,
  ChartLegend,
  DashboardChartTooltip,
  chartDateFromState,
  formatChartDate,
  formatChartValue,
  toggleChartSeries,
  xAxisTickInterval,
  type ChartDataset,
} from "./InteractiveChartPrimitives";

type SeriesKey =
  | "biomass"
  | "coal"
  | "stock"
  | "solar"
  | "solarReceipt"
  | "hop1"
  | "hop2"
  | "hop3"
  | "coalUnit1"
  | "coalUnit2"
  | "coalUnit3"
  | "biomassUnit1"
  | "biomassUnit2"
  | "biomassUnit3";

type Dataset = ChartDataset & { key: SeriesKey };
type ReferenceLineConfig = { value: number; label: string; color: string };
type DetailLineChartProps = {
  series: OverviewDailyPoint[];
  dataKey: SeriesKey;
  label: string;
  unit: string;
  color: string;
  referenceLines?: ReferenceLineConfig[];
};
type DetailMultiLineChartProps = {
  series: OverviewDailyPoint[];
  datasets: Dataset[];
  unit: string;
  referenceLines?: ReferenceLineConfig[];
};
type DetailBarChartProps = {
  series: OverviewDailyPoint[];
  datasets: Dataset[];
  unit: string;
  stacked?: boolean;
};

function valueFor(point: OverviewDailyPoint, key: SeriesKey) {
  const value = point[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      {message}
    </div>
  );
}

function ChartHint({ children }: { children: string }) {
  return <p className="mt-2 px-2 text-[11px] text-slate-400">{children}</p>;
}

function ChartReferenceLines({ lines }: { lines: ReferenceLineConfig[] }) {
  return (
    <>
      {lines.map((line) => (
        <ReferenceLine
          key={line.label}
          y={line.value}
          stroke={line.color}
          strokeDasharray="6 4"
          label={line.label}
        />
      ))}
    </>
  );
}

function SelectedDateLine({
  date,
  values,
}: {
  date: string;
  values: Array<{ label: string; value: number | null; unit: string; color?: string }>;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" aria-live="polite">
      <strong className="text-slate-950">{formatChartDate(date)}</strong>
      {values.map((item) => item.value === null ? null : (
        <span key={item.label}>
          {item.label}: <strong className="text-slate-950">{formatChartValue(item.value)} {item.unit}</strong>
        </span>
      ))}
    </div>
  );
}

export function DetailLineChart({
  series,
  dataKey,
  label,
  unit,
  color,
  referenceLines = [],
}: DetailLineChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const hasValue = series.some((point) => valueFor(point, dataKey) !== null);

  if (!hasValue) return <EmptyChart message={`Tidak ada data ${label.toLowerCase()} untuk divisualisasikan.`} />;

  const selected = selectedDate ? series.find((point) => point.date === selectedDate) : null;

  function handleMove(state: MouseHandlerDataParam) {
    setHoveredDate(chartDateFromState(state, series));
  }

  function handleClick(state: MouseHandlerDataParam) {
    const date = chartDateFromState(state, series);
    if (!date) return;
    setSelectedDate(date);
    setHoveredDate(date);
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 sm:p-3">
      <div className="mb-2 flex items-center justify-end gap-2 px-2 text-xs text-slate-600">
        <i aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <ChartFrame label={`Grafik ${label}`}>
        <LineChart
          data={series}
          margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
          accessibilityLayer
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredDate(null)}
          onClick={handleClick}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            interval={xAxisTickInterval(series.length)}
            minTickGap={16}
            tickFormatter={(value) => String(value).slice(-2)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            tickFormatter={(value) => formatChartValue(value, 0)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            width={54}
          />
          <Tooltip
            content={<DashboardChartTooltip unit={unit} accentColor={color} />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
            filterNull
            isAnimationActive={false}
          />
          <ChartReferenceLines lines={referenceLines} />
          {hoveredDate ? <ReferenceLine x={hoveredDate} stroke="#94a3b8" strokeDasharray="3 3" /> : null}
          <Line
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartFrame>
      {selected ? (
        <SelectedDateLine
          date={selected.date}
          values={[{ label, value: valueFor(selected, dataKey), unit }]}
        />
      ) : (
        <ChartHint>Arahkan atau tap titik data untuk melihat detail.</ChartHint>
      )}
    </div>
  );
}

export function DetailMultiLineChart({
  series,
  datasets,
  unit,
  referenceLines = [],
}: DetailMultiLineChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const visible = datasets.filter((dataset) => !hiddenKeys.has(dataset.key));
  const hasValue = visible.some((dataset) => series.some((point) => valueFor(point, dataset.key) !== null));

  if (!hasValue) return <EmptyChart message="Pilih minimal satu series untuk divisualisasikan." />;

  const selected = selectedDate ? series.find((point) => point.date === selectedDate) : null;
  const accentColor = visible[0]?.color ?? "#4f46e5";

  function handleMove(state: MouseHandlerDataParam) {
    setHoveredDate(chartDateFromState(state, series));
  }

  function handleClick(state: MouseHandlerDataParam) {
    const date = chartDateFromState(state, series);
    if (!date) return;
    setSelectedDate(date);
    setHoveredDate(date);
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 sm:p-3">
      <ChartLegend
        datasets={datasets}
        hidden={hiddenKeys}
        onToggle={(key) => setHiddenKeys((current) => toggleChartSeries(current, key, datasets.length))}
      />
      <ChartFrame label="Grafik multi-series">
        <LineChart
          data={series}
          margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
          accessibilityLayer
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredDate(null)}
          onClick={handleClick}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            interval={xAxisTickInterval(series.length)}
            minTickGap={16}
            tickFormatter={(value) => String(value).slice(-2)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            tickFormatter={(value) => formatChartValue(value, 0)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            width={54}
          />
          <Tooltip
            content={<DashboardChartTooltip unit={unit} accentColor={accentColor} />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
            filterNull
            isAnimationActive={false}
          />
          <ChartReferenceLines lines={referenceLines} />
          {hoveredDate ? <ReferenceLine x={hoveredDate} stroke="#94a3b8" strokeDasharray="3 3" /> : null}
          {visible.map((dataset) => (
            <Line
              key={dataset.key}
              type="monotone"
              dataKey={dataset.key}
              name={dataset.label}
              stroke={dataset.color}
              strokeWidth={2.5}
              dot={{ r: 2.5, stroke: "#fff", strokeWidth: 1 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartFrame>
      {selected ? (
        <SelectedDateLine
          date={selected.date}
          values={visible.map((dataset) => ({ label: dataset.label, value: valueFor(selected, dataset.key), unit }))}
        />
      ) : (
        <ChartHint>Arahkan atau tap titik data untuk melihat detail.</ChartHint>
      )}
    </div>
  );
}

export function DetailBarChart({
  series,
  datasets,
  unit,
  stacked = false,
}: DetailBarChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const visible = datasets.filter((dataset) => !hiddenKeys.has(dataset.key));
  const hasValue = visible.some((dataset) => series.some((point) => valueFor(point, dataset.key) !== null));

  if (!hasValue) return <EmptyChart message="Pilih minimal satu series untuk divisualisasikan." />;

  const selected = selectedDate ? series.find((point) => point.date === selectedDate) : null;
  const accentColor = visible[0]?.color ?? "#2563eb";
  const selectedTotal = selected && stacked && visible.every((dataset) => valueFor(selected, dataset.key) !== null)
    ? visible.reduce((total, dataset) => total + (valueFor(selected, dataset.key) ?? 0), 0)
    : null;

  function handleMove(state: MouseHandlerDataParam) {
    setHoveredDate(chartDateFromState(state, series));
  }

  function handleClick(state: MouseHandlerDataParam) {
    const date = chartDateFromState(state, series);
    if (!date) return;
    setSelectedDate(date);
    setHoveredDate(date);
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 sm:p-3">
      <ChartLegend
        datasets={datasets}
        hidden={hiddenKeys}
        onToggle={(key) => setHiddenKeys((current) => toggleChartSeries(current, key, datasets.length))}
      />
      <ChartFrame label={`Grafik ${datasets.map((dataset) => dataset.label).join(", ")}`}>
        <BarChart
          data={series}
          margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
          barCategoryGap="18%"
          barGap={2}
          accessibilityLayer
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredDate(null)}
          onClick={handleClick}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            interval={xAxisTickInterval(series.length)}
            minTickGap={16}
            tickFormatter={(value) => String(value).slice(-2)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            tickFormatter={(value) => formatChartValue(value, 0)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            width={54}
          />
          <Tooltip
            content={
              <DashboardChartTooltip
                unit={unit}
                accentColor={accentColor}
                showTotal={stacked}
                totalSeriesCount={visible.length}
              />
            }
            cursor={{ fill: "#f8fafc" }}
            filterNull
            shared
            isAnimationActive={false}
          />
          {hoveredDate ? <ReferenceLine x={hoveredDate} stroke="#94a3b8" strokeDasharray="3 3" /> : null}
          {visible.map((dataset) => (
            <Bar
              key={dataset.key}
              dataKey={dataset.key}
              name={dataset.label}
              fill={dataset.color}
              stackId={stacked ? "total" : undefined}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              activeBar={{ stroke: "#0f172a", strokeWidth: 1.5, fill: dataset.color }}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartFrame>
      {selected ? (
        <SelectedDateLine
          date={selected.date}
          values={[
            ...visible.map((dataset) => ({ label: dataset.label, value: valueFor(selected, dataset.key), unit })),
            ...(selectedTotal === null ? [] : [{ label: "Total", value: selectedTotal, unit }]),
          ]}
        />
      ) : (
        <ChartHint>Arahkan atau tap bar untuk melihat detail.</ChartHint>
      )}
    </div>
  );
}

function TargetProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
}) {
  const entry = payload?.[0];
  if (!active || !entry || typeof entry.value !== "number") return null;

  return (
    <div className="pointer-events-none rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-bold text-slate-950">{String(entry.name ?? "Progress")}</p>
      <p className="mt-1 font-bold text-violet-700">{formatChartValue(entry.value)}%</p>
    </div>
  );
}

export function TargetProgressChart({ progress }: { progress: number }) {
  const safeProgress = Math.min(100, Math.max(0, progress));
  const progressColor = safeProgress >= 100 ? "#16a34a" : safeProgress >= 70 ? "#f59e0b" : "#7c3aed";
  const progressData = [
    { name: "Tercapai", value: safeProgress, color: progressColor },
    { name: "Sisa", value: 100 - safeProgress, color: "#e2e8f0" },
  ];

  return (
    <div
      className="relative h-64 min-h-64 w-full min-w-0"
      role="img"
      aria-label={`Progress target ${safeProgress.toLocaleString("id-ID", { maximumFractionDigits: 1 })} persen`}
    >
      <ResponsiveContainer
        width="100%"
        height={256}
        minWidth={0}
        initialDimension={{ width: 320, height: 256 }}
      >
        <PieChart>
          <Pie
            data={progressData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="66%"
            outerRadius="88%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            stroke="none"
            isAnimationActive={false}
          >
            {progressData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<TargetProgressTooltip />} isAnimationActive={false} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-2xl font-bold text-slate-900">
          {safeProgress.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
        </strong>
        <span className="text-[10px] text-slate-500">tercapai</span>
      </div>
    </div>
  );
}
