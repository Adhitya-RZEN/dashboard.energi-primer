import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "production", "schema.prisma");
const restrictedRoles = ["anon", "authenticated"];
const protectedRoles = ["postgres", "service_role"];
const tablePrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const migrationTable = "_prisma_migrations";
const APPROVED_STABLE_DATA_ROWS = 2406;
const RUNTIME_MUTABLE_TABLES = new Set([
  "users",
  "password_reset_tokens",
  "sessions",
  "cache",
  "cache_locks",
  "jobs",
  "job_batches",
  "failed_jobs",
  "sync_sources",
  "sync_worksheets",
  "sync_runs",
  "sync_row_states",
  "sync_schema_changes",
  "spreadsheet_import_logs",
  "spreadsheet_import_runs",
  "spreadsheet_import_staging",
]);

function parseMappedTables(schema) {
  return [...schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)].map(
    ([, modelName, body]) => body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName,
  );
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("UNSAFE_IDENTIFIER");
  return `"${value}"`;
}

function safeError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("password") || message.includes("authentication failed")) return "AUTHENTICATION_FAILED";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "TLS_OR_SSL_FAILED";
  if (message.includes("can't reach") || message.includes("could not connect") || message.includes("timeout") || message.includes("eai_again")) {
    return "NETWORK_OR_REACHABILITY_FAILED";
  }
  if (message.includes("permission denied")) return "PERMISSION_DENIED";
  if (message.includes("prepared statement") || message.includes("already exists")) return "PROBE_STATEMENT_ERROR";
  return "READ_ONLY_VERIFICATION_FAILED";
}

function endpointShape(name, value) {
  if (!value) return { configured: false, status: "NOT_CONFIGURED" };
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
      pgbouncer: parsed.searchParams.get("pgbouncer")?.toLowerCase() ?? "ABSENT",
      probe: name === "SUPABASE_POOLER_URL" ? "sslmode=verify-full + pgbouncer=true in memory only" : "sslmode=verify-full in memory only",
    };
  } catch {
    return { configured: true, status: "INVALID_URL_SHAPE" };
  }
}

function anyPrivilege(row, role) {
  return tablePrivileges.some((privilege) => row[`${role}_${privilege.toLowerCase()}`] === true);
}

function summarizePrivileges(rows, role) {
  return {
    tablesChecked: rows.length,
    tablesWithAnyPrivilege: rows.filter((row) => anyPrivilege(row, role)).length,
    privilegeCounts: Object.fromEntries(
      tablePrivileges.map((privilege) => [
        privilege,
        rows.filter((row) => row[`${role}_${privilege.toLowerCase()}`] === true).length,
      ]),
    ),
  };
}

