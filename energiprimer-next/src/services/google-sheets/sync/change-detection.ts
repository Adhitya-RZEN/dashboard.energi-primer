import "server-only";

import type { ImportStagingRecord } from "@/services/google-sheets/import/types";

import {
  contentHashForStagingRow,
  sourceKeyForStagingRow,
} from "./identity";
import type { SyncAction } from "./identity";

export type ExistingSyncRowState = {
  sourceKey: string;
  contentHash: string;
};

export type ClassifiedSyncRow = {
  row: ImportStagingRecord;
  sourceKey: string;
  contentHash: string;
  action: SyncAction;
};

export type SyncClassification = {
  changes: ClassifiedSyncRow[];
  duplicates: string[];
  inserted: number;
  updated: number;
  skipped: number;
};

export function classifySyncRows(
  rows: readonly ImportStagingRecord[],
  existing: readonly ExistingSyncRowState[],
): SyncClassification {
  const existingByKey = new Map(
    existing.map((state) => [state.sourceKey, state]),
  );
  const seen = new Set<string>();
  const changes: ClassifiedSyncRow[] = [];
  const duplicates: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const sourceKey = sourceKeyForStagingRow(row);
    const contentHash = contentHashForStagingRow(row);
    if (seen.has(sourceKey)) {
      duplicates.push(sourceKey);
      continue;
    }
    seen.add(sourceKey);
    const previous = existingByKey.get(sourceKey);
    const action: SyncAction = !previous
      ? "INSERT"
      : previous.contentHash === contentHash
        ? "SKIP"
        : "UPDATE";
    changes.push({ row, sourceKey, contentHash, action });
    if (action === "INSERT") inserted += 1;
    if (action === "UPDATE") updated += 1;
    if (action === "SKIP") skipped += 1;
  }

  return { changes, duplicates, inserted, updated, skipped };
}
