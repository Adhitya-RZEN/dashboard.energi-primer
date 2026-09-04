import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  getGoogleSheetsConfig,
  listGoogleSheetsWorksheets,
  type GoogleSheetsConfig,
  type GoogleSheetsWorksheetMetadata,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { normalizeWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";
import {
  diagnosticDurationMs,
  diagnosticNow,
  emitSyncDiagnostic,
  type SyncDiagnosticContext,
} from "./diagnostic-core";
import { safeSyncErrorDetails, withSyncDiagnostic } from "./diagnostics";
import {
  acquireSyncSourceLease,
  ensureSyncSourceForDiscovery,
  releaseSyncSourceLease,
} from "./lease";

export const SYNC_WORKSHEET_STATUSES = [
  "DISCOVERED",
  "VALIDATED",
  "ACTIVE",
  "SCHEMA_REVIEW",
  "DISABLED",
  "MISSING",
  "ERROR",
] as const;

export type SyncWorksheetStatus = (typeof SYNC_WORKSHEET_STATUSES)[number];

export type ExistingWorksheetSnapshot = {
  worksheetKey: string;
  worksheetTitle: string;
  status: string;
};

export type WorksheetDiscoveryChange = {
  worksheetKey: string;
  title: string | null;
  type: "NEW" | "UNCHANGED" | "RENAMED" | "MISSING";
};

export type WorksheetDiscoveryDiff = {
  changes: WorksheetDiscoveryChange[];
  newCount: number;
  unchangedCount: number;
  renamedCount: number;
  missingCount: number;
};

export function stableGoogleSheetsSourceKey(spreadsheetId: string) {
  return createHash("sha256")
    .update(`google-sheets:${spreadsheetId}`)
    .digest("hex");
}

export function classifyWorksheetDiscovery(
  previous: readonly ExistingWorksheetSnapshot[],
  current: readonly GoogleSheetsWorksheetMetadata[],
): WorksheetDiscoveryDiff {
  const previousByKey = new Map(
    previous.map((worksheet) => [worksheet.worksheetKey, worksheet]),
  );
  const currentKeys = new Set(current.map((worksheet) => worksheet.sheetId));
  const changes: WorksheetDiscoveryChange[] = [];

  for (const worksheet of current) {
    const existing = previousByKey.get(worksheet.sheetId);
    if (!existing) {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "NEW",
      });
    } else if (existing.worksheetTitle !== worksheet.title) {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "RENAMED",
      });
    } else {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "UNCHANGED",
      });
    }
  }

  for (const worksheet of previous) {
    if (!currentKeys.has(worksheet.worksheetKey)) {
      changes.push({
        worksheetKey: worksheet.worksheetKey,
        title: null,
        type: "MISSING",
      });
    }
  }

  return {
    changes,
    newCount: changes.filter((change) => change.type === "NEW").length,
    unchangedCount: changes.filter((change) => change.type === "UNCHANGED")
      .length,
    renamedCount: changes.filter((change) => change.type === "RENAMED").length,
    missingCount: changes.filter((change) => change.type === "MISSING").length,
  };
}

function statusForExistingWorksheet(status: string | undefined): SyncWorksheetStatus {
  if (status === "MISSING") return "DISCOVERED";
  if (
    status &&
    (SYNC_WORKSHEET_STATUSES as readonly string[]).includes(status)
  ) {
    return status as SyncWorksheetStatus;
  }
  return "DISCOVERED";
}

export type PreparedGoogleSheetsDiscovery = {
  sourceKey: string;
  externalId: string;
  current: readonly GoogleSheetsWorksheetMetadata[];
  now: Date;
};

type PreparedCurrentWorksheet = {
  worksheetKey: string;
  worksheetTitle: string;
  normalizedTitle: string;
  status: SyncWorksheetStatus;
  rowCount: number;
};

export type PreparedWorksheetDiscovery = {
  sourceId: bigint;
  sourceKey: string;
  current: readonly PreparedCurrentWorksheet[];
  missingKeys: readonly string[];
  diff: WorksheetDiscoveryDiff;
  now: Date;
};

