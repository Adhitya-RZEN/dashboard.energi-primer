import { GoogleSheetsIntegrationError } from "../src/lib/google-sheets";
import {
  APPROVED_BIOMASS_TARGET,
  buildGoogleSheetsImportPlan,
} from "../src/services/google-sheets/import/plan";

function argument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isInteger(parsed)) {
    throw new Error(`Argument --${name} harus berupa bilangan bulat.`);
  }
  return parsed;
}

function sum(values: readonly (number | null)[]) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function rounded(value: number | null, digits = 3) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function safeErrorCode(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) return error.code;
  return "unknown";
}

async function main() {
  const month = argument("month", 7);
  const year = argument("year", 2026);
  if (month < 1 || month > 12) {
    throw new Error("Argument --month harus berada pada rentang 1 sampai 12.");
  }
  if (year < 2000 || year > 2100) {
    throw new Error("Argument --year berada di luar rentang yang didukung.");
  }

  const plan = await buildGoogleSheetsImportPlan({ month, year });
  const target = plan.targetRows[0]?.targetTon ?? null;
  const cumulative = plan.cumulativeRows[0]?.cumulativeTon ?? null;
  const receiptTotal = sum(plan.receiptRows.map((row) => row.quantityTon));
  const consumptionTotal = sum(
    plan.biomassConsumptionRows.map((row) => row.quantityTon),
  );
  const progress =
    target !== null && cumulative !== null && target > 0
      ? Math.min(100, (cumulative / target) * 100)
      : null;

  console.log(
    JSON.stringify(
      {
        status: plan.status,
        mode: "dry-run",
        databaseWrites: 0,
        requested: plan.requested,
        effective: plan.effective,
        requestedPeriod: isoDate(plan.requestedPeriod),
        effectivePeriod: isoDate(plan.effectivePeriod),
        summary: plan.summary,
        normalizedPreview: {
          biomassReceiptMonthly: rounded(receiptTotal),
          biomassConsumptionMonthly: rounded(consumptionTotal),
          biomassTarget: target,
          approvedBiomassTarget: APPROVED_BIOMASS_TARGET,
          biomassCumulative: cumulative,
          biomassTargetProgress: progress,
        },
        source: {
          supplierCodes: plan.receiptRows.map((row) => row.supplierCode),
          sourceCells: plan.receiptRows
            .map((row) => row.source.cell)
            .filter((cell): cell is string => cell !== null),
        },
        diagnostics: {
          blockingIssues: plan.blockingIssues,
          warnings: plan.warnings,
        },
      },
      null,
      2,
    ),
  );
  if (plan.status !== "READY_FOR_IMPORT") process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAILED",
        mode: "dry-run",
        databaseWrites: 0,
        errorCode: safeErrorCode(error),
        message: "Google Sheets dry-run tidak dapat diselesaikan.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
