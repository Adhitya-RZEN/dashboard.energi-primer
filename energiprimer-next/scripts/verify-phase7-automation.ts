import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { GoogleSheetsWorksheetMetadata } from "../src/lib/google-sheets";
import type { ImportStagingRecord } from "../src/services/google-sheets/import/types";
import {
  classifySyncRows,
} from "../src/services/google-sheets/sync/change-detection";
import {
  classifyWorksheetDiscovery,
} from "../src/services/google-sheets/sync/discovery";
import {
  AUTOMATION_MINIMAL_PROBE_RANGE,
  assertAutomationRecordBound,
  assertAutomationWorksheetBound,
  automaticExecutionAdmission,
  isVercelCronRequest,
  readAutomationConfig,
} from "../src/services/google-sheets/sync/automation-contract";
import {
  classifyAutomaticWorksheetProbe,
} from "../src/services/google-sheets/sync/automatic-admission";
import {
  automationAlertClass,
  buildAutomationEvent,
} from "../src/services/google-sheets/sync/automation-observability";
import {
  transitionCanonicalLedgerBatch,
  transitionCanonicalLedgerRun,
} from "../src/services/google-sheets/canonical/ledger";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import type {
  DetectedAnchor,
} from "../src/services/google-sheets/dynamic/types";

function row(value: number, date: string, sourceRow: number): ImportStagingRecord {
  return {
    entityType: "biomass_consumption",
    source: { worksheet: "Juli26-BB", cell: `T${sourceRow}`, row: sourceRow },
    periodStart: null,
    readingDate: new Date(`${date}T00:00:00.000Z`),
    unitCode: "UNIT-1",
    supplierCode: null,
    rawValue: String(value),
    normalizedValue: value,
    valueUnit: "ton",
    validationStatus: "VALID",
    validationMessage: null,
  };
}

function anchor(key: DetectedAnchor["key"], matchType: DetectedAnchor["matchType"] = "exact") {
  return { key, matchType } as const;
}

function sheet(sheetId: string, title: string, rowCount: number): GoogleSheetsWorksheetMetadata {
  return {
    sheetId,
    title,
    index: null,
    sheetType: "GRID",
    rowCount,
    columnCount: 26,
  };
}

function snapshot(hash: string) {
  return JSON.stringify({
    version: 1,
    dateColumnPresent: true,
    columns: [],
    hash,
  });
}

function runContractChecks() {
  const disabled = readAutomationConfig({ CANONICAL_IMPORT_LEDGER_ENABLED: "true" });
  assert.equal(disabled.enabled, false);
  assert.ok(disabled.blockers.includes("AUTOMATION_MODE_DISABLED"));
  assert.ok(disabled.blockers.includes("AUTOMATION_KILL_SWITCH_ENABLED"));

  const enabled = readAutomationConfig({
    CANONICAL_IMPORT_LEDGER_ENABLED: "true",
    GOOGLE_SHEETS_AUTOMATION_MODE: "ENABLED",
    GOOGLE_SHEETS_AUTOMATION_KILL_SWITCH: "DISABLED",
    GOOGLE_SHEETS_AUTOMATION_MAX_WORKSHEETS: "3",
    GOOGLE_SHEETS_AUTOMATION_MAX_RECORDS: "200",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.maxWorksheets, 3);
  assert.equal(enabled.maxRecords, 200);
  const invalid = readAutomationConfig({
    CANONICAL_IMPORT_LEDGER_ENABLED: "true",
    GOOGLE_SHEETS_AUTOMATION_MODE: "unexpected",
    GOOGLE_SHEETS_AUTOMATION_KILL_SWITCH: "unexpected",
    GOOGLE_SHEETS_AUTOMATION_MAX_WORKSHEETS: "0",
    GOOGLE_SHEETS_AUTOMATION_MAX_RECORDS: "10001",
  });
  assert.equal(invalid.enabled, false);
  assert.ok(invalid.blockers.includes("AUTOMATION_MODE_INVALID"));
  assert.ok(invalid.blockers.includes("AUTOMATION_KILL_SWITCH_INVALID"));
  assert.ok(invalid.blockers.includes("AUTOMATION_MAX_WORKSHEETS_INVALID"));
  assert.ok(invalid.blockers.includes("AUTOMATION_MAX_RECORDS_INVALID"));
  assert.equal(
    automaticExecutionAdmission({
      config: enabled,
      authenticatedCron: true,
      vercelCron: true,
      productionTargetVerified: true,
    }).admitted,
    true,
  );
  assert.equal(
    automaticExecutionAdmission({
      config: enabled,
      authenticatedCron: true,
      vercelCron: false,
      productionTargetVerified: true,
    }).admitted,
    false,
  );
  assert.equal(isVercelCronRequest(new Headers({ "user-agent": "vercel-cron/1.0" })), true);
  assert.equal(isVercelCronRequest(new Headers({ "user-agent": "Mozilla/5.0" })), false);
  assert.throws(() => assertAutomationRecordBound(201, enabled), /AUTOMATION_RECORD_BOUND_EXCEEDED/u);
  assert.throws(() => assertAutomationWorksheetBound(4, enabled), /AUTOMATION_WORKSHEET_BOUND_EXCEEDED/u);
  assert.equal(AUTOMATION_MINIMAL_PROBE_RANGE, "A1:Z10");
}

function runDiscoveryAndChangeChecks() {
  const discovery = classifyWorksheetDiscovery(
    [{ worksheetKey: "1", worksheetTitle: "Juli26-BB", status: "ACTIVE", rowCount: 100 }],
    [sheet("1", "Juli26-BB", 101), sheet("2", "September26-BB", 20)],
  );
  assert.equal(discovery.changedCount, 1);
  assert.equal(discovery.newCount, 1);
  assert.equal(discovery.changes.find((item) => item.worksheetKey === "1")?.type, "CHANGED");

  const original = row(512.706, "2026-07-28", 24);
  const changed = row(513.1, "2026-07-28", 25);
  const added = row(10, "2026-07-29", 26);
  const existing = [{
    sourceKey: sourceKeyForStagingRow(original),
    contentHash: contentHashForStagingRow(original),
  }];
  const classification = classifySyncRows([changed, added], existing);
  assert.equal(classification.changedRows.length, 1);
  assert.equal(classification.newRows.length, 1);
  assert.equal(classification.unchangedRows.length, 0);
  assert.equal(classification.removed, 0);

  const repeated = classifySyncRows([original], existing);
  assert.equal(repeated.unchangedRows.length, 1);
  const sourceRemoved = classifySyncRows([], existing);
  assert.equal(sourceRemoved.removed, 1);
  assert.deepEqual(sourceRemoved.removedSourceKeys, [existing[0]?.sourceKey]);
  assert.equal(sourceRemoved.changes.some((item) => (item.action as string) === "DELETE"), false);
}

function runAdmissionChecks() {
  const canonical = snapshot("canonical-profile");
  const approved = classifyAutomaticWorksheetProbe({
    worksheetTitle: "September26-BB",
    registryStatus: "DISCOVERED",
    canonicalSchema: canonical,
    probe: {
      scannedCellCount: 12,
      anchors: [anchor("dashboardHeader"), anchor("dateHeader")],
      parserErrors: [],
    },
  });
  assert.equal(approved.status, "APPROVED_PROFILE");
  assert.equal(approved.mappingProfile, "BB_CANONICAL_V1");

  const unknown = classifyAutomaticWorksheetProbe({
    worksheetTitle: "September26-BB",
    registryStatus: "DISCOVERED",
    canonicalSchema: canonical,
    probe: { scannedCellCount: 12, anchors: [], parserErrors: [] },
  });
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.blockers[0], "MINIMAL_PROBE_PROFILE_MARKERS_INSUFFICIENT");

  const schemaReview = classifyAutomaticWorksheetProbe({
    worksheetTitle: "September26-BB",
    registryStatus: "DISCOVERED",
    canonicalSchema: null,
    probe: null,
  });
  assert.equal(schemaReview.status, "SCHEMA_REVIEW");

  const invalidTitle = classifyAutomaticWorksheetProbe({
    worksheetTitle: "Finance",
    registryStatus: "DISCOVERED",
    canonicalSchema: canonical,
    probe: null,
  });
  assert.equal(invalidTitle.status, "UNKNOWN");
}

