import "server-only";

import {
  getGoogleSheetsConfig,
  listGoogleSheetsWorksheets,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import {
  readAndParseDynamicWorksheet,
  type DynamicWorksheetReadResult,
} from "@/services/google-sheets/dynamic/reader";
import {
  dateFromRaw,
  isValidDateForPeriod,
  parseDayValue,
  parseNumericValue,
} from "@/services/google-sheets/dynamic/validators";
import type {
  DynamicParserResult,
  DynamicSheetValue,
} from "@/services/google-sheets/dynamic/types";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "@/services/google-sheets/import/plan";
import {
  approvedMappingContractForWorksheet,
  mappingApprovalForContract,
  type CanonicalImportPlan,
} from "@/services/google-sheets/canonical/index";
import {
  buildTargetAwareCanonicalPlan,
} from "./canonical-target-planning";
import {
  juliCanaryScopeForCompatibilityPlan,
  JULI26_CANARY_SCOPE_ID,
} from "./juli-canary-scope";
import {
  JULI26_TARGET_PROVENANCE_RESOLUTION,
} from "../canonical/target-state";
import type {
  GoogleSheetsImportPlan,
  ImportStagingRecord,
} from "@/services/google-sheets/import/types";

import { classifySyncRows, type SyncClassification } from "./change-detection";
import { contentHashForStagingRows } from "./identity";
import { stableGoogleSheetsSourceKey } from "./discovery";
import {
  evaluateAutomaticWorksheet,
  isAfterCanonicalBBWorksheet,
  isCanonicalBBWorksheet,
  isAutomaticWorksheetReviewRetryable,
  resolveApprovedCanonicalSchema,
} from "./bb-policy";
import { BB_CANONICAL_WORKSHEET } from "@/services/google-sheets/legacy-mapping/profiles";
import {
  buildSchemaSnapshot,
  detectSchemaChange,
  type SchemaChangeResult,
  type SchemaSnapshot,
} from "./schema-detection";
import {
  normalizeWorksheetName,
  parseBBWorksheetName,
} from "@/services/google-sheets/dynamic/worksheet-resolver";

export type WorksheetValidationIssue = {
  row: number | null;
  field: string;
  reason: string;
  value: string | null;
};

export type WorksheetPreflightResult = {
  status: "READY" | "BLOCKED";
  sourceKey: string;
  worksheetKey: string;
  expectedPlanFingerprint: string;
  sourceRange: string;
  spreadsheet: {
    status: "PASS";
    configured: true;
  };
  worksheet: {
    status: "PASS" | "BLOCKED";
    requested: string;
    effective: string;
    sheetId: string;
    rowCount: number | null;
    known: boolean;
    registryStatus: string | null;
  };
  mapping: {
    status: "PASS" | "BLOCKED";
    schemaClassification: string;
    schemaHash: string;
    blockers: readonly string[];
    warnings: readonly string[];
  };
  validation: {
    status: "PASS" | "BLOCKED";
    sourceRows: number;
    candidateRecords: number;
    validRecords: number;
    invalidRows: number;
    issues: readonly WorksheetValidationIssue[];
    blockers: readonly string[];
    warnings: readonly string[];
  };
  classification: {
    newRecords: number;
    existingRecords: number;
    inserted: number;
    updated: number;
    skipped: number;
    potentialDuplicates: number;
  };
  targetState: {
    status: "PASS" | "BLOCKED";
    statesRead: number;
    lookupQueries: number;
    durationMs: number;
    blockers: readonly string[];
  };
  targetDiff: {
    insert: number;
    update: number;
    noOp: number;
    skip: number;
    block: number;
    blockers: readonly string[];
  };
  canary: {
    enabled: boolean;
    scopeId: typeof JULI26_CANARY_SCOPE_ID | null;
    sourceRecords: number;
    selectedRecords: number;
  };
  plan: GoogleSheetsImportPlan;
  /** The plan admitted to the canonical writer; full source plan remains in `plan`. */
  executionPlan: GoogleSheetsImportPlan;
  schemaSnapshot: SchemaSnapshot;
  canonicalPlan: CanonicalImportPlan | null;
  canonicalPlanError: string | null;
};

export class WorksheetPreflightError extends Error {
  readonly code:
    | "WORKSHEET_NOT_FOUND"
    | "WORKSHEET_AMBIGUOUS"
    | "WORKSHEET_READ_FAILED";

  constructor(
    code: WorksheetPreflightError["code"],
    message: string,
  ) {
    super(message);
    this.name = "WorksheetPreflightError";
    this.code = code;
  }
}

function safeCellValue(value: DynamicSheetValue | undefined) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, 160);
}

