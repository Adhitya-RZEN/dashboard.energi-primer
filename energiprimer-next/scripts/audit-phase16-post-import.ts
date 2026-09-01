import { Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
} from "../src/lib/google-sheets";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import {
  DYNAMIC_SCAN_RANGE,
  type DynamicWorksheetReadResult,
} from "../src/services/google-sheets/dynamic/reader";
import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import type {
  GoogleSheetsImportPlan,
  ImportStagingRecord,
} from "../src/services/google-sheets/import/types";
import {
  classifySyncRows,
  type ExistingSyncRowState,
} from "../src/services/google-sheets/sync/change-detection";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import {
  buildSchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";

const prisma = new PrismaClient();

const WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
] as const;

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

const REQUEST_DELAY_MS = 1_300;
type UnitNumber = 1 | 2 | 3;
type ValueRecord = { key: string; value: unknown };

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function periodStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function periodEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

function asDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(String(value));
}

function rounded(value: unknown, scale: number) {
  return asDecimal(value)?.toDecimalPlaces(scale) ?? null;
}

function sumDecimal(values: readonly unknown[]) {
  let total = new Prisma.Decimal(0);
  let present = 0;
  for (const value of values) {
    const decimal = asDecimal(value);
    if (!decimal) continue;
    total = total.plus(decimal);
    present += 1;
  }
  return present ? total : null;
}

function sumStored(values: readonly unknown[], scale: number) {
  return sumDecimal(values.map((value) => rounded(value, scale)));
}

function equalDecimal(left: unknown, right: unknown) {
  const leftDecimal = asDecimal(left);
  const rightDecimal = asDecimal(right);
  if (!leftDecimal || !rightDecimal) return leftDecimal === rightDecimal;
  return leftDecimal.eq(rightDecimal);
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return dateKey(value);
  if (Array.isArray(value)) return value.map((item) => serializeValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
    );
  }
  return value;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function unitNumber(
  name: string | null | undefined,
  code: string | null | undefined,
): UnitNumber | null {
  const identity = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  const match = identity.match(/(?:PLTU|UNIT)[\s-]*([123])\b/);
  return match ? (Number(match[1]) as UnitNumber) : null;
}

function safeGoogleError(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) {
    return `${error.code}${error.status === undefined ? "" : ` (HTTP ${error.status})`}`;
  }
  return "unknown";
}

function sourceValueRecords(
  rows: readonly { value: number | null; key: string }[],
): ValueRecord[] {
  return rows.map((row) => ({ key: row.key, value: row.value }));
}

function compareValueRecords(
  source: readonly ValueRecord[],
  database: readonly ValueRecord[],
  storageScale: number,
) {
  const sourceByKey = new Map<string, ValueRecord>();
  const databaseByKey = new Map<string, ValueRecord>();
  const sourceDuplicates: string[] = [];
  const databaseDuplicates: string[] = [];

  for (const row of source) {
    if (sourceByKey.has(row.key)) sourceDuplicates.push(row.key);
    else sourceByKey.set(row.key, row);
  }
  for (const row of database) {
    if (databaseByKey.has(row.key)) databaseDuplicates.push(row.key);
    else databaseByKey.set(row.key, row);
  }

  const missing = [...sourceByKey.keys()].filter((key) => !databaseByKey.has(key));
  const unexpected = [...databaseByKey.keys()].filter((key) => !sourceByKey.has(key));
  const mismatches: Array<{ key: string; source: unknown; database: unknown }> = [];
  for (const [key, sourceRow] of sourceByKey) {
    const databaseRow = databaseByKey.get(key);
    if (!databaseRow) continue;
    if (!equalDecimal(rounded(sourceRow.value, storageScale), databaseRow.value)) {
      if (mismatches.length < 10) {
        mismatches.push({
          key,
          source: serializeValue(rounded(sourceRow.value, storageScale)),
          database: serializeValue(databaseRow.value),
        });
      }
    }
  }

  const sourceSum = sumDecimal(source.map((row) => row.value));
  const expectedStoredSum = sumStored(
    source.map((row) => row.value),
    storageScale,
  );
  const databaseSum = sumDecimal(database.map((row) => row.value));
  const parity =
    sourceDuplicates.length === 0 &&
    databaseDuplicates.length === 0 &&
    missing.length === 0 &&
    unexpected.length === 0 &&
    mismatches.length === 0;

  return {
    sourceRows: source.length,
    databaseRows: database.length,
    sourceSum,
    expectedStoredSum,
    databaseSum,
    differenceFromSource: sourceSum && databaseSum
      ? databaseSum.minus(sourceSum)
      : null,
    sourceDuplicates: [...new Set(sourceDuplicates)],
    databaseDuplicates: [...new Set(databaseDuplicates)],
    missing: missing.slice(0, 20),
    unexpected: unexpected.slice(0, 20),
    mismatches,
    status: parity ? "PASS" : "FAIL",
  };
}

