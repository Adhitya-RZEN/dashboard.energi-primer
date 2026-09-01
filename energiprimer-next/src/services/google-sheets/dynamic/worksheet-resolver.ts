import { normalizeCellText } from "./spreadsheet-scanner";
import type { WorksheetMetadata, WorksheetResolution } from "./types";

export const INDONESIAN_MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/**
 * Accepted month tokens are deliberately explicit. This keeps a malformed
 * or unrelated worksheet from being treated as a BB period by guessing from
 * a prefix. The list includes the variants found in the legacy workbook,
 * plus the common Indonesian abbreviations.
 */
const MONTH_TOKENS = [
  ["Januari", "Jan"],
  ["Februari", "Feb"],
  ["Maret", "Mar"],
  ["April", "Apr"],
  ["Mei"],
  ["Juni", "Jun"],
  ["Juli", "Jul", "July"],
  ["Agustus", "Agus", "Agust", "Agu"],
  ["September", "Sep", "Sept"],
  ["Oktober", "Okt", "Oct"],
  ["November", "Nov"],
  ["Desember", "Des"],
] as const;

const BB_WORKSHEET_PATTERN = /^([A-Za-z]+)\s*(\d{2})\s*-\s*BB$/i;

type MonthTokenMetadata = {
  month: number;
  canonicalLabel: (typeof INDONESIAN_MONTH_NAMES)[number];
  variant: "FULL" | "ABBREVIATED";
};

const monthTokenMetadata = new Map<string, MonthTokenMetadata>();
for (const [monthIndex, tokens] of MONTH_TOKENS.entries()) {
  for (const [tokenIndex, token] of tokens.entries()) {
    monthTokenMetadata.set(token.toLocaleLowerCase("en-US"), {
      month: monthIndex + 1,
      canonicalLabel: INDONESIAN_MONTH_NAMES[monthIndex],
      variant: tokenIndex === 0 ? "FULL" : "ABBREVIATED",
    });
  }
}

function compactWorksheetName(name: string) {
  return name.trim().replace(/\s+/g, "").toLocaleLowerCase("en-US");
}

function metadata(name: string): WorksheetMetadata | null {
  const match = name.trim().match(BB_WORKSHEET_PATTERN);
  if (!match) return null;
  const token = monthTokenMetadata.get(match[1].toLocaleLowerCase("en-US"));
  if (!token) return null;
  const yearSuffix = match[2];
  const canonicalName = `${token.canonicalLabel}${yearSuffix}-BB`;
  return {
    name,
    month: token.month,
    monthLabel: token.canonicalLabel,
    year: 2000 + Number(yearSuffix),
    isValid: true,
    canonicalName,
    nameVariant: token.variant,
  };
}

export function parseBBWorksheetName(name: unknown): WorksheetMetadata | null {
  return typeof name === "string" ? metadata(name) : null;
}

export function isValidBBWorksheetName(name: unknown): name is string {
  return typeof name === "string" && metadata(name) !== null;
}

export function worksheetNameFor(month: number, year: number) {
  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2099
  )
    return null;
  return `${INDONESIAN_MONTH_NAMES[month - 1]}${String(year).slice(-2)}-BB`;
}

/**
 * Lower values are preferred when more than one title represents the same
 * period. The exact canonical spelling wins, followed by another full-month
 * spelling, then an abbreviated spelling.
 */
export function worksheetNamePriority(name: string) {
  const parsed = metadata(name);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  if (name === parsed.canonicalName) return 0;
  return parsed.nameVariant === "FULL" ? 1 : 2;
}

export function compareBBWorksheetNames(left: string, right: string) {
  const priorityDifference =
    worksheetNamePriority(left) - worksheetNamePriority(right);
  if (priorityDifference !== 0) return priorityDifference;

  const normalizedDifference = compactWorksheetName(left).localeCompare(
    compactWorksheetName(right),
    "en-US",
  );
  if (normalizedDifference !== 0) return normalizedDifference;
  return left.localeCompare(right, "en-US");
}

/** Selects one valid worksheet title, preferring the canonical full spelling. */
export function preferBBWorksheetName(names: readonly string[]) {
  const validNames = names.filter((name) => metadata(name) !== null);
  if (validNames.length === 0) return null;
  return [...validNames].sort(compareBBWorksheetNames)[0] ?? null;
}

export function resolveBBWorksheet(
  month: number,
  year: number,
  availableNames?: readonly string[],
): WorksheetResolution | null {
  const canonicalName = worksheetNameFor(month, year);
  if (!canonicalName) return null;

  const name = availableNames
    ? preferBBWorksheetName(
        availableNames.filter((candidate) => {
          const parsedCandidate = metadata(candidate);
          return (
            parsedCandidate?.month === month && parsedCandidate.year === year
          );
        }),
      )
    : canonicalName;
  if (!name) return null;
  const parsed = metadata(name);
  if (!parsed) return null;
  return {
    ...parsed,
    requestedMonth: month,
    requestedYear: year,
    isFallback: false,
    fallbackIndex: 0,
  };
}

export function previousValidBBWorksheets(
  month: number,
  year: number,
  max = 12,
  availableNames?: readonly string[],
): WorksheetResolution[] {
  const result: WorksheetResolution[] = [];
  let currentMonth = month;
  let currentYear = year;
  for (let index = 1; index <= Math.max(0, max); index += 1) {
    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }
    const candidate = resolveBBWorksheet(
      currentMonth,
      currentYear,
      availableNames,
    );
    if (candidate)
      result.push({
        ...candidate,
        isFallback: true,
        fallbackIndex: index,
        requestedMonth: month,
        requestedYear: year,
      });
  }
  return result;
}

export function validBBWorksheets(names: readonly string[]) {
  return names
    .map((name) => metadata(name))
    .filter((value): value is WorksheetMetadata => value !== null)
    .sort(
      (a, b) =>
        a.year - b.year ||
        a.month - b.month ||
        compareBBWorksheetNames(a.name, b.name),
    );
}

export function normalizeWorksheetName(name: string) {
  return normalizeCellText(name).replace(/\s+/g, "");
}
