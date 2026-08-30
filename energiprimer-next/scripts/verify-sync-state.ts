import { prisma } from "../src/lib/prisma";

const source = await prisma.syncSource.findFirst({
  orderBy: { updatedAt: "desc" },
  select: { id: true },
});
if (!source) throw new Error("Sync source registry is empty.");

const [worksheetCount, activeCount, rowStateCount, latestRun, openSchemaChanges, locked] =
  await Promise.all([
    prisma.syncWorksheet.count({ where: { sourceId: source.id } }),
    prisma.syncWorksheet.count({ where: { sourceId: source.id, status: "ACTIVE" } }),
    prisma.syncRowState.count({ where: { worksheet: { sourceId: source.id } } }),
    prisma.syncRun.findFirst({
      where: { sourceId: source.id },
      orderBy: { startedAt: "desc" },
      select: { status: true, rowsScanned: true, skipped: true },
    }),
    prisma.syncSchemaChange.count({
      where: { worksheet: { sourceId: source.id }, status: "OPEN" },
    }),
    prisma.syncSource.count({
      where: { lockExpiresAt: { gt: new Date() } },
    }),
  ]);

if (worksheetCount < 1) throw new Error("No worksheets are registered.");
if (rowStateCount < 1) throw new Error("No row state has been persisted.");
if (!latestRun || !["SUCCESS", "PARTIAL"].includes(latestRun.status))
  throw new Error("Latest sync run is not successful or partial.");
if (locked !== 0) throw new Error("A sync source lease was left active.");

await prisma.$disconnect();
console.log(
  JSON.stringify(
    {
      status: "PASS",
      worksheetCount,
      activeCount,
      rowStateCount,
      latestRunStatus: latestRun.status,
      latestRunRows: latestRun.rowsScanned,
      latestRunSkipped: latestRun.skipped,
      openSchemaChanges,
      activeLeases: locked,
    },
    null,
    2,
  ),
);
