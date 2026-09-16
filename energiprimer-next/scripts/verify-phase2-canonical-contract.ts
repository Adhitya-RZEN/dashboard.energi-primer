import assert from "node:assert/strict";

import {
  BB_CANONICAL_MAPPING_CONTRACT,
  assertApprovedMappingForWrite,
  createMappingProposal,
} from "@/services/google-sheets/canonical/mapping-contract";
import {
  createSourceManifest,
  assertWritableSourceManifest,
} from "@/services/google-sheets/canonical/source-manifest";
import {
  buildCanonicalImportPlan,
  approveCanonicalImportPlan,
  assertCanonicalImportPlanIntegrity,
} from "@/services/google-sheets/canonical/import-plan";
import {
  createCanonicalRecord,
  type CanonicalRecordInput,
} from "@/services/google-sheets/canonical/domain";
import {
  businessIdentityForRecord,
  contentHashForRecord,
  sourceOccurrenceKeyForRecord,
} from "@/services/google-sheets/canonical/identity";
import {
  reconcileCanonicalPlan,
  reconcileCanonicalRowState,
  type ObservedCanonicalPlanItem,
} from "@/services/google-sheets/canonical/reconciliation";
import {
  commitApprovedCanonicalPlan,
  type CanonicalBatchRepository,
} from "@/services/google-sheets/canonical/commit";
import {
  classifyRecoveryFailure,
  decideBatchRecovery,
  transitionLifecycle,
} from "@/services/google-sheets/canonical/recovery";
import { validateSourceObservation } from "@/services/google-sheets/canonical/provenance";
import { parseCanonicalDate } from "@/services/google-sheets/canonical/date";
import { parseCanonicalNumericValue } from "@/services/google-sheets/canonical/numeric";
import { canonicalRecordsFromImportPlan } from "@/services/google-sheets/canonical/from-import-plan";
import type { GoogleSheetsImportPlan } from "@/services/google-sheets/import/types";
import type {
  CanonicalRecord,
  SourceObservation,
} from "@/services/google-sheets/canonical/types";
import {
  phase2DateFixtures,
  phase2LayoutFixtures,
  phase2NumericFixtures,
} from "./fixtures/phase2-canonical-fixtures";

function observation(input: {
  sourceKey?: string;
  spreadsheetId?: string;
  sheetId?: string;
  worksheetTitle?: string;
  cellAddress?: string | null;
  row?: number | null;
  column?: number | null;
  rawDisplayValue?: string | null;
  normalizedValue?: string | number | null;
} = {}): SourceObservation {
  return {
    importRunId: null,
    sourceKey: input.sourceKey ?? "source-workbook-1",
    spreadsheetId: input.spreadsheetId ?? "spreadsheet-1",
    sheetId: input.sheetId === undefined ? "sheet-7" : input.sheetId,
    worksheetTitleSnapshot: input.worksheetTitle ?? "Juli26-BB",
    effectivePeriod: { month: 7, year: 2026 },
    sourceRange: "A1:ZZ500",
    cellAddress: input.cellAddress === undefined ? "T11" : input.cellAddress,
    row: input.row === undefined ? 11 : input.row,
    column: input.column === undefined ? 20 : input.column,
    rawDisplayValue: input.rawDisplayValue === undefined ? "1.250,50" : input.rawDisplayValue,
    normalizedValue: input.normalizedValue === undefined ? 1250.5 : input.normalizedValue,
    observationKind: "SOURCE_CELL",
    granularity: "CELL",
    mappingVersion: "BB_CANONICAL_V1@1",
    schemaVersion: "semantic-schema-v1",
    parserVersion: "dynamic-parser-v1",
    observedAt: "2026-09-15T00:00:00.000Z",
  };
}

function biomassRecord(overrides: Partial<CanonicalRecordInput<"biomass_consumption">> = {}) {
  return createCanonicalRecord({
    entity: "biomass_consumption",
    value: {
      unitNumber: 1,
      readingDate: "2026-07-01",
      quantityTon: 1250.5,
    },
    grain: "unit-day",
    source: observation(),
    validation: {
      status: "VALID",
      errors: [],
      warnings: [],
      confidence: 1,
      periodValid: true,
      typeValid: true,
      identityValid: true,
      provenanceComplete: true,
    },
    ...overrides,
  });
}

