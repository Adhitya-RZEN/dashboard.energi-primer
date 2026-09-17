import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  parseControlledImportRequest,
} from "../src/services/google-sheets/sync/operator-contract";
import {
  commitApprovedCanonicalPlan,
  type CanonicalBatchRepository,
} from "../src/services/google-sheets/canonical/commit";
import {
  buildCanonicalImportPlan,
  approveCanonicalImportPlan,
  assertCanonicalImportPlanIntegrity,
} from "../src/services/google-sheets/canonical/import-plan";
import {
  BB_CANONICAL_MAPPING_CONTRACT,
} from "../src/services/google-sheets/canonical/mapping-contract";
import { createSourceManifest } from "../src/services/google-sheets/canonical/source-manifest";
import { createCanonicalRecord } from "../src/services/google-sheets/canonical/domain";
import {
  businessIdentityForRecord,
  contentHashForRecord,
} from "../src/services/google-sheets/canonical/identity";
import {
  classifyRecoveryFailure,
  decideBatchRecovery,
} from "../src/services/google-sheets/canonical/recovery";
import {
  reconcileCanonicalPlan,
} from "../src/services/google-sheets/canonical/reconciliation";
import type {
  CanonicalDate,
  CanonicalRecord,
  CanonicalRecordInput,
  SourceObservation,
} from "../src/services/google-sheets/canonical/types";

function observation(row: number): SourceObservation {
  return {
    importRunId: null,
    sourceKey: "phase4-source",
    spreadsheetId: "phase4-spreadsheet",
    sheetId: "phase4-sheet",
    worksheetTitleSnapshot: "Juli26-BB",
    effectivePeriod: { month: 7, year: 2026 },
    sourceRange: "A1:ZZ500",
    cellAddress: `T${row}`,
    row,
    column: 20,
    rawDisplayValue: "1",
    normalizedValue: 1,
    observationKind: "SOURCE_CELL",
    granularity: "CELL",
    mappingVersion: "BB_CANONICAL_V1@1",
    schemaVersion: "semantic-schema-v1",
    parserVersion: "dynamic-parser-v1",
    observedAt: "2026-09-16T00:00:00.000Z",
  };
}

function record(row: number, quantityTon = 1) {
  const input: CanonicalRecordInput<"biomass_consumption"> = {
    entity: "biomass_consumption",
    grain: "unit-day",
    value: {
      unitNumber: 1,
      readingDate: `2026-07-${String(row).padStart(2, "0")}` as CanonicalDate,
      quantityTon,
    },
    source: observation(row),
    validation: {
      status: "VALID",
      errors: [],
      warnings: [],
      confidence: 1,
      periodValid: true,
      typeValid: true,
      identityValid: true,
      provenanceComplete: true,
    },
  };
  return createCanonicalRecord(input);
}

const manifest = createSourceManifest({
  sourceKey: "phase4-source",
  spreadsheetId: "phase4-spreadsheet",
  sheetId: "phase4-sheet",
  worksheetTitle: "Juli26-BB",
  effectivePeriod: { month: 7, year: 2026 },
  mappingProfile: "BB_CANONICAL_V1",
  mappingVersion: "BB_CANONICAL_V1@1",
  schemaVersion: "semantic-schema-v1",
  parserVersion: "dynamic-parser-v1",
  sourceRange: "A1:ZZ500",
  approvalState: "APPROVED",
  ownership: {
    authority: "GOOGLE_SHEETS",
    ownerRef: "phase4-fixture",
    sourcePrecedence: null,
  },
  status: "ACTIVE",
  observedAt: "2026-09-16T00:00:00.000Z",
});

const records = [1, 2, 3, 4, 5].map(record);
const plan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase4-import",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records,
    existing: [],
  }),
);

assert.deepEqual(parseControlledImportRequest({
  action: "execute-import",
  worksheet: "Juli26-BB",
  importPlanId: plan.planId,
}), {
  action: "execute-import",
  worksheet: "Juli26-BB",
  importPlanId: plan.planId,
});
assert.throws(
  () => parseControlledImportRequest({ action: "execute-import", worksheet: "Juli26-BB" }),
  /importPlanId/u,
);
assert.throws(
  () => parseControlledImportRequest({ action: "preview", worksheet: "Juli26-BB", importPlanId: plan.planId }),
  /action/u,
);

const routePath = fileURLToPath(
  new URL("../src/app/api/sync/google-sheets/route.ts", import.meta.url),
);
const routeSource = readFileSync(routePath, "utf8");
const getBody = routeSource.slice(
  routeSource.indexOf("export async function GET"),
  routeSource.indexOf("export async function POST"),
);
assert.match(getBody, /prepareWorksheetPreflight|prepareGoogleSheetsWorksheetDiscovery/u);
assert.match(getBody, /runGoogleSheetsIncrementalSync|automaticRequestAuthorized/u);
assert.doesNotMatch(getBody, /commitGoogleSheetsImportPlan|executeControlled/u);
assert.match(routeSource, /action: "execute-import"|parseControlledImportRequest/u);

