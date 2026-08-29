import { DetailDashboard } from "@/components/dashboard/DetailDashboard";
import { OverviewErrorState } from "@/components/dashboard/OverviewState";
import {
  getOverviewData,
  getPersistedOverviewQuery,
} from "@/services/overview";

type PageProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    day?: string;
    reset?: string;
  }>;
};

export default async function BiomassaPage({ searchParams }: PageProps) {
  const query = await getPersistedOverviewQuery(await searchParams);
  let data;
  try {
    data = await getOverviewData(query);
  } catch {
    return <OverviewErrorState label="Dashboard Biomassa" />;
  }
  return <DetailDashboard feature="biomassa" data={data} />;
}