const manifest = createSourceManifest({
  sourceKey: "source-workbook-1",
  spreadsheetId: "spreadsheet-1",
  sheetId: "sheet-7",
  worksheetTitle: "Juli26-BB",
  effectivePeriod: { month: 7, year: 2026 },
  sourceType: "GOOGLE_SHEETS",
  mappingProfile: "BB_CANONICAL_V1",
  mappingVersion: "BB_CANONICAL_V1@1",
    schemaVersion: "semantic-schema-v1",
  parserVersion: "dynamic-parser-v1",
  sourceRange: "A1:ZZ500",
  approvalState: "APPROVED",
  ownership: {
    authority: "GOOGLE_SHEETS",
    ownerRef: "bb-operations",
    sourcePrecedence: null,
  },
  status: "ACTIVE",
  observedAt: "2026-09-15T00:00:00.000Z",
});

assertWritableSourceManifest(manifest);
const renamedManifest = createSourceManifest({
  ...manifest,
  worksheetTitle: "Juli 26-BB",
});
assert.equal(renamedManifest.sourceKey, manifest.sourceKey);
assert.equal(renamedManifest.sheetId, manifest.sheetId);
assert.notEqual(renamedManifest.normalizedWorksheetTitle, manifest.normalizedWorksheetTitle);
assert.equal(renamedManifest.worksheetTitleSnapshot, "Juli 26-BB");
assertApprovedMappingForWrite(BB_CANONICAL_MAPPING_CONTRACT, [
  "biomass_consumption.quantityTon",
]);
assert.equal(createMappingProposal({
  field: "biomass_consumption.quantityTon",
  sourceKind: "SEMANTIC_PATH",
  evidence: "heuristic candidate",
}).writable, false);
assert.throws(
  () => assertApprovedMappingForWrite(createMappingProposal({
    field: "biomass_consumption.quantityTon",
    sourceKind: "SEMANTIC_PATH",
    evidence: "heuristic candidate",
  }) as never, ["biomass_consumption.quantityTon"]),
  /approval is required/i,
);

for (const fixture of phase2NumericFixtures) {
  const parsed = parseCanonicalNumericValue(fixture.raw);
  assert.equal(parsed.status, fixture.expectedStatus, `numeric fixture ${fixture.raw}`);
  assert.equal(parsed.value, fixture.expectedValue, `numeric value ${fixture.raw}`);
}
for (const fixture of phase2DateFixtures) {
  const parsed = parseCanonicalDate(fixture.raw, {
    month: "month" in fixture ? fixture.month : undefined,
    year: "year" in fixture ? fixture.year : undefined,
    locale: "locale" in fixture ? fixture.locale : undefined,
  });
  assert.equal(parsed.status, fixture.expectedStatus, `date fixture ${fixture.raw}`);
  assert.equal(parsed.value, fixture.expectedValue, `date value ${fixture.raw}`);
}
assert.equal(phase2LayoutFixtures.length, 6);
assert.ok(phase2LayoutFixtures.some((fixture) => fixture.expected === "BLOCK"));

const first = biomassRecord();
const moved = biomassRecord({ source: observation({ cellAddress: "T19", row: 19 }) });
assert.equal(businessIdentityForRecord(first).canonicalKey, businessIdentityForRecord(moved).canonicalKey);
assert.equal(contentHashForRecord(first), contentHashForRecord(moved));
assert.notEqual(sourceOccurrenceKeyForRecord(first), sourceOccurrenceKeyForRecord(moved));

