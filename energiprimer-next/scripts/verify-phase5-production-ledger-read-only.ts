import { Prisma, PrismaClient } from "@prisma/client";

import {
  prepareSupabasePoolerProbeUrl,
  verifySupabaseProductionTarget,
} from "../src/services/google-sheets/sync/production-target";
import { safeErrorCategory } from "../src/lib/safe-error";

const rawPoolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
let client: PrismaClient | null = null;

try {
  const target = await verifySupabaseProductionTarget({
    rawUrl: rawPoolerUrl,
    connectionVariable: "SUPABASE_POOLER_URL",
  });
  client = new PrismaClient({
    datasourceUrl: prepareSupabasePoolerProbeUrl(rawPoolerUrl ?? ""),
  });
  const rows = await client.$queryRaw<Array<{ table_name: string }>>(
    Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('canonical_import_runs', 'canonical_import_batches')
      ORDER BY table_name
    `,
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: "READ_ONLY_PHASE5_LEDGER_CAPABILITY",
        target: target.target,
        targetIdentity: target.identity,
        ledgerTables: rows.map((row) => row.table_name),
        ledgerTablesPresent: rows.length === 2,
        productionWrites: 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL_READ_ONLY_PHASE5_LEDGER_CAPABILITY",
        category: safeErrorCategory(error),
        productionWrites: 0,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await client?.$disconnect();
}
