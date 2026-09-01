import "server-only";

import { parseDayValue, dateFromRaw, parseNumericValue } from "../dynamic/validators";
import { normalizeCellText } from "../dynamic/spreadsheet-scanner";
import {
  classifySyncRows,
  type ExistingSyncRowState,
} from "../sync/change-detection";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../sync/identity";
import {
  BB_CANONICAL_WORKSHEET,
  mappingProfileFor,
  normalizeSupplierIdentity,
  normalizeUnitIdentity,
  OFFICIAL_BIOMASS_TARGET,
} from "./profiles";
import type {
  BbSchemaFamily,
  DateCellInput,
  DateValidationIssue,
  DateValidationResult,
  DuplicateClassification,
  DuplicateGroup,
  FutureScopeObservation,
  HeaderMapping,
  LegacyMappingInput,
  LegacyMappingResult,
  MappingConfidence,
  MappingDecision,
  MappingIssue,
  MappingIssueSeverity,
  SchemaClassification,
  SourceDateFormat,
  SourceDateObservation,
} from "./types";
import type {
  DynamicParserResult,
  DynamicSheetValue,
  HeaderPath,
} from "../dynamic/types";
import type { ImportStagingRecord } from "../import/types";
import type { SchemaSnapshot } from "../sync/schema-detection";

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function normalizedLabel(value: string) {
  return normalizeCellText(value).replace(/\s+/g, " ").trim();
}

function labelsFor(path: HeaderPath) {
  return path.labels.map(normalizedLabel).filter(Boolean);
}

function joinedLabels(path: HeaderPath) {
  return labelsFor(path).join(" > ");
}

function semanticKeyCounts(snapshot: SchemaSnapshot) {
  const counts = new Map<string, number>();
  for (const column of snapshot.columns)
    counts.set(column.semanticKey, (counts.get(column.semanticKey) ?? 0) + 1);
  return counts;
}

function labelTokens(snapshot: SchemaSnapshot) {
  return new Set(
    snapshot.columns.flatMap((column) =>
      column.labels
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 1),
    ),
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const value of left) if (right.has(value)) common += 1;
  return common / Math.max(left.size, right.size);
}

export function classifySchemaFamily(
  canonical: SchemaSnapshot,
  current: SchemaSnapshot,
  options?: { worksheet?: string },
): SchemaClassification {
  if (
    options?.worksheet === BB_CANONICAL_WORKSHEET &&
    current.hash === canonical.hash
  )
    return {
      family: "CANONICAL_FAMILY",
      semanticCoverage: 1,
      labelCoverage: 1,
      reason: "Schema fingerprint equals the Juli26-BB canonical profile.",
    };

  const expected = semanticKeyCounts(canonical);
  const actual = semanticKeyCounts(current);
  const common = [...expected.entries()].reduce(
    (total, [key, count]) => total + Math.min(count, actual.get(key) ?? 0),
    0,
  );
  const semanticCoverage =
    common / Math.max(canonical.columns.length, current.columns.length, 1);
  const labelCoverage = overlap(labelTokens(canonical), labelTokens(current));

  if (semanticCoverage >= 0.8)
    return {
      family: "LEGACY_FAMILY_A",
      semanticCoverage,
      labelCoverage,
      reason: `Semantic coverage ${(semanticCoverage * 100).toFixed(0)}%; map equivalent fields by semantics, not physical position.`,
    };
  if (semanticCoverage >= 0.45)
    return {
      family: "LEGACY_FAMILY_C",
      semanticCoverage,
      labelCoverage,
      reason: `Semantic coverage ${(semanticCoverage * 100).toFixed(0)}%; legacy blocks and identity require review before value mapping.`,
    };
  if (semanticCoverage >= 0.2)
    return {
      family: "LEGACY_FAMILY_B",
      semanticCoverage,
      labelCoverage,
      reason: `Semantic coverage ${(semanticCoverage * 100).toFixed(0)}%; domain meaning is not safe to infer automatically.`,
    };
  return {
    family: "UNKNOWN_FAMILY",
    semanticCoverage,
    labelCoverage,
    reason: `Semantic coverage ${(semanticCoverage * 100).toFixed(0)}% is below the approved legacy-family threshold.`,
  };
}

