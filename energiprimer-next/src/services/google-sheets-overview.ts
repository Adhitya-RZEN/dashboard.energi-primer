import "server-only";

import type {
  OverviewData,
  OverviewDailyPoint,
  OverviewHopRow,
  OverviewMetric,
  OverviewQuery,
  OverviewUnitValue,
} from "@/types/overview";
import {
  readGoogleSheetsRange,
  type GoogleSheetRow,
} from "@/lib/google-sheets";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;
const DATA_RANGE = "B11:CO59";
const ROW_TOTAL_INDEX = 31;
const ROW_BIOMASSA_RECEIPT_INDEX = 41;
const ROW_TARGET_INDEX = 45;
const ROW_CUMULATIVE_INDEX = 48;
const TARGET_FALLBACK = 70_020;

const COL = {
  biomassReceipt: 17,
  biomassConsumption: 27,
  biomassUnit1: 18,
  biomassUnit2: 21,
  biomassUnit3: 24,
  coalReceipt: 7,
  coalConsumption: 26,
  coalUnit1: 17,
  coalUnit2: 20,
  coalUnit3: 23,
  stock: 28,
  hop3: 34,
  hop2: 35,
  hop1: 36,
  solarDaily: 86,
  solarReceipt: 79,
  cumulative: 91,
} as const;

type SheetRow = GoogleSheetRow;

async function readSheet(month: number, year: number): Promise<{ worksheet: string; rows: SheetRow[] }> {
  const worksheet = `${MONTH_NAMES[month - 1]}${String(year).slice(-2)}-BB`;
  const result = await readGoogleSheetsRange(worksheet, DATA_RANGE);
  return { worksheet: result.worksheet, rows: result.rows };
}

function parseDay(raw: SheetRow[number]) {
  if (raw === null || String(raw).trim() === "") return null;
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    const day = Number(raw);
    return day >= 1 && day <= 31 ? day : null;
  }
  const match = String(raw).trim().match(/^(\d{1,2})(?:\s|[-/])/);
  const day = match ? Number(match[1]) : null;
  return day && day >= 1 && day <= 31 ? day : null;
}

