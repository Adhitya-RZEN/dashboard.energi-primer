import { PrismaClient } from "@prisma/client";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetRow,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  DYNAMIC_SCAN_RANGE,
} from "../src/services/google-sheets/dynamic/reader";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import type {
  GoogleSheetsImportPlan,
} from "../src/services/google-sheets/import/types";
import {
  classifySchemaFamily,
  mapLegacyWorksheet,
} from "../src/services/google-sheets/legacy-mapping/index";
import {
  BB_CANONICAL_WORKSHEET,
  OFFICIAL_BIOMASS_TARGET,
} from "../src/services/google-sheets/legacy-mapping/profiles";
import type {
  BbSchemaFamily,
  LegacyMappingResult,
} from "../src/services/google-sheets/legacy-mapping/types";
import type {
  DynamicParserResult,
} from "../src/services/google-sheets/dynamic/types";
import {
  buildSchemaSnapshot,
  type SchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";
import { withSyncRetry } from "../src/services/google-sheets/sync/retry";

// Prisma error events can contain provider/endpoint details; reports use the
// script's safe error classifier instead.
const prisma = new PrismaClient({ log: [] });
const REQUEST_DELAY_MS = 1_500;
const MAX_RETRY_ATTEMPTS = 3;
const IMPORT_START_YEAR = 2023;
const EXPECTED_BB_WORKSHEET_COUNT = 43;
const EXPECTED_LEGACY_WORKSHEET_COUNT = 42;

type DatabaseSnapshot = Record<string, number>;

type RegistryRow = {
  id: bigint;
  worksheetKey: string;
  worksheetTitle: string;
};

type ExistingState = {
  sourceKey: string;
  contentHash: string;
};

type DatabaseState = {
  registryByKey: ReadonlyMap<string, RegistryRow>;
  registryByTitle: ReadonlyMap<string, RegistryRow>;
  statesByWorksheetId: ReadonlyMap<bigint, readonly ExistingState[]>;
  errorCode: string | null;
};

type ReadTarget = {
  metadata: GoogleSheetsWorksheetMetadata;
  rows: GoogleSheetRow[];
  parsed: DynamicParserResult;
  plan: GoogleSheetsImportPlan;
  schema: SchemaSnapshot;
};

type WorksheetReport = {
  worksheet: string;
  sheetId: string;
  index: number | null;
  family: BbSchemaFamily;
  semanticCoverage: number;
  labelCoverage: number;
  importGate: "IMPORT_READY" | "IMPORT_AFTER_REVIEW" | "BLOCKED";
  planStatus: "READY_FOR_IMPORT" | "NEEDS_REVIEW" | null;
  sourceRows: number;
  scannedCells: number;
  stagingRows: number;
  candidateRecords: number;
  insertCandidate: number;
  updateCandidate: number;
  skipCandidate: number;
  rejected: number;
  manualReview: number;
  blockingIssueCount: number;
  blockingIssues: string[];
  issueCodes: string[];
  dateIssueCodes: string[];
  futureScopeDataFields: number;
  futureScopeNumericValues: number;
  duplicateGroupCount: number;
  duplicateClassifications: Record<string, number>;
  parserErrors: number;
  parserAmbiguous: number;
  readStatus: "READ" | "READ_FAILED" | "EMPTY";
  readErrorCode: string | null;
};

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function errorCode(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) return error.code;
  return "unknown";
}

function isInImportScope(worksheet: GoogleSheetsWorksheetMetadata) {
  const period = parseBBWorksheetName(worksheet.title);
  return period !== null && period.year >= IMPORT_START_YEAR;
}

function emptyDatabaseState(errorCodeValue: string | null = null): DatabaseState {
  return {
    registryByKey: new Map(),
    registryByTitle: new Map(),
    statesByWorksheetId: new Map(),
    errorCode: errorCodeValue,
  };
}

async function databaseSnapshot(): Promise<DatabaseSnapshot | null> {
  try {
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
  } catch {
    return null;
  }
}

