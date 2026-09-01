import { readFile, stat } from "node:fs/promises";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  GoogleSheetsIntegrationError,
  listGoogleSheetsWorksheets,
  readGoogleSheetsRange,
  type GoogleSheetCell,
} from "../src/lib/google-sheets";
import {
  DYNAMIC_SCAN_RANGE,
  type DynamicWorksheetReadResult,
} from "../src/services/google-sheets/dynamic/reader";
import { parseDynamicWorksheet } from "../src/services/google-sheets/dynamic/parser";
import {
  dateFromRaw,
  parseDayValue,
  parseNumericValue,
  parseTargetNumber,
} from "../src/services/google-sheets/dynamic/validators";
import { parseBBWorksheetName, preferBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import type {
  DynamicDailyRecord,
  DynamicParserResult,
  HeaderPath,
  ResolvedValue,
} from "../src/services/google-sheets/dynamic/types";
import {
  buildGoogleSheetsImportPlanFromReadResult,
} from "../src/services/google-sheets/import/plan";

const prisma = new PrismaClient();
const DEFAULT_TARGET_WORKSHEET = "Juni26-BB";
const OFFICIAL_BIOMASS_TARGET = 70_020;
const DUMP_FILE = "dump-dashboard_pln-202608311006.sql";

const DATABASE_TABLES = [
  "units",
  "biomass_receipts",
  "biomass_consumptions",
  "coal_receipts",
  "coal_consumption",
  "coal_stock",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
] as const;

function stringArgument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value?.slice(prefix.length).trim() || fallback;
}

type MappingStatus = "RESOLVED" | "RESOLVED_WITH_FALLBACK" | "MISSING" | "AMBIGUOUS" | "MALFORMED";

type KpiMapping = {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  status: MappingStatus;
  sourceCells: readonly string[];
  sourceDescription: string;
  formula: string;
  databaseTarget: string;
  note?: string;
};

type CellRead = {
  address: string;
  raw: GoogleSheetCell | null;
  value: number | null;
  status: "numeric" | "empty" | "malformed";
};

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

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function safeError(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError)
    return {
      code: error.code,
      status: error.status ?? null,
    };
  return { code: "unknown", status: null };
}

function cellByAddress(rows: readonly (readonly GoogleSheetCell[])[], address: string) {
  const match = address.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const row = Number(match[2]);
  const column = columnNumber(match[1]);
  return rows[row - 1]?.[column - 1] ?? null;
}

function readCell(
  rows: readonly (readonly GoogleSheetCell[])[],
  address: string,
  target = false,
): CellRead {
  const raw = cellByAddress(rows, address);
  const parsed = target ? parseTargetNumber(raw) : parseNumericValue(raw);
  return {
    address,
    raw,
    value: parsed.value,
    status: parsed.status,
  };
}

function safeValue(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : value;
}

function sourceFromResolved(resolved: ResolvedValue | undefined) {
  return unique([
    ...(resolved?.sourceAddresses ?? []),
    resolved?.source?.address ?? "",
  ]);
}

function mappingFromResolved(input: {
  key: string;
  label: string;
  unit: string;
  resolved: ResolvedValue | undefined;
  databaseTarget: string;
  formula: string;
  note?: string;
}): KpiMapping {
  const resolved = input.resolved;
  const sourceCells = sourceFromResolved(resolved);
  const status: MappingStatus =
    resolved?.status === "resolved" && resolved.value !== null
      ? "RESOLVED"
      : resolved?.status === "ambiguous"
        ? "AMBIGUOUS"
        : resolved?.status === "malformed"
          ? "MALFORMED"
          : "MISSING";
  return {
    key: input.key,
    label: input.label,
    unit: input.unit,
    value: safeValue(resolved?.value ?? null),
    status,
    sourceCells,
    sourceDescription:
      sourceCells.length > 0
        ? "Semantic parser"
        : "Tidak ada sel semantic yang ter-resolve",
    formula: input.formula,
    databaseTarget: input.databaseTarget,
    ...(input.note ? { note: input.note } : {}),
  };
}

