import assert from "node:assert/strict";

import {
  classifyGoogleSheetsStatus,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  classifyWorksheetDiscovery,
  discoverGoogleSheetsWorksheets,
} from "../src/services/google-sheets/sync/discovery";

const sheet = (
  sheetId: string,
  title: string,
): GoogleSheetsWorksheetMetadata => ({
  sheetId,
  title,
  index: null,
  sheetType: "GRID",
  rowCount: 100,
  columnCount: 20,
});

function runStaticChecks() {
  const previous = [
    { worksheetKey: "1", worksheetTitle: "Juli26-BB", status: "ACTIVE" },
    { worksheetKey: "2", worksheetTitle: "Juni26-BB", status: "ACTIVE" },
  ];
  const current = [
    sheet("1", "Juli26-BB-Renamed"),
    sheet("3", "Agustus26-BB"),
  ];
  const diff = classifyWorksheetDiscovery(previous, current);
  assert.equal(diff.newCount, 1);
  assert.equal(diff.renamedCount, 1);
  assert.equal(diff.missingCount, 1);
  assert.equal(diff.unchangedCount, 0);

  const repeated = classifyWorksheetDiscovery(
    current.map((item) => ({
      worksheetKey: item.sheetId,
      worksheetTitle: item.title,
      status: "ACTIVE",
    })),
    current,
  );
  assert.equal(repeated.newCount, 0);
  assert.equal(repeated.renamedCount, 0);
  assert.equal(repeated.missingCount, 0);
  assert.equal(repeated.unchangedCount, 2);

  const empty = classifyWorksheetDiscovery(previous, []);
  assert.equal(empty.missingCount, 2);

  assert.equal(classifyGoogleSheetsStatus(401), "authentication");
  assert.equal(classifyGoogleSheetsStatus(403), "permission");
  assert.equal(classifyGoogleSheetsStatus(429), "rate_limit");
  assert.equal(classifyGoogleSheetsStatus(504), "timeout");
  assert.equal(classifyGoogleSheetsStatus(500), "api");
}

async function runLiveCheck() {
  const result = await discoverGoogleSheetsWorksheets();
  assert.ok(result.worksheetCount > 0, "Google spreadsheet has no worksheets");
  return {
    sourceStatus: "ACTIVE",
    worksheetCount: result.worksheetCount,
    newCount: result.diff.newCount,
    renamedCount: result.diff.renamedCount,
    missingCount: result.diff.missingCount,
    unchangedCount: result.diff.unchangedCount,
  };
}

runStaticChecks();
const live = process.argv.includes("--live");
const liveResult = live ? await runLiveCheck() : null;
console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: live ? "static+live" : "static",
      live: liveResult,
      checks: [
        "new worksheet detection",
        "repeated discovery",
        "title rename detection by stable sheet ID",
        "missing worksheet detection without delete",
        "empty worksheet list handling",
        "Google API error classification",
      ],
    },
    null,
    2,
  ),
);
