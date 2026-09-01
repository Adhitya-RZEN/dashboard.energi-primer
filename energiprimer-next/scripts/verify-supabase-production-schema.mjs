import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "schema.prisma");
const artifactPath = path.join(
  projectDirectory,
  "docs",
  "SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql",
);
const expectedMigrationName = "20260901130000_production_schema_baseline";

function parseModelTables(schema) {
  return [...schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)].map(
    ([, modelName, body]) => body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName,
  );
}

function parseArtifact(artifact) {
  const tableBlocks = [
    ...artifact.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g),
  ];
  const tables = tableBlocks.map(([, name, body]) => {
    const columns = body
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s{4}"([^"]+)"\s+(.+?)(?:,)?\s*$/);
        if (!match) return null;
        const definition = match[2].replace(/,\s*$/, "").trim();
        return {
          name: match[1],
          definition,
          required: /\bNOT NULL\b/.test(definition),
          hasDefault:
            /\bDEFAULT\b/.test(definition) || /^BIGSERIAL\b/.test(definition),
        };
      })
      .filter(Boolean);
    return { name, columns };
  });

  return {
    tables,
    indexNames: [...artifact.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(
      ([, name]) => name,
    ),
    uniqueIndexNames: [...artifact.matchAll(/CREATE UNIQUE INDEX "([^"]+)"/g)].map(
      ([, name]) => name,
    ),
    foreignKeys: [
      ...artifact.matchAll(
        /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)"\(([^)]+)\) ON DELETE (\w+) ON UPDATE (\w+)/g,
      ),
    ].map(
      ([, tableName, name, columns, referencedTable, referencedColumns, onDelete, onUpdate]) => ({
        tableName,
        name,
        columns,
        referencedTable,
        referencedColumns,
        onDelete,
        onUpdate,
      }),
    ),
  };
}

function expectedType(definition) {
  const token = definition.match(
    /^(BIGSERIAL|BIGINT|SMALLINT|INTEGER|TEXT|BOOLEAN|DATE|TIMESTAMP\(\d+\)|VARCHAR\(\d+\)|DECIMAL\(\d+,\d+\))/,
  )?.[1];
  if (!token) return null;
  if (token === "BIGSERIAL" || token === "BIGINT") return ["bigint", "int8"];
  if (token === "SMALLINT") return ["smallint", "int2"];
  if (token === "INTEGER") return ["integer", "int4"];
  if (token === "TEXT") return ["text", "text"];
  if (token === "BOOLEAN") return ["boolean", "bool"];
  if (token === "DATE") return ["date", "date"];
  if (token.startsWith("TIMESTAMP")) {
    return ["timestamp without time zone", "timestamp"];
  }
  if (token.startsWith("VARCHAR")) return ["character varying", "varchar"];
  if (token.startsWith("DECIMAL")) return ["numeric", "numeric"];
  return null;
}

function expectedNumeric(definition) {
  const match = definition.match(/^(?:DECIMAL|NUMERIC)\((\d+),(\d+)\)/);
  return match
    ? { precision: Number(match[1]), scale: Number(match[2]) }
    : null;
}

function quoteIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error("unexpected identifier in expected schema");
  }
  return `"${identifier}"`;
}

function isApprovedDirectUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "postgresql:" &&
    parsed.port === "5432" &&
    !parsed.hostname.toLowerCase().includes("pooler") &&
    !parsed.searchParams.has("pgbouncer")
  );
}

