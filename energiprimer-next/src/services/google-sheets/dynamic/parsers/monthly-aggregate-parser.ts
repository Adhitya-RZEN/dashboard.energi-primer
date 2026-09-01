import { unavailableValue } from "../confidence";
import { parseNumericValue } from "../validators";
import { normalizeSupplierIdentity } from "../../legacy-mapping/profiles";
import type {
  DynamicSemanticAggregates,
  HeaderPath,
  ResolvedValue,
  ScannedCell,
  StructureAnalysis,
} from "../types";

type MonthlyAggregateSpec = {
  label: string;
  columns: readonly number[];
  emptyNote: string;
};

type ReceiptSupplierColumn = {
  code: string;
  name: string;
  kind: "CANONICAL" | "PATTERN";
  confidence: "HIGH" | "MEDIUM";
  column: number;
};

export type BiomassReceiptImportRow = {
  supplierCode: string;
  supplierName: string;
  value: number | null;
  status: "numeric" | "empty" | "malformed";
  sourceRow: number | null;
  sourceColumn: number;
  sourceAddress: string | null;
};

function cellAt(cells: readonly ScannedCell[], row: number, column: number) {
  return (
    cells.find((cell) => cell.row === row && cell.column === column) ?? null
  );
}

function isSummaryMarker(cell: ScannedCell) {
  return /^(?:TOTAL|TOTAL\s+(?:BULANAN|MONTHLY))$/.test(cell.normalizedValue);
}

function summaryMarkers(
  cells: readonly ScannedCell[],
  structure: StructureAnalysis,
) {
  const dateColumn = structure.dateColumn;
  const minColumn = dateColumn === null ? 1 : Math.max(1, dateColumn - 3);
  const maxColumn = dateColumn === null ? 8 : dateColumn + 3;
  return cells.filter(
    (cell) =>
      cell.column >= minColumn &&
      cell.column <= maxColumn &&
      isSummaryMarker(cell),
  );
}

function numericCoverage(
  cells: readonly ScannedCell[],
  row: number,
  columns: readonly number[],
) {
  return columns.reduce((count, column) => {
    const cell = cellAt(cells, row, column);
    return (
      count +
      (cell && parseNumericValue(cell.rawValue).status === "numeric" ? 1 : 0)
    );
  }, 0);
}

function columnNumericCoverage(
  cells: readonly ScannedCell[],
  rows: readonly number[],
  column: number,
) {
  return rows.reduce((count, row) => {
    const cell = cellAt(cells, row, column);
    return count + (cell && parseNumericValue(cell.rawValue).status === "numeric" ? 1 : 0);
  }, 0);
}

function chooseSummaryMarker(
  cells: readonly ScannedCell[],
  structure: StructureAnalysis,
  columns: readonly number[],
) {
  return (
    summaryMarkers(cells, structure)
      .map((marker) => ({
        marker,
        coverage: numericCoverage(cells, marker.row, columns),
      }))
      .filter(({ coverage }) => coverage > 0)
      .sort(
        (a, b) =>
          b.coverage - a.coverage ||
          a.marker.row - b.marker.row ||
          a.marker.column - b.marker.column,
      )[0]?.marker ?? null
  );
}

