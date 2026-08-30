import { GoogleSheetsIntegrationError } from "../src/lib/google-sheets";
import { commitGoogleSheetsImportPlan } from "../src/services/google-sheets/import/commit";
import { buildGoogleSheetsImportPlan } from "../src/services/google-sheets/import/plan";

function argument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isInteger(parsed))
    throw new Error(`Argument --${name} harus berupa bilangan bulat.`);
  return parsed;
}

function safeErrorCode(error: unknown) {
  if (error instanceof GoogleSheetsIntegrationError) return error.code;
  return "import_failed";
}

async function main() {
  if (!process.argv.includes("--commit")) {
    throw new Error("Import write membutuhkan flag --commit yang eksplisit.");
  }
  const month = argument("month", 7);
  const year = argument("year", 2026);
  const plan = await buildGoogleSheetsImportPlan({ month, year });
  if (plan.status !== "READY_FOR_IMPORT") {
    console.log(
      JSON.stringify(
        {
          status: "NEEDS_REVIEW",
          databaseWrites: 0,
          blockingIssues: plan.blockingIssues,
          warnings: plan.warnings,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }
  const result = await commitGoogleSheetsImportPlan(plan);
  console.log(
    JSON.stringify(
      {
        ...result,
        worksheet: plan.effective.worksheet,
        period: plan.effectivePeriod.toISOString().slice(0, 10),
        databaseWrites: result.importedRows,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAILED",
        databaseWrites: 0,
        errorCode: safeErrorCode(error),
        message: "Import Google Sheets gagal; detail sensitif disembunyikan.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
