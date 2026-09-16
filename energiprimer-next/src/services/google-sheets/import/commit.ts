import "server-only";

import { performance } from "node:perf_hooks";

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { contentHashForStagingRows } from "../sync/identity";
import {
  assertVerifiedSupabaseProductionTarget,
  verifySupabaseProductionTarget,
  type SyncDatabaseTarget,
  type VerifiedSupabaseProductionTarget,
} from "../sync/production-target";
import { assertProductionCanaryAuthorization } from "../sync/production-canary";
import { verifyCanonicalLedgerCapability } from "../canonical/ledger-prisma-store";
import { classifyRecoveryFailure } from "../canonical/recovery";
import {
  IMPORT_TRANSACTION_BATCH_SIZE,
  upsertBulkCumulativeRows,
  upsertBulkNormalizedRows,
} from "./bulk-upserts";
import type {
  GoogleSheetsImportPlan,
  ImportStagingRecord,
} from "./types";

const UNIT_CODES = {
  1: "PLTU-1",
  2: "PLTU-2",
  3: "PLTU-3",
} as const;

export const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
export const IMPORT_TRANSACTION_SAFETY_BUDGET_MS = 22_500;

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

export async function assertImportDatabaseTarget(options: ImportCommitOptions) {
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    const requestedTarget = assertVerifiedSupabaseProductionTarget(
      options.productionTarget,
    );
    const verifiedTarget = await verifySupabaseProductionTarget({
      rawUrl: process.env.DATABASE_URL,
      connectionVariable: "DATABASE_URL",
    });
    if (verifiedTarget.fingerprint !== requestedTarget.fingerprint)
      throw new Error("Verified Supabase Production target changed before write.");
    return;
  }

  const allowNonLocalDatabase =
    options.databaseTarget === "LOCAL" ? false : options.allowNonLocalDatabase;
  if (allowNonLocalDatabase === true)
    throw new Error(
      "Non-local import writes require a positively verified database target.",
    );

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is not configured.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }
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
      sourceColumn: row.source.column ?? null,
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

export type ImportCommitOptions = {
  /** Legacy local-only flag retained for existing local callers. */
  allowNonLocalDatabase?: boolean;
  /** A non-local write must identify the approved target explicitly. */
  databaseTarget?: SyncDatabaseTarget;
  productionTarget?: VerifiedSupabaseProductionTarget;
  /** Only the canonical batch adapter may invoke the Production writer. */
  canonicalBatch?: true;
  source?: string;
};

export async function commitGoogleSheetsImportPlan(
  plan: GoogleSheetsImportPlan,
  options: ImportCommitOptions = {},
) {
  if (plan.status !== "READY_FOR_IMPORT")
    throw new Error("Import plan has blocking validation issues.");
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    if (options.canonicalBatch !== true)
      throw new Error("Production writes must enter through a canonical durable batch.");
    assertProductionCanaryAuthorization(plan.summary.totalRows);
  }
  await assertImportDatabaseTarget(options);
  if (options.databaseTarget === "SUPABASE_PRODUCTION") {
    if (process.env.CANONICAL_IMPORT_LEDGER_ENABLED !== "true")
      throw new Error("Production writes require the Phase 5 durable ledger.");
    if (!(await verifyCanonicalLedgerCapability()))
      throw new Error("The Phase 5 durable ledger tables are unavailable on Production.");
  }
  const source = options.source ?? "google_sheets_dynamic";
  const checksum = contentHashForStagingRows(plan.stagingRows);
  const existingSuccessfulRun = await prisma.spreadsheetImportRun.findFirst({
    where: {
      source,
      requestedWorksheet: plan.requested.worksheet,
      effectiveWorksheet: plan.effective.worksheet,
      sourceRange: plan.sourceRange,
      requestedPeriod: plan.requestedPeriod,
      effectivePeriod: plan.effectivePeriod,
      checksum,
      status: "SUCCESS",
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, importedRows: true },
  });
  if (existingSuccessfulRun)
    return {
      status: "SUCCESS" as const,
      importRunId: existingSuccessfulRun.id.toString(),
      importedRows: existingSuccessfulRun.importedRows,
      transactionDurationMs: 0,
      transactionStatementCount: 0,
    };
  const unitIds = await resolveUnitIds();
  const importRun = await prisma.spreadsheetImportRun.create({
    data: {
      source,
      requestedWorksheet: plan.requested.worksheet,
      effectiveWorksheet: plan.effective.worksheet,
      sourceRange: plan.sourceRange,
      requestedPeriod: plan.requestedPeriod,
      effectivePeriod: plan.effectivePeriod,
      status: "PROCESSING",
      checksum,
    },
    select: { id: true },
  });

  try {
    let transactionStatementCount = 0;
    const transactionStartedAt = performance.now();
    await prisma.$transaction(
      async (tx) => {
        let statementCount = 0;
        for (
          let offset = 0;
          offset < plan.stagingRows.length;
          offset += IMPORT_TRANSACTION_BATCH_SIZE
        ) {
          await tx.spreadsheetImportStaging.createMany({
            data: stagingData(
              plan.stagingRows.slice(
                offset,
                offset + IMPORT_TRANSACTION_BATCH_SIZE,
              ),
              importRun.id,
            ),
          });
          statementCount += 1;
        }
        statementCount += await upsertBulkNormalizedRows(
          tx,
          plan,
          importRun.id,
          unitIds,
        );

        for (const row of plan.targetRows) {
          const targetTon = new Prisma.Decimal(String(row.targetTon));
          statementCount += 1;
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
          statementCount += 1;
        }

        statementCount += await upsertBulkCumulativeRows(
          tx,
          plan.cumulativeRows,
          importRun.id,
        );

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
        statementCount += 1;
        transactionStatementCount = statementCount;
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
    const transactionDurationMs = Math.round(
      performance.now() - transactionStartedAt,
    );
    return {
      status: "SUCCESS" as const,
      importRunId: importRun.id.toString(),
      importedRows: plan.summary.totalRows,
      transactionDurationMs,
      transactionStatementCount,
    };
  } catch (error) {
    const recovery = classifyRecoveryFailure(error);
    const unknownOutcome = recovery.status === "RECONCILIATION_REQUIRED";
    try {
      await prisma.spreadsheetImportRun.update({
        where: { id: importRun.id },
        data: {
          status: unknownOutcome ? "RECONCILIATION_REQUIRED" : "FAILED",
          // An unknown outcome is not equivalent to a fully rejected plan.
          rejectedRows: unknownOutcome ? 0 : plan.summary.totalRows,
          completedAt: new Date(),
          message: unknownOutcome
            ? "Import transaction outcome is unknown; reconciliation is required before retry."
            : "Import transaction failed; the bounded transaction was rolled back.",
        },
      });
    } catch {
      // Preserve the original commit error if the audit update is unavailable.
    }
    throw error;
  }
}
