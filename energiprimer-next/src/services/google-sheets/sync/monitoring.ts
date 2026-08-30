import "server-only";

import { prisma } from "@/lib/prisma";

export type SyncMonitoringSnapshot = {
  status: "NOT_CONFIGURED" | "NEVER_RUN" | "HEALTHY" | "WARNING" | "ERROR" | "UNAVAILABLE";
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  worksheetsActive: number;
  worksheetsMissing: number;
  worksheetsReview: number;
  openSchemaChanges: number;
  lastRunCounters: {
    rowsScanned: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null;
};

const emptySnapshot: SyncMonitoringSnapshot = {
  status: "NOT_CONFIGURED",
  lastRunStatus: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  worksheetsActive: 0,
  worksheetsMissing: 0,
  worksheetsReview: 0,
  openSchemaChanges: 0,
  lastRunCounters: null,
};

export async function getSyncMonitoringSnapshot(): Promise<SyncMonitoringSnapshot> {
  try {
    const source = await prisma.syncSource.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!source) return emptySnapshot;

    const [latestRun, latestSuccess, latestFailure, worksheets, openSchemaChanges] =
      await Promise.all([
        prisma.syncRun.findFirst({
          where: { sourceId: source.id },
          orderBy: { startedAt: "desc" },
          select: {
            status: true,
            startedAt: true,
            rowsScanned: true,
            inserted: true,
            updated: true,
            skipped: true,
            failed: true,
          },
        }),
        prisma.syncRun.findFirst({
          where: { sourceId: source.id, status: "SUCCESS" },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        }),
        prisma.syncRun.findFirst({
          where: {
            sourceId: source.id,
            status: { in: ["FAILED", "PARTIAL"] },
          },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        }),
        prisma.syncWorksheet.findMany({
          where: { sourceId: source.id },
          select: { status: true },
        }),
        prisma.syncSchemaChange.count({
          where: { worksheet: { sourceId: source.id }, status: "OPEN" },
        }),
      ]);

    const worksheetCounts = worksheets.reduce(
      (counts, worksheet) => {
        if (worksheet.status === "ACTIVE") counts.active += 1;
        if (worksheet.status === "MISSING") counts.missing += 1;
        if (worksheet.status === "SCHEMA_REVIEW") counts.review += 1;
        return counts;
      },
      { active: 0, missing: 0, review: 0 },
    );
    const hasError =
      Boolean(latestRun && ["FAILED", "PARTIAL"].includes(latestRun.status)) ||
      worksheetCounts.review > 0 ||
      openSchemaChanges > 0;
    return {
      status: !latestRun ? "NEVER_RUN" : hasError ? "WARNING" : "HEALTHY",
      lastRunStatus: latestRun?.status ?? null,
      lastRunAt: latestRun?.startedAt.toISOString() ?? null,
      lastSuccessAt: latestSuccess?.startedAt.toISOString() ?? null,
      lastFailureAt: latestFailure?.startedAt.toISOString() ?? null,
      worksheetsActive: worksheetCounts.active,
      worksheetsMissing: worksheetCounts.missing,
      worksheetsReview: worksheetCounts.review,
      openSchemaChanges,
      lastRunCounters: latestRun
        ? {
            rowsScanned: latestRun.rowsScanned,
            inserted: latestRun.inserted,
            updated: latestRun.updated,
            skipped: latestRun.skipped,
            failed: latestRun.failed,
          }
        : null,
    };
  } catch {
    return { ...emptySnapshot, status: "UNAVAILABLE" };
  }
}

