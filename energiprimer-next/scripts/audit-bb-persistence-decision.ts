import { Prisma, PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

import { readAndParseDynamicWorksheet, DYNAMIC_SCAN_RANGE } from "../src/services/google-sheets/dynamic/reader";
import { parseNumericValue } from "../src/services/google-sheets/dynamic/validators";
import { buildGoogleSheetsImportPlanFromReadResult } from "../src/services/google-sheets/import/plan";

const prisma = new PrismaClient();
const CANONICAL_WORKSHEET = "Juli26-BB";

const DOMAIN_TABLES = [
  "units",
  "coal_stock",
  "coal_quality",
  "coal_consumption",
  "power_generation",
  "kpi_targets",
  "biomass_receipts",
  "biomass_consumptions",
  "coal_receipts",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
  "spreadsheet_import_runs",
  "spreadsheet_import_staging",
  "sync_sources",
  "sync_worksheets",
  "sync_runs",
  "sync_row_states",
  "sync_schema_changes",
] as const;

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  column_name: string | null;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
};

type IndexRow = {
  tablename: string;
  indexname: string;
  indexdef: string;
};

function jsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function cellAt(
  cells: readonly { row: number; column: number; rawValue: string | number | null }[],
  row: number,
  column: number,
) {
  return cells.find((cell) => cell.row === row && cell.column === column) ?? null;
}

