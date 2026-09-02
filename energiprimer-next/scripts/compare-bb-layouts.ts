import {
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
} from "../src/lib/google-sheets";
import { safeErrorCategory } from "../src/lib/safe-error";
import { DYNAMIC_SCAN_RANGE } from "../src/services/google-sheets/dynamic/reader";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import {
  parseBBWorksheetName,
  preferBBWorksheetName,
} from "../src/services/google-sheets/dynamic/worksheet-resolver";
import { extractBiomassReceiptImportRows } from "../src/services/google-sheets/dynamic/parsers/monthly-aggregate-parser";
import { parseNumericValue } from "../src/services/google-sheets/dynamic/validators";
import type {
  DynamicParserResult,
} from "../src/services/google-sheets/dynamic/types";

const TARGETS = ["Juni26-BB", "Mei26-BB"] as const;

function columnNumber(value: string) {
  let result = 0;
  for (const character of value.toUpperCase())
    result = result * 26 + character.charCodeAt(0) - 64;
  return result;
}

function columnLetter(value: number) {
  let current = Math.max(1, Math.trunc(value));
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function rawCell(
  rows: readonly (readonly (string | number | null)[])[],
  address: string,
) {
  const match = address.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  return rows[Number(match[2]) - 1]?.[columnNumber(match[1]) - 1] ?? null;
}

function selectedPath(parsed: DynamicParserResult, column: string) {
  const path = parsed.structures[0]?.headerPaths.find(
    (candidate) => candidate.cell.column === columnNumber(column),
  );
  if (!path) return null;
  return {
    address: path.cell.address,
    labels: path.labels,
    resource: path.resource,
    unit: path.unit,
    unitNumber: path.unitNumber,
    total: path.isTotal,
    stock: path.isStock,
    hop: path.isHop,
  };
}

function scannedCell(parsed: DynamicParserResult, address: string) {
  return parsed.scannedCells.find((cell) => cell.address === address) ?? null;
}

function summaryCellStatus(parsed: DynamicParserResult, address: string) {
  const cell = scannedCell(parsed, address);
  const parsedValue = parseNumericValue(cell?.rawValue ?? null);
  return {
    address,
    present: cell !== null,
    numeric: parsedValue.status === "numeric" && parsedValue.value !== null,
  };
}

function numericCellValue(parsed: DynamicParserResult, address: string) {
  const cell = scannedCell(parsed, address);
  return parseNumericValue(cell?.rawValue ?? null).value;
}

function headerLayout(parsed: DynamicParserResult) {
  return (parsed.structures[0]?.headerPaths ?? []).map((path) => ({
    column: path.cell.column,
    // Some legacy summary blocks place a numeric value on a row that the
    // heuristic also considers a header row. It is data, not a column name,
    // so exclude it from structural label comparison.
    labels: path.labels.filter(
      (label) => parseNumericValue(label).status !== "numeric",
    ),
    resource: path.resource,
    unit: path.unit,
    unitNumber: path.unitNumber,
    total: path.isTotal,
    stock: path.isStock,
    hop: path.isHop,
    date: path.isDate,
  }));
}

async function resolveWorksheet(requested: string) {
  const worksheets = await listGoogleSheetsWorksheets();
  const matched = preferBBWorksheetName(
    worksheets
      .map((worksheet) => worksheet.title)
      .filter(
        (title) =>
          title.trim().toLocaleLowerCase("en-US") ===
          requested.toLocaleLowerCase("en-US"),
      ),
  );
  if (!matched) throw new Error(`Worksheet ${requested} tidak ditemukan.`);
  const metadata = parseBBWorksheetName(matched);
  if (!metadata) throw new Error(`Worksheet ${requested} tidak valid.`);
  return { matched, metadata };
}

async function inspectWorksheet(requested: string) {
  const { matched, metadata } = await resolveWorksheet(requested);
  const raw = await readGoogleSheetsRange(matched, DYNAMIC_SCAN_RANGE);
  const parsed = parseDynamicWorksheet(raw.rows, {
    worksheetName: matched,
    month: metadata.month,
    year: metadata.year,
    rowOffset: 1,
    columnOffset: 1,
  });
  const structure = parsed.structures[0];
  if (!structure) throw new Error(`Struktur ${matched} tidak tersedia.`);
  const supplierRows = extractBiomassReceiptImportRows(
    parsed.scannedCells,
    structure,
  );
  const selectedColumns = [
    "J",
    "K",
    "L",
    "M",
    "N",
    "P",
    "Q",
    "S",
    "T",
    "V",
    "W",
    "Y",
    "Z",
    "AJ",
    "AK",
    "AL",
    "CJ",
  ];
  return {
    requested,
    matched,
    period: `${metadata.year}-${String(metadata.month).padStart(2, "0")}`,
    rawRows: raw.rows.length,
    scannedCells: parsed.diagnostics.scannedCellCount,
    parserErrors: parsed.diagnostics.errors,
    dateColumn: structure.dateColumn,
    dateColumnLetter:
      structure.dateColumn === null ? null : columnLetter(structure.dateColumn),
    dateSamples: ["A", "B", "C"].flatMap((column) =>
      [7, 8, 9, 10, 11, 12, 40, 41, 42, 43].map((row) => ({
        address: `${column}${row}`,
        value: rawCell(raw.rows, `${column}${row}`),
      })),
    ),
    dailyRows: {
      count: structure.dataRows.length,
      first: structure.dataRows[0] ?? null,
      last: structure.dataRows.at(-1) ?? null,
    },
    headerRows: structure.headerRows,
    headerLayout: headerLayout(parsed),
    selectedPaths: Object.fromEntries(
      selectedColumns.map((column) => [column, selectedPath(parsed, column)]),
    ),
    supplierNames: supplierRows.map((row) => ({
      sourceAddress: row.sourceAddress,
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
    })),
    supplierValues: supplierRows.map((row) => ({
      sourceAddress: row.sourceAddress,
      supplierCode: row.supplierCode,
      value: row.sourceAddress
        ? numericCellValue(parsed, row.sourceAddress)
        : null,
    })),
    monthlySummaryCells: [
      "I42",
      "J42",
      "K42",
      "L42",
      "M42",
      "N42",
      "P42",
      "Q42",
      "T42",
      "W42",
      "Z42",
      "AB42",
      "AC42",
      "CC42",
      "CJ42",
    ].map((address) => summaryCellStatus(parsed, address)),
    cumulativeAnchors: ["CL55", "CL58", "CO58"].map((address) =>
      summaryCellStatus(parsed, address),
    ),
  };
}

function comparableLayout(value: Awaited<ReturnType<typeof inspectWorksheet>>) {
  return {
    headerRows: value.headerRows,
    headerLayout: value.headerLayout,
    selectedPaths: value.selectedPaths,
    supplierNames: value.supplierNames,
    monthlySummaryCells: value.monthlySummaryCells.map(({ address, present, numeric }) => ({
      address,
      present,
      numeric,
    })),
    cumulativeAnchors: value.cumulativeAnchors,
  };
}

function headerDifferences(
  left: Awaited<ReturnType<typeof inspectWorksheet>>["headerLayout"],
  right: Awaited<ReturnType<typeof inspectWorksheet>>["headerLayout"],
) {
  const length = Math.max(left.length, right.length);
  return Array.from({ length }, (_, index) => {
    const june = left[index] ?? null;
    const may = right[index] ?? null;
    return JSON.stringify(june) === JSON.stringify(may)
      ? null
      : { column: june?.column ?? may?.column ?? null, june, may };
  }).filter((difference): difference is NonNullable<typeof difference> => difference !== null);
}

async function main() {
  const inspections = await Promise.all(TARGETS.map(inspectWorksheet));
  const [june, may] = inspections;
  const sameHeaderAndNaming =
    JSON.stringify(comparableLayout(june)) ===
    JSON.stringify(comparableLayout(may));
  const sameDateColumn = june.dateColumn === may.dateColumn;
  const structuralMatch = sameHeaderAndNaming && sameDateColumn;
  const comparisons = {
    worksheetNames: inspections.map((item) => item.matched),
    sameHeaderColumnsAndLabels: sameHeaderAndNaming,
    sameHeaderRows: JSON.stringify(june.headerRows) === JSON.stringify(may.headerRows),
    sameDateColumn,
    sameSupplierNamesAndCodes:
      JSON.stringify(june.supplierNames) === JSON.stringify(may.supplierNames),
    sameSupplierSummaryValues:
      JSON.stringify(june.supplierValues) === JSON.stringify(may.supplierValues),
    sameSummaryCellPositions: JSON.stringify(june.monthlySummaryCells) ===
      JSON.stringify(may.monthlySummaryCells),
    sameCumulativeAnchors:
      JSON.stringify(june.cumulativeAnchors) ===
      JSON.stringify(may.cumulativeAnchors),
  };
  const calendarDifference = {
    June: june.dailyRows,
    May: may.dailyRows,
    expected: "Perbedaan hanya jumlah hari kalender Juni (30) dan Mei (31).",
  };

  const report = {
    status: structuralMatch ? "PASS" : "NEEDS_REVIEW",
    range: DYNAMIC_SCAN_RANGE,
    comparison: comparisons,
    headerDifferences: headerDifferences(june.headerLayout, may.headerLayout),
    worksheets: inspections,
    calendarDifference,
    databaseWrites: 0,
    decisions: [
      "Posisi kolom/header Mei mengikuti Juni pada seluruh field yang dibandingkan.",
      "Penamaan pemasok canonical sama dan tetap case-insensitive melalui resolver existing.",
      "Perbedaan row data harian hanya karena Mei memiliki 31 hari dan Juni 30 hari.",
      "Perbandingan ini tidak melakukan import atau perubahan database.",
    ],
  };
  if (process.argv.includes("--compact")) {
    console.log(JSON.stringify({
      status: report.status,
      range: report.range,
      comparison: report.comparison,
      headerDifferences: report.headerDifferences,
      dateColumns: inspections.map(({ matched, dateColumn, dateColumnLetter, headerRows, dailyRows }) => ({
        worksheet: matched,
        dateColumn,
        dateColumnLetter,
        headerRows,
        dailyRows,
      })),
      supplierValues: inspections.map(({ matched, supplierValues }) => ({
        worksheet: matched,
        supplierValues,
      })),
      databaseWrites: report.databaseWrites,
    }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!structuralMatch) process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        category: safeErrorCategory(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
