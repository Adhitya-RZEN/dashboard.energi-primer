import { writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  DYNAMIC_SCAN_RANGE,
  type DynamicWorksheetReadResult,
} from "../src/services/google-sheets/dynamic/reader";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import { parseNumericValue } from "../src/services/google-sheets/dynamic/validators";
import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import type {
  DynamicParserResult,
  HeaderPath,
} from "../src/services/google-sheets/dynamic/types";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import type {
  GoogleSheetsImportPlan,
  ImportStagingRecord,
} from "../src/services/google-sheets/import/types";
import {
  buildSchemaSnapshot,
  type SchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import { withSyncRetry } from "../src/services/google-sheets/sync/retry";

const prisma = new PrismaClient();
const CANONICAL_WORKSHEET = "Juli26-BB";
const OFFICIAL_BIOMASS_TARGET = 70_020;
const REQUEST_DELAY_MS = 1_300;
const MAX_RETRY_ATTEMPTS = 2;
const REPORT_PATH = new URL(
  "../docs/BB_CANONICAL_MAPPING_REPORT_2026-08-30.md",
  import.meta.url,
);

type SchemaFamily =
  | "CANONICAL_MATCH"
  | "LEGACY_COMPATIBLE"
  | "LEGACY_REQUIRES_MAPPING"
  | "INCOMPATIBLE"
  | "AMBIGUOUS";

type Importability =
  | "IMPORT_NOW"
  | "IMPORT_AFTER_MAPPING"
  | "NEEDS_MANUAL_REVIEW";

type DatabaseSnapshot = Record<string, number>;

type DuplicateEvidence = {
  sourceKeyPrefix: string;
  entityType: string;
  identity: string;
  rows: string;
  values: string;
  contentHashes: string;
  classification:
    | "TRUE_DUPLICATE"
    | "BUSINESS_KEY_COLLISION"
    | "IDENTITY_DESIGN_ERROR"
    | "LEGACY_IDENTITY"
    | "UNKNOWN";
};

type TargetAudit = {
  metadata: GoogleSheetsWorksheetMetadata;
  month: number;
  monthLabel: string;
  year: number;
  readStatus: "READ" | "READ_FAILED" | "EMPTY";
  readError: string | null;
  parsed: DynamicParserResult | null;
  plan: GoogleSheetsImportPlan | null;
  schema: SchemaSnapshot | null;
  schemaFamily: SchemaFamily;
  schemaReason: string;
  compatibility: string;
  mappingRequired: boolean;
  importability: Importability;
  dateIssues: string[];
  dateRange: string;
  units: string[];
  unitNotes: string[];
  suppliers: string[];
  missingSuppliers: string[];
  supplierNotes: string[];
  duplicateEvidence: DuplicateEvidence[];
  targetValue: number | null;
  targetClassification:
    | "HISTORICAL_TARGET"
    | "CURRENT_TARGET"
    | "CALCULATED_TARGET"
    | "UNKNOWN";
  targetReview: boolean;
  targetSource: string | null;
  parserPlan: string;
};

type FieldMapping = {
  sourceHeader: string;
  normalizedField: string;
  databaseField: string;
  type: string;
  transformation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

type DatabaseTarget = {
  domain: string;
  table: string;
  fields: string;
  relation: string;
};

const DATABASE_TARGETS: readonly DatabaseTarget[] = [
  {
    domain: "BIOMASS_RECEIPT",
    table: "biomass_receipts",
    fields: "period_start, supplier_code, supplier_name, quantity_ton",
    relation: "one row per supplier and month",
  },
  {
    domain: "BIOMASS_CONSUMPTION",
    table: "biomass_consumptions",
    fields: "reading_date, unit_id, quantity_ton",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "COAL_RECEIPT",
    table: "coal_receipts",
    fields: "period_start, quantity_ton",
    relation: "one row per month",
  },
  {
    domain: "COAL_CONSUMPTION",
    table: "coal_consumption",
    fields: "date, unit_id, coal_used",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "COAL_STOCK",
    table: "coal_stock",
    fields: "date, opening_stock, received, consumed, closing_stock",
    relation: "one row per day",
  },
  {
    domain: "SOLAR_RECEIPT",
    table: "solar_receipts",
    fields: "period_start, quantity_liter",
    relation: "one row per month",
  },
  {
    domain: "SOLAR_CONSUMPTION",
    table: "solar_consumptions",
    fields: "date, quantity_liter",
    relation: "one row per day",
  },
  {
    domain: "HOP",
    table: "hop_readings",
    fields: "date, unit_id, hop_days",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "POWER_GENERATION",
    table: "power_generation",
    fields: "date, unit_id, average_load, power_generation",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "UNIT_MASTER",
    table: "units",
    fields: "code, name, status",
    relation: "master identity; not a daily fact",
  },
  {
    domain: "BIOMASS_TARGET",
    table: "biomass_targets",
    fields: "target_year, target_ton",
    relation: "one row per target year",
  },
  {
    domain: "BIOMASS_CUMULATIVE",
    table: "biomass_cumulative_snapshots",
    fields: "period_start, cumulative_ton",
    relation: "one row per period snapshot",
  },
];

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function markdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function columnLetter(column: number) {
  let current = Math.max(1, Math.trunc(column));
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function detectedRange(parsed: DynamicParserResult | null) {
  const cells = parsed?.scannedCells.filter(
    (cell) => cell.normalizedValue.length > 0,
  ) ?? [];
  if (!cells.length) return null;
  const rows = cells.map((cell) => cell.row);
  const columns = cells.map((cell) => cell.column);
  return `${columnLetter(Math.min(...columns))}${Math.min(...rows)}:${columnLetter(Math.max(...columns))}${Math.max(...rows)}`;
}

function safeReadError(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) {
    return `${error.code}${error.status === undefined ? "" : ` (HTTP ${error.status})`}`;
  }
  return "unknown";
}

function fieldLabels(path: HeaderPath) {
  return path.labels.join(" > ") || "(empty semantic header)";
}

function valueTypeForPath(
  parsed: DynamicParserResult,
  path: HeaderPath,
): "numeric" | "empty" | "text" | "mixed" {
  const structure = parsed.structures[0];
  if (!structure) return "empty";
  const types = new Set<"numeric" | "empty" | "text">();
  for (const row of structure.dataRows) {
    const cell = parsed.scannedCells.find(
      (candidate) => candidate.row === row && candidate.column === path.cell.column,
    );
    const value = parseNumericValue(cell?.rawValue);
    if (value.status === "numeric") types.add("numeric");
    else if (value.status === "empty") types.add("empty");
    else types.add("text");
  }
  if (!types.size || (types.size === 1 && types.has("empty"))) return "empty";
  if (types.has("numeric") && !types.has("text")) return "numeric";
  if (types.has("text") && !types.has("numeric")) return "text";
  return "mixed";
}

function pathDomain(path: HeaderPath) {
  const labels = path.labels.join(" ");
  if (path.isHop) return "HOP";
  if (path.isStock) return "COAL_STOCK";
  if (path.resource === "biomass") {
    if (/PENERIMAAN|SAWDUST|WOODCHIP|LRUK|SRF|BONGGOL/.test(labels))
      return "BIOMASS_RECEIPT";
    if (/PEMAKAIAN|KONSUMSI/.test(labels)) return "BIOMASS_CONSUMPTION";
  }
  if (path.resource === "coal") {
    if (/PENERIMAAN/.test(labels)) return "COAL_RECEIPT";
    if (/PEMAKAIAN|KONSUMSI|BELT WEIGHER|BUCKET/.test(labels))
      return "COAL_CONSUMPTION";
  }
  if (path.resource === "solar") {
    if (/PENERIMAAN/.test(labels)) return "SOLAR_RECEIPT";
    if (/PEMAKAIAN|KONSUMSI/.test(labels)) return "SOLAR_CONSUMPTION";
  }
  if (/KWH|POWER|GENERATION|LOAD/.test(labels)) return "POWER_GENERATION";
  if (/TARGET/.test(labels)) return "BIOMASS_TARGET";
  if (/KUMULATIF|CUMULATIVE|REALISASI/.test(labels))
    return "BIOMASS_CUMULATIVE";
  if (path.isDate) return "DATE";
  return "UNKNOWN";
}

function fieldMappingForPath(
  parsed: DynamicParserResult,
  path: HeaderPath,
): FieldMapping {
  const labels = fieldLabels(path);
  const domain = pathDomain(path);
  const unitSuffix = path.unitNumber ? ` unit ${path.unitNumber}` : "";
  const valueType = valueTypeForPath(parsed, path);
  const type = valueType === "numeric" || valueType === "mixed"
    ? "Decimal/number|null"
    : path.isDate
      ? "Date|null"
      : "text/unknown";
  const base = {
    sourceHeader: labels,
    type,
    transformation: "normalize header semantics; parse numeric values; retain null",
    confidence: "MEDIUM" as const,
  };
  if (path.isDate) {
    return {
      ...base,
      normalizedField: "readingDate/periodStart",
      databaseField: "date or period_start",
      transformation: "parse daily date/day using worksheet month and year; flag period mismatch",
      confidence: "HIGH",
    };
  }
  if (domain === "HOP") {
    return {
      ...base,
      normalizedField: `hopDays${unitSuffix}`,
      databaseField: "hop_readings.hop_days",
      confidence: path.unitNumber ? "HIGH" : "MEDIUM",
    };
  }
  if (domain === "COAL_STOCK") {
    return {
      ...base,
      normalizedField: "closingStock",
      databaseField: "coal_stock.closing_stock",
      confidence: "HIGH",
    };
  }
  if (domain === "BIOMASS_RECEIPT") {
    return {
      ...base,
      normalizedField: "biomassReceipt.quantityTon",
      databaseField: "biomass_receipts.quantity_ton",
      transformation: "map supplier identity; parse ton value; sum only canonical seven supplier columns",
      confidence: /PENERIMAAN|SAWDUST|WOODCHIP|LRUK|SRF/.test(labels)
        ? "HIGH"
        : "MEDIUM",
    };
  }
  if (domain === "BIOMASS_CONSUMPTION") {
    return {
      ...base,
      normalizedField: `biomassConsumption.quantityTon${unitSuffix}`,
      databaseField: "biomass_consumptions.quantity_ton",
      confidence: path.unitNumber ? "HIGH" : "MEDIUM",
    };
  }
  if (domain === "COAL_RECEIPT") {
    return {
      ...base,
      normalizedField: "coalReceipt.quantityTon",
      databaseField: "coal_receipts.quantity_ton",
      confidence: "HIGH",
    };
  }
  if (domain === "COAL_CONSUMPTION") {
    return {
      ...base,
      normalizedField: `coalConsumption.coalUsed${unitSuffix}`,
      databaseField: "coal_consumption.coal_used",
      confidence: path.unitNumber || path.isTotal ? "HIGH" : "MEDIUM",
    };
  }
  if (domain === "SOLAR_RECEIPT") {
    return {
      ...base,
      normalizedField: "solarReceipt.quantityLiter",
      databaseField: "solar_receipts.quantity_liter",
      confidence: "HIGH",
    };
  }
  if (domain === "SOLAR_CONSUMPTION") {
    return {
      ...base,
      normalizedField: "solarConsumption.quantityLiter",
      databaseField: "solar_consumptions.quantity_liter",
      confidence: "HIGH",
    };
  }
  if (domain === "POWER_GENERATION") {
    return {
      ...base,
      normalizedField: `powerGeneration${unitSuffix}`,
      databaseField: "power_generation.power_generation / average_load",
      confidence: "MEDIUM",
    };
  }
  if (domain === "BIOMASS_TARGET") {
    return {
      ...base,
      normalizedField: "biomassTarget.targetTon",
      databaseField: "biomass_targets.target_ton",
      confidence: "MEDIUM",
    };
  }
  if (domain === "BIOMASS_CUMULATIVE") {
    return {
      ...base,
      normalizedField: "biomassCumulative.cumulativeTon",
      databaseField: "biomass_cumulative_snapshots.cumulative_ton",
      confidence: "MEDIUM",
    };
  }
  return {
    ...base,
    normalizedField: "UNRESOLVED",
    databaseField: "NO_DIRECT_DATABASE_TARGET",
    transformation: "do not map automatically; review semantic context",
    confidence: "LOW",
  };
}

function unitsAndNotes(parsed: DynamicParserResult | null) {
  const structure = parsed?.structures[0];
  if (!structure) return { units: [], notes: ["Structure unavailable."] };
  const unitNumbers = unique(
    structure.headerPaths
      .map((path) => path.unitNumber)
      .filter((unit): unit is number => unit !== null)
      .map(String),
  ).sort();
  const exactUnitTwoLabels = parsed?.scannedCells.filter(
    (cell) => cell.normalizedValue === "UNIT 2",
  ).length ?? 0;
  const notes: string[] = [];
  if (unitNumbers.join(",") !== "1,2,3")
    notes.push("Canonical unit evidence is incomplete; expected Unit 1, Unit 2, Unit 3.");
  if (exactUnitTwoLabels > 1)
    notes.push("Repeated Unit 2 label evidence exists; existing ordered-block rule maps the duplicate block to Unit 3, but this audit does not rewrite source values.");
  return {
    units: unitNumbers.map((unit) => `Unit ${unit}`),
    notes,
  };
}

function dateValues(parsed: DynamicParserResult | null) {
  const values = unique(
    parsed?.normalized.series
      .map((record) => record.date)
      .filter((date): date is string => Boolean(date)) ?? [],
  ).sort();
  if (!values.length) return { values, range: "UNKNOWN" };
  return {
    values,
    range: `${values[0]} -> ${values.at(-1)} (${values.length} dates)`,
  };
}

function dateIssues(
  parsed: DynamicParserResult | null,
  month: number,
  year: number,
) {
  const dates = dateValues(parsed).values;
  const issues: string[] = [];
  for (const value of dates) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      issues.push(`${value}: DATE_PERIOD_MISMATCH (unresolved date format)`);
      continue;
    }
    const actualYear = Number(match[1]);
    const actualMonth = Number(match[2]);
    const actualDay = Number(match[3]);
    const daysInMonth = new Date(Date.UTC(actualYear, actualMonth, 0)).getUTCDate();
    if (
      actualYear !== year ||
      actualMonth !== month ||
      actualMonth < 1 ||
      actualMonth > 12 ||
      actualDay < 1 ||
      actualDay > daysInMonth
    )
      issues.push(`${value}: DATE_PERIOD_MISMATCH (expected ${year}-${String(month).padStart(2, "0")})`);
  }
  if (parsed?.normalized.series.length && !dates.length)
    issues.push("DATE_PERIOD_MISMATCH: daily series has no resolved date values");
  return unique(issues);
}

