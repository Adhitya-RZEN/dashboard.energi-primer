import type { OverviewMetric } from "@/types/overview";
import Link from "next/link";
import type { Route } from "next";

type OverviewKpiCardProps = {
  title: string;
  subtitle: string;
  metric: OverviewMetric;
  label: string;
  href?: string;
  tone?: "green" | "blue" | "amber" | "violet";
};

const toneClasses = {
  green: { accent: "border-emerald-500", icon: "bg-emerald-50 text-emerald-700" },
  blue: { accent: "border-blue-600", icon: "bg-blue-50 text-blue-700" },
  amber: { accent: "border-amber-500", icon: "bg-amber-50 text-amber-700" },
  violet: { accent: "border-violet-600", icon: "bg-violet-50 text-violet-700" },
};

function formatNumber(value: number | null, decimals = 0) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
}

export function OverviewKpiCard({ title, subtitle, metric, label, href, tone = "blue" }: OverviewKpiCardProps) {
  const colors = toneClasses[tone];
  const card = (
    <article className={`flex min-h-40 flex-col rounded-2xl border border-t-4 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${colors.accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${colors.icon}`}>
          {metric.available ? "●" : "–"}
        </span>
      </div>
      <div className={`mt-auto flex items-baseline gap-2 pt-6 ${metric.available ? "" : "text-slate-400"}`}>
        <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">{formatNumber(metric.value)}</span>
        <span className="text-xs text-slate-500">{metric.unit}</span>
      </div>
      <p className="mt-2 truncate text-[11px] text-slate-500" title={label}>{label}</p>
    </article>
  );

  return href ? <Link href={href as Route} className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" aria-label={`Lihat detail ${title}`}>{card}</Link> : card;
}
