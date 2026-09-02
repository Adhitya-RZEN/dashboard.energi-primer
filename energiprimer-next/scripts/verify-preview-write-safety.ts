import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getDeploymentEnvironment,
  isPreviewEnvironment,
  isSyncAllowedEnvironment,
} from "../src/lib/deployment-environment";

const preview = { VERCEL_ENV: "preview", NODE_ENV: "production" };
const production = { VERCEL_ENV: "production", NODE_ENV: "production" };
const development = { NODE_ENV: "development" };
const unknown = { VERCEL_ENV: "staging", NODE_ENV: "production" };
const productionWithoutDeploymentIdentity = { NODE_ENV: "production" };

assert.equal(getDeploymentEnvironment(preview), "preview");
assert.equal(isPreviewEnvironment(preview), true);
assert.equal(isSyncAllowedEnvironment(preview), false);
assert.equal(isSyncAllowedEnvironment(production), true);
assert.equal(getDeploymentEnvironment(development), "development");
assert.equal(isSyncAllowedEnvironment(development), true);
assert.equal(getDeploymentEnvironment(unknown), "unknown");
assert.equal(isSyncAllowedEnvironment(unknown), false);
assert.equal(
  getDeploymentEnvironment(productionWithoutDeploymentIdentity),
  "unknown",
);
assert.equal(
  isSyncAllowedEnvironment(productionWithoutDeploymentIdentity),
  false,
);

const routePath = fileURLToPath(
  new URL("../src/app/api/sync/google-sheets/route.ts", import.meta.url),
);
const routeSource = readFileSync(routePath, "utf8");
const environmentGate = routeSource.indexOf(
  "if (!isSyncAllowedEnvironment()) return disabledForDeploymentEnvironment();",
);
const cronSecretCheck = routeSource.indexOf(
  "if (!process.env.CRON_SECRET)",
);
const syncInvocation = routeSource.indexOf(
  "const result = await runGoogleSheetsIncrementalSync",
);

assert.ok(environmentGate >= 0, "sync route must contain the environment gate");
assert.ok(cronSecretCheck > environmentGate, "environment gate must precede cron authentication");
assert.ok(syncInvocation > environmentGate, "environment gate must precede sync invocation");
assert.match(routeSource, /status: "DISABLED"/u);
assert.match(routeSource, /status: 403/u);

console.log(JSON.stringify({
  status: "PASS",
  checks: [
    "Preview deployment is denied before cron authentication",
    "Preview deployment is denied before sync engine invocation",
    "Production deployment remains allowed by the environment policy",
    "Development without VERCEL_ENV preserves existing behavior",
    "Unknown deployment identity is denied fail-closed",
    "Production without deployment identity is denied fail-closed",
  ],
  databaseWrites: 0,
}, null, 2));
