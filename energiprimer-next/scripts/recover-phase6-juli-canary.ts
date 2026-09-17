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
import type { CanonicalImportPlan } from "../src/services/google-sheets/canonical/types";
import {
  createCanonicalTargetReconciliationRepository,
} from "../src/services/google-sheets/canonical/compatibility-repository";
import { executeDurableCanonicalPlan } from "../src/services/google-sheets/canonical/ledger";
import { PrismaCanonicalLedgerStore } from "../src/services/google-sheets/canonical/ledger-prisma-store";
import { readAndParseDynamicWorksheet } from "../src/services/google-sheets/dynamic/reader";
import {
  contentHashForStagingRows,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import { buildSchemaSnapshot } from "../src/services/google-sheets/sync/schema-detection";
import { stableGoogleSheetsSourceKey } from "../src/services/google-sheets/sync/discovery";
import {
  assertJuliCanaryCanonicalPlan,
  JULI26_CANARY_SHEET_ID,
  JULI26_CANARY_WORKSHEET,
} from "../src/services/google-sheets/sync/juli-canary-scope";
import { assertProductionCanaryAuthorization } from "../src/services/google-sheets/sync/production-canary";
import { verifySupabaseProductionTarget } from "../src/services/google-sheets/sync/production-target";
import { sourceKeyForCanonicalRecord } from "../src/services/google-sheets/canonical/compatibility-adapter";

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
    plan.planHash !== PHASE6_PLAN_HASH ||
    plan.planId !== PHASE6_PLAN_HASH ||
    plan.operationCounts.INSERT !== 0 ||
    plan.operationCounts.UPDATE !== 15 ||
    plan.operationCounts.SKIP !== 7 ||
    plan.operationCounts.BLOCK !== 0
  ) {
    throw new Error("The immutable ledger snapshot is not the authorized Juli canary plan.");
  }
}

