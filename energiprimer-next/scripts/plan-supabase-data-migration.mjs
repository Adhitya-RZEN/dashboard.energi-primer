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

const MIGRATION_TABLE = "_prisma_migrations";
const SCOPE_START = "2026-01-01";
const SCOPE_END = "2026-08-01";
const APPROVED_WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
];

const CLASSIFICATION = {
  users: "AUTHENTICATION",
  password_reset_tokens: "AUTHENTICATION",
  sessions: "AUTHENTICATION",
  cache: "TRANSIENT",
  cache_locks: "TRANSIENT",
  jobs: "TRANSIENT",
  job_batches: "TRANSIENT",
  failed_jobs: "TRANSIENT",
  units: "LOOKUP",
  coal_stock: "APPROVED_BUSINESS",
  coal_quality: "LEGACY_BUSINESS_OUTSIDE_APPROVED_MAPPING",
  coal_consumption: "APPROVED_BUSINESS",
  power_generation: "LEGACY_BUSINESS_OUTSIDE_APPROVED_MAPPING",
  kpi_targets: "LEGACY_BUSINESS_OUTSIDE_APPROVED_MAPPING",
  spreadsheet_import_logs: "LEGACY_IMPORT_METADATA",
  sync_sources: "SYNC_METADATA",
  sync_worksheets: "SYNC_METADATA",
  sync_runs: "SYNC_METADATA_REVIEW",
  sync_row_states: "SYNC_METADATA",
  sync_schema_changes: "SYNC_METADATA_REVIEW",
  spreadsheet_import_runs: "IMPORT_METADATA",
  spreadsheet_import_staging: "IMPORT_AUDIT_DATA",
  biomass_receipts: "APPROVED_BUSINESS",
  coal_receipts: "APPROVED_BUSINESS",
  biomass_consumptions: "APPROVED_BUSINESS",
  solar_receipts: "APPROVED_BUSINESS",
  solar_consumptions: "APPROVED_BUSINESS",
  hop_readings: "APPROVED_BUSINESS",
  biomass_targets: "APPROVED_BUSINESS",
  biomass_cumulative_snapshots: "APPROVED_BUSINESS",
};

const DATE_COLUMNS = {
  coal_stock: "date",
  coal_quality: "date",
  coal_consumption: "date",
  power_generation: "date",
  kpi_targets: "date",
  biomass_receipts: "period_start",
  coal_receipts: "period_start",
  biomass_consumptions: "reading_date",
  solar_receipts: "period_start",
  solar_consumptions: "reading_date",
  hop_readings: "reading_date",
  biomass_cumulative_snapshots: "period_start",
  spreadsheet_import_runs: "requested_period",
  spreadsheet_import_staging: "reading_date",
};

const UNIQUE_KEYS = {
  units: [["code"]],
  coal_stock: [["date"]],
  coal_quality: [["unit_id", "date"]],
  coal_consumption: [["unit_id", "date"]],
  power_generation: [["unit_id", "date"]],
  kpi_targets: [["unit_id", "date"]],
  sync_sources: [["source_key"], ["provider", "external_id"]],
  sync_worksheets: [["source_id", "worksheet_key"]],
  sync_row_states: [["worksheet_id", "source_key"]],
  spreadsheet_import_runs: [],
  biomass_receipts: [["period_start", "supplier_code"]],
  coal_receipts: [["period_start"]],
  biomass_consumptions: [["unit_id", "reading_date"]],
  solar_receipts: [["period_start"]],
  solar_consumptions: [["reading_date"]],
  hop_readings: [["unit_id", "reading_date"]],
  biomass_targets: [["target_year"]],
  biomass_cumulative_snapshots: [["period_start"]],
};

