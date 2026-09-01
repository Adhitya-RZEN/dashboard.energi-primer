import { parseBBWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";

import {
  detectSchemaChange,
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

/**
 * Automatic admission requires an exact semantic schema match with Juli26-BB.
 * `detectSchemaChange` ignores safe column reordering but blocks added,
 * missing, renamed, duplicate, ambiguous, or type-changed fields.
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

  const schemaChange = detectSchemaChange(options.canonicalSchema, currentSchema);
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
