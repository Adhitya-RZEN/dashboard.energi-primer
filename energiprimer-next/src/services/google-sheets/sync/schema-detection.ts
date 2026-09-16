import "server-only";

import { createHash } from "node:crypto";

import { parseNumericValue } from "@/services/google-sheets/dynamic/validators";
import { normalizeCellText } from "@/services/google-sheets/dynamic/spreadsheet-scanner";
import type {
  DynamicParserResult,
  HeaderPath,
  StructureAnalysis,
} from "@/services/google-sheets/dynamic/types";

export type SchemaValueType = "numeric" | "empty" | "text" | "mixed";

export type SchemaColumnSnapshot = {
  semanticKey: string;
  signature: string;
  labels: readonly string[];
  resource: HeaderPath["resource"];
  unit: string | null;
  unitNumber: number | null;
  isTotal: boolean;
  isStock: boolean;
  isHop: boolean;
  isDate: boolean;
  valueType: SchemaValueType;
};

export type SchemaSnapshot = {
  version: 1;
  dateColumnPresent: boolean;
  columns: readonly SchemaColumnSnapshot[];
  hash: string;
};

export type SchemaChangeType =
  | "UNCHANGED"
  | "NEW_SCHEMA"
  | "NEW_COLUMN"
  | "MISSING_COLUMN"
  | "RENAME_CANDIDATE"
  | "TYPE_CHANGE"
  | "SCHEMA_REVIEW";

export type SchemaChangeResult = {
  changed: boolean;
  type: SchemaChangeType;
  added: readonly SchemaColumnSnapshot[];
  removed: readonly SchemaColumnSnapshot[];
  typeChanges: readonly {
    previous: SchemaColumnSnapshot;
    current: SchemaColumnSnapshot;
  }[];
  renameCandidates: readonly {
    previous: SchemaColumnSnapshot;
    current: SchemaColumnSnapshot;
    similarity: number;
  }[];
  reason: string;
};

export type SchemaComparisonOptions = {
  /**
   * Treat observed cell value types as data drift, not structural schema
   * drift. Header semantics and column presence remain strict.
   */
  allowObservedValueTypeDrift?: boolean;
};

function canonicalLabels(labels: readonly string[]) {
  return labels
    .map((label) => normalizeCellText(label))
    .filter(Boolean)
    // Structure analysis can carry a numeric sample value as a path label
    // when a sheet has no explicit header in that column. It is cell content,
    // not a schema label, and must not make identical monthly layouts drift.
    .filter((label) => parseNumericValue(label).status !== "numeric");
}

function semanticKey(path: HeaderPath) {
  return JSON.stringify({
    resource: path.resource,
    unit: path.unit,
    unitNumber: path.unitNumber,
    isTotal: path.isTotal,
    isStock: path.isStock,
    isHop: path.isHop,
    isDate: path.isDate,
  });
}

function schemaColumnSignature(
  semanticKeyValue: string,
  labels: readonly string[],
  valueType: SchemaValueType,
) {
  return JSON.stringify({
    semanticKey: semanticKeyValue,
    labels,
    valueType,
  });
}

function columnSignature(path: HeaderPath, valueType: SchemaValueType) {
  const labels = canonicalLabels(path.labels);
  return schemaColumnSignature(semanticKey(path), labels, valueType);
}

function valueTypeForColumn(
  parsed: DynamicParserResult,
  structure: StructureAnalysis,
  column: number,
): SchemaValueType {
  const types = new Set<"numeric" | "empty" | "text">();
  for (const row of structure.dataRows) {
    const cell = parsed.scannedCells.find(
      (candidate) => candidate.row === row && candidate.column === column,
    );
    const parsedValue = parseNumericValue(cell?.rawValue);
    if (parsedValue.status === "numeric") types.add("numeric");
    else if (parsedValue.status === "empty") types.add("empty");
    else types.add("text");
  }

  if (types.size === 0 || (types.size === 1 && types.has("empty")))
    return "empty";
  if (types.has("numeric") && !types.has("text")) return "numeric";
  if (types.has("text") && !types.has("numeric")) return "text";
  return "mixed";
}

function structuralColumnKey(column: SchemaColumnSnapshot) {
  return JSON.stringify({
    semanticKey: column.semanticKey,
    labels: column.labels,
  });
}

