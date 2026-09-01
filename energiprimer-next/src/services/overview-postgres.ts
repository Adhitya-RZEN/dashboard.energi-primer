import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  addCalendarDays,
  calendarDateToUtcStart,
  constrainOverviewQuery,
  defaultFocusDateForMonth,
  getDashboardCutoffDate,
} from "../lib/dashboard-date";
import type {
  OverviewData,
  OverviewDailyPoint,
  OverviewHopRow,
  OverviewMetric,
  OverviewQuery,
  OverviewUnitValue,
} from "../types/overview";

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
const UNIT_NUMBERS = [1, 2, 3] as const;
type UnitNumber = (typeof UNIT_NUMBERS)[number];
type NumericValues = Array<number | null>;
type UnitValues = Record<UnitNumber, NumericValues>;

type DailyBucket = {
  coal: NumericValues;
  coalUnits: UnitValues;
  biomassUnits: UnitValues;
  solar: NumericValues;
  stock: NumericValues;
  hop: UnitValues;
  solarReceipt: NumericValues;
};

function toUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}

function dateLabel(value: string | null) {
  if (!value) return "Tidak ada tanggal tersedia";
  const [year, month, day] = value.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1]} ${year}`;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function sum(values: NumericValues) {
  const present = values.filter((value): value is number => value !== null);
  return present.length
    ? present.reduce((total, value) => total + value, 0)
    : null;
}

function unitNumber(
  name: string | null | undefined,
  code: string | null | undefined,
): UnitNumber | null {
  const identity = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  const match = identity.match(/(?:PLTU|UNIT)[\s-]*([123])\b/);
  return match ? (Number(match[1]) as UnitNumber) : null;
}

function emptyUnitValues(): UnitValues {
  return { 1: [], 2: [], 3: [] };
}

function emptyDailyBucket(): DailyBucket {
  return {
    coal: [],
    coalUnits: emptyUnitValues(),
    biomassUnits: emptyUnitValues(),
    solar: [],
    stock: [],
    hop: emptyUnitValues(),
    solarReceipt: [],
  };
}

function addValue(values: NumericValues, value: number | null) {
  values.push(value);
}

function fixedUnitValues(
  values: UnitValues,
): OverviewUnitValue[] {
  return UNIT_NUMBERS.map((number) => ({
    unit: `Unit ${number}`,
    value: sum(values[number]),
  }));
}

function metric(
  value: number | null,
  unit: string,
  source: string,
  note: string,
): OverviewMetric {
  return {
    value,
    unit,
    source,
    available: value !== null,
    note,
  };
}

function statusForHop(value: number) {
  if (value < 10) return { status: "danger" as const, label: "Kritis" };
  if (value < 15) return { status: "warning" as const, label: "Perhatian" };
  return { status: "success" as const, label: "Aman" };
}

function hasRows(rows: {
  coalConsumption: readonly unknown[];
  coalStock: readonly unknown[];
  coalReceipts: readonly unknown[];
  biomassReceipts: readonly unknown[];
  biomassConsumption: readonly unknown[];
  solarReceipts: readonly unknown[];
  solarConsumption: readonly unknown[];
  hopReadings: readonly unknown[];
}) {
  return [
    rows.coalConsumption,
    rows.coalStock,
    rows.coalReceipts,
    rows.biomassReceipts,
    rows.biomassConsumption,
    rows.solarReceipts,
    rows.solarConsumption,
    rows.hopReadings,
  ].some((items) => items.length > 0);
}

async function loadOverviewRows(query: OverviewQuery, cutoffDate: string) {
  const periodStart = toUtcDate(query.year, query.month, 1);
  const periodEnd = toUtcDate(query.year, query.month + 1, 1);
  const cutoffEnd = calendarDateToUtcStart(addCalendarDays(cutoffDate, 1));
  const visiblePeriodEnd =
    periodEnd.getTime() < cutoffEnd.getTime() ? periodEnd : cutoffEnd;

  const [
    coalConsumption,
    coalStock,
    coalReceipts,
    biomassReceipts,
    biomassConsumption,
    solarReceipts,
    solarConsumption,
    hopReadings,
    cumulativeSnapshots,
    target,
  ] = await Promise.all([
    prisma.coalConsumption.findMany({
      where: { date: { gte: periodStart, lt: visiblePeriodEnd } },
      orderBy: [{ date: "asc" }, { unit: { name: "asc" } }],
      select: {
        date: true,
        coalUsed: true,
        unit: { select: { name: true, code: true } },
      },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: periodStart, lt: visiblePeriodEnd } },
      orderBy: { date: "asc" },
      select: { date: true, received: true, closingStock: true },
    }),
    prisma.coalReceipt.findMany({
      where: { periodStart },
      orderBy: { periodStart: "asc" },
      select: { periodStart: true, quantityTon: true },
    }),
    prisma.biomassReceipt.findMany({
      where: { periodStart },
      orderBy: { supplierCode: "asc" },
      select: { periodStart: true, quantityTon: true },
    }),
    prisma.biomassConsumption.findMany({
      where: { readingDate: { gte: periodStart, lt: visiblePeriodEnd } },
      orderBy: [{ readingDate: "asc" }, { unit: { name: "asc" } }],
      select: {
        readingDate: true,
        quantityTon: true,
        unit: { select: { name: true, code: true } },
      },
    }),
    prisma.solarReceipt.findUnique({
      where: { periodStart },
      select: { periodStart: true, quantityLiter: true },
    }),
    prisma.solarConsumption.findMany({
      where: { readingDate: { gte: periodStart, lt: visiblePeriodEnd } },
      orderBy: { readingDate: "asc" },
      select: { readingDate: true, quantityLiter: true },
    }),
    prisma.hopReading.findMany({
      where: { readingDate: { gte: periodStart, lt: visiblePeriodEnd } },
      orderBy: [{ readingDate: "asc" }, { unit: { name: "asc" } }],
      select: {
        readingDate: true,
        hopDays: true,
        unit: { select: { name: true, code: true } },
      },
    }),
    prisma.biomassCumulativeSnapshot.findMany({
      where: { periodStart: { lte: periodStart } },
      orderBy: { periodStart: "desc" },
      take: 1,
      select: { periodStart: true, cumulativeTon: true },
    }),
    prisma.biomassTarget.findUnique({
      where: { targetYear: query.year },
      select: { targetYear: true, targetTon: true },
    }),
  ]);

  return {
    coalConsumption,
    coalStock,
    coalReceipts,
    biomassReceipts,
    biomassConsumption,
    solarReceipts: solarReceipts ? [solarReceipts] : [],
    solarConsumption,
    hopReadings,
    cumulativeSnapshots,
    target,
  };
}

async function findAvailableMonths(query: OverviewQuery, cutoffDate: string) {
  const start = toUtcDate(query.year, query.month - 12, 1);
  const end = toUtcDate(query.year, query.month + 1, 1);
  const cutoffEnd = calendarDateToUtcStart(addCalendarDays(cutoffDate, 1));
  const visibleEnd =
    end.getTime() < cutoffEnd.getTime() ? end : cutoffEnd;
  const [
    coalConsumption,
    coalStock,
    coalReceipts,
    biomassReceipts,
    biomassConsumption,
    solarReceipts,
    solarConsumption,
    hopReadings,
    cumulativeSnapshots,
  ] = await Promise.all([
    prisma.coalConsumption.findMany({
      where: { date: { gte: start, lt: visibleEnd } },
      select: { date: true },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: start, lt: visibleEnd } },
      select: { date: true },
    }),
    prisma.coalReceipt.findMany({
      where: { periodStart: { gte: start, lt: visibleEnd } },
      select: { periodStart: true },
    }),
    prisma.biomassReceipt.findMany({
      where: { periodStart: { gte: start, lt: visibleEnd } },
      select: { periodStart: true },
    }),
    prisma.biomassConsumption.findMany({
      where: { readingDate: { gte: start, lt: visibleEnd } },
      select: { readingDate: true },
    }),
    prisma.solarReceipt.findMany({
      where: { periodStart: { gte: start, lt: visibleEnd } },
      select: { periodStart: true },
    }),
    prisma.solarConsumption.findMany({
      where: { readingDate: { gte: start, lt: visibleEnd } },
      select: { readingDate: true },
    }),
    prisma.hopReading.findMany({
      where: { readingDate: { gte: start, lt: visibleEnd } },
      select: { readingDate: true },
    }),
    prisma.biomassCumulativeSnapshot.findMany({
      where: { periodStart: { gte: start, lt: visibleEnd } },
      select: { periodStart: true },
    }),
  ]);

  return [
    ...new Set([
      ...coalConsumption.map((row) => monthKey(row.date)),
      ...coalStock.map((row) => monthKey(row.date)),
      ...coalReceipts.map((row) => monthKey(row.periodStart)),
      ...biomassReceipts.map((row) => monthKey(row.periodStart)),
      ...biomassConsumption.map((row) => monthKey(row.readingDate)),
      ...solarReceipts.map((row) => monthKey(row.periodStart)),
      ...solarConsumption.map((row) => monthKey(row.readingDate)),
      ...hopReadings.map((row) => monthKey(row.readingDate)),
      ...cumulativeSnapshots.map((row) => monthKey(row.periodStart)),
    ]),
  ]
    .filter(
      (value) =>
        value <= `${query.year}-${String(query.month).padStart(2, "0")}`,
    )
    .sort();
}

function buildSeries(
  rows: Awaited<ReturnType<typeof loadOverviewRows>>,
  effectiveQuery: OverviewQuery,
): OverviewDailyPoint[] {
  const buckets = new Map<string, DailyBucket>();
  const bucketFor = (date: Date) => {
    const key = dateKey(date);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = emptyDailyBucket();
    buckets.set(key, created);
    return created;
  };

  for (const row of rows.coalConsumption) {
    const bucket = bucketFor(row.date);
    const value = decimalToNumber(row.coalUsed);
    addValue(bucket.coal, value);
    const number = unitNumber(row.unit.name, row.unit.code);
    if (number !== null) addValue(bucket.coalUnits[number], value);
  }
  for (const row of rows.biomassConsumption) {
    const bucket = bucketFor(row.readingDate);
    const value = decimalToNumber(row.quantityTon);
    const number = unitNumber(row.unit.name, row.unit.code);
    if (number !== null) addValue(bucket.biomassUnits[number], value);
  }
  for (const row of rows.solarConsumption) {
    const bucket = bucketFor(row.readingDate);
    addValue(bucket.solar, decimalToNumber(row.quantityLiter));
  }
  for (const row of rows.coalStock) {
    const bucket = bucketFor(row.date);
    addValue(bucket.stock, decimalToNumber(row.closingStock));
  }
  for (const row of rows.hopReadings) {
    const bucket = bucketFor(row.readingDate);
    const value = decimalToNumber(row.hopDays);
    const number = unitNumber(row.unit.name, row.unit.code);
    if (number !== null) addValue(bucket.hop[number], value);
  }

  const monthlySolarReceipt = decimalToNumber(
    rows.solarReceipts[0]?.quantityLiter,
  );
  if (monthlySolarReceipt !== null) {
    const firstDate = `${effectiveQuery.year}-${String(effectiveQuery.month).padStart(2, "0")}-01`;
    addValue(bucketFor(new Date(`${firstDate}T00:00:00.000Z`)).solarReceipt, monthlySolarReceipt);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => {
      const biomassUnit1 = sum(bucket.biomassUnits[1]);
      const biomassUnit2 = sum(bucket.biomassUnits[2]);
      const biomassUnit3 = sum(bucket.biomassUnits[3]);
      return {
        date,
        day: Number(date.slice(-2)),
        coal: sum(bucket.coal),
        biomass: sum([biomassUnit1, biomassUnit2, biomassUnit3]),
        coalUnit1: sum(bucket.coalUnits[1]),
        coalUnit2: sum(bucket.coalUnits[2]),
        coalUnit3: sum(bucket.coalUnits[3]),
        biomassUnit1,
        biomassUnit2,
        biomassUnit3,
        stock: sum(bucket.stock),
        hop1: sum(bucket.hop[1]),
        hop2: sum(bucket.hop[2]),
        hop3: sum(bucket.hop[3]),
        solar: sum(bucket.solar),
        solarReceipt: sum(bucket.solarReceipt),
      } satisfies OverviewDailyPoint;
    });
}

function focusDateFor(
  effectiveQuery: OverviewQuery,
  series: OverviewDailyPoint[],
  cutoffDate: string,
) {
  const requestedFocusKey = defaultFocusDateForMonth(
    effectiveQuery.year,
    effectiveQuery.month,
    effectiveQuery.day,
    cutoffDate,
  );
  if (!requestedFocusKey) return null;
  const availableDates = series.map((point) => point.date).sort();
  return availableDates.includes(requestedFocusKey)
    ? requestedFocusKey
    : ([...availableDates]
        .reverse()
        .find((value) => value <= requestedFocusKey) ??
      availableDates.at(-1) ??
      null);
}

function hopForDate(
  rows: Awaited<ReturnType<typeof loadOverviewRows>>["hopReadings"],
  focusDate: string | null,
): OverviewHopRow[] | null {
  if (!focusDate) return null;
  const values = emptyUnitValues();
  for (const row of rows) {
    if (dateKey(row.readingDate) !== focusDate) continue;
    const number = unitNumber(row.unit.name, row.unit.code);
    if (number !== null) addValue(values[number], decimalToNumber(row.hopDays));
  }
  const resolved = UNIT_NUMBERS.map((number) => sum(values[number]));
  if (resolved.some((value) => value === null)) return null;
  return UNIT_NUMBERS.map((number, index) => {
    const value = resolved[index] as number;
    return {
      unit: `Unit ${number}`,
      value,
      ...statusForHop(value),
    };
  });
}

export async function getPostgresOverviewData(
  query: OverviewQuery,
  dashboardCutoffDate = getDashboardCutoffDate(),
): Promise<OverviewData> {
  const constrainedQuery = constrainOverviewQuery(query, dashboardCutoffDate);
  let effectiveQuery = constrainedQuery;
  let rows = await loadOverviewRows(effectiveQuery, dashboardCutoffDate);
  let isFallback = false;

  if (!hasRows(rows)) {
    const fallbackMonth = (
      await findAvailableMonths(constrainedQuery, dashboardCutoffDate)
    ).at(-1);
    if (fallbackMonth) {
      effectiveQuery = {
        month: Number(fallbackMonth.slice(5)),
        year: Number(fallbackMonth.slice(0, 4)),
        day: null,
      };
      rows = await loadOverviewRows(effectiveQuery, dashboardCutoffDate);
      isFallback = true;
    }
  }

  const series = buildSeries(rows, effectiveQuery);
  const focusDate = focusDateFor(
    effectiveQuery,
    series,
    dashboardCutoffDate,
  );
  const focusPoint = series.find((point) => point.date === focusDate) ?? null;
  const focusConsumption = rows.biomassConsumption.filter(
    (row) => dateKey(row.readingDate) === focusDate,
  );
  const focusCoal = rows.coalConsumption.filter(
    (row) => dateKey(row.date) === focusDate,
  );
  const focusStock = rows.coalStock.find(
    (row) => dateKey(row.date) === focusDate,
  );
  const biomassReceipt = sum(
    rows.biomassReceipts.map((row) => decimalToNumber(row.quantityTon)),
  );
  const biomassConsumption = sum(
    rows.biomassConsumption.map((row) => decimalToNumber(row.quantityTon)),
  );
  const coalConsumption = sum(
    rows.coalConsumption.map((row) => decimalToNumber(row.coalUsed)),
  );
  const hasNormalizedCoalReceipt = rows.coalReceipts.length > 0;
  const coalReceipt = hasNormalizedCoalReceipt
    ? sum(rows.coalReceipts.map((row) => decimalToNumber(row.quantityTon)))
    : sum(rows.coalStock.map((row) => decimalToNumber(row.received)));
  const solarConsumption = sum(
    rows.solarConsumption.map((row) => decimalToNumber(row.quantityLiter)),
  );
  const solarReceipt = decimalToNumber(rows.solarReceipts[0]?.quantityLiter);
  const solarDaily = focusPoint?.solar ?? null;
  const stockValue = decimalToNumber(focusStock?.closingStock);
  const stockProgress =
    stockValue === null
      ? null
      : Math.min(100, Math.round((stockValue / STOCK_CAPACITY_TON) * 100));
  const cumulative = decimalToNumber(rows.cumulativeSnapshots[0]?.cumulativeTon);
  const target = decimalToNumber(rows.target?.targetTon);
  const progress =
    target !== null && cumulative !== null && target > 0
      ? Math.min(100, (cumulative / target) * 100)
      : null;
  const targetOverview =
    target !== null && cumulative !== null && progress !== null
      ? {
          target,
          cumulative,
          remaining: Math.max(0, target - cumulative),
          progress,
        }
      : null;

  return {
    query: constrainedQuery,
    period: {
      monthLabel: `${MONTH_NAMES[effectiveQuery.month - 1]} ${effectiveQuery.year}`,
      requestedMonthLabel: `${MONTH_NAMES[constrainedQuery.month - 1]} ${constrainedQuery.year}`,
      dashboardCutoffDate,
      isFallback,
      fallbackNotice: isFallback
        ? `Data ${MONTH_NAMES[constrainedQuery.month - 1]} ${constrainedQuery.year} belum tersedia. Menampilkan data terakhir: ${MONTH_NAMES[effectiveQuery.month - 1]} ${effectiveQuery.year}.`
        : null,
      focusDate,
      focusDateLabel: dateLabel(focusDate),
    },
    source: {
      label: "PostgreSQL normalized data",
      worksheetEquivalent: null,
      note: "Dashboard membaca Prisma/PostgreSQL. Google Sheets hanya digunakan oleh importer server-side dan bukan oleh komponen chart atau page.",
    },
    metrics: {
      biomassReceiptMonthly: metric(
        biomassReceipt,
        "ton",
        "biomass_receipts.quantity_ton (SUM periode)",
        "Total tujuh pemasok Biomassa dari tabel normalized.",
      ),
      biomassConsumptionMonthly: metric(
        biomassConsumption,
        "ton",
        "biomass_consumptions.quantity_ton (SUM periode)",
        "Agregat Unit 1, Unit 2, dan Unit 3 dari tabel normalized.",
      ),
      coalConsumptionMonthly: metric(
        coalConsumption,
        "ton",
        "coal_consumption.coal_used (SUM periode)",
        "Data batubara existing PostgreSQL.",
      ),
      coalStock: {
        ...metric(
          stockValue,
          "ton",
          "coal_stock.closing_stock (tanggal fokus)",
          "Data stok batubara existing PostgreSQL.",
        ),
        progressPercent: stockProgress,
      },
      solarConsumptionDaily: metric(
        solarDaily,
        "liter",
        "solar_consumptions.quantity_liter (tanggal fokus)",
        "Data solar harian dari tabel normalized.",
      ),
      solarConsumptionMonthly: metric(
        solarConsumption,
        "liter",
        "solar_consumptions.quantity_liter (SUM periode)",
        "Data solar bulanan dari tabel normalized.",
      ),
      solarReceiptMonthly: metric(
        solarReceipt,
        "liter",
        "solar_receipts.quantity_liter (periode)",
        "Receipt solar disimpan pada grain periode sesuai source import.",
      ),
      biomassCumulative: metric(
        cumulative,
        "ton",
        "biomass_cumulative_snapshots.cumulative_ton (snapshot terakhir)",
        "Snapshot kumulatif terakhir sampai periode efektif.",
      ),
      biomassTargetProgress: metric(
        progress,
        "%",
        "biomass_cumulative_snapshots / biomass_targets",
        "Formula existing: min(100, cumulative / target × 100). Target 2026 berasal dari record 70020 ton.",
      ),
      coalReceiptMonthly: metric(
        coalReceipt,
        "ton",
        hasNormalizedCoalReceipt
          ? "coal_receipts.quantity_ton (SUM periode)"
          : "coal_stock.received (SUM periode; fallback legacy)",
        hasNormalizedCoalReceipt
          ? "Data penerimaan batubara dari tabel normalized pada grain periode."
          : "Periode belum memiliki baris normalized; memakai data coal_stock existing.",
      ),
    },
    biomassDaily: fixedUnitValues(
      Object.fromEntries(
        UNIT_NUMBERS.map((number) => [
          number,
          focusConsumption
            .filter(
              (row) => unitNumber(row.unit.name, row.unit.code) === number,
            )
            .map((row) => decimalToNumber(row.quantityTon)),
        ]),
      ) as UnitValues,
    ),
    coalDaily: fixedUnitValues(
      Object.fromEntries(
        UNIT_NUMBERS.map((number) => [
          number,
          focusCoal
            .filter(
              (row) => unitNumber(row.unit.name, row.unit.code) === number,
            )
            .map((row) => decimalToNumber(row.coalUsed)),
        ]),
      ) as UnitValues,
    ),
    hop: hopForDate(rows.hopReadings, focusDate),
    target: targetOverview,
    series,
    hasData: hasRows(rows),
  };
}

export function isPostgresOverviewConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
