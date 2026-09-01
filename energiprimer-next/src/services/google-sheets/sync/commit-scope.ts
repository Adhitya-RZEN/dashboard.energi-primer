import "server-only";

import type { GoogleSheetsImportPlan } from "@/services/google-sheets/import/types";
import { sourceKeyForImportRecord, sourceKeyForStagingRow } from "./identity";

type ImportRecord = Parameters<typeof sourceKeyForImportRecord>[0];

export function filterImportPlanToSourceKeys(
  plan: GoogleSheetsImportPlan,
  allowedSourceKeys: ReadonlySet<string>,
): GoogleSheetsImportPlan {
  const keep = <T>(rows: readonly T[], entityType: string) =>
    rows.filter((row) =>
      allowedSourceKeys.has(
        sourceKeyForImportRecord(row as ImportRecord, entityType),
      ),
    );

  const receiptRows = keep(plan.receiptRows, "biomass_receipt");
  const coalReceiptRows = keep(plan.coalReceiptRows, "coal_receipt");
  const coalConsumptionRows = keep(
    plan.coalConsumptionRows,
    "coal_consumption",
  );
  const coalStockRows = keep(plan.coalStockRows, "coal_stock");
  const biomassConsumptionRows = keep(
    plan.biomassConsumptionRows,
    "biomass_consumption",
  );
  const solarConsumptionRows = keep(
    plan.solarConsumptionRows,
    "solar_consumption",
  );
  const solarReceiptRows = keep(plan.solarReceiptRows, "solar_receipt");
  const hopRows = keep(plan.hopRows, "hop_reading");
  const targetRows = keep(plan.targetRows, "biomass_target");
  const cumulativeRows = keep(plan.cumulativeRows, "biomass_cumulative");
  const stagingRows = plan.stagingRows.filter((row) => {
    return allowedSourceKeys.has(sourceKeyForStagingRow(row));
  });

  return {
    ...plan,
    receiptRows,
    coalReceiptRows,
    coalConsumptionRows,
    coalStockRows,
    biomassConsumptionRows,
    solarConsumptionRows,
    solarReceiptRows,
    hopRows,
    targetRows,
    cumulativeRows,
    stagingRows,
    summary: {
      ...plan.summary,
      receiptRows: receiptRows.length,
      coalReceiptRows: coalReceiptRows.length,
      coalConsumptionRows: coalConsumptionRows.length,
      coalStockRows: coalStockRows.length,
      biomassConsumptionRows: biomassConsumptionRows.length,
      solarConsumptionRows: solarConsumptionRows.length,
      solarReceiptRows: solarReceiptRows.length,
      hopRows: hopRows.length,
      targetRows: targetRows.length,
      cumulativeRows: cumulativeRows.length,
      totalRows: stagingRows.length,
    },
  };
}
