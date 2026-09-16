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
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "../import/types";
import {
  assertMappingSourceAllowed,
  MappingContractError,
  mappingFieldsForEntity,
  type ApprovedMappingContract,
} from "./mapping-contract";
import { createCanonicalRecord } from "./domain";
import { validateSourceObservation } from "./provenance";
import type {
  CanonicalDate,
  CanonicalEntity,
  CanonicalRecord,
  CanonicalValidationResult,
  CanonicalValueByEntity,
  SourceManifest,
  SourceObservation,
} from "./types";

function dateOnly(value: Date): CanonicalDate {
  return value.toISOString().slice(0, 10) as CanonicalDate;
}

function sourceObservation(
  source: ImportSource,
  manifest: SourceManifest,
  normalizedValue: string | number | null,
): SourceObservation {
  const observationKind =
    source.observationKind ?? (source.cell ? "SOURCE_CELL" : "SOURCE_RANGE");
  const granularity = source.sourceGranularity ??
    (observationKind === "POLICY_FALLBACK"
      ? "WORKSHEET"
      : source.cell
        ? "CELL"
        : "RANGE");
  const cellAddress = granularity === "CELL" ? source.cell : null;
  return {
    importRunId: source.importRunId ?? null,
    sourceKey: manifest.sourceKey,
    spreadsheetId: manifest.spreadsheetId,
    sheetId: source.sheetId ?? manifest.sheetId,
    worksheetTitleSnapshot: source.worksheet || manifest.worksheetTitleSnapshot,
    effectivePeriod: manifest.effectivePeriod,
    sourceRange: source.sourceRange ?? manifest.sourceRange,
    cellAddress,
    row: granularity === "CELL" || granularity === "ROW" ? source.row : null,
    column: granularity === "CELL" ? source.column ?? null : null,
    rawDisplayValue: granularity === "CELL" ? source.rawDisplayValue ?? null : null,
    normalizedValue,
    observationKind,
    granularity,
    mappingSourceKind: source.mappingSourceKind ??
      (observationKind === "POLICY_FALLBACK" ? "POLICY_FALLBACK" : "SEMANTIC_PATH"),
    mappingAuthorization: source.mappingAuthorization ??
      (observationKind === "POLICY_FALLBACK"
        ? "APPROVED_POLICY_FALLBACK"
        : "APPROVED_EXACT"),
    sourceAddresses: source.sourceAddresses,
    rawDisplayValues: source.rawDisplayValues,
    mappingVersion: manifest.mappingVersion,
    schemaVersion: manifest.schemaVersion,
    parserVersion: manifest.parserVersion,
    observedAt: manifest.observedAt,
  };
}

function validationFor(
  observation: SourceObservation,
  value: number | null,
): CanonicalValidationResult {
  const provenance = validateSourceObservation(observation);
  const status = provenance.valid
    ? value === null && observation.observationKind !== "POLICY_FALLBACK"
      ? "VALID_EMPTY"
      : "VALID"
    : "BLOCKED";
  return {
    status,
    errors: provenance.errors,
    warnings: [],
    confidence: provenance.valid ? 1 : 0,
    periodValid: true,
    typeValid: true,
    identityValid: true,
    provenanceComplete: provenance.valid,
  };
}

function makeRecord<E extends CanonicalEntity>(input: {
  entity: E;
  grain: string;
  value: CanonicalValueByEntity[E];
  source: ImportSource;
  normalizedValue: string | number | null;
  manifest: SourceManifest;
  mapping: ApprovedMappingContract;
  numericValue: number | null;
  businessScope?: string;
}) {
  const fields = mappingFieldsForEntity(input.entity);
  const mappingSourceKind = input.source.mappingSourceKind ?? "SEMANTIC_PATH";
  const mappingAuthorization = input.source.mappingAuthorization;
  if (
    mappingAuthorization !== "APPROVED_EXACT" &&
    mappingAuthorization !== "APPROVED_STRUCTURAL" &&
    mappingAuthorization !== "APPROVED_POLICY_FALLBACK"
  ) {
    throw new MappingContractError(
      "Only an approved exact, structural, or policy-fallback mapping can enter the canonical domain.",
    );
  }
  if (
    input.source.observationKind === "POLICY_FALLBACK" &&
    mappingSourceKind !== "POLICY_FALLBACK"
  ) {
    throw new MappingContractError(
      "Policy fallback provenance must use POLICY_FALLBACK mapping evidence.",
    );
  }
  if (
    input.source.observationKind !== "POLICY_FALLBACK" &&
    mappingSourceKind === "POLICY_FALLBACK"
  ) {
    throw new MappingContractError(
      "POLICY_FALLBACK mapping evidence requires POLICY_FALLBACK observation provenance.",
    );
  }
  if (
    input.source.observationKind === "POLICY_FALLBACK" &&
    mappingAuthorization !== "APPROVED_POLICY_FALLBACK"
  ) {
    throw new MappingContractError(
      "Policy fallback records require explicit policy-fallback authorization.",
    );
  }
  if (
    mappingSourceKind === "PHYSICAL_REFERENCE" &&
    mappingAuthorization !== "APPROVED_EXACT"
  ) {
    throw new MappingContractError(
      "Physical references require an approved exact mapping authorization.",
    );
  }
  assertMappingSourceAllowed(input.mapping, fields, mappingSourceKind);
  const observation = sourceObservation(input.source, input.manifest, input.normalizedValue);
  return createCanonicalRecord({
    entity: input.entity,
    grain: input.grain,
    value: input.value,
    source: observation,
    validation: validationFor(observation, input.numericValue),
    mappingFields: fields,
    mappingVersion: input.manifest.mappingVersion,
    schemaVersion: input.manifest.schemaVersion,
    parserVersion: input.manifest.parserVersion,
    businessScope: input.businessScope,
  });
}

