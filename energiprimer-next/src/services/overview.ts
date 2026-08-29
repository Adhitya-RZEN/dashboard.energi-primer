import "server-only";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { getGoogleSheetsOverviewData, isGoogleSheetsOverviewConfigured } from "@/services/google-sheets-overview";
import type { OverviewData, OverviewMetric, OverviewQuery, OverviewUnitValue } from "@/types/overview";

const MONTH_NAMES = [
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
] as const;

const STOCK_CAPACITY_TON = 70_000;

function toUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string | null) {
  if (!value) return "Tidak ada tanggal tersedia";
  const [year, month, day] = value.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1]} ${year}`;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function sum(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

function unitLabel(name: string | null | undefined, code: string | null | undefined) {
  return name?.trim() || code?.trim() || "Unit";
}

async function loadOverviewRows(query: OverviewQuery) {
  const periodStart = toUtcDate(query.year, query.month, 1);
  const periodEnd = toUtcDate(query.year, query.month + 1, 1);

  return Promise.all([
    prisma.coalConsumption.findMany({
      where: { date: { gte: periodStart, lt: periodEnd } },
      orderBy: [{ date: "asc" }, { unit: { name: "asc" } }],
      select: {
        date: true,
        coalUsed: true,
        unit: { select: { name: true, code: true } },
      },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: periodStart, lt: periodEnd } },
      orderBy: { date: "asc" },
      select: { date: true, received: true, closingStock: true },
    }),
  ]);
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}

export function normalizeOverviewQuery(input: {
  month?: string;
  year?: string;
  day?: string;
}): OverviewQuery {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const monthValue = Number.parseInt(input.month ?? "", 10);
  const yearValue = Number.parseInt(input.year ?? "", 10);
  const dayValue = input.day === undefined || input.day === "" ? null : Number.parseInt(input.day, 10);
  const month = Number.isFinite(monthValue) ? Math.min(12, Math.max(1, monthValue)) : now.getUTCMonth() + 1;
  const year = Number.isFinite(yearValue) ? Math.min(currentYear + 1, Math.max(2024, yearValue)) : currentYear;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = dayValue === null || !Number.isFinite(dayValue)
    ? null
    : Math.min(daysInMonth, Math.max(1, dayValue));

  return { month, year, day };
}

export async function getPersistedOverviewQuery(input: {
  month?: string;
  year?: string;
  day?: string;
  reset?: string;
}): Promise<OverviewQuery> {
  if (input.reset === "1") return normalizeOverviewQuery({});

  const cookieStore = await cookies();
  return normalizeOverviewQuery({
    month: input.month ?? cookieStore.get("dashboard_filter_month")?.value,
    year: input.year ?? cookieStore.get("dashboard_filter_year")?.value,
    day: input.day ?? cookieStore.get("dashboard_filter_day")?.value,
  });
}

function unavailableMetric(unit: string, note: string): OverviewMetric {
  return {
    value: null,
    unit,
    source: "Tidak tersedia di PostgreSQL existing",
    available: false,
    note,
  };
}

async function getPostgresOverviewData(query: OverviewQuery): Promise<OverviewData> {
  let effectiveQuery = query;
  let [consumptionRows, stockRows] = await loadOverviewRows(effectiveQuery);
  let isFallback = false;

  if (consumptionRows.length === 0 && stockRows.length === 0) {
    const fallbackStart = toUtcDate(query.year, query.month - 12, 1);
    const fallbackEnd = toUtcDate(query.year, query.month + 1, 1);
    const [fallbackConsumption, fallbackStock] = await Promise.all([
      prisma.coalConsumption.findMany({
        where: { date: { gte: fallbackStart, lt: fallbackEnd } },
        select: { date: true },
      }),
      prisma.coalStock.findMany({
        where: { date: { gte: fallbackStart, lt: fallbackEnd } },
        select: { date: true },
      }),
    ]);
    const availableMonths = [...new Set([
      ...fallbackConsumption.map((row) => monthKey(row.date)),
      ...fallbackStock.map((row) => monthKey(row.date)),
    ])].filter((value) => value <= `${query.year}-${String(query.month).padStart(2, "0")}`).sort();
    const fallbackMonth = availableMonths.at(-1);

    if (fallbackMonth) {
      effectiveQuery = { month: Number(fallbackMonth.slice(5)), year: Number(fallbackMonth.slice(0, 4)), day: null };
      [consumptionRows, stockRows] = await loadOverviewRows(effectiveQuery);
      isFallback = true;
    }
  }

  const requestedFocusKey = dateKey(toUtcDate(effectiveQuery.year, effectiveQuery.month, effectiveQuery.day ?? new Date().getUTCDate()));
  const availableDates = [...new Set([
    ...consumptionRows.map((row) => dateKey(row.date)),
    ...stockRows.map((row) => dateKey(row.date)),
  ])].sort();
  const focusDate = availableDates.includes(requestedFocusKey)
    ? requestedFocusKey
    : [...availableDates].reverse().find((value) => value <= requestedFocusKey) ?? availableDates.at(-1) ?? null;

  const monthlyCoal = sum(consumptionRows.map((row) => decimalToNumber(row.coalUsed))) ?? 0;
  const monthlyReceived = sum(stockRows.map((row) => decimalToNumber(row.received))) ?? 0;
  const focusConsumption = consumptionRows.filter((row) => dateKey(row.date) === focusDate);
  const focusStock = stockRows.find((row) => dateKey(row.date) === focusDate);

  const unitValues = new Map<string, number | null>();
  for (const row of focusConsumption) {
    const label = unitLabel(row.unit.name, row.unit.code);
    const current = unitValues.get(label) ?? null;
    const value = decimalToNumber(row.coalUsed);
    unitValues.set(label, current === null ? value : current + (value ?? 0));
  }

  const dailyMap = new Map<string, number | null>();
  for (const row of consumptionRows) {
    const key = dateKey(row.date);
    const value = decimalToNumber(row.coalUsed);
    const current = dailyMap.get(key) ?? null;
    dailyMap.set(key, current === null ? value : current + (value ?? 0));
  }

  const stockValue = decimalToNumber(focusStock?.closingStock);
  const stockProgress = stockValue === null ? null : Math.min(100, Math.round((stockValue / STOCK_CAPACITY_TON) * 100));
  const coalDaily: OverviewUnitValue[] = [...unitValues.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([unit, value]) => ({ unit, value }));

  return {
    query,
    period: {
      monthLabel: `${MONTH_NAMES[effectiveQuery.month - 1]} ${effectiveQuery.year}`,
      requestedMonthLabel: `${MONTH_NAMES[query.month - 1]} ${query.year}`,
      isFallback,
      fallbackNotice: isFallback
        ? `Data ${MONTH_NAMES[query.month - 1]} ${query.year} belum tersedia. Menampilkan data terakhir: ${MONTH_NAMES[effectiveQuery.month - 1]} ${effectiveQuery.year}.`
        : null,
      focusDate,
      focusDateLabel: dateLabel(focusDate),
    },
    source: {
      label: "PostgreSQL existing",
      worksheetEquivalent: null,
      note: "Metrik biomassa, solar, HOP, dan target biomassa tetap unavailable karena tidak ada padanan kolom pada schema PostgreSQL.",
    },
    metrics: {
      biomassReceiptMonthly: unavailableMetric("ton", "Laravel mengambil S52 dari Google Sheets."),
      biomassConsumptionMonthly: unavailableMetric("ton", "Laravel menghitung SUM(J42:Q42) dari Google Sheets."),
      coalConsumptionMonthly: {
        value: monthlyCoal,
        unit: "ton",
        source: "coal_consumption.coal_used (SUM periode)",
        available: consumptionRows.length > 0,
        note: "Padanan PostgreSQL; source Laravel Overview adalah kolom AB42 Google Sheets.",
      },
      coalStock: {
        value: stockValue,
        unit: "ton",
        source: "coal_stock.closing_stock (tanggal fokus)",
        available: stockValue !== null,
        progressPercent: stockProgress,
        note: "Padanan PostgreSQL; source Laravel Overview adalah kolom AD pada baris harian.",
      },
      solarConsumptionDaily: unavailableMetric("liter", "Laravel mengambil CJ dari baris harian Google Sheets."),
      solarConsumptionMonthly: unavailableMetric("liter", "Laravel mengambil CJ42 dari Google Sheets."),
      solarReceiptMonthly: unavailableMetric("liter", "Laravel mengambil CC42 dari Google Sheets."),
      biomassCumulative: unavailableMetric("ton", "Laravel mengambil CO row 59 dari Google Sheets."),
      biomassTargetProgress: unavailableMetric("%", "Laravel memakai target CO row 56 dan realisasi CO row 59."),
      coalReceiptMonthly: {
        value: monthlyReceived,
        unit: "ton",
        source: "coal_stock.received (SUM periode)",
        available: stockRows.length > 0,
        note: "Padanan PostgreSQL; source Laravel Overview adalah kolom I42 Google Sheets.",
      },
    },
    biomassDaily: [],
    coalDaily,
    hop: null,
    target: null,
    series: [...dailyMap.entries()].map(([date, coal]) => ({
      date,
      day: Number(date.slice(-2)),
      coal,
      biomass: null,
      coalUnit1: null,
      coalUnit2: null,
      coalUnit3: null,
      biomassUnit1: null,
      biomassUnit2: null,
      biomassUnit3: null,
      stock: null,
      hop1: null,
      hop2: null,
      hop3: null,
      solar: null,
      solarReceipt: null,
    })),
    hasData: consumptionRows.length > 0 || stockRows.length > 0,
  };
}

export async function getOverviewData(query: OverviewQuery): Promise<OverviewData> {
  if (isGoogleSheetsOverviewConfigured()) {
    return getGoogleSheetsOverviewData(query);
  }

  return getPostgresOverviewData(query);
}