const FOREIGN_KEYS = [
  ["coal_quality", "unit_id", "units", "id"],
  ["coal_consumption", "unit_id", "units", "id"],
  ["power_generation", "unit_id", "units", "id"],
  ["kpi_targets", "unit_id", "units", "id"],
  ["sync_worksheets", "source_id", "sync_sources", "id"],
  ["sync_runs", "source_id", "sync_sources", "id"],
  ["sync_row_states", "worksheet_id", "sync_worksheets", "id"],
  ["sync_schema_changes", "worksheet_id", "sync_worksheets", "id"],
  ["spreadsheet_import_staging", "import_run_id", "spreadsheet_import_runs", "id"],
  ["biomass_receipts", "import_run_id", "spreadsheet_import_runs", "id"],
  ["coal_receipts", "import_run_id", "spreadsheet_import_runs", "id"],
  ["biomass_consumptions", "import_run_id", "spreadsheet_import_runs", "id"],
  ["solar_receipts", "import_run_id", "spreadsheet_import_runs", "id"],
  ["solar_consumptions", "import_run_id", "spreadsheet_import_runs", "id"],
  ["hop_readings", "import_run_id", "spreadsheet_import_runs", "id"],
  ["biomass_targets", "import_run_id", "spreadsheet_import_runs", "id"],
  ["biomass_cumulative_snapshots", "import_run_id", "spreadsheet_import_runs", "id"],
];

const quoteIdentifier = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("UNSAFE_IDENTIFIER");
  return `"${value}"`;
};

const quoteLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

const tableName = (value) => `public.${quoteIdentifier(value)}`;

const serialize = (value) => JSON.stringify(value, (_key, item) =>
  typeof item === "bigint" ? item.toString() : item,
  2,
);

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

function safeError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("password") || message.includes("authentication failed")) return "AUTHENTICATION_FAILED";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "TLS_OR_SSL_FAILED";
  if (message.includes("timeout") || message.includes("can't reach") || message.includes("could not connect") || message.includes("eai_again")) return "NETWORK_OR_REACHABILITY_FAILED";
  return "READ_ONLY_QUERY_FAILED";
}

function isApprovedWorksheet(value) {
  return APPROVED_WORKSHEETS.some((worksheet) => worksheet.toLowerCase() === String(value ?? "").trim().toLowerCase());
}

async function readMetadata(client) {
  const [metadata] = await client.$queryRawUnsafe(`
    SELECT current_database() AS database_name,
           current_user AS current_role,
           current_schema() AS current_schema,
           current_setting('server_version') AS server_version,
           current_setting('server_version_num') AS server_version_num,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_enabled
  `);
  return {
    database: metadata.database_name,
    role: metadata.current_role,
    schema: metadata.current_schema,
    postgresql: String(metadata.server_version).match(/(?:PostgreSQL )?([0-9]+(?:\.[0-9]+)+)/)?.[1] ?? "unknown",
    serverVersionNum: String(metadata.server_version_num),
    sslEnabled: metadata.ssl_enabled === true,
  };
}

async function readPublicTables(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT c.relname AS table_name,
           c.relkind AS relkind,
           pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    ORDER BY c.relkind, c.relname
  `);
  return rows.map((row) => ({
    name: row.table_name,
    kind: row.relkind,
    owner: row.owner,
  }));
}

async function readColumns(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT table_name, column_name, ordinal_position, data_type, udt_name,
           is_nullable, column_default, numeric_precision, numeric_scale,
           datetime_precision
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, APP_TABLES);
  return rows.map((row) => ({
    table: row.table_name,
    column: row.column_name,
    ordinal: Number(row.ordinal_position),
    dataType: row.data_type,
    udt: row.udt_name,
    nullable: row.is_nullable === "YES",
    default: row.column_default === null ? null : "PRESENT",
    precision: row.numeric_precision === null ? null : Number(row.numeric_precision),
    scale: row.numeric_scale === null ? null : Number(row.numeric_scale),
    datetimePrecision: row.datetime_precision === null ? null : Number(row.datetime_precision),
  }));
}

async function countTables(client, existingNames) {
  const result = {};
  for (const table of APP_TABLES) {
    if (!existingNames.has(table)) {
      result[table] = null;
      continue;
    }
    const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS row_count FROM ${tableName(table)}`);
    result[table] = Number(row.row_count);
  }
  return result;
}

