"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState, useTransition } from "react";

import type { OverviewData } from "@/types/overview";
import { maxVisibleDayForMonth } from "@/lib/dashboard-date";

import { getDashboardTheme, type DashboardThemeKey } from "./dashboard-themes";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function DashboardFilter({
  data,
  action,
  themeKey = "overview",
}: {
  data: OverviewData;
  action: string;
  themeKey?: DashboardThemeKey;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedYear, setSelectedYear] = useState(String(data.query.year));
  const [selectedMonth, setSelectedMonth] = useState(
    String(data.query.month).padStart(2, "0"),
  );
  const [selectedDay, setSelectedDay] = useState(
    data.query.day === null ? "" : String(data.query.day),
  );
  const theme = getDashboardTheme(
    `/dashboard/${themeKey === "overview" ? "" : themeKey}`,
  );
  const cutoffDate = data.period.dashboardCutoffDate;
  const cutoffYear = Number(cutoffDate.slice(0, 4));
  const cutoffMonth = Number(cutoffDate.slice(5, 7));
  const selectedYearNumber = Number(selectedYear) || data.query.year;
  const selectedMonthNumber = Number(selectedMonth) || data.query.month;
  const days = maxVisibleDayForMonth(
    selectedYearNumber,
    selectedMonthNumber,
    cutoffDate,
  );
  const months = MONTHS.map((month, index) => [month, index] as const).filter(
    ([, index]) =>
      selectedYearNumber < cutoffYear || index + 1 <= cutoffMonth,
  );
  const years = Array.from(
    { length: Math.max(0, cutoffYear - 2024 + 1) },
    (_, index) => cutoffYear - index,
  );

  function changeYear(value: string) {
    const nextYear = Number(value);
    setSelectedYear(value);
    const maxMonth = nextYear === cutoffYear ? cutoffMonth : 12;
    if (selectedMonthNumber > maxMonth) {
      setSelectedMonth(String(maxMonth).padStart(2, "0"));
      setSelectedDay("");
    }
  }

  function changeMonth(value: string) {
    setSelectedMonth(value);
    const nextDays = maxVisibleDayForMonth(
      selectedYearNumber,
      Number(value),
      cutoffDate,
    );
    if (selectedDay !== "" && Number(selectedDay) > nextDays) {
      setSelectedDay("");
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) params.set(key, value);
    }
    startTransition(() =>
      router.push(`${action}?${params.toString()}` as Route, { scroll: false }),
    );
  }

  function reset() {
    startTransition(() =>
      router.push(`${action}?reset=1` as Route, { scroll: false }),
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Filter periode"
      aria-busy={isPending}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-2 min-w-24 pb-2">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.16em] ${theme.text}`}
          >
            Periode
          </p>
          <p className="mt-1 text-xs text-slate-500">Pilih rentang data</p>
        </div>
        <label className="flex min-w-28 flex-1 flex-col gap-1 text-xs font-semibold text-slate-500 sm:flex-none">
          Tanggal
          <select
            name="day"
            value={selectedDay}
            onChange={(event) => setSelectedDay(event.target.value)}
            className={`rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-current focus:ring-2 ${theme.text} ${theme.ring}`}
          >
            <option value="">Semua tanggal</option>
            {Array.from({ length: days }, (_, index) => index + 1).map(
              (day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs font-semibold text-slate-500 sm:flex-none">
          Bulan
          <select
            name="month"
            value={selectedMonth}
            onChange={(event) => changeMonth(event.target.value)}
            className={`rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-current focus:ring-2 ${theme.text} ${theme.ring}`}
          >
            {months
              .map(([month, index]) => (
                <option key={month} value={String(index + 1).padStart(2, "0")}>
                  {month}
                </option>
              ))}
          </select>
        </label>
        <label className="flex min-w-24 flex-1 flex-col gap-1 text-xs font-semibold text-slate-500 sm:flex-none">
          Tahun
          <select
            name="year"
            value={selectedYear}
            onChange={(event) => changeYear(event.target.value)}
            className={`rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-current focus:ring-2 ${theme.text} ${theme.ring}`}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={isPending}
          className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${theme.solid} ${theme.solidHover} ${theme.ring}`}
          type="submit"
        >
          {isPending ? "Memuat…" : "Terapkan Filter"}
        </button>
        <button
          disabled={isPending}
          className={`rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${theme.ring}`}
          type="button"
          onClick={reset}
        >
          Reset
        </button>
        <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
          Data fokus:{" "}
          <strong className="text-slate-700">
            {data.period.focusDateLabel}
          </strong>
        </span>
      </div>
      {isPending ? (
        <p className="mt-3 text-xs font-medium text-slate-500" role="status">
          Memperbarui data tanpa memuat ulang shell dashboard…
        </p>
      ) : null}
    </form>
  );
}