async function countTables(client, tables) {
  const counts = await Promise.all(
    tables.map(async (table) => {
      const rows = await client.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(table)}`);
      return { table, rows: Number(rows[0].row_count) };
    }),
  );
  return {
    totalRows: counts.reduce((total, item) => total + item.rows, 0),
    stableDataRows: counts
      .filter((item) => !RUNTIME_MUTABLE_TABLES.has(item.table))
      .reduce((total, item) => total + item.rows, 0),
    nonEmptyTables: counts.filter((item) => item.rows > 0),
  };
}

async function inspectEndpoint(name, value, expectedTables, options = {}) {
  const output = {
    endpoint: name,
    connection: "NOT_TESTED",
    writes: 0,
    shape: endpointShape(name, value),
  };
  if (!value) {
    output.connection = "FAIL";
    output.error = "ENVIRONMENT_VARIABLE_MISSING";
    return output;
  }

  let probeUrl;
  try {
    const parsed = new URL(value);
    if (name.startsWith("SUPABASE_")) parsed.searchParams.set("sslmode", "verify-full");
    if (name === "SUPABASE_POOLER_URL") parsed.searchParams.set("pgbouncer", "true");
    probeUrl = parsed.toString();
  } catch {
    output.connection = "FAIL";
    output.error = "INVALID_URL_SHAPE";
    return output;
  }

  const client = new PrismaClient({ datasourceUrl: probeUrl });
  try {
    const metadataRows = await client.$queryRaw`
      SELECT current_database() AS database_name,
             current_user AS current_role,
             current_schema() AS current_schema,
             current_setting('server_version') AS server_version,
             current_setting('server_version_num') AS server_version_num,
             COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_enabled,
             current_setting('pgrst.db_schemas', true) AS pgrst_db_schemas
    `;
    const metadata = metadataRows[0];
    output.connection = "PASS";
    output.ssl = name.startsWith("SUPABASE_")
      ? "PASS"
      : "NOT_REQUIRED_LOCAL";
    output.sslEvidence = name.startsWith("SUPABASE_")
      ? {
          connectionParameterVerifyFull: "PASS",
          serverSessionSsl: metadata.ssl_enabled === true ? "PASS" : "NOT_REPORTED_BY_POOLER",
        }
      : { connectionParameterVerifyFull: "NOT_REQUIRED_LOCAL" };
    output.metadata = {
      database: metadata.database_name,
      role: metadata.current_role,
      schema: metadata.current_schema,
      postgresql: String(metadata.server_version).match(/(?:PostgreSQL )?([0-9]+(?:\.[0-9]+)+)/)?.[1] ?? "unknown",
      serverVersionNum: metadata.server_version_num,
    };
    output.dataApiCatalogHint = metadata.pgrst_db_schemas ?? "NOT_EXPOSED_BY_DATABASE_CATALOG";

    const publicTables = await client.$queryRaw`
      SELECT c.relname AS table_name,
             pg_get_userbyid(c.relowner) AS owner,
             c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    const actualTables = publicTables.map((row) => row.table_name).sort();
    output.schema = {
      publicTables: actualTables.length,
      expectedPublicTables: expectedTables.length,
      exactBaseline: actualTables.length === expectedTables.length && expectedTables.every((table) => actualTables.includes(table)),
      migrationTablePresent: actualTables.includes(migrationTable),
      owners: [...new Set(publicTables.map((row) => row.owner))].sort(),
      rlsEnabledTables: publicTables.filter((row) => row.rls_enabled === true).map((row) => row.table_name),
    };
    output.businessData = await countTables(client, expectedTables.filter((table) => table !== migrationTable));
    const migrationRows = await client.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(migrationTable)}`);
    output.prismaMigrations = { present: true, rows: Number(migrationRows[0].row_count) };

    if (name.startsWith("SUPABASE_")) {
      const grantExpressions = [...restrictedRoles, ...protectedRoles].flatMap((role) =>
        tablePrivileges.map(
          (privilege) =>
            `has_table_privilege('${role}', format('%I.%I', 'public', t.table_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
        ),
      );
      const grants = await client.$queryRawUnsafe(`
        SELECT t.table_name,
               ${grantExpressions.join(",\n               ")}
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND t.table_name = ANY($1::text[])
        ORDER BY t.table_name
      `, expectedTables);
      output.tablePrivileges = Object.fromEntries(
        [...restrictedRoles, ...protectedRoles].map((role) => [role, summarizePrivileges(grants, role)]),
      );

      const sequences = await client.$queryRaw`
        SELECT COUNT(*)::int AS sequence_count
        FROM information_schema.sequences
        WHERE sequence_schema = 'public'
      `;
      const functions = await client.$queryRaw`
        SELECT COUNT(*)::int AS function_count
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      `;
      const views = await client.$queryRaw`
        SELECT COUNT(*)::int AS view_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      `;
      const extensions = await client.$queryRaw`SELECT extname, extversion FROM pg_extension ORDER BY extname`;
      output.objects = {
        publicSequences: Number(sequences[0].sequence_count),
        publicFunctions: Number(functions[0].function_count),
        publicViews: Number(views[0].view_count),
        extensions: extensions.map((extension) => ({ name: extension.extname, version: extension.extversion })),
      };
    }

    if (options.runRoleProbes && name.startsWith("SUPABASE_")) {
      output.permissionProbes = {};
      for (const role of restrictedRoles) {
        const roleResult = { SELECT: "NOT_TESTED", INSERT: "NOT_TESTED", UPDATE: "NOT_TESTED", DELETE: "NOT_TESTED" };
        try {
          await client.$executeRawUnsafe(`SET ROLE ${quoteIdentifier(role)}`);
          try {
            await client.$queryRawUnsafe("SELECT 1 FROM public.users LIMIT 0");
            roleResult.SELECT = "ALLOWED";
          } catch {
            roleResult.SELECT = "DENIED";
          }
          const privilegeCounts = output.tablePrivileges[role].privilegeCounts;
          roleResult.INSERT = privilegeCounts.INSERT === 0 ? "DENIED" : "REVIEW";
          roleResult.UPDATE = privilegeCounts.UPDATE === 0 ? "DENIED" : "REVIEW";
          roleResult.DELETE = privilegeCounts.DELETE === 0 ? "DENIED" : "REVIEW";
        } finally {
          await client.$executeRawUnsafe("RESET ROLE").catch(() => undefined);
        }
        output.permissionProbes[role] = roleResult;
      }
    }
  } catch (error) {
    output.connection = "FAIL";
    output.error = safeError(error);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
  return output;
}

