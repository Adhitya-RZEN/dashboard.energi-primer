import assert from "node:assert/strict";

import {
  JULI26_CANARY_DATE,
  JULI26_CANARY_PERIOD_START,
  JULI26_CANARY_SCOPE_ID,
  selectJuliCanaryRecords,
} from "../src/services/google-sheets/sync/juli-canary-scope";
import { canonicalLedgerPlanSnapshot } from "../src/services/google-sheets/canonical/ledger";
import {
  resolveJuli26TargetProvenance,
  classifyCanonicalTargetDiff,
  comparableTargetValues,
  existingCanonicalStateForTargetState,
  targetValuesMatch,
  type CanonicalTargetState,
} from "../src/services/google-sheets/canonical/target-state";
import { mappingFieldsForEntity } from "../src/services/google-sheets/canonical/mapping-contract";
import {
  businessIdentityForValue,
  contentHashForRecord,
} from "../src/services/google-sheets/canonical/identity";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseControlledImportRequest } from "../src/services/google-sheets/sync/operator-contract";
import type { CanonicalRecord } from "../src/services/google-sheets/canonical/types";

function record(
  entity: CanonicalRecord["entity"],
  value: Record<string, unknown>,
  source: Partial<CanonicalRecord["source"]> = {},
) {
  return {
    entity,
    value,
    businessIdentity: {
      entity,
      keyFields: {},
      canonicalKey: `${entity}:${JSON.stringify(value)}`,
      scope: "plant",
    },
    source: {
      worksheetTitleSnapshot: "Juli26-BB",
      sourceKey: "source-key",
      spreadsheetId: "spreadsheet-id",
      sheetId: "1692973815",
      sourceRange: "A1:ZZ500",
      observationKind: "SOURCE_CELL",
      granularity: "CELL",
      mappingAuthorization: "APPROVED_EXACT",
      mappingSourceKind: "SEMANTIC_PATH",
      rawDisplayValue: "1",
      ...source,
    },
    mappingFields: mappingFieldsForEntity(entity),
    sourceOccurrenceKey: `${entity}:${JSON.stringify(value)}`,
  } as unknown as CanonicalRecord;
}

const records: CanonicalRecord[] = [
  ...[1, 2, 3].map((unitNumber, index) => record("biomass_consumption", {
    unitNumber,
    readingDate: JULI26_CANARY_DATE,
    quantityTon: unitNumber,
  }, { cellAddress: ["T41", "W41", "Z41"][index], row: 41, column: [20, 23, 26][index] })),
  ...[1, 2, 3].map((unitNumber, index) => record("coal_consumption", {
    unitNumber,
    readingDate: JULI26_CANARY_DATE,
    quantityTon: unitNumber,
  }, { cellAddress: ["S41", "V41", "Y41"][index], row: 41, column: [19, 22, 25][index] })),
  record("coal_stock", {
    stockScope: "plant",
    readingDate: JULI26_CANARY_DATE,
    closingStock: 1,
    consumed: 1,
  }, { cellAddress: "AD41", row: 41, column: 30 }),
  ...[
    "sawdust-pt-syahroni",
    "sawdust-pt-bintang",
    "woodchip-pt-syahroni",
    "woodchip-pt-rap",
    "woodchip-cv-multi-paketindo",
    "lruk",
    "srf",
  ].map((supplierCode, index) =>
    record("biomass_receipt", {
      periodStart: JULI26_CANARY_PERIOD_START,
      supplierCode,
      supplierName: supplierCode,
      quantityTon: 1,
    }, { cellAddress: ["J42", "K42", "L42", "M42", "N42", "P42", "Q42"][index], row: 42, column: [10, 11, 12, 13, 14, 16, 17][index] })),
  record("coal_receipt", {
    periodStart: JULI26_CANARY_PERIOD_START,
    quantityTon: 1,
  }, { cellAddress: "Y60", row: 60, column: 25 }),
  record("solar_consumption", {
    readingDate: JULI26_CANARY_DATE,
    quantityLiter: 1,
  }, { cellAddress: "CJ41", row: 41, column: 88 }),
  record("solar_receipt", {
    periodStart: JULI26_CANARY_PERIOD_START,
    quantityLiter: 1,
  }, { cellAddress: "Y69", row: 69, column: 25 }),
  ...[1, 2, 3].map((unitNumber, index) => record("hop_reading", {
    unitNumber,
    readingDate: JULI26_CANARY_DATE,
    hopDays: unitNumber,
  }, { cellAddress: ["AL41", "AK41", "AJ41"][index], row: 41, column: [38, 37, 36][index] })),
  record("biomass_target", { targetYear: 2026, targetTon: 70020 }, {
    cellAddress: "CO56",
    row: 56,
    column: 93,
    rawDisplayValue: "  70.020 ",
  }),
  record("biomass_cumulative", {
    periodStart: JULI26_CANARY_PERIOD_START,
    cumulativeTon: 1,
  }, { cellAddress: "Y71", row: 71, column: 25 }),
];

