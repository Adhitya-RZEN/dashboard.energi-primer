import "server-only";

import { createHash } from "node:crypto";

import {
  getGoogleSheetsConfig,
  listGoogleSheetsWorksheets,
  type GoogleSheetsWorksheetMetadata,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { normalizeWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";

export const SYNC_WORKSHEET_STATUSES = [
  "DISCOVERED",
  "VALIDATED",
  "ACTIVE",
  "SCHEMA_REVIEW",
  "DISABLED",
  "MISSING",
  "ERROR",
] as const;

export type SyncWorksheetStatus = (typeof SYNC_WORKSHEET_STATUSES)[number];

export type ExistingWorksheetSnapshot = {
  worksheetKey: string;
  worksheetTitle: string;
  status: string;
};

export type WorksheetDiscoveryChange = {
  worksheetKey: string;
  title: string | null;
  type: "NEW" | "UNCHANGED" | "RENAMED" | "MISSING";
};

export type WorksheetDiscoveryDiff = {
  changes: WorksheetDiscoveryChange[];
  newCount: number;
  unchangedCount: number;
  renamedCount: number;
  missingCount: number;
};

export function stableGoogleSheetsSourceKey(spreadsheetId: string) {
  return createHash("sha256")
    .update(`google-sheets:${spreadsheetId}`)
    .digest("hex");
}

export function classifyWorksheetDiscovery(
  previous: readonly ExistingWorksheetSnapshot[],
  current: readonly GoogleSheetsWorksheetMetadata[],
): WorksheetDiscoveryDiff {
  const previousByKey = new Map(
    previous.map((worksheet) => [worksheet.worksheetKey, worksheet]),
  );
  const currentKeys = new Set(current.map((worksheet) => worksheet.sheetId));
  const changes: WorksheetDiscoveryChange[] = [];

  for (const worksheet of current) {
    const existing = previousByKey.get(worksheet.sheetId);
    if (!existing) {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "NEW",
      });
    } else if (existing.worksheetTitle !== worksheet.title) {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "RENAMED",
      });
    } else {
      changes.push({
        worksheetKey: worksheet.sheetId,
        title: worksheet.title,
        type: "UNCHANGED",
      });
    }
  }

  for (const worksheet of previous) {
    if (!currentKeys.has(worksheet.worksheetKey)) {
      changes.push({
        worksheetKey: worksheet.worksheetKey,
        title: null,
        type: "MISSING",
      });
    }
  }

  return {
    changes,
    newCount: changes.filter((change) => change.type === "NEW").length,
    unchangedCount: changes.filter((change) => change.type === "UNCHANGED")
      .length,
    renamedCount: changes.filter((change) => change.type === "RENAMED").length,
    missingCount: changes.filter((change) => change.type === "MISSING").length,
  };
}

function statusForExistingWorksheet(status: string | undefined): SyncWorksheetStatus {
  if (status === "MISSING") return "DISCOVERED";
  if (
    status &&
    (SYNC_WORKSHEET_STATUSES as readonly string[]).includes(status)
  ) {
    return status as SyncWorksheetStatus;
  }
  return "DISCOVERED";
}

export async function discoverGoogleSheetsWorksheets() {
  const config = getGoogleSheetsConfig();
  // The metadata request is deliberately completed before any database write.
  const current = await listGoogleSheetsWorksheets();
  const now = new Date();
  const sourceKey = stableGoogleSheetsSourceKey(config.spreadsheetId);

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.syncSource.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        provider: "google_sheets",
        externalId: config.spreadsheetId,
        status: "ACTIVE",
        lastDiscoveredAt: now,
      },
      update: {
        externalId: config.spreadsheetId,
        status: "ACTIVE",
        lastDiscoveredAt: now,
      },
      select: { id: true },
    });
    const previous = await tx.syncWorksheet.findMany({
      where: { sourceId: source.id },
      select: {
        worksheetKey: true,
        worksheetTitle: true,
        status: true,
      },
    });
    const diff = classifyWorksheetDiscovery(previous, current);
    const previousByKey = new Map(
      previous.map((worksheet) => [worksheet.worksheetKey, worksheet]),
    );

    for (const worksheet of current) {
      const existing = previousByKey.get(worksheet.sheetId);
      await tx.syncWorksheet.upsert({
        where: {
          sourceId_worksheetKey: {
            sourceId: source.id,
            worksheetKey: worksheet.sheetId,
          },
        },
        create: {
          sourceId: source.id,
          worksheetKey: worksheet.sheetId,
          worksheetTitle: worksheet.title,
          normalizedTitle: normalizeWorksheetName(worksheet.title),
          status: "DISCOVERED",
          firstSeenAt: now,
          lastSeenAt: now,
          rowCount: worksheet.rowCount ?? 0,
        },
        update: {
          worksheetTitle: worksheet.title,
          normalizedTitle: normalizeWorksheetName(worksheet.title),
          status: statusForExistingWorksheet(existing?.status),
          lastSeenAt: now,
          rowCount: worksheet.rowCount ?? 0,
        },
      });
    }

    for (const worksheet of previous) {
      if (!current.some((item) => item.sheetId === worksheet.worksheetKey)) {
        await tx.syncWorksheet.update({
          where: {
            sourceId_worksheetKey: {
              sourceId: source.id,
              worksheetKey: worksheet.worksheetKey,
            },
          },
          data: { status: "MISSING" },
        });
      }
    }

    return {
      sourceId: source.id.toString(),
      sourceKey,
      worksheetCount: current.length,
      diff,
    };
  }, { maxWait: 10_000, timeout: 60_000 });

  return result;
}

export async function getSyncSourceByKey(sourceKey: string) {
  return prisma.syncSource.findUnique({
    where: { sourceKey },
    include: { worksheets: { orderBy: { worksheetTitle: "asc" } } },
  });
}