const changed = biomassRecord({
  value: { ...first.value, quantityTon: 1251.5 },
  source: observation({ rawDisplayValue: "1.251,50", normalizedValue: 1251.5 }),
});
assert.equal(businessIdentityForRecord(first).canonicalKey, businessIdentityForRecord(changed).canonicalKey);
assert.equal(sourceOccurrenceKeyForRecord(first), sourceOccurrenceKeyForRecord(changed));
assert.notEqual(contentHashForRecord(first), contentHashForRecord(changed));
assert.equal(first.source.rawDisplayValue, "1.250,50");
assert.equal(first.source.normalizedValue, 1250.5);
const renamedRecord = biomassRecord({
  source: observation({ worksheetTitle: "Juli 26-BB" }),
});
assert.equal(businessIdentityForRecord(first).canonicalKey, businessIdentityForRecord(renamedRecord).canonicalKey);
assert.equal(sourceOccurrenceKeyForRecord(first), sourceOccurrenceKeyForRecord(renamedRecord));
assert.notEqual(first.sourceIdentity.worksheetTitleSnapshot, renamedRecord.sourceIdentity.worksheetTitleSnapshot);

const aggregate = observation({
  cellAddress: null,
  row: null,
  column: null,
  rawDisplayValue: "3.750,00",
  normalizedValue: 3750,
});
const aggregateValidation = validateSourceObservation({
  ...aggregate,
  observationKind: "SOURCE_RANGE",
  granularity: "RANGE",
  rawDisplayValues: [{ address: "T11", value: "1.250,50" }],
});
assert.equal(aggregateValidation.valid, true);
const policyFallbackValidation = validateSourceObservation({
  ...observation({ cellAddress: null, row: null, column: null, rawDisplayValue: null }),
  observationKind: "POLICY_FALLBACK",
  granularity: "WORKSHEET",
});
assert.equal(policyFallbackValidation.valid, true);
assert.equal(validateSourceObservation({ ...aggregate, rawDisplayValue: null }).valid, false);
const incompleteProvenanceRecord = biomassRecord({
  source: observation({ rawDisplayValue: null }),
});
assert.equal(incompleteProvenanceRecord.validation.status, "BLOCKED");
assert.ok(incompleteProvenanceRecord.validation.errors.includes("PROVENANCE_ERROR"));

const plan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "import-run-1",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [first],
    existing: [],
  }),
);
assert.equal(plan.approvalState, "APPROVED");
assert.equal(plan.items[0]?.operation, "INSERT");
assert.equal(plan.items[0]?.sourceProvenance.importRunId, "import-run-1");
assert.equal(plan.planHash.length, 64);
assert.equal(Object.isFrozen(plan), true);
assertCanonicalImportPlanIntegrity(plan);
assert.throws(() => {
  (plan.items as unknown as unknown[]).push(first);
}, /extensible|read only/i);

const compatibleImportPlan = {
  requested: { month: 7, year: 2026, worksheet: "Juli26-BB" },
  effective: { month: 7, year: 2026, worksheet: "Juli26-BB" },
  sourceRange: "A1:ZZ500",
  status: "READY_FOR_IMPORT",
  blockingIssues: [],
  warnings: [],
  requestedPeriod: new Date("2026-07-01T00:00:00.000Z"),
  effectivePeriod: new Date("2026-07-01T00:00:00.000Z"),
  receiptRows: [],
  coalReceiptRows: [],
  coalConsumptionRows: [],
  coalStockRows: [],
  biomassConsumptionRows: [{
    readingDate: new Date("2026-07-01T00:00:00.000Z"),
    unitNumber: 1,
    quantityTon: 1250.5,
    source: {
      worksheet: "Juli26-BB",
      cell: "T11",
      row: 11,
      column: 20,
      rawDisplayValue: "1.250,50",
      observationKind: "SOURCE_CELL",
      mappingAuthorization: "APPROVED_STRUCTURAL",
    },
  }],
  solarConsumptionRows: [],
  solarReceiptRows: [],
  hopRows: [],
  targetRows: [],
  cumulativeRows: [],
  stagingRows: [],
  summary: {
    dailyRows: 1,
    receiptRows: 0,
    coalReceiptRows: 0,
    coalConsumptionRows: 0,
    coalStockRows: 0,
    biomassConsumptionRows: 1,
    solarConsumptionRows: 0,
    solarReceiptRows: 0,
    hopRows: 0,
    targetRows: 0,
    cumulativeRows: 0,
    totalRows: 0,
  },
} satisfies GoogleSheetsImportPlan;
const canonicalFromCompatibility = canonicalRecordsFromImportPlan({
  plan: compatibleImportPlan,
  sourceManifest: manifest,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
});
assert.equal(canonicalFromCompatibility.length, 1);
assert.equal(canonicalFromCompatibility[0]?.source.rawDisplayValue, "1.250,50");