function supplierEvidence(plan: GoogleSheetsImportPlan | null, canonicalCodes: readonly string[]) {
  const rows = plan?.receiptRows ?? [];
  const suppliers = unique(rows.map((row) => `${row.supplierName} [${row.supplierCode}]`));
  const codes = unique(rows.map((row) => row.supplierCode));
  const missing = canonicalCodes.filter((code) => !codes.includes(code));
  const duplicateCodes = codes.filter(
    (code) => rows.filter((row) => row.supplierCode === code).length > 1,
  );
  const notes: string[] = [];
  if (missing.length) notes.push(`missing canonical supplier code(s): ${missing.join(", ")}`);
  if (duplicateCodes.length) notes.push(`duplicate supplier code(s): ${duplicateCodes.join(", ")}`);
  if (!rows.length) notes.push("no supplier receipt rows resolved by existing parser");
  return { suppliers, missing, notes };
}

function duplicateEvidence(plan: GoogleSheetsImportPlan | null) {
  if (!plan) return [];
  const groups = new Map<string, ImportStagingRecord[]>();
  for (const row of plan.stagingRows) {
    const key = sourceKeyForStagingRow(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const hashes = unique(rows.map((row) => contentHashForStagingRow(row)));
      const incompleteIdentity = rows.some(
        (row) =>
          !row.periodStart &&
          !row.readingDate &&
          !row.unitCode &&
          !row.supplierCode,
      );
      const classification = incompleteIdentity
        ? "LEGACY_IDENTITY"
        : hashes.length === 1
          ? "TRUE_DUPLICATE"
          : "BUSINESS_KEY_COLLISION";
      const first = rows[0];
      const identity = [
        first.entityType,
        first.periodStart?.toISOString().slice(0, 10) ?? first.readingDate?.toISOString().slice(0, 10) ?? "date-unknown",
        first.unitCode ?? "unit-none",
        first.supplierCode ?? "supplier-none",
        first.valueUnit ?? "unit-unknown",
      ].join(" | ");
      return {
        sourceKeyPrefix: key.slice(0, 12),
        entityType: first.entityType,
        identity,
        rows: rows.map((row) => row.source.row ?? "?").join(", "),
        values: rows.map((row) => row.normalizedValue === null ? "NULL" : String(row.normalizedValue)).join(", "),
        contentHashes: hashes.map((hash) => hash.slice(0, 12)).join(", "),
        classification,
      } satisfies DuplicateEvidence;
    });
}

