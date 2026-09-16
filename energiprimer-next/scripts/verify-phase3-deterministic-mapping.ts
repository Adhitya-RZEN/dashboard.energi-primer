import assert from "node:assert/strict";

import { resolveAnchorValue } from "@/services/google-sheets/dynamic/value-resolver";
import {
  approvedLegacyMappingContracts,
  approvedMappingContractForWorksheet,
} from "@/services/google-sheets/canonical/mapping-profiles";
import { buildApprovedCanonicalPlanForCompatibility } from "@/services/google-sheets/canonical/compatibility";
import { canonicalRecordsFromImportPlan } from "@/services/google-sheets/canonical/from-import-plan";
import {
  assertApprovedMappingForWrite,
  mappingApprovalForContract,
  mappingContractHash,
} from "@/services/google-sheets/canonical/mapping-contract";
import { CANONICAL_FIELDS } from "@/services/google-sheets/canonical/types";
import type {
  DetectedAnchor,
  MappingApprovalContext,
  ScannedCell,
  TableRegion,
} from "@/services/google-sheets/dynamic/types";
import type {
  GoogleSheetsImportPlan,
  ImportSource,
} from "@/services/google-sheets/import/types";

let passed = 0;

function check(condition: unknown, message: string) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log(`PASS: ${message}`);
}

function cell(row: number, column: number, rawValue: string | number): ScannedCell {
  return {
    row,
    column,
    address: `${String.fromCharCode(64 + column)}${row}`,
    rawValue,
    normalizedValue: String(rawValue).trim().toUpperCase(),
  };
}

function anchor(
  matchType: DetectedAnchor["matchType"],
  label = "TARGET 2026",
): DetectedAnchor {
  return {
    key: "biomassTarget",
    label,
    matchedLabel: label,
    matchType,
    cell: cell(1, 1, label),
    tableKind: "target",
    expectedUnits: ["TON"],
  };
}

function region(values: readonly ScannedCell[]): TableRegion {
  return {
    id: "target-fixture",
    kind: "target",
    startRow: 1,
    endRow: 500,
    startColumn: 1,
    endColumn: 26,
    cells: values,
    anchors: [],
    title: "TARGET",
    confidence: 1,
  };
}

const approved: MappingApprovalContext = {
  profile: "BB_CANONICAL_V1",
  mappingVersion: "BB_CANONICAL_V1@1",
  approvalState: "APPROVED",
  allowExact: true,
  allowStructural: true,
  allowPolicyFallback: true,
};

const exactRegion = region([cell(1, 1, "TARGET 2026"), cell(1, 2, 70020)]);
const exactUnapproved = resolveAnchorValue(
  anchor("exact"),
  exactRegion,
  "Juli26-BB",
);
check(
  exactUnapproved.available &&
    exactUnapproved.writeAuthorization === "REVIEW_REQUIRED",
  "a high-confidence unapproved candidate remains review-only",
);

const exactApproved = resolveAnchorValue(
  anchor("exact"),
  exactRegion,
  "Juli26-BB",
  undefined,
  { mappingApproval: approved },
);
check(
  exactApproved.writeAuthorization === "APPROVED_EXACT",
  "an approved exact match receives exact write authorization",
);

const aliasApproved = resolveAnchorValue(
  anchor("alias"),
  exactRegion,
  "Juli26-BB",
  undefined,
  { mappingApproval: approved },
);
check(
  aliasApproved.writeAuthorization === "APPROVED_STRUCTURAL",
  "an approved structural match receives structural write authorization",
);

const patternUnapproved = resolveAnchorValue(
  anchor("pattern"),
  region([cell(1, 1, "TARGET 2026"), cell(1, 2, 70020), cell(1, 3, "TON")]),
  "Juli26-BB",
  undefined,
  { mappingApproval: approved },
);
check(
  patternUnapproved.writeAuthorization === "REVIEW_REQUIRED",
  "a pattern candidate is not silently promoted to a writable mapping",
);