function addIssue(
  issues: WorksheetValidationIssue[],
  issue: WorksheetValidationIssue,
) {
  const duplicate = issues.some(
    (existing) =>
      existing.row === issue.row &&
      existing.field === issue.field &&
      existing.reason === issue.reason &&
      existing.value === issue.value,
  );
  if (!duplicate) issues.push(issue);
}

function cellAt(parsed: DynamicParserResult, row: number, column: number | null) {
  return column === null
    ? null
    : parsed.scannedCells.find(
        (cell) => cell.row === row && cell.column === column,
      ) ?? null;
}

function validationIssuesForParser(
  parsed: DynamicParserResult,
): WorksheetValidationIssue[] {
  const issues: WorksheetValidationIssue[] = [];
  for (const error of parsed.diagnostics.errors) {
    addIssue(issues, {
      row: null,
      field: "worksheet",
      reason: error,
      value: null,
    });
  }
  for (const field of parsed.diagnostics.ambiguous) {
    addIssue(issues, {
      row: null,
      field,
      reason: "Semantic mapping is ambiguous and requires review.",
      value: null,
    });
  }

  const structure = parsed.structures[0];
  if (!structure) {
    addIssue(issues, {
      row: null,
      field: "structure",
      reason: "Semantic worksheet structure is unavailable.",
      value: null,
    });
    return issues;
  }

  const dataRows = new Set(structure.dataRows);
  const headerRows = new Set(structure.headerRows);
  if (structure.dateColumn !== null) {
    const orderedDataRows = [...dataRows].sort((left, right) => left - right);
    const firstDataRow = orderedDataRows[0];
    const lastDataRow = orderedDataRows.at(-1);
    if (firstDataRow === undefined || lastDataRow === undefined) return issues;
    const candidateRows = new Set(
      parsed.scannedCells
        .filter(
          (cell) =>
            cell.row >= firstDataRow &&
            cell.row <= lastDataRow &&
            cell.normalizedValue.length > 0 &&
            (cell.column === structure.dateColumn ||
              Object.values(parsed.dailyColumns).includes(cell.column)),
        )
        .map((cell) => cell.row),
    );
    // A newly appended daily row can sit just after the last valid row. Extend
    // only through contiguous non-empty date cells so later dashboard tables
    // are not mistaken for daily source rows.
    for (let row = lastDataRow + 1; ; row += 1) {
      const dateCell = cellAt(parsed, row, structure.dateColumn);
      if (!dateCell || dateCell.normalizedValue.length === 0) break;
      candidateRows.add(row);
    }
    for (const row of [...candidateRows].sort((left, right) => left - right)) {
      if (headerRows.has(row) || dataRows.has(row)) continue;
      const dateCell = cellAt(parsed, row, structure.dateColumn);
      if (!dateCell || dateCell.normalizedValue.length === 0) {
        addIssue(issues, {
          row,
          field: "date",
          reason: "Daily source row has no date value.",
          value: null,
        });
        continue;
      }
      const rawDay = parseDayValue(dateCell.rawValue);
      const parsedDate = dateFromRaw(
        dateCell.rawValue,
        parsed.worksheet.month,
        parsed.worksheet.year,
      );
      addIssue(issues, {
        row,
        field: "date",
        reason:
          rawDay === null || !isValidDateForPeriod(
            parsedDate,
            parsed.worksheet.month,
            parsed.worksheet.year,
          )
            ? "Date is malformed or outside the worksheet period."
            : "Date row could not be classified as a daily source row.",
        value: safeCellValue(dateCell.rawValue),
      });
    }
  }

  const numericColumns = Object.entries(parsed.dailyColumns).filter(
    ([field, column]) => field !== "date" && column !== null,
  ) as [string, number][];
  for (const row of structure.dataRows) {
    for (const [field, column] of numericColumns) {
      const cell = cellAt(parsed, row, column);
      if (!cell || cell.normalizedValue.length === 0) continue;
      if (parseNumericValue(cell.rawValue).status === "malformed") {
        addIssue(issues, {
          row,
          field,
          reason: "Numeric value is malformed.",
          value: safeCellValue(cell.rawValue),
        });
      }
    }
  }

  for (const [field, resolved] of Object.entries(parsed.normalized.metrics)) {
    if (resolved.status !== "malformed") continue;
    const cell = resolved.source
      ? parsed.scannedCells.find((candidate) => candidate.address === resolved.source?.address)
      : null;
    addIssue(issues, {
      row: cell?.row ?? null,
      field,
      reason: resolved.note ?? "Mapped value is malformed.",
      value: safeCellValue(cell?.rawValue),
    });
  }
  return issues;
}