async function nullCounts(client, columns, counts) {
  const result = {};
  for (const table of APP_TABLES) {
    if (!counts[table]) continue;
    const tableColumns = columns.filter((column) => column.table === table);
    const nullable = tableColumns.filter((column) => column.nullable);
    if (!nullable.length) continue;
    const expressions = nullable.map((column) =>
      `COUNT(*) FILTER (WHERE ${quoteIdentifier(column.column)} IS NULL)::bigint AS ${quoteIdentifier(column.column)}`,
    );
    const [row] = await client.$queryRawUnsafe(`SELECT ${expressions.join(", ")} FROM ${tableName(table)}`);
    const nonZero = Object.fromEntries(
      nullable
        .map((column) => [column.column, Number(row[column.column])])
        .filter(([, value]) => value > 0),
    );
    if (Object.keys(nonZero).length) result[table] = nonZero;
  }
  return result;
}

async function dateCoverage(client, counts) {
  const result = {};
  for (const [table, column] of Object.entries(DATE_COLUMNS)) {
    if (!counts[table]) continue;
    const [row] = await client.$queryRawUnsafe(`
      SELECT MIN(${quoteIdentifier(column)})::text AS minimum,
             MAX(${quoteIdentifier(column)})::text AS maximum,
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE ${quoteIdentifier(column)} >= DATE '${SCOPE_START}'
                 AND ${quoteIdentifier(column)} < DATE '${SCOPE_END}'
             )::bigint AS in_scope,
             COUNT(*) FILTER (
               WHERE ${quoteIdentifier(column)} < DATE '${SCOPE_START}'
                  OR ${quoteIdentifier(column)} >= DATE '${SCOPE_END}'
             )::bigint AS outside_scope
      FROM ${tableName(table)}
    `);
    result[table] = {
      column,
      minimum: row.minimum,
      maximum: row.maximum,
      total: Number(row.total),
      inScope: Number(row.in_scope),
      outsideScope: Number(row.outside_scope),
    };
  }
  return result;
}

async function duplicateChecks(client, counts) {
  const result = [];
  for (const [table, keys] of Object.entries(UNIQUE_KEYS)) {
    if (!counts[table]) continue;
    for (const key of keys) {
      const groupColumns = key.map(quoteIdentifier).join(", ");
      const [row] = await client.$queryRawUnsafe(`
        SELECT COUNT(*)::bigint AS duplicate_groups,
               COALESCE(SUM(group_count - 1), 0)::bigint AS duplicate_rows
        FROM (
          SELECT ${groupColumns}, COUNT(*)::bigint AS group_count
          FROM ${tableName(table)}
          GROUP BY ${groupColumns}
          HAVING COUNT(*) > 1
        ) grouped
      `);
      result.push({
        table,
        key,
        duplicateGroups: Number(row.duplicate_groups),
        duplicateRows: Number(row.duplicate_rows),
      });
    }
  }
  return result;
}

async function orphanChecks(client, counts) {
  const result = [];
  for (const [child, childColumn, parent, parentColumn] of FOREIGN_KEYS) {
    if (!counts[child] || !counts[parent]) continue;
    const [row] = await client.$queryRawUnsafe(`
      SELECT COUNT(*)::bigint AS orphan_rows
      FROM ${tableName(child)} child
      LEFT JOIN ${tableName(parent)} parent
        ON parent.${quoteIdentifier(parentColumn)} = child.${quoteIdentifier(childColumn)}
      WHERE child.${quoteIdentifier(childColumn)} IS NOT NULL
        AND parent.${quoteIdentifier(parentColumn)} IS NULL
    `);
    result.push({
      child,
      childColumn,
      parent,
      parentColumn,
      orphanRows: Number(row.orphan_rows),
    });
  }
  return result;
}