function runLedgerAndObservabilityChecks() {
  assert.equal(transitionCanonicalLedgerRun("APPROVED", "COMMITTING"), "COMMITTING");
  assert.throws(
    () => transitionCanonicalLedgerRun("FAILED", "COMMITTING"),
    /explicit recovery/u,
  );
  assert.equal(
    transitionCanonicalLedgerRun("FAILED", "COMMITTING", { explicitRecovery: true }),
    "COMMITTING",
  );
  assert.equal(transitionCanonicalLedgerBatch("FAILED", "RUNNING"), "RUNNING");
  assert.equal(automationAlertClass({ status: "SUCCESS" }), "NORMAL");
  assert.equal(automationAlertClass({ status: "LOCKED" }), "ACTION_REQUIRED");
  assert.equal(automationAlertClass({ status: "SCHEMA_REVIEW", blockers: ["SCHEMA_REVIEW"] }), "ACTION_REQUIRED");
  assert.equal(automationAlertClass({ status: "RECONCILIATION_REQUIRED" }), "SYSTEM_FAILURE");
  const event = buildAutomationEvent({
    event: "AUTOMATION_COMPLETED",
    requestId: "request-1",
    runId: "run-1",
    worksheetCount: 2,
    rowsScanned: 4,
    inserted: 1,
    updated: 1,
    skipped: 2,
    failed: 0,
    status: "SUCCESS",
  });
  assert.equal(event.alert, "NORMAL");
  assert.equal("rawValue" in event, false);
}

runContractChecks();
runDiscoveryAndChangeChecks();
runAdmissionChecks();
runLedgerAndObservabilityChecks();

const routeSource = readFileSync(
  fileURLToPath(new URL("../src/app/api/sync/google-sheets/route.ts", import.meta.url)),
  "utf8",
);
assert.match(routeSource, /runGoogleSheetsIncrementalSync\(\{/u);
assert.match(routeSource, /automaticRequestAuthorized: true/u);
assert.match(routeSource, /write: "NOT_EXECUTED"/u);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: "disposable-static",
      productionWrites: 0,
      googleSheetsWrites: 0,
      migrations: 0,
      checks: [
        "automatic configuration defaults to disabled with an engaged kill switch",
        "authenticated Vercel Cron and verified Production are required for automatic admission",
        "automatic worksheet and record bounds fail closed",
        "metadata discovery distinguishes new and changed worksheets",
        "new, changed, unchanged, and removed source rows are observable without DELETE",
        "known profile admission requires minimal semantic markers",
        "unknown and missing canonical profile sources are isolated",
        "durable ledger transitions require explicit recovery",
        "structured automation events expose only bounded safe metadata",
        "route preserves read-only behavior outside admitted automatic execution",
      ],
    },
    null,
    2,
  ),
);
