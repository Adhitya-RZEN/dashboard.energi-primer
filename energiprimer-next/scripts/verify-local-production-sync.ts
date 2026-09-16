import assert from "node:assert/strict";

import {
  assertLocalExecution,
  parseLocalSyncArguments,
  resolveExecutionEnvironment,
} from "../src/services/google-sheets/sync/operator-contract";
import {
  inspectSupabasePoolerUrl,
  type SafePostgresUrlShape,
} from "../src/services/google-sheets/sync/production-target";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import { collectWorksheetValidationIssues } from "../src/services/google-sheets/sync/preflight";

const poolerUrl =
  "postgresql://postgres.project-ref:test-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

const parsed = parseLocalSyncArguments([
  "--worksheet",
  "Agustus26-BB",
  "--production",
  "--dry-run",
]);
assert.deepEqual(parsed, {
  worksheet: "Agustus26-BB",
  target: "SUPABASE_PRODUCTION",
  dryRun: true,
  scope: "all",
});

assert.throws(
  () => parseLocalSyncArguments(["--production", "--dry-run"]),
  /worksheet is required/u,
);
assert.throws(
  () => parseLocalSyncArguments(["--worksheet=Agustus26-BB", "--current"]),
  /production target must be explicit/u,
);
assert.throws(
  () => parseLocalSyncArguments(["--worksheet=Agustus26-BB", "--production", "--current"]),
  /current scope is not supported/u,
);
assert.throws(
  () =>
    parseLocalSyncArguments([
      "--worksheet=Agustus26-BB",
      "--production",
      "--scope=current",
    ]),
  /unsupported operator option/u,
);
assert.throws(
  () =>
    parseLocalSyncArguments([
      "--worksheet=Agustus26-BB",
      "--production",
      "--dry-run=true",
    ]),
  /boolean operator option cannot have a value/u,
);

assert.equal(resolveExecutionEnvironment({}), "LOCAL");
assert.equal(resolveExecutionEnvironment({ NODE_ENV: "development" }), "LOCAL");
assert.equal(resolveExecutionEnvironment({ VERCEL_ENV: "production" }), "VERCEL_PRODUCTION");
assert.equal(resolveExecutionEnvironment({ VERCEL_ENV: "preview" }), "VERCEL_PREVIEW");
assert.equal(resolveExecutionEnvironment({ NODE_ENV: "production" }), "NON_LOCAL_PRODUCTION_PROCESS");
assert.throws(
  () => assertLocalExecution({ VERCEL_ENV: "preview" }),
  /Local execution required/u,
);

const shape: SafePostgresUrlShape = inspectSupabasePoolerUrl(poolerUrl);
assert.equal(shape.valid, true);
assert.equal(shape.host, "aws-0-ap-southeast-1.pooler.supabase.com");
assert.equal(shape.port, "6543");
assert.equal(shape.database, "postgres");
assert.equal(shape.sslmode, "require");
assert.equal(shape.pgbouncer, "true");
assert.equal(shape.usernamePresent, true);
assert.equal(shape.passwordPresent, true);
assert.equal("secret" in shape, false);

assert.equal(
  inspectSupabasePoolerUrl(
    "postgresql://postgres:test-password@127.0.0.1:5432/dashboard_pln",
  ).valid,
  false,
);

const invalidWorksheet = parseDynamicWorksheet(
  [
    ["Tanggal", "Biomassa Unit 1"],
    ["1", "not-a-number"],
    ["2", "5"],
    ["99", "5"],
  ],
  { worksheetName: "Agustus26-BB" },
);
const invalidIssues = collectWorksheetValidationIssues(invalidWorksheet);
assert.ok(
  invalidIssues.some(
    (issue) => issue.row === 2 && issue.field === "biomassUnit1",
  ),
);
assert.ok(invalidIssues.some((issue) => issue.row === 4 && issue.field === "date"));

console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "production target requires an explicit worksheet",
        "production target must be explicitly selected",
        "local-only execution rejects Vercel and local production processes",
        "Supabase transaction-pooler shape is validated without exposing credentials",
        "local loopback target is not accepted as Supabase Production",
        "malformed numeric and date rows are surfaced with row-level details",
      ],
    },
    null,
    2,
  ),
);
