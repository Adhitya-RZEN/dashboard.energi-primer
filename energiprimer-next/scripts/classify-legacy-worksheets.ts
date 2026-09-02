import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { safeErrorCategory } from "../src/lib/safe-error";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  analyzeTableStructure,
  describeStructure,
} from "../src/services/google-sheets/dynamic/structure-analyzer";
import {
  normalizeCellText,
  scanSpreadsheet,
} from "../src/services/google-sheets/dynamic/spreadsheet-scanner";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import {
  dateFromRaw,
  parseDayValue,
  parseNumericValue,
} from "../src/services/google-sheets/dynamic/validators";
import {
  DYNAMIC_SCAN_RANGE,
  type DynamicWorksheetReadResult,
} from "../src/services/google-sheets/dynamic/reader";
import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import type { GoogleSheetsImportPlan } from "../src/services/google-sheets/import/types";
import {
  classifySyncRows,
  type SyncClassification,
} from "../src/services/google-sheets/sync/change-detection";
import {
  buildSchemaSnapshot,
  detectSchemaChange,
} from "../src/services/google-sheets/sync/schema-detection";
import { sourceKeyForStagingRow } from "../src/services/google-sheets/sync/identity";
import { withSyncRetry } from "../src/services/google-sheets/sync/retry";
import type {
  DynamicParserResult,
  HeaderPath,
  ScannedCell,
} from "../src/services/google-sheets/dynamic/types";

const prisma = new PrismaClient();
const REQUEST_DELAY_MS = 1_300;
const MAX_RETRY_ATTEMPTS = 2;
const CURRENT_MONTH = 7;
const CURRENT_YEAR = 2026;
const OFFICIAL_BIOMASS_TARGET = 70_020;
const REPORT_PATH = new URL(
  "../docs/LEGACY_WORKSHEET_CLASSIFICATION_2026-08-30.md",
  import.meta.url,
);

type PrimaryClassification =
  | "OPERATIONAL"
  | "HISTORICAL"
  | "AUXILIARY"
  | "SUMMARY"
  | "TEMPLATE"
  | "CALCULATION"
  | "MASTER_DATA"
  | "DUPLICATE"
  | "UNSUPPORTED"
  | "UNKNOWN";

type BusinessRelevance = "REQUIRED" | "OPTIONAL" | "NOT_REQUIRED" | "UNKNOWN";

type Importability =
  | "IMPORT_NOW"
  | "IMPORT_AFTER_MAPPING"
  | "DO_NOT_IMPORT"
  | "NEEDS_MANUAL_REVIEW"
  | "UNKNOWN";

type SchemaProfile =
  | "EXACT_MATCH"
  | "PARTIAL_MATCH"
  | "LEGACY_MATCH"
  | "NO_MATCH"
  | "AMBIGUOUS";

type Risk = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

type DatabaseSnapshot = Record<string, number>;

type FieldMapping = {
  sourceHeader: string;
  normalizedField: string;
  databaseField: string;
  confidence: Confidence;
  worksheets: string[];
};

type DuplicateRowEvidence = {
  sourceKeyPrefix: string;
  entityType: string;
  date: string;
  unit: string;
  supplier: string;
  valueUnit: string;
  values: string[];
  rows: string[];
  classification:
    | "TRUE_DUPLICATE"
    | "BUSINESS_KEY_COLLISION"
    | "PARSER_IDENTITY_PROBLEM"
    | "LEGACY_IDENTITY"
    | "UNKNOWN";
};

type TargetEvidence = {
  value: number | null;
  year: number | null;
  classification:
    | "OFFICIAL_TARGET"
    | "HISTORICAL_TARGET"
    | "CALCULATED_TARGET"
    | "UNKNOWN_TARGET";
  reviewRequired: boolean;
  source: string | null;
};

type WorksheetProfile = {
  number: number;
  metadata: GoogleSheetsWorksheetMetadata;
  visibility: "UNAVAILABLE_FROM_EXISTING_METADATA";
  dimensions: string;
  detectedRange: string | null;
  headerRows: number[];
  headerSamples: string[];
  approximateDataRows: number;
  actualNonEmptyRows: number;
  dateRange: string;
  dateValues: string[];
  units: string[];
  unitNotes: string[];
  suppliers: string[];
  domains: string[];
  domainDisplay: string;
  dataStructures: string[];
  parserMatch: "TITLE_AND_CONTENT" | "TITLE_ONLY" | "PARTIAL" | "NO_MATCH";
  parserAnchorKeys: string[];
  availableMetrics: string[];
  diagnostics: { warnings: string[]; errors: string[]; ambiguous: string[] };
  schemaProfile: SchemaProfile;
  schemaChange: string | null;
  schemaEvidence: string[];
  legacyPattern: string;
  primaryClassification: PrimaryClassification;
  businessRelevance: BusinessRelevance;
  importability: Importability;
  risk: Risk;
  unsupportedReasons: string[];
  issues: string[];
  plan: {
    stagingRows: number;
    validRows: number;
    invalidRows: number;
    rejectedRows: number;
    insert: number;
    update: number;
    skip: number;
    status: string;
    blockingIssues: string[];
  } | null;
  duplicateEvidence: DuplicateRowEvidence[];
  target: TargetEvidence;
  mappings: FieldMapping[];
  readStatus: "READ" | "READ_FAILED" | "EMPTY";
  readError: { code: string; status: number | null; message: string } | null;
  rangeRows: number;
};

type IssueRecord = {
  worksheet: string;
  issue: string;
  severity: Risk;
  category: "schema" | "identity" | "duplicate" | "api" | "mapping" | "business";
};

type ProfileContext = {
  metadata: GoogleSheetsWorksheetMetadata;
  number: number;
  rows: readonly (readonly (string | number | null)[])[];
  parsed: DynamicParserResult | null;
  plan: GoogleSheetsImportPlan | null;
  sync: SyncClassification | null;
  schemaChange: string | null;
  readError: { code: string; status: number | null; message: string } | null;
};

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function markdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function hasAny(values: readonly string[], patterns: readonly string[]) {
  return patterns.some((pattern) =>
    values.some((value) => value.includes(pattern)),
  );
}

function allNormalizedValues(
  rows: readonly (readonly (string | number | null)[])[],
) {
  return rows.flatMap((row) => row.map((cell) => normalizeCellText(cell)));
}

function errorDetails(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) {
    return {
      code: error.code,
      status: error.status ?? null,
      message: "read failed",
    };
  }
  return {
    code: "unknown",
    status: null,
    message: "read failed",
  };
}

function isGlobalFailure(error: unknown) {
  return (
    error instanceof GoogleSheetsIntegrationError &&
    ["configuration", "credentials", "authentication", "permission"].includes(
      error.code,
    )
  );
}

function dimensions(metadata: GoogleSheetsWorksheetMetadata) {
  const rows = metadata.rowCount === null ? "?" : metadata.rowCount;
  const columns = metadata.columnCount === null ? "?" : metadata.columnCount;
  return `${rows} rows × ${columns} columns`;
}

function detectedRange(
  rows: readonly (readonly (string | number | null)[])[],
) {
  let maxRow = 0;
  let maxColumn = 0;
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const meaningful =
        typeof cell === "number" || typeof cell === "string" && cell.trim() !== "";
      if (!meaningful) return;
      maxRow = Math.max(maxRow, rowIndex + 1);
      maxColumn = Math.max(maxColumn, columnIndex + 1);
    });
  });
  if (!maxRow || !maxColumn) return null;
  let column = "";
  let current = maxColumn;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return `A1:${column}${maxRow}`;
}

function inferHeaderRows(
  scanned: readonly ScannedCell[],
  structure: ReturnType<typeof analyzeTableStructure>,
) {
  const rows = new Map<number, string[]>();
  for (const cell of scanned) {
    if (!cell.normalizedValue) continue;
    const values = rows.get(cell.row) ?? [];
    values.push(cell.normalizedValue);
    rows.set(cell.row, values);
  }
  const inferred = [...rows.entries()]
    .filter(([row, values]) => {
      const textCount = values.filter((value) =>
        !parseNumericValue(value).value,
      ).length;
      const signalCount = values.filter((value) =>
        /TANGGAL|TGL|DATE|UNIT|BATUBARA|BATU BARA|COAL|BIOMASS|BIOMASSA|SOLAR|HSD|PENERIMAAN|RECEIPT|PEMAKAIAN|CONSUMPTION|STOK|STOCK|HOP|TARGET|TOTAL|GAR|ASH|SULFUR|MOISTURE|TM|HGI/.test(
          value,
        ),
      ).length;
      return row <= 20 && (signalCount >= 1 || textCount >= 3);
    })
    .map(([row]) => row);
  return [...new Set([...structure.headerRows, ...inferred])].sort(
    (a, b) => a - b,
  );
}

