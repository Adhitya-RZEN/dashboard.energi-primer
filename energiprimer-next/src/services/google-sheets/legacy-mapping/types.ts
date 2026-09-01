import type {
  DynamicParserResult,
  DynamicSheetValue,
  HeaderPath,
  ScannedCell,
} from "../dynamic/types";
import type {
  GoogleSheetsImportPlan,
  ImportStagingRecord,
} from "../import/types";
import type { ExistingSyncRowState } from "../sync/change-detection";
import type { SchemaSnapshot } from "../sync/schema-detection";

export type BbSchemaFamily =
  | "CANONICAL_FAMILY"
  | "LEGACY_FAMILY_A"
  | "LEGACY_FAMILY_B"
  | "LEGACY_FAMILY_C"
  | "UNKNOWN_FAMILY";

export type MappingConfidence = "HIGH" | "MEDIUM" | "LOW";
export type MappingDecision =
  | "AUTO_MAP"
  | "MANUAL_REVIEW"
  | "FUTURE_SCOPE_DATA"
  | "UNMAPPED";

export type ImportGate = "IMPORT_READY" | "IMPORT_AFTER_REVIEW" | "BLOCKED";

export type MappingIssueSeverity = "BLOCKING" | "REVIEW" | "WARNING";

export type MappingIssue = {
  code: string;
  message: string;
  severity: MappingIssueSeverity;
  sourceRows?: readonly number[];
};

export type HeaderMapping = {
  sourceHeader: string;
  sourceColumn: number;
  canonicalField: string;
  databaseField: string;
  domain: string;
  confidence: MappingConfidence;
  decision: MappingDecision;
  transformation: string;
};

export type SourceDateFormat =
  | "DAY_ONLY"
  | "DAY_MONTH_YEAR"
  | "ISO_DATE"
  | "UNKNOWN";

export type SourceDateObservation = {
  row: number;
  column: number;
  address: string;
  rawValue: DynamicSheetValue;
  sourceDate: string | null;
  day: number | null;
  format: SourceDateFormat;
  valid: boolean;
};

export type DateValidationIssue = {
  code:
    | "PERIOD_MISMATCH"
    | "INVALID_DATE"
    | "DATE_FORMAT_VARIATION"
    | "DUPLICATE_DATE";
  message: string;
  rows: readonly number[];
};

export type DateValidationResult = {
  observations: readonly SourceDateObservation[];
  uniqueValidDates: readonly string[];
  issues: readonly DateValidationIssue[];
  status: "PASS" | "REVIEW" | "BLOCKED";
};

export type FutureScopeObservation = {
  sourceHeader: string;
  sourceColumn: number;
  resource: HeaderPath["resource"];
  valueUnit: string | null;
  numericCount: number;
  nonEmptyCount: number;
  status: "FUTURE_SCOPE_DATA";
};

export type DuplicateClassification =
  | "TRUE_DUPLICATE"
  | "BUSINESS_KEY_COLLISION"
  | "LEGACY_DUPLICATE"
  | "SOURCE_DUPLICATE"
  | "UNKNOWN";

export type DuplicateGroup = {
  sourceKey: string;
  sourceKeyPrefix: string;
  entityType: string;
  classification: DuplicateClassification;
  sourceRows: readonly (number | null)[];
  sourceCells: readonly (string | null)[];
  values: readonly (number | null)[];
  contentHashPrefixes: readonly string[];
};

export type IdentitySummary = {
  candidateCount: number;
  deterministicCount: number;
  nonDeterministicCount: number;
  sourceKeyPrefixes: readonly string[];
};

export type DryRunSummary = {
  insertCandidate: number;
  updateCandidate: number;
  skipCandidate: number;
  rejected: number;
  manualReview: number;
  blockingIssues: number;
  databaseWrites: 0;
};

export type SchemaClassification = {
  family: BbSchemaFamily;
  semanticCoverage: number;
  labelCoverage: number;
  reason: string;
};

export type MappingProfile = {
  family: BbSchemaFamily;
  name: string;
  description: string;
  autoMapEntityTypes: readonly string[];
  defaultGate: ImportGate;
};

export type LegacyMappingInput = {
  worksheet: string;
  family: BbSchemaFamily;
  parsed: DynamicParserResult;
  plan: GoogleSheetsImportPlan;
  schema: SchemaSnapshot;
  classification?: SchemaClassification;
  existingSyncRows?: readonly ExistingSyncRowState[];
};

export type LegacyMappingResult = {
  worksheet: string;
  family: BbSchemaFamily;
  profile: MappingProfile;
  schema: SchemaClassification;
  headerMappings: readonly HeaderMapping[];
  canonicalRecords: readonly ImportStagingRecord[];
  rejectedRecords: readonly ImportStagingRecord[];
  manualReviewRecordCount: number;
  dateValidation: DateValidationResult;
  futureScopeData: readonly FutureScopeObservation[];
  duplicateGroups: readonly DuplicateGroup[];
  identity: IdentitySummary;
  issues: readonly MappingIssue[];
  dryRun: DryRunSummary;
  importGate: ImportGate;
  plan: GoogleSheetsImportPlan;
};

export type DateCellInput = Pick<
  ScannedCell,
  "row" | "column" | "address" | "rawValue"
>;
