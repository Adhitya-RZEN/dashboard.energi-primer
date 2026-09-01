import { PrismaClient } from "@prisma/client";

type QueryRow = Record<string, unknown>;

const queryRawProperty = "$queryRawUnsafe";

const expectedBusinessTables = new Set([
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
]);

const quoteIdentifier = (value: string) =>
  `"${value.replaceAll('"', '""')}"`;

const quoteLiteral = (value: string) =>
  `'${value.replaceAll("'", "''")}'`;

const serialize = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    2,
  );

function safeError(error: unknown) {
  if (!error || typeof error !== "object") return "READ_ONLY_PROBE_FAILED";

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const message = typeof candidate.message === "string"
    ? candidate.message.toLowerCase()
    : "";

  if (
    message.includes("password authentication failed") ||
    message.includes("authentication failed") ||
    message.includes("invalid password")
  ) {
    return "AUTHENTICATION_FAILED";
  }

  if (
    message.includes("certificate") ||
    message.includes("ssl") ||
    message.includes("tls")
  ) {
    return "TLS_OR_SSL_FAILED";
  }

  if (
    message.includes("can't reach") ||
    message.includes("could not connect") ||
    message.includes("connection refused") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("enotfound") ||
    message.includes("eai_again") ||
    message.includes("name or service not known")
  ) {
    return "NETWORK_OR_REACHABILITY_FAILED";
  }

  if (
    message.includes("invalid connection string") ||
    message.includes("invalid url") ||
    message.includes("must start with") ||
    message.includes("url must")
  ) {
    return "INVALID_CONNECTION_STRING";
  }

  if (typeof candidate.code === "string") return candidate.code;
  if (typeof candidate.name === "string") return candidate.name;
  return "READ_ONLY_PROBE_FAILED";
}

