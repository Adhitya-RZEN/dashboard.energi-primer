import { normalizeCellText } from "./spreadsheet-scanner";
import type { ScannedCell, SemanticTableKind, TableRegion } from "./types";

function hasAny(values: readonly string[], patterns: readonly string[]) {
  return patterns.some((pattern) => values.some((value) => value.includes(pattern)));
}

export function classifyTable(cells: readonly ScannedCell[]): SemanticTableKind {
  const values = cells.map((cell) => normalizeCellText(cell.rawValue));
  const hasDashboard = values.some((value) => value === "DASHBOARD")
    && hasAny(values, ["SATUAN", "SUMBER DATA", "STATUS"]);
  if (hasDashboard) return "dashboard";

  const hasDate = hasAny(values, ["TANGGAL", "TGL", "DATE"]);
  const hasDailySignal = hasAny(values, ["UNIT 1", "UNIT 2", "UNIT 3", "HOP", "STOK", "TOTAL"]);
  if (hasDate && hasDailySignal) return "daily";

  if (hasAny(values, ["TARGET PEMAKAIAN BIOMASSA", "TARGET BIOMASSA"]) || values.some((value) => /^TARGET\s+\d{4}$/.test(value))) {
    return "target";
  }

  if (hasAny(values, ["KUMULATIF PEMAKAIAN BIOMASSA"]) || values.some((value) => /^(?:TOTAL|PEMAKAIAN)\s+\d{4}$/.test(value))) {
    return "historical";
  }

  return "unknown";
}

export function classifyRegions(regions: readonly TableRegion[]): TableRegion[] {
  return regions.map((region) => {
    const inferred = classifyTable(region.cells);
    return inferred === "unknown" || inferred === region.kind
      ? region
      : { ...region, kind: inferred };
  });
}