async function numericChecks(client, columns, counts) {
  const result = [];
  for (const column of columns.filter((item) => item.dataType === "numeric" && item.precision !== null && item.scale !== null)) {
    if (!counts[column.table]) continue;
    const limit = `power(10::numeric, ${column.precision - column.scale})`;
    const [row] = await client.$queryRawUnsafe(`
      SELECT COUNT(*)::bigint AS out_of_range
      FROM ${tableName(column.table)}
      WHERE ${quoteIdentifier(column.column)} IS NOT NULL
        AND abs(${quoteIdentifier(column.column)}) >= ${limit}
    `);
    const outOfRange = Number(row.out_of_range);
    if (outOfRange) result.push({ table: column.table, column: column.column, outOfRange });
  }
  return result;
}

async function sequenceChecks(client, counts, columns) {
  const result = [];
  const sequenceRows = await client.$queryRawUnsafe(`
    SELECT schemaname, sequencename, last_value::text AS last_value
    FROM pg_sequences
    WHERE schemaname = 'public'
    ORDER BY sequencename
  `);
  const sequenceByName = new Map(sequenceRows.map((row) => [String(row.sequencename), row]));
  for (const table of APP_TABLES) {
    if (!counts[table]) continue;
    if (!columns.some((column) => column.table === table && column.column === "id")) continue;
    const [serial] = await client.$queryRawUnsafe(`SELECT pg_get_serial_sequence(${quoteLiteral(`public.${table}`)}, 'id') AS sequence_name`);
    if (!serial?.sequence_name) continue;
    const sequenceName = String(serial.sequence_name);
    const sequence = sequenceName.replaceAll('"', "").split(".").at(-1);
    if (!sequence) continue;
    const sequenceRow = sequenceByName.get(sequence);
    const [maxRow] = await client.$queryRawUnsafe(`SELECT MAX(${quoteIdentifier("id")})::text AS maximum FROM ${tableName(table)}`);
    const maximum = maxRow.maximum === null ? null : BigInt(maxRow.maximum);
    const lastValue = sequenceRow?.last_value === null || sequenceRow?.last_value === undefined
      ? null
      : BigInt(sequenceRow.last_value);
    result.push({
      table,
      sequence: sequenceName,
      maximumId: maximum,
      sequenceLastValue: lastValue,
      sequenceAheadOrEqual: maximum === null || lastValue === null || lastValue >= maximum,
      isCalled: "NOT_READ_FROM_INFORMATION_SCHEMA_VIEW",
    });
  }
  return result;
}

