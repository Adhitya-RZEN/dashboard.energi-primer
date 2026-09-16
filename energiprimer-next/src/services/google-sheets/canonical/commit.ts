import type {
  CanonicalEntity,
  CanonicalImportPlan,
  CanonicalOperationCounts,
  CanonicalPlanOperation,
  CanonicalRecord,
} from "./types";
import {
  assertCanonicalImportPlanIntegrity,
} from "./import-plan";
import { classifyRecoveryFailure } from "./recovery";
import type { ObservedCanonicalPlanItem } from "./reconciliation";

export const CANONICAL_COMMIT_BATCH_SIZE = 200;

export type CanonicalBatchRepository = {
  commitBatch(
    records: readonly CanonicalRecord[],
    planHash: string,
    batchNumber?: number,
  ): Promise<readonly ObservedCanonicalPlanItem[]>;
};

export type CanonicalBatchItemEvidence = {
  entity: CanonicalEntity;
  businessKey: string;
  plannedOperation: "INSERT" | "UPDATE";
  observedOperation?: "INSERT" | "UPDATE" | "SKIP";
};

export type CanonicalBatchExecution = {
  batchNumber: number;
  status: "COMMITTED" | "FAILED" | "UNKNOWN" | "NOT_EXECUTED";
  items: readonly CanonicalBatchItemEvidence[];
  committedItemCount: number | "UNKNOWN";
  retry: "EXACT_SCOPE_AFTER_KNOWN_ROLLBACK" | "RECONCILE_FIRST" | "NO_RETRY";
  errorCode?: string;
};

export type CanonicalCommitResult = {
  status: "COMMITTED" | "FAILED" | "RECONCILIATION_REQUIRED" | "BLOCKED";
  planHash: string;
  importRunId: string;
  plannedCount: number;
  committedCount: number;
  committedCountKnown: boolean;
  operationCounts: CanonicalOperationCounts;
  batchesCompleted: number;
  batchesTotal: number;
  batches: readonly CanonicalBatchExecution[];
  failedBatch?: number;
  remainingBatches: readonly number[];
  observations: readonly ObservedCanonicalPlanItem[];
  errorCode?: string;
  recovery?: ReturnType<typeof classifyRecoveryFailure>;
};

function emptyCounts(): CanonicalOperationCounts {
  return { INSERT: 0, UPDATE: 0, SKIP: 0, BLOCK: 0 };
}

function partition<T>(values: readonly T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push([...values.slice(index, index + size)]);
  }
  return batches;
}

function syntheticSkip(
  plan: CanonicalImportPlan["items"][number],
  planHash: string,
): ObservedCanonicalPlanItem {
  return {
    planHash,
    entity: plan.record.entity,
    businessIdentity: plan.businessIdentity,
    contentHash: plan.contentHash,
    sourceOccurrenceKey: plan.record.sourceOccurrenceKey,
    operation: "SKIP",
  };
}

function assertObservedItem(
  plan: CanonicalImportPlan,
  item: ObservedCanonicalPlanItem,
  expected: CanonicalImportPlan["items"][number],
) {
  if (item.planHash !== plan.planHash)
    throw new Error("Repository returned an observation for a different plan.");
  if (item.businessIdentity.canonicalKey !== expected.businessIdentity.canonicalKey)
    throw new Error("Repository returned an unexpected business identity.");
  if (item.entity !== expected.record.entity)
    throw new Error("Repository returned an observation for a different entity.");
  if (item.contentHash !== expected.contentHash)
    throw new Error("Repository returned an observation for different content.");
  if (item.sourceOccurrenceKey !== expected.record.sourceOccurrenceKey)
    throw new Error("Repository returned an observation for a different source occurrence.");
  if (
    item.operation !== expected.operation &&
    item.operation !== "SKIP"
  ) {
    throw new Error("Repository returned an operation that differs from the approved plan.");
  }
}

function addCount(
  counts: CanonicalOperationCounts,
  operation: CanonicalPlanOperation,
) {
  counts[operation] += 1;
}

function plannedBatchItems(
  batch: readonly CanonicalImportPlan["items"][number][],
): CanonicalBatchItemEvidence[] {
  return batch.map((item) => ({
    entity: item.record.entity,
    businessKey: item.businessIdentity.canonicalKey,
    plannedOperation: item.operation as "INSERT" | "UPDATE",
  }));
}

