export type OverviewMetric = {
  value: number | null;
  unit: string;
  source: string;
  available: boolean;
  note?: string;
};

export type OverviewUnitValue = {
  unit: string;
  value: number | null;
};

export type OverviewDailyPoint = {
  date: string;
  day: number;
  coal: number | null;
  biomass: number | null;
  coalUnit1?: number | null;
  coalUnit2?: number | null;
  coalUnit3?: number | null;
  biomassUnit1?: number | null;
  biomassUnit2?: number | null;
  biomassUnit3?: number | null;
  stock?: number | null;
  hop1?: number | null;
  hop2?: number | null;
  hop3?: number | null;
  solar?: number | null;
  solarReceipt?: number | null;
};

export type OverviewHopRow = {
  unit: string;
  value: number | null;
  status: "danger" | "warning" | "success";
  label: string;
};

export type OverviewQuery = {
  month: number;
  year: number;
  day: number | null;
};

export type OverviewData = {
  query: OverviewQuery;
  period: {
    monthLabel: string;
    requestedMonthLabel: string;
    isFallback: boolean;
    fallbackNotice: string | null;
    focusDate: string | null;
    focusDateLabel: string;
  };
  source: {
    label: string;
    worksheetEquivalent: string | null;
    note: string;
  };
  metrics: {
    biomassReceiptMonthly: OverviewMetric;
    biomassConsumptionMonthly: OverviewMetric;
    coalConsumptionMonthly: OverviewMetric;
    coalStock: OverviewMetric & { progressPercent: number | null };
    solarConsumptionDaily: OverviewMetric;
    solarConsumptionMonthly: OverviewMetric;
    solarReceiptMonthly: OverviewMetric;
    biomassCumulative: OverviewMetric;
    biomassTargetProgress: OverviewMetric;
    coalReceiptMonthly: OverviewMetric;
  };
  biomassDaily: OverviewUnitValue[];
  coalDaily: OverviewUnitValue[];
  hop: OverviewHopRow[] | null;
  target: {
    target: number;
    cumulative: number;
    remaining: number;
    progress: number;
  } | null;
  series: OverviewDailyPoint[];
  hasData: boolean;
};
