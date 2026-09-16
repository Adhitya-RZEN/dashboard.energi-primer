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
} from "../import/types";
import { sourceKeyForImportRecord } from "../sync/identity";
import type {
  CanonicalEntity,
  CanonicalRecord,
  CanonicalValueByEntity,
} from "./types";

export type CompatibilityImportRecord =
  | BiomassConsumptionImportRecord
  | CoalConsumptionImportRecord
  | CoalStockImportRecord
  | BiomassReceiptImportRecord
  | CoalReceiptImportRecord
  | SolarConsumptionImportRecord
  | SolarReceiptImportRecord
  | HopImportRecord
  | BiomassTargetImportRecord
  | BiomassCumulativeImportRecord;

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function sourceFor(record: CanonicalRecord): ImportSource {
  const mappingSourceKind = record.source.mappingSourceKind ??
    (record.source.observationKind === "POLICY_FALLBACK"
      ? "POLICY_FALLBACK"
      : "SEMANTIC_PATH");
  const mappingAuthorization = record.source.mappingAuthorization ??
    (mappingSourceKind === "POLICY_FALLBACK"
      ? "APPROVED_POLICY_FALLBACK"
      : "APPROVED_EXACT");
  return {
    worksheet: record.source.worksheetTitleSnapshot,
    cell: record.source.cellAddress,
    row: record.source.row,
    column: record.source.column,
    sheetId: record.source.sheetId,
    sourceRange: record.source.sourceRange,
    rawDisplayValue: record.source.rawDisplayValue,
    rawDisplayValues: record.source.rawDisplayValues,
    sourceAddresses: record.source.sourceAddresses,
    sourceGranularity: record.source.granularity,
    importRunId: record.source.importRunId,
    observationKind: record.source.observationKind,
    mappingSourceKind,
    mappingAuthorization,
  };
}

export function compatibilityImportRecordForCanonical(
  record: CanonicalRecord,
): CompatibilityImportRecord {
  const source = sourceFor(record);
  const value = record.value as CanonicalValueByEntity[typeof record.entity];
  switch (record.entity) {
    case "biomass_consumption": {
      const typed = value as CanonicalValueByEntity["biomass_consumption"];
      return {
        readingDate: date(typed.readingDate),
        unitNumber: typed.unitNumber,
        quantityTon: typed.quantityTon,
        source,
      };
    }
    case "coal_consumption": {
      const typed = value as CanonicalValueByEntity["coal_consumption"];
      return {
        readingDate: date(typed.readingDate),
        unitNumber: typed.unitNumber,
        quantityTon: typed.quantityTon,
        source,
      };
    }
    case "coal_stock": {
      const typed = value as CanonicalValueByEntity["coal_stock"];
      return {
        readingDate: date(typed.readingDate),
        closingStock: typed.closingStock,
        consumed: typed.consumed,
        source,
      };
    }
    case "biomass_receipt": {
      const typed = value as CanonicalValueByEntity["biomass_receipt"];
      return {
        periodStart: date(typed.periodStart),
        supplierCode: typed.supplierCode,
        supplierName: typed.supplierName,
        quantityTon: typed.quantityTon,
        source,
      };
    }
    case "coal_receipt": {
      const typed = value as CanonicalValueByEntity["coal_receipt"];
      return {
        periodStart: date(typed.periodStart),
        quantityTon: typed.quantityTon,
        source,
      };
    }
    case "solar_consumption": {
      const typed = value as CanonicalValueByEntity["solar_consumption"];
      return {
        readingDate: date(typed.readingDate),
        quantityLiter: typed.quantityLiter,
        source,
      };
    }
    case "solar_receipt": {
      const typed = value as CanonicalValueByEntity["solar_receipt"];
      return {
        periodStart: date(typed.periodStart),
        quantityLiter: typed.quantityLiter,
        source,
      };
    }
    case "hop_reading": {
      const typed = value as CanonicalValueByEntity["hop_reading"];
      return {
        readingDate: date(typed.readingDate),
        unitNumber: typed.unitNumber,
        hopDays: typed.hopDays,
        source,
      };
    }
    case "biomass_target": {
      const typed = value as CanonicalValueByEntity["biomass_target"];
      return {
        targetYear: typed.targetYear,
        targetTon: typed.targetTon,
        source,
      };
    }
    case "biomass_cumulative": {
      const typed = value as CanonicalValueByEntity["biomass_cumulative"];
      return {
        periodStart: date(typed.periodStart),
        cumulativeTon: typed.cumulativeTon,
        source,
      };
    }
  }
}

export function sourceKeyForCanonicalRecord(record: CanonicalRecord) {
  return sourceKeyForImportRecord(
    compatibilityImportRecordForCanonical(record),
    record.entity,
  );
}

