import { NextResponse } from "next/server";

import { isSyncAllowedEnvironment } from "@/lib/deployment-environment";
import { isAuthorizedCronRequest } from "@/services/google-sheets/sync/cron-auth";
import {
  createSyncRequestId,
  diagnosticDurationMs,
  diagnosticNow,
  emitSyncDiagnostic,
  type SyncDiagnosticContext,
} from "@/services/google-sheets/sync/diagnostic-core";
import { safeSyncErrorDetails } from "@/services/google-sheets/sync/diagnostics";
import { prepareGoogleSheetsWorksheetDiscovery } from "@/services/google-sheets/sync/discovery";
import {
  ControlledImportExecutionError,
  executeControlledWorksheetImport,
} from "@/services/google-sheets/sync/controlled-execution";
import {
  prepareWorksheetPreflight,
  WorksheetPreflightError,
  type WorksheetPreflightResult,
} from "@/services/google-sheets/sync/preflight";
import { parseControlledImportRequest } from "@/services/google-sheets/sync/operator-contract";
import { verifySupabaseProductionTarget } from "@/services/google-sheets/sync/production-target";

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

function requestContext() {
  return {
    context: { requestId: createSyncRequestId() },
    requestStartedAt: diagnosticNow(),
  };
}

function authorizeRequest(
  request: Request,
  context: SyncDiagnosticContext,
  requestStartedAt: number,
) {
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
  return null;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function preflightReport(preflight: WorksheetPreflightResult) {
  const canonicalPlan = preflight.canonicalPlan;
  const operationCounts = canonicalPlan?.operationCounts ?? {
    INSERT: 0,
    UPDATE: 0,
    SKIP: 0,
    BLOCK: 0,
  };
  const entityCounts = new Map<string, number>();
  for (const item of canonicalPlan?.items ?? []) {
    entityCounts.set(
      item.record.entity,
      (entityCounts.get(item.record.entity) ?? 0) + 1,
    );
  }
  const admissionBlockers = unique([
    ...preflight.mapping.blockers,
    ...preflight.validation.blockers,
    ...(preflight.canonicalPlan?.blockingIssues ?? []),
    ...(preflight.canonicalPlanError ? ["canonical_mapping_review"] : []),
    ...(preflight.worksheet.registryStatus &&
    preflight.worksheet.registryStatus !== "ACTIVE"
      ? [`worksheet_registry_${preflight.worksheet.registryStatus.toLowerCase()}`]
      : []),
    ...(preflight.status === "BLOCKED" ? ["preflight_blocked"] : []),
  ]);
  const validationIssues = preflight.validation.issues.map((issue) => ({
    row: issue.row,
    field: issue.field,
    reason: issue.reason,
  }));
  const canonicalItems = canonicalPlan?.items ?? [];
  const provenanceIssues = canonicalItems.filter((item) =>
    item.blockingIssues.includes("PROVENANCE_ERROR")
  ).length;
  const identityConflicts = canonicalItems.filter((item) =>
    item.blockingIssues.includes("IDENTITY_CONFLICT")
  ).length;
  return {
    status: preflight.status === "READY" && canonicalPlan ? "READY" : "BLOCKED",
    write: "NOT_EXECUTED",
    source: {
      sourceKey: preflight.sourceKey,
      sourceRange: preflight.sourceRange,
    },
    worksheet: {
      requested: preflight.worksheet.requested,
      effective: preflight.worksheet.effective,
      worksheetKey: preflight.worksheetKey,
      sheetId: preflight.worksheet.sheetId,
      rowCount: preflight.worksheet.rowCount,
      registered: preflight.worksheet.known,
      registryStatus: preflight.worksheet.registryStatus,
    },
    mapping: {
      profile: canonicalPlan?.mappingProfile ?? null,
      mappingVersion: canonicalPlan?.mappingVersion ?? null,
      schemaVersion: canonicalPlan?.schemaVersion ?? null,
      parserVersion: canonicalPlan?.parserVersion ?? null,
      schemaClassification: preflight.mapping.schemaClassification,
      schemaHash: preflight.mapping.schemaHash,
      blockers: preflight.mapping.blockers,
    },
    plan: canonicalPlan
      ? {
          id: canonicalPlan.planId,
          hash: canonicalPlan.planHash,
          totalRecords: canonicalPlan.items.length,
          entities: Object.fromEntries(entityCounts),
          operations: {
            insert: operationCounts.INSERT,
            update: operationCounts.UPDATE,
            noOp: operationCounts.SKIP,
            blocked: operationCounts.BLOCK,
          },
        }
      : null,
    validation: {
      sourceRows: preflight.validation.sourceRows,
      candidateRecords: preflight.validation.candidateRecords,
      validRecords: preflight.validation.validRecords,
      invalidRows: preflight.validation.invalidRows,
      errors: validationIssues,
      blockers: preflight.validation.blockers,
    },
    conflicts: {
      identity: identityConflicts,
      duplicateSourceKeys: preflight.classification.potentialDuplicates,
    },
    provenance: {
      issues: provenanceIssues,
      complete: canonicalPlan !== null && provenanceIssues === 0,
    },
    targetState: preflight.targetState,
    targetDiff: preflight.targetDiff,
    admission: {
      admitted:
        preflight.status === "READY" &&
        admissionBlockers.length === 0 &&
        canonicalPlan !== null,
      blockers: admissionBlockers,
    },
    expectedPlanFingerprint: preflight.expectedPlanFingerprint,
  };
}

function preflightFailureStatus(error: WorksheetPreflightError) {
  if (error.code === "WORKSHEET_NOT_FOUND") return 404;
  if (error.code === "WORKSHEET_AMBIGUOUS") return 409;
  return 502;
}

function requestFailure(
  error: unknown,
  context: SyncDiagnosticContext,
  requestStartedAt: number,
) {
  emitSyncDiagnostic({
    context,
    stage: "sync_complete",
    status: "FAIL",
    durationMs: diagnosticDurationMs(requestStartedAt),
    ...safeSyncErrorDetails(error),
  });
  if (error instanceof WorksheetPreflightError) {
    return NextResponse.json(
      { status: "FAILED", errorCode: error.code, message: "Worksheet preflight failed." },
      { status: preflightFailureStatus(error) },
    );
  }
  return NextResponse.json(
    { status: "FAILED", message: "Synchronization failed." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const { context, requestStartedAt } = requestContext();
  const denied = authorizeRequest(request, context, requestStartedAt);
  if (denied) return denied;

  try {
    // Target verification uses metadata SELECTs only. It is intentionally
    // shared by preview and execution so an unsafe target fails closed.
    await verifySupabaseProductionTarget({
      rawUrl: process.env.DATABASE_URL,
      connectionVariable: "DATABASE_URL",
    });
    const url = new URL(request.url);
    const worksheet = url.searchParams.get("worksheet");
    if (worksheet !== null) {
      const preflight = await prepareWorksheetPreflight({ worksheet });
      emitSyncDiagnostic({
        context,
        stage: "sync_complete",
        status: preflight.status === "READY" ? "PASS" : "FAIL",
        durationMs: diagnosticDurationMs(requestStartedAt),
        ...(preflight.status === "READY"
          ? {}
          : { errorCategory: "VALIDATION", errorCode: "PLAN_BLOCKED" }),
      });
      return NextResponse.json(preflightReport(preflight));
    }

    const discovery = await prepareGoogleSheetsWorksheetDiscovery(context);
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: "PASS",
      durationMs: diagnosticDurationMs(requestStartedAt),
    });
    return NextResponse.json({
      status: "DISCOVERY_READY",
      write: "NOT_EXECUTED",
      source: { sourceKey: discovery.sourceKey },
      worksheetCount: discovery.current.length,
      worksheets: discovery.current.map((item) => ({
        sheetId: item.sheetId,
        title: item.title,
        rowCount: item.rowCount,
      })),
    });
  } catch (error) {
    return requestFailure(error, context, requestStartedAt);
  }
}

export async function POST(request: Request) {
  const { context, requestStartedAt } = requestContext();
  const denied = authorizeRequest(request, context, requestStartedAt);
  if (denied) return denied;
  if (!(request.headers.get("content-type") ?? "")
    .toLocaleLowerCase("en-US")
    .includes("application/json")) {
    return NextResponse.json(
      { status: "INVALID_REQUEST", message: "JSON request body is required." },
      { status: 415 },
    );
  }

  let executionRequest: ReturnType<typeof parseControlledImportRequest>;
  try {
    executionRequest = parseControlledImportRequest(await request.json());
  } catch {
    return NextResponse.json(
      {
        status: "INVALID_REQUEST",
        message: "action, worksheet, and canonical importPlanId are required.",
      },
      { status: 400 },
    );
  }

  try {
    const productionTarget = await verifySupabaseProductionTarget({
      rawUrl: process.env.DATABASE_URL,
      connectionVariable: "DATABASE_URL",
    });
    const result = await executeControlledWorksheetImport({
      ...executionRequest,
      productionTarget,
      requestId: context.requestId,
    });
    emitSyncDiagnostic({
      context,
      stage: "sync_complete",
      status: result.status === "VERIFIED" ? "PASS" : "FAIL",
      durationMs: diagnosticDurationMs(requestStartedAt),
      ...(result.status === "VERIFIED"
        ? {}
        : { errorCategory: "SYNC", errorCode: result.status }),
    });
    return NextResponse.json({
      status: result.status,
      write: result.write,
      importPlanId: result.preflight.canonicalPlan?.planId ?? null,
      preflight: preflightReport(result.preflight),
      execution: {
        syncRunId: result.syncResult.syncRunId,
        status: result.syncResult.status,
        worksheetsScanned: result.syncResult.worksheetsScanned,
        rowsScanned: result.syncResult.rowsScanned,
        inserted: result.syncResult.inserted,
        updated: result.syncResult.updated,
        skipped: result.syncResult.skipped,
        failed: result.syncResult.failed,
      },
      verification: result.verification,
    });
  } catch (error) {
    if (error instanceof ControlledImportExecutionError) {
      emitSyncDiagnostic({
        context,
        stage: "sync_complete",
        status: "FAIL",
        durationMs: diagnosticDurationMs(requestStartedAt),
        errorCategory: "VALIDATION",
        errorCode: error.code,
      });
      return NextResponse.json(
        {
          status: "BLOCKED",
          write: "NOT_EXECUTED",
          errorCode: error.code,
          preflight: preflightReport(error.preflight),
        },
        {
          status:
            error.code === "PLAN_ID_MISMATCH"
              ? 409
              : error.code === "CANARY_AUTHORIZATION_REQUIRED"
                ? 403
                : 422,
        },
      );
    }
    return requestFailure(error, context, requestStartedAt);
  }
}
