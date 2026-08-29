import { normalizeCellText } from "./spreadsheet-scanner";
import type { CandidateStatus, DynamicSheetValue } from "./types";

export type NumericParseResult = {
  value: number | null;
  status: CandidateStatus;
  isPercent: boolean;
};

const EMPTY_MARKERS = new Set(["-", "–", "—", "N/A", "NA", "NULL", ""]);

export function parseNumericValue(raw: unknown): NumericParseResult {
  if (raw === null || raw === undefined)
    return { value: null, status: "empty", isPercent: false };
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? { value: raw, status: "numeric", isPercent: false }
      : { value: null, status: "malformed", isPercent: false };
  }

  let text = String(raw)
    .normalize("NFKC")
    .replace(/[\u00a0\u2007\u202f\s]/g, "")
    .trim();
  if (EMPTY_MARKERS.has(text.toUpperCase()))
    return { value: null, status: "empty", isPercent: false };
  if (/^#(?:DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!|NULL!?)$/i.test(text)) {
    return { value: null, status: "malformed", isPercent: false };
  }

  const isPercent = text.endsWith("%");
  text = text.replace(/%$/, "");
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (!/^[+-]?[\d.,]+$/.test(text))
    return { value: null, status: "malformed", isPercent };

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) normalized = text.replace(/\./g, "").replace(",", ".");
    else normalized = text.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = text.replace(",", ".");
  } else if (dot >= 0 && text.split(".").at(-1)?.length === 3) {
    normalized = text.replace(/\./g, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value))
    return { value: null, status: "malformed", isPercent };
  return { value: negative ? -value : value, status: "numeric", isPercent };
}

export function parseTargetNumber(raw: unknown): NumericParseResult {
  if (typeof raw === "string") {
    const text = raw.trim().replace(/[\s\u00a0]/g, "");
    if (/^[+-]?\d{1,3}[.,]\d{3}$/.test(text)) {
      const value = Number(text.replace(/[.,]/g, ""));
      return {
        value,
        status: Number.isFinite(value) ? "numeric" : "malformed",
        isPercent: false,
      };
    }
  }
  return parseNumericValue(raw);
}

export function parseDayValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "")
    return null;
  if (typeof raw === "number")
    return raw >= 1 && raw <= 31 ? Math.trunc(raw) : null;
  const text = String(raw).trim();
  const iso = text.match(/^\d{4}[-/]\d{1,2}[-/](\d{1,2})/);
  if (iso)
    return Number(iso[1]) >= 1 && Number(iso[1]) <= 31 ? Number(iso[1]) : null;
  const date = text.match(/^(\d{1,2})(?:\s|[-/])/);
  if (!date)
    return /^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31
      ? Number(text)
      : null;
  const day = Number(date[1]);
  return day >= 1 && day <= 31 ? day : null;
}

export function dateFromRaw(
  raw: unknown,
  month: number,
  year: number,
): string | null {
  const day = parseDayValue(raw);
  if (day === null) return null;
  if (typeof raw === "string") {
    const iso = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso)
      return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const slash = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (slash) {
      const fullYear =
        slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
      return `${fullYear}-${String(Number(slash[2])).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizedUnit(raw: unknown): string | null {
  const value = normalizeCellText(raw);
  if (!value) return null;
  if (value === "TONASE") return "TON";
  if (value === "LITRE") return "LITER";
  if (value === "DAYS") return "HARI";
  return value;
}

export function isCompatibleUnit(
  actual: string | null,
  expected: readonly string[],
): boolean {
  if (!actual || !expected.length) return false;
  const normalizedActual = normalizedUnit(actual);
  return expected.some((unit) => normalizedUnit(unit) === normalizedActual);
}

export function validateUnit(
  raw: DynamicSheetValue,
  expected: readonly string[],
) {
  return isCompatibleUnit(normalizedUnit(raw), expected);
}
