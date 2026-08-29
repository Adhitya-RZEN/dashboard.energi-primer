import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type MonthlyConsumptionReport = {
  yearMonth: string;
  periodLabel: string;
  year: number;
  month: number;
  totalCoal: Prisma.Decimal | null;
  averageEfficiency: Prisma.Decimal | null;
  averageHeatRate: Prisma.Decimal | null;
  averageSfc: Prisma.Decimal | null;
  daysCount: number;
};

export type ConsumptionSummary = {
  grandTotalCoal: Prisma.Decimal | null;
  overallEfficiency: Prisma.Decimal | null;
  overallHeatRate: Prisma.Decimal | null;
  earliestDate: Date | null;
  latestDate: Date | null;
  totalDays: number;
};

/**
 * PostgreSQL aggregate equivalent of Laravel LaporanController@index.
 * `$queryRaw` is parameter-free here and the result shape is explicitly typed.
 */
export async function listMonthlyConsumptionReports(): Promise<
  MonthlyConsumptionReport[]
> {
  const rows = await prisma.$queryRaw<MonthlyConsumptionReport[]>(Prisma.sql`
    SELECT
      TO_CHAR(date, 'YYYY-MM') AS "yearMonth",
      TO_CHAR(date, 'TMMonth YYYY') AS "periodLabel",
      EXTRACT(YEAR FROM date)::int AS year,
      EXTRACT(MONTH FROM date)::int AS month,
      ROUND(SUM(coal_used)::numeric, 2) AS "totalCoal",
      ROUND(AVG(boiler_efficiency)::numeric, 2) AS "averageEfficiency",
      ROUND(AVG(heat_rate)::numeric, 0) AS "averageHeatRate",
      ROUND(AVG(sfc)::numeric, 2) AS "averageSfc",
      COUNT(DISTINCT date)::int AS "daysCount"
    FROM coal_consumption
    GROUP BY
      TO_CHAR(date, 'YYYY-MM'),
      TO_CHAR(date, 'TMMonth YYYY'),
      EXTRACT(YEAR FROM date),
      EXTRACT(MONTH FROM date)
    ORDER BY TO_CHAR(date, 'YYYY-MM') DESC
  `);

  return rows;
}

export async function getConsumptionSummary(): Promise<ConsumptionSummary> {
  const [summary] = await prisma.$queryRaw<ConsumptionSummary[]>(Prisma.sql`
    SELECT
      ROUND(SUM(coal_used)::numeric, 2) AS "grandTotalCoal",
      ROUND(AVG(boiler_efficiency)::numeric, 2) AS "overallEfficiency",
      ROUND(AVG(heat_rate)::numeric, 0) AS "overallHeatRate",
      MIN(date) AS "earliestDate",
      MAX(date) AS "latestDate",
      COUNT(DISTINCT date)::int AS "totalDays"
    FROM coal_consumption
  `);

  return summary;
}