const conflicting = resolveAnchorValue(
  anchor("exact"),
  region([cell(1, 1, "TARGET 2026"), cell(1, 2, 70020), cell(1, 3, 71000)]),
  "Juli26-BB",
  undefined,
  { mappingApproval: approved },
);
check(
  conflicting.status === "ambiguous" &&
    conflicting.writeAuthorization === "BLOCKED",
  "conflicting candidates are blocked even under an approved profile",
);

const lowConfidence = resolveAnchorValue(
  anchor("context"),
  region([cell(1, 1, "TARGET 2026"), cell(500, 26, 70020)]),
  "Juli26-BB",
  undefined,
  { mappingApproval: approved },
);
check(
  lowConfidence.writeAuthorization === "BLOCKED",
  "low-confidence candidates are blocked",
);

function source(overrides: Partial<ImportSource> = {}): ImportSource {
  return {
    worksheet: "Juli26-BB",
    cell: "T11",
    row: 11,
    column: 20,
    sheetId: "sheet-7",
    rawDisplayValue: "1.250,50",
    sourceGranularity: "CELL",
    observationKind: "SOURCE_CELL",
    mappingAuthorization: "APPROVED_STRUCTURAL",
    ...overrides,
  };
}

function emptyPlan(
  overrides: Partial<GoogleSheetsImportPlan> = {},
): GoogleSheetsImportPlan {
  return {
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
    biomassConsumptionRows: [],
    solarConsumptionRows: [],
    solarReceiptRows: [],
    hopRows: [],
    targetRows: [],
    cumulativeRows: [],
    stagingRows: [],
    summary: {
      dailyRows: 0,
      receiptRows: 0,
      coalReceiptRows: 0,
      coalConsumptionRows: 0,
      coalStockRows: 0,
      biomassConsumptionRows: 0,
      solarConsumptionRows: 0,
      solarReceiptRows: 0,
      hopRows: 0,
      targetRows: 0,
      cumulativeRows: 0,
      totalRows: 0,
    },
    ...overrides,
  };
}

function biomassPlan(sourceOverride: Partial<ImportSource> = {}) {
  return emptyPlan({
    biomassConsumptionRows: [
      {
        readingDate: new Date("2026-07-01T00:00:00.000Z"),
        unitNumber: 1,
        quantityTon: 1250.5,
        source: source(sourceOverride),
      },
    ],
  });
}

const canonical = approvedMappingContractForWorksheet("Juli26-BB");
check(canonical?.profile === "BB_CANONICAL_V1", "Juli26-BB resolves to the approved canonical profile");
check(
  canonical?.manifest.length === 11 &&
    canonical.manifest.every((entry) => entry.mappingVersion === "BB_CANONICAL_V1@1"),
  "canonical manifest has one versioned entry per canonical field",
);
check(
  canonical ? mappingApprovalForContract(canonical).allowStructural : false,
  "approved canonical manifest exposes structural parser capability explicitly",
);

const legacyProfiles = approvedLegacyMappingContracts();
check(legacyProfiles.length === 6, "six fixed January-June legacy profiles are registered");
check(
  legacyProfiles.every((profile) =>
    profile.manifest.some(
      (entry) =>
        entry.field === "coal_receipt.quantityTon" &&
        entry.sourcePath === "I42" &&
        entry.sourceKind === "PHYSICAL_REFERENCE",
    ),
  ),
  "legacy profiles explicitly version the fixed coal receipt reference",
);
check(
  approvedMappingContractForWorksheet("Juli25-BB") === null,
  "unsupported worksheet years do not receive an implicit mapping profile",
);
check(
  canonical ? mappingContractHash(canonical).length === 64 : false,
  "mapping manifest hash is deterministic",
);
const tamperedManifest = canonical
  ? {
      ...canonical,
      manifest: canonical.manifest.map((entry, index) =>
        index === 0 ? { ...entry, targetField: "" } : entry,
      ),
    }
  : null;
assert.throws(
  () =>
    assertApprovedMappingForWrite(
      tamperedManifest as never,
      CANONICAL_FIELDS,
    ),
  /manifest is incomplete/i,
);
check(true, "an incomplete manifest cannot be promoted to write authority");

