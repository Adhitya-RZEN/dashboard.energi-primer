import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const schemaPath = path.join(
  projectDirectory,
  "prisma",
  "production",
  "schema.prisma",
);
const migrationName = "20260901130000_production_schema_baseline";
const artifactPath = path.join(
  projectDirectory,
  "prisma",
  "production",
  "migrations",
  migrationName,
  "migration.sql",
);

const databaseUrl = process.env.DATABASE_URL;
const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function parseModelTables(schema) {
  return [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(
    ([, modelName, body]) => body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName,
  );
}

function parseArtifact(artifact) {
  const tableBlocks = [...artifact.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)];
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
          hasDefault: /\bDEFAULT\b/.test(definition) || /^BIGSERIAL\b/.test(definition),
        };
      })
      .filter(Boolean);
    return { name, columns };
  });

  return {
    tables,
    indexes: [...artifact.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(
      ([, name]) => ({ name, unique: /CREATE UNIQUE INDEX/.test(artifact.slice(0, artifact.indexOf(`"${name}"`))) }),
    ),
    indexNames: [...artifact.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(
      ([, name]) => name,
    ),
    uniqueIndexNames: [...artifact.matchAll(/CREATE UNIQUE INDEX "([^"]+)"/g)].map(
      ([, name]) => name,
    ),
    foreignKeys: [...artifact.matchAll(
      /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)"\(([^)]+)\) ON DELETE (\w+) ON UPDATE (\w+)/g,
    )].map(([, tableName, name, columns, referencedTable, referencedColumns, onDelete, onUpdate]) => ({
      tableName,
      name,
      columns,
      referencedTable,
      referencedColumns,
      onDelete,
      onUpdate,
    })),
  };
}

function quoteIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error("unexpected identifier in generated artifact");
  }
  return `"${identifier}"`;
}

function expectedType(definition) {
  const token = definition.match(/^(BIGSERIAL|BIGINT|SMALLINT|INTEGER|TEXT|BOOLEAN|DATE|TIMESTAMP\(\d+\)|VARCHAR\(\d+\)|DECIMAL\(\d+,\d+\))/)?.[1];
  if (!token) return null;
  if (token === "BIGSERIAL" || token === "BIGINT") return ["bigint", "int8"];
  if (token === "SMALLINT") return ["smallint", "int2"];
  if (token === "INTEGER") return ["integer", "int4"];
  if (token === "TEXT") return ["text", "text"];
  if (token === "BOOLEAN") return ["boolean", "bool"];
  if (token === "DATE") return ["date", "date"];
  if (token.startsWith("TIMESTAMP")) return ["timestamp without time zone", "timestamp"];
  if (token.startsWith("VARCHAR")) return ["character varying", "varchar"];
  if (token.startsWith("DECIMAL")) return ["numeric", "numeric"];
  return null;
}

function expectedNumeric(definition) {
  const match = definition.match(/^(?:DECIMAL|NUMERIC)\((\d+),(\d+)\)/);
  return match ? { precision: Number(match[1]), scale: Number(match[2]) } : null;
}

