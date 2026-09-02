import "server-only";

import { cookies } from "next/headers";

import {
  getGoogleSheetsOverviewData,
  isGoogleSheetsOverviewConfigured,
} from "@/services/google-sheets-overview";
import { getPostgresOverviewData } from "@/services/overview-postgres";
import type {
  OverviewData,
  OverviewQuery,
} from "@/types/overview";

export function normalizeOverviewQuery(input: {
  month?: string;
  year?: string;
  day?: string;
}): OverviewQuery {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const monthValue = Number.parseInt(input.month ?? "", 10);
  const yearValue = Number.parseInt(input.year ?? "", 10);
  const dayValue =
    input.day === undefined || input.day === ""
      ? null
      : Number.parseInt(input.day, 10);
  const month = Number.isFinite(monthValue)
    ? Math.min(12, Math.max(1, monthValue))
    : now.getUTCMonth() + 1;
  const year = Number.isFinite(yearValue)
    ? Math.min(currentYear + 1, Math.max(2024, yearValue))
    : currentYear;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day =
    dayValue === null || !Number.isFinite(dayValue)
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

export async function getOverviewData(
  query: OverviewQuery,
): Promise<OverviewData> {
  const configuredSource = process.env.DASHBOARD_DATA_SOURCE?.trim().toLowerCase();
  const useGoogle = configuredSource === "google";

  if (useGoogle) {
    if (!isGoogleSheetsOverviewConfigured()) {
      throw new Error(
        "Google Sheets dashboard source is selected but its server configuration is incomplete.",
      );
    }
    return getGoogleSheetsOverviewData(query);
  }

  return getPostgresOverviewData(query);
}
