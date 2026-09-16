import "server-only";

import { Prisma } from "@prisma/client";

import type {
  BiomassCumulativeImportRecord,
  BiomassConsumptionImportRecord,
  BiomassReceiptImportRecord,
  CoalConsumptionImportRecord,
  CoalReceiptImportRecord,
  CoalStockImportRecord,
  GoogleSheetsImportPlan,
  HopImportRecord,
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "./types";

type UnitNumber = 1 | 2 | 3;
type UnitIds = ReadonlyMap<UnitNumber, bigint>;
type TransactionClient = Prisma.TransactionClient;

export const IMPORT_TRANSACTION_BATCH_SIZE = 200;

function decimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(String(value));
}

function decimalAtScale(value: number | null, scale: number) {
  return decimal(value)?.toDecimalPlaces(scale) ?? null;
}

function valuesFor<T>(rows: readonly T[], toSql: (row: T) => Prisma.Sql) {
  return Prisma.join(rows.map(toSql));
}

async function executeBulkStatements<T>(
  tx: TransactionClient,
  rows: readonly T[],
  buildQuery: (rows: readonly T[]) => Prisma.Sql,
) {
  let statementCount = 0;
  for (
    let offset = 0;
    offset < rows.length;
    offset += IMPORT_TRANSACTION_BATCH_SIZE
  ) {
    const batch = rows.slice(offset, offset + IMPORT_TRANSACTION_BATCH_SIZE);
    await tx.$executeRaw(buildQuery(batch));
    statementCount += 1;
  }
  return statementCount;
}

function biomassReceiptQuery(
  rows: readonly BiomassReceiptImportRecord[],
  importRunId: bigint,
) {
  return Prisma.sql`
    INSERT INTO "biomass_receipts"
      ("import_run_id", "period_start", "supplier_code", "supplier_name",
       "quantity_ton", "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => Prisma.sql`
      (${importRunId}, ${row.periodStart}::date, ${row.supplierCode},
       ${row.supplierName}, ${decimal(row.quantityTon)},
       ${row.source.worksheet}, ${row.source.cell}, CURRENT_TIMESTAMP)
    `)}
    ON CONFLICT ("period_start", "supplier_code") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "supplier_name" = EXCLUDED."supplier_name",
      "quantity_ton" = EXCLUDED."quantity_ton",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function coalReceiptQuery(
  rows: readonly CoalReceiptImportRecord[],
  importRunId: bigint,
) {
  return Prisma.sql`
    INSERT INTO "coal_receipts"
      ("import_run_id", "period_start", "quantity_ton",
       "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => Prisma.sql`
      (${importRunId}, ${row.periodStart}::date, ${decimal(row.quantityTon)},
       ${row.source.worksheet}, ${row.source.cell}, CURRENT_TIMESTAMP)
    `)}
    ON CONFLICT ("period_start") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "quantity_ton" = EXCLUDED."quantity_ton",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function coalConsumptionQuery(
  rows: readonly CoalConsumptionImportRecord[],
  unitIds: UnitIds,
) {
  return Prisma.sql`
    INSERT INTO "coal_consumption"
      ("unit_id", "date", "coal_used")
    VALUES ${valuesFor(rows, (row) => {
      const unitId = unitIds.get(row.unitNumber);
      if (unitId === undefined)
        throw new Error(`Unit ${row.unitNumber} is not available.`);
      return Prisma.sql`
        (${unitId}, ${row.readingDate}::date,
         ${decimalAtScale(row.quantityTon, 2)})
      `;
    })}
    ON CONFLICT ("unit_id", "date") DO UPDATE SET
      "coal_used" = EXCLUDED."coal_used"
  `;
}

function writableCoalStockRows(rows: readonly CoalStockImportRecord[]) {
  return rows.filter(
    (row) => row.closingStock !== null && row.consumed !== null,
  );
}

function coalStockQuery(rows: readonly CoalStockImportRecord[]) {
  return Prisma.sql`
    INSERT INTO "coal_stock"
        ("date", "consumed", "closing_stock")
      VALUES ${valuesFor(rows, (row) => Prisma.sql`
        (${row.readingDate}::date, ${decimalAtScale(row.consumed, 2)},
         ${decimalAtScale(row.closingStock, 2)})
      `)}
      ON CONFLICT ("date") DO UPDATE SET
        "consumed" = EXCLUDED."consumed",
        "closing_stock" = EXCLUDED."closing_stock"
    `;
}

function biomassConsumptionQuery(
  rows: readonly BiomassConsumptionImportRecord[],
  importRunId: bigint,
  unitIds: UnitIds,
) {
  return Prisma.sql`
    INSERT INTO "biomass_consumptions"
      ("import_run_id", "unit_id", "reading_date", "quantity_ton",
       "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => {
      const unitId = unitIds.get(row.unitNumber);
      if (unitId === undefined)
        throw new Error(`Unit ${row.unitNumber} is not available.`);
      return Prisma.sql`
        (${importRunId}, ${unitId}, ${row.readingDate}::date,
         ${decimal(row.quantityTon)}, ${row.source.worksheet},
         ${row.source.cell}, CURRENT_TIMESTAMP)
      `;
    })}
    ON CONFLICT ("unit_id", "reading_date") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "quantity_ton" = EXCLUDED."quantity_ton",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function solarConsumptionQuery(
  rows: readonly SolarConsumptionImportRecord[],
  importRunId: bigint,
) {
  return Prisma.sql`
    INSERT INTO "solar_consumptions"
      ("import_run_id", "reading_date", "quantity_liter",
       "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => Prisma.sql`
      (${importRunId}, ${row.readingDate}::date,
       ${decimal(row.quantityLiter)}, ${row.source.worksheet},
       ${row.source.cell}, CURRENT_TIMESTAMP)
    `)}
    ON CONFLICT ("reading_date") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "quantity_liter" = EXCLUDED."quantity_liter",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function solarReceiptQuery(
  rows: readonly SolarReceiptImportRecord[],
  importRunId: bigint,
) {
  return Prisma.sql`
    INSERT INTO "solar_receipts"
      ("import_run_id", "period_start", "quantity_liter",
       "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => Prisma.sql`
      (${importRunId}, ${row.periodStart}::date,
       ${decimal(row.quantityLiter)}, ${row.source.worksheet},
       ${row.source.cell}, CURRENT_TIMESTAMP)
    `)}
    ON CONFLICT ("period_start") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "quantity_liter" = EXCLUDED."quantity_liter",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function hopQuery(
  rows: readonly HopImportRecord[],
  importRunId: bigint,
  unitIds: UnitIds,
) {
  return Prisma.sql`
    INSERT INTO "hop_readings"
      ("import_run_id", "unit_id", "reading_date", "hop_days",
       "source_worksheet", "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => {
      const unitId = unitIds.get(row.unitNumber);
      if (unitId === undefined)
        throw new Error(`Unit ${row.unitNumber} is not available.`);
      return Prisma.sql`
        (${importRunId}, ${unitId}, ${row.readingDate}::date,
         ${decimalAtScale(row.hopDays, 2)}, ${row.source.worksheet},
         ${row.source.cell}, CURRENT_TIMESTAMP)
      `;
    })}
    ON CONFLICT ("unit_id", "reading_date") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "hop_days" = EXCLUDED."hop_days",
      "source_worksheet" = EXCLUDED."source_worksheet",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

