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
const TARGET_TON = 70020;

const DATE_SCOPED_CONFIG = [
  {
    table: "coal_stock",
    columns: ["id", "date", "opening_stock", "received", "consumed", "closing_stock", "created_at", "updated_at"],
    dateColumn: "date",
  },
  {
    table: "coal_consumption",
    columns: ["id", "unit_id", "date", "coal_used", "sfc", "heat_rate", "boiler_efficiency", "created_at", "updated_at"],
    dateColumn: "date",
  },
  {
    table: "biomass_receipts",
    columns: ["id", "import_run_id", "period_start", "supplier_code", "supplier_name", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "coal_receipts",
    columns: ["id", "import_run_id", "period_start", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "biomass_consumptions",
    columns: ["id", "import_run_id", "unit_id", "reading_date", "quantity_ton", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "solar_receipts",
    columns: ["id", "import_run_id", "period_start", "quantity_liter", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
  {
    table: "solar_consumptions",
    columns: ["id", "import_run_id", "reading_date", "quantity_liter", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "hop_readings",
    columns: ["id", "import_run_id", "unit_id", "reading_date", "hop_days", "source_worksheet", "source_cell", "created_at", "updated_at"],
    dateColumn: "reading_date",
  },
  {
    table: "biomass_cumulative_snapshots",
    columns: ["id", "import_run_id", "period_start", "cumulative_ton", "source", "source_cell", "created_at", "updated_at"],
    dateColumn: "period_start",
  },
];

const UNITS_CONFIG = {
  table: "units",
  columns: ["id", "code", "name", "status", "created_at", "updated_at"],
};
const TARGET_CONFIG = {
  table: "biomass_targets",
  columns: ["id", "import_run_id", "target_year", "target_ton", "unit", "source", "status", "created_at", "updated_at"],
};
const SOURCE_CONFIG = {
  table: "sync_sources",
  columns: ["id", "source_key", "provider", "external_id", "status", "last_discovered_at", "lock_token", "lock_expires_at", "created_at", "updated_at"],
};
const IMPORT_RUN_CONFIG = {
  table: "spreadsheet_import_runs",
  columns: ["id", "source", "requested_worksheet", "effective_worksheet", "source_range", "requested_period", "effective_period", "status", "imported_rows", "rejected_rows", "checksum", "message", "started_at", "completed_at", "created_at", "updated_at"],
};
const WORKSHEET_CONFIG = {
  table: "sync_worksheets",
  columns: ["id", "source_id", "worksheet_key", "worksheet_title", "normalized_title", "status", "first_seen_at", "last_seen_at", "last_sync_at", "schema_snapshot", "schema_hash", "content_hash", "row_count", "created_at", "updated_at"],
};
const ROW_STATE_CONFIG = {
  table: "sync_row_states",
  columns: ["id", "worksheet_id", "source_key", "entity_type", "content_hash", "last_seen_at", "last_synced_at", "created_at", "updated_at"],
};
const STAGING_CONFIG = {
  table: "spreadsheet_import_staging",
  columns: ["id", "import_run_id", "entity_type", "source_worksheet", "source_row", "source_column", "source_address", "period_start", "reading_date", "unit_code", "supplier_code", "raw_value", "normalized_value", "value_unit", "validation_status", "validation_message", "created_at"],
};

const EXCLUDED_TABLES = {
  authentication: ["users", "password_reset_tokens", "sessions"],
  transient: ["cache", "cache_locks", "jobs", "job_batches", "failed_jobs"],
  legacyOutsideApprovedMapping: ["coal_quality", "power_generation", "kpi_targets"],
  ambiguousSyncHistory: ["sync_runs", "sync_schema_changes"],
  absentOrEmptyMetadata: ["spreadsheet_import_logs"],
};

const DUPLICATE_KEYS = [
  ["units", ["code"]],
  ["coal_stock", ["date"]],
  ["coal_consumption", ["unit_id", "date"]],
  ["sync_sources", ["source_key"]],
  ["sync_worksheets", ["source_id", "worksheet_key"]],
  ["sync_row_states", ["worksheet_id", "source_key"]],
  ["biomass_receipts", ["period_start", "supplier_code"]],
  ["coal_receipts", ["period_start"]],
  ["biomass_consumptions", ["unit_id", "reading_date"]],
  ["solar_receipts", ["period_start"]],
  ["solar_consumptions", ["reading_date"]],
  ["hop_readings", ["unit_id", "reading_date"]],
  ["biomass_targets", ["target_year"]],
  ["biomass_cumulative_snapshots", ["period_start"]],
];

const ORPHAN_CHECKS = [
  ["sync_worksheets", "source_id", "sync_sources"],
  ["sync_row_states", "worksheet_id", "sync_worksheets"],
  ["spreadsheet_import_staging", "import_run_id", "spreadsheet_import_runs"],
  ["biomass_receipts", "import_run_id", "spreadsheet_import_runs"],
  ["coal_receipts", "import_run_id", "spreadsheet_import_runs"],
  ["biomass_consumptions", "import_run_id", "spreadsheet_import_runs"],
  ["solar_receipts", "import_run_id", "spreadsheet_import_runs"],
  ["solar_consumptions", "import_run_id", "spreadsheet_import_runs"],
  ["hop_readings", "import_run_id", "spreadsheet_import_runs"],
  ["biomass_targets", "import_run_id", "spreadsheet_import_runs"],
  ["biomass_cumulative_snapshots", "import_run_id", "spreadsheet_import_runs"],
  ["coal_consumption", "unit_id", "units"],
  ["biomass_consumptions", "unit_id", "units"],
  ["hop_readings", "unit_id", "units"],
];

const quoteIdentifier = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("UNSAFE_IDENTIFIER");
  return `"${value}"`;
};
const tableName = (value) => `public.${quoteIdentifier(value)}`;

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

function shapeUrl(value) {
  if (!value) return { configured: false };
  try {
    const parsed = new URL(value);
    return {
      configured: true,
      protocol: parsed.protocol,
      host: parsed.hostname,
      port: parsed.port || "DEFAULT",
      usernamePresent: Boolean(parsed.username),
      passwordPresent: Boolean(parsed.password),
      sslmode: parsed.searchParams.get("sslmode")?.toLowerCase() ?? "ABSENT",
    };
  } catch {
    return { configured: true, status: "INVALID_URL_SHAPE" };
  }
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("password") || message.includes("authentication failed")) return "AUTHENTICATION_FAILED";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "TLS_OR_SSL_FAILED";
  if (message.includes("timeout") || message.includes("can't reach") || message.includes("could not connect") || message.includes("eai_again")) return "NETWORK_OR_REACHABILITY_FAILED";
  return "READ_ONLY_PARITY_VERIFICATION_FAILED";
}

function targetUrlForRead(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "postgresql:") throw new Error("SUPABASE_DIRECT_URL must use postgresql protocol.");
  if (parsed.port !== "5432") throw new Error("SUPABASE_DIRECT_URL must use direct port 5432.");
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
  if (parsed.protocol !== "postgresql:" || !new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)) throw new Error("LOCAL_SOURCE_URL_GUARD_FAILED");
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
  for (const config of DATE_SCOPED_CONFIG) {
    source[config.table] = await selectRows(
      client,
      config,
      `${quoteIdentifier(config.dateColumn)} >= DATE '${SCOPE_START}' AND ${quoteIdentifier(config.dateColumn)} < DATE '${SCOPE_END}'`,
    );
  }
  source.biomassTargets = await selectRows(client, TARGET_CONFIG, `${quoteIdentifier("target_year")} = 2026 AND ${quoteIdentifier("target_ton")} = ${TARGET_TON}`);
  source.syncWorksheets = await selectRows(
    client,
    WORKSHEET_CONFIG,
    `lower(trim(${quoteIdentifier("worksheet_title")})) = ANY($1::text[])`,
    [APPROVED_WORKSHEET_KEYS],
  );
  const worksheetIds = source.syncWorksheets.map((row) => row.id);
  source.syncSources = await selectRows(
    client,
    SOURCE_CONFIG,
    `${quoteIdentifier("id")} = ANY($1::bigint[])`,
    [[...new Set(source.syncWorksheets.map((row) => row.source_id))]],
  );
  source.importRuns = await selectRows(
    client,
    IMPORT_RUN_CONFIG,
    `${quoteIdentifier("requested_period")} >= DATE '${SCOPE_START}'
      AND ${quoteIdentifier("requested_period")} < DATE '${SCOPE_END}'
      AND ${quoteIdentifier("status")} = 'SUCCESS'
      AND lower(coalesce(${quoteIdentifier("effective_worksheet")}, ${quoteIdentifier("requested_worksheet")})) = ANY($1::text[])`,
    [APPROVED_WORKSHEET_KEYS],
  );
  const importRunIds = source.importRuns.map((row) => row.id);
  source.staging = await selectRowsByIds(client, STAGING_CONFIG, "import_run_id", importRunIds);
  source.syncRowStates = await selectRowsByIds(client, ROW_STATE_CONFIG, "worksheet_id", worksheetIds);
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

function compareDataset(dataset, existingRows) {
  const sourceById = new Map(dataset.rows.map((row) => [String(row.id), row]));
  const targetById = new Map(existingRows.map((row) => [String(row.id), row]));
  const missing = [];
  const mismatches = [];
  let exact = 0;
  for (const [id, sourceRow] of sourceById) {
    const targetRow = targetById.get(id);
    if (!targetRow) {
      missing.push(id);
      continue;
    }
    if (rowHash(dataset.config, sourceRow) !== rowHash(dataset.config, targetRow)) {
      if (mismatches.length < 10) mismatches.push(id);
      continue;
    }
    exact += 1;
  }
  const extra = [...targetById.keys()].filter((id) => !sourceById.has(id));
  return {
    table: dataset.config.table,
    sourceRows: dataset.rows.length,
    targetRows: existingRows.length,
    exactRows: exact,
    missingRows: missing.length,
    extraRows: extra.length,
    mismatches,
  };
}

async function duplicateSummary(client, table, columns) {
  const groupedColumns = columns.map(quoteIdentifier).join(", ");
  const [row] = await client.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS groups,
           COALESCE(SUM(duplicate_count), 0)::bigint AS duplicate_rows
    FROM (
      SELECT COUNT(*)::bigint - 1 AS duplicate_count
      FROM ${tableName(table)}
      GROUP BY ${groupedColumns}
      HAVING COUNT(*) > 1
    ) duplicates
  `);
  return { table, key: columns, groups: Number(row.groups), duplicateRows: Number(row.duplicate_rows) };
}

async function orphanCount(client, childTable, childColumn, parentTable) {
  const [row] = await client.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS rows
    FROM ${tableName(childTable)} child
    LEFT JOIN ${tableName(parentTable)} parent ON parent.id = child.${quoteIdentifier(childColumn)}
    WHERE child.${quoteIdentifier(childColumn)} IS NOT NULL AND parent.id IS NULL
  `);
  return { childTable, childColumn, parentTable, rows: Number(row.rows) };
}

async function sequenceSummary(client, dataset) {
  if (!dataset.rows.length) return null;
  const [serial] = await client.$queryRawUnsafe(`SELECT pg_get_serial_sequence('public.${dataset.config.table}', 'id') AS sequence_name`);
  if (!serial?.sequence_name) return { table: dataset.config.table, sequence: null, maximumImportedId: null, lastValue: null, ok: true };
  const sequence = String(serial.sequence_name).replaceAll('"', "").split(".").at(-1);
  const [row] = await client.$queryRawUnsafe(`
    SELECT last_value::text AS last_value
    FROM pg_sequences
    WHERE schemaname = 'public' AND sequencename = '${sequence.replaceAll("'", "''")}'
  `);
  const maximumImportedId = dataset.rows.reduce((max, sourceRow) => {
    const value = BigInt(sourceRow.id);
    return value > max ? value : max;
  }, BigInt(0));
  const lastValue = row?.last_value === null || row?.last_value === undefined ? null : BigInt(row.last_value);
  return {
    table: dataset.config.table,
    sequence: `public.${sequence}`,
    maximumImportedId: maximumImportedId.toString(),
    lastValue: lastValue?.toString() ?? null,
    ok: lastValue !== null && lastValue >= maximumImportedId,
  };
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + Number(canonicalValue(row[field]) ?? 0), 0);
}

function numberEqual(left, right) {
  return Math.abs(left - right) < 0.000001;
}

const localUrl = process.env.DATABASE_URL?.trim();
const directUrl = process.env.SUPABASE_DIRECT_URL?.trim();

if (!localUrl || !directUrl) {
  console.log(JSON.stringify({
    phase: "21F-3",
    status: "BLOCKED",
    error: "DATABASE_URL_OR_SUPABASE_DIRECT_URL_MISSING",
    localDatabaseWrites: 0,
    supabaseWrites: 0,
  }, null, 2));
  process.exitCode = 1;
} else {
  const localClient = new PrismaClient({ datasourceUrl: localUrl });
  let targetClient;
  try {
    const localMetadata = await assertLocalSource(localClient, localUrl);
    const source = await loadSource(localClient);
    const datasets = buildDatasets(source);
    const targetUrl = targetUrlForRead(directUrl);
    targetClient = new PrismaClient({ datasourceUrl: targetUrl });
    const targetMetadata = await metadata(targetClient);
    if (targetMetadata.database !== "postgres" || targetMetadata.schema !== "public" || !targetMetadata.ssl) throw new Error("SUPABASE_TARGET_GUARD_FAILED");

    const targetCounts = await targetApplicationCounts(targetClient);
    const comparisons = [];
    for (const dataset of datasets) comparisons.push(compareDataset(dataset, await selectRows(targetClient, dataset.config)));

    const duplicateChecks = [];
    for (const [table, columns] of DUPLICATE_KEYS) duplicateChecks.push(await duplicateSummary(targetClient, table, columns));
    const orphanChecks = [];
    for (const [childTable, childColumn, parentTable] of ORPHAN_CHECKS) orphanChecks.push(await orphanCount(targetClient, childTable, childColumn, parentTable));

    const sequenceChecks = [];
    for (const dataset of datasets) sequenceChecks.push(await sequenceSummary(targetClient, dataset));

    const targetUnits = await selectRows(targetClient, UNITS_CONFIG);
    const targetTarget = await selectRows(targetClient, TARGET_CONFIG, `${quoteIdentifier("target_year")} = 2026`);
    const biomassSource = source.biomass_consumptions;
    const biomassTarget = await selectRows(targetClient, DATE_SCOPED_CONFIG.find((config) => config.table === "biomass_consumptions"));
    const biomassReceiptSource = source.biomass_receipts;
    const biomassReceiptTarget = await selectRows(targetClient, DATE_SCOPED_CONFIG.find((config) => config.table === "biomass_receipts"));
    const solarConsumptionSource = source.solar_consumptions;
    const solarConsumptionTarget = await selectRows(targetClient, DATE_SCOPED_CONFIG.find((config) => config.table === "solar_consumptions"));
    const coalConsumptionSource = source.coal_consumption;
    const coalConsumptionTarget = await selectRows(targetClient, DATE_SCOPED_CONFIG.find((config) => config.table === "coal_consumption"));

    const [biomassStockTable] = await targetClient.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS tables
      FROM information_schema.tables
      WHERE table_schema = 'public' AND lower(table_name) = 'biomass_stock'
    `);

    const expectedCounts = Object.fromEntries(datasets.map((dataset) => [dataset.config.table, dataset.rows.length]));
    const excludedCounts = Object.fromEntries(Object.values(EXCLUDED_TABLES).flat().map((table) => [table, targetCounts[table]]));
    const comparisonFailures = comparisons.filter((item) => item.missingRows || item.extraRows || item.mismatches.length);
    const duplicateFailures = duplicateChecks.filter((item) => item.duplicateRows > 0);
    const orphanFailures = orphanChecks.filter((item) => item.rows > 0);
    const sequenceFailures = sequenceChecks.filter((item) => item && !item.ok);
    const targetCountFailures = Object.entries(expectedCounts).filter(([table, expected]) => targetCounts[table] !== expected);
    const excludedDataFailures = Object.entries(excludedCounts).filter(([, count]) => count !== 0);
    const unitNames = targetUnits.map((row) => String(row.name)).sort();
    const expectedUnitNames = ["Unit 1", "Unit 2", "Unit 3"];
    const targetValue = targetTarget.length === 1 ? Number(canonicalValue(targetTarget[0].target_ton)) : null;
    const aggregateChecks = [
      { metric: "biomass_consumptions.quantity_ton", source: sumField(biomassSource, "quantity_ton"), target: sumField(biomassTarget, "quantity_ton") },
      { metric: "biomass_receipts.quantity_ton", source: sumField(biomassReceiptSource, "quantity_ton"), target: sumField(biomassReceiptTarget, "quantity_ton") },
      { metric: "solar_consumptions.quantity_liter", source: sumField(solarConsumptionSource, "quantity_liter"), target: sumField(solarConsumptionTarget, "quantity_liter") },
      { metric: "coal_consumption.coal_used", source: sumField(coalConsumptionSource, "coal_used"), target: sumField(coalConsumptionTarget, "coal_used") },
    ].map((item) => ({ ...item, equal: numberEqual(item.source, item.target) }));
    const aggregateFailures = aggregateChecks.filter((item) => !item.equal);
    const registryChecks = source.syncWorksheets.map((worksheet) => {
      const rowStates = source.syncRowStates.filter((row) => String(row.worksheet_id) === String(worksheet.id));
      return {
        worksheet: worksheet.worksheet_title,
        persistedRowCount: Number(worksheet.row_count),
        rowStateCount: rowStates.length,
        equal: Number(worksheet.row_count) === rowStates.length,
      };
    });
    const registryFailures = registryChecks.filter((item) => !item.equal);
    const allChecksPass = comparisonFailures.length === 0
      && duplicateFailures.length === 0
      && orphanFailures.length === 0
      && sequenceFailures.length === 0
      && targetCountFailures.length === 0
      && excludedDataFailures.length === 0
      && JSON.stringify(unitNames) === JSON.stringify(expectedUnitNames)
      && targetTarget.length === 1
      && targetValue === TARGET_TON
      && biomassStockTable.tables === 0
      && aggregateFailures.length === 0
      && registryFailures.length === 0;

    console.log(JSON.stringify({
      phase: "21F-3",
      status: allChecksPass ? "PASS_WITH_REVIEW" : "BLOCKED",
      mode: "READ_ONLY_POST_IMPORT_PARITY_AND_INTEGRITY",
      source: {
        database: localMetadata.database,
        postgresql: localMetadata.postgresql,
        url: shapeUrl(localUrl),
        scope: `${SCOPE_START} to ${SCOPE_END} exclusive`,
        approvedWorksheets: APPROVED_WORKSHEETS,
      },
      target: {
        database: targetMetadata.database,
        role: targetMetadata.role,
        postgresql: targetMetadata.postgresql,
        ssl: targetMetadata.ssl,
        url: shapeUrl(directUrl),
        applicationRows: Object.values(targetCounts).reduce((sum, value) => sum + value, 0),
        counts: targetCounts,
      },
      parity: {
        perTable: comparisons,
        expectedCounts,
        countFailures: targetCountFailures,
        totalMissingRows: comparisons.reduce((sum, item) => sum + item.missingRows, 0),
        totalExtraRows: comparisons.reduce((sum, item) => sum + item.extraRows, 0),
        totalMismatchedRows: comparisons.reduce((sum, item) => sum + item.mismatches.length, 0),
      },
      integrity: {
        duplicateChecks,
        orphanChecks,
        sequenceChecks,
        aggregateChecks,
        registryChecks,
        unitNames,
        expectedUnitNames,
        targetBiomassTon: targetValue,
        expectedTargetBiomassTon: TARGET_TON,
        biomassStockTablePresent: biomassStockTable.tables > 0,
      },
      excluded: {
        counts: excludedCounts,
        authenticationNotMigrated: true,
        ambiguousSyncHistoryNotMigrated: true,
        futureScope: ["BIOMASS_STOCK"],
      },
      safety: {
        localDatabaseUrlChanged: false,
        localDatabaseWrites: 0,
        supabaseWrites: 0,
        schemaWrites: 0,
        migrationCommands: 0,
        googleSheetsSyncExecuted: false,
        vercelDeployment: false,
      },
      review: {
        status: "MANUAL_REVIEW_REQUIRED_FOR_EXCLUDED_AUTH_AND_AMBIGUOUS_SYNC_HISTORY",
        note: "Approved business data is parity-verified; excluded authentication and ambiguous historical sync tables remain intentionally untouched.",
      },
    }, null, 2));
    process.exitCode = allChecksPass ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      phase: "21F-3",
      status: "BLOCKED",
      error: sanitizeError(error),
      localDatabaseWrites: 0,
      supabaseWrites: 0,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await localClient.$disconnect().catch(() => undefined);
    if (targetClient) await targetClient.$disconnect().catch(() => undefined);
  }
}
