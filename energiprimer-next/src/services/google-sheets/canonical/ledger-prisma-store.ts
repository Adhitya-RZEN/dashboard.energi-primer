import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type {
  CanonicalImportPlan,
} from "./types";
import {
  assertCanonicalLedgerBatchManifests,
  assertCanonicalLedgerBatchManifestsMatch,
  assertCanonicalLedgerPlanImmutable,
  CanonicalLedgerError,
  transitionCanonicalLedgerBatch,
  transitionCanonicalLedgerRun,
  type CanonicalLedgerBatch,
  type CanonicalLedgerBatchManifest,
  type CanonicalLedgerClaim,
  type CanonicalLedgerRun,
  type CanonicalLedgerRunState,
  type CanonicalLedgerStore,
} from "./ledger";
import type { ObservedCanonicalPlanItem } from "./reconciliation";

const RUN_STATES = new Set<string>([
  "APPROVED",
  "COMMITTING",
  "COMMITTED",
  "RECONCILIATION_REQUIRED",
  "RECONCILED",
  "FAILED",
  "BLOCKED",
]);
const BATCH_STATES = new Set<string>([
  "PENDING",
  "RUNNING",
  "COMMITTED",
  "FAILED",
  "RECONCILIATION_REQUIRED",
]);

function runState(value: string): CanonicalLedgerRunState {
  if (!RUN_STATES.has(value)) throw new CanonicalLedgerError("Unknown durable ledger run state.");
  return value as CanonicalLedgerRunState;
}

