import {
  confidenceFromScore,
  confidenceLevel,
  resolvedSource,
  resolvedValue,
  scoreCandidate,
  unavailableValue,
} from "./confidence";
import { cellsAtRow, nonEmptyCells } from "./spreadsheet-scanner";
import {
  isCompatibleUnit,
  normalizedUnit,
  parseNumericValue,
  type NumericParseResult,
} from "./validators";
import type {
  DetectedAnchor,
  HeaderPath,
  ResolvedValue,
  ScannedCell,
  StructureAnalysis,
  TableRegion,
  ValueCandidate,
} from "./types";

function headerForColumn(
  structure: StructureAnalysis | undefined,
  column: number,
): HeaderPath | null {
  return (
    structure?.headerPaths.find((path) => path.cell.column === column) ?? null
  );
}

function nearbyUnit(
  cells: readonly ScannedCell[],
  candidate: ScannedCell,
  expectedUnits: readonly string[],
) {
  return (
    cellsAtRow(cells, candidate.row)
      .filter((cell) => Math.abs(cell.column - candidate.column) <= 6)
      .find((cell) =>
        isCompatibleUnit(normalizedUnit(cell.normalizedValue), expectedUnits),
      ) ?? null
  );
}

function candidateReasons(
  anchor: DetectedAnchor,
  cell: ScannedCell,
  header: HeaderPath | null,
  unitCell: ScannedCell | null,
  score: number,
) {
  const reasons: string[] = [];
  if (anchor.matchType === "exact") reasons.push("exact anchor");
  else if (anchor.matchType === "alias") reasons.push("alias anchor");
  else reasons.push(`${anchor.matchType} anchor`);
  if (cell.row === anchor.cell.row) reasons.push("same row");
  if (cell.column === anchor.cell.column) reasons.push("same column");
  if (
    Math.abs(cell.row - anchor.cell.row) <= 1 &&
    Math.abs(cell.column - anchor.cell.column) <= 4
  )
    reasons.push("adjacent");
  if (unitCell) reasons.push(`unit ${unitCell.normalizedValue}`);
  if (header?.unit) reasons.push(`header unit ${header.unit}`);
  if (header?.labels.length) reasons.push("compatible header context");
  reasons.push(`score ${Math.round(score)}`);
  return reasons;
}

export type ValueResolverOptions = {
  parse?: (raw: unknown) => NumericParseResult;
};

function makeCandidates(
  anchor: DetectedAnchor,
  region: TableRegion,
  structure?: StructureAnalysis,
  options: ValueResolverOptions = {},
): ValueCandidate[] {
  return nonEmptyCells(region.cells)
    .filter((cell) => cell.address !== anchor.cell.address)
    .map((cell) => {
      const parsed = (options.parse ?? parseNumericValue)(cell.rawValue);
      const header = headerForColumn(structure, cell.column);
      const unitCell = nearbyUnit(region.cells, cell, anchor.expectedUnits);
      const sameRow = cell.row === anchor.cell.row;
      const sameColumn = cell.column === anchor.cell.column;
      const distance =
        Math.abs(cell.row - anchor.cell.row) +
        Math.abs(cell.column - anchor.cell.column);
      const adjacent =
        Math.abs(cell.row - anchor.cell.row) <= 1 &&
        Math.abs(cell.column - anchor.cell.column) <= 4;
      const expectedUnit =
        Boolean(unitCell) ||
        Boolean(
          header?.unit && isCompatibleUnit(header.unit, anchor.expectedUnits),
        );
      const compatibleHeader = Boolean(
        header &&
        (header.labels.some((label) =>
          /VALUE|NILAI|TOTAL|REALISASI|TARGET|PEMAKAIAN|PENERIMAAN|STOK|HOP|SOLAR|BIOMASSA|BATUBARA/.test(
            label,
          ),
        ) ||
          header.unit !== null),
      );
      const score = scoreCandidate({
        matchType: anchor.matchType,
        sameRow,
        sameColumn,
        adjacent,
        expectedUnit,
        insideBoundary: true,
        numeric: parsed.status === "numeric",
        compatibleHeader,
        distance,
      });
      return {
        cell,
        value: parsed.value,
        status: parsed.status,
        score,
        reasons: candidateReasons(anchor, cell, header, unitCell, score),
        unit: unitCell?.normalizedValue ?? header?.unit ?? null,
        header,
      } satisfies ValueCandidate;
    })
    .filter((candidate) => candidate.status !== "empty")
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.cell.row - b.cell.row ||
        a.cell.column - b.cell.column,
    );
}

export function resolveAnchorValue(
  anchor: DetectedAnchor,
  region: TableRegion | null,
  worksheet: string,
  structure?: StructureAnalysis,
  options: ValueResolverOptions = {},
): ResolvedValue {
  if (!region)
    return unavailableValue(
      `Tidak ditemukan table boundary untuk anchor ${anchor.label}.`,
    );
  const candidates = makeCandidates(anchor, region, structure, options);
  const numeric = candidates.filter(
    (candidate) => candidate.status === "numeric" && candidate.value !== null,
  );
  if (!numeric.length) {
    const malformed = candidates.some(
      (candidate) => candidate.status === "malformed",
    );
    return {
      ...unavailableValue(
        malformed
          ? `Candidate untuk ${anchor.label} ditemukan tetapi nilainya malformed.`
          : `Nilai untuk ${anchor.label} tidak tersedia.`,
        candidates,
      ),
      status: malformed ? "malformed" : "missing",
    };
  }

  const best = numeric[0];
  const competing = numeric.filter(
    (candidate) =>
      candidate !== best &&
      best.score - candidate.score <= 4 &&
      candidate.value !== best.value,
  );
  if (competing.length) {
    return {
      value: null,
      available: false,
      confidence: confidenceFromScore(best.score),
      level: "UNRESOLVED",
      source: null,
      status: "ambiguous",
      candidates: numeric,
      note: `Beberapa candidate bernilai berbeda memiliki score berdekatan untuk ${anchor.label}.`,
    };
  }

  const confidence = confidenceFromScore(best.score);
  if (confidence < 0.7) {
    return {
      value: null,
      available: false,
      confidence,
      level: "UNRESOLVED",
      source: null,
      status: "ambiguous",
      candidates: numeric,
      note: `Confidence ${confidence.toFixed(2)} di bawah batas resolusi untuk ${anchor.label}.`,
    };
  }

  return resolvedValue(
    best.value as number,
    best.score,
    resolvedSource(worksheet, best.cell.address, anchor),
    numeric,
    confidenceLevel(confidence) === "WARNING"
      ? `Anchor ${anchor.label} terdeteksi melalui konteks dengan confidence warning.`
      : undefined,
  );
}

export function bestNumericCandidate(candidates: readonly ValueCandidate[]) {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.status === "numeric" && candidate.value !== null,
      )
      .sort((a, b) => b.score - a.score)[0] ?? null
  );
}
