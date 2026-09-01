import "server-only";

import { prisma } from "@/lib/prisma";

export async function listUnits() {
  return prisma.unit.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });
}

export async function listActiveUnits() {
  return prisma.unit.findMany({
    where: { status: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });
}