async function loadDatabaseState(): Promise<DatabaseState> {
  try {
    const [registry, rowStates] = await Promise.all([
      prisma.syncWorksheet.findMany({
        select: { id: true, worksheetKey: true, worksheetTitle: true },
      }),
      prisma.syncRowState.findMany({
        select: { worksheetId: true, sourceKey: true, contentHash: true },
      }),
    ]);
    const registryByKey = new Map(registry.map((row) => [row.worksheetKey, row]));
    const registryByTitle = new Map(registry.map((row) => [row.worksheetTitle, row]));
    const statesByWorksheetId = new Map<bigint, ExistingState[]>();
    for (const state of rowStates) {
      const values = statesByWorksheetId.get(state.worksheetId) ?? [];
      values.push({ sourceKey: state.sourceKey, contentHash: state.contentHash });
      statesByWorksheetId.set(state.worksheetId, values);
    }
    return { registryByKey, registryByTitle, statesByWorksheetId, errorCode: null };
  } catch {
    return emptyDatabaseState("database_unavailable");
  }
}

function readResult(
  worksheet: GoogleSheetsWorksheetMetadata,
  rows: GoogleSheetRow[],
  parsed: DynamicParserResult,
) {
  const period = parseBBWorksheetName(worksheet.title);
  if (!period) throw new Error("unsupported_worksheet");
  return {
    requested: {
      month: period.month,
      year: period.year,
      worksheet: worksheet.title,
    },
    effective: {
      month: period.month,
      year: period.year,
      worksheet: worksheet.title,
    },
    isFallback: false,
    fallbackIndex: 0,
    attemptedWorksheets: [worksheet.title],
    parsed,
  };
}

async function readTarget(
  worksheet: GoogleSheetsWorksheetMetadata,
): Promise<ReadTarget> {
  const period = parseBBWorksheetName(worksheet.title);
  if (!period) throw new Error("unsupported_worksheet");
  const result = await withSyncRetry(
    () => readGoogleSheetsRange(worksheet.title, DYNAMIC_SCAN_RANGE),
    {
      maxAttempts: MAX_RETRY_ATTEMPTS,
      baseDelayMs: 500,
      maxDelayMs: 2_000,
    },
  );
  const parsed = parseDynamicWorksheet(result.rows, {
    worksheetName: worksheet.title,
    month: period.month,
    year: period.year,
    rowOffset: 1,
    columnOffset: 1,
  });
  const plan = buildGoogleSheetsImportPlanFromReadResult(
    readResult(worksheet, result.rows, parsed),
  );
  return {
    metadata: worksheet,
    rows: result.rows,
    parsed,
    plan,
    schema: buildSchemaSnapshot(parsed),
  };
}

function classificationFor(
  canonical: ReadTarget | null,
  current: ReadTarget,
) {
  if (!canonical)
    return {
      family: "UNKNOWN_FAMILY" as const,
      semanticCoverage: 0,
      labelCoverage: 0,
      reason: "Canonical worksheet could not be read; comparison is blocked.",
    };
  return classifySchemaFamily(canonical.schema, current.schema, {
    worksheet: current.metadata.title,
  });
}

function duplicateCounts(mapping: LegacyMappingResult) {
  const counts: Record<string, number> = {};
  for (const group of mapping.duplicateGroups)
    counts[group.classification] = (counts[group.classification] ?? 0) + 1;
  return counts;
}

function worksheetReport(
  target: ReadTarget,
  mapping: LegacyMappingResult,
): WorksheetReport {
  const blockingIssues = mapping.issues
    .filter((item) => item.severity === "BLOCKING")
    .map((item) => item.code);
  return {
    worksheet: target.metadata.title,
    sheetId: target.metadata.sheetId,
    index: target.metadata.index,
    family: mapping.family,
    semanticCoverage: mapping.schema.semanticCoverage,
    labelCoverage: mapping.schema.labelCoverage,
    importGate: mapping.importGate,
    planStatus: mapping.plan.status,
    sourceRows: target.rows.length,
    scannedCells: target.parsed.diagnostics.scannedCellCount,
    stagingRows: target.plan.stagingRows.length,
    candidateRecords: mapping.canonicalRecords.length,
    insertCandidate: mapping.dryRun.insertCandidate,
    updateCandidate: mapping.dryRun.updateCandidate,
    skipCandidate: mapping.dryRun.skipCandidate,
    rejected: mapping.dryRun.rejected,
    manualReview: mapping.dryRun.manualReview,
    blockingIssueCount: blockingIssues.length,
    blockingIssues: [...new Set(blockingIssues)],
    issueCodes: [...new Set(mapping.issues.map((item) => item.code))],
    dateIssueCodes: [...new Set(mapping.dateValidation.issues.map((item) => item.code))],
    futureScopeDataFields: mapping.futureScopeData.length,
    futureScopeNumericValues: mapping.futureScopeData.reduce(
      (total, item) => total + item.numericCount,
      0,
    ),
    duplicateGroupCount: mapping.duplicateGroups.length,
    duplicateClassifications: duplicateCounts(mapping),
    parserErrors: target.parsed.diagnostics.errors.length,
    parserAmbiguous: target.parsed.diagnostics.ambiguous.length,
    readStatus: "READ",
    readErrorCode: null,
  };
}

