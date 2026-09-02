import { PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

const prisma = new PrismaClient();
const WORKSHEET = "Juni26-BB";
const PERIOD_START = new Date("2026-06-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-07-01T00:00:00.000Z");

function numeric(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected)
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertClose(label: string, actual: number | null, expected: number, tolerance = 0.001) {
  if (actual === null || Math.abs(actual - expected) > tolerance)
    throw new Error(`${label}: expected ${expected}, received ${String(actual)}`);
}

function assertAllSourceWorksheet(label: string, values: readonly (string | null)[]) {
  if (values.some((value) => value !== WORKSHEET))
    throw new Error(`${label}: found a source worksheet other than ${WORKSHEET}.`);
}

async function main() {
  const run = await prisma.spreadsheetImportRun.findFirst({
    where: {
      requestedWorksheet: WORKSHEET,
      effectiveWorksheet: WORKSHEET,
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
  if (!run) throw new Error("Successful Juni26-BB import run was not found.");

  const runId = run.id;
  const [
    stagingCount,
    invalidStagingCount,
    sourceWorksheetCount,
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
    biomassReceiptSources,
    biomassConsumptionSources,
    solarReceiptSources,
    solarConsumptionSources,
    hopSources,
  ] = await Promise.all([
    prisma.spreadsheetImportStaging.count({ where: { importRunId: runId } }),
    prisma.spreadsheetImportStaging.count({
      where: {
        importRunId: runId,
        validationStatus: { notIn: ["VALID", "VALID_EMPTY"] },
      },
    }),
    prisma.spreadsheetImportStaging.count({
      where: { importRunId: runId, sourceWorksheet: WORKSHEET },
    }),
    prisma.spreadsheetImportStaging.groupBy({
      by: ["entityType"],
      where: { importRunId: runId },
      _count: { _all: true },
      orderBy: { entityType: "asc" },
    }),
    prisma.biomassReceipt.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
      _sum: { quantityTon: true },
    }),
    prisma.biomassConsumption.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
      _sum: { quantityTon: true },
    }),
    prisma.coalReceipt.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
      _sum: { quantityTon: true },
    }),
    prisma.coalConsumption.aggregate({
      where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      _count: { _all: true },
      _sum: { coalUsed: true },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      orderBy: { date: "asc" },
      select: { date: true, closingStock: true },
    }),
    prisma.solarReceipt.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
      _sum: { quantityLiter: true },
    }),
    prisma.solarConsumption.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
      _sum: { quantityLiter: true },
    }),
    prisma.hopReading.aggregate({
      where: { importRunId: runId },
      _count: { _all: true },
    }),
    prisma.biomassTarget.findUnique({
      where: { targetYear: 2026 },
      select: { targetTon: true, importRunId: true, source: true },
    }),
    prisma.biomassCumulativeSnapshot.findUnique({
      where: { periodStart: PERIOD_START },
      select: { cumulativeTon: true, importRunId: true, source: true, sourceCell: true },
    }),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    }),
    prisma.biomassReceipt.findMany({
      where: { importRunId: runId },
      select: { sourceSheet: true },
    }),
    prisma.biomassConsumption.findMany({
      where: { importRunId: runId },
      select: { sourceSheet: true },
    }),
    prisma.solarReceipt.findMany({
      where: { importRunId: runId },
      select: { sourceSheet: true },
    }),
    prisma.solarConsumption.findMany({
      where: { importRunId: runId },
      select: { sourceSheet: true },
    }),
    prisma.hopReading.findMany({
      where: { importRunId: runId },
      select: { sourceSheet: true },
    }),
  ]);

  const actualEntities = Object.fromEntries(
    entityGroups.map((row) => [row.entityType, row._count._all]),
  );
  const expectedEntities: Record<string, number> = {
    biomass_consumption: 90,
    biomass_receipt: 7,
    biomass_target: 1,
    biomass_cumulative: 1,
    coal_consumption: 90,
    coal_receipt: 1,
    coal_stock: 30,
    hop_reading: 90,
    solar_consumption: 30,
    solar_receipt: 1,
  };

  assertEqual("worksheet", run.requestedWorksheet, WORKSHEET);
  assertEqual("effective worksheet", run.effectiveWorksheet, WORKSHEET);
  assertEqual("import status", run.status, "SUCCESS");
  assertEqual("imported rows", run.importedRows, 341);
  assertEqual("rejected rows", run.rejectedRows, 0);
  assertEqual("staging rows", stagingCount, 341);
  assertEqual("staging source worksheet rows", sourceWorksheetCount, 341);
  assertEqual("invalid staging rows", invalidStagingCount, 0);
  for (const [entityType, expected] of Object.entries(expectedEntities))
    assertEqual(`staging ${entityType}`, actualEntities[entityType] ?? 0, expected);

  assertEqual("biomass receipt rows", biomassReceipts._count._all, 7);
  assertClose("biomass receipt total", numeric(biomassReceipts._sum.quantityTon), 5474.35);
  assertEqual("biomass consumption rows", biomassConsumptions._count._all, 90);
  assertClose(
    "biomass consumption total",
    numeric(biomassConsumptions._sum.quantityTon),
    3902.63,
  );
  assertEqual("coal receipt rows", coalReceipts._count._all, 1);
  assertClose("coal receipt total", numeric(coalReceipts._sum.quantityTon), 45255.704);
  assertEqual("coal consumption rows", coalConsumption._count._all, 90);
  // coal_consumption is an existing NUMERIC(12,2) table. Each source value
  // with three decimals is rounded at the existing storage boundary, making
  // the persisted aggregate 32557.03 for this worksheet.
  assertClose(
    "coal consumption total after storage scale",
    numeric(coalConsumption._sum.coalUsed),
    32557.03,
  );
  assertEqual("coal stock rows", coalStock.length, 30);
  assertClose("last June coal stock", numeric(coalStock.at(-1)?.closingStock), 22841.466, 0.01);
  assertEqual("solar receipt rows", solarReceipts._count._all, 1);
  assertClose("solar receipt total", numeric(solarReceipts._sum.quantityLiter), 25000);
  assertEqual("solar consumption rows", solarConsumptions._count._all, 30);
  assertClose("solar consumption total", numeric(solarConsumptions._sum.quantityLiter), 26848);
  assertEqual("HOP rows", hopReadings._count._all, 90);
  assertClose("biomass target", numeric(target?.targetTon), 70020);
  assertEqual("cumulative import run", cumulative?.importRunId?.toString(), runId.toString());
  assertClose("biomass cumulative", numeric(cumulative?.cumulativeTon), 25939.12);
  assertEqual("cumulative source cell", cumulative?.sourceCell, "CO58");
  assertEqual(
    "annual target provenance",
    target?.source?.startsWith("Google Sheets "),
    true,
  );
  assertEqual("cumulative source", cumulative?.source, `Google Sheets ${WORKSHEET}`);

  assertAllSourceWorksheet(
    "biomass receipt provenance",
    biomassReceiptSources.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "biomass consumption provenance",
    biomassConsumptionSources.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "solar receipt provenance",
    solarReceiptSources.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "solar consumption provenance",
    solarConsumptionSources.map((row) => row.sourceSheet),
  );
  assertAllSourceWorksheet(
    "HOP provenance",
    hopSources.map((row) => row.sourceSheet),
  );

  const unitNames = units.map((unit) => unit.name);
  assertEqual("unit identity count", unitNames.length, 3);
  for (const expected of ["Unit 1", "Unit 2", "Unit 3"])
    if (!unitNames.includes(expected)) throw new Error(`${expected} is missing.`);

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        importRun: {
          id: runId.toString(),
          worksheet: run.effectiveWorksheet,
          period: run.effectivePeriod?.toISOString().slice(0, 10),
          importedRows: run.importedRows,
        },
        entities: actualEntities,
        kpi: {
          biomassReceiptTon: numeric(biomassReceipts._sum.quantityTon),
          biomassConsumptionTon: numeric(biomassConsumptions._sum.quantityTon),
          coalReceiptTon: numeric(coalReceipts._sum.quantityTon),
          coalConsumptionTonStored: numeric(coalConsumption._sum.coalUsed),
          solarReceiptLiter: numeric(solarReceipts._sum.quantityLiter),
          solarConsumptionLiter: numeric(solarConsumptions._sum.quantityLiter),
          biomassTargetTon: numeric(target?.targetTon),
          biomassCumulativeTon: numeric(cumulative?.cumulativeTon),
        },
        periods: {
          coalConsumptionRows: coalConsumption._count._all,
          coalStockRows: coalStock.length,
          solarConsumptionRows: solarConsumptions._count._all,
        },
        units,
        checks: [
          "341 validated staging rows are linked to Juni26-BB import run",
          "all expected normalized entity counts are present",
          "KPI totals match the verified Juni26-BB mapping",
          "annual target value is validated independently from historical run provenance",
          "legacy cumulative value is persisted from CO58",
          "June date range and source provenance are correct",
          "Unit 1, Unit 2, and Unit 3 identities are present",
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
