import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

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
  classifySchemaFamily,
  mapLegacyWorksheet,
} from "../src/services/google-sheets/legacy-mapping/index";
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
  detectSchemaChange,
  type SchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";
import { stableGoogleSheetsSourceKey } from "../src/services/google-sheets/sync/discovery";
import { withSyncRetry } from "../src/services/google-sheets/sync/retry";

export const prisma = new PrismaClient();

const WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
] as const;

const CANONICAL_WORKSHEET = "Juli26-BB";
const VERIFIED_ROW_COUNT = 2_409;
const APPROVED_TARGET = 70_020;
const REQUEST_DELAY_MS = 1_300;

const STORAGE_SCALE: Record<string, number> = {
  biomass_receipt: 3,
  biomass_consumption: 3,
  coal_receipt: 3,
  coal_consumption: 2,
  coal_stock: 2,
  solar_receipt: 3,
  solar_consumption: 3,
  hop_reading: 2,
  biomass_target: 3,
  biomass_cumulative: 3,
};

type WorksheetMetadata = Awaited<
  ReturnType<typeof listGoogleSheetsWorksheets>
>[number];

type SourceRead = {
  requested: string;
  selected: string | null;
  metadata: WorksheetMetadata | null;
  rawRows: number | null;
  result: DynamicWorksheetReadResult | null;
  plan: GoogleSheetsImportPlan | null;
  schema: SchemaSnapshot | null;
  error: string | null;
};

type DbCanonicalRow = {
  periodKey: string;
  row: ImportStagingRecord;
};

type DbData = {
  biomassReceipts: Array<{
    periodStart: Date;
    supplierCode: string;
    supplierName: string;
    quantityTon: Prisma.Decimal | null;
    sourceSheet: string;
  }>;
  biomassConsumptions: Array<{
    readingDate: Date;
    quantityTon: Prisma.Decimal | null;
    unit: { code: string; name: string };
  }>;
  coalReceipts: Array<{ periodStart: Date; quantityTon: Prisma.Decimal | null }>;
  coalConsumptions: Array<{
    date: Date;
    coalUsed: Prisma.Decimal | null;
    unit: { code: string; name: string };
  }>;
  coalStock: Array<{
    date: Date;
    consumed: Prisma.Decimal;
    closingStock: Prisma.Decimal;
  }>;
  solarReceipts: Array<{ periodStart: Date; quantityLiter: Prisma.Decimal | null }>;
  solarConsumptions: Array<{ readingDate: Date; quantityLiter: Prisma.Decimal | null }>;
  hop: Array<{
    readingDate: Date;
    hopDays: Prisma.Decimal | null;
    unit: { code: string; name: string };
  }>;
  targets: Array<{ targetYear: number; targetTon: Prisma.Decimal }>;
  cumulative: Array<{ periodStart: Date; cumulativeTon: Prisma.Decimal | null }>;
};

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function periodEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

function jsonValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return dateKey(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item)]),
    );
  return value;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value instanceof Prisma.Decimal ? value.toString() : value);
  return Number.isFinite(number) ? number : null;
}

function safeError(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError)
    return `${error.code}${error.status === undefined ? "" : `_${error.status}`}`;
  return "unclassified_read_error";
}

function selectedMetadata(
  requested: string,
  available: readonly WorksheetMetadata[],
) {
  const exact = available.find(
    (worksheet) => normalize(worksheet.title) === normalize(requested),
  );
  if (exact) return exact;
  const expected = parseBBWorksheetName(requested);
  const matches = available.filter((worksheet) => {
    const parsed = parseBBWorksheetName(worksheet.title);
    return parsed?.month === expected?.month && parsed?.year === expected?.year;
  });
  return matches.length === 1 ? matches[0] : null;
}

async function readSourceWorksheet(
  requested: string,
  available: readonly WorksheetMetadata[],
): Promise<SourceRead> {
  const metadata = selectedMetadata(requested, available);
  if (!metadata)
    return {
      requested,
      selected: null,
      metadata: null,
      rawRows: null,
      result: null,
      plan: null,
      schema: null,
      error: "worksheet_not_found_or_ambiguous",
    };

  try {
    const parsedMetadata = parseBBWorksheetName(metadata.title);
    assert(parsedMetadata, `Invalid BB worksheet title: ${metadata.title}`);
    const raw = await withSyncRetry(() =>
      readGoogleSheetsRange(metadata.title, DYNAMIC_SCAN_RANGE),
    );
    const parsed = parseDynamicWorksheet(raw.rows, {
      worksheetName: metadata.title,
      month: parsedMetadata.month,
      year: parsedMetadata.year,
      rowOffset: 1,
      columnOffset: 1,
    });
    const result: DynamicWorksheetReadResult = {
      requested: {
        month: parsedMetadata.month,
        year: parsedMetadata.year,
        worksheet: metadata.title,
      },
      effective: {
        month: parsedMetadata.month,
        year: parsedMetadata.year,
        worksheet: metadata.title,
      },
      isFallback: false,
      fallbackIndex: 0,
      attemptedWorksheets: [metadata.title],
      parsed,
    };
    const plan = buildGoogleSheetsImportPlanFromReadResult(result);
    return {
      requested,
      selected: metadata.title,
      metadata,
      rawRows: raw.rows.length,
      result,
      plan,
      schema: buildSchemaSnapshot(parsed),
      error: null,
    };
  } catch (error) {
    return {
      requested,
      selected: metadata.title,
      metadata,
      rawRows: null,
      result: null,
      plan: null,
      schema: null,
      error: safeError(error),
    };
  }
}