export async function commitApprovedCanonicalPlan(
  plan: CanonicalImportPlan,
  repository: CanonicalBatchRepository,
  options: { batchSize?: number } = {},
): Promise<CanonicalCommitResult> {
  assertCanonicalImportPlanIntegrity(plan);
  if (plan.approvalState !== "APPROVED") {
    throw new Error("Only an APPROVED canonical import plan can be committed.");
  }
  if (plan.operationCounts.BLOCK > 0 || plan.blockingIssues.length > 0) {
    return {
      status: "BLOCKED",
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      plannedCount: plan.items.length,
      committedCount: 0,
      committedCountKnown: true,
      operationCounts: { ...plan.operationCounts },
      batchesCompleted: 0,
      batchesTotal: 0,
      batches: [],
      remainingBatches: [],
      observations: [],
      errorCode: "PLAN_ERROR",
    };
  }
  const batchSize = options.batchSize ?? CANONICAL_COMMIT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > CANONICAL_COMMIT_BATCH_SIZE) {
    throw new Error(`Canonical commit batch size must be between 1 and ${CANONICAL_COMMIT_BATCH_SIZE}.`);
  }

  const observations: ObservedCanonicalPlanItem[] = [];
  const operationCounts = emptyCounts();
  const writableItems = plan.items.filter(
    (item) => item.operation === "INSERT" || item.operation === "UPDATE",
  );
  const writableByKey = new Map(
    writableItems.map((item) => [item.businessIdentity.canonicalKey, item]),
  );
  const batches = partition(writableItems, batchSize);
  const batchExecutions: CanonicalBatchExecution[] = batches.map(
    (batch, index) => ({
      batchNumber: index + 1,
      status: "NOT_EXECUTED",
      items: plannedBatchItems(batch),
      committedItemCount: 0,
      retry: "NO_RETRY",
    }),
  );
  let batchesCompleted = 0;
  try {
    for (const item of plan.items) {
      if (item.operation === "SKIP") {
        const observed = syntheticSkip(item, plan.planHash);
        observations.push(observed);
        addCount(operationCounts, "SKIP");
      }
    }
    for (const [index, batch] of batches.entries()) {
      try {
        const result = await repository.commitBatch(
          batch.map((item) => item.record),
          plan.planHash,
          index + 1,
        );
        const observedByKey = new Map<string, ObservedCanonicalPlanItem>();
        for (const observed of result) {
          const expectedItem = writableByKey.get(observed.businessIdentity.canonicalKey);
          if (!expectedItem) throw new Error("Repository returned an unexpected business identity.");
          assertObservedItem(plan, observed, expectedItem);
          if (observedByKey.has(observed.businessIdentity.canonicalKey)) {
            throw new Error("Repository returned duplicate business identity evidence.");
          }
          observedByKey.set(observed.businessIdentity.canonicalKey, observed);
        }
        if (result.length !== batch.length)
          throw new Error("Repository did not return one observation per writable record.");
        for (const observed of result) {
          observations.push(observed);
          addCount(operationCounts, observed.operation);
        }
        batchExecutions[index] = {
          batchNumber: index + 1,
          status: "COMMITTED",
          items: plannedBatchItems(batch).map((item) => ({
            ...item,
            observedOperation: observedByKey.get(item.businessKey)?.operation,
          })),
          committedItemCount: result.filter(
            (item) => item.operation === "INSERT" || item.operation === "UPDATE",
          ).length,
          retry: "NO_RETRY",
        };
        batchesCompleted += 1;
      } catch (error) {
        const recovery = classifyRecoveryFailure(error);
        batchExecutions[index] = {
          batchNumber: index + 1,
          status: recovery.status === "RECONCILIATION_REQUIRED" ? "UNKNOWN" : "FAILED",
          items: plannedBatchItems(batch),
          committedItemCount:
            recovery.status === "RECONCILIATION_REQUIRED" ? "UNKNOWN" : 0,
          retry: recovery.retry,
          errorCode: recovery.errorCode,
        };
        throw error;
      }
    }
    if (observations.length !== plan.items.length) {
      throw new Error("Commit observations do not cover the approved plan.");
    }
    return {
      status: "COMMITTED",
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      plannedCount: plan.items.length,
      committedCount: observations.filter(
        (item) => item.operation === "INSERT" || item.operation === "UPDATE",
      ).length,
      committedCountKnown: true,
      operationCounts,
      batchesCompleted,
      batchesTotal: batches.length,
      batches: batchExecutions,
      remainingBatches: [],
      observations,
    };
  } catch (error) {
    const recovery = classifyRecoveryFailure(error);
    const failedBatch = batchExecutions.find(
      (batch) => batch.status === "FAILED" || batch.status === "UNKNOWN",
    )?.batchNumber;
    const remainingBatches = batchExecutions
      .filter((batch) => batch.status === "NOT_EXECUTED")
      .map((batch) => batch.batchNumber);
    return {
      status: recovery.status,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      plannedCount: plan.items.length,
      committedCount: observations.filter(
        (item) => item.operation === "INSERT" || item.operation === "UPDATE",
      ).length,
      committedCountKnown: recovery.status !== "RECONCILIATION_REQUIRED",
      operationCounts,
      batchesCompleted,
      batchesTotal: batches.length,
      batches: batchExecutions,
      ...(failedBatch === undefined ? {} : { failedBatch }),
      remainingBatches,
      observations,
      errorCode: recovery.errorCode,
      recovery,
    };
  }
}