function domainForPath(path: HeaderPath) {
  const labels = joinedLabels(path);
  if (path.isStock && path.resource === "biomass") return "BIOMASS_STOCK";
  if (path.isHop) return "HOP";
  if (path.isStock && path.resource === "coal") return "COAL_STOCK";
  if (path.isDate) return "DATE";
  if (path.resource === "biomass") {
    if (/PENERIMAAN|RECEIPT|INCOMING/.test(labels) && path.unitNumber === null)
      return "BIOMASS_RECEIPT";
    if (
      path.unitNumber !== null &&
      !/BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(labels)
    )
      return "BIOMASS_CONSUMPTION";
  }
  if (path.resource === "coal") {
    if (/PENERIMAAN|RECEIPT|RECEIVED/.test(labels) && path.unitNumber === null)
      return "COAL_RECEIPT";
    if (
      path.unitNumber !== null &&
      !/BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(labels)
    )
      return "COAL_CONSUMPTION";
  }
  if (path.resource === "solar") {
    if (/PENERIMAAN|RECEIPT|INPUT|TOP UP/.test(labels)) return "SOLAR_RECEIPT";
    return "SOLAR_CONSUMPTION";
  }
  if (/TARGET/.test(labels)) return "BIOMASS_TARGET";
  if (/KUMULATIF|CUMULATIVE|TOTAL\s+20\d{2}|PEMAKAIAN\s+20\d{2}/.test(labels))
    return "BIOMASS_CUMULATIVE";
  if (/POWER|GENERATION|LOAD|KWH/.test(labels)) return "POWER_GENERATION";
  return "UNKNOWN";
}

function pathMapping(
  path: HeaderPath,
  family: BbSchemaFamily,
): HeaderMapping {
  const sourceHeader = joinedLabels(path) || `Column ${path.cell.column}`;
  const domain = domainForPath(path);
  const familyAllowsValues =
    family === "CANONICAL_FAMILY" || family === "LEGACY_FAMILY_A";
  const transformation =
    "resolve semantic header; parse numeric value; preserve null and source provenance";
  const lowConfidence = family === "LEGACY_FAMILY_B" || family === "LEGACY_FAMILY_C";

  if (domain === "BIOMASS_STOCK")
    return {
      sourceHeader,
      sourceColumn: path.cell.column,
      canonicalField: "biomassStock",
      databaseField: "NO_DATABASE_TARGET",
      domain,
      confidence: "LOW",
      decision: "FUTURE_SCOPE_DATA",
      transformation: "record as FUTURE_SCOPE_DATA; never persist or send to dashboard",
    };
  if (domain === "DATE")
    return {
      sourceHeader,
      sourceColumn: path.cell.column,
      canonicalField: "readingDate / periodStart",
      databaseField: "date / period_start",
      domain,
      confidence: "HIGH",
      decision: "AUTO_MAP",
      transformation: "retain source date; validate against worksheet period; never auto-correct",
    };

  const mappings: Record<
    string,
    { canonicalField: string; databaseField: string }
  > = {
    HOP: { canonicalField: "hopDays", databaseField: "hop_readings.hop_days" },
    COAL_STOCK: {
      canonicalField: "coalStock.closingStock",
      databaseField: "coal_stock.closing_stock",
    },
    BIOMASS_RECEIPT: {
      canonicalField: "biomassReceipt.quantityTon",
      databaseField: "biomass_receipts.quantity_ton",
    },
    BIOMASS_CONSUMPTION: {
      canonicalField: "biomassConsumption.quantityTon",
      databaseField: "biomass_consumptions.quantity_ton",
    },
    COAL_RECEIPT: {
      canonicalField: "coalReceipt.quantityTon",
      databaseField: "coal_receipts.quantity_ton",
    },
    COAL_CONSUMPTION: {
      canonicalField: "coalConsumption.coalUsed",
      databaseField: "coal_consumption.coal_used",
    },
    SOLAR_RECEIPT: {
      canonicalField: "solarReceipt.quantityLiter",
      databaseField: "solar_receipts.quantity_liter",
    },
    SOLAR_CONSUMPTION: {
      canonicalField: "solarConsumption.quantityLiter",
      databaseField: "solar_consumptions.quantity_liter",
    },
    BIOMASS_TARGET: {
      canonicalField: "biomassTarget.targetTon",
      databaseField: "biomass_targets.target_ton",
    },
    BIOMASS_CUMULATIVE: {
      canonicalField: "biomassCumulative.cumulativeTon",
      databaseField: "biomass_cumulative_snapshots.cumulative_ton",
    },
    POWER_GENERATION: {
      canonicalField: "powerGeneration",
      databaseField: "power_generation.power_generation / average_load",
    },
  };
  const target = mappings[domain];
  if (!target)
    return {
      sourceHeader,
      sourceColumn: path.cell.column,
      canonicalField: "UNRESOLVED",
      databaseField: "NO_DATABASE_TARGET",
      domain,
      confidence: "LOW",
      decision: "UNMAPPED",
      transformation: "do not infer semantic meaning; retain for manual review",
    };

  const confidence: MappingConfidence = lowConfidence ? "LOW" : "HIGH";
  const decision: MappingDecision =
    familyAllowsValues && confidence === "HIGH" ? "AUTO_MAP" : "MANUAL_REVIEW";
  return {
    sourceHeader,
    sourceColumn: path.cell.column,
    canonicalField: target.canonicalField,
    databaseField: target.databaseField,
    domain,
    confidence,
    decision,
    transformation,
  };
}

