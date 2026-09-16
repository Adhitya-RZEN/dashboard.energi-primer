import { Prisma, type PrismaClient } from "@prisma/client";

import { safeErrorCategory } from "../src/lib/safe-error";
import {
  prepareSupabasePoolerProbeUrl,
  verifySupabaseProductionTarget,
} from "../src/services/google-sheets/sync/production-target";
import {
  detectSchemaChange,
  parseSchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";
import {
  isStaleHistoricalRegistryError,
  reconcileStaleWorksheetRegistry,
  STALE_REGISTRY_RECONCILIATION_RESOLUTION,
  STALE_REGISTRY_RECONCILIATION_STATUS,
} from "../src/services/google-sheets/sync/registry-reconciliation";

const WORKSHEET_TITLE = "Agustus26-BB";
const EXPECTED_WORKSHEET_KEY = "321088799";
const CANONICAL_WORKSHEET_TITLE = "Juli26-BB";
const PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-01T00:00:00.000Z");
const APPROVAL_FLAG = "--approve-metadata-only";

type RegistryRow = {
  id: bigint;
  sourceId: bigint;
  worksheetKey: string;
  worksheetTitle: string;
  normalizedTitle: string;
  status: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastSyncAt: Date | null;
  schemaHash: string | null;
  schemaSnapshot: string | null;
  contentHash: string | null;
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type ReconciliationEvidence = {
  source: {
    id: bigint;
    status: string;
  } | null;
  registry: RegistryRow | null;
  canonical: {
    id: bigint;
    sourceId: bigint;
    worksheetKey: string;
    worksheetTitle: string;
    status: string;
    schemaHash: string | null;
    schemaSnapshot: string | null;
  } | null;
  rowStateCount: number;
  failedImportCount: number;
  failedSyncCount: number;
  productionEvidence: Record<string, number>;
  duplicateGroups: number;
};

function safeRegistry(registry: RegistryRow | null) {
  if (!registry) return null;
  return {
    id: registry.id.toString(),
    sourceId: registry.sourceId.toString(),
    worksheetKey: registry.worksheetKey,
    worksheetTitle: registry.worksheetTitle,
    normalizedTitle: registry.normalizedTitle,
    status: registry.status,
    firstSeenAt: registry.firstSeenAt.toISOString(),
    lastSeenAt: registry.lastSeenAt.toISOString(),
    lastSyncAt: registry.lastSyncAt?.toISOString() ?? null,
    schemaHash: registry.schemaHash,
    schemaSnapshotPresent: Boolean(registry.schemaSnapshot),
    contentHash: registry.contentHash,
    rowCount: registry.rowCount,
    createdAt: registry.createdAt.toISOString(),
    updatedAt: registry.updatedAt.toISOString(),
  };
}

async function productionEvidence(
  prisma: PrismaClient,
  worksheetId: bigint | null,
) {
  const evidenceRows = await prisma.$queryRaw<
    Array<{ evidence: string; count: number }>
  >(
    Prisma.sql`
      WITH evidence AS (
        SELECT 'staging_source' AS evidence, COUNT(*)::int AS count
        FROM spreadsheet_import_staging
        WHERE source_worksheet = ${WORKSHEET_TITLE}
        UNION ALL
        SELECT 'biomass_receipts_period', COUNT(*)::int
        FROM biomass_receipts
        WHERE period_start >= ${PERIOD_START}::date
          AND period_start < ${PERIOD_END}::date
        UNION ALL
        SELECT 'coal_receipts_period', COUNT(*)::int
        FROM coal_receipts
        WHERE period_start >= ${PERIOD_START}::date
          AND period_start < ${PERIOD_END}::date
        UNION ALL
        SELECT 'biomass_consumptions_period', COUNT(*)::int
        FROM biomass_consumptions
        WHERE reading_date >= ${PERIOD_START}::date
          AND reading_date < ${PERIOD_END}::date
        UNION ALL
        SELECT 'coal_consumption_period', COUNT(*)::int
        FROM coal_consumption
        WHERE date >= ${PERIOD_START}::date
          AND date < ${PERIOD_END}::date
        UNION ALL
        SELECT 'coal_stock_period', COUNT(*)::int
        FROM coal_stock
        WHERE date >= ${PERIOD_START}::date
          AND date < ${PERIOD_END}::date
        UNION ALL
        SELECT 'solar_receipts_period', COUNT(*)::int
        FROM solar_receipts
        WHERE period_start >= ${PERIOD_START}::date
          AND period_start < ${PERIOD_END}::date
        UNION ALL
        SELECT 'solar_consumptions_period', COUNT(*)::int
        FROM solar_consumptions
        WHERE reading_date >= ${PERIOD_START}::date
          AND reading_date < ${PERIOD_END}::date
        UNION ALL
        SELECT 'hop_period', COUNT(*)::int
        FROM hop_readings
        WHERE reading_date >= ${PERIOD_START}::date
          AND reading_date < ${PERIOD_END}::date
        UNION ALL
        SELECT 'biomass_cumulative_period', COUNT(*)::int
        FROM biomass_cumulative_snapshots
        WHERE period_start >= ${PERIOD_START}::date
          AND period_start < ${PERIOD_END}::date
        UNION ALL
        SELECT 'row_states', COUNT(*)::int
        FROM sync_row_states
        WHERE worksheet_id = ${worksheetId ?? BigInt(-1)}
      )
      SELECT evidence, count
      FROM evidence
      ORDER BY evidence
    `,
  );
  return Object.fromEntries(
    evidenceRows.map((row) => [row.evidence, Number(row.count)]),
  );
}

async function duplicateGroupCount(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<Array<{ duplicate_groups: bigint }>>(
    Prisma.sql`
      SELECT COALESCE(SUM(duplicate_groups), 0)::bigint AS duplicate_groups
      FROM (
        SELECT COUNT(*)::bigint AS duplicate_groups
        FROM (
          SELECT period_start, supplier_code
          FROM biomass_receipts
          GROUP BY period_start, supplier_code
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM coal_receipts
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, date
          FROM coal_consumption
          GROUP BY unit_id, date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT date
          FROM coal_stock
          GROUP BY date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, reading_date
          FROM biomass_consumptions
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT reading_date
          FROM solar_consumptions
          GROUP BY reading_date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM solar_receipts
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT unit_id, reading_date
          FROM hop_readings
          GROUP BY unit_id, reading_date
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT target_year
          FROM biomass_targets
          GROUP BY target_year
          HAVING COUNT(*) > 1
        ) duplicates
        UNION ALL
        SELECT COUNT(*)::bigint
        FROM (
          SELECT period_start
          FROM biomass_cumulative_snapshots
          GROUP BY period_start
          HAVING COUNT(*) > 1
        ) duplicates
      ) duplicate_key_groups
    `,
  );
  return Number(rows[0]?.duplicate_groups ?? BigInt(0));
}

async function readEvidence(
  prisma: PrismaClient,
  preflight: Awaited<
    ReturnType<
      typeof import("../src/services/google-sheets/sync/preflight")["prepareWorksheetPreflight"]
    >
  >,
): Promise<ReconciliationEvidence> {
  const source = await prisma.syncSource.findUnique({
    where: { sourceKey: preflight.sourceKey },
    select: { id: true, status: true },
  });
  const registry = source
    ? await prisma.syncWorksheet.findUnique({
        where: {
          sourceId_worksheetKey: {
            sourceId: source.id,
            worksheetKey: EXPECTED_WORKSHEET_KEY,
          },
        },
        select: {
          id: true,
          sourceId: true,
          worksheetKey: true,
          worksheetTitle: true,
          normalizedTitle: true,
          status: true,
          firstSeenAt: true,
          lastSeenAt: true,
          lastSyncAt: true,
          schemaHash: true,
          schemaSnapshot: true,
          contentHash: true,
          rowCount: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    : null;
  const canonical = source
    ? await prisma.syncWorksheet.findFirst({
        where: {
          sourceId: source.id,
          worksheetTitle: CANONICAL_WORKSHEET_TITLE,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          sourceId: true,
          worksheetKey: true,
          worksheetTitle: true,
          status: true,
          schemaHash: true,
          schemaSnapshot: true,
        },
      })
    : null;

  const [rowStateCount, failedImportCount, failedSyncCount, evidence, duplicates] =
    await Promise.all([
      registry
        ? prisma.syncRowState.count({ where: { worksheetId: registry.id } })
        : Promise.resolve(0),
      prisma.spreadsheetImportRun.count({
        where: {
          status: "FAILED",
          OR: [
            { requestedWorksheet: WORKSHEET_TITLE },
            { effectiveWorksheet: WORKSHEET_TITLE },
          ],
        },
      }),
      source
        ? prisma.syncRun.count({
            where: { sourceId: source.id, status: "FAILED" },
          })
        : Promise.resolve(0),
      productionEvidence(prisma, registry?.id ?? null),
      duplicateGroupCount(prisma),
    ]);

  return {
    source,
    registry,
    canonical,
    rowStateCount,
    failedImportCount,
    failedSyncCount,
    productionEvidence: evidence,
    duplicateGroups: duplicates,
  };
}

function staleDecision(
  preflight: Awaited<
    ReturnType<
      typeof import("../src/services/google-sheets/sync/preflight")["prepareWorksheetPreflight"]
    >
  >,
  evidence: ReconciliationEvidence,
) {
  const canonicalSnapshot = parseSchemaSnapshot(evidence.canonical?.schemaSnapshot);
  const canonicalComparison = canonicalSnapshot
    ? detectSchemaChange(
        canonicalSnapshot,
        preflight.schemaSnapshot,
        { allowObservedValueTypeDrift: true },
      )
    : null;
  const currentWorksheetIsValid =
    preflight.worksheet.known &&
    preflight.worksheetKey === EXPECTED_WORKSHEET_KEY &&
    preflight.worksheet.rowCount !== null &&
    evidence.registry?.rowCount === preflight.worksheet.rowCount &&
    preflight.mapping.status === "PASS" &&
    preflight.validation.status === "PASS" &&
    preflight.validation.validRecords === 352 &&
    preflight.validation.invalidRows === 0 &&
    preflight.classification.potentialDuplicates === 0 &&
    preflight.plan.status === "READY_FOR_IMPORT";
  const cleanProductionState =
    Object.values(evidence.productionEvidence).every((count) => count === 0) &&
    evidence.duplicateGroups === 0;
  const liveMatchesCanonicalSnapshot =
    evidence.canonical?.status === "ACTIVE" &&
    evidence.canonical.sourceId === evidence.source?.id &&
    canonicalComparison?.changed === false;
  const stale = isStaleHistoricalRegistryError({
    registry: evidence.registry,
    expectedSourceId: evidence.source?.id ?? null,
    expectedWorksheetKey: EXPECTED_WORKSHEET_KEY,
    expectedWorksheetTitle: preflight.worksheet.effective,
    expectedWorksheetRowCount: preflight.worksheet.rowCount,
    currentWorksheetIsValid,
    liveMatchesCanonicalSnapshot,
    cleanProductionState,
    rowStateCount: evidence.rowStateCount,
    failedImportCount: evidence.failedImportCount,
    failedSyncCount: evidence.failedSyncCount,
  });
  return {
    stale,
    currentWorksheetIsValid,
    liveMatchesCanonicalSnapshot,
    cleanProductionState,
    canonicalComparison: canonicalComparison
      ? {
          changed: canonicalComparison.changed,
          type: canonicalComparison.type,
          reason: canonicalComparison.reason,
        }
      : null,
  };
}

function planReport(
  preflight: Awaited<
    ReturnType<
      typeof import("../src/services/google-sheets/sync/preflight")["prepareWorksheetPreflight"]
    >
  >,
  evidence: ReconciliationEvidence,
  decision: ReturnType<typeof staleDecision>,
  target: Awaited<ReturnType<typeof verifySupabaseProductionTarget>>,
) {
  return {
    status: decision.stale ? "PASS_STALE_RECONCILIATION_PRECONDITION" : "BLOCKED",
    target: target.target,
    targetIdentity: target.identity,
    worksheet: {
      requested: WORKSHEET_TITLE,
      expectedWorksheetKey: EXPECTED_WORKSHEET_KEY,
      discoveredWorksheetKey: preflight.worksheetKey,
      registryId: evidence.registry?.id.toString() ?? null,
      registryStatus: evidence.registry?.status ?? null,
      preflightStatus: preflight.status,
    },
    currentPlan: {
      mapping: preflight.mapping.status,
      schemaClassification: preflight.mapping.schemaClassification,
      validation: preflight.validation.status,
      candidateRecords: preflight.validation.candidateRecords,
      validRecords: preflight.validation.validRecords,
      invalidRows: preflight.validation.invalidRows,
      potentialDuplicates: preflight.classification.potentialDuplicates,
      sourceRange: preflight.sourceRange,
    },
    staleDecision: decision,
    evidence: {
      rowStateCount: evidence.rowStateCount,
      failedImportCount: evidence.failedImportCount,
      failedSyncCount: evidence.failedSyncCount,
      production: evidence.productionEvidence,
      duplicateGroups: evidence.duplicateGroups,
    },
    metadataWrite: "NOT_EXECUTED",
    businessDataWrites: 0,
    destructiveOperations: 0,
  };
}

async function main() {
  const approvalReceived = process.argv.includes(APPROVAL_FLAG);
  const rawPoolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
  const target = await verifySupabaseProductionTarget({
    rawUrl: rawPoolerUrl,
    connectionVariable: "SUPABASE_POOLER_URL",
  });
  process.env.DATABASE_URL = prepareSupabasePoolerProbeUrl(rawPoolerUrl ?? "");

  const { prisma } = await import("../src/lib/prisma");
  const { prepareWorksheetPreflight } = await import(
    "../src/services/google-sheets/sync/preflight"
  );
  const { acquireSyncSourceLease, releaseSyncSourceLease } = await import(
    "../src/services/google-sheets/sync/lease"
  );

  try {
    const preflight = await prepareWorksheetPreflight({ worksheet: WORKSHEET_TITLE });
    const before = await readEvidence(prisma, preflight);
    const beforeDecision = staleDecision(preflight, before);
    if (!beforeDecision.stale) {
      console.log(
        JSON.stringify(
          {
            ...planReport(preflight, before, beforeDecision, target),
            reason: "Read-only stale-error preconditions are not satisfied.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }
    if (!approvalReceived) {
      console.log(
        JSON.stringify(
          {
            ...planReport(preflight, before, beforeDecision, target),
            approval: "NOT_RECEIVED",
            approvalRequired: APPROVAL_FLAG,
          },
          null,
          2,
        ),
      );
      return;
    }

    const sourceId = before.source?.id;
    const worksheetId = before.registry?.id;
    if (sourceId === undefined || worksheetId === undefined)
      throw new Error("stale registry evidence did not identify source and worksheet");

    const lease = await acquireSyncSourceLease(sourceId);
    if (!lease) {
      console.log(
        JSON.stringify(
          {
            status: "BLOCKED",
            target: target.target,
            worksheet: WORKSHEET_TITLE,
            reason: "Synchronization source lease could not be acquired.",
            metadataWrite: "NOT_EXECUTED",
            businessDataWrites: 0,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    try {
      const recheckPreflight = await prepareWorksheetPreflight({
        worksheet: WORKSHEET_TITLE,
      });
      if (recheckPreflight.expectedPlanFingerprint !== preflight.expectedPlanFingerprint) {
        console.log(
          JSON.stringify(
            {
              status: "BLOCKED",
              target: target.target,
              worksheet: WORKSHEET_TITLE,
              reason: "Google worksheet plan changed during reconciliation preflight.",
              metadataWrite: "NOT_EXECUTED",
              businessDataWrites: 0,
            },
            null,
            2,
          ),
        );
        process.exitCode = 2;
        return;
      }
      const recheck = await readEvidence(prisma, recheckPreflight);
      const recheckDecision = staleDecision(recheckPreflight, recheck);
      if (!recheckDecision.stale) {
        console.log(
          JSON.stringify(
            {
              ...planReport(recheckPreflight, recheck, recheckDecision, target),
              reason: "Stale-error preconditions changed before the metadata transaction.",
              metadataWrite: "NOT_EXECUTED",
            },
            null,
            2,
          ),
        );
        process.exitCode = 2;
        return;
      }

      const transaction = await reconcileStaleWorksheetRegistry({
        sourceId,
        worksheetId,
        leaseToken: lease.token,
        expectedWorksheetKey: EXPECTED_WORKSHEET_KEY,
        expectedWorksheetTitle: WORKSHEET_TITLE,
        expectedWorksheetRowCount: recheckPreflight.worksheet.rowCount ?? -1,
      });

      const postflight = await prepareWorksheetPreflight({ worksheet: WORKSHEET_TITLE });
      const after = await readEvidence(prisma, postflight);
      const afterRegistry = after.registry;
      const registryReconciled =
        afterRegistry?.status === STALE_REGISTRY_RECONCILIATION_STATUS &&
        afterRegistry.lastSyncAt === null &&
        afterRegistry.schemaHash === null &&
        afterRegistry.schemaSnapshot === null &&
        afterRegistry.contentHash === null &&
        afterRegistry.rowCount === recheck.registry?.rowCount &&
        after.rowStateCount === 0;
      const historyRetained =
        after.failedImportCount === recheck.failedImportCount &&
        after.failedSyncCount === recheck.failedSyncCount;
      const stateClean =
        Object.values(after.productionEvidence).every((count) => count === 0) &&
        after.duplicateGroups === 0;
      const dryRunReady =
        postflight.status === "READY" &&
        postflight.worksheet.status === "PASS" &&
        postflight.mapping.status === "PASS" &&
        postflight.validation.status === "PASS" &&
        postflight.validation.validRecords === 352 &&
        postflight.validation.invalidRows === 0 &&
        postflight.classification.potentialDuplicates === 0;
      const status =
        registryReconciled && historyRetained && stateClean && dryRunReady
          ? "PASS_METADATA_ONLY_RECONCILIATION"
          : "FAIL_METADATA_ONLY_RECONCILIATION";
      console.log(
        JSON.stringify(
          {
            status,
            target: target.target,
            targetIdentity: target.identity,
            worksheet: WORKSHEET_TITLE,
            registry: {
              before: safeRegistry(recheck.registry),
              after: safeRegistry(afterRegistry),
              previousStatus: transaction.previousStatus,
              status: transaction.status,
              schemaChangesResolved: transaction.schemaChangesResolved,
            },
            history: {
              failedImportCountBefore: recheck.failedImportCount,
              failedImportCountAfter: after.failedImportCount,
              failedSyncCountBefore: recheck.failedSyncCount,
              failedSyncCountAfter: after.failedSyncCount,
              resolution: STALE_REGISTRY_RECONCILIATION_RESOLUTION,
            },
            dryRunReadiness: {
              status: postflight.status === "READY" ? "PASS" : "BLOCKED",
              worksheet: postflight.worksheet.status,
              mapping: postflight.mapping.status,
              schemaClassification: postflight.mapping.schemaClassification,
              validation: postflight.validation.status,
              validRecords: postflight.validation.validRecords,
              invalidRows: postflight.validation.invalidRows,
              potentialDuplicates: postflight.classification.potentialDuplicates,
              write: "NOT_EXECUTED",
            },
            productionEvidence: {
              counts: after.productionEvidence,
              duplicateGroups: after.duplicateGroups,
              rowStateCount: after.rowStateCount,
            },
            safety: {
              metadataWrites: 1 + transaction.schemaChangesResolved,
              rowStatesWritten: transaction.rowStatesWritten,
              businessDataWrites: transaction.businessDataWrites,
              normalizedDataWrites: 0,
              destructiveOperations: 0,
            },
            checks: {
              registryReconciled,
              historyRetained,
              productionStateClean: stateClean,
              dryRunReady,
            },
          },
          null,
          2,
        ),
      );
      if (status !== "PASS_METADATA_ONLY_RECONCILIATION") process.exitCode = 1;
    } finally {
      await releaseSyncSourceLease(sourceId, lease.token);
    }
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL_METADATA_ONLY_RECONCILIATION",
        target: "SUPABASE_PRODUCTION",
        category: safeErrorCategory(error),
        metadataWrite: "UNKNOWN",
        businessDataWrites: 0,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
