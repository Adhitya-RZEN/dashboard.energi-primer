import "server-only";

import {
  parseBBWorksheetName,
  preferBBWorksheetName,
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
import {
  evaluateAutomaticWorksheet,
  isAfterCanonicalBBWorksheet,
  isAutomaticFutureBBWorksheet,
} from "./bb-policy";
import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";
import { withDatabaseRetry, withSyncRetry } from "./retry";
import { BB_CANONICAL_WORKSHEET } from "@/services/google-sheets/legacy-mapping/profiles";
import { classifySyncError } from "./error-classification";

export type SyncTriggerType = "manual" | "cron" | "verification";
export type SyncRunStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "LOCKED";

export type IncrementalSyncOptions = {
  triggerType?: SyncTriggerType;
  worksheetTitle?: string;
  worksheetKey?: string;
  scope?: "current" | "all" | "automatic";
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
    const requestedPeriod = parseBBWorksheetName(options.worksheetTitle);
    if (requestedPeriod) {
      return preferredWorksheetsByPeriod(
        withoutDisabledOrMissing.filter((worksheet) => {
          const period = parseBBWorksheetName(worksheet.worksheetTitle);
          return (
            period?.month === requestedPeriod.month &&
            period.year === requestedPeriod.year
          );
        }),
      );
    }
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
  const scope = options.scope ??
    (options.triggerType === "cron" ? "automatic" : "all");
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
    detectSchemaChange(worksheet.schemaSnapshot, schemaSnapshot);
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
    const canonicalCandidates = preferredWorksheetsByPeriod(
      worksheets.filter((worksheet) => {
        const period = parseBBWorksheetName(worksheet.worksheetTitle);
        return period?.month === 7 && period.year === 2026;
      }),
    );
    const canonicalWorksheet =
      canonicalCandidates.find(
        (worksheet) =>
          worksheet.worksheetTitle.trim().toLocaleLowerCase("en-US") ===
          BB_CANONICAL_WORKSHEET.toLocaleLowerCase("en-US"),
      ) ?? canonicalCandidates[0] ?? null;
    if ((options.worksheetKey || options.worksheetTitle) && selected.length !== 1) {
      throw new Error("Requested worksheet is not uniquely registered.");
    }
    for (const worksheet of selected) {
      if (!(await renewSyncSourceLease(sourceId, lease.token)))
        throw new Error("Synchronization lease was lost.");
      worksheetResults.push(
        await syncWorksheet(worksheet, options, canonicalWorksheet?.schemaSnapshot ?? null),
      );
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
    const safeError = safeErrorMessage(error);
    console.error("[google-sheets-sync]", safeError);
    if (syncRunId !== null) {
      await prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorSummary: safeError,
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