function targetEvidence(parsed: DynamicParserResult | null, year: number) {
  const metric = parsed?.normalized.metrics.biomassTarget;
  const value = metric?.available && metric.value !== null ? metric.value : null;
  const label = metric?.source?.anchor ?? "";
  if (value === OFFICIAL_BIOMASS_TARGET) {
    return {
      value,
      classification: "CURRENT_TARGET" as const,
      review: false,
      source: metric?.source?.address ?? null,
    };
  }
  if (value !== null) {
    return {
      value,
      classification: /TOTAL|SUM|CALCULATED|PERHITUNGAN/.test(label)
        ? "CALCULATED_TARGET" as const
        : "HISTORICAL_TARGET" as const,
      review: true,
      source: metric?.source?.address ?? null,
    };
  }
  return {
    value: null,
    classification: "UNKNOWN" as const,
    review: Boolean(metric?.source) || year > 0,
    source: metric?.source?.address ?? null,
  };
}

function semanticKeyCounts(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function sameCounts(left: Map<string, number>, right: Map<string, number>) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function compareSchema(
  canonical: TargetAudit | null,
  current: TargetAudit,
): { family: SchemaFamily; reason: string; compatibility: string; mappingRequired: boolean } {
  if (!current.schema || !current.parsed)
    return {
      family: "AMBIGUOUS",
      reason: "Target worksheet could not be read or parsed.",
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
    };
  if (!canonical?.schema || !canonical.parsed)
    return {
      family: "AMBIGUOUS",
      reason: "Canonical reference could not be read or parsed.",
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
    };
  if (current.schema.hash === canonical.schema.hash)
    return {
      family: "CANONICAL_MATCH",
      reason: "Schema fingerprint equals Juli26-BB.",
      compatibility: "MATCH",
      mappingRequired: false,
    };

  const canonicalKeys = canonical.schema.columns.map((column) => column.semanticKey);
  const currentKeys = current.schema.columns.map((column) => column.semanticKey);
  const canonicalCounts = semanticKeyCounts(canonicalKeys);
  const currentCounts = semanticKeyCounts(currentKeys);
  const common = [...canonicalCounts.entries()].reduce(
    (total, [key, count]) => total + Math.min(count, currentCounts.get(key) ?? 0),
    0,
  );
  const coverage = common / Math.max(canonicalKeys.length, currentKeys.length, 1);
  const sameSemanticColumns = sameCounts(canonicalCounts, currentCounts);
  const typeChanged = canonical.schema.columns.some((column) => {
    const match = current.schema?.columns.find(
      (candidate) => candidate.semanticKey === column.semanticKey && candidate.labels.join("|") === column.labels.join("|"),
    );
    return match ? match.valueType !== column.valueType : false;
  });
  const ambiguous = current.parsed.diagnostics.ambiguous.length > 0;
  const dateChanged = canonical.schema.dateColumnPresent !== current.schema.dateColumnPresent;
  if (ambiguous || dateChanged)
    return {
      family: "AMBIGUOUS",
      reason: ambiguous
        ? `Parser reports ambiguous field(s): ${current.parsed.diagnostics.ambiguous.join(", ")}.`
        : "Date column presence differs from canonical reference.",
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
    };
  if (sameSemanticColumns && !typeChanged)
    return {
      family: "LEGACY_COMPATIBLE",
      reason: "Semantic columns are equivalent; header labels and/or physical positions differ.",
      compatibility: "COMPATIBLE",
      mappingRequired: false,
    };
  if (coverage >= 0.55)
    return {
      family: "LEGACY_REQUIRES_MAPPING",
      reason: `Semantic overlap ${Math.round(coverage * 100)}%; missing, added, renamed, or typed fields require a mapping profile.`,
      compatibility: "REQUIRES_MAPPING",
      mappingRequired: true,
    };
  if (coverage >= 0.2)
    return {
      family: "AMBIGUOUS",
      reason: `Only ${Math.round(coverage * 100)}% semantic overlap with canonical reference; business meaning is not safe to infer.`,
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
    };
  return {
    family: "INCOMPATIBLE",
    reason: "Semantic structure is materially different from canonical BB profile.",
    compatibility: "INCOMPATIBLE",
    mappingRequired: true,
  };
}

function parserPlanFor(family: SchemaFamily) {
  if (family === "CANONICAL_MATCH") return "EXISTING_PARSER_SUFFICIENT";
  if (family === "LEGACY_COMPATIBLE" || family === "LEGACY_REQUIRES_MAPPING")
    return "MAPPING_PROFILE_REQUIRED";
  if (family === "AMBIGUOUS") return "PARSER_EXTENSION_REQUIRED_AFTER_REVIEW";
  return "NEW_PARSER_REQUIRED_ONLY_IF_MAPPING_CANNOT_REPRESENT_SEMANTICS";
}

const criticalPlanIssues = new Set([
  "ambiguous_fields",
  "biomass_supplier_schema_incomplete",
  "biomass_supplier_identity_incomplete",
  "biomass_target_does_not_match_70020",
  "biomass_cumulative_unresolved",
  "parser_errors",
  "daily_series_empty",
  "required_daily_columns_missing",
]);

function importabilityFor(
  current: TargetAudit,
  canonical: TargetAudit | null,
) {
  if (current.readStatus !== "READ" || !current.plan) return "NEEDS_MANUAL_REVIEW" as const;
  const duplicate = current.duplicateEvidence.length > 0;
  const critical = current.plan.blockingIssues.some((issue) => criticalPlanIssues.has(issue));
  const dateMismatch = current.dateIssues.length > 0;
  if (
    current.metadata.title === CANONICAL_WORKSHEET &&
    current.schemaFamily === "CANONICAL_MATCH" &&
    current.plan.status === "READY_FOR_IMPORT" &&
    !duplicate &&
    !dateMismatch &&
    canonical?.metadata.title === CANONICAL_WORKSHEET
  )
    return "IMPORT_NOW" as const;
  if (
    current.schemaFamily === "AMBIGUOUS" ||
    current.schemaFamily === "INCOMPATIBLE" ||
    duplicate ||
    critical ||
    current.targetReview
  )
    return "NEEDS_MANUAL_REVIEW" as const;
  return "IMPORT_AFTER_MAPPING" as const;
}

async function databaseSnapshot(): Promise<DatabaseSnapshot> {
  const [
    units,
    coalQuality,
    coalConsumption,
    coalStock,
    powerGeneration,
    kpiTargets,
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    solarReceipts,
    solarConsumptions,
    hopReadings,
    biomassTargets,
    cumulativeSnapshots,
    importRuns,
    stagingRows,
    syncSources,
    syncWorksheets,
    syncRuns,
    syncRowStates,
    schemaChanges,
  ] = await Promise.all([
    prisma.unit.count(),
    prisma.coalQuality.count(),
    prisma.coalConsumption.count(),
    prisma.coalStock.count(),
    prisma.powerGeneration.count(),
    prisma.kpiTarget.count(),
    prisma.biomassReceipt.count(),
    prisma.biomassConsumption.count(),
    prisma.coalReceipt.count(),
    prisma.solarReceipt.count(),
    prisma.solarConsumption.count(),
    prisma.hopReading.count(),
    prisma.biomassTarget.count(),
    prisma.biomassCumulativeSnapshot.count(),
    prisma.spreadsheetImportRun.count(),
    prisma.spreadsheetImportStaging.count(),
    prisma.syncSource.count(),
    prisma.syncWorksheet.count(),
    prisma.syncRun.count(),
    prisma.syncRowState.count(),
    prisma.syncSchemaChange.count(),
  ]);
  return {
    units,
    coalQuality,
    coalConsumption,
    coalStock,
    powerGeneration,
    kpiTargets,
    biomassReceipts,
    biomassConsumptions,
    coalReceipts,
    solarReceipts,
    solarConsumptions,
    hopReadings,
    biomassTargets,
    cumulativeSnapshots,
    importRuns,
    stagingRows,
    syncSources,
    syncWorksheets,
    syncRuns,
    syncRowStates,
    schemaChanges,
  };
}

async function readTarget(
  metadata: GoogleSheetsWorksheetMetadata,
): Promise<TargetAudit> {
  const resolved = parseBBWorksheetName(metadata.title);
  if (!resolved) throw new Error(`Unexpected non-BB worksheet: ${metadata.title}`);
  await sleep(REQUEST_DELAY_MS);
  try {
    const result = await withSyncRetry(
      () => readGoogleSheetsRange(metadata.title, DYNAMIC_SCAN_RANGE),
      { maxAttempts: MAX_RETRY_ATTEMPTS, baseDelayMs: 600, maxDelayMs: 1_200 },
    );
    if (!result.rows.length) {
      return {
        metadata,
        month: resolved.month,
        monthLabel: resolved.monthLabel,
        year: resolved.year,
        readStatus: "EMPTY",
        readError: null,
        parsed: null,
        plan: null,
        schema: null,
        schemaFamily: "AMBIGUOUS",
        schemaReason: "Worksheet returned no values.",
        compatibility: "AMBIGUOUS",
        mappingRequired: true,
        importability: "NEEDS_MANUAL_REVIEW",
        dateIssues: ["Worksheet returned no values."],
        dateRange: "EMPTY",
        units: [],
        unitNotes: [],
        suppliers: [],
        missingSuppliers: [],
        supplierNotes: [],
        duplicateEvidence: [],
        targetValue: null,
        targetClassification: "UNKNOWN",
        targetReview: true,
        targetSource: null,
        parserPlan: "PARSER_EXTENSION_REQUIRED_AFTER_REVIEW",
      };
    }
    const parsed = parseDynamicWorksheet(result.rows, {
      worksheetName: metadata.title,
      month: resolved.month,
      year: resolved.year,
      rowOffset: 1,
      columnOffset: 1,
    });
    const readResult = {
      requested: { month: resolved.month, year: resolved.year, worksheet: metadata.title },
      effective: { month: resolved.month, year: resolved.year, worksheet: metadata.title },
      isFallback: false,
      fallbackIndex: 0,
      attemptedWorksheets: [metadata.title],
      parsed,
    } satisfies DynamicWorksheetReadResult;
    const plan = buildGoogleSheetsImportPlanFromReadResult(readResult);
    const schema = buildSchemaSnapshot(parsed);
    const units = unitsAndNotes(parsed);
    const dates = dateValues(parsed);
    const target = targetEvidence(parsed, resolved.year);
    const canonicalCodes = [
      ...new Set(
        plan.receiptRows.map((row) => row.supplierCode),
      ),
    ];
    const suppliers = supplierEvidence(plan, canonicalCodes);
    return {
      metadata,
      month: resolved.month,
      monthLabel: resolved.monthLabel,
      year: resolved.year,
      readStatus: "READ",
      readError: null,
      parsed,
      plan,
      schema,
      schemaFamily: "AMBIGUOUS",
      schemaReason: "Awaiting canonical comparison.",
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
      importability: "NEEDS_MANUAL_REVIEW",
      dateIssues: dateIssues(parsed, resolved.month, resolved.year),
      dateRange: dates.range,
      units: units.units,
      unitNotes: units.notes,
      suppliers: suppliers.suppliers,
      missingSuppliers: suppliers.missing,
      supplierNotes: suppliers.notes,
      duplicateEvidence: duplicateEvidence(plan),
      targetValue: target.value,
      targetClassification: target.classification,
      targetReview: target.review,
      targetSource: target.source,
      parserPlan: "PARSER_EXTENSION_REQUIRED_AFTER_REVIEW",
    };
  } catch (error) {
    return {
      metadata,
      month: resolved.month,
      monthLabel: resolved.monthLabel,
      year: resolved.year,
      readStatus: "READ_FAILED",
      readError: safeReadError(error),
      parsed: null,
      plan: null,
      schema: null,
      schemaFamily: "AMBIGUOUS",
      schemaReason: "Read failed; content could not be compared.",
      compatibility: "AMBIGUOUS",
      mappingRequired: true,
      importability: "NEEDS_MANUAL_REVIEW",
      dateIssues: ["Read failed; date semantics unavailable."],
      dateRange: "UNAVAILABLE",
      units: [],
      unitNotes: [],
      suppliers: [],
      missingSuppliers: [],
      supplierNotes: [],
      duplicateEvidence: [],
      targetValue: null,
      targetClassification: "UNKNOWN",
      targetReview: true,
      targetSource: null,
      parserPlan: "PARSER_EXTENSION_REQUIRED_AFTER_REVIEW",
    };
  }
}

function canonicalSuppliers(audit: TargetAudit | null) {
  return unique(
    audit?.plan?.receiptRows.map((row) => row.supplierCode) ?? [],
  );
}

function nonBBReason(metadata: GoogleSheetsWorksheetMetadata) {
  return `${metadata.title} does not match strict [Bulan][2 digit year]-BB pattern; content is out of BB database scope.`;
}

function headerRows(parsed: DynamicParserResult | null) {
  return parsed?.structures[0]?.headerRows.join(", ") || "UNKNOWN";
}

function headerMapping(parsed: DynamicParserResult | null) {
  if (!parsed) return [];
  const structure = parsed.structures[0];
  if (!structure) return [];
  return structure.headerPaths.map((path) => fieldMappingForPath(parsed, path));
}

function schemaFamilyTable(audits: readonly TargetAudit[]) {
  const groups = new Map<SchemaFamily, TargetAudit[]>();
  for (const audit of audits) {
    const group = groups.get(audit.schemaFamily) ?? [];
    group.push(audit);
    groups.set(audit.schemaFamily, group);
  }
  const order: readonly SchemaFamily[] = [
    "CANONICAL_MATCH",
    "LEGACY_COMPATIBLE",
    "LEGACY_REQUIRES_MAPPING",
    "INCOMPATIBLE",
    "AMBIGUOUS",
  ];
  return order
    .filter((family) => groups.has(family))
    .map((family) => {
      const members = groups.get(family) ?? [];
      return `| ${family} | ${members.length} | ${members.slice(0, 5).map((member) => member.metadata.title).join(", ")} | ${members[0]?.schemaReason ?? "-"} | ${members.some((member) => member.mappingRequired) ? "YES" : "NO"} |`;
    })
    .join("\n");
}

function targetInventory(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${markdownCell(audit.metadata.title)} | ${audit.monthLabel} | ${audit.year} | ${audit.schemaFamily} | ${audit.compatibility} | ${audit.importability} | ${audit.readStatus} |`,
    )
    .join("\n");
}

function nonBBInventory(metadata: readonly GoogleSheetsWorksheetMetadata[]) {
  return metadata
    .filter((item) => !parseBBWorksheetName(item.title))
    .map(
      (item) =>
        `| ${markdownCell(item.title)} | ${markdownCell(nonBBReason(item))} | NON_DATABASE_SOURCE |`,
    )
    .join("\n");
}

function canonicalProfile(audit: TargetAudit | null) {
  if (!audit?.parsed || !audit.plan || !audit.schema)
    return "Canonical reference could not be read; mapping is BLOCKED.";
  const parsed = audit.parsed;
  const structure = parsed.structures[0];
  const tables = parsed.tables
    .map((table) => `${table.kind} ${table.startRow}:${table.endRow} / ${columnLetter(table.startColumn)}:${columnLetter(table.endColumn)}`)
    .join("; ") || "none";
  const mappings = headerMapping(parsed);
  const mappingRows = mappings
    .map(
      (mapping) =>
        `| ${markdownCell(mapping.sourceHeader)} | ${mapping.normalizedField} | ${mapping.databaseField} | ${mapping.type} | ${markdownCell(mapping.transformation)} | ${mapping.confidence} |`,
    )
    .join("\n");
  return `| Worksheet pattern | [Bulan][2 digit year]-BB |
| Worksheet | ${audit.metadata.title} |
| Sheet ID | ${audit.metadata.sheetId} |
| Range requested | ${DYNAMIC_SCAN_RANGE} |
| Detected range | ${detectedRange(parsed) ?? "UNKNOWN"} |
| Header rows | ${headerRows(parsed)} |
| Data rows | ${structure?.dataRows.length ?? 0} |
| Date column | ${structure?.dateColumn === null || structure?.dateColumn === undefined ? "UNKNOWN" : `${columnLetter(structure.dateColumn)} / column ${structure.dateColumn}`} |
| Date range | ${audit.dateRange} |
| Blocks | ${markdownCell(tables)} |
| Unit blocks | ${audit.units.join(", ") || "UNKNOWN"} |
| Supplier rows | ${audit.suppliers.join(", ") || "UNKNOWN"} |
| Parser | ${audit.parserPlan} |
| Schema hash prefix | ${audit.schema.hash.slice(0, 12)} |
| Plan status | ${audit.plan.status} |
| Plan summary | ${JSON.stringify(audit.plan.summary)} |
| Source key | entity + period/date + unit + supplier + value unit; row position excluded |
| Normalization | existing semantic parser, numeric normalization, Unit 1-3 ordered-block rule, seven Biomassa supplier identities |
| Validation | parser diagnostics, required daily paths, supplier identity, target 70.020 ton, duplicate/source-key and schema checks |\n\nCanonical header mapping:\n\n| Source Header | Normalized Field | Database Field | Type | Transformation | Confidence |\n| --- | --- | --- | --- | --- | --- |\n${mappingRows || "| No semantic header | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | unknown | manual review | LOW |"}`;
}

function databaseTargetTable() {
  return DATABASE_TARGETS.map(
    (target) => `| ${target.domain} | ${target.table} | ${target.fields} | ${target.relation} |`,
  ).join("\n");
}

function unitMappingTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.units.join(", ") || "UNKNOWN"} | ${audit.unitNotes.join(" ") || "No unit anomaly detected by this audit."} | ${audit.units.join(",") === "Unit 1,Unit 2,Unit 3" ? "HIGH" : "REVIEW"} |`,
    )
    .join("\n");
}

function supplierMappingTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.suppliers.join(", ") || "UNKNOWN"} | ${audit.missingSuppliers.join(", ") || "none"} | ${audit.supplierNotes.join(" ") || "No supplier issue detected by this audit."} |`,
    )
    .join("\n");
}

function dateMappingTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.year}-${String(audit.month).padStart(2, "0")} | ${audit.dateRange} | ${audit.dateIssues.join(" ") || "PASS"} |`,
    )
    .join("\n");
}

function targetBiomassTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.targetValue ?? "UNKNOWN"} | ${audit.targetClassification} | ${audit.targetReview ? "NEEDS_REVIEW" : "PASS"} | ${audit.targetSource ?? "UNKNOWN"} |`,
    )
    .join("\n");
}

function duplicateTable(audits: readonly TargetAudit[]) {
  const focused = audits.filter((audit) =>
    ["Juni23-BB", "September25-BB"].includes(audit.metadata.title),
  );
  return focused
    .map((audit) => {
      const evidence = audit.duplicateEvidence.length
        ? audit.duplicateEvidence
            .map(
              (item) =>
                `| ${audit.metadata.title} | ${item.sourceKeyPrefix} | ${item.entityType} | ${markdownCell(item.identity)} | ${item.rows} | ${item.values} | ${item.contentHashes} | ${item.classification} |`,
            )
            .join("\n")
        : `| ${audit.metadata.title} | none | none | none | none | none | none | UNKNOWN |`;
      return evidence;
    })
    .join("\n");
}

function manualReviewTable(audits: readonly TargetAudit[]) {
  const review = audits.filter(
    (audit) => audit.importability === "NEEDS_MANUAL_REVIEW",
  );
  if (!review.length) return "| None | - | - |";
  return review
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.schemaReason}; ${audit.plan?.blockingIssues.join(", ") || "read/schema issue"} | ${audit.importability} |`,
    )
    .join("\n");
}

function importEligibilityTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.importability} | ${audit.schemaFamily} | ${audit.plan?.blockingIssues.join(", ") || "none"} |`,
    )
    .join("\n");
}

function parserPlanTable(audits: readonly TargetAudit[]) {
  return audits
    .map(
      (audit) =>
        `| ${audit.metadata.title} | ${audit.schemaFamily} | ${audit.parserPlan} | ${audit.schemaReason} |`,
    )
    .join("\n");
}

function countBy<T>(values: readonly T[]) {
  const result = new Map<T, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function countRows(audits: readonly TargetAudit[]) {
  return audits.reduce((sum, audit) => sum + (audit.plan?.stagingRows.length ?? 0), 0);
}

function databaseSnapshotText(snapshot: DatabaseSnapshot) {
  return Object.entries(snapshot)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
}

function reportFor(
  metadata: readonly GoogleSheetsWorksheetMetadata[],
  targets: readonly TargetAudit[],
  canonical: TargetAudit | null,
  before: DatabaseSnapshot,
  after: DatabaseSnapshot,
) {
  const targetCounts = countBy(targets.map((audit) => audit.importability));
  const schemaCounts = countBy(targets.map((audit) => audit.schemaFamily));
  const readFailures = targets.filter((audit) => audit.readStatus === "READ_FAILED");
  const nonBB = metadata.filter((item) => !parseBBWorksheetName(item.title));
  const stable = JSON.stringify(before) === JSON.stringify(after);
  const status = !canonical || readFailures.length || !stable
    ? "BB MAPPING — BLOCKED"
    : targets.some((audit) => audit.importability === "NEEDS_MANUAL_REVIEW")
      ? "BB MAPPING — PASS WITH REVIEW"
      : "BB MAPPING — PASS";
  const targetNow = targetCounts.get("IMPORT_NOW") ?? 0;
  const targetAfter = targetCounts.get("IMPORT_AFTER_MAPPING") ?? 0;
  const targetReview = targetCounts.get("NEEDS_MANUAL_REVIEW") ?? 0;
  const schemaFamilySummary = [...schemaCounts.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  const canonicalProfileText = canonicalProfile(canonical);
  const mappings = headerMapping(canonical?.parsed ?? null);
  const mappingRows = mappings
    .map(
      (mapping) =>
        `| ${markdownCell(mapping.sourceHeader)} | ${mapping.normalizedField} | ${mapping.databaseField} | ${mapping.type} | ${markdownCell(mapping.transformation)} | ${mapping.confidence} |`,
    )
    .join("\n");
  const duplicateRows = targets.reduce(
    (sum, audit) => sum + audit.duplicateEvidence.length,
    0,
  );
  return `# BB Canonical Mapping Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **${status}**

