import "server-only";

import { Prisma } from "@prisma/client";

import { GoogleSheetsIntegrationError } from "@/lib/google-sheets";

export type SyncErrorCategory =
  | "NETWORK"
  | "AUTHENTICATION"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "API"
  | "SCHEMA"
  | "PARSER"
  | "VALIDATION"
  | "IDENTITY"
  | "DUPLICATE"
  | "DATABASE"
  | "BUSINESS_RULE"
  | "CONCURRENCY";

/**
 * Converts implementation errors into a bounded operational category. The
 * category is safe for audit summaries; exception messages are never returned
 * to the browser.
 */
export function classifySyncError(error: unknown): SyncErrorCategory {
  if (error instanceof GoogleSheetsIntegrationError) {
    if (error.code === "authentication" || error.code === "credentials")
      return "AUTHENTICATION";
    if (error.code === "permission") return "PERMISSION";
    if (error.code === "rate_limit") return "RATE_LIMIT";
    if (error.code === "timeout") return "TIMEOUT";
    if (error.code === "api" && error.status === undefined) return "NETWORK";
    return "API";
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError
  )
    return "DATABASE";

  const message =
    error instanceof Error ? error.message.toLocaleLowerCase("en-US") : "";
  if (/\blease\b|\bconcurr(?:ency|ent)?\b|\blocked\b|\block was lost\b/.test(message))
    return "CONCURRENCY";
  if (/duplicate|unique source key/.test(message)) return "DUPLICATE";
  if (/identity|source key/.test(message)) return "IDENTITY";
  if (/schema|header|column/.test(message)) return "SCHEMA";
  if (/parser|parse|semantic structure/.test(message)) return "PARSER";
  if (/validation|blocked/.test(message)) return "VALIDATION";
  if (/target|business rule|approved/.test(message)) return "BUSINESS_RULE";
  return "DATABASE";
}