async function databaseAudit() {
  const [database, columns, constraints, indexes, counts, units, orphanRows, coalStockRows] =
    await Promise.all([
      prisma.$queryRaw<{ database_name: string; schema_name: string }[]>(
        Prisma.sql`SELECT current_database() AS database_name, current_schema() AS schema_name`,
      ),
      prisma.$queryRaw<ColumnRow[]>(Prisma.sql`
        SELECT table_name, column_name, data_type, is_nullable,
               numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (${Prisma.join(DOMAIN_TABLES)})
        ORDER BY table_name, ordinal_position
      `),
      prisma.$queryRaw<ConstraintRow[]>(Prisma.sql`
        SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
               kcu.column_name,
               ccu.table_name AS foreign_table_name,
               ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name IN (${Prisma.join(DOMAIN_TABLES)})
        ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name,
                 kcu.ordinal_position
      `),
      prisma.$queryRaw<IndexRow[]>(Prisma.sql`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (${Prisma.join(DOMAIN_TABLES)})
        ORDER BY tablename, indexname
      `),
      Promise.all([
        prisma.unit.count(),
        prisma.coalQuality.count(),
        prisma.coalConsumption.count(),
        prisma.coalStock.count(),
        prisma.powerGeneration.count(),
        prisma.kpiTarget.count(),
        prisma.biomassReceipt.count(),
        prisma.biomassConsumption.count(),
        prisma.coalReceipt.count(),
        prisma.solarReceipt.count(),
        prisma.solarConsumption.count(),
        prisma.hopReading.count(),
        prisma.biomassTarget.count(),
        prisma.biomassCumulativeSnapshot.count(),
        prisma.spreadsheetImportRun.count(),
        prisma.spreadsheetImportStaging.count(),
        prisma.syncSource.count(),
        prisma.syncWorksheet.count(),
        prisma.syncRun.count(),
        prisma.syncRowState.count(),
        prisma.syncSchemaChange.count(),
      ]),
      prisma.unit.findMany({
        orderBy: { name: "asc" },
        select: { code: true, name: true, status: true },
      }),
      prisma.$queryRaw<{ table_name: string; count: number }[]>(Prisma.sql`
        SELECT 'coal_quality' AS table_name, COUNT(*)::int AS count
        FROM coal_quality cq LEFT JOIN units u ON u.id = cq.unit_id
        WHERE u.id IS NULL
        UNION ALL
        SELECT 'coal_consumption', COUNT(*)::int
        FROM coal_consumption cc LEFT JOIN units u ON u.id = cc.unit_id
        WHERE u.id IS NULL
        UNION ALL
        SELECT 'biomass_consumptions', COUNT(*)::int
        FROM biomass_consumptions bc LEFT JOIN units u ON u.id = bc.unit_id
        WHERE u.id IS NULL
        UNION ALL
        SELECT 'hop_readings', COUNT(*)::int
        FROM hop_readings hr LEFT JOIN units u ON u.id = hr.unit_id
        WHERE u.id IS NULL
      `),
      prisma.coalStock.findMany({
        where: {
          date: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
        orderBy: { date: "asc" },
        select: {
          date: true,
          openingStock: true,
          received: true,
          consumed: true,
          closingStock: true,
        },
      }),
    ]);

  return {
    database: database[0] ?? null,
    columns,
    constraints,
    indexes,
    counts: {
      units: counts[0],
      coalQuality: counts[1],
      coalConsumption: counts[2],
      coalStock: counts[3],
      powerGeneration: counts[4],
      kpiTargets: counts[5],
      biomassReceipts: counts[6],
      biomassConsumptions: counts[7],
      coalReceipts: counts[8],
      solarReceipts: counts[9],
      solarConsumptions: counts[10],
      hopReadings: counts[11],
      biomassTargets: counts[12],
      cumulativeSnapshots: counts[13],
      importRuns: counts[14],
      stagingRows: counts[15],
      syncSources: counts[16],
      syncWorksheets: counts[17],
      syncRuns: counts[18],
      syncRowStates: counts[19],
      schemaChanges: counts[20],
    },
    units,
    orphanRows,
    coalStockRows,
  };
}

async function canonicalAudit() {
  const read = await readAndParseDynamicWorksheet(CANONICAL_WORKSHEET, DYNAMIC_SCAN_RANGE);
  const parsed = read.parsed;
  const plan = buildGoogleSheetsImportPlanFromReadResult(read);
  const structure = parsed.structures[0];
  const stockPaths = (structure?.headerPaths ?? [])
    .filter((path) => path.isStock)
    .map((path) => ({
      header: path.labels.join(" > "),
      column: path.cell.column,
      unitNumber: path.unitNumber,
      resource: path.resource,
    }));
  const stockObservations = stockPaths.map((path) => {
    const values = (structure?.dataRows ?? [])
      .map((row) => cellAt(parsed.scannedCells, row, path.column)?.rawValue ?? null)
      .filter((value) => value !== null && value !== "");
    const numeric = values.filter((value) => parseNumericValue(value).status === "numeric");
    return {
      header: path.header,
      column: path.column,
      nonEmptyCount: values.length,
      numericCount: numeric.length,
      firstValues: values.slice(0, 2),
      lastValues: values.slice(-2),
    };
  });
  const metric = (key: keyof typeof parsed.normalized.metrics) => parsed.normalized.metrics[key];
  const dailyRows = plan.coalStockRows.map((row) => ({
    date: row.readingDate.toISOString().slice(0, 10),
    closingStock: row.closingStock,
    consumed: row.consumed,
    sourceCell: row.source.cell,
  }));
  return {
    worksheet: read.effective.worksheet,
    range: DYNAMIC_SCAN_RANGE,
    parser: {
      scannedCellCount: parsed.diagnostics.scannedCellCount,
      errors: parsed.diagnostics.errors,
      unresolved: parsed.diagnostics.unresolved,
      ambiguous: parsed.diagnostics.ambiguous,
      warnings: parsed.diagnostics.warnings,
    },
    plan: {
      status: plan.status,
      blockingIssues: plan.blockingIssues,
      summary: plan.summary,
    },
    metrics: {
      biomassReceiptMonthly: metric("biomassReceiptMonthly").value,
      biomassConsumptionMonthly: metric("biomassConsumptionMonthly").value,
      biomassTarget: metric("biomassTarget").value,
      biomassCumulative: metric("biomassCumulative").value,
      targetProgress: metric("biomassTargetProgress").value,
    },
    units: [
      metric("biomassUnit1Current").value,
      metric("biomassUnit2Current").value,
      metric("biomassUnit3Current").value,
    ],
    stock: {
      semanticPaths: stockPaths,
      observations: stockObservations,
      importedCoalStockRows: dailyRows,
      equation: {
        openingStock: "NOT_AVAILABLE_IN_CURRENT_IMPORT_PLAN",
        dailyReceipt: "NOT_AVAILABLE; COAL_RECEIPT IS PERIOD-GRAINED",
        consumption: "AVAILABLE_AS_COAL_STOCK_ROW_CONSUMED",
        reportedClosingStock: "AVAILABLE_AS_COAL_STOCK_ROW_CLOSING_STOCK_WHEN_NON_NULL",
        calculatedClosingStock: "NOT_COMPUTABLE_WITHOUT_OPENING_AND_DAILY_RECEIPT_ALLOCATION",
        variance: "NOT_EVALUATED",
      },
    },
  };
}

async function main() {
  const [database, canonical] = await Promise.all([databaseAudit(), canonicalAudit()]);
  const result = {
    status: "PASS_READ_ONLY",
    database,
    canonical,
    databaseWrites: 0,
    schemaChanged: false,
    importPerformed: false,
  };
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({
      status: result.status,
      database: {
        database: database.database,
        counts: database.counts,
        units: database.units,
        orphanRows: database.orphanRows,
        coalStockSamples: [database.coalStockRows[0], database.coalStockRows.at(-1)],
        constraints: database.constraints.map((row) => ({
          table: row.table_name,
          name: row.constraint_name,
          type: row.constraint_type,
          column: row.column_name,
          foreignTable: row.foreign_table_name,
          foreignColumn: row.foreign_column_name,
        })),
        indexes: database.indexes.map((row) => ({
          table: row.tablename,
          name: row.indexname,
        })),
      },
      canonical: {
        worksheet: canonical.worksheet,
        parser: canonical.parser,
        plan: canonical.plan,
        metrics: canonical.metrics,
        units: canonical.units,
        stock: {
          semanticPaths: canonical.stock.semanticPaths,
          observations: canonical.stock.observations.map((row) => ({
            header: row.header,
            column: row.column,
            nonEmptyCount: row.nonEmptyCount,
            numericCount: row.numericCount,
          })),
          importedCoalStockRows: [
            canonical.stock.importedCoalStockRows[0],
            canonical.stock.importedCoalStockRows.at(-1),
          ],
          equation: canonical.stock.equation,
        },
      },
      databaseWrites: result.databaseWrites,
      schemaChanged: result.schemaChanged,
      importPerformed: result.importPerformed,
    }, jsonReplacer, 2));
    return;
  }
  console.log(JSON.stringify(result, jsonReplacer, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL_READ_ONLY",
    category: safeErrorCategory(error),
    databaseWrites: 0,
  }, jsonReplacer, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