## Business Rule

Hanya worksheet dengan nama yang cocok secara ketat dengan **[Bulan][2 digit tahun]-BB** yang merupakan source database BB. Worksheet lain tidak dibuatkan mapping database pada fase ini.

Canonical reference: **${CANONICAL_WORKSHEET}**. Nilai worksheet canonical digunakan hanya sebagai reference untuk struktur, parser, validation, dan regression; nilai tidak disalin ke periode lain.

## Target Worksheet Pattern

Valid month names: Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember. Format tahun adalah dua digit dan suffix harus **-BB**. Contoh valid: Juli26-BB, Juni23-BB, September25-BB. Contoh invalid: Flyash-Okt, Summary-BB, Juli-26-BB.

## Canonical Reference: Juli26-BB

${canonicalProfileText}

Canonical database target mapping:

| Domain | PostgreSQL table | Fields | Relationship/shape |
| --- | --- | --- | --- |
${databaseTargetTable()}

No NEW_SCHEMA_REQUIRED target was identified for canonical domains. Summary/calculation/helper values are presentation evidence and are not assigned a new database table.

## Target Worksheet Inventory

Total target worksheets: **${targets.length}**.  
Target content read: **${targets.filter((audit) => audit.readStatus === "READ").length}**.  
Read failures: **${readFailures.length}**.