assert.equal(JULI26_CANARY_SCOPE_ID, "Juli26-BB_FINAL_DAY_AND_AGGREGATES_V1");
assert.equal(selectJuliCanaryRecords(records, "Juli26-BB").length, 22);
assert.throws(
  () => selectJuliCanaryRecords(records, "April26-BB"),
  /worksheet/u,
);
assert.throws(
  () => selectJuliCanaryRecords(records.slice(0, -1), "Juli26-BB"),
  /shape/u,
);
assert.throws(
  () => selectJuliCanaryRecords([
    ...records,
    record("biomass_consumption", {
      unitNumber: 1,
      readingDate: JULI26_CANARY_DATE,
      quantityTon: 1,
    }, { cellAddress: "T41", row: 41, column: 20 }),
  ], "Juli26-BB"),
  /shape/u,
);

const targetRecord = records.find((item) => item.entity === "biomass_target")!;
const targetState = {
  entity: "biomass_target",
  targetModel: "biomass_targets",
  businessIdentity: { entity: "biomass_target", keyFields: { targetYear: 2026 }, canonicalKey: "target", scope: "plant" },
  existence: "PRESENT",
  matchedRowCount: 1,
  canonicalValue: targetRecord.value,
  values: { targetTon: 70020 },
  provenance: {
    authority: "GOOGLE_SHEETS",
    sourceKey: "NOT AVAILABLE",
    spreadsheetId: "NOT AVAILABLE",
    sheetId: "NOT AVAILABLE",
    worksheetTitle: "April26-BB",
    sourceCell: "NOT AVAILABLE",
    importRunId: "12",
    conflict: true,
  },
  lastKnownSyncState: "NOT AVAILABLE",
  lastSyncAt: "NOT AVAILABLE",
  versionMarker: "version",
  targetId: "1",
  blockingIssues: [],
} as unknown as CanonicalTargetState;
const resolvedTargetState = resolveJuli26TargetProvenance(targetRecord, targetState);
assert.equal(resolvedTargetState.provenance.conflict, false);
assert.equal(
  resolvedTargetState.provenance.worksheetTitle,
  "April26-BB",
);
const alreadyResolvedTargetState = {
  ...resolvedTargetState,
  provenance: {
    ...resolvedTargetState.provenance,
    worksheetTitle: "Juli26-BB",
    importRunId: "15",
    conflict: false,
  },
} as unknown as CanonicalTargetState;
assert.equal(
  resolveJuli26TargetProvenance(targetRecord, alreadyResolvedTargetState)
    .provenance.worksheetTitle,
  "Juli26-BB",
);
assert.throws(
  () => resolveJuli26TargetProvenance(
    record("biomass_target", { targetYear: 2026, targetTon: 70019 }, {
      cellAddress: "CO56",
      row: 56,
      column: 93,
      rawDisplayValue: "70.019",
    }),
    targetState,
  ),
  /rejected/u,
);

