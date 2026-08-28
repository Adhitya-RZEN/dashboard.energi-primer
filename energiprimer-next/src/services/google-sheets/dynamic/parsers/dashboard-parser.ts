import { DASHBOARD_FIELD_DEFINITIONS } from "../definitions/dashboard-table";
import { unavailableValue } from "../confidence";
import { anchorsForKey } from "../anchor-detector";
import { nearestRegion } from "../table-detector";
import { resolveAnchorValue } from "../value-resolver";
import type {
  DetectedAnchor,
  DynamicFieldKey,
  ResolvedValue,
  ScannedCell,
  StructureAnalysis,
  TableRegion,
} from "../types";

export type DashboardParseResult = {
  fields: Partial<Record<DynamicFieldKey, ResolvedValue>>;
  warnings: string[];
};

function chooseResolution(
  resolutions: readonly ResolvedValue[],
  field: DynamicFieldKey,
): ResolvedValue {
  const available = resolutions.filter((resolution) => resolution.available && resolution.value !== null);
  if (!available.length) {
    return resolutions.find((resolution) => resolution.status === "malformed")
      ?? resolutions.find((resolution) => resolution.status === "ambiguous")
      ?? unavailableValue(`Anchor ${field} tidak ditemukan atau tidak memiliki nilai valid.`);
  }
  const sorted = [...available].sort((a, b) => b.confidence - a.confidence);
  const [best, second] = sorted;
  if (second && Math.abs(best.confidence - second.confidence) <= 0.03 && best.value !== second.value) {
    return {
      value: null,
      available: false,
      confidence: best.confidence,
      level: "UNRESOLVED",
      source: null,
      status: "ambiguous",
      candidates: [...best.candidates, ...second.candidates],
      note: `Duplicate anchor ${field} menghasilkan candidate bernilai berbeda.`,
    };
  }
  return best;
}

function resolveField(
  field: DynamicFieldKey,
  anchors: readonly DetectedAnchor[],
  regions: readonly TableRegion[],
  worksheet: string,
  structure: StructureAnalysis | undefined,
) {
  const matches = anchorsForKey(anchors, field);
  if (!matches.length) return unavailableValue(`Anchor ${field} tidak ditemukan.`);
  return chooseResolution(
    matches.map((anchor) => resolveAnchorValue(anchor, nearestRegion(regions, anchor, "dashboard"), worksheet, structure)),
    field,
  );
}

function isCoalCurrentAnchor(anchor: DetectedAnchor) {
  return /PEMAKAIAN\s+(?:BATUBARA|BATU BARA)\s+UNIT\s+[123]\s+(?:CURENT|CURRENT|TERKINI)/.test(anchor.matchedLabel);
}

function explicitUnit(anchor: DetectedAnchor) {
  const match = anchor.matchedLabel.match(/\bUNIT\s*([123])\b/);
  return match ? Number(match[1]) : null;
}

function resolveCoalCurrent(
  field: "coalUnit1Current" | "coalUnit2Current" | "coalUnit3Current",
  anchors: readonly DetectedAnchor[],
  regions: readonly TableRegion[],
  worksheet: string,
  structure: StructureAnalysis | undefined,
): { value: ResolvedValue; warning?: string } {
  const current = anchors
    .filter(isCoalCurrentAnchor)
    .sort((a, b) => a.cell.row - b.cell.row || a.cell.column - b.cell.column);
  const requestedUnit = Number(field.match(/Unit([123])/u)?.[1] ?? 0);
  const explicit = current.filter((anchor) => explicitUnit(anchor) === requestedUnit);
  let selected = explicit[0];
  let warning: string | undefined;

  if (requestedUnit === 3 && !selected && current.length >= 3) {
    selected = current[2];
    warning = "Label Unit 3 pada worksheet terdeteksi sebagai duplicate/typo Unit 2; dipetakan berdasarkan urutan blok Unit 1–3.";
  }
  if (requestedUnit === 2 && explicit.length > 1) {
    selected = explicit[0];
  }
  if (!selected) return { value: unavailableValue(`Anchor ${field} tidak ditemukan.`), warning };
  const value = resolveAnchorValue(selected, nearestRegion(regions, selected, "dashboard"), worksheet, structure);
  return {
    value: warning ? { ...value, note: warning } : value,
    warning,
  };
}

export function parseDashboardTable(
  cells: readonly ScannedCell[],
  anchors: readonly DetectedAnchor[],
  regions: readonly TableRegion[],
  worksheet: string,
  structure?: StructureAnalysis,
): DashboardParseResult {
  const fields: Partial<Record<DynamicFieldKey, ResolvedValue>> = {};
  const warnings: string[] = [];
  const dashboardFields = DASHBOARD_FIELD_DEFINITIONS.filter((definition) => definition.tableKind === "dashboard");

  for (const definition of dashboardFields) {
    if (definition.field === "coalUnit1Current" || definition.field === "coalUnit2Current" || definition.field === "coalUnit3Current") {
      const resolved = resolveCoalCurrent(definition.field, anchors, regions, worksheet, structure);
      fields[definition.field] = resolved.value;
      if (resolved.warning) warnings.push(resolved.warning);
      continue;
    }
    fields[definition.field] = resolveField(definition.field, anchors, regions, worksheet, structure);
  }

  return { fields, warnings };
}

