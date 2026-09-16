import assert from "node:assert/strict";

import {
  approveCanonicalImportPlan,
  buildCanonicalImportPlan,
} from "../src/services/google-sheets/canonical/import-plan";
import { BB_CANONICAL_MAPPING_CONTRACT } from "../src/services/google-sheets/canonical/mapping-contract";
import { createCanonicalRecord } from "../src/services/google-sheets/canonical/domain";
import { createSourceManifest } from "../src/services/google-sheets/canonical/source-manifest";
import {
  absentTargetStateForRecord,
  classifyCanonicalTargetDiff,
  existingCanonicalStateForTargetState,
  reconcileCanonicalTargetStates,
  type CanonicalTargetState,
} from "../src/services/google-sheets/canonical/target-state";
import {
  InMemoryCanonicalLedgerStore,
  executeDurableCanonicalPlan,
  transitionCanonicalLedgerRun,
} from "../src/services/google-sheets/canonical/ledger";
import {
  assertProductionCanaryAuthorization,
  productionCanaryAuthorization,
} from "../src/services/google-sheets/sync/production-canary";
import type {
  CanonicalDate,
  CanonicalRecordInput,
  SourceObservation,
} from "../src/services/google-sheets/canonical/types";

function observation(row: number): SourceObservation {
  return {
    importRunId: null,
    sourceKey: "phase5-source",
    spreadsheetId: "phase5-spreadsheet",
    sheetId: "phase5-sheet",
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
  sourceKey: "phase5-source",
  spreadsheetId: "phase5-spreadsheet",
  sheetId: "phase5-sheet",
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
    ownerRef: "phase5-fixture",
    sourcePrecedence: null,
  },
  status: "ACTIVE",
  observedAt: "2026-09-16T00:00:00.000Z",
});

const first = record(1);
const second = record(2);
const absent = absentTargetStateForRecord(first);
const secondAbsent = absentTargetStateForRecord(second);
assert.equal(classifyCanonicalTargetDiff(first, absent).operation, "INSERT");

const present = {
  ...absent,
  existence: "PRESENT" as const,
  matchedRowCount: 1,
  canonicalValue: first.value,
  values: { quantityTon: 1 },
  targetId: "11",
  lastKnownSyncState: "NOT AVAILABLE",
  versionMarker: "target-version",
};
assert.equal(classifyCanonicalTargetDiff(first, present).operation, "NO-OP");
assert.equal(classifyCanonicalTargetDiff(record(1, 2), present).operation, "UPDATE");
assert.equal(
  classifyCanonicalTargetDiff(first, { ...present, existence: "AMBIGUOUS", matchedRowCount: 2 }).operation,
  "BLOCK",
);
assert.equal(
  classifyCanonicalTargetDiff(first, {
    ...present,
    provenance: { ...present.provenance, conflict: true },
  }).operation,
  "BLOCK",
);

const targetDrivenPlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase5-import",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [first, second],
    existing: [
      existingCanonicalStateForTargetState(first, present)!,
      existingCanonicalStateForTargetState(second, secondAbsent) ?? undefined,
    ].filter((state): state is NonNullable<typeof state> => state !== undefined),
  }),
);
assert.equal(targetDrivenPlan.operationCounts.SKIP, 1);
assert.equal(targetDrivenPlan.operationCounts.INSERT, 1);
assert.throws(
  () => transitionCanonicalLedgerRun("FAILED", "COMMITTING"),
  /explicit recovery/u,
);

const targetMismatch = reconcileCanonicalTargetStates(targetDrivenPlan, [present, secondAbsent]);
assert.equal(targetMismatch.status, "RECONCILIATION_REQUIRED");
assert.ok(targetMismatch.existenceMismatches.length > 0);
const unexpected = absentTargetStateForRecord(record(3));
const unexpectedReconciliation = reconcileCanonicalTargetStates(targetDrivenPlan, [
  present,
  secondAbsent,
  {
    ...unexpected,
    existence: "PRESENT",
    matchedRowCount: 1,
    values: { quantityTon: 1 },
  },
]);
assert.equal(unexpectedReconciliation.status, "RECONCILIATION_REQUIRED");
assert.equal(unexpectedReconciliation.unexpectedBusinessKeys.length, 1);