function biomassConsumption(
  row: BiomassConsumptionImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "biomass_consumption",
    grain: "unit-day",
    value: {
      unitNumber: row.unitNumber,
      readingDate: dateOnly(row.readingDate),
      quantityTon: row.quantityTon,
    },
    normalizedValue: row.quantityTon,
    numericValue: row.quantityTon,
    source: row.source,
    manifest,
    mapping,
  });
}

function coalConsumption(
  row: CoalConsumptionImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "coal_consumption",
    grain: "unit-day",
    value: {
      unitNumber: row.unitNumber,
      readingDate: dateOnly(row.readingDate),
      quantityTon: row.quantityTon,
    },
    normalizedValue: row.quantityTon,
    numericValue: row.quantityTon,
    source: row.source,
    manifest,
    mapping,
  });
}

function coalStock(
  row: CoalStockImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
  stockScope: string,
) {
  if (row.closingStock === null || row.consumed === null) {
    throw new Error(
      "coal_stock closingStock and consumed must both be present before canonical planning.",
    );
  }
  const normalizedValue = JSON.stringify({
    closingStock: row.closingStock,
    consumed: row.consumed,
  });
  return makeRecord({
    entity: "coal_stock",
    grain: "stock-scope-day",
    value: {
      stockScope,
      readingDate: dateOnly(row.readingDate),
      closingStock: row.closingStock,
      consumed: row.consumed,
    },
    normalizedValue,
    numericValue: row.closingStock,
    source: row.source,
    manifest,
    mapping,
    businessScope: stockScope,
  });
}

function biomassReceipt(
  row: BiomassReceiptImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "biomass_receipt",
    grain: "supplier-period",
    value: {
      periodStart: dateOnly(row.periodStart),
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      quantityTon: row.quantityTon,
    },
    normalizedValue: row.quantityTon,
    numericValue: row.quantityTon,
    source: row.source,
    manifest,
    mapping,
  });
}

function coalReceipt(
  row: CoalReceiptImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "coal_receipt",
    grain: "period",
    value: { periodStart: dateOnly(row.periodStart), quantityTon: row.quantityTon },
    normalizedValue: row.quantityTon,
    numericValue: row.quantityTon,
    source: row.source,
    manifest,
    mapping,
  });
}

function solarConsumption(
  row: SolarConsumptionImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "solar_consumption",
    grain: "day",
    value: { readingDate: dateOnly(row.readingDate), quantityLiter: row.quantityLiter },
    normalizedValue: row.quantityLiter,
    numericValue: row.quantityLiter,
    source: row.source,
    manifest,
    mapping,
  });
}

function solarReceipt(
  row: SolarReceiptImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "solar_receipt",
    grain: "period",
    value: { periodStart: dateOnly(row.periodStart), quantityLiter: row.quantityLiter },
    normalizedValue: row.quantityLiter,
    numericValue: row.quantityLiter,
    source: row.source,
    manifest,
    mapping,
  });
}

function hop(
  row: HopImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "hop_reading",
    grain: "unit-day",
    value: { unitNumber: row.unitNumber, readingDate: dateOnly(row.readingDate), hopDays: row.hopDays },
    normalizedValue: row.hopDays,
    numericValue: row.hopDays,
    source: row.source,
    manifest,
    mapping,
  });
}

function target(
  row: BiomassTargetImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "biomass_target",
    grain: "target-year",
    value: { targetYear: row.targetYear, targetTon: row.targetTon },
    normalizedValue: row.targetTon,
    numericValue: row.targetTon,
    source: row.source,
    manifest,
    mapping,
  });
}

function cumulative(
  row: BiomassCumulativeImportRecord,
  manifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  return makeRecord({
    entity: "biomass_cumulative",
    grain: "period",
    value: { periodStart: dateOnly(row.periodStart), cumulativeTon: row.cumulativeTon },
    normalizedValue: row.cumulativeTon,
    numericValue: row.cumulativeTon,
    source: row.source,
    manifest,
    mapping,
  });
}

export function canonicalRecordsFromImportPlan(input: {
  plan: GoogleSheetsImportPlan;
  sourceManifest: SourceManifest;
  mapping: ApprovedMappingContract;
  stockScope?: string;
}): readonly CanonicalRecord[] {
  const records: CanonicalRecord[] = [];
  for (const row of input.plan.biomassConsumptionRows)
    records.push(biomassConsumption(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.coalConsumptionRows)
    records.push(coalConsumption(row, input.sourceManifest, input.mapping));
  if (input.plan.coalStockRows.length > 0 && !input.stockScope?.trim()) {
    throw new Error("coal_stock stockScope is required before canonical planning.");
  }
  for (const row of input.plan.coalStockRows)
    records.push(coalStock(row, input.sourceManifest, input.mapping, input.stockScope as string));
  for (const row of input.plan.receiptRows)
    records.push(biomassReceipt(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.coalReceiptRows)
    records.push(coalReceipt(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.solarConsumptionRows)
    records.push(solarConsumption(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.solarReceiptRows)
    records.push(solarReceipt(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.hopRows)
    records.push(hop(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.targetRows)
    records.push(target(row, input.sourceManifest, input.mapping));
  for (const row of input.plan.cumulativeRows)
    records.push(cumulative(row, input.sourceManifest, input.mapping));
  return records;
}
