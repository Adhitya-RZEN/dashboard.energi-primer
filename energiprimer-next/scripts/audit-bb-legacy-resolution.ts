import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetRow,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  DYNAMIC_SCAN_RANGE,
  type DynamicWorksheetReadResult,
} from "../src/services/google-sheets/dynamic/reader";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import {
  parseDayValue,
  parseNumericValue,
} from "../src/services/google-sheets/dynamic/validators";
import { normalizeCellText } from "../src/services/google-sheets/dynamic/spreadsheet-scanner";
import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import type {
  DynamicParserResult,
  DynamicSheetValue,
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
  type SchemaColumnSnapshot,
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
const EXPECTED_TARGET_COUNT = 21;
const EXPECTED_LEGACY_COUNT = 20;
const REPORT_PATH = new URL(
  "../docs/BB_LEGACY_RESOLUTION_REPORT_2026-08-30.md",
  import.meta.url,
);

const CANONICAL_SUPPLIERS = [
  { name: "Sawdust PT Syahroni", code: "sawdust-pt-syahroni" },
  { name: "Sawdust PT Bintang", code: "sawdust-pt-bintang" },
  { name: "Woodchip PT Syahroni", code: "woodchip-pt-syahroni" },
  { name: "Woodchip PT RAP", code: "woodchip-pt-rap" },
  { name: "Woodchip CV Multi Paketindo", code: "woodchip-cv-multi-paketindo" },
  { name: "LRUK", code: "lruk" },
  { name: "SRF", code: "srf" },
] as const;

type Importability =
  | "IMPORT_READY"
  | "IMPORT_AFTER_MAPPING"
  | "NEEDS_MANUAL_REVIEW"
  | "DO_NOT_IMPORT";

type DateStatus =
  | "PASS"
  | "DATE_FORMAT_DIFFERENCE"
  | "DATE_PERIOD_MISMATCH"
  | "DUPLICATE_DATE"
  | "INVALID_DATE"
  | "UNAVAILABLE";

type HistoricalSemantics =
  | "CURRENT_OPERATIONAL"
  | "HISTORICAL_OPERATIONAL"
  | "HISTORICAL_TARGET"
  | "SUMMARY"
  | "UNKNOWN";

type ParserStrategy =
  | "EXISTING_PARSER_SUFFICIENT"
  | "MAPPING_PROFILE_REQUIRED"
  | "PARSER_EXTENSION_REQUIRED"
  | "NEW_PARSER_REQUIRED";

type SchemaDifference =
  | "COLUMN_REORDER"
  | "HEADER_RENAME"
  | "HEADER_VARIATION"
  | "MULTI_ROW_HEADER"
  | "BLOCK_LAYOUT_CHANGE"
  | "DATA_TYPE_VARIATION"
  | "LEGACY_SCHEMA"
  | "BUSINESS_SEMANTIC_CHANGE"
  | "UNKNOWN";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

type DatabaseSnapshot = Record<string, number>;

type DatabaseSnapshotResult = {
  snapshot: DatabaseSnapshot | null;
  error: string | null;
};

type RawStats = {
  sourceRows: number;
  maxSourceColumns: number;
  observedCells: number;
  blankCells: number;
  formulaLikeCells: number;
  nonEmptyCells: number;
};

type DateObservation = {
  row: number;
  address: string;
  raw: string;
  format: string;
  iso: string | null;
  day: number | null;
  actualMonth: number | null;
  actualYear: number | null;
  invalid: boolean;
  periodMismatch: boolean;
};

type DateAudit = {
  status: DateStatus;
  range: string;
  observations: DateObservation[];
  formats: string[];
  duplicateDates: string[];
  issues: string[];
};

type MappingRow = {
  sourceHeader: string;
  canonicalField: string;
  databaseField: string;
  transformation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  valueType: string;
  key: string;
};

type DuplicateEvidence = {
  sourceKeyPrefix: string;
  businessKey: string;
  entity: string;
  date: string;
  unit: string;
  supplier: string;
  domain: string;
  quantity: string;
  block: string;
  sourceRows: string;
  contentHashPrefixes: string;
  classification:
    | "TRUE_DUPLICATE"
    | "BUSINESS_KEY_COLLISION"
    | "IDENTITY_DESIGN_ERROR"
    | "LEGACY_IDENTITY"
    | "UNKNOWN";
};

type SchemaComparison = {
  semanticCoverage: number;
  labelCoverage: number;
  differences: SchemaDifference[];
  evidence: string[];
  mappingRequired: boolean;
  mappingStatus: "CLEAR" | "PROPOSED" | "NEEDS_REVIEW";
};

type IdentityProfile = {
  status: "CLEAR" | "PARTIAL" | "CONFLICT" | "UNKNOWN";
  sourceKey: string;
  businessKey: string;
  compositeKey: string;
  contentHash: string;
  uniqueDimensions: string;
  samplePrefixes: string[];
};

type TargetAudit = {
  metadata: GoogleSheetsWorksheetMetadata;
  month: number;
  monthLabel: string;
  year: number;
  rows: GoogleSheetRow[];
  rawStats: RawStats;
  readStatus: "READ" | "READ_FAILED" | "EMPTY";
  readError: string | null;
  parsed: DynamicParserResult | null;
  plan: GoogleSheetsImportPlan | null;
  schema: SchemaSnapshot | null;
  comparison: SchemaComparison | null;
  family: string;
  familyProfileKey: string;
  dateAudit: DateAudit;
  units: string[];
  unitNotes: string[];
  detectedSupplierHeaders: string[];
  suppliers: string[];
  missingSupplierCodes: string[];
  supplierNotes: string[];
  duplicateEvidence: DuplicateEvidence[];
  identity: IdentityProfile;
  targetValue: number | null;
  targetClassification:
    | "HISTORICAL_TARGET"
    | "CURRENT_TARGET"
    | "CALCULATED_TARGET"
    | "UNKNOWN";
  targetReview: boolean;
  targetSource: string | null;
  semantics: HistoricalSemantics;
  importability: Importability;
  parserStrategy: ParserStrategy;
  risk: RiskLevel;
  mappingRows: MappingRow[];
};

type FamilyGroup = {
  name: string;
  members: TargetAudit[];
  representative: TargetAudit;
};

type DatabaseTarget = {
  domain: string;
  canonicalField: string;
  prismaModel: string;
  table: string;
  fields: string;
  relation: string;
};

const DATABASE_TARGETS: readonly DatabaseTarget[] = [
  {
    domain: "BIOMASS_RECEIPT",
    canonicalField: "biomassReceipt.quantityTon",
    prismaModel: "BiomassReceipt",
    table: "biomass_receipts",
    fields: "period_start, supplier_code, supplier_name, quantity_ton",
    relation: "one row per supplier and period",
  },
  {
    domain: "BIOMASS_CONSUMPTION",
    canonicalField: "biomassConsumption.quantityTon",
    prismaModel: "BiomassConsumption",
    table: "biomass_consumptions",
    fields: "reading_date, unit_id, quantity_ton",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "COAL_RECEIPT",
    canonicalField: "coalReceipt.quantityTon",
    prismaModel: "CoalReceipt",
    table: "coal_receipts",
    fields: "period_start, quantity_ton",
    relation: "one row per period",
  },
  {
    domain: "COAL_CONSUMPTION",
    canonicalField: "coalConsumption.quantityTon",
    prismaModel: "CoalConsumption",
    table: "coal_consumption",
    fields: "date, unit_id, coal_used",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "COAL_STOCK",
    canonicalField: "coalStock.closingStock",
    prismaModel: "CoalStock",
    table: "coal_stock",
    fields: "date, opening_stock, received, consumed, closing_stock",
    relation: "one row per day",
  },
  {
    domain: "BIOMASS_STOCK",
    canonicalField: "biomassStock.closingStock",
    prismaModel: "NONE",
    table: "NO_EXISTING_TABLE",
    fields: "not represented in current import plan",
    relation: "NEW_SCHEMA_REQUIRED_IF_BIOMASS_STOCK_MUST_BE_PERSISTED",
  },
  {
    domain: "SOLAR_RECEIPT",
    canonicalField: "solarReceipt.quantityLiter",
    prismaModel: "SolarReceipt",
    table: "solar_receipts",
    fields: "period_start, quantity_liter",
    relation: "one row per period",
  },
  {
    domain: "SOLAR_CONSUMPTION",
    canonicalField: "solarConsumption.quantityLiter",
    prismaModel: "SolarConsumption",
    table: "solar_consumptions",
    fields: "reading_date, quantity_liter",
    relation: "one row per day",
  },
  {
    domain: "HOP",
    canonicalField: "hopDays",
    prismaModel: "HopReading",
    table: "hop_readings",
    fields: "reading_date, unit_id, hop_days",
    relation: "one row per day and Unit 1-3",
  },
  {
    domain: "BIOMASS_TARGET",
    canonicalField: "biomassTarget.targetTon",
    prismaModel: "BiomassTarget",
    table: "biomass_targets",
    fields: "target_year, target_ton",
    relation: "one row per target year",
  },
  {
    domain: "BIOMASS_CUMULATIVE",
    canonicalField: "biomassCumulative.cumulativeTon",
    prismaModel: "BiomassCumulativeSnapshot",
    table: "biomass_cumulative_snapshots",
    fields: "period_start, cumulative_ton",
    relation: "one row per period snapshot",
  },
  {
    domain: "UNIT_MASTER",
    canonicalField: "unit.identity",
    prismaModel: "Unit",
    table: "units",
    fields: "code, name, status",
    relation: "master identity for Unit 1-3",
  },
];

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
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

function shaPrefix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function safeReadError(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError)
    return `${error.code}${error.status === undefined ? "" : ` (HTTP ${error.status})`}`;
  return "unknown";
}

