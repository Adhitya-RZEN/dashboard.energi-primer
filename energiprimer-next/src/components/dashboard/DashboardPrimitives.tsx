import type { ReactNode } from "react";
import Link from "next/link";
import type { OverviewData } from "@/types/overview";
import { getDashboardTheme, type DashboardThemeKey } from "./dashboard-themes";

export function DashboardSectionHeading({ eyebrow, title, description, themeKey = "overview" }: { eyebrow: string; title: string; description?: string; themeKey?: DashboardThemeKey }) {
  const theme = getDashboardTheme(`/dashboard/${themeKey === "overview" ? "" : themeKey}`);
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${theme.text}`}>{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}

export function DashboardPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5 ${className}`}>{children}</div>;
}

export function DashboardChartPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <DashboardPanel className="min-w-0 overflow-hidden">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </DashboardPanel>
  );
}

export function DashboardDataStatus({ data }: { data: OverviewData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-950 sm:px-5">
      <span><strong>Sumber aktif:</strong> {data.source.label}{data.source.worksheetEquivalent ? ` · ${data.source.worksheetEquivalent}` : ""}</span>
      <span className="font-semibold">Periode {data.period.monthLabel}</span>
      <span className="w-full text-blue-900/70">{data.source.note}</span>
    </div>
  );
}

export function DashboardPageHeader({ title, description, themeKey = "overview" }: { title: string; description: string; themeKey?: DashboardThemeKey }) {
  const theme = getDashboardTheme(`/dashboard/${themeKey === "overview" ? "" : themeKey}`);
  return (
    <header>
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs text-slate-500"><Link className="transition hover:text-slate-900" href="/dashboard">Dashboard</Link><span aria-hidden="true">/</span><span className={`font-semibold ${theme.text}`}>{theme.label}</span></nav>
      <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${theme.text}`}>{theme.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </header>
  );
}

export function DashboardWarning({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="status"><span aria-hidden="true" className="mr-2">⚠</span>{children}</div>;
}
