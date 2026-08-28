import { DAILY_TABLE_HINTS } from "./definitions/daily-table";
import { nonEmptyCells } from "./spreadsheet-scanner";
import { parseDayValue, parseNumericValue } from "./validators";
import type { HeaderPath, ScannedCell, StructureAnalysis, TableRegion } from "./types";

function rowValues(cells: readonly ScannedCell[], row: number) {
  return cells.filter((cell) => cell.row === row && cell.normalizedValue.length > 0);
}

function hasHeaderWord(value: string) {
  return DAILY_TABLE_HINTS.some((hint) => value.includes(hint));
}

function isResource(value: string): HeaderPath["resource"] {
  if (/(?:SOLAR|HSD)/.test(value)) return "solar";
  if (/(?:BIOMASSA|BIOMASS|SAWDUST|WOODCHIP|LRUK|SRF|BONGGOL)/.test(value)) return "biomass";
  if (/(?:BATUBARA|BATU BARA|COAL)/.test(value)) return "coal";
  return "unknown";
}

function extractUnitNumber(labels: readonly string[]) {
  for (const label of labels) {
    const direct = label.match(/\bUNIT\s*([123])\b/);
    if (direct) return Number(direct[1]);
    const reversed = label.match(/\b([123])\s*UNIT\b/);
    if (reversed) return Number(reversed[1]);
  }
  return null;
}

function buildHeaderPath(
  cells: readonly ScannedCell[],
  headerRows: readonly number[],
  column: number,
  startColumn: number,
  sampleRow: number,
): HeaderPath {
  const labels: string[] = [];
  for (const row of headerRows) {
    const sameRow = cells
      .filter((cell) => cell.row === row && cell.column <= column && cell.column >= startColumn && cell.normalizedValue.length > 0)
      .sort((a, b) => a.column - b.column);
    const nearest = sameRow.at(-1);
    if (nearest && !labels.includes(nearest.normalizedValue)) labels.push(nearest.normalizedValue);
  }
  const sameColumn = cells
    .filter((cell) => headerRows.includes(cell.row) && cell.column === column && cell.normalizedValue.length > 0)
    .map((cell) => cell.normalizedValue);
  for (const label of sameColumn) if (!labels.includes(label)) labels.push(label);

  const valueCell = cells.find((cell) => cell.row === sampleRow && cell.column === column)
    ?? cells.find((cell) => cell.column === column)
    ?? {
      row: sampleRow,
      column,
      address: `${column}:${sampleRow}`,
      rawValue: null,
      normalizedValue: "",
    };
  const allLabels = labels.join(" ");
  const resource = isResource(allLabels);
  const unit = labels.find((label) => /^(?:TON|TONASE|LITER|LITRE|HARI|DAYS|%)$/.test(label)) ?? null;
  return {
    cell: valueCell,
    labels,
    unit,
    resource,
    unitNumber: extractUnitNumber(labels),
    isTotal: /\bTOTAL\b/.test(allLabels),
    isStock: /\b(?:STOK|STOCK)\b/.test(allLabels),
    isHop: /\b(?:HOP|HARI OPERASI)\b/.test(allLabels),
    isDate: /\b(?:TANGGAL|TGL|DATE)\b/.test(allLabels),
  };
}

function chooseDateHeader(cells: readonly ScannedCell[]) {
  const exact = nonEmptyCells(cells)
    .filter((cell) => cell.normalizedValue === "TANGGAL")
    .sort((a, b) => a.row - b.row || a.column - b.column)[0];
  if (exact) return exact;
  return nonEmptyCells(cells)
    .filter((cell) => ["TGL", "DATE"].includes(cell.normalizedValue))
    .sort((a, b) => a.row - b.row || a.column - b.column)[0] ?? null;
}

function findHeaderRows(cells: readonly ScannedCell[], dateHeader: ScannedCell | null) {
  if (!dateHeader) return [];
  const rows = new Set<number>([dateHeader.row]);
  const minRow = Math.max(1, dateHeader.row - 3);
  for (let row = minRow; row <= dateHeader.row + 3; row += 1) {
    const values = rowValues(cells, row);
    const textCount = values.filter((cell) =>
      typeof cell.rawValue === "string" && parseNumericValue(cell.rawValue).status !== "numeric",
    ).length;
    const hintCount = values.filter((cell) => hasHeaderWord(cell.normalizedValue)).length;
    if (row <= dateHeader.row + 2 && (hintCount >= 1 || textCount >= 3)) rows.add(row);
  }
  return [...rows].sort((a, b) => a - b);
}

function findDateColumn(cells: readonly ScannedCell[], headerRows: readonly number[], dateHeader: ScannedCell | null) {
  if (!dateHeader) return null;
  const candidateColumns = new Set<number>([dateHeader.column]);
  for (const row of headerRows) {
    for (const cell of rowValues(cells, row)) {
      if (["TANGGAL", "TGL", "DATE"].includes(cell.normalizedValue)) candidateColumns.add(cell.column);
    }
  }
  const dataRows = [...new Set(cells.map((cell) => cell.row))].filter((row) => !headerRows.includes(row));
  const scored = [...candidateColumns].map((column) => ({
    column,
    count: dataRows.filter((row) => {
      const cell = cells.find((candidate) => candidate.row === row && candidate.column === column);
      return cell ? parseDayValue(cell.rawValue) !== null : false;
    }).length,
  }));
  return scored.sort((a, b) => b.count - a.count)[0]?.column ?? dateHeader.column;
}

export function analyzeTableStructure(
  cells: readonly ScannedCell[],
  region?: TableRegion,
): StructureAnalysis {
  const source = region?.cells ?? nonEmptyCells(cells);
  const dateHeader = chooseDateHeader(source);
  const headerRows = findHeaderRows(source, dateHeader);
  const dateColumn = findDateColumn(source, headerRows, dateHeader);
  const rows = [...new Set(source.map((cell) => cell.row))].sort((a, b) => a - b);
  const dataRows = rows.filter((row) => {
    if (headerRows.includes(row) || dateColumn === null) return false;
    const dateCell = source.find((cell) => cell.row === row && cell.column === dateColumn);
    return dateCell ? parseDayValue(dateCell.rawValue) !== null : false;
  });
  const sampleRow = dataRows[0] ?? dateHeader?.row ?? 1;
  const columns = [...new Set(source.map((cell) => cell.column))].sort((a, b) => a - b);
  const startColumn = region?.startColumn ?? columns[0] ?? 1;
  const headerPaths = columns.map((column) => buildHeaderPath(source, headerRows, column, startColumn, sampleRow));
  return { headerRows, headerPaths, dataRows, dateColumn };
}

export function headerPathForColumn(
  structure: StructureAnalysis,
  column: number,
): HeaderPath | null {
  return structure.headerPaths.find((path) => path.cell.column === column) ?? null;
}

export function resourceColumns(
  structure: StructureAnalysis,
  resource: HeaderPath["resource"],
  unitNumber?: number,
) {
  return structure.headerPaths.filter((path) =>
    path.resource === resource
    && (unitNumber === undefined || path.unitNumber === unitNumber),
  );
}

export function describeStructure(structure: StructureAnalysis) {
  return structure.headerPaths.map((path) => ({
    column: path.cell.column,
    labels: path.labels,
    resource: path.resource,
    unitNumber: path.unitNumber,
    unit: path.unit,
    total: path.isTotal,
    stock: path.isStock,
    hop: path.isHop,
    date: path.isDate,
  }));
}
