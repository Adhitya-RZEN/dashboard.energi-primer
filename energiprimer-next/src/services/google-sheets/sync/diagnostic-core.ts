import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import "server-only";

export const SYNC_DIAGNOSTIC_STAGES = [
  "sync_request",
  "environment_gate",
  "google_config",
  "google_oauth",
  "google_metadata",
  "source_bootstrap",
  "discovery_transaction",
  "discovery_registry_read",
  "discovery_preparation",
  "discovery_current_persistence",
  "discovery_missing_persistence",
  "discovery_total",
  "source_lease",
  "sync_run_create",
  "worksheet_processing",
  "import_transaction",
  "row_state_transaction",
  "sync_run_finalize",
  "sync_complete",
] as const;

export type SyncDiagnosticStage = (typeof SYNC_DIAGNOSTIC_STAGES)[number];
export type SyncDiagnosticStatus = "PASS" | "FAIL";

export type SyncDiagnosticContext = {
  requestId: string;
  attempt?: number;
};

export type SafeDiagnosticError = {
  errorCategory: string;
  errorCode: string;
  googleHttpStatus?: number;
};

const GOOGLE_ERROR_CODES = new Set([
  "configuration",
  "credentials",
  "authentication",
  "permission",
  "rate_limit",
  "timeout",
  "api",
  "malformed_response",
]);

const PRISMA_ERROR_NAMES = new Set([
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientRustPanicError",
]);

const SAFE_DIAGNOSTIC_TOKEN = /^[A-Z][A-Z0-9_]{0,63}$/u;
const SAFE_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function safeDiagnosticInteger(value: unknown, maximum: number, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(0, Math.trunc(value)));
}

function safeDiagnosticToken(value: unknown, fallback = "UNKNOWN") {
  return typeof value === "string" && SAFE_DIAGNOSTIC_TOKEN.test(value)
    ? value
    : fallback;
}

function safeRequestId(value: unknown) {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value)
    ? value
    : "UNKNOWN";
}

export function createSyncRequestId() {
  return randomUUID();
}

export function diagnosticNow() {
  return performance.now();
}

export function diagnosticDurationMs(startedAt: number) {
  return safeDiagnosticInteger(performance.now() - startedAt, 86_400_000);
}

function safeHttpStatus(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) &&
      value >= 100 && value <= 599
    ? value
    : undefined;
}

export function safeGoogleDiagnostic(error: unknown): SafeDiagnosticError | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; status?: unknown };
  if (typeof record.code !== "string" || !GOOGLE_ERROR_CODES.has(record.code))
    return null;

  const category =
    record.code === "configuration"
      ? "CONFIGURATION"
      : record.code === "credentials" || record.code === "authentication"
        ? "AUTHENTICATION"
        : record.code === "permission"
          ? "PERMISSION"
          : record.code === "rate_limit"
            ? "RATE_LIMIT"
            : record.code === "timeout"
              ? "TIMEOUT"
              : record.code === "api" && safeHttpStatus(record.status) === undefined
                ? "NETWORK"
                : "API";

  const googleHttpStatus = safeHttpStatus(record.status);
  return {
    errorCategory: category,
    errorCode: "GOOGLE_" + record.code.toUpperCase(),
    ...(googleHttpStatus === undefined ? {} : { googleHttpStatus }),
  };
}

export function safePrismaErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const record = error as { code?: unknown };
  if (typeof record.code === "string" && /^P\d{4}$/u.test(record.code))
    return record.code;

  const constructorName =
    typeof (error as { constructor?: { name?: unknown } }).constructor?.name ===
    "string"
      ? (error as { constructor: { name: string } }).constructor.name
      : "";
  if (constructorName === "PrismaClientInitializationError")
    return "PRISMA_INITIALIZATION";
  if (constructorName === "PrismaClientKnownRequestError")
    return "PRISMA_KNOWN_REQUEST";
  if (constructorName === "PrismaClientUnknownRequestError")
    return "PRISMA_UNKNOWN_REQUEST";
  if (constructorName === "PrismaClientRustPanicError")
    return "PRISMA_RUST_PANIC";
  return "UNKNOWN";
}

export function isPrismaDiagnosticError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const constructorName =
    typeof (error as { constructor?: { name?: unknown } }).constructor?.name ===
    "string"
      ? (error as { constructor: { name: string } }).constructor.name
      : "";
  const record = error as { code?: unknown };
  return PRISMA_ERROR_NAMES.has(constructorName) ||
    typeof record.code === "string" && /^P\d{4}$/u.test(record.code);
}

export function emitSyncDiagnostic(input: {
  context: SyncDiagnosticContext;
  stage: SyncDiagnosticStage;
  status: SyncDiagnosticStatus;
  durationMs: number;
  errorCategory?: string;
  errorCode?: string;
  googleHttpStatus?: number;
}) {
  const fields = [
    "request_id=" + safeRequestId(input.context.requestId),
    "stage=" + input.stage,
    "status=" + input.status,
    "duration_ms=" + safeDiagnosticInteger(input.durationMs, 86_400_000),
    "error_category=" + safeDiagnosticToken(input.errorCategory, "NONE"),
    "error_code=" + safeDiagnosticToken(input.errorCode, "NONE"),
  ];
  if (
    input.context.attempt !== undefined &&
    Number.isFinite(input.context.attempt)
  ) {
    fields.push(
      "attempt=" +
        Math.min(1_000, Math.max(1, Math.trunc(input.context.attempt))),
    );
  }
  const status = safeHttpStatus(input.googleHttpStatus);
  if (status !== undefined) fields.push("google_http_status=" + status);
  console.error("[google-sheets-sync]", fields.join(" "));
}

export async function withGoogleDiagnostic<T>(
  context: SyncDiagnosticContext | undefined,
  stage: "google_oauth" | "google_metadata",
  operation: () => Promise<T>,
) {
  if (!context) return operation();
  const startedAt = diagnosticNow();
  try {
    const result = await operation();
    emitSyncDiagnostic({
      context,
      stage,
      status: "PASS",
      durationMs: diagnosticDurationMs(startedAt),
    });
    return result;
  } catch (error) {
    const details = safeGoogleDiagnostic(error) ?? {
      errorCategory: "UNKNOWN",
      errorCode: "UNKNOWN",
    };
    emitSyncDiagnostic({
      context,
      stage,
      status: "FAIL",
      durationMs: diagnosticDurationMs(startedAt),
      ...details,
    });
    throw error;
  }
}