async function recover() {
  if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED !== "true") {
    throw new Error("The durable ledger recovery flag is not enabled.");
  }
  const productionTarget = await verifySupabaseProductionTarget({
    rawUrl: process.env.DATABASE_URL,
    connectionVariable: "DATABASE_URL",
  });
  assertProductionCanaryAuthorization(22);

  const ledgerRow = await prisma.canonicalImportRun.findUnique({
    where: { planHash: PHASE6_PLAN_HASH },
    select: { id: true, status: true, planSnapshot: true },
  });
  if (!ledgerRow) throw new Error("The authorized Juli canary ledger run was not found.");
  if (ledgerRow.status !== "RECONCILIATION_REQUIRED") {
    throw new Error(`Recovery requires RECONCILIATION_REQUIRED, found ${ledgerRow.status}.`);
  }
  const plan = JSON.parse(ledgerRow.planSnapshot) as CanonicalImportPlan;
  assertExactPlan(plan);

  const targetRepository = createCanonicalTargetReconciliationRepository();
  const recovery = await executeDurableCanonicalPlan(plan, {
    store: new PrismaCanonicalLedgerStore(),
    repository: targetRepository,
    reconcileTarget: targetRepository.reconcileTarget,
  });
  if (recovery.status !== "COMMITTED") {
    throw new Error(recovery.reason ?? "The exact ledger recovery did not reconcile.");
  }

  const config = getGoogleSheetsConfig();
  const mapping = approvedMappingContractForWorksheet(JULI26_CANARY_WORKSHEET);
  if (!mapping) throw new Error("The approved Juli canonical mapping is unavailable.");
  const readResult = await readAndParseDynamicWorksheet(
    JULI26_CANARY_WORKSHEET,
    undefined,
    { mappingApproval: mappingApprovalForContract(mapping) },
  );
  const fullPlan = buildGoogleSheetsImportPlanFromReadResult(readResult, {
    mappingApproval: mappingApprovalForContract(mapping),
  });
  if (
    fullPlan.status !== "READY_FOR_IMPORT" ||
    fullPlan.sourceRange !== "A1:ZZ500" ||
    fullPlan.stagingRows.length !== 352
  ) {
    throw new Error("The live Juli source did not reproduce the approved full source projection.");
  }
  const schemaSnapshot = buildSchemaSnapshot(readResult.parsed);
  const sourceKey = stableGoogleSheetsSourceKey(config.spreadsheetId);
  const source = await prisma.syncSource.findUnique({
    where: { sourceKey },
    select: { id: true },
  });
  if (!source) throw new Error("The registered Juli source was not found.");
  const worksheet = await prisma.syncWorksheet.findUnique({
    where: {
      sourceId_worksheetKey: {
        sourceId: source.id,
        worksheetKey: JULI26_CANARY_SHEET_ID,
      },
    },
    select: { id: true, status: true, worksheetTitle: true },
  });
  if (
    !worksheet ||
    worksheet.worksheetTitle !== JULI26_CANARY_WORKSHEET ||
    !["ERROR", "ACTIVE"].includes(worksheet.status)
  ) {
    throw new Error("The Juli worksheet registry is not in a recoverable state.");
  }

  const sourceKeys = plan.items.map((item) => sourceKeyForCanonicalRecord(item.record));
  const fullSourceKeys = new Set(fullPlan.stagingRows.map(sourceKeyForStagingRow));
  if (sourceKeys.some((key) => !fullSourceKeys.has(key))) {
    throw new Error("The immutable canary plan is not represented by the live source projection.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of plan.items) {
      const sourceKeyForItem = sourceKeyForCanonicalRecord(item.record);
      const isWrite = item.operation === "INSERT" || item.operation === "UPDATE";
      await tx.syncRowState.upsert({
        where: {
          worksheetId_sourceKey: {
            worksheetId: worksheet.id,
            sourceKey: sourceKeyForItem,
          },
        },
        create: {
          worksheetId: worksheet.id,
          sourceKey: sourceKeyForItem,
          entityType: item.record.entity,
          contentHash: item.contentHash,
          lastSeenAt: now,
          lastSyncedAt: isWrite ? now : null,
        },
        update: {
          entityType: item.record.entity,
          contentHash: item.contentHash,
          lastSeenAt: now,
          ...(isWrite ? { lastSyncedAt: now } : {}),
        },
      });
    }
    await tx.syncWorksheet.update({
      where: { id: worksheet.id },
      data: {
        status: "ACTIVE",
        lastSyncAt: now,
        contentHash: contentHashForStagingRows(fullPlan.stagingRows),
        schemaHash: schemaSnapshot.hash,
        schemaSnapshot: JSON.stringify(schemaSnapshot),
        rowCount: fullPlan.stagingRows.length,
      },
    });
  }, { timeout: 30_000 });

  const finalLedger = await prisma.canonicalImportRun.findUnique({
    where: { planHash: PHASE6_PLAN_HASH },
    select: { id: true, status: true },
  });
  console.log(safeJson({
    status: "PASS",
    mode: "PHASE6_JULI_CANARY_SAFE_LEDGER_RECOVERY",
    planId: PHASE6_PLAN_HASH,
    ledgerRunId: finalLedger?.id ?? null,
    ledgerStatus: finalLedger?.status ?? null,
    recovery: "TARGET_RECONCILIATION_STATE_ONLY",
    businessWrites: 0,
    googleSheetsWrites: 0,
    schemaChanges: 0,
    worksheetStatus: "ACTIVE",
    worksheetRowCount: fullPlan.stagingRows.length,
    productionTarget: productionTarget.identity,
  }));
}

recover().catch((error) => {
  console.error(safeJson({
    status: "BLOCKED",
    mode: "PHASE6_JULI_CANARY_SAFE_LEDGER_RECOVERY",
    error: error instanceof Error ? error.message : "Recovery failed.",
    businessWrites: 0,
    googleSheetsWrites: 0,
  }));
  process.exitCode = 1;
});
