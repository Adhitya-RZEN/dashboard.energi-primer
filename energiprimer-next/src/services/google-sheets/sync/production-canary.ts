export const PHASE5_CANARY_AUTHORIZATION_ENV =
  "GOOGLE_SHEETS_PHASE5_CANARY_AUTHORIZATION" as const;
export const PHASE5_CANARY_APPROVAL_REF_ENV =
  "GOOGLE_SHEETS_PHASE5_CANARY_APPROVAL_REF" as const;
export const PHASE5_CANARY_MAX_RECORDS_ENV =
  "GOOGLE_SHEETS_PHASE5_CANARY_MAX_RECORDS" as const;
export const PHASE5_CANARY_AUTHORIZATION_VALUE =
  "I_ACKNOWLEDGE_PHASE5_PRODUCTION_CANARY" as const;
export const DEFAULT_PHASE5_CANARY_MAX_RECORDS = 25;

export type ProductionCanaryAuthorization = {
  authorized: boolean;
  approvalReferencePresent: boolean;
  maxRecords: number;
  reason?:
    | "AUTHORIZATION_MISSING"
    | "APPROVAL_REFERENCE_MISSING"
    | "MAX_RECORDS_INVALID"
    | "DURABLE_LEDGER_DISABLED";
};

export class ProductionCanaryAuthorizationError extends Error {
  readonly code = "CANARY_AUTHORIZATION_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProductionCanaryAuthorizationError";
  }
}

function maxRecords() {
  const raw = process.env[PHASE5_CANARY_MAX_RECORDS_ENV]?.trim();
  if (!raw) return DEFAULT_PHASE5_CANARY_MAX_RECORDS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > DEFAULT_PHASE5_CANARY_MAX_RECORDS)
    return null;
  return parsed;
}

export function productionCanaryAuthorization(): ProductionCanaryAuthorization {
  const authorization = process.env[PHASE5_CANARY_AUTHORIZATION_ENV]?.trim();
  if (authorization !== PHASE5_CANARY_AUTHORIZATION_VALUE) {
    return {
      authorized: false,
      approvalReferencePresent: false,
      maxRecords: DEFAULT_PHASE5_CANARY_MAX_RECORDS,
      reason: "AUTHORIZATION_MISSING",
    };
  }
  const approvalReferencePresent = Boolean(
    process.env[PHASE5_CANARY_APPROVAL_REF_ENV]?.trim(),
  );
  if (!approvalReferencePresent) {
    return {
      authorized: false,
      approvalReferencePresent: false,
      maxRecords: DEFAULT_PHASE5_CANARY_MAX_RECORDS,
      reason: "APPROVAL_REFERENCE_MISSING",
    };
  }
  const limit = maxRecords();
  if (limit === null) {
    return {
      authorized: false,
      approvalReferencePresent: true,
      maxRecords: DEFAULT_PHASE5_CANARY_MAX_RECORDS,
      reason: "MAX_RECORDS_INVALID",
    };
  }
  if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED !== "true") {
    return {
      authorized: false,
      approvalReferencePresent: true,
      maxRecords: limit,
      reason: "DURABLE_LEDGER_DISABLED",
    };
  }
  return { authorized: true, approvalReferencePresent: true, maxRecords: limit };
}

export function assertProductionCanaryAuthorization(
  recordCount: number,
) {
  const authorization = productionCanaryAuthorization();
  if (!authorization.authorized) {
    throw new ProductionCanaryAuthorizationError(
      `Production canary is not authorized: ${authorization.reason}.`,
    );
  }
  if (recordCount > authorization.maxRecords) {
    throw new ProductionCanaryAuthorizationError(
      `Production canary scope exceeds the configured maximum of ${authorization.maxRecords} records.`,
    );
  }
  return authorization;
}