const juni = approvedMappingContractForWorksheet("Juni26-BB");
const physicalLegacySource = source({
  worksheet: "Juni26-BB",
  sheetId: "legacy-sheet-6",
  cell: "I42",
  row: 42,
  column: 9,
  rawDisplayValue: "1.500,00",
  mappingSourceKind: "PHYSICAL_REFERENCE",
  mappingAuthorization: "APPROVED_EXACT",
});
const juniPlan = juni
  ? buildApprovedCanonicalPlanForCompatibility({
      importRunId: "phase3-legacy-run",
      plan: emptyPlan({
        requested: { month: 6, year: 2026, worksheet: "Juni26-BB" },
        effective: { month: 6, year: 2026, worksheet: "Juni26-BB" },
        requestedPeriod: new Date("2026-06-01T00:00:00.000Z"),
        effectivePeriod: new Date("2026-06-01T00:00:00.000Z"),
        coalReceiptRows: [
          {
            periodStart: new Date("2026-06-01T00:00:00.000Z"),
            quantityTon: 1500,
            source: physicalLegacySource,
          },
        ],
      }),
      sourceKey: "source-workbook-legacy",
      spreadsheetId: "spreadsheet-legacy",
      sheetId: "legacy-sheet-6",
      worksheetTitle: "Juni26-BB",
      effectivePeriod: { month: 6, year: 2026 },
      sourceRange: "A1:ZZ500",
      schemaFingerprint: "schema-legacy-juni",
      mapping: juni,
    })
  : null;
check(
  juni?.profile === "BB_LEGACY_JUNI_V1" &&
    juni?.manifest.find((entry) => entry.field === "coal_receipt.quantityTon")
      ?.sourceKind === "PHYSICAL_REFERENCE" &&
    juniPlan?.approvalState === "APPROVED",
  "an explicit June legacy profile admits its versioned fixed physical reference",
);
assert.throws(
  () =>
    buildApprovedCanonicalPlanForCompatibility({
      importRunId: "phase3-canonical-physical-rejection",
      plan: biomassPlan({
        mappingSourceKind: "PHYSICAL_REFERENCE",
        mappingAuthorization: "APPROVED_EXACT",
        cell: "I42",
        row: 42,
        column: 9,
      }),
      sourceKey: "source-workbook-1",
      spreadsheetId: "spreadsheet-1",
      sheetId: "sheet-7",
      worksheetTitle: "Juli26-BB",
      effectivePeriod: { month: 7, year: 2026 },
      sourceRange: "A1:ZZ500",
      schemaFingerprint: "schema-fixture-1",
      mapping: canonical!,
    }),
  /Physical fallback is not approved/i,
);
check(
  true,
  "a legacy physical reference cannot cross the canonical profile boundary",
);

const canonicalPlan = canonical
  ? buildApprovedCanonicalPlanForCompatibility({
      importRunId: "phase3-fixture-run",
      plan: biomassPlan(),
      sourceKey: "source-workbook-1",
      spreadsheetId: "spreadsheet-1",
      sheetId: "sheet-7",
      worksheetTitle: "Juli26-BB",
      effectivePeriod: { month: 7, year: 2026 },
      sourceRange: "A1:ZZ500",
      schemaFingerprint: "schema-fixture-1",
      mapping: canonical,
    })
  : null;
