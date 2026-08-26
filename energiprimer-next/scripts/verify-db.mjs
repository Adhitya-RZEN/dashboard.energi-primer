import { PrismaClient, Prisma } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL belum diatur. Salin .env.example ke .env.local dan isi koneksi existing PostgreSQL.");
  process.exit(2);
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

function decimalToNumber(value) {
  return value === null ? null : Number(value);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

try {
  const [database, units, qualityCount, consumptionCount, stockCount, generationCount, targetCount] =
    await Promise.all([
      prisma.$queryRaw(Prisma.sql`SELECT current_database() AS database_name, current_schema() AS schema_name`),
      prisma.unit.findMany({
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, status: true },
      }),
      prisma.coalQuality.count(),
      prisma.coalConsumption.count(),
      prisma.coalStock.count(),
      prisma.powerGeneration.count(),
      prisma.kpiTarget.count(),
    ]);

  const [qualitySummary, qualityEquivalent] = await Promise.all([
    Promise.all([
      prisma.coalQuality.count({ where: { gar: { gte: new Prisma.Decimal(4700) } } }),
      prisma.coalQuality.count({ where: { gar: { gte: new Prisma.Decimal(4500), lt: new Prisma.Decimal(4700) } } }),
      prisma.coalQuality.count({ where: { gar: { lt: new Prisma.Decimal(4500) } } }),
      prisma.coalQuality.aggregate({ _count: { _all: true }, _avg: { gar: true } }),
    ]),
    prisma.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE gar >= 4700)::int AS on_spec,
        COUNT(*) FILTER (WHERE gar >= 4500 AND gar < 4700)::int AS perhatian,
        COUNT(*) FILTER (WHERE gar < 4500)::int AS off_spec,
        ROUND(AVG(gar)::numeric, 0) AS average_gar
      FROM coal_quality
    `),
  ]);

  const [onSpec, perhatian, offSpec, aggregate] = qualitySummary;
  const [equivalent] = qualityEquivalent;
  assertEqual("quality total", aggregate._count._all, equivalent.total);
  assertEqual("quality on_spec", onSpec, equivalent.on_spec);
  assertEqual("quality perhatian", perhatian, equivalent.perhatian);
  assertEqual("quality off_spec", offSpec, equivalent.off_spec);
  assertEqual("quality average_gar", decimalToNumber(aggregate._avg.gar?.toDecimalPlaces(0) ?? null), decimalToNumber(equivalent.average_gar));

  const orphanChecks = await Promise.all([
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count FROM coal_quality cq LEFT JOIN units u ON u.id = cq.unit_id WHERE u.id IS NULL`),
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count FROM coal_consumption cc LEFT JOIN units u ON u.id = cc.unit_id WHERE u.id IS NULL`),
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count FROM power_generation pg LEFT JOIN units u ON u.id = pg.unit_id WHERE u.id IS NULL`),
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count FROM kpi_targets kt LEFT JOIN units u ON u.id = kt.unit_id WHERE u.id IS NULL`),
  ]);

  for (const [index, result] of orphanChecks.entries()) {
    assertEqual(`orphan relation check ${index + 1}`, result[0].count, 0);
  }

  console.log(JSON.stringify({
    status: "PASS",
    database: database[0],
    counts: {
      units: units.length,
      coalQuality: qualityCount,
      coalConsumption: consumptionCount,
      coalStock: stockCount,
      powerGeneration: generationCount,
      kpiTargets: targetCount,
    },
    qualitySummary: {
      total: aggregate._count._all,
      onSpec,
      perhatian,
      offSpec,
      averageGar: decimalToNumber(aggregate._avg.gar?.toDecimalPlaces(0) ?? null),
    },
    checks: [
      "Prisma connection/read succeeded",
      "Laravel CoalDataController summary semantics match PostgreSQL equivalent query",
      "All tested unit foreign-key relationships have no orphan rows",
    ],
  }, null, 2));
} catch (error) {
  console.error("Database read verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
