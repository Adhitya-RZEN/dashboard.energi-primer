import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const APP_TABLES = [
  "users",
  "password_reset_tokens",
  "sessions",
  "cache",
  "cache_locks",
  "jobs",
  "job_batches",
  "failed_jobs",
  "units",
  "coal_stock",
  "coal_quality",
  "coal_consumption",
  "power_generation",
  "kpi_targets",
  "spreadsheet_import_logs",
  "sync_sources",
  "sync_worksheets",
  "sync_runs",
  "sync_row_states",
  "sync_schema_changes",
  "spreadsheet_import_runs",
  "spreadsheet_import_staging",
  "biomass_receipts",
  "coal_receipts",
  "biomass_consumptions",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
];

const APPROVED_WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
];
const APPROVED_WORKSHEET_KEYS = APPROVED_WORKSHEETS.map((value) => value.toLowerCase());
const SCOPE_START = "2026-01-01";
const SCOPE_END = "2026-08-01";
const TARGET_TON = "70020";

const DATE_SCOPED_CONFIG = [
  {
    table: "coal_stock",
    delegate: "coalStock",
    columns: ["id", "date", "opening_stock", "received", "consumed", "closing_stock", "created_at", "updated_at"],
    dateColumn: "date",
  },
  {
    table: "coal_consumption",
    delegate: "coalConsumption",
    columns: ["id", "unit_id", "date", "coal_used", "sfc", "heat_rate", "boiler_efficiency", "created_at", "updated_at"],
    dateColumn: "date",
  },
  {
    table: "biomass_receipts",
    delegate: "biomassReceipt",
    columns: ["id", "import_run_id", "period_start", "supplier_code", "supplier_name", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "coal_receipts",
    delegate: "coalReceipt",
    columns: ["id", "import_run_id", "period_start", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "biomass_consumptions",
    delegate: "biomassConsumption",
    columns: ["id", "import_run_id", "unit_id", "reading_date", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "solar_receipts",
    delegate: "solarReceipt",
    columns: ["id", "import_run_id", "period_start", "quantity_liter", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "solar_consumptions",
    delegate: "solarConsumption",
    columns: ["id", "import_run_id", "reading_date", "quantity_liter", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "hop_readings",
    delegate: "hopReading",
    columns: ["id", "import_run_id", "unit_id", "reading_date", "hop_days", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "biomass_cumulative_snapshots",
    delegate: "biomassCumulativeSnapshot",
    columns: ["id", "import_run_id", "period_start", "cumulative_ton", "source", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
];

const UNITS_CONFIG = {
  table: "units",
  delegate: "unit",
  columns: ["id", "code", "name", "status", "created_at", "updated_at"],
};
const TARGET_CONFIG = {
  table: "biomass_targets",
  delegate: "biomassTarget",
  columns: ["id", "import_run_id", "target_year", "target_ton", "unit", "source", "status", "created_at", "updated_at"],
};
const SOURCE_CONFIG = {
  table: "sync_sources",
  delegate: "syncSource",
  columns: ["id", "source_key", "provider", "external_id", "status", "last_discovered_at", "lock_token", "lock_expires_at", "created_at", "updated_at"],
};
const IMPORT_RUN_CONFIG = {
  table: "spreadsheet_import_runs",
  delegate: "spreadsheetImportRun",
  columns: ["id", "source", "requested_worksheet", "effective_worksheet", "source_range", "requested_period", "effective_period", "status", "imported_rows", "rejected_rows", "checksum", "message", "started_at", "completed_at", "created_at", "updated_at"],
};
const WORKSHEET_CONFIG = {
  table: "sync_worksheets",
  delegate: "syncWorksheet",
  columns: ["id", "source_id", "worksheet_key", "worksheet_title", "normalized_title", "status", "first_seen_at", "last_seen_at", "last_sync_at", "schema_snapshot", "schema_hash", "content_hash", "row_count", "created_at", "updated_at"],
};
const ROW_STATE_CONFIG = {
  table: "sync_row_states",
  delegate: "syncRowState",
  columns: ["id", "worksheet_id", "source_key", "entity_type", "content_hash", "last_seen_at", "last_synced_at", "created_at", "updated_at"],
};
const STAGING_CONFIG = {
  table: "spreadsheet_import_staging",
  delegate: "spreadsheetImportStaging",
  columns: ["id", "import_run_id", "entity_type", "source_worksheet", "source_row", "source_column", "source_address", "period_start", "reading_date", "unit_code", "supplier_code", "raw_value", "normalized_value", "value_unit", "validation_status", "validation_message", "created_at"],
};

const quoteIdentifier = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("UNSAFE_IDENTIFIER");
  return `"${value}"`;
};
const tableName = (value) => `public.${quoteIdentifier(value)}`;
const quoteLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

function camelCase(value) {
  return value.replace(/_([a-z])/g, (_match, character) => character.toUpperCase());
}

const PRISMA_FIELD_ALIASES = {
  biomass_receipts: { source_worksheet: "sourceSheet" },
  coal_receipts: { source_worksheet: "sourceSheet" },
  biomass_consumptions: { source_worksheet: "sourceSheet" },
  solar_receipts: { source_worksheet: "sourceSheet" },
  solar_consumptions: { source_worksheet: "sourceSheet" },
  hop_readings: { source_worksheet: "sourceSheet" },
};

function sourceRowToPrisma(config, row) {
  const aliases = PRISMA_FIELD_ALIASES[config.table] ?? {};
  return Object.fromEntries(config.columns.map((column) => [aliases[column] ?? camelCase(column), row[column]]));
}

function canonicalValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.toString === "function") return value.toString();
  return value;
}

function rowHash(config, row) {
  const payload = config.columns.map((column) => [column, canonicalValue(row[column])]);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("password") || message.includes("authentication failed")) return "AUTHENTICATION_FAILED";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "TLS_OR_SSL_FAILED";
  if (message.includes("timeout") || message.includes("can't reach") || message.includes("could not connect") || message.includes("eai_again")) return "NETWORK_OR_REACHABILITY_FAILED";
  if (message.includes("unique constraint") || message.includes("duplicate key")) return "TARGET_UNIQUE_CONSTRAINT_CONFLICT";
  return "CONTROLLED_DATA_MIGRATION_FAILED";
}

function safeErrorDiagnostics(error) {
  return {
    category: sanitizeError(error),
    name: error instanceof Error ? error.name : "UnknownError",
    code: typeof error?.code === "string" ? error.code : "UNSPECIFIED",
    clientVersion: typeof error?.clientVersion === "string" ? error.clientVersion : undefined,
    dataset: typeof error?.migrationDataset === "string" ? error.migrationDataset : undefined,
    metaKeys: error?.meta && typeof error.meta === "object" ? Object.keys(error.meta).sort() : [],
  };
}

function targetUrlForWrite(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "postgresql:") throw new Error("SUPABASE_DIRECT_URL must use postgresql protocol.");
  if (parsed.port !== "5432") throw new Error("Only Supabase Direct Connection port 5432 is allowed for data migration.");
  if (!parsed.hostname.toLowerCase().endsWith(".supabase.co")) throw new Error("SUPABASE_DIRECT_URL_HOST_GUARD_FAILED");
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

async function metadata(client) {
  const [row] = await client.$queryRawUnsafe(`
    SELECT current_database() AS database_name,
           current_user AS current_role,
           current_schema() AS current_schema,
           current_setting('server_version') AS server_version,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_enabled
  `);
  return {
    database: row.database_name,
    role: row.current_role,
    schema: row.current_schema,
    postgresql: String(row.server_version).match(/(?:PostgreSQL )?([0-9]+(?:\.[0-9]+)+)/)?.[1] ?? "unknown",
    ssl: row.ssl_enabled === true,
  };
}

async function assertLocalSource(client, url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgresql:" || !new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) {
    throw new Error("LOCAL_SOURCE_URL_GUARD_FAILED");
  }
  const info = await metadata(client);
  if (info.database !== "dashboard_pln" || info.schema !== "public") throw new Error("LOCAL_SOURCE_GUARD_FAILED");
  return info;
}

async function selectRows(client, config, where = "TRUE", parameters = []) {
  const columns = config.columns.map(quoteIdentifier).join(", ");
  const order = config.columns.includes("id") ? ` ORDER BY ${quoteIdentifier("id")}` : "";
  return client.$queryRawUnsafe(`SELECT ${columns} FROM ${tableName(config.table)} WHERE ${where}${order}`, ...parameters);
}

async function selectRowsByIds(client, config, column, ids) {
  if (!ids.length) return [];
  const columns = config.columns.map(quoteIdentifier).join(", ");
  const order = config.columns.includes("id") ? ` ORDER BY ${quoteIdentifier("id")}` : "";
  return client.$queryRawUnsafe(`SELECT ${columns} FROM ${tableName(config.table)} WHERE ${quoteIdentifier(column)} = ANY($1::bigint[])${order}`, ids);
}

async function loadSource(client) {
  const source = {};
  source.units = await selectRows(client, UNITS_CONFIG);
  if (source.units.length !== 3) throw new Error(`EXPECTED_THREE_UNITS_RECEIVED_${source.units.length}`);
  const unitNames = source.units.map((row) => String(row.name)).sort();
  if (JSON.stringify(unitNames) !== JSON.stringify(["Unit 1", "Unit 2", "Unit 3"])) throw new Error("UNIT_IDENTITY_GUARD_FAILED");

  for (const config of DATE_SCOPED_CONFIG) {
    source[config.table] = await selectRows(
      client,
      config,
      `${quoteIdentifier(config.dateColumn)} >= DATE '${SCOPE_START}' AND ${quoteIdentifier(config.dateColumn)} < DATE '${SCOPE_END}'`,
    );
  }

  source.biomassTargets = await selectRows(
    client,
    TARGET_CONFIG,
    `${quoteIdentifier("target_year")} = 2026 AND ${quoteIdentifier("target_ton")} = ${TARGET_TON}`,
  );
  if (source.biomassTargets.length !== 1) throw new Error("APPROVED_BIOMASS_TARGET_70020_NOT_UNIQUE");

  source.syncWorksheets = await selectRows(
    client,
    WORKSHEET_CONFIG,
    `lower(trim(${quoteIdentifier("worksheet_title")})) = ANY($1::text[])`,
    [APPROVED_WORKSHEET_KEYS],
  );
  if (source.syncWorksheets.length !== APPROVED_WORKSHEETS.length) throw new Error(`EXPECTED_SEVEN_APPROVED_WORKSHEETS_RECEIVED_${source.syncWorksheets.length}`);
  const worksheetIds = source.syncWorksheets.map((row) => row.id);

  source.syncSources = await selectRows(
    client,
    SOURCE_CONFIG,
    `${quoteIdentifier("id")} = ANY($1::bigint[])`,
    [[...new Set(source.syncWorksheets.map((row) => row.source_id))]],
  );
  if (source.syncSources.length !== 1) throw new Error(`EXPECTED_ONE_SYNC_SOURCE_RECEIVED_${source.syncSources.length}`);

  source.importRuns = await selectRows(
    client,
    IMPORT_RUN_CONFIG,
    `${quoteIdentifier("requested_period")} >= DATE '${SCOPE_START}'
      AND ${quoteIdentifier("requested_period")} < DATE '${SCOPE_END}'
      AND ${quoteIdentifier("status")} = 'SUCCESS'
      AND lower(coalesce(${quoteIdentifier("effective_worksheet")}, ${quoteIdentifier("requested_worksheet")})) = ANY($1::text[])`,
    [APPROVED_WORKSHEET_KEYS],
  );
  if (!source.importRuns.length) throw new Error("NO_APPROVED_SUCCESSFUL_IMPORT_RUNS");
  const importRunIds = source.importRuns.map((row) => row.id);

  source.staging = await selectRowsByIds(client, STAGING_CONFIG, "import_run_id", importRunIds);
  source.syncRowStates = await selectRowsByIds(client, ROW_STATE_CONFIG, "worksheet_id", worksheetIds);
  if (source.syncRowStates.length !== 2409) throw new Error(`EXPECTED_2409_SYNC_ROW_STATES_RECEIVED_${source.syncRowStates.length}`);

  return source;
}

function buildDatasets(source) {
  return [
    { config: UNITS_CONFIG, rows: source.units },
    { config: SOURCE_CONFIG, rows: source.syncSources },
    { config: IMPORT_RUN_CONFIG, rows: source.importRuns },
    { config: WORKSHEET_CONFIG, rows: source.syncWorksheets },
    ...DATE_SCOPED_CONFIG.map((config) => ({ config, rows: source[config.table] })),
    { config: TARGET_CONFIG, rows: source.biomassTargets },
    { config: STAGING_CONFIG, rows: source.staging },
    { config: ROW_STATE_CONFIG, rows: source.syncRowStates },
  ];
}

async function targetApplicationCounts(client) {
  const counts = {};
  for (const table of APP_TABLES) {
    const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS rows FROM ${tableName(table)}`);
    counts[table] = Number(row.rows);
  }
  return counts;
}

async function targetRows(client, config) {
  return selectRows(client, config);
}

function compareDataset(dataset, existingRows) {
  const config = dataset.config;
  const sourceById = new Map(dataset.rows.map((row) => [String(row.id), row]));
  const targetById = new Map(existingRows.map((row) => [String(row.id), row]));
  const extra = [...targetById.keys()].filter((id) => !sourceById.has(id));
  const mismatches = [];
  const missing = [];
  let skipped = 0;
  for (const [id, sourceRow] of sourceById) {
    const targetRow = targetById.get(id);
    if (!targetRow) {
      missing.push(sourceRow);
      continue;
    }
    if (rowHash(config, sourceRow) !== rowHash(config, targetRow)) {
      if (mismatches.length < 10) mismatches.push(id);
    } else {
      skipped += 1;
    }
  }
  return {
    table: config.table,
    sourceRows: dataset.rows.length,
    targetRows: existingRows.length,
    insert: missing.length,
    update: 0,
    skip: skipped,
    extraRows: extra.length,
    mismatches,
    failed: 0,
    missingRows: missing,
  };
}

async function sequenceState(client, dataset) {
  if (!dataset.rows.length || !dataset.config.columns.includes("id")) return null;
  const [serial] = await client.$queryRawUnsafe(`SELECT pg_get_serial_sequence(${quoteLiteral(`public.${dataset.config.table}`)}, 'id') AS sequence_name`);
  if (!serial?.sequence_name) return null;
  const sequence = String(serial.sequence_name).replaceAll('"', "").split(".").at(-1);
  const [row] = await client.$queryRawUnsafe(`
    SELECT last_value::text AS last_value
    FROM pg_sequences
    WHERE schemaname = 'public' AND sequencename = ${quoteLiteral(sequence)}
  `);
  const maximumId = dataset.rows.reduce((max, sourceRow) => {
    const value = BigInt(sourceRow.id);
    return value > max ? value : max;
  }, BigInt(0));
  const lastValue = row?.last_value === null || row?.last_value === undefined ? null : BigInt(row.last_value);
  return {
    table: dataset.config.table,
    sequence: `public.${sequence}`,
    maximumImportedId: maximumId,
    currentLastValue: lastValue,
    needsSetval: lastValue === null || lastValue < maximumId,
  };
}

async function setSequence(tx, state) {
  if (!state?.needsSetval) return;
  await tx.$queryRawUnsafe(`SELECT setval(${quoteLiteral(state.sequence)}, ${state.maximumImportedId.toString()}, true)`);
}

function summarizeSource(source) {
  return {
    units: source.units.length,
    coal_stock: source.coal_stock.length,
    coal_consumption: source.coal_consumption.length,
    biomass_receipts: source.biomass_receipts.length,
    coal_receipts: source.coal_receipts.length,
    biomass_consumptions: source.biomass_consumptions.length,
    solar_receipts: source.solar_receipts.length,
    solar_consumptions: source.solar_consumptions.length,
    hop_readings: source.hop_readings.length,
    biomass_targets: source.biomassTargets.length,
    biomass_cumulative_snapshots: source.biomass_cumulative_snapshots.length,
    sync_sources: source.syncSources.length,
    sync_worksheets: source.syncWorksheets.length,
    sync_row_states: source.syncRowStates.length,
    spreadsheet_import_runs: source.importRuns.length,
    spreadsheet_import_staging: source.staging.length,
  };
}

const writesAllowed = process.argv.includes("--execute");
const localUrl = process.env.DATABASE_URL?.trim();
const directUrl = process.env.SUPABASE_DIRECT_URL?.trim();

if (!writesAllowed) {
  console.log(JSON.stringify({
    phase: "21F-2",
    status: "EXECUTION_FLAG_REQUIRED",
    message: "Use --execute only after the read-only Phase 21F-1 dry-run is READY_FOR_DATA_MIGRATION.",
    localDatabaseWrites: 0,
    supabaseWrites: 0,
  }, null, 2));
  process.exitCode = 2;
} else if (!localUrl || !directUrl) {
  console.log(JSON.stringify({
    phase: "21F-2",
    status: "DATA_MIGRATION_REVIEW_REQUIRED",
    blockers: ["DATABASE_URL_OR_SUPABASE_DIRECT_URL_MISSING"],
    localDatabaseWrites: 0,
    supabaseWrites: 0,
  }, null, 2));
  process.exitCode = 1;
} else {
  const sourceClient = new PrismaClient({ datasourceUrl: localUrl });
  let targetClient;
  try {
    const sourceMetadata = await assertLocalSource(sourceClient, localUrl);
    const source = await loadSource(sourceClient);
    const datasets = buildDatasets(source);
    const targetWriteUrl = targetUrlForWrite(directUrl);
    targetClient = new PrismaClient({ datasourceUrl: targetWriteUrl });
    const targetMetadata = await metadata(targetClient);
    if (targetMetadata.database !== "postgres" || targetMetadata.schema !== "public" || !targetMetadata.ssl) throw new Error("SUPABASE_TARGET_GUARD_FAILED");

    const targetCountsBefore = await targetApplicationCounts(targetClient);
    const skippedTargetTables = APP_TABLES.filter((table) => !datasets.some((dataset) => dataset.config.table === table));
    const unexpectedSkippedRows = skippedTargetTables.filter((table) => targetCountsBefore[table] > 0);
    if (unexpectedSkippedRows.length) throw new Error(`TARGET_HAS_UNAPPROVED_ROWS_${unexpectedSkippedRows.join(",")}`);

    const comparisons = [];
    for (const dataset of datasets) {
      const existing = await targetRows(targetClient, dataset.config);
      const comparison = compareDataset(dataset, existing);
      if (comparison.extraRows || comparison.mismatches.length) throw new Error(`TARGET_DATA_MISMATCH_${dataset.config.table}`);
      comparisons.push(comparison);
    }
    const totalMissing = comparisons.reduce((sum, item) => sum + item.insert, 0);
    const totalSkipped = comparisons.reduce((sum, item) => sum + item.skip, 0);
    const sequenceStates = [];
    for (const dataset of datasets) sequenceStates.push(await sequenceState(targetClient, dataset));

    const writes = {
      tables: 0,
      rows: 0,
      sequences: 0,
    };
    if (totalMissing > 0 || sequenceStates.some((state) => state?.needsSetval)) {
      await targetClient.$transaction(async (tx) => {
        for (const dataset of datasets) {
          const comparison = comparisons.find((item) => item.table === dataset.config.table);
          if (!comparison?.missingRows.length) continue;
          const delegate = tx[dataset.config.delegate];
          try {
            await delegate.createMany({ data: comparison.missingRows.map((row) => sourceRowToPrisma(dataset.config, row)) });
          } catch (error) {
            if (error && typeof error === "object") error.migrationDataset = dataset.config.table;
            throw error;
          }
          writes.tables += 1;
          writes.rows += comparison.missingRows.length;
        }
        for (const state of sequenceStates) {
          if (!state?.needsSetval) continue;
          await setSequence(tx, state);
          writes.sequences += 1;
        }
      }, { timeout: 120_000, maxWait: 20_000 });
    }

    const targetCountsAfter = await targetApplicationCounts(targetClient);
    const afterComparisons = [];
    for (const dataset of datasets) {
      const existing = await targetRows(targetClient, dataset.config);
      const comparison = compareDataset(dataset, existing);
      if (comparison.extraRows || comparison.mismatches.length || comparison.insert) throw new Error(`POST_IMPORT_PARITY_FAILED_${dataset.config.table}`);
      afterComparisons.push(comparison);
    }
    if (skippedTargetTables.some((table) => targetCountsAfter[table] > 0)) throw new Error("POST_IMPORT_UNAPPROVED_TABLE_DATA");

    const totalTargetRows = Object.values(targetCountsAfter).reduce((sum, value) => sum + value, 0);
    console.log(JSON.stringify({
      phase: "21F-2",
      status: "PASS",
      mode: "CONTROLLED_IDEMPOTENT_SUPABASE_DATA_MIGRATION",
      source: {
        database: sourceMetadata.database,
        postgresql: sourceMetadata.postgresql,
        scope: `${SCOPE_START} to ${SCOPE_END} exclusive`,
        approvedWorksheets: APPROVED_WORKSHEETS,
        counts: summarizeSource(source),
      },
      target: {
        database: targetMetadata.database,
        role: targetMetadata.role,
        postgresql: targetMetadata.postgresql,
        ssl: targetMetadata.ssl,
        applicationRowsBefore: Object.values(targetCountsBefore).reduce((sum, value) => sum + value, 0),
        applicationRowsAfter: totalTargetRows,
        countsAfter: targetCountsAfter,
      },
      rowActions: afterComparisons.map(({ table, sourceRows, targetRows: rows, insert, update, skip, failed }) => ({ table, sourceRows, targetRows: rows, insert, update, skip, failed })),
      firstPassActions: comparisons.map(({ table, sourceRows, targetRows: rows, insert, update, skip, failed }) => ({ table, sourceRows, targetRows: rows, insert, update, skip, failed })),
      sequenceAdjustments: sequenceStates.filter((state) => state?.needsSetval).map((state) => ({ table: state.table, maximumImportedId: state.maximumImportedId.toString() })),
      writes: {
        targetTablesWritten: writes.tables,
        targetRowsWritten: writes.rows,
        targetSequenceAdjustments: writes.sequences,
        localDatabaseWrites: 0,
        supabaseDataWrites: writes.rows,
        supabaseSequenceWrites: writes.sequences,
      },
      idempotency: {
        firstPassMissingRows: totalMissing,
        firstPassExistingExactRows: totalSkipped,
        secondPassInsert: afterComparisons.reduce((sum, item) => sum + item.insert, 0),
        secondPassUpdate: afterComparisons.reduce((sum, item) => sum + item.update, 0),
        secondPassSkip: afterComparisons.reduce((sum, item) => sum + item.skip, 0),
        secondPassFailed: afterComparisons.reduce((sum, item) => sum + item.failed, 0),
        note: "The second-pass counts are a read-only post-write parity check; no second write pass is executed.",
      },
      excluded: {
        authentication: ["users", "password_reset_tokens", "sessions"],
        transient: ["cache", "cache_locks", "jobs", "job_batches", "failed_jobs"],
        legacyOutsideApprovedMapping: ["coal_quality", "power_generation", "kpi_targets"],
        ambiguousSyncHistory: ["sync_runs", "sync_schema_changes"],
        absentOrEmptyMetadata: ["spreadsheet_import_logs"],
        futureScope: ["BIOMASS_STOCK"],
      },
      safety: {
        localDatabaseUrlChanged: false,
        localDatabaseWrites: 0,
        schemaWrites: 0,
        migrationCommands: 0,
        googleSheetsSyncExecuted: false,
        vercelDeployment: false,
      },
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      phase: "21F-2",
      status: "BLOCKED",
      error: safeErrorDiagnostics(error),
      localDatabaseWrites: 0,
      supabaseWrites: 0,
      note: "The controlled transaction is aborted on the first guard or parity failure; no cleanup or destructive operation is attempted.",
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await sourceClient.$disconnect().catch(() => undefined);
    if (targetClient) await targetClient.$disconnect().catch(() => undefined);
  }
}
