export const CANONICAL_CONTRACT_VERSION = "phase2-canonical-v1" as const;

export const CANONICAL_MAPPING_PROFILE = "BB_CANONICAL_V1" as const;
export const CANONICAL_MAPPING_VERSION = "BB_CANONICAL_V1@1" as const;
export const CANONICAL_SCHEMA_VERSION = "semantic-schema-v1" as const;
export const CANONICAL_PARSER_VERSION = "dynamic-parser-v1" as const;

export type CanonicalEntity =
  | "biomass_consumption"
  | "coal_consumption"
  | "coal_stock"
  | "biomass_receipt"
  | "coal_receipt"
  | "solar_consumption"
  | "solar_receipt"
  | "hop_reading"
  | "biomass_target"
  | "biomass_cumulative";

export const CANONICAL_ENTITIES: readonly CanonicalEntity[] = [
  "biomass_consumption",
  "coal_consumption",
  "coal_stock",
  "biomass_receipt",
  "coal_receipt",
  "solar_consumption",
  "solar_receipt",
  "hop_reading",
  "biomass_target",
  "biomass_cumulative",
];

export type CanonicalField =
  | "biomass_consumption.quantityTon"
  | "coal_consumption.quantityTon"
  | "coal_stock.closingStock"
  | "coal_stock.consumed"
  | "biomass_receipt.quantityTon"
  | "coal_receipt.quantityTon"
  | "solar_consumption.quantityLiter"
  | "solar_receipt.quantityLiter"
  | "hop_reading.hopDays"
  | "biomass_target.targetTon"
  | "biomass_cumulative.cumulativeTon";

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  "biomass_consumption.quantityTon",
  "coal_consumption.quantityTon",
  "coal_stock.closingStock",
  "coal_stock.consumed",
  "biomass_receipt.quantityTon",
  "coal_receipt.quantityTon",
  "solar_consumption.quantityLiter",
  "solar_receipt.quantityLiter",
  "hop_reading.hopDays",
  "biomass_target.targetTon",
  "biomass_cumulative.cumulativeTon",
];

export type CanonicalDate = `${number}-${number}-${number}`;
export type UnitNumber = 1 | 2 | 3;

export type CanonicalValueByEntity = {
  biomass_consumption: {
    unitNumber: UnitNumber;
    readingDate: CanonicalDate;
    quantityTon: number | null;
  };
  coal_consumption: {
    unitNumber: UnitNumber;
    readingDate: CanonicalDate;
    quantityTon: number | null;
  };
  coal_stock: {
    stockScope: string;
    readingDate: CanonicalDate;
    closingStock: number;
    consumed: number;
  };
  biomass_receipt: {
    periodStart: CanonicalDate;
    supplierCode: string;
    supplierName: string;
    quantityTon: number | null;
  };
  coal_receipt: {
    periodStart: CanonicalDate;
    quantityTon: number | null;
  };
  solar_consumption: {
    readingDate: CanonicalDate;
    quantityLiter: number | null;
  };
  solar_receipt: {
    periodStart: CanonicalDate;
    quantityLiter: number | null;
  };
  hop_reading: {
    unitNumber: UnitNumber;
    readingDate: CanonicalDate;
    hopDays: number | null;
  };
  biomass_target: {
    targetYear: number;
    targetTon: number;
  };
  biomass_cumulative: {
    periodStart: CanonicalDate;
    cumulativeTon: number | null;
  };
};

export type CanonicalValidationStatus =
  | "VALID"
  | "VALID_EMPTY"
  | "REJECTED"
  | "AMBIGUOUS"
  | "BLOCKED";

export type CanonicalErrorCode =
  | "SOURCE_READ_ERROR"
  | "MAPPING_ERROR"
  | "VALIDATION_ERROR"
  | "IDENTITY_CONFLICT"
  | "PROVENANCE_ERROR"
  | "PLAN_ERROR"
  | "COMMIT_ERROR"
  | "RECONCILIATION_ERROR"
  | "RECOVERY_REQUIRED"
  | "REGISTRY_BLOCK"
  | "SCHEMA_ERROR";

export type CanonicalValidationResult = {
  status: CanonicalValidationStatus;
  errors: readonly CanonicalErrorCode[];
  warnings: readonly string[];
  confidence: number;
  periodValid: boolean;
  typeValid: boolean;
  identityValid: boolean;
  provenanceComplete: boolean;
};

export type EffectivePeriod = {
  month: number;
  year: number;
};

export type SourceObservationKind =
  | "SOURCE_CELL"
  | "SOURCE_RANGE"
  | "POLICY_FALLBACK";

export type MappingAuthorizationEvidence =
  | "APPROVED_EXACT"
  | "APPROVED_STRUCTURAL"
  | "APPROVED_POLICY_FALLBACK"
  | "REVIEW_REQUIRED"
  | "BLOCKED";

export type SourceGranularity =
  | "CELL"
  | "ROW"
  | "RANGE"
  | "WORKSHEET"
  | "WORKBOOK";

export type SourceObservation = {
  /** Import-run provenance is assigned at plan creation; source adapters use null. */
  importRunId: string | null;
  sourceKey: string;
  spreadsheetId: string;
  sheetId: string;
  worksheetTitleSnapshot: string;
  effectivePeriod: EffectivePeriod | null;
  sourceRange: string;
  cellAddress: string | null;
  row: number | null;
  column: number | null;
  rawDisplayValue: string | null;
  normalizedValue: string | number | null;
  observationKind: SourceObservationKind;
  granularity: SourceGranularity;
  /** Preserve mapping authorization through the canonical compatibility adapter. */
  mappingSourceKind?: MappingSourceKind;
  mappingAuthorization?: MappingAuthorizationEvidence;
  /** Component addresses/raw values are retained for aggregate observations. */
  sourceAddresses?: readonly string[];
  rawDisplayValues?: readonly { address: string; value: string | null }[];
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  observedAt: string;
};

