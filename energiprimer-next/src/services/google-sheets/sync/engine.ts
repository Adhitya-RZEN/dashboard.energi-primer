import "server-only";

import {
  parseBBWorksheetName,
  preferBBWorksheetName,
  normalizeWorksheetName,
} from "@/services/google-sheets/dynamic/worksheet-resolver";
import {
  readAndParseDynamicWorksheet,
  type DynamicWorksheetReadResult,
} from "@/services/google-sheets/dynamic/reader";
import { getGoogleSheetsConfig } from "@/lib/google-sheets";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "@/services/google-sheets/import/plan";
import {
  approvedMappingContractForWorksheet,
  mappingApprovalForContract,
} from "@/services/google-sheets/canonical/index";
import {
  commitGoogleSheetsImportPlan,
  assertImportDatabaseTarget,
} from "@/services/google-sheets/import/commit";
import { prisma } from "@/lib/prisma";

import { classifySyncRows } from "./change-detection";
import { filterImportPlanToSourceKeys } from "./commit-scope";
import {
  contentHashForStagingRows,
} from "./identity";
import {
  persistGoogleSheetsWorksheetDiscovery,
  prepareGoogleSheetsWorksheetDiscovery,
  stableGoogleSheetsSourceKey,
} from "./discovery";
import {
  acquireSyncSourceLease,
  ensureSyncSourceForDiscovery,
  releaseSyncSourceLease,
  renewSyncSourceLease,
} from "./lease";
import {
  buildSchemaSnapshot,
  detectSchemaChange,
} from "./schema-detection";
import {
  evaluateAutomaticWorksheet,
  isCanonicalBBWorksheet,
  isCanonicalSchemaReviewRetryable,
  isAutomaticWorksheetReviewRetryable,
  isAfterCanonicalBBWorksheet,
  isAutomaticFutureBBWorksheet,
  resolveApprovedCanonicalSchema,
} from "./bb-policy";
import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";
import { withDatabaseRetry, withSyncRetry } from "./retry";
import { classifyRecoveryFailure } from "@/services/google-sheets/canonical/recovery";
import {
  executeDurableCanonicalPlan,
} from "@/services/google-sheets/canonical/ledger";
import { PrismaCanonicalLedgerStore } from "@/services/google-sheets/canonical/ledger-prisma-store";
import { createCompatibilityCanonicalBatchRepository } from "@/services/google-sheets/canonical/compatibility-repository";
import { sourceKeyForCanonicalRecord } from "@/services/google-sheets/canonical/compatibility-adapter";
import { buildTargetAwareCanonicalPlan } from "./canonical-target-planning";
import {
  juliCanaryScopeForCompatibilityPlan,
  JULI26_CANARY_SHEET_ID,
  JULI26_CANARY_WORKSHEET,
} from "./juli-canary-scope";
import {
  JULI26_TARGET_PROVENANCE_RESOLUTION,
} from "../canonical/target-state";
import { BB_CANONICAL_WORKSHEET } from "@/services/google-sheets/legacy-mapping/profiles";
import { classifySyncError } from "./error-classification";
import { assertProductionCanaryAuthorization } from "./production-canary";
import {
  createSyncRequestId,
  diagnosticDurationMs,
  diagnosticNow,
  emitSyncDiagnostic,
  type SyncDiagnosticContext,
} from "./diagnostic-core";
import { safeSyncErrorDetails, withSyncDiagnostic } from "./diagnostics";
import type {
  SyncDatabaseTarget,
  VerifiedSupabaseProductionTarget,
} from "./production-target";

export type SyncTriggerType = "manual" | "cron" | "verification";
export type SyncRunStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "RECONCILIATION_REQUIRED"
  | "LOCKED";

export type IncrementalSyncOptions = {
  triggerType?: SyncTriggerType;
  worksheetTitle?: string;
  worksheetKey?: string;
  scope?: "current" | "all" | "automatic";
  allowNonLocalDatabase?: boolean;
  databaseTarget?: SyncDatabaseTarget;
  productionTarget?: VerifiedSupabaseProductionTarget;
  expectedPlanFingerprint?: string;
  /** Canonical plan hash admitted by the explicit POST boundary. */
  expectedCanonicalPlanId?: string;
  /** Stable canonical import id used to reproduce the admitted plan hash. */
  canonicalImportRunId?: string;
  /** Required only for the explicit Phase 5 durable execution boundary. */
  durableLedger?: "REQUIRED" | "DISABLED";
  /** Phase 6's closed Juli26-BB canary selector. */
  canary?: true;
  requestId?: string;
};

export type WorksheetSyncResult = {
  worksheetKey: string;
  worksheetTitle: string;
  status: "SUCCESS" | "FAILED" | "RECONCILIATION_REQUIRED" | "SCHEMA_REVIEW";
  rowsScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  errorCode?: string;
  recovery?: ReturnType<typeof classifyRecoveryFailure>;
};

export type IncrementalSyncResult = {
  status: SyncRunStatus;
  syncRunId: string | null;
  worksheetsScanned: number;
  rowsScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  worksheets: WorksheetSyncResult[];
};

