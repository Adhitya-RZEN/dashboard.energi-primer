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
  /** Explicit names make the automatic lifecycle observable without changing
   * the existing INSERT/UPDATE/SKIP writer contract. */
  newRows: ClassifiedSyncRow[];
  changedRows: ClassifiedSyncRow[];
  unchangedRows: ClassifiedSyncRow[];
  /** Source disappearance is evidence only; it never becomes a DELETE. */
  removedSourceKeys: string[];
  removed: number;
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
  const newRows: ClassifiedSyncRow[] = [];
  const changedRows: ClassifiedSyncRow[] = [];
  const unchangedRows: ClassifiedSyncRow[] = [];

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
    if (action === "INSERT") {
      inserted += 1;
      newRows.push({ row, sourceKey, contentHash, action });
    }
    if (action === "UPDATE") {
      updated += 1;
      changedRows.push({ row, sourceKey, contentHash, action });
    }
    if (action === "SKIP") {
      skipped += 1;
      unchangedRows.push({ row, sourceKey, contentHash, action });
    }
  }

  const seenExistingKeys = new Set(
    [...seen].filter((sourceKey) => existingByKey.has(sourceKey)),
  );
  const removedSourceKeys = existing
    .map((state) => state.sourceKey)
    .filter((sourceKey) => !seenExistingKeys.has(sourceKey));

  return {
    changes,
    duplicates,
    inserted,
    updated,
    skipped,
    newRows,
    changedRows,
    unchangedRows,
    removedSourceKeys,
    removed: removedSourceKeys.length,
  };
}