const preflightPath = fileURLToPath(
  new URL("../src/services/google-sheets/sync/preflight.ts", import.meta.url),
);
const preflightSource = readFileSync(preflightPath, "utf8");
assert.doesNotMatch(
  preflightSource.slice(
    preflightSource.indexOf("export async function prepareWorksheetPreflight"),
  ),
  /\.\$(?:transaction|executeRaw)|\.(?:create|update|delete|upsert)\(/u,
);
const discoveryPath = fileURLToPath(
  new URL("../src/services/google-sheets/sync/discovery.ts", import.meta.url),
);
const discoverySource = readFileSync(discoveryPath, "utf8");
const readOnlyDiscovery = discoverySource.slice(
  discoverySource.indexOf("export async function prepareGoogleSheetsWorksheetDiscovery"),
  discoverySource.indexOf("export function prepareWorksheetDiscovery"),
);
assert.doesNotMatch(
  readOnlyDiscovery,
  /\.\$(?:transaction|executeRaw)|\.(?:create|update|delete|upsert)\(/u,
);
const controlledExecutionPath = fileURLToPath(
  new URL("../src/services/google-sheets/sync/controlled-execution.ts", import.meta.url),
);
const controlledExecutionSource = readFileSync(controlledExecutionPath, "utf8");
const admissionIndex = controlledExecutionSource.indexOf("admittedPreflight(preflight)");
const planHashIndex = controlledExecutionSource.indexOf("canonicalPlan.planId !== input.importPlanId");
const engineIndex = controlledExecutionSource.indexOf("runGoogleSheetsIncrementalSync({");
assert.ok(admissionIndex >= 0, "controlled execution must perform admission");
assert.ok(planHashIndex > admissionIndex, "plan hash must be checked after preflight");
assert.ok(engineIndex > planHashIndex, "writer path must follow plan admission");
assert.match(controlledExecutionSource, /expectedCanonicalPlanId/u);
assert.match(controlledExecutionSource, /expectedPlanFingerprint/u);

const samePlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase4-import",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records,
    existing: [],
  }),
);
assert.equal(samePlan.planId, plan.planId);
assertCanonicalImportPlanIntegrity(plan);
assert.equal(Object.isFrozen(plan), true);
assert.throws(() => {
  (plan.items[0] as unknown as { operation: string }).operation = "UPDATE";
}, /read only|Cannot assign/u);

const blockedPlan = buildCanonicalImportPlan({
  importRunId: "phase4-blocked",
  sourceManifest: manifest,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
  records: [records[0]!, records[0]!],
  existing: [],
});
assert.equal(blockedPlan.operationCounts.BLOCK, 2);
assert.throws(() => approveCanonicalImportPlan(blockedPlan), /blocked/u);

class FailureRepository implements CanonicalBatchRepository {
  calls = 0;

  async commitBatch(items: readonly CanonicalRecord[]) {
    this.calls += 1;
    if (this.calls === 2) throw new Error("known constraint failure");
    return items.map((item) => ({
      planHash: plan.planHash,
      entity: item.entity,
      businessIdentity: item.businessIdentity,
      contentHash: item.contentHash,
      sourceOccurrenceKey: item.sourceOccurrenceKey,
      operation: "INSERT" as const,
    }));
  }
}

class IdempotentRepository implements CanonicalBatchRepository {
  readonly committed = new Map<string, {
    contentHash: string;
    operation: "INSERT" | "UPDATE" | "SKIP";
  }>();

  async commitBatch(items: readonly CanonicalRecord[], planHash: string) {
    return items.map((item) => {
      const key = businessIdentityForRecord(item).canonicalKey;
      const previous = this.committed.get(key);
      const operation: "INSERT" | "UPDATE" | "SKIP" =
        previous && previous.contentHash === contentHashForRecord(item)
        ? "SKIP"
        : previous
          ? "UPDATE"
          : "INSERT";
      this.committed.set(key, {
        contentHash: contentHashForRecord(item),
        operation,
      });
      return {
        planHash,
        entity: item.entity,
        businessIdentity: businessIdentityForRecord(item),
        contentHash: contentHashForRecord(item),
        sourceOccurrenceKey: item.sourceOccurrenceKey,
        operation,
      };
    });
  }
}

const idempotentRepository = new IdempotentRepository();
const firstCommitStartedAt = performance.now();
const firstCommit = await commitApprovedCanonicalPlan(plan, idempotentRepository, {
  batchSize: 10,
});
const firstCommitMs = Math.round((performance.now() - firstCommitStartedAt) * 100) / 100;
assert.equal(firstCommit.status, "COMMITTED");
assert.equal(firstCommit.operationCounts.INSERT, records.length);
const secondCommit = await commitApprovedCanonicalPlan(plan, idempotentRepository, {
  batchSize: 10,
});
assert.equal(secondCommit.status, "COMMITTED");
assert.equal(secondCommit.operationCounts.SKIP, records.length);
assert.equal(idempotentRepository.committed.size, records.length);

const failure = await commitApprovedCanonicalPlan(plan, new FailureRepository(), {
  batchSize: 2,
});
assert.equal(failure.status, "FAILED");
assert.equal(failure.batchesCompleted, 1);
assert.equal(failure.failedBatch, 2);
assert.deepEqual(failure.remainingBatches, [3]);
assert.equal(failure.batches[1]?.status, "FAILED");
assert.equal(failure.batches[2]?.status, "NOT_EXECUTED");