function normalizedValue(record: CanonicalRecord) {
  const value = record.value as Record<string, unknown>;
  if (typeof value.quantityTon === "number" || value.quantityTon === null) return value.quantityTon;
  if (typeof value.quantityLiter === "number" || value.quantityLiter === null) return value.quantityLiter;
  if (typeof value.closingStock === "number" || value.closingStock === null) return value.closingStock as number | null;
  if (typeof value.hopDays === "number" || value.hopDays === null) return value.hopDays as number | null;
  if (typeof value.targetTon === "number") return value.targetTon;
  if (typeof value.cumulativeTon === "number" || value.cumulativeTon === null) return value.cumulativeTon as number | null;
  return null;
}

function stagingFor(record: CanonicalRecord): ImportStagingRecord {
  const value = record.value as Record<string, unknown>;
  const readingDate = typeof value.readingDate === "string" ? date(value.readingDate) : null;
  const periodStart = typeof value.periodStart === "string"
    ? date(value.periodStart)
    : record.entity === "biomass_target" && typeof value.targetYear === "number"
      ? new Date(Date.UTC(value.targetYear, 0, 1))
      : null;
  const unitNumber = typeof value.unitNumber === "number" ? value.unitNumber : null;
  const supplierCode = typeof value.supplierCode === "string" ? value.supplierCode : null;
  const isEmpty = record.validation.status === "VALID_EMPTY";
  const valueUnit = record.entity === "solar_consumption" || record.entity === "solar_receipt"
    ? "liter"
    : record.entity === "hop_reading"
      ? "hari"
      : "ton";
  return {
    entityType: record.entity,
    source: sourceFor(record),
    periodStart,
    readingDate,
    unitCode: unitNumber === null ? null : `PLTU-${unitNumber}`,
    supplierCode,
    rawValue: record.source.rawDisplayValue,
    normalizedValue: normalizedValue(record),
    contentHashSeed: record.contentHash,
    valueUnit,
    validationStatus: isEmpty ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  };
}

function summaryFor(rows: {
  stagingRows: readonly ImportStagingRecord[];
  receiptRows: readonly unknown[];
  coalReceiptRows: readonly unknown[];
  coalConsumptionRows: readonly unknown[];
  coalStockRows: readonly unknown[];
  biomassConsumptionRows: readonly unknown[];
  solarConsumptionRows: readonly unknown[];
  solarReceiptRows: readonly unknown[];
  hopRows: readonly unknown[];
  targetRows: readonly unknown[];
  cumulativeRows: readonly unknown[];
}): GoogleSheetsImportPlan["summary"] {
  const dailyRows = rows.stagingRows.filter((row) => row.readingDate !== null).length;
  return {
    dailyRows,
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
    totalRows: rows.stagingRows.length,
  };
}

/**
 * One-way adapter from a canonical batch to the existing bounded bulk writer.
 * It carries typed values and source evidence forward; it does not rediscover
 * fields, reclassify identity, or include non-writable canonical items.
 */
export function compatibilityPlanForCanonicalBatch(
  basePlan: GoogleSheetsImportPlan,
  records: readonly CanonicalRecord[],
): GoogleSheetsImportPlan {
  const rowsFor = <T extends CompatibilityImportRecord>(entity: CanonicalEntity) =>
    records
      .filter((record) => record.entity === entity)
      .map(compatibilityImportRecordForCanonical) as T[];
  const receiptRows = rowsFor<BiomassReceiptImportRecord>("biomass_receipt");
  const coalReceiptRows = rowsFor<CoalReceiptImportRecord>("coal_receipt");
  const coalConsumptionRows = rowsFor<CoalConsumptionImportRecord>("coal_consumption");
  const coalStockRows = rowsFor<CoalStockImportRecord>("coal_stock");
  const biomassConsumptionRows = rowsFor<BiomassConsumptionImportRecord>("biomass_consumption");
  const solarConsumptionRows = rowsFor<SolarConsumptionImportRecord>("solar_consumption");
  const solarReceiptRows = rowsFor<SolarReceiptImportRecord>("solar_receipt");
  const hopRows = rowsFor<HopImportRecord>("hop_reading");
  const targetRows = rowsFor<BiomassTargetImportRecord>("biomass_target");
  const cumulativeRows = rowsFor<BiomassCumulativeImportRecord>("biomass_cumulative");
  const stagingRows = records.map(stagingFor);
  return {
    ...basePlan,
    status: "READY_FOR_IMPORT",
    blockingIssues: [],
    warnings: [],
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
    summary: summaryFor({
      stagingRows,
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
    }),
  };
}