check(canonicalPlan?.approvalState === "APPROVED", "valid compatibility input produces an approved canonical plan");
check(
  canonicalPlan?.sourceManifest.schemaFingerprint === "schema-fixture-1" &&
    canonicalPlan.items[0]?.sourceProvenance.cellAddress === "T11" &&
    canonicalPlan.items[0]?.sourceProvenance.granularity === "CELL" &&
    canonicalPlan.items[0]?.sourceProvenance.rawDisplayValue === "1.250,50",
  "canonical plan retains source identity, cell provenance, and exact raw display text",
);
check(
  canonicalPlan?.planHash ===
    (canonical
      ? buildApprovedCanonicalPlanForCompatibility({
          importRunId: "phase3-fixture-run",
          plan: biomassPlan(),
          sourceKey: "source-workbook-1",
          spreadsheetId: "spreadsheet-1",
          sheetId: "sheet-7",
          worksheetTitle: "Juli26-BB",
          effectivePeriod: { month: 7, year: 2026 },
          sourceRange: "A1:ZZ500",
          schemaFingerprint: "schema-fixture-1",
          mapping: canonical,
        }).planHash
      : null),
  "same source, mapping, and parser versions produce the same canonical plan hash",
);

check(
  source({ mappingAuthorization: "REVIEW_REQUIRED" }).mappingAuthorization ===
    "REVIEW_REQUIRED",
  "fixture can express a review-only mapping authorization",
);
const reviewPlan = emptyPlan({
  biomassConsumptionRows: [
    {
      readingDate: new Date("2026-07-01T00:00:00.000Z"),
      unitNumber: 1,
      quantityTon: 1250.5,
      source: source({ mappingAuthorization: "REVIEW_REQUIRED" }),
    },
  ],
});
assert.throws(
  () =>
    canonicalRecordsFromImportPlan({
      plan: reviewPlan,
      sourceManifest: canonicalPlan!.sourceManifest,
      mapping: canonical!,
    }),
  /approved.*mapping/i,
);
check(true, "review-only source candidates cannot enter the canonical domain");

const aggregatePlan = canonical
  ? buildApprovedCanonicalPlanForCompatibility({
      importRunId: "phase3-aggregate-run",
      plan: emptyPlan({
        solarReceiptRows: [
          {
            periodStart: new Date("2026-07-01T00:00:00.000Z"),
            quantityLiter: 3750,
            source: source({
              cell: null,
              row: null,
              column: null,
              rawDisplayValue: null,
              sourceGranularity: "RANGE",
              observationKind: "SOURCE_RANGE",
              sourceAddresses: ["M2", "M3"],
              rawDisplayValues: [
                { address: "M2", value: "1.250,00" },
                { address: "M3", value: "2.500,00" },
              ],
            }),
          },
        ],
      }),
      sourceKey: "source-workbook-1",
      spreadsheetId: "spreadsheet-1",
      sheetId: "sheet-7",
      worksheetTitle: "Juli26-BB",
      effectivePeriod: { month: 7, year: 2026 },
      sourceRange: "A1:ZZ500",
      schemaFingerprint: "schema-fixture-1",
      mapping: canonical,
    })
  : null;
check(
  aggregatePlan?.items[0]?.sourceProvenance.granularity === "RANGE" &&
    aggregatePlan.items[0].sourceProvenance.cellAddress === null &&
    aggregatePlan.items[0].sourceProvenance.row === null &&
    aggregatePlan.items[0].sourceProvenance.rawDisplayValue === null &&
    aggregatePlan.items[0].sourceProvenance.rawDisplayValues?.length === 2,
  "aggregate provenance is range-level and preserves component raw values without fabricating a row or total raw string",
);

const movedRecord = canonical
  ? canonicalRecordsFromImportPlan({
      plan: emptyPlan({
        biomassConsumptionRows: [
          {
            readingDate: new Date("2026-07-01T00:00:00.000Z"),
            unitNumber: 1,
            quantityTon: 1250.5,
            source: source({ cell: "U19", row: 19, column: 21 }),
          },
        ],
      }),
      sourceManifest: canonicalPlan!.sourceManifest,
      mapping: canonical,
    })[0]
  : null;
check(
    canonicalPlan?.items[0]?.businessIdentity.canonicalKey ===
    movedRecord?.businessIdentity.canonicalKey &&
    canonicalPlan?.items[0]?.record.sourceOccurrenceKey !== movedRecord?.sourceOccurrenceKey,
  "moving a source cell preserves business identity while changing source occurrence identity",
);

console.log(`Phase 3 deterministic mapping regression: ${passed} assertions passed.`);