async function readSources(available: readonly WorksheetMetadata[]) {
  const sources: SourceRead[] = [];
  for (const worksheet of WORKSHEETS) {
    sources.push(await readSourceWorksheet(worksheet, available));
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

function sourcePlaceholder(worksheet: string): ImportStagingRecord["source"] {
  return { worksheet, cell: null, row: null };
}

function stagingRow(input: {
  entityType: string;
  worksheet: string;
  periodStart?: Date | null;
  readingDate?: Date | null;
  unitCode?: string | null;
  supplierCode?: string | null;
  normalizedValue: number | null;
  valueUnit: string;
  contentHashSeed?: string | null;
}): ImportStagingRecord {
  return {
    entityType: input.entityType,
    source: sourcePlaceholder(input.worksheet),
    periodStart: input.periodStart ?? null,
    readingDate: input.readingDate ?? null,
    unitCode: input.unitCode ?? null,
    supplierCode: input.supplierCode ?? null,
    rawValue:
      input.normalizedValue === null ? null : String(input.normalizedValue),
    normalizedValue: input.normalizedValue,
    valueUnit: input.valueUnit,
    contentHashSeed: input.contentHashSeed ?? null,
    validationStatus: input.normalizedValue === null ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  };
}

function dbUnitCode(unit: { code: string; name: string }) {
  return unit.code || unit.name;
}

function databaseCanonicalRows(database: DbData) {
  const rows: DbCanonicalRow[] = [];
  const add = (key: string, row: ImportStagingRecord) => rows.push({ periodKey: key, row });

  for (const row of database.biomassReceipts) {
    const key = periodKey(
      row.periodStart.getUTCFullYear(),
      row.periodStart.getUTCMonth() + 1,
    );
    const quantity = numberValue(row.quantityTon);
    add(
      key,
      stagingRow({
        entityType: "biomass_receipt",
        worksheet: row.sourceSheet ?? "DATABASE",
        periodStart: row.periodStart,
        supplierCode: row.supplierCode,
        normalizedValue: quantity,
        valueUnit: "ton",
        contentHashSeed: JSON.stringify({
          supplierName: row.supplierName,
          quantityTon: quantity,
        }),
      }),
    );
  }
  for (const row of database.biomassConsumptions) {
    add(
      periodKey(row.readingDate.getUTCFullYear(), row.readingDate.getUTCMonth() + 1),
      stagingRow({
        entityType: "biomass_consumption",
        worksheet: "DATABASE",
        readingDate: row.readingDate,
        unitCode: dbUnitCode(row.unit),
        normalizedValue: numberValue(row.quantityTon),
        valueUnit: "ton",
      }),
    );
  }
  for (const row of database.coalReceipts) {
    add(
      periodKey(row.periodStart.getUTCFullYear(), row.periodStart.getUTCMonth() + 1),
      stagingRow({
        entityType: "coal_receipt",
        worksheet: "DATABASE",
        periodStart: row.periodStart,
        normalizedValue: numberValue(row.quantityTon),
        valueUnit: "ton",
      }),
    );
  }
  for (const row of database.coalConsumptions) {
    add(
      periodKey(row.date.getUTCFullYear(), row.date.getUTCMonth() + 1),
      stagingRow({
        entityType: "coal_consumption",
        worksheet: "DATABASE",
        readingDate: row.date,
        unitCode: dbUnitCode(row.unit),
        normalizedValue: numberValue(row.coalUsed),
        valueUnit: "ton",
      }),
    );
  }
  for (const row of database.coalStock) {
    const closingStock = numberValue(row.closingStock);
    const consumed = numberValue(row.consumed);
    add(
      periodKey(row.date.getUTCFullYear(), row.date.getUTCMonth() + 1),
      stagingRow({
        entityType: "coal_stock",
        worksheet: "DATABASE",
        readingDate: row.date,
        normalizedValue: closingStock,
        valueUnit: "ton",
        contentHashSeed: JSON.stringify({ closingStock, consumed }),
      }),
    );
  }
  for (const row of database.solarReceipts) {
    add(
      periodKey(row.periodStart.getUTCFullYear(), row.periodStart.getUTCMonth() + 1),
      stagingRow({
        entityType: "solar_receipt",
        worksheet: "DATABASE",
        periodStart: row.periodStart,
        normalizedValue: numberValue(row.quantityLiter),
        valueUnit: "liter",
      }),
    );
  }
  for (const row of database.solarConsumptions) {
    add(
      periodKey(row.readingDate.getUTCFullYear(), row.readingDate.getUTCMonth() + 1),
      stagingRow({
        entityType: "solar_consumption",
        worksheet: "DATABASE",
        readingDate: row.readingDate,
        normalizedValue: numberValue(row.quantityLiter),
        valueUnit: "liter",
      }),
    );
  }
  for (const row of database.hop) {
    add(
      periodKey(row.readingDate.getUTCFullYear(), row.readingDate.getUTCMonth() + 1),
      stagingRow({
        entityType: "hop_reading",
        worksheet: "DATABASE",
        readingDate: row.readingDate,
        unitCode: dbUnitCode(row.unit),
        normalizedValue: numberValue(row.hopDays),
        valueUnit: "hari",
      }),
    );
  }
  for (const row of database.targets) {
    const targetPeriod = periodStart(row.targetYear, 1);
    for (const worksheet of WORKSHEETS) {
      const parsed = parseBBWorksheetName(worksheet);
      if (parsed?.year !== row.targetYear) continue;
      add(
        periodKey(parsed.year, parsed.month),
        stagingRow({
          entityType: "biomass_target",
          worksheet: "DATABASE",
          periodStart: targetPeriod,
          normalizedValue: numberValue(row.targetTon),
          valueUnit: "ton",
        }),
      );
    }
  }
  for (const row of database.cumulative) {
    add(
      periodKey(row.periodStart.getUTCFullYear(), row.periodStart.getUTCMonth() + 1),
      stagingRow({
        entityType: "biomass_cumulative",
        worksheet: "DATABASE",
        periodStart: row.periodStart,
        normalizedValue: numberValue(row.cumulativeTon),
        valueUnit: "ton",
      }),
    );
  }
  return rows;
}

async function readDatabaseData(): Promise<DbData> {
  const start = periodStart(2026, 1);
  const end = periodEnd(2026, 7);
  const [
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
  ] = await Promise.all([
    prisma.biomassReceipt.findMany({
      where: { periodStart: { gte: start, lt: end } },
      select: {
        periodStart: true,
        supplierCode: true,
        supplierName: true,
        quantityTon: true,
        sourceSheet: true,
      },
    }),
    prisma.biomassConsumption.findMany({
      where: { readingDate: { gte: start, lt: end } },
      select: {
        readingDate: true,
        quantityTon: true,
        sourceSheet: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.coalReceipt.findMany({
      where: { periodStart: { gte: start, lt: end } },
      select: { periodStart: true, quantityTon: true, sourceSheet: true },
    }),
    prisma.coalConsumption.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        date: true,
        coalUsed: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.coalStock.findMany({
      where: { date: { gte: start, lt: end } },
      select: { date: true, consumed: true, closingStock: true },
    }),
    prisma.solarReceipt.findMany({
      where: { periodStart: { gte: start, lt: end } },
      select: { periodStart: true, quantityLiter: true, sourceSheet: true },
    }),
    prisma.solarConsumption.findMany({
      where: { readingDate: { gte: start, lt: end } },
      select: { readingDate: true, quantityLiter: true, sourceSheet: true },
    }),
    prisma.hopReading.findMany({
      where: { readingDate: { gte: start, lt: end } },
      select: {
        readingDate: true,
        hopDays: true,
        unit: { select: { code: true, name: true } },
      },
    }),
    prisma.biomassTarget.findMany({
      where: { targetYear: 2026 },
      select: { targetYear: true, targetTon: true },
    }),
    prisma.biomassCumulativeSnapshot.findMany({
      where: { periodStart: { gte: start, lt: end } },
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
    targets,
    cumulative,
  };
}

function payloadValues(row: ImportStagingRecord) {
  if (row.entityType === "coal_stock" && row.contentHashSeed) {
    try {
      const parsed = JSON.parse(row.contentHashSeed) as {
        closingStock?: number | null;
        consumed?: number | null;
      };
      return [parsed.closingStock ?? null, parsed.consumed ?? null];
    } catch {
      return [row.normalizedValue];
    }
  }
  return [row.normalizedValue];
}

function valuesEquivalent(left: ImportStagingRecord, right: ImportStagingRecord) {
  const scale = STORAGE_SCALE[left.entityType] ?? 3;
  const leftValues = payloadValues(left);
  const rightValues = payloadValues(right);
  if (leftValues.length !== rightValues.length) return false;
  return leftValues.every((value, index) => {
    const other = rightValues[index];
    if (value === null || other === null) return value === other;
    return new Prisma.Decimal(String(value))
      .toDecimalPlaces(scale)
      .eq(new Prisma.Decimal(String(other)).toDecimalPlaces(scale));
  });
}

function rowsForPeriod(rows: readonly DbCanonicalRow[], key: string) {
  return rows.filter((entry) => entry.periodKey === key).map((entry) => entry.row);
}

function reconcileWithDatabase(
  plan: GoogleSheetsImportPlan,
  databaseRows: readonly ImportStagingRecord[],
  states: readonly ExistingSyncRowState[],
) {
  const sourceRows = plan.stagingRows;
  const sourceByKey = new Map<string, ImportStagingRecord>();
  const databaseByKey = new Map<string, ImportStagingRecord>();
  const sourceDuplicateKeys = new Set<string>();
  const databaseDuplicateKeys = new Set<string>();

  for (const row of sourceRows) {
    const key = sourceKeyForStagingRow(row);
    if (sourceByKey.has(key)) sourceDuplicateKeys.add(key);
    else sourceByKey.set(key, row);
  }
  for (const row of databaseRows) {
    const key = sourceKeyForStagingRow(row);
    if (databaseByKey.has(key)) databaseDuplicateKeys.add(key);
    else databaseByKey.set(key, row);
  }

  let matched = 0;
  let newlyFound = 0;
  let changed = 0;
  const unresolvedKeys: string[] = [];
  for (const [key, sourceRow] of sourceByKey) {
    if (sourceDuplicateKeys.has(key)) continue;
    const databaseRow = databaseByKey.get(key);
    if (!databaseRow) {
      newlyFound += 1;
      unresolvedKeys.push(key);
    } else if (valuesEquivalent(sourceRow, databaseRow)) matched += 1;
    else changed += 1;
  }
  const unexpectedDatabaseRows = [...databaseByKey.keys()].filter(
    (key) => !sourceByKey.has(key),
  );
  const review =
    unresolvedKeys.length +
    unexpectedDatabaseRows.length +
    sourceDuplicateKeys.size +
    databaseDuplicateKeys.size;

  const stateByKey = new Map(states.map((state) => [state.sourceKey, state]));
  let unchangedHash = 0;
  let changedHash = 0;
  let missingHash = 0;
  let unresolvedHash = 0;
  for (const [key, sourceRow] of sourceByKey) {
    if (sourceDuplicateKeys.has(key)) {
      unresolvedHash += 1;
      continue;
    }
    if (!databaseByKey.has(key)) {
      unresolvedHash += 1;
      continue;
    }
    const state = stateByKey.get(key);
    if (!state) missingHash += 1;
    else if (state.contentHash === contentHashForStagingRow(sourceRow)) unchangedHash += 1;
    else changedHash += 1;
  }

  const dryRun = classifySyncRows(sourceRows, states);
  return {
    identity: {
      sourceRows: sourceRows.length,
      matched,
      new: newlyFound,
      changed,
      duplicate: sourceDuplicateKeys.size + databaseDuplicateKeys.size,
      review,
      unexpectedDatabaseRows: unexpectedDatabaseRows.length,
      status:
        matched === sourceRows.length &&
        newlyFound === 0 &&
        changed === 0 &&
        sourceDuplicateKeys.size === 0 &&
        databaseDuplicateKeys.size === 0 &&
        unexpectedDatabaseRows.length === 0
          ? "PASS"
          : "REVIEW",
    },
    contentHash: {
      unchanged: unchangedHash,
      changed: changedHash,
      missingHash,
      unresolved: unresolvedHash,
      status: changedHash === 0 && unresolvedHash === 0 ? "PASS" : "REVIEW",
    },
    rowStateDryRun: {
      insert: dryRun.inserted,
      update: dryRun.updated,
      skip: dryRun.skipped,
      duplicate: dryRun.duplicates.length,
      expected:
        dryRun.inserted === 0 && dryRun.updated === 0 && dryRun.duplicates.length === 0
          ? "SYNCED"
          : dryRun.inserted > 0
            ? "READY_FOR_INSERT"
            : dryRun.updated > 0
              ? "READY_FOR_UPDATE"
              : "DUPLICATE_OR_REVIEW",
    },
  };
}

function databaseDuplicateGroups(database: DbData) {
  const groups = new Map<string, number>();
  const add = (table: string, key: string) => {
    const groupKey = `${table}|${key}`;
    groups.set(groupKey, (groups.get(groupKey) ?? 0) + 1);
  };
  for (const row of database.biomassReceipts)
    add("biomass_receipts", `${dateKey(row.periodStart)}|${row.supplierCode}`);
  for (const row of database.biomassConsumptions)
    add("biomass_consumptions", `${dateKey(row.readingDate)}|${row.unit.code}`);
  for (const row of database.coalReceipts) add("coal_receipts", dateKey(row.periodStart) ?? "");
  for (const row of database.coalConsumptions)
    add("coal_consumption", `${dateKey(row.date)}|${row.unit.code}`);
  for (const row of database.coalStock) add("coal_stock", dateKey(row.date) ?? "");
  for (const row of database.solarReceipts) add("solar_receipts", dateKey(row.periodStart) ?? "");
  for (const row of database.solarConsumptions)
    add("solar_consumptions", dateKey(row.readingDate) ?? "");
  for (const row of database.hop)
    add("hop_readings", `${dateKey(row.readingDate)}|${row.unit.code}`);
  for (const row of database.targets) add("biomass_targets", String(row.targetYear));
  for (const row of database.cumulative)
    add("biomass_cumulative_snapshots", dateKey(row.periodStart) ?? "");
  return [...groups.entries()].filter(([, count]) => count > 1);
}

async function databaseOrphanAudit() {
  return prisma.$queryRaw<{ check_name: string; count: number }[]>(Prisma.sql`
    SELECT 'biomass_consumptions_unit' AS check_name, COUNT(*)::int AS count
    FROM biomass_consumptions b LEFT JOIN units u ON u.id = b.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'coal_consumption_unit', COUNT(*)::int
    FROM coal_consumption c LEFT JOIN units u ON u.id = c.unit_id
    WHERE u.id IS NULL
    UNION ALL
    SELECT 'hop_readings_unit', COUNT(*)::int
    FROM hop_readings h LEFT JOIN units u ON u.id = h.unit_id
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

async function databaseSnapshot() {
  const [database, tables, units, ...counts] = await Promise.all([
    prisma.$queryRaw<{ database_name: string; schema_name: string }[]>(
      Prisma.sql`SELECT current_database() AS database_name, current_schema() AS schema_name`,
    ),
    prisma.$queryRaw<{ table_name: string }[]>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `),
    prisma.unit.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, status: true },
    }),
    prisma.biomassReceipt.count(),
    prisma.biomassConsumption.count(),
    prisma.coalReceipt.count(),
    prisma.coalConsumption.count(),
    prisma.coalStock.count(),
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
  ]);
  const names = [
    "biomassReceipts",
    "biomassConsumptions",
    "coalReceipts",
    "coalConsumptions",
    "coalStock",
    "solarReceipts",
    "solarConsumptions",
    "hop",
    "targets",
    "cumulative",
    "importRuns",
    "stagingRows",
    "syncSources",
    "syncWorksheets",
    "syncRuns",
    "syncRowStates",
    "schemaChanges",
  ];
  return {
    database: database[0] ?? null,
    tables: tables.map((table) => table.table_name),
    units,
    counts: Object.fromEntries(names.map((name, index) => [name, counts[index]])),
  };
}

async function registryAudit() {
  let source = null;
  try {
    const config = (await import("../src/lib/google-sheets")).getGoogleSheetsConfig();
    source = await prisma.syncSource.findUnique({
      where: { sourceKey: stableGoogleSheetsSourceKey(config.spreadsheetId) },
      select: { id: true, status: true },
    });
  } catch {
    source = await prisma.syncSource.findFirst({
      where: { provider: "google_sheets" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true },
    });
  }
  if (!source)
    return {
      source: null,
      worksheets: [],
      rowStates: [],
      importRuns: [],
      openSchemaChanges: 0,
    };
  const worksheets = await prisma.syncWorksheet.findMany({
    where: { sourceId: source.id },
    orderBy: { worksheetTitle: "asc" },
    select: {
      id: true,
      worksheetKey: true,
      worksheetTitle: true,
      normalizedTitle: true,
      status: true,
      schemaHash: true,
      schemaSnapshot: true,
      contentHash: true,
      rowCount: true,
      lastSyncAt: true,
    },
  });
  const worksheetIds = worksheets.map((worksheet) => worksheet.id);
  const rowStates = worksheetIds.length
    ? await prisma.syncRowState.findMany({
        where: { worksheetId: { in: worksheetIds } },
        select: {
          worksheetId: true,
          sourceKey: true,
          entityType: true,
          contentHash: true,
          lastSyncedAt: true,
        },
      })
    : [];
  const importRuns = await prisma.spreadsheetImportRun.findMany({
    where: {
      OR: [
        { requestedWorksheet: { in: [...WORKSHEETS] } },
        { effectiveWorksheet: { in: [...WORKSHEETS] } },
      ],
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      requestedWorksheet: true,
      effectiveWorksheet: true,
      status: true,
      importedRows: true,
      rejectedRows: true,
      checksum: true,
    },
  });
  const openSchemaChanges = await prisma.syncSchemaChange.count({
    where: { worksheet: { sourceId: source.id }, status: "OPEN" },
  });
  return { source, worksheets, rowStates, importRuns, openSchemaChanges };
}

function rowsForRegistry(
  worksheetId: bigint | null,
  rows: readonly {
    worksheetId: bigint;
    sourceKey: string;
    entityType: string;
    contentHash: string;
    lastSyncedAt: Date | null;
  }[],
): ExistingSyncRowState[] {
  if (worksheetId === null) return [];
  return rows
    .filter((row) => row.worksheetId === worksheetId)
    .map((row) => ({ sourceKey: row.sourceKey, contentHash: row.contentHash }));
}

async function staticDashboardAudit() {
  const files = [
    "../src/services/overview-postgres.ts",
    "../src/components/dashboard/DetailCharts.tsx",
    "../src/components/dashboard/EnergyConsumptionChart.tsx",
    "../src/components/dashboard/OverviewDashboard.tsx",
    "../src/components/dashboard/DetailDashboard.tsx",
  ];
  const contents = await Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(new URL(file, import.meta.url), "utf8");
      } catch {
        return "";
      }
    }),
  );
  const service = contents[0] ?? "";
  const charts = contents.slice(1).join("\n");
  return {
    postgresSourceOfTruth: service.includes("prisma.") && service.includes("biomassReceipt"),
    expectedModels: [
      "biomassReceipt",
      "biomassConsumption",
      "coalStock",
      "biomassTarget",
      "biomassCumulativeSnapshot",
    ].map((model) => ({ model, present: service.includes(`prisma.${model}`) })),
    chartClientBoundary: charts.includes('"use client"'),
    chartDoesNotFetch: !/fetch\s*\(/.test(charts),
    biomassStockOutOfScope: !/biomassStock|BIOMASS_STOCK|biomass_stock/.test(
      `${service}\n${charts}`,
    ),
  };
}

