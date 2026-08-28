export type DynamicSheetValue = string | number | null;
export type DynamicSheetRow = readonly DynamicSheetValue[];

export type SemanticTableKind =
  | "dashboard"
  | "daily"
  | "target"
  | "historical"
  | "unknown";

export type DynamicFieldKey =
  | "biomassReceiptMonthly"
  | "biomassConsumptionMonthly"
  | "biomassUnit1Current"
  | "biomassUnit2Current"
  | "biomassUnit3Current"
  | "coalConsumptionMonthly"
  | "coalReceiptMonthly"
  | "coalUnit1Current"
  | "coalUnit2Current"
  | "coalUnit3Current"
  | "coalDailyTotal"
  | "coalStock"
  | "coalHop"
  | "solarConsumptionDaily"
  | "solarConsumptionMonthly"
  | "solarReceiptMonthly"
  | "biomassTarget"
  | "biomassCumulative"
  | "biomassTargetProgress";

export type StructuralAnchorKey =
  | "dashboardHeader"
  | "dateHeader"
  | "totalHeader"
  | "hopHeader"
  | "stockHeader"
  | "solarHeader"
  | "targetYear"
  | "historicalYear";

export type AnchorKey = DynamicFieldKey | StructuralAnchorKey;

export type ScannedCell = {
  row: number;
  column: number;
  address: string;
  rawValue: DynamicSheetValue;
  normalizedValue: string;
};

export type WorksheetMetadata = {
  name: string;
  month: number;
  monthLabel: string;
  year: number;
  isValid: boolean;
};

export type WorksheetResolution = WorksheetMetadata & {
  requestedMonth: number;
  requestedYear: number;
  isFallback: boolean;
  fallbackIndex: number;
};

export type AnchorDefinition = {
  key: AnchorKey;
  label: string;
  aliases?: readonly string[];
  tableKind: SemanticTableKind;
  expectedUnits?: readonly string[];
  match?: (normalizedValue: string) => boolean;
};

export type AnchorMatchType = "exact" | "alias" | "pattern" | "context";

export type DetectedAnchor = {
  key: AnchorKey;
  label: string;
  matchedLabel: string;
  matchType: AnchorMatchType;
  cell: ScannedCell;
  tableKind: SemanticTableKind;
  expectedUnits: readonly string[];
};

export type TableRegion = {
  id: string;
  kind: SemanticTableKind;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  cells: readonly ScannedCell[];
  anchors: readonly DetectedAnchor[];
  title: string | null;
  confidence: number;
};

export type HeaderPath = {
  cell: ScannedCell;
  labels: readonly string[];
  unit: string | null;
  resource: "biomass" | "coal" | "solar" | "unknown";
  unitNumber: number | null;
  isTotal: boolean;
  isStock: boolean;
  isHop: boolean;
  isDate: boolean;
};

export type StructureAnalysis = {
  headerRows: readonly number[];
  headerPaths: readonly HeaderPath[];
  dataRows: readonly number[];
  dateColumn: number | null;
};

export type CandidateStatus = "numeric" | "empty" | "malformed";

export type ValueCandidate = {
  cell: ScannedCell;
  value: number | null;
  status: CandidateStatus;
  score: number;
  reasons: readonly string[];
  unit: string | null;
  header: HeaderPath | null;
};

export type ConfidenceLevel = "HIGH" | "WARNING" | "UNRESOLVED";

export type ResolvedSource = {
  sheet: string;
  address: string;
  anchor: string;
};

export type ResolvedValue<T = number> = {
  value: T | null;
  available: boolean;
  confidence: number;
  level: ConfidenceLevel;
  source: ResolvedSource | null;
  status: "resolved" | "missing" | "malformed" | "ambiguous";
  candidates: readonly ValueCandidate[];
  /**
   * Optional when a value is derived from more than one cell, for example a
   * monthly total assembled from semantic supplier/unit columns.
   */
  sourceAddresses?: readonly string[];
  note?: string;
};

export type DynamicSemanticAggregates = {
  /** Sum of the supplier columns under Penerimaan -> Biomassa. */
  biomassSupplierReceiptMonthly: ResolvedValue;
  /** Sum of the monthly total row for direct Biomassa Unit 1-3 columns. */
  biomassUnitConsumptionMonthly: ResolvedValue;
};

export type DynamicDailyRecord = {
  date: string | null;
  day: number | null;
  coal: number | null;
  biomass: number | null;
  coalUnit1: number | null;
  coalUnit2: number | null;
  coalUnit3: number | null;
  biomassUnit1: number | null;
  biomassUnit2: number | null;
  biomassUnit3: number | null;
  stock: number | null;
  hop1: number | null;
  hop2: number | null;
  hop3: number | null;
  solar: number | null;
  solarReceipt: number | null;
};

export type DynamicNormalizedOverview = {
  metrics: { [K in DynamicFieldKey]: ResolvedValue };
  target: {
    target: ResolvedValue;
    cumulative: ResolvedValue;
    remaining: ResolvedValue;
    progress: ResolvedValue;
  } | null;
  series: readonly DynamicDailyRecord[];
};

export type DynamicParserDiagnostics = {
  warnings: readonly string[];
  errors: readonly string[];
  unresolved: readonly DynamicFieldKey[];
  ambiguous: readonly DynamicFieldKey[];
  scannedCellCount: number;
};

export type DynamicParserResult = {
  worksheet: WorksheetMetadata;
  scannedCells: readonly ScannedCell[];
  anchors: readonly DetectedAnchor[];
  tables: readonly TableRegion[];
  structures: readonly StructureAnalysis[];
  aggregates: DynamicSemanticAggregates;
  normalized: DynamicNormalizedOverview;
  diagnostics: DynamicParserDiagnostics;
};

export type DynamicParserOptions = {
  worksheetName: string;
  month?: number;
  year?: number;
  rowOffset?: number;
  columnOffset?: number;
};

export type DynamicFieldDefinition = AnchorDefinition & {
  field: DynamicFieldKey;
};