export function mapHeaderPaths(
  parsed: DynamicParserResult,
  family: BbSchemaFamily,
) {
  return (parsed.structures[0]?.headerPaths ?? []).map((path) =>
    pathMapping(path, family),
  );
}

function rawDateFormat(raw: DynamicSheetValue): SourceDateFormat {
  if (typeof raw === "number") return "DAY_ONLY";
  if (typeof raw !== "string") return "UNKNOWN";
  const text = raw.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return "ISO_DATE";
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(text))
    return "DAY_MONTH_YEAR";
  if (/^\d{1,2}(?:\s|$)/.test(text)) return "DAY_ONLY";
  return "UNKNOWN";
}

function utcCalendarDateIsValid(date: string | null) {
  if (!date) return false;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const actualYear = Number(match[1]);
  const actualMonth = Number(match[2]);
  const day = Number(match[3]);
  if (actualMonth < 1 || actualMonth > 12) return false;
  const maxDay = new Date(Date.UTC(actualYear, actualMonth, 0)).getUTCDate();
  return day >= 1 && day <= maxDay;
}

function utcDateMatchesPeriod(date: string | null, year: number, month: number) {
  return Boolean(
    date?.startsWith(`${year}-${String(month).padStart(2, "0")}-`),
  );
}

export function validateWorksheetDates(input: {
  cells: readonly DateCellInput[];
  year: number;
  month: number;
}): DateValidationResult {
  const observations: SourceDateObservation[] = input.cells.map((cell) => {
    const day = parseDayValue(cell.rawValue);
    const sourceDate = dateFromRaw(cell.rawValue, input.month, input.year);
    return {
      row: cell.row,
      column: cell.column,
      address: cell.address,
      rawValue: cell.rawValue,
      sourceDate,
      day,
      format: rawDateFormat(cell.rawValue),
      valid: utcCalendarDateIsValid(sourceDate),
    };
  });
  const issues: DateValidationIssue[] = [];
  for (const observation of observations) {
    if (observation.day === null || !observation.sourceDate || !observation.valid) {
      issues.push({
        code: "INVALID_DATE",
        message: `${observation.address} contains an invalid source date; source value is preserved.`,
        rows: [observation.row],
      });
      continue;
    }
    if (!utcDateMatchesPeriod(observation.sourceDate, input.year, input.month))
      issues.push({
        code: "PERIOD_MISMATCH",
        message: `${observation.address} date period differs from worksheet period; source value is preserved.`,
        rows: [observation.row],
      });
  }
  const byDate = new Map<string, number[]>();
  for (const observation of observations) {
    if (!observation.valid || !observation.sourceDate) continue;
    const rows = byDate.get(observation.sourceDate) ?? [];
    rows.push(observation.row);
    byDate.set(observation.sourceDate, rows);
  }
  for (const [date, rows] of byDate) {
    if (rows.length > 1)
      issues.push({
        code: "DUPLICATE_DATE",
        message: `Source date ${date} occurs more than once; no row is selected as winner.`,
        rows,
      });
  }
  const formats = new Set(
    observations
      .filter((observation) => observation.rawValue !== null && observation.rawValue !== "")
      .map((observation) => observation.format),
  );
  if (formats.size > 1)
    issues.push({
      code: "DATE_FORMAT_VARIATION",
      message: `Multiple source date formats detected (${[...formats].join(", ")}); values are not rewritten.`,
      rows: observations.map((observation) => observation.row),
    });
  const uniqueValidDates = [...byDate.keys()].sort();
  // Invalid/shifted source dates are intentionally ignored by the import
  // candidate layer per the approved policy. Duplicate valid dates remain a
  // blocking identity collision because selecting a winner would change data.
  const blocking = issues.some((issue) => issue.code === "DUPLICATE_DATE");
  return {
    observations,
    uniqueValidDates,
    issues: uniqueIssues(issues),
    status: blocking ? "BLOCKED" : issues.length ? "REVIEW" : "PASS",
  };
}

