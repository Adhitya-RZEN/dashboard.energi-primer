import {
  dateFromRaw,
  isValidDateForPeriod,
  parseNumericValue,
} from "../validators";
import { orderedUnitPaths } from "../structure-analyzer";
import type {
  DynamicDailyRecord,
  HeaderPath,
  ScannedCell,
  StructureAnalysis,
} from "../types";

export type DailyParseResult = {
  series: DynamicDailyRecord[];
  columns: {
    date: number | null;
    coal: number | null;
    biomassUnit1: number | null;
    biomassUnit2: number | null;
    biomassUnit3: number | null;
    coalUnit1: number | null;
    coalUnit2: number | null;
    coalUnit3: number | null;
    stock: number | null;
    hop1: number | null;
    hop2: number | null;
    hop3: number | null;
    solar: number | null;
    solarReceipt: number | null;
  };
  warnings: string[];
};

function cellAt(
  cells: readonly ScannedCell[],
  row: number,
  column: number | null,
) {
  return column === null
    ? null
    : (cells.find((cell) => cell.row === row && cell.column === column) ??
        null);
}

function numberAt(
  cells: readonly ScannedCell[],
  row: number,
  column: number | null,
) {
  const cell = cellAt(cells, row, column);
  return cell ? parseNumericValue(cell.rawValue).value : null;
}

function sumNullable(values: readonly (number | null)[]) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function usableScore(
  path: HeaderPath,
  dataRows: readonly number[],
  cells: readonly ScannedCell[],
) {
  const numericCount = dataRows.filter((row) => {
    const cell = cellAt(cells, row, path.cell.column);
    return cell && parseNumericValue(cell.rawValue).status === "numeric";
  }).length;
  return (
    numericCount * 10 + (path.unit ? 5 : 0) + (path.labels.length > 1 ? 2 : 0)
  );
}

function choosePath(
  paths: readonly HeaderPath[],
  dataRows: readonly number[],
  cells: readonly ScannedCell[],
  predicate: (path: HeaderPath) => boolean,
) {
  return (
    paths
      .filter(predicate)
      .sort(
        (a, b) =>
          usableScore(b, dataRows, cells) - usableScore(a, dataRows, cells) ||
          a.cell.column - b.cell.column,
      )[0] ?? null
  );
}

function unitPath(
  structure: StructureAnalysis,
  resource: HeaderPath["resource"],
  unitNumber: number,
  cells: readonly ScannedCell[],
) {
  const candidates = orderedUnitPaths(structure, resource);
  const direct = candidates.filter(
    (path) =>
      path.unit === "TON" &&
      !path.labels.some((label) =>
        /BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(label),
      ),
  );
  // Older/canonical sheets can expose `TON` on only one of the three
  // columns. A partial TON subset is not a complete unit mapping, so use the
  // ordered unit candidates in that case.
  const usable = direct.length >= 3
    ? direct
    : candidates.filter(
        (path) =>
          !path.labels.some((label) =>
            /BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(label),
          ),
      );
  const explicit = usable.filter((path) => path.unitNumber === unitNumber);
  const selected =
    (explicit.length > 1 ? usable[unitNumber - 1] : explicit[0]) ??
    usable[unitNumber - 1] ??
    usable[0] ??
    null;
  return selected
    ? choosePath([selected], structure.dataRows, cells, () => true)
    : null;
}

function hopPath(
  structure: StructureAnalysis,
  unitNumber: number,
  cells: readonly ScannedCell[],
) {
  const orderedUnknownHops = orderedUnitPaths(structure, "unknown", {
    hop: true,
  });
  const hopCandidates = (orderedUnknownHops.length
    ? orderedUnknownHops
    : structure.headerPaths.filter(
        (path) => path.isHop && path.unitNumber !== null,
      )
  ).sort((a, b) => a.cell.column - b.cell.column);
  const explicit = hopCandidates.filter(
    (path) => path.unitNumber === unitNumber,
  );
  const selected =
    (explicit.length > 1 ? hopCandidates[unitNumber - 1] : explicit[0]) ??
    hopCandidates[unitNumber - 1] ??
    null;
  return selected
    ? choosePath([selected], structure.dataRows, cells, () => true)
    : null;
}