function safeErrorMessage(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError)
    return `google_sheets_${error.code}`;
  return `sync_${classifySyncError(error).toLocaleLowerCase("en-US")}`;
}

async function persistRowStates(input: {
  worksheetId: bigint;
  worksheetContentHash: string;
  worksheetSchemaHash: string;
  worksheetSchemaSnapshot: string;
  rowCount: number;
  rows: ReturnType<typeof classifySyncRows>["changes"];
  now: Date;
}) {
    await withDatabaseRetry(() => prisma.$transaction(async (tx) => {
    for (const change of input.rows) {
      await tx.syncRowState.upsert({
        where: {
          worksheetId_sourceKey: {
            worksheetId: input.worksheetId,
            sourceKey: change.sourceKey,
          },
        },
        create: {
          worksheetId: input.worksheetId,
          sourceKey: change.sourceKey,
          entityType: change.row.entityType,
          contentHash: change.contentHash,
          lastSeenAt: input.now,
          lastSyncedAt: input.now,
        },
        update: {
          entityType: change.row.entityType,
          contentHash: change.contentHash,
          lastSeenAt: input.now,
          ...(change.action === "SKIP"
            ? {}
            : { lastSyncedAt: input.now }),
        },
      });
    }
    await tx.syncWorksheet.update({
      where: { id: input.worksheetId },
      data: {
        status: "ACTIVE",
        lastSyncAt: input.now,
        contentHash: input.worksheetContentHash,
        schemaHash: input.worksheetSchemaHash,
        schemaSnapshot: input.worksheetSchemaSnapshot,
        rowCount: input.rowCount,
      },
    });
    await tx.syncSchemaChange.updateMany({
      where: { worksheetId: input.worksheetId, status: "OPEN" },
      data: {
        status: "RESOLVED",
        resolution:
          "Automatically resolved: the worksheet passed canonical schema and import validation on retry.",
      },
    });
    }, { timeout: 30_000 }));
}

async function markWorksheetFailure(
  worksheetId: bigint,
  status: "ERROR" | "SCHEMA_REVIEW",
) {
  await prisma.syncWorksheet.update({
    where: { id: worksheetId },
    data: { status },
  });
}

async function markWorksheetValidated(worksheetId: bigint) {
  await prisma.syncWorksheet.update({
    where: { id: worksheetId },
    data: { status: "VALIDATED" },
  });
}

function selectedWorksheets(
  worksheets: Awaited<ReturnType<typeof prisma.syncWorksheet.findMany>>,
  options: IncrementalSyncOptions,
  openSchemaReviewWorksheetIds: ReadonlySet<bigint> = new Set(),
) {
  const scope = options.scope ??
    (options.triggerType === "cron" ? "automatic" : "all");
  const explicitWorksheet = Boolean(options.worksheetKey || options.worksheetTitle);
  const withoutDisabledOrMissing = worksheets.filter(
    (worksheet) =>
      worksheet.status !== "DISABLED" &&
      worksheet.status !== "MISSING" &&
      (worksheet.status !== "SCHEMA_REVIEW" ||
        (explicitWorksheet && isAutomaticWorksheetReviewRetryable(worksheet)) ||
        (scope === "automatic" &&
          isAutomaticWorksheetReviewRetryable(worksheet) &&
          !openSchemaReviewWorksheetIds.has(worksheet.id))),
  );
  if (options.worksheetKey) {
    return withoutDisabledOrMissing.filter(
      (worksheet) => worksheet.worksheetKey === options.worksheetKey,
    );
  }
  if (options.worksheetTitle) {
    const requestedTitle = options.worksheetTitle
      .trim()
      .toLocaleLowerCase("en-US");
    return withoutDisabledOrMissing.filter(
      (worksheet) =>
        worksheet.worksheetTitle.trim().toLocaleLowerCase("en-US") ===
        requestedTitle,
    );
  }
  const valid = withoutDisabledOrMissing.filter((worksheet) =>
    Boolean(parseBBWorksheetName(worksheet.worksheetTitle)),
  );
  const preferred = preferredWorksheetsByPeriod(valid);
  if (scope === "all") return preferred;
  if (scope === "automatic")
    return preferred.filter((worksheet) =>
      isAutomaticFutureBBWorksheet(worksheet.worksheetTitle),
    );
  const now = new Date();
  return preferred.filter((worksheet) => {
    const period = parseBBWorksheetName(worksheet.worksheetTitle);
    return (
      period?.month === now.getUTCMonth() + 1 &&
      period.year === now.getUTCFullYear()
    );
  });
}

type RegisteredWorksheet = Awaited<
  ReturnType<typeof prisma.syncWorksheet.findMany>
>[number];

