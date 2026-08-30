import "server-only";

import {
  parseBBWorksheetName,
  worksheetNameFor,
} from "@/services/google-sheets/dynamic/worksheet-resolver";
import {
  readAndParseDynamicWorksheet,
  type DynamicWorksheetReadResult,
} from "@/services/google-sheets/dynamic/reader";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "@/services/google-sheets/import/plan";
import {
  commitGoogleSheetsImportPlan,
} from "@/services/google-sheets/import/commit";
import { prisma } from "@/lib/prisma";

import { classifySyncRows } from "./change-detection";
import { filterImportPlanToSourceKeys } from "./commit-scope";
import {
  contentHashForStagingRows,
} from "./identity";
import {
  discoverGoogleSheetsWorksheets,
  stableGoogleSheetsSourceKey,
} from "./discovery";
import {
  acquireSyncSourceLease,
  releaseSyncSourceLease,
  renewSyncSourceLease,
} from "./lease";
import {
  buildSchemaSnapshot,
  detectSchemaChange,
} from "./schema-detection";
import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";
import { withDatabaseRetry, withSyncRetry } from "./retry";

export type SyncTriggerType = "manual" | "cron" | "verification";
export type SyncRunStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "LOCKED";

export type IncrementalSyncOptions = {
  triggerType?: SyncTriggerType;
  worksheetTitle?: string;
  worksheetKey?: string;
  scope?: "current" | "all";
  allowNonLocalDatabase?: boolean;
};

export type WorksheetSyncResult = {
  worksheetKey: string;
  worksheetTitle: string;
  status: "SUCCESS" | "FAILED" | "SCHEMA_REVIEW";
  rowsScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
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
  return "synchronization_failed";
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
) {
  const withoutDisabledOrMissing = worksheets.filter(
    (worksheet) =>
      worksheet.status !== "DISABLED" &&
      worksheet.status !== "MISSING" &&
      worksheet.status !== "SCHEMA_REVIEW",
  );
  if (options.worksheetKey) {
    return withoutDisabledOrMissing.filter(
      (worksheet) => worksheet.worksheetKey === options.worksheetKey,
    );
  }
  if (options.worksheetTitle) {
    return withoutDisabledOrMissing.filter(
      (worksheet) => worksheet.worksheetTitle === options.worksheetTitle,
    );
  }
  const valid = withoutDisabledOrMissing.filter((worksheet) =>
    Boolean(parseBBWorksheetName(worksheet.worksheetTitle)),
  );
  const scope = options.scope ??
    (options.triggerType === "cron" ? "current" : "all");
  if (scope === "all") return valid;
  const now = new Date();
  const currentTitle = worksheetNameFor(now.getUTCMonth() + 1, now.getUTCFullYear());
  return valid.filter((worksheet) => worksheet.worksheetTitle === currentTitle);
}

