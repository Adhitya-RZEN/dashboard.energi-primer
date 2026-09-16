import { createHash } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import "server-only";

export const REQUIRED_PRODUCTION_TABLES = [
  "units",
  "sync_sources",
  "sync_worksheets",
  "sync_runs",
  "sync_row_states",
  "sync_schema_changes",
  "spreadsheet_import_runs",
  "spreadsheet_import_staging",
  "biomass_receipts",
  "coal_receipts",
  "coal_consumption",
  "coal_stock",
  "biomass_consumptions",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
] as const;

export type SyncDatabaseTarget = "LOCAL" | "SUPABASE_PRODUCTION";

export type SafePostgresUrlShape = {
  valid: boolean;
  protocol: string;
  host: string;
  port: string;
  database: string;
  sslmode: string;
  pgbouncer: string;
  usernamePresent: boolean;
  passwordPresent: boolean;
  error?: string;
};

export type SafeProductionDatabaseIdentity = {
  host: string;
  port: string;
  database: string;
  schema: string;
  role: string;
  postgresql: string;
  ssl: "PASS" | "NOT_REPORTED_BY_POOLER";
};

export type VerifiedSupabaseProductionTarget = {
  readonly target: "SUPABASE_PRODUCTION";
  readonly verified: true;
  readonly connectionVariable: string;
  readonly identity: SafeProductionDatabaseIdentity;
  readonly fingerprint: string;
};

export type ProductionTargetErrorCode =
  | "ENVIRONMENT_VARIABLE_MISSING"
  | "INVALID_URL_SHAPE"
  | "WRONG_SUPABASE_ENDPOINT"
  | "WRONG_DATABASE"
  | "WRONG_SCHEMA"
  | "REQUIRED_TABLES_MISSING"
  | "TARGET_UNREACHABLE"
  | "TARGET_VERIFICATION_FAILED";

export class ProductionTargetVerificationError extends Error {
  readonly code: ProductionTargetErrorCode;

  constructor(code: ProductionTargetErrorCode, message: string) {
    super(message);
    this.name = "ProductionTargetVerificationError";
    this.code = code;
  }
}

function unknownShape(error: string): SafePostgresUrlShape {
  return {
    valid: false,
    protocol: "UNKNOWN",
    host: "UNKNOWN",
    port: "UNKNOWN",
    database: "UNKNOWN",
    sslmode: "UNKNOWN",
    pgbouncer: "UNKNOWN",
    usernamePresent: false,
    passwordPresent: false,
    error,
  };
}

function databaseName(pathname: string) {
  const value = pathname.replace(/^\//u, "");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function inspectSupabasePoolerUrl(rawUrl: string): SafePostgresUrlShape {
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol;
    const host = parsed.hostname.toLocaleLowerCase("en-US");
    const port = parsed.port || "5432";
    const database = databaseName(parsed.pathname);
    const sslmode =
      parsed.searchParams.get("sslmode")?.toLocaleLowerCase("en-US") ?? "ABSENT";
    const pgbouncer =
      parsed.searchParams.get("pgbouncer")?.toLocaleLowerCase("en-US") ?? "ABSENT";
    const valid =
      protocol === "postgresql:" &&
      host.endsWith(".pooler.supabase.com") &&
      port === "6543" &&
      database === "postgres" &&
      ["require", "verify-full"].includes(sslmode) &&
      pgbouncer !== "false";
    return {
      valid,
      protocol,
      host,
      port,
      database,
      sslmode,
      pgbouncer,
      usernamePresent: Boolean(parsed.username),
      passwordPresent: Boolean(parsed.password),
      ...(valid ? {} : { error: "SUPABASE_TRANSACTION_POOLER_REQUIRED" }),
    };
  } catch {
    return unknownShape("INVALID_URL_SHAPE");
  }
}

export function prepareSupabasePoolerProbeUrl(rawUrl: string) {
  const shape = inspectSupabasePoolerUrl(rawUrl);
  if (!shape.valid)
    throw new ProductionTargetVerificationError(
      shape.error === "INVALID_URL_SHAPE"
        ? "INVALID_URL_SHAPE"
        : "WRONG_SUPABASE_ENDPOINT",
      "Supabase Production transaction-pooler URL is not valid.",
    );
  const parsed = new URL(rawUrl);
  parsed.searchParams.set("sslmode", "verify-full");
  parsed.searchParams.set("pgbouncer", "true");
  return parsed.toString();
}

