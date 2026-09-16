import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import type {
  BiomassConsumptionImportRecord,
  BiomassCumulativeImportRecord,
  BiomassReceiptImportRecord,
  BiomassTargetImportRecord,
  CoalConsumptionImportRecord,
  CoalReceiptImportRecord,
  CoalStockImportRecord,
  GoogleSheetsImportPlan,
  HopImportRecord,
  ImportSource,
  ImportStagingRecord,
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "../src/services/google-sheets/import/types";

const databaseUrl = process.env.DATABASE_URL?.trim();
const disposableMarker = process.env.PHASE6J_DISPOSABLE?.trim();
const parsedDatabaseUrl = new URL(databaseUrl ?? "");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

assert.equal(
  disposableMarker,
  "true",
  "Import transaction verification requires PHASE6J_DISPOSABLE=true.",
);
assert.ok(
  loopbackHosts.has(parsedDatabaseUrl.hostname) &&
    parsedDatabaseUrl.port === "55432" &&
    parsedDatabaseUrl.pathname.replace(/^\//u, "") === "dashboard_pln",
  "Import transaction verification only accepts loopback port 55432 database dashboard_pln.",
);

const { prisma } = await import("../src/lib/prisma");
const {
  commitGoogleSheetsImportPlan,
  IMPORT_TRANSACTION_SAFETY_BUDGET_MS,
} = await import("../src/services/google-sheets/import/commit");

type FixtureContext = {
  month: number;
  periodStart: Date;
  worksheet: string;
};

const JULI_FIXTURE: FixtureContext = {
  month: 7,
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  worksheet: "Juli26-BB",
};
const AGUSTUS_FIXTURE: FixtureContext = {
  month: 8,
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  worksheet: "Agustus26-BB",
};
const YEAR_START = new Date("2026-01-01T00:00:00.000Z");
const SOURCE = "google_sheets_sync";

function dateForDay(day: number, month = JULI_FIXTURE.month) {
  return new Date(Date.UTC(2026, month - 1, day));
}

function source(cell: string, row: number, worksheet: string): ImportSource {
  return { worksheet, cell, row };
}

function staging(input: {
  entityType: string;
  source: ImportSource;
  periodStart?: Date | null;
  readingDate?: Date | null;
  unitCode?: string | null;
  supplierCode?: string | null;
  value: number | null;
  unit: string;
}): ImportStagingRecord {
  return {
    entityType: input.entityType,
    source: input.source,
    periodStart: input.periodStart ?? null,
    readingDate: input.readingDate ?? null,
    unitCode: input.unitCode ?? null,
    supplierCode: input.supplierCode ?? null,
    rawValue: input.value === null ? null : String(input.value),
    normalizedValue: input.value,
    valueUnit: input.unit,
    validationStatus: input.value === null ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  };
}

function buildFixture(context: FixtureContext): GoogleSheetsImportPlan {
  const sourceFor = (cell: string, row: number) =>
    source(cell, row, context.worksheet);
  const receiptRows: BiomassReceiptImportRecord[] = [
    "sawdust-pt-syahroni",
    "sawdust-pt-bintang",
    "woodchip-pt-syahroni",
    "woodchip-pt-rap",
    "woodchip-cv-multi-paketindo",
    "lruk",
    "srf",
  ].map((supplierCode, index) => ({
    periodStart: context.periodStart,
    supplierCode,
    supplierName: supplierCode,
    quantityTon: 100 + index,
    source: sourceFor(`C${index + 1}`, 50),
  }));
  const coalReceiptRows: CoalReceiptImportRecord[] = [
    {
      periodStart: context.periodStart,
      quantityTon: 1_000,
      source: sourceFor("I42", 42),
    },
  ];
  const coalConsumptionRows: CoalConsumptionImportRecord[] = [];
  const coalStockRows: CoalStockImportRecord[] = [];
  const biomassConsumptionRows: BiomassConsumptionImportRecord[] = [];
  const solarConsumptionRows: SolarConsumptionImportRecord[] = [];
  const hopRows: HopImportRecord[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const readingDate = dateForDay(day, context.month);
    coalStockRows.push({
      readingDate,
      closingStock: 2_000 + day,
      consumed: 300 + day,
      source: sourceFor(`K${day}`, 10 + day),
    });
    solarConsumptionRows.push({
      readingDate,
      quantityLiter: day === 31 ? null : 700 + day,
      source: sourceFor(`CJ${10 + day}`, 10 + day),
    });
    for (const unitNumber of [1, 2, 3] as const) {
      coalConsumptionRows.push({
        readingDate,
        unitNumber,
        quantityTon: 10 * unitNumber + day / 100,
        source: sourceFor(`D${day}-${unitNumber}`, 10 + day),
      });
      biomassConsumptionRows.push({
        readingDate,
        unitNumber,
        quantityTon: 20 * unitNumber + day / 100,
        source: sourceFor(`E${day}-${unitNumber}`, 10 + day),
      });
      hopRows.push({
        readingDate,
        unitNumber,
        hopDays: 1 + unitNumber / 10,
        source: sourceFor(`F${day}-${unitNumber}`, 10 + day),
      });
    }
  }
  const solarReceiptRows: SolarReceiptImportRecord[] = [
    {
      periodStart: context.periodStart,
      quantityLiter: 25_000,
      source: sourceFor("Y69", 69),
    },
  ];
  const targetRows: BiomassTargetImportRecord[] = [
    {
      targetYear: 2026,
      targetTon: 70_020,
      source: sourceFor("Y70", 70),
    },
  ];
  const cumulativeRows: BiomassCumulativeImportRecord[] = [
    {
      periodStart: context.periodStart,
      cumulativeTon: 29_103.77,
      source: sourceFor("Y71", 71),
    },
  ];

  const stagingRows: ImportStagingRecord[] = [
    ...receiptRows.map((row) =>
      staging({
        entityType: "biomass_receipt",
        source: row.source,
        periodStart: row.periodStart,
        supplierCode: row.supplierCode,
        value: row.quantityTon,
        unit: "ton",
      }),
    ),
    ...coalReceiptRows.map((row) =>
      staging({
        entityType: "coal_receipt",
        source: row.source,
        periodStart: row.periodStart,
        value: row.quantityTon,
        unit: "ton",
      }),
    ),
    ...coalConsumptionRows.map((row) =>
      staging({
        entityType: "coal_consumption",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.quantityTon,
        unit: "ton",
      }),
    ),
    ...coalStockRows.map((row) =>
      staging({
        entityType: "coal_stock",
        source: row.source,
        readingDate: row.readingDate,
        value: row.closingStock,
        unit: "ton",
      }),
    ),
    ...biomassConsumptionRows.map((row) =>
      staging({
        entityType: "biomass_consumption",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.quantityTon,
        unit: "ton",
      }),
    ),
    ...solarConsumptionRows.map((row) =>
      staging({
        entityType: "solar_consumption",
        source: row.source,
        readingDate: row.readingDate,
        value: row.quantityLiter,
        unit: "liter",
      }),
    ),
    ...solarReceiptRows.map((row) =>
      staging({
        entityType: "solar_receipt",
        source: row.source,
        periodStart: row.periodStart,
        value: row.quantityLiter,
        unit: "liter",
      }),
    ),
    ...hopRows.map((row) =>
      staging({
        entityType: "hop_reading",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.hopDays,
        unit: "hari",
      }),
    ),
    ...targetRows.map((row) =>
      staging({
        entityType: "biomass_target",
        source: row.source,
        periodStart: YEAR_START,
        value: row.targetTon,
        unit: "ton",
      }),
    ),
    ...cumulativeRows.map((row) =>
      staging({
        entityType: "biomass_cumulative",
        source: row.source,
        periodStart: row.periodStart,
        value: row.cumulativeTon,
        unit: "ton",
      }),
    ),
  ];

  assert.equal(stagingRows.length, 352);
  return {
    requested: {
      month: context.month,
      year: 2026,
      worksheet: context.worksheet,
    },
    effective: {
      month: context.month,
      year: 2026,
      worksheet: context.worksheet,
    },
    sourceRange: "A1:ZZ500",
    status: "READY_FOR_IMPORT",
    blockingIssues: [],
    warnings: [],
    requestedPeriod: context.periodStart,
    effectivePeriod: context.periodStart,
    receiptRows,
    coalReceiptRows,
    coalConsumptionRows,
    coalStockRows,
    biomassConsumptionRows,
    solarConsumptionRows,
    solarReceiptRows,
    hopRows,
    targetRows,
    cumulativeRows,
    stagingRows,
    summary: {
      dailyRows: 31,
      receiptRows: receiptRows.length,
      coalReceiptRows: coalReceiptRows.length,
      coalConsumptionRows: coalConsumptionRows.length,
      coalStockRows: coalStockRows.length,
      biomassConsumptionRows: biomassConsumptionRows.length,
      solarConsumptionRows: solarConsumptionRows.length,
      solarReceiptRows: solarReceiptRows.length,
      hopRows: hopRows.length,
      targetRows: targetRows.length,
      cumulativeRows: cumulativeRows.length,
      totalRows: stagingRows.length,
    },
  };
}

async function normalizedCounts() {
  const counts = await Promise.all([
    prisma.spreadsheetImportStaging.count(),
    prisma.biomassReceipt.count(),
    prisma.coalReceipt.count(),
    prisma.coalConsumption.count(),
    prisma.coalStock.count(),
    prisma.biomassConsumption.count(),
    prisma.solarConsumption.count(),
    prisma.solarReceipt.count(),
    prisma.hopReading.count(),
    prisma.biomassTarget.count(),
    prisma.biomassCumulativeSnapshot.count(),
  ]);
  return counts;
}

async function duplicateKeyGroups() {
  const rows = await prisma.$queryRaw<{ duplicate_groups: bigint }[]>(
    Prisma.sql`
      SELECT COALESCE(SUM(duplicate_groups), 0)::bigint AS duplicate_groups
      FROM (
        SELECT COUNT(*)::bigint AS duplicate_groups
        FROM (
          SELECT period_start, supplier_code
          FROM biomass_receipts
          GROUP BY period_start, supplier_code
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM coal_receipts
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, date
          FROM coal_consumption
          GROUP BY unit_id, date
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT date
          FROM coal_stock
          GROUP BY date
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, reading_date
          FROM biomass_consumptions
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT reading_date
          FROM solar_consumptions
          GROUP BY reading_date
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM solar_receipts
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, reading_date
          FROM hop_readings
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT target_year
          FROM biomass_targets
          GROUP BY target_year
          HAVING COUNT(*) > 1
        ) duplicate_groups
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM biomass_cumulative_snapshots
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicate_groups
      ) duplicate_key_groups
    `,
  );
  return Number(rows[0]?.duplicate_groups ?? BigInt(0));
}

function withChangedBiomassValue(plan: GoogleSheetsImportPlan) {
  const changedValue = 999;
  const biomassConsumptionRows = plan.biomassConsumptionRows.map((row, index) =>
    index === 0 ? { ...row, quantityTon: changedValue } : row,
  );
  const stagingRows = plan.stagingRows.map((row) =>
    row.entityType === "biomass_consumption" &&
    row.readingDate?.getUTCDate() === 1 &&
    row.unitCode === "UNIT-1"
      ? { ...row, rawValue: String(changedValue), normalizedValue: changedValue }
      : row,
  );
  return { ...plan, biomassConsumptionRows, stagingRows };
}

function withChangedTarget(plan: GoogleSheetsImportPlan) {
  const changedValue = 70_021;
  const targetRows = plan.targetRows.map((row) => ({
    ...row,
    targetTon: changedValue,
  }));
  const stagingRows = plan.stagingRows.map((row) =>
    row.entityType === "biomass_target"
      ? { ...row, rawValue: String(changedValue), normalizedValue: changedValue }
      : row,
  );
  return { ...plan, targetRows, stagingRows };
}

try {
  const initialCounts = await normalizedCounts();
  assert.deepEqual(
    initialCounts,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "The disposable import target must start empty.",
  );
  await prisma.unit.createMany({
    data: [1, 2, 3].map((number) => ({
      code: `PLTU-${number}`,
      name: `Unit ${number}`,
      status: true,
    })),
  });

  const juliPlan = buildFixture(JULI_FIXTURE);
  const first = await commitGoogleSheetsImportPlan(juliPlan, {
    databaseTarget: "LOCAL",
    source: SOURCE,
  });
  assert.equal(first.status, "SUCCESS");
  const firstWithMetrics = first as typeof first & {
    transactionDurationMs?: unknown;
    transactionStatementCount?: unknown;
  };
  assert.equal(typeof firstWithMetrics.transactionDurationMs, "number");
  assert.equal(typeof firstWithMetrics.transactionStatementCount, "number");
  assert.ok(
    Number(firstWithMetrics.transactionDurationMs) <=
      IMPORT_TRANSACTION_SAFETY_BUDGET_MS,
  );
  assert.equal(Number(firstWithMetrics.transactionStatementCount), 14);
  assert.deepEqual(
    await normalizedCounts(),
    [352, 7, 1, 93, 31, 93, 31, 1, 93, 1, 1],
  );

  const repeated = await commitGoogleSheetsImportPlan(juliPlan, {
    databaseTarget: "LOCAL",
    source: SOURCE,
  });
  assert.equal(repeated.status, "SUCCESS");
  assert.equal(repeated.importRunId, first.importRunId);
  assert.equal(await prisma.spreadsheetImportRun.count(), 1);
  assert.deepEqual(
    await normalizedCounts(),
    [352, 7, 1, 93, 31, 93, 31, 1, 93, 1, 1],
  );

  const agustusPlan = buildFixture(AGUSTUS_FIXTURE);
  const agustusFirst = await commitGoogleSheetsImportPlan(agustusPlan, {
    databaseTarget: "LOCAL",
    source: SOURCE,
  });
  assert.equal(agustusFirst.status, "SUCCESS");
  const agustusWithMetrics = agustusFirst as typeof agustusFirst & {
    transactionDurationMs?: unknown;
    transactionStatementCount?: unknown;
  };
  assert.equal(typeof agustusWithMetrics.transactionDurationMs, "number");
  assert.equal(typeof agustusWithMetrics.transactionStatementCount, "number");
  assert.ok(
    Number(agustusWithMetrics.transactionDurationMs) <=
      IMPORT_TRANSACTION_SAFETY_BUDGET_MS,
  );
  assert.equal(Number(agustusWithMetrics.transactionStatementCount), 14);
  assert.deepEqual(
    await normalizedCounts(),
    [704, 14, 2, 186, 62, 186, 62, 2, 186, 1, 2],
  );

  const repeatedAgustus = await commitGoogleSheetsImportPlan(agustusPlan, {
    databaseTarget: "LOCAL",
    source: SOURCE,
  });
  assert.equal(repeatedAgustus.status, "SUCCESS");
  assert.equal(repeatedAgustus.importRunId, agustusFirst.importRunId);
  assert.equal(await prisma.spreadsheetImportRun.count(), 2);
  assert.deepEqual(
    await normalizedCounts(),
    [704, 14, 2, 186, 62, 186, 62, 2, 186, 1, 2],
  );

  const changed = await commitGoogleSheetsImportPlan(
    withChangedBiomassValue(juliPlan),
    { databaseTarget: "LOCAL", source: SOURCE },
  );
  assert.equal(changed.status, "SUCCESS");
  assert.notEqual(changed.importRunId, first.importRunId);
  assert.equal(await prisma.spreadsheetImportRun.count(), 3);
  const changedRow = await prisma.biomassConsumption.findFirst({
    where: { readingDate: dateForDay(1, JULI_FIXTURE.month) },
    orderBy: { unitId: "asc" },
    select: { quantityTon: true },
  });
  assert.equal(Number(changedRow?.quantityTon), 999);
  const emptySolarRow = await prisma.solarConsumption.findUnique({
    where: { readingDate: dateForDay(31, JULI_FIXTURE.month) },
    select: { quantityLiter: true },
  });
  assert.equal(emptySolarRow?.quantityLiter, null);

  const beforeFailure = await normalizedCounts();
  await assert.rejects(
    commitGoogleSheetsImportPlan(withChangedTarget(agustusPlan), {
      databaseTarget: "LOCAL",
      source: SOURCE,
    }),
    /differs from approved target/u,
  );
  assert.deepEqual(await normalizedCounts(), beforeFailure);
  const failedRun = await prisma.spreadsheetImportRun.findFirst({
    where: { status: "FAILED" },
    orderBy: { id: "desc" },
    select: { status: true, importedRows: true, rejectedRows: true },
  });
  assert.deepEqual(failedRun, {
    status: "FAILED",
    importedRows: 0,
    rejectedRows: 352,
  });
  const finalCounts = await normalizedCounts();
  assert.deepEqual(finalCounts, [1056, 14, 2, 186, 62, 186, 62, 2, 186, 1, 2]);
  const duplicateRows = await duplicateKeyGroups();
  assert.equal(duplicateRows, 0);

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        target: "DISPOSABLE_LOOPBACK_POSTGRESQL",
        firstImport: {
          worksheet: JULI_FIXTURE.worksheet,
          importRunId: first.importRunId,
          transactionDurationMs: firstWithMetrics.transactionDurationMs,
          transactionStatementCount: firstWithMetrics.transactionStatementCount,
        },
        agustusImport: {
          worksheet: AGUSTUS_FIXTURE.worksheet,
          importRunId: agustusFirst.importRunId,
          transactionDurationMs: agustusWithMetrics.transactionDurationMs,
          transactionStatementCount:
            agustusWithMetrics.transactionStatementCount,
        },
        repeatedImport: {
          importRunId: repeated.importRunId,
          duplicateRows,
        },
        changedImport: { importRunId: changed.importRunId },
        rollback: { failedRun: true, normalizedStateUnchanged: true },
        counts: finalCounts,
        checks: [
          "Juli26-BB and Agustus26-BB 352-record imports complete within the safety budget",
          "bulk transaction statement count stays bounded",
          "exact repeats reuse the successful import run for both worksheets",
          "changed stable keys update existing normalized rows",
          "nullable normalized values remain NULL",
          "post-write target validation rolls back staging and normalized rows",
          "failed import metadata remains persisted outside the transaction",
          "all normalized business-key duplicate groups remain at zero",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
