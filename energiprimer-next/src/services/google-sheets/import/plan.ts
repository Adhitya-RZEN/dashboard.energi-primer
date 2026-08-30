import "server-only";

import { parseDayValue } from "../dynamic/validators";
import { extractBiomassReceiptImportRows } from "../dynamic/parsers/monthly-aggregate-parser";
import {
  DYNAMIC_SCAN_RANGE,
  readAndParseDynamicBBWorksheet,
  type DynamicWorksheetReadResult,
} from "../dynamic/reader";
import type {
  DynamicDailyRecord,
  DynamicParserResult,
  HeaderPath,
  ResolvedValue,
  StructureAnalysis,
} from "../dynamic/types";
import type {
  CoalConsumptionImportRecord,
  CoalReceiptImportRecord,
  CoalStockImportRecord,
  BiomassConsumptionImportRecord,
  BiomassCumulativeImportRecord,
  BiomassReceiptImportRecord,
  BiomassTargetImportRecord,
  GoogleSheetsImportPlan,
  HopImportRecord,
  ImportSource,
  ImportStagingRecord,
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "./types";

export const APPROVED_BIOMASS_TARGET = 70_020;

const REQUIRED_SUPPLIER_CODES = [
  "sawdust-pt-syahroni",
  "sawdust-pt-bintang",
  "woodchip-pt-syahroni",
  "woodchip-pt-rap",
  "woodchip-cv-multi-paketindo",
  "lruk",
  "srf",
] as const;

type UnitNumber = 1 | 2 | 3;

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateFromRecord(record: DynamicDailyRecord, fallbackMonth: number, fallbackYear: number) {
  if (!record.date) return utcDate(fallbackYear, fallbackMonth, record.day ?? 1);
  const [year, month, day] = record.date.split("-").map(Number);
  return utcDate(year, month, day);
}

function sourceFromResolved(
  worksheet: string,
  resolved: ResolvedValue | undefined,
): ImportSource {
  return {
    worksheet,
    cell: resolved?.source?.address ?? null,
    row: null,
  };
}

function directPath(
  structure: StructureAnalysis,
  resource: HeaderPath["resource"],
  unitNumber: UnitNumber,
) {
  const candidates = structure.headerPaths.filter(
    (path) =>
      path.resource === resource &&
      path.unitNumber === unitNumber &&
      !path.isTotal &&
      !path.isStock &&
      !path.isHop,
  );
  const direct = candidates.filter(
    (path) =>
      path.unit === "TON" &&
      !path.labels.some((label) =>
        /BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(label),
      ),
  );
  return direct[0] ?? candidates[0] ?? null;
}

function hopPath(structure: StructureAnalysis, unitNumber: UnitNumber) {
  return (
    structure.headerPaths.find(
      (path) => path.isHop && path.unitNumber === unitNumber,
    ) ?? null
  );
}

function solarPath(structure: StructureAnalysis) {
  return (
    structure.headerPaths.find(
      (path) => path.resource === "solar" && path.isTotal,
    ) ?? null
  );
}

function coalTotalPath(structure: StructureAnalysis) {
  return (
    structure.headerPaths.find(
      (path) =>
        path.resource === "coal" &&
        path.isTotal &&
        !path.isStock &&
        !path.isHop,
    ) ?? null
  );
}

function stockPath(structure: StructureAnalysis) {
  const candidates = structure.headerPaths.filter(
    (path) => path.resource === "coal" && path.isStock,
  );
  return (
    candidates.find((path) =>
      path.labels.some((label) => /STOK AKHIR|STOCK AKHIR/.test(label)),
    ) ?? candidates[0] ?? null
  );
}

function dailyRowForRecord(parsed: DynamicParserResult, record: DynamicDailyRecord) {
  const structure = parsed.structures[0];
  if (!structure || structure.dateColumn === null || record.day === null)
    return null;
  return (
    structure.dataRows.find((row) => {
      const dateCell = parsed.scannedCells.find(
        (cell) => cell.row === row && cell.column === structure.dateColumn,
      );
      return parseDayValue(dateCell?.rawValue) === record.day;
    }) ?? null
  );
}

function dailySource(
  parsed: DynamicParserResult,
  record: DynamicDailyRecord,
  path: HeaderPath | null,
): ImportSource {
  const row = dailyRowForRecord(parsed, record);
  const cell =
    row !== null && path
      ? parsed.scannedCells.find(
          (candidate) =>
            candidate.row === row && candidate.column === path.cell.column,
        )
      : null;
  return {
    worksheet: parsed.worksheet.name,
    cell: cell?.address ?? null,
    row: cell?.row ?? row,
  };
}

function rawValue(value: number | null) {
  return value === null ? null : String(value);
}

function stagingRecord(input: {
  entityType: string;
  source: ImportSource;
  periodStart?: Date;
  readingDate?: Date;
  unitCode?: string;
  supplierCode?: string;
  value: number | null;
  unit: string;
  validationStatus?: ImportStagingRecord["validationStatus"];
  validationMessage?: string | null;
}): ImportStagingRecord {
  return {
    entityType: input.entityType,
    source: input.source,
    periodStart: input.periodStart ?? null,
    readingDate: input.readingDate ?? null,
    unitCode: input.unitCode ?? null,
    supplierCode: input.supplierCode ?? null,
    rawValue: rawValue(input.value),
    normalizedValue: input.value,
    valueUnit: input.unit,
    validationStatus: input.validationStatus ??
      (input.value === null ? "VALID_EMPTY" : "VALID"),
    validationMessage: input.validationMessage ?? null,
  };
}

function buildRows(result: DynamicWorksheetReadResult) {
  const parsed = result.parsed;
  const structure = parsed.structures[0];
  if (!structure) throw new Error("Semantic structure tidak tersedia.");

  const effectivePeriod = utcDate(result.effective.year, result.effective.month, 1);
  const series = parsed.normalized.series;
  const receiptRows: BiomassReceiptImportRecord[] = extractBiomassReceiptImportRows(
    parsed.scannedCells,
    structure,
  ).map((row) => ({
    periodStart: effectivePeriod,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    quantityTon: row.value,
    source: {
      worksheet: parsed.worksheet.name,
      cell: row.sourceAddress,
      row: row.sourceRow,
    },
  }));

  const coalConsumptionRows: CoalConsumptionImportRecord[] = [];
  const coalStockRows: CoalStockImportRecord[] = [];
  const biomassConsumptionRows: BiomassConsumptionImportRecord[] = [];
  const solarConsumptionRows: SolarConsumptionImportRecord[] = [];
  const hopRows: HopImportRecord[] = [];
  const biomassPaths = [1, 2, 3].map((unit) =>
    directPath(structure, "biomass", unit as UnitNumber),
  );
  const coalPaths = [1, 2, 3].map((unit) =>
    directPath(structure, "coal", unit as UnitNumber),
  );
  const hopPaths = [1, 2, 3].map((unit) => hopPath(structure, unit as UnitNumber));
  const solarDailyPath = solarPath(structure);
  const stock = stockPath(structure);

  for (const record of series) {
    const readingDate = dateFromRecord(
      record,
      result.effective.month,
      result.effective.year,
    );
    const biomassValues = [
      record.biomassUnit1,
      record.biomassUnit2,
      record.biomassUnit3,
    ];
    for (const [index, quantityTon] of biomassValues.entries()) {
      const unitNumber = (index + 1) as UnitNumber;
      biomassConsumptionRows.push({
        readingDate,
        unitNumber,
        quantityTon,
        source: dailySource(parsed, record, biomassPaths[index]),
      });
    }

    const coalValues = [
      record.coalUnit1,
      record.coalUnit2,
      record.coalUnit3,
    ];
    for (const [index, quantityTon] of coalValues.entries()) {
      const unitNumber = (index + 1) as UnitNumber;
      coalConsumptionRows.push({
        readingDate,
        unitNumber,
        quantityTon,
        source: dailySource(parsed, record, coalPaths[index]),
      });
    }
    if (record.stock !== null) {
      coalStockRows.push({
        readingDate,
        closingStock: record.stock,
        consumed: record.coal,
        source: dailySource(parsed, record, stock),
      });
    }

    solarConsumptionRows.push({
      readingDate,
      quantityLiter: record.solar,
      source: dailySource(parsed, record, solarDailyPath),
    });

    const hopValues = [record.hop1, record.hop2, record.hop3];
    for (const [index, hopDays] of hopValues.entries()) {
      const unitNumber = (index + 1) as UnitNumber;
      hopRows.push({
        readingDate,
        unitNumber,
        hopDays,
        source: dailySource(parsed, record, hopPaths[index]),
      });
    }
  }

  const solarReceiptResolved = parsed.normalized.metrics.solarReceiptMonthly;
  const solarReceiptRows: SolarReceiptImportRecord[] =
    solarReceiptResolved.available && solarReceiptResolved.value !== null
      ? [
          {
            periodStart: effectivePeriod,
            quantityLiter: solarReceiptResolved.value,
            source: sourceFromResolved(parsed.worksheet.name, solarReceiptResolved),
          },
        ]
        : [];

  const coalReceiptResolved = parsed.normalized.metrics.coalReceiptMonthly;
  const coalReceiptRows: CoalReceiptImportRecord[] =
    coalReceiptResolved.available && coalReceiptResolved.value !== null
      ? [
          {
            periodStart: effectivePeriod,
            quantityTon: coalReceiptResolved.value,
            source: sourceFromResolved(parsed.worksheet.name, coalReceiptResolved),
          },
        ]
      : [];

  const targetResolved = parsed.normalized.metrics.biomassTarget;
  const targetRows: BiomassTargetImportRecord[] =
    targetResolved.available && targetResolved.value !== null
      ? [
          {
            targetYear: result.effective.year,
            targetTon: targetResolved.value,
            source: sourceFromResolved(parsed.worksheet.name, targetResolved),
          },
        ]
      : [];

  const cumulativeResolved = parsed.normalized.metrics.biomassCumulative;
  const cumulativeRows: BiomassCumulativeImportRecord[] =
    cumulativeResolved.available && cumulativeResolved.value !== null
      ? [
          {
            periodStart: effectivePeriod,
            cumulativeTon: cumulativeResolved.value,
            source: sourceFromResolved(parsed.worksheet.name, cumulativeResolved),
          },
        ]
      : [];

  return {
    parsed,
    structure,
    effectivePeriod,
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
  };
}

function validatePlan(input: ReturnType<typeof buildRows>, result: DynamicWorksheetReadResult) {
  const blockingIssues: string[] = [];
  const target = input.targetRows[0]?.targetTon ?? null;
  const requiredDailyPaths = [
    ...[1, 2, 3].map((unit) => directPath(input.structure, "coal", unit as UnitNumber)),
    ...[1, 2, 3].map((unit) => directPath(input.structure, "biomass", unit as UnitNumber)),
    ...[1, 2, 3].map((unit) => hopPath(input.structure, unit as UnitNumber)),
    solarPath(input.structure),
    coalTotalPath(input.structure),
    stockPath(input.structure),
  ];

  if (!input.parsed.worksheet.isValid) blockingIssues.push("worksheet_invalid");
  if (result.isFallback) blockingIssues.push("worksheet_fallback");
  if (input.receiptRows.length !== REQUIRED_SUPPLIER_CODES.length)
    blockingIssues.push("biomass_supplier_schema_incomplete");
  if (
    REQUIRED_SUPPLIER_CODES.some(
      (code) => !input.receiptRows.some((row) => row.supplierCode === code),
    )
  )
    blockingIssues.push("biomass_supplier_identity_incomplete");
  if (input.receiptRows.every((row) => row.quantityTon === null))
    blockingIssues.push("biomass_supplier_receipt_empty");
  if (!input.coalConsumptionRows.length) blockingIssues.push("coal_daily_empty");
  if (!input.coalStockRows.length) blockingIssues.push("coal_stock_daily_empty");
  if (!input.biomassConsumptionRows.length) blockingIssues.push("biomass_daily_empty");
  if (!input.solarConsumptionRows.length) blockingIssues.push("solar_daily_empty");
  if (!input.hopRows.length) blockingIssues.push("hop_daily_empty");
  if (requiredDailyPaths.some((path) => path === null))
    blockingIssues.push("required_daily_columns_missing");
  if (!input.solarReceiptRows.length) blockingIssues.push("solar_receipt_unresolved");
  if (!input.coalReceiptRows.length) blockingIssues.push("coal_receipt_unresolved");
  if (!input.targetRows.length || target !== APPROVED_BIOMASS_TARGET)
    blockingIssues.push("biomass_target_does_not_match_70020");
  if (!input.cumulativeRows.length) blockingIssues.push("biomass_cumulative_unresolved");
  if (input.parsed.diagnostics.errors.length) blockingIssues.push("parser_errors");
  if (input.parsed.diagnostics.ambiguous.length) blockingIssues.push("ambiguous_fields");
  if (!input.parsed.normalized.series.length) blockingIssues.push("daily_series_empty");

  return [...new Set(blockingIssues)];
}

function buildStagingRows(input: ReturnType<typeof buildRows>) {
  const rows: ImportStagingRecord[] = [];
  for (const row of input.receiptRows) {
    rows.push(
      stagingRecord({
        entityType: "biomass_receipt",
        source: row.source,
        periodStart: row.periodStart,
        supplierCode: row.supplierCode,
        value: row.quantityTon,
        unit: "ton",
      }),
    );
  }
  for (const row of input.coalReceiptRows) {
    rows.push(
      stagingRecord({
        entityType: "coal_receipt",
        source: row.source,
        periodStart: row.periodStart,
        value: row.quantityTon,
        unit: "ton",
      }),
    );
  }
  for (const row of input.coalConsumptionRows) {
    rows.push(
      stagingRecord({
        entityType: "coal_consumption",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.quantityTon,
        unit: "ton",
      }),
    );
  }
  for (const row of input.coalStockRows) {
    rows.push(
      stagingRecord({
        entityType: "coal_stock",
        source: row.source,
        readingDate: row.readingDate,
        value: row.closingStock,
        unit: "ton",
      }),
    );
  }
  for (const row of input.biomassConsumptionRows) {
    rows.push(
      stagingRecord({
        entityType: "biomass_consumption",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.quantityTon,
        unit: "ton",
      }),
    );
  }
  for (const row of input.solarConsumptionRows) {
    rows.push(
      stagingRecord({
        entityType: "solar_consumption",
        source: row.source,
        readingDate: row.readingDate,
        value: row.quantityLiter,
        unit: "liter",
      }),
    );
  }
  for (const row of input.solarReceiptRows) {
    rows.push(
      stagingRecord({
        entityType: "solar_receipt",
        source: row.source,
        periodStart: row.periodStart,
        value: row.quantityLiter,
        unit: "liter",
      }),
    );
  }
  for (const row of input.hopRows) {
    rows.push(
      stagingRecord({
        entityType: "hop_reading",
        source: row.source,
        readingDate: row.readingDate,
        unitCode: `UNIT-${row.unitNumber}`,
        value: row.hopDays,
        unit: "hari",
      }),
    );
  }
  for (const row of input.targetRows) {
    rows.push(
      stagingRecord({
        entityType: "biomass_target",
        source: row.source,
        value: row.targetTon,
        unit: "ton",
      }),
    );
  }
  for (const row of input.cumulativeRows) {
    rows.push(
      stagingRecord({
        entityType: "biomass_cumulative",
        source: row.source,
        periodStart: row.periodStart,
        value: row.cumulativeTon,
        unit: "ton",
      }),
    );
  }
  return rows;
}

export async function buildGoogleSheetsImportPlan(query: {
  month: number;
  year: number;
}): Promise<GoogleSheetsImportPlan> {
  const result = await readAndParseDynamicBBWorksheet(query);
  const rows = buildRows(result);
  const blockingIssues = validatePlan(rows, result);
  const stagingRows = buildStagingRows(rows);
  const requestedPeriod = utcDate(result.requested.year, result.requested.month, 1);
  const summary = {
    dailyRows: rows.parsed.normalized.series.length,
    receiptRows: rows.receiptRows.length,
    coalReceiptRows: rows.coalReceiptRows.length,
    coalConsumptionRows: rows.coalConsumptionRows.length,
    coalStockRows: rows.coalStockRows.length,
    biomassConsumptionRows: rows.biomassConsumptionRows.length,
    solarConsumptionRows: rows.solarConsumptionRows.length,
    solarReceiptRows: rows.solarReceiptRows.length,
    hopRows: rows.hopRows.length,
    targetRows: rows.targetRows.length,
    cumulativeRows: rows.cumulativeRows.length,
    totalRows: stagingRows.length,
  };
  return {
    requested: result.requested,
    effective: result.effective,
    sourceRange: DYNAMIC_SCAN_RANGE,
    status: blockingIssues.length ? "NEEDS_REVIEW" : "READY_FOR_IMPORT",
    blockingIssues,
    warnings: result.parsed.diagnostics.warnings,
    requestedPeriod,
    effectivePeriod: rows.effectivePeriod,
    receiptRows: rows.receiptRows,
    coalReceiptRows: rows.coalReceiptRows,
    coalConsumptionRows: rows.coalConsumptionRows,
    coalStockRows: rows.coalStockRows,
    biomassConsumptionRows: rows.biomassConsumptionRows,
    solarConsumptionRows: rows.solarConsumptionRows,
    solarReceiptRows: rows.solarReceiptRows,
    hopRows: rows.hopRows,
    targetRows: rows.targetRows,
    cumulativeRows: rows.cumulativeRows,
    stagingRows,
    summary,
  };
}