async function registryAudit(client, counts) {
  const result = {};
  if (counts.sync_sources) {
    const rows = await client.$queryRawUnsafe(`
      SELECT status, COUNT(*)::bigint AS rows
      FROM public.sync_sources GROUP BY status ORDER BY status
    `);
    result.sourcesByStatus = rows.map((row) => ({ status: row.status, rows: Number(row.rows) }));
  }
  if (counts.sync_worksheets) {
    const rows = await client.$queryRawUnsafe(`
      SELECT worksheet_title, normalized_title, status, row_count,
             COUNT(srs.id)::bigint AS persisted_row_states
      FROM public.sync_worksheets sw
      LEFT JOIN public.sync_row_states srs ON srs.worksheet_id = sw.id
      GROUP BY sw.id, worksheet_title, normalized_title, status, row_count
      ORDER BY sw.worksheet_title
    `);
    result.worksheets = rows.map((row) => ({
      title: row.worksheet_title,
      normalizedTitle: row.normalized_title,
      status: row.status,
      rowCount: Number(row.row_count),
      persistedRowStates: Number(row.persisted_row_states),
      approvedScope: isApprovedWorksheet(row.worksheet_title),
    }));
  }
  if (counts.sync_runs) {
    const rows = await client.$queryRawUnsafe(`
      SELECT trigger_type, status, COUNT(*)::bigint AS runs,
             COALESCE(SUM(rows_scanned), 0)::bigint AS rows_scanned,
             COALESCE(SUM(inserted), 0)::bigint AS inserted,
             COALESCE(SUM(updated), 0)::bigint AS updated,
             COALESCE(SUM(skipped), 0)::bigint AS skipped,
             COALESCE(SUM(failed), 0)::bigint AS failed
      FROM public.sync_runs
      GROUP BY trigger_type, status
      ORDER BY trigger_type, status
    `);
    result.runs = rows.map((row) => ({
      triggerType: row.trigger_type,
      status: row.status,
      runs: Number(row.runs),
      rowsScanned: Number(row.rows_scanned),
      inserted: Number(row.inserted),
      updated: Number(row.updated),
      skipped: Number(row.skipped),
      failed: Number(row.failed),
    }));
  }
  if (counts.spreadsheet_import_runs) {
    const rows = await client.$queryRawUnsafe(`
      SELECT requested_worksheet, effective_worksheet, status,
             requested_period::text AS requested_period,
             effective_period::text AS effective_period,
             imported_rows, rejected_rows, COUNT(*)::bigint AS runs
      FROM public.spreadsheet_import_runs
      GROUP BY requested_worksheet, effective_worksheet, status,
               requested_period, effective_period, imported_rows, rejected_rows
      ORDER BY requested_period, requested_worksheet
    `);
    result.importRuns = rows.map((row) => ({
      requestedWorksheet: row.requested_worksheet,
      effectiveWorksheet: row.effective_worksheet,
      status: row.status,
      requestedPeriod: row.requested_period,
      effectivePeriod: row.effective_period,
      importedRows: Number(row.imported_rows),
      rejectedRows: Number(row.rejected_rows),
      runs: Number(row.runs),
      approvedScope: isApprovedWorksheet(row.effective_worksheet ?? row.requested_worksheet),
    }));
  }
  if (counts.spreadsheet_import_staging && counts.spreadsheet_import_runs) {
    const [row] = await client.$queryRawUnsafe(`
      SELECT COUNT(*)::bigint AS staging_rows,
             COUNT(*) FILTER (
               WHERE sir.requested_period >= DATE '${SCOPE_START}'
                 AND sir.requested_period < DATE '${SCOPE_END}'
                 AND lower(COALESCE(sir.effective_worksheet, sir.requested_worksheet)) = ANY($1::text[])
             )::bigint AS approved_staging_rows
      FROM public.spreadsheet_import_staging sis
      JOIN public.spreadsheet_import_runs sir ON sir.id = sis.import_run_id
    `, APPROVED_WORKSHEETS.map((value) => value.toLowerCase()));
    result.staging = {
      rows: Number(row.staging_rows),
      approvedScopeRows: Number(row.approved_staging_rows),
    };
  }
  return result;
}

