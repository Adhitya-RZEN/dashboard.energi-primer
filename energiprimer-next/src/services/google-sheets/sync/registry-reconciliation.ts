import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const STALE_REGISTRY_RECONCILIATION_STATUS = "DISCOVERED" as const;

export const STALE_REGISTRY_RECONCILIATION_RESOLUTION =
  "Resolved by guarded canonical reconciliation after read-only validation; original failure records retained and no business data written.";

export type StaleHistoricalRegistryEvidence = {
  registry: {
    sourceId: bigint;
    worksheetKey: string;
    worksheetTitle: string;
    status: string;
    lastSyncAt: Date | null;
    schemaHash: string | null;
    schemaSnapshot: string | null;
    contentHash: string | null;
    rowCount: number;
  } | null;
  expectedSourceId: bigint | null;
  expectedWorksheetKey: string;
  expectedWorksheetTitle: string;
  expectedWorksheetRowCount: number | null;
  currentWorksheetIsValid: boolean;
  liveMatchesCanonicalSnapshot: boolean;
  cleanProductionState: boolean;
  rowStateCount: number;
  failedImportCount: number;
  failedSyncCount: number;
};

/**
 * The registry error is eligible for metadata-only reconciliation only when
 * the current source, canonical structure, failed-run history, and empty
 * Production state all agree. This predicate deliberately requires the
 * unadvanced state left by a rolled-back import; it never treats a partially
 * synced worksheet as stale.
 */
export function isStaleHistoricalRegistryError(
  input: StaleHistoricalRegistryEvidence,
) {
  const registry = input.registry;
  return Boolean(
    registry &&
      input.expectedSourceId !== null &&
      registry.sourceId === input.expectedSourceId &&
      registry.worksheetKey === input.expectedWorksheetKey &&
      registry.worksheetTitle === input.expectedWorksheetTitle &&
      registry.status === "ERROR" &&
      registry.lastSyncAt === null &&
      registry.schemaHash === null &&
      registry.schemaSnapshot === null &&
      registry.contentHash === null &&
      input.expectedWorksheetRowCount !== null &&
      registry.rowCount === input.expectedWorksheetRowCount &&
      input.currentWorksheetIsValid &&
      input.liveMatchesCanonicalSnapshot &&
      input.cleanProductionState &&
      input.rowStateCount === 0 &&
      input.failedImportCount > 0 &&
      input.failedSyncCount > 0,
  );
}

export type ReconcileStaleWorksheetRegistryInput = {
  sourceId: bigint;
  worksheetId: bigint;
  leaseToken: string;
  expectedWorksheetKey: string;
  expectedWorksheetTitle: string;
  expectedWorksheetRowCount: number;
};

export type ReconcileStaleWorksheetRegistryResult = {
  sourceId: string;
  worksheetId: string;
  previousStatus: "ERROR";
  status: typeof STALE_REGISTRY_RECONCILIATION_STATUS;
  schemaChangesResolved: number;
  rowStatesWritten: 0;
  businessDataWrites: 0;
};

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Reconciles only the operational marker left by a proven rolled-back sync.
 * The caller must hold the normal source lease. The short transaction locks
 * source and worksheet rows, rechecks the unadvanced state, changes ERROR to
 * DISCOVERED, and records resolution on existing schema-review rows. It does
 * not create row states or touch staging/normalized business tables.
 */
export async function reconcileStaleWorksheetRegistry(
  input: ReconcileStaleWorksheetRegistryInput,
): Promise<ReconcileStaleWorksheetRegistryResult> {
  return prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const lockedSources = await tx.$queryRaw<
        Array<{
          id: bigint;
          status: string;
          lock_token: string | null;
          lock_expires_at: Date | null;
        }>
      >(
        Prisma.sql`
          SELECT id, status, lock_token, lock_expires_at
          FROM sync_sources
          WHERE id = ${input.sourceId}
          FOR UPDATE
        `,
      );
      const source = lockedSources[0];
      requireCondition(source, "sync source was not found");
      requireCondition(source.status === "ACTIVE", "sync source is not active");
      requireCondition(
        source.lock_token === input.leaseToken &&
          source.lock_expires_at !== null &&
          source.lock_expires_at > now,
        "reconciliation requires the active source lease held by this process",
      );

      const lockedWorksheets = await tx.$queryRaw<Array<{ id: bigint }>>(
        Prisma.sql`
          SELECT id
          FROM sync_worksheets
          WHERE id = ${input.worksheetId}
            AND source_id = ${input.sourceId}
          FOR UPDATE
        `,
      );
      requireCondition(
        lockedWorksheets.length === 1,
        "worksheet identity changed before reconciliation",
      );

      const worksheet = await tx.syncWorksheet.findUnique({
        where: { id: input.worksheetId },
        select: {
          id: true,
          sourceId: true,
          worksheetKey: true,
          worksheetTitle: true,
          status: true,
          lastSyncAt: true,
          schemaHash: true,
          schemaSnapshot: true,
          contentHash: true,
          rowCount: true,
        },
      });
      requireCondition(worksheet, "worksheet registry row was not found");
      requireCondition(
        worksheet.sourceId === input.sourceId &&
          worksheet.worksheetKey === input.expectedWorksheetKey &&
          worksheet.worksheetTitle === input.expectedWorksheetTitle,
        "worksheet registry identity changed before reconciliation",
      );
      requireCondition(
        worksheet.status === "ERROR",
        "worksheet registry status is no longer the expected ERROR state",
      );
      requireCondition(
        worksheet.rowCount === input.expectedWorksheetRowCount,
        "worksheet discovery row count changed before reconciliation",
      );
      requireCondition(
        worksheet.lastSyncAt === null &&
          worksheet.schemaHash === null &&
          worksheet.schemaSnapshot === null &&
          worksheet.contentHash === null,
        "worksheet has advanced state and is not eligible for stale-error reconciliation",
      );

      const rowStateCount = await tx.syncRowState.count({
        where: { worksheetId: input.worksheetId },
      });
      requireCondition(
        rowStateCount === 0,
        "worksheet already has row state; refusing metadata-only reconciliation",
      );

      const updated = await tx.syncWorksheet.updateMany({
        where: { id: input.worksheetId, status: "ERROR" },
        data: { status: STALE_REGISTRY_RECONCILIATION_STATUS },
      });
      requireCondition(
        updated.count === 1,
        "worksheet registry status changed concurrently",
      );

      const openSchemaChanges = await tx.syncSchemaChange.findMany({
        where: { worksheetId: input.worksheetId, status: "OPEN" },
        select: { id: true, resolution: true },
      });
      for (const schemaChange of openSchemaChanges) {
        const historicalResolution = schemaChange.resolution?.trim();
        const resolution = historicalResolution
          ? `${historicalResolution} ${STALE_REGISTRY_RECONCILIATION_RESOLUTION}`
          : STALE_REGISTRY_RECONCILIATION_RESOLUTION;
        await tx.syncSchemaChange.update({
          where: { id: schemaChange.id },
          data: { status: "RESOLVED", resolution },
        });
      }

      return {
        sourceId: input.sourceId.toString(),
        worksheetId: input.worksheetId.toString(),
        previousStatus: "ERROR",
        status: STALE_REGISTRY_RECONCILIATION_STATUS,
        schemaChangesResolved: openSchemaChanges.length,
        rowStatesWritten: 0,
        businessDataWrites: 0,
      };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}
