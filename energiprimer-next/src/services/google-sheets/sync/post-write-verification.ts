import "server-only";

import { prisma } from "@/lib/prisma";

import type { IncrementalSyncResult } from "./engine";
import {
  contentHashForStagingRow,
  contentHashForStagingRows,
  sourceKeyForStagingRow,
} from "./identity";
import type { WorksheetPreflightResult } from "./preflight";
import {
  reconcileCanonicalTargetStates,
} from "@/services/google-sheets/canonical/target-state";
import { canonicalLedgerPlanSnapshot } from "@/services/google-sheets/canonical/ledger";
import { loadCanonicalTargetStates } from "@/services/google-sheets/canonical/target-repository";

export type PostWriteVerificationResult = {
  status: "PASS" | "PASS_WITH_REVIEW";
  worksheet: "PASS" | "FAIL";
  recordsRead: number;
  recordsValid: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  duplicatesCreated: number | "NOT_VERIFIED";
  databaseVerification: "PASS" | "FAIL";
  traceability: "PASS" | "PASS_WITH_REVIEW";
  ledgerVerification: "PASS" | "FAIL" | "NOT_VERIFIED";
  targetReconciliation: "PASS" | "FAIL" | "NOT_VERIFIED";
  issues: readonly string[];
};

function expectedSourceKeys(preflight: WorksheetPreflightResult) {
  return [
    ...new Set(preflight.executionPlan.stagingRows.map((row) => sourceKeyForStagingRow(row))),
  ];
}

