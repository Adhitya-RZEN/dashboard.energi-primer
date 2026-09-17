import type {
  CanonicalImportPlan,
  CanonicalRecord,
} from "./types";
import {
  assertCanonicalImportPlanIntegrity,
} from "./import-plan";
import {
  classifyRecoveryFailure,
  decideBatchRecovery,
  type BatchEvidence,
} from "./recovery";
import {
  reconcileCanonicalPlan,
  type ObservedCanonicalPlanItem,
} from "./reconciliation";

export const CANONICAL_LEDGER_RUN_STATES = [
  "APPROVED",
  "COMMITTING",
  "COMMITTED",
  "RECONCILIATION_REQUIRED",
  "RECONCILED",
  "FAILED",
  "BLOCKED",
] as const;

export type CanonicalLedgerRunState = (typeof CANONICAL_LEDGER_RUN_STATES)[number];

export const CANONICAL_LEDGER_BATCH_STATES = [
  "PENDING",
  "RUNNING",
  "COMMITTED",
  "FAILED",
  "RECONCILIATION_REQUIRED",
] as const;

export type CanonicalLedgerBatchState = (typeof CANONICAL_LEDGER_BATCH_STATES)[number];

export type CanonicalLedgerBatch = {
  batchNumber: number;
  planHash: string;
  itemKeys: readonly string[];
  itemCount: number;
  status: CanonicalLedgerBatchState;
  attemptCount: number;
  executionId: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  committedItemCount: number;
  retryable: boolean;
  failureCode: string | null;
  failureSummary: string | null;
  observationSnapshot: string | null;
};

export type CanonicalLedgerRun = {
  id: string;
  planId: string;
  planHash: string;
  importRunId: string;
  planSnapshot: string;
  status: CanonicalLedgerRunState;
  approvalState: "APPROVED";
  attemptCount: number;
  executionId: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureSummary: string | null;
  batches: readonly CanonicalLedgerBatch[];
};

export type CanonicalLedgerBatchManifest = {
  batchNumber: number;
  planHash: string;
  itemKeys: readonly string[];
  itemCount: number;
};

export type CanonicalLedgerStore = {
  createOrLoad(input: {
    plan: CanonicalImportPlan;
    batches: readonly CanonicalLedgerBatchManifest[];
    now: Date;
  }): Promise<CanonicalLedgerRun>;
  get(runId: string): Promise<CanonicalLedgerRun | null>;
  transitionRun(input: {
    runId: string;
    to: CanonicalLedgerRunState;
    now: Date;
    explicitRecovery?: boolean;
    executionId?: string;
    failureCode?: string | null;
    failureSummary?: string | null;
  }): Promise<CanonicalLedgerRun>;
  claimBatch(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    staleAfterMs: number;
    recoveryEvidence?: BatchEvidence;
  }): Promise<CanonicalLedgerClaim>;
  markBatchCommitted(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    observations: readonly ObservedCanonicalPlanItem[];
    stateOnly?: boolean;
  }): Promise<CanonicalLedgerRun>;
  markBatchFailed(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    errorCode: string;
    errorSummary: string;
    unknownOutcome: boolean;
  }): Promise<CanonicalLedgerRun>;
};

export type CanonicalLedgerClaim =
  | { status: "CLAIMED"; batch: CanonicalLedgerBatch }
  | { status: "COMMITTED"; batch: CanonicalLedgerBatch }
  | { status: "ACTIVE"; batch: CanonicalLedgerBatch }
  | { status: "RECONCILIATION_REQUIRED"; batch: CanonicalLedgerBatch }
  | { status: "MISSING" };

export class CanonicalLedgerError extends Error {
  readonly code = "LEDGER_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalLedgerError";
  }
}

/**
 * Validates the ledger manifest before persistence. The batch manifest is the
 * durable affected-identity boundary, so it must cover exactly the writable
 * portion of the immutable plan and nothing else.
 */