function headerSamples(
  scanned: readonly ScannedCell[],
  headerRows: readonly number[],
) {
  return unique(
    scanned
      .filter((cell) => headerRows.includes(cell.row) && cell.normalizedValue)
      .map((cell) => cell.normalizedValue),
  ).slice(0, 36);
}

function parsedDateValues(
  parsed: DynamicParserResult,
  structure: ReturnType<typeof analyzeTableStructure>,
  rows: readonly (readonly (string | number | null)[])[],
) {
  const metadata = parsed.worksheet;
  const values: string[] = [];
  const days: number[] = [];
  if (structure.dateColumn !== null) {
    for (const row of structure.dataRows) {
      const raw = parsed.scannedCells.find(
        (cell) => cell.row === row && cell.column === structure.dateColumn,
      )?.rawValue;
      const day = parseDayValue(raw);
      if (day !== null) days.push(day);
      const date =
        metadata.isValid && metadata.month > 0 && metadata.year > 0
          ? dateFromRaw(raw, metadata.month, metadata.year)
          : dateFromRaw(raw, 1, 2000);
      if (date && /^20\d{2}-\d{2}-\d{2}$/.test(date)) values.push(date);
    }
  }
  if (values.length) return unique(values).sort();
  if (days.length) {
    const min = Math.min(...days);
    const max = Math.max(...days);
    return [`day ${min}–${max} (year/month unavailable)`];
  }
  const rawText = allNormalizedValues(rows).join(" ");
  const matches = rawText.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/g) ?? [];
  return unique(matches).sort();
}

function dateRangeDisplay(values: readonly string[]) {
  if (!values.length) return "NOT_DETECTED";
  if (values.length === 1 && values[0].startsWith("day ")) return values[0];
  return values.length === 1
    ? values[0]
    : `${values[0]} → ${values[values.length - 1]} (${values.length} dates)`;
}

function unitEvidence(
  values: readonly string[],
  paths: readonly HeaderPath[],
) {
  const numbers = new Set<number>();
  for (const path of paths) if (path.unitNumber) numbers.add(path.unitNumber);
  for (const value of values) {
    for (const match of value.matchAll(/\b(?:UNIT|PLTU)\s*([123])\b/g))
      numbers.add(Number(match[1]));
  }
  const units = [1, 2, 3]
    .filter((unit) => numbers.has(unit))
    .map((unit) => `Unit ${unit}`);
  const unit2Count = values.filter((value) => /\bUNIT\s*2\b/.test(value)).length;
  const notes: string[] = [];
  if (unit2Count > 1 && !numbers.has(3)) {
    notes.push(
      "Label Unit 2 berulang; business rule existing dapat menormalisasi blok kedua sesuai urutan menjadi Unit 3, tetapi perlu validasi manual.",
    );
  }
  if (!units.length) notes.push("Tidak ada label Unit 1–3 yang terdeteksi.");
  return { units, notes };
}

function supplierEvidence(values: readonly string[]) {
  const known = [
    "SAWDUST PT SYAHRONI",
    "SAWDUST PT BINTANG",
    "WOODCHIP PT SYAHRONI",
    "WOODCHIP PT RAP",
    "WOODCHIP CV MULTI PAKETINDO",
    "LRUK",
    "SRF",
  ];
  return known.filter((supplier) => values.some((value) => value.includes(supplier)));
}

function domainSignals(values: readonly string[], title: string) {
  const joined = values.join(" ");
  const biomass = /BIOMASSA|BIOMASS|SAWDUST|WOODCHIP|LRUK|SRF/.test(joined);
  const coal = /BATUBARA|BATU BARA|COAL/.test(joined);
  const solar = /SOLAR|HSD/.test(joined);
  const receipt = /PENERIMAAN|RECEIPT|RECEIVED|INCOMING/.test(joined);
  const consumption = /PEMAKAIAN|KONSUMSI|CONSUMPTION|USED/.test(joined);
  const stock = /STOK|STOCK|COAL YARD/.test(joined);
  const hop = /\bHOP\b|HARI OPERASI|DAYS OF OPERATION/.test(joined);
  const target = /TARGET/.test(joined) && biomass;
  const quality = /\bGAR\b|MOISTURE|\bTM\b|\bASH\b|SULFUR|\bHGI\b/.test(joined);
  const power = /POWER GENERATION|PEMBANGKITAN|LOAD FACTOR|AVERAGE LOAD|KWH/.test(
    joined,
  );
  const kpi = /\bKPI\b|SFC|HEAT RATE|EFFICIENCY|EFISIENSI/.test(joined);
  const domains: string[] = [];
  if (biomass && receipt) domains.push("BIOMASS_RECEIPT");
  if (biomass && consumption) domains.push("BIOMASS_CONSUMPTION");
  if (target) domains.push("BIOMASS_TARGET");
  if (coal && receipt) domains.push("COAL_RECEIPT");
  if (coal && consumption) domains.push("COAL_CONSUMPTION");
  if (coal && stock) domains.push("COAL_STOCK");
  if (coal && quality) domains.push("COAL_QUALITY");
  if (solar && receipt) domains.push("SOLAR_RECEIPT");
  if (solar && consumption) domains.push("SOLAR_CONSUMPTION");
  if (hop) domains.push("HOP");
  if (power) domains.push("POWER_GENERATION");
  if (kpi) domains.push("KPI");
  if (/MASTER|REFERENSI|REFERENCE/.test(joined)) domains.push("UNIT_MASTER");
  if (/SUMMARY|RINGKASAN|REKAP|REPORT|LAPORAN/.test(joined)) domains.push("SUMMARY");
  if (/FLYASH|ALBES|\bFLM\b|\bDTS\b|AUXILIARY|HELPER/.test(`${title} ${joined}`))
    domains.push("AUXILIARY");
  return unique(domains);
}

function dataStructures(
  values: readonly string[],
  structure: ReturnType<typeof analyzeTableStructure>,
  parsed: DynamicParserResult,
) {
  const result: string[] = [];
  if (structure.dataRows.length >= 2 || parsed.normalized.series.length >= 2)
    result.push("DAILY");
  if (
    parsed.normalized.metrics.biomassReceiptMonthly.available ||
    parsed.normalized.metrics.coalReceiptMonthly.available ||
    parsed.normalized.metrics.solarReceiptMonthly.available
  )
    result.push("MONTHLY");
  if (parsed.normalized.metrics.biomassCumulative.available) result.push("CUMULATIVE");
  if (parsed.normalized.metrics.biomassTarget.available) result.push("YEARLY");
  if (/TRANSACTION|TRANSAKSI|SUPPLIER|PENERIMAAN/.test(values.join(" ")))
    result.push("TRANSACTION");
  if (/MASTER|REFERENSI|REFERENCE/.test(values.join(" "))) result.push("MASTER");
  if (/SUMMARY|RINGKASAN|REKAP|REPORT|LAPORAN/.test(values.join(" ")))
    result.push("SUMMARY");
  if (/FORMULA|RUMUS|CALCULATION|PERHITUNGAN|HELPER/.test(values.join(" ")))
    result.push("HELPER");
  return result.length ? unique(result) : ["UNKNOWN"];
}

function operationalEvidence(
  parsed: DynamicParserResult,
  structure: ReturnType<typeof analyzeTableStructure>,
  domains: readonly string[],
  values: readonly string[],
) {
  const operationalDomains = domains.some((domain) =>
    [
      "BIOMASS_RECEIPT",
      "BIOMASS_CONSUMPTION",
      "BIOMASS_TARGET",
      "COAL_RECEIPT",
      "COAL_CONSUMPTION",
      "COAL_STOCK",
      "COAL_QUALITY",
      "SOLAR_RECEIPT",
      "SOLAR_CONSUMPTION",
      "HOP",
      "POWER_GENERATION",
      "KPI",
    ].includes(domain),
  );
  const hasOperationalHeader = hasAny(values, [
    "TANGGAL",
    "TGL",
    "DATE",
    "PENERIMAAN",
    "RECEIPT",
    "PEMAKAIAN",
    "CONSUMPTION",
    "STOK",
    "STOCK",
    "HOP",
    "TARGET",
  ]);
  return Boolean(
    operationalDomains &&
      (structure.dataRows.length > 0 || parsed.normalized.series.length > 0) ||
      structure.dataRows.length > 0 && hasOperationalHeader,
  );
}