async function verifyClientSsl(name: string, url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "FAIL", error: "INVALID_URL_SHAPE" };
  }

  parsed.searchParams.set("sslmode", "verify-full");
  if (name === "SUPABASE_POOLER_URL") {
    parsed.searchParams.set("pgbouncer", "true");
  }

  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const query = (sql: string) =>
    (client as unknown as Record<string, (statement: string) => Promise<QueryRow[]>>)[
      queryRawProperty
    ](sql);

  try {
    await query("SELECT 1 AS ssl_probe");
    return {
      status: "PASS",
      sslmode: "verify-full_in_memory_only",
      pgbouncer:
        name === "SUPABASE_POOLER_URL" ? "true_in_memory_only" : "UNCHANGED",
    };
  } catch (error) {
    return { status: "FAIL", error: safeError(error) };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

async function inspectEndpoint(name: string) {
  const url = process.env[name]?.trim();
  const result: Record<string, unknown> = {
    endpoint: name,
    configured: Boolean(url),
    connection: "NOT_TESTED",
  };

  if (!url) {
    result.connection = "FAIL";
    result.error = "ENVIRONMENT_VARIABLE_MISSING";
    return result;
  }

  try {
    const parsed = new URL(url);
    result.connection_config = {
      protocol: parsed.protocol,
      port: parsed.port || "DEFAULT",
      username_present: Boolean(parsed.username),
      password_present: Boolean(parsed.password),
      sslmode: parsed.searchParams.get("sslmode")?.toLowerCase() ?? "ABSENT",
      pgbouncer: parsed.searchParams.get("pgbouncer")?.toLowerCase() ?? "ABSENT",
    };
  } catch {
    result.connection_config = "INVALID_URL_SHAPE";
  }

  let probeUrl = url;
  try {
    const parsedProbeUrl = new URL(url);
    if (name === "SUPABASE_POOLER_URL") {
      parsedProbeUrl.searchParams.set("pgbouncer", "true");
      result.probe_config = { pgbouncer: "true_in_memory_only" };
    }
    probeUrl = parsedProbeUrl.toString();
  } catch {
    // The original URL shape result above remains the source of truth.
  }

  const client = new PrismaClient({ datasourceUrl: probeUrl });
  const query = (sql: string) =>
    (client as unknown as Record<string, (statement: string) => Promise<QueryRow[]>>)[
      queryRawProperty
    ](sql);

  try {
    const metadata = await query(
      "SELECT current_database() AS database_name, " +
        "current_user AS current_role, " +
        "current_schema() AS current_schema, " +
        `current_setting(${quoteLiteral("server_version")}) AS server_version, ` +
        `current_setting(${quoteLiteral("server_version_num")}) AS server_version_num, ` +
        "COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_enabled",
    );

    const publicSchema = await query(
      `SELECT nspname AS schema_name, pg_get_userbyid(nspowner) AS owner
       FROM pg_namespace
       WHERE nspname = ${quoteLiteral("public")}`,
    );

    const tables = await query(
      `SELECT table_schema, table_name, table_type
       FROM information_schema.tables
       WHERE table_schema NOT IN (${quoteLiteral("pg_catalog")}, ${quoteLiteral("information_schema")})
       ORDER BY table_schema, table_name`,
    );

    const objects = await query(
      `SELECT
         count(*) FILTER (WHERE c.relkind IN (${quoteLiteral("r")}, ${quoteLiteral("p")})) AS tables,
         count(*) FILTER (WHERE c.relkind IN (${quoteLiteral("v")}, ${quoteLiteral("m")})) AS views,
         count(*) FILTER (WHERE c.relkind = ${quoteLiteral("S")}) AS sequences,
         count(*) FILTER (WHERE c.relkind = ${quoteLiteral("i")}) AS indexes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname NOT IN (${quoteLiteral("pg_catalog")}, ${quoteLiteral("information_schema")})
         AND n.nspname NOT LIKE ${quoteLiteral("pg_toast%")}`,
    );

    const functions = await query(
      `SELECT count(*) AS functions
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN (${quoteLiteral("pg_catalog")}, ${quoteLiteral("information_schema")})
         AND n.nspname NOT LIKE ${quoteLiteral("pg_toast%")}`,
    );

    const extensions = await query(
      "SELECT extname, extversion FROM pg_extension ORDER BY extname",
    );

    const migrationTable = await query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = ${quoteLiteral("public")}
           AND table_name = ${quoteLiteral("_prisma_migrations")}
       ) AS exists`,
    );

    const tableRows: QueryRow[] = [];
    for (const table of tables) {
      if (table.table_type !== "BASE TABLE") continue;

      const schema = String(table.table_schema);
      const tableName = String(table.table_name);
      const identifier = `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
      const rows = await query(`SELECT count(*) AS row_count FROM ${identifier}`);
      tableRows.push({
        schema,
        table: tableName,
        rows: rows[0]?.row_count ?? 0,
        business:
          schema === "public" && expectedBusinessTables.has(tableName),
      });
    }

    const businessRows = tableRows.filter((table) => table.business === true);
    const publicTables = tableRows.filter((table) => table.schema === "public");
    const businessRowTotal = businessRows.reduce(
      (total, table) => total + BigInt(String(table.rows)),
      BigInt(0),
    );
    const hasMigrationTable = migrationTable[0]?.exists === true;
    const targetEmpty = publicTables.length === 0 && !hasMigrationTable;

    const sslProbe = name.startsWith("SUPABASE_")
      ? await verifyClientSsl(name, url)
      : { status: "NOT_RUN" };

    result.connection = "PASS";
    result.ssl = metadata[0]?.ssl_enabled === true || sslProbe.status === "PASS"
      ? "PASS"
      : "FAIL";
    result.ssl_evidence = {
      server_session_ssl: metadata[0]?.ssl_enabled === true ? "PASS" : "NOT_REPORTED",
      client_verify_full: sslProbe,
    };
    result.metadata = {
      database_name: metadata[0]?.database_name,
      current_role: metadata[0]?.current_role,
      current_schema: metadata[0]?.current_schema,
      server_version: metadata[0]?.server_version,
      server_version_num: metadata[0]?.server_version_num,
    };
    result.public_schema = publicSchema;
    result.objects = { ...objects[0], ...functions[0] };
    result.extensions = extensions;
    result.tables = tableRows;
    result.non_base_table_objects = tables.filter(
      (table) => table.table_type !== "BASE TABLE",
    );
    result.prisma_migration_table = hasMigrationTable ? "YES" : "NO";
    result.business_data = businessRowTotal > BigInt(0) ? "YES" : "NO";
    result.business_rows = businessRows;
    result.business_row_total = businessRowTotal;
    result.target_empty = targetEmpty ? "YES" : "NO";
    result.target_state = targetEmpty
      ? "APPLICATION_SCHEMA_EMPTY"
      : "SUPABASE_NOT_EMPTY";
    return result;
  } catch (error) {
    result.connection = "FAIL";
    result.error = safeError(error);
    return result;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

const results = [];
for (const endpoint of [
  "SUPABASE_DIRECT_URL",
  "SUPABASE_POOLER_URL",
  "DATABASE_URL",
]) {
  results.push(await inspectEndpoint(endpoint));
}

const direct = results[0];
const pooler = results[1];
const local = results[2];

const directVersion = (direct.metadata as QueryRow | undefined)?.server_version_num;
const poolerVersion = (pooler.metadata as QueryRow | undefined)?.server_version_num;
const localVersion = (local.metadata as QueryRow | undefined)?.server_version_num;

const output = {
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY_SELECT_ONLY",
  endpoints: results,
  capabilityComparison: {
    local_server_version_num: localVersion ?? "UNAVAILABLE",
    direct_server_version_num: directVersion ?? "UNAVAILABLE",
    pooler_server_version_num: poolerVersion ?? "UNAVAILABLE",
    direct_major_matches_local:
      typeof directVersion === "string" &&
      typeof localVersion === "string" &&
      directVersion.slice(0, -2) === localVersion.slice(0, -2),
    pooler_major_matches_local:
      typeof poolerVersion === "string" &&
      typeof localVersion === "string" &&
      poolerVersion.slice(0, -2) === localVersion.slice(0, -2),
  },
  writes: {
    local: 0,
    supabase: 0,
  },
};

console.log(serialize(output));
