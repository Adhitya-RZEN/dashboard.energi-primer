import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  classifyGoogleSheetsStatus,
  type GoogleSheetsWorksheetMetadata,
} from "../src/lib/google-sheets";
import {
  classifyWorksheetDiscovery,
  discoverGoogleSheetsWorksheets,
  prepareWorksheetDiscovery,
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
  const discoverySource = readFileSync(
    fileURLToPath(
      new URL(
        "../src/services/google-sheets/sync/discovery.ts",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const engineSource = readFileSync(
    fileURLToPath(
      new URL("../src/services/google-sheets/sync/engine.ts", import.meta.url),
    ),
    "utf8",
  );
  assert.match(discoverySource, /Prisma\.join\(values\)/u);
  assert.match(discoverySource, /tx\.syncWorksheet\.updateMany/u);
  assert.doesNotMatch(discoverySource, /await tx\.syncWorksheet\.upsert/u);
  const sourceBootstrapCall = engineSource.indexOf(
    "sourceId = await ensureSyncSourceForDiscovery",
  );
  const persistenceCall = engineSource.indexOf(
    "await persistGoogleSheetsWorksheetDiscovery",
  );
  const leaseCall = engineSource.indexOf("lease = await acquireSyncSourceLease");
  const syncRunCall = engineSource.indexOf("const syncRun = await");
  assert.ok(
    sourceBootstrapCall >= 0 &&
      leaseCall > sourceBootstrapCall &&
      persistenceCall > sourceBootstrapCall &&
      persistenceCall > leaseCall &&
      syncRunCall > persistenceCall,
    "source bootstrap and lease precede discovery persistence and syncRun creation",
  );

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

  const prepared = prepareWorksheetDiscovery(
    [
      { worksheetKey: "1", worksheetTitle: "Juli26-BB", status: "MISSING" },
      { worksheetKey: "2", worksheetTitle: "Juni26-BB", status: "ACTIVE" },
    ],
    [
      sheet("1", "Juli26-BB"),
      sheet("3", "Agustus26-BB"),
    ],
    BigInt(1),
    "source-key",
    new Date("2026-09-03T00:00:00.000Z"),
  );
  assert.deepEqual(prepared.missingKeys, ["2"]);
  assert.equal(prepared.current.length, 2);
  assert.equal(prepared.current[0]?.status, "DISCOVERED");
  assert.equal(prepared.current[0]?.normalizedTitle, "JULI26-BB");
  assert.equal(prepared.current[1]?.status, "DISCOVERED");

  assert.throws(
    () =>
      prepareWorksheetDiscovery(
        [],
        [sheet("duplicate", "Januari26-BB"), sheet("duplicate", "Mei26-BB")],
        BigInt(1),
        "source-key",
        new Date("2026-09-03T00:00:00.000Z"),
      ),
    /Duplicate worksheet stable key/u,
  );

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
      "lease-snapshot preparation preserves status recovery and missing keys",
      "duplicate current worksheet keys fail before persistence",
      "discovery persistence is set-oriented without sequential worksheet upsert",
        "source bootstrap and lease precede registry persistence and syncRun creation",
    ],
    },
    null,
    2,
  ),
);
