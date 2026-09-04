import assert from "node:assert/strict";

import type { GoogleSheetsWorksheetMetadata } from "../src/lib/google-sheets";

const databaseUrl = process.env.DATABASE_URL?.trim();
const disposableMarker = process.env.PHASE6J_DISPOSABLE?.trim();
let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl ?? "");
} catch {
  throw new Error("Phase 6J disposable test requires a valid local DATABASE_URL.");
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
assert.equal(
  disposableMarker,
  "true",
  "Phase 6J disposable test requires PHASE6J_DISPOSABLE=true.",
);
assert.ok(
  loopbackHosts.has(parsedDatabaseUrl.hostname) &&
    parsedDatabaseUrl.port === "55432",
  "Phase 6J disposable test only accepts the local loopback port 55432.",
);

const { prisma } = await import("../src/lib/prisma");
const {
  acquireSyncSourceLease,
  ensureSyncSourceForDiscovery,
  releaseSyncSourceLease,
} = await import("../src/services/google-sheets/sync/lease");
const {
  persistGoogleSheetsWorksheetDiscovery,
} = await import("../src/services/google-sheets/sync/discovery");

const sourceKey = "phase6j-disposable-source";
const externalId = "phase6j-disposable-spreadsheet";
const sourceNow = new Date("2026-09-04T00:00:00.000Z");

function metadata(worksheetKey: string, title: string, rowCount = 100): GoogleSheetsWorksheetMetadata {
  return {
    sheetId: worksheetKey,
    title,
    index: null,
    sheetType: "GRID",
    rowCount,
    columnCount: 20,
  };
}

const initialTitles = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
];

function initialMetadata() {
  return Array.from({ length: 199 }, (_, index) => {
    const number = index + 1;
    const key = `sheet-${String(number).padStart(3, "0")}`;
    return metadata(key, initialTitles[index] ?? `Legacy-${number}`, number);
  });
}

function changedMetadata() {
  const rows = initialMetadata().slice(1);
  rows[0] = metadata("sheet-002", "Februari26-BB", 2026);
  rows[1] = metadata("sheet-003", "Maret26-BB-Renamed", 2027);
  rows.push(metadata("sheet-new", "New-Worksheet", 2048));
  assert.equal(rows.length, 199);
  return rows;
}

function fullMetadata() {
  return initialMetadata();
}

async function captureDiagnostics(operation: () => Promise<void>) {
  const lines: string[] = [];
  const originalError = console.error;
  try {
    console.error = (...args: unknown[]) => {
      lines.push(args.map((value) => String(value)).join(" "));
    };
    await operation();
  } finally {
    console.error = originalError;
  }
  return lines;
}

function transactionDuration(lines: readonly string[]) {
  const line = lines.find(
    (value) =>
      value.includes("stage=discovery_transaction") &&
      value.includes("status=PASS"),
  );
  const duration = line?.match(/duration_ms=(\d+)/u)?.[1];
  assert.ok(duration, "discovery transaction diagnostic duration is present");
  return Number(duration);
}

const statuses = [
  "ACTIVE",
  "MISSING",
  "ACTIVE",
  "DISABLED",
  "VALIDATED",
  "SCHEMA_REVIEW",
  "ERROR",
];

