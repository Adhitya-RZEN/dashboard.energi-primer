import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type {
  BiomassConsumptionImportRecord,
  BiomassReceiptImportRecord,
  CoalConsumptionImportRecord,
  CoalReceiptImportRecord,
  CoalStockImportRecord,
  GoogleSheetsImportPlan,
  HopImportRecord,
  ImportStagingRecord,
  SolarConsumptionImportRecord,
  SolarReceiptImportRecord,
} from "./types";

const UNIT_CODES = {
  1: "PLTU-1",
  2: "PLTU-2",
  3: "PLTU-3",
} as const;

function decimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(String(value));
}

function unitNumber(unit: { code: string; name: string }) {
  const identity = `${unit.code} ${unit.name}`.toUpperCase();
  const match = identity.match(/(?:PLTU|UNIT)[\s-]*([123])\b/);
  return match ? (Number(match[1]) as 1 | 2 | 3) : null;
}

async function resolveUnitIds() {
  const units = await prisma.unit.findMany({
    select: { id: true, code: true, name: true },
  });
  const resolved = new Map<1 | 2 | 3, bigint>();
  for (const unit of units) {
    const number = unitNumber(unit);
    if (number !== null) {
      if (resolved.has(number))
        throw new Error(`Duplicate database identity for Unit ${number}.`);
      resolved.set(number, unit.id);
    }
  }
  for (const number of [1, 2, 3] as const) {
    if (!resolved.has(number)) throw new Error(`Unit ${number} is not available.`);
  }
  return resolved;
}

function assertDatabaseTarget(allowNonLocalDatabase: boolean) {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is not configured.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }
  if (allowNonLocalDatabase) return;
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!localHosts.has(parsed.hostname) || databaseName !== "dashboard_pln") {
    throw new Error(
      "Import write hanya diizinkan pada database lokal dashboard_pln untuk tahap ini.",
    );
  }
}

function stagingData(
  rows: readonly ImportStagingRecord[],
  importRunId: bigint,
) {
  return rows.map((row) => {
    const unitMatch = row.unitCode?.match(/(?:UNIT|PLTU)[\s-]*([123])$/i);
    const unitNumber = unitMatch
      ? (Number(unitMatch[1]) as 1 | 2 | 3)
      : null;
    return {
      importRunId,
      entityType: row.entityType,
      sourceWorksheet: row.source.worksheet,
      sourceRow: row.source.row,
      sourceColumn: null,
      sourceAddress: row.source.cell,
      periodStart: row.periodStart,
      readingDate: row.readingDate,
      unitCode: unitNumber ? UNIT_CODES[unitNumber] : row.unitCode,
      supplierCode: row.supplierCode,
      rawValue: row.rawValue,
      normalizedValue: decimal(row.normalizedValue),
      valueUnit: row.valueUnit,
      validationStatus: row.validationStatus,
      validationMessage: row.validationMessage,
    };
  });
}

