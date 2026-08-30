import assert from "node:assert/strict";
import {
  compareLegacyDynamic,
  parseDynamicWorksheet,
  previousValidBBWorksheets,
  resolveBBWorksheet,
} from "../src/services/google-sheets/dynamic/index";
import type {
  DynamicSheetValue,
  LegacyBaseline,
} from "../src/services/google-sheets/dynamic/index";

function sheet(rowCount = 80, columnCount = 45) {
  return Array.from({ length: rowCount }, () =>
    Array<DynamicSheetValue>(columnCount).fill(null),
  );
}

function put(
  rows: DynamicSheetValue[][],
  row: number,
  column: number,
  value: DynamicSheetValue,
) {
  while (rows.length < row) rows.push([]);
  while (rows[row - 1].length < column) rows[row - 1].push(null);
  rows[row - 1][column - 1] = value;
}

function targetFixture(row: number, column: number, value: DynamicSheetValue) {
  const rows = sheet(35, 40);
  put(rows, row, column, "Target 2026");
  put(rows, row + 1, column, value);
  put(rows, row + 1, column + 1, "TON");
  return rows;
}

function dashboardFixture(labelColumn: number, value: number) {
  const rows = sheet(35, 40);
  put(rows, 10, labelColumn, "DASHBOARD");
  put(rows, 10, labelColumn + 2, "SATUAN");
  put(rows, 10, labelColumn + 3, "SUMBER DATA");
  put(rows, 10, labelColumn + 4, "STATUS");
  put(rows, 11, labelColumn, "TOTAL PEMAKAIAN BIOMASSA BULANAN");
  put(rows, 11, labelColumn + 2, "TON");
  put(rows, 11, labelColumn + 3, value);
  put(rows, 11, labelColumn + 4, "FLAT");
  return rows;
}

