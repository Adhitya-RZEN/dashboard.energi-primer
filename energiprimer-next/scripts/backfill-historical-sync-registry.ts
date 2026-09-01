import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  prisma as auditPrisma,
  runHistoricalRegistryAudit,
} from "./audit-historical-sync-registry-reconciliation";
import type { ImportStagingRecord } from "../src/services/google-sheets/import/types";
import {
  contentHashForStagingRow,
  contentHashForStagingRows,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";

const writePrisma = new PrismaClient();

const TARGET_WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
] as const;

const CANONICAL_WORKSHEET = "Juli26-BB";
const EXPECTED_HISTORICAL_ROWS = 2_057;
const EXPECTED_FULL_ROWS = 2_409;
const EXPECTED_JULI_ROWS = 352;
const APPROVAL_FLAG = "--approve-metadata-only";

const BUSINESS_TABLES = [
  "biomass_receipts",
  "biomass_consumptions",
  "coal_receipts",
  "coal_consumption",
  "coal_stock",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
  "power_generation",
  "coal_quality",
  "kpi_targets",
] as const;

type WorksheetBackfillPlan = {
  worksheetId: bigint;
  worksheetTitle: string;
  worksheetKey: string;
  schemaHash: string;
  schemaSnapshot: string;
  contentHash: string;
  rowCount: number;
  rows: Prisma.SyncRowStateCreateManyInput[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function safeError() {
  return "controlled_metadata_backfill_failed";
}

function safeSerialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "object" && value instanceof Uint8Array)
    return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(safeSerialize);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, safeSerialize(item)]),
    );
  return value;
}

async function businessDataSnapshot(client: PrismaClient) {
  const tables = [] as Array<{
    table: string;
    rows: number;
    fingerprint: string;
  }>;

  for (const table of BUSINESS_TABLES) {
    const rows = await client.$queryRaw<unknown[]>(
      Prisma.sql`SELECT * FROM ${Prisma.raw(`"${table}"`)} ORDER BY 1`,
    );
    const serializedRows = rows
      .map((row) => JSON.stringify(safeSerialize(row)) ?? "null")
      .sort();
    tables.push({
      table,
      rows: rows.length,
      fingerprint: createHash("sha256")
        .update(serializedRows.join("\n"))
        .digest("hex"),
    });
  }

  const overallFingerprint = createHash("sha256")
    .update(
      tables
        .map((table) => `${table.table}:${table.rows}:${table.fingerprint}`)
        .join("\n"),
    )
    .digest("hex");

  return { tables, overallFingerprint };
}

