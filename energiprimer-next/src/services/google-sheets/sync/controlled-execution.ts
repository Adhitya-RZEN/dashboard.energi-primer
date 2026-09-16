import "server-only";

import type { IncrementalSyncResult } from "./engine";
import { runGoogleSheetsIncrementalSync } from "./engine";
import {
  prepareWorksheetPreflight,
  type WorksheetPreflightResult,
} from "./preflight";
import {
  verifyWorksheetSyncAfterWrite,
  type PostWriteVerificationResult,
} from "./post-write-verification";
import type { VerifiedSupabaseProductionTarget } from "./production-target";
import { assertProductionCanaryAuthorization } from "./production-canary";
import { verifyCanonicalLedgerCapability } from "@/services/google-sheets/canonical/ledger-prisma-store";

export type ControlledImportExecutionStatus =
  | "VERIFIED"
  | "PASS_WITH_REVIEW"
  | "PARTIAL"
  | "FAILED"
  | "RECONCILIATION_REQUIRED"
  | "LOCKED";

export type ControlledImportExecutionResult = {
  status: ControlledImportExecutionStatus;
  write: "EXECUTED";
  preflight: WorksheetPreflightResult;
  syncResult: IncrementalSyncResult;
  verification: PostWriteVerificationResult | null;
};

export type ControlledImportExecutionErrorCode =
  | "PLAN_BLOCKED"
  | "PLAN_ID_MISMATCH"
  | "CANARY_AUTHORIZATION_REQUIRED"
  | "CANARY_LEDGER_UNAVAILABLE";

export class ControlledImportExecutionError extends Error {
  readonly code: ControlledImportExecutionErrorCode;
  readonly preflight: WorksheetPreflightResult;

  constructor(
    code: ControlledImportExecutionErrorCode,
    message: string,
    preflight: WorksheetPreflightResult,
  ) {
    super(message);
    this.name = "ControlledImportExecutionError";
    this.code = code;
    this.preflight = preflight;
  }
}

function admittedPreflight(preflight: WorksheetPreflightResult) {
  return preflight.status === "READY" &&
    preflight.canonicalPlan !== null &&
    preflight.canonicalPlan.approvalState === "APPROVED" &&
    preflight.canonicalPlan.operationCounts.BLOCK === 0 &&
    preflight.canonicalPlan.blockingIssues.length === 0;
}

/**
 * Explicit write boundary for a single worksheet. The source is read and the
 * canonical plan is rebuilt immediately before the writer is reached. The
 * caller's plan id is only an admission assertion; it is never used to skip
 * plan generation or to select a different source payload.
 */
export async function executeControlledWorksheetImport(input: {
  worksheet: string;
  importPlanId: string;
  productionTarget: VerifiedSupabaseProductionTarget;
  requestId?: string;
}): Promise<ControlledImportExecutionResult> {
  const preflight = await prepareWorksheetPreflight({
    worksheet: input.worksheet,
  });
  const canonicalPlan = preflight.canonicalPlan;
  if (!admittedPreflight(preflight) || !canonicalPlan) {
    throw new ControlledImportExecutionError(
      "PLAN_BLOCKED",
      "The worksheet did not pass canonical import admission.",
      preflight,
    );
  }
  if (canonicalPlan.planId !== input.importPlanId) {
    throw new ControlledImportExecutionError(
      "PLAN_ID_MISMATCH",
      "The submitted import plan is stale or does not match the current source.",
      preflight,
    );
  }
  try {
    assertProductionCanaryAuthorization(canonicalPlan.items.length);
  } catch (error) {
    if (error instanceof Error) {
      throw new ControlledImportExecutionError(
        "CANARY_AUTHORIZATION_REQUIRED",
        error.message,
        preflight,
      );
    }
    throw error;
  }
  if (!(await verifyCanonicalLedgerCapability())) {
    throw new ControlledImportExecutionError(
      "CANARY_LEDGER_UNAVAILABLE",
      "The Phase 5 durable ledger tables are not available on the verified target.",
      preflight,
    );
  }

  const syncResult = await runGoogleSheetsIncrementalSync({
    triggerType: "manual",
    requestId: input.requestId,
    worksheetTitle: preflight.worksheet.effective,
    scope: "all",
    databaseTarget: "SUPABASE_PRODUCTION",
    productionTarget: input.productionTarget,
    expectedPlanFingerprint: preflight.expectedPlanFingerprint,
    expectedCanonicalPlanId: canonicalPlan.planId,
    canonicalImportRunId: canonicalPlan.importRunId,
    durableLedger: "REQUIRED",
  });

  if (syncResult.status !== "SUCCESS") {
    return {
      status: syncResult.status === "RECONCILIATION_REQUIRED"
        ? "RECONCILIATION_REQUIRED"
        : syncResult.status,
      write: "EXECUTED",
      preflight,
      syncResult,
      verification: null,
    };
  }

  const verification = await verifyWorksheetSyncAfterWrite({
    preflight,
    syncResult,
  });
  return {
    status: verification.status === "PASS" ? "VERIFIED" : "PASS_WITH_REVIEW",
    write: "EXECUTED",
    preflight,
    syncResult,
    verification,
  };
}
