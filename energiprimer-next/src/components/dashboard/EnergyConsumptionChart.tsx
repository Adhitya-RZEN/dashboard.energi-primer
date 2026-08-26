"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
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

type EnergyConsumptionChartProps = {
  series: OverviewDailyPoint[];
};

const DATASETS: ChartDataset[] = [
  { key: "coal", label: "Batubara", color: "#2563eb" },
  { key: "biomass", label: "Biomassa", color: "#16a34a" },
];

function ChartEmptyState() {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      Tidak ada data konsumsi untuk divisualisasikan.
    </div>
  );
}

export function EnergyConsumptionChart({ series }: EnergyConsumptionChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hasData = series.some((point) => point.coal !== null || point.biomass !== null);

  if (!hasData) return <ChartEmptyState />;

  const visible = DATASETS.filter((dataset) => !hidden.has(dataset.key));
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
    <div className="space-y-2">
      <ChartLegend
        datasets={DATASETS}
        hidden={hidden}
        onToggle={(key) => setHidden((current) => toggleChartSeries(current, key, DATASETS.length))}
      />
      <ChartFrame label="Grafik konsumsi energi primer harian">
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
            content={<DashboardChartTooltip unit="ton" accentColor="#2563eb" />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
            filterNull
            isAnimationActive={false}
          />
          {hoveredDate ? <ReferenceLine x={hoveredDate} stroke="#94a3b8" strokeDasharray="3 3" /> : null}
          <Line
            hide={hidden.has("coal")}
            type="monotone"
            dataKey="coal"
            name="Batubara"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            hide={hidden.has("biomass")}
            type="monotone"
            dataKey="biomass"
            name="Biomassa"
            stroke="#16a34a"
            strokeWidth={2.5}
            dot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartFrame>
      {selected ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" aria-live="polite">
          <strong className="text-slate-950">{formatChartDate(selected.date)}</strong>
          {visible.map((dataset) => {
            const value = selected[dataset.key as "coal" | "biomass"];
            return value === null || value === undefined ? null : (
              <span key={dataset.key}>
                {dataset.label}: <strong className="text-slate-950">{formatChartValue(value)} ton</strong>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="px-2 text-[11px] text-slate-400">Arahkan atau tap titik data untuk melihat detail.</p>
      )}
    </div>
  );
}
