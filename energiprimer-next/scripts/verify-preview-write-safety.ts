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
const enginePath = fileURLToPath(
  new URL("../src/services/google-sheets/sync/engine.ts", import.meta.url),
);
const engineSource = readFileSync(enginePath, "utf8");
const environmentGate = routeSource.indexOf(
  "if (!isSyncAllowedEnvironment()) return disabledForDeploymentEnvironment();",
);
const cronSecretCheck = routeSource.indexOf(
  "if (!process.env.CRON_SECRET)",
);
const getStart = routeSource.indexOf("export async function GET");
const postStart = routeSource.indexOf("export async function POST");
const getBody = routeSource.slice(getStart, postStart);
const postBody = routeSource.slice(postStart);

assert.ok(environmentGate >= 0, "sync route must contain the environment gate");
assert.ok(cronSecretCheck > environmentGate, "environment gate must precede cron authentication");
assert.ok(getStart >= 0 && postStart > getStart, "sync route must separate GET and POST handlers");
assert.match(getBody, /prepareWorksheetPreflight|prepareGoogleSheetsWorksheetDiscovery/u);
assert.match(getBody, /runGoogleSheetsIncrementalSync|automaticRequestAuthorized/u);
assert.doesNotMatch(getBody, /commitGoogleSheetsImportPlan|executeControlledWorksheetImport/u);
assert.match(postBody, /executeControlledWorksheetImport|parseControlledImportRequest/u);
assert.match(routeSource, /status: "DISABLED"/u);
assert.match(routeSource, /status: 403/u);
const directProductionGuard = engineSource.indexOf(
  "assertProductionExecutionScope(options)",
);
const discoveryPersistence = engineSource.indexOf(
  "await persistGoogleSheetsWorksheetDiscovery(",
);
assert.ok(
  directProductionGuard >= 0 &&
    discoveryPersistence > directProductionGuard,
  "direct Production engine calls must pass an admitted canary or automatic gate before discovery persistence",
);

console.log(JSON.stringify({
  status: "PASS",
  checks: [
    "Preview deployment is denied before cron authentication",
    "GET is read-only unless the separately admitted automatic cron branch is enabled",
    "POST contains the explicit controlled execution boundary",
    "Production deployment remains allowed by the environment policy",
    "Development without VERCEL_ENV preserves existing behavior",
    "Unknown deployment identity is denied fail-closed",
    "Production without deployment identity is denied fail-closed",
    "Direct Production engine calls are gated before discovery persistence",
  ],
  databaseWrites: 0,
}, null, 2));
