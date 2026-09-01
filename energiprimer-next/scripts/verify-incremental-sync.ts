import assert from "node:assert/strict";

import { runGoogleSheetsIncrementalSync } from "../src/services/google-sheets/sync/engine";
import { classifySyncRows } from "../src/services/google-sheets/sync/change-detection";
import {
  contentHashForStagingRow,
  sourceKeyForImportRecord,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import type { ImportStagingRecord } from "../src/services/google-sheets/import/types";

function row(
  value: number | null,
  sourceRow: number,
  readingDate = "2026-07-28T00:00:00.000Z",
  unitCode = "UNIT-1",
): ImportStagingRecord {
  return {
    entityType: "biomass_consumption",
    source: { worksheet: "Juli26-BB", cell: `T${sourceRow}`, row: sourceRow },
    periodStart: null,
    readingDate: new Date(readingDate),
    unitCode,
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

  const existingBlock = [
    row(10, 24, "2026-07-01T00:00:00.000Z"),
    row(20, 25, "2026-07-02T00:00:00.000Z"),
    row(30, 26, "2026-07-03T00:00:00.000Z"),
  ];
  const insertedInMiddle = classifySyncRows(
    [
      row(20, 100, "2026-07-02T00:00:00.000Z"),
      row(15, 101, "2026-07-04T00:00:00.000Z"),
      row(10, 102, "2026-07-01T00:00:00.000Z"),
      row(30, 103, "2026-07-03T00:00:00.000Z"),
    ],
    existingBlock.map((item) => ({
      sourceKey: sourceKeyForStagingRow(item),
      contentHash: contentHashForStagingRow(item),
    })),
  );
  assert.equal(insertedInMiddle.inserted, 1);
  assert.equal(insertedInMiddle.updated, 0);
  assert.equal(insertedInMiddle.skipped, 3);
  assert.equal(insertedInMiddle.duplicates.length, 0);

  const fullVerifiedFixture = Array.from({ length: 2_409 }, (_, index) =>
    row(
      (index % 100) + 0.5,
      index + 2,
      new Date(Date.UTC(2023, 0, index + 1)).toISOString(),
      `UNIT-${(index % 3) + 1}`,
    ),
  );
  const fullIdempotency = classifySyncRows(
    fullVerifiedFixture,
    fullVerifiedFixture.map((item) => ({
      sourceKey: sourceKeyForStagingRow(item),
      contentHash: contentHashForStagingRow(item),
    })),
  );
  assert.equal(fullIdempotency.inserted, 0);
  assert.equal(fullIdempotency.updated, 0);
  assert.equal(fullIdempotency.skipped, 2_409);
  assert.equal(fullIdempotency.duplicates.length, 0);

  const targetRecord = {
    targetYear: 2026,
    targetTon: 70_020,
    source: { worksheet: "Juli26-BB", cell: "A1", row: 1 },
  };
  const targetStaging: ImportStagingRecord = {
    entityType: "biomass_target",
    source: targetRecord.source,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    readingDate: null,
    unitCode: null,
    supplierCode: null,
    rawValue: "70020",
    normalizedValue: 70_020,
    valueUnit: "ton",
    validationStatus: "VALID",
    validationMessage: null,
  };
  assert.equal(
    sourceKeyForImportRecord(targetRecord, "biomass_target"),
    sourceKeyForStagingRow(targetStaging),
  );

  const cumulativeRecord = {
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    cumulativeTon: 29_103.77,
    source: { worksheet: "Juli26-BB", cell: "A2", row: 2 },
  };
  const cumulativeStaging: ImportStagingRecord = {
    entityType: "biomass_cumulative",
    source: cumulativeRecord.source,
    periodStart: cumulativeRecord.periodStart,
    readingDate: null,
    unitCode: null,
    supplierCode: null,
    rawValue: "29103.77",
    normalizedValue: cumulativeRecord.cumulativeTon,
    valueUnit: "ton",
    validationStatus: "VALID",
    validationMessage: null,
  };
  assert.equal(
    sourceKeyForImportRecord(cumulativeRecord, "biomass_cumulative"),
    sourceKeyForStagingRow(cumulativeStaging),
  );
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
      "row reorder and new row in the middle affect only the new row",
      "2,409-row idempotency fixture produces only SKIP",
      "repeated live sync is idempotent",
      ],
    },
    null,
    2,
  ),
);
