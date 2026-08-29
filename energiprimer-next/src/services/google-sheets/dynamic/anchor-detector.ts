import {
  DASHBOARD_FIELD_DEFINITIONS,
  DASHBOARD_STRUCTURAL_DEFINITIONS,
} from "./definitions/dashboard-table";
import { normalizeCellText, nonEmptyCells } from "./spreadsheet-scanner";
import type {
  AnchorDefinition,
  AnchorKey,
  DetectedAnchor,
  DynamicFieldDefinition,
  ScannedCell,
} from "./types";

export const ALL_ANCHOR_DEFINITIONS: readonly AnchorDefinition[] = [
  ...DASHBOARD_FIELD_DEFINITIONS,
  ...DASHBOARD_STRUCTURAL_DEFINITIONS,
];

function matchDefinition(
  cell: ScannedCell,
  definition: AnchorDefinition,
): DetectedAnchor | null {
  const normalized = cell.normalizedValue;
  const canonical = normalizeCellText(definition.label);
  const aliases = (definition.aliases ?? []).map(normalizeCellText);

  if (normalized === canonical) {
    return {
      key: definition.key,
      label: definition.label,
      matchedLabel: normalized,
      matchType: "exact",
      cell,
      tableKind: definition.tableKind,
      expectedUnits: definition.expectedUnits ?? [],
    };
  }

  if (aliases.includes(normalized)) {
    return {
      key: definition.key,
      label: definition.label,
      matchedLabel: normalized,
      matchType: "alias",
      cell,
      tableKind: definition.tableKind,
      expectedUnits: definition.expectedUnits ?? [],
    };
  }

  if (definition.match?.(normalized)) {
    return {
      key: definition.key,
      label: definition.label,
      matchedLabel: normalized,
      matchType: "pattern",
      cell,
      tableKind: definition.tableKind,
      expectedUnits: definition.expectedUnits ?? [],
    };
  }

  return null;
}

export function detectAnchors(
  cells: readonly ScannedCell[],
  definitions: readonly AnchorDefinition[] = ALL_ANCHOR_DEFINITIONS,
): DetectedAnchor[] {
  const detected: DetectedAnchor[] = [];
  for (const cell of nonEmptyCells(cells)) {
    for (const definition of definitions) {
      const match = matchDefinition(cell, definition);
      if (match) detected.push(match);
    }
  }
  return detected;
}

export function anchorsForKey(
  anchors: readonly DetectedAnchor[],
  key: AnchorKey,
): DetectedAnchor[] {
  return anchors.filter((anchor) => anchor.key === key);
}

export function metricDefinitions(): readonly DynamicFieldDefinition[] {
  return DASHBOARD_FIELD_DEFINITIONS;
}

export function isExactOrAliasAnchor(anchor: DetectedAnchor): boolean {
  return anchor.matchType === "exact" || anchor.matchType === "alias";
}
