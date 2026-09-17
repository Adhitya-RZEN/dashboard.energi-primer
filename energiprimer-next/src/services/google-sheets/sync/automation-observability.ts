import "server-only";

export type AutomationAlertClass =
  | "NORMAL"
  | "ACTION_REQUIRED"
  | "SYSTEM_FAILURE";

export type AutomationEvent = {
  event: string;
  requestId: string;
  runId?: string | null;
  worksheetCount: number;
  rowsScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  status: string;
  alert: AutomationAlertClass;
  blockers?: readonly string[];
};

function boundedCount(value: number) {
  return Number.isFinite(value)
    ? Math.min(1_000_000, Math.max(0, Math.trunc(value)))
    : 0;
}

export function automationAlertClass(input: {
  status: string;
  failed?: number;
  blockers?: readonly string[];
}): AutomationAlertClass {
  if (
    [
      "FAILED",
      "RECONCILIATION_REQUIRED",
      "AUTOMATION_FAILURE",
      "LEDGER_FAILURE",
      "DATABASE_FAILURE",
      "SOURCE_PROVIDER_FAILURE",
    ].includes(input.status)
  ) {
    return "SYSTEM_FAILURE";
  }
  if (
    (input.failed ?? 0) > 0 ||
    ["LOCKED", "SCHEMA_REVIEW", "MAPPING_REVIEW", "RECOVERY_REQUIRED"].includes(
      input.status,
    ) ||
    (input.blockers ?? []).some((blocker) =>
      [
        "SCHEMA_REVIEW",
        "MAPPING_REVIEW",
        "PROVENANCE_CONFLICT",
        "RECOVERY_REQUIRED",
        "RECONCILIATION_FAILED",
        "AUTOMATION_KILL_SWITCH_ENABLED",
      ].includes(blocker),
    )
  ) {
    return "ACTION_REQUIRED";
  }
  return "NORMAL";
}

export function buildAutomationEvent(input: Omit<AutomationEvent, "alert">) {
  return {
    ...input,
    worksheetCount: boundedCount(input.worksheetCount),
    rowsScanned: boundedCount(input.rowsScanned),
    inserted: boundedCount(input.inserted),
    updated: boundedCount(input.updated),
    skipped: boundedCount(input.skipped),
    failed: boundedCount(input.failed),
    alert: automationAlertClass(input),
    ...(input.blockers && input.blockers.length > 0
      ? { blockers: [...new Set(input.blockers)].slice(0, 32) }
      : {}),
  } satisfies AutomationEvent;
}

/** Emits only bounded counters and identifiers; raw source values never enter
 * an automation event. */
export function emitAutomationEvent(input: Omit<AutomationEvent, "alert">) {
  console.error(
    "[google-sheets-automation]",
    JSON.stringify(buildAutomationEvent(input)),
  );
}