function regressionFixture() {
  const rows = sheet(45, 45);
  const headers: Array<[number, string]> = [
    [1, "TANGGAL"],
    [2, "BATUBARA UNIT 1"],
    [3, "BATUBARA UNIT 2"],
    [4, "BATUBARA UNIT 3"],
    [5, "TOTAL BATUBARA TON"],
    [6, "BIOMASSA UNIT 1"],
    [7, "BIOMASSA UNIT 2"],
    [8, "BIOMASSA UNIT 3"],
    [9, "STOK BATUBARA"],
    [10, "HOP UNIT 1"],
    [11, "HOP UNIT 2"],
    [12, "HOP UNIT 3"],
    [13, "SOLAR TOTAL"],
    [14, "SOLAR TOP UP"],
    [15, "PENERIMAAN BIOMASSA SAWDUST PT SYAHRONI"],
    [16, "PENERIMAAN BIOMASSA SAWDUST PT BINTANG"],
    [17, "PENERIMAAN BIOMASSA WOODCHIP PT SYAHRONI"],
    [18, "PENERIMAAN BIOMASSA WOODCHIP PT RAP"],
    [19, "PENERIMAAN BIOMASSA WOODCHIP CV MULTI PAKETINDO"],
    [20, "PENERIMAAN BIOMASSA LRUK"],
    [21, "PENERIMAAN BIOMASSA SRF"],
    [22, "PENERIMAAN BIOMASSA WOODCHIP"],
  ];
  for (const [column, value] of headers) put(rows, 1, column, value);
  put(rows, 2, 1, "28 Juli 2026");
  put(rows, 2, 2, "565,739");
  put(rows, 2, 3, "651,344");
  put(rows, 2, 4, "375,487");
  put(rows, 2, 5, "1592,570");
  put(rows, 2, 6, "74,800");
  put(rows, 2, 7, "47,600");
  put(rows, 2, 8, "61,200");
  put(rows, 2, 9, "19.152,296");
  put(rows, 2, 10, "31,9");
  put(rows, 2, 11, "16");
  put(rows, 2, 12, "10,64");
  put(rows, 2, 13, "854");
  put(rows, 2, 14, "25000");
  put(rows, 4, 1, "TOTAL");
  for (const [column, value] of [
    [6, "1566,500"],
    [7, "238,000"],
    [8, "1936,150"],
    [15, "400,000"],
    [16, "300,000"],
    [17, "500,000"],
    [18, "600,000"],
    [19, "500,000"],
    [20, "700,000"],
    [21, "223,460"],
    [22, "9000,000"],
  ] as const)
    put(rows, 4, column, value);

  const labelColumn = 20;
  put(rows, 10, labelColumn, "DASHBOARD");
  put(rows, 10, labelColumn + 2, "SATUAN");
  put(rows, 10, labelColumn + 3, "SUMBER DATA");
  put(rows, 10, labelColumn + 4, "STATUS");
  const dashboardRows: Array<[number, string, string, number | string]> = [
    [11, "TOTAL PENERIMAAN BIOMASSA BULANAN", "TON", 3223.46],
    [12, "TOTAL PEMAKAIAN BIOMASSA BULANAN", "TON", 195.2],
    [13, "PEMAKAIAN BIOMASSA UNIT 1 CURENT", "TON", "74,800"],
    [14, "PEMAKAIAN BIOMASSA UNIT 2 CURRENT", "TON", "47,600"],
    [15, "PEMAKAIAN BIOMASSA UNIT 3 CURENT", "TON", "61,200"],
    [16, "TOTAL PEMAKAIAN BATUBARA BULANAN", "TON", "34.940,444"],
    [17, "TOTAL PENERIMAAN BATUBARA BULANAN", "TON", "30.084,842"],
    [18, "PEMAKAIAN BATUBARA UNIT 1 CURENT", "TON", "565,739"],
    [19, "PEMAKAIAN BATUBARA UNIT 2 CURENT", "TON", "651,344"],
    [20, "PEMAKAIAN BATUBARA UNIT 3 CURENT", "TON", "375,487"],
    [21, "TOTAL PEMAKAIAN BATUBARA HARIAN", "TON", "1592,570"],
    [22, "STOK BATUBARA", "TON", "19.152,296"],
    [23, "HOP BATUBARA", "HARI", "10,64"],
    [24, "PEMAKAIAN SOLAR CH HARIAN", "LITER", 854],
    [25, "TOTAL PEMAKAIAN SOLAR BULANAN", "LITER", 24274],
    [26, "TOTAL PENERIMAAN SOLAR BULANAN", "LITER", 25000],
    [27, "TARGET PEMAKAIAN BIOMASSA", "TON", "70.020"],
    [28, "KUMULATIF PEMAKAIAN BIOMASSA", "TON", "29103,77"],
  ];
  for (const [row, label, unit, value] of dashboardRows) {
    put(rows, row, labelColumn, label);
    put(rows, row, labelColumn + 2, unit);
    put(rows, row, labelColumn + 3, value);
    put(rows, row, labelColumn + 4, "FLAT");
  }
  return rows;
}

const baseline: LegacyBaseline = {
  biomassReceiptMonthly: 3223.46,
  biomassConsumptionMonthly: 3740.65,
  coalConsumptionMonthly: 34940.444,
  coalReceiptMonthly: 30084.842,
  biomassUnit1Current: 74.8,
  biomassUnit2Current: 47.6,
  biomassUnit3Current: 61.2,
  coalUnit1Current: 565.739,
  coalUnit2Current: 651.344,
  coalUnit3Current: 375.487,
  coalDailyTotal: 1592.57,
  coalStock: 19152.296,
  coalHop: 10.64,
  solarConsumptionDaily: 854,
  solarConsumptionMonthly: 24274,
  solarReceiptMonthly: 25000,
  biomassTarget: 70020,
  biomassCumulative: 29103.77,
  biomassTargetProgress: 41.564938588974584,
  daily: {
    day: 28,
    coal: 1592.57,
    biomass: 183.6,
    stock: 19152.296,
    solar: 854,
    biomassUnit1: 74.8,
    biomassUnit2: 47.6,
    biomassUnit3: 61.2,
    coalUnit1: 565.739,
    coalUnit2: 651.344,
    coalUnit3: 375.487,
    hop1: 31.9,
    hop2: 16,
    hop3: 10.64,
  },
};

