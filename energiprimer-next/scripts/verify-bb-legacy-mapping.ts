import { parseBBWorksheetName } from "../src/services/google-sheets/dynamic/worksheet-resolver";
import type {
  DynamicParserResult,
  HeaderPath,
} from "../src/services/google-sheets/dynamic/types";
import {
  classifyDuplicateRecords,
  classifySchemaFamily,
  mapHeaderPaths,
  validateWorksheetDates,
} from "../src/services/google-sheets/legacy-mapping/index";
import {
  normalizeSupplierIdentity,
  normalizeUnitIdentity,
  OFFICIAL_BIOMASS_TARGET,
} from "../src/services/google-sheets/legacy-mapping/profiles";
import type {
  ImportStagingRecord,
} from "../src/services/google-sheets/import/types";
import {
  classifySyncRows,
} from "../src/services/google-sheets/sync/change-detection";
import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "../src/services/google-sheets/sync/identity";
import type {
  SchemaColumnSnapshot,
  SchemaSnapshot,
} from "../src/services/google-sheets/sync/schema-detection";

let passed = 0;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

function column(index: number, common = true): SchemaColumnSnapshot {
  const label = common ? `COMMON FIELD ${index}` : `LEGACY FIELD ${index}`;
  const semanticKey = JSON.stringify({
    resource: "coal",
    unit: null,
    unitNumber: null,
    isTotal: true,
    isStock: false,
    isHop: false,
    isDate: false,
    index: common ? index : `legacy-${index}`,
  });
  return {
    semanticKey,
    signature: `${semanticKey}|${label}`,
    labels: [label],
    resource: "coal",
    unit: "ton",
    unitNumber: null,
    isTotal: true,
    isStock: false,
    isHop: false,
    isDate: false,
    valueType: "numeric",
  };
}

function snapshot(commonCount: number, total = 100): SchemaSnapshot {
  const columns = Array.from({ length: total }, (_, index) =>
    column(index, index < commonCount),
  );
  return {
    version: 1,
    dateColumnPresent: true,
    columns,
    hash: `snapshot-${commonCount}-${total}`,
  };
}

function headerPath(input: {
  labels: string[];
  resource: HeaderPath["resource"];
  unitNumber?: number | null;
  isStock?: boolean;
  isHop?: boolean;
  isDate?: boolean;
}): HeaderPath {
  const columnNumber = 4;
  return {
    cell: {
      row: 1,
      column: columnNumber,
      address: "D1",
      rawValue: input.labels.join(" "),
      normalizedValue: input.labels.join(" ").toUpperCase(),
    },
    labels: input.labels,
    unit: "ton",
    resource: input.resource,
    unitNumber: input.unitNumber ?? null,
    isTotal: true,
    isStock: input.isStock ?? false,
    isHop: input.isHop ?? false,
    isDate: input.isDate ?? false,
  };
}

function parsedWithHeaders(paths: readonly HeaderPath[]): DynamicParserResult {
  return {
    worksheet: {
      name: "Juli26-BB",
      month: 7,
      monthLabel: "Juli",
      year: 2026,
      isValid: true,
    },
    scannedCells: [],
    anchors: [],
    tables: [],
    structures: [
      {
        headerRows: [1],
        headerPaths: paths,
        dataRows: [],
        dateColumn: null,
      },
    ],
    aggregates: {
      biomassSupplierReceiptMonthly: {
        value: null,
        available: false,
        confidence: 0,
        level: "UNRESOLVED",
        source: null,
        status: "missing",
        candidates: [],
      },
      biomassUnitConsumptionMonthly: {
        value: null,
        available: false,
        confidence: 0,
        level: "UNRESOLVED",
        source: null,
        status: "missing",
        candidates: [],
      },
    },
    normalized: {
      metrics: {} as DynamicParserResult["normalized"]["metrics"],
      target: null,
      series: [],
    },
    diagnostics: {
      warnings: [],
      errors: [],
      unresolved: [],
      ambiguous: [],
      scannedCellCount: 0,
    },
  };
}

function stagingRecord(
  value: number | null,
  date = new Date("2026-07-01T00:00:00.000Z"),
  sourceRow = 1,
): ImportStagingRecord {
  return {
    entityType: "coal_consumption",
    source: { worksheet: "Juli26-BB", cell: `D${sourceRow}`, row: sourceRow },
    periodStart: null,
    readingDate: date,
    unitCode: "UNIT-1",
    supplierCode: null,
    rawValue: value === null ? null : String(value),
    normalizedValue: value,
    valueUnit: "ton",
    validationStatus: value === null ? "VALID_EMPTY" : "VALID",
    validationMessage: null,
  };
}