class MemoryRepository implements CanonicalBatchRepository {
  readonly committed = new Map<string, ObservedCanonicalPlanItem>();
  readonly batchSizes: number[] = [];

  async commitBatch(items: readonly CanonicalRecord[], planHash: string) {
    this.batchSizes.push(items.length);
    const observed: ObservedCanonicalPlanItem[] = [];
    for (const record of items) {
      const key = businessIdentityForRecord(record).canonicalKey;
      const existing = this.committed.get(key);
      const operation = existing
        ? existing.contentHash === contentHashForRecord(record)
          ? "SKIP"
          : "UPDATE"
        : "INSERT";
      const item = {
        planHash,
        entity: record.entity,
        businessIdentity: businessIdentityForRecord(record),
        contentHash: contentHashForRecord(record),
        sourceOccurrenceKey: sourceOccurrenceKeyForRecord(record),
        operation,
      } satisfies ObservedCanonicalPlanItem;
      this.committed.set(key, item);
      observed.push(item);
    }
    return observed;
  }
}

const repository = new MemoryRepository();
const firstCommit = await commitApprovedCanonicalPlan(plan, repository);
assert.equal(firstCommit.status, "COMMITTED");
assert.equal(firstCommit.operationCounts.INSERT, 1);
const secondCommit = await commitApprovedCanonicalPlan(plan, repository);
assert.equal(secondCommit.status, "COMMITTED");
assert.equal(secondCommit.operationCounts.SKIP, 1);

const knownFailureCommit = await commitApprovedCanonicalPlan(plan, {
  async commitBatch() {
    throw new Error("known validation failure");
  },
});
assert.equal(knownFailureCommit.status, "FAILED");
assert.equal(knownFailureCommit.recovery?.retry, "EXACT_SCOPE_AFTER_KNOWN_ROLLBACK");
const unknownOutcomeCommit = await commitApprovedCanonicalPlan(plan, {
  async commitBatch() {
    throw new Error("P2028 transaction already closed");
  },
});
assert.equal(unknownOutcomeCommit.status, "RECONCILIATION_REQUIRED");
assert.equal(unknownOutcomeCommit.recovery?.retry, "RECONCILE_FIRST");

const largeRecords = Array.from({ length: 201 }, (_, index) =>
  createCanonicalRecord({
    entity: "biomass_receipt",
    value: {
      periodStart: "2026-07-01",
      supplierCode: `fixture-supplier-${index + 1}`,
      supplierName: `Fixture Supplier ${index + 1}`,
      quantityTon: 1,
    },
    grain: "supplier-period",
    source: observation({
      cellAddress: `T${index + 1}`,
      row: index + 1,
      rawDisplayValue: "1",
      normalizedValue: 1,
    }),
    validation: {
      status: "VALID",
      errors: [],
      warnings: [],
      confidence: 1,
      periodValid: true,
      typeValid: true,
      identityValid: true,
      provenanceComplete: true,
    },
  }),
);
const largePlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "import-run-large",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: largeRecords,
    existing: [],
  }),
);
const largeRepository = new MemoryRepository();
const largeCommit = await commitApprovedCanonicalPlan(largePlan, largeRepository);
assert.equal(largeCommit.status, "COMMITTED");
assert.deepEqual(largeRepository.batchSizes, [200, 1]);
assert.equal(largeCommit.batchesTotal, 2);

const updatePlan = approveCanonicalImportPlan(
  buildCanonicalImportPlan({
    importRunId: "import-run-2",
    sourceManifest: manifest,
    mapping: BB_CANONICAL_MAPPING_CONTRACT,
    records: [changed],
    existing: [{
      businessIdentity: businessIdentityForRecord(first),
      contentHash: contentHashForRecord(first),
      sourceIdentity: first.sourceIdentity,
    }],
  }),
);
assert.equal(updatePlan.items[0]?.operation, "UPDATE");