async function loadApprovedCanonicalSchema(sourceId?: bigint) {
  const candidates = await prisma.syncWorksheet.findMany({
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
  return resolveApprovedCanonicalSchema(candidates, { sourceId });
}

function assertProductionJuliCanaryScope(options: IncrementalSyncOptions) {
  const worksheet = options.worksheetTitle?.trim().toLocaleLowerCase("en-US");
  if (
    options.canary !== true ||
    worksheet !== JULI26_CANARY_WORKSHEET.toLocaleLowerCase("en-US") ||
    (options.worksheetKey !== undefined && options.worksheetKey !== JULI26_CANARY_SHEET_ID) ||
    (options.scope !== undefined && options.scope !== "all")
  ) {
    throw new Error("Production writes require the exact Juli26-BB canary scope.");
  }
}

async function autoAdmitCanonicalWorksheet(
  worksheet: RegisteredWorksheet | null,
  approvedSchema: string | null,
) {
  if (!worksheet || !approvedSchema) return approvedSchema;
  const openSchemaChanges = await prisma.syncSchemaChange.findMany({
    where: { worksheetId: worksheet.id, status: "OPEN" },
    select: { id: true, changeType: true },
  });
  if (
    worksheet.status === "SCHEMA_REVIEW" &&
    !isCanonicalSchemaReviewRetryable(
      worksheet,
      openSchemaChanges.map((change) => change.changeType),
    )
  )
    return null;
  if (worksheet.schemaSnapshot) return approvedSchema;

  const mapping = approvedMappingContractForWorksheet(worksheet.worksheetTitle);
  if (!mapping) return null;

  let readResult: DynamicWorksheetReadResult;
  try {
    readResult = await withSyncRetry(() =>
      readAndParseDynamicWorksheet(worksheet.worksheetTitle, undefined, {
        mappingApproval: mappingApprovalForContract(mapping),
      }),
    );
  } catch {
    await markWorksheetFailure(worksheet.id, "ERROR");
    return null;
  }

  const currentSchema = buildSchemaSnapshot(readResult.parsed);
  const schemaChange = detectSchemaChange(
    approvedSchema,
    currentSchema,
    { allowObservedValueTypeDrift: true },
  );
  if (schemaChange.changed) {
    if (openSchemaChanges.length === 0) {
      await prisma.syncSchemaChange.create({
        data: {
          worksheetId: worksheet.id,
          previousSchemaHash: null,
          currentSchemaHash: currentSchema.hash,
          changeType: schemaChange.type,
          previousSchema: approvedSchema,
          currentSchema: JSON.stringify(currentSchema),
          status: "OPEN",
          resolution: schemaChange.reason,
        },
      });
    }
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return null;
  }

  await prisma.syncWorksheet.update({
    where: { id: worksheet.id },
    data: {
      status: "ACTIVE",
      schemaHash: currentSchema.hash,
      schemaSnapshot: JSON.stringify(currentSchema),
    },
  });
  if (openSchemaChanges.length > 0) {
    await prisma.syncSchemaChange.updateMany({
      where: { id: { in: openSchemaChanges.map((change) => change.id) } },
      data: {
        status: "RESOLVED",
        resolution:
          "Automatically resolved: worksheet structure matches the approved canonical schema; observed value type drift is tolerated.",
      },
    });
  }
  return JSON.stringify(currentSchema);
}

/**
 * The discovery registry can contain both a canonical and an abbreviated
 * title for the same month. They are separate Google tabs, but represent one
 * business period for import selection. Keep one deterministic winner.
 */
function preferredWorksheetsByPeriod(
  worksheets: readonly RegisteredWorksheet[],
) {
  const groups = new Map<string, RegisteredWorksheet[]>();
  for (const worksheet of worksheets) {
    const period = parseBBWorksheetName(worksheet.worksheetTitle);
    if (!period) continue;
    const key = `${period.year}-${String(period.month).padStart(2, "0")}`;
    const group = groups.get(key) ?? [];
    group.push(worksheet);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const preferredTitle = preferBBWorksheetName(
        group.map((worksheet) => worksheet.worksheetTitle),
      );
      return (
        group.find((worksheet) => worksheet.worksheetTitle === preferredTitle) ??
        group[0]
      );
    })
    .filter((worksheet): worksheet is RegisteredWorksheet => Boolean(worksheet))
    .sort((left, right) => {
      const leftPeriod = parseBBWorksheetName(left.worksheetTitle);
      const rightPeriod = parseBBWorksheetName(right.worksheetTitle);
      return (
        (leftPeriod?.year ?? 0) - (rightPeriod?.year ?? 0) ||
        (leftPeriod?.month ?? 0) - (rightPeriod?.month ?? 0) ||
        left.worksheetTitle.localeCompare(right.worksheetTitle, "en-US")
      );
    });
}

async function syncWorksheet(
  worksheet: Awaited<ReturnType<typeof prisma.syncWorksheet.findMany>>[number],
  options: IncrementalSyncOptions,
  canonicalSchema: string | null,
  importRunId: string,
  sourceKey: string,
  spreadsheetId: string,
): Promise<WorksheetSyncResult> {
  const base = {
    worksheetKey: worksheet.worksheetKey,
    worksheetTitle: worksheet.worksheetTitle,
  };
  const diagnostic: SyncDiagnosticContext | undefined = options.requestId
    ? { requestId: options.requestId }
    : undefined;
  if (!parseBBWorksheetName(worksheet.worksheetTitle)) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: "Worksheet title is not a supported BB period pattern.",
    };
  }

  const mapping = approvedMappingContractForWorksheet(worksheet.worksheetTitle);
  if (!mapping) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: "mapping_profile_unavailable",
    };
  }
  const mappingApproval = mappingApprovalForContract(mapping);

  let readResult: DynamicWorksheetReadResult;
  const worksheetReadStartedAt = diagnosticNow();
  try {
    readResult = await withSyncRetry(() =>
      readAndParseDynamicWorksheet(worksheet.worksheetTitle, undefined, {
        mappingApproval,
      }),
    );
  } catch (error) {
    if (diagnostic) {
      emitSyncDiagnostic({
        context: diagnostic,
        stage: "worksheet_processing",
        status: "FAIL",
        durationMs: diagnosticDurationMs(worksheetReadStartedAt),
        ...safeSyncErrorDetails(error),
      });
    }
    await markWorksheetFailure(worksheet.id, "ERROR");
    return {
      ...base,
      status: "FAILED",
      rowsScanned: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: safeErrorMessage(error),
    };
  }

  const plan = buildGoogleSheetsImportPlanFromReadResult(readResult, {
    mappingApproval,
  });
  const schemaSnapshot = buildSchemaSnapshot(readResult.parsed);
  const actualPlanFingerprint = `${schemaSnapshot.hash}:${contentHashForStagingRows(
    plan.stagingRows,
  )}`;
  if (
    options.expectedPlanFingerprint &&
    options.expectedPlanFingerprint !== actualPlanFingerprint
  ) {
    await markWorksheetFailure(worksheet.id, "ERROR");
    return {
      ...base,
      status: "FAILED",
      rowsScanned: plan.stagingRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: "preflight_source_changed",
    };
  }
  const automaticGate = isAfterCanonicalBBWorksheet(worksheet.worksheetTitle)
    ? evaluateAutomaticWorksheet(worksheet.worksheetTitle, schemaSnapshot, {
        canonicalSchema,
      })
    : null;
  if (automaticGate && !automaticGate.allowed) {
    if (automaticGate.schemaChange?.changed) {
      await prisma.syncSchemaChange.create({
        data: {
          worksheetId: worksheet.id,
          previousSchemaHash: worksheet.schemaHash,
          currentSchemaHash: schemaSnapshot.hash,
          changeType: automaticGate.schemaChange.type,
          previousSchema: canonicalSchema,
          currentSchema: JSON.stringify(schemaSnapshot),
          status: "OPEN",
          resolution: automaticGate.reason,
        },
      });
    }
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: plan.stagingRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: `schema_review_${automaticGate.gate.toLowerCase()}`,
    };
  }
  const schemaChange =
    automaticGate?.schemaChange ??
    detectSchemaChange(
      worksheet.schemaSnapshot,
      schemaSnapshot,
      isCanonicalBBWorksheet(worksheet.worksheetTitle)
        ? { allowObservedValueTypeDrift: true }
        : {},
    );
  if (schemaChange.changed) {
    await prisma.syncSchemaChange.create({
      data: {
        worksheetId: worksheet.id,
        previousSchemaHash: worksheet.schemaHash,
        currentSchemaHash: schemaSnapshot.hash,
        changeType: schemaChange.type,
        previousSchema: isAfterCanonicalBBWorksheet(worksheet.worksheetTitle)
          ? canonicalSchema
          : worksheet.schemaSnapshot,
        currentSchema: JSON.stringify(schemaSnapshot),
        status: "OPEN",
        resolution: schemaChange.reason,
      },
    });
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: plan.stagingRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: `schema_review_${schemaChange.type.toLowerCase()}`,
    };
  }
  if (plan.status !== "READY_FOR_IMPORT") {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: plan.stagingRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error: `Import validation blocked: ${plan.blockingIssues.join(", ")}`,
    };
  }

  let executionPlan = plan;
  let canonicalPlan: Awaited<ReturnType<typeof buildTargetAwareCanonicalPlan>>["canonicalPlan"];
  try {
    const period = parseBBWorksheetName(worksheet.worksheetTitle);
    if (!period) throw new Error("Worksheet period could not be reconstructed.");
    const planningInput = {
      importRunId: options.canonicalImportRunId?.trim() || importRunId,
      plan,
      sourceKey,
      spreadsheetId,
      sheetId: worksheet.worksheetKey,
      worksheetTitle: worksheet.worksheetTitle,
      effectivePeriod: { month: period.month, year: period.year },
      sourceRange: plan.sourceRange,
      schemaFingerprint: schemaSnapshot.hash,
      mapping,
    };
    if (options.canary === true) {
      executionPlan = juliCanaryScopeForCompatibilityPlan(planningInput).plan;
    }
    const targetAware = await buildTargetAwareCanonicalPlan({
      ...planningInput,
      plan: executionPlan,
      ...(options.canary === true
        ? { provenanceResolution: JULI26_TARGET_PROVENANCE_RESOLUTION }
        : {}),
    });
    canonicalPlan = targetAware.canonicalPlan;
    if (
      options.expectedCanonicalPlanId &&
      canonicalPlan.planId !== options.expectedCanonicalPlanId
    ) {
      throw new Error("canonical_plan_id_mismatch");
    }
  } catch (error) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: executionPlan.stagingRows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      error:
        error instanceof Error
          ? `canonical_mapping_review:${error.message}`
          : "canonical_mapping_review",
    };
  }

  if (
    canonicalPlan.operationCounts.BLOCK > 0 ||
    canonicalPlan.blockingIssues.length > 0 ||
    canonicalPlan.approvalState !== "APPROVED"
  ) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: executionPlan.stagingRows.length,
      inserted: canonicalPlan.operationCounts.INSERT,
      updated: canonicalPlan.operationCounts.UPDATE,
      skipped: canonicalPlan.operationCounts.SKIP,
      failed: canonicalPlan.operationCounts.BLOCK,
      error: "canonical_target_state_blocked",
      errorCode: "TARGET_STATE_BLOCKED",
    };
  }

  // Keep the write boundary fail-closed even when the engine is invoked
  // directly instead of through the explicit POST/CLI admission wrappers.
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    assertProductionCanaryAuthorization(canonicalPlan.items.length);
    if (options.durableLedger !== "REQUIRED")
      throw new Error("Production writes require the Phase 5 durable ledger.");
  }

  await markWorksheetValidated(worksheet.id);
  const existing = await prisma.syncRowState.findMany({
    where: { worksheetId: worksheet.id },
    select: { sourceKey: true, contentHash: true },
  });
  const classification = classifySyncRows(executionPlan.stagingRows, existing);
  if (classification.duplicates.length > 0) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: executionPlan.stagingRows.length,
      inserted: classification.inserted,
      updated: classification.updated,
      skipped: classification.skipped,
      failed: classification.duplicates.length,
      error: "Duplicate stable source key detected in worksheet.",
    };
  }

  const canonicalBySourceKey = new Map(
    canonicalPlan.items.map((item) => [sourceKeyForCanonicalRecord(item.record), item]),
  );
  const canonicalChanges = classification.changes.map((change) => {
    const item = canonicalBySourceKey.get(change.sourceKey);
    if (!item) throw new Error("canonical_target_identity_unmapped");
    return {
      ...change,
      action:
        item.operation === "INSERT" || item.operation === "UPDATE"
          ? item.operation
          : "SKIP" as const,
    };
  });
  if (canonicalChanges.length !== canonicalPlan.items.length) {
    throw new Error("canonical_target_identity_count_mismatch");
  }
  const changedKeys = new Set(
    canonicalPlan.items
      .filter((item) => item.operation === "INSERT" || item.operation === "UPDATE")
      .map((item) => sourceKeyForCanonicalRecord(item.record)),
  );
  const writePlan = filterImportPlanToSourceKeys(executionPlan, changedKeys);
  try {
    if (changedKeys.size > 0) {
      if (options.durableLedger === "REQUIRED") {
        if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED !== "true") {
          throw new Error("canonical_durable_ledger_not_enabled");
        }
        const repository = createCompatibilityCanonicalBatchRepository({
          basePlan: executionPlan,
          allowNonLocalDatabase: options.allowNonLocalDatabase === true,
          databaseTarget: options.databaseTarget,
          productionTarget: options.productionTarget,
          ...(options.canary === true ? { canary: true as const } : {}),
        });
        const durableResult = await withSyncDiagnostic(
          diagnostic,
          "import_transaction",
          () =>
            executeDurableCanonicalPlan(canonicalPlan, {
              store: new PrismaCanonicalLedgerStore(),
              repository,
              reconcileTarget: repository.reconcileTarget,
            }),
        );
        if (durableResult.status !== "COMMITTED") {
          throw new Error(durableResult.reason ?? "canonical_durable_execution_failed");
        }
      } else {
        await withSyncDiagnostic(
          diagnostic,
          "import_transaction",
          () =>
            withDatabaseRetry(() =>
              commitGoogleSheetsImportPlan(writePlan, {
                allowNonLocalDatabase: options.allowNonLocalDatabase === true,
                databaseTarget: options.databaseTarget,
                productionTarget: options.productionTarget,
                source: "google_sheets_sync",
              }),
            ),
        );
      }
    } else if (diagnostic) {
      emitSyncDiagnostic({
        context: diagnostic,
        stage: "import_transaction",
        status: "PASS",
        durationMs: 0,
        errorCode: "NOT_REQUIRED",
      });
    }
    await withSyncDiagnostic(
      diagnostic,
      "row_state_transaction",
      () =>
        persistRowStates({
          worksheetId: worksheet.id,
          worksheetContentHash: contentHashForStagingRows(plan.stagingRows),
          worksheetSchemaHash: schemaSnapshot.hash,
          worksheetSchemaSnapshot: JSON.stringify(schemaSnapshot),
          rowCount: plan.stagingRows.length,
          rows: canonicalChanges,
          now: new Date(),
        }),
    );
  } catch (error) {
    const recovery = classifyRecoveryFailure(error);
    const requiresReconciliation =
      recovery.status === "RECONCILIATION_REQUIRED";
    await markWorksheetFailure(worksheet.id, "ERROR");
    return {
      ...base,
      status: requiresReconciliation
        ? "RECONCILIATION_REQUIRED"
        : "FAILED",
      rowsScanned: executionPlan.stagingRows.length,
      inserted: canonicalPlan.operationCounts.INSERT,
      updated: canonicalPlan.operationCounts.UPDATE,
      skipped: canonicalPlan.operationCounts.SKIP,
      failed: 1,
      error: requiresReconciliation
        ? "reconciliation_required"
        : safeErrorMessage(error),
      errorCode: recovery.errorCode,
      recovery,
    };
  }

  return {
    ...base,
    status: "SUCCESS",
    rowsScanned: executionPlan.stagingRows.length,
    inserted: canonicalPlan.operationCounts.INSERT,
    updated: canonicalPlan.operationCounts.UPDATE,
    skipped: canonicalPlan.operationCounts.SKIP,
    failed: 0,
  };
}