function uniqueIssues(issues: readonly DateValidationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.message}|${issue.rows.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateCellsFor(parsed: DynamicParserResult): DateCellInput[] {
  const structure = parsed.structures[0];
  const dateColumn = structure?.dateColumn ?? null;
  if (!structure || dateColumn === null) return [];
  return structure.dataRows.map((row) => {
    const cell = parsed.scannedCells.find(
      (candidate) => candidate.row === row && candidate.column === dateColumn,
    );
    return (
      cell ?? {
        row,
        column: dateColumn,
        address: `${dateColumn}:${row}`,
        rawValue: null,
      }
    );
  });
}

function futureScopeFor(
  parsed: DynamicParserResult,
): FutureScopeObservation[] {
  const structure = parsed.structures[0];
  if (!structure) return [];
  return structure.headerPaths
    .filter((path) => path.isStock && path.resource === "biomass")
    .map((path) => {
      const values = structure.dataRows
        .map((row) =>
          parsed.scannedCells.find(
            (cell) => cell.row === row && cell.column === path.cell.column,
          ),
        )
        .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell));
      return {
        sourceHeader: joinedLabels(path),
        sourceColumn: path.cell.column,
        resource: path.resource,
        valueUnit: path.unit,
        numericCount: values.filter(
          (cell) => parseNumericValue(cell.rawValue).status === "numeric",
        ).length,
        nonEmptyCount: values.filter(
          (cell) => parseNumericValue(cell.rawValue).status !== "empty",
        ).length,
        status: "FUTURE_SCOPE_DATA" as const,
      };
    });
}

function normalizeRecord(row: ImportStagingRecord) {
  const unitCode = row.unitCode ? normalizeUnitIdentity(row.unitCode) : null;
  const supplier = row.supplierCode
    ? normalizeSupplierIdentity(row.supplierCode)
    : null;
  return {
    ...row,
    unitCode: unitCode ?? row.unitCode,
    supplierCode: supplier?.code ?? row.supplierCode,
  } satisfies ImportStagingRecord;
}

function recordNeedsUnit(row: ImportStagingRecord) {
  return [
    "biomass_consumption",
    "coal_consumption",
    "hop_reading",
  ].includes(row.entityType);
}

