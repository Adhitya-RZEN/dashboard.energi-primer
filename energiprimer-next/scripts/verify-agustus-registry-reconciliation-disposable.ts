import assert from "node:assert/strict";

const databaseUrl = process.env.DATABASE_URL?.trim();
const disposableMarker = process.env.PHASE6J_DISPOSABLE?.trim();
let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl ?? "");
} catch {
  throw new Error("Registry reconciliation verification requires a valid local DATABASE_URL.");
}

assert.equal(
  disposableMarker,
  "true",
  "Registry reconciliation verification requires PHASE6J_DISPOSABLE=true.",
);
assert.ok(
  new Set(["127.0.0.1", "localhost", "::1"]).has(parsedDatabaseUrl.hostname) &&
    parsedDatabaseUrl.port === "55432" &&
    parsedDatabaseUrl.pathname.replace(/^\//u, "") === "dashboard_pln",
  "Registry reconciliation verification only accepts loopback port 55432 database dashboard_pln.",
);

const { prisma } = await import("../src/lib/prisma");
const {
  acquireSyncSourceLease,
  releaseSyncSourceLease,
} = await import("../src/services/google-sheets/sync/lease");
const {
  isStaleHistoricalRegistryError,
  reconcileStaleWorksheetRegistry,
  STALE_REGISTRY_RECONCILIATION_RESOLUTION,
  STALE_REGISTRY_RECONCILIATION_STATUS,
} = await import("../src/services/google-sheets/sync/registry-reconciliation");

const sourceKey = "phase6j-disposable-registry-reconciliation";
const externalId = "phase6j-disposable-registry-reconciliation-spreadsheet";
const fixtureTime = new Date("2026-09-15T00:00:00.000Z");
let sourceId: bigint | null = null;
let leaseToken: string | null = null;

try {
  const existingSource = await prisma.syncSource.findUnique({
    where: { sourceKey },
    select: { id: true },
  });
  if (existingSource) {
    await prisma.syncRun.deleteMany({ where: { sourceId: existingSource.id } });
    const existingWorksheets = await prisma.syncWorksheet.findMany({
      where: { sourceId: existingSource.id },
      select: { id: true },
    });
    const worksheetIds = existingWorksheets.map((worksheet) => worksheet.id);
    await prisma.syncRowState.deleteMany({
      where: { worksheetId: { in: worksheetIds } },
    });
    await prisma.syncSchemaChange.deleteMany({
      where: { worksheetId: { in: worksheetIds } },
    });
    await prisma.syncWorksheet.deleteMany({ where: { sourceId: existingSource.id } });
    await prisma.syncSource.delete({ where: { id: existingSource.id } });
  }

  const source = await prisma.syncSource.create({
    data: {
      sourceKey,
      provider: "google_sheets",
      externalId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  sourceId = source.id;
  const worksheet = await prisma.syncWorksheet.create({
    data: {
      sourceId: source.id,
      worksheetKey: "321088799",
      worksheetTitle: "Agustus26-BB",
      normalizedTitle: "AGUSTUS26-BB",
      status: "ERROR",
      firstSeenAt: fixtureTime,
      lastSeenAt: fixtureTime,
      rowCount: 593,
    },
    select: { id: true },
  });
  const schemaChange = await prisma.syncSchemaChange.create({
    data: {
      worksheetId: worksheet.id,
      previousSchemaHash: null,
      currentSchemaHash: "historical-schema-review",
      changeType: "SCHEMA_REVIEW",
      previousSchema: null,
      currentSchema: "{\"historical\":true}",
      status: "OPEN",
      resolution: "Historical ambiguous mapping",
    },
    select: { id: true, currentSchemaHash: true, currentSchema: true },
  });
  const importRun = await prisma.spreadsheetImportRun.create({
    data: {
      source: "google_sheets_sync",
      requestedWorksheet: "Agustus26-BB",
      effectiveWorksheet: "Agustus26-BB",
      sourceRange: "A1:ZZ500",
      requestedPeriod: new Date("2026-08-01T00:00:00.000Z"),
      effectivePeriod: new Date("2026-08-01T00:00:00.000Z"),
      status: "FAILED",
      importedRows: 0,
      rejectedRows: 352,
      message: "Import transaction failed; no normalized rows were committed.",
    },
    select: { id: true },
  });
  const syncRun = await prisma.syncRun.create({
    data: {
      sourceId: source.id,
      triggerType: "manual",
      status: "FAILED",
      rowsScanned: 352,
      inserted: 352,
      failed: 1,
      errorSummary: "sync_database",
    },
    select: { id: true },
  });

  const before = await prisma.syncWorksheet.findUniqueOrThrow({
    where: { id: worksheet.id },
    select: {
      id: true,
      sourceId: true,
      worksheetKey: true,
      worksheetTitle: true,
      status: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastSyncAt: true,
      schemaHash: true,
      schemaSnapshot: true,
      contentHash: true,
      rowCount: true,
    },
  });
  const evidence = {
    registry: before,
    expectedSourceId: source.id,
    expectedWorksheetKey: "321088799",
    expectedWorksheetTitle: "Agustus26-BB",
    expectedWorksheetRowCount: 593,
    currentWorksheetIsValid: true,
    liveMatchesCanonicalSnapshot: true,
    cleanProductionState: true,
    rowStateCount: 0,
    failedImportCount: 1,
    failedSyncCount: 1,
  };
  assert.equal(isStaleHistoricalRegistryError(evidence), true);
  assert.equal(
    isStaleHistoricalRegistryError({ ...evidence, currentWorksheetIsValid: false }),
    false,
  );
  assert.equal(
    isStaleHistoricalRegistryError({ ...evidence, liveMatchesCanonicalSnapshot: false }),
    false,
  );
  assert.equal(
    isStaleHistoricalRegistryError({ ...evidence, cleanProductionState: false }),
    false,
  );
  assert.equal(isStaleHistoricalRegistryError({ ...evidence, rowStateCount: 1 }), false);
  assert.equal(
    isStaleHistoricalRegistryError({ ...evidence, failedImportCount: 0 }),
    false,
  );
  assert.equal(isStaleHistoricalRegistryError({
    ...evidence,
    registry: { ...before, status: "ACTIVE" },
  }), false);

  const lease = await acquireSyncSourceLease(source.id, 60_000);
  assert.ok(lease);
  leaseToken = lease.token;
  const result = await reconcileStaleWorksheetRegistry({
    sourceId: source.id,
    worksheetId: worksheet.id,
    leaseToken: lease.token,
    expectedWorksheetKey: "321088799",
    expectedWorksheetTitle: "Agustus26-BB",
    expectedWorksheetRowCount: 593,
  });
  assert.deepEqual(result, {
    sourceId: source.id.toString(),
    worksheetId: worksheet.id.toString(),
    previousStatus: "ERROR",
    status: STALE_REGISTRY_RECONCILIATION_STATUS,
    schemaChangesResolved: 1,
    rowStatesWritten: 0,
    businessDataWrites: 0,
  });

  const after = await prisma.syncWorksheet.findUniqueOrThrow({
    where: { id: worksheet.id },
    select: {
      status: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastSyncAt: true,
      schemaHash: true,
      schemaSnapshot: true,
      contentHash: true,
      rowCount: true,
    },
  });
  assert.equal(after.status, STALE_REGISTRY_RECONCILIATION_STATUS);
  assert.equal(after.firstSeenAt.getTime(), before.firstSeenAt.getTime());
  assert.equal(after.lastSeenAt.getTime(), before.lastSeenAt.getTime());
  assert.equal(after.lastSyncAt, before.lastSyncAt);
  assert.equal(after.schemaHash, before.schemaHash);
  assert.equal(after.schemaSnapshot, before.schemaSnapshot);
  assert.equal(after.contentHash, before.contentHash);
  assert.equal(after.rowCount, before.rowCount);
  assert.equal(
    await prisma.syncRowState.count({ where: { worksheetId: worksheet.id } }),
    0,
  );

  const afterSchemaChange = await prisma.syncSchemaChange.findUniqueOrThrow({
    where: { id: schemaChange.id },
    select: { currentSchemaHash: true, currentSchema: true, status: true, resolution: true },
  });
  assert.equal(afterSchemaChange.currentSchemaHash, schemaChange.currentSchemaHash);
  assert.equal(afterSchemaChange.currentSchema, schemaChange.currentSchema);
  assert.equal(afterSchemaChange.status, "RESOLVED");
  assert.match(
    afterSchemaChange.resolution ?? "",
    /^Historical ambiguous mapping /u,
  );
  assert.match(
    afterSchemaChange.resolution ?? "",
    new RegExp(STALE_REGISTRY_RECONCILIATION_RESOLUTION, "u"),
  );
  assert.equal(
    await prisma.spreadsheetImportRun.count({ where: { id: importRun.id, status: "FAILED" } }),
    1,
  );
  assert.equal(
    await prisma.syncRun.count({ where: { id: syncRun.id, status: "FAILED" } }),
    1,
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        target: "DISPOSABLE_LOOPBACK_POSTGRESQL",
        registry: {
          before: "ERROR",
          after: STALE_REGISTRY_RECONCILIATION_STATUS,
          hashesPreserved: true,
          timestampsPreserved: true,
        },
        history: {
          schemaChangePreserved: true,
          schemaChangesResolved: result.schemaChangesResolved,
          failedImportRetained: true,
          failedSyncRetained: true,
        },
        rowStatesWritten: result.rowStatesWritten,
        businessDataWrites: result.businessDataWrites,
        checks: [
          "stale-error predicate requires all forensic conditions",
          "source lease is required",
          "source and worksheet identity are locked and rechecked",
          "advanced registry state is refused",
          "historical schema-change fields remain auditable",
          "failed import and sync history remains auditable",
          "no row state is created",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (sourceId !== null && leaseToken !== null)
    await releaseSyncSourceLease(sourceId, leaseToken);
  if (sourceId !== null) {
    await prisma.syncRun.deleteMany({ where: { sourceId } });
    const worksheets = await prisma.syncWorksheet.findMany({
      where: { sourceId },
      select: { id: true },
    });
    const worksheetIds = worksheets.map((worksheet) => worksheet.id);
    await prisma.syncRowState.deleteMany({
      where: { worksheetId: { in: worksheetIds } },
    });
    await prisma.syncSchemaChange.deleteMany({
      where: { worksheetId: { in: worksheetIds } },
    });
    await prisma.syncWorksheet.deleteMany({ where: { sourceId } });
    await prisma.syncSource.delete({ where: { id: sourceId } });
  }
  await prisma.$disconnect();
}
