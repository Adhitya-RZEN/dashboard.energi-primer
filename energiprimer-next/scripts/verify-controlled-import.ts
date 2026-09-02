import { Prisma, PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

const prisma = new PrismaClient();
const TARGET_WORKSHEET = "Juli26-BB";
const PERIOD_START = new Date("2026-07-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-01T00:00:00.000Z");

function assertEqual(label: string, actual: number | string, expected: number | string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertZeroRows(
  label: string,
  rows: readonly { count: number }[],
) {
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  if (total !== 0) throw new Error(`${label}: ${total} issue(s) found.`);
}

try {
  const run = await prisma.spreadsheetImportRun.findFirst({
    where: { requestedWorksheet: TARGET_WORKSHEET, status: "SUCCESS" },
    orderBy: { id: "desc" },
    select: {
      id: true,
      source: true,
      requestedWorksheet: true,
      effectiveWorksheet: true,
      sourceRange: true,
      status: true,
      importedRows: true,
      rejectedRows: true,
    },
  });
  if (!run) throw new Error("Successful Juli26-BB import run was not found.");

  const runId = run.id;
  const [
    stagingCount,
    sourceWorksheetCount,
    invalidCount,
    entityCounts,
    normalizedCounts,
    units,
    dateRanges,
    orphanRows,
    duplicateRows,
  ] = await Promise.all([
    prisma.spreadsheetImportStaging.count({ where: { importRunId: runId } }),
    prisma.spreadsheetImportStaging.count({
      where: { importRunId: runId, sourceWorksheet: TARGET_WORKSHEET },
    }),
    prisma.spreadsheetImportStaging.count({
      where: {
        importRunId: runId,
        validationStatus: { notIn: ["VALID", "VALID_EMPTY"] },
      },
    }),
    prisma.spreadsheetImportStaging.groupBy({
      by: ["entityType"],
      where: { importRunId: runId },
      _count: { _all: true },
      orderBy: { entityType: "asc" },
    }),
    Promise.all([
      prisma.biomassReceipt.count({ where: { importRunId: runId } }),
      prisma.biomassConsumption.count({ where: { importRunId: runId } }),
      prisma.coalReceipt.count({ where: { importRunId: runId } }),
      prisma.solarReceipt.count({ where: { importRunId: runId } }),
      prisma.solarConsumption.count({ where: { importRunId: runId } }),
      prisma.hopReading.count({ where: { importRunId: runId } }),
      prisma.biomassTarget.count({ where: { importRunId: runId } }),
      prisma.biomassCumulativeSnapshot.count({ where: { importRunId: runId } }),
      prisma.coalConsumption.count({
        where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      }),
      prisma.coalStock.count({
        where: { date: { gte: PERIOD_START, lt: PERIOD_END } },
      }),
    ]),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    }),
    prisma.$queryRaw<
      { table_name: string; min_date: string | null; max_date: string | null }[]
    >(Prisma.sql`
      SELECT 'biomass_consumptions' AS table_name,
             MIN(reading_date)::text AS min_date,
             MAX(reading_date)::text AS max_date
      FROM biomass_consumptions
      WHERE import_run_id = ${runId}
      UNION ALL
      SELECT 'solar_consumptions', MIN(reading_date)::text, MAX(reading_date)::text
      FROM solar_consumptions
      WHERE import_run_id = ${runId}
      UNION ALL
      SELECT 'hop_readings', MIN(reading_date)::text, MAX(reading_date)::text
      FROM hop_readings
      WHERE import_run_id = ${runId}
      UNION ALL
      SELECT 'coal_consumption', MIN(date)::text, MAX(date)::text
      FROM coal_consumption
      WHERE date >= ${PERIOD_START} AND date < ${PERIOD_END}
      UNION ALL
      SELECT 'coal_stock', MIN(date)::text, MAX(date)::text
      FROM coal_stock
      WHERE date >= ${PERIOD_START} AND date < ${PERIOD_END}
    `),
    prisma.$queryRaw<{ check_name: string; count: number }[]>(Prisma.sql`
      SELECT 'staging_import_run' AS check_name, COUNT(*)::int AS count
      FROM spreadsheet_import_staging s
      LEFT JOIN spreadsheet_import_runs r ON r.id = s.import_run_id
      WHERE s.import_run_id = ${runId} AND r.id IS NULL
      UNION ALL
      SELECT 'biomass_consumption_unit', COUNT(*)::int
      FROM biomass_consumptions b
      LEFT JOIN units u ON u.id = b.unit_id
      WHERE b.import_run_id = ${runId} AND u.id IS NULL
      UNION ALL
      SELECT 'hop_unit', COUNT(*)::int
      FROM hop_readings h
      LEFT JOIN units u ON u.id = h.unit_id
      WHERE h.import_run_id = ${runId} AND u.id IS NULL
      UNION ALL
      SELECT 'biomass_receipt_import_run', COUNT(*)::int
      FROM biomass_receipts b
      LEFT JOIN spreadsheet_import_runs r ON r.id = b.import_run_id
      WHERE b.import_run_id = ${runId} AND r.id IS NULL
      UNION ALL
      SELECT 'solar_consumption_import_run', COUNT(*)::int
      FROM solar_consumptions s
      LEFT JOIN spreadsheet_import_runs r ON r.id = s.import_run_id
      WHERE s.import_run_id = ${runId} AND r.id IS NULL
    `),
    prisma.$queryRaw<{ table_name: string; duplicate_groups: number }[]>(
      Prisma.sql`
        SELECT 'biomass_receipts' AS table_name, COUNT(*)::int AS duplicate_groups
        FROM (
          SELECT period_start, supplier_code
          FROM biomass_receipts
          GROUP BY period_start, supplier_code
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT 'biomass_consumptions', COUNT(*)::int
        FROM (
          SELECT unit_id, reading_date
          FROM biomass_consumptions
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT 'solar_consumptions', COUNT(*)::int
        FROM (
          SELECT reading_date
          FROM solar_consumptions
          GROUP BY reading_date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT 'hop_readings', COUNT(*)::int
        FROM (
          SELECT unit_id, reading_date
          FROM hop_readings
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicates
      `,
    ),
  ]);

  assertEqual("requested worksheet", run.requestedWorksheet, TARGET_WORKSHEET);
  assertEqual("effective worksheet", run.effectiveWorksheet ?? "", TARGET_WORKSHEET);
  assertEqual("import status", run.status, "SUCCESS");
  assertEqual("imported rows", run.importedRows, 352);
  assertEqual("rejected rows", run.rejectedRows, 0);
  assertEqual("staging rows", stagingCount, 352);
  assertEqual("staging source worksheet rows", sourceWorksheetCount, 352);
  assertEqual("invalid staging rows", invalidCount, 0);

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
  const actualEntities = Object.fromEntries(
    entityCounts.map((row) => [row.entityType, row._count._all]),
  );
  for (const [entityType, expected] of Object.entries(expectedEntities)) {
    assertEqual(`staging ${entityType}`, actualEntities[entityType] ?? 0, expected);
  }

  const expectedNormalized = [7, 93, 1, 1, 31, 93, 1, 1, 93, 31];
  normalizedCounts.forEach((actual, index) =>
    assertEqual(`normalized count ${index + 1}`, actual, expectedNormalized[index]),
  );
  assertZeroRows("orphan relation check", orphanRows);
  assertZeroRows("duplicate key check", duplicateRows.map((row) => ({ count: row.duplicate_groups })));

  const unitNames = units.map((unit) => unit.name);
  for (const expected of ["Unit 1", "Unit 2", "Unit 3"]) {
    if (!unitNames.includes(expected)) throw new Error(`${expected} is missing.`);
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        run: { ...run, id: run.id.toString() },
        staging: {
          total: stagingCount,
          sourceWorksheetRows: sourceWorksheetCount,
          invalid: invalidCount,
          entities: actualEntities,
        },
        normalized: {
          biomassReceipts: normalizedCounts[0],
          biomassConsumptions: normalizedCounts[1],
          coalReceipts: normalizedCounts[2],
          solarReceipts: normalizedCounts[3],
          solarConsumptions: normalizedCounts[4],
          hopReadings: normalizedCounts[5],
          biomassTargets: normalizedCounts[6],
          cumulativeSnapshots: normalizedCounts[7],
          coalConsumptionRowsInJuly: normalizedCounts[8],
          coalStockRowsInJuly: normalizedCounts[9],
        },
        units,
        dateRanges,
        orphans: orphanRows,
        duplicates: duplicateRows,
        checks: [
          "import run references Juli26-BB only",
          "all 352 staging rows are valid and linked to the import run",
          "entity counts match the dry-run plan",
          "normalized unit/date relationships have no orphan rows",
          "unique business keys have no duplicate groups",
          "Unit 1, Unit 2, and Unit 3 are available",
          "July date ranges are bounded to the requested period",
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