| Worksheet | Month | Year | Schema Family | Compatibility | Importability | Read Status |
| --- | --- | ---: | --- | --- | --- | --- |
${targetInventory(targets) || "| None | - | - | - | - | - | - |"}

## Non-BB Worksheet Inventory

Non-BB worksheet count: **${nonBB.length}**. These are metadata-inventoried as **NON_DATABASE_SOURCE** for this BB phase. No content-to-database mapping was created for them.

| Worksheet | Reason Not Target | Classification |
| --- | --- | --- |
${nonBBInventory(metadata) || "| None | - | - |"}

## Canonical Profile

Juli26-BB defines the expected header hierarchy, daily block, Unit 1-3 identity, seven Biomassa supplier identities, date semantics, parser normalization, source-key identity, validation, and database relationship. Existing Unit normalization is retained: a duplicate Unit 2 label is interpreted as Unit 3 only when ordered block evidence proves it; this phase does not normalize source values.

## Schema Families

| Family | Worksheet Count | Example | Relation to Juli26-BB | Mapping Required |
| --- | ---: | --- | --- | --- |
${schemaFamilyTable(targets) || "| None | 0 | - | - | - |"}

Family summary: ${schemaFamilySummary || "none"}.

Schema comparison uses semantic header key, resource, unit, total/stock/HOP flags, date column, observed value type, parser ambiguity, and date semantics. It does not rely on physical column position alone.

## Field Mapping

Canonical mapping based on Juli26-BB:

| Source Header | Normalized Field | Database Field | Type | Transformation | Confidence |
| --- | --- | --- | --- | --- | --- |
${mappingRows || "| No canonical mapping | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | unknown | manual review | LOW |"}

Legacy headers with equivalent semantics are **proposed mappings only**. No mapping was implemented or applied to legacy worksheets in Phase 11D.

## Unit Mapping

Canonical units are Unit 1, Unit 2, and Unit 3. Unit identity is mapped through the existing unit master and is not inferred solely from a physical column position.

| Worksheet | Detected Units | Notes | Status |
| --- | --- | --- | --- |
${unitMappingTable(targets)}

## Supplier Mapping

Canonical Biomassa receipt suppliers are represented by the supplier identities resolved by Juli26-BB. The canonical seven-supplier rule is used for comparison only; no legacy supplier name is auto-renamed.

| Worksheet | Detected Suppliers | Missing Canonical Codes | Notes |
| --- | --- | --- | --- |
${supplierMappingTable(targets)}

## Date Mapping

Every target worksheet is checked against its name-derived month/year. Invalid calendar dates, dates outside the expected period, or unresolved daily dates are flagged as DATE_PERIOD_MISMATCH; source values are not repaired.

| Worksheet | Expected Period | Detected Date Range | Validation |
| --- | --- | --- | --- |
${dateMappingTable(targets)}

## Target Biomassa

Official current target: **70.020 ton**. A legacy target is never overwritten automatically.

| Worksheet | Detected Value | Classification | Review | Source |
| --- | ---: | --- | --- | --- |
${targetBiomassTable(targets)}

Classification rule: exact 70.020 ton is CURRENT_TARGET; other explicit values are HISTORICAL_TARGET or CALCULATED_TARGET and require review; missing/ambiguous values are UNKNOWN and require review.

## Duplicate Analysis

Duplicate investigation is retained for **Juni23-BB** and **September25-BB** because both match the target pattern. They are not excluded from the target inventory due to duplicates.

Duplicate groups detected: **${duplicateRows}**.