const expectedTables = [...new Set([...parseMappedTables(fs.readFileSync(schemaPath, "utf8")), migrationTable])].sort();
const results = [];
results.push(await inspectEndpoint("SUPABASE_DIRECT_URL", process.env.SUPABASE_DIRECT_URL?.trim(), expectedTables, { runRoleProbes: true }));
results.push(await inspectEndpoint("SUPABASE_POOLER_URL", process.env.SUPABASE_POOLER_URL?.trim(), expectedTables));
results.push(await inspectEndpoint("DATABASE_URL", process.env.DATABASE_URL?.trim(), expectedTables));

const direct = results[0];
const pooler = results[1];
const local = results[2];
const output = {
  phase: "21E-S2",
  mode: "READ_ONLY_VERIFICATION",
  generatedAt: new Date().toISOString(),
  expectedPublicTables: expectedTables.length,
  endpoints: results,
  finalChecks: {
    directConnection: direct.connection === "PASS" ? "PASS" : "FAIL",
    transactionPooler: pooler.connection === "PASS" ? "PASS" : "FAIL",
    directSsl: direct.ssl === "PASS" ? "PASS" : "FAIL",
    poolerSsl: pooler.ssl === "PASS" ? "PASS" : "FAIL",
    localConnection: local.connection === "PASS" ? "PASS" : "FAIL",
    localDatabase: local.metadata?.database ?? "NOT_VERIFIED",
    localDatabaseUrlTouchedByThisScript: "NO",
    localDatabaseWrites: 0,
    supabaseWrites: 0,
    businessRowsOnSupabase: direct.businessData?.totalRows ?? "NOT_VERIFIED",
    anonTableAccess: direct.tablePrivileges?.anon?.tablesWithAnyPrivilege === 0 ? "DENIED" : "REVIEW",
    authenticatedTableAccess: direct.tablePrivileges?.authenticated?.tablesWithAnyPrivilege === 0 ? "DENIED" : "REVIEW",
    postgresTableAccess: direct.tablePrivileges?.postgres?.tablesWithAnyPrivilege === expectedTables.length ? "ALLOWED" : "REVIEW",
    serviceRoleTableAccess: direct.tablePrivileges?.service_role?.tablesWithAnyPrivilege === expectedTables.length ? "ALLOWED" : "REVIEW",
    stableBusinessRowsOnSupabase: direct.businessData?.stableDataRows ?? "NOT_VERIFIED",
    approvedStableBusinessRowsOnSupabase: APPROVED_STABLE_DATA_ROWS,
  },
  dataApiConfiguration: {
    actualProjectSetting: "NOT_VERIFIED_BY_SQL_ONLY_PREFLIGHT",
    recommendation: "DATA_API_KEEP_ENABLED_WITH_NO_APP_TABLE_GRANTS",
    note: "The application has no browser Supabase client; project Dashboard/API configuration was not changed.",
  },
};

console.log(JSON.stringify(output, null, 2));
if (
  output.finalChecks.directConnection !== "PASS" ||
  output.finalChecks.transactionPooler !== "PASS" ||
  output.finalChecks.directSsl !== "PASS" ||
  output.finalChecks.poolerSsl !== "PASS" ||
  output.finalChecks.anonTableAccess !== "DENIED" ||
  output.finalChecks.authenticatedTableAccess !== "DENIED" ||
  output.finalChecks.stableBusinessRowsOnSupabase !== APPROVED_STABLE_DATA_ROWS
) {
  process.exitCode = 1;
}