function createClient(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const result = {
  status: "FAIL",
  mode: "read-only post-migration schema verification",
  target: "SUPABASE_DIRECT_CONNECTION",
  migrationName: expectedMigrationName,
  localDatabaseWrites: 0,
  supabaseWrites: 0,
  failures: [],
  checks: {},
};

if (!process.env.SUPABASE_DIRECT_URL) {
  result.failures.push("SUPABASE_DIRECT_URL is not configured");
} else if (!isApprovedDirectUrl(process.env.SUPABASE_DIRECT_URL)) {
  result.failures.push("target is not an approved Direct Connection shape");
} else {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const artifact = fs.readFileSync(artifactPath, "utf8");
  const expectedModelTables = parseModelTables(schema);
  const parsedArtifact = parseArtifact(artifact);
  const artifactMarker = artifact.indexOf("-- CreateSchema");
  const expectedMigrationChecksum =
    artifactMarker >= 0 ? sha256(artifact.slice(artifactMarker)) : null;
  const expectedTables = parsedArtifact.tables.map((table) => table.name);
  const client = createClient(process.env.SUPABASE_DIRECT_URL);

  try {
    const metadata = await client.$queryRaw`
      SELECT current_database() AS database_name,
             current_user AS current_role,
             current_schema() AS current_schema,
             version() AS server_version,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
    `;
    const metadataRow = metadata[0];
    result.database = metadataRow.database_name;
    result.role = metadataRow.current_role;
    result.schema = metadataRow.current_schema;
    result.postgresql = String(metadataRow.server_version).match(/PostgreSQL ([0-9.]+)/)?.[1] ?? "unknown";
    result.checks.ssl = metadataRow.ssl === true ? "PASS" : "FAIL";
    if (metadataRow.ssl !== true) result.failures.push("Supabase Direct Connection is not using SSL");

    const tableRows = await client.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${"public"} AND table_type = ${"BASE TABLE"}
      ORDER BY table_name
    `;
    const actualTables = tableRows.map((row) => row.table_name);
    const appTables = actualTables.filter((name) => name !== "_prisma_migrations");
    result.checks.tables = {
      expectedApplicationTables: expectedTables.length,
      actualApplicationTables: appTables.length,
      allExpectedPresent: expectedTables.every((name) => appTables.includes(name)),
      noUnexpectedApplicationTables: appTables.every((name) => expectedTables.includes(name)),
      prismaMigrationsPresent: actualTables.includes("_prisma_migrations"),
    };
    if (
      expectedTables.length !== 30 ||
      appTables.length !== 30 ||
      !result.checks.tables.allExpectedPresent ||
      !result.checks.tables.noUnexpectedApplicationTables ||
      !result.checks.tables.prismaMigrationsPresent
    ) {
      result.failures.push("application table or Prisma metadata inventory mismatch");
    }
    if (
      expectedModelTables.length !== 30 ||
      expectedModelTables.some((name) => !expectedTables.includes(name))
    ) {
      result.failures.push("Prisma model table inventory mismatch");
    }

    const columnRows = await client.$queryRaw`
      SELECT table_name, column_name, data_type, udt_name, is_nullable,
             column_default, numeric_precision, numeric_scale, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = ${"public"}
      ORDER BY table_name, ordinal_position
    `;
    const actualColumns = new Map();
    for (const row of columnRows) {
      if (!actualColumns.has(row.table_name)) actualColumns.set(row.table_name, new Map());
      actualColumns.get(row.table_name).set(row.column_name, row);
    }
    const columnFailures = [];
    let expectedColumnCount = 0;
    for (const table of parsedArtifact.tables) {
      expectedColumnCount += table.columns.length;
      const actualTableColumns = actualColumns.get(table.name) ?? new Map();
      if (actualTableColumns.size !== table.columns.length) {
        columnFailures.push(`${table.name}: column count`);
      }
      for (const expected of table.columns) {
        const actual = actualTableColumns.get(expected.name);
        if (!actual) {
          columnFailures.push(`${table.name}.${expected.name}: missing`);
          continue;
        }
        const type = expectedType(expected.definition);
        if (type && (actual.data_type !== type[0] || actual.udt_name !== type[1])) {
          columnFailures.push(`${table.name}.${expected.name}: type`);
        }
        if ((expected.required ? "NO" : "YES") !== actual.is_nullable) {
          columnFailures.push(`${table.name}.${expected.name}: nullability`);
        }
        if (expected.hasDefault !== (actual.column_default !== null)) {
          columnFailures.push(`${table.name}.${expected.name}: default presence`);
        }
        const numeric = expectedNumeric(expected.definition);
        if (
          numeric &&
          (Number(actual.numeric_precision) !== numeric.precision ||
            Number(actual.numeric_scale) !== numeric.scale)
        ) {
          columnFailures.push(`${table.name}.${expected.name}: numeric precision`);
        }
      }
    }
    result.checks.columns = {
      expected: expectedColumnCount,
      actualApplicationColumns: columnRows.filter((row) => expectedTables.includes(row.table_name)).length,
      parity: columnFailures.length === 0,
      mismatchCount: columnFailures.length,
    };
    if (columnFailures.length > 0) result.failures.push("column/type/nullability/default/precision parity failed");

    const primaryKeyRows = await client.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = ${"public"} AND c.contype = ${"p"}
        AND t.relname <> ${"_prisma_migrations"}
    `;
    const foreignKeyRows = await client.$queryRaw`
      SELECT conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = ${"public"} AND c.contype = ${"f"}
      ORDER BY conname
    `;
    const actualForeignKeyNames = new Set(foreignKeyRows.map((row) => row.conname));
    const foreignKeyParity = parsedArtifact.foreignKeys.every((foreignKey) => {
      const actual = foreignKeyRows.find((row) => row.conname === foreignKey.name);
      if (!actual) return false;
      return (
        actual.definition.includes(`ON DELETE ${foreignKey.onDelete}`) &&
        actual.definition.includes(`ON UPDATE ${foreignKey.onUpdate}`) &&
        actual.definition.includes(foreignKey.referencedTable)
      );
    });
    result.checks.constraints = {
      primaryKeys: Number(primaryKeyRows[0].count),
      expectedPrimaryKeys: 30,
      foreignKeys: foreignKeyRows.length,
      expectedForeignKeys: parsedArtifact.foreignKeys.length,
      foreignKeyNamesAndActionsMatch:
        foreignKeyParity && actualForeignKeyNames.size === parsedArtifact.foreignKeys.length,
    };
    if (
      result.checks.constraints.primaryKeys !== 30 ||
      result.checks.constraints.foreignKeys !== 19 ||
      !result.checks.constraints.foreignKeyNamesAndActionsMatch
    ) {
      result.failures.push("primary-key or foreign-key inventory/action parity failed");
    }

    const indexRows = await client.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = ${"public"}
    `;
    const actualIndexNames = new Set(indexRows.map((row) => row.indexname));
    const missingIndexes = parsedArtifact.indexNames.filter((name) => !actualIndexNames.has(name));
    const uniqueIndexParity = parsedArtifact.uniqueIndexNames.every((name) =>
      indexRows.some((row) => row.indexname === name && /CREATE UNIQUE INDEX/i.test(row.indexdef)),
    );
    result.checks.indexes = {
      expectedApplicationIndexes: parsedArtifact.indexNames.length,
      presentApplicationIndexes: parsedArtifact.indexNames.filter((name) => actualIndexNames.has(name)).length,
      missing: missingIndexes.length,
      expectedUniqueIndexes: parsedArtifact.uniqueIndexNames.length,
      uniqueIndexParity,
    };
    if (missingIndexes.length > 0 || !uniqueIndexParity) result.failures.push("index or unique-index parity failed");

    const migrationRows = await client.$queryRawUnsafe(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1',
      expectedMigrationName,
    );
    result.checks.prismaMigration = {
      expectedMigration: expectedMigrationName,
      expectedChecksum: expectedMigrationChecksum,
      matchingRows: migrationRows.length,
      finished: migrationRows.length === 1 && migrationRows[0].finished_at !== null,
      notRolledBack: migrationRows.length === 1 && migrationRows[0].rolled_back_at === null,
      checksumMatches:
        migrationRows.length === 1 && migrationRows[0].checksum === expectedMigrationChecksum,
    };
    if (
      migrationRows.length !== 1 ||
      migrationRows[0].finished_at === null ||
      migrationRows[0].rolled_back_at !== null ||
      migrationRows[0].checksum !== expectedMigrationChecksum
    ) {
      result.failures.push("production baseline migration is not recorded as finished");
    }

    const nonEmptyTables = [];
    const rowCounts = {};
    for (const table of expectedTables) {
      const rows = await client.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
      );
      const count = Number(rows[0].count);
      rowCounts[table] = count;
      if (count !== 0) nonEmptyTables.push(table);
    }
    result.checks.businessData = {
      totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
      nonEmptyTables,
      allApplicationTablesEmpty: nonEmptyTables.length === 0,
    };
    if (nonEmptyTables.length > 0) result.failures.push("unexpected business rows found after schema migration");
    result.checks.biomassStockAbsent = !expectedTables.includes("biomass_stock");
    if (!result.checks.biomassStockAbsent) result.failures.push("BIOMASS_STOCK is unexpectedly present");
  } catch {
    result.failures.push("read-only post-migration inspection failed");
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

result.status = result.failures.length === 0 ? "PASS" : "FAIL";
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