function failedWorksheetReport(
  worksheet: GoogleSheetsWorksheetMetadata,
  readErrorCode: string,
): WorksheetReport {
  return {
    worksheet: worksheet.title,
    sheetId: worksheet.sheetId,
    index: worksheet.index,
    family: "UNKNOWN_FAMILY",
    semanticCoverage: 0,
    labelCoverage: 0,
    importGate: "BLOCKED",
    planStatus: null,
    sourceRows: 0,
    scannedCells: 0,
    stagingRows: 0,
    candidateRecords: 0,
    insertCandidate: 0,
    updateCandidate: 0,
    skipCandidate: 0,
    rejected: 0,
    manualReview: 0,
    blockingIssueCount: 1,
    blockingIssues: [`read_${readErrorCode}`],
    issueCodes: [`read_${readErrorCode}`],
    dateIssueCodes: [],
    futureScopeDataFields: 0,
    futureScopeNumericValues: 0,
    duplicateGroupCount: 0,
    duplicateClassifications: {},
    parserErrors: 0,
    parserAmbiguous: 0,
    readStatus: "READ_FAILED",
    readErrorCode,
  };
}

function emptyWorksheetReport(
  worksheet: GoogleSheetsWorksheetMetadata,
): WorksheetReport {
  return {
    ...failedWorksheetReport(worksheet, "empty_range"),
    blockingIssues: ["empty_range"],
    blockingIssueCount: 1,
    readStatus: "EMPTY",
  };
}

function familySummary(worksheets: readonly WorksheetReport[]) {
  const result: Record<string, {
    worksheetCount: number;
    sourceRows: number;
    stagingRows: number;
    candidateRecords: number;
    insertCandidate: number;
    updateCandidate: number;
    skipCandidate: number;
    rejected: number;
    manualReview: number;
    duplicateGroups: number;
    dateIssues: number;
    futureScopeDataFields: number;
  }> = {};
  for (const worksheet of worksheets) {
    const current = result[worksheet.family] ?? {
      worksheetCount: 0,
      sourceRows: 0,
      stagingRows: 0,
      candidateRecords: 0,
      insertCandidate: 0,
      updateCandidate: 0,
      skipCandidate: 0,
      rejected: 0,
      manualReview: 0,
      duplicateGroups: 0,
      dateIssues: 0,
      futureScopeDataFields: 0,
    };
    current.worksheetCount += 1;
    current.sourceRows += worksheet.sourceRows;
    current.stagingRows += worksheet.stagingRows;
    current.candidateRecords += worksheet.candidateRecords;
    current.insertCandidate += worksheet.insertCandidate;
    current.updateCandidate += worksheet.updateCandidate;
    current.skipCandidate += worksheet.skipCandidate;
    current.rejected += worksheet.rejected;
    current.manualReview += worksheet.manualReview;
    current.duplicateGroups += worksheet.duplicateGroupCount;
    current.dateIssues += worksheet.dateIssueCodes.length;
    current.futureScopeDataFields += worksheet.futureScopeDataFields;
    result[worksheet.family] = current;
  }
  return result;
}

function totals(worksheets: readonly WorksheetReport[]) {
  return worksheets.reduce(
    (total, worksheet) => ({
      sourceRows: total.sourceRows + worksheet.sourceRows,
      scannedCells: total.scannedCells + worksheet.scannedCells,
      stagingRows: total.stagingRows + worksheet.stagingRows,
      candidateRecords: total.candidateRecords + worksheet.candidateRecords,
      insertCandidate: total.insertCandidate + worksheet.insertCandidate,
      updateCandidate: total.updateCandidate + worksheet.updateCandidate,
      skipCandidate: total.skipCandidate + worksheet.skipCandidate,
      rejected: total.rejected + worksheet.rejected,
      manualReview: total.manualReview + worksheet.manualReview,
      duplicateGroups: total.duplicateGroups + worksheet.duplicateGroupCount,
      blockingIssues: total.blockingIssues + worksheet.blockingIssueCount,
      databaseWrites: 0 as const,
    }),
    {
      sourceRows: 0,
      scannedCells: 0,
      stagingRows: 0,
      candidateRecords: 0,
      insertCandidate: 0,
      updateCandidate: 0,
      skipCandidate: 0,
      rejected: 0,
      manualReview: 0,
      duplicateGroups: 0,
      blockingIssues: 0,
      databaseWrites: 0 as const,
    },
  );
}

