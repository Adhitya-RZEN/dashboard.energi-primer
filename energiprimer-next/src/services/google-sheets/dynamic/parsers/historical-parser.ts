import { anchorsForKey } from "../anchor-detector";
import { nearestRegion } from "../table-detector";
import { unavailableValue } from "../confidence";
import { resolveAnchorValue } from "../value-resolver";
import type {
  DetectedAnchor,
  ResolvedValue,
  ScannedCell,
  StructureAnalysis,
  TableRegion,
} from "../types";

export type HistoricalParseResult = {
  cumulative: ResolvedValue;
  historicalYear: number | null;
};

function yearInLabel(anchor: DetectedAnchor | undefined) {
  const match = anchor?.matchedLabel.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function parseHistoricalTable(
  cells: readonly ScannedCell[],
  anchors: readonly DetectedAnchor[],
  regions: readonly TableRegion[],
  worksheet: string,
  year: number,
  structure?: StructureAnalysis,
): HistoricalParseResult {
  const matches = anchorsForKey(anchors, "biomassCumulative");
  if (!matches.length)
    return {
      cumulative: unavailableValue(
        "Realisasi kumulatif biomassa tidak ditemukan.",
      ),
      historicalYear: null,
    };
  const preferred = [...matches].sort((a, b) => {
    const aExact = a.matchedLabel === "KUMULATIF PEMAKAIAN BIOMASSA" ? 1 : 0;
    const bExact = b.matchedLabel === "KUMULATIF PEMAKAIAN BIOMASSA" ? 1 : 0;
    const aYear = yearInLabel(a) === year ? 1 : 0;
    const bYear = yearInLabel(b) === year ? 1 : 0;
    return bExact + bYear - (aExact + aYear);
  });
  const resolutions = preferred.map((anchor) =>
    resolveAnchorValue(
      anchor,
      nearestRegion(regions, anchor, "historical") ??
        nearestRegion(regions, anchor, "dashboard"),
      worksheet,
      structure,
    ),
  );
  const result =
    resolutions.find(
      (resolution) => resolution.available && resolution.value !== null,
    ) ??
    resolutions.find((resolution) => resolution.status === "malformed") ??
    resolutions[0] ??
    unavailableValue(
      "Realisasi kumulatif biomassa tidak memiliki nilai valid.",
    );
  return { cumulative: result, historicalYear: yearInLabel(preferred[0]) };
}