function mappedRecords(input: LegacyMappingInput, allowed: readonly string[]) {
  const rejected: ImportStagingRecord[] = [];
  const reviewRows: ImportStagingRecord[] = [];
  const records: ImportStagingRecord[] = [];
  for (const sourceRow of input.plan.stagingRows) {
    if (sourceRow.validationStatus === "REJECTED") {
      rejected.push(sourceRow);
      continue;
    }
    if (!allowed.includes(sourceRow.entityType)) {
      reviewRows.push(sourceRow);
      continue;
    }
    const row = normalizeRecord(sourceRow);
    if (recordNeedsUnit(row) && !normalizeUnitIdentity(row.unitCode)) {
      reviewRows.push(sourceRow);
      continue;
    }
    if (row.entityType === "biomass_receipt" && !normalizeSupplierIdentity(row.supplierCode)) {
      reviewRows.push(sourceRow);
      continue;
    }
    records.push(row);
  }
  return { records, rejected, reviewRows };
}

function duplicateClassification(
  rows: readonly ImportStagingRecord[],
): DuplicateClassification {
  const hashes = unique(rows.map((row) => contentHashForStagingRow(row)));
  if (hashes.length === 1) return "TRUE_DUPLICATE";
  return "BUSINESS_KEY_COLLISION";
}

export function classifyDuplicateRecords(
  rows: readonly ImportStagingRecord[],
): DuplicateGroup[] {
  const groups = new Map<string, ImportStagingRecord[]>();
  for (const row of rows) {
    const key = sourceKeyForStagingRow(row);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([sourceKey, values]) => ({
      sourceKey,
      sourceKeyPrefix: sourceKey.slice(0, 12),
      entityType: values[0].entityType,
      classification: duplicateClassification(values),
      sourceRows: values.map((row) => row.source.row),
      sourceCells: values.map((row) => row.source.cell),
      values: values.map((row) => row.normalizedValue),
      contentHashPrefixes: unique(
        values.map((row) => contentHashForStagingRow(row).slice(0, 12)),
      ),
    }));
}

function identitySummary(rows: readonly ImportStagingRecord[]) {
  const deterministic = rows.filter((row) => {
    if (!row.entityType) return false;
    if (["biomass_receipt", "coal_receipt", "solar_receipt", "biomass_cumulative"].includes(row.entityType))
      return Boolean(row.periodStart);
    if (row.entityType === "biomass_target") return Boolean(row.periodStart);
    return Boolean(row.readingDate);
  });
  return {
    candidateCount: rows.length,
    deterministicCount: deterministic.length,
    nonDeterministicCount: rows.length - deterministic.length,
    sourceKeyPrefixes: unique(rows.map((row) => sourceKeyForStagingRow(row).slice(0, 12))).slice(0, 20),
  };
}

function issue(
  code: string,
  message: string,
  severity: MappingIssueSeverity,
  sourceRows?: readonly number[],
): MappingIssue {
  return { code, message, severity, sourceRows };
}

function planIssueSeverity(code: string): MappingIssueSeverity {
  const blocking = new Set([
    "worksheet_invalid",
    "required_daily_columns_missing",
    "biomass_supplier_schema_incomplete",
    "biomass_supplier_receipt_empty",
    "coal_daily_empty",
    "coal_stock_daily_empty",
    "biomass_daily_empty",
    "solar_daily_empty",
    "hop_daily_empty",
    "solar_receipt_unresolved",
    "coal_receipt_unresolved",
    "biomass_target_does_not_match_70020",
    "biomass_cumulative_unresolved",
    "parser_errors",
    "ambiguous_fields",
    "daily_series_empty",
  ]);
  if (code === "biomass_supplier_schema_legacy") return "REVIEW";
  return blocking.has(code) ? "BLOCKING" : "REVIEW";
}

