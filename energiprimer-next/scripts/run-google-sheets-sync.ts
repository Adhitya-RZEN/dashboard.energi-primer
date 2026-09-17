import {
  assertLocalExecution,
  parseLocalSyncArguments,
} from "../src/services/google-sheets/sync/operator-contract";
import {
  prepareSupabasePoolerProbeUrl,
  verifySupabaseProductionTarget,
  type VerifiedSupabaseProductionTarget,
} from "../src/services/google-sheets/sync/production-target";
import { assertProductionCanaryAuthorization } from "../src/services/google-sheets/sync/production-canary";

const SAFE_FAILURE_CODES = new Set([
  "ENVIRONMENT_VARIABLE_MISSING",
  "INVALID_URL_SHAPE",
  "WRONG_SUPABASE_ENDPOINT",
  "WRONG_DATABASE",
  "WRONG_SCHEMA",
  "REQUIRED_TABLES_MISSING",
  "TARGET_UNREACHABLE",
  "TARGET_VERIFICATION_FAILED",
  "WORKSHEET_NOT_FOUND",
  "WORKSHEET_AMBIGUOUS",
  "WORKSHEET_READ_FAILED",
  "configuration",
  "credentials",
  "authentication",
  "permission",
  "rate_limit",
  "timeout",
  "api",
  "malformed_response",
]);

function safeFailure(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_FAILURE_CODES.has(code)) return code;
  }
  if (error instanceof Error) {
    const message = error.message.toLocaleLowerCase("en-US");
    if (message.includes("worksheet is required")) return "WORKSHEET_REQUIRED";
    if (message.includes("production target must be explicit"))
      return "PRODUCTION_TARGET_REQUIRED";
    if (message.includes("target must be production")) return "INVALID_TARGET";
    if (message.includes("current scope is not supported"))
      return "EXPLICIT_WORKSHEET_SCOPE_INVALID";
    if (message.includes("unsupported operator"))
      return "UNSUPPORTED_OPERATOR_ARGUMENT";
    if (message.includes("boolean operator option"))
      return "BOOLEAN_OPERATOR_OPTION_VALUE";
    if (message.includes("canary is not authorized"))
      return "CANARY_AUTHORIZATION_REQUIRED";
    if (message.includes("canary scope exceeds"))
      return "CANARY_SCOPE_TOO_LARGE";
  }
  return "OPERATOR_WORKFLOW_FAILED";
}

function safeTargetIdentity(target: VerifiedSupabaseProductionTarget) {
  return {
    host: target.identity.host,
    port: target.identity.port,
    database: target.identity.database,
    schema: target.identity.schema,
    role: target.identity.role,
    postgresql: target.identity.postgresql,
    ssl: target.identity.ssl,
  };
}