function runStaticTests() {
  const worksheet = resolveBBWorksheet(7, 2026);
  assert.equal(worksheet?.name, "Juli26-BB");
  assert.equal(resolveBBWorksheet(7, 2026, ["Juli26-DTS"]), null);
  const fallbackNames = previousValidBBWorksheets(7, 2026, 12).map(
    (item) => item.name,
  );
  assert.equal(fallbackNames.length, 12);
  assert.ok(fallbackNames.every((name) => /-BB$/.test(name)));
  assert.ok(!fallbackNames.some((name) => /DTS|ALBES|FLYASH/.test(name)));

  for (const [row, column] of [
    [5, 3],
    [12, 18],
    [22, 28],
  ] as const) {
    const parsed = parseDynamicWorksheet(targetFixture(row, column, "70,020"), {
      worksheetName: "Juli26-BB",
    });
    assert.equal(parsed.normalized.metrics.biomassTarget.value, 70020);
    assert.equal(parsed.normalized.metrics.biomassTarget.available, true);
  }

  for (const column of [5, 27]) {
    const parsed = parseDynamicWorksheet(dashboardFixture(column, 3740.65), {
      worksheetName: "Juli26-BB",
    });
    assert.equal(
      parsed.normalized.metrics.biomassConsumptionMonthly.value,
      3740.65,
    );
    assert.equal(
      parsed.normalized.metrics.biomassConsumptionMonthly.available,
      true,
    );
  }

  const regression = parseDynamicWorksheet(regressionFixture(), {
    worksheetName: "Juli26-BB",
  });
  const comparison = compareLegacyDynamic(regression, baseline);
  assert.equal(
    comparison.mismatchCount,
    0,
    JSON.stringify(comparison.rows, null, 2),
  );
  assert.equal(
    comparison.unresolvedCount,
    0,
    JSON.stringify(comparison.rows, null, 2),
  );
  assert.equal(comparison.pass, true);
  assert.equal(
    regression.aggregates.biomassSupplierReceiptMonthly.value,
    3223.46,
  );
  assert.equal(
    regression.aggregates.biomassSupplierReceiptMonthly.sourceAddresses?.length,
    7,
  );
  assert.equal(
    regression.aggregates.biomassUnitConsumptionMonthly.value,
    3740.65,
  );
  assert.equal(
    regression.normalized.metrics.biomassConsumptionMonthly.value,
    3740.65,
  );

  const duplicateUnitLabel = regressionFixture();
  put(
    duplicateUnitLabel,
    20,
    20,
    "PEMAKAIAN BATUBARA UNIT 2 CURENT",
  );
  const duplicateUnitResult = parseDynamicWorksheet(duplicateUnitLabel, {
    worksheetName: "Juli26-BB",
  });
  assert.equal(
    duplicateUnitResult.normalized.metrics.coalUnit3Current.value,
    375.487,
  );
  assert.ok(
    duplicateUnitResult.diagnostics.warnings.some((warning) =>
      warning.includes("dinormalisasi sebagai Unit 3"),
    ),
  );

  const receiptRowsOnly = regressionFixture();
  for (const column of [1, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22])
    put(receiptRowsOnly, 4, column, null);
  for (const [column, value] of [
    [15, "100,000"],
    [16, "200,000"],
    [17, "300,000"],
    [18, "400,000"],
    [19, "500,000"],
    [20, "600,000"],
    [21, "700,000"],
  ] as const)
    put(receiptRowsOnly, 2, column, value);
  const receiptRowsOnlyResult = parseDynamicWorksheet(receiptRowsOnly, {
    worksheetName: "Juli26-BB",
  });
  assert.equal(
    receiptRowsOnlyResult.aggregates.biomassSupplierReceiptMonthly.value,
    2800,
  );

  const incompleteReceiptSchema = regressionFixture();
  put(incompleteReceiptSchema, 1, 21, null);
  const incompleteReceiptResult = parseDynamicWorksheet(
    incompleteReceiptSchema,
    { worksheetName: "Juli26-BB" },
  );
  assert.equal(
    incompleteReceiptResult.aggregates.biomassSupplierReceiptMonthly.available,
    false,
  );
  assert.match(
    incompleteReceiptResult.aggregates.biomassSupplierReceiptMonthly.note ?? "",
    /6\/7/,
  );

  const legacyReceiptSchema = regressionFixture();
  for (const [column, value] of [
    [15, "PENERIMAAN BIOMASSA SAWDUST PT SRM"],
    [16, "PENERIMAAN BIOMASSA SAWDUST PT BRMS"],
    [17, "PENERIMAAN BIOMASSA WOODCHIP PT SRM"],
    [19, "PENERIMAAN BIOMASSA WOODCHIP CV MPI"],
    [20, "PENERIMAAN BIOMASSA LRUK BI"],
    [21, "PENERIMAAN BIOMASSA SRF TPA KONGOK"],
  ] as const)
    put(legacyReceiptSchema, 1, column, value);
  const legacyReceiptResult = parseDynamicWorksheet(legacyReceiptSchema, {
    worksheetName: "Juli26-BB",
  });
  assert.equal(
    legacyReceiptResult.aggregates.biomassSupplierReceiptMonthly.available,
    false,
  );
  assert.match(
    legacyReceiptResult.aggregates.biomassSupplierReceiptMonthly.note ?? "",
    /1\/7/,
  );

  const missing = parseDynamicWorksheet(targetFixture(5, 3, null), {
    worksheetName: "Juli26-BB",
  });
  assert.equal(missing.normalized.metrics.biomassTarget.available, false);
  assert.equal(missing.normalized.metrics.biomassTarget.value, null);
  const invalid = parseDynamicWorksheet(targetFixture(5, 3, "#DIV/0!"), {
    worksheetName: "Juli26-BB",
  });
  assert.equal(invalid.normalized.metrics.biomassTarget.available, false);
  assert.equal(invalid.normalized.metrics.biomassTarget.status, "malformed");

  const missingDaily = sheet(8, 8);
  put(missingDaily, 1, 1, "TANGGAL");
  put(missingDaily, 1, 2, "BATUBARA UNIT 1");
  put(missingDaily, 1, 3, "BATUBARA UNIT 2");
  put(missingDaily, 1, 4, "BATUBARA UNIT 3");
  put(missingDaily, 2, 1, "28 Juli 2026");
  put(missingDaily, 2, 2, "1");
  put(missingDaily, 2, 3, "2");
  put(missingDaily, 2, 4, "3");
  const missingDailyResult = parseDynamicWorksheet(missingDaily, {
    worksheetName: "Juli26-BB",
  });
  assert.equal(missingDailyResult.normalized.series[0]?.solar, null);
  assert.ok(
    missingDailyResult.diagnostics.warnings.some((warning) =>
      warning.includes("solar"),
    ),
  );

  const invalidWorksheet = parseDynamicWorksheet(targetFixture(5, 3, 70020), {
    worksheetName: "Juli26-DTS",
  });
  assert.equal(invalidWorksheet.worksheet.isValid, false);
  assert.ok(invalidWorksheet.diagnostics.errors.length > 0);

  const duplicate = dashboardFixture(5, 3740.65);
  put(duplicate, 12, 5, "TOTAL PEMAKAIAN BIOMASSA BULANAN");
  put(duplicate, 12, 7, "TON");
  put(duplicate, 12, 8, 100);
  put(duplicate, 12, 9, "FLAT");
  const duplicateResult = parseDynamicWorksheet(duplicate, {
    worksheetName: "Juli26-BB",
  });
  assert.equal(
    duplicateResult.normalized.metrics.biomassConsumptionMonthly.status,
    "ambiguous",
  );
}