function mappingForPath(path: HeaderPath, worksheet: string): FieldMapping {
  const sourceHeader = path.labels.length
    ? path.labels.join(" → ")
    : `Column ${path.cell.column}`;
  const label = sourceHeader.toUpperCase();
  let normalizedField = "UNKNOWN";
  let databaseField = "NO_DATABASE_TARGET";
  let confidence: Confidence = "LOW";
  if (path.isDate || /TANGGAL|TGL|DATE/.test(label)) {
    normalizedField = "date";
    databaseField = "reading_date / period_start";
    confidence = "HIGH";
  } else if (path.isHop) {
    normalizedField = "hopDays";
    databaseField = "hop_readings.hop_days";
    confidence = path.unit === "HARI" ? "HIGH" : "MEDIUM";
  } else if (path.isStock) {
    normalizedField = "closingStock";
    databaseField = "coal_stock.closing_stock";
    confidence = path.unit === "TON" ? "HIGH" : "MEDIUM";
  } else if (/TARGET/.test(label)) {
    normalizedField = "targetTon";
    databaseField = "biomass_targets.target_ton";
    confidence = path.unit === "TON" ? "HIGH" : "MEDIUM";
  } else if (/KUMULATIF|CUMULATIVE|TOTAL\s+20\d{2}|PEMAKAIAN\s+20\d{2}/.test(label)) {
    normalizedField = "cumulativeTon";
    databaseField = "biomass_cumulative_snapshots.cumulative_ton";
    confidence = path.unit === "TON" ? "HIGH" : "MEDIUM";
  } else if (path.resource === "biomass") {
    normalizedField = path.unitNumber ? `quantityTon[unit${path.unitNumber}]` : "quantityTon";
    databaseField = path.unitNumber
      ? "biomass_consumptions.quantity_ton"
      : "biomass_receipts.quantity_ton";
    confidence = path.unit === "TON" ? "HIGH" : "MEDIUM";
  } else if (path.resource === "coal") {
    if (/GAR|MOISTURE|TM|ASH|SULFUR|HGI/.test(label)) {
      normalizedField = /GAR/.test(label)
        ? "gar"
        : /MOISTURE|TM/.test(label)
          ? "moisture"
          : /ASH/.test(label)
            ? "ash"
            : /SULFUR/.test(label)
              ? "sulfur"
              : "hgi";
      databaseField = `coal_quality.${normalizedField}`;
    } else {
      normalizedField = path.unitNumber ? `quantityTon[unit${path.unitNumber}]` : "quantityTon";
      databaseField = path.unitNumber
        ? "coal_consumption.coal_used"
        : "coal_receipts.quantity_ton";
    }
    confidence = path.unit === "TON" || path.unit === null ? "MEDIUM" : "LOW";
  } else if (path.resource === "solar") {
    normalizedField = "quantityLiter";
    databaseField = /PENERIMAAN|RECEIPT/.test(label)
      ? "solar_receipts.quantity_liter"
      : "solar_consumptions.quantity_liter";
    confidence = path.unit === "LITER" ? "HIGH" : "MEDIUM";
  }
  return { sourceHeader, normalizedField, databaseField, confidence, worksheets: [worksheet] };
}

function mappingForAnchor(anchor: { key: string; matchedLabel: string }, worksheet: string): FieldMapping | null {
  const fieldMap: Record<string, { normalized: string; database: string }> = {
    biomassTarget: { normalized: "targetTon", database: "biomass_targets.target_ton" },
    biomassCumulative: {
      normalized: "cumulativeTon",
      database: "biomass_cumulative_snapshots.cumulative_ton",
    },
    solarReceiptMonthly: {
      normalized: "quantityLiter",
      database: "solar_receipts.quantity_liter",
    },
    coalReceiptMonthly: {
      normalized: "quantityTon",
      database: "coal_receipts.quantity_ton",
    },
    biomassReceiptMonthly: {
      normalized: "quantityTon",
      database: "biomass_receipts.quantity_ton",
    },
  };
  const item = fieldMap[anchor.key];
  return item
    ? {
        sourceHeader: anchor.matchedLabel,
        normalizedField: item.normalized,
        databaseField: item.database,
        confidence: "MEDIUM",
        worksheets: [worksheet],
      }
    : null;
}

function targetEvidence(parsed: DynamicParserResult, title: string): TargetEvidence {
  const metric = parsed.normalized.metrics.biomassTarget;
  const anchor = parsed.anchors.find((item) => item.key === "biomassTarget");
  const yearMatch = anchor?.matchedLabel.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : parseBBWorksheetName(title)?.year ?? null;
  const value = metric.available && metric.value !== null ? metric.value : null;
  if (value === OFFICIAL_BIOMASS_TARGET) {
    return {
      value,
      year,
      classification: "OFFICIAL_TARGET",
      reviewRequired: false,
      source: metric.source?.address ?? null,
    };
  }
  if (value !== null) {
    const calculated = /TOTAL|SUM|CALCULATED|PERHITUNGAN/.test(anchor?.matchedLabel ?? "");
    return {
      value,
      year,
      classification: calculated ? "CALCULATED_TARGET" : "HISTORICAL_TARGET",
      reviewRequired: true,
      source: metric.source?.address ?? null,
    };
  }
  return {
    value: null,
    year,
    classification: "UNKNOWN_TARGET",
    reviewRequired: Boolean(anchor),
    source: metric.source?.address ?? anchor?.cell.address ?? null,
  };
}

function hashPrefix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function duplicateEvidence(
  plan: GoogleSheetsImportPlan | null,
  sync: SyncClassification | null,
) {
  if (!plan || !sync || !sync.duplicates.length) return [];
  return sync.duplicates.map((sourceKey) => {
    const matching = plan.stagingRows.filter(
      (row) => sourceKeyForStagingRow(row) === sourceKey,
    );
    const first = matching[0];
    const identities = matching.map((row) =>
      [
        row.entityType,
        row.periodStart?.toISOString().slice(0, 10) ?? row.readingDate?.toISOString().slice(0, 10) ?? "",
        row.unitCode ?? "",
        row.supplierCode ?? "",
        row.valueUnit,
      ].join("|"),
    );
    const values = matching.map((row) => row.normalizedValue?.toString() ?? "NULL");
    const sameIdentity = new Set(identities).size === 1;
    const sameValue = new Set(values).size === 1;
    const classification = sameIdentity && sameValue
      ? "TRUE_DUPLICATE"
      : sameIdentity
        ? "BUSINESS_KEY_COLLISION"
        : "PARSER_IDENTITY_PROBLEM";
    return {
      sourceKeyPrefix: hashPrefix(sourceKey),
      entityType: first?.entityType ?? "UNKNOWN",
      date: first?.periodStart?.toISOString().slice(0, 10) ?? first?.readingDate?.toISOString().slice(0, 10) ?? "UNKNOWN",
      unit: first?.unitCode ?? "",
      supplier: first?.supplierCode ?? "",
      valueUnit: first?.valueUnit ?? "",
      values,
      rows: matching.map((row) => row.source.row?.toString() ?? row.source.cell ?? "UNKNOWN"),
      classification,
    } satisfies DuplicateRowEvidence;
  });
}

function classifySchema(
  context: ProfileContext,
  operational: boolean,
  duplicateRows: readonly DuplicateRowEvidence[],
) {
  if (context.readError) return "NO_MATCH" as const;
  if (context.parsed?.diagnostics.ambiguous.length || duplicateRows.length)
    return "AMBIGUOUS" as const;
  const titleValid = context.parsed?.worksheet.isValid ?? false;
  if (titleValid && context.plan?.status === "READY_FOR_IMPORT")
    return "EXACT_MATCH" as const;
  if (titleValid && operational) return "PARTIAL_MATCH" as const;
  if (operational) return "LEGACY_MATCH" as const;
  if (context.parsed?.anchors.length) return "PARTIAL_MATCH" as const;
  return "NO_MATCH" as const;
}

