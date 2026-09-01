import assert from "node:assert/strict";

import {
  BB_CANONICAL_MAPPING_PROFILE,
  BB_CANONICAL_MAPPING_VERSION,
  evaluateAutomaticWorksheet,
  isAfterCanonicalBBWorksheet,
  isAutomaticFutureBBWorksheet,
} from "../src/services/google-sheets/sync/bb-policy";
import type { SchemaColumnSnapshot, SchemaSnapshot } from "../src/services/google-sheets/sync/schema-detection";

function column(label: string): SchemaColumnSnapshot {
  const semanticKey = JSON.stringify({
    resource: "biomass",
    unit: "TON",
    unitNumber: null,
    isTotal: false,
    isStock: false,
    isHop: false,
    isDate: false,
  });
  return {
    semanticKey,
    signature: JSON.stringify({
      semanticKey,
      labels: [label],
      valueType: "numeric",
    }),
    labels: [label],
    resource: "biomass",
    unit: "TON",
    unitNumber: null,
    isTotal: false,
    isStock: false,
    isHop: false,
    isDate: false,
    valueType: "numeric",
  };
}

function snapshot(columns: readonly SchemaColumnSnapshot[]): SchemaSnapshot {
  return {
    version: 1,
    dateColumnPresent: true,
    columns,
    hash: JSON.stringify(columns),
  };
}

const canonical = snapshot([column("BIOMASSA UNIT 1")]);
const changed = snapshot([...canonical.columns, column("BIOMASSA UNIT 2")]);
const asOfSeptember = { month: 9, year: 2026 } as const;
const asOfAugust = { month: 8, year: 2026 } as const;

assert.equal(
  isAutomaticFutureBBWorksheet("Agustus26-BB", asOfSeptember),
  true,
);
assert.equal(
  isAutomaticFutureBBWorksheet("September26-BB", asOfAugust),
  false,
);
assert.equal(isAutomaticFutureBBWorksheet("Juli26-BB", asOfSeptember), false);
assert.equal(isAutomaticFutureBBWorksheet("Agustus25-BB", asOfSeptember), false);
assert.equal(isAutomaticFutureBBWorksheet("Agustus26-SOLAR", asOfSeptember), false);
assert.equal(isAfterCanonicalBBWorksheet("agustus26-bb"), true);

const approved = evaluateAutomaticWorksheet("Agustus26-BB", canonical, {
  canonicalSchema: canonical,
  asOf: asOfSeptember,
});
assert.equal(approved.allowed, true);
assert.equal(approved.gate, "APPROVED");
assert.equal(approved.mappingProfile, BB_CANONICAL_MAPPING_PROFILE);
assert.equal(approved.mappingVersion, BB_CANONICAL_MAPPING_VERSION);

const missingCanonical = evaluateAutomaticWorksheet("Agustus26-BB", canonical, {
  asOf: asOfSeptember,
});
assert.equal(missingCanonical.allowed, false);
assert.equal(missingCanonical.gate, "CANONICAL_SCHEMA_UNAVAILABLE");

const schemaReview = evaluateAutomaticWorksheet("Agustus26-BB", changed, {
  canonicalSchema: canonical,
  asOf: asOfSeptember,
});
assert.equal(schemaReview.allowed, false);
assert.equal(schemaReview.gate, "SCHEMA_REVIEW");
assert.equal(schemaReview.schemaChange?.type, "NEW_COLUMN");

const notDue = evaluateAutomaticWorksheet("Oktober26-BB", canonical, {
  canonicalSchema: canonical,
  asOf: asOfSeptember,
});
assert.equal(notDue.allowed, false);
assert.equal(notDue.gate, "NOT_YET_DUE");

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "only valid BB worksheets after Juli26-BB are eligible",
        "future worksheet is limited to the current operational period",
        "canonical schema is required",
        "exact canonical schema is approved with BB_CANONICAL_V1",
        "schema changes are routed to review",
        "future-dated worksheets are not imported early",
      ],
    },
    null,
    2,
  ),
);

