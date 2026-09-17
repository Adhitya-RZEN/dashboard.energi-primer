import "server-only";

import { prisma } from "@/lib/prisma";
import { automationAlertClass } from "./automation-observability";
import { readAutomationConfig } from "./automation-contract";

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
  automation: {
    mode: "ENABLED" | "DISABLED";
    killSwitch: "ENABLED" | "DISABLED";
    enabled: boolean;
    blockers: readonly string[];
    lastRunStatus: string | null;
    lastRunAt: string | null;
    alert: "NORMAL" | "ACTION_REQUIRED" | "SYSTEM_FAILURE";
  };
};

function emptySnapshot(): SyncMonitoringSnapshot {
  const config = readAutomationConfig();
  return {
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
    automation: {
      mode: config.mode,
      killSwitch: config.killSwitch,
      enabled: config.enabled,
      blockers: config.blockers,
      lastRunStatus: null,
      lastRunAt: null,
      alert: automationAlertClass({ status: "BLOCKED", blockers: config.blockers }),
    },
  };
}

export async function getSyncMonitoringSnapshot(): Promise<SyncMonitoringSnapshot> {
  try {
    const config = readAutomationConfig();
    const source = await prisma.syncSource.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!source) return emptySnapshot();

    const [latestRun, latestSuccess, latestFailure, latestAutomaticRun, worksheets, openSchemaChanges] =
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
        prisma.syncRun.findFirst({
          where: { sourceId: source.id, triggerType: "cron" },
          orderBy: { startedAt: "desc" },
          select: { status: true, startedAt: true },
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
      Boolean(
        latestAutomaticRun &&
          ["FAILED", "PARTIAL", "RECONCILIATION_REQUIRED", "LOCKED"].includes(
            latestAutomaticRun.status,
          ),
      ) ||
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
      automation: {
        mode: config.mode,
        killSwitch: config.killSwitch,
        enabled: config.enabled,
        blockers: config.blockers,
        lastRunStatus: latestAutomaticRun?.status ?? null,
        lastRunAt: latestAutomaticRun?.startedAt.toISOString() ?? null,
        alert: automationAlertClass({
          status: latestAutomaticRun?.status ?? (config.enabled ? "NOOP" : "BLOCKED"),
          blockers: config.blockers,
        }),
      },
    };
  } catch {
    return { ...emptySnapshot(), status: "UNAVAILABLE" };
  }
}

