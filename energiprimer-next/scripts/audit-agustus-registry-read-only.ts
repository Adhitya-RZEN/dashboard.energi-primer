import { Prisma } from "@prisma/client";

import { safeErrorCategory } from "../src/lib/safe-error";
import { prepareSupabasePoolerProbeUrl, verifySupabaseProductionTarget } from "../src/services/google-sheets/sync/production-target";
import { stableGoogleSheetsSourceKey } from "../src/services/google-sheets/sync/discovery";
import {
  detectSchemaChange,
  parseSchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";
import { isStaleHistoricalRegistryError } from "../src/services/google-sheets/sync/registry-reconciliation";

const WORKSHEET_TITLE = "Agustus26-BB";
const EXPECTED_WORKSHEET_KEY = "321088799";
const CANONICAL_WORKSHEET_TITLE = "Juli26-BB";

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function safeMessage(value: string | null) {
  return value === null ? null : value.replace(/[\r\n]+/gu, " ").slice(0, 240);
}

function snapshotHash(snapshot: string | null) {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot) as { hash?: unknown };
    return typeof parsed.hash === "string" ? parsed.hash : null;
  } catch {
    return null;
  }
}

try {
  const rawPoolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
  const target = await verifySupabaseProductionTarget({
    rawUrl: rawPoolerUrl,
    connectionVariable: "SUPABASE_POOLER_URL",
  });
  process.env.DATABASE_URL = prepareSupabasePoolerProbeUrl(rawPoolerUrl ?? "");

  const { prisma } = await import("../src/lib/prisma");
  try {
    const config = (await import("../src/lib/google-sheets")).getGoogleSheetsConfig();
    const sourceKey = stableGoogleSheetsSourceKey(config.spreadsheetId);
    const { prepareWorksheetPreflight } = await import(
      "../src/services/google-sheets/sync/preflight"
    );
    const preflight = await prepareWorksheetPreflight({ worksheet: WORKSHEET_TITLE });
    const source = await prisma.syncSource.findUnique({
      where: { sourceKey },
      select: {
        id: true,
        sourceKey: true,
        provider: true,
        externalId: true,
        status: true,
        lastDiscoveredAt: true,
        lockExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
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
            lastSyncAt: true,
            schemaHash: true,
            schemaSnapshot: true,
            contentHash: true,
            rowCount: true,
            updatedAt: true,
          },
        })
      : null;
    const errorColumns = await prisma.$queryRaw<Array<{ column_name: string }>>(
      Prisma.sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sync_worksheets'
          AND column_name IN ('error', 'error_message', 'last_error', 'error_code')
        ORDER BY column_name
      `,
    );
    const [schemaChanges, importRuns, syncRuns, rowStateCount, evidenceRows, duplicateRows] =
      await Promise.all([
        registry
          ? prisma.syncSchemaChange.findMany({
              where: { worksheetId: registry.id },
              orderBy: { detectedAt: "asc" },
              select: {
                id: true,
                detectedAt: true,
                previousSchemaHash: true,
                currentSchemaHash: true,
                changeType: true,
                status: true,
                resolution: true,
                updatedAt: true,
              },
            })
          : Promise.resolve([]),
        prisma.spreadsheetImportRun.findMany({
          where: {
            OR: [
              { requestedWorksheet: WORKSHEET_TITLE },
              { effectiveWorksheet: WORKSHEET_TITLE },
            ],
          },
          orderBy: { startedAt: "asc" },
          select: {
            id: true,
            source: true,
            requestedWorksheet: true,
            effectiveWorksheet: true,
            sourceRange: true,
            requestedPeriod: true,
            effectivePeriod: true,
            status: true,
            importedRows: true,
            rejectedRows: true,
            checksum: true,
            message: true,
            startedAt: true,
            completedAt: true,
          },
        }),
        source
          ? prisma.syncRun.findMany({
              where: { sourceId: source.id },
              orderBy: { startedAt: "asc" },
              select: {
                id: true,
                triggerType: true,
                status: true,
                startedAt: true,
                finishedAt: true,
                worksheetsScanned: true,
                rowsScanned: true,
                inserted: true,
                updated: true,
                skipped: true,
                failed: true,
                durationMs: true,
                errorSummary: true,
              },
            })
          : Promise.resolve([]),
        registry
          ? prisma.syncRowState.count({ where: { worksheetId: registry.id } })
          : Promise.resolve(0),
        prisma.$queryRaw<Array<{ evidence: string; count: number }>>(
          Prisma.sql`
            WITH evidence AS (
              SELECT 'staging_source' AS evidence, COUNT(*)::int AS count
              FROM spreadsheet_import_staging
              WHERE source_worksheet = ${WORKSHEET_TITLE}
              UNION ALL
              SELECT 'biomass_receipts_period', COUNT(*)::int
              FROM biomass_receipts
              WHERE period_start >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND period_start < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'coal_receipts_period', COUNT(*)::int
              FROM coal_receipts
              WHERE period_start >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND period_start < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'biomass_consumptions_period', COUNT(*)::int
              FROM biomass_consumptions
              WHERE reading_date >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND reading_date < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'coal_consumption_period', COUNT(*)::int
              FROM coal_consumption
              WHERE date >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND date < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'coal_stock_period', COUNT(*)::int
              FROM coal_stock
              WHERE date >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND date < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'solar_receipts_period', COUNT(*)::int
              FROM solar_receipts
              WHERE period_start >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND period_start < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'solar_consumptions_period', COUNT(*)::int
              FROM solar_consumptions
              WHERE reading_date >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND reading_date < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'hop_period', COUNT(*)::int
              FROM hop_readings
              WHERE reading_date >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND reading_date < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'biomass_cumulative_period', COUNT(*)::int
              FROM biomass_cumulative_snapshots
              WHERE period_start >= ${new Date("2026-08-01T00:00:00.000Z")}::date
                AND period_start < ${new Date("2026-09-01T00:00:00.000Z")}::date
              UNION ALL
              SELECT 'row_states', COUNT(*)::int
              FROM sync_row_states AS row_state
              INNER JOIN sync_worksheets AS registered
                ON registered.id = row_state.worksheet_id
              WHERE registered.worksheet_title = ${WORKSHEET_TITLE}
            )
            SELECT evidence, count
            FROM evidence
            ORDER BY evidence
          `,
        ),
        prisma.$queryRaw<Array<{ duplicate_groups: bigint }>>(
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
        ),
      ]);
    const evidence = Object.fromEntries(
      evidenceRows.map((row) => [row.evidence, Number(row.count)]),
    );
    const duplicateGroupCount = Number(
      duplicateRows[0]?.duplicate_groups ?? BigInt(0),
    );
    const canonicalSnapshot = parseSchemaSnapshot(canonical?.schemaSnapshot);
    const canonicalSchemaComparison = canonicalSnapshot
      ? detectSchemaChange(
          canonicalSnapshot,
          preflight.schemaSnapshot,
          { allowObservedValueTypeDrift: true },
        )
      : null;
    const liveMatchesCanonicalSnapshot =
      canonical?.status === "ACTIVE" &&
      canonical?.sourceId === source?.id &&
      canonicalSchemaComparison?.changed === false;
    const cleanProductionState =
      Object.values(evidence).every((count) => count === 0) &&
      duplicateGroupCount === 0;
    const failedImportHistory = importRuns.filter((run) => run.status === "FAILED");
    const failedSyncHistory = syncRuns.filter((run) => run.status === "FAILED");
    const registryIdentityMatchesCurrentSource =
      registry?.worksheetKey === preflight.worksheetKey &&
      registry.worksheetTitle === preflight.worksheet.effective &&
      registry.sourceId === source?.id;
    const currentWorksheetIsValid =
      preflight.worksheet.known &&
      preflight.worksheetKey === EXPECTED_WORKSHEET_KEY &&
      preflight.worksheet.rowCount !== null &&
      registry?.rowCount === preflight.worksheet.rowCount &&
      preflight.mapping.status === "PASS" &&
      preflight.validation.status === "PASS" &&
      preflight.validation.validRecords === 352 &&
      preflight.validation.invalidRows === 0 &&
      preflight.classification.potentialDuplicates === 0 &&
      preflight.plan.status === "READY_FOR_IMPORT";
    const historicalErrorIsStale = isStaleHistoricalRegistryError({
      registry,
      expectedSourceId: source?.id ?? null,
      expectedWorksheetKey: EXPECTED_WORKSHEET_KEY,
      expectedWorksheetTitle: preflight.worksheet.effective,
      expectedWorksheetRowCount: preflight.worksheet.rowCount,
      currentWorksheetIsValid,
      liveMatchesCanonicalSnapshot,
      cleanProductionState,
      rowStateCount,
      failedImportCount: failedImportHistory.length,
      failedSyncCount: failedSyncHistory.length,
    });

    console.log(
      JSON.stringify(
        {
          status: "PASS_READ_ONLY_REGISTRY_AUDIT",
          target: target.target,
          targetIdentity: target.identity,
          databaseWrites: 0,
          worksheet: {
            requested: WORKSHEET_TITLE,
            expectedWorksheetKey: EXPECTED_WORKSHEET_KEY,
            discoveredWorksheetKey: preflight.worksheetKey,
            discoveredTitle: preflight.worksheet.effective,
            metadataRowCount: preflight.worksheet.rowCount,
            knownInRegistry: preflight.worksheet.known,
            registryStatusFromPreflight: preflight.worksheet.registryStatus,
            preflightStatus: preflight.status,
          },
          currentPlan: {
            mappingStatus: preflight.mapping.status,
            schemaClassification: preflight.mapping.schemaClassification,
            schemaHash: preflight.mapping.schemaHash,
            validationStatus: preflight.validation.status,
            sourceRows: preflight.validation.sourceRows,
            candidateRecords: preflight.validation.candidateRecords,
            validRecords: preflight.validation.validRecords,
            invalidRows: preflight.validation.invalidRows,
            potentialDuplicates: preflight.classification.potentialDuplicates,
            blockers: [
              ...preflight.mapping.blockers,
              ...preflight.validation.blockers,
              ...(preflight.worksheet.status === "BLOCKED"
                ? [`worksheet_registry_${preflight.worksheet.registryStatus?.toLowerCase()}`]
                : []),
            ].filter((value, index, values) => values.indexOf(value) === index),
          },
          source: source
            ? {
                id: source.id.toString(),
                sourceKey: source.sourceKey,
                provider: source.provider,
                externalIdPresent: Boolean(source.externalId),
                status: source.status,
                lastDiscoveredAt: iso(source.lastDiscoveredAt),
                lockExpiresAt: iso(source.lockExpiresAt),
                createdAt: iso(source.createdAt),
                updatedAt: iso(source.updatedAt),
              }
            : null,
          registry: registry
            ? {
                id: registry.id.toString(),
                sourceId: registry.sourceId.toString(),
                worksheetKey: registry.worksheetKey,
                worksheetTitle: registry.worksheetTitle,
                normalizedTitle: registry.normalizedTitle,
                status: registry.status,
                firstSeenAt: iso(registry.firstSeenAt),
                lastSeenAt: iso(registry.lastSeenAt),
                lastSyncAt: iso(registry.lastSyncAt),
                schemaHash: registry.schemaHash,
                schemaSnapshotPresent: Boolean(registry.schemaSnapshot),
                contentHash: registry.contentHash,
                rowCount: registry.rowCount,
                createdAt: iso(registry.createdAt),
                updatedAt: iso(registry.updatedAt),
              }
            : null,
          registryErrorField: {
            present: errorColumns.length > 0,
            columns: errorColumns.map((column) => column.column_name),
            persistedMessage: null,
            note: "sync_worksheets status is the error marker; related sync/import records carry messages.",
          },
          canonicalReference: canonical
            ? {
                id: canonical.id.toString(),
                sourceId: canonical.sourceId.toString(),
                worksheetKey: canonical.worksheetKey,
                worksheetTitle: canonical.worksheetTitle,
                status: canonical.status,
                lastSyncAt: iso(canonical.lastSyncAt),
                schemaHash: canonical.schemaHash,
                schemaSnapshotHash: snapshotHash(canonical.schemaSnapshot),
                normalizedSchemaSnapshotHash: canonicalSnapshot?.hash ?? null,
                schemaComparison: canonicalSchemaComparison
                  ? {
                      changed: canonicalSchemaComparison.changed,
                      type: canonicalSchemaComparison.type,
                      reason: canonicalSchemaComparison.reason,
                    }
                  : null,
                schemaSnapshotPresent: Boolean(canonical.schemaSnapshot),
                contentHash: canonical.contentHash,
                rowCount: canonical.rowCount,
                updatedAt: iso(canonical.updatedAt),
              }
            : null,
          history: {
            schemaChanges: schemaChanges.map((change) => ({
              id: change.id.toString(),
              detectedAt: iso(change.detectedAt),
              previousSchemaHash: change.previousSchemaHash,
              currentSchemaHash: change.currentSchemaHash,
              changeType: change.changeType,
              status: change.status,
              resolution: safeMessage(change.resolution),
              updatedAt: iso(change.updatedAt),
            })),
            importRuns: importRuns.map((run) => ({
              id: run.id.toString(),
              source: run.source,
              requestedWorksheet: run.requestedWorksheet,
              effectiveWorksheet: run.effectiveWorksheet,
              sourceRange: run.sourceRange,
              requestedPeriod: iso(run.requestedPeriod),
              effectivePeriod: iso(run.effectivePeriod),
              status: run.status,
              importedRows: run.importedRows,
              rejectedRows: run.rejectedRows,
              checksum: run.checksum,
              message: safeMessage(run.message),
              startedAt: iso(run.startedAt),
              completedAt: iso(run.completedAt),
            })),
            syncRuns: syncRuns.map((run) => ({
              id: run.id.toString(),
              triggerType: run.triggerType,
              status: run.status,
              startedAt: iso(run.startedAt),
              finishedAt: iso(run.finishedAt),
              worksheetsScanned: run.worksheetsScanned,
              rowsScanned: run.rowsScanned,
              inserted: run.inserted,
              updated: run.updated,
              skipped: run.skipped,
              failed: run.failed,
              durationMs: run.durationMs,
              errorSummary: safeMessage(run.errorSummary),
            })),
            syncRunAssociation: "source-level; sync_runs has no worksheet foreign key",
          },
          productionEvidence: {
            counts: evidence,
            duplicateGroups: duplicateGroupCount,
            rowStateCount,
          },
          conclusion: {
            classification: historicalErrorIsStale
              ? "STALE_HISTORICAL_ERROR"
              : "UNKNOWN",
            registryIdentityMatchesCurrentSource,
            currentWorksheetIsValid,
            liveMatchesCanonicalSnapshot,
            cleanProductionState,
            failedImportCount: failedImportHistory.length,
            failedSyncCount: failedSyncHistory.length,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL_READ_ONLY_REGISTRY_AUDIT",
        category: safeErrorCategory(error),
        databaseWrites: 0,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
