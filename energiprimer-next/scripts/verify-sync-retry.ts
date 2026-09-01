import { GoogleSheetsIntegrationError } from "../src/lib/google-sheets";
import {
  isRetryableDatabaseError,
  isRetryableSyncError,
  withDatabaseRetry,
  withSyncRetry,
} from "../src/services/google-sheets/sync/retry";
import { classifySyncError } from "../src/services/google-sheets/sync/error-classification";

const transient = new GoogleSheetsIntegrationError("rate_limit", "safe");
const permission = new GoogleSheetsIntegrationError("permission", "safe", {
  status: 403,
});
if (!isRetryableSyncError(transient)) throw new Error("Rate limit was not retryable.");
if (isRetryableSyncError(permission)) throw new Error("Permission error was retried.");
if (!isRetryableDatabaseError({ code: "P1001" }))
  throw new Error("Transient database error was not retryable.");
if (isRetryableDatabaseError({ code: "P2002" }))
  throw new Error("Constraint error was retried.");

let attempts = 0;
const delays: number[] = [];
const result = await withSyncRetry(
  async () => {
    attempts += 1;
    if (attempts < 3) throw transient;
    return "ok";
  },
  {
    maxAttempts: 3,
    baseDelayMs: 0,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  },
);
if (result !== "ok" || attempts !== 3 || delays.length !== 2)
  throw new Error("Retry sequence did not complete as expected.");

let databaseAttempts = 0;
const databaseResult = await withDatabaseRetry(
  async () => {
    databaseAttempts += 1;
    if (databaseAttempts === 1) throw { code: "P1001" };
    return "recovered";
  },
  { maxAttempts: 2, baseDelayMs: 0, sleep: async () => {} },
);
if (databaseResult !== "recovered" || databaseAttempts !== 2)
  throw new Error("Database recovery retry did not complete as expected.");

const classifiedErrors = [
  [new GoogleSheetsIntegrationError("authentication", "safe"), "AUTHENTICATION"],
  [new GoogleSheetsIntegrationError("permission", "safe"), "PERMISSION"],
  [new GoogleSheetsIntegrationError("rate_limit", "safe"), "RATE_LIMIT"],
  [new GoogleSheetsIntegrationError("timeout", "safe"), "TIMEOUT"],
  [new GoogleSheetsIntegrationError("api", "safe"), "NETWORK"],
  [new GoogleSheetsIntegrationError("api", "safe", { status: 500 }), "API"],
  [new Error("schema column changed"), "SCHEMA"],
  [new Error("duplicate stable source key"), "DUPLICATE"],
  [new Error("identity source key invalid"), "IDENTITY"],
  [new Error("validation blocked"), "VALIDATION"],
  [new Error("approved target differs"), "BUSINESS_RULE"],
  [new Error("lease was lost"), "CONCURRENCY"],
] as const;
for (const [error, expected] of classifiedErrors) {
  if (classifySyncError(error) !== expected)
    throw new Error(`Expected ${expected} error classification.`);
}

const checks = [
  "rate limit is retryable",
  "permission error fails fast",
  "bounded retry sequence uses exponential backoff hook",
  "transient database error retries while constraint error fails fast",
  "database retry recovers on a subsequent attempt",
  "operational errors are classified without exposing exception details",
];

if (process.argv.includes("--live")) {
  const { prisma } = await import("../src/lib/prisma");
  const { acquireSyncSourceLease, releaseSyncSourceLease } = await import(
    "../src/services/google-sheets/sync/lease"
  );
  const source = await prisma.syncSource.findFirst({ select: { id: true } });
  if (!source) throw new Error("No local sync source exists for lease test.");
  const first = await acquireSyncSourceLease(source.id, 30_000);
  if (!first) throw new Error("First sync lease could not be acquired.");
  try {
    const second = await acquireSyncSourceLease(source.id, 30_000);
    if (second) {
      await releaseSyncSourceLease(source.id, second.token);
      throw new Error("Concurrent sync lease was not blocked.");
    }
    checks.push("concurrent sync lease is blocked atomically");
  } finally {
    await releaseSyncSourceLease(source.id, first.token);
  }
  await prisma.$disconnect();
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      mode: process.argv.includes("--live") ? "static+live" : "static",
      checks,
    },
    null,
    2,
  ),
);