export async function prepareGoogleSheetsWorksheetDiscovery(
  context?: SyncDiagnosticContext,
): Promise<PreparedGoogleSheetsDiscovery> {
  const configStartedAt = diagnosticNow();
  let config: GoogleSheetsConfig;
  try {
    config = getGoogleSheetsConfig();
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "google_config",
        status: "PASS",
        durationMs: diagnosticDurationMs(configStartedAt),
      });
    }
  } catch (error) {
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "google_config",
        status: "FAIL",
        durationMs: diagnosticDurationMs(configStartedAt),
        ...safeSyncErrorDetails(error),
      });
    }
    throw error;
  }

  // The metadata request is deliberately completed before any database write.
  const current = await listGoogleSheetsWorksheets({
    config,
    diagnostic: context,
  });
  return {
    sourceKey: stableGoogleSheetsSourceKey(config.spreadsheetId),
    externalId: config.spreadsheetId,
    current,
    now: new Date(),
  };
}

export function prepareWorksheetDiscovery(
  previous: readonly ExistingWorksheetSnapshot[],
  current: readonly GoogleSheetsWorksheetMetadata[],
  sourceId: bigint,
  sourceKey: string,
  now: Date,
): PreparedWorksheetDiscovery {
  const currentKeys = new Set<string>();
  for (const worksheet of current) {
    if (currentKeys.has(worksheet.sheetId)) {
      throw new Error("Duplicate worksheet stable key in current metadata.");
    }
    currentKeys.add(worksheet.sheetId);
  }

  const previousByKey = new Map(
    previous.map((worksheet) => [worksheet.worksheetKey, worksheet]),
  );
  const diff = classifyWorksheetDiscovery(previous, current);
  const preparedCurrent = current.map((worksheet) => {
    const existing = previousByKey.get(worksheet.sheetId);
    return {
      worksheetKey: worksheet.sheetId,
      worksheetTitle: worksheet.title,
      normalizedTitle: normalizeWorksheetName(worksheet.title),
      status: statusForExistingWorksheet(existing?.status),
      rowCount: worksheet.rowCount ?? 0,
    };
  });
  const missingKeys = previous
    .filter((worksheet) => !currentKeys.has(worksheet.worksheetKey))
    .map((worksheet) => worksheet.worksheetKey);

  return {
    sourceId,
    sourceKey,
    current: preparedCurrent,
    missingKeys,
    diff,
    now,
  };
}

async function persistCurrentWorksheets(
  tx: Prisma.TransactionClient,
  input: PreparedWorksheetDiscovery,
) {
  if (input.current.length === 0) return;
  const values = input.current.map((worksheet) =>
    Prisma.sql`(
      ${input.sourceId},
      ${worksheet.worksheetKey},
      ${worksheet.worksheetTitle},
      ${worksheet.normalizedTitle},
      ${worksheet.status},
      ${input.now},
      ${input.now},
      ${worksheet.rowCount},
      ${input.now}
    )`,
  );

  await tx.$executeRaw`
    INSERT INTO "sync_worksheets" (
      "source_id",
      "worksheet_key",
      "worksheet_title",
      "normalized_title",
      "status",
      "first_seen_at",
      "last_seen_at",
      "row_count",
      "updated_at"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("source_id", "worksheet_key")
    DO UPDATE SET
      "worksheet_title" = EXCLUDED."worksheet_title",
      "normalized_title" = EXCLUDED."normalized_title",
      "status" = EXCLUDED."status",
      "last_seen_at" = EXCLUDED."last_seen_at",
      "row_count" = EXCLUDED."row_count",
      "updated_at" = EXCLUDED."updated_at"
  `;
}

