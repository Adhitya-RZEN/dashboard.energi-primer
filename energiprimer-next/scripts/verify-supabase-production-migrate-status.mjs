import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const prismaCliPath = path.join(projectDirectory, "node_modules", "prisma", "build", "index.js");
const productionSchemaPath = path.join(projectDirectory, "prisma", "production", "schema.prisma");

const result = {
  phase: "21E-S2",
  operation: "prisma migrate status",
  mode: "READ_ONLY",
  target: "SUPABASE_DIRECT_CONNECTION",
  localDatabaseUrl: "UNCHANGED",
  localDatabaseWrites: 0,
  supabaseWrites: 0,
  status: "BLOCKED",
};

if (!process.env.SUPABASE_DIRECT_URL) {
  result.error = "SUPABASE_DIRECT_URL is not configured";
} else if (!/^[a-z]+:\/\//i.test(process.env.SUPABASE_DIRECT_URL)) {
  result.error = "SUPABASE_DIRECT_URL has an invalid URL shape";
} else if (!process.env.DATABASE_URL) {
  result.error = "DATABASE_URL is not configured in the operator environment";
} else if (!process.env.SUPABASE_DIRECT_URL.includes(":5432")) {
  result.error = "status check requires the Supabase Direct Connection on port 5432";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("sslmode=")) {
  result.error = "status check requires an SSL-configured Supabase Direct Connection";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("sslmode=require") && !process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("sslmode=verify")) {
  result.error = "status check requires sslmode=require, verify-ca, or verify-full";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("supabase")) {
  result.error = "status check target does not look like a Supabase Direct Connection";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes(".supabase.co")) {
  result.error = "status check target does not look like a Supabase Direct Connection hostname";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("db.")) {
  result.error = "status check target is not the expected Supabase db hostname";
} else if (!process.env.SUPABASE_DIRECT_URL.toLowerCase().includes("postgresql://")) {
  result.error = "status check target must use the PostgreSQL protocol";
} else if (!fs.existsSync(prismaCliPath)) {
  result.error = "Prisma CLI is not available";
} else {
  const probe = spawnSync(process.execPath, [
    prismaCliPath,
    "migrate",
    "status",
    "--schema",
    productionSchemaPath,
  ], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      // Child-only override. The parent process DATABASE_URL remains local.
      DATABASE_URL: process.env.SUPABASE_DIRECT_URL,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  result.exitCode = probe.status;
  result.status = probe.status === 0 ? "PASS" : "FAIL";
  result.output = probe.status === 0 ? "UP_TO_DATE_OR_NO_PENDING_MIGRATIONS" : "SUPPRESSED_FOR_SECRET_SAFETY";
}

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