async function syncWorksheet(
  worksheet: Awaited<ReturnType<typeof prisma.syncWorksheet.findMany>>[number],
  options: IncrementalSyncOptions,
): Promise<WorksheetSyncResult> {
  const base = {
    worksheetKey: worksheet.worksheetKey,
    worksheetTitle: worksheet.worksheetTitle,
  };
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

  let readResult: DynamicWorksheetReadResult;
  try {
    readResult = await withSyncRetry(() =>
      readAndParseDynamicWorksheet(worksheet.worksheetTitle),
    );
  } catch (error) {
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

  const plan = buildGoogleSheetsImportPlanFromReadResult(readResult);
  const schemaSnapshot = buildSchemaSnapshot(readResult.parsed);
  const schemaChange = detectSchemaChange(
    worksheet.schemaSnapshot,
    schemaSnapshot,
  );
  if (schemaChange.changed) {
    await prisma.syncSchemaChange.create({
      data: {
        worksheetId: worksheet.id,
        previousSchemaHash: worksheet.schemaHash,
        currentSchemaHash: schemaSnapshot.hash,
        changeType: schemaChange.type,
        previousSchema: worksheet.schemaSnapshot,
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

  await markWorksheetValidated(worksheet.id);
  const existing = await prisma.syncRowState.findMany({
    where: { worksheetId: worksheet.id },
    select: { sourceKey: true, contentHash: true },
  });
  const classification = classifySyncRows(plan.stagingRows, existing);
  if (classification.duplicates.length > 0) {
    await markWorksheetFailure(worksheet.id, "SCHEMA_REVIEW");
    return {
      ...base,
      status: "SCHEMA_REVIEW",
      rowsScanned: plan.stagingRows.length,
      inserted: classification.inserted,
      updated: classification.updated,
      skipped: classification.skipped,
      failed: classification.duplicates.length,
      error: "Duplicate stable source key detected in worksheet.",
    };
  }

  const changedKeys = new Set(
    classification.changes
      .filter((change) => change.action !== "SKIP")
      .map((change) => change.sourceKey),
  );
  const writePlan = filterImportPlanToSourceKeys(plan, changedKeys);
  try {
    if (changedKeys.size > 0) {
      await withDatabaseRetry(() => commitGoogleSheetsImportPlan(writePlan, {
        allowNonLocalDatabase: options.allowNonLocalDatabase === true,
        source: "google_sheets_sync",
      }));
    }
    await persistRowStates({
      worksheetId: worksheet.id,
      worksheetContentHash: contentHashForStagingRows(plan.stagingRows),
      worksheetSchemaHash: schemaSnapshot.hash,
      worksheetSchemaSnapshot: JSON.stringify(schemaSnapshot),
      rowCount: plan.stagingRows.length,
      rows: classification.changes,
      now: new Date(),
    });
  } catch (error) {
    await markWorksheetFailure(worksheet.id, "ERROR");
    return {
      ...base,
      status: "FAILED",
      rowsScanned: plan.stagingRows.length,
      inserted: classification.inserted,
      updated: classification.updated,
      skipped: classification.skipped,
      failed: 1,
      error: safeErrorMessage(error),
    };
  }

  return {
    ...base,
    status: "SUCCESS",
    rowsScanned: plan.stagingRows.length,
    inserted: classification.inserted,
    updated: classification.updated,
    skipped: classification.skipped,
    failed: 0,
  };
}

export async function runGoogleSheetsIncrementalSync(
  options: IncrementalSyncOptions = {},
): Promise<IncrementalSyncResult> {
  const discovery = await withSyncRetry(() =>
    discoverGoogleSheetsWorksheets(),
  );
  const sourceId = BigInt(discovery.sourceId);
  const lease = await acquireSyncSourceLease(sourceId);
  if (!lease) {
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

  let syncRunId: bigint | null = null;
  const startedAt = Date.now();
  const worksheetResults: WorksheetSyncResult[] = [];
  try {
    const syncRun = await prisma.syncRun.create({
      data: {
        sourceId,
        triggerType: options.triggerType ?? "manual",
        status: "RUNNING",
      },
      select: { id: true },
    });
    syncRunId = syncRun.id;
    const source = await prisma.syncSource.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });
    if (!source) throw new Error("Synchronization source registry not found.");
    const worksheets = await prisma.syncWorksheet.findMany({
      where: { sourceId: source.id },
      orderBy: { worksheetTitle: "asc" },
    });
    const selected = selectedWorksheets(worksheets, options);
    if ((options.worksheetKey || options.worksheetTitle) && selected.length !== 1) {
      throw new Error("Requested worksheet is not uniquely registered.");
    }
    for (const worksheet of selected) {
      if (!(await renewSyncSourceLease(sourceId, lease.token)))
        throw new Error("Synchronization lease was lost.");
      worksheetResults.push(await syncWorksheet(worksheet, options));
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
    const status: SyncRunStatus =
      failed === 0 ? "SUCCESS" : failed < selected.length ? "PARTIAL" : "FAILED";
    await prisma.syncRun.update({
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
    });
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
    if (syncRunId !== null) {
      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorSummary: safeErrorMessage(error),
          failed: 1,
        },
      });
    }
    throw error;
  } finally {
    await releaseSyncSourceLease(sourceId, lease.token);
  }
}

export function sourceKeyForConfiguredSpreadsheet(spreadsheetId: string) {
  return stableGoogleSheetsSourceKey(spreadsheetId);
}
