import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const expectedMigrationName = "20260901130000_production_schema_baseline";
const expectEmptyData = process.argv.includes("--expect-empty");
const schemaPath = path.join(
  projectDirectory,
  "prisma",
  "production",
  "schema.prisma",
);
const migrationsDirectory = path.join(
  projectDirectory,
  "prisma",
  "production",
  "migrations",
);

// These tables are deliberately retained compatibility/framework/operational
// objects. They remain expected schema objects, but are reported separately
// from the canonical business and synchronization tables.
const COMPATIBILITY_TABLES = new Set([
  "users",
  "user_audit_logs",
  "password_reset_tokens",
  "sessions",
  "cache",
  "cache_locks",
  "jobs",
  "job_batches",
  "failed_jobs",
  "coal_stock",
  "coal_quality",
  "coal_consumption",
  "power_generation",
  "kpi_targets",
  "spreadsheet_import_logs",
]);

function parsePrismaModels(schema) {
  const modelMatches = [
    ...schema.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g),
  ];
  const modelNames = new Set(modelMatches.map(([, modelName]) => modelName));
  return modelMatches.map(([, modelName, body]) => {
    const tableName = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;
    const columns = [];
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;
      const field = trimmed.match(
        /^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)(\[\])?(\?)?(?:\s+(.*))?$/,
      );
      if (!field || field[3] || field[2] === "Unsupported") continue;
      const [, fieldName, fieldType, , nullable, attributes = ""] = field;
      if (modelNames.has(fieldType) || /@relation\(/.test(attributes)) continue;
      const columnName = attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName;
      const dbType = attributes.match(/@db\.([A-Za-z]+)(?:\(([^)]+)\))?/);
      let token = fieldType;
      if (dbType) {
        token = `${dbType[1].toUpperCase()}${dbType[2] ? `(${dbType[2]})` : ""}`;
      } else if (fieldType === "BigInt") {
        token = "BIGINT";
      } else if (fieldType === "Int") {
        token = "INTEGER";
      } else if (fieldType === "String") {
        token = "TEXT";
      } else if (fieldType === "Boolean") {
        token = "BOOLEAN";
      } else if (fieldType === "DateTime") {
        token = "TIMESTAMP(3)";
      }
      const hasDefault = /@default\(/.test(attributes) || /autoincrement\(\)/.test(attributes);
      columns.push({
        name: columnName,
        definition: `${token}${nullable ? "" : " NOT NULL"}${hasDefault ? " DEFAULT 0" : ""}`,
        required: !nullable,
        hasDefault,
      });
    }
    return {
      name: tableName,
      modelName,
      columns,
      hasPrimaryKey: /\s@id(?:\s|\(|$)/.test(body),
    };
  });
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
    return {
      name,
      columns,
      hasPrimaryKey: /\bPRIMARY KEY\b/.test(body),
    };
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
        /ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"\s+FOREIGN KEY\s+\(([^)]+)\)\s+REFERENCES\s+"([^"]+)"\s*\(([^)]+)\)\s+ON DELETE\s+(\w+)\s+ON UPDATE\s+(\w+)/g,
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
    /^(BIGSERIAL|BIGINT|SMALLINT|INTEGER|TEXT|BOOLEAN|DATE|TIMESTAMP\(\d+\)|VARCHAR\(\d+\)|DECIMAL\(\d+,\d+\)|JSONB)/,
  )?.[1];
  if (!token) return null;
  if (token === "BIGSERIAL" || token === "BIGINT") return ["bigint", "int8"];
  if (token === "SMALLINT") return ["smallint", "int2"];
  if (token === "INTEGER") return ["integer", "int4"];
  if (token === "TEXT") return ["text", "text"];
  if (token === "BOOLEAN") return ["boolean", "bool"];
  if (token === "DATE") return ["date", "date"];
  if (token === "JSONB") return ["jsonb", "jsonb"];
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