async function inspectDatabase(label, url) {
  const output = {
    label,
    urlShape: shapeUrl(url),
    connection: "NOT_TESTED",
  };
  if (!url) {
    output.connection = "FAIL";
    output.error = "ENVIRONMENT_VARIABLE_MISSING";
    return output;
  }
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const metadata = await readMetadata(client);
    const objects = await readPublicTables(client);
    const publicTables = objects.filter((object) => object.kind === "r" || object.kind === "p");
    const existingNames = new Set(publicTables.map((object) => object.name));
    const columns = await readColumns(client);
    const counts = await countTables(client, existingNames);
    const [extensions, objectCounts] = await Promise.all([
      client.$queryRawUnsafe("SELECT extname, extversion FROM pg_extension ORDER BY extname"),
      client.$queryRawUnsafe(`
        SELECT
          COUNT(*) FILTER (WHERE c.relkind IN ('r', 'p'))::bigint AS tables,
          COUNT(*) FILTER (WHERE c.relkind IN ('v', 'm'))::bigint AS views,
          COUNT(*) FILTER (WHERE c.relkind = 'S')::bigint AS sequences,
          COUNT(*) FILTER (WHERE c.relkind = 'i')::bigint AS indexes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
      `),
    ]);
    output.connection = "PASS";
    output.metadata = metadata;
    output.publicObjects = {
      tables: publicTables.length,
      views: objects.filter((object) => object.kind === "v" || object.kind === "m").length,
      sequences: objects.filter((object) => object.kind === "S").length,
      allNonSystemObjects: objectCounts[0],
      extensions: extensions.map((extension) => ({ name: extension.extname, version: extension.extversion })),
    };
    output.publicTables = publicTables.map((object) => object.name);
    output.missingApplicationTables = APP_TABLES.filter((table) => !existingNames.has(table));
    output.unexpectedApplicationCandidates = publicTables
      .map((object) => object.name)
      .filter((table) => !APP_TABLES.includes(table) && table !== MIGRATION_TABLE);
    output.migrationTable = {
      present: existingNames.has(MIGRATION_TABLE),
      rows: existingNames.has(MIGRATION_TABLE)
        ? Number((await client.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS rows FROM ${tableName(MIGRATION_TABLE)}`))[0].rows)
        : 0,
    };
    output.counts = counts;
    output.nonEmptyTables = Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0));
    output.columns = columns;
    output.nullCounts = await nullCounts(client, columns, counts);
    output.dateCoverage = await dateCoverage(client, counts);
    output.duplicateChecks = await duplicateChecks(client, counts);
    output.orphanChecks = await orphanChecks(client, counts);
    output.numericOutOfRange = await numericChecks(client, columns, counts);
    output.sequenceChecks = await sequenceChecks(client, counts, columns);
    output.registry = await registryAudit(client, counts);
    return output;
  } catch (error) {
    output.connection = "FAIL";
    output.error = safeError(error);
    return output;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

function compareSchemas(local, target) {
  if (!local.columns || !target.columns) return { status: "NOT_VERIFIED" };
  const key = (column) => `${column.table}.${column.column}`;
  const localMap = new Map(local.columns.map((column) => [key(column), column]));
  const targetMap = new Map(target.columns.map((column) => [key(column), column]));
  const missingOnTarget = [...localMap.keys()].filter((name) => !targetMap.has(name));
  const unexpectedOnTarget = [...targetMap.keys()].filter((name) => !localMap.has(name));
  const mismatches = [];
  const toleratedDifferences = [];
  const compatibleTextTypes = new Set([
    "character varying|varchar|text|text",
    "text|text|character varying|varchar",
  ]);
  for (const [name, localColumn] of localMap) {
    const targetColumn = targetMap.get(name);
    if (!targetColumn) continue;
    for (const field of ["ordinal", "dataType", "udt", "nullable", "default", "precision", "scale", "datetimePrecision"]) {
      if (localColumn[field] !== targetColumn[field]) {
        const typePair = `${localColumn.dataType}|${localColumn.udt}|${targetColumn.dataType}|${targetColumn.udt}`;
        const tolerated = field === "ordinal" ||
          field === "default" ||
          ((field === "dataType" || field === "udt") && compatibleTextTypes.has(typePair));
        (tolerated ? toleratedDifferences : mismatches).push({
          name,
          field,
          local: localColumn[field],
          target: targetColumn[field],
          reason: tolerated
            ? field === "ordinal"
              ? "column order is not part of the data contract"
              : field === "default"
                ? "migration copies explicit source values; default-expression differences do not alter copied rows"
                : "text/varchar are compatible for the affected source values and target baseline"
            : "requires review",
        });
      }
    }
  }
  return {
    status: missingOnTarget.length || unexpectedOnTarget.length || mismatches.length ? "FAIL" : "PASS",
    localColumns: local.columns.length,
    targetColumns: target.columns.length,
    missingOnTarget,
    unexpectedOnTarget,
    mismatches: mismatches.slice(0, 50),
    mismatchCount: mismatches.length,
    toleratedDifferenceCount: toleratedDifferences.length,
    toleratedDifferences: toleratedDifferences.slice(0, 50),
  };
}

function scopePlan(local) {
  const counts = local.counts ?? {};
  const dateCoverageByTable = local.dateCoverage ?? {};
  const plan = APP_TABLES.map((table) => {
    const total = counts[table] ?? 0;
    const coverage = dateCoverageByTable[table];
    let candidateRows = 0;
    let action = "SKIP";
    let reason = CLASSIFICATION[table] ?? "UNCLASSIFIED";
    if (table === "units") {
      candidateRows = total;
      action = "IMPORT";
      reason = "Unit lookup required by approved Unit 1–3 business rows";
    } else if (table === "biomass_targets") {
      candidateRows = total;
      action = "IMPORT";
      reason = "Approved target year 2026; target value verified separately as 70,020 ton";
    } else if (coverage && [
      "coal_stock",
      "coal_consumption",
      "biomass_receipts",
      "coal_receipts",
      "biomass_consumptions",
      "solar_receipts",
      "solar_consumptions",
      "hop_readings",
      "biomass_cumulative_snapshots",
    ].includes(table)) {
      candidateRows = coverage.inScope;
      action = "IMPORT";
      reason = "Validated Google Sheets Jan–Jul 2026 scope";
    } else if (table === "spreadsheet_import_runs") {
      candidateRows = (local.registry?.importRuns ?? [])
        .filter((run) => run.approvedScope && run.status === "SUCCESS")
        .reduce((sum, run) => sum + run.runs, 0);
      action = "IMPORT";
      reason = "Successful import metadata linked to approved Jan–Jul worksheets";
    } else if (table === "spreadsheet_import_staging") {
      candidateRows = local.registry?.staging?.approvedScopeRows ?? 0;
      action = "IMPORT";
      reason = "Staging audit rows linked to approved import runs";
    } else if (table === "sync_sources") {
      const approvedWorksheetCount = (local.registry?.worksheets ?? []).filter((worksheet) => worksheet.approvedScope).length;
      candidateRows = approvedWorksheetCount > 0 ? total : 0;
      action = approvedWorksheetCount > 0 ? "IMPORT" : "MANUAL_REVIEW";
      reason = approvedWorksheetCount > 0
        ? "Source parent for approved worksheet registry rows"
        : "No approved worksheet parent found";
    } else if (table === "sync_worksheets") {
      candidateRows = (local.registry?.worksheets ?? []).filter((worksheet) => worksheet.approvedScope).length;
      action = "IMPORT";
      reason = "Only canonical Jan–Jul worksheet metadata; outside-scope worksheets excluded";
    } else if (table === "sync_row_states") {
      candidateRows = (local.registry?.worksheets ?? [])
        .filter((worksheet) => worksheet.approvedScope)
        .reduce((sum, worksheet) => sum + worksheet.persistedRowStates, 0);
      action = "IMPORT";
      reason = "Stable source identity/content-hash state for approved worksheets";
    } else if (table === "sync_runs") {
      candidateRows = 0;
      action = "MANUAL_REVIEW";
      reason = "Run records do not carry worksheet-period identity; do not import ambiguous history";
    } else if (table === "sync_schema_changes") {
      candidateRows = 0;
      action = "MANUAL_REVIEW";
      reason = "Schema-change history is metadata and not needed for approved business baseline";
    } else if (table === "coal_quality" || table === "power_generation" || table === "kpi_targets") {
      candidateRows = coverage?.inScope ?? 0;
      action = candidateRows > 0 ? "MANUAL_REVIEW" : "SKIP";
      reason = candidateRows > 0
        ? "Rows exist in period but are not produced by the approved BB import mapping"
        : "No rows in approved Jan–Jul period / outside current BB mapping";
    } else if (CLASSIFICATION[table] === "AUTHENTICATION") {
      candidateRows = 0;
      action = "MANUAL_REVIEW";
      reason = "Credentials, sessions, and reset state excluded; separate auth/cutover approval required";
    }
    return {
      table,
      classification: CLASSIFICATION[table] ?? "UNCLASSIFIED",
      sourceRows: total,
      candidateRows,
      action,
      reason,
    };
  });
  return plan;
}

function evaluate(local, target, schemaParity, plan) {
  const targetApplicationRows = Object.values(target.counts ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  const duplicateGroups = (local.duplicateChecks ?? []).reduce((sum, item) => sum + item.duplicateGroups, 0);
  const duplicateRows = (local.duplicateChecks ?? []).reduce((sum, item) => sum + item.duplicateRows, 0);
  const orphanRows = (local.orphanChecks ?? []).reduce((sum, item) => sum + item.orphanRows, 0);
  const precisionIssues = local.numericOutOfRange?.length ?? 0;
  const blockers = [];
  if (local.connection !== "PASS") blockers.push("LOCAL_SOURCE_UNAVAILABLE");
  if (target.connection !== "PASS") blockers.push("SUPABASE_TARGET_UNAVAILABLE");
  if (schemaParity.status !== "PASS") blockers.push("SOURCE_TARGET_SCHEMA_MISMATCH");
  if (targetApplicationRows !== 0) blockers.push("SUPABASE_APPLICATION_SCHEMA_NOT_EMPTY");
  if (duplicateGroups || duplicateRows) blockers.push("SOURCE_DUPLICATE_BUSINESS_KEYS");
  if (orphanRows) blockers.push("SOURCE_ORPHAN_FOREIGN_KEYS");
  if (precisionIssues) blockers.push("SOURCE_NUMERIC_PRECISION_OUT_OF_RANGE");
  const manualReview = plan.filter((item) => item.action === "MANUAL_REVIEW");
  const status = blockers.length ? "DATA_MIGRATION_REVIEW_REQUIRED" : "READY_FOR_DATA_MIGRATION";
  return {
    status,
    blockers,
    manualReview: manualReview.map((item) => ({ table: item.table, sourceRows: item.sourceRows, candidateRows: item.candidateRows, reason: item.reason })),
    sourceDuplicateGroups: duplicateGroups,
    sourceDuplicateRows: duplicateRows,
    sourceOrphanRows: orphanRows,
    sourceNumericPrecisionIssues: precisionIssues,
    targetApplicationRows,
    localDatabaseWrites: 0,
    supabaseWrites: 0,
  };
}

const localUrl = process.env.DATABASE_URL?.trim();
const targetUrl = process.env.SUPABASE_DIRECT_URL?.trim();
const localShape = shapeUrl(localUrl);
const localGuard = localShape.configured && ["127.0.0.1", "localhost", "::1"].includes(localShape.host) && localUrl && new URL(localUrl).pathname.replace(/^\//, "") === "dashboard_pln";

if (!localGuard) {
  console.log(serialize({
    phase: "21F-1",
    mode: "READ_ONLY_DRY_RUN",
    status: "DATA_MIGRATION_REVIEW_REQUIRED",
    blockers: ["DATABASE_URL_IS_NOT_LOCAL_DASHBOARD_PLN"],
    localUrl: localShape,
    localDatabaseWrites: 0,
    supabaseWrites: 0,
  }));
  process.exitCode = 1;
} else {
  const [local, target] = await Promise.all([
    inspectDatabase("LOCAL_SOURCE", localUrl),
    inspectDatabase("SUPABASE_DIRECT_TARGET", targetUrl),
  ]);
  const schemaParity = compareSchemas(local, target);
  const plan = scopePlan(local);
  const evaluation = evaluate(local, target, schemaParity, plan);
  const output = {
    phase: "21F-1",
    mode: "READ_ONLY_DRY_RUN",
    generatedAt: new Date().toISOString(),
    approvedScope: {
      worksheets: APPROVED_WORKSHEETS,
      start: SCOPE_START,
      endExclusive: SCOPE_END,
      unitIdentity: ["Unit 1", "Unit 2", "Unit 3"],
      biomassTargetTon: 70020,
      biomassStock: "FUTURE_SCOPE_DATA_NOT_IMPORTED",
    },
    local: {
      ...local,
      columns: undefined,
    },
    target: {
      ...target,
      columns: undefined,
    },
    schemaParity,
    plan,
    evaluation,
    safety: {
      localDatabaseUrl: localShape,
      localDatabaseUrlChanged: false,
      localDatabaseWrites: 0,
      supabaseWrites: 0,
      schemaWrites: 0,
      migrationCommands: 0,
      dataImportExecuted: false,
      googleSheetsSyncExecuted: false,
    },
  };
  console.log(serialize(output));
  if (evaluation.status !== "READY_FOR_DATA_MIGRATION") process.exitCode = 2;
}
