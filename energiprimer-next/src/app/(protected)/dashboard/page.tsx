import { getOverviewData, getPersistedOverviewQuery } from "@/services/overview";

import { OverviewDashboard } from "@/components/dashboard/OverviewDashboard";
import { OverviewErrorState } from "@/components/dashboard/OverviewState";

type DashboardPageProps = {
  searchParams: Promise<{ month?: string; year?: string; day?: string; reset?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const query = await getPersistedOverviewQuery(await searchParams);
  let data;

  try {
    data = await getOverviewData(query);
  } catch {
    return <OverviewErrorState />;
  }

  return <OverviewDashboard data={data} />;
}
