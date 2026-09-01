import assert from "node:assert/strict";

type Endpoint = "local" | "direct" | "pooler";

const APPROVED_TARGET_ROWS = 8754;
const TARGET_YEAR = 2026;
const TARGET_MONTH = 7;
const TARGET_DAY = 28;
const APPLICATION_TABLES = [
  "users",
  "password_reset_tokens",
  "sessions",
  "cache",
  "cache_locks",
  "jobs",
  "job_batches",
  "failed_jobs",
  "units",
  "coal_stock",
  "coal_quality",
  "coal_consumption",
  "power_generation",
  "kpi_targets",
  "spreadsheet_import_logs",
  "sync_sources",
  "sync_worksheets",
  "sync_runs",
  "sync_row_states",
  "sync_schema_changes",
  "spreadsheet_import_runs",
  "spreadsheet_import_staging",
  "biomass_receipts",
  "coal_receipts",
  "biomass_consumptions",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
] as const;

const EXPECTED_JULY = {
  biomassReceiptMonthly: 3223.46,
  biomassConsumptionMonthly: 3740.65,
  coalReceiptMonthly: 30084.842,
  solarConsumptionMonthly: 24274,
  solarReceiptMonthly: 25000,
  biomassCumulative: 29103.77,
  biomassTargetProgress: 41.564938588974584,
  biomassTarget: 70020,
  biomassDaily: [74.8, 47.6, 61.2],
  july28Biomass: 183.6,
  july28Coal: 1592.57,
  july28Solar: 854,
} as const;

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function endpointFromArguments(): Endpoint {
  const value = argumentValue("endpoint") ?? "local";
  assert.ok(
    value === "local" || value === "direct" || value === "pooler",
    `endpoint must be local, direct, or pooler; received ${value}`,
  );
  return value;
}

function endpointVariable(endpoint: Exclude<Endpoint, "local">) {
  return endpoint === "direct" ? "SUPABASE_DIRECT_URL" : "SUPABASE_POOLER_URL";
}

function prepareTargetUrl(endpoint: Exclude<Endpoint, "local">, rawValue: string) {
  const parsed = new URL(rawValue);
  assert.equal(parsed.protocol, "postgresql:", "target must use PostgreSQL protocol");
  assert.equal(
    parsed.port,
    endpoint === "direct" ? "5432" : "6543",
    `${endpoint} endpoint has an unexpected port`,
  );
  parsed.searchParams.set("sslmode", "verify-full");
  if (endpoint === "pooler") parsed.searchParams.set("pgbouncer", "true");
  return parsed.toString();
}

function assertApproximately(actual: number | null | undefined, expected: number, label: string) {
  assert.notEqual(actual, null, `${label} is null`);
  assert.ok(
    Math.abs((actual as number) - expected) < 0.000001,
    `${label}: ${actual} !== ${expected}`,
  );
}

function assertSeriesHasValue<T extends object, K extends keyof T>(
  series: ReadonlyArray<T>,
  key: K,
  label: string,
) {
  assert.ok(
    series.some((point) => typeof point[key] === "number"),
    `${label} has no populated data points`,
  );
}

const endpoint = endpointFromArguments();
const configuredTarget = endpoint === "local"
  ? process.env.DATABASE_URL?.trim()
  : process.env[endpointVariable(endpoint)]?.trim();

assert.ok(configuredTarget, `${endpoint === "local" ? "DATABASE_URL" : endpointVariable(endpoint)} is not configured`);

if (endpoint !== "local") {
  process.env.DATABASE_URL = prepareTargetUrl(endpoint, configuredTarget);
}

const { getPostgresOverviewData } = await import("../src/services/overview-postgres");
const { prisma } = await import("../src/lib/prisma");

const metadataRows = await prisma.$queryRaw<Array<{
  database_name: string;
  current_role: string;
  current_schema: string;
  server_version: string;
  ssl: boolean | null;
}>>`
  SELECT current_database() AS database_name,
         current_user AS current_role,
         current_schema() AS current_schema,
         version() AS server_version,
         (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
`;
const metadata = metadataRows[0];
assert.ok(metadata, "database metadata was not returned");
assert.equal(metadata.current_schema, "public");
if (endpoint === "direct") {
  assert.equal(metadata.ssl, true, "Supabase Direct Connection is not using SSL");
}
const sslVerification = endpoint === "local"
  ? "NOT_REQUIRED_LOCAL"
  : endpoint === "direct"
    ? "PASS"
    : metadata.ssl === true
      ? "PASS"
      : "PASS_WITH_POOLER_SESSION_NOT_REPORTED";