| Worksheet | Source Key Prefix | Entity | Identity | Source Rows | Values | Content Hash Prefixes | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
${duplicateTable(targets) || "| None | - | - | - | - | - | - | UNKNOWN |"}

TRUE_DUPLICATE means same business identity and same normalized content hash. BUSINESS_KEY_COLLISION means same identity with conflicting values. IDENTITY_DESIGN_ERROR, LEGACY_IDENTITY, or UNKNOWN are retained for manual investigation. No duplicate was deleted, merged, updated, or imported.

## Parser Extension Plan

| Worksheet | Schema Family | Recommendation | Evidence |
| --- | --- | --- | --- |
${parserPlanTable(targets)}

Priority remains: existing parser -> mapping profile -> parser extension -> new parser only when unavoidable. No parser was implemented in this phase.

## Import Eligibility

| Worksheet | Eligibility | Schema Family | Existing Plan Issues |
| --- | --- | --- | --- |
${importEligibilityTable(targets)}

Summary:

- IMPORT_NOW: **${targetNow}**
- IMPORT_AFTER_MAPPING: **${targetAfter}**
- NEEDS_MANUAL_REVIEW: **${targetReview}**
- NON_DATABASE_SOURCE: **${nonBB.length}**

## Manual Review

| Worksheet | Reason | Status |
| --- | --- | --- |
${manualReviewTable(targets)}

Mandatory duplicate review remains focused on Juni23-BB and September25-BB. Flyash-Okt and Flyash-Nov are non-BB worksheets and therefore are not manual-review targets for the BB database in this phase.

## Database Safety

This phase is read-only. No INSERT, UPDATE, DELETE, DROP, TRUNCATE, reset, Prisma migration, Prisma db push/pull, import, synchronization write, Google Sheets mutation, credential change, environment change, Laravel change, Prisma schema change, or deployment was performed.

Snapshot before audit:

${databaseSnapshotText(before)}

Snapshot after audit:

${databaseSnapshotText(after)}

- Database snapshots stable: **${stable ? "YES" : "NO"}**
- Database writes: **0**
- Destructive operations: **NONE**

## Final Recommendation

1. Keep Juli26-BB as the only automatic import candidate until a separately approved import phase.
2. Treat every non-BB worksheet as NON_DATABASE_SOURCE for the BB database.
3. Resolve the target worksheets marked NEEDS_MANUAL_REVIEW, especially Juni23-BB and September25-BB duplicate/identity evidence.
4. Build mapping profiles per schema family, not one parser per worksheet.
5. Re-run this read-only mapping and dry-run after mapping decisions; do not import from this report.

## Final Summary

| Metric | Count |
| --- | ---: |
| Total worksheets | ${metadata.length} |
| BB target worksheets | ${targets.length} |
| Non-BB worksheets | ${nonBB.length} |
| Canonical match | ${schemaCounts.get("CANONICAL_MATCH") ?? 0} |
| Legacy compatible | ${schemaCounts.get("LEGACY_COMPATIBLE") ?? 0} |
| Legacy mapping required | ${schemaCounts.get("LEGACY_REQUIRES_MAPPING") ?? 0} |
| Incompatible | ${schemaCounts.get("INCOMPATIBLE") ?? 0} |
| Ambiguous | ${schemaCounts.get("AMBIGUOUS") ?? 0} |
| Import now | ${targetNow} |
| Import after mapping | ${targetAfter} |
| Manual review | ${targetReview} |
| Non-database | ${nonBB.length} |
| Staging rows profiled | ${countRows(targets)} |

Final status: **${status}**.

Phase 11D stops here. **Do not import.**
`;
}

async function main() {
  const metadata = await listGoogleSheetsWorksheets();
  const targetMetadata = metadata
    .filter((item) => parseBBWorksheetName(item.title))
    .sort((left, right) =>
      (left.title === CANONICAL_WORKSHEET ? -1 : 0) -
      (right.title === CANONICAL_WORKSHEET ? -1 : 0) ||
      (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    );
  const before = await databaseSnapshot();
  const audits: TargetAudit[] = [];
  for (const [index, item] of targetMetadata.entries()) {
    const audit = await readTarget(item);
    audits.push(audit);
    console.log(`BB canonical mapping progress: ${index + 1}/${targetMetadata.length}`);
  }
  const canonical = audits.find(
    (audit) => audit.metadata.title === CANONICAL_WORKSHEET,
  ) ?? null;
  const canonicalCodes = canonicalSuppliers(canonical);
  for (const audit of audits) {
    const comparison = compareSchema(canonical, audit);
    const suppliers = supplierEvidence(audit.plan, canonicalCodes);
    audit.schemaFamily = comparison.family;
    audit.schemaReason = comparison.reason;
    audit.compatibility = comparison.compatibility;
    audit.mappingRequired = comparison.mappingRequired;
    audit.missingSuppliers = suppliers.missing;
    audit.supplierNotes = suppliers.notes;
    audit.importability = importabilityFor(audit, canonical);
    audit.parserPlan = parserPlanFor(audit.schemaFamily);
  }
  const after = await databaseSnapshot();
  const report = reportFor(metadata, audits, canonical, before, after);
  if (process.argv.includes("--write-report")) await writeFile(REPORT_PATH, report, "utf8");
  const readFailures = audits.filter((audit) => audit.readStatus === "READ_FAILED");
  const importCounts = countBy(audits.map((audit) => audit.importability));
  const schemaCounts = countBy(audits.map((audit) => audit.schemaFamily));
  console.log(
    JSON.stringify({
      status: !canonical || readFailures.length || JSON.stringify(before) !== JSON.stringify(after)
        ? "BLOCKED"
        : audits.some((audit) => audit.importability === "NEEDS_MANUAL_REVIEW")
          ? "PASS_WITH_REVIEW"
          : "PASS",
      mode: "bb-canonical-mapping-read-only",
      worksheetCount: metadata.length,
      targetWorksheetCount: audits.length,
      nonBBWorksheetCount: metadata.length - audits.length,
      canonicalWorksheet: CANONICAL_WORKSHEET,
      readFailures: readFailures.length,
      databaseWrites: 0,
      databaseSnapshotStable: JSON.stringify(before) === JSON.stringify(after),
      schemaFamilies: Object.fromEntries(schemaCounts),
      importability: Object.fromEntries(importCounts),
      duplicateFocus: ["Juni23-BB", "September25-BB"],
      reportWritten: process.argv.includes("--write-report"),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "BB canonical mapping audit failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
