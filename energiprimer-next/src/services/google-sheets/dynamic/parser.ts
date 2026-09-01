import { detectAnchors } from "./anchor-detector";
import { classifyRegions } from "./table-classifier";
import { detectTableRegions } from "./table-detector";
import { analyzeTableStructure } from "./structure-analyzer";
import { parseBBWorksheetName } from "./worksheet-resolver";
import { normalizeDynamicOverview } from "./normalizer";
import { parseDashboardTable } from "./parsers/dashboard-parser";
import { parseDailyTable } from "./parsers/daily-parser";
import { parseHistoricalTable } from "./parsers/historical-parser";
import { parseMonthlyBiomassAggregates } from "./parsers/monthly-aggregate-parser";
import { parseTargetTable } from "./parsers/target-parser";
import { scanSpreadsheet } from "./spreadsheet-scanner";
import type {
  DynamicParserOptions,
  DynamicParserResult,
  DynamicSheetRow,
  DynamicFieldKey,
  WorksheetMetadata,
} from "./types";

function invalidWorksheet(name: string): WorksheetMetadata {
  return { name, month: 0, monthLabel: "", year: 0, isValid: false };
}

const fieldKeys: readonly DynamicFieldKey[] = [
  "biomassReceiptMonthly",
  "biomassConsumptionMonthly",
  "biomassUnit1Current",
  "biomassUnit2Current",
  "biomassUnit3Current",
  "coalConsumptionMonthly",
  "coalReceiptMonthly",
  "coalUnit1Current",
  "coalUnit2Current",
  "coalUnit3Current",
  "coalDailyTotal",
  "coalStock",
  "coalHop",
  "solarConsumptionDaily",
  "solarConsumptionMonthly",
  "solarReceiptMonthly",
  "biomassTarget",
  "biomassCumulative",
  "biomassTargetProgress",
];

export function parseDynamicWorksheet(
  rows: readonly DynamicSheetRow[],
  options: DynamicParserOptions,
): DynamicParserResult {
  const worksheet =
    parseBBWorksheetName(options.worksheetName) ??
    invalidWorksheet(options.worksheetName);
  const scannedCells = scanSpreadsheet(rows, {
    rowOffset: options.rowOffset ?? 1,
    columnOffset: options.columnOffset ?? 1,
  });
  const anchors = detectAnchors(scannedCells);
  const detectedRegions = detectTableRegions(scannedCells, anchors);
  const tables = classifyRegions(detectedRegions);
  const structure = analyzeTableStructure(scannedCells);
  const dashboard = parseDashboardTable(
    scannedCells,
    anchors,
    tables,
    options.worksheetName,
    structure,
  );
  const target = parseTargetTable(
    scannedCells,
    anchors,
    tables,
    options.worksheetName,
    structure,
    worksheet.year || options.year || 0,
  );
  const historical = parseHistoricalTable(
    scannedCells,
    anchors,
    tables,
    options.worksheetName,
    worksheet.year || options.year || 0,
    structure,
  );
  const daily =
    worksheet.isValid && worksheet.month > 0 && worksheet.year > 0
      ? parseDailyTable(
          scannedCells,
          structure,
          worksheet.month,
          worksheet.year,
        )
      : {
          series: [],
          columns: {
            date: null,
            coal: null,
            biomassUnit1: null,
            biomassUnit2: null,
            biomassUnit3: null,
            coalUnit1: null,
            coalUnit2: null,
            coalUnit3: null,
            stock: null,
            hop1: null,
            hop2: null,
            hop3: null,
            solar: null,
            solarReceipt: null,
          },
          warnings: [
            "Worksheet name tidak valid; daily date context tidak dapat ditentukan.",
          ],
        };
  const aggregates = parseMonthlyBiomassAggregates(
    scannedCells,
    structure,
    options.worksheetName,
    daily.columns,
  );
  const normalized = normalizeDynamicOverview({
    fields: dashboard.fields,
    target: target.target,
    cumulative: historical.cumulative,
    series: daily.series,
    aggregates,
  });
  const unresolved = fieldKeys.filter(
    (field) => !normalized.metrics[field].available,
  );
  const ambiguous = fieldKeys.filter(
    (field) => normalized.metrics[field].status === "ambiguous",
  );
  const warnings = [
    ...dashboard.warnings,
    ...daily.warnings,
    ...(dashboard.fields.biomassConsumptionMonthly?.available &&
    aggregates.biomassUnitConsumptionMonthly.available &&
    dashboard.fields.biomassConsumptionMonthly.value !==
      aggregates.biomassUnitConsumptionMonthly.value
      ? [
          "Nilai dashboard TOTAL PEMAKAIAN BIOMASSA BULANAN berbeda dari total semantic Biomassa Unit 1–3; parser memakai total Unit 1–3 untuk menjaga definisi konsumsi dan parity legacy.",
        ]
      : []),
    ...Object.values(aggregates)
      .filter((value) => value.status === "malformed" && value.note)
      .map((value) => value.note as string),
    ...Object.entries(normalized.metrics)
      .filter(([, value]) => value.level === "WARNING" && value.note)
      .map(([, value]) => value.note as string),
  ];
  const errors = worksheet.isValid
    ? []
    : [
        `Worksheet ${options.worksheetName} tidak mengikuti pola [Bulan][YY]-BB.`,
      ];
  return {
    worksheet,
    scannedCells,
    anchors,
    tables,
    structures: [structure],
    aggregates,
    normalized,
    diagnostics: {
      warnings: [...new Set(warnings)],
      errors,
      unresolved,
      ambiguous,
      scannedCellCount: scannedCells.length,
    },
  };
}
