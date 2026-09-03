import "server-only";

import { cookies } from "next/headers";

import {
  getGoogleSheetsOverviewData,
  isGoogleSheetsOverviewConfigured,
} from "@/services/google-sheets-overview";
import { getPostgresOverviewData } from "@/services/overview-postgres";
import {
  constrainOverviewQuery,
  defaultOverviewQuery,
  getDashboardCutoffDate,
} from "@/lib/dashboard-date";
import type {
  OverviewData,
  OverviewQuery,
} from "@/types/overview";

export function normalizeOverviewQuery(input: {
  month?: string;
  year?: string;
  day?: string;
}): OverviewQuery {
  const cutoffDate = getDashboardCutoffDate();
  const defaultQuery = defaultOverviewQuery(cutoffDate);
  const monthValue = Number.parseInt(input.month ?? "", 10);
  const yearValue = Number.parseInt(input.year ?? "", 10);
  const dayValue =
    input.day === undefined || input.day === ""
      ? null
      : Number.parseInt(input.day, 10);
  return constrainOverviewQuery(
    {
      month: Number.isFinite(monthValue) ? monthValue : defaultQuery.month,
      year: Number.isFinite(yearValue) ? yearValue : defaultQuery.year,
      day: dayValue,
    },
    cutoffDate,
  );
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
  const dashboardCutoffDate = getDashboardCutoffDate();
  const constrainedQuery = constrainOverviewQuery(query, dashboardCutoffDate);
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

  return getPostgresOverviewData(constrainedQuery, dashboardCutoffDate);
}