function rawStats(rows: readonly GoogleSheetRow[]): RawStats {
  const cells = rows.flat();
  const blankCells = cells.filter(
    (value) => value === null || String(value).trim().length === 0,
  ).length;
  const formulaLikeCells = cells.filter(
    (value) => typeof value === "string" && value.trim().startsWith("="),
  ).length;
  return {
    sourceRows: rows.length,
    maxSourceColumns: rows.reduce((max, row) => Math.max(max, row.length), 0),
    observedCells: cells.length,
    blankCells,
    formulaLikeCells,
    nonEmptyCells: cells.length - blankCells,
  };
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

function domainForPath(path: HeaderPath) {
  const labels = path.labels.join(" ");
  if (path.isHop) return "HOP";
  if (path.isStock) {
    return /BIOMASSA|SAWDUST|WOODCHIP|LRUK|SRF|BONGGOL/.test(labels)
      ? "BIOMASS_STOCK"
      : "COAL_STOCK";
  }
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
  if (/TARGET/.test(labels)) return "BIOMASS_TARGET";
  if (/KUMULATIF|CUMULATIVE|REALISASI/.test(labels))
    return "BIOMASS_CUMULATIVE";
  if (path.isDate) return "DATE";
  return "UNKNOWN";
}

function mappingForPath(
  parsed: DynamicParserResult,
  path: HeaderPath,
  isCanonical: boolean,
): MappingRow {
  const labels = fieldLabels(path);
  const domain = domainForPath(path);
  const unit = path.unitNumber ? ` unit ${path.unitNumber}` : "";
  const valueType = valueTypeForPath(parsed, path);
  const databaseTarget = DATABASE_TARGETS.find((target) => target.domain === domain);
  const base = {
    sourceHeader: labels,
    valueType,
    key: `${labels}|${domain}|${path.unitNumber ?? ""}|${path.isTotal ? "total" : ""}`,
  };
  if (path.isDate)
    return {
      ...base,
      canonicalField: "readingDate / periodStart",
      databaseField: "date / period_start",
      transformation: "parse day/date using worksheet period; reject or review period mismatch",
      confidence: "HIGH",
    };
  if (!databaseTarget || domain === "UNKNOWN")
    return {
      ...base,
      canonicalField: "UNRESOLVED",
      databaseField: "NO_DIRECT_DATABASE_TARGET",
      transformation: "do not infer automatically; require semantic review",
      confidence: "LOW",
    };
  const canonicalField = domain === "BIOMASS_STOCK"
    ? "biomassStock.closingStock"
    : domain === "HOP"
    ? `hopDays${unit}`
    : domain === "BIOMASS_CONSUMPTION"
      ? `biomassConsumption.quantityTon${unit}`
      : domain === "COAL_CONSUMPTION"
        ? `coalConsumption.quantityTon${unit}`
        : databaseTarget.canonicalField;
  const databaseFieldByDomain: Record<string, string> = {
    BIOMASS_RECEIPT: "quantity_ton",
    BIOMASS_CONSUMPTION: "quantity_ton",
    BIOMASS_STOCK: "NO_DIRECT_DATABASE_TARGET",
    COAL_RECEIPT: "quantity_ton",
    COAL_CONSUMPTION: "coal_used",
    COAL_STOCK: "closing_stock",
    SOLAR_RECEIPT: "quantity_liter",
    SOLAR_CONSUMPTION: "quantity_liter",
    HOP: "hop_days",
    BIOMASS_TARGET: "target_ton",
    BIOMASS_CUMULATIVE: "cumulative_ton",
  };
  const confidence = domain === "BIOMASS_STOCK"
    ? "LOW"
    : isCanonical
    ? "HIGH"
    : path.unitNumber !== null || path.isTotal || path.isStock || path.isHop
      ? "MEDIUM"
      : "LOW";
  return {
    ...base,
    canonicalField,
    databaseField: databaseFieldByDomain[domain] === "NO_DIRECT_DATABASE_TARGET"
      ? "NO_DIRECT_DATABASE_TARGET"
      : `${databaseTarget.prismaModel}.${databaseFieldByDomain[domain] ?? "REVIEW_REQUIRED"}`,
    transformation: domain === "BIOMASS_STOCK"
      ? "source field is not represented by the existing Prisma/import model; do not create schema automatically"
      : domain === "BIOMASS_RECEIPT"
      ? "map supplier identity; parse ton value; preserve null; sum only approved supplier columns"
      : "normalize semantic header; parse numeric value; preserve null; validate unit and period",
    confidence,
  };
}

function mappingRowsFor(parsed: DynamicParserResult | null, isCanonical: boolean) {
  if (!parsed) return [];
  const paths = parsed.structures[0]?.headerPaths ?? [];
  const rows = paths.map((path) => mappingForPath(parsed, path, isCanonical));
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function normalizedFamilyLabel(value: string) {
  return normalizeCellText(value)
    .replace(/STOCK/g, "STOK")
    .replace(/COAL/g, "BATUBARA")
    .replace(/RECEIPT|RECEIVED|INCOMING/g, "PENERIMAAN")
    .replace(/CONSUMPTION|CONSUMED|USAGE|USED/g, "PEMAKAIAN")
    .replace(/LITRE/g, "LITER")
    .replace(/DAYS/g, "HARI")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticKind(path: HeaderPath) {
  return JSON.stringify({
    resource: path.resource,
    unit: path.unit,
    unitNumber: path.unitNumber,
    total: path.isTotal,
    stock: path.isStock,
    hop: path.isHop,
    date: path.isDate,
  });
}

function countSignature(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function structureProfileKey(audit: TargetAudit) {
  const structure = audit.parsed?.structures[0];
  const tables = audit.parsed?.tables ?? [];
  const semantics = structure
    ? countSignature(structure.headerPaths.map(semanticKind))
    : [];
  const tableKinds = countSignature(tables.map((table) => table.kind));
  const planShape = audit.plan
    ? Object.entries(audit.plan.summary)
        .filter(([, value]) => value > 0)
        .map(([key]) => key)
        .sort()
    : [];
  return JSON.stringify({
    headerRowCount: structure?.headerRows.length ?? 0,
    headerPathCount: structure?.headerPaths.length ?? 0,
    datePresent: structure?.dateColumn !== null && structure?.dateColumn !== undefined,
    semantics,
    tableKinds,
    planShape,
    ambiguous: audit.parsed?.diagnostics.ambiguous.slice().sort() ?? [],
  });
}

function tokenSet(audit: TargetAudit) {
  const values = audit.parsed?.structures[0]?.headerPaths.flatMap((path) =>
    path.labels.map(normalizedFamilyLabel),
  ) ?? [];
  return new Set(values.flatMap((value) => value.split(/[^A-Z0-9]+/).filter((token) => token.length > 1)));
}

function multisetSimilarity(left: readonly string[], right: readonly string[]) {
  const leftCounts = new Map<string, number>();
  const rightCounts = new Map<string, number>();
  for (const value of left) leftCounts.set(value, (leftCounts.get(value) ?? 0) + 1);
  for (const value of right) rightCounts.set(value, (rightCounts.get(value) ?? 0) + 1);
  const keys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    intersection += Math.min(leftCounts.get(key) ?? 0, rightCounts.get(key) ?? 0);
    union += Math.max(leftCounts.get(key) ?? 0, rightCounts.get(key) ?? 0);
  }
  return union ? intersection / union : 1;
}

function setSimilarity(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / union.size;
}

function familySimilarity(left: TargetAudit, right: TargetAudit) {
  const leftStructure = left.parsed?.structures[0];
  const rightStructure = right.parsed?.structures[0];
  const leftKinds = leftStructure?.headerPaths.map(semanticKind) ?? [];
  const rightKinds = rightStructure?.headerPaths.map(semanticKind) ?? [];
  const leftTables = left.parsed?.tables.map((table) => table.kind) ?? [];
  const rightTables = right.parsed?.tables.map((table) => table.kind) ?? [];
  const structureScore = multisetSimilarity(leftKinds, rightKinds);
  const tableScore = multisetSimilarity(leftTables, rightTables);
  const labelScore = setSimilarity(tokenSet(left), tokenSet(right));
  const headerScore = leftStructure?.headerRows.length === rightStructure?.headerRows.length ? 1 : 0;
  const dateScore = (leftStructure?.dateColumn !== null) === (rightStructure?.dateColumn !== null) ? 1 : 0;
  return structureScore * 0.45 + tableScore * 0.2 + labelScore * 0.2 + headerScore * 0.1 + dateScore * 0.05;
}

function assignFamilies(audits: TargetAudit[], canonical: TargetAudit | null) {
  const groups: FamilyGroup[] = [];
  if (canonical) {
    canonical.family = "CANONICAL_FAMILY";
    canonical.familyProfileKey = structureProfileKey(canonical);
  }
  const legacy = audits
    .filter((audit) => audit !== canonical)
    .sort((left, right) => left.metadata.title.localeCompare(right.metadata.title));
  for (const audit of legacy) {
    audit.familyProfileKey = structureProfileKey(audit);
    const match = groups
      .map((group) => ({ group, score: familySimilarity(audit, group.representative) }))
      .sort((left, right) => right.score - left.score)[0];
    if (match && match.score >= 0.72) {
      match.group.members.push(audit);
      audit.family = match.group.name;
    } else {
      const name = `LEGACY_FAMILY_${String.fromCharCode(65 + groups.length)}`;
      const group = { name, members: [audit], representative: audit };
      groups.push(group);
      audit.family = name;
    }
  }
  if (canonical) groups.unshift({
    name: "CANONICAL_FAMILY",
    members: [canonical],
    representative: canonical,
  });
  return groups;
}

function detectedRange(parsed: DynamicParserResult | null) {
  const cells = parsed?.scannedCells.filter((cell) => cell.normalizedValue.length > 0) ?? [];
  if (!cells.length) return "UNKNOWN";
  const rows = cells.map((cell) => cell.row);
  const columns = cells.map((cell) => cell.column);
  return `${columnLetter(Math.min(...columns))}${Math.min(...rows)}:${columnLetter(Math.max(...columns))}${Math.max(...rows)}`;
}

function dateFormat(raw: DynamicSheetValue) {
  if (typeof raw === "number" || /^\d{1,2}$/.test(String(raw).trim())) return "DAY_NUMBER";
  const text = String(raw ?? "").trim();
  if (/^\d{1,2}\s+[A-Za-z]+(?:\s+\d{2,4})?/.test(text)) return "DAY_MONTH_LABEL";
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return "ISO_DATE";
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(text)) return "D_M_Y_DATE";
  return "UNKNOWN_DATE_FORMAT";
}

function dateAudit(
  parsed: DynamicParserResult | null,
  month: number,
  year: number,
): DateAudit {
  const structure = parsed?.structures[0];
  if (!structure || structure.dateColumn === null)
    return {
      status: "UNAVAILABLE",
      range: "UNAVAILABLE",
      observations: [],
      formats: [],
      duplicateDates: [],
      issues: ["Date column or daily structure unavailable."],
    };
  const observations: DateObservation[] = [];
  for (const row of structure.dataRows) {
    const cell = parsed.scannedCells.find(
      (candidate) => candidate.row === row && candidate.column === structure.dateColumn,
    );
    const raw = cell?.rawValue ?? null;
    const day = parseDayValue(raw);
    const format = dateFormat(raw);
    const text = String(raw ?? "").trim();
    const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    const actualYear = isoMatch
      ? Number(isoMatch[1])
      : slashMatch
        ? slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3])
        : year;
    const actualMonth = isoMatch ? Number(isoMatch[2]) : slashMatch ? Number(slashMatch[2]) : month;
    const daysInMonth = actualMonth >= 1 && actualMonth <= 12
      ? new Date(Date.UTC(actualYear, actualMonth, 0)).getUTCDate()
      : 0;
    const invalid = day === null || day < 1 || day > daysInMonth;
    const periodMismatch = actualYear !== year || actualMonth !== month;
    const iso = day === null || actualMonth < 1 || actualMonth > 12
      ? null
      : `${actualYear}-${String(actualMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    observations.push({
      row,
      address: cell?.address ?? `${columnLetter(structure.dateColumn)}${row}`,
      raw: text || "(empty)",
      format,
      iso,
      day,
      actualMonth,
      actualYear,
      invalid,
      periodMismatch,
    });
  }
  const validIso = observations.map((item) => item.iso).filter((value): value is string => value !== null);
  const dateCounts = new Map<string, number>();
  for (const value of validIso) dateCounts.set(value, (dateCounts.get(value) ?? 0) + 1);
  const duplicateDates = [...dateCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
  const issues: string[] = [];
  for (const item of observations) {
    if (item.invalid)
      issues.push(`${item.address}=${item.raw}: INVALID_DATE`);
    else if (item.periodMismatch)
      issues.push(`${item.address}=${item.raw}: DATE_PERIOD_MISMATCH (expected ${year}-${String(month).padStart(2, "0")})`);
  }
  if (duplicateDates.length)
    issues.push(`Duplicate date(s): ${duplicateDates.join(", ")}`);
  const formats = unique(observations.map((item) => item.format));
  const nonCanonicalFormat = formats.some(
    (format) => !["DAY_NUMBER", "DAY_MONTH_LABEL"].includes(format),
  );
  if (nonCanonicalFormat && !issues.length)
    issues.push(`DATE_FORMAT_DIFFERENCE: ${formats.join(", ")} (semantic date is valid).`);
  const sortedDates = unique(validIso).sort();
  const range = sortedDates.length
    ? `${sortedDates[0]} -> ${sortedDates.at(-1)} (${sortedDates.length} dates)`
    : "UNAVAILABLE";
  let status: DateStatus = "PASS";
  if (!observations.length) status = "UNAVAILABLE";
  else if (observations.some((item) => item.invalid)) status = "INVALID_DATE";
  else if (observations.some((item) => item.periodMismatch)) status = "DATE_PERIOD_MISMATCH";
  else if (duplicateDates.length) status = "DUPLICATE_DATE";
  else if (nonCanonicalFormat) status = "DATE_FORMAT_DIFFERENCE";
  return { status, range, observations, formats, duplicateDates, issues: unique(issues) };
}

function unitsAndNotes(parsed: DynamicParserResult | null) {
  const structure = parsed?.structures[0];
  if (!structure) return { units: [], notes: ["Structure unavailable."] };
  const numbers = unique(
    structure.headerPaths
      .map((path) => path.unitNumber)
      .filter((value): value is number => value !== null),
  ).sort((left, right) => left - right);
  const unitLabels = parsed.scannedCells.filter((cell) => /^UNIT [123]$/.test(cell.normalizedValue));
  const notes: string[] = [];
  if (numbers.join(",") !== "1,2,3") notes.push("Canonical Unit 1-3 evidence is incomplete or differently labelled.");
  if (unitLabels.filter((cell) => cell.normalizedValue === "UNIT 2").length > 1)
    notes.push("Repeated Unit 2 labels detected; existing ordered-block rule proposes the later block as Unit 3. Source is unchanged.");
  return { units: numbers.map((number) => `Unit ${number}`), notes };
}

function supplierHeaders(parsed: DynamicParserResult | null) {
  const paths = parsed?.structures[0]?.headerPaths ?? [];
  return unique(
    paths
      .filter((path) => path.resource === "biomass")
      .filter((path) => /PENERIMAAN|RECEIPT|SAWDUST|WOODCHIP|LRUK|SRF|BONGGOL/.test(path.labels.join(" ")))
      .map(fieldLabels),
  );
}

function supplierEvidence(
  parsed: DynamicParserResult | null,
  plan: GoogleSheetsImportPlan | null,
) {
  const suppliers = unique(plan?.receiptRows.map((row) => `${row.supplierName} [${row.supplierCode}]`) ?? []);
  const codes = unique(plan?.receiptRows.map((row) => row.supplierCode) ?? []);
  const missing = CANONICAL_SUPPLIERS.map((supplier) => supplier.code).filter((code) => !codes.includes(code));
  const notes: string[] = [];
  if (!plan?.receiptRows.length) notes.push("Existing parser resolved no Biomassa supplier receipt rows.");
  if (missing.length) notes.push(`Missing canonical code(s): ${missing.join(", ")}.`);
  const headers = supplierHeaders(parsed);
  if (headers.length && !plan?.receiptRows.length) notes.push("Supplier-like headers are present but not safely mapped by the existing parser.");
  return { suppliers, missing, notes, headers };
}

function sourceBlock(parsed: DynamicParserResult | null, source: ImportStagingRecord["source"]) {
  const match = source.cell?.match(/^([A-Z]+)(\d+)$/);
  if (!match || !parsed) return "UNRESOLVED_BLOCK";
  let column = 0;
  for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  const table = parsed.tables.find(
    (candidate) => row >= candidate.startRow && row <= candidate.endRow && column >= candidate.startColumn && column <= candidate.endColumn,
  );
  return table
    ? `${table.kind} ${table.startRow}:${table.endRow}/${columnLetter(table.startColumn)}:${columnLetter(table.endColumn)}`
    : "UNRESOLVED_BLOCK";
}

function duplicateEvidence(parsed: DynamicParserResult | null, plan: GoogleSheetsImportPlan | null) {
  if (!parsed || !plan) return [];
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
      const first = rows[0];
      const incompleteIdentity = rows.some(
        (row) => !row.periodStart && !row.readingDate && !row.unitCode && !row.supplierCode,
      );
      const classification = incompleteIdentity
        ? "LEGACY_IDENTITY"
        : hashes.length === 1
          ? "TRUE_DUPLICATE"
          : "BUSINESS_KEY_COLLISION";
      const date = first.periodStart?.toISOString().slice(0, 10) ?? first.readingDate?.toISOString().slice(0, 10) ?? "date-unknown";
      const unit = first.unitCode ?? "unit-none";
      const supplier = first.supplierCode ?? "supplier-none";
      const domain = first.entityType;
      const businessKey = `${domain} | ${date} | ${unit} | ${supplier} | ${first.valueUnit ?? "unit-unknown"}`;
      return {
        sourceKeyPrefix: key.slice(0, 12),
        businessKey,
        entity: first.entityType,
        date,
        unit,
        supplier,
        domain,
        quantity: rows.map((row) => row.normalizedValue === null ? "NULL" : String(row.normalizedValue)).join(", "),
        block: unique(rows.map((row) => sourceBlock(parsed, row.source))).join("; "),
        sourceRows: rows.map((row) => row.source.row ?? "?").join(", "),
        contentHashPrefixes: hashes.map((hash) => hash.slice(0, 12)).join(", "),
        classification,
      } satisfies DuplicateEvidence;
    });
}

function targetEvidence(parsed: DynamicParserResult | null) {
  const metric = parsed?.normalized.metrics.biomassTarget;
  const value = metric?.available && metric.value !== null ? metric.value : null;
  const label = metric?.source?.anchor ?? "";
  if (value === OFFICIAL_BIOMASS_TARGET)
    return {
      value,
      classification: "CURRENT_TARGET" as const,
      review: false,
      source: metric?.source?.address ?? null,
    };
  if (value !== null)
    return {
      value,
      classification: /TOTAL|SUM|CALCULATED|PERHITUNGAN/.test(label)
        ? "CALCULATED_TARGET" as const
        : "HISTORICAL_TARGET" as const,
      review: true,
      source: metric?.source?.address ?? null,
    };
  return {
    value: null,
    classification: "UNKNOWN" as const,
    review: true,
    source: metric?.source?.address ?? null,
  };
}

function semanticKeyCounts(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function overlap(left: readonly string[], right: readonly string[]) {
  const leftCounts = semanticKeyCounts(left);
  const rightCounts = semanticKeyCounts(right);
  const common = [...leftCounts.entries()].reduce(
    (total, [key, count]) => total + Math.min(count, rightCounts.get(key) ?? 0),
    0,
  );
  return common / Math.max(left.length, right.length, 1);
}

function labelOverlap(left: readonly SchemaColumnSnapshot[], right: readonly SchemaColumnSnapshot[]) {
  const leftLabels = left.map((column) => column.labels.join(" > "));
  const rightLabels = right.map((column) => column.labels.join(" > "));
  return overlap(leftLabels, rightLabels);
}

function schemaComparison(canonical: TargetAudit | null, current: TargetAudit): SchemaComparison {
  if (!canonical?.schema || !canonical.parsed || !current.schema || !current.parsed)
    return {
      semanticCoverage: 0,
      labelCoverage: 0,
      differences: ["UNKNOWN"],
      evidence: ["Canonical or target parse is unavailable."],
      mappingRequired: true,
      mappingStatus: "NEEDS_REVIEW",
    };
  if (current === canonical)
    return {
      semanticCoverage: 1,
      labelCoverage: 1,
      differences: [],
      evidence: ["Schema fingerprint and semantic profile equal Juli26-BB."],
      mappingRequired: false,
      mappingStatus: "CLEAR",
    };
  const canonicalPaths = canonical.parsed.structures[0]?.headerPaths ?? [];
  const currentPaths = current.parsed.structures[0]?.headerPaths ?? [];
  const canonicalKinds = canonicalPaths.map(semanticKind);
  const currentKinds = currentPaths.map(semanticKind);
  const semanticCoverage = overlap(canonicalKinds, currentKinds);
  const labelCoverage = labelOverlap(canonical.schema.columns, current.schema.columns);
  const differences: SchemaDifference[] = [];
  const evidence: string[] = [];
  if (JSON.stringify(canonicalKinds) !== JSON.stringify(currentKinds) && semanticCoverage >= 0.8) {
    differences.push("COLUMN_REORDER");
    evidence.push("Semantic columns are mostly present but their physical order differs.");
  }
  if (semanticCoverage >= 0.8 && labelCoverage < 1) {
    differences.push(labelCoverage >= 0.55 ? "HEADER_VARIATION" : "HEADER_RENAME");
    evidence.push(`Header label overlap is ${Math.round(labelCoverage * 100)}%; aliases/renames require explicit mapping.`);
  }
  const canonicalStructure = canonical.parsed.structures[0];
  const currentStructure = current.parsed.structures[0];
  if (canonicalStructure?.headerRows.length !== currentStructure?.headerRows.length)
    differences.push("MULTI_ROW_HEADER");
  if (canonical.parsed.tables.map((table) => table.kind).join(",") !== current.parsed.tables.map((table) => table.kind).join(",")) {
    differences.push("BLOCK_LAYOUT_CHANGE");
    evidence.push("Detected semantic table block kinds differ from the canonical order.");
  }
  const typeChanged = canonical.schema.columns.some((column) => {
    const candidate = current.schema?.columns.find(
      (item) => item.semanticKey === column.semanticKey && item.labels.join("|") === column.labels.join("|"),
    );
    return candidate ? candidate.valueType !== column.valueType : false;
  });
  if (typeChanged) {
    differences.push("DATA_TYPE_VARIATION");
    evidence.push("At least one equivalent semantic column has a different observed value type.");
  }
  if (semanticCoverage < 0.8) {
    differences.push("LEGACY_SCHEMA");
    evidence.push(`Only ${Math.round(semanticCoverage * 100)}% semantic overlap with Juli26-BB.`);
  }
  const canonicalResources = canonicalPaths.map((path) => path.resource).filter((value) => value !== "unknown");
  const currentResources = currentPaths.map((path) => path.resource).filter((value) => value !== "unknown");
  if (canonicalResources.length && currentResources.length && overlap(canonicalResources, currentResources) < 0.55) {
    differences.push("BUSINESS_SEMANTIC_CHANGE");
    evidence.push("Resource/domain evidence is materially different; business meaning cannot be inferred safely.");
  }
  if (!differences.length) differences.push("UNKNOWN");
  return {
    semanticCoverage,
    labelCoverage,
    differences: unique(differences),
    evidence: unique(evidence.length ? evidence : ["Differences require field-level review."]),
    mappingRequired: true,
    mappingStatus: semanticCoverage >= 0.8 && !current.parsed.diagnostics.ambiguous.length ? "PROPOSED" : "NEEDS_REVIEW",
  };
}

function identityProfile(plan: GoogleSheetsImportPlan | null, family: string): IdentityProfile {
  const rows = plan?.stagingRows ?? [];
  const prefixes = unique(rows.map((row) => sourceKeyForStagingRow(row).slice(0, 12))).slice(0, 8);
  const hasDate = rows.some((row) => row.periodStart || row.readingDate);
  const hasUnit = rows.some((row) => row.unitCode);
  const hasSupplier = rows.some((row) => row.supplierCode);
  const collision = new Set(rows.map((row) => sourceKeyForStagingRow(row))).size < rows.length;
  return {
    status: !rows.length ? "UNKNOWN" : collision ? "CONFLICT" : hasDate && (hasUnit || hasSupplier) ? "CLEAR" : "PARTIAL",
    sourceKey: "SHA-256(entityType + periodStart/readingDate + unit + supplier + valueUnit); row/address excluded",
    businessKey: "entity + period/date + Unit 1-3 where applicable + supplier where applicable + value unit",
    compositeKey: "period/date + unit + supplier + domain",
    contentHash: "SHA-256(source identity + normalized content/value)",
    uniqueDimensions: "entityType, periodStart/readingDate, unitCode, supplierCode, valueUnit",
    samplePrefixes: prefixes.length ? prefixes : [shaPrefix(`${family}|no-staging-rows`)],
  };
}

function semanticsFor(audit: TargetAudit): HistoricalSemantics {
  if (audit.metadata.title === CANONICAL_WORKSHEET) return "CURRENT_OPERATIONAL";
  if (audit.targetClassification === "HISTORICAL_TARGET" || audit.targetClassification === "CALCULATED_TARGET") return "HISTORICAL_TARGET";
  if ((audit.plan?.summary.dailyRows ?? 0) > 0) return "HISTORICAL_OPERATIONAL";
  if ((audit.plan?.summary.totalRows ?? 0) > 0) return "SUMMARY";
  return "UNKNOWN";
}

function riskFor(audit: TargetAudit) {
  const critical = new Set([
    "ambiguous_fields",
    "biomass_supplier_schema_incomplete",
    "biomass_supplier_identity_incomplete",
    "biomass_target_does_not_match_70020",
    "biomass_cumulative_unresolved",
    "required_daily_columns_missing",
    "parser_errors",
    "daily_series_empty",
  ]);
  if (
    audit.dateAudit.status === "INVALID_DATE" ||
    audit.dateAudit.status === "DATE_PERIOD_MISMATCH" ||
    audit.dateAudit.status === "DUPLICATE_DATE" ||
    audit.duplicateEvidence.length ||
    audit.plan?.blockingIssues.some((issue) => critical.has(issue)) ||
    audit.comparison?.differences.includes("BUSINESS_SEMANTIC_CHANGE")
  ) return "HIGH" as const;
  if (audit.comparison?.mappingRequired || audit.dateAudit.status === "DATE_FORMAT_DIFFERENCE") return "MEDIUM" as const;
  return "LOW" as const;
}

function parserStrategyFor(audit: TargetAudit): ParserStrategy {
  if (audit.metadata.title === CANONICAL_WORKSHEET) return "EXISTING_PARSER_SUFFICIENT";
  if (audit.comparison?.differences.includes("LEGACY_SCHEMA") || audit.parsed?.diagnostics.ambiguous.length)
    return "PARSER_EXTENSION_REQUIRED";
  if (audit.comparison?.mappingRequired) return "MAPPING_PROFILE_REQUIRED";
  return "EXISTING_PARSER_SUFFICIENT";
}

function importabilityFor(audit: TargetAudit) {
  if (audit.metadata.title === CANONICAL_WORKSHEET && audit.plan?.status === "READY_FOR_IMPORT" && audit.dateAudit.status === "PASS" && !audit.duplicateEvidence.length)
    return "IMPORT_READY" as const;
  if (audit.readStatus !== "READ" || audit.semantics === "UNKNOWN") return "NEEDS_MANUAL_REVIEW" as const;
  if (audit.semantics === "SUMMARY") return "DO_NOT_IMPORT" as const;
  if (audit.comparison?.mappingRequired || audit.targetReview || audit.dateAudit.status !== "PASS" || audit.duplicateEvidence.length || audit.plan?.blockingIssues.length)
    return "NEEDS_MANUAL_REVIEW" as const;
  return "IMPORT_AFTER_MAPPING" as const;
}

async function readAudit(metadata: GoogleSheetsWorksheetMetadata): Promise<TargetAudit> {
  const resolved = parseBBWorksheetName(metadata.title);
  if (!resolved) throw new Error(`Unexpected non-BB worksheet: ${metadata.title}`);
  await sleep(REQUEST_DELAY_MS);
  try {
    const result = await withSyncRetry(
      () => readGoogleSheetsRange(metadata.title, DYNAMIC_SCAN_RANGE),
      { maxAttempts: MAX_RETRY_ATTEMPTS, baseDelayMs: 600, maxDelayMs: 1_200 },
    );
    const stats = rawStats(result.rows);
    if (!result.rows.length) {
      return {
        metadata,
        month: resolved.month,
        monthLabel: resolved.monthLabel,
        year: resolved.year,
        rows: result.rows,
        rawStats: stats,
        readStatus: "EMPTY",
        readError: null,
        parsed: null,
        plan: null,
        schema: null,
        comparison: null,
        family: "UNASSIGNED",
        familyProfileKey: "",
        dateAudit: {
          status: "UNAVAILABLE",
          range: "EMPTY",
          observations: [],
          formats: [],
          duplicateDates: [],
          issues: ["Worksheet returned no values."],
        },
        units: [],
        unitNotes: [],
        detectedSupplierHeaders: [],
        suppliers: [],
        missingSupplierCodes: CANONICAL_SUPPLIERS.map((supplier) => supplier.code),
        supplierNotes: ["Worksheet returned no values."],
        duplicateEvidence: [],
        identity: identityProfile(null, "UNASSIGNED"),
        targetValue: null,
        targetClassification: "UNKNOWN",
        targetReview: true,
        targetSource: null,
        semantics: "UNKNOWN",
        importability: "NEEDS_MANUAL_REVIEW",
        parserStrategy: "NEW_PARSER_REQUIRED",
        risk: "HIGH",
        mappingRows: [],
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
    const parsedTarget = targetEvidence(parsed);
    const suppliers = supplierEvidence(parsed, plan);
    const units = unitsAndNotes(parsed);
    const audit: TargetAudit = {
      metadata,
      month: resolved.month,
      monthLabel: resolved.monthLabel,
      year: resolved.year,
      rows: result.rows,
      rawStats: stats,
      readStatus: "READ",
      readError: null,
      parsed,
      plan,
      schema: buildSchemaSnapshot(parsed),
      comparison: null,
      family: "UNASSIGNED",
      familyProfileKey: "",
      dateAudit: dateAudit(parsed, resolved.month, resolved.year),
      units: units.units,
      unitNotes: units.notes,
      detectedSupplierHeaders: suppliers.headers,
      suppliers: suppliers.suppliers,
      missingSupplierCodes: suppliers.missing,
      supplierNotes: suppliers.notes,
      duplicateEvidence: duplicateEvidence(parsed, plan),
      identity: identityProfile(plan, "UNASSIGNED"),
      targetValue: parsedTarget.value,
      targetClassification: parsedTarget.classification,
      targetReview: parsedTarget.review,
      targetSource: parsedTarget.source,
      semantics: "UNKNOWN",
      importability: "NEEDS_MANUAL_REVIEW",
      parserStrategy: "NEW_PARSER_REQUIRED",
      risk: "HIGH",
      mappingRows: mappingRowsFor(parsed, metadata.title === CANONICAL_WORKSHEET),
    };
    audit.semantics = semanticsFor(audit);
    return audit;
  } catch (error) {
    return {
      metadata,
      month: resolved.month,
      monthLabel: resolved.monthLabel,
      year: resolved.year,
      rows: [],
      rawStats: rawStats([]),
      readStatus: "READ_FAILED",
      readError: safeReadError(error),
      parsed: null,
      plan: null,
      schema: null,
      comparison: null,
      family: "UNASSIGNED",
      familyProfileKey: "",
      dateAudit: {
        status: "UNAVAILABLE",
        range: "UNAVAILABLE",
        observations: [],
        formats: [],
        duplicateDates: [],
        issues: ["Read failed; date semantics unavailable."],
      },
      units: [],
      unitNotes: [],
      detectedSupplierHeaders: [],
      suppliers: [],
      missingSupplierCodes: CANONICAL_SUPPLIERS.map((supplier) => supplier.code),
      supplierNotes: [],
      duplicateEvidence: [],
      identity: identityProfile(null, "UNASSIGNED"),
      targetValue: null,
      targetClassification: "UNKNOWN",
      targetReview: true,
      targetSource: null,
      semantics: "UNKNOWN",
      importability: "NEEDS_MANUAL_REVIEW",
      parserStrategy: "NEW_PARSER_REQUIRED",
      risk: "HIGH",
      mappingRows: [],
    };
  }
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

async function safeDatabaseSnapshot(): Promise<DatabaseSnapshotResult> {
  try {
    return { snapshot: await databaseSnapshot(), error: null };
  } catch {
    return { snapshot: null, error: "database_snapshot_unavailable" };
  }
}

function tableText(snapshot: DatabaseSnapshot | null) {
  return snapshot
    ? Object.entries(snapshot).map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "UNAVAILABLE";
}

function familyMappingRows(group: FamilyGroup) {
  const rows = group.members.flatMap((member) => member.mappingRows);
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function familyMembers(group: FamilyGroup) {
  return group.members.map((member) => member.metadata.title).join(", ");
}

function familyTable(groups: readonly FamilyGroup[]) {
  return groups.map((group) => {
    const mappingRequired = group.members.some((member) => member.comparison?.mappingRequired);
    const parserChanges = unique(group.members.map((member) => member.parserStrategy)).join(", ");
    const representative = group.representative.comparison;
    const difference = representative?.evidence.join(" ") ?? "Canonical family.";
    return `| ${group.name} | ${group.members.length} | ${markdownCell(familyMembers(group))} | ${markdownCell(difference)} | ${mappingRequired ? "YES" : "NO"} | ${parserChanges} |`;
  }).join("\n");
}

function targetTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) => {
    const identity = audit.identity.status;
    const mapping = audit.comparison?.mappingStatus ?? "NEEDS_REVIEW";
    return `| ${audit.metadata.title} | ${audit.family} | ${audit.dateAudit.status} | ${identity} | ${mapping} | ${audit.importability} | ${audit.risk} |`;
  }).join("\n");
}

function targetInventory(audits: readonly TargetAudit[]) {
  return audits.map((audit) =>
    `| ${audit.metadata.title} | ${audit.monthLabel} | ${audit.year} | ${audit.metadata.rowCount ?? "?"} x ${audit.metadata.columnCount ?? "?"} | ${audit.rawStats.sourceRows} x ${audit.rawStats.maxSourceColumns} | ${detectedRange(audit.parsed)} | ${audit.readStatus} |`,
  ).join("\n");
}

function canonicalReference(canonical: TargetAudit | null) {
  if (!canonical?.parsed || !canonical.plan || !canonical.schema) return "Canonical read unavailable; resolution is BLOCKED.";
  const structure = canonical.parsed.structures[0];
  const tables = canonical.parsed.tables.map((table) => `${table.kind} ${table.startRow}:${table.endRow}/${columnLetter(table.startColumn)}:${columnLetter(table.endColumn)}`).join("; ");
  return `| Worksheet | ${canonical.metadata.title} |
| Sheet ID | ${canonical.metadata.sheetId} |
| Range requested | ${DYNAMIC_SCAN_RANGE} |
| Detected range | ${detectedRange(canonical.parsed)} |
| Metadata dimensions | ${canonical.metadata.rowCount ?? "?"} rows x ${canonical.metadata.columnCount ?? "?"} columns |
| Observed dimensions | ${canonical.rawStats.sourceRows} rows x ${canonical.rawStats.maxSourceColumns} columns |
| Header rows | ${structure?.headerRows.join(", ") || "UNKNOWN"} |
| Data rows | ${structure?.dataRows.length ?? 0} |
| Date column | ${structure?.dateColumn ? `${columnLetter(structure.dateColumn)} / column ${structure.dateColumn}` : "UNKNOWN"} |
| Date range | ${canonical.dateAudit.range} |
| Blocks | ${markdownCell(tables || "none")} |
| Unit blocks | ${canonical.units.join(", ") || "UNKNOWN"} |
| Supplier headers | ${markdownCell(canonical.detectedSupplierHeaders.join(", ") || "UNKNOWN")} |
| Parser | EXISTING_PARSER_SUFFICIENT |
| Schema hash prefix | ${canonical.schema.hash.slice(0, 12)} |
| Plan status | ${canonical.plan.status} |
| Plan summary | ${JSON.stringify(canonical.plan.summary)} |
| Official target | ${canonical.targetValue ?? "UNKNOWN"} ton (${canonical.targetSource ?? "UNKNOWN"}) |
| Normalization | existing semantic parser; Unit 1-3 ordered-block rule; seven supplier identities |
| Validation | parser diagnostics, daily paths, supplier identity, 70.020 ton target, source-key/content-hash checks |`;
}

function fieldMappingTable(groups: readonly FamilyGroup[]) {
  return groups.map((group) => {
    const rows = familyMappingRows(group);
    const body = rows.length
      ? rows.map((row) => `| ${markdownCell(row.sourceHeader)} | ${row.canonicalField} | ${row.databaseField} | ${markdownCell(row.transformation)} | ${row.confidence} |`).join("\n")
      : "| No mapping evidence | UNRESOLVED | NO_DIRECT_DATABASE_TARGET | manual review | LOW |";
    return `### ${group.name}

Members: ${markdownCell(familyMembers(group))}

| Source Header | Canonical Field | Database Field | Transformation | Confidence |
| --- | --- | --- | --- | --- |
${body}`;
  }).join("\n\n");
}

function dateTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) => {
    const issue = audit.dateAudit.issues.join(" ") || "PASS";
    return `| ${audit.metadata.title} | ${audit.year}-${String(audit.month).padStart(2, "0")} | ${audit.dateAudit.range} | ${audit.dateAudit.formats.join(", ") || "UNKNOWN"} | ${audit.dateAudit.duplicateDates.join(", ") || "none"} | ${markdownCell(issue)} |`;
  }).join("\n");
}

function identityTable(groups: readonly FamilyGroup[]) {
  return groups.map((group) => {
    const identity = group.representative.identity;
    return `| ${group.name} | ${identity.status} | ${identity.sourceKey} | ${identity.businessKey} | ${identity.contentHash} | ${identity.uniqueDimensions} | ${identity.samplePrefixes.join(", ")} |`;
  }).join("\n");
}

function duplicateTable(audits: readonly TargetAudit[]) {
  const focused = audits.filter((audit) => ["Juni23-BB", "September25-BB"].includes(audit.metadata.title));
  const rows = focused.flatMap((audit) => audit.duplicateEvidence.map((item) =>
    `| ${audit.metadata.title} | ${item.sourceKeyPrefix} | ${markdownCell(item.businessKey)} | ${item.entity} | ${item.date} | ${item.unit} | ${item.supplier} | ${item.domain} | ${item.quantity} | ${markdownCell(item.block)} | ${item.sourceRows} | ${item.contentHashPrefixes} | ${item.classification} |`,
  ));
  return rows.join("\n") || "| None | - | - | - | - | - | - | - | - | - | - | - | UNKNOWN |";
}

function supplierTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) =>
    `| ${audit.metadata.title} | ${markdownCell(audit.detectedSupplierHeaders.join("; ") || "UNKNOWN")} | ${markdownCell(audit.suppliers.join("; ") || "UNKNOWN")} | ${audit.missingSupplierCodes.join(", ") || "none"} | ${markdownCell(audit.supplierNotes.join(" ") || "No issue detected.")} |`,
  ).join("\n");
}

function unitTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) =>
    `| ${audit.metadata.title} | ${audit.units.join(", ") || "UNKNOWN"} | ${markdownCell(audit.unitNotes.join(" ") || "No unit anomaly detected.")} | ${audit.units.join(",") === "Unit 1,Unit 2,Unit 3" ? "HIGH" : "NEEDS_REVIEW"} |`,
  ).join("\n");
}

function targetBiomassTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) =>
    `| ${audit.metadata.title} | ${audit.targetValue ?? "UNKNOWN"} | ${audit.targetClassification} | ${audit.targetReview ? "NEEDS_REVIEW" : "PASS"} | ${audit.targetSource ?? "UNKNOWN"} |`,
  ).join("\n");
}

function importabilityTable(audits: readonly TargetAudit[]) {
  return audits.map((audit) =>
    `| ${audit.metadata.title} | ${audit.importability} | ${audit.family} | ${markdownCell(audit.plan?.blockingIssues.join(", ") || "none")} |`,
  ).join("\n");
}

function parserTable(groups: readonly FamilyGroup[]) {
  return groups.map((group) =>
    `| ${group.name} | ${markdownCell(familyMembers(group))} | ${unique(group.members.map((member) => member.parserStrategy)).join(", ")} | ${markdownCell(unique(group.members.flatMap((member) => member.comparison?.evidence ?? [])).join(" ") || "- ")} |`,
  ).join("\n");
}

function riskTable(audits: readonly TargetAudit[]) {
  const risks = new Map<string, { level: RiskLevel; evidence: string[]; recommendation: string }>();
  const add = (key: string, level: RiskLevel, evidence: string, recommendation: string) => {
    const previous = risks.get(key);
    risks.set(key, {
      level: previous?.level === "HIGH" || level === "HIGH" ? "HIGH" : previous?.level === "MEDIUM" || level === "MEDIUM" ? "MEDIUM" : "LOW",
      evidence: unique([...(previous?.evidence ?? []), evidence]),
      recommendation,
    });
  };
  const dateIssues = audits.filter((audit) => audit.dateAudit.status === "INVALID_DATE" || audit.dateAudit.status === "DATE_PERIOD_MISMATCH");
  if (dateIssues.length) add("DATE", "HIGH", `${dateIssues.map((audit) => audit.metadata.title).join(", ")} contain invalid or mismatched dates.`, "Preserve source values and require source-owner decision before import.");
  const duplicateSheets = audits.filter((audit) => audit.duplicateEvidence.length);
  if (duplicateSheets.length) add("IDENTITY", "HIGH", `${duplicateSheets.map((audit) => audit.metadata.title).join(", ")} contain duplicate identity groups.`, "Do not delete/merge automatically; resolve source key/business key with owner approval.");
  const ambiguous = audits.filter((audit) => audit.parsed?.diagnostics.ambiguous.length || audit.comparison?.mappingRequired);
  if (ambiguous.length) add("SCHEMA", "HIGH", `${ambiguous.length} legacy worksheets need explicit field mapping or parser review.`, "Approve mapping per schema family and re-run dry-run.");
  const biomassStock = audits.filter((audit) => audit.mappingRows.some((row) => row.canonicalField === "biomassStock.closingStock"));
  if (biomassStock.length) add("BIOMASS_STOCK", "HIGH", `${biomassStock.length} BB worksheet(s) contain biomass stock fields without an existing database target.`, "Keep biomass stock out of import until a target model/table and business identity are explicitly approved.");
  const unavailableMetadata = audits.filter((audit) => audit.rawStats.formulaLikeCells > 0);
  if (unavailableMetadata.length) add("FORMULA", "MEDIUM", "Values endpoint cannot prove formula lineage; formula-like literals were observed in source values.", "Use a separately approved metadata read if formula provenance is required.");
  add("MERGED_CELLS", "MEDIUM", "Merged-cell metadata is not exposed by the existing values-only reader.", "Do not infer merged structure from blank cells; obtain explicit spreadsheet metadata before relying on merges.");
  if (!risks.size) return "| LOW | No material risk found | Continue with dry-run |";
  return [...risks.entries()].map(([key, value]) => `| ${value.level} | ${key}: ${markdownCell(value.evidence.join(" "))} | ${markdownCell(value.recommendation)} |`).join("\n");
}

function manualDecisionTable(audits: readonly TargetAudit[], groups: readonly FamilyGroup[]) {
  const rows: string[] = [];
  for (const group of groups.filter((group) => group.name !== "CANONICAL_FAMILY")) {
    const members = familyMembers(group);
    rows.push(`| ${markdownCell(members)} | Schema family/mapping | ${markdownCell(group.members[0]?.comparison?.evidence.join(" ") || "Legacy structure differs from canonical.")} | Preserve distinct family until mapping is approved. | ${markdownCell(group.members[0]?.comparison?.evidence.join(" ") || "Field and semantic confirmation required.")} | ${group.members[0]?.risk ?? "HIGH"} |`);
  }
  for (const audit of audits.filter((audit) => audit.dateAudit.status !== "PASS")) {
    rows.push(`| ${audit.metadata.title} | Date semantics | ${markdownCell(audit.dateAudit.issues.join(" "))} | Preserve source date; classify as ${audit.dateAudit.status}; do not shift/delete automatically. | Day/date interpretation and import policy. | HIGH |`);
  }
  for (const title of ["Juni23-BB", "September25-BB"]) {
    const audit = audits.find((candidate) => candidate.metadata.title === title);
    if (audit?.duplicateEvidence.length)
      rows.push(`| ${title} | Duplicate/identity resolution | ${audit.duplicateEvidence.length} identity group(s); classifications: ${unique(audit.duplicateEvidence.map((item) => item.classification)).join(", ")}. | Retain both source rows; no automatic merge/delete. | Owner must confirm business key, block, and canonical row selection. | HIGH |`);
  }
  const legacy = audits.filter((audit) => audit.metadata.title !== CANONICAL_WORKSHEET);
  rows.push(`| ${markdownCell(legacy.map((audit) => audit.metadata.title).join(", "))} | Biomassa target | Canonical official target is ${OFFICIAL_BIOMASS_TARGET.toLocaleString("id-ID")} ton; legacy target is missing or not proven equal. | Keep historical target/UNKNOWN separate; never overwrite with current target. | Historical vs current/calculated target classification. | HIGH |`);
  const supplierReview = audits.filter((audit) => audit.missingSupplierCodes.length);
  if (supplierReview.length)
    rows.push(`| ${markdownCell(supplierReview.map((audit) => audit.metadata.title).join(", "))} | Supplier identity | Canonical supplier codes missing from existing parser evidence. | Confirm renamed/abbreviated supplier mapping per family before import. | Supplier identity and receipt aggregation. | HIGH |`);
  const biomassStock = audits.filter((audit) => audit.mappingRows.some((row) => row.canonicalField === "biomassStock.closingStock"));
  if (biomassStock.length)
    rows.push(`| ${markdownCell(biomassStock.map((audit) => audit.metadata.title).join(", "))} | Database target for biomass stock | Biomass stock fields are present, but no existing Prisma model/PostgreSQL table represents them. | Do not add a schema or import biomass stock automatically; decide whether full persistence is required. | Approve NEW_SCHEMA_REQUIRED target design or explicitly exclude the field from the supported import scope. | HIGH |`);
  return rows.join("\n") || "| None | - | - | - | - | LOW |";
}

function databaseTargetTable() {
  return DATABASE_TARGETS.map((target) =>
    `| ${target.domain} | ${target.canonicalField} | ${target.prismaModel} | ${target.table} | ${target.fields} | ${target.relation} |`,
  ).join("\n");
}

function dateIssueSummary(audits: readonly TargetAudit[]) {
  return ["Juni25-BB", "November25-BB", "Februari26-BB", "April26-BB", "Juni26-BB"].map((title) => {
    const audit = audits.find((candidate) => candidate.metadata.title === title);
    return `- **${title}:** ${audit ? `${audit.dateAudit.status}; ${audit.dateAudit.issues.join(" ") || "no issue detected"}` : "not present in target inventory"}`;
  }).join("\n");
}

function reportFor(
  metadata: readonly GoogleSheetsWorksheetMetadata[],
  audits: readonly TargetAudit[],
  groups: readonly FamilyGroup[],
  canonical: TargetAudit | null,
  before: DatabaseSnapshotResult,
  after: DatabaseSnapshotResult,
) {
  const legacy = audits.filter((audit) => audit.metadata.title !== CANONICAL_WORKSHEET);
  const readFailures = audits.filter((audit) => audit.readStatus !== "READ");
  const snapshotStable = Boolean(before.snapshot && after.snapshot && JSON.stringify(before.snapshot) === JSON.stringify(after.snapshot));
  const baselineOk = metadata.length >= EXPECTED_TARGET_COUNT && audits.length === EXPECTED_TARGET_COUNT && legacy.length === EXPECTED_LEGACY_COUNT;
  const blocked = !canonical || readFailures.length > 0 || !before.snapshot || !after.snapshot || !snapshotStable || !baselineOk;
  const canonicalImportability = canonical?.importability ?? "UNAVAILABLE";
  const manualReview = legacy.filter((audit) => audit.importability === "NEEDS_MANUAL_REVIEW").length;
  const importReady = legacy.filter((audit) => audit.importability === "IMPORT_READY").length;
  const afterMapping = legacy.filter((audit) => audit.importability === "IMPORT_AFTER_MAPPING").length;
  const doNotImport = legacy.filter((audit) => audit.importability === "DO_NOT_IMPORT").length;
  const status = blocked ? "BB LEGACY RESOLUTION -- BLOCKED" : manualReview ? "BB LEGACY RESOLUTION -- PASS WITH REVIEW" : "BB LEGACY RESOLUTION -- PASS";
  return `# BB Legacy Resolution Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **${status}**

## Executive Summary

Phase 11E membaca canonical **${CANONICAL_WORKSHEET}** dan seluruh worksheet BB legacy yang memenuhi strict pattern. Non-BB worksheet tidak dibaca untuk mapping database pada fase ini. Juli26-BB dipakai sebagai canonical schema/reference; nilai numerik tidak disalin ke periode lain.

Baseline observed: metadata **${metadata.length}**, target BB **${audits.length}**, legacy target **${legacy.length}**, read failures **${readFailures.length}**, database snapshot stable **${snapshotStable ? "YES" : "NO"}**. Database writes: **0**.

Canonical importability: **${canonicalImportability}**. Legacy-only import result: IMPORT_READY **${importReady}**, IMPORT_AFTER_MAPPING **${afterMapping}**, NEEDS_MANUAL_REVIEW **${manualReview}**, DO_NOT_IMPORT **${doNotImport}**. No import was performed.

## Business Rule

Only worksheet names matching **[Bulan][2 digit year]-BB** are BB database sources. Valid month names are Januari through Desember, year is exactly two digits, and suffix is exactly **-BB**. All other worksheets are **NON_DATABASE_SOURCE** and are outside this phase.

## Canonical Reference

${canonicalReference(canonical)}

Approved canonical behavior: Google API read PASS, parser PASS, dry-run PASS, controlled import PASS, 352 rows, rejected 0, duplicate 0, orphan 0, and re-import INSERT 0 / UPDATE 0 / SKIP 352 / FAILED 0. These facts are regression references only.

## Target Worksheet Inventory

| Worksheet | Schema Family | Date Status | Identity | Mapping | Importability | Risk |
| --- | --- | --- | --- | --- | --- | --- |
${targetTable(audits)}

Detailed read inventory:

| Worksheet | Month | Year | Metadata dimensions | Observed dimensions | Detected range | Read status |
| --- | --- | ---: | --- | --- | --- | --- |
${targetInventory(audits)}

## Schema Families

Family assignment uses semantic resource/unit/total/stock/HOP/date profiles, table kinds, header tokens, and parser shape. It is not based on year alone.

| Family | Worksheet Count | Members | Difference from Juli26-BB | Mapping Required | Parser Change |
| --- | ---: | --- | --- | --- | --- |
${familyTable(groups)}

## Field Mapping

The following are proposed mappings for resolution. They are not implemented and are not import instructions.

${fieldMappingTable(groups)}

## Date Validation

Date validation distinguishes formatting from semantic period mismatch and impossible calendar dates. Source dates were not changed.

| Worksheet | Expected Period | Detected Range | Format(s) | Duplicate Dates | Validation Evidence |
| --- | --- | --- | --- | --- | --- |
${dateTable(audits)}

Focused date review:

${dateIssueSummary(audits)}

Decision rule: a date from another month/year is **DATE_PERIOD_MISMATCH**; an impossible calendar day is **INVALID_DATE**. Neither is shifted, deleted, or assigned to a different worksheet automatically. A semantically valid ISO/day-month representation with a different physical format is **DATE_FORMAT_DIFFERENCE**.

## Identity Strategy

| Family | Status | Existing Source Key | Business Key | Composite Key | Content Hash | Unique Dimensions | Sample Key Prefixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
${identityTable(groups)}

Permanent identity excludes Google Sheets row number and cell address. Existing Unit normalization remains Unit 1, Unit 2, Unit 3; the ordered duplicate Unit 2 rule remains a proposed interpretation only.

## Duplicate Analysis

Mandatory focus: **Juni23-BB** and **September25-BB**. Source key, business key, date, unit, supplier, domain, quantity, block, source rows, and content hash evidence are listed below.

| Worksheet | Source Key | Business Key | Entity | Date | Unit | Supplier | Domain | Quantity | Block | Source Rows | Content Hash | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${duplicateTable(audits)}

TRUE_DUPLICATE means same business identity and same normalized content hash. BUSINESS_KEY_COLLISION means same identity with conflicting content. IDENTITY_DESIGN_ERROR, LEGACY_IDENTITY, and UNKNOWN remain manual decisions. No duplicate was deleted, merged, updated, or imported.

## Historical Semantics

| Worksheet | Classification | Evidence | Rule |
| --- | --- | --- | --- |
${audits.map((audit) => `| ${audit.metadata.title} | ${audit.semantics} | ${audit.plan?.summary.dailyRows ?? 0} daily rows; ${audit.plan?.summary.totalRows ?? 0} staged rows; target ${audit.targetClassification} | Historical values remain historical; no current value substitution. |`).join("\n")}

## Target Biomassa

Official current target: **70.020 ton**. Legacy values are never overwritten.

| Worksheet | Detected Value | Classification | Review | Source |
| --- | ---: | --- | --- | --- |
${targetBiomassTable(audits)}

Only an exact 70.020 ton value is classified CURRENT_TARGET. Missing or ambiguous legacy values remain UNKNOWN/NEEDS_REVIEW; historical or calculated values must be explicitly classified by the source owner.

## Unit Mapping

Canonical units are Unit 1, Unit 2, Unit 3.

| Worksheet | Detected Units | Notes | Confidence |
| --- | --- | --- | --- |
${unitTable(audits)}

## Supplier Mapping

Canonical supplier identities are the seven supplier codes resolved by Juli26-BB. Legacy names are not auto-renamed.

| Worksheet | Detected Supplier Headers | Parser Supplier Rows | Missing Canonical Codes | Notes |
| --- | --- | --- | --- | --- |
${supplierTable(audits)}

## Database Mapping

| Domain | Canonical Field | Existing Prisma Model | Existing PostgreSQL Table | Fields | Relationship |
| --- | --- | --- | --- | --- | --- |
${databaseTargetTable()}

No new table was created. **BIOMASS_STOCK** is a documented target gap: the source field is observed, but no existing Prisma model/PostgreSQL table represents it. Persisting that domain is **NEW_SCHEMA_REQUIRED_IF_BIOMASS_STOCK_MUST_BE_PERSISTED** and requires manual approval; it does not block the already approved canonical import plan because the current import plan does not persist biomass stock, but it blocks full-field parity. Unresolved legacy semantics remain unmapped until approved.

## Importability

| Worksheet | Eligibility | Schema Family | Existing Plan Issues |
| --- | --- | --- | --- |
${importabilityTable(audits)}

Criteria: IMPORT_READY requires clear schema, mapping, identity, valid dates, and valid critical fields. IMPORT_AFTER_MAPPING is reserved for understandable schemas awaiting a mapping profile. NEEDS_MANUAL_REVIEW covers critical ambiguity, identity conflict, date ambiguity, and business semantic ambiguity. No target was classified DO_NOT_IMPORT solely because of a parser failure.

## Parser Strategy

No parser was changed.

| Family | Members | Strategy | Evidence |
| --- | --- | --- | --- |
${parserTable(groups)}

Priority remains existing parser -> mapping profile -> parser extension -> new parser only if unavoidable.

## Risk Assessment

| Level | Risk/Evidence | Recommendation |
| --- | --- | --- |
${riskTable(audits)}

## Manual Decisions

| Worksheet | Issue | Evidence | Recommended Decision | Decision Required | Risk |
| --- | --- | --- | --- | --- | --- |
${manualDecisionTable(audits, groups)}

The recommendations preserve source data and defer decisions where evidence is insufficient. No final historical mapping was selected automatically.

## Recommended Implementation Sequence

1. **11E.1** Approve the canonical mapping profile from Juli26-BB.
2. **11E.2** Approve each legacy schema family and its field mapping.
3. **11E.3** Resolve supplier aliases and Unit 1-3 semantics.
4. **11E.4** Resolve invalid/mismatched dates without silently shifting source rows.
5. **11E.5** Approve source/business identity and content-hash policy.
6. **11E.6** Resolve Juni23-BB and September25-BB duplicate/collision decisions.
7. **11E.7** Implement only the approved mapping/parser extension in a later phase.
8. **11E.8** Run a complete dry-run and compare expected output.
9. **11E.9** Execute controlled import only after explicit approval.

## Database Safety

This phase is read-only. No INSERT, UPDATE, DELETE, DROP, TRUNCATE, reset, Prisma migration, Prisma db push/pull, import, synchronization write, Google Sheets write, credential change, environment change, Prisma schema change, Laravel change, Supabase change, or deployment was performed.

Database snapshot before:

${tableText(before.snapshot)}

Database snapshot after:

${tableText(after.snapshot)}

- Database writes: **0**
- Destructive operations: **NONE**
- Snapshot stable: **${snapshotStable ? "YES" : "NO / UNVERIFIED"}**
- Snapshot errors: **${[before.error, after.error].filter(Boolean).join(", ") || "none"}**

## Final Status

| Metric | Result |
| --- | ---: |
| Total worksheets metadata | ${metadata.length} |
| BB target worksheets | ${audits.length} |
| Legacy worksheets | ${legacy.length} |
| Canonical | ${canonical ? "READ" : "UNAVAILABLE"} |
| Read failures | ${readFailures.length} |
| Canonical importability | ${canonicalImportability} |
| Legacy import ready | ${importReady} |
| Legacy import after mapping | ${afterMapping} |
| Legacy manual review | ${manualReview} |
| Legacy do not import | ${doNotImport} |
| Database writes | 0 |

Final status: **${status}**.

Phase 11E stops here. **Do not import. Do not change the database, Prisma schema, parser, production code, or deployment.**
`;
}

async function main() {
  const metadata = await listGoogleSheetsWorksheets();
  const targetMetadata = metadata
    .filter((item) => parseBBWorksheetName(item.title))
    .sort((left, right) =>
      (left.title === CANONICAL_WORKSHEET ? -1 : 0) - (right.title === CANONICAL_WORKSHEET ? -1 : 0) ||
      (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    );
  const before = await safeDatabaseSnapshot();
  const audits: TargetAudit[] = [];
  for (const [index, item] of targetMetadata.entries()) {
    const audit = await readAudit(item);
    audits.push(audit);
    console.log(`BB legacy resolution progress: ${index + 1}/${targetMetadata.length}`);
  }
  const canonical = audits.find((audit) => audit.metadata.title === CANONICAL_WORKSHEET) ?? null;
  const groups = assignFamilies(audits, canonical);
  for (const audit of audits) {
    audit.comparison = schemaComparison(canonical, audit);
    audit.identity = identityProfile(audit.plan, audit.family);
    audit.semantics = semanticsFor(audit);
    audit.parserStrategy = parserStrategyFor(audit);
    audit.importability = importabilityFor(audit);
    audit.risk = riskFor(audit);
  }
  const after = await safeDatabaseSnapshot();
  const report = reportFor(metadata, audits, groups, canonical, before, after);
  if (process.argv.includes("--write-report")) await writeFile(REPORT_PATH, report, "utf8");
  const legacy = audits.filter((audit) => audit.metadata.title !== CANONICAL_WORKSHEET);
  const readFailures = audits.filter((audit) => audit.readStatus !== "READ");
  const snapshotStable = Boolean(before.snapshot && after.snapshot && JSON.stringify(before.snapshot) === JSON.stringify(after.snapshot));
  const baselineOk = audits.length === EXPECTED_TARGET_COUNT && legacy.length === EXPECTED_LEGACY_COUNT;
  console.log(JSON.stringify({
    status: !canonical || readFailures.length || !snapshotStable || !baselineOk
      ? "BLOCKED"
      : legacy.some((audit) => audit.importability === "NEEDS_MANUAL_REVIEW")
        ? "PASS_WITH_REVIEW"
        : "PASS",
    mode: "bb-legacy-resolution-read-only",
    worksheetCount: metadata.length,
    targetWorksheetCount: audits.length,
    legacyWorksheetCount: legacy.length,
    canonicalWorksheet: CANONICAL_WORKSHEET,
    readFailures: readFailures.length,
    databaseWrites: 0,
    databaseSnapshotStable: snapshotStable,
    baselineOk,
    schemaFamilies: Object.fromEntries(groups.map((group) => [group.name, group.members.length])),
    importability: Object.fromEntries(unique(audits.map((audit) => audit.importability)).map((value) => [value, audits.filter((audit) => audit.importability === value).length])),
    dateIssues: audits.filter((audit) => audit.dateAudit.status !== "PASS").map((audit) => ({ worksheet: audit.metadata.title, status: audit.dateAudit.status })),
    duplicateFocus: ["Juni23-BB", "September25-BB"],
    reportWritten: process.argv.includes("--write-report"),
  }));
}

main()
  .catch((error) => {
    console.error("BB legacy resolution audit failed.");
    console.error(`Category: ${safeErrorCategory(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