function dailyRecord(
  cells: readonly ScannedCell[],
  row: number,
  columns: DailyParseResult["columns"],
  month: number,
  year: number,
): DynamicDailyRecord | null {
  const dateCell = cellAt(cells, row, columns.date);
  const rawDay = dateCell?.rawValue;
  const date = dateFromRaw(rawDay, month, year);
  const parsedDay =
    rawDay === undefined
      ? null
      : (() => {
          const text = String(rawDay)
            .trim()
            .match(/^(\d{1,2})/);
          const value = text
            ? Number(text[1])
            : typeof rawDay === "number"
              ? Math.trunc(rawDay)
              : null;
          return value !== null && value >= 1 && value <= 31 ? value : null;
        })();
  // A rollover (for example 31 June becoming 1 July) is source evidence,
  // not a date to silently move into this worksheet's period. Exclude it
  // from canonical daily rows while preserving the source for audit output.
  if (
    date === null ||
    parsedDay === null ||
    !isValidDateForPeriod(date, month, year)
  )
    return null;

  const biomassUnit1 = numberAt(cells, row, columns.biomassUnit1);
  const biomassUnit2 = numberAt(cells, row, columns.biomassUnit2);
  const biomassUnit3 = numberAt(cells, row, columns.biomassUnit3);
  return {
    date,
    day: parsedDay,
    coal: numberAt(cells, row, columns.coal),
    biomass: sumNullable([biomassUnit1, biomassUnit2, biomassUnit3]),
    coalUnit1: numberAt(cells, row, columns.coalUnit1),
    coalUnit2: numberAt(cells, row, columns.coalUnit2),
    coalUnit3: numberAt(cells, row, columns.coalUnit3),
    biomassUnit1,
    biomassUnit2,
    biomassUnit3,
    stock: numberAt(cells, row, columns.stock),
    hop1: numberAt(cells, row, columns.hop1),
    hop2: numberAt(cells, row, columns.hop2),
    hop3: numberAt(cells, row, columns.hop3),
    solar: numberAt(cells, row, columns.solar),
    solarReceipt: numberAt(cells, row, columns.solarReceipt),
  };
}

export function parseDailyTable(
  cells: readonly ScannedCell[],
  structure: StructureAnalysis,
  month: number,
  year: number,
): DailyParseResult {
  const paths = structure.headerPaths;
  const biomass = [1, 2, 3].map((unit) =>
    unitPath(structure, "biomass", unit, cells),
  );
  const coal = [1, 2, 3].map((unit) =>
    unitPath(structure, "coal", unit, cells),
  );
  const hop = [1, 2, 3].map((unit) => hopPath(structure, unit, cells));
  const coalTotal = choosePath(
    paths,
    structure.dataRows,
    cells,
    (path) =>
      path.resource === "coal" && path.isTotal && !path.isStock && !path.isHop,
  );
  const stockCandidates = paths.filter(
    (path) => path.resource === "coal" && path.isStock,
  );
  const stock = choosePath(
    stockCandidates.filter((path) =>
      path.labels.some((label) => /STOK AKHIR|STOCK AKHIR/.test(label)),
    ).length
      ? stockCandidates.filter((path) =>
          path.labels.some((label) => /STOK AKHIR|STOCK AKHIR/.test(label)),
        )
      : stockCandidates,
    structure.dataRows,
    cells,
    () => true,
  );
  const solar = choosePath(
    paths,
    structure.dataRows,
    cells,
    (path) => path.resource === "solar" && path.isTotal,
  );
  const solarReceipt = choosePath(
    paths,
    structure.dataRows,
    cells,
    (path) =>
      path.resource === "solar" &&
      path.labels.some((label) =>
        /TOP UP|INPUT|PENERIMAAN|RECEIPT/.test(label),
      ),
  );

  const columns = {
    date: structure.dateColumn,
    coal: coalTotal?.cell.column ?? null,
    biomassUnit1: biomass[0]?.cell.column ?? null,
    biomassUnit2: biomass[1]?.cell.column ?? null,
    biomassUnit3: biomass[2]?.cell.column ?? null,
    coalUnit1: coal[0]?.cell.column ?? null,
    coalUnit2: coal[1]?.cell.column ?? null,
    coalUnit3: coal[2]?.cell.column ?? null,
    stock: stock?.cell.column ?? null,
    hop1: hop[0]?.cell.column ?? null,
    hop2: hop[1]?.cell.column ?? null,
    hop3: hop[2]?.cell.column ?? null,
    solar: solar?.cell.column ?? null,
    solarReceipt: solarReceipt?.cell.column ?? null,
  } satisfies DailyParseResult["columns"];
  const warnings: string[] = [];
  const missing = Object.entries(columns)
    .filter(([key, value]) => value === null && key !== "solarReceipt")
    .map(([key]) => key);
  if (missing.length)
    warnings.push(
      `Kolom semantic daily tidak ditemukan: ${missing.join(", ")}.`,
    );
  const series = structure.dataRows
    .map((row) => dailyRecord(cells, row, columns, month, year))
    .filter((record): record is DynamicDailyRecord => record !== null);
  return { series, columns, warnings };
}
