import "server-only";

/**
 * Phase 7 automatic execution is deliberately opt-in.  Keeping the mode and
 * kill switch separate makes an emergency stop possible without changing the
 * deployment's source or ledger configuration.
 */
export const AUTOMATION_MODE_ENV = "GOOGLE_SHEETS_AUTOMATION_MODE" as const;
export const AUTOMATION_KILL_SWITCH_ENV =
  "GOOGLE_SHEETS_AUTOMATION_KILL_SWITCH" as const;
export const AUTOMATION_MAX_WORKSHEETS_ENV =
  "GOOGLE_SHEETS_AUTOMATION_MAX_WORKSHEETS" as const;
export const AUTOMATION_MAX_RECORDS_ENV =
  "GOOGLE_SHEETS_AUTOMATION_MAX_RECORDS" as const;

export const AUTOMATION_MINIMAL_PROBE_RANGE = "A1:Z10" as const;
export const DEFAULT_AUTOMATION_MAX_WORKSHEETS = 12;
export const DEFAULT_AUTOMATION_MAX_RECORDS = 2_000;
export const MAX_AUTOMATION_MAX_WORKSHEETS = 50;
export const MAX_AUTOMATION_MAX_RECORDS = 10_000;

export type AutomationMode = "ENABLED" | "DISABLED";
export type AutomationKillSwitch = "ENABLED" | "DISABLED";

export type AutomationConfig = {
  mode: AutomationMode;
  killSwitch: AutomationKillSwitch;
  maxWorksheets: number;
  maxRecords: number;
  ledgerEnabled: boolean;
  enabled: boolean;
  blockers: readonly AutomationBlocker[];
};

export type AutomationBlocker =
  | "AUTOMATION_MODE_DISABLED"
  | "AUTOMATION_MODE_INVALID"
  | "AUTOMATION_KILL_SWITCH_ENABLED"
  | "AUTOMATION_KILL_SWITCH_INVALID"
  | "AUTOMATION_MAX_WORKSHEETS_INVALID"
  | "AUTOMATION_MAX_RECORDS_INVALID"
  | "DURABLE_LEDGER_DISABLED";

export type AutomationAdmission = {
  admitted: boolean;
  blockers: readonly string[];
};

type AutomationEnvironment = {
  [key: string]: string | undefined;
};

function parseMode(
  raw: string | undefined,
  defaultValue: AutomationMode,
): { value: AutomationMode; blocker?: AutomationBlocker } {
  if (raw === undefined || raw.trim() === "") return { value: defaultValue };
  const normalized = raw.trim().toLocaleUpperCase("en-US");
  if (normalized === "ENABLED" || normalized === "DISABLED") {
    return { value: normalized };
  }
  return { value: defaultValue, blocker: "AUTOMATION_MODE_INVALID" };
}

function parseKillSwitch(
  raw: string | undefined,
): { value: AutomationKillSwitch; blocker?: AutomationBlocker } {
  // The safe default is an engaged kill switch.  It must be explicitly set to
  // DISABLED in the production environment before unattended writes can run.
  if (raw === undefined || raw.trim() === "") return { value: "ENABLED" };
  const normalized = raw.trim().toLocaleUpperCase("en-US");
  if (normalized === "ENABLED" || normalized === "DISABLED") {
    return { value: normalized };
  }
  return { value: "ENABLED", blocker: "AUTOMATION_KILL_SWITCH_INVALID" };
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  blocker: AutomationBlocker,
) {
  if (raw === undefined || raw.trim() === "") return { value: fallback };
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    return { value: fallback, blocker };
  }
  return { value };
}

export function readAutomationConfig(
  environment: AutomationEnvironment = process.env,
): AutomationConfig {
  const mode = parseMode(environment[AUTOMATION_MODE_ENV], "DISABLED");
  const killSwitch = parseKillSwitch(environment[AUTOMATION_KILL_SWITCH_ENV]);
  const maxWorksheets = boundedInteger(
    environment[AUTOMATION_MAX_WORKSHEETS_ENV],
    DEFAULT_AUTOMATION_MAX_WORKSHEETS,
    MAX_AUTOMATION_MAX_WORKSHEETS,
    "AUTOMATION_MAX_WORKSHEETS_INVALID",
  );
  const maxRecords = boundedInteger(
    environment[AUTOMATION_MAX_RECORDS_ENV],
    DEFAULT_AUTOMATION_MAX_RECORDS,
    MAX_AUTOMATION_MAX_RECORDS,
    "AUTOMATION_MAX_RECORDS_INVALID",
  );
  const blockers = [
    mode.blocker,
    mode.value === "DISABLED" ? ("AUTOMATION_MODE_DISABLED" as const) : undefined,
    killSwitch.blocker,
    killSwitch.value === "ENABLED"
      ? ("AUTOMATION_KILL_SWITCH_ENABLED" as const)
      : undefined,
    maxWorksheets.blocker,
    maxRecords.blocker,
    environment.CANONICAL_IMPORT_LEDGER_ENABLED === "true"
      ? undefined
      : ("DURABLE_LEDGER_DISABLED" as const),
  ].filter((value): value is AutomationBlocker => Boolean(value));
  return {
    mode: mode.value,
    killSwitch: killSwitch.value,
    maxWorksheets: maxWorksheets.value,
    maxRecords: maxRecords.value,
    ledgerEnabled: environment.CANONICAL_IMPORT_LEDGER_ENABLED === "true",
    enabled: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

/**
 * Vercel Cron invokes a production route with a cron user agent.  The user
 * agent is only a trigger classifier; the bearer secret remains the actual
 * authentication boundary in `cron-auth.ts`.
 */
export function isVercelCronRequest(headers: Pick<Headers, "get">) {
  const userAgent = headers.get("user-agent")?.trim() ?? "";
  return /^vercel-cron(?:\/|$)/iu.test(userAgent);
}

export function automaticExecutionAdmission(input: {
  config: AutomationConfig;
  authenticatedCron: boolean;
  vercelCron: boolean;
  productionTargetVerified: boolean;
}): AutomationAdmission {
  const blockers: string[] = [...input.config.blockers];
  if (!input.authenticatedCron) blockers.push("CRON_AUTH_REQUIRED");
  if (!input.vercelCron) blockers.push("VERCEL_CRON_TRIGGER_REQUIRED");
  if (!input.productionTargetVerified) blockers.push("PRODUCTION_TARGET_UNVERIFIED");
  return {
    admitted: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

export function assertAutomationRecordBound(
  recordCount: number,
  config: AutomationConfig,
) {
  if (!Number.isInteger(recordCount) || recordCount < 0) {
    throw new Error("AUTOMATION_RECORD_COUNT_INVALID");
  }
  if (recordCount > config.maxRecords) {
    throw new Error("AUTOMATION_RECORD_BOUND_EXCEEDED");
  }
}

export function assertAutomationWorksheetBound(
  worksheetCount: number,
  config: AutomationConfig,
) {
  if (!Number.isInteger(worksheetCount) || worksheetCount < 0) {
    throw new Error("AUTOMATION_WORKSHEET_COUNT_INVALID");
  }
  if (worksheetCount > config.maxWorksheets) {
    throw new Error("AUTOMATION_WORKSHEET_BOUND_EXCEEDED");
  }
}
