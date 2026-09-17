import { prepareWorksheetPreflight } from "../src/services/google-sheets/sync/preflight";

const preflight = await prepareWorksheetPreflight({
  worksheet: "Juli26-BB",
  canary: true,
});

console.log(JSON.stringify({
  status: preflight.status,
  mode: "PHASE6_JULI_CANARY_READ_ONLY",
  worksheet: preflight.worksheet.effective,
  sourceRange: preflight.sourceRange,
  sourceRecords: preflight.canary.sourceRecords,
  selectedRecords: preflight.canary.selectedRecords,
  scopeId: preflight.canary.scopeId,
  worksheetRegistry: preflight.worksheet,
  mapping: preflight.mapping,
  validation: preflight.validation,
  canonicalPlanError: preflight.canonicalPlanError,
  targetState: preflight.targetState,
  targetDiff: preflight.targetDiff,
  plan: preflight.canonicalPlan
    ? {
        planId: preflight.canonicalPlan.planId,
        planHash: preflight.canonicalPlan.planHash,
        approvalState: preflight.canonicalPlan.approvalState,
        operationCounts: preflight.canonicalPlan.operationCounts,
        blockingIssues: preflight.canonicalPlan.blockingIssues,
        records: preflight.canonicalPlan.items.map((item) => ({
          entity: item.record.entity,
          identity: item.businessIdentity.keyFields,
          operation: item.operation,
          source: {
            worksheet: item.sourceProvenance.worksheetTitleSnapshot,
            range: item.sourceProvenance.sourceRange,
            cell: item.sourceProvenance.cellAddress,
            row: item.sourceProvenance.row,
            column: item.sourceProvenance.column,
            canonicalField: item.record.mappingFields,
            rawDisplayValue: item.sourceProvenance.rawDisplayValue,
            observationKind: item.sourceProvenance.observationKind,
          },
        })),
      }
    : null,
  googleSheetsWrites: 0,
  databaseWrites: 0,
}, null, 2));
