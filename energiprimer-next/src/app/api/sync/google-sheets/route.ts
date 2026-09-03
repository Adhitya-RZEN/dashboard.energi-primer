import { NextResponse } from "next/server";

import { isSyncAllowedEnvironment } from "@/lib/deployment-environment";
import { runGoogleSheetsIncrementalSync } from "@/services/google-sheets/sync/engine";
import { isAuthorizedCronRequest } from "@/services/google-sheets/sync/cron-auth";
import {
  createSyncRequestId,
  diagnosticDurationMs,
  diagnosticNow,
  emitSyncDiagnostic,
} from "@/services/google-sheets/sync/diagnostic-core";
import { safeSyncErrorDetails } from "@/services/google-sheets/sync/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json(
    { status: "UNAUTHORIZED", message: "Synchronization is not authorized." },
    { status: 401 },
  );
}

function disabledForDeploymentEnvironment() {
  return NextResponse.json(
    {
      status: "DISABLED",
      message: "Synchronization is disabled for this deployment environment.",
    },
    { status: 403 },
  );
}

function deploymentEnvironmentGateResponse() {
  if (!isSyncAllowedEnvironment()) return disabledForDeploymentEnvironment();
  return null;
}

async function handle(request: Request) {
  const context = { requestId: createSyncRequestId() };
  const requestStartedAt = diagnosticNow();
  emitSyncDiagnostic({
    context,
    stage: "sync_request",
    status: "PASS",
    durationMs: 0,
  });

  const environmentStartedAt = diagnosticNow();
  const environmentResponse = deploymentEnvironmentGateResponse();
  const environmentAllowed = environmentResponse === null;
  emitSyncDiagnostic({
    context,
    stage: "environment_gate",
    status: environmentAllowed ? "PASS" : "FAIL",
    durationMs: diagnosticDurationMs(environmentStartedAt),
    ...(environmentAllowed
      ? {}
      : {
          errorCategory: "ENVIRONMENT",
          errorCode: "DEPLOYMENT_DENIED",
        }),
  });
  if (!environmentAllowed) {
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      errorCategory: "ENVIRONMENT",
      errorCode: "DEPLOYMENT_DENIED",
    });
    return environmentResponse;
  }

  if (!process.env.CRON_SECRET) {
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      errorCategory: "CONFIGURATION",
      errorCode: "CRON_SECRET_NOT_CONFIGURED",
    });
    return NextResponse.json(
      { status: "NOT_CONFIGURED", message: "Synchronization is not configured." },
      { status: 503 },
    );
  }
  if (!isAuthorizedCronRequest(request.headers)) {
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      errorCategory: "AUTHENTICATION",
      errorCode: "CRON_UNAUTHORIZED",
    });
    return unauthorized();
  }

  try {
    const result = await runGoogleSheetsIncrementalSync({
      triggerType: "cron",
      requestId: context.requestId,
      // Discovery is broad, but cron admits only valid BB worksheets after
      // Juli26-BB whose period is due and whose schema matches Juli26-BB.
      scope: "automatic",
      // The deployment gate above is the explicit boundary for the route's
      // remote-capable write path. The CLI keeps its local-only guard.
      allowNonLocalDatabase: true,
    });
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: result.status === "SUCCESS" ? "PASS" : "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      ...(result.status === "SUCCESS"
        ? {}
        : {
            errorCategory:
              result.status === "LOCKED" ? "CONCURRENCY" : "SYNC",
            errorCode: result.status,
          }),
    });
    return NextResponse.json({
      status: result.status,
      worksheetsScanned: result.worksheetsScanned,
      rowsScanned: result.rowsScanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (error) {
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      ...safeSyncErrorDetails(error),
    });
    return NextResponse.json(
      { status: "FAILED", message: "Synchronization failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