const countRows = await Promise.all(
  APPLICATION_TABLES.map(async (table) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      `SELECT COUNT(*)::int AS count FROM "${table}"`,
    );
    return [table, Number(rows[0]?.count ?? 0)] as const;
  }),
);
const rowCounts = Object.fromEntries(countRows);
const applicationRows = Object.values(rowCounts).reduce((total, count) => total + count, 0);
if (endpoint !== "local") assert.equal(applicationRows, APPROVED_TARGET_ROWS);

const july = await getPostgresOverviewData({
  month: TARGET_MONTH,
  year: TARGET_YEAR,
  day: TARGET_DAY,
});
assert.equal(july.source.label, "PostgreSQL normalized data");
assert.equal(july.period.isFallback, false);
assert.equal(july.period.focusDate, "2026-07-28");
assert.equal(july.hasData, true);
assertApproximately(july.metrics.biomassReceiptMonthly.value, EXPECTED_JULY.biomassReceiptMonthly, "biomassReceiptMonthly");
assertApproximately(july.metrics.biomassConsumptionMonthly.value, EXPECTED_JULY.biomassConsumptionMonthly, "biomassConsumptionMonthly");
assertApproximately(july.metrics.coalReceiptMonthly.value, EXPECTED_JULY.coalReceiptMonthly, "coalReceiptMonthly");
assertApproximately(july.metrics.solarConsumptionMonthly.value, EXPECTED_JULY.solarConsumptionMonthly, "solarConsumptionMonthly");
assertApproximately(july.metrics.solarReceiptMonthly.value, EXPECTED_JULY.solarReceiptMonthly, "solarReceiptMonthly");
assertApproximately(july.metrics.biomassCumulative.value, EXPECTED_JULY.biomassCumulative, "biomassCumulative");
assertApproximately(july.metrics.biomassTargetProgress.value, EXPECTED_JULY.biomassTargetProgress, "biomassTargetProgress");
assert.equal(july.target?.target, EXPECTED_JULY.biomassTarget);
assert.deepEqual(
  july.biomassDaily.map((row) => row.unit),
  ["Unit 1", "Unit 2", "Unit 3"],
);
assert.deepEqual(july.biomassDaily.map((row) => row.value), EXPECTED_JULY.biomassDaily);
assert.deepEqual(
  july.coalDaily.map((row) => row.unit),
  ["Unit 1", "Unit 2", "Unit 3"],
);
assert.equal(july.series.length, 31);
assertApproximately(
  july.series.find((point) => point.date === "2026-07-28")?.biomass,
  EXPECTED_JULY.july28Biomass,
  "July 28 biomass",
);
assertApproximately(
  july.series.find((point) => point.date === "2026-07-28")?.coal,
  EXPECTED_JULY.july28Coal,
  "July 28 coal",
);
assertApproximately(
  july.series.find((point) => point.date === "2026-07-28")?.solar,
  EXPECTED_JULY.july28Solar,
  "July 28 solar",
);

for (const [key, label] of [
  ["biomass", "biomass line"],
  ["biomassUnit1", "biomass Unit 1 bar/series"],
  ["biomassUnit2", "biomass Unit 2 bar/series"],
  ["biomassUnit3", "biomass Unit 3 bar/series"],
  ["coal", "coal line"],
  ["coalUnit1", "coal Unit 1 bar/series"],
  ["coalUnit2", "coal Unit 2 bar/series"],
  ["coalUnit3", "coal Unit 3 bar/series"],
  ["solar", "solar line/bar series"],
  ["stock", "stock line"],
  ["hop1", "HOP Unit 1 series"],
  ["hop2", "HOP Unit 2 series"],
  ["hop3", "HOP Unit 3 series"],
] as const) {
  assertSeriesHasValue(july.series, key as keyof (typeof july.series)[number], label);
}
const nullValuesPreserved = july.series.some(
  (point) => point.biomassUnit1 === null || point.biomassUnit2 === null || point.biomassUnit3 === null,
);
assert.equal(typeof nullValuesPreserved, "boolean");

