import type {
  AnchorMatchType,
  ConfidenceLevel,
  DetectedAnchor,
  ResolvedSource,
  ResolvedValue,
  ValueCandidate,
} from "./types";

export type CandidateScoreInput = {
  matchType: AnchorMatchType;
  sameRow?: boolean;
  sameColumn?: boolean;
  adjacent?: boolean;
  expectedUnit?: boolean;
  insideBoundary?: boolean;
  numeric?: boolean;
  compatibleHeader?: boolean;
  distance?: number;
  conflict?: boolean;
};

export function scoreCandidate(input: CandidateScoreInput) {
  let score = input.matchType === "exact"
    ? 40
    : input.matchType === "alias"
      ? 30
      : input.matchType === "context"
        ? 20
        : 15;
  if (input.sameRow) score += 15;
  if (input.sameColumn) score += 15;
  if (input.adjacent) score += 20;
  if (input.expectedUnit) score += 15;
  if (input.insideBoundary) score += 20;
  if (input.numeric) score += 10;
  if (input.compatibleHeader) score += 20;
  if (input.distance) score -= Math.min(25, input.distance * 0.5);
  if (input.conflict) score -= 20;
  return Math.max(0, score);
}

export function confidenceFromScore(score: number): number {
  return Math.min(0.99, Math.max(0, score / 120));
}

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return "HIGH";
  if (confidence >= 0.7) return "WARNING";
  return "UNRESOLVED";
}

export function resolvedSource(sheet: string, address: string, anchor: DetectedAnchor): ResolvedSource {
  return { sheet, address, anchor: anchor.cell.address };
}

export function unavailableValue(
  note: string,
  candidates: readonly ValueCandidate[] = [],
): ResolvedValue {
  return {
    value: null,
    available: false,
    confidence: 0,
    level: "UNRESOLVED",
    source: null,
    status: "missing",
    candidates,
    note,
  };
}

export function resolvedValue(
  value: number,
  score: number,
  source: ResolvedSource,
  candidates: readonly ValueCandidate[],
  note?: string,
): ResolvedValue {
  const confidence = confidenceFromScore(score);
  return {
    value,
    available: true,
    confidence,
    level: confidenceLevel(confidence),
    source,
    status: "resolved",
    candidates,
    note,
  };
}

