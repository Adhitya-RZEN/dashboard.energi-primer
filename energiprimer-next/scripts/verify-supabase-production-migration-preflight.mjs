import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const productionSchemaRelativePath = path.join(
  "prisma",
  "production",
  "schema.prisma",
);
const productionMigrationsRelativePath = path.join(
  "prisma",
  "production",
  "migrations",
);
const productionSchemaPath = path.join(projectDirectory, productionSchemaRelativePath);
const productionMigrationsPath = path.join(
  projectDirectory,
  productionMigrationsRelativePath,
);
const productionLockPath = path.join(
  productionMigrationsPath,
  "migration_lock.toml",
);
const prismaCliPath = path.join(
  projectDirectory,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const canonicalBaselineName = "20260901130000_production_schema_baseline";
const expectedDatabaseName = "postgres";
const expectedSchemaName = "public";

function getOption(name, fallback = undefined) {
  const prefix = `${name}=`;
  const argument = process.argv.find(
    (value) => value === name || value.startsWith(prefix),
  );
  if (!argument) return fallback;
  return argument === name ? "" : argument.slice(prefix.length);
}

function normalizeSql(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safePathSegment(value) {
  return /^[0-9][0-9A-Za-z_-]*$/.test(value);
}

function parsePostgresUrl(value) {
  if (!value) return { present: false, valid: false };

  try {
    const parsed = new URL(value);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase() ?? "";
    const hostname = parsed.hostname.toLowerCase();
    return {
      present: true,
      valid: true,
      protocol: parsed.protocol,
      port: parsed.port || "default",
      hostnameClass: hostname.includes("pooler")
        ? "pooler"
        : hostname.endsWith(".supabase.co")
          ? "supabase-direct-host"
          : ["localhost", "127.0.0.1", "::1"].includes(hostname)
            ? "loopback"
            : "other",
      isSupabaseDirect:
        parsed.protocol === "postgresql:" &&
        parsed.port === "5432" &&
        hostname.startsWith("db.") &&
        hostname.endsWith(".supabase.co") &&
        !hostname.includes("pooler") &&
        !parsed.searchParams.has("pgbouncer") &&
        ["require", "verify-ca", "verify-full"].includes(sslmode),
      sslmode: sslmode || "missing",
      hasPgbouncer: parsed.searchParams.has("pgbouncer"),
    };
  } catch {
    return { present: true, valid: false };
  }
}

function canonicalMigrationInventory() {
  if (!fs.existsSync(productionMigrationsPath)) {
    throw new Error("canonical production migration directory is missing");
  }

  const entries = fs
    .readdirSync(productionMigrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error("canonical production migration directory is empty");
  }

  const migrations = entries.map((name) => {
    if (!safePathSegment(name)) {
      throw new Error("canonical production migration name is unsafe");
    }

    const sqlPath = path.join(productionMigrationsPath, name, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      throw new Error("canonical production migration is missing migration.sql");
    }

    const sql = normalizeSql(fs.readFileSync(sqlPath, "utf8"));
    const forbiddenOperation = /\b(?:INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN|SCHEMA|INDEX)|TRUNCATE)\b/i.test(
      sql,
    );

    return {
      name,
      sqlPath,
      checksum: sha256(sql),
      bytes: Buffer.byteLength(sql, "utf8"),
      forbiddenOperation,
    };
  });

  return migrations;
}

function runPrisma(argumentsList, directUrl) {
  return spawnSync(process.execPath, [prismaCliPath, ...argumentsList], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      // The override is isolated to the read-only Prisma child process.
      DATABASE_URL: directUrl,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
}

function commandSucceeded(result) {
  return typeof result?.status === "number" && result.status === 0;
}

function commandOutput(result) {
  return `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
}

function isEmptyMigrationOutput(output) {
  const meaningfulLines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
  return meaningfulLines.length === 0;
}

function statusOutputClass(result) {
  if (commandSucceeded(result)) return "UP_TO_DATE";
  const output = commandOutput(result).toLowerCase();
  if (
    /not yet applied|following migration|pending migration|schema is not up to date|drift detected|migration\s+status/.test(
      output,
    )
  ) {
    return "PENDING_OR_DRIFT_REPORTED";
  }
  return "COMMAND_FAILED";
}

function checkApprovalEvidence() {
  const backupConfirmed =
    process.env.MIGRATION_BACKUP_CONFIRMED?.trim().toLowerCase() === "true";
  const changeWindowConfirmed =
    process.env.MIGRATION_CHANGE_WINDOW_CONFIRMED?.trim().toLowerCase() ===
    "true";
  const approvalReference = Boolean(
    process.env.MIGRATION_APPROVAL_ID?.trim(),
  );

  return {
    backupConfirmed,
    changeWindowConfirmed,
    approvalReference,
    complete: backupConfirmed && changeWindowConfirmed && approvalReference,
    valuesPrinted: false,
  };
}

const environment = getOption("--environment");
const history = getOption("--history", "production");
const mode = getOption("--mode", "technical");
const plannedMigration = getOption("--planned-migration") || null;
const directUrl = process.env.SUPABASE_DIRECT_URL?.trim();
const directUrlInfo = parsePostgresUrl(directUrl);
const runtimeUrlInfo = parsePostgresUrl(process.env.DATABASE_URL?.trim());
const approval = checkApprovalEvidence();

const result = {
  status: "FAIL",
  operation: "READ_ONLY",
  environment: environment || "missing",
  mode,
  canonicalHistory: "SUPABASE PRODUCTION",
  schema: productionSchemaRelativePath,
  migrationsDirectory: productionMigrationsRelativePath,
  targetVariable: "SUPABASE_DIRECT_URL",
  runtimeVariable: "DATABASE_URL",
  databaseWrites: 0,
  migrationDeploy: "NOT RUN",
  migrationResolve: "NOT RUN",
  destructiveOperations: "NONE",
  failures: [],
  checks: {},
  approval,
};

function fail(message) {
  result.failures.push(message);
}

if (environment !== "production") {
  fail("environment guard requires --environment=production");
}
if (history !== "production") {
  fail("wrong canonical history: use prisma/production only");
}
if (!new Set(["technical", "execution-gate"]).has(mode)) {
  fail("mode must be technical or execution-gate");
}
if (mode === "execution-gate" && !plannedMigration) {
  fail("execution-gate requires --planned-migration=<canonical migration name>");
}
if (!fs.existsSync(productionSchemaPath)) {
  fail("canonical production schema.prisma is missing");
}
if (!fs.existsSync(productionLockPath)) {
  fail("canonical production migration_lock.toml is missing");
}
if (!fs.existsSync(prismaCliPath)) {
  fail("Prisma CLI is not available in node_modules");
}

let migrations = [];
try {
  migrations = canonicalMigrationInventory();
  result.checks.canonicalArtifacts = {
    status: "PASS",
    migrationCount: migrations.length,
    migrationNames: migrations.map(({ name }) => name),
    allSqlFilesPresent: true,
    forbiddenOperations: migrations.filter((migration) => migration.forbiddenOperation).map(({ name }) => name),
    lockProvider: fs.readFileSync(productionLockPath, "utf8").includes(
      'provider = "postgresql"',
    )
      ? "postgresql"
      : "unexpected",
  };
  if (!result.checks.canonicalArtifacts.lockProvider || migrations.some((migration) => migration.forbiddenOperation)) {
    fail("canonical migration artifacts failed the schema-only safety check");
  }
} catch {
  fail("canonical production migration inventory could not be verified");
}

if (!migrations.some(({ name }) => name === canonicalBaselineName)) {
  fail("canonical production baseline migration is missing");
}

if (plannedMigration && !migrations.some(({ name }) => name === plannedMigration)) {
  fail("planned migration is not present in canonical production history");
}

result.checks.connectionPolicy = {
  direct: {
    present: directUrlInfo.present,
    valid: directUrlInfo.valid,
    protocol: directUrlInfo.protocol ?? "unknown",
    port: directUrlInfo.port ?? "unknown",
    hostClass: directUrlInfo.hostnameClass ?? "unknown",
    sslmode: directUrlInfo.sslmode ?? "unknown",
    hasPgbouncer: directUrlInfo.hasPgbouncer ?? false,
    approvedDirectShape: directUrlInfo.isSupabaseDirect === true,
  },
  runtime: {
    present: runtimeUrlInfo.present,
    valid: runtimeUrlInfo.valid,
    hostClass: runtimeUrlInfo.hostnameClass ?? "unknown",
    port: runtimeUrlInfo.port ?? "unknown",
    separatedFromDirect: Boolean(
      directUrl && process.env.DATABASE_URL && directUrl !== process.env.DATABASE_URL.trim(),
    ),
  },
};

if (!directUrlInfo.isSupabaseDirect) {
  fail("SUPABASE_DIRECT_URL must be an approved Supabase Direct PostgreSQL URL on port 5432 with TLS and no pooler/pgbouncer");
}
if (runtimeUrlInfo.present && runtimeUrlInfo.isSupabaseDirect) {
  fail("DATABASE_URL must remain the application runtime endpoint; migration uses SUPABASE_DIRECT_URL");
}

const client = directUrlInfo.isSupabaseDirect
  ? new PrismaClient({ datasources: { db: { url: directUrl } } })
  : null;

try {
  if (result.failures.length > 0 || !client) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
} else {
    const metadataRows = await client.$queryRaw`
      SELECT current_database() AS database_name,
             current_schema() AS current_schema,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
    `;
    const metadata = metadataRows[0];
    const databaseMatches = metadata?.database_name === expectedDatabaseName;
    const schemaMatches = metadata?.current_schema === expectedSchemaName;
    const sslMatches = metadata?.ssl === true;
    result.checks.targetIdentity = {
      status: databaseMatches && schemaMatches && sslMatches ? "PASS" : "FAIL",
      database: metadata?.database_name ?? "unavailable",
      expectedDatabase: expectedDatabaseName,
      schema: metadata?.current_schema ?? "unavailable",
      expectedSchema: expectedSchemaName,
      ssl: sslMatches,
    };
    if (!databaseMatches) fail("wrong target database identity");
    if (!schemaMatches) fail("wrong target schema; expected public");
    if (!sslMatches) fail("Supabase Direct Connection did not report an SSL backend");

    const migrationRows = await client.$queryRaw`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM "public"."_prisma_migrations"
      ORDER BY started_at, migration_name
    `;
    const artifactByName = new Map(migrations.map((migration) => [migration.name, migration]));
    const appliedNames = migrationRows.map((row) => row.migration_name);
    const appliedNameSet = new Set(appliedNames);
    const duplicateNames = appliedNames.filter(
      (name, index) => appliedNames.indexOf(name) !== index,
    );
    const unexpectedNames = appliedNames.filter((name) => !artifactByName.has(name));
    const pendingNames = migrations
      .filter((migration) => !appliedNameSet.has(migration.name))
      .map((migration) => migration.name);
    const unfinishedNames = migrationRows
      .filter((row) => row.finished_at === null || row.rolled_back_at !== null)
      .map((row) => row.migration_name);
    const checksumMismatches = migrationRows
      .filter((row) => {
        const artifact = artifactByName.get(row.migration_name);
        return artifact && row.checksum !== artifact.checksum;
      })
      .map((row) => row.migration_name);

    const baselinePresent = appliedNameSet.has(canonicalBaselineName);
    const planNames = plannedMigration
      ? migrations.filter((migration) => migration.name <= plannedMigration).map((migration) => migration.name)
      : migrations.map((migration) => migration.name);
    const unexpectedPendingNames = plannedMigration
      ? pendingNames.filter((name) => name !== plannedMigration)
      : pendingNames;
    const planAppliedBeforeCandidate = plannedMigration
      ? planNames.filter((name) => name !== plannedMigration && !appliedNameSet.has(name))
      : [];
    const appliedAfterCandidate = plannedMigration
      ? appliedNames.filter((name) => name > plannedMigration)
      : [];
    const candidateAlreadyApplied = plannedMigration
      ? appliedNameSet.has(plannedMigration)
      : false;

    result.checks.migrationHistory = {
      status:
        baselinePresent &&
        unexpectedNames.length === 0 &&
        duplicateNames.length === 0 &&
        unfinishedNames.length === 0 &&
        checksumMismatches.length === 0 &&
        unexpectedPendingNames.length === 0 &&
        planAppliedBeforeCandidate.length === 0 &&
        appliedAfterCandidate.length === 0 &&
        !candidateAlreadyApplied
          ? "PASS"
          : "FAIL",
      canonicalMigrationCount: migrations.length,
      appliedMigrationCount: migrationRows.length,
      baselinePresent,
      unexpectedNames,
      duplicateNames,
      unfinishedNames,
      checksumMismatches,
      pendingNames,
      plannedMigration: plannedMigration ?? "NONE",
      unexpectedPendingNames,
      missingPredecessors: planAppliedBeforeCandidate,
      appliedAfterPlannedMigration: appliedAfterCandidate,
      candidateAlreadyApplied,
      checksumsNormalizedLineEndings: true,
    };
    if (result.checks.migrationHistory.status !== "PASS") {
      fail("production migration history is not the expected canonical state");
    }

    const statusCommand = runPrisma(
      ["migrate", "status", "--schema", productionSchemaPath],
      directUrl,
    );
    const statusClass = statusOutputClass(statusCommand);
    const statusExpected = plannedMigration
      ? statusClass === "PENDING_OR_DRIFT_REPORTED"
      : statusClass === "UP_TO_DATE";
    result.checks.migrateStatus = {
      status: statusExpected ? "PASS" : "FAIL",
      exitCode: typeof statusCommand.status === "number" ? statusCommand.status : null,
      state: statusClass,
      expected: plannedMigration ? "planned migration pending" : "up to date",
      outputSuppressed: true,
    };
    if (!statusExpected) {
      fail("prisma migrate status did not confirm the expected canonical history state");
    }

    const diffCommand = runPrisma(
      [
        "migrate",
        "diff",
        `--from-schema-datasource=${productionSchemaPath}`,
        `--to-schema-datamodel=${productionSchemaPath}`,
        "--script",
      ],
      directUrl,
    );
    const diffOutput = commandOutput(diffCommand);
    const diffEmpty = commandSucceeded(diffCommand) && isEmptyMigrationOutput(diffOutput);
    const diffExpected = plannedMigration ? !diffEmpty : diffEmpty;
    result.checks.schemaDiff = {
      status: diffExpected ? "PASS" : "FAIL",
      exitCode: typeof diffCommand.status === "number" ? diffCommand.status : null,
      state: diffEmpty ? "EMPTY" : "NON_EMPTY_OR_UNAVAILABLE",
      expected: plannedMigration ? "non-empty diff for planned migration" : "empty migration",
      outputSuppressed: true,
    };
    if (!diffExpected) {
      fail(
        plannedMigration
          ? "planned migration has no observable schema diff"
          : "production schema diff is not empty",
      );
    }

    result.checks.environmentGuard = {
      status: result.environment === "production" && result.canonicalHistory === "SUPABASE PRODUCTION" ? "PASS" : "FAIL",
      environmentArgument: result.environment,
      historyArgument: history,
      secretsPrinted: false,
    };

    if (mode === "execution-gate") {
      result.checks.approvalGate = {
        status: approval.complete ? "PASS" : "FAIL",
        backup: approval.backupConfirmed ? "CONFIRMED" : "MISSING",
        changeWindow: approval.changeWindowConfirmed ? "CONFIRMED" : "MISSING",
        ownerApproval: approval.approvalReference ? "REFERENCED" : "MISSING",
        executionStillNotRun: true,
      };
      if (!approval.complete) {
        fail("backup, change-window, and owner approval evidence are required for execution-gate mode");
      }
    } else {
      result.checks.approvalGate = {
        status: "REVIEW_REQUIRED",
        backup: approval.backupConfirmed ? "CONFIRMED" : "NOT_PROVIDED",
        changeWindow: approval.changeWindowConfirmed ? "CONFIRMED" : "NOT_PROVIDED",
        ownerApproval: approval.approvalReference ? "REFERENCED" : "NOT_PROVIDED",
        executionStillNotRun: true,
      };
    }

    result.status = result.failures.length === 0 ? "PASS" : "FAIL";
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  }
} catch {
  fail("read-only target metadata or migration history query failed");
  result.status = "BLOCKED";
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  if (client) await client.$disconnect().catch(() => {});
}