function aggregateFromSummaryRow(
  cells: readonly ScannedCell[],
  worksheet: string,
  marker: ScannedCell | null,
  spec: MonthlyAggregateSpec,
): ResolvedValue {
  if (!marker || !spec.columns.length) {
    return unavailableValue(spec.emptyNote);
  }

  const numericCells: ScannedCell[] = [];
  const malformedCells: ScannedCell[] = [];
  for (const column of spec.columns) {
    const cell = cellAt(cells, marker.row, column);
    const parsed = parseNumericValue(cell?.rawValue);
    if (parsed.status === "numeric" && cell) numericCells.push(cell);
    if (parsed.status === "malformed" && cell) malformedCells.push(cell);
  }

  const sourceAddresses = [...numericCells, ...malformedCells].map(
    (cell) => cell.address,
  );
  const source = numericCells[0] ?? malformedCells[0] ?? null;
  if (!numericCells.length && malformedCells.length) {
    return {
      value: null,
      available: false,
      confidence: 0,
      level: "UNRESOLVED",
      source: source
        ? { sheet: worksheet, address: source.address, anchor: marker.address }
        : null,
      status: "malformed",
      candidates: [],
      sourceAddresses,
      note: `${spec.label} memiliki nilai malformed pada ${malformedCells.map((cell) => cell.address).join(", ")}.`,
    };
  }

  if (!numericCells.length) {
    return {
      ...unavailableValue(
        `${spec.label} tidak memiliki nilai numerik pada baris ${marker.address}.`,
      ),
      source: {
        sheet: worksheet,
        address: marker.address,
        anchor: marker.address,
      },
    };
  }

  const value = numericCells.reduce(
    (sum, cell) => sum + (parseNumericValue(cell.rawValue).value ?? 0),
    0,
  );
  const emptyCount =
    spec.columns.length - numericCells.length - malformedCells.length;
  const malformedNote = malformedCells.length
    ? ` ${malformedCells.length} cell malformed diabaikan.`
    : "";
  return {
    value,
    available: true,
    confidence: 0.95,
    level: "HIGH",
    source: {
      sheet: worksheet,
      address: numericCells[0].address,
      anchor: marker.address,
    },
    status: "resolved",
    candidates: [],
    sourceAddresses,
    note:
      `${spec.label} dijumlahkan dari ${numericCells.length} kolom semantic pada baris ${marker.address}.` +
      (emptyCount > 0
        ? ` ${emptyCount} kolom kosong diperlakukan sebagai tidak tersedia.`
        : "") +
      malformedNote,
  };
}

function aggregateFromDataRows(
  cells: readonly ScannedCell[],
  worksheet: string,
  rows: readonly number[],
  spec: MonthlyAggregateSpec,
): ResolvedValue {
  if (!rows.length || !spec.columns.length) {
    return unavailableValue(spec.emptyNote);
  }

  const numericCells: ScannedCell[] = [];
  const malformedCells: ScannedCell[] = [];
  for (const row of rows) {
    for (const column of spec.columns) {
      const cell = cellAt(cells, row, column);
      const parsed = parseNumericValue(cell?.rawValue);
      if (parsed.status === "numeric" && cell) numericCells.push(cell);
      if (parsed.status === "malformed" && cell) malformedCells.push(cell);
    }
  }

  const sourceCells = [...numericCells, ...malformedCells];
  if (!numericCells.length && malformedCells.length) {
    return {
      value: null,
      available: false,
      confidence: 0,
      level: "UNRESOLVED",
      source: sourceCells[0]
        ? {
            sheet: worksheet,
            address: sourceCells[0].address,
            anchor: sourceCells[0].address,
          }
        : null,
      status: "malformed",
      candidates: [],
      sourceAddresses: sourceCells.map((cell) => cell.address),
      note: `${spec.label} memiliki nilai malformed pada ${malformedCells.map((cell) => cell.address).join(", ")}.`,
    };
  }

  if (!numericCells.length) {
    return unavailableValue(
      `${spec.label} tidak memiliki nilai numerik pada baris data tabel.`,
    );
  }

  const value = numericCells.reduce(
    (sum, cell) => sum + (parseNumericValue(cell.rawValue).value ?? 0),
    0,
  );
  const first = numericCells[0];
  const last = numericCells[numericCells.length - 1];
  const malformedNote = malformedCells.length
    ? ` ${malformedCells.length} cell malformed diabaikan.`
    : "";
  return {
    value,
    available: true,
    confidence: 0.9,
    level: "HIGH",
    source: {
      sheet: worksheet,
      address: first.address,
      anchor: `${first.address}..${last.address}`,
    },
    status: "resolved",
    candidates: [],
    sourceAddresses: sourceCells.map((cell) => cell.address),
    note: `${spec.label} dihitung dengan menjumlahkan ${numericCells.length} cell numerik dari baris data tabel.${malformedNote}`,
  };
}

function isSupplierBiomassPath(path: HeaderPath) {
  return (
    path.resource === "biomass" &&
    path.labels.some((label) =>
      /\bPENERIMAAN\b|\bRECEIPT\b|\bINCOMING\b/.test(label),
    ) &&
    path.unit !== "LITER" &&
    path.unitNumber === null &&
    !path.isTotal &&
    !path.isStock &&
    !path.isHop &&
    !path.labels.some((label) =>
      /\bUNIT\s*[123]\b|BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(
        label,
      ),
    )
  );
}

