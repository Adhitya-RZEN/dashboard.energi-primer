import { anchorsForKey } from "../anchor-detector";
import { unavailableValue } from "../confidence";
import { nearestRegion } from "../table-detector";
import { parseTargetNumber } from "../validators";
import { resolveAnchorValue } from "../value-resolver";
import type {
  DetectedAnchor,
  ResolvedValue,
  ScannedCell,
  StructureAnalysis,
  TableRegion,
} from "../types";

export type TargetParseResult = {
  target: ResolvedValue;
  targetYear: number | null;
};

function targetYearFromAnchor(anchor: DetectedAnchor | undefined) {
  const match = anchor?.matchedLabel.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function parseTargetTable(
  cells: readonly ScannedCell[],
  anchors: readonly DetectedAnchor[],
  regions: readonly TableRegion[],
  worksheet: string,
  structure?: StructureAnalysis,
): TargetParseResult {
  const matches = anchorsForKey(anchors, "biomassTarget");
  if (!matches.length)
    return {
      target: unavailableValue("Target biomassa tidak ditemukan."),
      targetYear: null,
    };

  const resolutions = matches.map((anchor) =>
    resolveAnchorValue(
      anchor,
      nearestRegion(regions, anchor, "target") ??
        nearestRegion(regions, anchor, "dashboard"),
      worksheet,
      structure,
      { parse: parseTargetNumber },
    ),
  );
  const available = resolutions
    .map((resolution, index) => ({ resolution, anchor: matches[index] }))
    .filter(
      ({ resolution }) => resolution.available && resolution.value !== null,
    )
    .sort((a, b) => b.resolution.confidence - a.resolution.confidence);
  if (!available.length) {
    return {
      target:
        resolutions.find((resolution) => resolution.status === "malformed") ??
        resolutions[0] ??
        unavailableValue("Target biomassa tidak memiliki nilai valid."),
      targetYear: targetYearFromAnchor(matches[0]),
    };
  }
  const [best] = available;
  return {
    target: best.resolution,
    targetYear: targetYearFromAnchor(best.anchor),
  };
}