const ledger = new InMemoryCanonicalLedgerStore();
const fakeRepository = {
  commits: 0,
  async commitBatch(items: readonly typeof first[], planHash: string) {
    this.commits += 1;
    return items.map((item) => ({
      planHash,
      entity: item.entity,
      businessIdentity: item.businessIdentity,
      contentHash: item.contentHash,
      sourceOccurrenceKey: item.sourceOccurrenceKey,
      operation: "INSERT" as const,
    }));
  },
};
const firstExecution = await executeDurableCanonicalPlan(targetDrivenPlan, {
  store: ledger,
  repository: fakeRepository,
  now: () => new Date("2026-09-16T00:00:00.000Z"),
});
assert.equal(firstExecution.status, "COMMITTED");
assert.equal(fakeRepository.commits, 1);
const secondExecution = await executeDurableCanonicalPlan(targetDrivenPlan, {
  store: ledger,
  repository: fakeRepository,
  now: () => new Date("2026-09-16T00:01:00.000Z"),
});
assert.equal(secondExecution.status, "COMMITTED");
assert.equal(fakeRepository.commits, 1);
const rebuiltPlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase5-import",
    sourceManifest: { ...manifest, observedAt: "2026-09-16T01:00:00.000Z" },
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [first, second],
    existing: [
      existingCanonicalStateForTargetState(first, present)!,
      existingCanonicalStateForTargetState(second, secondAbsent) ?? undefined,
    ].filter((state): state is NonNullable<typeof state> => state !== undefined),
  }),
);
assert.equal(rebuiltPlan.planHash, targetDrivenPlan.planHash);
const rebuiltExecution = await executeDurableCanonicalPlan(rebuiltPlan, {
  store: ledger,
  repository: fakeRepository,
});
assert.equal(rebuiltExecution.status, "COMMITTED");
assert.equal(fakeRepository.commits, 1);

const skipEvidenceLedger = new InMemoryCanonicalLedgerStore();
const skipEvidenceRepository = {
  async commitBatch(items: readonly typeof first[], planHash: string) {
    return items.map((item) => ({
      planHash,
      entity: item.entity,
      businessIdentity: item.businessIdentity,
      contentHash: item.contentHash,
      sourceOccurrenceKey: item.sourceOccurrenceKey,
      operation: "SKIP" as const,
    }));
  },
};
const skipEvidenceExecution = await executeDurableCanonicalPlan(targetDrivenPlan, {
  store: skipEvidenceLedger,
  repository: skipEvidenceRepository,
});
assert.equal(skipEvidenceExecution.status, "COMMITTED");
assert.equal(skipEvidenceExecution.committedCount, 1);
assert.equal(
  skipEvidenceExecution.observations.find(
    (item) => item.businessIdentity.canonicalKey === second.businessIdentity.canonicalKey,
  )?.operation,
  "INSERT",
);

const committedLedger = new InMemoryCanonicalLedgerStore();
const committedRun = await committedLedger.createOrLoad({
  plan: targetDrivenPlan,
  batches: [{
    batchNumber: 1,
    planHash: targetDrivenPlan.planHash,
    itemKeys: [second.businessIdentity.canonicalKey],
    itemCount: 1,
  }],
  now: new Date("2026-09-16T00:00:00.000Z"),
});
await committedLedger.transitionRun({
  runId: committedRun.id,
  to: "COMMITTING",
  now: new Date("2026-09-16T00:00:00.000Z"),
  executionId: "committed-worker",
});
await committedLedger.claimBatch({
  runId: committedRun.id,
  batchNumber: 1,
  executionId: "committed-worker",
  now: new Date("2026-09-16T00:00:00.000Z"),
  staleAfterMs: 15 * 60 * 1000,
});
await committedLedger.markBatchCommitted({
  runId: committedRun.id,
  batchNumber: 1,
  executionId: "committed-worker",
  now: new Date("2026-09-16T00:00:00.000Z"),
  observations: [{
    planHash: targetDrivenPlan.planHash,
    entity: second.entity,
    businessIdentity: second.businessIdentity,
    contentHash: second.contentHash,
    sourceOccurrenceKey: second.sourceOccurrenceKey,
    operation: "INSERT",
  }],
});
await committedLedger.transitionRun({
  runId: committedRun.id,
  to: "COMMITTED",
  now: new Date("2026-09-16T00:00:00.000Z"),
  executionId: "committed-worker",
});
const resumedCommitted = await executeDurableCanonicalPlan(targetDrivenPlan, {
  store: committedLedger,
  repository: fakeRepository,
  now: () => new Date("2026-09-16T00:02:00.000Z"),
});
assert.equal(resumedCommitted.status, "COMMITTED");
assert.equal((await committedLedger.get(committedRun.id))?.status, "RECONCILED");
assert.equal(fakeRepository.commits, 1);
assert.throws(
  () => ledger.assertPlanImmutable(targetDrivenPlan.planHash, `${targetDrivenPlan.planHash}-changed`),
  /immutable|different/u,
);

const retryPlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "phase5-retry",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [first, second],
    existing: [],
  }),
);
const retryWritable = retryPlan.items.filter(
  (item) => item.operation === "INSERT" || item.operation === "UPDATE",
);
const immutableManifestLedger = new InMemoryCanonicalLedgerStore();
await immutableManifestLedger.createOrLoad({
  plan: retryPlan,
  batches: retryWritable.map((item, index) => ({
    batchNumber: index + 1,
    planHash: retryPlan.planHash,
    itemKeys: [item.businessKey],
    itemCount: 1,
  })),
  now: new Date("2026-09-16T00:00:00.000Z"),
});
await assert.rejects(
  () => immutableManifestLedger.createOrLoad({
    plan: retryPlan,
    batches: [{
      batchNumber: 1,
      planHash: retryPlan.planHash,
      itemKeys: retryWritable.map((item) => item.businessKey),
      itemCount: retryWritable.length,
    }],
    now: new Date("2026-09-16T00:01:00.000Z"),
  }),
  /immutable|batch count/u,
);
const retryLedger = new InMemoryCanonicalLedgerStore();
let failKnown = true;
const retryRepository = {
  commits: 0,
  async commitBatch(items: readonly typeof first[], planHash: string) {
    this.commits += 1;
    if (failKnown) throw new Error("constraint violation");
    return items.map((item) => ({
      planHash,
      entity: item.entity,
      businessIdentity: item.businessIdentity,
      contentHash: item.contentHash,
      sourceOccurrenceKey: item.sourceOccurrenceKey,
      operation: "INSERT" as const,
    }));
  },
};
const knownFailure = await executeDurableCanonicalPlan(retryPlan, {
  store: retryLedger,
  repository: retryRepository,
  batchSize: 1,
});
assert.equal(knownFailure.status, "FAILED");
failKnown = false;
const recovered = await executeDurableCanonicalPlan(retryPlan, {
  store: retryLedger,
  repository: retryRepository,
  batchSize: 1,
});
assert.equal(recovered.status, "COMMITTED");
assert.equal(retryRepository.commits, 3);

const unknownLedger = new InMemoryCanonicalLedgerStore();
let unknown = true;
const unknownRepository = {
  commits: 0,
  async commitBatch(items: readonly typeof first[], planHash: string) {
    this.commits += 1;
    if (unknown) throw new Error("timeout while committing batch");
    return items.map((item) => ({
      planHash,
      entity: item.entity,
      businessIdentity: item.businessIdentity,
      contentHash: item.contentHash,
      sourceOccurrenceKey: item.sourceOccurrenceKey,
      operation: "INSERT" as const,
    }));
  },
  async reconcileBatch(items: readonly typeof first[], planHash: string) {
    return {
      evidence: "COMMITTED" as const,
      observations: items.map((item) => ({
        planHash,
        entity: item.entity,
        businessIdentity: item.businessIdentity,
        contentHash: item.contentHash,
        sourceOccurrenceKey: item.sourceOccurrenceKey,
        operation: "SKIP" as const,
      })),
    };
  },
};
const unknownFailure = await executeDurableCanonicalPlan(retryPlan, {
  store: unknownLedger,
  repository: unknownRepository,
  batchSize: 1,
});
assert.equal(unknownFailure.status, "RECONCILIATION_REQUIRED");
unknown = false;
const unknownRecovered = await executeDurableCanonicalPlan(retryPlan, {
  store: unknownLedger,
  repository: unknownRepository,
  batchSize: 1,
});
assert.equal(unknownRecovered.status, "COMMITTED");
assert.equal(unknownRepository.commits, 2);

