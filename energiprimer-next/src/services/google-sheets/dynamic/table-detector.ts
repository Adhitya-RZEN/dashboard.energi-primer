import { nonEmptyCells } from "./spreadsheet-scanner";
import type {
  DetectedAnchor,
  ScannedCell,
  SemanticTableKind,
  TableRegion,
} from "./types";

function distance(a: DetectedAnchor, b: DetectedAnchor) {
  return (
    Math.abs(a.cell.row - b.cell.row) + Math.abs(a.cell.column - b.cell.column)
  );
}

function withinAnchorBand(
  anchor: DetectedAnchor,
  group: readonly DetectedAnchor[],
) {
  return group.some(
    (candidate) =>
      Math.abs(anchor.cell.row - candidate.cell.row) <= 30 &&
      Math.abs(anchor.cell.column - candidate.cell.column) <= 24,
  );
}

function rowHasCellInBand(
  cells: readonly ScannedCell[],
  row: number,
  startColumn: number,
  endColumn: number,
) {
  return cells.some(
    (cell) =>
      cell.row === row &&
      cell.normalizedValue.length > 0 &&
      cell.column >= startColumn &&
      cell.column <= endColumn,
  );
}

function expandRowEnd(
  cells: readonly ScannedCell[],
  initialEnd: number,
  startColumn: number,
  endColumn: number,
) {
  let end = initialEnd;
  let emptyRows = 0;
  for (let row = initialEnd + 1; row <= initialEnd + 80; row += 1) {
    if (rowHasCellInBand(cells, row, startColumn, endColumn)) {
      end = row;
      emptyRows = 0;
    } else {
      emptyRows += 1;
      if (emptyRows >= 2) break;
    }
  }
  return end;
}

function expandRowStart(
  cells: readonly ScannedCell[],
  initialStart: number,
  startColumn: number,
  endColumn: number,
) {
  let start = initialStart;
  let emptyRows = 0;
  for (
    let row = initialStart - 1;
    row >= Math.max(1, initialStart - 30);
    row -= 1
  ) {
    if (rowHasCellInBand(cells, row, startColumn, endColumn)) {
      start = row;
      emptyRows = 0;
    } else {
      emptyRows += 1;
      if (emptyRows >= 2) break;
    }
  }
  return start;
}

function columnBand(
  cells: readonly ScannedCell[],
  anchors: readonly DetectedAnchor[],
): { start: number; end: number } {
  const anchorColumn = anchors[0]?.cell.column ?? 1;
  const rowStart = Math.min(...anchors.map((anchor) => anchor.cell.row));
  const rowEnd = Math.max(...anchors.map((anchor) => anchor.cell.row));
  const nearby = nonEmptyCells(cells).filter(
    (cell) =>
      cell.row >= rowStart - 1 &&
      cell.row <= rowEnd + 1 &&
      Math.abs(cell.column - anchorColumn) <= 12,
  );

  const frequency = new Map<number, number>();
  for (const cell of nearby)
    frequency.set(cell.column, (frequency.get(cell.column) ?? 0) + 1);
  const frequentColumns = [...frequency.entries()]
    .filter(([, count]) => count >= 2)
    .map(([column]) => column);
  const columns = frequentColumns.length
    ? frequentColumns
    : nearby.map((cell) => cell.column);
  const start = Math.min(
    anchorColumn,
    ...(columns.length ? columns : [anchorColumn]),
  );
  const end = Math.max(
    anchorColumn,
    ...(columns.length ? columns : [anchorColumn]),
  );
  return { start: Math.max(1, start), end };
}

function titleForRegion(
  cells: readonly ScannedCell[],
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number,
) {
  const titleCell = nonEmptyCells(cells)
    .filter(
      (cell) =>
        cell.row >= startRow &&
        cell.row <= endRow &&
        cell.column >= startColumn &&
        cell.column <= endColumn,
    )
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .find(
      (cell) =>
        typeof cell.rawValue === "string" && !/^\d/.test(cell.normalizedValue),
    );
  return titleCell?.normalizedValue ?? null;
}

