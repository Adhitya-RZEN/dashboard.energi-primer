import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import {
  withSyncDiagnostic,
  type SyncDiagnosticContext,
} from "./diagnostics";

const DEFAULT_LEASE_MS = 300_000;

/**
 * Resolves the stable source identity before lease acquisition. This is
 * deliberately separate from worksheet registry persistence: a failed lease
 * claim may bootstrap/update only the source identity and must never write
 * worksheet rows.
 */
export async function ensureSyncSourceForDiscovery(
  sourceKey: string,
  externalId: string,
  context?: SyncDiagnosticContext,
) {
  const source = await withSyncDiagnostic(
    context,
    "source_bootstrap",
    () =>
      prisma.syncSource.upsert({
        where: { sourceKey },
        create: {
          sourceKey,
          provider: "google_sheets",
          externalId,
          status: "ACTIVE",
        },
        update: {
          externalId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
  );
  return source.id;
}

export async function acquireSyncSourceLease(
  sourceId: bigint,
  leaseMs = DEFAULT_LEASE_MS,
) {
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);
  const result = await prisma.syncSource.updateMany({
    where: {
      id: sourceId,
      OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
    },
    data: { lockToken: token, lockExpiresAt: expiresAt },
  });
  return result.count === 1 ? { token, expiresAt } : null;
}

export async function releaseSyncSourceLease(sourceId: bigint, token: string) {
  await prisma.syncSource.updateMany({
    where: { id: sourceId, lockToken: token },
    data: { lockToken: null, lockExpiresAt: null },
  });
}

export async function renewSyncSourceLease(
  sourceId: bigint,
  token: string,
  leaseMs = DEFAULT_LEASE_MS,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);
  const result = await prisma.syncSource.updateMany({
    where: {
      id: sourceId,
      lockToken: token,
      lockExpiresAt: { gt: now },
    },
    data: { lockExpiresAt: expiresAt },
  });
  return result.count === 1 ? { token, expiresAt } : null;
}