export async function verifyWorksheetSyncAfterWrite(input: {
  preflight: WorksheetPreflightResult;
  syncResult: IncrementalSyncResult;
}): Promise<PostWriteVerificationResult> {
  const { preflight, syncResult } = input;
  const issues: string[] = [];
  const sourceKeys = expectedSourceKeys(preflight);
  if (!syncResult.syncRunId || !/^\d+$/u.test(syncResult.syncRunId))
    issues.push("sync_run_id_missing");

  let databaseVerification: PostWriteVerificationResult["databaseVerification"] = "PASS";
  let traceability: PostWriteVerificationResult["traceability"] = "PASS";
  let ledgerVerification: PostWriteVerificationResult["ledgerVerification"] = "NOT_VERIFIED";
  let targetReconciliation: PostWriteVerificationResult["targetReconciliation"] = "NOT_VERIFIED";
  try {
    if (!syncResult.syncRunId || !/^\d+$/u.test(syncResult.syncRunId)) {
      databaseVerification = "FAIL";
    } else {
      const syncRun = await prisma.syncRun.findUnique({
        where: { id: BigInt(syncResult.syncRunId) },
        select: {
          status: true,
          worksheetsScanned: true,
          rowsScanned: true,
          inserted: true,
          updated: true,
          skipped: true,
          failed: true,
        },
      });
      if (!syncRun) {
        issues.push("sync_run_not_found");
        databaseVerification = "FAIL";
      } else {
        if (
          syncRun.status !== "SUCCESS" ||
          syncRun.failed !== 0 ||
          syncRun.worksheetsScanned !== 1 ||
          syncRun.rowsScanned !== syncResult.rowsScanned ||
          syncRun.inserted !== syncResult.inserted ||
          syncRun.updated !== syncResult.updated ||
          syncRun.skipped !== syncResult.skipped
        ) {
          issues.push("sync_run_counters_mismatch");
          databaseVerification = "FAIL";
        }
      }
    }

    const source = await prisma.syncSource.findUnique({
      where: { sourceKey: preflight.sourceKey },
      select: {
        worksheets: {
          where: { worksheetKey: preflight.worksheetKey },
          select: {
            id: true,
            status: true,
            rowCount: true,
            contentHash: true,
            schemaHash: true,
          },
        },
      },
    });
    const worksheet = source?.worksheets[0];
    if (!worksheet) {
      issues.push("worksheet_registry_not_found");
      databaseVerification = "FAIL";
    } else {
      if (worksheet.status !== "ACTIVE") {
        issues.push("worksheet_not_active");
        databaseVerification = "FAIL";
      }
      if (worksheet.rowCount !== preflight.plan.stagingRows.length) {
        issues.push("worksheet_row_count_mismatch");
        databaseVerification = "FAIL";
      }
      if (
        worksheet.contentHash !== contentHashForStagingRows(
          preflight.plan.stagingRows,
        )
      ) {
        issues.push("worksheet_content_hash_mismatch");
        databaseVerification = "FAIL";
      }
      if (worksheet.schemaHash !== preflight.schemaSnapshot.hash) {
        issues.push("worksheet_schema_hash_mismatch");
        databaseVerification = "FAIL";
      }

          const states = sourceKeys.length
        ? await prisma.syncRowState.findMany({
            where: {
              worksheetId: worksheet.id,
              sourceKey: { in: sourceKeys },
            },
            select: { sourceKey: true, entityType: true, contentHash: true },
          })
        : [];
      const stateKeys = new Set(states.map((state) => state.sourceKey));
      const missingStateCount = sourceKeys.filter((key) => !stateKeys.has(key)).length;
      if (missingStateCount > 0) {
        issues.push("sync_row_states_missing");
        databaseVerification = "FAIL";
      }
      if (states.length !== new Set(states.map((state) => state.sourceKey)).size) {
        issues.push("sync_row_states_duplicate");
        databaseVerification = "FAIL";
      }
      const expectedStateByKey = new Map(
        preflight.executionPlan.stagingRows.map((row) => [
          sourceKeyForStagingRow(row),
          { entityType: row.entityType, contentHash: contentHashForStagingRow(row) },
        ]),
      );
      for (const state of states) {
        const expected = expectedStateByKey.get(state.sourceKey);
        if (!expected) {
          issues.push("sync_row_state_unexpected");
          databaseVerification = "FAIL";
          continue;
        }
        if (state.entityType !== expected.entityType) {
          issues.push("sync_row_state_entity_mismatch");
          databaseVerification = "FAIL";
        }
        if (state.contentHash !== expected.contentHash) {
          issues.push("sync_row_state_content_hash_mismatch");
          databaseVerification = "FAIL";
        }
      }
    }

    if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED === "true" && preflight.canonicalPlan) {
      const ledgerRun = await prisma.canonicalImportRun.findUnique({
        where: { planHash: preflight.canonicalPlan.planHash },
        include: { batches: { orderBy: { batchNumber: "asc" } } },
      });
      const expectedWritable = preflight.canonicalPlan.operationCounts.INSERT +
        preflight.canonicalPlan.operationCounts.UPDATE;
      const batchesCoverPlan = ledgerRun !== null &&
        ledgerRun.batches.reduce((total, batch) => total + batch.itemCount, 0) === expectedWritable &&
        (expectedWritable === 0 ? ledgerRun.batches.length === 0 : ledgerRun.batches.length > 0);
      const committedCountsCoverPlan = ledgerRun !== null &&
        ledgerRun.batches.every(
          (batch) => batch.status === "COMMITTED" &&
            batch.committedItemCount === batch.itemCount,
        );
      const planSnapshotMatches = ledgerRun !== null &&
        ledgerRun.planSnapshot === canonicalLedgerPlanSnapshot(preflight.canonicalPlan);
      const ledgerPass = ledgerRun !== null &&
        ledgerRun.status === "RECONCILED" &&
        ledgerRun.approvalState === "APPROVED" &&
        ledgerRun.planId === preflight.canonicalPlan.planId &&
        ledgerRun.totalItems === preflight.canonicalPlan.items.length &&
        batchesCoverPlan &&
        committedCountsCoverPlan &&
        ledgerRun.plannedInsert === preflight.canonicalPlan.operationCounts.INSERT &&
        ledgerRun.plannedUpdate === preflight.canonicalPlan.operationCounts.UPDATE &&
        ledgerRun.plannedSkip === preflight.canonicalPlan.operationCounts.SKIP &&
        ledgerRun.plannedBlock === preflight.canonicalPlan.operationCounts.BLOCK &&
        planSnapshotMatches;
      if (!ledgerPass) {
        ledgerVerification = "FAIL";
        traceability = "PASS_WITH_REVIEW";
        issues.push("canonical_ledger_verification_failed");
      } else {
        ledgerVerification = "PASS";
      }
    } else {
      const importRun = await prisma.spreadsheetImportRun.findFirst({
        where: {
          source: "google_sheets_sync",
          requestedWorksheet: preflight.plan.requested.worksheet,
          effectiveWorksheet: preflight.plan.effective.worksheet,
          sourceRange: preflight.plan.sourceRange,
          requestedPeriod: preflight.plan.requestedPeriod,
          effectivePeriod: preflight.plan.effectivePeriod,
          status: "SUCCESS",
        },
        orderBy: { completedAt: "desc" },
        select: { id: true, importedRows: true, rejectedRows: true },
      });
      if (!importRun) {
        traceability = "PASS_WITH_REVIEW";
        issues.push("successful_import_run_not_found");
      } else {
        const expectedImportedRows = syncResult.inserted + syncResult.updated;
        if (importRun.importedRows !== expectedImportedRows) {
          traceability = "PASS_WITH_REVIEW";
          issues.push("successful_import_run_count_mismatch");
        }
        if (importRun.rejectedRows !== 0) {
          traceability = "PASS_WITH_REVIEW";
          issues.push("successful_import_run_contains_rejections");
        }
      }
    }

    if (preflight.canonicalPlan) {
      const targetRead = await loadCanonicalTargetStates(
        preflight.canonicalPlan.items.map((item) => item.record),
      );
      const worksheetProvenanceEntities = new Set([
        "biomass_consumption",
        "biomass_receipt",
        "coal_receipt",
        "solar_consumption",
        "solar_receipt",
        "hop_reading",
        "biomass_target",
        "biomass_cumulative",
      ]);
      const cellProvenanceEntities = new Set([
        "biomass_consumption",
        "biomass_receipt",
        "coal_receipt",
        "solar_consumption",
        "solar_receipt",
        "hop_reading",
        "biomass_cumulative",
      ]);
      const statesByKey = new Map(
        targetRead.states.map((state) => [state.businessIdentity.canonicalKey, state]),
      );
      for (const item of preflight.canonicalPlan.items) {
        const state = statesByKey.get(item.businessKey);
        if (!state) continue;
        const source = item.record.source;
        if (
          worksheetProvenanceEntities.has(item.record.entity) &&
          state.provenance.worksheetTitle.trim().toLocaleLowerCase("en-US") !==
            source.worksheetTitleSnapshot.trim().toLocaleLowerCase("en-US")
        ) {
          issues.push("target_worksheet_provenance_mismatch");
          databaseVerification = "FAIL";
          targetReconciliation = "FAIL";
        }
        if (
          cellProvenanceEntities.has(item.record.entity) &&
          state.provenance.sourceCell.trim().toLocaleUpperCase("en-US") !==
            (source.cellAddress ?? "").trim().toLocaleUpperCase("en-US")
        ) {
          issues.push("target_cell_provenance_mismatch");
          databaseVerification = "FAIL";
          targetReconciliation = "FAIL";
        }
        if (
          worksheetProvenanceEntities.has(item.record.entity) &&
          state.provenance.importRunId === "NOT AVAILABLE"
        ) {
          issues.push("target_import_run_provenance_missing");
          databaseVerification = "FAIL";
          targetReconciliation = "FAIL";
        }
      }
      const targetResult = reconcileCanonicalTargetStates(
        preflight.canonicalPlan,
        targetRead.states,
      );
      if (targetResult.status !== "RECONCILED") {
        targetReconciliation = "FAIL";
        databaseVerification = "FAIL";
        issues.push(
          `RECONCILIATION_MISMATCH:${targetResult.blockers.join(",") || "target_state"}`,
        );
      } else {
        if (targetReconciliation !== "FAIL") targetReconciliation = "PASS";
      }
    }
  } catch {
    databaseVerification = "FAIL";
    if (targetReconciliation === "NOT_VERIFIED") targetReconciliation = "FAIL";
    if (ledgerVerification === "NOT_VERIFIED" && process.env.CANONICAL_IMPORT_LEDGER_ENABLED === "true") ledgerVerification = "FAIL";
    issues.push("post_write_database_verification_failed");
  }

  const worksheetStatus =
    databaseVerification === "PASS" ? "PASS" : "FAIL";
  const status =
    worksheetStatus === "PASS" && traceability === "PASS" &&
    targetReconciliation !== "FAIL" && issues.length === 0
      ? "PASS"
      : "PASS_WITH_REVIEW";
  return {
    status,
    worksheet: worksheetStatus,
    recordsRead: preflight.executionPlan.stagingRows.length,
    recordsValid: preflight.executionPlan.stagingRows.filter(
      (row) => row.validationStatus !== "REJECTED",
    ).length,
    recordsInserted: syncResult.inserted,
    recordsUpdated: syncResult.updated,
    recordsSkipped: syncResult.skipped,
    duplicatesCreated:
      databaseVerification === "PASS" ? 0 : "NOT_VERIFIED",
    databaseVerification,
    traceability,
    ledgerVerification,
    targetReconciliation,
    issues: [...new Set(issues)],
  };
}