function makeRegion(
  id: string,
  kind: SemanticTableKind,
  group: readonly DetectedAnchor[],
  cells: readonly ScannedCell[],
): TableRegion {
  const band = columnBand(cells, group);
  const startRow = expandRowStart(
    cells,
    Math.min(...group.map((anchor) => anchor.cell.row)),
    band.start - 1,
    band.end + 1,
  );
  const endRow = expandRowEnd(
    cells,
    Math.max(...group.map((anchor) => anchor.cell.row)),
    band.start - 1,
    band.end + 1,
  );
  const selected = nonEmptyCells(cells).filter(
    (cell) =>
      cell.row >= startRow &&
      cell.row <= endRow &&
      cell.column >= Math.max(1, band.start - 1) &&
      cell.column <= band.end + 1,
  );
  return {
    id,
    kind,
    startRow,
    endRow,
    startColumn: Math.max(1, band.start - 1),
    endColumn: band.end + 1,
    cells: selected,
    anchors: group,
    title: titleForRegion(
      selected,
      startRow,
      endRow,
      Math.max(1, band.start - 1),
      band.end + 1,
    ),
    confidence: Math.min(0.99, 0.58 + group.length * 0.04),
  };
}

function findGroups(
  anchors: readonly DetectedAnchor[],
  kind: SemanticTableKind,
) {
  const remaining = anchors
    .filter((anchor) => anchor.tableKind === kind)
    .sort((a, b) => a.cell.row - b.cell.row || a.cell.column - b.cell.column);
  const groups: DetectedAnchor[][] = [];
  for (const anchor of remaining) {
    const group = groups.find((candidate) =>
      withinAnchorBand(anchor, candidate),
    );
    if (group) group.push(anchor);
    else groups.push([anchor]);
  }
  return groups;
}

export function detectTableRegions(
  cells: readonly ScannedCell[],
  anchors: readonly DetectedAnchor[],
): TableRegion[] {
  const regions: TableRegion[] = [];
  const dashboardHeader = anchors.filter(
    (anchor) => anchor.key === "dashboardHeader",
  );
  const dashboardGroup = dashboardHeader.length
    ? anchors.filter(
        (anchor) =>
          anchor.tableKind === "dashboard" &&
          withinAnchorBand(anchor, dashboardHeader),
      )
    : findGroups(anchors, "dashboard").flat();
  if (dashboardGroup.length) {
    regions.push(makeRegion("dashboard-1", "dashboard", dashboardGroup, cells));
  }

  const dailyAnchors = anchors.filter((anchor) => anchor.tableKind === "daily");
  const dailyGroups = findGroups(dailyAnchors, "daily");
  for (const [index, group] of dailyGroups.entries()) {
    regions.push(makeRegion(`daily-${index + 1}`, "daily", group, cells));
  }

  for (const kind of ["target", "historical"] as const) {
    const groups = findGroups(anchors, kind);
    for (const [index, group] of groups.entries()) {
      regions.push(makeRegion(`${kind}-${index + 1}`, kind, group, cells));
    }
  }

  if (!regions.length && anchors.length) {
    const group = anchors.slice(0, 1);
    regions.push(makeRegion("unknown-1", "unknown", group, cells));
  }

  return regions.filter(
    (region, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.kind === region.kind &&
          candidate.startRow === region.startRow &&
          candidate.endRow === region.endRow &&
          candidate.startColumn === region.startColumn &&
          candidate.endColumn === region.endColumn,
      ) === index,
  );
}

export function cellsInRegion(
  cells: readonly ScannedCell[],
  region: TableRegion,
): ScannedCell[] {
  return cells.filter(
    (cell) =>
      cell.row >= region.startRow &&
      cell.row <= region.endRow &&
      cell.column >= region.startColumn &&
      cell.column <= region.endColumn,
  );
}

export function nearestRegion(
  regions: readonly TableRegion[],
  anchor: DetectedAnchor,
  preferredKind?: SemanticTableKind,
): TableRegion | null {
  const candidates = regions
    .filter((region) => !preferredKind || region.kind === preferredKind)
    .filter(
      (region) =>
        anchor.cell.row >= region.startRow - 1 &&
        anchor.cell.row <= region.endRow + 1 &&
        anchor.cell.column >= region.startColumn - 2 &&
        anchor.cell.column <= region.endColumn + 2,
    );
  return (
    candidates.sort((a, b) => {
      const aDistance =
        Math.abs(anchor.cell.row - (a.startRow + a.endRow) / 2) +
        Math.abs(anchor.cell.column - (a.startColumn + a.endColumn) / 2);
      const bDistance =
        Math.abs(anchor.cell.row - (b.startRow + b.endRow) / 2) +
        Math.abs(anchor.cell.column - (b.startColumn + b.endColumn) / 2);
      return aDistance - bDistance;
    })[0] ?? null
  );
}

export function anchorDistance(a: DetectedAnchor, b: DetectedAnchor) {
  return distance(a, b);
}