function duplicateClassificationTotals(worksheets: readonly WorksheetReport[]) {
  const result: Record<string, number> = {};
  for (const worksheet of worksheets)
    for (const [classification, count] of Object.entries(worksheet.duplicateClassifications))
      result[classification] = (result[classification] ?? 0) + count;
  return result;
}

async function main() {
  const before = await databaseSnapshot();
  const worksheetReports: WorksheetReport[] = [];
  let metadataCount = 0;
  let nonBbWorksheetCount = 0;
  let outOfScopeBbWorksheetCount = 0;
  let readFailureCount = 0;
  let canonicalTarget: ReadTarget | null = null;
  let canonicalMapping: LegacyMappingResult | null = null;
  let fatalErrorCode: string | null = null;
  const databaseState = await loadDatabaseState();

  try {
    const metadata = await listGoogleSheetsWorksheets();
    metadataCount = metadata.length;
    const recognizedBbWorksheets = metadata.filter((worksheet) =>
      Boolean(parseBBWorksheetName(worksheet.title)),
    );
    outOfScopeBbWorksheetCount = recognizedBbWorksheets.filter(
      (worksheet) => !isInImportScope(worksheet),
    ).length;
    const bbWorksheets = recognizedBbWorksheets
      .filter((worksheet) => isInImportScope(worksheet))
      .sort((left, right) => {
        if (left.title === BB_CANONICAL_WORKSHEET) return -1;
        if (right.title === BB_CANONICAL_WORKSHEET) return 1;
        const leftPeriod = parseBBWorksheetName(left.title);
        const rightPeriod = parseBBWorksheetName(right.title);
        return (
          (leftPeriod?.year ?? 0) - (rightPeriod?.year ?? 0) ||
          (leftPeriod?.month ?? 0) - (rightPeriod?.month ?? 0) ||
          (left.index ?? 0) - (right.index ?? 0)
        );
      });
    nonBbWorksheetCount = metadata.length - recognizedBbWorksheets.length;
    const duplicateTitles = new Set(
      bbWorksheets
        .map((worksheet) => worksheet.title)
        .filter(
          (title, index, titles) => titles.indexOf(title) !== index,
        ),
    );

    for (let index = 0; index < bbWorksheets.length; index += 1) {
      const metadataItem = bbWorksheets[index];
      if (index > 0) await sleep(REQUEST_DELAY_MS);
      if (duplicateTitles.has(metadataItem.title)) {
        worksheetReports.push({
          ...failedWorksheetReport(metadataItem, "duplicate_worksheet_title"),
          blockingIssues: ["duplicate_worksheet_title"],
        });
        readFailureCount += 1;
        continue;
      }
      let target: ReadTarget;
      try {
        target = await readTarget(metadataItem);
      } catch (error) {
        const code = errorCode(error);
        worksheetReports.push(failedWorksheetReport(metadataItem, code));
        readFailureCount += 1;
        continue;
      }
      if (target.rows.length === 0) {
        worksheetReports.push(emptyWorksheetReport(metadataItem));
        readFailureCount += 1;
        continue;
      }
      if (metadataItem.title === BB_CANONICAL_WORKSHEET) canonicalTarget = target;
      const classification = classificationFor(canonicalTarget, target);
      const registry =
        databaseState.registryByKey.get(metadataItem.sheetId) ??
        databaseState.registryByTitle.get(metadataItem.title);
      const existing = registry
        ? databaseState.statesByWorksheetId.get(registry.id) ?? []
        : [];
      const mapping = mapLegacyWorksheet({
        worksheet: metadataItem.title,
        family: classification.family,
        parsed: target.parsed,
        plan: target.plan,
        schema: target.schema,
        classification,
        existingSyncRows: existing,
      });
      if (metadataItem.title === BB_CANONICAL_WORKSHEET)
        canonicalMapping = mapping;
      worksheetReports.push(worksheetReport(target, mapping));
    }
  } catch (error) {
    fatalErrorCode = errorCode(error);
  }

  const after = await databaseSnapshot();
  const databaseSnapshotStable = Boolean(
    before && after && JSON.stringify(before) === JSON.stringify(after),
  );
  const canonicalRegression = canonicalMapping
    ? {
        readStatus: "READ",
        family: canonicalMapping.family,
        planStatus: canonicalMapping.plan.status,
        rows: canonicalMapping.plan.summary.totalRows,
        insertCandidate: canonicalMapping.dryRun.insertCandidate,
        updateCandidate: canonicalMapping.dryRun.updateCandidate,
        skipCandidate: canonicalMapping.dryRun.skipCandidate,
        rejected: canonicalMapping.dryRun.rejected,
        failed: canonicalMapping.dryRun.rejected,
        importGate: canonicalMapping.importGate,
        expected: {
          rows: 352,
          insertCandidate: 0,
          updateCandidate: 0,
          skipCandidate: 352,
          rejected: 0,
          failed: 0,
        },
        matchesExpected:
          canonicalMapping.plan.summary.totalRows === 352 &&
          canonicalMapping.dryRun.insertCandidate === 0 &&
          canonicalMapping.dryRun.updateCandidate === 0 &&
          canonicalMapping.dryRun.skipCandidate === 352 &&
          canonicalMapping.dryRun.rejected === 0,
      }
    : {
        readStatus: "READ_FAILED",
        family: "UNKNOWN_FAMILY",
        planStatus: null,
        rows: 0,
        insertCandidate: 0,
        updateCandidate: 0,
        skipCandidate: 0,
        rejected: 0,
        failed: 1,
        importGate: "BLOCKED",
        expected: {
          rows: 352,
          insertCandidate: 0,
          updateCandidate: 0,
          skipCandidate: 352,
          rejected: 0,
          failed: 0,
        },
        matchesExpected: false,
      };
  const familyCounts = worksheetReports.reduce<Record<string, number>>(
    (counts, worksheet) => {
      counts[worksheet.family] = (counts[worksheet.family] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const gateCounts = worksheetReports.reduce<Record<string, number>>(
    (counts, worksheet) => {
      counts[worksheet.importGate] = (counts[worksheet.importGate] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const hardBlock =
    fatalErrorCode !== null ||
    readFailureCount > 0 ||
    !databaseSnapshotStable ||
    !before ||
    !after ||
    !canonicalRegression.matchesExpected ||
    bbWorksheetCount(worksheetReports) !== EXPECTED_BB_WORKSHEET_COUNT ||
    worksheetReports.some((worksheet) => worksheet.importGate === "BLOCKED");
  const reviewStatus =
    hardBlock
      ? fatalErrorCode || readFailureCount > 0 || !databaseSnapshotStable || !canonicalRegression.matchesExpected
        ? "BLOCKED"
        : "PASS_WITH_REVIEW"
      : "PASS";

  const output = {
    mode: "bb-legacy-mapping-dry-run",
    generatedAt: new Date().toISOString(),
    status: reviewStatus,
    scope: {
      totalWorksheetsDiscovered: metadataCount,
      bbWorksheets: bbWorksheetCount(worksheetReports),
      nonBbWorksheets: nonBbWorksheetCount,
      outOfScopeBbWorksheets: outOfScopeBbWorksheetCount,
      expectedBbWorksheets: EXPECTED_BB_WORKSHEET_COUNT,
      expectedLegacyWorksheets: EXPECTED_LEGACY_WORKSHEET_COUNT,
      importStartYear: IMPORT_START_YEAR,
      canonicalWorksheet: BB_CANONICAL_WORKSHEET,
      officialBiomassTargetTon: OFFICIAL_BIOMASS_TARGET,
    },
    databaseWrites: 0,
    databaseSnapshotStable,
    databaseStateRead: databaseState.errorCode ? "UNAVAILABLE" : "READ_ONLY",
    databaseStateErrorCode: databaseState.errorCode,
    fatalErrorCode,
    readFailureCount,
    familyCounts,
    gateCounts,
    duplicateClassificationTotals: duplicateClassificationTotals(worksheetReports),
    totals: totals(worksheetReports),
    canonicalRegression,
    familySummary: familySummary(worksheetReports),
    worksheets: worksheetReports,
  };

  const compact = process.argv.includes("--compact");
  process.stdout.write(`${JSON.stringify(output, null, compact ? 0 : 2)}\n`);
  process.exitCode = reviewStatus === "BLOCKED" ? 1 : 0;
}

function bbWorksheetCount(worksheets: readonly WorksheetReport[]) {
  return worksheets.length;
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