function fingerprintPlan(rows: readonly ImportStagingRecord[]) {
  return createHash("sha256")
    .update(
      rows
        .map(
          (row) =>
            `${sourceKeyForStagingRow(row)}:${contentHashForStagingRow(row)}`,
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");
}

function assertNoDuplicateKeys(rows: readonly ImportStagingRecord[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = sourceKeyForStagingRow(row);
    assert(!keys.has(key), "duplicate source key in backfill plan");
    keys.add(key);
  }
}

async function assertNoActiveLease(sourceId: bigint) {
  const source = await writePrisma.syncSource.findUnique({
    where: { id: sourceId },
    select: { id: true, status: true, lockExpiresAt: true },
  });
  assert(source, "sync source not found");
  assert(source.status === "ACTIVE", "sync source is not active");
  assert(
    !source.lockExpiresAt || source.lockExpiresAt <= new Date(),
    "sync source lease is active",
  );
}

async function buildBackfillPlan(
  preflight: Awaited<ReturnType<typeof runHistoricalRegistryAudit>>,
  backfillAt: Date,
) {
  const report = preflight.report;
  assert(report.preflight.gateA === "PASS", "Gate A is not passing");
  assert(report.preflight.targetRows === EXPECTED_HISTORICAL_ROWS, "historical row count changed");
  assert(report.preflight.matched === EXPECTED_HISTORICAL_ROWS, "historical match count changed");
  assert(report.preflight.missing === 0, "business record is missing");
  assert(report.preflight.ambiguous === 0, "business record match is ambiguous");
  assert(report.preflight.duplicate === 0, "duplicate identity detected");
  assert(report.preflight.writeClassification.businessDataWrite === false, "business write planned");

  assert(preflight.registry.source, "sync source is not registered");
  await assertNoActiveLease(preflight.registry.source.id);

  const registryByKey = new Map(
    preflight.registry.worksheets.map((worksheet) => [worksheet.worksheetKey, worksheet]),
  );
  const rowStatesByWorksheet = new Map<bigint, number>();
  for (const rowState of preflight.registry.rowStates) {
    rowStatesByWorksheet.set(
      rowState.worksheetId,
      (rowStatesByWorksheet.get(rowState.worksheetId) ?? 0) + 1,
    );
  }

  const plans: WorksheetBackfillPlan[] = [];
  for (const worksheetTitle of TARGET_WORKSHEETS) {
    const source = preflight.sources.find(
      (candidate) => normalize(candidate.requested) === normalize(worksheetTitle),
    );
    assert(source?.selected === worksheetTitle, `source worksheet mismatch: ${worksheetTitle}`);
    assert(source.plan?.status === "READY_FOR_IMPORT", `source plan is not ready: ${worksheetTitle}`);
    assert(source.schema, `schema snapshot is missing: ${worksheetTitle}`);
    assert(source.metadata, `worksheet metadata is missing: ${worksheetTitle}`);

    const registryWorksheet = registryByKey.get(source.metadata.sheetId);
    assert(registryWorksheet, `registry worksheet is missing: ${worksheetTitle}`);
    assert(
      normalize(registryWorksheet.worksheetTitle) === normalize(worksheetTitle),
      `registry worksheet title mismatch: ${worksheetTitle}`,
    );
    assert(
      (rowStatesByWorksheet.get(registryWorksheet.id) ?? 0) === 0,
      `historical row state already exists: ${worksheetTitle}`,
    );
    assert(registryWorksheet.status === "DISCOVERED", `worksheet state changed: ${worksheetTitle}`);

    const sourceRows = source.plan.stagingRows;
    assertNoDuplicateKeys(sourceRows);
    const rows = sourceRows.map((row) => ({
      worksheetId: registryWorksheet.id,
      sourceKey: sourceKeyForStagingRow(row),
      entityType: row.entityType,
      contentHash: contentHashForStagingRow(row),
      lastSeenAt: backfillAt,
      lastSyncedAt: backfillAt,
    }));

    plans.push({
      worksheetId: registryWorksheet.id,
      worksheetTitle,
      worksheetKey: registryWorksheet.worksheetKey,
      schemaHash: source.schema.hash,
      schemaSnapshot: JSON.stringify(source.schema),
      contentHash: contentHashForStagingRows(sourceRows),
      rowCount: sourceRows.length,
      rows,
    });
  }

  const allRows = plans.flatMap((plan) => plan.rows);
  assert(allRows.length === EXPECTED_HISTORICAL_ROWS, "backfill plan row count changed");
  assert(
    new Set(allRows.map((row) => `${row.worksheetId.toString()}|${row.sourceKey}`)).size ===
      EXPECTED_HISTORICAL_ROWS,
    "backfill plan contains duplicate worksheet/source keys",
  );

  const sourceRows = preflight.sources
    .filter((source) => TARGET_WORKSHEETS.some((title) => normalize(title) === normalize(source.requested)))
    .flatMap((source) => source.plan?.stagingRows ?? []);
  assert(
    fingerprintPlan(sourceRows).startsWith(report.preflight.deterministicPlan.fingerprint),
    "deterministic backfill plan fingerprint changed",
  );

  return { plans, rows: allRows, sourceRows };
}

async function writeMetadataOnly(
  plans: readonly WorksheetBackfillPlan[],
  sourceId: bigint,
  backfillAt: Date,
) {
  const targetIds = plans.map((plan) => plan.worksheetId);
  const allRows = plans.flatMap((plan) => plan.rows);

  return writePrisma.$transaction(
    async (tx) => {
      const lockedSources = await tx.$queryRaw<
        Array<{ id: bigint; status: string; lock_expires_at: Date | null }>
      >(
        Prisma.sql`
          SELECT id, status, lock_expires_at
          FROM sync_sources
          WHERE id = ${sourceId}
          FOR UPDATE
        `,
      );
      assert(lockedSources.length === 1, "sync source changed");
      assert(lockedSources[0].status === "ACTIVE", "sync source is not active");
      assert(
        !lockedSources[0].lock_expires_at || lockedSources[0].lock_expires_at <= new Date(),
        "sync source lease is active",
      );

      const lockedWorksheets = await tx.$queryRaw<Array<{ id: bigint }>>(
        Prisma.sql`
          SELECT id
          FROM sync_worksheets
          WHERE id IN (${Prisma.join(targetIds)})
          FOR UPDATE
        `,
      );
      assert(lockedWorksheets.length === plans.length, "target worksheet set changed");

      const existingStates = await tx.syncRowState.findMany({
        where: { worksheetId: { in: targetIds } },
        select: { worksheetId: true, sourceKey: true },
      });
      assert(existingStates.length === 0, "target row state appeared during transaction");

      const currentWorksheets = await tx.syncWorksheet.findMany({
        where: { id: { in: targetIds } },
        select: {
          id: true,
          status: true,
          rowCount: true,
          schemaHash: true,
          schemaSnapshot: true,
          contentHash: true,
          lastSyncAt: true,
        },
      });
      assert(currentWorksheets.length === plans.length, "target worksheet disappeared");
      assert(
        currentWorksheets.every(
          (worksheet) =>
            worksheet.status === "DISCOVERED" &&
            worksheet.rowCount === 592 &&
            worksheet.schemaHash === null &&
            worksheet.schemaSnapshot === null &&
            worksheet.contentHash === null &&
            worksheet.lastSyncAt === null,
        ),
        "target worksheet metadata changed before backfill",
      );

      const created = await tx.syncRowState.createMany({ data: allRows });
      assert(created.count === EXPECTED_HISTORICAL_ROWS, "metadata row create count mismatch");

      for (const plan of plans) {
        await tx.syncWorksheet.update({
          where: { id: plan.worksheetId },
          data: {
            status: "ACTIVE",
            lastSyncAt: backfillAt,
            schemaHash: plan.schemaHash,
            schemaSnapshot: plan.schemaSnapshot,
            contentHash: plan.contentHash,
            rowCount: plan.rowCount,
          },
        });
      }

      return { rowStatesCreated: created.count, worksheetsUpdated: plans.length };
    },
    { timeout: 120_000 },
  );
}

function outputHash(value: string) {
  return value.slice(0, 16);
}

async function main() {
  assert(process.argv.includes(APPROVAL_FLAG), "explicit approval flag is required");
  const preflight = await runHistoricalRegistryAudit();
  const businessBefore = await businessDataSnapshot(writePrisma);
  const backfillAt = new Date();
  const plan = await buildBackfillPlan(preflight, backfillAt);
  assert(preflight.registry.source, "sync source is not registered");
  const transaction = await writeMetadataOnly(plan.plans, preflight.registry.source.id, backfillAt);
  const businessAfter = await businessDataSnapshot(writePrisma);
  const postAudit = await runHistoricalRegistryAudit();
  const postReport = postAudit.report;
  const juli = postReport.perWorksheet.find(
    (worksheet) => normalize(worksheet.worksheet) === normalize(CANONICAL_WORKSHEET),
  );
  const fullIdempotency = postReport.idempotency.actualRegistryDryRun;
  const businessUnchanged =
    businessBefore.overallFingerprint === businessAfter.overallFingerprint &&
    JSON.stringify(businessBefore.tables.map((table) => [table.table, table.rows])) ===
      JSON.stringify(businessAfter.tables.map((table) => [table.table, table.rows]));
  const registryComplete =
    postReport.rowState.actualPersisted === EXPECTED_FULL_ROWS &&
    postReport.contentHash.missingHash === 0 &&
    postReport.perWorksheet
      .filter((worksheet) => TARGET_WORKSHEETS.some((title) => normalize(title) === normalize(worksheet.worksheet)))
      .every(
        (worksheet) =>
          worksheet.registry.status === "ACTIVE" &&
          worksheet.registry.rowStateCount === worksheet.sourceRows &&
          worksheet.registry.schemaHashPresent &&
          worksheet.registry.schemaSnapshotPresent &&
          worksheet.registry.contentHashPresent &&
          worksheet.registry.lastSyncPresent,
      );
  const finalStatus =
    transaction.rowStatesCreated === EXPECTED_HISTORICAL_ROWS &&
    transaction.worksheetsUpdated === TARGET_WORKSHEETS.length &&
    businessUnchanged &&
    registryComplete &&
    fullIdempotency.insert === 0 &&
    fullIdempotency.update === 0 &&
    fullIdempotency.skip === EXPECTED_FULL_ROWS &&
    fullIdempotency.duplicate === 0 &&
    juli?.rowStateReconciliation?.insert === 0 &&
    juli?.rowStateReconciliation?.update === 0 &&
    juli?.rowStateReconciliation?.skip === EXPECTED_JULI_ROWS &&
    postReport.dataIntegrity.duplicateGroups === 0 &&
    postReport.dataIntegrity.orphanRows === 0 &&
    postReport.reconciliation.status === "PASS" &&
    postReport.fixtures.status === "PASS"
      ? "PASS"
      : "FAIL";

  console.log(
    JSON.stringify(
      {
        phase: "PHASE_17B_CONTROLLED_HISTORICAL_SYNC_REGISTRY_BACKFILL",
        status: finalStatus,
        approval: "EXPLICIT_APPROVAL_RECEIVED",
        preflight: {
          gateA: preflight.report.preflight.gateA,
          targetWorksheets: TARGET_WORKSHEETS.length,
          targetRows: EXPECTED_HISTORICAL_ROWS,
          matched: preflight.report.preflight.matched,
          missing: preflight.report.preflight.missing,
          ambiguous: preflight.report.preflight.ambiguous,
          duplicate: preflight.report.preflight.duplicate,
          planFingerprint: preflight.report.preflight.deterministicPlan.fingerprint,
        },
        metadataBackfill: {
          rowStatesCreated: transaction.rowStatesCreated,
          worksheetsUpdated: transaction.worksheetsUpdated,
          businessInsert: 0,
          businessUpdate: 0,
          businessDelete: 0,
          destructiveOperations: 0,
        },
        businessData: {
          changed: !businessUnchanged,
          beforeFingerprint: outputHash(businessBefore.overallFingerprint),
          afterFingerprint: outputHash(businessAfter.overallFingerprint),
          tables: businessAfter.tables.map((table) => ({ table: table.table, rows: table.rows })),
        },
        registry: {
          rowStatesBefore: preflight.report.rowState.actualPersisted,
          rowStatesAfter: postReport.rowState.actualPersisted,
          historicalState: registryComplete ? "SYNCED_OR_EQUIVALENT" : "INCOMPLETE",
          contentHashMissingAfter: postReport.contentHash.missingHash,
        },
        idempotency: {
          insert: fullIdempotency.insert,
          update: fullIdempotency.update,
          skip: fullIdempotency.skip,
          duplicate: fullIdempotency.duplicate,
          failed: 0,
        },
        regression: {
          juli26: {
            insert: juli?.rowStateReconciliation?.insert ?? null,
            update: juli?.rowStateReconciliation?.update ?? null,
            skip: juli?.rowStateReconciliation?.skip ?? null,
          },
          duplicate: postReport.dataIntegrity.duplicateGroups,
          orphan: postReport.dataIntegrity.orphanRows,
          identityMismatch: postReport.reconciliation.status === "PASS" ? 0 : null,
          targetBiomassTon: postReport.dataIntegrity.targetBiomassTon,
          units: postReport.dataIntegrity.unitScope,
        },
        safety: {
          businessDataWrites: 0,
          businessDataChanged: businessUnchanged ? "NO" : "YES",
          metadataWrites: transaction.rowStatesCreated + transaction.worksheetsUpdated,
          migration: "NOT_RUN",
          dbPush: "NOT_RUN",
          supabase: "NOT_USED",
        },
        audit: {
          postSnapshotUnchanged: postReport.snapshots.unchanged,
          fixtureStatus: postReport.fixtures.status,
          registryComplete,
        },
      },
      null,
      2,
    ),
  );

  assert(finalStatus === "PASS", "post-backfill validation failed");
}

try {
  await main();
} catch {
  console.error(
    JSON.stringify(
      {
        phase: "PHASE_17B_CONTROLLED_HISTORICAL_SYNC_REGISTRY_BACKFILL",
        status: "FAIL",
        error: safeError(),
        businessDataWrites: 0,
        destructiveOperations: 0,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await writePrisma.$disconnect();
  await auditPrisma.$disconnect();
}