export type SourceIdentity = {
  sourceKey: string;
  spreadsheetId: string;
  sheetId: string;
  worksheetTitleSnapshot: string;
  sourceOccurrenceKey: string;
  mappingVersion: string;
  schemaVersion: string;
};

export type BusinessIdentity = {
  entity: CanonicalEntity;
  keyFields: Readonly<Record<string, string | number>>;
  canonicalKey: string;
  scope: string;
};

export type MappingApprovalState =
  | "DISCOVERED"
  | "PROPOSED"
  | "APPROVED"
  | "REVIEW"
  | "BLOCKED"
  | "COMPARISON_ONLY";

export type MappingSourceKind =
  | "SEMANTIC_PATH"
  | "PHYSICAL_REFERENCE"
  | "POLICY_FALLBACK";

export type MappingManifestEntry = {
  profile: string;
  mappingVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  entity: CanonicalEntity;
  field: CanonicalField;
  source: string;
  worksheet: string;
  sourcePath: string;
  targetField: string;
  unit: "ton" | "liter" | "day";
  transformation: string;
  validationRule: string;
  identityRule: string;
  sourceKind: MappingSourceKind;
};

export type MappingFieldDefinition = {
  field: CanonicalField;
  sourceKind: MappingSourceKind;
  semanticPath: string | null;
  physicalReference: string | null;
  expectedType: "decimal" | "integer";
  unit: "ton" | "liter" | "day";
  required: boolean;
  mappingVersion: string;
  approved: boolean;
  allowsPolicyFallback: boolean;
};

export type ApprovedMappingContract = {
  profile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  approvalState: MappingApprovalState;
  fields: Readonly<Record<CanonicalField, MappingFieldDefinition>>;
  manifest: readonly MappingManifestEntry[];
};

export type SourceAuthority =
  | "GOOGLE_SHEETS"
  | "DATABASE"
  | "MANUAL"
  | "MIXED"
  | "UNKNOWN";

export type SourceManifestStatus =
  | "DISCOVERED"
  | "VALIDATED"
  | "ACTIVE"
  | "SCHEMA_REVIEW"
  | "MISSING"
  | "DISABLED"
  | "ERROR";

export type SourceManifestApprovalState = MappingApprovalState;

export type SourceManifest = {
  sourceKey: string;
  sourceType: "GOOGLE_SHEETS";
  provider: "google_sheets";
  spreadsheetId: string;
  workbookIdentity: string;
  sheetId: string;
  worksheetTitle: string;
  worksheetTitleSnapshot: string;
  normalizedWorksheetTitle: string;
  effectivePeriod: EffectivePeriod | null;
  entities: readonly CanonicalEntity[];
  sourceRange: string;
  mappingProfile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  schemaFingerprint: string | null;
  approvalState: SourceManifestApprovalState;
  ownership: {
    authority: SourceAuthority;
    ownerRef: string | null;
    sourcePrecedence: readonly string[] | null;
  };
  status: SourceManifestStatus;
  observedAt: string;
};

export type CanonicalRecord<E extends CanonicalEntity = CanonicalEntity> = {
  entity: E;
  grain: string;
  value: CanonicalValueByEntity[E];
  businessIdentity: BusinessIdentity;
  sourceIdentity: SourceIdentity;
  source: SourceObservation;
  validation: CanonicalValidationResult;
  mappingFields: readonly CanonicalField[];
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  sourceOccurrenceKey: string;
  contentHash: string;
};

export type CanonicalRecordInput<E extends CanonicalEntity> = {
  entity: E;
  grain: string;
  value: CanonicalValueByEntity[E];
  source: SourceObservation;
  validation: CanonicalValidationResult;
  mappingFields?: readonly CanonicalField[];
  mappingVersion?: string;
  schemaVersion?: string;
  parserVersion?: string;
  businessScope?: string;
};

export type ExistingCanonicalState = {
  businessIdentity: BusinessIdentity;
  contentHash: string;
  sourceIdentity: SourceIdentity;
  /** Target-state evidence may block an otherwise valid canonical identity. */
  blockingIssues?: readonly CanonicalErrorCode[];
  targetModel?: string;
  targetExistence?: "PRESENT" | "AMBIGUOUS" | "UNRESOLVED";
};

export type CanonicalPlanOperation = "INSERT" | "UPDATE" | "SKIP" | "BLOCK";

export type CanonicalImportPlanItem = {
  itemId: string;
  record: CanonicalRecord;
  businessIdentity: BusinessIdentity;
  businessKey: string;
  typedValue: CanonicalRecord["value"];
  sourceProvenance: SourceObservation;
  contentHash: string;
  validationResult: CanonicalValidationResult;
  operation: CanonicalPlanOperation;
  blockingIssues: readonly CanonicalErrorCode[];
};

export type CanonicalOperationCounts = Record<CanonicalPlanOperation, number>;

export type CanonicalImportPlan = {
  planId: string;
  planHash: string;
  importRunId: string;
  sourceManifest: SourceManifest;
  mappingProfile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  items: readonly CanonicalImportPlanItem[];
  operationCounts: CanonicalOperationCounts;
  blockingIssues: readonly CanonicalErrorCode[];
  approvalState: "PLANNED" | "APPROVED";
};
