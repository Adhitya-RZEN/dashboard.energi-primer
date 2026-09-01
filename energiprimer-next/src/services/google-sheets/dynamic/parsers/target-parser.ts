import { anchorsForKey } from "../anchor-detector";
import { unavailableValue } from "../confidence";
import { nearestRegion } from "../table-detector";
import { parseTargetNumber } from "../validators";
import { resolveAnchorValue } from "../value-resolver";
import { OFFICIAL_BIOMASS_TARGET } from "../../legacy-mapping/profiles";
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

function approvedFallbackTarget(year: number): TargetParseResult {
  return {
    target: {
      value: OFFICIAL_BIOMASS_TARGET,
      available: true,
      confidence: 0.7,
      level: "WARNING",
      source: null,
      status: "resolved",
      candidates: [],
      note: `Tabel Target ${year} tidak ditemukan; menggunakan fallback target resmi ${OFFICIAL_BIOMASS_TARGET} ton.`,
    },
    targetYear: year,
  };
}

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
  fallbackYear?: number,
): TargetParseResult {
  const matches = anchorsForKey(anchors, "biomassTarget");
  const explicitMatches = matches.filter((anchor) =>
    /\bTARGET\b.*\b20\d{2}\b/i.test(anchor.matchedLabel),
  );
  if (!explicitMatches.length) {
    if (fallbackYear && fallbackYear > 0)
      return approvedFallbackTarget(fallbackYear);
    return {
      target: unavailableValue("Target biomassa tidak ditemukan."),
      targetYear: null,
    };
  }

  const resolutions = explicitMatches.map((anchor) =>
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
    .map((resolution, index) => ({
      resolution,
      // `resolutions` is built from `explicitMatches`, not all `matches`.
      // Keep the anchor metadata aligned when a generic TARGET anchor appears
      // before a year-qualified TARGET anchor.
      anchor: explicitMatches[index],
    }))
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
      targetYear: targetYearFromAnchor(explicitMatches[0]),
    };
  }
  const [best] = available;
  return {
    target: best.resolution,
    targetYear: targetYearFromAnchor(best.anchor),
  };
}
