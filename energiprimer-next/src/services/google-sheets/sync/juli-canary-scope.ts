import "server-only";

import {
  canonicalRecordsForCompatibilityPlan,
  type CompatibilityCanonicalPlanInput,
} from "@/services/google-sheets/canonical/compatibility";
import type {
  CanonicalField,
  CanonicalEntity,
  CanonicalImportPlan,
  CanonicalRecord,
} from "@/services/google-sheets/canonical/types";
import { sourceKeyForCanonicalRecord } from "@/services/google-sheets/canonical/compatibility-adapter";
import type { GoogleSheetsImportPlan } from "@/services/google-sheets/import/types";

import { filterImportPlanToSourceKeys } from "./commit-scope";
import {
  sourceKeyForImportRecord,
  sourceKeyForStagingRow,
} from "./identity";

export const JULI26_CANARY_SCOPE_ID =
  "Juli26-BB_FINAL_DAY_AND_AGGREGATES_V1" as const;
export const JULI26_CANARY_WORKSHEET = "Juli26-BB" as const;
export const JULI26_CANARY_SHEET_ID = "1692973815" as const;
export const JULI26_CANARY_DATE = "2026-07-31" as const;
export const JULI26_CANARY_PERIOD_START = "2026-07-01" as const;

export const JULI26_CANARY_EXPECTED_COUNTS: Readonly<
  Record<CanonicalEntity, number>
> = {
  biomass_consumption: 3,
  coal_consumption: 3,
  coal_stock: 1,
  biomass_receipt: 7,
  coal_receipt: 1,
  solar_consumption: 1,
  solar_receipt: 1,
  hop_reading: 3,
  biomass_target: 1,
  biomass_cumulative: 1,
};

type JuliCanaryExpectation = {
  key: string;
  entity: CanonicalEntity;
  cellAddress: string;
  row: number;
  column: number;
  fields: readonly CanonicalField[];
};

