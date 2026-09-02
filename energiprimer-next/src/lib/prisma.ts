import { PrismaClient } from "@prisma/client";
import "server-only";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Prisma's default error event includes provider/endpoint details. Keep
    // it disabled at the client boundary; callers expose safe categories.
    log: [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