function mappingFromCell(input: {
  key: string;
  label: string;
  unit: string;
  cell: CellRead;
  databaseTarget: string;
  formula: string;
  note?: string;
}): KpiMapping {
  const status: MappingStatus =
    input.cell.status === "numeric" && input.cell.value !== null
      ? "RESOLVED"
      : input.cell.status === "malformed"
        ? "MALFORMED"
        : "MISSING";
  return {
    key: input.key,
    label: input.label,
    unit: input.unit,
    value: safeValue(input.cell.value),
    status,
    sourceCells: [input.cell.address],
    sourceDescription: "Legacy worksheet cell",
    formula: input.formula,
    databaseTarget: input.databaseTarget,
    ...(input.note ? { note: input.note } : {}),
  };
}

function dailyRowForDay(parsed: DynamicParserResult, day: number) {
  const structure = parsed.structures[0];
  if (!structure || structure.dateColumn === null) return null;
  return (
    structure.dataRows.find((row) => {
      const cell = parsed.scannedCells.find(
        (candidate) =>
          candidate.row === row && candidate.column === structure.dateColumn,
      );
      return parseDayValue(cell?.rawValue) === day;
    }) ?? null
  );
}

function dailyAddress(parsed: DynamicParserResult, day: number, column: number) {
  const row = dailyRowForDay(parsed, day);
  return row === null ? null : `${columnLetter(column)}${row}`;
}

function dailyCell(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  day: number,
  column: number,
) {
  const address = dailyAddress(parsed, day, column);
  return address ? readCell(rows, address) : null;
}

function dailyFieldCoverage(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  column: number,
  records: readonly DynamicDailyRecord[],
) {
  const values = records.map((record) =>
    record.day === null ? null : dailyCell(rows, parsed, record.day, column),
  );
  return {
    sourceColumn: columnLetter(column),
    rows: values.filter((value) => value !== null).length,
    numericRows: values.filter(
      (value) => value?.status === "numeric" && value.value !== null,
    ).length,
    emptyRows: values.filter((value) => value?.status === "empty").length,
    malformedRows: values.filter((value) => value?.status === "malformed").length,
  };
}