const JULI26_CANARY_EXPECTATIONS: readonly JuliCanaryExpectation[] = [
  { key: "biomass_consumption|1|2026-07-31", entity: "biomass_consumption", cellAddress: "T41", row: 41, column: 20, fields: ["biomass_consumption.quantityTon"] },
  { key: "biomass_consumption|2|2026-07-31", entity: "biomass_consumption", cellAddress: "W41", row: 41, column: 23, fields: ["biomass_consumption.quantityTon"] },
  { key: "biomass_consumption|3|2026-07-31", entity: "biomass_consumption", cellAddress: "Z41", row: 41, column: 26, fields: ["biomass_consumption.quantityTon"] },
  { key: "coal_consumption|1|2026-07-31", entity: "coal_consumption", cellAddress: "S41", row: 41, column: 19, fields: ["coal_consumption.quantityTon"] },
  { key: "coal_consumption|2|2026-07-31", entity: "coal_consumption", cellAddress: "V41", row: 41, column: 22, fields: ["coal_consumption.quantityTon"] },
  { key: "coal_consumption|3|2026-07-31", entity: "coal_consumption", cellAddress: "Y41", row: 41, column: 25, fields: ["coal_consumption.quantityTon"] },
  { key: "coal_stock|plant|2026-07-31", entity: "coal_stock", cellAddress: "AD41", row: 41, column: 30, fields: ["coal_stock.closingStock", "coal_stock.consumed"] },
  { key: "biomass_receipt|2026-07-01|sawdust-pt-syahroni", entity: "biomass_receipt", cellAddress: "J42", row: 42, column: 10, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|sawdust-pt-bintang", entity: "biomass_receipt", cellAddress: "K42", row: 42, column: 11, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|woodchip-pt-syahroni", entity: "biomass_receipt", cellAddress: "L42", row: 42, column: 12, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|woodchip-pt-rap", entity: "biomass_receipt", cellAddress: "M42", row: 42, column: 13, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|woodchip-cv-multi-paketindo", entity: "biomass_receipt", cellAddress: "N42", row: 42, column: 14, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|lruk", entity: "biomass_receipt", cellAddress: "P42", row: 42, column: 16, fields: ["biomass_receipt.quantityTon"] },
  { key: "biomass_receipt|2026-07-01|srf", entity: "biomass_receipt", cellAddress: "Q42", row: 42, column: 17, fields: ["biomass_receipt.quantityTon"] },
  { key: "coal_receipt|2026-07-01", entity: "coal_receipt", cellAddress: "Y60", row: 60, column: 25, fields: ["coal_receipt.quantityTon"] },
  { key: "solar_consumption|2026-07-31", entity: "solar_consumption", cellAddress: "CJ41", row: 41, column: 88, fields: ["solar_consumption.quantityLiter"] },
  { key: "solar_receipt|2026-07-01", entity: "solar_receipt", cellAddress: "Y69", row: 69, column: 25, fields: ["solar_receipt.quantityLiter"] },
  { key: "hop_reading|1|2026-07-31", entity: "hop_reading", cellAddress: "AL41", row: 41, column: 38, fields: ["hop_reading.hopDays"] },
  { key: "hop_reading|2|2026-07-31", entity: "hop_reading", cellAddress: "AK41", row: 41, column: 37, fields: ["hop_reading.hopDays"] },
  { key: "hop_reading|3|2026-07-31", entity: "hop_reading", cellAddress: "AJ41", row: 41, column: 36, fields: ["hop_reading.hopDays"] },
  { key: "biomass_target|2026", entity: "biomass_target", cellAddress: "CO56", row: 56, column: 93, fields: ["biomass_target.targetTon"] },
  { key: "biomass_cumulative|2026-07-01", entity: "biomass_cumulative", cellAddress: "Y71", row: 71, column: 25, fields: ["biomass_cumulative.cumulativeTon"] },
];

const JULI26_CANARY_EXPECTATION_BY_KEY = new Map(
  JULI26_CANARY_EXPECTATIONS.map((expectation) => [expectation.key, expectation]),
);

const JULI26_CANARY_EXPECTATION_BY_CELL = new Map(
  JULI26_CANARY_EXPECTATIONS.map((expectation) => [expectation.cellAddress, expectation]),
);

function sameWorksheet(left: string, right: string) {
  return left.trim().toLocaleLowerCase("en-US") ===
    right.trim().toLocaleLowerCase("en-US");
}

function selectorKey(record: CanonicalRecord) {
  const value = record.value as Record<string, unknown>;
  switch (record.entity) {
    case "biomass_consumption":
    case "coal_consumption":
    case "hop_reading":
      return `${record.entity}|${value.unitNumber}|${value.readingDate}`;
    case "coal_stock":
      return `${record.entity}|${value.stockScope}|${value.readingDate}`;
    case "biomass_receipt":
      return `${record.entity}|${value.periodStart}|${value.supplierCode}`;
    case "coal_receipt":
    case "solar_receipt":
    case "biomass_cumulative":
      return `${record.entity}|${value.periodStart}`;
    case "solar_consumption":
      return `${record.entity}|${value.readingDate}`;
    case "biomass_target":
      return `${record.entity}|${value.targetYear}`;
  }
}

function exactSourceForExpectation(
  record: CanonicalRecord,
  expectation: JuliCanaryExpectation,
) {
  const source = record.source;
  const fields = new Set(record.mappingFields);
  return record.entity === expectation.entity &&
    sameWorksheet(source.worksheetTitleSnapshot, JULI26_CANARY_WORKSHEET) &&
    source.sourceKey.trim().length > 0 &&
    source.spreadsheetId.trim().length > 0 &&
    source.sheetId === JULI26_CANARY_SHEET_ID &&
    source.sourceRange === "A1:ZZ500" &&
    source.observationKind === "SOURCE_CELL" &&
    source.granularity === "CELL" &&
    source.cellAddress?.toLocaleUpperCase("en-US") === expectation.cellAddress &&
    source.row === expectation.row &&
    source.column === expectation.column &&
    source.rawDisplayValue !== null &&
    source.rawDisplayValue !== undefined &&
    record.sourceOccurrenceKey.trim().length > 0 &&
    (source.mappingAuthorization === "APPROVED_EXACT" ||
      source.mappingAuthorization === "APPROVED_STRUCTURAL") &&
    source.mappingSourceKind === "SEMANTIC_PATH" &&
    fields.size === expectation.fields.length &&
    expectation.fields.every((field) => fields.has(field));
}

function datePart(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function unitNumber(value: string | null | undefined) {
  const match = value?.match(/(?:UNIT|PLTU)[\s-]*([123])$/iu);
  return match?.[1] ?? "";
}

function stagingScopeKey(row: {
  entityType: string;
  periodStart: Date | null;
  readingDate: Date | null;
  unitCode: string | null;
  supplierCode: string | null;
}) {
  switch (row.entityType) {
    case "biomass_consumption":
    case "coal_consumption":
    case "hop_reading":
      return `${row.entityType}|${unitNumber(row.unitCode)}|${datePart(row.readingDate)}`;
    case "coal_stock":
      return `${row.entityType}|plant|${datePart(row.readingDate)}`;
    case "biomass_receipt":
      return `${row.entityType}|${datePart(row.periodStart)}|${row.supplierCode ?? ""}`;
    case "coal_receipt":
    case "solar_receipt":
    case "biomass_cumulative":
      return `${row.entityType}|${datePart(row.periodStart)}`;
    case "solar_consumption":
      return `${row.entityType}|${datePart(row.readingDate)}`;
    case "biomass_target":
      return `${row.entityType}|${row.periodStart?.getUTCFullYear() ?? ""}`;
    default:
      return `${row.entityType}|UNKNOWN`;
  }
}

function importScopeKey(entity: CanonicalEntity, row: Record<string, unknown>) {
  switch (entity) {
    case "biomass_consumption":
    case "coal_consumption":
    case "hop_reading":
      return `${entity}|${row.unitNumber}|${datePart(row.readingDate as Date | null)} `
        .trim();
    case "coal_stock":
      return `${entity}|plant|${datePart(row.readingDate as Date | null)}`;
    case "biomass_receipt":
      return `${entity}|${datePart(row.periodStart as Date | null)}|${row.supplierCode ?? ""}`;
    case "coal_receipt":
    case "solar_receipt":
    case "biomass_cumulative":
      return `${entity}|${datePart(row.periodStart as Date | null)}`;
    case "solar_consumption":
      return `${entity}|${datePart(row.readingDate as Date | null)}`;
    case "biomass_target":
      return `${entity}|${row.targetYear ?? ""}`;
  }
}

function sourceMatchesExpectation(
  source: {
    worksheet: string;
    sheetId?: string | null;
    sourceRange?: string | null;
    cell: string | null;
    row: number | null;
    column?: number | null;
    rawDisplayValue?: string | null;
    sourceGranularity?: string;
    observationKind?: string;
    mappingSourceKind?: string;
    mappingAuthorization?: string;
  },
  expectation: JuliCanaryExpectation,
) {
  return sameWorksheet(source.worksheet, JULI26_CANARY_WORKSHEET) &&
    source.sheetId === JULI26_CANARY_SHEET_ID &&
    source.sourceRange === "A1:ZZ500" &&
    source.cell?.toLocaleUpperCase("en-US") === expectation.cellAddress &&
    source.row === expectation.row &&
    source.column === expectation.column &&
    source.rawDisplayValue !== null &&
    source.sourceGranularity === "CELL" &&
    source.observationKind === "SOURCE_CELL" &&
    source.mappingSourceKind === "SEMANTIC_PATH" &&
    (source.mappingAuthorization === "APPROVED_EXACT" ||
      source.mappingAuthorization === "APPROVED_STRUCTURAL");
}

/**
 * Validates an immutable canonical plan loaded from the ledger before a
 * state-only recovery. This keeps recovery closed over the same 22 live
 * identities even when the worksheet registry is temporarily in ERROR.
 */
export function assertJuliCanaryCanonicalPlan(
  plan: CanonicalImportPlan,
) {
  if (
    plan.sourceManifest.sheetId !== JULI26_CANARY_SHEET_ID ||
    plan.sourceManifest.sourceRange !== "A1:ZZ500" ||
    !sameWorksheet(
      plan.sourceManifest.worksheetTitleSnapshot,
      JULI26_CANARY_WORKSHEET,
    ) ||
    plan.items.length !== JULI26_CANARY_EXPECTATIONS.length
  ) {
    throw new Error("Juli canary canonical plan is outside the exact 22-record scope.");
  }

  const businessKeys = new Set<string>();
  for (const item of plan.items) {
    const expectation = JULI26_CANARY_EXPECTATION_BY_KEY.get(selectorKey(item.record));
    if (
      !expectation ||
      !exactSourceForExpectation(item.record, expectation) ||
      item.record.source.sourceKey !== plan.sourceManifest.sourceKey ||
      item.record.source.spreadsheetId !== plan.sourceManifest.spreadsheetId ||
      item.record.source.sheetId !== plan.sourceManifest.sheetId ||
      businessKeys.has(item.businessKey)
    ) {
      throw new Error("Juli canary canonical plan contains an unexpected identity or source.");
    }
    businessKeys.add(item.businessKey);
  }
}

/**
 * Validates the compatibility payload immediately before the low-level
 * Production writer. Batch execution may contain only the writable subset
 * of the 22 selected records, but every typed row and staging row must still
 * be one of the closed Juli identities and source cells.
 */
export function assertJuliCanaryCompatibilityPlan(plan: GoogleSheetsImportPlan) {
  if (
    plan.effective.worksheet.trim().toLocaleLowerCase("en-US") !==
      JULI26_CANARY_WORKSHEET.toLocaleLowerCase("en-US") ||
    plan.stagingRows.length < 1 ||
    plan.stagingRows.length > JULI26_CANARY_EXPECTATIONS.length ||
    plan.summary.totalRows !== plan.stagingRows.length
  ) {
    throw new Error("Juli canary compatibility payload is outside the exact 22-record scope.");
  }

  const stagingKeys = new Set<string>();
  for (const row of plan.stagingRows) {
    const cell = row.source.cell?.toLocaleUpperCase("en-US") ?? "";
    const expectation = JULI26_CANARY_EXPECTATION_BY_CELL.get(cell);
    if (!expectation || row.entityType !== expectation.entity ||
      stagingScopeKey(row) !== expectation.key ||
      !sourceMatchesExpectation(row.source, expectation)) {
      throw new Error("Juli canary staging payload contains an unexpected identity or source.");
    }
    const key = sourceKeyForStagingRow(row);
    if (stagingKeys.has(key)) throw new Error("Juli canary staging payload contains duplicate identities.");
    stagingKeys.add(key);
  }

  const typedRows: readonly { entity: CanonicalEntity; rows: readonly Record<string, unknown>[] }[] = [
    { entity: "biomass_consumption", rows: plan.biomassConsumptionRows as readonly Record<string, unknown>[] },
    { entity: "coal_consumption", rows: plan.coalConsumptionRows as readonly Record<string, unknown>[] },
    { entity: "coal_stock", rows: plan.coalStockRows as readonly Record<string, unknown>[] },
    { entity: "biomass_receipt", rows: plan.receiptRows as readonly Record<string, unknown>[] },
    { entity: "coal_receipt", rows: plan.coalReceiptRows as readonly Record<string, unknown>[] },
    { entity: "solar_consumption", rows: plan.solarConsumptionRows as readonly Record<string, unknown>[] },
    { entity: "solar_receipt", rows: plan.solarReceiptRows as readonly Record<string, unknown>[] },
    { entity: "hop_reading", rows: plan.hopRows as readonly Record<string, unknown>[] },
    { entity: "biomass_target", rows: plan.targetRows as readonly Record<string, unknown>[] },
    { entity: "biomass_cumulative", rows: plan.cumulativeRows as readonly Record<string, unknown>[] },
  ];
  const flattened = typedRows.flatMap(({ entity, rows }) => rows.map((row) => ({ entity, row })));
  if (flattened.length !== plan.stagingRows.length) {
    throw new Error("Juli canary typed payload does not match its staging payload.");
  }
  const summaryCounts = {
    receiptRows: plan.receiptRows.length,
    coalReceiptRows: plan.coalReceiptRows.length,
    coalConsumptionRows: plan.coalConsumptionRows.length,
    coalStockRows: plan.coalStockRows.length,
    biomassConsumptionRows: plan.biomassConsumptionRows.length,
    solarConsumptionRows: plan.solarConsumptionRows.length,
    solarReceiptRows: plan.solarReceiptRows.length,
    hopRows: plan.hopRows.length,
    targetRows: plan.targetRows.length,
    cumulativeRows: plan.cumulativeRows.length,
  };
  for (const [name, count] of Object.entries(summaryCounts)) {
    if (plan.summary[name as keyof typeof summaryCounts] !== count) {
      throw new Error("Juli canary typed payload summary does not match its rows.");
    }
  }
  const typedKeys = new Set<string>();
  for (const { entity, row } of flattened) {
    const source = row.source as Parameters<typeof sourceMatchesExpectation>[0];
    const cell = source.cell?.toLocaleUpperCase("en-US") ?? "";
    const expectation = JULI26_CANARY_EXPECTATION_BY_CELL.get(cell);
    if (!expectation || expectation.entity !== entity ||
      importScopeKey(entity, row) !== expectation.key ||
      !sourceMatchesExpectation(source, expectation)) {
      throw new Error("Juli canary typed payload contains an unexpected identity or source.");
    }
    const key = sourceKeyForImportRecord(row as never, entity);
    if (typedKeys.has(key) || !stagingKeys.has(key)) {
      throw new Error("Juli canary typed payload does not match staging identities.");
    }
    typedKeys.add(key);
  }
}

/**
 * Returns the only Phase 6 source scope admitted for Juli26-BB. The selector
 * is intentionally closed over the approved worksheet period and entity
 * cardinalities; callers cannot supply arbitrary rows, dates, or source keys.
 */
export function selectJuliCanaryRecords(
  records: readonly CanonicalRecord[],
  worksheetTitle: string,
) {
  if (!sameWorksheet(worksheetTitle, JULI26_CANARY_WORKSHEET)) {
    throw new Error("Juli canary worksheet scope is restricted to Juli26-BB.");
  }

  const selected = records.filter((record) => {
    const expectation = JULI26_CANARY_EXPECTATION_BY_KEY.get(selectorKey(record));
    return expectation ? exactSourceForExpectation(record, expectation) : false;
  });
  if (selected.length !== JULI26_CANARY_EXPECTATIONS.length) {
    throw new Error("Juli canary scope is not the approved exact 22-record shape.");
  }
  for (const expectation of JULI26_CANARY_EXPECTATIONS) {
    const matches = selected.filter((record) => selectorKey(record) === expectation.key);
    if (matches.length !== 1) {
      throw new Error(`Juli canary scope is missing exact source ${expectation.cellAddress}.`);
    }
  }

  const businessKeys = new Set(
    selected.map((record) => record.businessIdentity.canonicalKey),
  );
  if (businessKeys.size !== selected.length) {
    throw new Error("Juli canary scope contains duplicate business identities.");
  }
  return selected;
}

export type JuliCanaryScope = {
  scopeId: typeof JULI26_CANARY_SCOPE_ID;
  sourceRecords: readonly CanonicalRecord[];
  records: readonly CanonicalRecord[];
  sourceKeys: readonly string[];
  plan: GoogleSheetsImportPlan;
};

/**
 * Builds the exact legacy compatibility payload that corresponds to the
 * canonical 22-record selector. This is used by both preflight and execution
 * so the submitted plan hash cannot name one scope while the writer receives
 * another.
 */
export function juliCanaryScopeForCompatibilityPlan(
  input: CompatibilityCanonicalPlanInput,
): JuliCanaryScope {
  const { records: sourceRecords } = canonicalRecordsForCompatibilityPlan(input);
  const records = selectJuliCanaryRecords(sourceRecords, input.worksheetTitle);
  const sourceKeys = records.map(sourceKeyForCanonicalRecord);
  const uniqueSourceKeys = new Set(sourceKeys);
  if (uniqueSourceKeys.size !== sourceKeys.length) {
    throw new Error("Juli canary scope contains duplicate source identities.");
  }
  const plan = filterImportPlanToSourceKeys(input.plan, uniqueSourceKeys);
  if (plan.stagingRows.length !== records.length) {
    throw new Error("Juli canary scope does not map one-to-one to staging rows.");
  }
  return {
    scopeId: JULI26_CANARY_SCOPE_ID,
    sourceRecords,
    records,
    sourceKeys,
    plan,
  };
}