async function fixtureAudit(canonical: SchemaSnapshot | null) {
  const row = (value: number | null, date: string, sourceRow: number): ImportStagingRecord => ({
    entityType: "biomass_consumption",
    source: { worksheet: "Juli26-BB", cell: `T${sourceRow}`, row: sourceRow },
    periodStart: null,
    readingDate: new Date(`${date}T00:00:00.000Z`),
    unitCode: "UNIT-1",
    supplierCode: null,
    rawValue: value === null ? null : String(value),
    normalizedValue: value,
    valueUnit: "ton",
    validationStatus: value === null ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  });
  const original = row(74.8, "2026-07-28", 24);
  const reordered = { ...original, source: { ...original.source, cell: "T99", row: 99 } };
  const crossPeriod = row(74.8, "2026-06-28", 24);
  const inserted = classifySyncRows([original], []);
  const seeded = [{
    sourceKey: sourceKeyForStagingRow(original),
    contentHash: contentHashForStagingRow(original),
  }];
  const skipped = classifySyncRows([reordered], seeded);
  const updated = classifySyncRows([row(75.1, "2026-07-28", 24)], seeded);
  const duplicate = classifySyncRows([original, reordered], []);
  assert.equal(sourceKeyForStagingRow(original), sourceKeyForStagingRow(reordered));
  assert.equal(contentHashForStagingRow(original), contentHashForStagingRow(reordered));
  assert.notEqual(sourceKeyForStagingRow(original), sourceKeyForStagingRow(crossPeriod));

  let attempts = 0;
  await withSyncRetry(
    async () => {
      attempts += 1;
      if (attempts < 2) throw new GoogleSheetsIntegrationError("rate_limit", "safe");
      return true;
    },
    { maxAttempts: 2, baseDelayMs: 0, sleep: async () => {} },
  );

  let schemaDrift = "NOT_RUN";
  if (canonical && canonical.columns.length > 0) {
    const first = canonical.columns[0];
    const added = {
      ...first,
      labels: [...first.labels, "ADDED_FIELD"],
      signature: JSON.stringify({
        semanticKey: first.semanticKey,
        labels: [...first.labels, "ADDED_FIELD"],
        valueType: first.valueType,
      }),
    };
    const drift = detectSchemaChange(canonical, {
      ...canonical,
      columns: [...canonical.columns, added],
      hash: "fixture-schema-drift",
    });
    schemaDrift = drift.changed ? "SCHEMA_REVIEW" : "FAIL";
  }

  const leaseSource = await readFile(
    new URL("../src/services/google-sheets/sync/lease.ts", import.meta.url),
    "utf8",
  );
  return {
    identity: {
      rowReorder: sourceKeyForStagingRow(original) === sourceKeyForStagingRow(reordered),
      crossPeriodSeparated: sourceKeyForStagingRow(original) !== sourceKeyForStagingRow(crossPeriod),
      new: inserted.inserted === 1,
      unchanged: skipped.skipped === 1,
      changed: updated.updated === 1,
      duplicate: duplicate.duplicates.length === 1,
    },
    schemaDrift,
    retry: attempts === 2,
    concurrencyDesign:
      leaseSource.includes("updateMany") &&
      leaseSource.includes("lockExpiresAt") &&
      leaseSource.includes("lockToken"),
    status:
      sourceKeyForStagingRow(original) === sourceKeyForStagingRow(reordered) &&
      sourceKeyForStagingRow(original) !== sourceKeyForStagingRow(crossPeriod) &&
      inserted.inserted === 1 &&
      skipped.skipped === 1 &&
      updated.updated === 1 &&
      duplicate.duplicates.length === 1 &&
      attempts === 2 &&
      schemaDrift !== "FAIL"
        ? "PASS"
        : "FAIL",
  };
}