const resolvedTargetRecord = {
  ...targetRecord,
  businessIdentity: targetState.businessIdentity,
  sourceIdentity: {
    sourceKey: "source-key",
    spreadsheetId: "spreadsheet-id",
    sheetId: "sheet-id",
    worksheetTitleSnapshot: "Juli26-BB",
    sourceOccurrenceKey: "occurrence",
    mappingVersion: "BB_CANONICAL_V1@1",
    schemaVersion: "semantic-schema-v1",
  },
  mappingFields: ["biomass_target.targetTon"],
  mappingVersion: "BB_CANONICAL_V1@1",
  schemaVersion: "semantic-schema-v1",
  parserVersion: "dynamic-parser-v1",
  contentHash: "content",
  sourceOccurrenceKey: "occurrence",
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
} as unknown as CanonicalRecord;
const provenanceUpdateState = {
  ...resolvedTargetState,
  businessIdentity: resolvedTargetRecord.businessIdentity,
  canonicalValue: resolvedTargetRecord.value,
};
assert.equal(
  classifyCanonicalTargetDiff(resolvedTargetRecord, provenanceUpdateState).operation,
  "UPDATE",
);
assert.equal(
  existingCanonicalStateForTargetState(resolvedTargetRecord, provenanceUpdateState)?.sourceIdentity.worksheetTitleSnapshot,
  "April26-BB",
);
assert.equal(
  targetValuesMatch(
    comparableTargetValues({
      entity: "coal_consumption",
      value: { quantityTon: 512.706 },
    } as never),
    { quantityTon: 512.71 },
  ),
  true,
);
assert.equal(
  targetValuesMatch(
    comparableTargetValues({
      entity: "coal_stock",
      value: { closingStock: 19450.473, consumed: 1469.779 },
    } as never),
    { closingStock: 19450.47, consumed: 1469.78 },
  ),
  true,
);
const coalRecord = record("coal_consumption", {
  unitNumber: 1,
  readingDate: JULI26_CANARY_DATE,
  quantityTon: 512.706,
}, { cellAddress: "S41", row: 41, column: 19 });
coalRecord.businessIdentity = businessIdentityForValue(
  "coal_consumption",
  coalRecord.value as never,
  "plant",
);
const coalState = {
  entity: "coal_consumption",
  targetModel: "coal_consumption",
  businessIdentity: coalRecord.businessIdentity,
  existence: "PRESENT",
  matchedRowCount: 1,
  canonicalValue: {
    unitNumber: 1,
    readingDate: JULI26_CANARY_DATE,
    quantityTon: 512.71,
  },
  values: { quantityTon: 512.71 },
  provenance: {
    authority: "GOOGLE_SHEETS",
    sourceKey: "NOT AVAILABLE",
    spreadsheetId: "NOT AVAILABLE",
    sheetId: "NOT AVAILABLE",
    worksheetTitle: "Juli26-BB",
    sourceCell: "NOT AVAILABLE",
    importRunId: "15",
    conflict: false,
  },
  lastKnownSyncState: "NOT AVAILABLE",
  lastSyncAt: "NOT AVAILABLE",
  versionMarker: "version",
  targetId: "1",
  blockingIssues: [],
} as unknown as CanonicalTargetState;
assert.equal(
  existingCanonicalStateForTargetState(coalRecord, coalState)?.contentHash,
  contentHashForRecord(coalRecord),
);

const snapshotPlan = {
  planId: "a".repeat(64),
  planHash: "a".repeat(64),
  importRunId: "fixture-run",
  sourceManifest: {} as never,
  mappingProfile: "fixture",
  mappingVersion: "fixture",
  schemaVersion: "fixture",
  parserVersion: "fixture",
  items: [{
    itemId: "item",
    record: {
      source: { observedAt: "2026-09-17T00:00:00.000Z" },
    },
    businessIdentity: {},
    typedValue: {},
    sourceProvenance: { observedAt: "2026-09-17T00:00:00.000Z" },
    contentHash: "content",
    validationResult: {},
    operation: "SKIP",
    blockingIssues: [],
  }],
} as never;
const laterSnapshotPlan = JSON.parse(JSON.stringify(snapshotPlan).replaceAll(
  "2026-09-17T00:00:00.000Z",
  "2026-09-17T00:01:00.000Z",
));
assert.equal(
  canonicalLedgerPlanSnapshot(snapshotPlan),
  canonicalLedgerPlanSnapshot(laterSnapshotPlan),
);

const parsedRequest = parseControlledImportRequest({
  action: "execute-import",
  worksheet: "Juli26-BB",
  importPlanId: "a".repeat(64),
  canary: true,
});
assert.equal(parsedRequest.canary, true);
assert.throws(
  () => parseControlledImportRequest({
    action: "execute-import",
    worksheet: "Juli26-BB",
    importPlanId: "a".repeat(64),
    canary: false,
  }),
  /canary/u,
);

const engineSource = readFileSync(fileURLToPath(new URL(
  "../src/services/google-sheets/sync/engine.ts",
  import.meta.url,
)), "utf8");
const commitSource = readFileSync(fileURLToPath(new URL(
  "../src/services/google-sheets/import/commit.ts",
  import.meta.url,
)), "utf8");
assert.match(engineSource, /assertProductionJuliCanaryScope/u);
assert.match(engineSource, /CANARY_SCOPED_DISCOVERY_SKIPPED/u);
assert.match(commitSource, /options\.canary !== true/u);

console.log(JSON.stringify({
  status: "PASS",
  mode: "PHASE6_JULI_CANARY_CONTRACT_FIXTURES",
  canaryScope: 22,
  productionWrites: 0,
}));
