import assert from "node:assert/strict";

import { runGoogleSheetsIncrementalSync } from "../src/services/google-sheets/sync/engine";
import { classifySyncRows } from "../src/services/google-sheets/sync/change-detection";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import type { ImportStagingRecord } from "../src/services/google-sheets/import/types";

function row(value: number | null, sourceRow: number): ImportStagingRecord {
  return {
    entityType: "biomass_consumption",
    source: { worksheet: "Juli26-BB", cell: `T${sourceRow}`, row: sourceRow },
    periodStart: null,
    readingDate: new Date("2026-07-28T00:00:00.000Z"),
    unitCode: "UNIT-1",
    supplierCode: null,
    rawValue: value === null ? null : String(value),
    normalizedValue: value,
    valueUnit: "ton",
    validationStatus: value === null ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  };
}

function runStaticChecks() {
  const original = row(74.8, 24);
  const sameBusinessRow = { ...original, source: { ...original.source, cell: "T99", row: 99 } };
  assert.equal(sourceKeyForStagingRow(original), sourceKeyForStagingRow(sameBusinessRow));
  assert.equal(
    contentHashForStagingRow(original),
    contentHashForStagingRow(sameBusinessRow),
  );

  const inserted = classifySyncRows([original], []);
  assert.equal(inserted.inserted, 1);
  assert.equal(inserted.updated, 0);
  assert.equal(inserted.skipped, 0);

  const existing = [
    {
      sourceKey: sourceKeyForStagingRow(original),
      contentHash: contentHashForStagingRow(original),
    },
  ];
  const skipped = classifySyncRows([sameBusinessRow], existing);
  assert.equal(skipped.inserted, 0);
  assert.equal(skipped.updated, 0);
  assert.equal(skipped.skipped, 1);

  const changed = classifySyncRows([row(75.1, 24)], existing);
  assert.equal(changed.inserted, 0);
  assert.equal(changed.updated, 1);
  assert.equal(changed.skipped, 0);

  const nullToZero = classifySyncRows([row(0, 24)], [
    {
      sourceKey: sourceKeyForStagingRow(row(null, 24)),
      contentHash: contentHashForStagingRow(row(null, 24)),
    },
  ]);
  assert.equal(nullToZero.updated, 1);

  const duplicate = classifySyncRows([original, sameBusinessRow], []);
  assert.equal(duplicate.duplicates.length, 1);
}

async function runLiveChecks() {
  const first = await runGoogleSheetsIncrementalSync({
    triggerType: "verification",
    worksheetTitle: "Juli26-BB",
  });
  assert.equal(first.status, "SUCCESS");
  assert.ok(first.rowsScanned > 0);
  assert.equal(
    first.inserted + first.updated + first.skipped,
    first.rowsScanned,
  );

  const second = await runGoogleSheetsIncrementalSync({
    triggerType: "verification",
    worksheetTitle: "Juli26-BB",
  });
  assert.equal(second.status, "SUCCESS");
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.skipped, second.rowsScanned);
  return {
    first: {
      rowsScanned: first.rowsScanned,
      inserted: first.inserted,
      updated: first.updated,
      skipped: first.skipped,
    },
    second: {
      rowsScanned: second.rowsScanned,
      inserted: second.inserted,
      updated: second.updated,
      skipped: second.skipped,
    },
  };
}

runStaticChecks();
const live = process.argv.includes("--live");
const liveResult = live ? await runLiveChecks() : null;
console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: live ? "static+live" : "static",
      live: liveResult,
      checks: [
        "stable key excludes row number and cell address",
        "new row is INSERT",
        "identical row is SKIP",
        "changed normalized value is UPDATE",
        "NULL and zero remain distinct changes",
        "duplicate stable keys are detected",
        "repeated live sync is idempotent",
      ],
    },
    null,
    2,
  ),
);
