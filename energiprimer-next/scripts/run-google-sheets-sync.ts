import { runGoogleSheetsIncrementalSync } from "../src/services/google-sheets/sync/engine";

const worksheetArgument = process.argv.find((argument) =>
  argument.startsWith("--worksheet="),
);
const worksheetTitle = worksheetArgument?.slice("--worksheet=".length).trim();
const scope = process.argv.includes("--current") ? "current" : "all";
const result = await runGoogleSheetsIncrementalSync({
  triggerType: "manual",
  worksheetTitle: worksheetTitle || undefined,
  scope,
  allowNonLocalDatabase: false,
});

console.log(
  JSON.stringify(
    {
      status: result.status,
      worksheetsScanned: result.worksheetsScanned,
      rowsScanned: result.rowsScanned,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    },
    null,
    2,
  ),
);
