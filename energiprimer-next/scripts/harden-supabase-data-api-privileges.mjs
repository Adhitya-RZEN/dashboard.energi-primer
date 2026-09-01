import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "production", "schema.prisma");
const requestedMode = process.argv.includes("--execute") ? "execute" : "preflight";
const migrationTable = "_prisma_migrations";
const protectedRoles = ["postgres", "service_role"];
const restrictedRoles = ["anon", "authenticated"];
const tablePrivileges = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

function parseMappedTables(schema) {
  return [...schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)].map(
    ([, modelName, body]) => body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName,
  );
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe identifier returned by metadata query: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteTableList(tableNames) {
  return tableNames.map((tableName) => `public.${quoteIdentifier(tableName)}`).join(", ");
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

function anyPrivilege(row, role) {
  return tablePrivileges.some((privilege) => row[`${role}_${privilege.toLowerCase()}`] === true);
}

function privilegeSummary(rows, role) {
  return {
    tablesChecked: rows.length,
    tablesWithAnyPrivilege: rows.filter((row) => anyPrivilege(row, role)).length,
    privileges: Object.fromEntries(
      tablePrivileges.map((privilege) => [
        privilege,
        rows.filter((row) => row[`${role}_${privilege.toLowerCase()}`] === true).length,
      ]),
    ),
  };
}

function aclContainsRole(acl, role) {
  return String(acl ?? "").split(",").some((entry) => entry.startsWith(`${role}=`));
}

function aclContainsPublic(acl) {
  return String(acl ?? "").split(",").some((entry) => entry.startsWith("="));
}

function safeValue(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function buildResult() {
  return {
    phase: "21E-S2",
    mode: requestedMode,
    target: "SUPABASE_DIRECT_CONNECTION",
    status: "BLOCKED",
    databaseWrites: 0,
    permissionChanges: 0,
    schemaChanged: "NO",
    businessDataChanged: "NO",
    failures: [],
    warnings: [],
  };
}

const result = buildResult();
const productionSchema = fs.readFileSync(schemaPath, "utf8");
const applicationTables = [...new Set(parseMappedTables(productionSchema))].sort();
const expectedTables = [...applicationTables, migrationTable].sort();

if (applicationTables.length !== 30) {
  result.failures.push(`production schema maps ${applicationTables.length} application tables; expected 30`);
}

if (!process.env.SUPABASE_DIRECT_URL) {
  result.failures.push("SUPABASE_DIRECT_URL is not configured");
} else if (!directUrlIsAllowed(process.env.SUPABASE_DIRECT_URL)) {
  result.failures.push("SUPABASE_DIRECT_URL is not an approved Direct Connection shape on port 5432");
}

async function readPreflight(client) {
  const metadataRows = await client.$queryRaw`
    SELECT current_database() AS database_name,
           current_user AS current_role,
           current_schema() AS current_schema,
           version() AS server_version,
           (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl,
           current_setting('pgrst.db_schemas', true) AS pgrst_db_schemas,
           current_setting('pgrst.db_extra_search_path', true) AS pgrst_db_extra_search_path
  `;
  const metadata = metadataRows[0];
  result.connection = {
    database: safeValue(metadata.database_name),
    role: safeValue(metadata.current_role),
    schema: safeValue(metadata.current_schema),
    postgresql: String(metadata.server_version).match(/PostgreSQL ([0-9.]+)/)?.[1] ?? "unknown",
    ssl: metadata.ssl === true ? "PASS" : "FAIL",
  };
  result.dataApiCatalogHints = {
    pgrstDbSchemas: safeValue(metadata.pgrst_db_schemas),
    pgrstDbExtraSearchPath: safeValue(metadata.pgrst_db_extra_search_path),
    note: "Supabase Dashboard/Data API project configuration is not inferred from table grants alone.",
  };
  if (metadata.ssl !== true) result.failures.push("Supabase Direct Connection SSL is not active");
  if (metadata.current_schema !== "public") result.failures.push("current schema is not public");

  const roles = await client.$queryRaw`
    SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
    ORDER BY rolname
  `;
  result.roles = roles.map((role) => ({
    role: role.rolname,
    superuser: role.rolsuper,
    bypassRls: role.rolbypassrls,
    canLogin: role.rolcanlogin,
  }));
  const roleNames = new Set(roles.map((role) => role.rolname));
  for (const role of [...restrictedRoles, ...protectedRoles]) {
    if (!roleNames.has(role)) result.failures.push(`required role is missing: ${role}`);
  }

  const schemaPrivilegeRows = await client.$queryRaw`
    SELECT n.nspname AS schema_name,
           n.nspacl::text AS schema_acl,
           has_schema_privilege('anon', 'public', 'USAGE') AS anon_usage,
           has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
           has_schema_privilege('authenticated', 'public', 'USAGE') AS authenticated_usage,
           has_schema_privilege('authenticated', 'public', 'CREATE') AS authenticated_create,
           has_schema_privilege('service_role', 'public', 'USAGE') AS service_role_usage,
           has_schema_privilege('service_role', 'public', 'CREATE') AS service_role_create,
           has_schema_privilege('postgres', 'public', 'USAGE') AS postgres_usage,
           has_schema_privilege('postgres', 'public', 'CREATE') AS postgres_create
    FROM pg_namespace n
    WHERE n.nspname = 'public'
  `;
  result.publicSchema = schemaPrivilegeRows[0]
    ? {
        acl: safeValue(schemaPrivilegeRows[0].schema_acl),
        anonUsage: schemaPrivilegeRows[0].anon_usage === true,
        anonCreate: schemaPrivilegeRows[0].anon_create === true,
        authenticatedUsage: schemaPrivilegeRows[0].authenticated_usage === true,
        authenticatedCreate: schemaPrivilegeRows[0].authenticated_create === true,
        serviceRoleUsage: schemaPrivilegeRows[0].service_role_usage === true,
        serviceRoleCreate: schemaPrivilegeRows[0].service_role_create === true,
        postgresUsage: schemaPrivilegeRows[0].postgres_usage === true,
        postgresCreate: schemaPrivilegeRows[0].postgres_create === true,
      }
    : null;
  if (!result.publicSchema) result.failures.push("public schema was not found");

  const tableRows = await client.$queryRaw`
    SELECT c.relname AS table_name,
           pg_get_userbyid(c.relowner) AS owner,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           c.relacl::text AS acl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `;
  const actualTables = tableRows.map((row) => row.table_name).sort();
  const missingTables = expectedTables.filter((tableName) => !actualTables.includes(tableName));
  const unexpectedTables = actualTables.filter((tableName) => !expectedTables.includes(tableName));
  result.tables = {
    expectedApplicationTables: applicationTables.length,
    expectedPublicTables: expectedTables.length,
    actualPublicTables: actualTables.length,
    missingTables,
    unexpectedTables,
    prismaMigrationTablePresent: actualTables.includes(migrationTable),
    owners: [...new Set(tableRows.map((row) => row.owner))].sort(),
    rlsEnabledTables: tableRows.filter((row) => row.rls_enabled === true).map((row) => row.table_name),
  };
  if (missingTables.length || unexpectedTables.length) {
    result.failures.push("public table inventory differs from the controlled production schema baseline");
  }
  if (tableRows.some((row) => row.owner !== "postgres")) {
    result.failures.push("one or more expected public tables are not owned by postgres; privilege scope needs review");
  }

  const grantExpressions = [...restrictedRoles, ...protectedRoles].flatMap((role) =>
    tablePrivileges.map(
      (privilege) =>
        `has_table_privilege('${role}', format('%I.%I', 'public', t.table_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
    ),
  );
  const grants = await client.$queryRawUnsafe(`
    SELECT t.table_name,
           c.relacl::text AS acl,
           ${grantExpressions.join(",\n           ")}
    FROM information_schema.tables t
    JOIN pg_class c ON c.relname = t.table_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);
  const controlledGrants = grants.filter((row) => expectedTables.includes(row.table_name));
  result.grantsBefore = Object.fromEntries(
    [...restrictedRoles, ...protectedRoles].map((role) => [role, privilegeSummary(controlledGrants, role)]),
  );
  result.aclSourcesBefore = {
    tablesWithExplicitAnon: controlledGrants.filter((row) => aclContainsRole(row.acl, "anon")).length,
    tablesWithExplicitAuthenticated: controlledGrants.filter((row) => aclContainsRole(row.acl, "authenticated")).length,
    tablesWithPublicAcl: controlledGrants.filter((row) => aclContainsPublic(row.acl)).length,
    tableAclExamples: controlledGrants.slice(0, 3).map((row) => ({ table: row.table_name, acl: safeValue(row.acl) })),
  };
  if (controlledGrants.length !== expectedTables.length) {
    result.failures.push("privilege inspection did not cover every expected public table");
  }

  const rowCountRows = await Promise.all(
    applicationTables.map(async (tableName) => {
      const rows = await client.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(tableName)}`,
      );
      return { table: tableName, rowCount: Number(rows[0].row_count) };
    }),
  );
  result.businessData = {
    totalApplicationRows: rowCountRows.reduce((total, row) => total + row.rowCount, 0),
    nonEmptyTables: rowCountRows.filter((row) => row.rowCount > 0),
  };
  if (result.businessData.totalApplicationRows !== 0) {
    result.failures.push("target contains existing application rows; permission hardening is stopped by safety policy");
  }

  const migrationRows = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(migrationTable)}`,
  );
  result.prismaMigrations = { present: true, rowCount: Number(migrationRows[0].row_count) };

  const sequences = await client.$queryRaw`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name
  `;
  const serialSequences = await client.$queryRaw`
    SELECT c.relname AS table_name,
           regexp_replace(pg_get_serial_sequence(format('%I.%I', 'public', c.relname), 'id'), '^public\\.', '') AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname
     AND col.table_name = c.relname
     AND col.column_name = 'id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY(${expectedTables})
      AND pg_get_serial_sequence(format('%I.%I', 'public', c.relname), 'id') IS NOT NULL
    ORDER BY c.relname
  `;
  const expectedSequenceNames = serialSequences.map((row) => row.sequence_name).sort();
  const actualSequenceNames = sequences.map((row) => row.sequence_name).sort();
  result.sequences = {
    actual: actualSequenceNames,
    expectedForControlledTables: expectedSequenceNames,
    unexpected: actualSequenceNames.filter((name) => !expectedSequenceNames.includes(name)),
    missing: expectedSequenceNames.filter((name) => !actualSequenceNames.includes(name)),
  };
  if (result.sequences.unexpected.length || result.sequences.missing.length) {
    result.failures.push("public sequence inventory is not limited to the controlled production schema baseline");
  }

  const sequenceGrantExpressions = [...restrictedRoles, ...protectedRoles].flatMap((role) =>
    ["USAGE", "SELECT", "UPDATE"].map(
      (privilege) =>
        `has_sequence_privilege('${role}', format('%I.%I', 'public', s.sequence_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
    ),
  );
  const sequenceGrants = await client.$queryRawUnsafe(`
    SELECT s.sequence_name,
           c.relacl::text AS acl,
           ${sequenceGrantExpressions.join(",\n           ")}
    FROM information_schema.sequences s
    JOIN pg_class c ON c.relname = s.sequence_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.sequence_schema
    WHERE s.sequence_schema = 'public'
    ORDER BY s.sequence_name
  `);
  result.sequenceGrantsBefore = Object.fromEntries(
    [...restrictedRoles, ...protectedRoles].map((role) => [
      role,
      {
        sequencesChecked: sequenceGrants.length,
        withAnyPrivilege: sequenceGrants.filter((row) =>
          ["USAGE", "SELECT", "UPDATE"].some((privilege) => row[`${role}_${privilege.toLowerCase()}`] === true),
        ).length,
      },
    ]),
  );

  const views = await client.$queryRaw`
    SELECT c.relname AS object_name, c.relkind AS object_kind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f')
    ORDER BY c.relname
  `;
  const functions = await client.$queryRaw`
    SELECT p.oid::bigint AS oid,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_function_result(p.oid) AS result_type,
           p.prokind AS kind,
           p.prosecdef AS security_definer,
           p.provolatile AS volatility,
           p.proconfig::text AS configuration,
           pg_get_functiondef(p.oid) AS definition,
           pg_get_userbyid(p.proowner) AS owner,
           p.proacl::text AS acl,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
           has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname, arguments
  `;
  const publicFunctionOids = functions.map((fn) => fn.oid);
  const functionTriggers = publicFunctionOids.length
    ? await client.$queryRaw`
        SELECT t.tgname AS trigger_name,
               c.relname AS table_name,
               t.tgenabled AS enabled,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND t.tgfoid IN (SELECT p.oid FROM pg_proc p WHERE p.oid = ANY(${publicFunctionOids}::oid[]))
        ORDER BY c.relname, t.tgname
      `
    : [];
  const eventTriggers = await client.$queryRaw`
    SELECT e.evtname AS trigger_name,
           e.evtenabled AS enabled,
           pg_get_userbyid(e.evtowner) AS owner,
           p.proname AS function_name
    FROM pg_event_trigger e
    JOIN pg_proc p ON p.oid = e.evtfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY e.evtname
  `;
  result.publicApiObjects = {
    views: views.map((view) => ({ name: view.object_name, kind: view.object_kind, owner: view.owner })),
    functions: functions.map((fn) => ({
      oid: String(fn.oid),
      name: fn.function_name,
      arguments: fn.arguments,
      resultType: fn.result_type,
      kind: fn.kind,
      securityDefiner: fn.security_definer,
      volatility: fn.volatility,
      configuration: safeValue(fn.configuration),
      definition: safeValue(fn.definition),
      owner: fn.owner,
      acl: safeValue(fn.acl),
      execute: {
        anon: fn.anon_execute === true,
        authenticated: fn.authenticated_execute === true,
        serviceRole: fn.service_role_execute === true,
        postgres: fn.postgres_execute === true,
      },
    })),
    triggers: functionTriggers.map((trigger) => ({
      name: trigger.trigger_name,
      table: trigger.table_name,
      enabled: trigger.enabled,
      definition: trigger.definition,
    })),
    eventTriggers: eventTriggers.map((trigger) => ({
      name: trigger.trigger_name,
      enabled: trigger.enabled,
      owner: trigger.owner,
      function: trigger.function_name,
    })),
  };
  const unexpectedFunctions = functions.filter(
    (fn) =>
      fn.function_name !== "rls_auto_enable" ||
      fn.arguments !== "" ||
      fn.result_type !== "event_trigger" ||
      fn.owner !== "postgres",
  );
  if (views.length || unexpectedFunctions.length) {
    result.warnings.push("public views or non-baseline functions exist and are excluded from automatic hardening");
  }

  const policies = await client.$queryRaw`
    SELECT tablename, policyname, roles, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;
  result.publicPolicies = policies.map((policy) => ({
    table: policy.tablename,
    name: policy.policyname,
    roles: policy.roles,
    command: policy.cmd,
  }));

  const defaultPrivileges = await client.$queryRaw`
    SELECT COALESCE(n.nspname, '<all schemas>') AS schema_name,
           r.rolname AS owner_role,
           d.defaclobjtype AS object_type,
           d.defaclacl::text AS acl
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace IS NULL
    ORDER BY schema_name, owner_role, object_type
  `;
  result.defaultPrivilegesBefore = defaultPrivileges.map((entry) => ({
    schema: entry.schema_name,
    owner: entry.owner_role,
    objectType: entry.object_type,
    acl: safeValue(entry.acl),
  }));

  const targetHasOnlyExpectedTables = missingTables.length === 0 && unexpectedTables.length === 0;
  result.preflight = {
    directConnection: "PASS",
    ssl: result.connection.ssl,
    targetEmpty: result.businessData.totalApplicationRows === 0,
    exactPublicTableBaseline: targetHasOnlyExpectedTables,
    noUnexpectedPublicSequences: result.sequences.unexpected.length === 0,
    noMissingPublicSequences: result.sequences.missing.length === 0,
    noUnexpectedPublicApiObjects: views.length === 0 && unexpectedFunctions.length === 0,
    anonAuthenticatedTableAccessCurrentlyPresent:
      result.grantsBefore.anon.tablesWithAnyPrivilege > 0 || result.grantsBefore.authenticated.tablesWithAnyPrivilege > 0,
    protectedRolesRetainTableAccess:
      result.grantsBefore.postgres.tablesWithAnyPrivilege === expectedTables.length &&
      result.grantsBefore.service_role.tablesWithAnyPrivilege === expectedTables.length,
  };

  if (views.length || unexpectedFunctions.length) {
    result.failures.push("automatic hardening refuses to alter unexpected public views/non-baseline functions");
  }
  const hasBaselineRlsAutoEnable = functions.some(
    (fn) =>
      fn.function_name === "rls_auto_enable" &&
      fn.arguments === "" &&
      fn.result_type === "event_trigger" &&
      fn.owner === "postgres",
  );
  result.functionExecutionBefore = functions.map((fn) => ({
    name: fn.function_name,
    arguments: fn.arguments,
    anon: fn.anon_execute === true,
    authenticated: fn.authenticated_execute === true,
    serviceRole: fn.service_role_execute === true,
    postgres: fn.postgres_execute === true,
  }));
  result.baselineRlsAutoEnableFunction = hasBaselineRlsAutoEnable;
  if (hasBaselineRlsAutoEnable) {
    result.warnings.push(
      "public.rls_auto_enable() is a baseline SECURITY DEFINER event-trigger helper; only anon/authenticated EXECUTE will be removed",
    );
  }
  if (defaultPrivileges.some((entry) => entry.owner_role === "supabase_admin")) {
    result.warnings.push(
      "Supabase-managed supabase_admin default privileges are observed and intentionally left unchanged",
    );
  }
  if (result.grantsBefore.postgres.tablesWithAnyPrivilege !== expectedTables.length) {
    result.failures.push("postgres does not retain access to every expected table");
  }
  if (result.grantsBefore.service_role.tablesWithAnyPrivilege !== expectedTables.length) {
    result.failures.push("service_role does not retain access to every expected table");
  }

  return {
    tableRows,
    grants: controlledGrants,
    sequenceGrants,
    defaultPrivileges,
    hasBaselineRlsAutoEnable,
  };
}

async function applyHardening(client, metadata) {
  if (result.failures.length) return false;

  const tablesSql = quoteTableList(expectedTables);
  const sequencesSql = result.sequences.expectedForControlledTables.map(
    (sequenceName) => `public.${quoteIdentifier(sequenceName)}`,
  ).join(", ");

  try {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON TABLE ${tablesSql} FROM "anon", "authenticated"`,
      );
      if (sequencesSql) {
        await tx.$executeRawUnsafe(
          `REVOKE ALL PRIVILEGES ON SEQUENCE ${sequencesSql} FROM "anon", "authenticated"`,
        );
      }
      if (metadata.hasBaselineRlsAutoEnable) {
        await tx.$executeRawUnsafe(
          `REVOKE ALL PRIVILEGES ON FUNCTION public."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated"`,
        );
      }
      await tx.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "anon", "authenticated"`,
      );
      await tx.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon", "authenticated"`,
      );
      await tx.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "anon", "authenticated"`,
      );

      const verificationExpressions = [...restrictedRoles, ...protectedRoles].flatMap((role) =>
        tablePrivileges.map(
          (privilege) =>
            `has_table_privilege('${role}', format('%I.%I', 'public', t.table_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
        ),
      );
      const verificationRows = await tx.$queryRawUnsafe(`
        SELECT t.table_name,
               ${verificationExpressions.join(",\n               ")}
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          AND t.table_name = ANY($1::text[])
        ORDER BY t.table_name
      `, expectedTables);
      const restrictedStillHaveAccess = restrictedRoles.some((role) =>
        verificationRows.some((row) => anyPrivilege(row, role)),
      );
      const protectedLostAccess = protectedRoles.some((role) =>
        verificationRows.some((row) => !anyPrivilege(row, role)),
      );
      if (restrictedStillHaveAccess) {
        throw new Error(
          "anon/authenticated still inherit a table privilege after explicit revoke; transaction rolled back to avoid touching PUBLIC grants automatically",
        );
      }
      if (protectedLostAccess) {
        throw new Error("postgres/service_role access verification failed; transaction rolled back");
      }
      if (metadata.hasBaselineRlsAutoEnable) {
        const functionVerification = await tx.$queryRaw`
          SELECT has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') AS anon_execute,
                 has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') AS authenticated_execute,
                 has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE') AS service_role_execute,
                 has_function_privilege('postgres', 'public.rls_auto_enable()', 'EXECUTE') AS postgres_execute
        `;
        const functionAccess = functionVerification[0];
        if (functionAccess.anon_execute || functionAccess.authenticated_execute) {
          throw new Error("anon/authenticated still have EXECUTE on public.rls_auto_enable(); transaction rolled back");
        }
        if (!functionAccess.service_role_execute || !functionAccess.postgres_execute) {
          throw new Error("postgres/service_role function access verification failed; transaction rolled back");
        }
      }
    });
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : "permission transaction failed");
    return false;
  }

  result.permissionChanges = metadata.hasBaselineRlsAutoEnable ? 6 : 5;
  return true;
}

async function readPostVerification(client) {
  const grantExpressions = [...restrictedRoles, ...protectedRoles].flatMap((role) =>
    tablePrivileges.map(
      (privilege) =>
        `has_table_privilege('${role}', format('%I.%I', 'public', t.table_name), '${privilege}') AS ${role}_${privilege.toLowerCase()}`,
    ),
  );
  const grants = await client.$queryRawUnsafe(`
    SELECT t.table_name,
           ${grantExpressions.join(",\n           ")}
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND t.table_name = ANY($1::text[])
    ORDER BY t.table_name
  `, expectedTables);
  result.grantsAfter = Object.fromEntries(
    [...restrictedRoles, ...protectedRoles].map((role) => [role, privilegeSummary(grants, role)]),
  );

  const defaultPrivilegesAfter = await client.$queryRaw`
    SELECT COALESCE(n.nspname, '<all schemas>') AS schema_name,
           r.rolname AS owner_role,
           d.defaclobjtype AS object_type,
           d.defaclacl::text AS acl
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace IS NULL
    ORDER BY schema_name, owner_role, object_type
  `;
  result.defaultPrivilegesAfter = defaultPrivilegesAfter.map((entry) => ({
    schema: entry.schema_name,
    owner: entry.owner_role,
    objectType: entry.object_type,
    acl: safeValue(entry.acl),
  }));

  const rowCounts = await Promise.all(
    applicationTables.map(async (tableName) => {
      const rows = await client.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(tableName)}`,
      );
      return { table: tableName, rowCount: Number(rows[0].row_count) };
    }),
  );
  result.postVerification = {
    restrictedRolesHaveNoTablePrivileges: restrictedRoles.every(
      (role) => result.grantsAfter[role].tablesWithAnyPrivilege === 0,
    ),
    protectedRolesRetainAllTablePrivileges: protectedRoles.every(
      (role) => result.grantsAfter[role].tablesWithAnyPrivilege === expectedTables.length,
    ),
    totalApplicationRows: rowCounts.reduce((total, row) => total + row.rowCount, 0),
    nonEmptyTables: rowCounts.filter((row) => row.rowCount > 0),
  };
  if (result.baselineRlsAutoEnableFunction) {
    const functionVerification = await client.$queryRaw`
      SELECT has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') AS anon_execute,
             has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') AS authenticated_execute,
             has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE') AS service_role_execute,
             has_function_privilege('postgres', 'public.rls_auto_enable()', 'EXECUTE') AS postgres_execute
    `;
    const functionAccess = functionVerification[0];
    result.functionExecutionAfter = {
      anon: functionAccess.anon_execute === true,
      authenticated: functionAccess.authenticated_execute === true,
      serviceRole: functionAccess.service_role_execute === true,
      postgres: functionAccess.postgres_execute === true,
    };
    result.postVerification.restrictedRolesHaveNoFunctionExecute =
      !functionAccess.anon_execute && !functionAccess.authenticated_execute;
    result.postVerification.protectedRolesRetainFunctionExecute =
      functionAccess.service_role_execute === true && functionAccess.postgres_execute === true;
    if (!result.postVerification.restrictedRolesHaveNoFunctionExecute) {
      result.failures.push("anon/authenticated still have EXECUTE on the baseline public function");
    }
    if (!result.postVerification.protectedRolesRetainFunctionExecute) {
      result.failures.push("postgres/service_role function EXECUTE baseline changed");
    }
  }
  if (!result.postVerification.restrictedRolesHaveNoTablePrivileges) {
    result.failures.push("anon/authenticated still have table privileges after hardening");
  }
  if (!result.postVerification.protectedRolesRetainAllTablePrivileges) {
    result.failures.push("postgres/service_role table privilege baseline changed");
  }
  if (result.postVerification.totalApplicationRows !== 0) {
    result.failures.push("application row count changed unexpectedly");
  }
}

if (result.failures.length === 0) {
  const client = createClient(process.env.SUPABASE_DIRECT_URL);
  try {
    const metadata = await readPreflight(client);
    if (requestedMode === "execute") {
      const applied = await applyHardening(client, metadata);
      if (applied) await readPostVerification(client);
    }
    if (result.failures.length === 0) {
      result.status = requestedMode === "execute" ? "PASS" : "PREFLIGHT_PASS";
    }
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : "Supabase preflight failed");
  } finally {
    await client.$disconnect();
  }
}

if (result.failures.length > 0) result.status = "BLOCKED";
console.log(JSON.stringify(result, null, 2));
if (result.status === "BLOCKED") process.exitCode = 1;
