import type {
  CanonicalDate,
  CanonicalEntity,
  CanonicalField,
  CanonicalRecord,
  CanonicalRecordInput,
  CanonicalValueByEntity,
} from "./types";

export type { CanonicalRecordInput } from "./types";
import { validateSourceObservation } from "./provenance";
import {
  businessIdentityForValue,
  contentHashForRecord,
  sourceOccurrenceKeyForRecord,
} from "./identity";

export class CanonicalDomainError extends Error {
  readonly code = "VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalDomainError";
  }
}

function canonicalFieldsForEntity(entity: CanonicalEntity): readonly CanonicalField[] {
  switch (entity) {
    case "biomass_consumption":
      return ["biomass_consumption.quantityTon"];
    case "coal_consumption":
      return ["coal_consumption.quantityTon"];
    case "coal_stock":
      return ["coal_stock.closingStock", "coal_stock.consumed"];
    case "biomass_receipt":
      return ["biomass_receipt.quantityTon"];
    case "coal_receipt":
      return ["coal_receipt.quantityTon"];
    case "solar_consumption":
      return ["solar_consumption.quantityLiter"];
    case "solar_receipt":
      return ["solar_receipt.quantityLiter"];
    case "hop_reading":
      return ["hop_reading.hopDays"];
    case "biomass_target":
      return ["biomass_target.targetTon"];
    case "biomass_cumulative":
      return ["biomass_cumulative.cumulativeTon"];
  }
}

function isDate(value: string): value is CanonicalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function finiteNumber(value: number | null) {
  return value === null || Number.isFinite(value);
}

function assertValue<E extends CanonicalEntity>(
  entity: E,
  value: CanonicalValueByEntity[E],
) {
  if (entity === "biomass_target") {
    const typed = value as CanonicalValueByEntity["biomass_target"];
    if (!Number.isFinite(typed.targetTon))
      throw new CanonicalDomainError("biomass_target.targetTon must be finite.");
    if (!Number.isInteger(typed.targetYear) || typed.targetYear < 2000)
      throw new CanonicalDomainError("biomass_target.targetYear is invalid.");
  }
  if (
    entity === "biomass_consumption" ||
    entity === "coal_consumption" ||
    entity === "hop_reading"
  ) {
    const typed = value as CanonicalValueByEntity["biomass_consumption"];
    if (!isDate(typed.readingDate) || ![1, 2, 3].includes(typed.unitNumber))
      throw new CanonicalDomainError(`${entity} unit/date value is invalid.`);
  }
  if (entity === "solar_consumption") {
    const typed = value as CanonicalValueByEntity["solar_consumption"];
    if (!isDate(typed.readingDate))
      throw new CanonicalDomainError("solar_consumption.readingDate is invalid.");
  }
  if (entity === "coal_stock") {
    const typed = value as CanonicalValueByEntity["coal_stock"];
    if (!typed.stockScope.trim() || !isDate(typed.readingDate))
      throw new CanonicalDomainError("coal_stock scope/date value is invalid.");
  }
  if (entity === "biomass_receipt") {
    const typed = value as CanonicalValueByEntity["biomass_receipt"];
    if (!isDate(typed.periodStart) || !typed.supplierCode.trim() || !typed.supplierName.trim())
      throw new CanonicalDomainError("biomass_receipt identity value is invalid.");
  }
  if (
    (entity === "coal_receipt" ||
      entity === "solar_receipt" ||
      entity === "biomass_cumulative") &&
    !isDate((value as CanonicalValueByEntity["coal_receipt"]).periodStart)
  ) {
    throw new CanonicalDomainError(`${entity}.periodStart is invalid.`);
  }

  const numericValues = Object.entries(value)
    .filter(([key]) => !key.toLowerCase().includes("date") && key !== "supplierCode" && key !== "supplierName" && key !== "stockScope")
    .map(([, item]) => item)
    .filter((item): item is number | null => typeof item === "number" || item === null);
  if (numericValues.some((item) => !finiteNumber(item)))
    throw new CanonicalDomainError(`${entity} contains a non-finite numeric value.`);
}

function freezeRecord(record: CanonicalRecord): CanonicalRecord {
  Object.freeze(record.value);
  Object.freeze(record.businessIdentity.keyFields);
  Object.freeze(record.businessIdentity);
  if (record.source.effectivePeriod) Object.freeze(record.source.effectivePeriod);
  Object.freeze(record.sourceIdentity);
  Object.freeze(record.source);
  Object.freeze(record.validation.errors);
  Object.freeze(record.validation.warnings);
  Object.freeze(record.validation);
  Object.freeze(record.mappingFields);
  return Object.freeze(record);
}

export function createCanonicalRecord<E extends CanonicalEntity>(
  input: CanonicalRecordInput<E>,
): CanonicalRecord<E> {
  assertValue(input.entity, input.value);
  const mappingVersion = input.mappingVersion ?? input.source.mappingVersion;
  const schemaVersion = input.schemaVersion ?? input.source.schemaVersion;
  const parserVersion = input.parserVersion ?? input.source.parserVersion;
  if (mappingVersion !== input.source.mappingVersion)
    throw new CanonicalDomainError("Record and source mapping versions differ.");
  if (schemaVersion !== input.source.schemaVersion)
    throw new CanonicalDomainError("Record and source schema versions differ.");
  if (parserVersion !== input.source.parserVersion)
    throw new CanonicalDomainError("Record and source parser versions differ.");

  const provenance = validateSourceObservation(input.source);
  const validation = provenance.valid
    ? input.validation
    : {
        ...input.validation,
        status: "BLOCKED" as const,
        errors: [...new Set([...input.validation.errors, ...provenance.errors])],
        provenanceComplete: false,
      };
  const businessIdentity = businessIdentityForValue(
    input.entity,
    input.value,
    input.businessScope ??
      (input.entity === "coal_stock"
        ? (input.value as CanonicalValueByEntity["coal_stock"]).stockScope
        : "plant"),
  );
  const base = {
    entity: input.entity,
    grain: input.grain,
    value: input.value,
    businessIdentity,
    source: input.source,
    validation,
    mappingFields: input.mappingFields ?? canonicalFieldsForEntity(input.entity),
    mappingVersion,
    schemaVersion,
    parserVersion,
  } as const;
  const sourceOccurrenceKey = sourceOccurrenceKeyForRecord(base);
  const contentHash = contentHashForRecord(base);
  return freezeRecord({
    ...base,
    sourceIdentity: {
      sourceKey: input.source.sourceKey,
      spreadsheetId: input.source.spreadsheetId,
      sheetId: input.source.sheetId,
      worksheetTitleSnapshot: input.source.worksheetTitleSnapshot,
      sourceOccurrenceKey,
      mappingVersion,
      schemaVersion,
    },
    sourceOccurrenceKey,
    contentHash,
  }) as CanonicalRecord<E>;
}