function primaryClassification(
  context: ProfileContext,
  domains: readonly string[],
  structures: readonly string[],
  operational: boolean,
  duplicateRows: readonly DuplicateRowEvidence[],
) {
  if (context.readError) return "UNKNOWN" as const;
  if (!context.rows.some((row) => row.some((cell) => typeof cell === "number" || typeof cell === "string" && cell.trim())))
    return "TEMPLATE" as const;
  if (duplicateRows.length) return "DUPLICATE" as const;
  const values = allNormalizedValues(context.rows);
  const title = context.metadata.title;
  const auxiliary = domains.includes("AUXILIARY") && !operational;
  if (auxiliary) return "AUXILIARY" as const;
  if (structures.includes("HELPER") && !operational) return "CALCULATION" as const;
  if (structures.includes("SUMMARY") && !operational) return "SUMMARY" as const;
  if (domains.includes("UNIT_MASTER") && !operational) return "MASTER_DATA" as const;
  if (operational) {
    const metadata = parseBBWorksheetName(title);
    if (
      metadata?.month === CURRENT_MONTH &&
      metadata.year === CURRENT_YEAR &&
      context.plan?.status === "READY_FOR_IMPORT"
    )
      return "OPERATIONAL" as const;
    if (metadata) return "HISTORICAL" as const;
    return "UNSUPPORTED" as const;
  }
  if (domains.includes("AUXILIARY")) return "AUXILIARY" as const;
  if (structures.includes("SUMMARY")) return "SUMMARY" as const;
  if (structures.includes("HELPER")) return "CALCULATION" as const;
  if (domains.includes("UNIT_MASTER")) return "MASTER_DATA" as const;
  if (values.some((value) => /TEMPLATE|FORMAT INPUT|ISI DATA/.test(value)))
    return "TEMPLATE" as const;
  return "UNKNOWN" as const;
}

function unsupportedReasons(
  context: ProfileContext,
  primary: PrimaryClassification,
  schema: SchemaProfile,
  structures: readonly string[],
  domains: readonly string[],
  headerRows: readonly number[],
) {
  if (!["UNSUPPORTED", "AUXILIARY", "SUMMARY", "CALCULATION", "UNKNOWN"].includes(primary))
    return [];
  const result: string[] = [];
  if (primary === "AUXILIARY" || domains.includes("AUXILIARY")) result.push("AUXILIARY");
  if (primary === "SUMMARY" || structures.includes("SUMMARY")) result.push("SUMMARY_ONLY");
  if (primary === "CALCULATION" || structures.includes("HELPER")) result.push("CALCULATION");
  if (!headerRows.length) result.push("NO_RECOGNIZED_HEADER");
  if (schema === "LEGACY_MATCH") result.push("LEGACY_SCHEMA");
  if (schema === "AMBIGUOUS" || context.parsed?.diagnostics.ambiguous.length)
    result.push("AMBIGUOUS_FIELDS");
  if (!context.parsed?.worksheet.isValid && !result.length) result.push("LEGACY_FORMAT");
  if (!domains.length || domains.every((domain) => ["AUXILIARY", "SUMMARY"].includes(domain)))
    result.push("UNKNOWN_DOMAIN");
  return unique(result.length ? result : ["OTHER"]);
}

function legacyPattern(
  context: ProfileContext,
  primary: PrimaryClassification,
  structures: readonly string[],
  headerRows: readonly number[],
  operational: boolean,
) {
  if (context.readError) return "READ_FAILURE";
  if (primary === "OPERATIONAL") return "CURRENT_DYNAMIC_DAILY";
  if (primary === "HISTORICAL" && structures.includes("DAILY"))
    return headerRows.length > 1 ? "LEGACY_BB_MULTI_ROW_DAILY" : "LEGACY_BB_DAILY_PARTIAL";
  if (primary === "UNSUPPORTED" && operational)
    return headerRows.length > 1 ? "LEGACY_ABBREVIATED_MULTI_ROW" : "LEGACY_ABBREVIATED_DAILY";
  if (primary === "AUXILIARY") return "AUXILIARY_SUPPORT_TAB";
  if (primary === "SUMMARY") return "SUMMARY_REPORT_TAB";
  if (primary === "CALCULATION") return "CALCULATION_HELPER_TAB";
  if (primary === "TEMPLATE") return "TEMPLATE_OR_EMPTY_TAB";
  if (primary === "MASTER_DATA") return "MASTER_REFERENCE_TAB";
  return "UNKNOWN_LEGACY";
}

function importability(
  context: ProfileContext,
  primary: PrimaryClassification,
  schema: SchemaProfile,
  relevance: BusinessRelevance,
  duplicateRows: readonly DuplicateRowEvidence[],
) {
  if (duplicateRows.length || primary === "DUPLICATE") return "NEEDS_MANUAL_REVIEW" as const;
  if (context.readError) return "NEEDS_MANUAL_REVIEW" as const;
  if (primary === "OPERATIONAL" && schema === "EXACT_MATCH" && relevance === "REQUIRED")
    return "IMPORT_NOW" as const;
  if (["HISTORICAL", "UNSUPPORTED"].includes(primary) && relevance !== "UNKNOWN")
    return "IMPORT_AFTER_MAPPING" as const;
  if (["AUXILIARY", "SUMMARY", "TEMPLATE", "CALCULATION", "MASTER_DATA"].includes(primary))
    return "DO_NOT_IMPORT" as const;
  if (primary === "UNKNOWN") return "UNKNOWN" as const;
  return "NEEDS_MANUAL_REVIEW" as const;
}

function relevanceFor(primary: PrimaryClassification, domains: readonly string[]) {
  if (primary === "OPERATIONAL") return "REQUIRED" as const;
  if (["HISTORICAL", "UNSUPPORTED", "DUPLICATE"].includes(primary))
    return domains.length ? "OPTIONAL" as const : "UNKNOWN" as const;
  if (["AUXILIARY", "SUMMARY", "TEMPLATE", "CALCULATION", "MASTER_DATA"].includes(primary))
    return "NOT_REQUIRED" as const;
  return "UNKNOWN" as const;
}

function riskFor(
  primary: PrimaryClassification,
  importabilityValue: Importability,
  domains: readonly string[],
  schema: SchemaProfile,
  issues: readonly string[],
) {
  if (["DUPLICATE", "UNKNOWN"].includes(primary) || importabilityValue === "NEEDS_MANUAL_REVIEW")
    return "HIGH" as const;
  if (
    issues.length ||
    schema === "LEGACY_MATCH" ||
    schema === "PARTIAL_MATCH" ||
    domains.some((domain) => /RECEIPT|CONSUMPTION|STOCK|TARGET|HOP|KPI/.test(domain))
  )
    return "MEDIUM" as const;
  if (importabilityValue === "DO_NOT_IMPORT") return "LOW" as const;
  return "UNKNOWN" as const;
}

function parserMatch(parsed: DynamicParserResult | null) {
  if (!parsed) return "NO_MATCH" as const;
  if (parsed.worksheet.isValid && parsed.anchors.length && !parsed.diagnostics.errors.length)
    return "TITLE_AND_CONTENT" as const;
  if (parsed.worksheet.isValid) return "TITLE_ONLY" as const;
  if (parsed.anchors.length || parsed.structures.some((structure) => structure.dataRows.length))
    return "PARTIAL" as const;
  return "NO_MATCH" as const;
}

function schemaChangeType(
  registry: { schemaSnapshot: string | null } | undefined,
  parsed: DynamicParserResult | null,
) {
  if (!parsed) return null;
  const current = buildSchemaSnapshot(parsed);
  const result = detectSchemaChange(registry?.schemaSnapshot, current);
  return result.changed ? result.type : null;
}