function run() {
  assert(parseBBWorksheetName("Juli26-BB")?.year === 2026, "valid BB worksheet title is parsed");
  assert(parseBBWorksheetName("Flyash-Okt") === null, "invalid worksheet title is rejected");

  const canonical = snapshot(100);
  assert(
    classifySchemaFamily(canonical, canonical, { worksheet: "Juli26-BB" }).family ===
      "CANONICAL_FAMILY",
    "canonical schema is recognized by exact fingerprint",
  );
  assert(
    classifySchemaFamily(canonical, snapshot(90), { worksheet: "Juli25-BB" }).family ===
      "LEGACY_FAMILY_A",
    "high semantic overlap is classified as Family A",
  );
  assert(
    classifySchemaFamily(canonical, snapshot(51), { worksheet: "Mei23-BB" }).family ===
      "LEGACY_FAMILY_C",
    "partial semantic overlap is classified as Family C",
  );
  assert(
    classifySchemaFamily(canonical, snapshot(25), { worksheet: "Mei22-BB" }).family ===
      "LEGACY_FAMILY_B",
    "low semantic overlap is classified as Family B",
  );

  assert(normalizeUnitIdentity("Unit 1") === "UNIT-1", "Unit 1 normalizes to UNIT-1");
  assert(normalizeUnitIdentity("PLTU-2") === "UNIT-2", "PLTU-2 normalizes to UNIT-2");
  assert(normalizeUnitIdentity("Unit 4") === null, "unknown unit is not guessed");
  assert(
    normalizeSupplierIdentity("Sawdust PT Syahroni")?.code === "sawdust-pt-syahroni",
    "approved supplier alias normalizes exactly",
  );
  assert(
    normalizeSupplierIdentity("wOoDcHiP   pT   Bhirawa")?.code ===
      "woodchip-pt-bhirawa" &&
      normalizeSupplierIdentity("Woodchip PT Bhirawa")?.kind === "PATTERN",
    "material + PT + company supplier pattern is case/whitespace insensitive and remains distinct",
  );
  assert(normalizeSupplierIdentity("Supplier Baru") === null, "unknown supplier is not merged");
  assert(OFFICIAL_BIOMASS_TARGET === 70_020, "official biomass target remains 70,020 ton");

  const dateValidation = validateWorksheetDates({
    year: 2026,
    month: 2,
    cells: [
      { row: 4, column: 1, address: "A4", rawValue: 1 },
      { row: 5, column: 1, address: "A5", rawValue: 1 },
      { row: 6, column: 1, address: "A6", rawValue: 31 },
      { row: 7, column: 1, address: "A7", rawValue: "2026-03-01" },
      { row: 8, column: 1, address: "A8", rawValue: "2026-02-02" },
    ],
  });
  const dateCodes = new Set(dateValidation.issues.map((issue) => issue.code));
  assert(dateCodes.has("DUPLICATE_DATE"), "duplicate dates are reported without selecting a winner");
  assert(dateCodes.has("INVALID_DATE"), "invalid calendar dates are reported for exclusion");
  assert(dateCodes.has("PERIOD_MISMATCH"), "valid dates outside worksheet period are reported");
  assert(dateCodes.has("DATE_FORMAT_VARIATION"), "mixed source date formats are reported");
  assert(dateValidation.status === "BLOCKED", "blocking date issues block the mapping gate");
  const ignoredDateValidation = validateWorksheetDates({
    year: 2026,
    month: 2,
    cells: [
      { row: 4, column: 1, address: "A4", rawValue: 1 },
      { row: 5, column: 1, address: "A5", rawValue: 31 },
      { row: 6, column: 1, address: "A6", rawValue: "2026-03-01" },
    ],
  });
  assert(
    ignoredDateValidation.status === "REVIEW",
    "invalid and shifted dates do not block mapping when no duplicate identity exists",
  );

  const biomassStockMapping = mapHeaderPaths(
    parsedWithHeaders([
      headerPath({
        labels: ["STOK AKHIR", "BIOMASSA", "SAWDUST"],
        resource: "biomass",
        isStock: true,
      }),
    ]),
    "CANONICAL_FAMILY",
  )[0];
  assert(
    biomassStockMapping?.decision === "FUTURE_SCOPE_DATA" &&
      biomassStockMapping.databaseField === "NO_DATABASE_TARGET",
    "BIOMASS_STOCK is future scope and has no database target",
  );

  const coalStockMapping = mapHeaderPaths(
    parsedWithHeaders([
      headerPath({
        labels: ["STOK AKHIR", "BATUBARA"],
        resource: "coal",
        isStock: true,
      }),
    ]),
    "CANONICAL_FAMILY",
  )[0];
  assert(
    coalStockMapping?.domain === "COAL_STOCK" &&
      coalStockMapping.databaseField === "coal_stock.closing_stock",
    "coal stock maps to existing coal_stock closing stock field",
  );

  const duplicate = stagingRecord(10, undefined, 10);
  const sameDuplicate = stagingRecord(10, undefined, 11);
  const collision = stagingRecord(12, undefined, 12);
  assert(
    classifyDuplicateRecords([duplicate, sameDuplicate])[0]?.classification ===
      "TRUE_DUPLICATE",
    "same business key and content is TRUE_DUPLICATE",
  );
  assert(
    classifyDuplicateRecords([duplicate, collision])[0]?.classification ===
      "BUSINESS_KEY_COLLISION",
    "same business key with different content is BUSINESS_KEY_COLLISION",
  );

  const idempotentRows = Array.from({ length: 352 }, (_, index) =>
    stagingRecord(index + 1, new Date(Date.UTC(2025, 0, index + 1)), index + 1),
  );
  const existing = idempotentRows.map((row) => ({
    sourceKey: sourceKeyForStagingRow(row),
    contentHash: contentHashForStagingRow(row),
  }));
  const idempotency = classifySyncRows(idempotentRows, existing);
  assert(idempotency.inserted === 0, "idempotent dry-run has zero inserts");
  assert(idempotency.updated === 0, "idempotent dry-run has zero updates");
  assert(idempotency.skipped === 352, "idempotent dry-run skips all 352 existing rows");
  assert(idempotency.duplicates.length === 0, "idempotent regression has no duplicate source keys");

  console.log(`BB legacy mapping regression: ${passed} assertions passed.`);
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : "BB mapping regression failed.");
  process.exitCode = 1;
}