export function assertCanonicalLedgerBatchManifests(
  plan: CanonicalImportPlan,
  batches: readonly CanonicalLedgerBatchManifest[],
) {
  assertCanonicalImportPlanIntegrity(plan);
  if (plan.approvalState !== "APPROVED")
    throw new CanonicalLedgerError("Only an APPROVED plan can enter the durable ledger.");
  const writable = plan.items.filter(
    (item) => item.operation === "INSERT" || item.operation === "UPDATE",
  );
  const expected = new Map(writable.map((item) => [item.businessKey, item]));
  const seen = new Set<string>();
  let covered = 0;
  batches.forEach((batch, index) => {
    if (batch.batchNumber !== index + 1)
      throw new CanonicalLedgerError("Durable ledger batch order is not contiguous.");
    if (batch.planHash !== plan.planHash)
      throw new CanonicalLedgerError("Durable ledger batch plan hash differs from the plan.");
    if (batch.itemCount !== batch.itemKeys.length || batch.itemCount < 1)
      throw new CanonicalLedgerError("Durable ledger batch item count is invalid.");
    for (const key of batch.itemKeys) {
      if (!expected.has(key) || seen.has(key))
        throw new CanonicalLedgerError("Durable ledger batch identity manifest is invalid.");
      seen.add(key);
      covered += 1;
    }
  });
  if (covered !== writable.length)
    throw new CanonicalLedgerError("Durable ledger batches do not cover the writable plan items.");
  return batches;
}

export function assertCanonicalLedgerBatchManifestsMatch(
  stored: readonly Pick<CanonicalLedgerBatch, "batchNumber" | "planHash" | "itemKeys" | "itemCount">[],
  incoming: readonly CanonicalLedgerBatchManifest[],
) {
  if (stored.length !== incoming.length) {
    throw new CanonicalLedgerError(
      "The durable ledger batch manifest is immutable and has a different batch count.",
    );
  }
  stored.forEach((batch, index) => {
    const expected = incoming[index];
    if (
      !expected ||
      batch.batchNumber !== expected.batchNumber ||
      batch.planHash !== expected.planHash ||
      batch.itemCount !== expected.itemCount ||
      batch.itemKeys.length !== expected.itemKeys.length ||
      batch.itemKeys.some((key, keyIndex) => key !== expected.itemKeys[keyIndex])
    ) {
      throw new CanonicalLedgerError(
        "The durable ledger batch manifest is immutable and differs from the requested plan.",
      );
    }
  });
}

const runTransitions: Readonly<
  Record<CanonicalLedgerRunState, readonly CanonicalLedgerRunState[]>
> = {
  APPROVED: ["COMMITTING", "FAILED", "BLOCKED"],
  COMMITTING: ["COMMITTED", "FAILED", "RECONCILIATION_REQUIRED"],
  COMMITTED: ["RECONCILED", "RECONCILIATION_REQUIRED"],
  RECONCILIATION_REQUIRED: ["COMMITTING", "RECONCILED", "BLOCKED"],
  RECONCILED: [],
  FAILED: ["COMMITTING", "BLOCKED"],
  BLOCKED: [],
};

const batchTransitions: Readonly<
  Record<CanonicalLedgerBatchState, readonly CanonicalLedgerBatchState[]>
> = {
  PENDING: ["RUNNING"],
  RUNNING: ["COMMITTED", "FAILED", "RECONCILIATION_REQUIRED"],
  COMMITTED: [],
  FAILED: ["RUNNING"],
  RECONCILIATION_REQUIRED: ["RUNNING", "COMMITTED"],
};

export function transitionCanonicalLedgerRun(
  from: CanonicalLedgerRunState,
  to: CanonicalLedgerRunState,
  options: { explicitRecovery?: boolean } = {},
) {
  if (!runTransitions[from].includes(to)) {
    throw new CanonicalLedgerError(`Invalid ledger run transition: ${from} -> ${to}.`);
  }
  if (from === "FAILED" && to === "COMMITTING" && !options.explicitRecovery) {
    throw new CanonicalLedgerError(
      "A FAILED ledger run requires explicit recovery evidence before retry.",
    );
  }
  return to;
}