export function collectWorksheetValidationIssues(
  parsed: DynamicParserResult,
) {
  return validationIssuesForParser(parsed);
}

function schemaBlockers(
  worksheetTitle: string,
  schemaSnapshot: SchemaSnapshot,
  previousSchema: string | null,
  canonicalSchema: string | null,
) {
  const blockers: string[] = [];
  let schemaClassification: string;
  let schemaChange: SchemaChangeResult;
  const automatic = isAfterCanonicalBBWorksheet(worksheetTitle)
    ? evaluateAutomaticWorksheet(worksheetTitle, schemaSnapshot, {
        canonicalSchema,
      })
    : null;

  if (automatic) {
    schemaClassification = automatic.gate;
    schemaChange = automatic.schemaChange ??
      detectSchemaChange(previousSchema, schemaSnapshot);
    if (!automatic.allowed) blockers.push(`schema_${automatic.gate.toLowerCase()}`);
  } else {
    schemaChange = detectSchemaChange(
      previousSchema,
      schemaSnapshot,
      isCanonicalBBWorksheet(worksheetTitle)
        ? { allowObservedValueTypeDrift: true }
        : {},
    );
    schemaClassification = schemaChange.type;
  }
  if (schemaChange.changed) blockers.push(`schema_${schemaChange.type.toLowerCase()}`);
  return {
    blockers: [...new Set(blockers)],
    schemaClassification,
  };
}

function sourceRowsForPlan(
  plan: GoogleSheetsImportPlan,
  parsed: DynamicParserResult,
  issues: readonly WorksheetValidationIssue[],
) {
  const dailyRows = new Set(parsed.structures[0]?.dataRows ?? []);
  for (const issue of issues) if (issue.row !== null) dailyRows.add(issue.row);
  return Math.max(dailyRows.size, plan.summary.dailyRows);
}

function validRecordCount(
  stagingRows: readonly ImportStagingRecord[],
  invalidRows: ReadonlySet<number>,
) {
  return stagingRows.filter(
    (row) => row.validationStatus !== "REJECTED" &&
      (row.source.row === null || !invalidRows.has(row.source.row)),
  ).length;
}