function supplierIdentity(path: HeaderPath) {
  for (const label of [...path.labels].reverse()) {
    const identity = normalizeSupplierIdentity(label);
    if (identity) return identity;
  }
  return normalizeSupplierIdentity(path.labels.join(" "));
}

function supplierColumns(
  structure: StructureAnalysis,
  cells: readonly ScannedCell[],
): ReceiptSupplierColumn[] {
  const candidates = structure.headerPaths
    .flatMap((path) => {
      if (!isSupplierBiomassPath(path)) return [];
      const identity = supplierIdentity(path);
      return identity
        ? [{
            code: identity.code,
            name: identity.name,
            kind: identity.kind,
            confidence: identity.confidence,
            column: path.cell.column,
          }]
        : [];
    });

  const grouped = new Map<string, ReceiptSupplierColumn[]>();
  for (const candidate of candidates) {
    const values = grouped.get(candidate.code) ?? [];
    values.push(candidate);
    grouped.set(candidate.code, values);
  }

  // A worksheet can repeat the same supplier in a detail and a summary
  // block. Pick one physical column deterministically instead of double
  // counting it: canonical names win, then numeric coverage, then leftmost.
  const deduplicated = [...grouped.values()].map((group) =>
    [...group].sort(
      (a, b) =>
        Number(b.kind === "CANONICAL") - Number(a.kind === "CANONICAL") ||
        columnNumericCoverage(cells, structure.dataRows, b.column) -
          columnNumericCoverage(cells, structure.dataRows, a.column) ||
        a.column - b.column,
    )[0],
  );

  // Some workbook versions contain a second summary block with abbreviated
  // supplier labels and the same values as the detailed receipt block. Keep
  // the most complete physical supplier block so those values are not summed
  // twice. If no canonical block exists, pattern-based supplier columns are
  // still retained for legacy worksheets.
  const blocks: ReceiptSupplierColumn[][] = [];
  for (const candidate of deduplicated.sort((a, b) => a.column - b.column)) {
    const current = blocks.at(-1);
    if (!current || candidate.column - current.at(-1)!.column > 4)
      blocks.push([candidate]);
    else current.push(candidate);
  }
  const selectedBlock = blocks.sort((a, b) => {
    const canonicalA = a.filter((candidate) => candidate.kind === "CANONICAL").length;
    const canonicalB = b.filter((candidate) => candidate.kind === "CANONICAL").length;
    const coverageA = a.reduce(
      (total, candidate) =>
        total + columnNumericCoverage(cells, structure.dataRows, candidate.column),
      0,
    );
    const coverageB = b.reduce(
      (total, candidate) =>
        total + columnNumericCoverage(cells, structure.dataRows, candidate.column),
      0,
    );
    return canonicalB - canonicalA || b.length - a.length || coverageB - coverageA ||
      a[0].column - b[0].column;
  })[0];
  return selectedBlock ?? [];
}

function unitColumns(columns: {
  biomassUnit1: number | null;
  biomassUnit2: number | null;
  biomassUnit3: number | null;
}) {
  return [
    columns.biomassUnit1,
    columns.biomassUnit2,
    columns.biomassUnit3,
  ].filter((column): column is number => column !== null);
}

function supplierImportValue(
  cells: readonly ScannedCell[],
  rows: readonly number[],
  column: number,
): Omit<BiomassReceiptImportRow, "supplierCode" | "supplierName" | "sourceColumn"> {
  const matching = rows
    .map((row) => cellAt(cells, row, column))
    .filter((cell): cell is ScannedCell => cell !== null);
  const malformed = matching.filter(
    (cell) => parseNumericValue(cell.rawValue).status === "malformed",
  );
  const numeric = matching.filter(
    (cell) => parseNumericValue(cell.rawValue).status === "numeric",
  );
  if (!numeric.length && malformed.length) {
    return {
      value: null,
      status: "malformed",
      sourceRow: malformed[0].row,
      sourceAddress: malformed[0].address,
    };
  }
  if (!numeric.length) {
    return {
      value: null,
      status: "empty",
      sourceRow: rows[0] ?? null,
      sourceAddress: null,
    };
  }
  return {
    value: numeric.reduce(
      (sum, cell) => sum + (parseNumericValue(cell.rawValue).value ?? 0),
      0,
    ),
    status: "numeric",
    sourceRow: numeric[0].row,
    sourceAddress: numeric[0].address,
  };
}