function issuesFor(
  input: LegacyMappingInput,
  family: BbSchemaFamily,
  records: readonly ImportStagingRecord[],
  rejected: readonly ImportStagingRecord[],
  reviewRows: readonly ImportStagingRecord[],
  dateValidation: DateValidationResult,
  futureScopeData: readonly FutureScopeObservation[],
  duplicateGroups: readonly DuplicateGroup[],
  identity: ReturnType<typeof identitySummary>,
) {
  const issues: MappingIssue[] = [];
  if (family === "LEGACY_FAMILY_B" || family === "LEGACY_FAMILY_C")
    issues.push(
      issue(
        "LOW_CONFIDENCE_SCHEMA",
        `${family} value semantics are not auto-mapped; owner approval is required before canonical records can be produced.`,
        "BLOCKING",
      ),
    );
  if (family === "UNKNOWN_FAMILY")
    issues.push(
      issue(
        "UNKNOWN_SCHEMA_FAMILY",
        "Worksheet schema is outside approved canonical/legacy profiles.",
        "BLOCKING",
      ),
    );
  for (const code of input.plan.blockingIssues)
    issues.push(issue(code, `Existing import plan reports ${code}.`, planIssueSeverity(code)));
  for (const dateIssue of dateValidation.issues) {
    const severity =
      dateIssue.code === "DUPLICATE_DATE"
        ? "BLOCKING"
        : dateIssue.code === "DATE_FORMAT_VARIATION"
          ? "REVIEW"
          : "WARNING";
    issues.push(issue(dateIssue.code, dateIssue.message, severity, dateIssue.rows));
  }
  if (duplicateGroups.length)
    issues.push(
      issue(
        "DUPLICATE_OR_COLLISION",
        `${duplicateGroups.length} source-key group(s) require classification; no source row is selected or removed.`,
        "BLOCKING",
        duplicateGroups.flatMap((group) => group.sourceRows.filter((row): row is number => row !== null)),
      ),
    );
  if (identity.nonDeterministicCount)
    issues.push(
      issue(
        "NON_DETERMINISTIC_IDENTITY",
        `${identity.nonDeterministicCount} candidate record(s) do not have sufficient date identity.`,
        "BLOCKING",
      ),
    );
  if (reviewRows.length)
    issues.push(
      issue(
        "UNMAPPED_RECORDS",
        `${reviewRows.length} source record(s) remain outside the approved auto-map entity set.`,
        "REVIEW",
      ),
    );
  if (rejected.length)
    issues.push(
      issue(
        "REJECTED_SOURCE_ROWS",
        `${rejected.length} source record(s) are rejected by the existing parser validation.`,
        "BLOCKING",
      ),
    );
  if (futureScopeData.length)
    issues.push(
      issue(
        "BIOMASS_STOCK_OUT_OF_SCOPE",
        `${futureScopeData.length} Biomass stock field(s) are recorded as FUTURE_SCOPE_DATA and excluded from persistence/dashboard mapping.`,
        "WARNING",
      ),
    );
  const target = input.plan.targetRows[0]?.targetTon ?? null;
  if (target !== null && target !== OFFICIAL_BIOMASS_TARGET)
    issues.push(
      issue(
        "HISTORICAL_TARGET_REVIEW",
        `Source target ${target} ton is preserved as historical/source value; it is not replaced with ${OFFICIAL_BIOMASS_TARGET} ton.`,
        "REVIEW",
      ),
    );
  const missingProvenance = records.filter(
    (row) => row.source.row === null || row.source.cell === null,
  ).length;
  if (missingProvenance)
    issues.push(
      issue(
        "PROVENANCE_GAP",
        `${missingProvenance} canonical candidate(s) have incomplete row/cell provenance in the existing staging contract.`,
        "REVIEW",
      ),
    );
  const unknownSuppliers = input.plan.receiptRows.filter(
    (row) => !normalizeSupplierIdentity(row.supplierCode),
  );
  if (unknownSuppliers.length)
    issues.push(
      issue(
        "SUPPLIER_IDENTITY_REVIEW",
        `${unknownSuppliers.length} supplier identity(ies) do not match the approved supplier pattern.`,
        "BLOCKING",
      ),
    );
  const patternSuppliers = input.plan.receiptRows.filter(
    (row) => normalizeSupplierIdentity(row.supplierCode)?.kind === "PATTERN",
  );
  if (patternSuppliers.length)
    issues.push(
      issue(
        "SUPPLIER_PATTERN_MAPPING",
        `${patternSuppliers.length} supplier identity(ies) use the accepted [material] [PT/CV] [company] pattern and remain separate from canonical suppliers until reviewed.`,
        "REVIEW",
      ),
    );
  return uniqueIssuesByCode(issues);
}