export async function prepareWorksheetPreflight(input: {
  worksheet: string;
  canary?: true;
}): Promise<WorksheetPreflightResult> {
  const requestedWorksheet = input.worksheet.trim();
  if (!requestedWorksheet)
    throw new WorksheetPreflightError(
      "WORKSHEET_NOT_FOUND",
      "An explicit worksheet is required.",
    );

  const config = getGoogleSheetsConfig();
  const metadata = await listGoogleSheetsWorksheets();
  const matches = metadata.filter(
    (worksheet) =>
      worksheet.title.trim().toLocaleLowerCase("en-US") ===
      requestedWorksheet.toLocaleLowerCase("en-US"),
  );
  if (matches.length === 0)
    throw new WorksheetPreflightError(
      "WORKSHEET_NOT_FOUND",
      "Requested worksheet was not found in the configured spreadsheet.",
    );
  if (matches.length !== 1)
    throw new WorksheetPreflightError(
      "WORKSHEET_AMBIGUOUS",
      "Requested worksheet title is not unique in the configured spreadsheet.",
    );
  const worksheetMetadata = matches[0];
  if (!worksheetMetadata)
    throw new WorksheetPreflightError(
      "WORKSHEET_NOT_FOUND",
      "Requested worksheet metadata was not returned.",
    );

  const sourceKey = stableGoogleSheetsSourceKey(config.spreadsheetId);
  const source = await prisma.syncSource.findUnique({
    where: { sourceKey },
    select: {
      id: true,
      worksheets: {
        where: { worksheetKey: worksheetMetadata.sheetId },
        select: {
          id: true,
          worksheetKey: true,
          worksheetTitle: true,
          status: true,
          schemaHash: true,
          schemaSnapshot: true,
        },
      },
    },
  });
  const registeredWorksheet = source?.worksheets[0] ?? null;

  const mapping = approvedMappingContractForWorksheet(worksheetMetadata.title);
  const mappingApproval = mapping
    ? mappingApprovalForContract(mapping)
    : undefined;

  let readResult: DynamicWorksheetReadResult;
  try {
    readResult = await readAndParseDynamicWorksheet(
      worksheetMetadata.title,
      undefined,
      { mappingApproval },
    );
  } catch {
    throw new WorksheetPreflightError(
      "WORKSHEET_READ_FAILED",
      "Requested worksheet could not be read from Google Sheets.",
    );
  }
  const plan = buildGoogleSheetsImportPlanFromReadResult(readResult, {
    mappingApproval,
  });
  const schemaSnapshot = buildSchemaSnapshot(readResult.parsed);

  const canonicalCandidates = await prisma.syncWorksheet.findMany({
    where: {
      status: "ACTIVE",
      schemaSnapshot: { not: null },
      normalizedTitle: normalizeWorksheetName(BB_CANONICAL_WORKSHEET),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      sourceId: true,
      status: true,
      worksheetTitle: true,
      schemaSnapshot: true,
      updatedAt: true,
    },
  });
  const canonicalSchema = resolveApprovedCanonicalSchema(canonicalCandidates, {
    sourceId: source?.id,
  });
  const schema = schemaBlockers(
    worksheetMetadata.title,
    schemaSnapshot,
    registeredWorksheet?.schemaSnapshot ?? null,
    canonicalSchema.schemaSnapshot,
  );
  const blockers = [...schema.blockers];
  const registryStatus = registeredWorksheet?.status ?? null;
  const blockedRegistryStatuses = [
    "DISABLED",
    "MISSING",
    "ERROR",
    "SCHEMA_REVIEW",
  ];
  const retryableRegistryReview = Boolean(
    registeredWorksheet &&
      registryStatus === "SCHEMA_REVIEW" &&
      isAutomaticWorksheetReviewRetryable(registeredWorksheet) &&
      schema.blockers.length === 0,
  );
  if (
    blockedRegistryStatuses.includes(registryStatus ?? "") &&
    !retryableRegistryReview
  )
    blockers.push(`worksheet_registry_${registryStatus?.toLowerCase()}`);
  if (!parseBBWorksheetName(worksheetMetadata.title))
    blockers.push("worksheet_invalid");
  blockers.push(...plan.blockingIssues);
  if (isAfterCanonicalBBWorksheet(worksheetMetadata.title) && canonicalSchema.status !== "AVAILABLE")
    blockers.push("canonical_schema_unavailable");

  const issues = collectWorksheetValidationIssues(readResult.parsed);
  const invalidRowNumbers = new Set(
    issues
      .map((issue) => issue.row)
      .filter((row): row is number => row !== null),
  );
  if (issues.length > 0) blockers.push("invalid_rows");

  const existingStates = registeredWorksheet
    ? await prisma.syncRowState.findMany({
        where: { worksheetId: registeredWorksheet.id },
        select: { sourceKey: true, contentHash: true },
      })
    : [];
  const classification: SyncClassification = classifySyncRows(
    plan.stagingRows,
    existingStates,
  );
  if (classification.duplicates.length > 0)
    blockers.push("duplicate_source_keys");

  let canonicalPlan: CanonicalImportPlan | null = null;
  let canonicalPlanError: string | null = null;
  let executionPlan = plan;
  let canaryScopeSelectedRecords = 0;
  let targetState: WorksheetPreflightResult["targetState"] = {
    status: "BLOCKED",
    statesRead: 0,
    lookupQueries: 0,
    durationMs: 0,
    blockers: ["target_state_not_evaluated"],
  };
  let targetDiff: WorksheetPreflightResult["targetDiff"] = {
    insert: 0,
    update: 0,
    noOp: 0,
    skip: 0,
    block: 0,
    blockers: [],
  };
  const period = parseBBWorksheetName(worksheetMetadata.title);
  if (!mapping) {
    canonicalPlanError = "No approved mapping profile exists for this worksheet.";
  } else if (!registeredWorksheet || registeredWorksheet.status !== "ACTIVE") {
    canonicalPlanError =
      "An ACTIVE worksheet registry entry is required before canonical planning.";
  } else if (!period) {
    canonicalPlanError = "Worksheet period could not be reconstructed.";
  } else {
    try {
      const planningInput = {
        importRunId: `preflight-${sourceKey}-${worksheetMetadata.sheetId}-${schemaSnapshot.hash}`,
        plan,
        sourceKey,
        spreadsheetId: config.spreadsheetId,
        sheetId: worksheetMetadata.sheetId,
        worksheetTitle: worksheetMetadata.title,
        effectivePeriod: { month: period.month, year: period.year },
        sourceRange: plan.sourceRange,
        schemaFingerprint: schemaSnapshot.hash,
        mapping,
      };
      if (input.canary === true) {
        const canaryScope = juliCanaryScopeForCompatibilityPlan(planningInput);
        executionPlan = canaryScope.plan;
        canaryScopeSelectedRecords = canaryScope.records.length;
      }
      const targetAware = await buildTargetAwareCanonicalPlan({
        ...planningInput,
        plan: executionPlan,
        ...(input.canary === true
          ? { provenanceResolution: JULI26_TARGET_PROVENANCE_RESOLUTION }
          : {}),
      });
      const targetRead = targetAware.targetRead;
      targetState = {
        status: targetRead.status,
        statesRead: targetRead.states.length,
        lookupQueries: targetRead.lookupQueries,
        durationMs: targetRead.durationMs,
        blockers: targetRead.blockers,
      };
      const diffs = targetAware.targetDiffs;
      targetDiff = {
        insert: diffs.filter((diff) => diff.operation === "INSERT").length,
        update: diffs.filter((diff) => diff.operation === "UPDATE").length,
        noOp: diffs.filter((diff) => diff.operation === "NO-OP").length,
        skip: diffs.filter((diff) => diff.operation === "SKIP").length,
        block: diffs.filter((diff) => diff.operation === "BLOCK").length,
        blockers: [...new Set(diffs.flatMap((diff) => diff.blockers))],
      };
      canonicalPlan = targetAware.canonicalPlan;
    } catch (error) {
      canonicalPlanError =
        error instanceof Error ? error.message : "Canonical plan construction failed.";
    }
  }
  if (canonicalPlanError) blockers.push("canonical_mapping_review");
  if (input.canary === true && canaryScopeSelectedRecords !== 22)
    blockers.push("canary_scope_invalid");
  if (targetState.status === "BLOCKED") blockers.push("target_state_blocked");
  blockers.push(...targetDiff.blockers.map((issue) => `target_${issue.toLocaleLowerCase("en-US")}`));

  const canonicalClassification = canonicalPlan
    ? {
        ...classification,
        inserted: canonicalPlan.operationCounts.INSERT,
        updated: canonicalPlan.operationCounts.UPDATE,
        skipped: canonicalPlan.operationCounts.SKIP,
      }
    : classification;

  const uniqueBlockers = [...new Set(blockers)];
  const expectedPlanFingerprint = `${schemaSnapshot.hash}:${contentHashForStagingRows(
    plan.stagingRows,
  )}`;
  const status = uniqueBlockers.length === 0 ? "READY" : "BLOCKED";
  const sourceRows = sourceRowsForPlan(plan, readResult.parsed, issues);
  const invalidRows = invalidRowNumbers.size;
  return {
    status,
    sourceKey,
    worksheetKey: worksheetMetadata.sheetId,
    expectedPlanFingerprint,
    sourceRange: plan.sourceRange,
    spreadsheet: { status: "PASS", configured: true },
    worksheet: {
      status:
        uniqueBlockers.includes("worksheet_invalid") ||
        (blockedRegistryStatuses.includes(registryStatus ?? "") &&
          !retryableRegistryReview)
          ? "BLOCKED"
          : "PASS",
      requested: requestedWorksheet,
      effective: worksheetMetadata.title,
      sheetId: worksheetMetadata.sheetId,
      rowCount: worksheetMetadata.rowCount,
      known: Boolean(registeredWorksheet),
      registryStatus,
    },
    mapping: {
      status:
        schema.blockers.length === 0 && canonicalPlanError === null
          ? "PASS"
          : "BLOCKED",
      schemaClassification: schema.schemaClassification,
      schemaHash: schemaSnapshot.hash,
      blockers: [
        ...new Set([
          ...schema.blockers,
          ...(canonicalPlanError ? ["canonical_mapping_review"] : []),
        ]),
      ],
      warnings: plan.warnings,
    },
    validation: {
      status: plan.status === "READY_FOR_IMPORT" && issues.length === 0
        ? "PASS"
        : "BLOCKED",
      sourceRows,
      candidateRecords: plan.stagingRows.length,
      validRecords: validRecordCount(plan.stagingRows, invalidRowNumbers),
      invalidRows,
      issues,
      blockers: plan.blockingIssues,
      warnings: plan.warnings,
    },
    classification: {
      newRecords: canonicalClassification.inserted,
      existingRecords: canonicalClassification.updated + canonicalClassification.skipped,
      inserted: canonicalClassification.inserted,
      updated: canonicalClassification.updated,
      skipped: canonicalClassification.skipped,
      potentialDuplicates: canonicalClassification.duplicates.length,
    },
    targetState,
    targetDiff,
    canary: {
      enabled: input.canary === true,
      scopeId: input.canary === true ? JULI26_CANARY_SCOPE_ID : null,
      sourceRecords: plan.stagingRows.length,
      selectedRecords: input.canary === true
        ? canaryScopeSelectedRecords
        : plan.stagingRows.length,
    },
    plan,
    executionPlan,
    schemaSnapshot,
    canonicalPlan,
    canonicalPlanError,
  };
}
