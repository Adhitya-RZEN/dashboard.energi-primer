import type {
  CanonicalImportPlan,
  CanonicalOperationCounts,
  CanonicalPlanOperation,
  CanonicalEntity,
} from "./types";
import { assertCanonicalImportPlanIntegrity } from "./import-plan";

export type ObservedCanonicalPlanItem = {
  planHash: string;
  entity: CanonicalEntity;
  businessIdentity: {
    canonicalKey: string;
  };
  contentHash: string;
  sourceOccurrenceKey: string;
  operation: Exclude<CanonicalPlanOperation, "BLOCK">;
};

export type CanonicalReconciliationResult = {
  status: "RECONCILED" | "RECONCILIATION_REQUIRED";
  planHash: string;
  importRunId: string;
  plannedCount: number;
  observedCount: number;
  committedCount: number;
  businessKeyCount: { expected: number; observed: number };
  duplicateCount: number;
  operationCounts: {
    planned: CanonicalOperationCounts;
    observed: Record<Exclude<CanonicalPlanOperation, "BLOCK">, number>;
  };
  missingBusinessKeys: readonly string[];
  unexpectedBusinessKeys: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  verifiedAt: string;
};

export type CanonicalRowStateEvidence = {
  businessKey: string;
  contentHash: string;
  sourceOccurrenceKey: string;
};

export type CanonicalRowStateReconciliationResult = {
  status: "RECONCILED" | "RECONCILIATION_REQUIRED";
  planHash: string;
  importRunId: string;
  expectedCount: number;
  observedCount: number;
  duplicateCount: number;
  missingBusinessKeys: readonly string[];
  unexpectedBusinessKeys: readonly string[];
  contentHashMismatches: readonly string[];
  sourceOccurrenceMismatches: readonly string[];
  blockers: readonly string[];
  verifiedAt: string;
};

function observedCounts(): CanonicalReconciliationResult["operationCounts"]["observed"] {
  return { INSERT: 0, UPDATE: 0, SKIP: 0 };
}

function isoNow() {
  return new Date().toISOString();
}

export function reconcileCanonicalPlan(
  plan: CanonicalImportPlan,
  observed: readonly ObservedCanonicalPlanItem[],
  verifiedAt = isoNow(),
): CanonicalReconciliationResult {
  assertCanonicalImportPlanIntegrity(plan);
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const plannedByKey = new Map(plan.items.map((item) => [item.businessKey, item]));
  const observedByKey = new Map<string, ObservedCanonicalPlanItem>();
  const duplicateKeys = new Set<string>();
  const operationCounts = observedCounts();

  for (const item of observed) {
    if (item.planHash !== plan.planHash) blockers.add("PLAN_HASH_MISMATCH");
    operationCounts[item.operation] += 1;
    if (observedByKey.has(item.businessIdentity.canonicalKey)) {
      duplicateKeys.add(item.businessIdentity.canonicalKey);
    } else {
      observedByKey.set(item.businessIdentity.canonicalKey, item);
    }
  }

  const missingBusinessKeys = plan.items
    .map((item) => item.businessKey)
    .filter((key) => !observedByKey.has(key));
  const unexpectedBusinessKeys = [...observedByKey.keys()].filter(
    (key) => !plannedByKey.has(key),
  );
  if (missingBusinessKeys.length > 0) blockers.add("MISSING_BUSINESS_KEY");
  if (unexpectedBusinessKeys.length > 0) blockers.add("UNEXPECTED_BUSINESS_KEY");
  if (duplicateKeys.size > 0) blockers.add("DUPLICATE_BUSINESS_KEY");

  for (const item of plan.items) {
    const actual = observedByKey.get(item.businessKey);
    if (!actual) continue;
    if (actual.entity !== item.record.entity) blockers.add("ENTITY_MISMATCH");
    if (actual.contentHash !== item.contentHash) blockers.add("CONTENT_HASH_MISMATCH");
    if (actual.sourceOccurrenceKey !== item.record.sourceOccurrenceKey) {
      blockers.add("SOURCE_PROVENANCE_MISMATCH");
    }
    const operationMatches =
      actual.operation === item.operation ||
      ((item.operation === "INSERT" || item.operation === "UPDATE") &&
        actual.operation === "SKIP");
    if (!operationMatches) blockers.add("OPERATION_MISMATCH");
  }
  if (plan.operationCounts.BLOCK > 0) blockers.add("PLAN_CONTAINS_BLOCKED_ITEM");
  if (observed.length !== plan.items.length) blockers.add("COUNT_MISMATCH");
  if (operationCounts.INSERT + operationCounts.UPDATE > 0 && plan.items.length === 0) {
    blockers.add("UNEXPECTED_COMMITTED_ROW");
  }
  if (plan.items.some((item) => !item.validationResult.provenanceComplete)) {
    blockers.add("PROVENANCE_INCOMPLETE");
  }
  if (plan.items.some((item) => item.record.entity === "coal_consumption" || item.record.entity === "coal_stock")) {
    warnings.add("LEGACY_COAL_TARGET_PROVENANCE_REQUIRES_SCHEMA_BRIDGE");
  }

  return {
    status: blockers.size === 0 ? "RECONCILED" : "RECONCILIATION_REQUIRED",
    planHash: plan.planHash,
    importRunId: plan.importRunId,
    plannedCount: plan.items.length,
    observedCount: observed.length,
    committedCount: operationCounts.INSERT + operationCounts.UPDATE,
    businessKeyCount: {
      expected: plannedByKey.size,
      observed: observedByKey.size,
    },
    duplicateCount: duplicateKeys.size,
    operationCounts: {
      planned: plan.operationCounts,
      observed: operationCounts,
    },
    missingBusinessKeys,
    unexpectedBusinessKeys,
    blockers: [...blockers],
    warnings: [...warnings],
    verifiedAt,
  };
}