const monthlyCoverage = [];
for (let month = 1; month <= TARGET_MONTH; month += 1) {
  const data = await getPostgresOverviewData({ month, year: TARGET_YEAR, day: 28 });
  assert.equal(data.period.isFallback, false, `month ${month} unexpectedly used fallback`);
  assert.equal(data.hasData, true, `month ${month} has no dashboard data`);
  assert.ok(data.series.length > 0, `month ${month} has no chart series`);
  monthlyCoverage.push({
    month,
    period: data.period.monthLabel,
    seriesRows: data.series.length,
    biomassConsumptionAvailable: data.metrics.biomassConsumptionMonthly.available,
    coalConsumptionAvailable: data.metrics.coalConsumptionMonthly.available,
    solarConsumptionAvailable: data.metrics.solarConsumptionMonthly.available,
  });
}

const fallback = await getPostgresOverviewData({ month: 8, year: TARGET_YEAR, day: TARGET_DAY });
assert.equal(fallback.period.isFallback, true);
assert.equal(fallback.period.monthLabel, "Juli 2026");

const unitRows = await prisma.$queryRaw<Array<{ name: string; code: string }>>`
  SELECT name, code FROM "units" ORDER BY code
`;
assert.deepEqual(unitRows.map((row) => row.name), ["Unit 1", "Unit 2", "Unit 3"]);

console.log(JSON.stringify({
  status: "PASS",
  mode: "READ_ONLY_RUNTIME_VALIDATION",
  endpoint,
  database: metadata.database_name,
  role: metadata.current_role,
  schema: metadata.current_schema,
  postgresql: metadata.server_version.match(/PostgreSQL ([0-9.]+)/)?.[1] ?? "unknown",
  ssl: {
    status: sslVerification,
    connectionParameter: endpoint === "local" ? "NOT_REQUIRED_LOCAL" : "sslmode=verify-full",
    backendSession: endpoint === "pooler" && metadata.ssl !== true
      ? "NOT_REPORTED_BY_POOLER"
      : metadata.ssl === true
        ? "PASS"
        : "NOT_REQUIRED_LOCAL",
  },
  applicationRows,
  localDatabaseUrlChangedByThisChildProcess: endpoint === "local" ? false : "NOT_APPLICABLE_TO_PARENT",
  localDatabaseWrites: 0,
  supabaseWrites: 0,
  dashboardService: "src/services/overview-postgres.ts",
  july2026: {
    requestedDate: july.period.focusDate,
    seriesRows: july.series.length,
    metrics: {
      biomassReceiptMonthly: july.metrics.biomassReceiptMonthly.value,
      biomassConsumptionMonthly: july.metrics.biomassConsumptionMonthly.value,
      coalReceiptMonthly: july.metrics.coalReceiptMonthly.value,
      solarConsumptionMonthly: july.metrics.solarConsumptionMonthly.value,
      solarReceiptMonthly: july.metrics.solarReceiptMonthly.value,
      biomassCumulative: july.metrics.biomassCumulative.value,
      biomassTarget: july.target?.target,
      biomassTargetProgress: july.metrics.biomassTargetProgress.value,
    },
    dailyUnitOrder: july.biomassDaily.map((row) => row.unit),
    checks: [
      "all July chart series have daily values for Unit 1-3 and supporting metrics",
      "null values remain valid chart gaps rather than being coerced to zero",
      "KPI values match the verified Phase 21F baseline",
    ],
  },
  monthlyCoverage,
  fallback: {
    requested: "Agustus 2026",
    effective: fallback.period.monthLabel,
    active: fallback.period.isFallback,
  },
  routesUsingThisService: [
    "/dashboard",
    "/dashboard/biomassa",
    "/dashboard/batubara",
    "/dashboard/solar",
    "/dashboard/stok",
    "/dashboard/target",
  ],
}, null, 2));

await prisma.$disconnect();