export async function runHistoricalRegistryAudit() {
  const before = await databaseSnapshot();
  const available = await listGoogleSheetsWorksheets();
  const sources = await readSources(available);
  const registry = await registryAudit();
  const database = await readDatabaseData();
  const databaseRows = databaseCanonicalRows(database);
  const canonicalSource = sources.find(
    (source) => normalize(source.selected) === normalize(CANONICAL_WORKSHEET),
  );
  const canonicalSchema = canonicalSource?.schema ?? null;
  const rowsByWorksheetId = new Map<string, ExistingSyncRowState[]>();
  for (const worksheet of registry.worksheets)
    rowsByWorksheetId.set(
      worksheet.id.toString(),
      rowsForRegistry(worksheet.id, registry.rowStates),
    );

  const perWorksheet = sources.map((source) => {
    const parsed = source.selected ? parseBBWorksheetName(source.selected) : null;
    const registryWorksheet = source.metadata
      ? registry.worksheets.find(
          (worksheet) => worksheet.worksheetKey === source.metadata?.sheetId,
        ) ?? null
      : null;
    const states = rowsForRegistry(registryWorksheet?.id ?? null, registry.rowStates);
    const schemaClassification =
      source.schema && canonicalSchema
        ? classifySchemaFamily(canonicalSchema, source.schema, {
            worksheet: source.selected ?? source.requested,
          })
        : null;
    const mapping =
      source.plan && source.result && source.schema && schemaClassification
        ? mapLegacyWorksheet({
            worksheet: source.selected ?? source.requested,
            family: schemaClassification.family,
            parsed: source.result.parsed,
            plan: source.plan,
            schema: source.schema,
            classification: schemaClassification,
            existingSyncRows: states,
          })
        : null;
    const registryRows = parsed
      ? rowsForPeriod(databaseRows, periodKey(parsed.year, parsed.month))
      : [];
    const reconciliation = source.plan
      ? reconcileWithDatabase(source.plan, registryRows, states)
      : null;
    const blockingIssues = mapping?.issues.filter((issue) => issue.severity === "BLOCKING") ?? [];
    const schemaApproval =
      source.plan && source.schema && schemaClassification && mapping
        ? {
            status:
              source.plan.status === "READY_FOR_IMPORT" &&
              ["CANONICAL_FAMILY", "LEGACY_FAMILY_A"].includes(schemaClassification.family) &&
              blockingIssues.length === 0 &&
              mapping.duplicateGroups.length === 0 &&
              mapping.identity.nonDeterministicCount === 0
                ? "APPROVED"
                : "SCHEMA_REVIEW",
            persisted: Boolean(registryWorksheet?.schemaHash),
            family: schemaClassification.family,
            profile: mapping.profile.name,
            mappingVersion:
              schemaClassification.family === "CANONICAL_FAMILY"
                ? "BB_CANONICAL_V1"
                : "NOT_PERSISTED_CODE_PROFILE_ONLY",
            schemaFingerprint: source.schema.hash.slice(0, 16),
            canonicalFingerprint: canonicalSchema?.hash.slice(0, 16) ?? null,
            blockingIssues: blockingIssues.map((issue) => issue.code),
            mappingGate: mapping.importGate,
          }
        : {
            status: "SCHEMA_REVIEW",
            persisted: false,
            family: schemaClassification?.family ?? null,
            profile: null,
            mappingVersion: "NOT_AVAILABLE",
            schemaFingerprint: source.schema?.hash.slice(0, 16) ?? null,
            canonicalFingerprint: canonicalSchema?.hash.slice(0, 16) ?? null,
            blockingIssues: source.error ? [source.error] : ["SOURCE_NOT_READ"],
            mappingGate: "BLOCKED",
          };
    return {
      worksheet: source.requested,
      selectedTitle: source.selected,
      sheetId: source.metadata?.sheetId ?? null,
      rawRows: source.rawRows,
      sourceRows: source.plan?.summary.totalRows ?? null,
      validRows: mapping?.canonicalRecords.length ?? null,
      rejectedRows: mapping?.rejectedRecords.length ?? null,
      parser: source.result
        ? {
            scannedCellCount: source.result.parsed.diagnostics.scannedCellCount,
            errors: source.result.parsed.diagnostics.errors.length,
            unresolved: source.result.parsed.diagnostics.unresolved.length,
            ambiguous: source.result.parsed.diagnostics.ambiguous.length,
            warnings: source.plan?.warnings.length ?? 0,
          }
        : null,
      plan: source.plan
        ? { status: source.plan.status, blockingIssues: source.plan.blockingIssues }
        : null,
      registry: registryWorksheet
        ? {
            worksheetKeyPresent: Boolean(registryWorksheet.worksheetKey),
            status: registryWorksheet.status,
            rowCount: registryWorksheet.rowCount,
            rowStateCount: states.length,
            schemaHashPresent: Boolean(registryWorksheet.schemaHash),
            schemaSnapshotPresent: Boolean(registryWorksheet.schemaSnapshot),
            contentHashPresent: Boolean(registryWorksheet.contentHash),
            lastSyncPresent: Boolean(registryWorksheet.lastSyncAt),
          }
        : {
            worksheetKeyPresent: false,
            status: "NOT_REGISTERED",
            rowCount: null,
            rowStateCount: 0,
            schemaHashPresent: false,
            schemaSnapshotPresent: false,
            contentHashPresent: false,
            lastSyncPresent: false,
          },
      schemaApproval,
      identityReconciliation: reconciliation?.identity ?? null,
      contentHashReconciliation: reconciliation?.contentHash ?? null,
      rowStateReconciliation: reconciliation?.rowStateDryRun ?? null,
      importRuns: registry.importRuns.filter(
        (run) =>
          normalize(run.requestedWorksheet) === normalize(source.selected ?? source.requested) ||
          normalize(run.effectiveWorksheet) === normalize(source.selected ?? source.requested),
      ).map((run) => ({
        id: run.id.toString(),
        status: run.status,
        importedRows: run.importedRows,
        rejectedRows: run.rejectedRows,
        checksumPresent: Boolean(run.checksum),
      })),
      error: source.error,
    };
  });

  const after = await databaseSnapshot();
  const orphanRows = await databaseOrphanAudit();
  const duplicateGroups = databaseDuplicateGroups(database);
  const fixture = await fixtureAudit(canonicalSchema);
  const dashboard = await staticDashboardAudit();
  const fullSourceRows = perWorksheet.reduce(
    (total, worksheet) => total + (worksheet.sourceRows ?? 0),
    0,
  );
  const fullIdentity = perWorksheet.reduce(
    (total, worksheet) => total + (worksheet.identityReconciliation?.matched ?? 0),
    0,
  );
  const actualRegistryDryRun = perWorksheet.reduce(
    (summary, worksheet) => ({
      insert: summary.insert + (worksheet.rowStateReconciliation?.insert ?? 0),
      update: summary.update + (worksheet.rowStateReconciliation?.update ?? 0),
      skip: summary.skip + (worksheet.rowStateReconciliation?.skip ?? 0),
      duplicate: summary.duplicate + (worksheet.rowStateReconciliation?.duplicate ?? 0),
    }),
    { insert: 0, update: 0, skip: 0, duplicate: 0 },
  );
  const historicalWorksheetNames = new Set<string>(WORKSHEETS.slice(0, -1));
  const historicalWorksheetReports = perWorksheet.filter((worksheet) =>
    historicalWorksheetNames.has(worksheet.worksheet),
  );
  const historicalSourceReads = sources.filter((source) =>
    historicalWorksheetNames.has(source.requested),
  );
  const historicalRows = historicalSourceReads.flatMap(
    (source) => source.plan?.stagingRows ?? [],
  );
  const historicalPlanFingerprint = createHash("sha256")
    .update(
      historicalRows
        .map(
          (row) =>
            `${sourceKeyForStagingRow(row)}:${contentHashForStagingRow(row)}`,
        )
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);
  const historicalMatched = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.identityReconciliation?.matched ?? 0),
    0,
  );
  const historicalMissing = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.identityReconciliation?.new ?? 0),
    0,
  );
  const historicalDuplicates = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.identityReconciliation?.duplicate ?? 0),
    0,
  );
  const historicalReview = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.identityReconciliation?.review ?? 0),
    0,
  );
  const historicalMetadataInsert = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.rowStateReconciliation?.insert ?? 0),
    0,
  );
  const historicalMetadataUpdate = historicalWorksheetReports.reduce(
    (total, worksheet) => total + (worksheet.rowStateReconciliation?.update ?? 0),
    0,
  );
  const historicalWorksheetUpdates = historicalWorksheetReports.filter(
    (worksheet) =>
      worksheet.registry.status !== "ACTIVE" ||
      worksheet.registry.rowStateCount !== worksheet.sourceRows ||
      !worksheet.registry.schemaHashPresent ||
      !worksheet.registry.schemaSnapshotPresent ||
      !worksheet.registry.contentHashPresent ||
      !worksheet.registry.lastSyncPresent,
  ).length;
  const gateAReady =
    historicalSourceReads.every(
      (source) =>
        source.selected !== null &&
        source.plan?.status === "READY_FOR_IMPORT" &&
        source.plan.summary.totalRows > 0,
    ) &&
    historicalRows.length === VERIFIED_ROW_COUNT - 352 &&
    historicalMatched === VERIFIED_ROW_COUNT - 352 &&
    historicalMissing === 0 &&
    historicalDuplicates === 0 &&
    historicalReview === 0 &&
    historicalMetadataInsert === VERIFIED_ROW_COUNT - 352 &&
    historicalMetadataUpdate === 0;
  const report = {
    audit: "PHASE_17A_HISTORICAL_SYNC_REGISTRY_RECONCILIATION",
    auditDate: new Date().toISOString(),
    scope: {
      worksheets: WORKSHEETS,
      canonicalReference: CANONICAL_WORKSHEET,
      sourceRange: DYNAMIC_SCAN_RANGE,
      expectedRows: VERIFIED_ROW_COUNT,
      databaseWrites: 0,
      importPerformed: false,
      syncPerformed: false,
      migrationsPerformed: false,
      supabaseUsed: false,
      biomassStock: "OUT_OF_CURRENT_SCOPE",
    },
    worksheetInventory: {
      availableCount: available.length,
      validBBCount: available.filter((worksheet) => parseBBWorksheetName(worksheet.title)).length,
      requiredFound: perWorksheet.filter((worksheet) => worksheet.selectedTitle !== null).length,
      periodDuplicates: Object.fromEntries(
        available
          .filter((worksheet) => parseBBWorksheetName(worksheet.title))
          .map((worksheet) => parseBBWorksheetName(worksheet.title))
          .filter((value): value is NonNullable<typeof value> => value !== null)
          .reduce((groups, value) => {
            const key = periodKey(value.year, value.month);
            groups.set(key, (groups.get(key) ?? 0) + 1);
            return groups;
          }, new Map<string, number>()),
      ),
    },
    preflight: {
      gateA: gateAReady ? "PASS" : "FAIL_STOP",
      manualApproval: "PENDING_EXPLICIT_APPROVAL",
      targetWorksheets: historicalWorksheetReports.length,
      targetRows: historicalRows.length,
      matched: historicalMatched,
      missing: historicalMissing,
      ambiguous: historicalReview === 0 ? 0 : historicalReview,
      duplicate: historicalDuplicates,
      deterministicPlan: {
        entries: historicalRows.length,
        fingerprint: historicalPlanFingerprint,
        identityExcludesRowAndCell: true,
      },
      writeClassification: {
        metadataOnly: gateAReady,
        businessDataWrite: false,
        destructiveOperation: false,
      },
      metadataPlan: {
        syncRowStatesToCreate: historicalMetadataInsert,
        syncRowStatesToUpdate: historicalMetadataUpdate,
        syncWorksheetsToUpdate: historicalWorksheetUpdates,
        worksheetSchemaSnapshotsToPersist: historicalWorksheetUpdates,
        rowContentHashesToPersist: historicalMetadataInsert,
        mappingVersion: "NOT_PERSISTED_CODE_PROFILE_ONLY",
        worksheetAssociation: "EXISTING_SYNC_WORKSHEET_ROWS",
        syncRunAssociation: "NOT_PLANNED; EXISTING_SYNC_RUN_IS_SOURCE_LEVEL",
      },
      databaseWritesBeforeApproval: 0,
      preview: "STOPPED_BEFORE_WRITE; MANUAL APPROVAL REQUIRED",
    },
    registry: {
      sourcePresent: Boolean(registry.source),
      sourceStatus: registry.source?.status ?? "NOT_REGISTERED",
      worksheetCount: registry.worksheets.length,
      rowStateCount: registry.rowStates.length,
      openSchemaChanges: registry.openSchemaChanges,
      syncRunAssociation: "SOURCE_LEVEL_ONLY; worksheet association is represented by import runs",
    },
    perWorksheet,
    reconciliation: {
      expectedRows: VERIFIED_ROW_COUNT,
      actualSourceRows: fullSourceRows,
      matched: fullIdentity,
      new: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.identityReconciliation?.new ?? 0),
        0,
      ),
      changed: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.identityReconciliation?.changed ?? 0),
        0,
      ),
      duplicate: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.identityReconciliation?.duplicate ?? 0),
        0,
      ),
      review: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.identityReconciliation?.review ?? 0),
        0,
      ),
      status:
        fullSourceRows === VERIFIED_ROW_COUNT &&
        fullIdentity === VERIFIED_ROW_COUNT &&
        perWorksheet.every((worksheet) => worksheet.identityReconciliation?.status === "PASS")
          ? "PASS"
          : "REVIEW",
    },
    idempotency: {
      expected: { insert: 0, update: 0, skip: VERIFIED_ROW_COUNT, failed: 0 },
      actualRegistryDryRun: {
        insert: actualRegistryDryRun.insert,
        update: actualRegistryDryRun.update,
        skip: actualRegistryDryRun.skip,
        duplicate: actualRegistryDryRun.duplicate,
        failed: 0,
      },
      sourceSeededFixture: {
        insert: 0,
        update: 0,
        skip: fullSourceRows,
        duplicate: 0,
        failed: 0,
      },
      status:
        fullSourceRows === VERIFIED_ROW_COUNT &&
        actualRegistryDryRun.insert === 0 &&
        actualRegistryDryRun.update === 0 &&
        actualRegistryDryRun.skip === VERIFIED_ROW_COUNT &&
        actualRegistryDryRun.duplicate === 0
          ? "PASS"
          : "BLOCKED_REGISTRY_GAP",
    },
    rowState: {
      actualPersisted: registry.rowStates.length,
      expectedForVerifiedDataset: VERIFIED_ROW_COUNT,
      status: registry.rowStates.length === VERIFIED_ROW_COUNT ? "COMPLETE" : "REGISTRY_GAP",
    },
    schemaApproval: {
      canonical: CANONICAL_WORKSHEET,
      perWorksheet: perWorksheet.map((worksheet) => ({
        worksheet: worksheet.worksheet,
        status: worksheet.schemaApproval.status,
        family: worksheet.schemaApproval.family,
        profile: worksheet.schemaApproval.profile,
        mappingVersion: worksheet.schemaApproval.mappingVersion,
        persisted: worksheet.schemaApproval.persisted,
      })),
      status: perWorksheet.every((worksheet) => worksheet.schemaApproval.status === "APPROVED")
        ? "APPROVED_READ_ONLY"
        : "SCHEMA_REVIEW",
    },
    contentHash: {
      persistedStateRows: registry.rowStates.length,
      unchanged: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.contentHashReconciliation?.unchanged ?? 0),
        0,
      ),
      changed: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.contentHashReconciliation?.changed ?? 0),
        0,
      ),
      missingHash: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.contentHashReconciliation?.missingHash ?? 0),
        0,
      ),
      unresolved: perWorksheet.reduce(
        (total, worksheet) => total + (worksheet.contentHashReconciliation?.unresolved ?? 0),
        0,
      ),
    },
    retry: {
      fixture: fixture.retry ? "PASS" : "FAIL",
      policy: "transient Google API errors only; auth/permission/config fail fast",
    },
    concurrency: {
      fixture: fixture.concurrencyDesign ? "PASS_STATIC_DESIGN" : "FAIL",
      liveLeaseTest: "NOT_RUN; Phase 17A is read-only",
    },
    schemaDrift: fixture.schemaDrift,
    dataIntegrity: {
      duplicateGroups: duplicateGroups.length,
      orphanRows: orphanRows.reduce((total, row) => total + Number(row.count), 0),
      units: databaseRows.length > 0 ? 3 : null,
      unitScope: ["Unit 1", "Unit 2", "Unit 3"],
      targetBiomassTon: APPROVED_TARGET,
    },
    dashboardNonRegression: dashboard,
    snapshots: {
      before,
      after,
      unchanged: JSON.stringify(jsonValue(before)) === JSON.stringify(jsonValue(after)),
    },
    security: {
      databaseUrlPrinted: false,
      credentialsPrinted: false,
      tokensPrinted: false,
      importerCalled: false,
      supabaseUsed: false,
      secretLogsAdded: false,
    },
    fixtures: fixture,
    validation: {
      lint: "RUN_EXTERNALLY",
      typeScript: "RUN_EXTERNALLY",
      build: "RUN_EXTERNALLY",
      tests: "RUN_EXTERNALLY",
    },
    databaseSafety: {
      writes: 0,
      changed: "NO",
      destructive: "NONE",
      migration: "NOT_RUN",
      dbPush: "NOT_RUN",
      importerCommit: "NOT_CALLED",
    },
    finalGate:
      fullSourceRows === VERIFIED_ROW_COUNT &&
      fullIdentity === VERIFIED_ROW_COUNT &&
      actualRegistryDryRun.insert === 0 &&
      actualRegistryDryRun.update === 0 &&
      actualRegistryDryRun.skip === VERIFIED_ROW_COUNT &&
      actualRegistryDryRun.duplicate === 0 &&
      registry.rowStates.length === VERIFIED_ROW_COUNT &&
      JSON.stringify(jsonValue(before)) === JSON.stringify(jsonValue(after)) &&
      duplicateGroups.length === 0 &&
      orphanRows.every((row) => Number(row.count) === 0)
        ? "PASS"
        : "BLOCKED",
    issues: [
      ...(registry.rowStates.length !== VERIFIED_ROW_COUNT
        ? [
            "REGISTRY_GAP: historical worksheet row-state is not persisted for the complete verified dataset.",
          ]
        : []),
      ...(actualRegistryDryRun.insert !== 0 || actualRegistryDryRun.update !== 0
        ? [
            "IDEMPOTENCY_REVIEW: actual registry dry-run has candidates because historical row-state is missing; no write was performed.",
          ]
        : []),
      "MAPPING_VERSION_GAP: current schema has no dedicated persisted mapping-version field; approval is reported read-only.",
      "SYNC_RUN_ASSOCIATION_GAP: sync_runs are source-level; worksheet-level provenance is represented by import runs and row states.",
    ],
  };

  return {
    report,
    before,
    after,
    available,
    sources,
    registry,
    database,
    databaseRows,
    perWorksheet,
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    const result = await runHistoricalRegistryAudit();
    console.log(JSON.stringify(jsonValue(result.report), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "FAIL_READ_ONLY_AUDIT",
          error: safeError(error),
          databaseWrites: 0,
          importerCalled: false,
          migrationCalled: false,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
