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

const VALID_BB_WORKSHEET = /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\d{2}-BB$/;

function metadata(name: string): WorksheetMetadata | null {
  if (!VALID_BB_WORKSHEET.test(name)) return null;
  const match = name.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)(\d{2})-BB$/);
  if (!match) return null;
  const month = INDONESIAN_MONTH_NAMES.indexOf(match[1] as typeof INDONESIAN_MONTH_NAMES[number]) + 1;
  return {
    name,
    month,
    monthLabel: match[1],
    year: 2000 + Number(match[2]),
    isValid: true,
  };
}

export function parseBBWorksheetName(name: unknown): WorksheetMetadata | null {
  return typeof name === "string" ? metadata(name) : null;
}

export function isValidBBWorksheetName(name: unknown): name is string {
  return typeof name === "string" && metadata(name) !== null;
}

export function worksheetNameFor(month: number, year: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2099) return null;
  return `${INDONESIAN_MONTH_NAMES[month - 1]}${String(year).slice(-2)}-BB`;
}

export function resolveBBWorksheet(
  month: number,
  year: number,
  availableNames?: readonly string[],
): WorksheetResolution | null {
  const name = worksheetNameFor(month, year);
  if (!name) return null;
  const parsed = metadata(name);
  if (!parsed) return null;
  if (availableNames && !availableNames.some((candidate) => candidate === name)) return null;
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
    const candidate = resolveBBWorksheet(currentMonth, currentYear);
    if (candidate) result.push({ ...candidate, isFallback: true, fallbackIndex: index, requestedMonth: month, requestedYear: year });
  }
  return result;
}

export function validBBWorksheets(names: readonly string[]) {
  return names
    .map((name) => metadata(name))
    .filter((value): value is WorksheetMetadata => value !== null)
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

export function normalizeWorksheetName(name: string) {
  return normalizeCellText(name).replace(/\s+/g, "");
}