try {
  const existingSource = await prisma.syncSource.findUnique({
    where: { sourceKey },
    select: { id: true },
  });
  if (existingSource) {
    await prisma.syncRun.deleteMany({ where: { sourceId: existingSource.id } });
    await prisma.syncWorksheet.deleteMany({
      where: { sourceId: existingSource.id },
    });
    await prisma.syncSource.delete({ where: { id: existingSource.id } });
  }

  const sourceId = await ensureSyncSourceForDiscovery(sourceKey, externalId);
  const seeded = initialMetadata().map((worksheet, index) => ({
    sourceId,
    worksheetKey: worksheet.sheetId,
    worksheetTitle: worksheet.title,
    normalizedTitle: worksheet.title.toUpperCase(),
    status: statuses[index] ?? "ACTIVE",
    firstSeenAt: sourceNow,
    lastSeenAt: sourceNow,
    rowCount: worksheet.rowCount ?? 0,
  }));
  await prisma.syncWorksheet.createMany({ data: seeded });

  const changed = changedMetadata();
  const firstResult = await persistGoogleSheetsWorksheetDiscovery(
    {
      sourceKey,
      externalId,
      current: changed,
      now: new Date("2026-09-04T00:00:01.000Z"),
    },
    sourceId,
  );
  assert.equal(firstResult.worksheetCount, 199);
  assert.equal(firstResult.diff.newCount, 1);
  assert.equal(firstResult.diff.renamedCount, 1);
  assert.equal(firstResult.diff.missingCount, 1);

  const afterFirst = await prisma.syncWorksheet.findMany({
    where: { sourceId },
    orderBy: { worksheetKey: "asc" },
    select: { worksheetKey: true, worksheetTitle: true, normalizedTitle: true, status: true },
  });
  assert.equal(afterFirst.length, 200);
  const byKey = new Map(afterFirst.map((worksheet) => [worksheet.worksheetKey, worksheet]));
  assert.equal(byKey.get("sheet-001")?.status, "MISSING");
  assert.equal(byKey.get("sheet-002")?.status, "DISCOVERED");
  assert.equal(byKey.get("sheet-003")?.status, "ACTIVE");
  assert.equal(byKey.get("sheet-003")?.worksheetTitle, "Maret26-BB-Renamed");
  assert.equal(byKey.get("sheet-004")?.status, "DISABLED");
  assert.equal(byKey.get("sheet-005")?.status, "VALIDATED");
  assert.equal(byKey.get("sheet-006")?.status, "SCHEMA_REVIEW");
  assert.equal(byKey.get("sheet-007")?.status, "ERROR");
  assert.equal(byKey.get("sheet-new")?.status, "DISCOVERED");

  const repeated = await persistGoogleSheetsWorksheetDiscovery(
    {
      sourceKey,
      externalId,
      current: changed,
      now: new Date("2026-09-04T00:00:02.000Z"),
    },
    sourceId,
  );
  assert.equal(repeated.worksheetCount, 199);
  assert.equal(
    await prisma.syncWorksheet.count({ where: { sourceId } }),
    200,
  );

  await persistGoogleSheetsWorksheetDiscovery(
    {
      sourceKey,
      externalId,
      current: [],
      now: new Date("2026-09-04T00:00:03.000Z"),
    },
    sourceId,
  );
  assert.equal(
    await prisma.syncWorksheet.count({
      where: { sourceId, status: "MISSING" },
    }),
    200,
  );

  await persistGoogleSheetsWorksheetDiscovery(
    {
      sourceKey,
      externalId,
      current: fullMetadata(),
      now: new Date("2026-09-04T00:00:04.000Z"),
    },
    sourceId,
  );
  assert.equal(
    await prisma.syncWorksheet.count({
      where: { sourceId, status: "DISCOVERED" },
    }),
    199,
  );

  const beforeDuplicate = await prisma.syncWorksheet.count({ where: { sourceId } });
  await assert.rejects(
    persistGoogleSheetsWorksheetDiscovery(
      {
        sourceKey,
        externalId,
        current: [metadata("duplicate", "Januari26-BB"), metadata("duplicate", "Mei26-BB")],
        now: new Date("2026-09-04T00:00:05.000Z"),
      },
      sourceId,
    ),
    /Duplicate worksheet stable key/u,
  );
  assert.equal(
    await prisma.syncWorksheet.count({ where: { sourceId } }),
    beforeDuplicate,
  );

  const beforeAtomicFailure = await prisma.syncSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: { lastDiscoveredAt: true },
  });
  const invalidTitle = "X".repeat(256);
  await assert.rejects(
    persistGoogleSheetsWorksheetDiscovery(
      {
        sourceKey,
        externalId,
        current: [...fullMetadata(), metadata("too-long", invalidTitle)],
        now: new Date("2026-09-04T00:00:06.000Z"),
      },
      sourceId,
    ),
  );
  const afterAtomicFailure = await prisma.syncSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: { lastDiscoveredAt: true },
  });
  assert.equal(
    afterAtomicFailure.lastDiscoveredAt?.getTime(),
    beforeAtomicFailure.lastDiscoveredAt?.getTime(),
  );
  assert.equal(
    await prisma.syncWorksheet.count({
      where: { sourceId, worksheetKey: "too-long" },
    }),
    0,
  );

  const firstLease = await acquireSyncSourceLease(sourceId, 60_000);
  assert.ok(firstLease);
  const secondLease = await acquireSyncSourceLease(sourceId, 60_000);
  assert.equal(secondLease, null);
  await releaseSyncSourceLease(sourceId, firstLease.token);
  const releasedLease = await acquireSyncSourceLease(sourceId, 60_000);
  assert.ok(releasedLease);
  await releaseSyncSourceLease(sourceId, releasedLease.token);

  const performanceLease = await acquireSyncSourceLease(sourceId, 60_000);
  assert.ok(performanceLease);
  try {
    const diagnostics = await captureDiagnostics(async () => {
      await persistGoogleSheetsWorksheetDiscovery(
        {
          sourceKey,
          externalId,
          current: fullMetadata(),
          now: new Date("2026-09-04T00:00:07.000Z"),
        },
        sourceId,
        { requestId: "11111111-1111-4111-8111-111111111111" },
      );
    });
    const durationMs = transactionDuration(diagnostics);
    assert.ok(
      durationMs <= 45_000,
      `discovery transaction exceeded the 45,000 ms Phase 6J gate: ${durationMs} ms`,
    );

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          target: "DISPOSABLE_LOOPBACK_POSTGRESQL",
          fixture: {
            seededWorksheets: 199,
            changedWorksheets: 199,
            currentWorksheets: 199,
          },
          transactionDurationMs: durationMs,
          checks: [
            "new worksheet detection",
            "renamed worksheet by stable key",
            "missing worksheet is marked without deletion",
            "MISSING worksheet recovery",
            "empty metadata marks registry rows missing",
            "repeat discovery is idempotent",
            "duplicate metadata fails before persistence",
            "invalid current row rolls back source and registry atomically",
            "only one concurrent lease is admitted and release works",
            "set-oriented discovery transaction stays under 45 seconds",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await releaseSyncSourceLease(sourceId, performanceLease.token);
  }
} finally {
  await prisma.$disconnect();
}