function cumulativeQuery(
  rows: readonly BiomassCumulativeImportRecord[],
  importRunId: bigint,
) {
  return Prisma.sql`
    INSERT INTO "biomass_cumulative_snapshots"
      ("import_run_id", "period_start", "cumulative_ton", "source",
       "source_cell", "updated_at")
    VALUES ${valuesFor(rows, (row) => Prisma.sql`
      (${importRunId}, ${row.periodStart}::date,
       ${decimal(row.cumulativeTon)},
       ${`Google Sheets ${row.source.worksheet}`}, ${row.source.cell},
       CURRENT_TIMESTAMP)
    `)}
    ON CONFLICT ("period_start") DO UPDATE SET
      "import_run_id" = EXCLUDED."import_run_id",
      "cumulative_ton" = EXCLUDED."cumulative_ton",
      "source" = EXCLUDED."source",
      "source_cell" = EXCLUDED."source_cell",
      "updated_at" = CURRENT_TIMESTAMP
  `;
}

/**
 * Persists the row-heavy normalized portion of one import with one
 * parameterized statement per target table. The caller keeps all statements
 * in its surrounding transaction so staging, normalized rows, and audit
 * finalization still commit or roll back together.
 */
export async function upsertBulkNormalizedRows(
  tx: TransactionClient,
  plan: GoogleSheetsImportPlan,
  importRunId: bigint,
  unitIds: UnitIds,
) {
  let statementCount = 0;
  statementCount += await executeBulkStatements(
    tx,
    plan.receiptRows,
    (rows) => biomassReceiptQuery(rows, importRunId),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.coalReceiptRows,
    (rows) => coalReceiptQuery(rows, importRunId),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.coalConsumptionRows,
    (rows) => coalConsumptionQuery(rows, unitIds),
  );
  const coalStockRows = writableCoalStockRows(plan.coalStockRows);
  statementCount += await executeBulkStatements(
    tx,
    coalStockRows,
    (rows) => coalStockQuery(rows),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.biomassConsumptionRows,
    (rows) => biomassConsumptionQuery(rows, importRunId, unitIds),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.solarConsumptionRows,
    (rows) => solarConsumptionQuery(rows, importRunId),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.solarReceiptRows,
    (rows) => solarReceiptQuery(rows, importRunId),
  );
  statementCount += await executeBulkStatements(
    tx,
    plan.hopRows,
    (rows) => hopQuery(rows, importRunId, unitIds),
  );
  return statementCount;
}

export async function upsertBulkCumulativeRows(
  tx: TransactionClient,
  rows: readonly BiomassCumulativeImportRecord[],
  importRunId: bigint,
) {
  return executeBulkStatements(tx, rows, (batch) =>
    cumulativeQuery(batch, importRunId),
  );
}