export async function runGoogleSheetsIncrementalSync(
  options: IncrementalSyncOptions = {},
): Promise<IncrementalSyncResult> {
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    // This engine is also callable without the HTTP/CLI wrappers. Keep the
    // Phase 6 scope restriction at the deepest Production entry point.
    assertProductionJuliCanaryScope(options);
  }
  // Validate the target before source discovery can create or update registry
  // rows. Production is re-verified again by the commit boundary immediately
  // before normalized writes.
  await assertImportDatabaseTarget({
    allowNonLocalDatabase: options.allowNonLocalDatabase,
    databaseTarget: options.databaseTarget,
    productionTarget: options.productionTarget,
  });
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    // The explicit wrappers perform the same check after their read-only
    // preflight. Keep this early guard for direct engine callers so an
    // unauthorized Production invocation cannot persist discovery metadata.
    assertProductionCanaryAuthorization(0);
    if (options.durableLedger !== "REQUIRED")
      throw new Error("Production writes require the Phase 5 durable ledger.");
  }
  const requestId = options.requestId ?? createSyncRequestId();
  const syncOptions = { ...options, requestId };
  const diagnostic: SyncDiagnosticContext = { requestId };
  const discoveryStartedAt = diagnosticNow();
  let prepared: Awaited<
    ReturnType<typeof prepareGoogleSheetsWorksheetDiscovery>
  > | null = null;
  let sourceKey: string;
  let externalId: string;
  let sourceId: bigint;
  try {
    if (syncOptions.canary === true) {
      // A Phase 6 canary must use the already registered source/worksheet.
      // Global discovery persistence would touch unrelated tabs, including
      // Agustus, before the closed canary selector is applied.
      const config = getGoogleSheetsConfig();
      sourceKey = stableGoogleSheetsSourceKey(config.spreadsheetId);
      externalId = config.spreadsheetId;
      const registeredSource = await prisma.syncSource.findUnique({
        where: { sourceKey },
        select: { id: true, status: true },
      });
      if (!registeredSource || registeredSource.status !== "ACTIVE") {
        throw new Error("The exact Juli canary source is not registered ACTIVE.");
      }
      sourceId = registeredSource.id;
    } else {
      prepared = await withSyncRetry((attempt) =>
        prepareGoogleSheetsWorksheetDiscovery({ requestId, attempt }),
      );
      sourceKey = prepared.sourceKey;
      externalId = prepared.externalId;
      sourceId = await ensureSyncSourceForDiscovery(
        prepared.sourceKey,
        prepared.externalId,
        diagnostic,
      );
    }
  } catch (error) {
    emitSyncDiagnostic({
      context: diagnostic,
      stage: "discovery_total",
      status: "FAIL",
      durationMs: diagnosticDurationMs(discoveryStartedAt),
      ...safeSyncErrorDetails(error),
    });
    throw error;
  }

  const leaseStartedAt = diagnosticNow();
  let lease: Awaited<ReturnType<typeof acquireSyncSourceLease>>;
  try {
    lease = await acquireSyncSourceLease(sourceId);
    emitSyncDiagnostic({
      context: diagnostic,
      stage: "source_lease",
      status: lease ? "PASS" : "FAIL",
      durationMs: diagnosticDurationMs(leaseStartedAt),
      ...(lease
        ? {}
        : {
            errorCategory: "CONCURRENCY",
            errorCode: "NOT_ACQUIRED",
          }),
    });
  } catch (error) {
    emitSyncDiagnostic({
      context: diagnostic,
      stage: "source_lease",
      status: "FAIL",
      durationMs: diagnosticDurationMs(leaseStartedAt),
      ...safeSyncErrorDetails(error),
    });
    emitSyncDiagnostic({
      context: diagnostic,
      stage: "discovery_total",
      status: "FAIL",
      durationMs: diagnosticDurationMs(discoveryStartedAt),
      ...safeSyncErrorDetails(error),
    });
    throw error;
  }
  if (!lease) {
    emitSyncDiagnostic({
      context: diagnostic,
      stage: "discovery_total",
      status: "FAIL",
      durationMs: diagnosticDurationMs(discoveryStartedAt),
      errorCategory: "CONCURRENCY",
      errorCode: "NOT_ACQUIRED",
    });
    return {
      status: "LOCKED",
      syncRunId: null,
      worksheetsScanned: 0,
      rowsScanned: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      worksheets: [],
    };
  }

  try {
    try {
      if (syncOptions.canary === true) {
        emitSyncDiagnostic({
          context: diagnostic,
          stage: "discovery_total",
          status: "PASS",
          durationMs: diagnosticDurationMs(discoveryStartedAt),
          errorCode: "CANARY_SCOPED_DISCOVERY_SKIPPED",
        });
      } else if (prepared) {
        await persistGoogleSheetsWorksheetDiscovery(
          prepared,
          sourceId,
          diagnostic,
        );
        emitSyncDiagnostic({
          context: diagnostic,
          stage: "discovery_total",
          status: "PASS",
          durationMs: diagnosticDurationMs(discoveryStartedAt),
        });
      } else {
        throw new Error("Worksheet discovery preparation is missing.");
      }
    } catch (error) {
      emitSyncDiagnostic({
        context: diagnostic,
        stage: "discovery_total",
        status: "FAIL",
        durationMs: diagnosticDurationMs(discoveryStartedAt),
        ...safeSyncErrorDetails(error),
      });
      throw error;
    }

    let syncRunId: bigint | null = null;
    const startedAt = Date.now();
    const diagnosticStartedAt = diagnosticNow();
    let fallbackStage:
      | "sync_run_create"
      | "worksheet_processing"
      | "sync_run_finalize" = "sync_run_create";
    const worksheetResults: WorksheetSyncResult[] = [];
    try {
      const syncRun = await withSyncDiagnostic(
        diagnostic,
        "sync_run_create",
        () =>
          prisma.syncRun.create({
            data: {
              sourceId,
              triggerType: syncOptions.triggerType ?? "manual",
              status: "RUNNING",
            },
            select: { id: true },
          }),
      );
      syncRunId = syncRun.id;
      fallbackStage = "worksheet_processing";
      const source = await prisma.syncSource.findUnique({
        where: { id: sourceId },
        select: { id: true },
      });
      if (!source) throw new Error("Synchronization source registry not found.");
      const worksheets = await prisma.syncWorksheet.findMany({
        where: { sourceId: source.id },
        orderBy: { worksheetTitle: "asc" },
      });
      const openSchemaReviewWorksheetIds =
        syncOptions.scope === "automatic" ||
        syncOptions.triggerType === "cron"
          ? new Set(
              (
                await prisma.syncSchemaChange.findMany({
                  where: {
                    status: "OPEN",
                    worksheetId: { in: worksheets.map((worksheet) => worksheet.id) },
                  },
                  select: { worksheetId: true },
                })
              ).map((change) => change.worksheetId),
            )
          : new Set<bigint>();
      const selected = selectedWorksheets(
        worksheets,
        syncOptions,
        openSchemaReviewWorksheetIds,
      );
      if (
        syncOptions.canary === true &&
        (selected.length !== 1 || selected[0]?.worksheetKey !== JULI26_CANARY_SHEET_ID)
      ) {
        throw new Error("The selected worksheet is not the exact Juli26-BB canary tab.");
      }
      const canonicalCandidates = worksheets.filter(
        (worksheet) =>
          normalizeWorksheetName(worksheet.worksheetTitle) ===
          normalizeWorksheetName(BB_CANONICAL_WORKSHEET),
      );
      const canonicalWorksheet =
        canonicalCandidates.length === 1 ? canonicalCandidates[0] ?? null : null;
      // An explicit operator verification may use the canonical anchor from
      // its registered source. Automatic cron keeps the global conflict
      // fail-closed policy when workbooks disagree.
      const canonicalResolution = await loadApprovedCanonicalSchema(
        syncOptions.worksheetKey || syncOptions.worksheetTitle
          ? source.id
          : undefined,
      );
      let canonicalSchema = canonicalResolution.schemaSnapshot;
      if (canonicalCandidates.length > 1) canonicalSchema = null;
      if (syncOptions.canary !== true) {
        canonicalSchema = await autoAdmitCanonicalWorksheet(
          canonicalWorksheet,
          canonicalSchema,
        );
      }
      if (
        (syncOptions.worksheetKey || syncOptions.worksheetTitle) &&
        selected.length !== 1
      ) {
        throw new Error("Requested worksheet is not uniquely registered.");
      }
      if (selected.length === 0) {
        emitSyncDiagnostic({
          context: diagnostic,
          stage: "worksheet_processing",
          status: "PASS",
          durationMs: 0,
          errorCode: "NOT_REQUIRED",
        });
      }
      for (const worksheet of selected) {
        const renewStartedAt = diagnosticNow();
        let renewed: Awaited<ReturnType<typeof renewSyncSourceLease>>;
        try {
          renewed = await renewSyncSourceLease(sourceId, lease.token);
          emitSyncDiagnostic({
            context: diagnostic,
            stage: "source_lease",
            status: renewed ? "PASS" : "FAIL",
            durationMs: diagnosticDurationMs(renewStartedAt),
            ...(renewed
              ? {}
              : {
                  errorCategory: "CONCURRENCY",
                  errorCode: "NOT_RENEWED",
                }),
          });
        } catch (error) {
          emitSyncDiagnostic({
            context: diagnostic,
            stage: "source_lease",
            status: "FAIL",
            durationMs: diagnosticDurationMs(renewStartedAt),
            ...safeSyncErrorDetails(error),
          });
          throw error;
        }
        if (!renewed) throw new Error("Synchronization lease was lost.");
        const worksheetStartedAt = diagnosticNow();
        try {
          const worksheetResult = await syncWorksheet(
            worksheet,
            syncOptions,
            canonicalSchema,
            syncRun.id.toString(),
            sourceKey,
            externalId,
          );
          emitSyncDiagnostic({
            context: diagnostic,
            stage: "worksheet_processing",
            status: worksheetResult.status === "SUCCESS" ? "PASS" : "FAIL",
            durationMs: diagnosticDurationMs(worksheetStartedAt),
            ...(worksheetResult.status === "SUCCESS"
              ? {}
              : {
                  errorCategory:
                    worksheetResult.status === "SCHEMA_REVIEW"
                      ? "SCHEMA"
                      : "SYNC",
                  errorCode: worksheetResult.status,
                }),
          });
          worksheetResults.push(worksheetResult);
        } catch (error) {
          emitSyncDiagnostic({
            context: diagnostic,
            stage: "worksheet_processing",
            status: "FAIL",
            durationMs: diagnosticDurationMs(worksheetStartedAt),
            ...safeSyncErrorDetails(error),
          });
          throw error;
        }
      }

      const rowsScanned = worksheetResults.reduce(
        (total, result) => total + result.rowsScanned,
        0,
      );
      const inserted = worksheetResults.reduce(
        (total, result) => total + result.inserted,
        0,
      );
      const updated = worksheetResults.reduce(
        (total, result) => total + result.updated,
        0,
      );
      const skipped = worksheetResults.reduce(
        (total, result) => total + result.skipped,
        0,
      );
      const failed = worksheetResults.reduce(
        (total, result) => total + result.failed,
        0,
      );
      const status: SyncRunStatus = worksheetResults.some(
        (result) => result.status === "RECONCILIATION_REQUIRED",
      )
        ? "RECONCILIATION_REQUIRED"
        : failed === 0
          ? "SUCCESS"
          : failed < selected.length
            ? "PARTIAL"
            : "FAILED";
      fallbackStage = "sync_run_finalize";
      await withSyncDiagnostic(
        diagnostic,
        "sync_run_finalize",
        () =>
          prisma.syncRun.update({
            where: { id: syncRun.id },
            data: {
              status,
              finishedAt: new Date(),
              worksheetsScanned: selected.length,
              rowsScanned,
              inserted,
              updated,
              skipped,
              failed,
              durationMs: Date.now() - startedAt,
              errorSummary:
                failed > 0
                  ? worksheetResults
                      .filter((result) => result.error)
                      .map((result) => result.error)
                      .join("; ")
                  : null,
            },
          }),
      );
      return {
        status,
        syncRunId: syncRun.id.toString(),
        worksheetsScanned: selected.length,
        rowsScanned,
        inserted,
        updated,
        skipped,
        failed,
        worksheets: worksheetResults,
      };
    } catch (error) {
      const safeError = safeErrorMessage(error);
      const recovery = classifyRecoveryFailure(error);
      const runStatus: SyncRunStatus =
        recovery.status === "RECONCILIATION_REQUIRED"
          ? "RECONCILIATION_REQUIRED"
          : "FAILED";
      emitSyncDiagnostic({
        context: diagnostic,
        stage: fallbackStage,
        status: "FAIL",
        durationMs: diagnosticDurationMs(diagnosticStartedAt),
        ...safeSyncErrorDetails(error),
      });
      if (syncRunId !== null) {
        await prisma.syncRun.update({
          where: { id: syncRunId },
          data: {
            status: runStatus,
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt,
            errorSummary: safeError,
            failed: 1,
          },
        });
      }
      throw error;
    }
  } finally {
    await withSyncDiagnostic(
      diagnostic,
      "source_lease",
      () => releaseSyncSourceLease(sourceId, lease.token),
    );
  }
}

export function sourceKeyForConfiguredSpreadsheet(spreadsheetId: string) {
  return stableGoogleSheetsSourceKey(spreadsheetId);
}