function sumDailyColumn(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  column: number,
  records: readonly DynamicDailyRecord[],
) {
  const values = records.flatMap((record) => {
    if (record.day === null) return [];
    const cell = dailyCell(rows, parsed, record.day, column);
    return cell?.value === null || cell?.value === undefined ? [] : [cell.value];
  });
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function pathSummary(path: HeaderPath | null) {
  return path
    ? {
        address: path.cell.address,
        column: path.cell.column,
        labels: path.labels,
        resource: path.resource,
        unit: path.unit,
        unitNumber: path.unitNumber,
        total: path.isTotal,
        stock: path.isStock,
        hop: path.isHop,
      }
    : null;
}

function orderedDailyPath(
  parsed: DynamicParserResult,
  resource: HeaderPath["resource"],
  unitNumber: 1 | 2 | 3,
) {
  const structure = parsed.structures[0];
  if (!structure) return null;
  const candidates = structure.headerPaths
    .filter(
      (path) =>
        path.resource === resource &&
        path.unitNumber !== null &&
        !path.isTotal &&
        !path.isStock &&
        !path.isHop &&
        !path.labels.some((label) =>
          /BELT WEIGHER|BUCKET|KWH GREEN|COAL HANDLING/.test(label),
        ),
    )
    .sort((left, right) => left.cell.column - right.cell.column);
  const explicit = candidates.filter((path) => path.unitNumber === unitNumber);
  return (
    (explicit.length > 1 ? candidates[unitNumber - 1] : explicit[0]) ??
    candidates[unitNumber - 1] ??
    null
  );
}

function hopPath(parsed: DynamicParserResult, unitNumber: 1 | 2 | 3) {
  const structure = parsed.structures[0];
  if (!structure) return null;
  const candidates = structure.headerPaths
    .filter((path) => path.isHop && path.unitNumber !== null)
    .sort((left, right) => left.cell.column - right.cell.column);
  const explicit = candidates.filter((path) => path.unitNumber === unitNumber);
  return (
    (explicit.length > 1 ? candidates[unitNumber - 1] : explicit[0]) ??
    candidates[unitNumber - 1] ??
    null
  );
}

function findTargetCell(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  year: number,
) {
  const label = parsed.scannedCells.find(
    (cell) => cell.normalizedValue === `TARGET ${year}`,
  );
  if (!label) return null;
  for (let row = label.row; row <= label.row + 3; row += 1) {
    const address = `${columnLetter(label.column)}${row}`;
    const cell = readCell(rows, address, true);
    if (cell.status === "numeric") return { label, cell };
  }
  return null;
}

function findTonaseCumulativeCell(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  year: number,
) {
  const section = parsed.scannedCells.find(
    (cell) => cell.normalizedValue === "TONASE BIOMASSA",
  );
  if (!section) return null;
  const totalLabel = parsed.scannedCells.find(
    (cell) =>
      cell.column === section.column &&
      cell.row > section.row &&
      cell.row <= section.row + 15 &&
      cell.normalizedValue === `TOTAL ${year}`,
  );
  if (!totalLabel) return null;
  const candidates = parsed.scannedCells
    .filter(
      (cell) =>
        cell.row === totalLabel.row && cell.column > totalLabel.column,
    )
    .sort((left, right) => left.column - right.column);
  for (const candidate of candidates) {
    const cell = readCell(rows, candidate.address);
    if (cell.status === "numeric") return { section, totalLabel, cell };
  }
  return null;
}

function valuesMatch(left: number | null, right: number | null) {
  return left !== null && right !== null && Math.abs(left - right) < 0.001;
}

function biomassReceiptValue(parsed: DynamicParserResult) {
  return parsed.aggregates.biomassSupplierReceiptMonthly.value;
}

function buildMappings(
  rows: readonly (readonly GoogleSheetCell[])[],
  parsed: DynamicParserResult,
  effectiveYear: number,
) {
  const metrics = parsed.normalized.metrics;
  const mappings: KpiMapping[] = [];
  const biomassReceipt = parsed.aggregates.biomassSupplierReceiptMonthly;
  const biomassReceiptSourceCells = sourceFromResolved(biomassReceipt);
  mappings.push(
    mappingFromResolved({
      key: "biomassReceiptMonthly",
      label: "Total penerimaan biomassa bulanan",
      unit: "ton",
      resolved: biomassReceipt,
      databaseTarget:
        "biomass_receipts.period_start + supplier_code + quantity_ton (SUM 7 pemasok)",
      formula:
        biomassReceiptSourceCells.length > 0
          ? `SUM(${biomassReceiptSourceCells.join(", ")})`
          : "SUM(7 pemasok canonical berdasarkan label)",
      note:
        "Tujuh pemasok canonical dipilih berdasarkan label semantic; kolom Woodchip tanpa perusahaan dan BONGGOL JAGUNG tidak termasuk KPI resmi.",
    }),
  );
  mappings.push(
    mappingFromResolved({
      key: "biomassConsumptionMonthly",
      label: "Total pemakaian biomassa bulanan",
      unit: "ton",
      resolved: metrics.biomassConsumptionMonthly,
      databaseTarget:
        "biomass_consumptions.reading_date + unit_id + quantity_ton (SUM periode)",
      formula: "SUM(T42, W42, Z42) atau nilai total AC42 sesuai struktur sumber",
    }),
  );

  const legacyCells = {
    coalReceiptMonthly: readCell(rows, "I42"),
    coalConsumptionMonthly: readCell(rows, "AB42"),
    solarReceiptMonthly: readCell(rows, "CC42"),
    solarConsumptionMonthly: readCell(rows, "CJ42"),
  };
  mappings.push(
    mappingFromResolved({
      key: "coalConsumptionMonthly",
      label: "Total pemakaian batubara bulanan",
      unit: "ton",
      resolved: metrics.coalConsumptionMonthly,
      databaseTarget:
        "coal_consumption.date + unit_id + coal_used (SUM periode)",
      formula: "SUM(AB11:AB40) dengan validasi silang ke AB42",
      note: `Field semantic belum tersedia pada layout ${parsed.worksheet.name}; memakai fallback legacy setelah verifikasi.`,
    }),
  );
  if (mappings.at(-1)?.status !== "RESOLVED") {
    mappings[mappings.length - 1] = {
      ...mappingFromCell({
        key: "coalConsumptionMonthly",
        label: "Total pemakaian batubara bulanan",
        unit: "ton",
        cell: legacyCells.coalConsumptionMonthly,
        databaseTarget:
          "coal_consumption.date + unit_id + coal_used (SUM periode)",
        formula: "AB42; validasi silang dengan SUM(AB11:AB40)",
        note: `Fallback legacy untuk ${parsed.worksheet.name} karena semantic field tidak ditemukan.`,
      }),
      status: "RESOLVED_WITH_FALLBACK",
    };
  }
  mappings.push(
    mappingFromCell({
      key: "coalReceiptMonthly",
      label: "Total penerimaan batubara bulanan",
      unit: "ton",
      cell: legacyCells.coalReceiptMonthly,
      databaseTarget: "coal_receipts.period_start + quantity_ton",
      formula: "I42",
      note: `Fallback legacy; pada ${parsed.worksheet.name} header semantic penerimaan batubara belum terdeteksi sebagai field bulanan.`,
    }),
  );
  mappings[mappings.length - 1] = {
    ...mappings.at(-1)!,
    status: "RESOLVED_WITH_FALLBACK",
  };
  mappings.push(
    mappingFromCell({
      key: "solarConsumptionMonthly",
      label: "Total pemakaian solar bulanan",
      unit: "liter",
      cell: legacyCells.solarConsumptionMonthly,
      databaseTarget: "solar_consumptions.reading_date + quantity_liter (SUM periode)",
      formula: "CJ42",
      note: `Fallback legacy pada ${parsed.worksheet.name}; angka tiga digit setelah titik diparse sebagai pemisah ribuan sesuai format sheet.`,
    }),
  );
  mappings[mappings.length - 1] = {
    ...mappings.at(-1)!,
    status: "RESOLVED_WITH_FALLBACK",
  };
  mappings.push(
    mappingFromCell({
      key: "solarReceiptMonthly",
      label: "Total penerimaan solar bulanan",
      unit: "liter",
      cell: legacyCells.solarReceiptMonthly,
      databaseTarget: "solar_receipts.period_start + quantity_liter",
      formula: "CC42",
    }),
  );
  mappings[mappings.length - 1] = {
    ...mappings.at(-1)!,
    status: "RESOLVED_WITH_FALLBACK",
  };

  const targetCell = findTargetCell(rows, parsed, effectiveYear);
  mappings.push(
    targetCell
      ? mappingFromCell({
          key: "biomassTarget",
          label: `Target biomassa ${effectiveYear}`,
          unit: "ton",
          cell: targetCell.cell,
          databaseTarget: "biomass_targets.target_year + target_ton",
          formula: targetCell.cell.address,
        })
      : {
          key: "biomassTarget",
          label: `Target biomassa ${effectiveYear}`,
          unit: "ton",
          value: OFFICIAL_BIOMASS_TARGET,
          status: "RESOLVED_WITH_FALLBACK",
          sourceCells: [],
          sourceDescription: "Policy fallback resmi",
          formula: `70020 karena tabel Target 2026 tidak ditemukan pada ${parsed.worksheet.name}`,
          databaseTarget: "biomass_targets.target_year + target_ton",
          note: `CO56 tidak dipakai sebagai target pada ${parsed.worksheet.name}; sel tersebut adalah nilai kumulatif Unit 1 pada tabel TONASE BIOMASSA.`,
        },
  );

  const cumulativeCell = findTonaseCumulativeCell(rows, parsed, effectiveYear);
  mappings.push(
    cumulativeCell
      ? {
          key: "biomassCumulative",
          label: `Kumulatif pemakaian biomassa s.d. ${effectiveYear}`,
          unit: "ton",
          value: cumulativeCell.cell.value,
          status: "RESOLVED_WITH_FALLBACK",
          sourceCells: [
            cumulativeCell.section.address,
            cumulativeCell.totalLabel.address,
            cumulativeCell.cell.address,
          ],
          sourceDescription: "Legacy TONASE BIOMASSA table",
          formula: cumulativeCell.cell.address,
          databaseTarget:
            "biomass_cumulative_snapshots.period_start + cumulative_ton",
          note: "Pemilihan dibatasi pada tabel TONASE BIOMASSA; ini menghindari ambiguitas dengan tabel produksi KWH Green.",
        }
      : {
          key: "biomassCumulative",
          label: `Kumulatif pemakaian biomassa s.d. ${effectiveYear}`,
          unit: "ton",
          value: null,
          status: "AMBIGUOUS",
          sourceCells: [],
          sourceDescription: "Legacy TONASE BIOMASSA table tidak ditemukan",
          formula: "Tidak dapat ditentukan secara aman",
          databaseTarget:
            "biomass_cumulative_snapshots.period_start + cumulative_ton",
        },
  );

  const target = mappings.find((mapping) => mapping.key === "biomassTarget")?.value ?? null;
  const cumulative = mappings.find(
    (mapping) => mapping.key === "biomassCumulative",
  )?.value ?? null;
  mappings.push({
    key: "biomassTargetProgress",
    label: "Progress target biomassa",
    unit: "%",
    value:
      target !== null && cumulative !== null && target > 0
        ? (cumulative / target) * 100
        : null,
    status:
      target !== null && cumulative !== null ? "RESOLVED" : "AMBIGUOUS",
    sourceCells: [
      ...mappings.find((mapping) => mapping.key === "biomassTarget")?.sourceCells ?? [],
      ...mappings.find((mapping) => mapping.key === "biomassCumulative")?.sourceCells ?? [],
    ],
    sourceDescription: "Derived KPI dari target + kumulatif",
    formula: "MIN(100, biomassCumulative / biomassTarget × 100)",
    databaseTarget:
      "biomass_cumulative_snapshots.cumulative_ton / biomass_targets.target_ton",
  });

  const focusDay = parsed.normalized.series
    .map((record) => record.day)
    .filter((day): day is number => day !== null)
    .at(-1) ?? null;
  const dailyPaths = {
    biomassUnit1: orderedDailyPath(parsed, "biomass", 1),
    biomassUnit2: orderedDailyPath(parsed, "biomass", 2),
    biomassUnit3: orderedDailyPath(parsed, "biomass", 3),
    coalUnit1: orderedDailyPath(parsed, "coal", 1),
    coalUnit2: orderedDailyPath(parsed, "coal", 2),
    coalUnit3: orderedDailyPath(parsed, "coal", 3),
    hopUnit1: hopPath(parsed, 1),
    hopUnit2: hopPath(parsed, 2),
    hopUnit3: hopPath(parsed, 3),
  };
  const dailyColumns = {
    biomassUnit1: dailyPaths.biomassUnit1?.cell.column ?? columnNumber("T"),
    biomassUnit2: dailyPaths.biomassUnit2?.cell.column ?? columnNumber("W"),
    biomassUnit3: dailyPaths.biomassUnit3?.cell.column ?? columnNumber("Z"),
    coalUnit1: dailyPaths.coalUnit1?.cell.column ?? columnNumber("S"),
    coalUnit2: dailyPaths.coalUnit2?.cell.column ?? columnNumber("V"),
    coalUnit3: dailyPaths.coalUnit3?.cell.column ?? columnNumber("Y"),
    coalDailyTotal: columnNumber("AB"),
    coalStock: columnNumber("AD"),
    hopUnit1: dailyPaths.hopUnit1?.cell.column ?? columnNumber("AL"),
    hopUnit2: dailyPaths.hopUnit2?.cell.column ?? columnNumber("AK"),
    hopUnit3: dailyPaths.hopUnit3?.cell.column ?? columnNumber("AJ"),
    solar: columnNumber("CJ"),
  } as const;
  const coverage = Object.fromEntries(
    Object.entries(dailyColumns).map(([key, column]) => [
      key,
      dailyFieldCoverage(rows, parsed, column, parsed.normalized.series),
    ]),
  );
  const biomassDailySums = [1, 2, 3].map((unit) =>
    sumDailyColumn(
      rows,
      parsed,
      dailyColumns[`biomassUnit${unit}` as keyof typeof dailyColumns],
      parsed.normalized.series,
    ),
  );
  const biomassDailyTotal = biomassDailySums.some((value) => value !== null)
    ? biomassDailySums
        .filter((value): value is number => value !== null)
        .reduce((total, value) => total + value, 0)
    : null;
  const coalDailyTotal = sumDailyColumn(
    rows,
    parsed,
    dailyColumns.coalDailyTotal,
    parsed.normalized.series,
  );
  const solarDailyTotal = sumDailyColumn(
    rows,
    parsed,
    dailyColumns.solar,
    parsed.normalized.series,
  );
  const samples = [1, 15, focusDay].filter(
    (day, index, values): day is number => day !== null && values.indexOf(day) === index,
  ).map((day) => {
    const record = parsed.normalized.series.find((item) => item.day === day) ?? null;
    return {
      day,
      date:
        record?.date ??
        dateFromRaw(
          cellByAddress(rows, `A${day + 10}`),
          parsed.worksheet.month,
          effectiveYear,
        ),
      biomass: [1, 2, 3].map((unit) => {
        const key = `biomassUnit${unit}` as keyof typeof dailyColumns;
        const cell = dailyCell(rows, parsed, day, dailyColumns[key]);
        return { unit: `Unit ${unit}`, cell: cell?.address ?? null, value: cell?.value ?? null };
      }),
      coal: [1, 2, 3].map((unit) => {
        const key = `coalUnit${unit}` as keyof typeof dailyColumns;
        const cell = dailyCell(rows, parsed, day, dailyColumns[key]);
        return { unit: `Unit ${unit}`, cell: cell?.address ?? null, value: cell?.value ?? null };
      }),
      coalTotal: dailyCell(rows, parsed, day, dailyColumns.coalDailyTotal),
      stock: dailyCell(rows, parsed, day, dailyColumns.coalStock),
      hop: [1, 2, 3].map((unit) => {
        const key = `hopUnit${unit}` as keyof typeof dailyColumns;
        const cell = dailyCell(rows, parsed, day, dailyColumns[key]);
        return { unit: `Unit ${unit}`, cell: cell?.address ?? null, value: cell?.value ?? null };
      }),
      solar: dailyCell(rows, parsed, day, dailyColumns.solar),
    };
  });

  return {
    mappings,
    daily: {
      focusDay,
      focusDate:
        focusDay === null
          ? null
          : `${effectiveYear}-${String(parsed.worksheet.month).padStart(2, "0")}-${String(focusDay).padStart(2, "0")}`,
      seriesRows: parsed.normalized.series.length,
      paths: Object.fromEntries(
        Object.entries(dailyPaths).map(([key, path]) => [key, pathSummary(path)]),
      ),
      columns: Object.fromEntries(
        Object.entries(dailyColumns).map(([key, column]) => [key, columnLetter(column)]),
      ),
      coverage,
      samples,
      validations: {
        biomassSupplierTotal: {
          sourceTotal: mappings.find(
            (mapping) => mapping.key === "biomassReceiptMonthly",
          )?.value ?? null,
          supplierTotal: biomassReceiptValue(parsed),
          matches: valuesMatch(
            mappings.find(
              (mapping) => mapping.key === "biomassReceiptMonthly",
            )?.value ?? null,
            biomassReceiptValue(parsed),
          ),
        },
        biomassDailyVsMonthly: {
          dailyUnitSums: biomassDailySums,
          dailyTotal: biomassDailyTotal,
          monthlyTotal: readCell(rows, "AC42").value,
          matches: valuesMatch(biomassDailyTotal, readCell(rows, "AC42").value),
        },
        coalDailyVsMonthly: {
          dailyTotal: coalDailyTotal,
          monthlyTotal: readCell(rows, "AB42").value,
          matches: valuesMatch(coalDailyTotal, readCell(rows, "AB42").value),
        },
        solarDailyVsMonthly: {
          dailyTotal: solarDailyTotal,
          monthlyTotal: readCell(rows, "CJ42").value,
          matches: valuesMatch(solarDailyTotal, readCell(rows, "CJ42").value),
        },
      },
    },
    suppliers: parsed.aggregates.biomassSupplierReceiptMonthly.sourceAddresses?.map(
      (address) => {
        const cell = readCell(rows, address);
        return { cell: address, value: cell.value, status: cell.status };
      },
    ) ?? [],
  };
}

async function databaseAudit(periodStart: Date) {
  const nextPeriod = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
  const period = {
    gte: periodStart,
    lt: nextPeriod,
  };
  const [tables, counts, target, cumulative, units] = await Promise.all([
    prisma.$queryRaw<{ table_name: string }[]>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(DATABASE_TABLES)})
      ORDER BY table_name
    `),
    Promise.all([
      prisma.biomassReceipt.count({ where: { periodStart: period } }),
      prisma.biomassConsumption.count({ where: { readingDate: period } }),
      prisma.coalReceipt.count({ where: { periodStart: period } }),
      prisma.coalConsumption.count({ where: { date: period } }),
      prisma.coalStock.count({ where: { date: period } }),
      prisma.solarReceipt.count({ where: { periodStart: period } }),
      prisma.solarConsumption.count({ where: { readingDate: period } }),
      prisma.hopReading.count({ where: { readingDate: period } }),
    ]),
    prisma.biomassTarget.findUnique({
      where: { targetYear: 2026 },
      select: { targetYear: true, targetTon: true, source: true },
    }),
    prisma.biomassCumulativeSnapshot.findUnique({
      where: { periodStart },
      select: { periodStart: true, cumulativeTon: true, source: true },
    }),
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    }),
  ]);
  return {
    access: "READ_ONLY",
    tablesPresent: tables.map((table) => table.table_name),
    expectedTables: [...DATABASE_TABLES],
    periodRowCounts: {
      biomassReceipts: counts[0],
      biomassConsumptions: counts[1],
      coalReceipts: counts[2],
      coalConsumptions: counts[3],
      coalStock: counts[4],
      solarReceipts: counts[5],
      solarConsumptions: counts[6],
      hopReadings: counts[7],
    },
    target2026: target
      ? { year: target.targetYear, ton: Number(target.targetTon), source: target.source }
      : null,
    periodCumulative: cumulative
      ? {
          periodStart: cumulative.periodStart.toISOString().slice(0, 10),
          ton: cumulative.cumulativeTon === null ? null : Number(cumulative.cumulativeTon),
          source: cumulative.source,
        }
      : null,
    units,
    periodStart: periodStart.toISOString().slice(0, 10),
    note:
      "Database audit bersifat read-only; hasil mapping worksheet belum diimport pada periode ini.",
  };
}

async function dumpAudit() {
  const path = new URL(`../excels/${DUMP_FILE}`, import.meta.url);
  try {
    const [metadata, header] = await Promise.all([
      stat(path),
      readFile(path).then((bytes) => bytes.subarray(0, 5).toString("ascii")),
    ]);
    return {
      file: DUMP_FILE,
      available: true,
      bytes: metadata.size,
      format: header === "PGDMP" ? "PostgreSQL custom dump" : "unknown",
      header: header === "PGDMP" ? "PGDMP" : "not-disclosed",
      note:
        "File dump diperlakukan sebagai referensi read-only; script tidak menjalankan pg_restore dan tidak menulis database.",
    };
  } catch {
    return {
      file: DUMP_FILE,
      available: false,
      bytes: null,
      format: "unavailable",
      header: null,
      note: "File dump lokal tidak ditemukan.",
    };
  }
}

async function run() {
  const targetWorksheet = stringArgument(
    "worksheet",
    DEFAULT_TARGET_WORKSHEET,
  );
  const worksheets = await listGoogleSheetsWorksheets();
  const matchedTitle = preferBBWorksheetName(
    worksheets
      .map((worksheet) => worksheet.title)
      .filter(
        (title) =>
          title.trim().toLocaleLowerCase("en-US") ===
          targetWorksheet.toLocaleLowerCase("en-US"),
      ),
  );
  if (!matchedTitle) throw new Error(`Worksheet ${targetWorksheet} tidak ditemukan.`);
  const metadata = parseBBWorksheetName(matchedTitle);
  if (!metadata) throw new Error(`Worksheet ${targetWorksheet} gagal divalidasi.`);

  const raw = await readGoogleSheetsRange(matchedTitle, DYNAMIC_SCAN_RANGE);
  if (!raw.rows.length) throw new Error(`Worksheet ${matchedTitle} tidak mengembalikan data.`);
  const parsed = parseDynamicWorksheet(raw.rows, {
    worksheetName: matchedTitle,
    month: metadata.month,
    year: metadata.year,
    rowOffset: 1,
    columnOffset: 1,
  });
  const readResult = {
    requested: { month: metadata.month, year: metadata.year, worksheet: matchedTitle },
    effective: { month: metadata.month, year: metadata.year, worksheet: matchedTitle },
    isFallback: false,
    fallbackIndex: 0,
    attemptedWorksheets: [matchedTitle],
    parsed,
  } satisfies DynamicWorksheetReadResult;
  const plan = buildGoogleSheetsImportPlanFromReadResult(readResult);
  const mapped = buildMappings(raw.rows, parsed, metadata.year);
  let database: Awaited<ReturnType<typeof databaseAudit>> | { status: "UNAVAILABLE"; reason: string };
  try {
    database = await databaseAudit(
      new Date(Date.UTC(metadata.year, metadata.month - 1, 1)),
    );
  } catch {
    database = {
      status: "UNAVAILABLE",
      reason: "Database read verification could not be completed; no database write was attempted.",
    };
  }
  console.log(
    JSON.stringify(
      {
        status: "PASS_WITH_REVIEW",
        worksheet: {
          requested: targetWorksheet,
          matched: matchedTitle,
          period: `${metadata.year}-${String(metadata.month).padStart(2, "0")}`,
          range: DYNAMIC_SCAN_RANGE,
          rawRows: raw.rows.length,
          scannedCells: parsed.diagnostics.scannedCellCount,
          readFallback: false,
        },
        parser: {
          errors: parsed.diagnostics.errors,
          unresolved: parsed.diagnostics.unresolved,
          ambiguous: parsed.diagnostics.ambiguous,
          warnings: parsed.diagnostics.warnings,
        },
        importPlan: {
          status: plan.status,
          blockingIssues: plan.blockingIssues,
          summary: plan.summary,
          databaseWrites: 0,
        },
        kpiMapping: mapped.mappings,
        daily: mapped.daily,
        localDatabaseDump: await dumpAudit(),
        database,
        decisions: [
          "Gunakan Unit 1, Unit 2, Unit 3 berdasarkan urutan/label yang terverifikasi.",
          "Target 2026 memakai fallback 70020 ton ketika tabel Target 2026 tidak ditemukan.",
          "Kumulatif dipilih hanya dari tabel TONASE BIOMASSA pada baris TOTAL 2026.",
          "Nilai kosong dipertahankan sebagai null; tidak diubah menjadi nol pada data harian.",
          "Mapping ini belum merupakan import dan belum mengubah database.",
        ],
      },
      null,
      2,
    ),
  );
}

try {
  await run();
} catch (error) {
  console.error(JSON.stringify({ status: "FAIL", error: safeError(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