function numericValue(row: SheetRow, index: number) {
  const raw = row[index];
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  let cleaned = String(raw).trim().replace(/[\s\u00a0]/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    cleaned = comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (comma >= 0) {
    cleaned = cleaned.replace(",", ".");
  } else if (dot >= 0 && cleaned.split(".").at(-1)?.length === 3) {
    cleaned = cleaned.replace(/\./g, "");
  }
  return Number.isFinite(Number(cleaned)) ? Number(cleaned) : 0;
}

function nullableValue(row: SheetRow, index: number) {
  const raw = row[index];
  if (raw === null || raw === undefined || String(raw).trim() === "" || ["-", "–", "—"].includes(String(raw).trim())) return null;
  return numericValue(row, index);
}

function sumNullable(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

function statusForHop(value: number) {
  if (value < 10) return { status: "danger" as const, label: "Kritis" };
  if (value < 15) return { status: "warning" as const, label: "Perhatian" };
  return { status: "success" as const, label: "Aman" };
}

function metric(value: number, unit: string, source: string): OverviewMetric {
  return { value, unit, source, available: true };
}

function unavailableMetric(unit: string, source: string, note: string): OverviewMetric {
  return { value: null, unit, source, available: false, note };
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1]} ${year}`;
}

function buildSeries(rows: SheetRow[], month: number, year: number): OverviewDailyPoint[] {
  return rows.slice(0, ROW_TOTAL_INDEX).flatMap((row) => {
    const day = parseDay(row[0]);
    if (!day) return [];
    const biomass = sumNullable([nullableValue(row, COL.biomassUnit1), nullableValue(row, COL.biomassUnit2), nullableValue(row, COL.biomassUnit3)]);
    return [{
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      coal: nullableValue(row, COL.coalConsumption),
      biomass,
      coalUnit1: nullableValue(row, COL.coalUnit1),
      coalUnit2: nullableValue(row, COL.coalUnit2),
      coalUnit3: nullableValue(row, COL.coalUnit3),
      biomassUnit1: nullableValue(row, COL.biomassUnit1),
      biomassUnit2: nullableValue(row, COL.biomassUnit2),
      biomassUnit3: nullableValue(row, COL.biomassUnit3),
      stock: nullableValue(row, COL.stock),
      hop1: nullableValue(row, COL.hop1),
      hop2: nullableValue(row, COL.hop2),
      hop3: nullableValue(row, COL.hop3),
      solar: nullableValue(row, COL.solarDaily),
      solarReceipt: nullableValue(row, COL.solarReceipt),
    }];
  });
}

function buildGoogleData(query: OverviewQuery, worksheet: string, rows: SheetRow[], isFallback: boolean, requestedMonthLabel: string, requestedQuery = query): OverviewData {
  if (rows.length === 0) {
    const note = `Worksheet ${worksheet} tidak mengembalikan baris data.`;
    return {
      query: requestedQuery,
      period: {
        monthLabel: `${MONTH_NAMES[query.month - 1]} ${query.year}`,
        requestedMonthLabel,
        isFallback,
        fallbackNotice: isFallback ? `Data ${requestedMonthLabel} belum tersedia. Worksheet ${worksheet} kosong.` : null,
        focusDate: null,
        focusDateLabel: "Tanggal tidak tersedia",
      },
      source: {
        label: "Google Sheets API v4",
        worksheetEquivalent: worksheet,
        note,
      },
      metrics: {
        biomassReceiptMonthly: unavailableMetric("ton", `${worksheet} · S42`, note),
        biomassConsumptionMonthly: unavailableMetric("ton", `${worksheet} · AC42`, note),
        coalConsumptionMonthly: unavailableMetric("ton", `${worksheet} · AB42`, note),
        coalStock: { ...unavailableMetric("ton", `${worksheet} · AD harian`, note), progressPercent: null },
        solarConsumptionMonthly: unavailableMetric("liter", `${worksheet} · CJ42`, note),
        solarReceiptMonthly: unavailableMetric("liter", `${worksheet} · CC42`, note),
        biomassCumulative: unavailableMetric("ton", `${worksheet} · CO59`, note),
        biomassTargetProgress: unavailableMetric("%", `${worksheet} · CO56/CO59`, note),
        coalReceiptMonthly: unavailableMetric("ton", `${worksheet} · I42`, note),
        solarConsumptionDaily: unavailableMetric("liter", `${worksheet} · CJ harian`, note),
      },
      biomassDaily: [],
      coalDaily: [],
      hop: null,
      target: null,
      series: [],
      hasData: false,
    };
  }

  const totalRow = rows[ROW_TOTAL_INDEX] ?? [];
  const receiptRow = rows[ROW_BIOMASSA_RECEIPT_INDEX] ?? [];
  const targetRow = rows[ROW_TARGET_INDEX] ?? [];
  const cumulativeRow = rows[ROW_CUMULATIVE_INDEX] ?? [];
  const targetDay = query.day ?? new Date().getUTCDate();
  const dailyRows = rows.slice(0, ROW_TOTAL_INDEX);
  const exactRow = dailyRows.find((row) => parseDay(row[0]) === targetDay);
  const dailyRow = exactRow ?? [...dailyRows].reverse().find((row) => parseDay(row[0]) !== null) ?? [];
  const actualDay = parseDay(dailyRow[0]) ?? targetDay;
  const actualDate = `${query.year}-${String(query.month).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
  const stockValue = numericValue(dailyRow, COL.stock);
  const hopValues = [numericValue(dailyRow, COL.hop1), numericValue(dailyRow, COL.hop2), numericValue(dailyRow, COL.hop3)];
  const targetRaw = numericValue(targetRow, COL.cumulative);
  const target = targetRaw > 0 && targetRaw < 1000 && /^\d{1,3}[.,]\d{3}$/.test(String(targetRow[COL.cumulative] ?? ""))
    ? Number(String(targetRow[COL.cumulative]).replace(/[.,]/g, ""))
    : (targetRaw > 0 ? targetRaw : TARGET_FALLBACK);
  const cumulative = numericValue(cumulativeRow, COL.cumulative);
  const progress = target > 0 ? Math.min(100, (cumulative / target) * 100) : 0;
  const hopRows: OverviewHopRow[] = [
    ["Unit 1", hopValues[0]], ["Unit 2", hopValues[1]], ["Unit 3", hopValues[2]],
  ].map(([unit, value]) => ({ unit: unit as string, value: value as number, ...statusForHop(value as number) }));
  const series = buildSeries(rows, query.month, query.year);
  const biomassDaily: OverviewUnitValue[] = [
    ["Unit 1", nullableValue(dailyRow, COL.biomassUnit1)],
    ["Unit 2", nullableValue(dailyRow, COL.biomassUnit2)],
    ["Unit 3", nullableValue(dailyRow, COL.biomassUnit3)],
  ].map(([unit, value]) => ({ unit: unit as string, value: value as number | null }));
  const coalDaily: OverviewUnitValue[] = [
    ["Unit 1", nullableValue(dailyRow, COL.coalUnit1)],
    ["Unit 2", nullableValue(dailyRow, COL.coalUnit2)],
    ["Unit 3", nullableValue(dailyRow, COL.coalUnit3)],
  ].map(([unit, value]) => ({ unit: unit as string, value: value as number | null }));
  const stockMetric = metric(stockValue, "ton", `Google Sheets ${worksheet} · AD baris harian`);

  return {
    query: requestedQuery,
    period: {
      monthLabel: `${MONTH_NAMES[query.month - 1]} ${query.year}`,
      requestedMonthLabel,
      isFallback,
      fallbackNotice: isFallback ? `Data ${requestedMonthLabel} belum tersedia. Menampilkan data terakhir dari worksheet ${worksheet}.` : null,
      focusDate: actualDate,
      focusDateLabel: dateLabel(actualDate),
    },
    source: { label: "Google Sheets API v4", worksheetEquivalent: worksheet, note: "Parser TypeScript mengikuti range, indeks kolom, fallback target, dan formula Laravel Overview." },
    metrics: {
      biomassReceiptMonthly: metric(numericValue(receiptRow, COL.biomassReceipt), "ton", `Google Sheets ${worksheet} · S42`),
      biomassConsumptionMonthly: metric(numericValue(totalRow, COL.biomassConsumption), "ton", `Google Sheets ${worksheet} · AC42`),
      coalConsumptionMonthly: metric(numericValue(totalRow, COL.coalConsumption), "ton", `Google Sheets ${worksheet} · AB42`),
      coalStock: { ...stockMetric, progressPercent: Math.min(100, Math.round((stockValue / 70_000) * 100)) },
      solarConsumptionMonthly: metric(numericValue(totalRow, COL.solarDaily), "liter", `Google Sheets ${worksheet} · CJ42`),
      solarReceiptMonthly: metric(numericValue(totalRow, COL.solarReceipt), "liter", `Google Sheets ${worksheet} · CC42`),
      biomassCumulative: metric(cumulative, "ton", `Google Sheets ${worksheet} · CO59`),
      biomassTargetProgress: metric(progress, "%", `Google Sheets ${worksheet} · CO56/CO59`),
      coalReceiptMonthly: metric(numericValue(totalRow, COL.coalReceipt), "ton", `Google Sheets ${worksheet} · I42`),
      solarConsumptionDaily: metric(nullableValue(dailyRow, COL.solarDaily) ?? 0, "liter", `Google Sheets ${worksheet} · CJ baris harian`),
    },
    biomassDaily,
    coalDaily,
    hop: hopRows,
    target: { target, cumulative, remaining: Math.max(0, target - cumulative), progress },
    series,
    hasData: rows.length > 0,
  };
}

export function isGoogleSheetsOverviewConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim()
    && process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim(),
  );
}

export async function getGoogleSheetsOverviewData(query: OverviewQuery): Promise<OverviewData> {
  const requestedMonthLabel = `${MONTH_NAMES[query.month - 1]} ${query.year}`;
  try {
    const sheet = await readSheet(query.month, query.year);
    return buildGoogleData(query, sheet.worksheet, sheet.rows, false, requestedMonthLabel);
  } catch (error) {
    let month = query.month;
    let year = query.year;
    for (let index = 0; index < 12; index += 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      try {
        const sheet = await readSheet(month, year);
        return buildGoogleData({ month, year, day: null }, sheet.worksheet, sheet.rows, true, requestedMonthLabel, query);
      } catch {
        continue;
      }
    }
    throw error;
  }
}
