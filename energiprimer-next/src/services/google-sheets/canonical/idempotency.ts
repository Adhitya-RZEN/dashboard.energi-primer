import "server-only";

import { prisma } from "@/lib/prisma";

import { createCompatibilityCanonicalBatchRepository } from "./compatibility-repository";
import {
  executeDurableCanonicalPlan,
  type DurableCanonicalExecutionResult,
} from "./ledger";
import { PrismaCanonicalLedgerStore } from "./ledger-prisma-store";
import type { CanonicalImportPlan } from "./types";
import type { GoogleSheetsImportPlan } from "../import/types";
import type { VerifiedSupabaseProductionTarget } from "../sync/production-target";

export type ImmutableCanonicalPlanIdempotencyResult = {
  status: "PASS" | "FAIL";
  mode: "SAME_IMMUTABLE_PLAN";
  businessWrites: number;
  samePlan: boolean;
  sameLedgerRun: boolean;
  reason?: string;
};

function failed(reason: string): ImmutableCanonicalPlanIdempotencyResult {
  return {
    status: "FAIL",
    mode: "SAME_IMMUTABLE_PLAN",
    businessWrites: 0,
    samePlan: false,
    sameLedgerRun: false,
    reason,
  };
}

function passed(
  repeat: DurableCanonicalExecutionResult,
  ledgerRunId: string,
  planHash: string,
): ImmutableCanonicalPlanIdempotencyResult {
  const samePlan = repeat.planHash === planHash;
  const sameLedgerRun = repeat.runId === ledgerRunId;
  return {
    status: repeat.status === "COMMITTED" && samePlan && sameLedgerRun ? "PASS" : "FAIL",
    mode: "SAME_IMMUTABLE_PLAN",
    businessWrites: 0,
    samePlan,
    sameLedgerRun,
    ...(repeat.status === "COMMITTED"
      ? {}
      : { reason: repeat.reason ?? "Durable immutable-plan replay did not commit." }),
  };
}

/**
 * Replays an already committed immutable plan through the durable ledger.
 * A RECONCILED run is returned by the ledger without calling the business
 * repository, so this proves idempotency without issuing a second canary.
 */
export async function verifyImmutableCanonicalPlanIdempotency(input: {
  plan: CanonicalImportPlan;
  basePlan: GoogleSheetsImportPlan;
  productionTarget: VerifiedSupabaseProductionTarget;
}): Promise<ImmutableCanonicalPlanIdempotencyResult> {
  const ledgerRun = await prisma.canonicalImportRun.findUnique({
    where: { planHash: input.plan.planHash },
    select: { id: true, status: true },
  });
  if (!ledgerRun) {
    return failed("The first canonical ledger run was not found for immutable-plan replay.");
  }
  if (ledgerRun.status !== "RECONCILED") {
    return failed(`The first canonical ledger run is ${ledgerRun.status}, not RECONCILED.`);
  }

  try {
    const repository = createCompatibilityCanonicalBatchRepository({
      basePlan: input.basePlan,
      databaseTarget: "SUPABASE_PRODUCTION",
      productionTarget: input.productionTarget,
      canary: true,
    });
    const repeat = await executeDurableCanonicalPlan(input.plan, {
      store: new PrismaCanonicalLedgerStore(),
      repository,
      reconcileTarget: repository.reconcileTarget,
    });
    return passed(repeat, ledgerRun.id.toString(), input.plan.planHash);
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Immutable-plan replay failed.");
  }
}
