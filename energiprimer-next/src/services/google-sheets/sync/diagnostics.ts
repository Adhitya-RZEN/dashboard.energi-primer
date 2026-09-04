import { performance } from "node:perf_hooks";
import "server-only";

import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";
import { classifySyncError } from "./error-classification";
import {
  emitSyncDiagnostic,
  isPrismaDiagnosticError,
  safeGoogleDiagnostic,
  safePrismaErrorCode,
  type SafeDiagnosticError,
  type SyncDiagnosticContext,
  type SyncDiagnosticStage,
} from "./diagnostic-core";

export type { SyncDiagnosticContext, SyncDiagnosticStage };

export function safeSyncErrorDetails(error: unknown): SafeDiagnosticError {
  if (error instanceof GoogleSheetsIntegrationError) {
    return safeGoogleDiagnostic(error) ?? {
      errorCategory: "UNKNOWN",
      errorCode: "UNKNOWN",
    };
  }

  const category = classifySyncError(error);
  const errorCode = safePrismaErrorCode(error);
  if (category === "DATABASE" && errorCode === "UNKNOWN" &&
      !isPrismaDiagnosticError(error)) {
    return { errorCategory: "UNKNOWN", errorCode: "UNKNOWN" };
  }
  return { errorCategory: category, errorCode };
}

export async function withSyncDiagnostic<T>(
  context: SyncDiagnosticContext | undefined,
  stage: SyncDiagnosticStage,
  operation: () => Promise<T>,
) {
  if (!context) return operation();
  const startedAt = performance.now();
  try {
    const result = await operation();
    emitSyncDiagnostic({
      context,
      stage,
      status: "PASS",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return result;
  } catch (error) {
    emitSyncDiagnostic({
      context,
      stage,
      status: "FAIL",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...safeSyncErrorDetails(error),
    });
    throw error;
  }
}
