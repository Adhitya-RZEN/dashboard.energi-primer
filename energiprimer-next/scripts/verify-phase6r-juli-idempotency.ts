import { prisma } from "../src/lib/prisma";
import { getGoogleSheetsConfig } from "../src/lib/google-sheets";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";
import {
  approvedMappingContractForWorksheet,
  mappingApprovalForContract,
} from "../src/services/google-sheets/canonical/index";
import { assertCanonicalImportPlanIntegrity } from "../src/services/google-sheets/canonical/import-plan";
import { verifyImmutableCanonicalPlanIdempotency } from "../src/services/google-sheets/canonical/idempotency";
import type { CanonicalImportPlan } from "../src/services/google-sheets/canonical/types";
import {
  createCanonicalTargetReconciliationRepository,
} from "../src/services/google-sheets/canonical/compatibility-repository";
import { readAndParseDynamicWorksheet } from "../src/services/google-sheets/dynamic/reader";
import {
  assertJuliCanaryCanonicalPlan,
  JULI26_CANARY_SHEET_ID,
  JULI26_CANARY_WORKSHEET,
} from "../src/services/google-sheets/sync/juli-canary-scope";
import { assertProductionCanaryAuthorization } from "../src/services/google-sheets/sync/production-canary";
import { verifySupabaseProductionTarget } from "../src/services/google-sheets/sync/production-target";

const PHASE6_PLAN_HASH =
  "d6f4659cb1fab3af7cdd81e8f95d7caac054a6eb16e9b32ed7a38ab6afe2acbe";

function safeJson(value: unknown) {
  return JSON.stringify(value, (key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

function assertExactPlan(plan: CanonicalImportPlan) {
  assertCanonicalImportPlanIntegrity(plan);
  assertJuliCanaryCanonicalPlan(plan);
  if (
    plan.planId !== PHASE6_PLAN_HASH ||
    plan.planHash !== PHASE6_PLAN_HASH ||
    plan.sourceManifest.sheetId !== JULI26_CANARY_SHEET_ID ||
    plan.sourceManifest.sourceRange !== "A1:ZZ500" ||
    plan.operationCounts.INSERT !== 0 ||
    plan.operationCounts.UPDATE !== 15 ||
    plan.operationCounts.SKIP !== 7 ||
    plan.operationCounts.BLOCK !== 0
  ) {
    throw new Error("The immutable plan is outside the authorized Phase 6R scope.");
  }
}

async function ledgerCounts() {
  return {
    runs: await prisma.canonicalImportRun.count(),
    batches: await prisma.canonicalImportBatch.count(),
  };
}

async function verify() {
  if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED !== "true") {
    throw new Error("The durable ledger recovery flag is not enabled.");
  }
  const productionTarget = await verifySupabaseProductionTarget({
    rawUrl: process.env.DATABASE_URL,
    connectionVariable: "DATABASE_URL",
  });
  assertProductionCanaryAuthorization(22);

  const beforeCounts = await ledgerCounts();
  const ledgerRow = await prisma.canonicalImportRun.findUnique({
    where: { planHash: PHASE6_PLAN_HASH },
    select: { id: true, status: true, planSnapshot: true },
  });
  if (!ledgerRow) throw new Error("The reconciled Phase 6 ledger run was not found.");
  if (ledgerRow.status !== "RECONCILED") {
    throw new Error(`Idempotency requires a RECONCILED run, found ${ledgerRow.status}.`);
  }
  const plan = JSON.parse(ledgerRow.planSnapshot) as CanonicalImportPlan;
  assertExactPlan(plan);

  const targetRepository = createCanonicalTargetReconciliationRepository();
  const reconciliation = await targetRepository.reconcileTarget(plan);
  if (reconciliation.status !== "RECONCILED") {
    throw new Error(reconciliation.reason ?? "Read-only target reconciliation failed.");
  }

  const config = getGoogleSheetsConfig();
  const mapping = approvedMappingContractForWorksheet(JULI26_CANARY_WORKSHEET);
  if (!mapping) throw new Error("The approved Juli canonical mapping is unavailable.");
  const readResult = await readAndParseDynamicWorksheet(
    JULI26_CANARY_WORKSHEET,
    undefined,
    { mappingApproval: mappingApprovalForContract(mapping) },
  );
  const basePlan = buildGoogleSheetsImportPlanFromReadResult(readResult, {
    mappingApproval: mappingApprovalForContract(mapping),
  });
  if (
    basePlan.status !== "READY_FOR_IMPORT" ||
    basePlan.sourceRange !== "A1:ZZ500" ||
    basePlan.stagingRows.length !== 352
  ) {
    throw new Error("The live Juli source projection is not the approved full source.");
  }
  if (config.spreadsheetId.trim().length === 0) {
    throw new Error("The configured spreadsheet identity is empty.");
  }

  const result = await verifyImmutableCanonicalPlanIdempotency({
    plan,
    basePlan,
    productionTarget,
  });
  const afterCounts = await ledgerCounts();
  const sameLedgerCounts =
    beforeCounts.runs === afterCounts.runs &&
    beforeCounts.batches === afterCounts.batches;
  const status =
    result.status === "PASS" &&
    result.businessWrites === 0 &&
    result.samePlan &&
    result.sameLedgerRun &&
    sameLedgerCounts
      ? "PASS"
      : "FAIL";

  console.log(safeJson({
    status,
    mode: "PHASE6R_JULI_SAME_IMMUTABLE_PLAN",
    planId: plan.planId,
    planHash: plan.planHash,
    ledgerRunId: ledgerRow.id,
    readOnlyReconciliation: reconciliation.status,
    idempotency: result,
    additionalBusinessWrites: result.businessWrites,
    googleSheetsWrites: 0,
    schemaChanges: 0,
    migrationChanges: 0,
    ledgerCounts: { before: beforeCounts, after: afterCounts },
  }));
  if (status !== "PASS") process.exitCode = 1;
}

verify().catch((error) => {
  console.error(safeJson({
    status: "FAIL",
    mode: "PHASE6R_JULI_SAME_IMMUTABLE_PLAN",
    error: error instanceof Error ? error.message : "Idempotency verification failed.",
    additionalBusinessWrites: 0,
    googleSheetsWrites: 0,
  }));
  process.exitCode = 1;
});
