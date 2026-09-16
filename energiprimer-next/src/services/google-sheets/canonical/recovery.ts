import type { CanonicalErrorCode } from "./types";

export const CANONICAL_LIFECYCLE_STATES = [
  "DISCOVERED",
  "READ",
  "PARSED",
  "VALIDATED",
  "PLANNED",
  "APPROVED",
  "COMMITTING",
  "COMMITTED",
  "RECONCILIATION_REQUIRED",
  "RECONCILED",
  "BLOCKED",
  "FAILED",
] as const;

export type CanonicalLifecycleState = (typeof CANONICAL_LIFECYCLE_STATES)[number];

const transitions: Readonly<Record<CanonicalLifecycleState, readonly CanonicalLifecycleState[]>> = {
  DISCOVERED: ["READ", "BLOCKED", "FAILED"],
  READ: ["PARSED", "BLOCKED", "FAILED"],
  PARSED: ["VALIDATED", "BLOCKED", "FAILED"],
  VALIDATED: ["PLANNED", "BLOCKED", "FAILED"],
  PLANNED: ["APPROVED", "BLOCKED", "FAILED"],
  APPROVED: ["COMMITTING", "FAILED"],
  COMMITTING: ["COMMITTED", "FAILED", "RECONCILIATION_REQUIRED"],
  COMMITTED: ["RECONCILED", "RECONCILIATION_REQUIRED"],
  RECONCILIATION_REQUIRED: ["COMMITTING", "RECONCILED", "BLOCKED"],
  RECONCILED: [],
  BLOCKED: [],
  FAILED: [],
};

export class LifecycleError extends Error {
  readonly code = "RECOVERY_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

export function canTransitionLifecycle(
  from: CanonicalLifecycleState,
  to: CanonicalLifecycleState,
) {
  return transitions[from].includes(to);
}

export function transitionLifecycle(
  from: CanonicalLifecycleState,
  to: CanonicalLifecycleState,
) {
  if (!canTransitionLifecycle(from, to)) {
    throw new LifecycleError(`Invalid lifecycle transition: ${from} -> ${to}.`);
  }
  return to;
}

export type RecoveryFailure = {
  status: "FAILED" | "RECONCILIATION_REQUIRED";
  errorCode: CanonicalErrorCode;
  retry: "EXACT_SCOPE_AFTER_KNOWN_ROLLBACK" | "RECONCILE_FIRST" | "NO_RETRY";
  reason: string;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function classifyRecoveryFailure(error: unknown): RecoveryFailure {
  const message = errorText(error).toLocaleLowerCase("en-US");
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  const explicitReconciliation =
    errorCode === "RECONCILIATION_REQUIRED" ||
    /reconciliation[_ ]required|reconciliation mismatch/u.test(message);
  const unknownOutcome =
    errorCode === "P2028" ||
    /p2028|transaction.*(closed|expired|timed out)|timed? ?out|timeout|econnreset|connection reset|process interrupted|unknown outcome/u.test(
      message,
    );
  if (unknownOutcome || explicitReconciliation) {
    return {
      status: "RECONCILIATION_REQUIRED",
      errorCode: "RECOVERY_REQUIRED",
      retry: "RECONCILE_FIRST",
      reason: "Transaction outcome is unknown; inspect exact plan and batch evidence before retrying.",
    };
  }
  return {
    status: "FAILED",
    errorCode: "COMMIT_ERROR",
    retry: "EXACT_SCOPE_AFTER_KNOWN_ROLLBACK",
    reason: "Commit failed without an identified unknown-outcome signal.",
  };
}

export type BatchEvidence = "ABSENT" | "COMMITTED" | "CONFLICTING" | "UNKNOWN";

export type RecoveryDecision = {
  status: "RESUME_MISSING_BATCH" | "ADVANCE_STATE_ONLY" | "BLOCK" | "RECONCILIATION_REQUIRED";
  retryAllowed: boolean;
  reason: string;
};

export function decideBatchRecovery(evidence: BatchEvidence): RecoveryDecision {
  switch (evidence) {
    case "ABSENT":
      return {
        status: "RESUME_MISSING_BATCH",
        retryAllowed: true,
        reason: "Exact batch evidence proves that no business effect is present.",
      };
    case "COMMITTED":
      return {
        status: "ADVANCE_STATE_ONLY",
        retryAllowed: false,
        reason: "Exact batch evidence proves that business persistence already succeeded.",
      };
    case "CONFLICTING":
      return {
        status: "BLOCK",
        retryAllowed: false,
        reason: "Batch evidence conflicts with the approved plan.",
      };
    case "UNKNOWN":
      return {
        status: "RECONCILIATION_REQUIRED",
        retryAllowed: false,
        reason: "Batch evidence is insufficient; blind retry is forbidden.",
      };
  }
}
