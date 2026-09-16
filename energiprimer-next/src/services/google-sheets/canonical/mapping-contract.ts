import { createHash } from "node:crypto";

import type {
  ApprovedMappingContract,
  CanonicalEntity,
  CanonicalField,
  MappingApprovalState,
  MappingFieldDefinition,
  MappingManifestEntry,
  MappingSourceKind,
} from "./types";
import type { MappingApprovalContext } from "../dynamic/types";

export type { ApprovedMappingContract } from "./types";

export class MappingContractError extends Error {
  readonly code = "MAPPING_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "MappingContractError";
  }
}

type FieldDefinitionInput = Omit<MappingFieldDefinition, "mappingVersion">;

const mappingVersion = "BB_CANONICAL_V1@1";
const schemaVersion = "semantic-schema-v1";
const parserVersion = "dynamic-parser-v1";

function field(input: FieldDefinitionInput): MappingFieldDefinition {
  return { ...input, mappingVersion };
}

function entityForField(fieldName: CanonicalField): CanonicalEntity {
  return fieldName.slice(0, fieldName.indexOf(".")) as CanonicalEntity;
}

const fields = {
  "biomass_consumption.quantityTon": field({
    field: "biomass_consumption.quantityTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=biomass > daily > unitNumber",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "coal_consumption.quantityTon": field({
    field: "coal_consumption.quantityTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=coal > daily > unitNumber",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "coal_stock.closingStock": field({
    field: "coal_stock.closingStock",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=coal > stock > closingStock",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "coal_stock.consumed": field({
    field: "coal_stock.consumed",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=coal > daily total > consumed",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "biomass_receipt.quantityTon": field({
    field: "biomass_receipt.quantityTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=biomass > monthly receipt > supplier",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "coal_receipt.quantityTon": field({
    field: "coal_receipt.quantityTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=coal > monthly receipt > total",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "solar_consumption.quantityLiter": field({
    field: "solar_consumption.quantityLiter",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=solar > daily > total",
    physicalReference: null,
    expectedType: "decimal",
    unit: "liter",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "solar_receipt.quantityLiter": field({
    field: "solar_receipt.quantityLiter",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "resource=solar > monthly receipt > total",
    physicalReference: null,
    expectedType: "decimal",
    unit: "liter",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "hop_reading.hopDays": field({
    field: "hop_reading.hopDays",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "isHop=true > daily > unitNumber",
    physicalReference: null,
    expectedType: "decimal",
    unit: "day",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
  "biomass_target.targetTon": field({
    field: "biomass_target.targetTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "biomassTarget > targetYear",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: true,
  }),
  "biomass_cumulative.cumulativeTon": field({
    field: "biomass_cumulative.cumulativeTon",
    sourceKind: "SEMANTIC_PATH",
    semanticPath: "biomassCumulative > period",
    physicalReference: null,
    expectedType: "decimal",
    unit: "ton",
    required: true,
    approved: true,
    allowsPolicyFallback: false,
  }),
} satisfies Record<CanonicalField, MappingFieldDefinition>;

const canonicalManifest: readonly MappingManifestEntry[] = [
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "biomass_consumption",
    field: "biomass_consumption.quantityTon",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["biomass_consumption.quantityTon"].semanticPath as string,
    targetField: "biomass_consumptions.quantity_ton",
    unit: "ton",
    transformation: "locale-aware numeric parse; preserve null and source evidence",
    validationRule: "finite decimal; reading date must belong to worksheet period",
    identityRule: "unitNumber + readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "coal_consumption",
    field: "coal_consumption.quantityTon",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["coal_consumption.quantityTon"].semanticPath as string,
    targetField: "coal_consumption.coal_used",
    unit: "ton",
    transformation: "locale-aware numeric parse; preserve null and source evidence",
    validationRule: "finite decimal; reading date must belong to worksheet period",
    identityRule: "unitNumber + readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "coal_stock",
    field: "coal_stock.closingStock",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["coal_stock.closingStock"].semanticPath as string,
    targetField: "coal_stock.closing_stock",
    unit: "ton",
    transformation: "locale-aware numeric parse; retain closing stock and consumed as one record",
    validationRule: "closing stock and consumed must both be finite values",
    identityRule: "stockScope + readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "coal_stock",
    field: "coal_stock.consumed",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["coal_stock.consumed"].semanticPath as string,
    targetField: "coal_stock.consumed",
    unit: "ton",
    transformation: "locale-aware numeric parse; retain closing stock and consumed as one record",
    validationRule: "closing stock and consumed must both be finite values",
    identityRule: "stockScope + readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "biomass_receipt",
    field: "biomass_receipt.quantityTon",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["biomass_receipt.quantityTon"].semanticPath as string,
    targetField: "biomass_receipts.quantity_ton",
    unit: "ton",
    transformation: "sum approved supplier columns after locale-aware numeric parse",
    validationRule: "canonical supplier identity; finite decimal or explicit empty",
    identityRule: "supplierCode + periodStart",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "coal_receipt",
    field: "coal_receipt.quantityTon",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["coal_receipt.quantityTon"].semanticPath as string,
    targetField: "coal_receipts.quantity_ton",
    unit: "ton",
    transformation: "locale-aware numeric parse from semantic monthly total",
    validationRule: "finite decimal or explicit empty; worksheet period match",
    identityRule: "periodStart",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "solar_consumption",
    field: "solar_consumption.quantityLiter",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["solar_consumption.quantityLiter"].semanticPath as string,
    targetField: "solar_consumptions.quantity_liter",
    unit: "liter",
    transformation: "locale-aware numeric parse from approved daily total",
    validationRule: "finite decimal or explicit empty; reading date must be in period",
    identityRule: "readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "solar_receipt",
    field: "solar_receipt.quantityLiter",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["solar_receipt.quantityLiter"].semanticPath as string,
    targetField: "solar_receipts.quantity_liter",
    unit: "liter",
    transformation: "locale-aware numeric parse from semantic monthly receipt total",
    validationRule: "finite decimal or explicit empty; worksheet period match",
    identityRule: "periodStart",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "hop_reading",
    field: "hop_reading.hopDays",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["hop_reading.hopDays"].semanticPath as string,
    targetField: "hop_readings.hop_days",
    unit: "day",
    transformation: "locale-aware numeric parse from unit daily HOP column",
    validationRule: "finite decimal; unit identity and reading period required",
    identityRule: "unitNumber + readingDate",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "biomass_target",
    field: "biomass_target.targetTon",
    source: "configured Google Sheets workbook or approved policy fallback",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["biomass_target.targetTon"].semanticPath as string,
    targetField: "biomass_targets.target_ton",
    unit: "ton",
    transformation: "locale-aware numeric parse; approved 70,020 ton policy fallback only",
    validationRule: "finite positive target; policy fallback must be explicitly authorized",
    identityRule: "targetYear",
    sourceKind: "SEMANTIC_PATH",
  },
  {
    profile: "BB_CANONICAL_V1",
    mappingVersion,
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    entity: "biomass_cumulative",
    field: "biomass_cumulative.cumulativeTon",
    source: "configured Google Sheets workbook",
    worksheet: "[Bulan][YY]-BB with approved canonical schema",
    sourcePath: fields["biomass_cumulative.cumulativeTon"].semanticPath as string,
    targetField: "biomass_cumulative_snapshots.cumulative_ton",
    unit: "ton",
    transformation: "locale-aware numeric parse from approved cumulative period value",
    validationRule: "finite decimal or explicit empty; worksheet period match",
    identityRule: "periodStart",
    sourceKind: "SEMANTIC_PATH",
  },
] as const;

export const BB_CANONICAL_MAPPING_CONTRACT: ApprovedMappingContract = Object.freeze({
  profile: "BB_CANONICAL_V1",
  mappingVersion,
  schemaVersion,
  parserVersion,
  approvalState: "APPROVED",
  fields: Object.freeze(fields),
  manifest: Object.freeze(canonicalManifest),
});

export type MappingProposal = {
  profile: string;
  mappingVersion: string | null;
  schemaVersion: string | null;
  parserVersion: string | null;
  approvalState: Exclude<MappingApprovalState, "APPROVED">;
  writable: false;
  field: CanonicalField;
  sourceKind: MappingSourceKind;
  evidence: string;
};

export function createMappingProposal(input: {
  field: CanonicalField;
  sourceKind: MappingSourceKind;
  evidence: string;
  profile?: string;
}) {
  return Object.freeze({
    profile: input.profile ?? "UNAPPROVED_DISCOVERY",
    mappingVersion: null,
    schemaVersion: null,
    parserVersion: null,
    approvalState: "PROPOSED" as const,
    writable: false as const,
    field: input.field,
    sourceKind: input.sourceKind,
    evidence: input.evidence,
  });
}

export function assertApprovedMappingForWrite(
  contract: ApprovedMappingContract,
  requiredFields: readonly CanonicalField[],
) {
  if (contract.approvalState !== "APPROVED") {
    throw new MappingContractError(
      "Mapping approval is required before a canonical record can be written.",
    );
  }
  if (!contract.mappingVersion.trim()) {
    throw new MappingContractError("Approved mappingVersion is required.");
  }
  for (const requiredField of requiredFields) {
    const definition = contract.fields[requiredField];
    if (!definition || !definition.approved) {
      throw new MappingContractError(
        `Approved mapping is missing for ${requiredField}.`,
      );
    }
    if (definition.mappingVersion !== contract.mappingVersion) {
      throw new MappingContractError(
        `Mapping version mismatch for ${requiredField}.`,
      );
    }
    if (!definition.semanticPath && !definition.physicalReference) {
      throw new MappingContractError(
        `Approved mapping has no source path for ${requiredField}.`,
      );
    }
    const entries = contract.manifest.filter(
      (entry) => entry.field === requiredField,
    );
    if (entries.length !== 1) {
      throw new MappingContractError(
        `Approved mapping manifest must contain exactly one entry for ${requiredField}.`,
      );
    }
    const entry = entries[0];
    const expectedSourcePath =
      definition.sourceKind === "PHYSICAL_REFERENCE"
        ? definition.physicalReference
        : definition.semanticPath;
    if (
      entry.entity !== entityForField(requiredField) ||
      entry.field !== requiredField ||
      entry.profile !== contract.profile ||
      entry.mappingVersion !== contract.mappingVersion ||
      !entry.source.trim() ||
      !entry.worksheet.trim() ||
      !entry.effectiveFrom.trim() ||
      (entry.effectiveTo !== null && !entry.effectiveTo.trim()) ||
      entry.sourcePath.trim() === "" ||
      entry.sourcePath !== expectedSourcePath ||
      entry.targetField.trim() === "" ||
      entry.unit !== definition.unit ||
      entry.sourceKind !== definition.sourceKind ||
      entry.transformation.trim() === "" ||
      entry.validationRule.trim() === "" ||
      entry.identityRule.trim() === ""
    ) {
      throw new MappingContractError(
        `Approved mapping manifest is incomplete for ${requiredField}.`,
      );
    }
  }
  return contract;
}

export function assertMappingSourceAllowed(
  contract: ApprovedMappingContract,
  fieldNames: readonly CanonicalField[],
  sourceKind: MappingSourceKind,
) {
  assertApprovedMappingForWrite(contract, fieldNames);
  for (const fieldName of fieldNames) {
    const definition = contract.fields[fieldName];
    if (!definition) throw new MappingContractError(`Unknown mapping field ${fieldName}.`);
    if (sourceKind === "POLICY_FALLBACK" && !definition.allowsPolicyFallback) {
      throw new MappingContractError(
        `Policy fallback is not approved for ${fieldName}.`,
      );
    }
    if (
      sourceKind === "PHYSICAL_REFERENCE" &&
      definition.physicalReference === null
    ) {
      throw new MappingContractError(
        `Physical fallback is not approved for ${fieldName}.`,
      );
    }
    if (
      sourceKind === "SEMANTIC_PATH" &&
      definition.semanticPath === null
    ) {
      throw new MappingContractError(
        `Semantic source path is not approved for ${fieldName}.`,
      );
    }
  }
  return true;
}

export function mappingFieldsForEntity(
  entity: CanonicalEntity,
): readonly CanonicalField[] {
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

export function mappingContractHash(contract: ApprovedMappingContract) {
  const input = JSON.stringify({
    profile: contract.profile,
    mappingVersion: contract.mappingVersion,
    schemaVersion: contract.schemaVersion,
    parserVersion: contract.parserVersion,
    approvalState: contract.approvalState,
    fields: Object.entries(contract.fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, definition]) => [name, definition]),
    manifest: contract.manifest,
  });
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Converts an approved canonical manifest into a parser capability token.
 * Discovery code can call the parser without this token, but the resulting
 * values remain review-only and cannot cross the canonical write boundary.
 */
export function mappingApprovalForContract(
  contract: ApprovedMappingContract,
): MappingApprovalContext {
  const approvalState: MappingApprovalContext["approvalState"] =
    contract.approvalState === "APPROVED"
      ? "APPROVED"
      : contract.approvalState === "PROPOSED"
        ? "PROPOSED"
        : contract.approvalState === "REVIEW"
          ? "REVIEW"
          : "BLOCKED";
  return Object.freeze({
    profile: contract.profile,
    mappingVersion: contract.mappingVersion,
    approvalState,
    allowExact: contract.approvalState === "APPROVED",
    allowStructural:
      contract.approvalState === "APPROVED" &&
      contract.manifest.some((entry) => entry.sourceKind === "SEMANTIC_PATH"),
    allowPolicyFallback:
      contract.approvalState === "APPROVED" &&
      Object.values(contract.fields).some((field) => field.allowsPolicyFallback),
  });
}
