import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function number(value) {
  return value === null ? null : Number(value);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertApproximately(label, actual, expected, tolerance = 0.000001) {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

try {
  const [
    counts,
    receipt,
    biomass,
    coalReceipt,
    solar,
    solarReceipt,
    target,
    cumulative,
    runs,
    units,
    julyCoal,
    julyStock,
    julyCoalTotal,
  ] =
    await Promise.all([
      Promise.all([
        prisma.spreadsheetImportRun.count(),
        prisma.spreadsheetImportStaging.count(),
        prisma.biomassReceipt.count(),
        prisma.biomassConsumption.count(),
        prisma.coalReceipt.count(),
        prisma.solarConsumption.count(),
        prisma.solarReceipt.count(),
        prisma.hopReading.count(),
        prisma.biomassTarget.count(),
        prisma.biomassCumulativeSnapshot.count(),
      ]),
      prisma.biomassReceipt.aggregate({ _sum: { quantityTon: true } }),
      prisma.biomassConsumption.aggregate({ _sum: { quantityTon: true } }),
      prisma.coalReceipt.aggregate({ _sum: { quantityTon: true } }),
      prisma.solarConsumption.aggregate({ _sum: { quantityLiter: true } }),
      prisma.solarReceipt.aggregate({ _sum: { quantityLiter: true } }),
      prisma.biomassTarget.findUnique({ where: { targetYear: 2026 } }),
      prisma.biomassCumulativeSnapshot.findUnique({
        where: { periodStart: new Date("2026-07-01T00:00:00.000Z") },
      }),
      prisma.spreadsheetImportRun.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          importedRows: true,
          requestedWorksheet: true,
          effectiveWorksheet: true,
        },
      }),
      prisma.unit.findMany({
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.coalConsumption.count({
        where: {
          date: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      }),
      prisma.coalStock.count({
        where: {
          date: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      }),
      prisma.coalConsumption.aggregate({
        where: {
          date: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
        _sum: { coalUsed: true },
      }),
    ]);

  if (counts[0] < 1) throw new Error("No successful import run exists.");
  const expectedStagingRows = runs.reduce(
    (total, run) => total + (run.importedRows ?? 0),
    0,
  );
  assertEqual("staging rows equal successful run totals", counts[1], expectedStagingRows);
  assertEqual("biomass receipt row count", counts[2], 7);
  assertEqual("biomass consumption row count", counts[3], 93);
  assertEqual("coal receipt row count", counts[4], 1);
  assertEqual("solar consumption row count", counts[5], 31);
  assertEqual("solar receipt row count", counts[6], 1);
  assertEqual("HOP row count", counts[7], 93);
  assertEqual("biomass target row count", counts[8], 1);
  assertEqual("cumulative snapshot row count", counts[9], 1);
  assertApproximately("biomass receipt total", number(receipt._sum.quantityTon), 3223.46);
  assertApproximately("biomass consumption total", number(biomass._sum.quantityTon), 3740.65);
  assertApproximately("coal receipt total", number(coalReceipt._sum.quantityTon), 30084.842);
  assertApproximately("solar consumption total", number(solar._sum.quantityLiter), 24274);
  assertApproximately("solar receipt total", number(solarReceipt._sum.quantityLiter), 25000);
  assertEqual("July coal consumption row count", julyCoal, 93);
  assertEqual("July coal stock row count", julyStock, 31);
  // coal_consumption is an existing NUMERIC(12,2) table; source values with
  // three decimals are rounded at the existing storage boundary.
  assertApproximately("July coal consumption total", number(julyCoalTotal._sum.coalUsed), 34940.48, 0.000001);

  if (!target || !target.targetTon.equals(70020))
    throw new Error("Biomassa target 2026 is not 70020.");
  if (!cumulative || !cumulative.cumulativeTon.equals(29103.77))
    throw new Error("Biomassa cumulative snapshot is not 29103.77.");
  const latestRun = runs.at(-1);
  assertEqual("latest import status", latestRun?.status, "SUCCESS");
  assertEqual("imported rows in latest run", latestRun?.importedRows, 352);
  assertEqual("effective worksheet", latestRun?.effectiveWorksheet, "Juli26-BB");

  const unitNames = units.map((unit) => unit.name);
  assertEqual("unit identity count", unitNames.length, 3);
  for (const expected of ["Unit 1", "Unit 2", "Unit 3"]) {
    if (!unitNames.includes(expected)) throw new Error(`${expected} is missing.`);
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        counts: {
          importRuns: counts[0],
          stagingRows: counts[1],
          biomassReceipts: counts[2],
          biomassConsumptions: counts[3],
          coalReceipts: counts[4],
          solarConsumptions: counts[5],
          solarReceipts: counts[6],
          hopReadings: counts[7],
          biomassTargets: counts[8],
          cumulativeSnapshots: counts[9],
        },
        aggregates: {
          biomassReceiptTon: number(receipt._sum.quantityTon),
          biomassConsumptionTon: number(biomass._sum.quantityTon),
          coalReceiptTon: number(coalReceipt._sum.quantityTon),
          solarConsumptionLiter: number(solar._sum.quantityLiter),
          solarReceiptLiter: number(solarReceipt._sum.quantityLiter),
          biomassTargetTon: number(target.targetTon),
          biomassCumulativeTon: number(cumulative.cumulativeTon),
        },
        unitNames,
        checks: [
          "normalized row counts match July 2026 dry-run",
          "July coal daily and stock coverage is present",
          "aggregates match Google Sheets baseline",
          "target 2026 equals 70020 ton",
          "Unit 1, Unit 2, and Unit 3 identities are present",
          "latest import run completed successfully",
          "repeated imports do not duplicate normalized rows",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        message: error instanceof Error ? error.message : "Import verification failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