function safeErrorCode(error: unknown): ProductionTargetErrorCode {
  const message = error instanceof Error ? error.message.toLocaleLowerCase("en-US") : "";
  if (
    message.includes("can't reach") ||
    message.includes("could not connect") ||
    message.includes("connection refused") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("eai_again") ||
    message.includes("enotfound")
  )
    return "TARGET_UNREACHABLE";
  if (
    message.includes("authentication") ||
    message.includes("password") ||
    message.includes("permission")
  )
    return "TARGET_VERIFICATION_FAILED";
  return "TARGET_VERIFICATION_FAILED";
}

function targetFingerprint(identity: SafeProductionDatabaseIdentity) {
  return createHash("sha256")
    .update(
      [
        identity.host,
        identity.port,
        identity.database,
        identity.schema,
      ].join("|"),
    )
    .digest("hex");
}

export function assertVerifiedSupabaseProductionTarget(
  target: VerifiedSupabaseProductionTarget | undefined,
) {
  if (
    !target ||
    target.target !== "SUPABASE_PRODUCTION" ||
    target.verified !== true ||
    target.identity.database !== "postgres" ||
    target.identity.schema !== "public"
  )
    throw new ProductionTargetVerificationError(
      "TARGET_VERIFICATION_FAILED",
      "Supabase Production target has not been positively verified.",
    );
  return target;
}

export async function verifySupabaseProductionTarget(input: {
  rawUrl?: string;
  connectionVariable?: string;
} = {}): Promise<VerifiedSupabaseProductionTarget> {
  const connectionVariable = input.connectionVariable ?? "SUPABASE_POOLER_URL";
  const rawUrl = input.rawUrl?.trim() || process.env[connectionVariable]?.trim();
  if (!rawUrl)
    throw new ProductionTargetVerificationError(
      "ENVIRONMENT_VARIABLE_MISSING",
      `${connectionVariable} is not configured.`,
    );

  const shape = inspectSupabasePoolerUrl(rawUrl);
  if (!shape.valid)
    throw new ProductionTargetVerificationError(
      shape.error === "INVALID_URL_SHAPE"
        ? "INVALID_URL_SHAPE"
        : "WRONG_SUPABASE_ENDPOINT",
      "Supabase Production transaction-pooler target is invalid.",
    );
  const probeUrl = prepareSupabasePoolerProbeUrl(rawUrl);
  const client = new PrismaClient({ datasourceUrl: probeUrl });
  try {
    const metadataRows = await client.$queryRaw<Array<{
      database_name: string;
      current_role: string;
      current_schema: string;
      server_version: string;
      ssl: boolean | null;
    }>>`
      SELECT current_database() AS database_name,
             current_user AS current_role,
             current_schema() AS current_schema,
             version() AS server_version,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
    `;
    const metadata = metadataRows[0];
    if (!metadata)
      throw new ProductionTargetVerificationError(
        "TARGET_VERIFICATION_FAILED",
        "Production database identity was not returned.",
      );
    if (metadata.database_name !== "postgres")
      throw new ProductionTargetVerificationError(
        "WRONG_DATABASE",
        "Connected database is not the approved Supabase Production database.",
      );
    if (metadata.current_schema !== "public")
      throw new ProductionTargetVerificationError(
        "WRONG_SCHEMA",
        "Connected schema is not the approved public schema.",
      );

    const requiredTables = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(
          REQUIRED_PRODUCTION_TABLES.map((table) => Prisma.sql`${table}`),
        )})
    `;
    const present = new Set(requiredTables.map((row) => row.table_name));
    const missing = REQUIRED_PRODUCTION_TABLES.filter((table) => !present.has(table));
    if (missing.length > 0)
      throw new ProductionTargetVerificationError(
        "REQUIRED_TABLES_MISSING",
        "Required Production synchronization tables are missing.",
      );

    const identity: SafeProductionDatabaseIdentity = {
      host: shape.host,
      port: shape.port,
      database: metadata.database_name,
      schema: metadata.current_schema,
      role: metadata.current_role,
      postgresql:
        metadata.server_version.match(/PostgreSQL ([0-9.]+)/u)?.[1] ?? "unknown",
      ssl: metadata.ssl === true ? "PASS" : "NOT_REPORTED_BY_POOLER",
    };
    return {
      target: "SUPABASE_PRODUCTION",
      verified: true,
      connectionVariable,
      identity,
      fingerprint: targetFingerprint(identity),
    };
  } catch (error) {
    if (error instanceof ProductionTargetVerificationError) throw error;
    throw new ProductionTargetVerificationError(
      safeErrorCode(error),
      "Supabase Production target verification failed.",
    );
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
