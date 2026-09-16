import type { CanonicalDate } from "./types";

export type CanonicalDateStatus = "VALID" | "AMBIGUOUS" | "REJECTED";

export type CanonicalDateResult = {
  status: CanonicalDateStatus;
  value: CanonicalDate | null;
  rawDisplayValue: string | null;
  reason: string | null;
};

export function parseCanonicalDate(
  raw: unknown,
  options: { month?: number; year?: number; locale?: "ID" } = {},
): CanonicalDateResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { status: "REJECTED", value: null, rawDisplayValue: null, reason: "Date is empty." };
  }
  const rawDisplayValue = String(raw);
  const text = rawDisplayValue.trim();
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dateParts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/u);
    if (dateParts) {
      if (!options.locale) {
        return {
          status: "AMBIGUOUS",
          value: null,
          rawDisplayValue,
          reason: "Slash dates require an approved locale/date mapping.",
        };
      }
      day = Number(dateParts[1]);
      month = Number(dateParts[2]);
      year = dateParts[3].length === 2 ? 2000 + Number(dateParts[3]) : Number(dateParts[3]);
    } else if (/^\d{1,2}$/u.test(text) && options.month && options.year) {
      day = Number(text);
      month = options.month;
      year = options.year;
    }
  }
  if (year === null || month === null || day === null) {
    return { status: "REJECTED", value: null, rawDisplayValue, reason: "Date format is not supported." };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { status: "REJECTED", value: null, rawDisplayValue, reason: "Date is invalid." };
  }
  if (
    (options.month !== undefined && month !== options.month) ||
    (options.year !== undefined && year !== options.year)
  ) {
    return { status: "REJECTED", value: null, rawDisplayValue, reason: "Date is outside the approved period." };
  }
  return {
    status: "VALID",
    value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as CanonicalDate,
    rawDisplayValue,
    reason: null,
  };
}
