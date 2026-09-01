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

function canonicalLabels(labels: readonly string[]) {
  return labels
    .map((label) => normalizeCellText(label))
    .filter(Boolean);
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

function columnSignature(path: HeaderPath, valueType: SchemaValueType) {
  return JSON.stringify({
    semanticKey: semanticKey(path),
    labels: canonicalLabels(path.labels),
    valueType,
  });
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

function hashSnapshot(input: Omit<SchemaSnapshot, "hash">) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

/**
 * Creates a schema fingerprint from semantic headers and observed value types.
 * Spreadsheet row numbers, column letters, cell addresses, and values are
 * deliberately excluded so sorting rows does not look like a schema change.
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
  return {
    ...snapshotWithoutHash,
    hash: hashSnapshot(snapshotWithoutHash),
  };
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
    return snapshot as SchemaSnapshot;
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
): SchemaChangeResult {
  const previousSnapshot =
    typeof previous === "string" ? parseStoredSnapshot(previous) : previous;
  if (!previousSnapshot) {
    return {
      changed: false,
      type: "NEW_SCHEMA",
      added: current.columns,
      removed: [],
      typeChanges: [],
      renameCandidates: [],
      reason: "No approved schema snapshot exists yet.",
    };
  }
  if (previousSnapshot.hash === current.hash) {
    return {
      changed: false,
      type: "UNCHANGED",
      added: [],
      removed: [],
      typeChanges: [],
      renameCandidates: [],
      reason: "Schema fingerprint is unchanged.",
    };
  }

  const previousBySignature = groupedBy(
    previousSnapshot.columns,
    (column) => column.signature,
  );
  const currentBySignature = groupedBy(
    current.columns,
    (column) => column.signature,
  );
  const added = current.columns.filter(
    (column) => !currentBySignature.get(column.signature)?.length ||
      (previousBySignature.get(column.signature)?.length ?? 0) <
        (currentBySignature.get(column.signature)?.length ?? 0),
  );
  const removed = previousSnapshot.columns.filter(
    (column) =>
      !previousBySignature.get(column.signature) ||
      (currentBySignature.get(column.signature)?.length ?? 0) <
        (previousBySignature.get(column.signature)?.length ?? 0),
  );

  const previousBySemantic = groupedBy(
    previousSnapshot.columns,
    (column) => column.semanticKey,
  );
  const currentBySemantic = groupedBy(
    current.columns,
    (column) => column.semanticKey,
  );
  const typeChanges: {
    previous: SchemaColumnSnapshot;
    current: SchemaColumnSnapshot;
  }[] = [];
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

  const previousDuplicateHeaders = duplicateHeaderGroups(previousSnapshot.columns);
  const currentDuplicateHeaders = duplicateHeaderGroups(current.columns);
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
