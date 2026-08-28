import type { DynamicFieldKey, DynamicParserResult, ResolvedValue } from "./types";

export type LegacyBaseline = Partial<Record<DynamicFieldKey, number | null>> & {
  daily?: Partial<{
    day: number;
    coal: number | null;
    biomass: number | null;
    stock: number | null;
    solar: number | null;
    biomassUnit1: number | null;
    biomassUnit2: number | null;
    biomassUnit3: number | null;
    coalUnit1: number | null;
    coalUnit2: number | null;
    coalUnit3: number | null;
    hop1: number | null;
    hop2: number | null;
    hop3: number | null;
  }>;
};

export type ComparisonStatus = "PASS" | "MISMATCH" | "UNRESOLVED" | "MISSING";

export type ComparisonRow = {
  field: string;
  legacyValue: number | null;
  dynamicValue: number | null;
  difference: number | null;
  confidence: number;
  source: string | null;
  status: ComparisonStatus;
  note?: string;
};

export type ComparisonResult = {
  rows: readonly ComparisonRow[];
  pass: boolean;
  mismatchCount: number;
  unresolvedCount: number;
};

function equalValue(left: number | null, right: number | null, tolerance: number) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= tolerance;
}

function compareValue(
  field: string,
  legacyValue: number | null,
  resolved: ResolvedValue | undefined,
  tolerance: number,
): ComparisonRow {
  if (!resolved || !resolved.available || resolved.value === null) {
    return {
      field,
      legacyValue,
      dynamicValue: resolved?.value ?? null,
      difference: null,
      confidence: resolved?.confidence ?? 0,
      source: resolved?.source?.address ?? null,
      status: resolved?.status === "missing" ? "MISSING" : "UNRESOLVED",
      note: resolved?.note,
    };
  }
  const difference = legacyValue === null ? null : resolved.value - legacyValue;
  const pass = equalValue(legacyValue, resolved.value, tolerance);
  return {
    field,
    legacyValue,
    dynamicValue: resolved.value,
    difference,
    confidence: resolved.confidence,
    source: resolved.source?.address ?? null,
    status: pass ? "PASS" : "MISMATCH",
    note: resolved.note,
  };
}

export function compareLegacyDynamic(
  result: DynamicParserResult,
  baseline: LegacyBaseline,
  tolerance = 0.001,
): ComparisonResult {
  const rows: ComparisonRow[] = [];
  for (const field of Object.keys(baseline) as Array<DynamicFieldKey | "daily">) {
    if (field === "daily") continue;
    const legacyValue = baseline[field];
    if (legacyValue === undefined || typeof legacyValue !== "number" && legacyValue !== null) continue;
    rows.push(compareValue(field, legacyValue, result.normalized.metrics[field], tolerance));
  }
  if (baseline.daily) {
    const point = result.normalized.series.find((candidate) => candidate.day === baseline.daily?.day);
    const dailyFields = [
      "coal", "biomass", "stock", "solar",
      "biomassUnit1", "biomassUnit2", "biomassUnit3",
      "coalUnit1", "coalUnit2", "coalUnit3",
      "hop1", "hop2", "hop3",
    ] as const;
    for (const field of dailyFields) {
      const legacyValue = baseline.daily[field] ?? null;
      const dynamicValue = point?.[field] ?? null;
      const pass = point ? equalValue(legacyValue, dynamicValue, tolerance) : false;
      rows.push({
        field: `daily.${field}`,
        legacyValue,
        dynamicValue,
        difference: legacyValue === null || dynamicValue === null ? null : dynamicValue - legacyValue,
        confidence: point ? 0.95 : 0,
        source: point?.date ?? null,
        status: pass ? "PASS" : point ? "MISMATCH" : "UNRESOLVED",
        note: point ? undefined : `Tanggal ${baseline.daily.day} tidak ditemukan.`,
      });
    }
  }
  const mismatchCount = rows.filter((row) => row.status === "MISMATCH").length;
  const unresolvedCount = rows.filter((row) => row.status === "UNRESOLVED" || row.status === "MISSING").length;
  return { rows, pass: mismatchCount === 0 && unresolvedCount === 0, mismatchCount, unresolvedCount };
}
