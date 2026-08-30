import "server-only";

import { Prisma } from "@prisma/client";
import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";

export type SyncRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 4_000;

export function isRetryableSyncError(error: unknown) {
  if (!(error instanceof GoogleSheetsIntegrationError)) return false;
  if (error.code === "rate_limit" || error.code === "timeout") return true;
  return error.code === "api" && (error.status === undefined || error.status >= 500);
}

const RETRYABLE_DATABASE_CODES = new Set([
  "P1001", // database server unreachable
  "P1008", // operation timed out
  "P1017", // server closed connection
  "P2024", // connection-pool timeout
  "P2034", // transaction conflict/deadlock
]);

export function isRetryableDatabaseError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return RETRYABLE_DATABASE_CODES.has(error.code);
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && RETRYABLE_DATABASE_CODES.has(code);
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/** Retries only transient Google Sheets failures; auth/permission/config errors fail fast. */
export async function withSyncRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: SyncRetryOptions = {},
) {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const sleep = options.sleep ?? wait;
  let attempt = 1;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableSyncError(error)) throw error;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

/** Retries only transient database connectivity/transaction failures. */
export async function withDatabaseRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: SyncRetryOptions = {},
) {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 2));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const sleep = options.sleep ?? wait;
  let attempt = 1;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableDatabaseError(error)) throw error;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
