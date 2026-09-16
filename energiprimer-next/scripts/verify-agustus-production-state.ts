import { Prisma, PrismaClient } from "@prisma/client";

import {
  prepareSupabasePoolerProbeUrl,
  verifySupabaseProductionTarget,
} from "../src/services/google-sheets/sync/production-target";
import { safeErrorCategory } from "../src/lib/safe-error";

const rawPoolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
const worksheet = "Agustus26-BB";
const periodStart = new Date("2026-08-01T00:00:00.000Z");
const periodEnd = new Date("2026-09-01T00:00:00.000Z");
let client: PrismaClient | null = null;

try {
  const verifiedTarget = await verifySupabaseProductionTarget({
    rawUrl: rawPoolerUrl,
    connectionVariable: "SUPABASE_POOLER_URL",
  });
  client = new PrismaClient({
    datasourceUrl: prepareSupabasePoolerProbeUrl(rawPoolerUrl ?? ""),
  });
  const evidenceRows = await client.$queryRaw<
    Array<{ evidence: string; count: number }>
  >(Prisma.sql`
    WITH evidence AS (
      SELECT 'staging_source' AS evidence, COUNT(*)::int AS count
      FROM spreadsheet_import_staging
      WHERE source_worksheet = ${worksheet}
      UNION ALL
      SELECT 'biomass_receipts_period', COUNT(*)::int
      FROM biomass_receipts
      WHERE period_start >= ${periodStart}::date
        AND period_start < ${periodEnd}::date
      UNION ALL
      SELECT 'coal_receipts_period', COUNT(*)::int
      FROM coal_receipts
      WHERE period_start >= ${periodStart}::date
        AND period_start < ${periodEnd}::date
      UNION ALL
      SELECT 'biomass_consumptions_period', COUNT(*)::int
      FROM biomass_consumptions
      WHERE reading_date >= ${periodStart}::date
        AND reading_date < ${periodEnd}::date
      UNION ALL
      SELECT 'coal_consumption_period', COUNT(*)::int
      FROM coal_consumption
      WHERE date >= ${periodStart}::date
        AND date < ${periodEnd}::date
      UNION ALL
      SELECT 'coal_stock_period', COUNT(*)::int
      FROM coal_stock
      WHERE date >= ${periodStart}::date
        AND date < ${periodEnd}::date
      UNION ALL
      SELECT 'solar_receipts_period', COUNT(*)::int
      FROM solar_receipts
      WHERE period_start >= ${periodStart}::date
        AND period_start < ${periodEnd}::date
      UNION ALL
      SELECT 'solar_consumptions_period', COUNT(*)::int
      FROM solar_consumptions
      WHERE reading_date >= ${periodStart}::date
        AND reading_date < ${periodEnd}::date
      UNION ALL
      SELECT 'hop_period', COUNT(*)::int
      FROM hop_readings
      WHERE reading_date >= ${periodStart}::date
        AND reading_date < ${periodEnd}::date
      UNION ALL
      SELECT 'biomass_cumulative_period', COUNT(*)::int
      FROM biomass_cumulative_snapshots
      WHERE period_start >= ${periodStart}::date
        AND period_start < ${periodEnd}::date
      UNION ALL
      SELECT 'row_states', COUNT(*)::int
      FROM sync_row_states AS row_state
      INNER JOIN sync_worksheets AS registered
        ON registered.id = row_state.worksheet_id
      WHERE registered.worksheet_title = ${worksheet}
    )
    SELECT evidence, count
    FROM evidence
    ORDER BY evidence
  `);
  const duplicateRows = await client.$queryRaw<
    Array<{ duplicate_groups: bigint }>
  >(Prisma.sql`
    SELECT COALESCE(SUM(duplicate_groups), 0)::bigint AS duplicate_groups
    FROM (
      SELECT COUNT(*)::bigint AS duplicate_groups
      FROM (
        SELECT period_start, supplier_code
        FROM biomass_receipts
        GROUP BY period_start, supplier_code
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT period_start
        FROM coal_receipts
        GROUP BY period_start
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT unit_id, date
        FROM coal_consumption
        GROUP BY unit_id, date
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT date
        FROM coal_stock
        GROUP BY date
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT unit_id, reading_date
        FROM biomass_consumptions
        GROUP BY unit_id, reading_date
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT reading_date
        FROM solar_consumptions
        GROUP BY reading_date
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT period_start
        FROM solar_receipts
        GROUP BY period_start
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT unit_id, reading_date
        FROM hop_readings
        GROUP BY unit_id, reading_date
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT target_year
        FROM biomass_targets
        GROUP BY target_year
        HAVING COUNT(*) > 1
      ) duplicates
      UNION ALL
      SELECT COUNT(*)::bigint
      FROM (
        SELECT period_start
        FROM biomass_cumulative_snapshots
        GROUP BY period_start
        HAVING COUNT(*) > 1
      ) duplicates
    ) duplicate_key_groups
  `);
  const evidence = Object.fromEntries(
    evidenceRows.map((row) => [row.evidence, Number(row.count)]),
  );
  const duplicates = Number(duplicateRows[0]?.duplicate_groups ?? BigInt(0));
  if (Object.values(evidence).some((count) => count !== 0) || duplicates !== 0)
    throw new Error("Agustus Production read-only state is not clean.");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: "READ_ONLY_AGUSTUS_PRODUCTION_STATE",
        target: verifiedTarget.target,
        worksheet,
        records: 0,
        duplicates,
        evidence,
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
        status: "FAIL_READ_ONLY_AGUSTUS_PRODUCTION_STATE",
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