function safeInspectionError(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]");
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
  const prismaModels = parsePrismaModels(schema);
  const expectedModelTables = prismaModels.map((model) => model.name);
  const migrationDirectories = fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrationArtifacts = migrationDirectories.map((migrationName) => {
    const migration = fs
      .readFileSync(path.join(migrationsDirectory, migrationName, "migration.sql"), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    return { name: migrationName, sql: migration, checksum: sha256(migration) };
  });
  const historyArtifact = migrationArtifacts.map((migration) => migration.sql).join("\n");
  const parsedArtifact = parseArtifact(historyArtifact);
  const expectedMigrationChecksums = new Map(
    migrationArtifacts.map((migration) => [migration.name, migration.checksum]),
  );
  const expectedMigrationChecksum = expectedMigrationChecksums.get(expectedMigrationName) ?? null;
  const expectedTables = [...new Set(expectedModelTables)];
  const historyTables = [...new Set(parsedArtifact.tables.map((table) => table.name))];
  const expectedCurrentObjects = expectedTables.filter((name) => !COMPATIBILITY_TABLES.has(name));
  const expectedCompatibilityObjects = expectedTables.filter((name) => COMPATIBILITY_TABLES.has(name));
  result.checks.localContract = {
    prismaModelCount: expectedModelTables.length,
    expectedApplicationTables: expectedTables.length,
    expectedCurrentObjects,
    expectedCompatibilityObjects,
    migrationHistory: migrationArtifacts.map((migration) => migration.name),
    migrationHistoryTables: historyTables.length,
    schemaTablesMissingFromMigrationHistory: expectedTables.filter(
      (name) => !historyTables.includes(name),
    ),
  };
  if (
    expectedModelTables.length !== expectedTables.length ||
    result.checks.localContract.schemaTablesMissingFromMigrationHistory.length > 0
  ) {
    result.failures.push("Prisma model and migration-history table inventories disagree");
  }
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
    const missingExpectedTables = expectedTables.filter((name) => !appTables.includes(name));
    const unexpectedApplicationTables = appTables.filter((name) => !expectedTables.includes(name));
    const expectedObjectSet = new Set(expectedTables);
    result.checks.tables = {
      expectedApplicationTables: expectedTables.length,
      actualApplicationTables: appTables.length,
      allExpectedPresent: missingExpectedTables.length === 0,
      noUnexpectedApplicationTables: unexpectedApplicationTables.length === 0,
      expectedCurrentObjects,
      expectedCompatibilityObjects,
      missingExpectedTables,
      unexpectedApplicationTables,
      expectedObjectSetSize: expectedObjectSet.size,
      prismaMigrationsPresent: actualTables.includes("_prisma_migrations"),
    };
    if (
      expectedTables.length !== appTables.length ||
      !result.checks.tables.allExpectedPresent ||
      !result.checks.tables.noUnexpectedApplicationTables ||
      !result.checks.tables.prismaMigrationsPresent
    ) {
      result.failures.push("application table or Prisma metadata inventory mismatch");
    }
    if (expectedModelTables.some((name) => !expectedTables.includes(name))) {
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
    for (const table of prismaModels) {
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
      expectedPrimaryKeys: prismaModels.filter((model) => model.hasPrimaryKey).length,
      foreignKeys: foreignKeyRows.length,
      expectedForeignKeys: parsedArtifact.foreignKeys.length,
      foreignKeyNamesAndActionsMatch:
        foreignKeyParity && actualForeignKeyNames.size === parsedArtifact.foreignKeys.length,
    };
    if (
      result.checks.constraints.primaryKeys !== result.checks.constraints.expectedPrimaryKeys ||
      result.checks.constraints.foreignKeys !== result.checks.constraints.expectedForeignKeys ||
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

    const migrationRows = await client.$queryRaw`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY migration_name
    `;
    const expectedMigrationNames = migrationArtifacts.map((migration) => migration.name);
    const migrationByName = new Map(migrationRows.map((row) => [row.migration_name, row]));
    const missingMigrations = expectedMigrationNames.filter((name) => !migrationByName.has(name));
    const unexpectedMigrations = migrationRows
      .map((row) => row.migration_name)
      .filter((name) => !expectedMigrationChecksums.has(name));
    const migrationParity = expectedMigrationNames.every((name) => {
      const row = migrationByName.get(name);
      return (
        row &&
        row.finished_at !== null &&
        row.rolled_back_at === null &&
        row.checksum === expectedMigrationChecksums.get(name)
      );
    });
    result.checks.prismaMigrations = {
      expectedNames: expectedMigrationNames,
      appliedNames: migrationRows.map((row) => row.migration_name),
      missingMigrations,
      unexpectedMigrations,
      parity: migrationParity && unexpectedMigrations.length === 0,
    };
    const baselineRow = migrationByName.get(expectedMigrationName);
    result.checks.prismaMigration = {
      expectedMigration: expectedMigrationName,
      expectedChecksum: expectedMigrationChecksum,
      matchingRows: baselineRow ? 1 : 0,
      finished: baselineRow !== undefined && baselineRow.finished_at !== null,
      notRolledBack: baselineRow !== undefined && baselineRow.rolled_back_at === null,
      checksumMatches:
        baselineRow?.checksum === expectedMigrationChecksum,
    };
    if (!result.checks.prismaMigrations.parity) {
      result.failures.push("production migration history does not match local production migrations");
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
      expectation: expectEmptyData ? "EMPTY" : "POPULATED_ALLOWED",
    };
    if (expectEmptyData && nonEmptyTables.length > 0) {
      result.failures.push("unexpected business rows found after schema migration");
    }
    result.checks.biomassStockAbsent = !expectedTables.includes("biomass_stock");
    if (!result.checks.biomassStockAbsent) result.failures.push("BIOMASS_STOCK is unexpectedly present");
  } catch (error) {
    result.readOnlyInspectionError = safeInspectionError(error);
    result.failures.push("read-only post-migration inspection failed");
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

result.status = result.failures.length === 0 ? "PASS" : "FAIL";
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
