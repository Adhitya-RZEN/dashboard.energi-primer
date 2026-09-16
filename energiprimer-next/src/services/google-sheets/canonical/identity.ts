import { createHash } from "node:crypto";

import type {
  BusinessIdentity,
  CanonicalEntity,
  CanonicalRecord,
  CanonicalValueByEntity,
  SourceObservation,
} from "./types";

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function token(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  if (typeof value === "string") return value;
  return value;
}

function canonicalDate(value: string) {
  return value.trim();
}

function keyFieldsForValue<E extends CanonicalEntity>(
  entity: E,
  value: CanonicalValueByEntity[E],
): Readonly<Record<string, string | number>> {
  switch (entity) {
    case "biomass_consumption":
    case "coal_consumption":
    case "hop_reading":
      {
        const typed = value as CanonicalValueByEntity["biomass_consumption"];
      return {
          unitNumber: typed.unitNumber,
          readingDate: canonicalDate(typed.readingDate),
      };
      }
    case "coal_stock":
      {
        const typed = value as CanonicalValueByEntity["coal_stock"];
      return {
          stockScope: token(typed.stockScope),
          readingDate: canonicalDate(typed.readingDate),
      };
      }
    case "biomass_receipt":
      {
        const typed = value as CanonicalValueByEntity["biomass_receipt"];
      return {
          periodStart: canonicalDate(typed.periodStart),
          supplierCode: token(typed.supplierCode),
      };
      }
    case "coal_receipt":
    case "solar_receipt":
    case "biomass_cumulative":
      {
        const typed = value as CanonicalValueByEntity["coal_receipt"];
        return { periodStart: canonicalDate(typed.periodStart) };
      }
    case "solar_consumption":
      {
        const typed = value as CanonicalValueByEntity["solar_consumption"];
        return { readingDate: canonicalDate(typed.readingDate) };
      }
    case "biomass_target":
      {
        const typed = value as CanonicalValueByEntity["biomass_target"];
        return { targetYear: typed.targetYear };
      }
  }
}

export function businessIdentityForValue<E extends CanonicalEntity>(
  entity: E,
  value: CanonicalValueByEntity[E],
  scope = "plant",
): BusinessIdentity {
  const keyFields = keyFieldsForValue(entity, value);
  const canonicalKey = JSON.stringify({
    entity,
    scope: token(scope),
    keyFields: stableValue(keyFields),
  });
  return {
    entity,
    keyFields,
    canonicalKey,
    scope: token(scope),
  };
}

type IdentityRecord = Pick<CanonicalRecord, "entity" | "value" | "businessIdentity" | "source"> & {
  mappingFields: readonly string[];
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
};

export function businessIdentityForRecord(record: IdentityRecord) {
  return businessIdentityForValue(
    record.entity,
    record.value,
    record.businessIdentity.scope,
  );
}

export function sourceOccurrenceKeyForObservation(
  entity: CanonicalEntity,
  mappingFields: readonly string[],
  observation: SourceObservation,
) {
  return hash(
    JSON.stringify(
      stableValue({
        sourceKey: observation.sourceKey,
        spreadsheetId: observation.spreadsheetId,
        sheetId: observation.sheetId,
        entity,
        mappingFields: [...mappingFields].sort(),
        sourceRange: observation.sourceRange,
        cellAddress: observation.cellAddress,
        row: observation.row,
        column: observation.column,
        granularity: observation.granularity,
        sourceAddresses: observation.sourceAddresses
          ? [...observation.sourceAddresses].sort()
          : null,
        mappingVersion: observation.mappingVersion,
      }),
    ),
  );
}

export function sourceOccurrenceKeyForRecord(record: IdentityRecord) {
  return sourceOccurrenceKeyForObservation(
    record.entity,
    record.mappingFields,
    record.source,
  );
}

export function contentHashForRecord(record: IdentityRecord) {
  return hash(
    JSON.stringify(
      stableValue({
        entity: record.entity,
        businessIdentity: record.businessIdentity,
        value: record.value,
        mappingVersion: record.mappingVersion,
        schemaVersion: record.schemaVersion,
        parserVersion: record.parserVersion,
      }),
    ),
  );
}

export function stableCanonicalHash(value: unknown) {
  return hash(JSON.stringify(stableValue(value)));
}
