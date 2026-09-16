export type OperatorTarget = "SUPABASE_PRODUCTION";

export type ControlledImportExecutionRequest = {
  action: "execute-import";
  worksheet: string;
  /** Canonical plan hash returned by the read-only preflight. */
  importPlanId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates the explicit POST write contract at the HTTP boundary. The plan
 * identifier is a canonical SHA-256 hash, so a caller cannot replace it with a
 * free-form selector or an attempt-generated UUID.
 */
export function parseControlledImportRequest(
  value: unknown,
): ControlledImportExecutionRequest {
  if (!isRecord(value) || value.action !== "execute-import")
    throw new Error("action must be execute-import");

  const worksheet = typeof value.worksheet === "string"
    ? value.worksheet.trim()
    : "";
  if (!worksheet || worksheet.length > 255)
    throw new Error("worksheet is required and must be at most 255 characters");

  const importPlanId = typeof value.importPlanId === "string"
    ? value.importPlanId.trim().toLocaleLowerCase("en-US")
    : "";
  if (!/^[a-f0-9]{64}$/u.test(importPlanId))
    throw new Error("importPlanId must be a canonical plan hash");

  return { action: "execute-import", worksheet, importPlanId };
}

export type LocalSyncArguments = {
  worksheet: string;
  target: OperatorTarget;
  dryRun: boolean;
  scope: "all";
};

export type ExecutionEnvironment =
  | "LOCAL"
  | "VERCEL_PRODUCTION"
  | "VERCEL_PREVIEW"
  | "VERCEL_DEVELOPMENT"
  | "NON_LOCAL_PLATFORM"
  | "NON_LOCAL_PRODUCTION_PROCESS";

type Environment = Record<string, string | undefined>;

function argumentValue(argumentsList: readonly string[], name: string) {
  const prefix = `--${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(`--${name}`);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

function validateOperatorArguments(argumentsList: readonly string[]) {
  const valueFlags = new Set(["--worksheet", "--target"]);
  const booleanFlags = new Set([
    "--production",
    "--dry-run",
    "--verify-idempotency",
    "--current",
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] ?? "";
    if (!argument.startsWith("--"))
      throw new Error("unsupported operator argument");
    const separator = argument.indexOf("=");
    const name = separator >= 0 ? argument.slice(0, separator) : argument;
    if (!valueFlags.has(name) && !booleanFlags.has(name))
      throw new Error("unsupported operator option");
    if (booleanFlags.has(name) && separator >= 0)
      throw new Error("boolean operator option cannot have a value");
    if (valueFlags.has(name) && separator < 0) index += 1;
  }
}

export function parseLocalSyncArguments(
  argumentsList: readonly string[],
): LocalSyncArguments {
  validateOperatorArguments(argumentsList);
  const worksheet = argumentValue(argumentsList, "worksheet")?.trim();
  if (!worksheet || worksheet.startsWith("--"))
    throw new Error("worksheet is required");

  const productionFlag = argumentsList.includes("--production");
  const targetArgument = argumentValue(argumentsList, "target")
    ?.trim()
    .toLocaleLowerCase("en-US");
  const productionTarget =
    productionFlag ||
    targetArgument === "production" ||
    targetArgument === "supabase-production";
  if (!productionTarget) throw new Error("production target must be explicit");
  if (targetArgument && !["production", "supabase-production"].includes(targetArgument))
    throw new Error("target must be production");
  if (argumentsList.includes("--current"))
    throw new Error("current scope is not supported for an explicit worksheet");

  return {
    worksheet,
    target: "SUPABASE_PRODUCTION",
    dryRun: argumentsList.includes("--dry-run"),
    scope: "all",
  };
}

export function resolveExecutionEnvironment(
  environment: Environment = process.env,
): ExecutionEnvironment {
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLocaleLowerCase("en-US");
  if (vercelEnvironment === "production") return "VERCEL_PRODUCTION";
  if (vercelEnvironment === "preview") return "VERCEL_PREVIEW";
  if (vercelEnvironment === "development") return "VERCEL_DEVELOPMENT";
  if (
    environment.VERCEL === "1" ||
    environment.NOW_BUILDER === "1" ||
    environment.CI === "true"
  )
    return "NON_LOCAL_PLATFORM";
  if (environment.NODE_ENV?.trim().toLocaleLowerCase("en-US") === "production")
    return "NON_LOCAL_PRODUCTION_PROCESS";
  return "LOCAL";
}

export function assertLocalExecution(
  environment: Environment = process.env,
) {
  const executionEnvironment = resolveExecutionEnvironment(environment);
  if (executionEnvironment !== "LOCAL")
    throw new Error(
      `Local execution required; detected ${executionEnvironment}.`,
    );
  return executionEnvironment;
}