const unknown = await commitApprovedCanonicalPlan(plan, {
  async commitBatch() {
    throw new Error("P2028 transaction already closed");
  },
}, { batchSize: 10 });
assert.equal(unknown.status, "RECONCILIATION_REQUIRED");
assert.equal(unknown.batches[0]?.status, "UNKNOWN");
assert.equal(unknown.batches[0]?.committedItemCount, "UNKNOWN");
assert.equal(unknown.committedCountKnown, false);
assert.equal(unknown.recovery?.retry, "RECONCILE_FIRST");
assert.equal(unknown.remainingBatches.length, 0);

const exactReconciliationStartedAt = performance.now();
const exactReconciliation = reconcileCanonicalPlan(plan, firstCommit.observations);
const reconciliationMs = Math.round(
  (performance.now() - exactReconciliationStartedAt) * 100,
) / 100;
assert.equal(exactReconciliation.status, "RECONCILED");
const missingReconciliation = reconcileCanonicalPlan(
  plan,
  firstCommit.observations.slice(0, -1),
);
assert.equal(missingReconciliation.status, "RECONCILIATION_REQUIRED");
assert.ok(missingReconciliation.blockers.includes("MISSING_BUSINESS_KEY"));
const unexpectedReconciliation = reconcileCanonicalPlan(plan, [
  ...firstCommit.observations,
  {
    ...firstCommit.observations[0]!,
    businessIdentity: { canonicalKey: "unexpected-business-key" },
  },
]);
assert.equal(unexpectedReconciliation.status, "RECONCILIATION_REQUIRED");
assert.ok(unexpectedReconciliation.blockers.includes("UNEXPECTED_BUSINESS_KEY"));
const contentMismatch = reconcileCanonicalPlan(plan, [
  ...firstCommit.observations.slice(0, -1),
  {
    ...firstCommit.observations.at(-1)!,
    contentHash: "content-hash-mismatch",
  },
]);
assert.equal(contentMismatch.status, "RECONCILIATION_REQUIRED");
assert.ok(contentMismatch.blockers.includes("CONTENT_HASH_MISMATCH"));

const changedRecord = record(1, 2);
const updatePlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase4-update",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [changedRecord],
    existing: [{
      businessIdentity: businessIdentityForRecord(records[0]!),
      contentHash: contentHashForRecord(records[0]!),
      sourceIdentity: records[0]!.sourceIdentity,
    }],
  }),
);
assert.equal(updatePlan.items[0]?.operation, "UPDATE");
const updateObserved = {
  ...firstCommit.observations[0]!,
  planHash: updatePlan.planHash,
  contentHash: changedRecord.contentHash,
  operation: "UPDATE" as const,
};
assert.equal(reconcileCanonicalPlan(updatePlan, [updateObserved]).status, "RECONCILED");
assert.equal(
  reconcileCanonicalPlan(updatePlan, [{ ...updateObserved, contentHash: "wrong" }]).status,
  "RECONCILIATION_REQUIRED",
);

assert.equal(classifyRecoveryFailure(new Error("P2028 transaction already closed")).status, "RECONCILIATION_REQUIRED");
assert.equal(classifyRecoveryFailure({ code: "P2028" }).status, "RECONCILIATION_REQUIRED");
assert.equal(classifyRecoveryFailure(new Error("timeout while committing batch")).retry, "RECONCILE_FIRST");
assert.equal(classifyRecoveryFailure(new Error("constraint violation")).retry, "EXACT_SCOPE_AFTER_KNOWN_ROLLBACK");
assert.equal(decideBatchRecovery("ABSENT").retryAllowed, true);
assert.equal(decideBatchRecovery("COMMITTED").retryAllowed, false);
assert.equal(decideBatchRecovery("CONFLICTING").status, "BLOCK");
assert.equal(decideBatchRecovery("UNKNOWN").retryAllowed, false);

const mappingStartedAt = performance.now();
const mappedRecords = [1, 2, 3, 4, 5].map(record);
const mappingMs = Math.round((performance.now() - mappingStartedAt) * 100) / 100;
const validationStartedAt = performance.now();
assert.equal(mappedRecords.filter((item) => item.validation.status === "VALID").length, 5);
const validationMs = Math.round((performance.now() - validationStartedAt) * 100) / 100;
const planningStartedAt = performance.now();
buildCanonicalImportPlan({
  importRunId: "phase4-timing",
  sourceManifest: manifest,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
  records: mappedRecords,
  existing: [],
});
const planningMs = Math.round((performance.now() - planningStartedAt) * 100) / 100;
const timings = {
  mappingMs,
  validationMs,
  planningMs,
  commitMs: firstCommitMs,
  reconciliationMs,
};

console.log(JSON.stringify({
  status: "PASS",
  mode: "PHASE4_CONTROLLED_IMPORT_FIXTURES",
  productionWrites: 0,
  failureRecovery: failure,
  timings,
}, null, 2));
