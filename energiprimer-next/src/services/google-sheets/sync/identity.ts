import "server-only";

import { createHash } from "node:crypto";

import type {
  BiomassConsumptionImportRecord,
  BiomassCumulativeImportRecord,
  BiomassReceiptImportRecord,
  BiomassTargetImportRecord,
  CoalConsumptionImportRecord,
  CoalReceiptImportRecord,
  CoalStockImportRecord,
  HopImportRecord,
  ImportStagingRecord,
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "@/services/google-sheets/import/types";

export type SyncAction = "INSERT" | "UPDATE" | "SKIP";

type IdentityInput = {
  entityType: string;
  periodStart?: Date | null;
  readingDate?: Date | null;
  targetYear?: number | null;
  unitNumber?: 1 | 2 | 3 | null;
  unitCode?: string | null;
  supplierCode?: string | null;
  valueUnit?: string | null;
};

function datePart(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function normalizedToken(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function unitPart(input: IdentityInput) {
  if (input.unitNumber) return `unit-${input.unitNumber}`;
  const match = input.unitCode?.match(/(?:UNIT|PLTU)[\s-]*([123])$/i);
  return match ? `unit-${match[1]}` : normalizedToken(input.unitCode);
}

function identityPayload(input: IdentityInput) {
  const targetYear =
    input.targetYear ??
    (input.entityType === "biomass_target" && input.periodStart
      ? input.periodStart.getUTCFullYear()
      : null);
  return [
    input.entityType,
    datePart(input.periodStart),
    datePart(input.readingDate),
    targetYear ?? "",
    unitPart(input),
    normalizedToken(input.supplierCode),
    normalizedToken(input.valueUnit),
  ].join("|");
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Stable business/source identity. It deliberately excludes spreadsheet row
 * numbers and cell addresses so sorting or inserting source rows does not
 * create a new record identity.
 */
export function sourceKeyForIdentity(input: IdentityInput) {
  return hash(identityPayload(input));
}

export function contentHashForIdentity(
  identity: IdentityInput,
  normalizedValue: number | string | null,
) {
  return hash(
    `${identityPayload(identity)}|value=${normalizedValue === null ? "NULL" : String(normalizedValue)}`,
  );
}

export function sourceKeyForStagingRow(row: ImportStagingRecord) {
  return sourceKeyForIdentity({
    entityType: row.entityType,
    periodStart: row.periodStart,
    readingDate: row.readingDate,
    unitCode: row.unitCode,
    supplierCode: row.supplierCode,
    valueUnit: row.valueUnit,
  });
}

export function contentHashForStagingRow(row: ImportStagingRecord) {
  return contentHashForIdentity(
    {
      entityType: row.entityType,
      periodStart: row.periodStart,
      readingDate: row.readingDate,
      unitCode: row.unitCode,
      supplierCode: row.supplierCode,
      valueUnit: row.valueUnit,
    },
    row.contentHashSeed ?? row.normalizedValue,
  );
}

export function contentHashForStagingRows(
  rows: readonly ImportStagingRecord[],
) {
  const entries = rows
    .map((row) => `${sourceKeyForStagingRow(row)}:${contentHashForStagingRow(row)}`)
    .sort();
  return hash(entries.join("\n"));
}

export function sourceKeyForImportRecord(
  record:
    | BiomassReceiptImportRecord
    | BiomassConsumptionImportRecord
    | BiomassTargetImportRecord
    | BiomassCumulativeImportRecord
    | CoalConsumptionImportRecord
    | CoalReceiptImportRecord
    | CoalStockImportRecord
    | HopImportRecord
    | SolarConsumptionImportRecord
    | SolarReceiptImportRecord,
  entityType: string,
) {
  const input: IdentityInput = { entityType };
  if ("periodStart" in record) input.periodStart = record.periodStart;
  if ("readingDate" in record) input.readingDate = record.readingDate;
  if ("unitNumber" in record) input.unitNumber = record.unitNumber;
  if ("supplierCode" in record) input.supplierCode = record.supplierCode;
  if ("targetYear" in record) input.targetYear = record.targetYear;
  if ("quantityTon" in record) input.valueUnit = "ton";
  if ("quantityLiter" in record) input.valueUnit = "liter";
  if ("closingStock" in record) input.valueUnit = "ton";
  if ("consumed" in record) input.valueUnit = "ton";
  if ("hopDays" in record) input.valueUnit = "hari";
  return sourceKeyForIdentity(input);
}

export function contentHashForImportRecord(
  record:
    | BiomassReceiptImportRecord
    | BiomassConsumptionImportRecord
    | BiomassTargetImportRecord
    | BiomassCumulativeImportRecord
    | CoalConsumptionImportRecord
    | CoalReceiptImportRecord
    | CoalStockImportRecord
    | HopImportRecord
    | SolarConsumptionImportRecord
    | SolarReceiptImportRecord,
  entityType: string,
) {
  let value: number | null = null;
  if ("quantityTon" in record) value = record.quantityTon;
  if ("quantityLiter" in record) value = record.quantityLiter;
  if ("closingStock" in record) value = record.closingStock;
  if ("consumed" in record && value === null) value = record.consumed;
  if ("hopDays" in record) value = record.hopDays;
  if ("cumulativeTon" in record) value = record.cumulativeTon;
  if ("targetTon" in record) value = record.targetTon;

  const identity: IdentityInput = { entityType };
  if ("periodStart" in record) identity.periodStart = record.periodStart;
  if ("readingDate" in record) identity.readingDate = record.readingDate;
  if ("unitNumber" in record) identity.unitNumber = record.unitNumber;
  if ("supplierCode" in record) identity.supplierCode = record.supplierCode;
  if ("targetYear" in record) identity.targetYear = record.targetYear;
  if ("quantityTon" in record || "closingStock" in record || "consumed" in record)
    identity.valueUnit = "ton";
  if ("quantityLiter" in record) identity.valueUnit = "liter";
  if ("hopDays" in record) identity.valueUnit = "hari";
  return contentHashForIdentity(identity, value);
}