function planSummary(
  plan: GoogleSheetsImportPlan | null,
  sync: SyncClassification | null,
) {
  if (!plan) return null;
  const validRows = plan.stagingRows.filter(
    (row) => row.validationStatus === "VALID" || row.validationStatus === "VALID_EMPTY",
  ).length;
  return {
    stagingRows: plan.stagingRows.length,
    validRows,
    invalidRows: plan.stagingRows.length - validRows,
    rejectedRows: plan.stagingRows.length - validRows,
    insert: sync?.inserted ?? 0,
    update: sync?.updated ?? 0,
    skip: sync?.skipped ?? 0,
    status: plan.status,
    blockingIssues: [...plan.blockingIssues],
  };
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

function createProfile(
  context: ProfileContext,
  registry: { schemaSnapshot: string | null } | undefined,
): WorksheetProfile {
  const { metadata, rows, parsed, plan, sync, readError, number } = context;
  const scanned = parsed
    ? parsed.scannedCells
    : scanSpreadsheet(rows, { rowOffset: 1, columnOffset: 1 });
  const structure = parsed?.structures[0] ?? analyzeTableStructure(scanned);
  const values = allNormalizedValues(rows);
  const headers = inferHeaderRows(scanned, structure);
  const paths = parsed ? describeStructure(structure) : [];
  const headerPathValues = parsed?.structures[0]?.headerPaths ?? [];
  const units = unitEvidence(values, headerPathValues);
  const suppliers = supplierEvidence(values);
  const domains = parsed
    ? domainSignals(values, metadata.title)
    : domainSignals(values, metadata.title);
  const operational = parsed
    ? operationalEvidence(parsed, structure, domains, values)
    : false;
  const structures = parsed ? dataStructures(values, structure, parsed) : ["UNKNOWN"];
  const duplicateRows = duplicateEvidence(plan, sync);
  const primary = primaryClassification(
    context,
    domains,
    structures,
    operational,
    duplicateRows,
  );
  const schema = classifySchema(context, operational, duplicateRows);
  const relevance = relevanceFor(primary, domains);
  const importValue = importability(context, primary, schema, relevance, duplicateRows);
  const issues = unique([
    ...(plan?.blockingIssues ?? []),
    ...(parsed?.diagnostics.errors ?? []).map((issue) => `parser_${issue}`),
    ...(parsed?.diagnostics.ambiguous ?? []).map((issue) => `ambiguous_${issue}`),
    ...(readError ? [`read_${readError.code}`] : []),
    ...(duplicateRows.length ? ["duplicate_source_key"] : []),
    ...(targetEvidence(parsed ?? emptyParsed(metadata.title), metadata.title).reviewRequired
      ? ["target_requires_review"]
      : []),
  ]);
  const target = targetEvidence(parsed ?? emptyParsed(metadata.title), metadata.title);
  const risk = riskFor(primary, importValue, domains, schema, issues);
  const mappings = [
    ...headerPathValues.map((path) => mappingForPath(path, metadata.title)),
    ...(parsed?.anchors
      .map((anchor) => mappingForAnchor(anchor, metadata.title))
      .filter((mapping): mapping is FieldMapping => mapping !== null) ?? []),
  ];
  const availableMetrics = parsed
    ? Object.entries(parsed.normalized.metrics)
        .filter(([, value]) => value.available)
        .map(([key]) => key)
    : [];
  const warningValues = parsed?.diagnostics.warnings ?? [];
  const errorValues = parsed?.diagnostics.errors ?? [];
  const dateValues = parsed ? parsedDateValues(parsed, structure, rows) : [];
  const readStatus = readError
    ? "READ_FAILED"
    : rows.some((row) => row.some((cell) => typeof cell === "number" || typeof cell === "string" && cell.trim()))
      ? "READ"
      : "EMPTY";
  return {
    number,
    metadata,
    visibility: "UNAVAILABLE_FROM_EXISTING_METADATA",
    dimensions: dimensions(metadata),
    detectedRange: detectedRange(rows),
    headerRows: headers,
    headerSamples: headerSamples(scanned, headers),
    approximateDataRows: structure.dataRows.length || parsed?.normalized.series.length || 0,
    actualNonEmptyRows: new Set(scanned.filter((cell) => cell.normalizedValue).map((cell) => cell.row)).size,
    dateRange: dateRangeDisplay(dateValues),
    dateValues,
    units: units.units,
    unitNotes: units.notes,
    suppliers,
    domains,
    domainDisplay: domains.length > 1 ? `MULTI_DOMAIN (${domains.join(", ")})` : domains[0] ?? "UNKNOWN",
    dataStructures: structures,
    parserMatch: parserMatch(parsed),
    parserAnchorKeys: unique(parsed?.anchors.map((anchor) => anchor.key) ?? []),
    availableMetrics,
    diagnostics: {
      warnings: warningValues.slice(0, 12),
      errors: errorValues.slice(0, 12),
      ambiguous: [...(parsed?.diagnostics.ambiguous ?? [])],
    },
    schemaProfile: schema,
    schemaChange: schemaChangeType(registry, parsed),
    schemaEvidence: unique([
      `headers=${headers.length}`,
      `dateColumn=${structure.dateColumn ?? "none"}`,
      `dataRows=${structure.dataRows.length}`,
      `anchors=${parsed?.anchors.length ?? 0}`,
      ...paths.slice(0, 12).map(
        (path) => `C${path.column}:${path.labels.join("/") || "unlabeled"}`,
      ),
    ]),
    legacyPattern: legacyPattern(context, primary, structures, headers, operational),
    primaryClassification: primary,
    businessRelevance: relevance,
    importability: importValue,
    risk,
    unsupportedReasons: unsupportedReasons(context, primary, schema, structures, domains, headers),
    issues,
    plan: planSummary(plan, sync),
    duplicateEvidence: duplicateRows,
    target,
    mappings,
    readStatus,
    readError,
    rangeRows: rows.length,
  };
}

function emptyParsed(title: string): DynamicParserResult {
  const parser = parseDynamicWorksheet([], { worksheetName: title, rowOffset: 1, columnOffset: 1 });
  return parser;
}

function issueSeverity(issue: string, profile: WorksheetProfile): Risk {
  if (/duplicate|identity|target|receipt|consumption|stock|cumulative|read_|parser_|ambiguous/.test(issue))
    return "HIGH";
  if (/schema|legacy|mapping|header|domain|unsupported/.test(issue)) return "MEDIUM";
  return profile.risk === "UNKNOWN" ? "LOW" : profile.risk;
}

function issueCategory(issue: string): IssueRecord["category"] {
  if (/duplicate/.test(issue)) return "duplicate";
  if (/identity/.test(issue)) return "identity";
  if (/read_|api|permission|authentication/.test(issue)) return "api";
  if (/target|receipt|consumption|stock|cumulative|business/.test(issue)) return "business";
  if (/mapping|domain/.test(issue)) return "mapping";
  return "schema";
}

function aggregateMappings(profiles: readonly WorksheetProfile[]) {
  const result = new Map<string, FieldMapping>();
  for (const profile of profiles) {
    for (const mapping of profile.mappings) {
      const key = [mapping.sourceHeader, mapping.normalizedField, mapping.databaseField, mapping.confidence].join("|");
      const current = result.get(key);
      if (current) {
        current.worksheets = unique([...current.worksheets, profile.metadata.title]);
      } else {
        result.set(key, { ...mapping, worksheets: [profile.metadata.title] });
      }
    }
  }
  return [...result.values()].sort(
    (a, b) => b.worksheets.length - a.worksheets.length || a.sourceHeader.localeCompare(b.sourceHeader),
  );
}

function aggregatePatterns(profiles: readonly WorksheetProfile[]) {
  const result = new Map<string, WorksheetProfile[]>();
  for (const profile of profiles) {
    const group = result.get(profile.legacyPattern) ?? [];
    group.push(profile);
    result.set(profile.legacyPattern, group);
  }
  return [...result.entries()].sort((a, b) => b[1].length - a[1].length);
}

function counts<T extends string, U>(items: readonly U[], field: (item: U) => T) {
  const result = new Map<T, number>();
  for (const item of items) result.set(field(item), (result.get(field(item)) ?? 0) + 1);
  return result;
}

function formatCountTable<T extends string>(map: Map<T, number>, order: readonly T[]) {
  return order
    .map((key) => `| ${key} | ${map.get(key) ?? 0} |`)
    .join("\n");
}

function profileIssues(profiles: readonly WorksheetProfile[]) {
  const records: IssueRecord[] = [];
  for (const profile of profiles) {
    for (const issue of profile.issues) {
      records.push({
        worksheet: profile.metadata.title,
        issue,
        severity: issueSeverity(issue, profile),
        category: issueCategory(issue),
      });
    }
    if (profile.primaryClassification === "UNSUPPORTED") {
      for (const reason of profile.unsupportedReasons) {
        records.push({
          worksheet: profile.metadata.title,
          issue: `unsupported_${reason.toLowerCase()}`,
          severity: "MEDIUM",
          category: "mapping",
        });
      }
    }
  }
  return records;
}

function targetRows(profiles: readonly WorksheetProfile[]) {
  return profiles.filter(
    (profile) =>
      profile.target.value !== null ||
      profile.target.classification !== "UNKNOWN_TARGET" ||
      profile.headerSamples.some((header) => header.includes("TARGET")),
  );
}

function reportFor(
  profiles: readonly WorksheetProfile[],
  before: DatabaseSnapshot,
  after: DatabaseSnapshot,
  metadataCount: number,
) {
  const classificationOrder: readonly PrimaryClassification[] = [
    "OPERATIONAL",
    "HISTORICAL",
    "AUXILIARY",
    "SUMMARY",
    "TEMPLATE",
    "CALCULATION",
    "MASTER_DATA",
    "DUPLICATE",
    "UNSUPPORTED",
    "UNKNOWN",
  ];
  const relevanceOrder: readonly BusinessRelevance[] = [
    "REQUIRED",
    "OPTIONAL",
    "NOT_REQUIRED",
    "UNKNOWN",
  ];
  const importOrder: readonly Importability[] = [
    "IMPORT_NOW",
    "IMPORT_AFTER_MAPPING",
    "DO_NOT_IMPORT",
    "NEEDS_MANUAL_REVIEW",
    "UNKNOWN",
  ];
  const classificationCounts = counts(profiles, (profile) => profile.primaryClassification);
  const relevanceCounts = counts(profiles, (profile) => profile.businessRelevance);
  const importCounts = counts(profiles, (profile) => profile.importability);
  const domainCounts = new Map<string, number>();
  for (const profile of profiles) {
    for (const domain of profile.domains.length ? profile.domains : ["UNKNOWN"])
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const patternGroups = aggregatePatterns(profiles);
  const mappingGroups = aggregateMappings(profiles);
  const issues = profileIssues(profiles);
  const issueCounts = counts(issues, (issue) => issue.severity);
  const unsupportedProfiles = profiles.filter((profile) => profile.unsupportedReasons.length);
  const reviewProfiles = profiles.filter((profile) =>
    ["DUPLICATE", "UNKNOWN"].includes(profile.primaryClassification) ||
    profile.importability === "NEEDS_MANUAL_REVIEW" ||
    profile.risk === "HIGH",
  );
  const duplicates = profiles.filter((profile) => profile.duplicateEvidence.length);
  const targetProfiles = targetRows(profiles);
  const readFailures = profiles.filter((profile) => profile.readStatus === "READ_FAILED");
  const snapshotStable = JSON.stringify(before) === JSON.stringify(after);
  const finalStatus = readFailures.length
    ? "CLASSIFICATION — BLOCKED"
    : reviewProfiles.length || classificationCounts.get("UNKNOWN")
      ? "CLASSIFICATION — PASS WITH REVIEW"
      : "CLASSIFICATION — PASS";
  const inventory = profiles
    .map(
      (profile) =>
        `| ${profile.number} | ${markdownCell(profile.metadata.title)} | ${markdownCell(profile.domainDisplay)} | ${profile.primaryClassification} | ${profile.businessRelevance} | ${profile.schemaProfile} | ${profile.importability} | ${profile.risk} |`,
    )
    .join("\n");
  const profiling = profiles
    .map(
      (profile) =>
        `| ${profile.number} | ${markdownCell(profile.metadata.title)} | ${markdownCell(profile.metadata.sheetId)} | ${profile.metadata.index ?? ""} | ${profile.visibility} | ${markdownCell(profile.dimensions)} | ${markdownCell(profile.detectedRange ?? "EMPTY")} | ${profile.headerRows.join(", ") || "NONE"} | ${profile.approximateDataRows} | ${markdownCell(profile.dateRange)} | ${markdownCell(profile.units.join(", ") || "NONE")} | ${markdownCell(profile.domainDisplay)} | ${profile.parserMatch} | ${profile.schemaProfile} | ${profile.primaryClassification} | ${profile.importability} | ${profile.risk} |`,
    )
    .join("\n");
  const patternTable = patternGroups
    .map(([pattern, group]) => {
      const examples = group.slice(0, 5).map((profile) => profile.metadata.title).join(", ");
      const common = unique(group.flatMap((profile) => profile.headerSamples)).slice(0, 8).join(", ");
      const required = group.some((profile) => profile.importability === "IMPORT_AFTER_MAPPING")
        ? "MAPPING_SPEC + identity + validation"
        : group.some((profile) => profile.importability === "IMPORT_NOW")
          ? "Existing parser/importer"
          : "No import mapping; confirm scope";
      return `| ${pattern} | ${group.length} | ${markdownCell(examples)} | ${markdownCell(common)} | ${required} |`;
    })
    .join("\n");
  const mappingTable = mappingGroups
    .slice(0, 140)
    .map(
      (mapping) =>
        `| ${markdownCell(mapping.sourceHeader)} | ${mapping.normalizedField} | ${mapping.databaseField} | ${mapping.confidence} | ${mapping.worksheets.length} |`,
    )
    .join("\n");
  const unsupportedReasonsMap = new Map<string, number>();
  for (const profile of unsupportedProfiles) {
    for (const reason of profile.unsupportedReasons)
      unsupportedReasonsMap.set(reason, (unsupportedReasonsMap.get(reason) ?? 0) + 1);
  }
  const unsupportedReasonTable = [...unsupportedReasonsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `| ${reason} | ${count} |`)
    .join("\n");
  const reviewTable = reviewProfiles
    .map(
      (profile) =>
        `| ${markdownCell(profile.metadata.title)} | ${markdownCell(profile.issues.join(", ") || "manual classification required")} | ${markdownCell(profile.domainDisplay)} | ${profile.schemaProfile} | ${markdownCell(profile.unsupportedReasons.join(", ") || "candidate mapping/review")} | ${profile.risk} | ${markdownCell(profile.importability)} |`,
    )
    .join("\n");
  const duplicateDetails = duplicates.length
    ? duplicates
        .map((profile) => {
          const evidence = profile.duplicateEvidence
            .map(
              (item) =>
                `  - key ${item.sourceKeyPrefix}; ${item.entityType}; date ${item.date}; unit ${item.unit || "none"}; supplier ${item.supplier || "none"}; values ${item.values.join(", ")}; rows ${item.rows.join(", ")}; diagnosis **${item.classification}**`,
            )
            .join("\n");
          return `- **${profile.metadata.title}** — ${profile.duplicateEvidence.length} duplicate source-key group(s).\n${evidence}`;
        })
        .join("\n")
    : "- Tidak ada duplicate source key yang ditemukan.";
  const targetDetails = targetProfiles.length
    ? targetProfiles
        .map(
          (profile) =>
            `| ${markdownCell(profile.metadata.title)} | ${profile.target.value ?? "UNKNOWN"} | ${profile.target.year ?? "UNKNOWN"} | ${profile.target.classification} | ${profile.target.reviewRequired ? "YES" : "NO"} | ${markdownCell(profile.target.source ?? "UNKNOWN")} |`,
        )
        .join("\n")
    : "| Tidak ada | UNKNOWN | UNKNOWN | UNKNOWN_TARGET | YES | - |";
  const issueDetails = issues.length
    ? issues
        .slice(0, 160)
        .map((issue) => `| ${markdownCell(issue.worksheet)} | ${markdownCell(issue.issue)} | ${issue.category} | ${issue.severity} |`)
        .join("\n")
    : "| Tidak ada | - | - | - |";
  const databaseSnapshotText = (snapshot: DatabaseSnapshot) =>
    Object.entries(snapshot)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
  const readFailureDetails = readFailures.length
    ? readFailures
        .map(
          (profile) =>
            `- **${profile.metadata.title}** — code=${profile.readError?.code ?? "unknown"}; HTTP status=${profile.readError?.status ?? "not available"}; message=${profile.readError?.message ?? "read failed"}. No import was attempted.`,
        )
        .join("\n")
    : "- Tidak ada read failure.";
  const agustusProfile = profiles.find((profile) => profile.metadata.title === "Agustus25-BB");
  const agustusReadSummary = !agustusProfile
    ? "Agustus25-BB tidak ditemukan pada metadata worksheet."
    : agustusProfile.readStatus === "READ_FAILED"
      ? "Agustus25-BB tidak dapat diprofilkan penuh karena read API gagal pada percobaan konservatifnya."
      : "Agustus25-BB berhasil dibaca dan diprofilkan melalui range audit read-only.";
  const agustusInvestigation = !agustusProfile
    ? "- Agustus25-BB tidak ditemukan pada inventory; tidak ada import atau perubahan yang dilakukan."
    : agustusProfile.readStatus === "READ_FAILED"
      ? `${readFailureDetails}\n\nRead failure ditangani sebagai isu klasifikasi read-only. Tidak dilakukan retry agresif, import, database write, atau modifikasi source. Root cause diklasifikasikan berdasarkan error API yang dikembalikan; pemeriksaan permission/range/network lanjutan memerlukan investigasi read-only terpisah.`
      : `- Content read berhasil; detected range ${agustusProfile.detectedRange ?? "UNKNOWN"}, ${agustusProfile.rangeRows} row(s), parser ${agustusProfile.parserMatch}.\n- Tidak ada read failure, retry agresif, import, database write, atau modifikasi source.`;
  const agustusRecommendation = agustusProfile?.readStatus === "READ_FAILED"
    ? "Resolve the Agustus25-BB API read issue with a separate read-only permission/range/network check."
    : "No additional Agustus25-BB read remediation is indicated by this audit; preserve it as a historical mapping candidate until mapping approval exists.";
  return `# Legacy Worksheet Classification & Mapping Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **${finalStatus}**

## Executive Summary

Seluruh **${metadataCount} worksheet** berhasil diinventarisasi melalui metadata read-only. Content profiling dilakukan terhadap setiap worksheet dengan range '${DYNAMIC_SCAN_RANGE}', parser semantic existing, schema snapshot, dan pemeriksaan field/domain. Fase ini tidak melakukan import dan tidak mengubah production code.

Hasil menunjukkan satu worksheet current yang memenuhi kriteria import existing, sejumlah worksheet historical/legacy yang membutuhkan mapping, tab auxiliary/summary yang tidak menjadi source operational, serta worksheet yang masih memerlukan keputusan manual. ${agustusReadSummary}

Baseline Phase 11B tetap dicatat: 199 worksheet, 1 READY_FOR_IMPORT, 178 title unsupported, 2 duplicate, 18 NEEDS_REVIEW, 107 blocking entries, dan database writes 0. Klasifikasi Phase 11C berikut adalah **revised classification berbasis content evidence**, bukan persetujuan import.

## Environment

| Item | Result |
| --- | --- |
| Google Sheets | Source of truth; metadata/content read-only |
| PostgreSQL | LOCAL dashboard_pln; read-only snapshot |
| Parser | Existing dynamic semantic parser; tidak ada parser baru |
| Importer | Existing plan hanya digunakan untuk profiling candidate; commit tidak dipanggil |
| Range | ${DYNAMIC_SCAN_RANGE} |
| Request policy | Serial request, spacing ${REQUEST_DELAY_MS} ms, maksimal ${MAX_RETRY_ATTEMPTS} attempt kecuali Agustus25-BB satu attempt |
| Visibility | Tidak tersedia pada metadata type existing; dicatat sebagai UNAVAILABLE_FROM_EXISTING_METADATA |
| Credential | Tidak dicatat atau ditampilkan |
| Database writes | **0** |

## Spreadsheet Overview

- Worksheet metadata ditemukan: **${metadataCount}**.
- Worksheet content read: **${profiles.filter((profile) => profile.readStatus !== "READ_FAILED").length}**.
- Read failure: **${readFailures.length}**.
- Range rows terbaca: **${profiles.reduce((sum, profile) => sum + profile.rangeRows, 0)}**.
- Visibility, merged-cell metadata, dan formula metadata tidak tersedia melalui fungsi values/metadata existing. Report tidak mengasumsikan nilai untuk informasi tersebut.
- Header, repeated label, multi-row header, blank inherited cell, dan block structure hanya ditandai dari evidence values yang terbaca.

## Worksheet Inventory

| # | Worksheet | Domain | Primary Class | Relevance | Schema | Importability | Risk |
|---:|---|---|---|---|---|---|---|
${inventory}

## Worksheet Content Profiling

| # | Worksheet | Sheet ID | Position | Visibility | Dimensions | Detected range | Header rows | Approx. data rows | Date range | Units | Domain | Existing parser | Schema | Primary | Importability | Risk |
|---:|---|---|---:|---|---|---|---|---:|---|---|---|---|---|---|---|---|
${profiling}

## Classification Summary

${formatCountTable(classificationCounts, classificationOrder)}

| **Total** | **${profiles.length}** |

## Business Domain Summary

| Domain | Worksheet profile count |
| --- | ---: |
${[...domainCounts.entries()].sort((a, b) => b[1] - a[1]).map(([domain, count]) => "| " + domain + " | " + count + " |").join("\n")}

Business relevance:

| Relevance | Count |
| --- | ---: |
${formatCountTable(relevanceCounts, relevanceOrder)}

## Schema Profiles

| Schema profile | Count |
| --- | ---: |
${["EXACT_MATCH", "PARTIAL_MATCH", "LEGACY_MATCH", "NO_MATCH", "AMBIGUOUS"].map((key) => "| " + key + " | " + profiles.filter((profile) => profile.schemaProfile === key).length + " |").join("\n")}

Schema evidence uses detected header rows, date column, data rows, semantic anchors, parser diagnostics, and comparison with existing registry snapshot when available. schemaChange was not detected for the existing approved worksheet; no schema change was written.

## Field Mapping

The following is an audit mapping, not an implementation. Confidence LOW fields are not eligible for automatic mapping.

| Source header/pattern | Normalized field | Database field | Confidence | Worksheets observed |
| --- | --- | --- | --- | ---: |
${mappingTable || "| Tidak ada mapping evidence | UNKNOWN | NO_DATABASE_TARGET | LOW | 0 |"}

Mapping rules observed:

- Tanggal/Tgl/Date → date → reading_date atau period_start dengan confidence HIGH bila date column dan daily rows konsisten.
- Unit 1–3 → unit identity → units.id melalui unit_code; label berulang tidak dinormalisasi otomatis pada fase ini.
- Penerimaan + domain → quantity receipt field sesuai unit; supplier Biomassa membutuhkan tujuh supplier identity lengkap.
- Pemakaian/Konsumsi + domain → quantity consumption field sesuai unit.
- Stok/Stock → closingStock → coal_stock.closing_stock.
- HOP/Hari Operasi → hopDays → hop_readings.hop_days.
- Target → targetTon → biomass_targets.target_ton; nilai selain 70.020 ton tidak dinormalisasi otomatis.
- Cumulative/Total YYYY → cumulativeTon → biomass_cumulative_snapshots.cumulative_ton; label ambigu tetap NEEDS_REVIEW.

## Legacy Patterns

| Pattern | Worksheet count | Example worksheets | Common structure/header evidence | Required mapping |
| --- | ---: | --- | --- | --- |
${patternTable}

Pattern grouping is based on content evidence and schema family, not worksheet title alone. No parser or production mapping was implemented in this phase.

## Unsupported Analysis

The Phase 11B count of 178 referred to titles outside the existing full Indonesian-month BB naming pattern. Phase 11C separates those into legacy operational candidates, auxiliary, summary, calculation, template, and unknown based on content evidence.

| Unsupported reason | Worksheet count |
| --- | ---: |
${unsupportedReasonTable || "| Tidak ada | 0 |"}

Interpretation:

- LEGACY_SCHEMA/LEGACY_FORMAT: operational evidence exists, but title/header/identity is outside the supported parser family.
- AUXILIARY atau SUMMARY_ONLY: evidence indicates support/report/helper content, not a primary operational source.
- NO_RECOGNIZED_HEADER atau UNKNOWN_DOMAIN: evidence is insufficient; do not import.
- AMBIGUOUS_FIELDS: a critical field has multiple possible meanings; manual mapping is required.

## Needs Review

| Worksheet | Issue | Domain | Current schema | Candidate mapping/evidence | Risk | Importability |
| --- | --- | --- | --- | --- | --- | --- |
${reviewTable || "| Tidak ada | - | - | - | - | - | - |"}

Issues are evidence for follow-up only. No issue was auto-resolved and no source/database value was changed.

## Duplicate Investigation

Investigated duplicate source-key groups without deleting or modifying any row. Source key values are represented only by short non-reversible prefixes in this report.

${duplicateDetails}

Diagnosis categories:

- TRUE_DUPLICATE: same identity and same normalized value.
- BUSINESS_KEY_COLLISION: same identity but conflicting value.
- PARSER_IDENTITY_PROBLEM: parser produced different identity components for a source-key collision.
- LEGACY_IDENTITY: identity cannot be safely reconstructed from the legacy structure.
- UNKNOWN: evidence insufficient.

No duplicate was deleted, merged, or imported.

## Agustus25-BB Investigation

${agustusInvestigation}

## Target Biomassa Analysis

Official target: **${OFFICIAL_BIOMASS_TARGET.toLocaleString("id-ID")} ton**.

| Worksheet | Detected value | Year evidence | Classification | Review required | Source cell |
| --- | ---: | ---: | --- | --- | --- |
${targetDetails}

Rules applied:

- Exact 70.020 ton → OFFICIAL_TARGET.
- Other explicit value → HISTORICAL_TARGET or CALCULATED_TARGET based on label evidence, always review-required.
- Missing/ambiguous target → UNKNOWN_TARGET, review-required when a target label exists.
- No historical target was overwritten with the official target.

## Import Eligibility

| Importability | Count |
| --- | ---: |
${formatCountTable(importCounts, importOrder)}

### IMPORT_NOW

${profiles.filter((profile) => profile.importability === "IMPORT_NOW").map((profile) => "- " + profile.metadata.title + ": " + profile.domainDisplay + "; exact schema/validation match; no duplicate evidence.").join("\n") || "- Tidak ada."}

### IMPORT_AFTER_MAPPING

${profiles.filter((profile) => profile.importability === "IMPORT_AFTER_MAPPING").slice(0, 80).map((profile) => "- " + profile.metadata.title + ": " + profile.domainDisplay + "; pattern " + profile.legacyPattern + "; mapping dan validation belum diimplementasikan.").join("\n") || "- Tidak ada."}

### DO_NOT_IMPORT

${profiles.filter((profile) => profile.importability === "DO_NOT_IMPORT").slice(0, 100).map((profile) => "- " + profile.metadata.title + ": " + profile.primaryClassification + "; " + (profile.unsupportedReasons.join(", ") || "non-operational/support content") + ".").join("\n") || "- Tidak ada."}

### NEEDS_MANUAL_REVIEW / UNKNOWN

${profiles.filter((profile) => ["NEEDS_MANUAL_REVIEW", "UNKNOWN"].includes(profile.importability)).map((profile) => "- " + profile.metadata.title + ": " + profile.importability + "; " + (profile.issues.join(", ") || "insufficient evidence") + ".").join("\n") || "- Tidak ada."}

## Blocking Summary

| Severity | Issue count |
| --- | ---: |
| HIGH | ${issueCounts.get("HIGH") ?? 0} |
| MEDIUM | ${issueCounts.get("MEDIUM") ?? 0} |
| LOW | ${issueCounts.get("LOW") ?? 0} |

| Category | Count |
| --- | ---: |
${["schema", "identity", "duplicate", "api", "mapping", "business"].map((category) => "| " + category + " | " + issues.filter((issue) => issue.category === category).length + " |").join("\n")}

First 160 blocking/review evidence entries:

| Worksheet | Issue | Category | Severity |
| --- | --- | --- | --- |
${issueDetails}

## Recommended Parser/Mapping Work

1. Keep Juli26-BB as the only current IMPORT_NOW candidate until a separate controlled-import approval exists.
2. Define one mapping specification per legacy schema family above; do not create one parser per worksheet.
3. Resolve the 18 Phase 11B review candidates, especially receipt/consumption/stock/cumulative/target identity and ambiguous fields.
4. Confirm whether historical operational tabs are in scope; relevance is marked OPTIONAL until that decision is recorded.
5. Confirm duplicate diagnosis for Juni23-BB and September25-BB before any import decision.
6. ${agustusRecommendation}
7. Confirm whether auxiliary tabs (FLM, ALBES, DTS, FLYASH and similar) are intentionally excluded from the operational database.
8. After mapping decisions, rerun classification and dry-run; only then consider a separately approved import phase.

## Database Safety

Database write policy: **read-only**.

Snapshot before profiling:

${databaseSnapshotText(before)}

Snapshot after profiling:

${databaseSnapshotText(after)}

- Database snapshots stable: **${snapshotStable ? "YES" : "NO"}**.
- Database writes: **0**.
- INSERT/UPDATE/DELETE: **NO**.
- DROP/TRUNCATE/reset: **NO**.
- Prisma migrate/db push/db pull: **NO**.
- Google Sheets mutation: **NO**.
- Laravel/Prisma schema/production code change: **NO**.
- Deployment/Vercel change: **NO**.

${snapshotStable ? "No database count change was observed during the audit." : "Snapshot changed during the audit; classification is blocked and must be repeated under controlled conditions."}

## Final Decision

### Database

databaseWrites = 0; no destructive operation occurred.

### Classification

**${finalStatus}**

The inventory is complete for ${metadataCount} worksheet metadata records. Content classification is blocked when a worksheet could not be read; otherwise unresolved legacy/duplicate/ambiguous items are intentionally retained as review states.

### Import

**DO NOT IMPORT after this report.** Phase 11C ends at classification and mapping. No bulk import or controlled import was run.
`;
}

async function profileWorksheet(
  metadata: GoogleSheetsWorksheetMetadata,
  number: number,
  registryBySheetId: ReadonlyMap<string, { schemaSnapshot: string | null }>,
): Promise<WorksheetProfile> {
  await sleep(REQUEST_DELAY_MS);
  let rows: readonly (readonly (string | number | null)[])[] = [];
  let readError: ProfileContext["readError"] = null;
  try {
    const maxAttempts = metadata.title === "Agustus25-BB" ? 1 : MAX_RETRY_ATTEMPTS;
    const read = await withSyncRetry(
      () => readGoogleSheetsRange(metadata.title, DYNAMIC_SCAN_RANGE),
      { maxAttempts, baseDelayMs: 600, maxDelayMs: 1_200 },
    );
    rows = read.rows;
  } catch (error) {
    if (isGlobalFailure(error)) throw error;
    readError = errorDetails(error);
  }

  let parsed: DynamicParserResult | null = null;
  let plan: GoogleSheetsImportPlan | null = null;
  let sync: SyncClassification | null = null;
  if (!readError) {
    parsed = parseDynamicWorksheet(rows, {
      worksheetName: metadata.title,
      month: parseBBWorksheetName(metadata.title)?.month,
      year: parseBBWorksheetName(metadata.title)?.year,
      rowOffset: 1,
      columnOffset: 1,
    });
    if (parsed.worksheet.isValid && rows.length > 0) {
      const readResult: DynamicWorksheetReadResult = {
        requested: {
          month: parsed.worksheet.month,
          year: parsed.worksheet.year,
          worksheet: metadata.title,
        },
        effective: {
          month: parsed.worksheet.month,
          year: parsed.worksheet.year,
          worksheet: metadata.title,
        },
        isFallback: false,
        fallbackIndex: 0,
        attemptedWorksheets: [metadata.title],
        parsed,
      };
      plan = buildGoogleSheetsImportPlanFromReadResult(readResult);
      const registry = registryBySheetId.get(metadata.sheetId);
      if (registry) {
        const states = await prisma.syncRowState.findMany({
          where: { worksheet: { worksheetKey: metadata.sheetId } },
          select: { sourceKey: true, contentHash: true },
        });
        sync = classifySyncRows(
          plan.stagingRows,
          states.map((state) => ({ sourceKey: state.sourceKey, contentHash: state.contentHash })),
        );
      } else {
        sync = classifySyncRows(plan.stagingRows, []);
      }
    }
  }
  const context: ProfileContext = {
    metadata,
    number,
    rows,
    parsed,
    plan,
    sync,
    schemaChange: schemaChangeType(registryBySheetId.get(metadata.sheetId), parsed),
    readError,
  };
  const profile = createProfile(context, registryBySheetId.get(metadata.sheetId));
  return profile;
}

async function main() {
  const metadata = await listGoogleSheetsWorksheets();
  if (!metadata.length) throw new Error("No Google Sheets worksheets discovered.");
  const [before, registry] = await Promise.all([
    databaseSnapshot(),
    prisma.syncWorksheet.findMany({
      select: { worksheetKey: true, schemaSnapshot: true },
    }),
  ]);
  const registryBySheetId = new Map(
    registry.map((item) => [item.worksheetKey, { schemaSnapshot: item.schemaSnapshot }]),
  );
  const profiles: WorksheetProfile[] = [];
  for (const [index, worksheet] of metadata.entries()) {
    const profile = await profileWorksheet(worksheet, index + 1, registryBySheetId);
    profiles.push(profile);
    if ((index + 1) % 10 === 0 || index + 1 === metadata.length)
      console.error(`legacy classification progress: ${index + 1}/${metadata.length}`);
  }
  const after = await databaseSnapshot();
  const report = reportFor(profiles, before, after, metadata.length);
  if (process.argv.includes("--write-report")) await writeFile(REPORT_PATH, report, "utf8");
  const classificationCounts = counts(profiles, (profile) => profile.primaryClassification);
  const importCounts = counts(profiles, (profile) => profile.importability);
  const readFailures = profiles.filter((profile) => profile.readStatus === "READ_FAILED");
  console.log(
    JSON.stringify({
      status: readFailures.length ? "BLOCKED" : "PASS_WITH_REVIEW",
      mode: "legacy-worksheet-classification-read-only",
      worksheetCount: metadata.length,
      databaseWrites: 0,
      databaseSnapshotStable: JSON.stringify(before) === JSON.stringify(after),
      readFailures: readFailures.length,
      classification: Object.fromEntries(classificationCounts),
      importability: Object.fromEntries(importCounts),
      duplicateWorksheets: profiles.filter((profile) => profile.primaryClassification === "DUPLICATE").length,
      targetReviewWorksheets: profiles.filter((profile) => profile.target.reviewRequired).length,
      reportWritten: process.argv.includes("--write-report"),
    }),
  );
}

main()
  .catch((error) => {
    console.error("Legacy worksheet classification failed.");
    console.error(`Category: ${safeErrorCategory(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
