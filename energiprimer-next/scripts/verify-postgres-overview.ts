import assert from "node:assert/strict";

import { getPostgresOverviewData } from "../src/services/overview-postgres";

function assertApproximately(actual: number | null | undefined, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < 0.000001, `${actual} !== ${expected}`);
}

const data = await getPostgresOverviewData({
  month: 7,
  year: 2026,
  day: 28,
});
const fallbackData = await getPostgresOverviewData({
  month: 8,
  year: 2026,
  day: 28,
});

assert.equal(data.source.label, "PostgreSQL normalized data");
assert.equal(data.period.focusDate, "2026-07-28");
assert.equal(data.period.isFallback, false);
assertApproximately(data.metrics.biomassReceiptMonthly.value, 3223.46);
assertApproximately(data.metrics.biomassConsumptionMonthly.value, 3740.65);
assertApproximately(data.metrics.solarConsumptionMonthly.value, 24274);
assertApproximately(data.metrics.solarReceiptMonthly.value, 25000);
assertApproximately(data.metrics.biomassCumulative.value, 29103.77);
assertApproximately(data.metrics.biomassTargetProgress.value, 41.564938588974584);
assert.equal(data.target?.target, 70020);
assert.deepEqual(
  data.biomassDaily.map((row) => row.unit),
  ["Unit 1", "Unit 2", "Unit 3"],
);
assert.deepEqual(
  data.biomassDaily.map((row) => row.value),
  [74.8, 47.6, 61.2],
);
assert.deepEqual(
  data.coalDaily.map((row) => row.unit),
  ["Unit 1", "Unit 2", "Unit 3"],
);
assert.equal(data.series.length, 31);
assert.equal(fallbackData.period.isFallback, true);
assert.equal(fallbackData.period.monthLabel, "Juli 2026");
assert.equal(fallbackData.metrics.biomassConsumptionMonthly.available, true);
assertApproximately(
  data.series.find((point) => point.date === "2026-07-28")?.biomass,
  183.6,
);
assertApproximately(
  data.series.find((point) => point.date === "2026-07-28")?.coal,
  1592.57,
);
assertApproximately(
  data.series.find((point) => point.date === "2026-07-28")?.solar,
  854,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      source: data.source.label,
      period: data.period,
      metrics: {
        biomassReceiptMonthly: data.metrics.biomassReceiptMonthly.value,
        biomassConsumptionMonthly: data.metrics.biomassConsumptionMonthly.value,
        solarConsumptionMonthly: data.metrics.solarConsumptionMonthly.value,
        solarReceiptMonthly: data.metrics.solarReceiptMonthly.value,
        biomassTarget: data.target?.target,
        biomassProgress: data.metrics.biomassTargetProgress.value,
      },
      units: data.biomassDaily,
      seriesRows: data.series.length,
      checks: [
        "dashboard service reads normalized PostgreSQL tables",
        "Unit 1, Unit 2, and Unit 3 are preserved",
        "July 2026 KPI values match imported baseline",
        "daily series is populated for all 31 days",
      ],
    },
    null,
    2,
  ),
);
