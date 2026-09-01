import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const expectedTables = [
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
];

try {
  const [tables, units, counts, migrationRows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(expectedTables)})
      ORDER BY table_name
    `),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true, status: true },
    }),
    Promise.all([
      prisma.spreadsheetImportRun.count(),
      prisma.spreadsheetImportStaging.count(),
      prisma.biomassReceipt.count(),
      prisma.coalReceipt.count(),
      prisma.biomassConsumption.count(),
      prisma.solarReceipt.count(),
      prisma.solarConsumption.count(),
      prisma.hopReading.count(),
      prisma.biomassTarget.count(),
      prisma.biomassCumulativeSnapshot.count(),
    ]),
    prisma.$queryRaw(Prisma.sql`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name IN ('0_baseline_existing_laravel_schema', '20260830140000_add_dashboard_import_domain', '20260830150000_add_coal_receipts')
      ORDER BY migration_name
    `),
  ]);

  const actualTables = tables.map((row) => row.table_name);
  const missingTables = expectedTables.filter(
    (table) => !actualTables.includes(table),
  );
  const unitNames = units.map((unit) => unit.name);
  const expectedUnitNames = ["Unit 1", "Unit 2", "Unit 3"];
  const unitMappingPass = expectedUnitNames.every((name) =>
    unitNames.includes(name),
  );
  const migrationNames = migrationRows.map((row) => row.migration_name);
  const migrationPass =
    migrationNames.includes("0_baseline_existing_laravel_schema") &&
    migrationNames.includes("20260830140000_add_dashboard_import_domain") &&
    migrationNames.includes("20260830150000_add_coal_receipts");
  const allNewTablesEmpty = counts.every((count) => count === 0);

  if (missingTables.length || !unitMappingPass || !migrationPass) {
    throw new Error("Import schema verification failed.");
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        tables: actualTables,
        unitNames,
        counts: {
          spreadsheetImportRuns: counts[0],
          spreadsheetImportStaging: counts[1],
          biomassReceipts: counts[2],
          coalReceipts: counts[3],
          biomassConsumptions: counts[4],
          solarReceipts: counts[5],
          solarConsumptions: counts[6],
          hopReadings: counts[7],
          biomassTargets: counts[8],
          biomassCumulativeSnapshots: counts[9],
        },
        migrationNames,
        checks: {
          allExpectedTablesPresent: true,
          unitsAreUnit1To3: true,
          migrationHistoryPresent: true,
          allNewTablesEmpty,
        },
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
        message: error instanceof Error ? error.message : "Schema verification failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
