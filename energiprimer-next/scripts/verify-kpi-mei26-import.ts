import { Prisma, PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

const prisma = new PrismaClient();
const WORKSHEET = "Mei26-BB";
const PERIOD_START = new Date("2026-05-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-06-01T00:00:00.000Z");

function numeric(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(
  label: string,
  actual: number | null,
  expected: number,
  tolerance = 0.001,
) {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${String(actual)}`);
  }
}

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function roundAtScale(value: number, scale: number) {
  return new Prisma.Decimal(String(value)).toDecimalPlaces(scale).toNumber();
}

function assertDateRange(
  label: string,
  dates: readonly Date[],
  expectedCount: number,
  expectedUniqueDates = expectedCount,
) {
  assertEqual(`${label} row count`, dates.length, expectedCount);
  const keys = dates.map(dateKey);
  const unique = new Set(keys);
  assertEqual(`${label} unique date count`, unique.size, expectedUniqueDates);
  if (keys.some((key) => key === null || key < "2026-05-01" || key >= "2026-06-01")) {
    throw new Error(`${label}: a date is outside the May 2026 period.`);
  }
}

function assertUnique(label: string, keys: readonly string[]) {
  const unique = new Set(keys);
  assertEqual(`${label} unique key count`, unique.size, keys.length);
}

function assertAllSourceWorksheet(label: string, values: readonly (string | null)[]) {
  if (values.some((value) => value !== WORKSHEET)) {
    throw new Error(`${label}: found a source worksheet other than ${WORKSHEET}.`);
  }
}

async function main() {
  const run = await prisma.spreadsheetImportRun.findFirst({
    where: {
      requestedWorksheet: WORKSHEET,
      effectiveWorksheet: WORKSHEET,
      requestedPeriod: PERIOD_START,
      effectivePeriod: PERIOD_START,
      status: "SUCCESS",
    },
    orderBy: { id: "desc" },
    select: {
      id: true,
      source: true,
      requestedWorksheet: true,
      effectiveWorksheet: true,
      sourceRange: true,
      requestedPeriod: true,
      effectivePeriod: true,
      status: true,
      importedRows: true,
      rejectedRows: true,
    },
  });
  if (!run) throw new Error("Successful Mei26-BB import run was not found.");

  const runId = run.id;
  const [
    stagingRows,
    entityGroups,
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    coalConsumption,
    coalStock,
    solarReceipts,
    solarConsumptions,
    hopReadings,
    target,
    cumulative,
    units,
  ] = await Promise.all([
    prisma.spreadsheetImportStaging.findMany({
      where: { importRunId: runId },
      select: {
        entityType: true,
        sourceWorksheet: true,
        sourceAddress: true,
        readingDate: true,
        periodStart: true,
        normalizedValue: true,
        validationStatus: true,
      },
    }),
    prisma.spreadsheetImportStaging.groupBy({
      by: ["entityType"],
      where: { importRunId: runId },
      _count: { _all: true },
      orderBy: { entityType: "asc" },
    }),
    prisma.biomassReceipt.findMany({
      where: { importRunId: runId },
      select: {
        periodStart: true,
        supplierCode: true,
        quantityTon: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.biomassConsumption.findMany({
      where: { importRunId: runId },
      select: {
        unitId: true,
        readingDate: true,
        quantityTon: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.coalReceipt.findMany({
      where: { importRunId: runId },
      select: {
        periodStart: true,
        quantityTon: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.coalConsumption.findMany({
      where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      select: { unitId: true, date: true, coalUsed: true },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      orderBy: { date: "asc" },
      select: { date: true, closingStock: true, consumed: true },
    }),
    prisma.solarReceipt.findMany({
      where: { importRunId: runId },
      select: {
        periodStart: true,
        quantityLiter: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.solarConsumption.findMany({
      where: { importRunId: runId },
      select: {
        readingDate: true,
        quantityLiter: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.hopReading.findMany({
      where: { importRunId: runId },
      select: {
        unitId: true,
        readingDate: true,
        hopDays: true,
        sourceSheet: true,
        sourceCell: true,
      },
    }),
    prisma.biomassTarget.findUnique({
      where: { targetYear: 2026 },
      select: { targetYear: true, targetTon: true, importRunId: true, source: true },
    }),
    prisma.biomassCumulativeSnapshot.findUnique({
      where: { periodStart: PERIOD_START },
      select: {
        periodStart: true,
        cumulativeTon: true,
        importRunId: true,
        source: true,
        sourceCell: true,
      },
    }),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const actualEntities = Object.fromEntries(
    entityGroups.map((row) => [row.entityType, row._count._all]),
  );
  const expectedEntities: Record<string, number> = {
    biomass_consumption: 93,
    biomass_receipt: 7,
    biomass_target: 1,
    biomass_cumulative: 1,
    coal_consumption: 93,
    coal_receipt: 1,
    coal_stock: 31,
    hop_reading: 93,
    solar_consumption: 31,
    solar_receipt: 1,
  };

  assertEqual("worksheet", run.requestedWorksheet, WORKSHEET);
  assertEqual("effective worksheet", run.effectiveWorksheet, WORKSHEET);
  assertEqual("requested period", dateKey(run.requestedPeriod), "2026-05-01");
  assertEqual("effective period", dateKey(run.effectivePeriod), "2026-05-01");
  assertEqual("source range", run.sourceRange, "A1:ZZ500");
  assertEqual("import status", run.status, "SUCCESS");
  assertEqual("imported rows", run.importedRows, 352);
  assertEqual("rejected rows", run.rejectedRows, 0);
  assertEqual("staging rows", stagingRows.length, 352);
  assertEqual(
    "invalid staging rows",
    stagingRows.filter((row) => !["VALID", "VALID_EMPTY"].includes(row.validationStatus)).length,
    0,
  );
  assertAllSourceWorksheet(
    "staging provenance",
    stagingRows.map((row) => row.sourceWorksheet),
  );
  for (const [entityType, expected] of Object.entries(expectedEntities)) {
    assertEqual(`staging ${entityType}`, actualEntities[entityType] ?? 0, expected);
  }

  const staged = (entityType: string) =>
    stagingRows.filter((row) => row.entityType === entityType);
  assertClose(
    "staged biomass receipt total",
    sum(staged("biomass_receipt").map((row) => numeric(row.normalizedValue))),
    4938.64,
  );
  assertClose(
    "staged biomass consumption total",
    sum(staged("biomass_consumption").map((row) => numeric(row.normalizedValue))),
    4348.38,
  );
  assertClose(
    "staged coal receipt total",
    sum(staged("coal_receipt").map((row) => numeric(row.normalizedValue))),
    34965.807,
  );
  const stagedCoalConsumption = staged("coal_consumption").map((row) => numeric(row.normalizedValue));
  assertClose("staged coal consumption total", sum(stagedCoalConsumption), 48133.428);
  assertClose(
    "staged solar receipt total",
    sum(staged("solar_receipt").map((row) => numeric(row.normalizedValue))),
    30000,
  );
  assertClose(
    "staged solar consumption total",
    sum(staged("solar_consumption").map((row) => numeric(row.normalizedValue))),
    29332,
  );
  assertClose(
    "staged target",
    sum(staged("biomass_target").map((row) => numeric(row.normalizedValue))),
    70020,
  );
  assertClose(
    "staged cumulative",
    sum(staged("biomass_cumulative").map((row) => numeric(row.normalizedValue))),
    22036.49,
  );

  assertEqual("biomass receipt rows", biomassReceipts.length, 7);
  assertClose(
    "biomass receipt total",
    sum(biomassReceipts.map((row) => numeric(row.quantityTon))),
    4938.64,
  );
  assertDateRange(
    "biomass consumption",
    biomassConsumptions.map((row) => row.readingDate),
    93,
    31,
  );
  assertClose(
    "biomass consumption total",
    sum(biomassConsumptions.map((row) => numeric(row.quantityTon))),
    4348.38,
  );
  assertEqual("coal receipt rows", coalReceipts.length, 1);
  assertClose("coal receipt total", numeric(coalReceipts[0]?.quantityTon), 34965.807);
  assertEqual("coal consumption rows", coalConsumption.length, 93);
  assertClose(
    "coal consumption total after existing storage scale",
    sum(coalConsumption.map((row) => numeric(row.coalUsed))),
    sum(stagedCoalConsumption.map((value) => (value === null ? null : roundAtScale(value, 2)))),
    0.001,
  );
  assertDateRange("coal stock", coalStock.map((row) => row.date), 31);
  assertEqual("solar receipt rows", solarReceipts.length, 1);
  assertClose("solar receipt total", numeric(solarReceipts[0]?.quantityLiter), 30000);
  assertDateRange(
    "solar consumption",
    solarConsumptions.map((row) => row.readingDate),
    31,
  );
  assertClose(
    "solar consumption total",
    sum(solarConsumptions.map((row) => numeric(row.quantityLiter))),
    29332,
  );
  assertDateRange("HOP readings", hopReadings.map((row) => row.readingDate), 93, 31);

  assertEqual("target year", target?.targetYear, 2026);
  assertClose("biomass target", numeric(target?.targetTon), 70020);
  assertEqual("cumulative import run", cumulative?.importRunId?.toString(), runId.toString());
  assertClose("biomass cumulative", numeric(cumulative?.cumulativeTon), 22036.49);
  assertEqual("cumulative period", dateKey(cumulative?.periodStart), "2026-05-01");
  assertEqual("cumulative source cell", cumulative?.sourceCell, "CO58");
  assertEqual("coal receipt source cell", coalReceipts[0]?.sourceCell, "I42");
  assertEqual("solar receipt source cell", solarReceipts[0]?.sourceCell, "CC42");
  assertEqual(
    "annual target provenance",
    target?.source?.startsWith("Google Sheets "),
    true,
  );
  assertEqual("cumulative source", cumulative?.source, `Google Sheets ${WORKSHEET}`);

  const supplierCells = new Set(biomassReceipts.map((row) => row.sourceCell));
  for (const cell of ["J42", "K42", "L42", "M42", "N42", "P42", "Q42"]) {
    if (!supplierCells.has(cell)) throw new Error(`Biomass supplier source cell ${cell} is missing.`);
  }
  assertAllSourceWorksheet(
    "biomass receipt provenance",
    biomassReceipts.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "biomass consumption provenance",
    biomassConsumptions.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "coal receipt provenance",
    coalReceipts.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "solar receipt provenance",
    solarReceipts.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "solar consumption provenance",
    solarConsumptions.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "HOP provenance",
    hopReadings.map((row) => row.sourceSheet),
  );

  const unitById = new Map(units.map((unit) => [unit.id.toString(), unit.name]));
  const unitNames = units.map((unit) => unit.name);
  assertEqual("unit identity count", unitNames.length, 3);
  for (const expected of ["Unit 1", "Unit 2", "Unit 3"]) {
    if (!unitNames.includes(expected)) throw new Error(`${expected} is missing.`);
  }
  for (const [label, rows] of [
    ["biomass consumption", biomassConsumptions],
    ["coal consumption", coalConsumption],
    ["HOP readings", hopReadings],
  ] as const) {
    assertUnique(
      `${label} business keys`,
      rows.map((row) => `${row.unitId.toString()}:${dateKey("readingDate" in row ? row.readingDate : row.date)}`),
    );
    const perUnit = new Map<string, number>();
    for (const row of rows) {
      const unitName = unitById.get(row.unitId.toString());
      if (!unitName) throw new Error(`${label}: row references an unknown unit.`);
      perUnit.set(unitName, (perUnit.get(unitName) ?? 0) + 1);
    }
    for (const expected of ["Unit 1", "Unit 2", "Unit 3"]) {
      assertEqual(`${label} ${expected} rows`, perUnit.get(expected) ?? 0, 31);
    }
  }
  assertUnique("coal stock dates", coalStock.map((row) => dateKey(row.date) ?? ""));

  const storedCoalConsumption = sum(coalConsumption.map((row) => numeric(row.coalUsed)));
  const storedBiomassConsumption = sum(
    biomassConsumptions.map((row) => numeric(row.quantityTon)),
  );
  const storedBiomassReceipt = sum(biomassReceipts.map((row) => numeric(row.quantityTon)));
  const storedSolarConsumption = sum(
    solarConsumptions.map((row) => numeric(row.quantityLiter)),
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        importRun: {
          id: runId.toString(),
          worksheet: run.effectiveWorksheet,
          period: dateKey(run.effectivePeriod),
          importedRows: run.importedRows,
          rejectedRows: run.rejectedRows,
        },
        stagingRows: stagingRows.length,
        entities: actualEntities,
        kpi: {
          biomassReceiptTon: storedBiomassReceipt,
          biomassConsumptionTon: storedBiomassConsumption,
          coalReceiptTon: numeric(coalReceipts[0]?.quantityTon),
          coalConsumptionTonSource: sum(stagedCoalConsumption),
          coalConsumptionTonStored: storedCoalConsumption,
          solarReceiptLiter: numeric(solarReceipts[0]?.quantityLiter),
          solarConsumptionLiter: storedSolarConsumption,
          biomassTargetTon: numeric(target?.targetTon),
          biomassCumulativeTon: numeric(cumulative?.cumulativeTon),
          biomassTargetProgressPercent: (22036.49 / 70020) * 100,
        },
        checks: [
          "352 validated staging rows are linked to the successful Mei26-BB import run",
          "all expected normalized entity counts are present",
          "KPI totals match the approved Mei26-BB mapping",
          "annual target value is validated independently from historical run provenance",
          "coal consumption preserves the existing two-decimal database storage boundary",
          "May 2026 date ranges and Unit 1/2/3 identities are correct",
          "approved legacy fallback cells I42, CC42, and CO58 are persisted with provenance",
          "business-key duplicates are absent",
        ],
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        category: safeErrorCategory(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