async function runLiveVerification() {
  const { readAndParseDynamicBBWorksheet } =
    await import("../src/services/google-sheets/dynamic/reader");
  const result = await readAndParseDynamicBBWorksheet({ month: 7, year: 2026 });
  const comparison = compareLegacyDynamic(result.parsed, baseline, 0.01);
  const summary = comparison.rows.map((row) => ({
    field: row.field,
    legacy: row.legacyValue,
    dynamic: row.dynamicValue,
    difference: row.difference,
    confidence: row.confidence,
    source: row.source,
    status: row.status,
  }));
  console.log(
    JSON.stringify(
      {
        requested: result.requested,
        effective: result.effective,
        isFallback: result.isFallback,
        fallbackIndex: result.fallbackIndex,
        comparison: summary,
        aggregates: {
          biomassSupplierReceiptMonthly:
            result.parsed.aggregates.biomassSupplierReceiptMonthly.value,
          biomassUnitConsumptionMonthly:
            result.parsed.aggregates.biomassUnitConsumptionMonthly.value,
        },
        unresolved: result.parsed.diagnostics.unresolved,
        warnings: result.parsed.diagnostics.warnings,
      },
      null,
      2,
    ),
  );
  if (!comparison.pass) process.exitCode = 2;
}

runStaticTests();
console.log("Dynamic semantic parser static verification: PASS");
if (process.argv.includes("--live")) {
  await runLiveVerification();
}