const duplicatePlan = buildCanonicalImportPlan({
  importRunId: "import-run-duplicate",
  sourceManifest: manifest,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
  records: [first, moved],
  existing: [],
});
assert.equal(duplicatePlan.operationCounts.BLOCK, 2);
assert.throws(() => approveCanonicalImportPlan(duplicatePlan), /blocked/i);

const otherSource = createSourceManifest({
  ...manifest,
  sourceKey: "source-workbook-2",
  spreadsheetId: "spreadsheet-2",
  sheetId: "sheet-7-other",
  ownership: { ...manifest.ownership, sourcePrecedence: null },
});
const otherSourceRecord = biomassRecord({
  source: observation({
    sourceKey: "source-workbook-2",
    spreadsheetId: "spreadsheet-2",
    sheetId: "sheet-7-other",
  }),
});
const ownershipConflictPlan = buildCanonicalImportPlan({
  importRunId: "import-run-conflict",
  sourceManifest: otherSource,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
  records: [otherSourceRecord],
  existing: [{
    businessIdentity: businessIdentityForRecord(first),
    contentHash: contentHashForRecord(first),
    sourceIdentity: first.sourceIdentity,
  }],
});
assert.equal(ownershipConflictPlan.items[0]?.operation, "BLOCK");
assert.ok(ownershipConflictPlan.blockingIssues.includes("IDENTITY_CONFLICT"));
const precedenceManifest = createSourceManifest({
  ...otherSource,
  ownership: {
    ...otherSource.ownership,
    sourcePrecedence: ["source-workbook-2", "source-workbook-1"],
  },
});
const precedencePlan = buildCanonicalImportPlan({
  importRunId: "import-run-precedence",
  sourceManifest: precedenceManifest,
  mapping: BB_CANONICAL_MAPPING_CONTRACT,
  records: [otherSourceRecord],
  existing: [{
    businessIdentity: businessIdentityForRecord(first),
    contentHash: contentHashForRecord(first),
    sourceIdentity: first.sourceIdentity,
  }],
});
assert.equal(precedencePlan.items[0]?.operation, "SKIP");

const observed = [...repository.committed.values()];
const reconciliation = reconcileCanonicalPlan(plan, observed);
assert.equal(reconciliation.status, "RECONCILED");
assert.equal(reconciliation.duplicateCount, 0);
const duplicateReconciliation = reconcileCanonicalPlan(plan, [...observed, observed[0]!]);
assert.equal(duplicateReconciliation.status, "RECONCILIATION_REQUIRED");
assert.equal(duplicateReconciliation.duplicateCount, 1);
assert.equal(reconcileCanonicalPlan(plan, []).status, "RECONCILIATION_REQUIRED");
const rowStateReconciliation = reconcileCanonicalRowState(plan, []);
assert.equal(rowStateReconciliation.status, "RECONCILIATION_REQUIRED");
assert.ok(rowStateReconciliation.blockers.includes("MISSING_ROW_STATE"));
const rowStateComplete = reconcileCanonicalRowState(plan, [{
  businessKey: plan.items[0]!.businessKey,
  contentHash: plan.items[0]!.contentHash,
  sourceOccurrenceKey: plan.items[0]!.record.sourceOccurrenceKey,
}]);
assert.equal(rowStateComplete.status, "RECONCILED");

assert.equal(classifyRecoveryFailure(new Error("P2028 transaction already closed")).status, "RECONCILIATION_REQUIRED");
assert.equal(classifyRecoveryFailure(new Error("known validation failure")).status, "FAILED");
assert.equal(decideBatchRecovery("UNKNOWN").retryAllowed, false);
assert.equal(decideBatchRecovery("ABSENT").status, "RESUME_MISSING_BATCH");
assert.equal(transitionLifecycle("PLANNED", "APPROVED"), "APPROVED");
assert.throws(() => transitionLifecycle("COMMITTED", "APPROVED"), /invalid lifecycle transition/i);

console.log(JSON.stringify({
  status: "PASS",
  mode: "PHASE2_CANONICAL_CONTRACT_FIXTURES",
  productionWrites: 0,
  planHash: plan.planHash,
  firstCommit,
  secondCommit,
  reconciliation,
}, null, 2));