function printReport(report: unknown) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  let argumentsList: ReturnType<typeof parseLocalSyncArguments>;
  try {
    argumentsList = parseLocalSyncArguments(process.argv.slice(2));
    assertLocalExecution();
  } catch (error) {
    printReport({
      status: "BLOCKED",
      environment: "NOT_CONFIRMED_LOCAL",
      target: "SUPABASE_PRODUCTION",
      reason: safeFailure(error),
      write: "NOT_EXECUTED",
    });
    process.exitCode = 2;
    return;
  }

  const rawPoolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
  let productionTarget: VerifiedSupabaseProductionTarget;
  try {
    productionTarget = await verifySupabaseProductionTarget({
      rawUrl: rawPoolerUrl,
      connectionVariable: "SUPABASE_POOLER_URL",
    });
    // The URL is changed only in this child process, after the read-only target
    // probe has positively identified the Production database.
    process.env.DATABASE_URL = prepareSupabasePoolerProbeUrl(rawPoolerUrl ?? "");
  } catch (error) {
    printReport({
      status: "BLOCKED",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      reason: safeFailure(error),
      write: "NOT_EXECUTED",
    });
    process.exitCode = 2;
    return;
  }

  let preflight: Awaited<
    ReturnType<
      typeof import("../src/services/google-sheets/sync/preflight")["prepareWorksheetPreflight"]
    >
  >;
  try {
    const { prepareWorksheetPreflight } = await import(
      "../src/services/google-sheets/sync/preflight"
    );
    preflight = await prepareWorksheetPreflight({
      worksheet: argumentsList.worksheet,
      ...(argumentsList.canary ? { canary: true as const } : {}),
    });
  } catch (error) {
    printReport({
      status: "BLOCKED",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      identity: safeTargetIdentity(productionTarget),
      worksheet: argumentsList.worksheet,
      reason: safeFailure(error),
      write: "NOT_EXECUTED",
    });
    process.exitCode = 2;
    return;
  }

  const dryRunReport = {
    status: preflight.status === "READY" ? "PASS" : "BLOCKED",
    phase: "DRY_RUN",
    environment: "LOCAL",
    target: "SUPABASE_PRODUCTION",
    identity: safeTargetIdentity(productionTarget),
    discovery: {
      spreadsheet: preflight.spreadsheet.status,
      worksheet: preflight.worksheet.status,
      worksheetKnown: preflight.worksheet.known,
      worksheetRegistryStatus: preflight.worksheet.registryStatus,
      worksheetIdVerified: Boolean(preflight.worksheetKey),
      mapping: preflight.mapping.status,
      sourceRange: preflight.sourceRange,
      schemaClassification: preflight.mapping.schemaClassification,
      schemaHash: preflight.mapping.schemaHash,
    },
    validation: {
      status: preflight.validation.status,
      sourceRows: preflight.validation.sourceRows,
      candidateRecords: preflight.validation.candidateRecords,
      validRecords: preflight.validation.validRecords,
      invalidRows: preflight.validation.invalidRows,
      invalidRowDetails: preflight.validation.issues,
      blockers: [
        ...preflight.mapping.blockers,
        ...preflight.validation.blockers,
        ...(preflight.validation.issues.length > 0 ? ["invalid_rows"] : []),
      ].filter((value, index, values) => values.indexOf(value) === index),
      warnings: preflight.validation.warnings,
    },
    canonicalPlan: preflight.canonicalPlan
      ? {
          planId: preflight.canonicalPlan.planId,
          approvalState: preflight.canonicalPlan.approvalState,
          totalRecords: preflight.canonicalPlan.items.length,
          operationCounts: preflight.canonicalPlan.operationCounts,
          blockingIssues: preflight.canonicalPlan.blockingIssues,
        }
      : null,
    targetState: preflight.targetState,
    targetDiff: preflight.targetDiff,
    scope: preflight.canary,
    idempotency: {
      newRecords: preflight.classification.newRecords,
      existingRecords: preflight.classification.existingRecords,
      potentialDuplicates: preflight.classification.potentialDuplicates,
      insertRecords: preflight.classification.inserted,
      updateRecords: preflight.classification.updated,
      skipRecords: preflight.classification.skipped,
    },
    write: argumentsList.dryRun ? "NOT_EXECUTED" : "PENDING",
  };
  printReport(dryRunReport);

  if (preflight.status !== "READY") {
    process.exitCode = 2;
    return;
  }
  if (argumentsList.dryRun) return;

  if (
    argumentsList.canary !== true ||
    argumentsList.worksheet.trim().toLocaleLowerCase("en-US") !== "juli26-bb"
  ) {
    printReport({
      status: "BLOCKED",
      phase: "PRODUCTION_CANARY",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      worksheet: preflight.worksheet.effective,
      reason: "CANARY_SCOPE_REQUIRED",
      write: "NOT_EXECUTED",
      productionWrites: 0,
    });
    process.exitCode = 2;
    return;
  }

  try {
    assertProductionCanaryAuthorization(preflight.canonicalPlan?.items.length ?? 0);
  } catch (error) {
    printReport({
      status: "BLOCKED",
      phase: "PRODUCTION_CANARY",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      worksheet: preflight.worksheet.effective,
      reason: safeFailure(error),
      write: "NOT_EXECUTED",
      productionWrites: 0,
      canary: "NOT EXECUTED",
    });
    process.exitCode = 2;
    return;
  }

  console.warn(
    [
      "WARNING",
      "Target: SUPABASE PRODUCTION",
      "Operation: IMPORT GOOGLE SHEETS WORKSHEET",
      `Worksheet: ${preflight.worksheet.effective}`,
      "Proceeding with production write...",
    ].join("\n"),
  );

  try {
    const { runGoogleSheetsIncrementalSync } = await import(
      "../src/services/google-sheets/sync/engine"
    );
    const result = await runGoogleSheetsIncrementalSync({
      triggerType: "manual",
      worksheetTitle: preflight.worksheet.effective,
      scope: "all",
      databaseTarget: "SUPABASE_PRODUCTION",
      productionTarget,
      expectedPlanFingerprint: preflight.expectedPlanFingerprint,
      expectedCanonicalPlanId: preflight.canonicalPlan?.planId,
      canonicalImportRunId: preflight.canonicalPlan?.importRunId,
      durableLedger: "REQUIRED",
      ...(argumentsList.canary ? { canary: true as const } : {}),
    });
    const { verifyWorksheetSyncAfterWrite } = await import(
      "../src/services/google-sheets/sync/post-write-verification"
    );
    const verification = await verifyWorksheetSyncAfterWrite({
      preflight,
      syncResult: result,
    });

    let repeatVerification: {
      status: "PASS" | "FAIL" | "NOT_REQUESTED";
      inserted: number;
      updated: number;
      skipped: number;
    } = {
      status: "NOT_REQUESTED",
      inserted: 0,
      updated: 0,
      skipped: 0,
    };
    if (process.argv.includes("--verify-idempotency")) {
      const { verifyImmutableCanonicalPlanIdempotency } = await import(
        "../src/services/google-sheets/canonical/idempotency"
      );
      const repeat = result.status === "SUCCESS" && verification.status === "PASS"
        ? await verifyImmutableCanonicalPlanIdempotency({
            plan: preflight.canonicalPlan!,
            basePlan: preflight.executionPlan,
            productionTarget,
          })
        : null;
      repeatVerification = {
        status:
          repeat?.status === "PASS"
            ? "PASS"
            : "FAIL",
        inserted: repeat?.businessWrites ?? 0,
        updated: 0,
        skipped: repeat?.samePlan && repeat.sameLedgerRun
          ? preflight.executionPlan.stagingRows.length
          : 0,
      };
    }

    const verified =
      result.status === "SUCCESS" &&
      verification.status === "PASS" &&
      repeatVerification.status === "PASS";
    const finalStatus =
      result.status === "RECONCILIATION_REQUIRED"
        ? "RECONCILIATION_REQUIRED"
        : result.status !== "SUCCESS"
          ? "FAILED"
        : verified
          ? "VERIFIED"
          : verification.status === "PASS_WITH_REVIEW"
            ? "PASS_WITH_REVIEW"
            : "FAILED";
    printReport({
      status: finalStatus,
      phase: "POST_WRITE_VERIFICATION",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      identity: safeTargetIdentity(productionTarget),
      worksheet: preflight.worksheet.effective,
      recordsRead: verification.recordsRead,
      recordsValid: verification.recordsValid,
      recordsInserted: verification.recordsInserted,
      recordsUpdated: verification.recordsUpdated,
      recordsSkipped: verification.recordsSkipped,
      duplicatesCreated: verification.duplicatesCreated,
      invalidRecords: preflight.validation.invalidRows,
      syncRun: result,
      productionVerification: verification,
      idempotencyRepeat: repeatVerification,
      write: "EXECUTED",
    });
    if (!verified) process.exitCode = 1;
  } catch (error) {
    printReport({
      status: "FAILED",
      phase: "PRODUCTION_WRITE",
      environment: "LOCAL",
      target: "SUPABASE_PRODUCTION",
      identity: safeTargetIdentity(productionTarget),
      worksheet: preflight.worksheet.effective,
      attemptedRecords:
        preflight.classification.inserted + preflight.classification.updated,
      successfullyWritten: "NOT_VERIFIED",
      failedRecords: "NOT_VERIFIED",
      manualRemediationRequired: true,
      reason: safeFailure(error),
      rollback: "EXISTING_IMPORT_TRANSACTION_POLICY_APPLIED",
      write: "FAILED",
    });
    process.exitCode = 1;
  }
}

await main();