const activeLedger = new InMemoryCanonicalLedgerStore();
const activeRun = await activeLedger.createOrLoad({
  plan: retryPlan,
  batches: [{
    batchNumber: 1,
    planHash: retryPlan.planHash,
    itemKeys: [retryPlan.items[0]!.businessKey, retryPlan.items[1]!.businessKey],
    itemCount: 2,
  }],
  now: new Date("2026-09-16T00:00:00.000Z"),
});
await activeLedger.transitionRun({
  runId: activeRun.id,
  to: "COMMITTING",
  now: new Date("2026-09-16T00:00:00.000Z"),
  executionId: "active-worker",
});
const activeClaim = await activeLedger.claimBatch({
  runId: activeRun.id,
  batchNumber: 1,
  executionId: "active-worker",
  now: new Date("2026-09-16T00:00:00.000Z"),
  staleAfterMs: 15 * 60 * 1000,
});
assert.equal(activeClaim.status, "CLAIMED");
const activeRepository = {
  commits: 0,
  async commitBatch() {
    this.commits += 1;
    return [];
  },
};
const activeRecovery = await executeDurableCanonicalPlan(retryPlan, {
  store: activeLedger,
  repository: activeRepository,
  batchSize: 2,
  now: () => new Date("2026-09-16T00:01:00.000Z"),
  executionId: "restarted-worker",
});
assert.equal(activeRecovery.status, "RECONCILIATION_REQUIRED");
assert.equal(activeRepository.commits, 0);

const originalAuthorization = process.env.GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION;
const originalApproval = process.env.GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF;
const originalMaxRecords = process.env.GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS;
const originalLedgerFlag = process.env.CANONICAL_IMPORT_LEDGER_ENABLED;
delete process.env.GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION;
delete process.env.GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF;
delete process.env.CANONICAL_IMPORT_LEDGER_ENABLED;
assert.equal(productionCanaryAuthorization().authorized, false);
assert.throws(
  () => assertProductionCanaryAuthorization(1),
  /not authorized/u,
);
process.env.GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION =
  "I_ACKNOWLEDGE_PHASE5_PRODUCTION_CANARY";
process.env.GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF = "phase5-fixture-approval";
process.env.CANONICAL_IMPORT_LEDGER_ENABLED = "true";
process.env.GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS = "1";
assert.doesNotThrow(() => assertProductionCanaryAuthorization(1));
assert.throws(
  () => assertProductionCanaryAuthorization(2),
  /exceeds/u,
);
if (originalAuthorization === undefined) delete process.env.GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION;
else process.env.GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION = originalAuthorization;
if (originalApproval === undefined) delete process.env.GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF;
else process.env.GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF = originalApproval;
if (originalMaxRecords === undefined) delete process.env.GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS;
else process.env.GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS = originalMaxRecords;
if (originalLedgerFlag === undefined) delete process.env.CANONICAL_IMPORT_LEDGER_ENABLED;
else process.env.CANONICAL_IMPORT_LEDGER_ENABLED = originalLedgerFlag;

const stateEvidence: CanonicalTargetState = { ...present, existence: "PRESENT" };
assert.equal(stateEvidence.existence, "PRESENT");
console.log(JSON.stringify({
  status: "PASS",
  mode: "PHASE5_CANONICAL_TARGET_LEDGER_FIXTURES",
  productionWrites: 0,
  ledgerCommits: fakeRepository.commits,
  knownFailure: knownFailure.status,
  unknownFailure: unknownFailure.status,
  canaryWithoutAuthorization: "NOT EXECUTED",
}, null, 2));
