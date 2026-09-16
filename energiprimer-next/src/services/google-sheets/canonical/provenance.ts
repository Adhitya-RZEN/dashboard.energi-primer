import type {
  CanonicalErrorCode,
  SourceObservation,
} from "./types";

export type ProvenanceValidation = {
  valid: boolean;
  errors: readonly CanonicalErrorCode[];
};

function validCoordinate(value: string | null) {
  return value === null || /^[A-Z]+[1-9][0-9]*$/u.test(value);
}

function validPositiveInteger(value: number | null) {
  return value === null || (Number.isInteger(value) && value > 0);
}

export function validateSourceObservation(
  observation: SourceObservation,
): ProvenanceValidation {
  const errors = new Set<CanonicalErrorCode>();
  if (observation.importRunId !== null && !observation.importRunId.trim()) {
    errors.add("PROVENANCE_ERROR");
  }
  if (!observation.sourceKey.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.spreadsheetId.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.sheetId.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.worksheetTitleSnapshot.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.sourceRange.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.mappingVersion.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.schemaVersion.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.parserVersion.trim()) errors.add("PROVENANCE_ERROR");
  if (!observation.observedAt.trim()) errors.add("PROVENANCE_ERROR");
  if (!validCoordinate(observation.cellAddress)) errors.add("PROVENANCE_ERROR");
  if (!validPositiveInteger(observation.row)) errors.add("PROVENANCE_ERROR");
  if (!validPositiveInteger(observation.column)) errors.add("PROVENANCE_ERROR");

  if (
    observation.granularity === "CELL" &&
    (observation.cellAddress === null ||
      observation.row === null ||
      observation.column === null)
  )
    errors.add("PROVENANCE_ERROR");
  if (observation.granularity === "ROW" && observation.row === null)
    errors.add("PROVENANCE_ERROR");
  if (
    ["RANGE", "WORKSHEET", "WORKBOOK"].includes(observation.granularity) &&
    (observation.cellAddress !== null ||
      observation.row !== null ||
      observation.column !== null)
  )
    errors.add("PROVENANCE_ERROR");

  if (observation.observationKind === "POLICY_FALLBACK") {
    if (
      observation.cellAddress !== null ||
      observation.row !== null ||
      observation.column !== null ||
      observation.rawDisplayValue !== null
    ) {
      errors.add("PROVENANCE_ERROR");
    }
  } else if (observation.rawDisplayValue === null) {
    // A normalized value is not an acceptable substitute for source evidence.
    // Aggregates may not have one raw display value, but their component raw
    // values must be retained instead of synthesizing a formatted total.
    const explicitEmptyCell =
      observation.granularity === "CELL" &&
      observation.cellAddress !== null &&
      observation.normalizedValue === null;
    if (
      !explicitEmptyCell &&
      (observation.granularity !== "RANGE" ||
        !observation.rawDisplayValues?.length)
    )
      errors.add("PROVENANCE_ERROR");
  }

  if (
    observation.observationKind === "SOURCE_CELL" &&
    (observation.cellAddress === null || observation.granularity !== "CELL")
  ) {
    errors.add("PROVENANCE_ERROR");
  }
  if (
    observation.observationKind === "SOURCE_RANGE" &&
    observation.granularity === "CELL"
  ) {
    errors.add("PROVENANCE_ERROR");
  }
  if (
    observation.observationKind === "SOURCE_RANGE" &&
    observation.cellAddress === null &&
    !observation.sourceRange.trim()
  ) {
    errors.add("PROVENANCE_ERROR");
  }

  return { valid: errors.size === 0, errors: [...errors] };
}

export function assertSourceObservation(
  observation: SourceObservation,
): SourceObservation {
  const result = validateSourceObservation(observation);
  if (!result.valid) {
    throw new Error("Source provenance is incomplete or inconsistent.");
  }
  return observation;
}

export function sourceObservationWithRawValue(
  observation: SourceObservation,
  rawDisplayValue: string | null,
) {
  // This helper intentionally does not normalize or stringify the raw value.
  // The caller must pass the exact display text returned by the source adapter.
  return Object.freeze({ ...observation, rawDisplayValue });
}
