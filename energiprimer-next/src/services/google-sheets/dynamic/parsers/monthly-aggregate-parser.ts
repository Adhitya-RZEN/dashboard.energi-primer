import { unavailableValue } from "../confidence";
import { parseNumericValue } from "../validators";
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

const RECEIPT_SUPPLIER_ALIASES = [
  ["Sawdust PT Syahroni", ["SAWDUST PT SYAHRONI"]],
  ["Sawdust PT Bintang", ["SAWDUST PT BINTANG"]],
  ["Woodchip PT Syahroni", ["WOODCHIP PT SYAHRONI"]],
  ["Woodchip PT RAP", ["WOODCHIP PT RAP"]],
  ["Woodchip CV Multi Paketindo", ["WOODCHIP CV MULTI PAKETINDO"]],
  ["LRUK", ["LRUK"]],
  ["SRF", ["SRF"]],
] as const;

type ReceiptSupplierName = (typeof RECEIPT_SUPPLIER_ALIASES)[number][0];

type ReceiptSupplierColumn = {
  name: ReceiptSupplierName;
  column: number;
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
  if (malformedCells.length) {
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
  const emptyCount = spec.columns.length - numericCells.length;
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
      emptyCount > 0
        ? `${spec.label} dijumlahkan dari ${numericCells.length} kolom numerik; ${emptyCount} kolom kosong diperlakukan sebagai tidak tersedia.`
        : `${spec.label} dijumlahkan dari ${numericCells.length} kolom semantic pada baris ${marker.address}.`,
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
  if (malformedCells.length) {
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
    note: `${spec.label} dihitung dengan menjumlahkan ${numericCells.length} cell numerik dari baris data tabel.`,
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

function supplierName(path: HeaderPath) {
  const labels = path.labels;
  const joined = labels.join(" ");
  for (const [name, aliases] of RECEIPT_SUPPLIER_ALIASES) {
    if (
      aliases.some(
        (alias) =>
          labels.some(
            (label) => label === alias || label.endsWith(` ${alias}`),
          ) || joined.endsWith(alias),
      )
    )
      return name;
  }
  return null;
}

function supplierColumns(
  structure: StructureAnalysis,
): ReceiptSupplierColumn[] {
  return structure.headerPaths
    .flatMap((path) => {
      if (!isSupplierBiomassPath(path)) return [];
      const name = supplierName(path);
      return name ? [{ name, column: path.cell.column }] : [];
    })
    .filter(
      (supplier, index, suppliers) =>
        suppliers.findIndex((candidate) => candidate.name === supplier.name) ===
        index,
    );
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
  const detectedSuppliers = supplierColumns(structure);
  const supplier = detectedSuppliers.map(({ column }) => column);
  const expectedSupplierNames = RECEIPT_SUPPLIER_ALIASES.map(([name]) => name);
  const detectedSupplierNames = detectedSuppliers.map(({ name }) => name);
  const missingSupplierNames = expectedSupplierNames.filter(
    (name) => !detectedSupplierNames.includes(name),
  );
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
  const supplierReceipt: ResolvedValue = missingSupplierNames.length
    ? unavailableValue(
        `${supplierSchemaNote} Kolom yang belum terdeteksi: ${missingSupplierNames.join(", ")}. Total penerimaan tidak dihitung dari skema parsial.`,
      )
    : {
        ...calculatedSupplier,
        note: calculatedSupplier.note
          ? `${calculatedSupplier.note} ${supplierSchemaNote}`
          : supplierSchemaNote,
      };
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
