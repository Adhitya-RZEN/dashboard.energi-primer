import type { DynamicSheetRow, DynamicSheetValue, ScannedCell } from "./types";

export type SpreadsheetScanOptions = {
  rowOffset?: number;
  columnOffset?: number;
};

export function normalizeCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKC")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function columnToLetters(column: number): string {
  if (!Number.isInteger(column) || column < 1) return "";
  let current = column;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function cellAddress(row: number, column: number): string {
  return `${columnToLetters(column)}${row}`;
}

function safeValue(value: unknown): DynamicSheetValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

export function scanSpreadsheet(
  rows: readonly DynamicSheetRow[],
  options: SpreadsheetScanOptions = {},
): ScannedCell[] {
  const rowOffset = options.rowOffset ?? 1;
  const columnOffset = options.columnOffset ?? 1;
  const cells: ScannedCell[] = [];

  rows.forEach((row, rowIndex) => {
    row.forEach((rawValue, columnIndex) => {
      const rowNumber = rowIndex + rowOffset;
      const columnNumber = columnIndex + columnOffset;
      const value = safeValue(rawValue);
      cells.push({
        row: rowNumber,
        column: columnNumber,
        address: cellAddress(rowNumber, columnNumber),
        rawValue: value,
        normalizedValue: normalizeCellText(value),
      });
    });
  });

  return cells;
}

export function nonEmptyCells(cells: readonly ScannedCell[]): ScannedCell[] {
  return cells.filter((cell) => cell.normalizedValue.length > 0);
}

export function cellsAtRow(
  cells: readonly ScannedCell[],
  row: number,
): ScannedCell[] {
  return cells.filter(
    (cell) => cell.row === row && cell.normalizedValue.length > 0,
  );
}

export function cellsAtColumn(
  cells: readonly ScannedCell[],
  column: number,
): ScannedCell[] {
  return cells.filter(
    (cell) => cell.column === column && cell.normalizedValue.length > 0,
  );
}

export function cellMap(
  cells: readonly ScannedCell[],
): Map<string, ScannedCell> {
  return new Map(cells.map((cell) => [`${cell.row}:${cell.column}`, cell]));
}
