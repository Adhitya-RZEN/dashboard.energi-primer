import { parseBBWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";
import { BB_CANONICAL_WORKSHEET } from "@/services/google-sheets/legacy-mapping/profiles";
import { normalizeWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";

import {
  detectSchemaChange,
  parseSchemaSnapshot,
  type SchemaChangeResult,
  type SchemaSnapshot,
} from "./schema-detection";

/**
 * Juli26-BB is the approved shape reference for the automatic BB pipeline.
 * The value is a policy boundary, not a data value and must not be changed by
 * worksheet discovery.
 */
export const BB_CANONICAL_PERIOD = { month: 7, year: 2026 } as const;
export const BB_CANONICAL_MAPPING_PROFILE = "BB_CANONICAL_V1" as const;
export const BB_CANONICAL_MAPPING_VERSION = 1 as const;
/**
 * The currently required monthly BB source set. This policy is intentionally
 * separate from discovery: discovery may register every Google worksheet,
 * while business validation and required-source checks use only these seven.
 */
export const BB_REQUIRED_MONTHLY_WORKSHEETS = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
  "Juli26-BB",
] as const;

export function missingRequiredMonthlyBBWorksheets(
  availableNames: readonly string[],
) {
  const available = new Set(
    availableNames.map((name) => name.trim().toLocaleLowerCase("en-US")),
  );
  return BB_REQUIRED_MONTHLY_WORKSHEETS.filter(
    (name) => !available.has(name.toLocaleLowerCase("en-US")),
  );
}

export type AutomaticWorksheetGate =
  | "APPROVED"
  | "NOT_BB_WORKSHEET"
  | "NOT_AFTER_CANONICAL_PERIOD"
  | "NOT_YET_DUE"
  | "CANONICAL_SCHEMA_UNAVAILABLE"
  | "SCHEMA_REVIEW";

export type AutomaticWorksheetDecision = {
  allowed: boolean;
  gate: AutomaticWorksheetGate;
  reason: string;
  schemaChange: SchemaChangeResult | null;
  mappingProfile: typeof BB_CANONICAL_MAPPING_PROFILE | null;
  mappingVersion: typeof BB_CANONICAL_MAPPING_VERSION | null;
};

export type ApprovedCanonicalSchemaCandidate = {
  sourceId?: bigint | number | string;
  status: string;
  worksheetTitle: string;
  schemaSnapshot: string | null;
  updatedAt?: Date;
};

export type ApprovedCanonicalSchemaResolution = {
  status: "AVAILABLE" | "UNAVAILABLE" | "AMBIGUOUS";
  schemaSnapshot: string | null;
  schemaHash: string | null;
  reason: string;
};

export type ApprovedCanonicalSchemaOptions = {
  /** Prefer an approval from the same registered Google source when present. */
  sourceId?: bigint | number | string;
};

/**
 * A schema approval belongs to the BB mapping profile, not to one workbook.
 * Only an active, exact Juli26-BB worksheet can contribute an approval. If
 * active workbooks disagree, fail closed instead of selecting one silently.
 */
export function resolveApprovedCanonicalSchema(
  candidates: readonly ApprovedCanonicalSchemaCandidate[],
  options: ApprovedCanonicalSchemaOptions = {},
): ApprovedCanonicalSchemaResolution {
  const canonicalTitle = normalizeWorksheetName(BB_CANONICAL_WORKSHEET);
  const valid = candidates
    .filter(
      (candidate) =>
        candidate.status === "ACTIVE" &&
        normalizeWorksheetName(candidate.worksheetTitle) === canonicalTitle,
    )
    .map((candidate) => {
      const snapshot = parseSchemaSnapshot(candidate.schemaSnapshot);
      return snapshot
        ? { candidate, snapshot }
        : null;
    })
    .filter(
      (value): value is {
        candidate: ApprovedCanonicalSchemaCandidate;
        snapshot: SchemaSnapshot;
      } => Boolean(value),
    );

  const sourceScoped =
    options.sourceId === undefined
      ? []
      : valid.filter(
          ({ candidate }) =>
            candidate.sourceId !== undefined &&
            String(candidate.sourceId) === String(options.sourceId),
        );
  // An explicit worksheet gets the canonical anchor from its own source when
  // one exists. If that source has no Juli anchor, retain the global policy:
  // a single global profile is usable, while conflicting global profiles still
  // fail closed.
  const considered = sourceScoped.length > 0 ? sourceScoped : valid;

  if (considered.length === 0)
    return {
      status: "UNAVAILABLE",
      schemaSnapshot: null,
      schemaHash: null,
      reason: "No active Juli26-BB schema profile is available.",
    };

  const hashes = new Set(considered.map(({ snapshot }) => snapshot.hash));
  if (hashes.size > 1)
    return {
      status: "AMBIGUOUS",
      schemaSnapshot: null,
      schemaHash: null,
      reason: "Active Juli26-BB worksheets contain conflicting schema profiles.",
    };

  const latest = [...considered].sort(
    (left, right) =>
      (right.candidate.updatedAt?.getTime() ?? 0) -
      (left.candidate.updatedAt?.getTime() ?? 0),
  )[0];
  if (!latest)
    return {
      status: "UNAVAILABLE",
      schemaSnapshot: null,
      schemaHash: null,
      reason: "No active Juli26-BB schema profile is available.",
    };

  return {
    status: "AVAILABLE",
    schemaSnapshot: JSON.stringify(latest.snapshot),
    schemaHash: latest.snapshot.hash,
    reason:
      sourceScoped.length > 0
        ? "An active Juli26-BB schema profile is available for the registered source."
        : "An active Juli26-BB schema profile is available across workbooks.",
  };
}

export function isAutomaticWorksheetReviewRetryable(input: {
  status: string;
  schemaHash: string | null;
  schemaSnapshot: string | null;
}) {
  return (
    input.status === "SCHEMA_REVIEW" &&
    input.schemaHash === null &&
    input.schemaSnapshot === null
  );
}

export function isCanonicalSchemaReviewRetryable(
  input: {
    status: string;
    schemaHash: string | null;
    schemaSnapshot: string | null;
  },
  openSchemaChangeTypes: readonly string[] = [],
) {
  return (
    isAutomaticWorksheetReviewRetryable(input) &&
    openSchemaChangeTypes.every((changeType) => changeType === "TYPE_CHANGE")
  );
}

type Period = { month: number; year: number };

function periodOrdinal(period: Period) {
  return period.year * 12 + period.month;
}

function currentPeriod(): Period {
  const now = new Date();
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
}

/**
 * Only valid BB titles after the approved July 2026 boundary are eligible for
 * automatic cron processing. Unrelated tabs and historical legacy BB tabs
 * remain outside this automatic path.
 */
export function isAutomaticFutureBBWorksheet(
  worksheetTitle: string,
  asOf: Period = currentPeriod(),
) {
  const period = parseBBWorksheetName(worksheetTitle);
  if (!period) return false;
  return (
    periodOrdinal(period) > periodOrdinal(BB_CANONICAL_PERIOD) &&
    periodOrdinal(period) <= periodOrdinal(asOf)
  );
}

export function isAfterCanonicalBBWorksheet(worksheetTitle: string) {
  const period = parseBBWorksheetName(worksheetTitle);
  return Boolean(
    period && periodOrdinal(period) > periodOrdinal(BB_CANONICAL_PERIOD),
  );
}

export function isCanonicalBBWorksheet(worksheetTitle: string) {
  return (
    normalizeWorksheetName(worksheetTitle) ===
    normalizeWorksheetName(BB_CANONICAL_WORKSHEET)
  );
}

/**
 * Automatic admission requires an exact semantic schema match with Juli26-BB.
 * Observed cell value types may vary between monthly files; the import plan
 * still validates the actual values. `detectSchemaChange` blocks added,
 * missing, renamed, duplicate, or ambiguous fields.
 */
export function evaluateAutomaticWorksheet(
  worksheetTitle: string,
  currentSchema: SchemaSnapshot,
  options: {
    canonicalSchema?: SchemaSnapshot | string | null;
    asOf?: Period;
  } = {},
): AutomaticWorksheetDecision {
  const parsed = parseBBWorksheetName(worksheetTitle);
  if (!parsed)
    return {
      allowed: false,
      gate: "NOT_BB_WORKSHEET",
      reason: "Worksheet title does not match the supported BB period pattern.",
      schemaChange: null,
      mappingProfile: null,
      mappingVersion: null,
    };

  const asOf = options.asOf ?? currentPeriod();
  if (periodOrdinal(parsed) <= periodOrdinal(BB_CANONICAL_PERIOD))
    return {
      allowed: false,
      gate: "NOT_AFTER_CANONICAL_PERIOD",
      reason: "Worksheet is not after the Juli26-BB automatic-sync boundary.",
      schemaChange: null,
      mappingProfile: null,
      mappingVersion: null,
    };
  if (periodOrdinal(parsed) > periodOrdinal(asOf))
    return {
      allowed: false,
      gate: "NOT_YET_DUE",
      reason: "Worksheet period is later than the current operational period.",
      schemaChange: null,
      mappingProfile: null,
      mappingVersion: null,
    };

  if (!options.canonicalSchema)
    return {
      allowed: false,
      gate: "CANONICAL_SCHEMA_UNAVAILABLE",
      reason: "Juli26-BB schema approval is unavailable; automatic import is blocked.",
      schemaChange: null,
      mappingProfile: null,
      mappingVersion: null,
    };

  const schemaChange = detectSchemaChange(
    options.canonicalSchema,
    currentSchema,
    { allowObservedValueTypeDrift: true },
  );
  if (schemaChange.changed)
    return {
      allowed: false,
      gate: "SCHEMA_REVIEW",
      reason: schemaChange.reason,
      schemaChange,
      mappingProfile: null,
      mappingVersion: null,
    };

  return {
    allowed: true,
    gate: "APPROVED",
    reason: "Worksheet schema matches the approved Juli26-BB canonical schema.",
    schemaChange,
    mappingProfile: BB_CANONICAL_MAPPING_PROFILE,
    mappingVersion: BB_CANONICAL_MAPPING_VERSION,
  };
}
