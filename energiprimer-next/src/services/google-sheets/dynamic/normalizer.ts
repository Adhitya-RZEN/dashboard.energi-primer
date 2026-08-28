import { DASHBOARD_FIELD_DEFINITIONS } from "./definitions/dashboard-table";
import { unavailableValue } from "./confidence";
import type {
  DynamicDailyRecord,
  DynamicFieldKey,
  DynamicSemanticAggregates,
  DynamicNormalizedOverview,
  ResolvedValue,
} from "./types";

const ALL_FIELDS: readonly DynamicFieldKey[] = [
  ...DASHBOARD_FIELD_DEFINITIONS.map((definition) => definition.field),
  "biomassTargetProgress",
];

function unavailableFields() {
  return Object.fromEntries(
    ALL_FIELDS.map((field) => [field, unavailableValue(`Field ${field} belum ter-resolve oleh parser semantic.`)]),
  ) as { [K in DynamicFieldKey]: ResolvedValue };
}

function derivedValue(
  value: number | null,
  left: ResolvedValue,
  right: ResolvedValue,
  note: string,
): ResolvedValue {
  if (value === null || !left.available || !right.available) {
    return unavailableValue(note);
  }
  const source = left.source ?? right.source;
  return {
    value,
    available: true,
    confidence: Math.min(left.confidence, right.confidence),
    level: Math.min(left.confidence, right.confidence) >= 0.9 ? "HIGH" : "WARNING",
    source,
    status: "resolved",
    candidates: [],
    note: `Derived value: ${note}`,
  };
}

export function normalizeDynamicOverview(input: {
  fields?: Partial<Record<DynamicFieldKey, ResolvedValue>>;
  target: ResolvedValue;
  cumulative: ResolvedValue;
  series: readonly DynamicDailyRecord[];
  aggregates?: DynamicSemanticAggregates;
}): DynamicNormalizedOverview {
  const fields = { ...(input.fields ?? {}) };
  const dashboardBiomassConsumption = fields.biomassConsumptionMonthly;
  const monthlyUnitConsumption = input.aggregates?.biomassUnitConsumptionMonthly;
  if (monthlyUnitConsumption?.available) {
    fields.biomassConsumptionMonthly = {
      ...monthlyUnitConsumption,
      note: dashboardBiomassConsumption?.available && dashboardBiomassConsumption.value !== monthlyUnitConsumption.value
        ? "Resolved from the semantic monthly Biomassa Unit 1–3 total because the dashboard candidate disagrees with the source table."
        : "Resolved from the semantic monthly Biomassa Unit 1–3 total.",
    };
  }

  const dashboardBiomassReceipt = fields.biomassReceiptMonthly;
  const supplierReceipt = input.aggregates?.biomassSupplierReceiptMonthly;
  if (!dashboardBiomassReceipt?.available && supplierReceipt?.available) {
    fields.biomassReceiptMonthly = {
      ...supplierReceipt,
      note: "Resolved as a fallback from the supplier columns under Penerimaan → Biomassa.",
    };
  }

  const metrics = unavailableFields();
  for (const [field, value] of Object.entries(fields)) {
    if (value) metrics[field as DynamicFieldKey] = value;
  }
  metrics.biomassTarget = input.target;
  metrics.biomassCumulative = input.cumulative;

  const targetValue = input.target.value;
  const cumulativeValue = input.cumulative.value;
  const progress = targetValue !== null && cumulativeValue !== null && targetValue > 0
    ? Math.min(100, (cumulativeValue / targetValue) * 100)
    : null;
  metrics.biomassTargetProgress = derivedValue(
    progress,
    input.cumulative,
    input.target,
    "Progress membutuhkan target dan realisasi kumulatif yang valid.",
  );

  const remaining = targetValue !== null && cumulativeValue !== null
    ? Math.max(0, targetValue - cumulativeValue)
    : null;
  return {
    metrics,
    target: input.target.available || input.cumulative.available
      ? {
        target: input.target,
        cumulative: input.cumulative,
        remaining: derivedValue(remaining, input.target, input.cumulative, "Sisa target membutuhkan target dan kumulatif."),
        progress: metrics.biomassTargetProgress,
      }
      : null,
    series: input.series,
  };
}