function hashSnapshot(input: Omit<SchemaSnapshot, "hash">) {
  const structuralInput = {
    version: input.version,
    dateColumnPresent: input.dateColumnPresent,
    columns: input.columns
      .map((column) => ({
        semanticKey: column.semanticKey,
        labels: column.labels,
        resource: column.resource,
        unit: column.unit,
        unitNumber: column.unitNumber,
        isTotal: column.isTotal,
        isStock: column.isStock,
        isHop: column.isHop,
        isDate: column.isDate,
      }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  };
  return createHash("sha256")
    .update(JSON.stringify(structuralInput))
    .digest("hex");
}

function normalizeSnapshot(snapshot: SchemaSnapshot): SchemaSnapshot {
  const columns = snapshot.columns
    .map((column) => {
      const labels = canonicalLabels(column.labels);
      return {
        ...column,
        labels,
        signature: schemaColumnSignature(
          column.semanticKey,
          labels,
          column.valueType,
        ),
      } satisfies SchemaColumnSnapshot;
    })
    .sort(
      (a, b) =>
        structuralColumnKey(a).localeCompare(structuralColumnKey(b)) ||
        a.signature.localeCompare(b.signature),
    );
  const snapshotWithoutHash: Omit<SchemaSnapshot, "hash"> = {
    version: 1,
    dateColumnPresent: snapshot.dateColumnPresent,
    columns,
  };
  return {
    ...snapshotWithoutHash,
    hash: hashSnapshot(snapshotWithoutHash),
  };
}

/**
 * Creates a structural schema fingerprint from semantic headers and path
 * metadata. Observed value types stay in the snapshot for strict diagnostics,
 * but cell content is deliberately excluded from the fingerprint so monthly
 * values cannot look like a layout change.
 */
export function buildSchemaSnapshot(
  parsed: DynamicParserResult,
): SchemaSnapshot {
  const structure = parsed.structures[0];
  if (!structure) {
    const empty: Omit<SchemaSnapshot, "hash"> = {
      version: 1,
      dateColumnPresent: false,
      columns: [],
    };
    return { ...empty, hash: hashSnapshot(empty) };
  }

  const columns = structure.headerPaths
    .map((path) => {
      const labels = canonicalLabels(path.labels);
      const valueType = valueTypeForColumn(parsed, structure, path.cell.column);
      return {
        semanticKey: semanticKey(path),
        signature: columnSignature(path, valueType),
        labels,
        resource: path.resource,
        unit: path.unit,
        unitNumber: path.unitNumber,
        isTotal: path.isTotal,
        isStock: path.isStock,
        isHop: path.isHop,
        isDate: path.isDate,
        valueType,
      } satisfies SchemaColumnSnapshot;
    })
    .sort((a, b) => a.signature.localeCompare(b.signature));
  const snapshotWithoutHash: Omit<SchemaSnapshot, "hash"> = {
    version: 1,
    dateColumnPresent: structure.dateColumn !== null,
    columns,
  };
  return normalizeSnapshot({
    ...snapshotWithoutHash,
    hash: hashSnapshot(snapshotWithoutHash),
  });
}

function labelTokens(column: SchemaColumnSnapshot) {
  return new Set(
    column.labels
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

function similarity(
  previous: SchemaColumnSnapshot,
  current: SchemaColumnSnapshot,
) {
  const left = labelTokens(previous);
  const right = labelTokens(current);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / new Set([...left, ...right]).size;
}

function groupedBy<T>(
  columns: readonly T[],
  getKey: (column: T) => string,
) {
  const groups = new Map<string, T[]>();
  for (const column of columns) {
    const key = getKey(column);
    const group = groups.get(key) ?? [];
    group.push(column);
    groups.set(key, group);
  }
  return groups;
}

function columnComparisonKey(
  column: SchemaColumnSnapshot,
  options: SchemaComparisonOptions,
) {
  if (!options.allowObservedValueTypeDrift) return column.signature;
  return JSON.stringify({
    semanticKey: column.semanticKey,
    labels: column.labels,
  });
}

function duplicateHeaderGroups(columns: readonly SchemaColumnSnapshot[]) {
  return [...groupedBy(columns, (column) =>
    JSON.stringify({ semanticKey: column.semanticKey, labels: column.labels }),
  ).values()].filter((group) => group.length > 1 && group[0].labels.length > 0);
}

function parseStoredSnapshot(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const snapshot = parsed as Partial<SchemaSnapshot>;
    if (
      snapshot.version !== 1 ||
      typeof snapshot.hash !== "string" ||
      !Array.isArray(snapshot.columns)
    )
      return null;
    return normalizeSnapshot(snapshot as SchemaSnapshot);
  } catch {
    return null;
  }
}

export function parseSchemaSnapshot(value: string | null | undefined) {
  return parseStoredSnapshot(value);
}

export function detectSchemaChange(
  previous: SchemaSnapshot | string | null | undefined,
  current: SchemaSnapshot,
  options: SchemaComparisonOptions = {},
): SchemaChangeResult {
  const previousSnapshot =
    typeof previous === "string" ? parseStoredSnapshot(previous) : previous;
  const currentSnapshot = normalizeSnapshot(current);
  if (!previousSnapshot) {
    return {
      changed: false,
      type: "NEW_SCHEMA",
      added: currentSnapshot.columns,
      removed: [],
      typeChanges: [],
      renameCandidates: [],
      reason: "No approved schema snapshot exists yet.",
    };
  }
  const normalizedPrevious = normalizeSnapshot(previousSnapshot);
  const previousByComparisonKey = groupedBy(
    normalizedPrevious.columns,
    (column) => columnComparisonKey(column, options),
  );
  const currentByComparisonKey = groupedBy(
    currentSnapshot.columns,
    (column) => columnComparisonKey(column, options),
  );
  const added = currentSnapshot.columns.filter(
    (column) => {
      const key = columnComparisonKey(column, options);
      return (
        !currentByComparisonKey.get(key)?.length ||
        (previousByComparisonKey.get(key)?.length ?? 0) <
          (currentByComparisonKey.get(key)?.length ?? 0)
      );
    },
  );
  const removed = normalizedPrevious.columns.filter(
    (column) => {
      const key = columnComparisonKey(column, options);
      return (
        !previousByComparisonKey.get(key) ||
        (currentByComparisonKey.get(key)?.length ?? 0) <
          (previousByComparisonKey.get(key)?.length ?? 0)
      );
    },
  );

  const previousBySemantic = groupedBy(
    normalizedPrevious.columns,
    (column) => column.semanticKey,
  );
  const currentBySemantic = groupedBy(
    currentSnapshot.columns,
    (column) => column.semanticKey,
  );
  const typeChanges: {
    previous: SchemaColumnSnapshot;
    current: SchemaColumnSnapshot;
  }[] = [];
  if (!options.allowObservedValueTypeDrift) {
    for (const [key, previousColumns] of previousBySemantic) {
      const currentColumns = currentBySemantic.get(key) ?? [];
      for (const previousColumn of previousColumns) {
        const currentColumn = currentColumns.find(
          (candidate) =>
            JSON.stringify(candidate.labels) ===
            JSON.stringify(previousColumn.labels),
        );
        if (currentColumn && currentColumn.valueType !== previousColumn.valueType)
          typeChanges.push({ previous: previousColumn, current: currentColumn });
      }
    }
  }

  const renameCandidates: {
    previous: SchemaColumnSnapshot;
    current: SchemaColumnSnapshot;
    similarity: number;
  }[] = [];
  const usedCurrent = new Set<SchemaColumnSnapshot>();
  let ambiguousRename = false;
  for (const previousColumn of removed) {
    const candidates = (currentBySemantic.get(previousColumn.semanticKey) ?? [])
      .filter((candidate) => !usedCurrent.has(candidate))
      .map((candidate) => ({
        previous: previousColumn,
        current: candidate,
        similarity: similarity(previousColumn, candidate),
      }))
      .sort((a, b) => b.similarity - a.similarity);
    const candidate = candidates[0];
    const secondCandidate = candidates[1];
    if (
      candidate &&
      secondCandidate &&
      candidate.similarity >= 0.25 &&
      candidate.similarity === secondCandidate.similarity
    ) {
      ambiguousRename = true;
      continue;
    }
    if (candidate && candidate.similarity >= 0.25) {
      renameCandidates.push(candidate);
      usedCurrent.add(candidate.current);
    }
  }

  const previousDuplicateHeaders = duplicateHeaderGroups(normalizedPrevious.columns);
  const currentDuplicateHeaders = duplicateHeaderGroups(currentSnapshot.columns);
  if (
    currentDuplicateHeaders.length > previousDuplicateHeaders.length ||
    added.some((column) => column.labels.length === 0)
  )
    return {
      changed: true,
      type: "SCHEMA_REVIEW",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "Duplicate or empty semantic header requires manual review.",
    };
  if (ambiguousRename)
    return {
      changed: true,
      type: "SCHEMA_REVIEW",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "Rename mapping is ambiguous and cannot be selected automatically.",
    };
  if (typeChanges.length > 0)
    return {
      changed: true,
      type: "TYPE_CHANGE",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "One or more semantic columns changed observed value type.",
    };
  if (renameCandidates.length > 0)
    return {
      changed: true,
      type: "RENAME_CANDIDATE",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "A removed and added column may represent a header rename.",
    };
  if (added.length > 0 && removed.length === 0)
    return {
      changed: true,
      type: "NEW_COLUMN",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "One or more new semantic columns were detected.",
    };
  if (removed.length > 0 && added.length === 0)
    return {
      changed: true,
      type: "MISSING_COLUMN",
      added,
      removed,
      typeChanges,
      renameCandidates,
      reason: "One or more previously approved semantic columns are missing.",
    };
  if (
    added.length === 0 &&
    removed.length === 0 &&
    typeChanges.length === 0 &&
    renameCandidates.length === 0 &&
    normalizedPrevious.dateColumnPresent === currentSnapshot.dateColumnPresent
  )
    return {
      changed: false,
      type: "UNCHANGED",
      added: [],
      removed: [],
      typeChanges: [],
      renameCandidates: [],
      reason:
        normalizedPrevious.hash === currentSnapshot.hash
          ? "Schema fingerprint is unchanged."
          : "Schema structure is unchanged; non-structural snapshot details may vary.",
    };
  if (
    options.allowObservedValueTypeDrift &&
    normalizedPrevious.dateColumnPresent === currentSnapshot.dateColumnPresent
  )
    return {
      changed: false,
      type: "UNCHANGED",
      added: [],
      removed: [],
      typeChanges: [],
      renameCandidates: [],
      reason:
        "Schema structure is unchanged; observed value types may vary between worksheets.",
    };
  return {
    changed: true,
    type: "SCHEMA_REVIEW",
    added,
    removed,
    typeChanges,
    renameCandidates,
    reason: "Schema differences cannot be classified safely.",
  };
}