/**
 * Reconciles the separately persisted row-state projection. This intentionally
 * does not mutate business rows or row state; callers can route a missing or
 * mismatched projection to a state-only retry after business evidence exists.
 */
export function reconcileCanonicalRowState(
  plan: CanonicalImportPlan,
  observed: readonly CanonicalRowStateEvidence[],
  verifiedAt = isoNow(),
): CanonicalRowStateReconciliationResult {
  assertCanonicalImportPlanIntegrity(plan);
  const blockers = new Set<string>();
  const expectedByKey = new Map(plan.items.map((item) => [item.businessKey, item]));
  const observedByKey = new Map<string, CanonicalRowStateEvidence>();
  const duplicateKeys = new Set<string>();
  for (const item of observed) {
    if (observedByKey.has(item.businessKey)) duplicateKeys.add(item.businessKey);
    else observedByKey.set(item.businessKey, item);
  }
  const missingBusinessKeys = plan.items
    .map((item) => item.businessKey)
    .filter((key) => !observedByKey.has(key));
  const unexpectedBusinessKeys = [...observedByKey.keys()].filter(
    (key) => !expectedByKey.has(key),
  );
  const contentHashMismatches: string[] = [];
  const sourceOccurrenceMismatches: string[] = [];
  for (const [businessKey, item] of expectedByKey) {
    const actual = observedByKey.get(businessKey);
    if (!actual) continue;
    if (actual.contentHash !== item.contentHash) contentHashMismatches.push(businessKey);
    if (actual.sourceOccurrenceKey !== item.record.sourceOccurrenceKey) {
      sourceOccurrenceMismatches.push(businessKey);
    }
  }
  if (missingBusinessKeys.length > 0) blockers.add("MISSING_ROW_STATE");
  if (unexpectedBusinessKeys.length > 0) blockers.add("UNEXPECTED_ROW_STATE");
  if (duplicateKeys.size > 0) blockers.add("DUPLICATE_ROW_STATE");
  if (contentHashMismatches.length > 0) blockers.add("ROW_STATE_CONTENT_HASH_MISMATCH");
  if (sourceOccurrenceMismatches.length > 0) blockers.add("ROW_STATE_SOURCE_PROVENANCE_MISMATCH");
  if (observed.length !== plan.items.length) blockers.add("ROW_STATE_COUNT_MISMATCH");
  if (plan.operationCounts.BLOCK > 0) blockers.add("PLAN_CONTAINS_BLOCKED_ITEM");
  return {
    status: blockers.size === 0 ? "RECONCILED" : "RECONCILIATION_REQUIRED",
    planHash: plan.planHash,
    importRunId: plan.importRunId,
    expectedCount: plan.items.length,
    observedCount: observed.length,
    duplicateCount: duplicateKeys.size,
    missingBusinessKeys,
    unexpectedBusinessKeys,
    contentHashMismatches,
    sourceOccurrenceMismatches,
    blockers: [...blockers],
    verifiedAt,
  };
}