function uniqueIssuesByCode(issues: readonly MappingIssue[]) {
  const result = new Map<string, MappingIssue>();
  for (const current of issues) {
    const previous = result.get(current.code);
    if (!previous || severityRank(current.severity) > severityRank(previous.severity))
      result.set(current.code, current);
  }
  return [...result.values()];
}

function severityRank(value: MappingIssueSeverity) {
  return value === "BLOCKING" ? 3 : value === "REVIEW" ? 2 : 1;
}

function importGateFor(
  family: BbSchemaFamily,
  issues: readonly MappingIssue[],
  duplicateGroups: readonly DuplicateGroup[],
  identity: ReturnType<typeof identitySummary>,
) {
  if (
    family === "UNKNOWN_FAMILY" ||
    family === "LEGACY_FAMILY_B" ||
    family === "LEGACY_FAMILY_C"
  )
    return "BLOCKED" as const;
  if (
    issues.some((item) => item.severity === "BLOCKING") ||
    duplicateGroups.length ||
    identity.nonDeterministicCount
  )
    return "BLOCKED" as const;
  if (issues.some((item) => item.severity === "REVIEW"))
    return "IMPORT_AFTER_REVIEW" as const;
  return "IMPORT_READY" as const;
}

function runDryRun(
  records: readonly ImportStagingRecord[],
  rejected: readonly ImportStagingRecord[],
  reviewCount: number,
  issues: readonly MappingIssue[],
  existing: readonly ExistingSyncRowState[],
) {
  const classification = classifySyncRows(records, existing);
  return {
    insertCandidate: classification.inserted,
    updateCandidate: classification.updated,
    skipCandidate: classification.skipped,
    rejected: rejected.length,
    manualReview: reviewCount + classification.duplicates.length,
    blockingIssues: issues.filter((item) => item.severity === "BLOCKING").length,
    databaseWrites: 0 as const,
  };
}

export function mapLegacyWorksheet(input: LegacyMappingInput): LegacyMappingResult {
  const profile = mappingProfileFor(input.family);
  const schema = input.classification ?? {
    family: input.family,
    semanticCoverage: 1,
    labelCoverage: 1,
    reason: `Mapping profile ${profile.name} selected by the canonical comparison.`,
  } satisfies SchemaClassification;
  const headerMappings = mapHeaderPaths(input.parsed, input.family);
  const dateValidation = validateWorksheetDates({
    cells: dateCellsFor(input.parsed),
    year: input.parsed.worksheet.year,
    month: input.parsed.worksheet.month,
  });
  const futureScopeData = futureScopeFor(input.parsed);
  const mapped = mappedRecords(input, profile.autoMapEntityTypes);
  // Duplicate evidence is classified from every parser-produced staging row,
  // including records that are blocked for manual mapping. No winner is
  // selected and no source row is removed.
  const duplicateGroups = classifyDuplicateRecords(
    input.plan.stagingRows,
  );
  const identity = identitySummary(mapped.records);
  const issues = issuesFor(
    input,
    input.family,
    mapped.records,
    mapped.rejected,
    mapped.reviewRows,
    dateValidation,
    futureScopeData,
    duplicateGroups,
    identity,
  );
  const importGate = importGateFor(
    input.family,
    issues,
    duplicateGroups,
    identity,
  );
  return {
    worksheet: input.worksheet,
    family: input.family,
    profile,
    schema,
    headerMappings,
    canonicalRecords: mapped.records,
    rejectedRecords: mapped.rejected,
    manualReviewRecordCount: mapped.reviewRows.length,
    dateValidation,
    futureScopeData,
    duplicateGroups,
    identity,
    issues,
    dryRun: runDryRun(
      mapped.records,
      mapped.rejected,
      mapped.reviewRows.length,
      issues,
      input.existingSyncRows ?? [],
    ),
    importGate,
    plan: input.plan,
  };
}

export function canonicalSchemaClassification(
  canonical: SchemaSnapshot,
  current: SchemaSnapshot,
  worksheet: string,
) {
  return classifySchemaFamily(canonical, current, { worksheet });
}
