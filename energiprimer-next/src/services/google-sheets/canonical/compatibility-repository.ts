import "server-only";

import { commitGoogleSheetsImportPlan } from "../import/commit";
import type { GoogleSheetsImportPlan } from "../import/types";
import type { SyncDatabaseTarget, VerifiedSupabaseProductionTarget } from "../sync/production-target";
import type { CanonicalImportPlan, CanonicalRecord } from "./types";
import {
  classifyCanonicalTargetDiff,
  reconcileCanonicalTargetStates,
} from "./target-state";
import { loadCanonicalTargetStates } from "./target-repository";
import { compatibilityPlanForCanonicalBatch } from "./compatibility-adapter";
import type { DurableCanonicalBatchRepository } from "./ledger";
import type { BatchEvidence } from "./recovery";
import type { ObservedCanonicalPlanItem } from "./reconciliation";

export class CanonicalTargetReconciliationError extends Error {
  readonly code = "RECONCILIATION_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalTargetReconciliationError";
  }
}

function observationsFor(
  records: readonly CanonicalRecord[],
  planHash: string,
): readonly ObservedCanonicalPlanItem[] {
  return records.map((record) => ({
    planHash,
    entity: record.entity,
    businessIdentity: record.businessIdentity,
    contentHash: record.contentHash,
    sourceOccurrenceKey: record.sourceOccurrenceKey,
    // A read-after-write target check proves the final state; SKIP is the
    // existing idempotent observation vocabulary accepted by reconciliation.
    operation: "SKIP" as const,
  }));
}

async function targetEvidenceFor(
  records: readonly CanonicalRecord[],
  planHash: string,
): Promise<{
  evidence: BatchEvidence;
  observations: readonly ObservedCanonicalPlanItem[];
}> {
  const read = await loadCanonicalTargetStates(records);
  if (read.status === "BLOCKED") {
    return { evidence: "CONFLICTING", observations: [] };
  }
  const diffs = records.map((record, index) => {
    const state = read.states[index];
    if (!state) throw new CanonicalTargetReconciliationError("Target state did not cover the batch.");
    return classifyCanonicalTargetDiff(record, state);
  });
  if (diffs.some((diff) => diff.operation === "BLOCK" || diff.operation === "UPDATE")) {
    return { evidence: "CONFLICTING", observations: [] };
  }
  if (diffs.every((diff) => diff.operation === "NO-OP" || diff.operation === "SKIP")) {
    return { evidence: "COMMITTED", observations: observationsFor(records, planHash) };
  }
  if (diffs.every((diff) => diff.operation === "INSERT")) {
    return { evidence: "ABSENT", observations: [] };
  }
  return { evidence: "UNKNOWN", observations: [] };
}

export function createCompatibilityCanonicalBatchRepository(input: {
  basePlan: GoogleSheetsImportPlan;
  databaseTarget?: SyncDatabaseTarget;
  productionTarget?: VerifiedSupabaseProductionTarget;
  allowNonLocalDatabase?: boolean;
}): DurableCanonicalBatchRepository & {
  reconcileTarget(plan: CanonicalImportPlan): Promise<{
    status: "RECONCILED" | "RECONCILIATION_REQUIRED";
    reason?: string;
  }>;
} {
  return {
    async commitBatch(records, planHash) {
      const batchPlan = compatibilityPlanForCanonicalBatch(input.basePlan, records);
      await commitGoogleSheetsImportPlan(batchPlan, {
        allowNonLocalDatabase: input.allowNonLocalDatabase,
        databaseTarget: input.databaseTarget,
        productionTarget: input.productionTarget,
        canonicalBatch: true,
        source: "google_sheets_canonical_batch",
      });
      const evidence = await targetEvidenceFor(records, planHash);
      if (evidence.evidence !== "COMMITTED") {
        throw new CanonicalTargetReconciliationError(
          "The bounded writer completed without an exact target-state match.",
        );
      }
      return evidence.observations;
    },

    async reconcileBatch(records, planHash) {
      return targetEvidenceFor(records, planHash);
    },

    async reconcileTarget(plan) {
      const read = await loadCanonicalTargetStates(plan.items.map((item) => item.record));
      const result = reconcileCanonicalTargetStates(plan, read.states);
      return result.status === "RECONCILED"
        ? { status: "RECONCILED" as const }
        : {
            status: "RECONCILIATION_REQUIRED" as const,
            reason: result.blockers.join(",") || "RECONCILIATION_MISMATCH",
          };
    },
  };
}
