import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const schemaPath = path.join(projectDirectory, "prisma", "schema.prisma");
const artifactPath = path.join(
  projectDirectory,
  "docs",
  "SUPABASE_PRODUCTION_SCHEMA_BASELINE_DESIGN.sql",
);
const migrationName = "20260901130000_production_schema_baseline";
const prismaCliPath = path.join(
  projectDirectory,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

function safeExitCode(result) {
  return typeof result?.status === "number" ? result.status : null;
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
    !parsed.searchParams.has("pgbouncer") &&
    ["require", "verify-ca", "verify-full"].includes(
      parsed.searchParams.get("sslmode") ?? "",
    )
  );
}

function runPrisma(argumentsList, directUrl, workingDirectory) {
  return spawnSync(process.execPath, [prismaCliPath, ...argumentsList], {
    cwd: workingDirectory,
    env: {
      ...process.env,
      // Override only the child process. The parent DATABASE_URL stays local.
      DATABASE_URL: directUrl,
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    stdio: "ignore",
  });
}

const result = {
  status: "BLOCKED",
  mode: "schema-only",
  target: "SUPABASE_DIRECT_CONNECTION",
  migrationName,
  migrationWorkflow: "prisma migrate deploy",
  localDatabaseUrl: "UNCHANGED",
  localDatabaseWrites: 0,
  supabaseBusinessDataWrites: 0,
  supabaseSchemaWrites: "not started",
  failures: [],
};

if (!process.argv.includes("--execute")) {
  result.failures.push("explicit --execute flag is required");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else if (!process.env.SUPABASE_DIRECT_URL) {
  result.failures.push("SUPABASE_DIRECT_URL is not configured");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else if (!isApprovedDirectUrl(process.env.SUPABASE_DIRECT_URL)) {
  result.failures.push(
    "configured target is not an approved SSL Supabase Direct Connection shape",
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else {
  const directUrl = process.env.SUPABASE_DIRECT_URL;
  const artifact = fs.readFileSync(artifactPath, "utf8");
  const sqlMarker = artifact.indexOf("-- CreateSchema");
  const migrationSql = sqlMarker >= 0 ? artifact.slice(sqlMarker) : "";

  if (!migrationSql || /\b(?:INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN|SCHEMA|INDEX)|TRUNCATE|CREATE\s+TYPE)\b/i.test(migrationSql)) {
    result.failures.push("validated baseline artifact is missing or contains a forbidden operation");
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
  } else if (!fs.existsSync(prismaCliPath)) {
    result.failures.push("Prisma CLI is not available in node_modules");
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
  } else {
    const stagingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "energiprimer-phase21e-"),
    );
    const stagedSchemaPath = path.join(stagingDirectory, "schema.prisma");
    const stagedMigrationsDirectory = path.join(
      stagingDirectory,
      "migrations",
    );
    const stagedMigrationDirectory = path.join(
      stagedMigrationsDirectory,
      migrationName,
    );

    try {
      fs.mkdirSync(stagedMigrationDirectory, { recursive: true });
      fs.copyFileSync(schemaPath, stagedSchemaPath);
      fs.writeFileSync(
        path.join(stagedMigrationsDirectory, "migration_lock.toml"),
        'provider = "postgresql"\n',
        "utf8",
      );
      fs.writeFileSync(
        path.join(stagedMigrationDirectory, "migration.sql"),
        migrationSql,
        "utf8",
      );

      const deploy = runPrisma(
        ["migrate", "deploy", "--schema", stagedSchemaPath],
        directUrl,
        stagingDirectory,
      );
      result.deployExitCode = safeExitCode(deploy);

      if (result.deployExitCode !== 0) {
        result.supabaseSchemaWrites = "attempted; outcome must be inspected read-only";
        result.failures.push("Prisma schema-only migration failed");
      } else {
        result.supabaseSchemaWrites = "30 application tables plus Prisma migration metadata";
        const status = runPrisma(
          ["migrate", "status", "--schema", stagedSchemaPath],
          directUrl,
          stagingDirectory,
        );
        result.statusExitCode = safeExitCode(status);
        result.migrationStatus =
          result.statusExitCode === 0 ? "UP_TO_DATE" : "NOT_VERIFIED";
        if (result.statusExitCode !== 0) {
          result.failures.push("Prisma migration status did not confirm an up-to-date history");
        }
      }
    } catch {
      result.failures.push("controlled migration staging or Prisma execution failed");
    } finally {
      // This directory was created exclusively by this run and is never a repository path.
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    }

    result.status = result.failures.length === 0 ? "PASS" : "BLOCKED";
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  }
}