function batchState(value: string): CanonicalLedgerBatch["status"] {
  if (!BATCH_STATES.has(value)) throw new CanonicalLedgerError("Unknown durable ledger batch state.");
  return value as CanonicalLedgerBatch["status"];
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function effectivePeriod(plan: CanonicalImportPlan) {
  const period = plan.sourceManifest.effectivePeriod;
  return period ? new Date(Date.UTC(period.year, period.month - 1, 1)) : null;
}

function mapBatch(row: {
  batchNumber: number;
  planHash: string;
  itemCount: number;
  itemManifest: string;
  status: string;
  attemptCount: number;
  executionId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  committedItemCount: number;
  retryable: boolean;
  failureCode: string | null;
  failureSummary: string | null;
  observationSnapshot: string | null;
}): CanonicalLedgerBatch {
  let itemKeys: readonly string[] = [];
  try {
    const manifest = JSON.parse(row.itemManifest) as { itemKeys?: unknown };
    if (Array.isArray(manifest.itemKeys)) {
      itemKeys = manifest.itemKeys.filter((value): value is string => typeof value === "string");
    }
  } catch {
    throw new CanonicalLedgerError("Durable batch item manifest is malformed.");
  }
  return {
    batchNumber: row.batchNumber,
    planHash: row.planHash,
    itemKeys,
    itemCount: row.itemCount,
    status: batchState(row.status),
    attemptCount: row.attemptCount,
    executionId: row.executionId,
    startedAt: iso(row.startedAt),
    heartbeatAt: iso(row.heartbeatAt),
    completedAt: iso(row.completedAt),
    committedItemCount: row.committedItemCount,
    retryable: row.retryable,
    failureCode: row.failureCode,
    failureSummary: row.failureSummary,
    observationSnapshot: row.observationSnapshot,
  };
}

function mapRun(row: {
  id: bigint;
  planId: string;
  planHash: string;
  importRunId: string;
  planSnapshot: string;
  status: string;
  approvalState: string;
  attemptCount: number;
  executionId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  failureSummary: string | null;
  batches: Parameters<typeof mapBatch>[0][];
}): CanonicalLedgerRun {
  if (row.approvalState !== "APPROVED") throw new CanonicalLedgerError("Durable ledger approval state is not APPROVED.");
  return {
    id: row.id.toString(),
    planId: row.planId,
    planHash: row.planHash,
    importRunId: row.importRunId,
    planSnapshot: row.planSnapshot,
    status: runState(row.status),
    approvalState: "APPROVED",
    attemptCount: row.attemptCount,
    executionId: row.executionId,
    startedAt: iso(row.startedAt),
    heartbeatAt: iso(row.heartbeatAt),
    completedAt: iso(row.completedAt),
    failureCode: row.failureCode,
    failureSummary: row.failureSummary,
    batches: row.batches.map(mapBatch),
  };
}

function planSnapshot(plan: CanonicalImportPlan) {
  return JSON.stringify(plan);
}

async function loadById(runId: string) {
  if (!/^\d+$/u.test(runId)) throw new CanonicalLedgerError("Durable ledger run id is invalid.");
  const row = await prisma.canonicalImportRun.findUnique({
    where: { id: BigInt(runId) },
    include: { batches: { orderBy: { batchNumber: "asc" } } },
  });
  return row ? mapRun(row) : null;
}

/** Read-only capability probe used by the canary precondition. */
export async function verifyCanonicalLedgerCapability() {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = ${"public"}
      AND table_name IN (${"canonical_import_runs"}, ${"canonical_import_batches"})
  `;
  return Number(rows[0]?.count ?? 0) === 2;
}

export class PrismaCanonicalLedgerStore implements CanonicalLedgerStore {
  async createOrLoad(input: {
    plan: CanonicalImportPlan;
    batches: readonly CanonicalLedgerBatchManifest[];
    now: Date;
  }) {
    assertCanonicalLedgerBatchManifests(input.plan, input.batches);
    const snapshot = planSnapshot(input.plan);
    const existing = await prisma.canonicalImportRun.findUnique({
      where: { planHash: input.plan.planHash },
      include: { batches: { orderBy: { batchNumber: "asc" } } },
    });
    if (existing) {
      assertCanonicalLedgerPlanImmutable(existing.planHash, input.plan.planHash);
      if (existing.planSnapshot !== snapshot)
        throw new CanonicalLedgerError("The durable plan snapshot is immutable and differs.");
      const stored = mapRun(existing);
      assertCanonicalLedgerBatchManifestsMatch(stored.batches, input.batches);
      return stored;
    }
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.canonicalImportRun.create({
          data: {
            planId: input.plan.planId,
            planHash: input.plan.planHash,
            importRunId: input.plan.importRunId,
            sourceKey: input.plan.sourceManifest.sourceKey,
            spreadsheetId: input.plan.sourceManifest.spreadsheetId,
            sheetId: input.plan.sourceManifest.sheetId,
            worksheetTitle: input.plan.sourceManifest.worksheetTitleSnapshot,
            sourceRange: input.plan.sourceManifest.sourceRange,
            effectivePeriod: effectivePeriod(input.plan),
            mappingProfile: input.plan.mappingProfile,
            mappingVersion: input.plan.mappingVersion,
            schemaVersion: input.plan.schemaVersion,
            parserVersion: input.plan.parserVersion,
            schemaFingerprint: input.plan.sourceManifest.schemaFingerprint,
            sourceManifest: JSON.stringify(input.plan.sourceManifest),
            planSnapshot: snapshot,
            status: "APPROVED",
            approvalState: input.plan.approvalState,
            totalItems: input.plan.items.length,
            plannedInsert: input.plan.operationCounts.INSERT,
            plannedUpdate: input.plan.operationCounts.UPDATE,
            plannedSkip: input.plan.operationCounts.SKIP,
            plannedBlock: input.plan.operationCounts.BLOCK,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
        if (input.batches.length > 0) {
          await tx.canonicalImportBatch.createMany({
            data: input.batches.map((batch) => ({
              runId: created.id,
              batchNumber: batch.batchNumber,
              planHash: batch.planHash,
              itemCount: batch.itemCount,
              itemManifest: JSON.stringify({ itemKeys: batch.itemKeys }),
              status: "PENDING",
              createdAt: input.now,
              updatedAt: input.now,
            })),
          });
        }
        return tx.canonicalImportRun.findUniqueOrThrow({
          where: { id: created.id },
          include: { batches: { orderBy: { batchNumber: "asc" } } },
        });
      }, { timeout: 5_000 });
      return mapRun(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.canonicalImportRun.findUnique({
          where: { planHash: input.plan.planHash },
          include: { batches: { orderBy: { batchNumber: "asc" } } },
        });
        if (raced) {
          if (raced.planSnapshot !== snapshot)
            throw new CanonicalLedgerError("The durable plan snapshot is immutable and differs.");
          const stored = mapRun(raced);
          assertCanonicalLedgerBatchManifestsMatch(stored.batches, input.batches);
          return stored;
        }
      }
      throw error;
    }
  }

  async get(runId: string) {
    return loadById(runId);
  }

  async transitionRun(input: {
    runId: string;
    to: CanonicalLedgerRunState;
    now: Date;
    explicitRecovery?: boolean;
    executionId?: string;
    failureCode?: string | null;
    failureSummary?: string | null;
  }) {
    const current = await loadById(input.runId);
    if (!current) throw new CanonicalLedgerError("Ledger run was not found.");
    transitionCanonicalLedgerRun(current.status, input.to, {
      explicitRecovery: input.explicitRecovery,
    });
    const data: Parameters<typeof prisma.canonicalImportRun.update>[0]["data"] = {
      status: input.to,
      ...(input.executionId === undefined ? {} : { executionId: input.executionId }),
      ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
      ...(input.failureSummary === undefined ? {} : { failureSummary: input.failureSummary }),
      ...(input.to === "COMMITTING"
        ? {
            attemptCount: { increment: 1 },
            heartbeatAt: input.now,
            startedAt: current.startedAt ? undefined : input.now,
          }
        : {}),
      ...(input.to === "COMMITTED" || input.to === "RECONCILED"
        ? { completedAt: input.now }
        : {}),
      updatedAt: input.now,
    };
    const updated = await prisma.canonicalImportRun.updateMany({
      where: { id: BigInt(input.runId), status: current.status },
      data,
    });
    if (updated.count !== 1) throw new CanonicalLedgerError("Ledger run transition lost a concurrent update.");
    const result = await loadById(input.runId);
    if (!result) throw new CanonicalLedgerError("Ledger run disappeared after transition.");
    return result;
  }

  async claimBatch(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    staleAfterMs: number;
    recoveryEvidence?: "ABSENT" | "COMMITTED" | "CONFLICTING" | "UNKNOWN";
  }): Promise<CanonicalLedgerClaim> {
    const run = await loadById(input.runId);
    if (!run) return { status: "MISSING" };
    const current = run.batches.find((batch) => batch.batchNumber === input.batchNumber);
    if (!current) return { status: "MISSING" };
    if (current.status === "COMMITTED") return { status: "COMMITTED", batch: current };
    if (current.status === "RECONCILIATION_REQUIRED" && input.recoveryEvidence !== "ABSENT") {
      return { status: "RECONCILIATION_REQUIRED", batch: current };
    }
    if (current.status === "RUNNING") {
      const cutoff = new Date(input.now.getTime() - input.staleAfterMs);
      const stale = current.heartbeatAt === null || Date.parse(current.heartbeatAt) < cutoff.getTime();
      if (!stale) return { status: "ACTIVE", batch: current };
      const marked = await prisma.canonicalImportBatch.updateMany({
        where: {
          id: BigInt((await prisma.canonicalImportBatch.findFirstOrThrow({
            where: { runId: BigInt(input.runId), batchNumber: input.batchNumber },
            select: { id: true },
          })).id),
          status: "RUNNING",
          heartbeatAt: current.heartbeatAt ? { lt: cutoff } : undefined,
        },
        data: {
          status: "RECONCILIATION_REQUIRED",
          retryable: false,
          failureCode: "STALE_RUNNING_BATCH",
          failureSummary: "A stale running batch requires target reconciliation before retry.",
          updatedAt: input.now,
        },
      });
      if (marked.count === 0) return { status: "ACTIVE", batch: current };
      const refreshed = await loadById(input.runId);
      const batch = refreshed?.batches.find((item) => item.batchNumber === input.batchNumber);
      if (!batch) return { status: "MISSING" };
      return { status: "RECONCILIATION_REQUIRED", batch };
    }
    if (current.status === "FAILED" && !current.retryable) {
      return { status: "RECONCILIATION_REQUIRED", batch: current };
    }
    const expectedStatuses = current.status === "FAILED"
      ? ["FAILED"]
      : current.status === "RECONCILIATION_REQUIRED"
        ? ["RECONCILIATION_REQUIRED"]
        : ["PENDING"];
    const row = await prisma.canonicalImportBatch.findFirst({
      where: { runId: BigInt(input.runId), batchNumber: input.batchNumber, status: { in: expectedStatuses } },
      select: { id: true, status: true, startedAt: true },
    });
    if (!row) {
      const refreshed = await loadById(input.runId);
      const batch = refreshed?.batches.find((item) => item.batchNumber === input.batchNumber);
      return batch?.status === "COMMITTED"
        ? { status: "COMMITTED", batch }
        : batch?.status === "RUNNING"
          ? { status: "ACTIVE", batch }
          : batch
            ? { status: "RECONCILIATION_REQUIRED", batch }
            : { status: "MISSING" };
    }
    const updated = await prisma.canonicalImportBatch.updateMany({
      where: { id: row.id, status: { in: expectedStatuses } },
      data: {
        status: "RUNNING",
        attemptCount: { increment: 1 },
        executionId: input.executionId,
        startedAt: row.startedAt ?? input.now,
        heartbeatAt: input.now,
        retryable: true,
        updatedAt: input.now,
      },
    });
    if (updated.count !== 1) {
      const refreshed = await loadById(input.runId);
      const batch = refreshed?.batches.find((item) => item.batchNumber === input.batchNumber);
      return batch ? { status: "ACTIVE", batch } : { status: "MISSING" };
    }
    const refreshed = await loadById(input.runId);
    const batch = refreshed?.batches.find((item) => item.batchNumber === input.batchNumber);
    return batch ? { status: "CLAIMED", batch } : { status: "MISSING" };
  }

  async markBatchCommitted(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    observations: readonly ObservedCanonicalPlanItem[];
    stateOnly?: boolean;
  }) {
    const run = await loadById(input.runId);
    if (!run) throw new CanonicalLedgerError("Ledger run was not found.");
    const batch = run.batches.find((item) => item.batchNumber === input.batchNumber);
    if (!batch) throw new CanonicalLedgerError("Ledger batch was not found.");
    if (batch.status === "COMMITTED") return run;
    if (input.stateOnly) {
      if (batch.status !== "RECONCILIATION_REQUIRED")
        throw new CanonicalLedgerError("State-only commit requires reconciliation-required batch state.");
    } else if (batch.status !== "RUNNING" || batch.executionId !== input.executionId) {
      throw new CanonicalLedgerError("Ledger batch execution ownership changed.");
    }
    transitionCanonicalLedgerBatch(batch.status, "COMMITTED");
    const updated = await prisma.canonicalImportBatch.updateMany({
      where: {
        runId: BigInt(input.runId),
        batchNumber: input.batchNumber,
        status: batch.status,
        ...(input.stateOnly ? {} : { executionId: input.executionId }),
      },
      data: {
        status: "COMMITTED",
        completedAt: input.now,
        heartbeatAt: input.now,
        committedItemCount: input.observations.filter(
          (item) => item.operation === "INSERT" || item.operation === "UPDATE",
        ).length,
        retryable: false,
        failureCode: null,
        failureSummary: null,
        observationSnapshot: JSON.stringify(input.observations),
        updatedAt: input.now,
      },
    });
    if (updated.count !== 1) throw new CanonicalLedgerError("Ledger batch commit transition lost a concurrent update.");
    const result = await loadById(input.runId);
    if (!result) throw new CanonicalLedgerError("Ledger run disappeared after batch commit.");
    return result;
  }

  async markBatchFailed(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    errorCode: string;
    errorSummary: string;
    unknownOutcome: boolean;
  }) {
    const run = await loadById(input.runId);
    if (!run) throw new CanonicalLedgerError("Ledger run was not found.");
    const batch = run.batches.find((item) => item.batchNumber === input.batchNumber);
    if (!batch) throw new CanonicalLedgerError("Ledger batch was not found.");
    if (batch.status === "COMMITTED") return run;
    if (batch.status !== "RUNNING" || batch.executionId !== input.executionId)
      throw new CanonicalLedgerError("Only the owning running batch can be failed.");
    const next = input.unknownOutcome ? "RECONCILIATION_REQUIRED" : "FAILED";
    transitionCanonicalLedgerBatch(batch.status, next);
    const updated = await prisma.canonicalImportBatch.updateMany({
      where: {
        runId: BigInt(input.runId),
        batchNumber: input.batchNumber,
        status: "RUNNING",
        executionId: input.executionId,
      },
      data: {
        status: next,
        completedAt: input.unknownOutcome ? null : input.now,
        heartbeatAt: input.now,
        retryable: !input.unknownOutcome,
        failureCode: input.errorCode,
        failureSummary: input.errorSummary,
        updatedAt: input.now,
      },
    });
    if (updated.count !== 1) throw new CanonicalLedgerError("Ledger batch failure transition lost a concurrent update.");
    const result = await loadById(input.runId);
    if (!result) throw new CanonicalLedgerError("Ledger run disappeared after batch failure.");
    return result;
  }
}