function createClient(url) {
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

function addFailure(failures, message) {
  failures.push(message);
}

const result = {
  status: "FAIL",
  mode: "disposable local PostgreSQL only; production/local business database excluded",
  schema: path.relative(projectDirectory, schemaPath),
  artifact: path.relative(projectDirectory, artifactPath),
  localDatabaseWrites: 0,
  supabaseWrites: 0,
  disposableDatabase: "not created",
  appliedStatements: 0,
  checks: {},
  failures: [],
};

if (!databaseUrl) {
  result.status = "DISPOSABLE_DB_NOT_AVAILABLE";
  result.failures.push("DATABASE_URL is not configured");
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  result.status = "DISPOSABLE_DB_NOT_AVAILABLE";
  result.failures.push("DATABASE_URL is not a valid URL");
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

if (!localHostnames.has(parsedUrl.hostname.toLowerCase())) {
  result.status = "DISPOSABLE_DB_NOT_AVAILABLE";
  result.failures.push("DATABASE_URL is not a local loopback connection; production/remote target was refused");
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const artifact = fs
  .readFileSync(artifactPath, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");
const expectedModelTables = parseModelTables(schema);
const parsedArtifact = parseArtifact(artifact);
const validationDatabaseName = `phase21d_validation_${process.pid}_${Date.now()}`;
const adminUrl = new URL(parsedUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.set("schema", "public");
const validationUrl = new URL(parsedUrl);
validationUrl.pathname = `/${validationDatabaseName}`;
validationUrl.searchParams.set("schema", "public");

let admin;
let disposable;
let created = false;
let stage = "initialization";

try {
  stage = "admin connection";
  admin = createClient(adminUrl);
  await admin.$queryRaw`SELECT current_database()`;

  stage = "disposable database name check";
  const existing = await admin.$queryRaw`
    SELECT datname
    FROM pg_database
    WHERE datname = ${validationDatabaseName}
  `;
  if (existing.length > 0) {
    throw new Error("generated disposable database name already exists");
  }

  stage = "create disposable database";
  await admin.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(validationDatabaseName)}`);
  created = true;
  result.disposableDatabase = "created and cleaned up";

  stage = "disposable database connection";
  disposable = createClient(validationUrl);
  await disposable.$queryRaw`SELECT current_database()`;

  const statements = artifact
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const executableStatements = statements.map((statement) =>
    statement.replace(/^(?:\s*--[^\r\n]*(?:\r?\n|$))+/g, "").trim(),
  );

  for (const [index, statement] of executableStatements.entries()) {
    stage = `apply baseline statement ${index + 1}`;
    if (!/^(CREATE SCHEMA IF NOT EXISTS "public"|CREATE TABLE "|CREATE (?:UNIQUE )?INDEX "|ALTER TABLE ".+ ADD CONSTRAINT ")/i.test(statement)) {
      throw new Error("artifact contains a statement outside the approved schema-only DDL set");
    }
    if (/\b(?:INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN|SCHEMA|INDEX)|TRUNCATE|CREATE\s+TYPE)\b/i.test(statement)) {
      throw new Error("artifact contains a forbidden data/destructive statement");
    }
    await disposable.$executeRawUnsafe(statement);
  }
  result.appliedStatements = executableStatements.length;

  stage = "table inventory";
  const tableRows = await disposable.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${"public"} AND table_type = ${"BASE TABLE"}
    ORDER BY table_name
  `;
  const actualTables = tableRows.map((row) => row.table_name);
  const expectedTables = parsedArtifact.tables.map((table) => table.name);
  result.checks.tables = {
    expected: expectedTables.length,
    actual: actualTables.length,
    allExpectedPresent: expectedTables.every((name) => actualTables.includes(name)),
    noUnexpectedPublicTables: actualTables.every((name) => expectedTables.includes(name)),
  };
  if (expectedTables.length !== 30 || actualTables.length !== 30 || !result.checks.tables.allExpectedPresent || !result.checks.tables.noUnexpectedPublicTables) {
    addFailure(result.failures, "table inventory does not equal the expected 30-table baseline");
  }
  if (expectedModelTables.length !== 30 || expectedModelTables.some((name) => !expectedTables.includes(name))) {
    addFailure(result.failures, "Prisma model table inventory does not equal artifact table inventory");
  }

  stage = "column inventory";
  const columnRows = await disposable.$queryRaw`
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
      if (numeric && (Number(actual.numeric_precision) !== numeric.precision || Number(actual.numeric_scale) !== numeric.scale)) {
        columnFailures.push(`${table.name}.${expected.name}: numeric precision`);
      }
    }
  }
  result.checks.columns = {
    expected: expectedColumnCount,
    actual: columnRows.length,
    parity: columnFailures.length === 0,
    mismatchCount: columnFailures.length,
  };
  if (columnFailures.length > 0) addFailure(result.failures, "column/type/nullability/default/precision parity failed");

  stage = "constraint inventory";
  const primaryKeyRows = await disposable.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${"public"} AND c.contype = ${"p"}
  `;
  const foreignKeyRows = await disposable.$queryRaw`
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
    return actual.definition.includes(`ON DELETE ${foreignKey.onDelete}`) && actual.definition.includes(`ON UPDATE ${foreignKey.onUpdate}`) && actual.definition.includes(foreignKey.referencedTable);
  });
  result.checks.constraints = {
    primaryKeys: Number(primaryKeyRows[0].count),
    expectedPrimaryKeys: 30,
    foreignKeys: foreignKeyRows.length,
    expectedForeignKeys: parsedArtifact.foreignKeys.length,
    foreignKeyNamesAndActionsMatch: foreignKeyParity && actualForeignKeyNames.size === parsedArtifact.foreignKeys.length,
  };
  if (result.checks.constraints.primaryKeys !== 30 || result.checks.constraints.foreignKeys !== 19 || !result.checks.constraints.foreignKeyNamesAndActionsMatch) {
    addFailure(result.failures, "primary-key or foreign-key inventory/action parity failed");
  }

  stage = "index inventory";
  const indexRows = await disposable.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = ${"public"}
  `;
  const actualIndexNames = new Set(indexRows.map((row) => row.indexname));
  const expectedIndexNames = new Set(parsedArtifact.indexNames);
  const missingIndexes = [...expectedIndexNames].filter((name) => !actualIndexNames.has(name));
  const uniqueIndexes = new Set(parsedArtifact.uniqueIndexNames);
  const uniqueParity = [...uniqueIndexes].every((name) => indexRows.some((row) => row.indexname === name && /CREATE UNIQUE INDEX/i.test(row.indexdef)));
  result.checks.indexes = {
    expectedNonPrimary: parsedArtifact.indexNames.length,
    actualExpectedNonPrimary: parsedArtifact.indexNames.filter((name) => actualIndexNames.has(name)).length,
    missing: missingIndexes.length,
    uniqueIndexes: uniqueIndexes.size,
    uniqueIndexParity: uniqueParity,
  };
  if (missingIndexes.length > 0 || !uniqueParity) addFailure(result.failures, "index or unique-index parity failed");

  stage = "empty database check";
  const nonEmptyTables = [];
  for (const table of expectedTables) {
    const rows = await disposable.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`);
    if (Number(rows[0].count) !== 0) nonEmptyTables.push(table);
  }
  result.checks.emptyDatabase = {
    businessRows: nonEmptyTables.length === 0 ? 0 : "unexpected rows",
    allCreatedTablesEmpty: nonEmptyTables.length === 0,
  };
  if (nonEmptyTables.length > 0) addFailure(result.failures, "disposable database contains unexpected rows");

  stage = "Prisma compatibility diff";
  const prismaCliPath = path.join(projectDirectory, "node_modules", "prisma", "build", "index.js");
  const diff = spawnSync(
    process.execPath,
    [
      prismaCliPath,
      "migrate",
      "diff",
      `--from-schema-datasource=${path.relative(projectDirectory, schemaPath)}`,
      `--to-schema-datamodel=${path.relative(projectDirectory, schemaPath)}`,
      "--exit-code",
    ],
    {
      cwd: projectDirectory,
      env: { ...process.env, DATABASE_URL: validationUrl.toString() },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  result.checks.prismaDiffExitCode = diff.status;
  result.checks.prismaCompatibility = diff.status === 0;
  if (diff.status !== 0) addFailure(result.failures, "Prisma read-only schema diff found an unexpected difference");
} catch {
  if (!created) {
    result.status = "DISPOSABLE_DB_NOT_AVAILABLE";
    result.failures.push("local PostgreSQL disposable database could not be created or connected");
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }
  result.failures.push(`disposable schema validation failed at ${stage}`);
} finally {
  if (disposable) await disposable.$disconnect().catch(() => {});
  if (admin && created) {
    await admin.$executeRawUnsafe(`DROP DATABASE ${quoteIdentifier(validationDatabaseName)} WITH (FORCE)`).catch(() => {
      result.failures.push("disposable database cleanup failed");
    });
  }
  if (admin) await admin.$disconnect().catch(() => {});
}

result.status = result.failures.length === 0 ? "PASS" : "FAIL";
result.disposableDatabaseCleanup = result.failures.includes("disposable database cleanup failed") ? "FAIL" : "PASS";
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