async function upsertBiomassReceipts(
  tx: Prisma.TransactionClient,
  rows: readonly BiomassReceiptImportRecord[],
  importRunId: bigint,
) {
  for (const row of rows) {
    await tx.biomassReceipt.upsert({
      where: {
        periodStart_supplierCode: {
          periodStart: row.periodStart,
          supplierCode: row.supplierCode,
        },
      },
      create: {
        importRunId,
        periodStart: row.periodStart,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        supplierName: row.supplierName,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

async function upsertCoalReceipts(
  tx: Prisma.TransactionClient,
  rows: readonly CoalReceiptImportRecord[],
  importRunId: bigint,
) {
  for (const row of rows) {
    await tx.coalReceipt.upsert({
      where: { periodStart: row.periodStart },
      create: {
        importRunId,
        periodStart: row.periodStart,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

async function upsertCoalConsumption(
  tx: Prisma.TransactionClient,
  rows: readonly CoalConsumptionImportRecord[],
  unitIds: Map<1 | 2 | 3, bigint>,
) {
  for (const row of rows) {
    const unitId = unitIds.get(row.unitNumber);
    if (!unitId) throw new Error(`Unit ${row.unitNumber} is not available.`);
    await tx.coalConsumption.upsert({
      where: { unitId_date: { unitId, date: row.readingDate } },
      create: {
        unitId,
        date: row.readingDate,
        coalUsed: decimal(row.quantityTon),
      },
      update: {
        coalUsed: decimal(row.quantityTon),
      },
    });
  }
}

async function upsertCoalStock(
  tx: Prisma.TransactionClient,
  rows: readonly CoalStockImportRecord[],
) {
  for (const row of rows) {
    if (row.closingStock === null) continue;
    await tx.coalStock.upsert({
      where: { date: row.readingDate },
      create: {
        date: row.readingDate,
        consumed: decimal(row.consumed) ?? new Prisma.Decimal(0),
        closingStock: decimal(row.closingStock) as Prisma.Decimal,
      },
      update: {
        consumed: decimal(row.consumed) ?? new Prisma.Decimal(0),
        closingStock: decimal(row.closingStock) as Prisma.Decimal,
      },
    });
  }
}

async function upsertBiomassConsumption(
  tx: Prisma.TransactionClient,
  rows: readonly BiomassConsumptionImportRecord[],
  importRunId: bigint,
  unitIds: Map<1 | 2 | 3, bigint>,
) {
  for (const row of rows) {
    const unitId = unitIds.get(row.unitNumber);
    if (!unitId) throw new Error(`Unit ${row.unitNumber} is not available.`);
    await tx.biomassConsumption.upsert({
      where: {
        unitId_readingDate: { unitId, readingDate: row.readingDate },
      },
      create: {
        importRunId,
        unitId,
        readingDate: row.readingDate,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        quantityTon: decimal(row.quantityTon),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

async function upsertSolarConsumption(
  tx: Prisma.TransactionClient,
  rows: readonly SolarConsumptionImportRecord[],
  importRunId: bigint,
) {
  for (const row of rows) {
    await tx.solarConsumption.upsert({
      where: { readingDate: row.readingDate },
      create: {
        importRunId,
        readingDate: row.readingDate,
        quantityLiter: decimal(row.quantityLiter),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        quantityLiter: decimal(row.quantityLiter),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

async function upsertSolarReceipt(
  tx: Prisma.TransactionClient,
  rows: readonly SolarReceiptImportRecord[],
  importRunId: bigint,
) {
  for (const row of rows) {
    await tx.solarReceipt.upsert({
      where: { periodStart: row.periodStart },
      create: {
        importRunId,
        periodStart: row.periodStart,
        quantityLiter: decimal(row.quantityLiter),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        quantityLiter: decimal(row.quantityLiter),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

async function upsertHop(
  tx: Prisma.TransactionClient,
  rows: readonly HopImportRecord[],
  importRunId: bigint,
  unitIds: Map<1 | 2 | 3, bigint>,
) {
  for (const row of rows) {
    const unitId = unitIds.get(row.unitNumber);
    if (!unitId) throw new Error(`Unit ${row.unitNumber} is not available.`);
    await tx.hopReading.upsert({
      where: { unitId_readingDate: { unitId, readingDate: row.readingDate } },
      create: {
        importRunId,
        unitId,
        readingDate: row.readingDate,
        hopDays: decimal(row.hopDays),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
      update: {
        importRunId,
        hopDays: decimal(row.hopDays),
        sourceSheet: row.source.worksheet,
        sourceCell: row.source.cell,
      },
    });
  }
}

export type ImportCommitOptions = {
  /** Manual CLI imports stay local-only; the authenticated sync orchestrator may opt in. */
  allowNonLocalDatabase?: boolean;
  source?: string;
};

export async function commitGoogleSheetsImportPlan(
  plan: GoogleSheetsImportPlan,
  options: ImportCommitOptions = {},
) {
  if (plan.status !== "READY_FOR_IMPORT")
    throw new Error("Import plan has blocking validation issues.");
  assertDatabaseTarget(options.allowNonLocalDatabase === true);
  const unitIds = await resolveUnitIds();
  const importRun = await prisma.spreadsheetImportRun.create({
    data: {
      source: options.source ?? "google_sheets_dynamic",
      requestedWorksheet: plan.requested.worksheet,
      effectiveWorksheet: plan.effective.worksheet,
      sourceRange: plan.sourceRange,
      requestedPeriod: plan.requestedPeriod,
      effectivePeriod: plan.effectivePeriod,
      status: "PROCESSING",
    },
    select: { id: true },
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.spreadsheetImportStaging.createMany({
          data: stagingData(plan.stagingRows, importRun.id),
        });
        await upsertBiomassReceipts(tx, plan.receiptRows, importRun.id);
        await upsertCoalReceipts(tx, plan.coalReceiptRows, importRun.id);
        await upsertCoalConsumption(
          tx,
          plan.coalConsumptionRows,
          unitIds,
        );
        await upsertCoalStock(tx, plan.coalStockRows);
        await upsertBiomassConsumption(
          tx,
          plan.biomassConsumptionRows,
          importRun.id,
          unitIds,
        );
        await upsertSolarConsumption(
          tx,
          plan.solarConsumptionRows,
          importRun.id,
        );
        await upsertSolarReceipt(tx, plan.solarReceiptRows, importRun.id);
        await upsertHop(tx, plan.hopRows, importRun.id, unitIds);

        for (const row of plan.targetRows) {
          const targetTon = new Prisma.Decimal(String(row.targetTon));
          const existing = await tx.biomassTarget.findUnique({
            where: { targetYear: row.targetYear },
            select: { targetTon: true },
          });
          if (existing && !existing.targetTon.equals(targetTon))
            throw new Error(
              `Existing Biomassa target for ${row.targetYear} differs from approved target.`,
            );
          await tx.biomassTarget.upsert({
            where: { targetYear: row.targetYear },
            create: {
              importRunId: importRun.id,
              targetYear: row.targetYear,
              targetTon,
              unit: "ton",
              source: `Google Sheets ${row.source.worksheet}`,
              status: "approved",
            },
            update: {
              importRunId: importRun.id,
              targetTon,
              unit: "ton",
              source: `Google Sheets ${row.source.worksheet}`,
              status: "approved",
            },
          });
        }

        for (const row of plan.cumulativeRows) {
          await tx.biomassCumulativeSnapshot.upsert({
            where: { periodStart: row.periodStart },
            create: {
              importRunId: importRun.id,
              periodStart: row.periodStart,
              cumulativeTon: decimal(row.cumulativeTon),
              source: `Google Sheets ${row.source.worksheet}`,
              sourceCell: row.source.cell,
            },
            update: {
              importRunId: importRun.id,
              cumulativeTon: decimal(row.cumulativeTon),
              source: `Google Sheets ${row.source.worksheet}`,
              sourceCell: row.source.cell,
            },
          });
        }

        await tx.spreadsheetImportRun.update({
          where: { id: importRun.id },
          data: {
            status: "SUCCESS",
            importedRows: plan.summary.totalRows,
            rejectedRows: 0,
            completedAt: new Date(),
            message: `Imported ${plan.summary.totalRows} validated rows from ${plan.effective.worksheet}.`,
          },
        });
      },
      { timeout: 30_000 },
    );
    return {
      status: "SUCCESS" as const,
      importRunId: importRun.id.toString(),
      importedRows: plan.summary.totalRows,
    };
  } catch (error) {
    await prisma.spreadsheetImportRun.update({
      where: { id: importRun.id },
      data: {
        status: "FAILED",
        rejectedRows: plan.summary.totalRows,
        completedAt: new Date(),
        message: "Import transaction failed; no normalized rows were committed.",
      },
    });
    throw error;
  }
}
