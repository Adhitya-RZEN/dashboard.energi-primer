import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CoalQualityStatus = "on_spec" | "perhatian" | "off_spec";

export type CoalQualityFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: bigint;
  status?: CoalQualityStatus;
  page?: number;
  perPage?: number;
};

function statusWhere(status: CoalQualityStatus): Prisma.CoalQualityWhereInput {
  const gar = new Prisma.Decimal(4700);
  const attention = new Prisma.Decimal(4500);

  if (status === "on_spec") {
    return { gar: { gte: gar } };
  }

  if (status === "perhatian") {
    return { gar: { gte: attention, lt: gar } };
  }

  return { gar: { lt: attention } };
}

function buildWhere(filters: CoalQualityFilters): Prisma.CoalQualityWhereInput {
  const where: Prisma.CoalQualityWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.unitId !== undefined) {
    where.unitId = filters.unitId;
  }

  if (filters.status) {
    Object.assign(where, statusWhere(filters.status));
  }

  return where;
}

export async function getCoalQualityPage(filters: CoalQualityFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, Math.max(1, filters.perPage ?? 15));
  const where = buildWhere(filters);

  const [records, total, onSpec, perhatian, offSpec, average, latest] =
    await Promise.all([
      prisma.coalQuality.findMany({
        where,
        orderBy: [{ date: "desc" }, { unit: { name: "asc" } }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          unit: {
            select: { code: true, name: true },
          },
        },
      }),
      prisma.coalQuality.count(),
      prisma.coalQuality.count({ where: statusWhere("on_spec") }),
      prisma.coalQuality.count({ where: statusWhere("perhatian") }),
      prisma.coalQuality.count({ where: statusWhere("off_spec") }),
      prisma.coalQuality.aggregate({ _avg: { gar: true } }),
      prisma.coalQuality.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ]);

  return {
    records,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
    summary: {
      totalEntries: total,
      onSpec,
      perhatian,
      offSpec,
      averageGar: average._avg.gar?.toDecimalPlaces(0) ?? null,
      latestDate: latest?.date ?? null,
    },
  };
}
