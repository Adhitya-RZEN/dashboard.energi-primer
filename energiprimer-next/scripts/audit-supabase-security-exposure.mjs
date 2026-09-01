import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "schema.prisma");
const expectedRoles = ["anon", "authenticated", "service_role"];
const privilegeNames = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

const tableClassification = {
  users: {
    purpose: "Auth.js user accounts",
    businessData: "NO",
    credentials: "YES — password hash and account identity",
    authData: "YES",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "AUTH DATA / SENSITIVE DATA",
  },
  password_reset_tokens: {
    purpose: "Password-reset token records",
    businessData: "NO",
    credentials: "YES — reset token",
    authData: "YES",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "AUTH DATA / SENSITIVE DATA",
  },
  sessions: {
    purpose: "Server-side session records",
    businessData: "NO",
    credentials: "NO",
    authData: "YES",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "AUTH DATA / SENSITIVE DATA",
  },
  cache: {
    purpose: "Application cache entries",
    businessData: "NO",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "CACHE / QUEUE",
  },
  cache_locks: {
    purpose: "Application cache locks",
    businessData: "NO",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "CACHE / QUEUE",
  },
  jobs: {
    purpose: "Queued background jobs",
    businessData: "NO",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "CACHE / QUEUE",
  },
  job_batches: {
    purpose: "Queued job batch state",
    businessData: "NO",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "CACHE / QUEUE",
  },
  failed_jobs: {
    purpose: "Failed background-job payloads and exceptions",
    businessData: "NO",
    credentials: "POTENTIALLY — payload/exception must be treated as sensitive",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "CACHE / QUEUE / SENSITIVE DATA",
  },
  units: {
    purpose: "Operational unit master data",
    businessData: "YES — reference data",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  coal_stock: {
    purpose: "Coal stock measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  coal_quality: {
    purpose: "Coal quality measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  coal_consumption: {
    purpose: "Coal consumption measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  power_generation: {
    purpose: "Power-generation measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  kpi_targets: {
    purpose: "Unit KPI target and actual measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  spreadsheet_import_logs: {
    purpose: "Legacy/import outcome log",
    businessData: "NO — operational metadata only",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  sync_sources: {
    purpose: "Google Sheets source registry",
    businessData: "NO — source metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  sync_worksheets: {
    purpose: "Worksheet discovery and sync state",
    businessData: "NO — sync metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  sync_runs: {
    purpose: "Sync execution state and counters",
    businessData: "NO — sync metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  sync_row_states: {
    purpose: "Incremental sync row identity and hashes",
    businessData: "NO — sync metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  sync_schema_changes: {
    purpose: "Detected worksheet schema changes",
    businessData: "NO — sync metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  spreadsheet_import_runs: {
    purpose: "Controlled import execution state",
    businessData: "NO — import metadata",
    credentials: "NO",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "INTERNAL APPLICATION DATA",
  },
  spreadsheet_import_staging: {
    purpose: "Raw/normalized staging rows before import",
    businessData: "YES — source staging content",
    credentials: "NO by schema design",
    authData: "NO",
    internalState: "YES",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA / INTERNAL APPLICATION DATA",
  },
  biomass_receipts: {
    purpose: "Biomass receipt measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  coal_receipts: {
    purpose: "Coal receipt measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  biomass_consumptions: {
    purpose: "Biomass consumption measurements by unit/date",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  solar_receipts: {
    purpose: "Solar receipt measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  solar_consumptions: {
    purpose: "Solar consumption measurements",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  hop_readings: {
    purpose: "Hours-of-operation readings by unit/date",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  biomass_targets: {
    purpose: "Annual Biomassa target records",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
  biomass_cumulative_snapshots: {
    purpose: "Cumulative Biomassa realization snapshots",
    businessData: "YES",
    credentials: "NO",
    authData: "NO",
    internalState: "NO",
    browserAccess: "NO",
    serverAccess: "YES",
    category: "BUSINESS DATA",
  },
};

const migrationClassification = {
  purpose: "Prisma migration bookkeeping",
  businessData: "NO",
  credentials: "NO",
  authData: "NO",
  internalState: "YES",
  browserAccess: "NO",
  serverAccess: "YES",
  category: "MIGRATION METADATA",
};

function parseModelTables(schema) {
  return [...schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)].map(
    ([, modelName, body]) => body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName,
  );
}

function createClient(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}

function directUrlIsAllowed(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "postgresql:" &&
      url.port === "5432" &&
      !url.hostname.toLowerCase().includes("pooler") &&
      !url.searchParams.has("pgbouncer")
    );
  } catch {
    return false;
  }
}

function tableAccess(grants, tableName, role) {
  const row = grants.find((grant) => grant.table_name === tableName);
  if (!row) return { available: false };
  const prefix = `${role}_`;
  const privileges = Object.fromEntries(
    privilegeNames.map((privilege) => [
      privilege.toLowerCase(), row[`${prefix}${privilege.toLowerCase()}`] === true,
    ]),
  );
  return {
    available: true,
    ...privileges,
    any: Object.values(privileges).some(Boolean),
  };
}

function classifyTable(tableName) {
  if (tableName === "_prisma_migrations") return migrationClassification;
  return (
    tableClassification[tableName] ?? {
      purpose: "Unclassified public table",
      businessData: "REVIEW",
      credentials: "REVIEW",
      authData: "REVIEW",
      internalState: "REVIEW",
      browserAccess: "NO",
      serverAccess: "REVIEW",
      category: "REVIEW",
    }
  );
}

const result = {
  status: "BLOCKED",
  mode: "read-only metadata security audit",
  target: "SUPABASE_DIRECT_CONNECTION",
  databaseWrites: 0,
  schemaChanged: "NO",
  rowDataRead: "NO",
  failures: [],
  findings: [],
};

if (!process.env.SUPABASE_DIRECT_URL) {
  result.failures.push("SUPABASE_DIRECT_URL is not configured");
} else if (!directUrlIsAllowed(process.env.SUPABASE_DIRECT_URL)) {
  result.failures.push("audit requires an SSL Direct Connection shape on port 5432");
} else {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const expectedTables = parseModelTables(schema);
  const client = createClient(process.env.SUPABASE_DIRECT_URL);

  try {
    const metadata = await client.$queryRaw`
      SELECT current_database() AS database_name,
             current_user AS current_role,
             current_schema() AS schema_name,
             version() AS server_version,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
    `;
    const metadataRow = metadata[0];
    result.database = metadataRow.database_name;
    result.role = metadataRow.current_role;
    result.schema = metadataRow.schema_name;
    result.postgresql = String(metadataRow.server_version).match(/PostgreSQL ([0-9.]+)/)?.[1] ?? "unknown";
    result.ssl = metadataRow.ssl === true ? "PASS" : "FAIL";
    if (metadataRow.ssl !== true) result.failures.push("Direct Connection SSL is not active");

    const roleRows = await client.$queryRaw`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
      FROM pg_roles
      WHERE rolname IN (${expectedRoles[0]}, ${expectedRoles[1]}, ${expectedRoles[2]}, ${"postgres"})
      ORDER BY rolname
    `;
    result.roles = roleRows.map((row) => ({
      role: row.rolname,
      superuser: row.rolsuper,
      bypassRls: row.rolbypassrls,
      canLogin: row.rolcanlogin,
    }));
    const foundRoles = new Set(roleRows.map((row) => row.rolname));
    for (const role of expectedRoles) {
      if (!foundRoles.has(role)) result.failures.push(`expected Supabase role is missing: ${role}`);
    }

    const schemaPrivileges = await client.$queryRaw`
      SELECT
        has_schema_privilege(${expectedRoles[0]}, ${"public"}, ${"USAGE"}) AS anon_usage,
        has_schema_privilege(${expectedRoles[0]}, ${"public"}, ${"CREATE"}) AS anon_create,
        has_schema_privilege(${expectedRoles[1]}, ${"public"}, ${"USAGE"}) AS authenticated_usage,
        has_schema_privilege(${expectedRoles[1]}, ${"public"}, ${"CREATE"}) AS authenticated_create,
        has_schema_privilege(${expectedRoles[2]}, ${"public"}, ${"USAGE"}) AS service_role_usage,
        has_schema_privilege(${expectedRoles[2]}, ${"public"}, ${"CREATE"}) AS service_role_create
    `;
    result.publicSchemaPrivileges = schemaPrivileges[0];

    const tableRows = await client.$queryRaw`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${"public"} AND c.relkind = ${"r"}
      ORDER BY c.relname
    `;
    const actualTables = tableRows.map((row) => row.table_name);
    const applicationTables = actualTables.filter((name) => name !== "_prisma_migrations");
    result.tableInventory = {
      expectedApplicationTables: expectedTables.length,
      actualPublicTables: actualTables.length,
      actualApplicationTables: applicationTables.length,
      allExpectedApplicationTablesPresent: expectedTables.every((name) => applicationTables.includes(name)),
      noUnexpectedApplicationTables: applicationTables.every((name) => expectedTables.includes(name)),
      prismaMigrationTablePresent: actualTables.includes("_prisma_migrations"),
    };
    if (
      expectedTables.length !== 30 ||
      applicationTables.length !== 30 ||
      !result.tableInventory.allExpectedApplicationTablesPresent ||
      !result.tableInventory.noUnexpectedApplicationTables
    ) {
      result.failures.push("public application table inventory is not the expected 30-table set");
    }

    const grantSelect = expectedRoles.flatMap((role) =>
      privilegeNames.map(
        (privilege) =>
          `has_table_privilege('${role}', format('%I.%I', 'public', t.table_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
      ),
    );
    const grants = await client.$queryRawUnsafe(`
      SELECT t.table_name, ${grantSelect.join(",\n             ")}
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);

    const policies = await client.$queryRaw`
      SELECT tablename, policyname, roles, cmd, permissive
      FROM pg_policies
      WHERE schemaname = ${"public"}
      ORDER BY tablename, policyname
    `;
    const policiesByTable = new Map();
    for (const policy of policies) {
      if (!policiesByTable.has(policy.tablename)) policiesByTable.set(policy.tablename, []);
      policiesByTable.get(policy.tablename).push({
        name: policy.policyname,
        roles: policy.roles,
        command: policy.cmd,
        permissive: policy.permissive,
      });
    }

    const tables = tableRows.map((row) => {
      const classification = classifyTable(row.table_name);
      const access = Object.fromEntries(
        expectedRoles.map((role) => [role, tableAccess(grants, row.table_name, role)]),
      );
      const directBrowserAccess =
        access.anon.any === true || access.authenticated.any === true;
      const dataApiExposure = directBrowserAccess ? "YES" : "NO";
      return {
        table: row.table_name,
        purpose: classification.purpose,
        containsBusinessData: classification.businessData,
        containsCredentialsOrSecrets: classification.credentials,
        containsAuthData: classification.authData,
        containsInternalApplicationState: classification.internalState,
        expectedBrowserAccess: classification.browserAccess,
        expectedServerOnlyAccess: classification.serverAccess,
        category: classification.category,
        rlsEnabled: row.rls_enabled,
        rlsForced: row.rls_forced,
        owner: row.owner,
        policies: policiesByTable.get(row.table_name) ?? [],
        privileges: access,
        dataApiExposure,
        directBrowserAccess: directBrowserAccess ? "YES" : "NO",
      };
    });
    result.tables = tables;

    const rlsDisabled = tables.filter((table) => table.rlsEnabled === false).map((table) => table.table);
    result.rlsDisabled = {
      count: rlsDisabled.length,
      tables: rlsDisabled,
      policiesInPublicSchema: policies.length,
    };
    const dataApiTables = tables.filter((table) => table.dataApiExposure === "YES").map((table) => table.table);
    const unexpectedBrowserTables = tables
      .filter((table) => table.expectedBrowserAccess === "NO" && table.directBrowserAccess === "YES")
      .map((table) => table.table);
    result.dataApi = {
      exposedTables: dataApiTables.length,
      tablesWithAnonOrAuthenticatedPrivilege: dataApiTables,
      directBrowserAccess: unexpectedBrowserTables.length > 0 ? "YES" : "NO — based on database grants and source audit",
      unexpectedBrowserAccessibleTables: unexpectedBrowserTables,
    };
    if (unexpectedBrowserTables.length > 0) {
      result.findings.push({
        severity: "CRITICAL",
        key: "unexpected-direct-browser-grant",
        tables: unexpectedBrowserTables,
        basis: "anon/authenticated have effective table privileges although application expects server-only access",
      });
    }

    const extensions = await client.$queryRaw`
      SELECT extname, extversion
      FROM pg_extension
      ORDER BY extname
    `;
    result.extensions = extensions.map((row) => ({ name: row.extname, version: row.extversion }));
  } catch {
    result.failures.push("read-only Supabase security metadata inspection failed");
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

if (result.rlsDisabled?.count > 0) {
  result.findings.push({
    severity: "MEDIUM",
    key: "rls-disabled-public-tables",
    count: result.rlsDisabled.count,
    tables: result.rlsDisabled.tables,
    basis: "Security Advisor-style warning; exploitability depends on effective Data API grants and exposed schema",
  });
}

if (result.dataApi?.exposedTables > 0) {
  result.findings.push({
    severity: "HIGH",
    key: "data-api-effective-grants",
    count: result.dataApi.exposedTables,
    tables: result.dataApi.tablesWithAnonOrAuthenticatedPrivilege,
    basis: "anon/authenticated have at least one effective table privilege",
  });
}

result.status = result.failures.length === 0 ? "PASS" : "BLOCKED";
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
