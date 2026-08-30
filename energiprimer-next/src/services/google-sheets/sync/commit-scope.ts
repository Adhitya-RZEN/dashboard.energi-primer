import "server-only";

import type { GoogleSheetsImportPlan } from "@/services/google-sheets/import/types";
import { sourceKeyForImportRecord } from "./identity";

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

  return {
    ...plan,
    receiptRows: keep(plan.receiptRows, "biomass_receipt"),
    coalReceiptRows: keep(plan.coalReceiptRows, "coal_receipt"),
    coalConsumptionRows: keep(plan.coalConsumptionRows, "coal_consumption"),
    coalStockRows: keep(plan.coalStockRows, "coal_stock"),
    biomassConsumptionRows: keep(
      plan.biomassConsumptionRows,
      "biomass_consumption",
    ),
    solarConsumptionRows: keep(
      plan.solarConsumptionRows,
      "solar_consumption",
    ),
    solarReceiptRows: keep(plan.solarReceiptRows, "solar_receipt"),
    hopRows: keep(plan.hopRows, "hop_reading"),
    targetRows: keep(plan.targetRows, "biomass_target"),
    cumulativeRows: keep(plan.cumulativeRows, "biomass_cumulative"),
  };
}