export async function persistGoogleSheetsWorksheetDiscovery(
  prepared: PreparedGoogleSheetsDiscovery,
  sourceId: bigint,
  context?: SyncDiagnosticContext,
) {
  const registryRead = await withSyncDiagnostic(
    context,
    "discovery_registry_read",
    () =>
      prisma.syncWorksheet.findMany({
        where: { sourceId },
        select: {
          worksheetKey: true,
          worksheetTitle: true,
          status: true,
        },
      }),
  );

  const preparationStartedAt = diagnosticNow();
  let input: PreparedWorksheetDiscovery;
  try {
    input = prepareWorksheetDiscovery(
      registryRead,
      prepared.current,
      sourceId,
      prepared.sourceKey,
      prepared.now,
    );
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "discovery_preparation",
        status: "PASS",
        durationMs: diagnosticDurationMs(preparationStartedAt),
      });
    }
  } catch (error) {
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "discovery_preparation",
        status: "FAIL",
        durationMs: diagnosticDurationMs(preparationStartedAt),
        ...safeSyncErrorDetails(error),
      });
    }
    throw error;
  }

  const transactionStartedAt = diagnosticNow();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.syncSource.update({
        where: { id: sourceId },
        data: {
          externalId: prepared.externalId,
          status: "ACTIVE",
          lastDiscoveredAt: prepared.now,
        },
      });

      const currentStartedAt = diagnosticNow();
      try {
        await persistCurrentWorksheets(tx, input);
        if (context) {
          emitSyncDiagnostic({
            context,
            stage: "discovery_current_persistence",
            status: "PASS",
            durationMs: diagnosticDurationMs(currentStartedAt),
          });
        }
      } catch (error) {
        if (context) {
          emitSyncDiagnostic({
            context,
            stage: "discovery_current_persistence",
            status: "FAIL",
            durationMs: diagnosticDurationMs(currentStartedAt),
            ...safeSyncErrorDetails(error),
          });
        }
        throw error;
      }

      const missingStartedAt = diagnosticNow();
      try {
        if (input.missingKeys.length > 0) {
          await tx.syncWorksheet.updateMany({
            where: {
              sourceId,
              worksheetKey: { in: [...input.missingKeys] },
            },
            data: { status: "MISSING" },
          });
        }
        if (context) {
          emitSyncDiagnostic({
            context,
            stage: "discovery_missing_persistence",
            status: "PASS",
            durationMs: diagnosticDurationMs(missingStartedAt),
          });
        }
      } catch (error) {
        if (context) {
          emitSyncDiagnostic({
            context,
            stage: "discovery_missing_persistence",
            status: "FAIL",
            durationMs: diagnosticDurationMs(missingStartedAt),
            ...safeSyncErrorDetails(error),
          });
        }
        throw error;
      }

      return {
        sourceId: sourceId.toString(),
        sourceKey: prepared.sourceKey,
        worksheetCount: prepared.current.length,
        diff: input.diff,
      };
    }, { maxWait: 10_000, timeout: 60_000 });

    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "discovery_transaction",
        status: "PASS",
        durationMs: diagnosticDurationMs(transactionStartedAt),
      });
    }
    return result;
  } catch (error) {
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "discovery_transaction",
        status: "FAIL",
        durationMs: diagnosticDurationMs(transactionStartedAt),
        ...safeSyncErrorDetails(error),
      });
    }
    throw error;
  }
}

/**
 * Compatibility entry point for the verification script. The incremental
 * engine keeps the lease for the entire sync; this standalone discovery path
 * acquires and releases it around registry persistence.
 */
export async function discoverGoogleSheetsWorksheets(
  context?: SyncDiagnosticContext,
) {
  const totalStartedAt = diagnosticNow();
  try {
    const prepared = await prepareGoogleSheetsWorksheetDiscovery(context);
    const sourceId = await ensureSyncSourceForDiscovery(
      prepared.sourceKey,
      prepared.externalId,
      context,
    );
    const leaseStartedAt = diagnosticNow();
    const lease = await acquireSyncSourceLease(sourceId);
    if (context) {
      emitSyncDiagnostic({
        context,
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
    }
    if (!lease) throw new Error("Synchronization source lease was not acquired.");
    try {
      const result = await persistGoogleSheetsWorksheetDiscovery(
        prepared,
        sourceId,
        context,
      );
      if (context) {
        emitSyncDiagnostic({
          context,
          stage: "discovery_total",
          status: "PASS",
          durationMs: diagnosticDurationMs(totalStartedAt),
        });
      }
      return result;
    } finally {
      await releaseSyncSourceLease(sourceId, lease.token);
    }
  } catch (error) {
    if (context) {
      emitSyncDiagnostic({
        context,
        stage: "discovery_total",
        status: "FAIL",
        durationMs: diagnosticDurationMs(totalStartedAt),
        ...safeSyncErrorDetails(error),
      });
    }
    throw error;
  }
}

export async function getSyncSourceByKey(sourceKey: string) {
  return prisma.syncSource.findUnique({
    where: { sourceKey },
    include: { worksheets: { orderBy: { worksheetTitle: "asc" } } },
  });
}