function sourcePlanSummary(plan: GoogleSheetsImportPlan) {
  const period = plan.effectivePeriod;
  const keyDate = (value: Date) => dateKey(value) ?? "";
  return {
    biomassReceipt: sourceValueRecords(
      plan.receiptRows.map((row) => ({
        key: normalize(row.supplierCode),
        value: row.quantityTon,
      })),
    ),
    biomassConsumption: sourceValueRecords(
      plan.biomassConsumptionRows.map((row) => ({
        key: `${keyDate(row.readingDate)}|unit-${row.unitNumber}`,
        value: row.quantityTon,
      })),
    ),
    coalConsumption: sourceValueRecords(
      plan.coalConsumptionRows.map((row) => ({
        key: `${keyDate(row.readingDate)}|unit-${row.unitNumber}`,
        value: row.quantityTon,
      })),
    ),
    coalStock: sourceValueRecords(
      plan.coalStockRows.map((row) => ({
        key: keyDate(row.readingDate) ?? "",
        value: row.closingStock,
      })),
    ),
    coalStockConsumed: sourceValueRecords(
      plan.coalStockRows.map((row) => ({
        key: keyDate(row.readingDate) ?? "",
        value: row.consumed,
      })),
    ),
    solarConsumption: sourceValueRecords(
      plan.solarConsumptionRows.map((row) => ({
        key: keyDate(row.readingDate) ?? "",
        value: row.quantityLiter,
      })),
    ),
    hop: sourceValueRecords(
      plan.hopRows.map((row) => ({
        key: `${keyDate(row.readingDate)}|unit-${row.unitNumber}`,
        value: row.hopDays,
      })),
    ),
    coalReceipt: sourceValueRecords(
      plan.coalReceiptRows.map((row) => ({
        key: keyDate(row.periodStart) ?? "",
        value: row.quantityTon,
      })),
    ),
    solarReceipt: sourceValueRecords(
      plan.solarReceiptRows.map((row) => ({
        key: keyDate(row.periodStart) ?? "",
        value: row.quantityLiter,
      })),
    ),
    target: sourceValueRecords(
      plan.targetRows.map((row) => ({
        key: String(row.targetYear),
        value: row.targetTon,
      })),
    ),
    cumulative: sourceValueRecords(
      plan.cumulativeRows.map((row) => ({
        key: keyDate(row.periodStart) ?? "",
        value: row.cumulativeTon,
      })),
    ),
    period: dateKey(period),
  };
}

async function readSourceWorksheet(title: string) {
  const metadata = parseBBWorksheetName(title);
  if (!metadata) throw new Error(`Invalid requested worksheet: ${title}`);

  const raw = await readGoogleSheetsRange(title, DYNAMIC_SCAN_RANGE);
  const parsed = parseDynamicWorksheet(raw.rows, {
    worksheetName: title,
    month: metadata.month,
    year: metadata.year,
    rowOffset: 1,
    columnOffset: 1,
  });
  const result: DynamicWorksheetReadResult = {
    requested: { month: metadata.month, year: metadata.year, worksheet: title },
    effective: { month: metadata.month, year: metadata.year, worksheet: title },
    isFallback: false,
    fallbackIndex: 0,
    attemptedWorksheets: [title],
    parsed,
  };
  return { rawRows: raw.rows.length, result, plan: buildGoogleSheetsImportPlanFromReadResult(result) };
}