export function transitionCanonicalLedgerBatch(
  from: CanonicalLedgerBatchState,
  to: CanonicalLedgerBatchState,
) {
  if (!batchTransitions[from].includes(to)) {
    throw new CanonicalLedgerError(`Invalid ledger batch transition: ${from} -> ${to}.`);
  }
  return to;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function iso(value: Date) {
  return value.toISOString();
}

function canonicalSnapshotValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalSnapshotValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => key !== "observedAt")
        .sort()
        .map((key) => [
          key,
          canonicalSnapshotValue((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

export function canonicalLedgerPlanSnapshot(plan: CanonicalImportPlan) {
  return JSON.stringify(canonicalSnapshotValue(plan));
}

export function assertCanonicalLedgerPlanImmutable(
  storedPlanHash: string,
  incomingPlanHash: string,
) {
  if (storedPlanHash !== incomingPlanHash) {
    throw new CanonicalLedgerError(
      "The durable ledger plan is immutable and differs from the requested plan.",
    );
  }
}

function batchFor(
  run: CanonicalLedgerRun,
  batchNumber: number,
) {
  const batch = run.batches.find((item) => item.batchNumber === batchNumber);
  if (!batch) throw new CanonicalLedgerError(`Ledger batch ${batchNumber} was not found.`);
  return batch;
}

function assertBatchOwner(
  batch: CanonicalLedgerBatch,
  executionId: string,
) {
  if (batch.executionId !== executionId) {
    throw new CanonicalLedgerError("Ledger batch execution ownership changed.");
  }
}

export class InMemoryCanonicalLedgerStore implements CanonicalLedgerStore {
  private readonly runs = new Map<string, CanonicalLedgerRun>();
  private readonly runIdsByPlanHash = new Map<string, string>();
  private nextId = 1;

  assertPlanImmutable(storedPlanHash: string, incomingPlanHash: string) {
    assertCanonicalLedgerPlanImmutable(storedPlanHash, incomingPlanHash);
  }

  async createOrLoad(input: {
    plan: CanonicalImportPlan;
    batches: readonly CanonicalLedgerBatchManifest[];
    now: Date;
  }) {
    assertCanonicalLedgerBatchManifests(input.plan, input.batches);
    const existingId = this.runIdsByPlanHash.get(input.plan.planHash);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (!existing) throw new CanonicalLedgerError("Ledger run index is inconsistent.");
      assertCanonicalLedgerPlanImmutable(existing.planHash, input.plan.planHash);
      if (existing.planSnapshot !== canonicalLedgerPlanSnapshot(input.plan)) {
        throw new CanonicalLedgerError("The durable plan snapshot is immutable and differs.");
      }
      const stored = clone(existing);
      assertCanonicalLedgerBatchManifestsMatch(stored.batches, input.batches);
      return stored;
    }
    const id = String(this.nextId++);
    const run: CanonicalLedgerRun = {
      id,
      planId: input.plan.planId,
      planHash: input.plan.planHash,
      importRunId: input.plan.importRunId,
      planSnapshot: canonicalLedgerPlanSnapshot(input.plan),
      status: "APPROVED",
      approvalState: "APPROVED",
      attemptCount: 0,
      executionId: null,
      startedAt: null,
      heartbeatAt: null,
      completedAt: null,
      failureCode: null,
      failureSummary: null,
      batches: input.batches.map((manifest) => ({
        ...manifest,
        itemKeys: [...manifest.itemKeys],
        status: "PENDING",
        attemptCount: 0,
        executionId: null,
        startedAt: null,
        heartbeatAt: null,
        completedAt: null,
        committedItemCount: 0,
        retryable: true,
        failureCode: null,
        failureSummary: null,
        observationSnapshot: null,
      })),
    };
    this.runs.set(id, run);
    this.runIdsByPlanHash.set(run.planHash, id);
    return clone(run);
  }

  async get(runId: string) {
    const run = this.runs.get(runId);
    return run ? clone(run) : null;
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
    const run = this.runs.get(input.runId);
    if (!run) throw new CanonicalLedgerError("Ledger run was not found.");
    transitionCanonicalLedgerRun(run.status, input.to, {
      explicitRecovery: input.explicitRecovery,
    });
    run.status = input.to;
    if (input.executionId) run.executionId = input.executionId;
    if (input.to === "COMMITTING" && !run.startedAt) run.startedAt = iso(input.now);
    if (input.to === "COMMITTING") {
      run.attemptCount += 1;
      run.heartbeatAt = iso(input.now);
    }
    if (input.to === "COMMITTED" || input.to === "RECONCILED") run.completedAt = iso(input.now);
    if (input.failureCode !== undefined) run.failureCode = input.failureCode;
    if (input.failureSummary !== undefined) run.failureSummary = input.failureSummary;
    return clone(run);
  }

  async claimBatch(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    staleAfterMs: number;
    recoveryEvidence?: BatchEvidence;
  }): Promise<CanonicalLedgerClaim> {
    const run = this.runs.get(input.runId);
    if (!run) return { status: "MISSING" };
    const batch = batchFor(run, input.batchNumber);
    if (batch.status === "COMMITTED") return { status: "COMMITTED", batch: clone(batch) };
    if (batch.status === "RECONCILIATION_REQUIRED" && input.recoveryEvidence === "ABSENT") {
      transitionCanonicalLedgerBatch(batch.status, "RUNNING");
    } else if (batch.status === "RECONCILIATION_REQUIRED") {
      return { status: "RECONCILIATION_REQUIRED", batch: clone(batch) };
    } else if (batch.status === "RUNNING") {
      const heartbeat = batch.heartbeatAt ? Date.parse(batch.heartbeatAt) : 0;
      if (input.now.getTime() - heartbeat > input.staleAfterMs) {
        transitionCanonicalLedgerBatch(batch.status, "RECONCILIATION_REQUIRED");
        batch.retryable = false;
        batch.failureCode = "STALE_RUNNING_BATCH";
        batch.failureSummary = "A stale running batch requires target reconciliation before retry.";
        return { status: "RECONCILIATION_REQUIRED", batch: clone(batch) };
      }
      return { status: "ACTIVE", batch: clone(batch) };
    } else if (batch.status === "FAILED") {
      if (!batch.retryable) return { status: "RECONCILIATION_REQUIRED", batch: clone(batch) };
      transitionCanonicalLedgerBatch(batch.status, "RUNNING");
    } else {
      transitionCanonicalLedgerBatch(batch.status, "RUNNING");
    }
    batch.status = "RUNNING";
    batch.attemptCount += 1;
    batch.executionId = input.executionId;
    batch.startedAt = batch.startedAt ?? iso(input.now);
    batch.heartbeatAt = iso(input.now);
    return { status: "CLAIMED", batch: clone(batch) };
  }

  async markBatchCommitted(input: {
    runId: string;
    batchNumber: number;
    executionId: string;
    now: Date;
    observations: readonly ObservedCanonicalPlanItem[];
    stateOnly?: boolean;
  }) {
    const run = this.runs.get(input.runId);
    if (!run) throw new CanonicalLedgerError("Ledger run was not found.");
    const batch = batchFor(run, input.batchNumber);
    if (batch.status === "COMMITTED") return clone(run);
    if (input.stateOnly) {
      if (batch.status !== "RECONCILIATION_REQUIRED")
        throw new CanonicalLedgerError("State-only commit requires reconciliation-required batch state.");
    } else {
      if (batch.status !== "RUNNING")
        throw new CanonicalLedgerError("Only a running batch can be committed.");
      assertBatchOwner(batch, input.executionId);
    }
    transitionCanonicalLedgerBatch(batch.status, "COMMITTED");
    batch.status = "COMMITTED";
    batch.completedAt = iso(input.now);
    batch.heartbeatAt = iso(input.now);
    batch.committedItemCount = input.observations.filter(
      (item) => item.operation === "INSERT" || item.operation === "UPDATE",
    ).length;
    batch.retryable = false;
    batch.failureCode = null;
    batch.failureSummary = null;
    batch.observationSnapshot = JSON.stringify(input.observations);
    return clone(run);
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
    const run = this.runs.get(input.runId);
    if (!run) throw new CanonicalLedgerError("Ledger run was not found.");
    const batch = batchFor(run, input.batchNumber);
    if (batch.status === "COMMITTED") return clone(run);
    if (batch.status !== "RUNNING")
      throw new CanonicalLedgerError("Only a running batch can be failed.");
    assertBatchOwner(batch, input.executionId);
    const next = input.unknownOutcome ? "RECONCILIATION_REQUIRED" : "FAILED";
    transitionCanonicalLedgerBatch(batch.status, next);
    batch.status = next;
    batch.heartbeatAt = iso(input.now);
    batch.completedAt = input.unknownOutcome ? null : iso(input.now);
    batch.retryable = !input.unknownOutcome;
    batch.failureCode = input.errorCode;
    batch.failureSummary = input.errorSummary;
    return clone(run);
  }
}

function partition<T>(values: readonly T[], size: number) {
  const batches: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    batches.push([...values.slice(offset, offset + size)]);
  }
  return batches;
}

function syntheticSkip(
  item: CanonicalImportPlan["items"][number],
  planHash: string,
): ObservedCanonicalPlanItem {
  return {
    planHash,
    entity: item.record.entity,
    businessIdentity: item.businessIdentity,
    contentHash: item.contentHash,
    sourceOccurrenceKey: item.record.sourceOccurrenceKey,
    operation: "SKIP",
  };
}

export type DurableCanonicalBatchRepository = {
  commitBatch(
    records: readonly CanonicalRecord[],
    planHash: string,
    batchNumber: number,
  ): Promise<readonly ObservedCanonicalPlanItem[]>;
  reconcileBatch?(
    records: readonly CanonicalRecord[],
    planHash: string,
    batchNumber: number,
  ): Promise<{
    evidence: BatchEvidence;
    observations: readonly ObservedCanonicalPlanItem[];
  }>;
};

export type DurableCanonicalExecutionResult = {
  status: "COMMITTED" | "FAILED" | "RECONCILIATION_REQUIRED" | "BLOCKED";
  runId: string | null;
  planHash: string;
  importRunId: string;
  batchesTotal: number;
  batchesCompleted: number;
  committedCount: number | "UNKNOWN";
  observations: readonly ObservedCanonicalPlanItem[];
  reason?: string;
};

function validateBatchObservations(
  plan: CanonicalImportPlan,
  expectedItems: readonly CanonicalImportPlan["items"][number][],
  observations: readonly ObservedCanonicalPlanItem[],
) {
  if (observations.length !== expectedItems.length) {
    throw new CanonicalLedgerError("Batch observation count does not match the immutable plan.");
  }
  const expected = new Map(expectedItems.map((item) => [item.businessKey, item]));
  const seen = new Set<string>();
  for (const observation of observations) {
    if (observation.planHash !== plan.planHash) throw new CanonicalLedgerError("Batch plan hash mismatch.");
    const item = expected.get(observation.businessIdentity.canonicalKey);
    if (!item || seen.has(observation.businessIdentity.canonicalKey)) {
      throw new CanonicalLedgerError("Batch observation contains an unexpected or duplicate identity.");
    }
    seen.add(observation.businessIdentity.canonicalKey);
    if (
      observation.entity !== item.record.entity ||
      observation.contentHash !== item.contentHash ||
      observation.sourceOccurrenceKey !== item.record.sourceOccurrenceKey ||
      (observation.operation !== item.operation && observation.operation !== "SKIP")
    ) {
      throw new CanonicalLedgerError("Batch observation differs from the approved plan.");
    }
  }
}

function normalizeCommittedBatchObservations(
  expectedItems: readonly CanonicalImportPlan["items"][number][],
  observations: readonly ObservedCanonicalPlanItem[],
) {
  const expected = new Map(expectedItems.map((item) => [item.businessKey, item]));
  return observations.map((observation) => {
    const item = expected.get(observation.businessIdentity.canonicalKey);
    // The compatibility adapter may prove a planned write by observing the
    // final target as a NO-OP. The durable ledger still records the approved
    // writable operation so committed counts and reconciliation remain tied
    // to the immutable plan.
    if (
      item &&
      observation.operation === "SKIP" &&
      (item.operation === "INSERT" || item.operation === "UPDATE")
    ) {
      return { ...observation, operation: item.operation };
    }
    return observation;
  });
}

function observationsFromSnapshot(value: string | null) {
  if (!value) return [] as ObservedCanonicalPlanItem[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed as ObservedCanonicalPlanItem[];
  } catch {
    throw new CanonicalLedgerError("Durable batch observation evidence is malformed.");
  }
}

function executionId() {
  return `canonical-exec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Executes only the writable portion of an approved plan. Every business
 * batch is claimed and finalized independently; a process or connection
 * failure never causes the executor to restart blindly from batch one.
 */
export async function executeDurableCanonicalPlan(
  plan: CanonicalImportPlan,
  dependencies: {
    store: CanonicalLedgerStore;
    repository: DurableCanonicalBatchRepository;
    reconcileTarget?: (
      plan: CanonicalImportPlan,
    ) => Promise<{ status: "RECONCILED" | "RECONCILIATION_REQUIRED"; reason?: string }>;
    now?: () => Date;
    executionId?: string;
    batchSize?: number;
    staleAfterMs?: number;
  },
): Promise<DurableCanonicalExecutionResult> {
  assertCanonicalImportPlanIntegrity(plan);
  if (plan.approvalState !== "APPROVED") {
    return {
      status: "BLOCKED",
      runId: null,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      batchesTotal: 0,
      batchesCompleted: 0,
      committedCount: 0,
      observations: [],
      reason: "Only an APPROVED plan can enter the durable ledger.",
    };
  }
  if (plan.operationCounts.BLOCK > 0 || plan.blockingIssues.length > 0) {
    return {
      status: "BLOCKED",
      runId: null,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      batchesTotal: 0,
      batchesCompleted: 0,
      committedCount: 0,
      observations: [],
      reason: "A blocked plan cannot enter the durable writer.",
    };
  }
  const batchSize = dependencies.batchSize ?? 200;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
    throw new CanonicalLedgerError("Durable ledger batch size must be between 1 and 200.");
  }
  const now = dependencies.now ?? (() => new Date());
  const staleAfterMs = dependencies.staleAfterMs ?? 15 * 60 * 1000;
  const writableItems = plan.items.filter(
    (item) => item.operation === "INSERT" || item.operation === "UPDATE",
  );
  const itemBatches = partition(writableItems, batchSize);
  const manifests = itemBatches.map((items, index) => ({
    batchNumber: index + 1,
    planHash: plan.planHash,
    itemKeys: items.map((item) => item.businessKey),
    itemCount: items.length,
  }));
  const run = await dependencies.store.createOrLoad({ plan, batches: manifests, now: now() });
  if (run.status === "RECONCILED") {
    return {
      status: "COMMITTED",
      runId: run.id,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      batchesTotal: run.batches.length,
      batchesCompleted: run.batches.filter((batch) => batch.status === "COMMITTED").length,
      committedCount: run.batches.reduce((total, batch) => total + batch.committedItemCount, 0),
      observations: run.batches.flatMap((batch) => observationsFromSnapshot(batch.observationSnapshot)),
    };
  }

  const workerId = dependencies.executionId ?? executionId();
  let currentRun = await dependencies.store.get(run.id);
  if (!currentRun) throw new CanonicalLedgerError("Durable ledger run disappeared before execution.");
  if (currentRun.status !== "COMMITTING" && currentRun.status !== "COMMITTED") {
    try {
      currentRun = await dependencies.store.transitionRun({
        runId: currentRun.id,
        to: "COMMITTING",
        now: now(),
        explicitRecovery: currentRun.status === "FAILED" || currentRun.status === "RECONCILIATION_REQUIRED",
        executionId: workerId,
      });
    } catch (error) {
      return {
        status: "RECONCILIATION_REQUIRED",
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: manifests.length,
        batchesCompleted: 0,
        committedCount: "UNKNOWN",
        observations: [],
        reason: error instanceof Error ? error.message : "Ledger state could not be advanced.",
      };
    }
  }

  const observations: ObservedCanonicalPlanItem[] = plan.items
    .filter((item) => item.operation === "SKIP")
    .map((item) => syntheticSkip(item, plan.planHash));
  let batchesCompleted = 0;
  for (const [index, items] of itemBatches.entries()) {
    const batchNumber = index + 1;
    const claim = await dependencies.store.claimBatch({
      runId: currentRun.id,
      batchNumber,
      executionId: workerId,
      now: now(),
      staleAfterMs,
    });
    let claimed = claim;
    if (claim.status === "MISSING") {
      return {
        status: "RECONCILIATION_REQUIRED",
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: itemBatches.length,
        batchesCompleted,
        committedCount: "UNKNOWN",
        observations,
        reason: "Durable batch ledger row is missing.",
      };
    }
    if (claim.status === "COMMITTED") {
      const stored = observationsFromSnapshot(claim.batch.observationSnapshot);
      validateBatchObservations(plan, items, stored);
      observations.push(...normalizeCommittedBatchObservations(items, stored));
      batchesCompleted += 1;
      continue;
    }
    if (claim.status === "ACTIVE") {
      // A recent heartbeat belongs to another live worker. Do not probe or
      // state-advance that batch from a restarted process; doing so could
      // race a valid commit. The next attempt may inspect it after it becomes
      // stale and the store marks it reconciliation-required.
      return {
        status: "RECONCILIATION_REQUIRED",
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: itemBatches.length,
        batchesCompleted,
        committedCount: "UNKNOWN",
        observations,
        reason: "Another execution currently owns an active ledger batch.",
      };
    }
    if (claim.status === "RECONCILIATION_REQUIRED") {
      if (!dependencies.repository.reconcileBatch) {
        await dependencies.store.transitionRun({
          runId: currentRun.id,
          to: "RECONCILIATION_REQUIRED",
          now: now(),
          executionId: workerId,
        });
        return {
          status: "RECONCILIATION_REQUIRED",
          runId: currentRun.id,
          planHash: plan.planHash,
          importRunId: plan.importRunId,
          batchesTotal: itemBatches.length,
          batchesCompleted,
          committedCount: "UNKNOWN",
          observations,
          reason: "An active or stale batch requires target reconciliation.",
        };
      }
      const evidence = await dependencies.repository.reconcileBatch(
        items.map((item) => item.record),
        plan.planHash,
        batchNumber,
      );
      const decision = decideBatchRecovery(evidence.evidence);
      if (evidence.evidence === "COMMITTED") {
        validateBatchObservations(plan, items, evidence.observations);
        const committedObservations = normalizeCommittedBatchObservations(
          items,
          evidence.observations,
        );
        await dependencies.store.markBatchCommitted({
          runId: currentRun.id,
          batchNumber,
          executionId: workerId,
          now: now(),
          observations: committedObservations,
          stateOnly: true,
        });
        observations.push(...committedObservations);
        batchesCompleted += 1;
        continue;
      }
      if (!decision.retryAllowed || evidence.evidence !== "ABSENT") {
        await dependencies.store.transitionRun({
          runId: currentRun.id,
          to: decision.status === "BLOCK" ? "BLOCKED" : "RECONCILIATION_REQUIRED",
          now: now(),
          executionId: workerId,
          failureCode: "RECOVERY_REQUIRED",
          failureSummary: decision.reason,
        });
        return {
          status: decision.status === "BLOCK" ? "BLOCKED" : "RECONCILIATION_REQUIRED",
          runId: currentRun.id,
          planHash: plan.planHash,
          importRunId: plan.importRunId,
          batchesTotal: itemBatches.length,
          batchesCompleted,
          committedCount: "UNKNOWN",
          observations,
          reason: decision.reason,
        };
      }
      claimed = await dependencies.store.claimBatch({
        runId: currentRun.id,
        batchNumber,
        executionId: workerId,
        now: now(),
        staleAfterMs,
        recoveryEvidence: "ABSENT",
      });
    }
    if (claimed.status !== "CLAIMED") {
      return {
        status: "RECONCILIATION_REQUIRED",
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: itemBatches.length,
        batchesCompleted,
        committedCount: "UNKNOWN",
        observations,
        reason: "The batch could not be claimed for a safe exact-scope retry.",
      };
    }
    try {
      const batchObservations = await dependencies.repository.commitBatch(
        items.map((item) => item.record),
        plan.planHash,
        batchNumber,
      );
      validateBatchObservations(plan, items, batchObservations);
      const committedObservations = normalizeCommittedBatchObservations(
        items,
        batchObservations,
      );
      await dependencies.store.markBatchCommitted({
        runId: currentRun.id,
        batchNumber,
        executionId: workerId,
        now: now(),
        observations: committedObservations,
      });
      observations.push(...committedObservations);
      batchesCompleted += 1;
    } catch (error) {
      const recovery = classifyRecoveryFailure(error);
      try {
        await dependencies.store.markBatchFailed({
          runId: currentRun.id,
          batchNumber,
          executionId: workerId,
          now: now(),
          errorCode: recovery.errorCode,
          errorSummary: recovery.reason,
          unknownOutcome: recovery.status === "RECONCILIATION_REQUIRED",
        });
        await dependencies.store.transitionRun({
          runId: currentRun.id,
          to: recovery.status === "RECONCILIATION_REQUIRED" ? "RECONCILIATION_REQUIRED" : "FAILED",
          now: now(),
          executionId: workerId,
          failureCode: recovery.errorCode,
          failureSummary: recovery.reason,
        });
      } catch {
        // If the ledger mutation itself is unavailable, the outcome remains
        // conservative and must be reconciled by the next operator.
      }
      return {
        status: recovery.status,
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: itemBatches.length,
        batchesCompleted,
        committedCount: recovery.status === "RECONCILIATION_REQUIRED" ? "UNKNOWN" : observations.length,
        observations,
        reason: recovery.reason,
      };
    }
  }

  const logicalReconciliation = reconcileCanonicalPlan(plan, observations);
  if (logicalReconciliation.status !== "RECONCILED") {
    await dependencies.store.transitionRun({
      runId: currentRun.id,
      to: "RECONCILIATION_REQUIRED",
      now: now(),
      executionId: workerId,
      failureCode: "RECONCILIATION_MISMATCH",
      failureSummary: logicalReconciliation.blockers.join(","),
    });
    return {
      status: "RECONCILIATION_REQUIRED",
      runId: currentRun.id,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      batchesTotal: itemBatches.length,
      batchesCompleted,
      committedCount: "UNKNOWN",
      observations,
      reason: logicalReconciliation.blockers.join(","),
    };
  }
  if (dependencies.reconcileTarget) {
    const targetReconciliation = await dependencies.reconcileTarget(plan);
    if (targetReconciliation.status !== "RECONCILED") {
      await dependencies.store.transitionRun({
        runId: currentRun.id,
        to: "RECONCILIATION_REQUIRED",
        now: now(),
        executionId: workerId,
        failureCode: "RECONCILIATION_MISMATCH",
        failureSummary: targetReconciliation.reason ?? "Target-state reconciliation failed.",
      });
      return {
        status: "RECONCILIATION_REQUIRED",
        runId: currentRun.id,
        planHash: plan.planHash,
        importRunId: plan.importRunId,
        batchesTotal: itemBatches.length,
        batchesCompleted,
        committedCount: "UNKNOWN",
        observations,
        reason: targetReconciliation.reason ?? "Target-state reconciliation failed.",
      };
    }
  }
  const latestRun = await dependencies.store.get(currentRun.id);
  if (!latestRun) {
    return {
      status: "RECONCILIATION_REQUIRED",
      runId: currentRun.id,
      planHash: plan.planHash,
      importRunId: plan.importRunId,
      batchesTotal: itemBatches.length,
      batchesCompleted,
      committedCount: "UNKNOWN",
      observations,
      reason: "Durable ledger run disappeared before final reconciliation.",
    };
  }
  if (latestRun.status !== "COMMITTED") {
    await dependencies.store.transitionRun({
      runId: currentRun.id,
      to: "COMMITTED",
      now: now(),
      executionId: workerId,
    });
  }
  await dependencies.store.transitionRun({
    runId: currentRun.id,
    to: "RECONCILED",
    now: now(),
    executionId: workerId,
  });
  return {
    status: "COMMITTED",
    runId: currentRun.id,
    planHash: plan.planHash,
    importRunId: plan.importRunId,
    batchesTotal: itemBatches.length,
    batchesCompleted,
    committedCount: observations.filter(
      (item) => item.operation === "INSERT" || item.operation === "UPDATE",
    ).length,
    observations,
  };
}