/**
 * Exposes row-level supplier values for the importer while keeping the
 * aggregate calculation and seven-supplier validation in one parser module.
 */
export function extractBiomassReceiptImportRows(
  cells: readonly ScannedCell[],
  structure: StructureAnalysis,
): BiomassReceiptImportRow[] {
  const suppliers = supplierColumns(structure, cells);
  const marker = chooseSummaryMarker(
    cells,
    structure,
    suppliers.map(({ column }) => column),
  );
  const rows = marker ? [marker.row] : structure.dataRows;
  return suppliers.map(({ code, name, column }) => ({
    supplierCode: code,
    supplierName: name,
    sourceColumn: column,
    ...supplierImportValue(cells, rows, column),
  }));
}

export function parseMonthlyBiomassAggregates(
  cells: readonly ScannedCell[],
  structure: StructureAnalysis,
  worksheet: string,
  columns: {
    biomassUnit1: number | null;
    biomassUnit2: number | null;
    biomassUnit3: number | null;
  },
): DynamicSemanticAggregates {
  const detectedSuppliers = supplierColumns(structure, cells);
  const supplier = detectedSuppliers.map(({ column }) => column);
  const expectedSupplierNames = [
    "Sawdust PT Syahroni",
    "Sawdust PT Bintang",
    "Woodchip PT Syahroni",
    "Woodchip PT RAP",
    "Woodchip CV Multi Paketindo",
    "LRUK",
    "SRF",
  ];
  const detectedSupplierNames = detectedSuppliers.map(({ name }) => name);
  const canonicalCount = detectedSuppliers.filter(
    (supplier) => supplier.kind === "CANONICAL",
  ).length;
  const unit = unitColumns(columns);
  const summaryColumns = [...new Set([...supplier, ...unit])];
  const marker = chooseSummaryMarker(cells, structure, summaryColumns);
  const supplierSchemaNote = `Skema Penerimaan → Biomassa mendeteksi ${detectedSuppliers.length}/${expectedSupplierNames.length} kolom pemasok terbaru${detectedSuppliers.length ? ` (${detectedSupplierNames.join(", ")})` : ""}.`;
  const supplierSpec = {
    label: "Total penerimaan pemasok pada tabel Penerimaan → Biomassa",
    columns: supplier,
    emptyNote:
      "Kolom Sawdust PT Syahroni, Sawdust PT Bintang, Woodchip PT Syahroni, Woodchip PT RAP, Woodchip CV Multi Paketindo, LRUK, dan SRF belum terdeteksi secara semantic.",
  } satisfies MonthlyAggregateSpec;
  const summarySupplier = aggregateFromSummaryRow(
    cells,
    worksheet,
    marker,
    supplierSpec,
  );
  const calculatedSupplier =
    summarySupplier.status === "missing" && structure.dataRows.length
      ? aggregateFromDataRows(
          cells,
          worksheet,
          structure.dataRows,
          supplierSpec,
        )
      : summarySupplier;
  // A partial legacy schema is still calculated from the supplier columns
  // that are actually present. The import gate decides whether the result
  // needs review; the parser must not erase a usable aggregate.
  const supplierReceipt: ResolvedValue = calculatedSupplier.available
    ? {
        ...calculatedSupplier,
        note: calculatedSupplier.note
          ? `${calculatedSupplier.note} ${supplierSchemaNote} (${canonicalCount}/7 canonical).`
          : `${supplierSchemaNote} (${canonicalCount}/7 canonical).`,
      }
    : unavailableValue(
        `${supplierSchemaNote} Tidak ada nilai numerik supplier yang dapat dihitung.`,
      );
  return {
    biomassSupplierReceiptMonthly: supplierReceipt,
    biomassUnitConsumptionMonthly: aggregateFromSummaryRow(
      cells,
      worksheet,
      marker,
      {
        label: "Total pemakaian bulanan Biomassa Unit 1–3",
        columns: unit,
        emptyNote:
          "Kolom Biomassa Unit 1–3 belum tersedia untuk menghitung total pemakaian bulanan.",
      },
    ),
  };
}