async function readAllSources() {
  const available = await listGoogleSheetsWorksheets();
  const matches = WORKSHEETS.map((requested) => {
    const exact = available.find(
      (worksheet) => normalize(worksheet.title) === normalize(requested),
    );
    const period = parseBBWorksheetName(requested);
    const periodMatches = available.filter((worksheet) => {
      const parsed = parseBBWorksheetName(worksheet.title);
      return parsed?.month === period?.month && parsed?.year === period?.year;
    });
    return {
      requested,
      selected: exact?.title ?? (periodMatches.length === 1 ? periodMatches[0].title : null),
      periodMatchCount: periodMatches.length,
    };
  });

  const sources: Array<{
    requested: string;
    selected: string | null;
    rawRows: number | null;
    result: DynamicWorksheetReadResult | null;
    plan: GoogleSheetsImportPlan | null;
    error: string | null;
    periodMatchCount: number;
  }> = [];
  for (const match of matches) {
    if (!match.selected) {
      sources.push({ ...match, rawRows: null, result: null, plan: null, error: "worksheet_not_found" });
      continue;
    }
    try {
      const read = await readSourceWorksheet(match.selected);
      sources.push({ ...match, ...read, error: null });
    } catch (error) {
      sources.push({
        ...match,
        rawRows: null,
        result: null,
        plan: null,
        error: safeGoogleError(error),
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const periodGroups = new Map<string, string[]>();
  for (const worksheet of available) {
    const parsed = parseBBWorksheetName(worksheet.title);
    if (!parsed) continue;
    const key = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    periodGroups.set(key, [...(periodGroups.get(key) ?? []), worksheet.title]);
  }

  return {
    availableCount: available.length,
    validBBCount: available.filter((worksheet) => parseBBWorksheetName(worksheet.title)).length,
    periodDuplicates: [...periodGroups.entries()]
      .filter(([, titles]) => titles.length > 1)
      .map(([period, titles]) => ({ period, titles })),
    sources,
  };
}

async function readDatabasePeriod(year: number, month: number) {
  const start = periodStart(year, month);
  const end = periodEnd(year, month);
  const [
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    coalConsumptions,
    coalStock,
    solarReceipts,
    solarConsumptions,
    hop,
    target,
    cumulative,
  ] = await Promise.all([
    prisma.biomassReceipt.findMany({
      where: { periodStart: start },
      orderBy: { supplierCode: "asc" },
      select: { supplierCode: true, supplierName: true, quantityTon: true },
    }),
    prisma.biomassConsumption.findMany({
      where: { readingDate: { gte: start, lt: end } },
      orderBy: [{ readingDate: "asc" }, { unitId: "asc" }],
      select: {
        readingDate: true,
        quantityTon: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.coalReceipt.findMany({
      where: { periodStart: start },
      select: { periodStart: true, quantityTon: true },
    }),
    prisma.coalConsumption.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: [{ date: "asc" }, { unitId: "asc" }],
      select: {
        date: true,
        coalUsed: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      select: { date: true, consumed: true, closingStock: true },
    }),
    prisma.solarReceipt.findMany({
      where: { periodStart: start },
      select: { periodStart: true, quantityLiter: true },
    }),
    prisma.solarConsumption.findMany({
      where: { readingDate: { gte: start, lt: end } },
      orderBy: { readingDate: "asc" },
      select: { readingDate: true, quantityLiter: true },
    }),
    prisma.hopReading.findMany({
      where: { readingDate: { gte: start, lt: end } },
      orderBy: [{ readingDate: "asc" }, { unitId: "asc" }],
      select: {
        readingDate: true,
        hopDays: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.biomassTarget.findUnique({
      where: { targetYear: year },
      select: { targetYear: true, targetTon: true },
    }),
    prisma.biomassCumulativeSnapshot.findUnique({
      where: { periodStart: start },
      select: { periodStart: true, cumulativeTon: true },
    }),
  ]);

  return {
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    coalConsumptions,
    coalStock,
    solarReceipts,
    solarConsumptions,
    hop,
    target,
    cumulative,
  };
}

function comparePlanToDatabase(
  plan: GoogleSheetsImportPlan,
  database: Awaited<ReturnType<typeof readDatabasePeriod>>,
) {
  const source = sourcePlanSummary(plan);
  const biomassReceipt = compareValueRecords(
    source.biomassReceipt,
    database.biomassReceipts.map((row) => ({
      key: normalize(row.supplierCode),
      value: row.quantityTon,
    })),
    3,
  );
  const biomassConsumption = compareValueRecords(
    source.biomassConsumption,
    database.biomassConsumptions.map((row) => ({
      key: `${dateKey(row.readingDate) ?? ""}|unit-${unitNumber(row.unit.name, row.unit.code) ?? "unknown"}`,
      value: row.quantityTon,
    })),
    3,
  );
  const coalConsumption = compareValueRecords(
    source.coalConsumption,
    database.coalConsumptions.map((row) => ({
      key: `${dateKey(row.date) ?? ""}|unit-${unitNumber(row.unit.name, row.unit.code) ?? "unknown"}`,
      value: row.coalUsed,
    })),
    2,
  );
  const coalStock = compareValueRecords(
    source.coalStock,
    database.coalStock.map((row) => ({ key: dateKey(row.date) ?? "", value: row.closingStock })),
    2,
  );
  const coalStockConsumed = compareValueRecords(
    source.coalStockConsumed,
    database.coalStock.map((row) => ({ key: dateKey(row.date) ?? "", value: row.consumed })),
    2,
  );
  const solarConsumption = compareValueRecords(
    source.solarConsumption,
    database.solarConsumptions.map((row) => ({ key: dateKey(row.readingDate) ?? "", value: row.quantityLiter })),
    3,
  );
  const hop = compareValueRecords(
    source.hop,
    database.hop.map((row) => ({
      key: `${dateKey(row.readingDate) ?? ""}|unit-${unitNumber(row.unit.name, row.unit.code) ?? "unknown"}`,
      value: row.hopDays,
    })),
    2,
  );
  const coalReceipt = compareValueRecords(
    source.coalReceipt,
    database.coalReceipts.map((row) => ({ key: dateKey(row.periodStart) ?? "", value: row.quantityTon })),
    3,
  );
  const solarReceipt = compareValueRecords(
    source.solarReceipt,
    database.solarReceipts.map((row) => ({ key: dateKey(row.periodStart) ?? "", value: row.quantityLiter })),
    3,
  );
  const target = compareValueRecords(
    source.target,
    database.target
      ? [{ key: String(database.target.targetYear), value: database.target.targetTon }]
      : [],
    3,
  );
  const cumulative = compareValueRecords(
    source.cumulative,
    database.cumulative
      ? [{ key: dateKey(database.cumulative.periodStart) ?? "", value: database.cumulative.cumulativeTon }]
      : [],
    3,
  );

  const domains = {
    biomassReceipt,
    biomassConsumption,
    coalConsumption,
    coalStock,
    coalStockConsumed,
    solarConsumption,
    hop,
    coalReceipt,
    solarReceipt,
    target,
    cumulative,
  };
  const databaseRows =
    database.biomassReceipts.length +
    database.biomassConsumptions.length +
    database.coalReceipts.length +
    database.coalConsumptions.length +
    database.coalStock.length +
    database.solarReceipts.length +
    database.solarConsumptions.length +
    database.hop.length +
    (database.target ? 1 : 0) +
    (database.cumulative ? 1 : 0);

  return {
    source,
    domains,
    sourceRows: plan.summary.totalRows,
    databaseRows,
    rowCountParity: plan.summary.totalRows === databaseRows,
    status: Object.values(domains).every((domain) => domain.status === "PASS") &&
      plan.status === "READY_FOR_IMPORT" &&
      plan.summary.totalRows === databaseRows
      ? "PASS"
      : "FAIL",
  };
}

async function databaseSnapshot() {
  const [
    database,
    units,
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    coalConsumptions,
    coalStock,
    solarReceipts,
    solarConsumptions,
    hop,
    targets,
    cumulative,
    importRuns,
    stagingRows,
    syncSources,
    syncWorksheets,
    syncRuns,
    syncRowStates,
    schemaChanges,
    tables,
  ] = await Promise.all([
    prisma.$queryRaw<{ database_name: string; schema_name: string }[]>(
      Prisma.sql`SELECT current_database() AS database_name, current_schema() AS schema_name`,
    ),
    prisma.unit.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, status: true },
    }),
    prisma.biomassReceipt.aggregate({
      _count: { _all: true },
      _sum: { quantityTon: true },
      _min: { periodStart: true },
      _max: { periodStart: true },
    }),
    prisma.biomassConsumption.aggregate({
      _count: { _all: true },
      _sum: { quantityTon: true },
      _min: { readingDate: true },
      _max: { readingDate: true },
    }),
    prisma.coalReceipt.aggregate({
      _count: { _all: true },
      _sum: { quantityTon: true },
      _min: { periodStart: true },
      _max: { periodStart: true },
    }),
    prisma.coalConsumption.aggregate({
      _count: { _all: true },
      _sum: { coalUsed: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.coalStock.aggregate({
      _count: { _all: true },
      _sum: { openingStock: true, received: true, consumed: true, closingStock: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.solarReceipt.aggregate({
      _count: { _all: true },
      _sum: { quantityLiter: true },
      _min: { periodStart: true },
      _max: { periodStart: true },
    }),
    prisma.solarConsumption.aggregate({
      _count: { _all: true },
      _sum: { quantityLiter: true },
      _min: { readingDate: true },
      _max: { readingDate: true },
    }),
    prisma.hopReading.aggregate({
      _count: { _all: true },
      _sum: { hopDays: true },
      _min: { readingDate: true },
      _max: { readingDate: true },
    }),
    prisma.biomassTarget.aggregate({
      _count: { _all: true },
      _sum: { targetTon: true },
      _min: { targetYear: true },
      _max: { targetYear: true },
    }),
    prisma.biomassCumulativeSnapshot.aggregate({
      _count: { _all: true },
      _sum: { cumulativeTon: true },
      _min: { periodStart: true },
      _max: { periodStart: true },
    }),
    prisma.spreadsheetImportRun.count(),
    prisma.spreadsheetImportStaging.count(),
    prisma.syncSource.count(),
    prisma.syncWorksheet.count(),
    prisma.syncRun.count(),
    prisma.syncRowState.count(),
    prisma.syncSchemaChange.count(),
    prisma.$queryRaw<{ table_name: string }[]>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(DOMAIN_TABLES)})
      ORDER BY table_name
    `),
  ]);

  return {
    database: database[0] ?? null,
    units,
    tables: tables.map((row) => row.table_name),
    aggregates: {
      biomassReceipts,
      biomassConsumptions,
      coalReceipts,
      coalConsumptions,
      coalStock,
      solarReceipts,
      solarConsumptions,
      hop,
      targets,
      cumulative,
    },
    counts: {
      importRuns,
      stagingRows,
      syncSources,
      syncWorksheets,
      syncRuns,
      syncRowStates,
      schemaChanges,
    },
  };
}

async function importRunAudit() {
  const runs = await prisma.spreadsheetImportRun.findMany({
    where: {
      OR: [
        { requestedWorksheet: { in: [...WORKSHEETS] } },
        { effectiveWorksheet: { in: [...WORKSHEETS] } },
      ],
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      source: true,
      requestedWorksheet: true,
      effectiveWorksheet: true,
      sourceRange: true,
      status: true,
      importedRows: true,
      rejectedRows: true,
      checksum: true,
    },
  });

  return WORKSHEETS.map((worksheet) => {
    const matching = runs.filter(
      (run) =>
        normalize(run.requestedWorksheet) === normalize(worksheet) ||
        normalize(run.effectiveWorksheet) === normalize(worksheet),
    );
    const successful = matching.find((run) => run.status === "SUCCESS") ?? matching[0] ?? null;
    return {
      worksheet,
      run: successful
        ? {
            id: successful.id,
            source: successful.source,
            requestedWorksheet: successful.requestedWorksheet,
            effectiveWorksheet: successful.effectiveWorksheet,
            sourceRange: successful.sourceRange,
            status: successful.status,
            importedRows: successful.importedRows,
            rejectedRows: successful.rejectedRows,
            checksumPresent: Boolean(successful.checksum),
          }
        : null,
      candidateRunCount: matching.length,
    };
  });
}

async function orphanAudit() {
  return prisma.$queryRaw<{ check_name: string; count: number }[]>(Prisma.sql`
    SELECT 'coal_quality_unit' AS check_name, COUNT(*)::int AS count
    FROM coal_quality cq LEFT JOIN units u ON u.id = cq.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'coal_consumption_unit', COUNT(*)::int
    FROM coal_consumption cc LEFT JOIN units u ON u.id = cc.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'power_generation_unit', COUNT(*)::int
    FROM power_generation pg LEFT JOIN units u ON u.id = pg.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'kpi_targets_unit', COUNT(*)::int
    FROM kpi_targets kt LEFT JOIN units u ON u.id = kt.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'biomass_consumptions_unit', COUNT(*)::int
    FROM biomass_consumptions bc LEFT JOIN units u ON u.id = bc.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'hop_readings_unit', COUNT(*)::int
    FROM hop_readings hr LEFT JOIN units u ON u.id = hr.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'staging_import_run', COUNT(*)::int
    FROM spreadsheet_import_staging s LEFT JOIN spreadsheet_import_runs r ON r.id = s.import_run_id
    WHERE r.id IS NULL
    UNION ALL
    SELECT 'biomass_receipts_import_run', COUNT(*)::int
    FROM biomass_receipts b LEFT JOIN spreadsheet_import_runs r ON r.id = b.import_run_id
    WHERE b.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'biomass_consumptions_import_run', COUNT(*)::int
    FROM biomass_consumptions b LEFT JOIN spreadsheet_import_runs r ON r.id = b.import_run_id
    WHERE b.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'coal_receipts_import_run', COUNT(*)::int
    FROM coal_receipts c LEFT JOIN spreadsheet_import_runs r ON r.id = c.import_run_id
    WHERE c.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'solar_receipts_import_run', COUNT(*)::int
    FROM solar_receipts s LEFT JOIN spreadsheet_import_runs r ON r.id = s.import_run_id
    WHERE s.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'solar_consumptions_import_run', COUNT(*)::int
    FROM solar_consumptions s LEFT JOIN spreadsheet_import_runs r ON r.id = s.import_run_id
    WHERE s.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'hop_readings_import_run', COUNT(*)::int
    FROM hop_readings h LEFT JOIN spreadsheet_import_runs r ON r.id = h.import_run_id
    WHERE h.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'biomass_targets_import_run', COUNT(*)::int
    FROM biomass_targets b LEFT JOIN spreadsheet_import_runs r ON r.id = b.import_run_id
    WHERE b.import_run_id IS NOT NULL AND r.id IS NULL
    UNION ALL
    SELECT 'biomass_cumulative_import_run', COUNT(*)::int
    FROM biomass_cumulative_snapshots b LEFT JOIN spreadsheet_import_runs r ON r.id = b.import_run_id
    WHERE b.import_run_id IS NOT NULL AND r.id IS NULL
  `);
}

async function duplicateAudit() {
  return prisma.$queryRaw<{ table_name: string; duplicate_groups: number }[]>(Prisma.sql`
    SELECT 'biomass_receipts' AS table_name, COUNT(*)::int AS duplicate_groups
    FROM (
      SELECT period_start, supplier_code FROM biomass_receipts
      GROUP BY period_start, supplier_code HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'biomass_consumptions', COUNT(*)::int
    FROM (
      SELECT unit_id, reading_date FROM biomass_consumptions
      GROUP BY unit_id, reading_date HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'coal_receipts', COUNT(*)::int
    FROM (
      SELECT period_start FROM coal_receipts
      GROUP BY period_start HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'coal_consumption', COUNT(*)::int
    FROM (
      SELECT unit_id, date FROM coal_consumption
      GROUP BY unit_id, date HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'coal_stock', COUNT(*)::int
    FROM (
      SELECT date FROM coal_stock
      GROUP BY date HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'solar_receipts', COUNT(*)::int
    FROM (
      SELECT period_start FROM solar_receipts
      GROUP BY period_start HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'solar_consumptions', COUNT(*)::int
    FROM (
      SELECT reading_date FROM solar_consumptions
      GROUP BY reading_date HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'hop_readings', COUNT(*)::int
    FROM (
      SELECT unit_id, reading_date FROM hop_readings
      GROUP BY unit_id, reading_date HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'biomass_targets', COUNT(*)::int
    FROM (
      SELECT target_year FROM biomass_targets
      GROUP BY target_year HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'biomass_cumulative_snapshots', COUNT(*)::int
    FROM (
      SELECT period_start FROM biomass_cumulative_snapshots
      GROUP BY period_start HAVING COUNT(*) > 1
    ) duplicates
  `);
}

async function syncDryRun(
  sources: Awaited<ReturnType<typeof readAllSources>>["sources"],
) {
  const source = await prisma.syncSource.findFirst({
    where: { provider: "google_sheets" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true },
  });
  if (!source) {
    return { source: null, worksheets: [], algorithmSelfCheck: null };
  }

  const worksheets = await prisma.syncWorksheet.findMany({
    where: { sourceId: source.id },
    select: {
      id: true,
      worksheetTitle: true,
      status: true,
      rowCount: true,
      schemaHash: true,
      schemaSnapshot: true,
    },
  });
  const states = await Promise.all(
    worksheets.map(async (worksheet) => ({
      worksheetId: worksheet.id,
      states: await prisma.syncRowState.findMany({
        where: { worksheetId: worksheet.id },
        select: { sourceKey: true, contentHash: true },
      }),
    })),
  );
  const stateMap = new Map(states.map((entry) => [entry.worksheetId.toString(), entry.states]));

  const results = sources.map((entry) => {
    const plan = entry.plan;
    if (!plan) {
      return {
        worksheet: entry.requested,
        registry: null,
        status: "BLOCKED",
        inserted: null,
        updated: null,
        skipped: null,
        duplicates: null,
        rowStateCount: null,
        schema: "NOT_READ",
      };
    }
    const registry = worksheets.find(
      (worksheet) => normalize(worksheet.worksheetTitle) === normalize(entry.selected ?? entry.requested),
    ) ?? null;
    const existing: ExistingSyncRowState[] = registry
      ? (stateMap.get(registry.id.toString()) ?? [])
      : [];
    const classification = classifySyncRows(plan.stagingRows, existing);
    const schema = entry.result
      ? buildSchemaSnapshot(entry.result.parsed)
      : null;
    const schemaMatch = registry?.schemaHash && schema
      ? registry.schemaHash === schema.hash
      : false;
    return {
      worksheet: entry.requested,
      registry: registry
        ? {
            title: registry.worksheetTitle,
            status: registry.status,
            rowCount: registry.rowCount,
          }
        : null,
      status:
        plan.status !== "READY_FOR_IMPORT" || classification.duplicates.length > 0
          ? "BLOCKED"
          : registry && schemaMatch &&
              classification.inserted === 0 &&
              classification.updated === 0 &&
              classification.skipped === plan.stagingRows.length
            ? "PASS"
            : "REVIEW",
      inserted: classification.inserted,
      updated: classification.updated,
      skipped: classification.skipped,
      duplicates: classification.duplicates.length,
      rowStateCount: existing.length,
      sourceRows: plan.stagingRows.length,
      schema: registry
        ? registry.schemaHash
          ? schema && schemaMatch
            ? "MATCH"
            : "MISMATCH"
          : "NOT_APPROVED"
        : "NOT_REGISTERED",
    };
  });

  const selfTestRow = sources.find((entry) => entry.plan?.stagingRows.length)?.plan?.stagingRows[0] ?? null;
  let algorithmSelfCheck: Record<string, unknown> | null = null;
  if (selfTestRow) {
    const shifted: ImportStagingRecord = {
      ...selfTestRow,
      source: {
        ...selfTestRow.source,
        cell: "ZZ999",
        row: (selfTestRow.source.row ?? 0) + 1000,
      },
    };
    const seeded = [{
      sourceKey: sourceKeyForStagingRow(selfTestRow),
      contentHash: contentHashForStagingRow(selfTestRow),
    }];
    const classification = classifySyncRows([shifted], seeded);
    algorithmSelfCheck = {
      stableIdentityWhenCellAndRowMove:
        sourceKeyForStagingRow(selfTestRow) === sourceKeyForStagingRow(shifted),
      stableContentHashWhenCellAndRowMove:
        contentHashForStagingRow(selfTestRow) === contentHashForStagingRow(shifted),
      seededReprocessing: {
        inserted: classification.inserted,
        updated: classification.updated,
        skipped: classification.skipped,
        duplicates: classification.duplicates.length,
      },
      status:
        sourceKeyForStagingRow(selfTestRow) === sourceKeyForStagingRow(shifted) &&
        contentHashForStagingRow(selfTestRow) === contentHashForStagingRow(shifted) &&
        classification.inserted === 0 &&
        classification.updated === 0 &&
        classification.skipped === 1 &&
        classification.duplicates.length === 0
          ? "PASS"
          : "FAIL",
    };
  }

  return {
    source: { status: source.status },
    worksheets: results,
    algorithmSelfCheck,
  };
}

async function dashboardStaticAudit() {
  const activeFiles = [
    "../src/services/overview.ts",
    "../src/services/overview-postgres.ts",
    "../src/components/dashboard/DetailCharts.tsx",
    "../src/components/dashboard/EnergyConsumptionChart.tsx",
    "../src/components/dashboard/OverviewDashboard.tsx",
    "../src/components/dashboard/DetailDashboard.tsx",
  ];
  const contents = await Promise.all(
    activeFiles.map(async (file) => {
      try {
        return await readFile(new URL(file, import.meta.url), "utf8");
      } catch {
        return "";
      }
    }),
  );
  const all = contents.join("\n");
  const service = contents[1] ?? "";
  const charts = contents[2] ?? "";
  return {
    sourceOfTruth: service.includes("prisma.") && service.includes("biomassReceipt")
      ? "PostgreSQL normalized data via Prisma"
      : "REVIEW",
    expectedPrismaModels: [
      "biomassReceipt",
      "biomassConsumption",
      "coalConsumption",
      "coalStock",
      "solarConsumption",
      "solarReceipt",
      "hopReading",
      "biomassTarget",
      "biomassCumulativeSnapshot",
    ].map((model) => ({ model, present: service.includes(`prisma.${model}`) })),
    chartLayer: {
      lineChart: charts.includes("LineChart"),
      barChart: charts.includes("BarChart"),
      pieChart: charts.includes("PieChart"),
      tooltip: charts.includes("<Tooltip"),
      accessibilityLayer: charts.includes("accessibilityLayer"),
      clientBoundary: charts.startsWith('"use client"'),
      fetchInChart: /fetch\s*\(/.test(charts),
    },
    biomassStockActiveReference: /BIOMASS_STOCK|biomassStock|biomass_stock/.test(all),
    pageUsesSharedDetailDashboard: (contents[5] ?? "").includes("DetailLineChart") &&
      (contents[5] ?? "").includes("DetailBarChart"),
    targetUsesPieProgress: charts.includes("TargetProgressChart") && charts.includes("<PieChart"),
    note: "Static checks inspect active source files only; no dashboard request is made by chart components.",
  };
}

function compareSnapshots(before: unknown, after: unknown) {
  return JSON.stringify(serializeValue(before)) === JSON.stringify(serializeValue(after));
}

async function main() {
  const before = await databaseSnapshot();
  const sources = await readAllSources();
  const runs = await importRunAudit();
  const periods: Record<string, unknown> = {};
  for (const entry of sources.sources) {
    if (!entry.plan) continue;
    const parsed = parseBBWorksheetName(entry.selected ?? entry.requested);
    if (!parsed) continue;
    const database = await readDatabasePeriod(parsed.year, parsed.month);
    periods[entry.requested] = {
      worksheet: entry.selected,
      rawRows: entry.rawRows,
      parser: {
        scannedCellCount: entry.result?.parsed.diagnostics.scannedCellCount ?? 0,
        errors: entry.result?.parsed.diagnostics.errors ?? [],
        unresolved: entry.result?.parsed.diagnostics.unresolved ?? [],
        ambiguous: entry.result?.parsed.diagnostics.ambiguous ?? [],
        warningCount: entry.plan.warnings.length,
      },
      plan: {
        status: entry.plan.status,
        blockingIssues: entry.plan.blockingIssues,
        summary: entry.plan.summary,
      },
      comparison: comparePlanToDatabase(entry.plan, database),
      sourceUnits: [...new Set(
        entry.result?.parsed.structures[0]?.headerPaths
          .map((path) => path.unitNumber)
          .filter((value): value is number => value !== null),
      )].sort((left, right) => left - right),
      sourceDateRange: [
        entry.result?.parsed.normalized.series.map((row) => row.date).filter(Boolean).sort()[0] ?? null,
        entry.result?.parsed.normalized.series.map((row) => row.date).filter(Boolean).sort().at(-1) ?? null,
      ],
      effectiveSchemaHash: entry.result
        ? buildSchemaSnapshot(entry.result.parsed).hash
        : null,
    };
  }

  const [orphans, duplicates, sync, dashboard] = await Promise.all([
    orphanAudit(),
    duplicateAudit(),
    syncDryRun(sources.sources),
    dashboardStaticAudit(),
  ]);
  const after = await databaseSnapshot();

  const result = {
    audit: "PHASE_16_POST_IMPORT_PARITY_AND_INTEGRITY",
    auditDate: new Date().toISOString(),
    scope: {
      worksheets: WORKSHEETS,
      canonicalReference: "Juli26-BB",
      sourceRange: DYNAMIC_SCAN_RANGE,
      databaseWrites: 0,
      importPerformed: false,
      syncPerformed: false,
      schemaChanged: false,
    },
    worksheetInventory: {
      availableCount: sources.availableCount,
      validBBCount: sources.validBBCount,
      periodDuplicates: sources.periodDuplicates,
      required: sources.sources.map((entry) => ({
        requested: entry.requested,
        selected: entry.selected,
        periodMatchCount: entry.periodMatchCount,
        rawRows: entry.rawRows,
        readStatus: entry.plan ? "READ" : "FAILED",
        error: entry.error,
      })),
    },
    importRuns: runs,
    perWorksheet: periods,
    snapshots: {
      before,
      after,
      unchanged: compareSnapshots(before, after),
    },
    orphanAudit: {
      rows: orphans,
      total: orphans.reduce((total, row) => total + Number(row.count), 0),
    },
    duplicateAudit: {
      rows: duplicates,
      totalGroups: duplicates.reduce((total, row) => total + Number(row.duplicate_groups), 0),
    },
    identityAndIdempotency: sync,
    dashboardStaticAudit: dashboard,
    security: {
      credentialsPrinted: false,
      databaseUrlPrinted: false,
      writeCapableImportCalled: false,
      writeCapableSyncCalled: false,
      serverOnlyGoogleClientExpected: true,
    },
  };

  if (process.argv.includes("--brief")) {
    type BriefDomain = {
      sourceRows: number;
      databaseRows: number;
      sourceSum: unknown;
      expectedStoredSum: unknown;
      databaseSum: unknown;
      differenceFromSource: unknown;
      sourceDuplicates: string[];
      databaseDuplicates: string[];
      missing: string[];
      unexpected: string[];
      mismatches: unknown[];
      status: string;
    };
    type BriefPeriod = {
      worksheet: string | null;
      rawRows: number | null;
      parser: {
        errors: string[];
        unresolved: string[];
        ambiguous: string[];
      };
      plan: {
        status: string;
        blockingIssues: string[];
        summary: Record<string, unknown>;
      };
      comparison: {
        sourceRows: number;
        databaseRows: number;
        rowCountParity: boolean;
        status: string;
        domains: Record<string, BriefDomain>;
      };
      sourceUnits: number[];
      sourceDateRange: Array<string | null>;
    };

    const compactPeriods = Object.fromEntries(
      Object.entries(result.perWorksheet).map(([worksheet, rawValue]) => {
        const period = rawValue as BriefPeriod;
        const domains = Object.fromEntries(
          Object.entries(period.comparison.domains).map(([domain, audit]) => [
            domain,
            {
              sourceRows: audit.sourceRows,
              databaseRows: audit.databaseRows,
              sourceSum: serializeValue(audit.sourceSum),
              expectedStoredSum: serializeValue(audit.expectedStoredSum),
              databaseSum: serializeValue(audit.databaseSum),
              differenceFromSource: serializeValue(audit.differenceFromSource),
              sourceDuplicateCount: audit.sourceDuplicates.length,
              databaseDuplicateCount: audit.databaseDuplicates.length,
              missingCount: audit.missing.length,
              unexpectedCount: audit.unexpected.length,
              mismatchCount: audit.mismatches.length,
              status: audit.status,
            },
          ]),
        );
        return [worksheet, {
          worksheet: period.worksheet,
          rawRows: period.rawRows,
          parser: {
            errors: period.parser.errors.length,
            unresolvedCount: period.parser.unresolved.length,
            ambiguousCount: period.parser.ambiguous.length,
          },
          plan: {
            status: period.plan.status,
            blockingIssues: period.plan.blockingIssues,
            summary: period.plan.summary,
          },
          sourceUnits: period.sourceUnits,
          sourceDateRange: period.sourceDateRange,
          comparison: {
            sourceRows: period.comparison.sourceRows,
            databaseRows: period.comparison.databaseRows,
            rowCountParity: period.comparison.rowCountParity,
            status: period.comparison.status,
            domains,
          },
        }];
      }),
    );

    console.log(JSON.stringify(serializeValue({
      audit: result.audit,
      scope: result.scope,
      worksheetInventory: result.worksheetInventory,
      importRuns: result.importRuns,
      perWorksheet: compactPeriods,
      snapshots: {
        before: {
          database: before.database,
          counts: before.counts,
          tables: before.tables,
        },
        after: {
          database: after.database,
          counts: after.counts,
          tables: after.tables,
        },
        unchanged: result.snapshots.unchanged,
      },
      orphanAudit: result.orphanAudit,
      duplicateAudit: result.duplicateAudit,
      identityAndIdempotency: result.identityAndIdempotency,
      dashboardStaticAudit: result.dashboardStaticAudit,
      security: result.security,
    }), null, 2));
    return;
  }

  if (process.argv.includes("--matrix")) {
    type MatrixPeriod = {
      rawRows: number | null;
      parser: { errors: string[]; unresolved: string[]; ambiguous: string[] };
      plan: { status: string; blockingIssues: string[]; summary: Record<string, unknown> };
      comparison: {
        sourceRows: number;
        databaseRows: number;
        rowCountParity: boolean;
        status: string;
        domains: Record<string, {
          sourceRows: number;
          databaseRows: number;
          sourceSum: unknown;
          expectedStoredSum: unknown;
          databaseSum: unknown;
          differenceFromSource: unknown;
          sourceDuplicates: string[];
          databaseDuplicates: string[];
          missing: string[];
          unexpected: string[];
          mismatches: unknown[];
          status: string;
        }>;
      };
      sourceUnits: number[];
      sourceDateRange: Array<string | null>;
    };
    const matrix = Object.fromEntries(
      Object.entries(result.perWorksheet).map(([worksheet, rawValue]) => {
        const value = rawValue as MatrixPeriod;
        const domains = Object.fromEntries(
          Object.entries(value.comparison.domains).map(([domain, audit]) => [
            domain,
            {
              sourceRows: audit.sourceRows,
              databaseRows: audit.databaseRows,
              sourceSum: serializeValue(audit.sourceSum),
              expectedStoredSum: serializeValue(audit.expectedStoredSum),
              databaseSum: serializeValue(audit.databaseSum),
              differenceFromSource: serializeValue(audit.differenceFromSource),
              sourceDuplicates: audit.sourceDuplicates.length,
              databaseDuplicates: audit.databaseDuplicates.length,
              missing: audit.missing.length,
              unexpected: audit.unexpected.length,
              mismatches: audit.mismatches.length,
              status: audit.status,
            },
          ]),
        );
        return [worksheet, {
          rawRows: value.rawRows,
          parser: {
            errors: value.parser.errors.length,
            unresolved: value.parser.unresolved,
            ambiguous: value.parser.ambiguous,
          },
          plan: {
            status: value.plan.status,
            blockingIssues: value.plan.blockingIssues,
            summary: value.plan.summary,
          },
          sourceUnits: value.sourceUnits,
          sourceDateRange: value.sourceDateRange,
          comparison: {
            sourceRows: value.comparison.sourceRows,
            databaseRows: value.comparison.databaseRows,
            rowCountParity: value.comparison.rowCountParity,
            status: value.comparison.status,
            domains,
          },
        }];
      }),
    );
    console.log(JSON.stringify(serializeValue({
      audit: result.audit,
      auditDate: result.auditDate,
      scope: result.scope,
      worksheetInventory: result.worksheetInventory,
      importRuns: result.importRuns,
      perWorksheet: matrix,
      snapshots: {
        before: {
          database: before.database,
          counts: before.counts,
          tables: before.tables,
        },
        after: {
          database: after.database,
          counts: after.counts,
          tables: after.tables,
        },
        unchanged: result.snapshots.unchanged,
      },
      orphanAudit: result.orphanAudit,
      duplicateAudit: result.duplicateAudit,
      identityAndIdempotency: result.identityAndIdempotency,
      dashboardStaticAudit: result.dashboardStaticAudit,
      security: result.security,
    }), null, 2));
    return;
  }

  if (process.argv.includes("--summary")) {
    type DomainSummary = {
      sourceRows: number;
      databaseRows: number;
      sourceSum: unknown;
      expectedStoredSum: unknown;
      databaseSum: unknown;
      differenceFromSource: unknown;
      sourceDuplicates: string[];
      databaseDuplicates: string[];
      missing: string[];
      unexpected: string[];
      mismatches: unknown[];
      status: string;
    };
    type PeriodSummary = {
      worksheet: string | null;
      rawRows: number | null;
      parser: {
        scannedCellCount: number;
        errors: string[];
        unresolved: string[];
        ambiguous: string[];
        warningCount: number;
      };
      plan: { status: string; blockingIssues: string[]; summary: unknown };
      comparison: {
        sourceRows: number;
        databaseRows: number;
        rowCountParity: boolean;
        status: string;
        domains: Record<string, DomainSummary>;
      };
      sourceUnits: number[];
      sourceDateRange: Array<string | null>;
    };
    const compactPeriods = Object.fromEntries(
      Object.entries(result.perWorksheet).map(([worksheet, value]) => {
        const period = value as PeriodSummary;
        const domains = Object.fromEntries(
          Object.entries(period.comparison.domains).map(([domain, audit]) => [
            domain,
            {
              sourceRows: audit.sourceRows,
              databaseRows: audit.databaseRows,
              sourceSum: serializeValue(audit.sourceSum),
              expectedStoredSum: serializeValue(audit.expectedStoredSum),
              databaseSum: serializeValue(audit.databaseSum),
              differenceFromSource: serializeValue(audit.differenceFromSource),
              sourceDuplicateCount: audit.sourceDuplicates.length,
              databaseDuplicateCount: audit.databaseDuplicates.length,
              missingCount: audit.missing.length,
              unexpectedCount: audit.unexpected.length,
              mismatchCount: audit.mismatches.length,
              status: audit.status,
            },
          ]),
        );
        return [
          worksheet,
          {
            worksheet: period.worksheet,
            rawRows: period.rawRows,
            parser: period.parser,
            plan: period.plan,
            sourceUnits: period.sourceUnits,
            sourceDateRange: period.sourceDateRange,
            comparison: {
              sourceRows: period.comparison.sourceRows,
              databaseRows: period.comparison.databaseRows,
              rowCountParity: period.comparison.rowCountParity,
              status: period.comparison.status,
              domains,
            },
          },
        ];
      }),
    );
    const snapshotSummary = (snapshot: typeof before) => ({
      database: snapshot.database,
      units: snapshot.units,
      tables: snapshot.tables,
      counts: snapshot.counts,
      aggregates: Object.fromEntries(
        Object.entries(snapshot.aggregates).map(([table, aggregate]) => {
          const value = aggregate as Record<string, unknown>;
          return [table, serializeValue(value)];
        }),
      ),
    });
    console.log(JSON.stringify(serializeValue({
      audit: result.audit,
      auditDate: result.auditDate,
      scope: result.scope,
      worksheetInventory: result.worksheetInventory,
      importRuns: result.importRuns,
      perWorksheet: compactPeriods,
      snapshots: {
        before: snapshotSummary(before),
        after: snapshotSummary(after),
        unchanged: result.snapshots.unchanged,
      },
      orphanAudit: result.orphanAudit,
      duplicateAudit: result.duplicateAudit,
      identityAndIdempotency: result.identityAndIdempotency,
      dashboardStaticAudit: result.dashboardStaticAudit,
      security: result.security,
    }), null, 2));
    return;
  }

  console.log(JSON.stringify(serializeValue(result), null, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL_READ_ONLY_AUDIT",
    error: error instanceof Error ? error.message : "phase16 audit failed",
    databaseWrites: 0,
    importPerformed: false,
    syncPerformed: false,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
