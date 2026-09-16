import "server-only";

import { prisma } from "@/lib/prisma";

import type {
  CanonicalEntity,
  CanonicalRecord,
  CanonicalValueByEntity,
} from "./types";
import {
  absentTargetStateForRecord,
  comparableTargetValues,
  targetModelForEntity,
  targetVersionMarker,
  TARGET_NOT_AVAILABLE,
  type CanonicalTargetProvenance,
  type CanonicalTargetState,
} from "./target-state";

type TargetRow = {
  id: bigint;
  updatedAt: Date | null;
  sourceSheet?: string | null;
  source?: string | null;
  sourceCell?: string | null;
  importRunId?: bigint | null;
};

export type CanonicalTargetStateReadResult = {
  status: "PASS" | "BLOCKED";
  states: readonly CanonicalTargetState[];
  lookupQueries: number;
  durationMs: number;
  blockers: readonly string[];
};

function datePart(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateFromCanonical(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function unitNumberFromCode(code: string) {
  const match = code.match(/^PLTU-([123])$/u);
  return match ? (Number(match[1]) as 1 | 2 | 3) : null;
}

function groupRows<T extends { id: bigint }>(
  rows: readonly T[],
  key: (row: T) => string,
) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(key(row)) ?? [];
    values.push(row);
    grouped.set(key(row), values);
  }
  return grouped;
}

function sourceTitle(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return TARGET_NOT_AVAILABLE;
  return trimmed.replace(/^Google Sheets\s+/iu, "").trim() || TARGET_NOT_AVAILABLE;
}

function provenanceFor(
  record: CanonicalRecord,
  row: TargetRow | null,
  authority: CanonicalTargetProvenance["authority"],
): CanonicalTargetProvenance {
  const worksheetTitle = sourceTitle(row?.sourceSheet ?? row?.source);
  const conflict = worksheetTitle !== TARGET_NOT_AVAILABLE &&
    worksheetTitle.toLocaleLowerCase("en-US") !==
      record.source.worksheetTitleSnapshot.trim().toLocaleLowerCase("en-US");
  return {
    authority,
    sourceKey: TARGET_NOT_AVAILABLE,
    spreadsheetId: TARGET_NOT_AVAILABLE,
    sheetId: TARGET_NOT_AVAILABLE,
    worksheetTitle,
    sourceCell: row?.sourceCell?.trim() || TARGET_NOT_AVAILABLE,
    importRunId: row?.importRunId?.toString() ?? TARGET_NOT_AVAILABLE,
    conflict,
  };
}

function stateFromRows(
  record: CanonicalRecord,
  rows: readonly TargetRow[],
  makeValue: (row: TargetRow) => CanonicalRecord["value"],
  authority: CanonicalTargetProvenance["authority"],
): CanonicalTargetState {
  if (rows.length === 0) return absentTargetStateForRecord(record);
  if (rows.length > 1) {
    return {
      ...absentTargetStateForRecord(record),
      existence: "AMBIGUOUS",
      matchedRowCount: rows.length,
      values: {},
      provenance: provenanceFor(record, null, authority),
      blockingIssues: ["IDENTITY_CONFLICT"],
    };
  }
  const row = rows[0];
  if (!row) return absentTargetStateForRecord(record);
  const canonicalValue = makeValue(row);
  const values = comparableTargetValues({
    entity: record.entity,
    value: canonicalValue,
  });
  const businessKey = record.businessIdentity.canonicalKey;
  return {
    entity: record.entity,
    targetModel: targetModelForEntity(record.entity),
    businessIdentity: record.businessIdentity,
    existence: "PRESENT",
    matchedRowCount: 1,
    canonicalValue,
    values,
    provenance: provenanceFor(record, row, authority),
    // The current normalized tables do not retain a separate sync-completion
    // timestamp. Do not mistake the row's update timestamp for last sync.
    lastKnownSyncState: TARGET_NOT_AVAILABLE,
    lastSyncAt: TARGET_NOT_AVAILABLE,
    versionMarker: targetVersionMarker(
      targetModelForEntity(record.entity),
      businessKey,
      values,
    ),
    targetId: row.id.toString(),
    blockingIssues: [],
  };
}

function unitRecords(records: readonly CanonicalRecord[]) {
  return records.filter(
    (record) =>
      record.entity === "biomass_consumption" ||
      record.entity === "coal_consumption" ||
      record.entity === "hop_reading",
  );
}

function pairWhere<T extends { unitId: bigint; date?: Date; readingDate?: Date }>(
  records: readonly CanonicalRecord[],
  unitIds: ReadonlyMap<1 | 2 | 3, bigint>,
  dateField: "date" | "readingDate",
) {
  return records.flatMap((record) => {
    const value = record.value as {
      unitNumber: 1 | 2 | 3;
      readingDate: string;
    };
    const unitId = unitIds.get(value.unitNumber);
    if (unitId === undefined) return [];
    return [{ unitId, [dateField]: dateFromCanonical(value.readingDate) } as T];
  });
}

function periodWhere(
  records: readonly CanonicalRecord[],
  field: "periodStart" | "readingDate",
) {
  return records.map((record) => {
    const value = record.value as { periodStart?: string; readingDate?: string };
    return dateFromCanonical(
      (field === "periodStart" ? value.periodStart : value.readingDate) as string,
    );
  });
}

function recordsFor(records: readonly CanonicalRecord[], entity: CanonicalEntity) {
  return records.filter((record) => record.entity === entity);
}

/**
 * Reads target state in a bounded set of queries: one exact Unit lookup plus
 * at most one query per canonical entity represented in the plan. It never
 * uses worksheet row position, display labels, or sync-row state as target
 * identity.
 */
export async function loadCanonicalTargetStates(
  records: readonly CanonicalRecord[],
): Promise<CanonicalTargetStateReadResult> {
  const startedAt = performance.now();
  if (records.length === 0) {
    return {
      status: "PASS",
      states: [],
      lookupQueries: 0,
      durationMs: 0,
      blockers: [],
    };
  }

  const unitRecordList = unitRecords(records);
  const unitNumbers = [
    ...new Set(
      unitRecordList.map(
        (record) => (record.value as { unitNumber: 1 | 2 | 3 }).unitNumber,
      ),
    ),
  ];
  const unitRows = unitNumbers.length
    ? await prisma.unit.findMany({
        where: { code: { in: unitNumbers.map((number) => `PLTU-${number}`) } },
        select: { id: true, code: true },
      })
    : [];
  const unitIds = new Map<1 | 2 | 3, bigint>();
  for (const row of unitRows) {
    const number = unitNumberFromCode(row.code);
    if (number !== null) unitIds.set(number, row.id);
  }

  const biomassConsumptionRecords = recordsFor(records, "biomass_consumption");
  const coalConsumptionRecords = recordsFor(records, "coal_consumption");
  const coalStockRecords = recordsFor(records, "coal_stock");
  const biomassReceiptRecords = recordsFor(records, "biomass_receipt");
  const coalReceiptRecords = recordsFor(records, "coal_receipt");
  const solarConsumptionRecords = recordsFor(records, "solar_consumption");
  const solarReceiptRecords = recordsFor(records, "solar_receipt");
  const hopRecords = recordsFor(records, "hop_reading");
  const targetRecords = recordsFor(records, "biomass_target");
  const cumulativeRecords = recordsFor(records, "biomass_cumulative");

  const biomassConsumptionRows = biomassConsumptionRecords.length &&
      unitIds.size
    ? await prisma.biomassConsumption.findMany({
        where: { OR: pairWhere(biomassConsumptionRecords, unitIds, "readingDate") },
        select: {
          id: true,
          unitId: true,
          readingDate: true,
          quantityTon: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const coalConsumptionRows = coalConsumptionRecords.length && unitIds.size
    ? await prisma.coalConsumption.findMany({
        where: { OR: pairWhere(coalConsumptionRecords, unitIds, "date") },
        select: { id: true, unitId: true, date: true, coalUsed: true, updatedAt: true },
      })
    : [];
  const coalStockRows = coalStockRecords.length
    ? await prisma.coalStock.findMany({
        where: { date: { in: periodWhere(coalStockRecords, "readingDate") } },
        select: { id: true, date: true, closingStock: true, consumed: true, updatedAt: true },
      })
    : [];
  const biomassReceiptRows = biomassReceiptRecords.length
    ? await prisma.biomassReceipt.findMany({
        where: {
          OR: biomassReceiptRecords.map((record) => {
            const value = record.value as CanonicalValueByEntity["biomass_receipt"];
            return {
              periodStart: dateFromCanonical(value.periodStart),
              supplierCode: value.supplierCode,
            };
          }),
        },
        select: {
          id: true,
          periodStart: true,
          supplierCode: true,
          supplierName: true,
          quantityTon: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const coalReceiptRows = coalReceiptRecords.length
    ? await prisma.coalReceipt.findMany({
        where: { periodStart: { in: periodWhere(coalReceiptRecords, "periodStart") } },
        select: {
          id: true,
          periodStart: true,
          quantityTon: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const solarConsumptionRows = solarConsumptionRecords.length
    ? await prisma.solarConsumption.findMany({
        where: { readingDate: { in: periodWhere(solarConsumptionRecords, "readingDate") } },
        select: {
          id: true,
          readingDate: true,
          quantityLiter: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const solarReceiptRows = solarReceiptRecords.length
    ? await prisma.solarReceipt.findMany({
        where: { periodStart: { in: periodWhere(solarReceiptRecords, "periodStart") } },
        select: {
          id: true,
          periodStart: true,
          quantityLiter: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const hopRows = hopRecords.length && unitIds.size
    ? await prisma.hopReading.findMany({
        where: { OR: pairWhere(hopRecords, unitIds, "readingDate") },
        select: {
          id: true,
          unitId: true,
          readingDate: true,
          hopDays: true,
          sourceSheet: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const targetRows = targetRecords.length
    ? await prisma.biomassTarget.findMany({
        where: {
          targetYear: {
            in: targetRecords.map(
              (record) => (record.value as CanonicalValueByEntity["biomass_target"]).targetYear,
            ),
          },
        },
        select: {
          id: true,
          targetYear: true,
          targetTon: true,
          source: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];
  const cumulativeRows = cumulativeRecords.length
    ? await prisma.biomassCumulativeSnapshot.findMany({
        where: { periodStart: { in: periodWhere(cumulativeRecords, "periodStart") } },
        select: {
          id: true,
          periodStart: true,
          cumulativeTon: true,
          source: true,
          sourceCell: true,
          importRunId: true,
          updatedAt: true,
        },
      })
    : [];

  const biomassConsumptionByKey = groupRows(
    biomassConsumptionRows,
    (row) => `${row.unitId}|${datePart(row.readingDate)}`,
  );
  const coalConsumptionByKey = groupRows(
    coalConsumptionRows,
    (row) => `${row.unitId}|${datePart(row.date)}`,
  );
  const coalStockByKey = groupRows(coalStockRows, (row) => datePart(row.date));
  const biomassReceiptByKey = groupRows(
    biomassReceiptRows,
    (row) => `${datePart(row.periodStart)}|${row.supplierCode.trim().toLocaleLowerCase("en-US")}`,
  );
  const coalReceiptByKey = groupRows(coalReceiptRows, (row) => datePart(row.periodStart));
  const solarConsumptionByKey = groupRows(solarConsumptionRows, (row) => datePart(row.readingDate));
  const solarReceiptByKey = groupRows(solarReceiptRows, (row) => datePart(row.periodStart));
  const hopByKey = groupRows(hopRows, (row) => `${row.unitId}|${datePart(row.readingDate)}`);
  const targetByKey = groupRows(targetRows, (row) => String(row.targetYear));
  const cumulativeByKey = groupRows(cumulativeRows, (row) => datePart(row.periodStart));

  const states = records.map((record) => {
    const value = record.value as CanonicalValueByEntity[CanonicalEntity];
    switch (record.entity) {
      case "biomass_consumption": {
        const typed = value as CanonicalValueByEntity["biomass_consumption"];
        const unitId = unitIds.get(typed.unitNumber);
        if (unitId === undefined) {
          return {
            ...absentTargetStateForRecord(record),
            existence: "UNRESOLVED" as const,
            blockingIssues: ["IDENTITY_CONFLICT" as const],
          };
        }
        const rows = biomassConsumptionByKey.get(`${unitId}|${typed.readingDate}`) ?? [];
        return stateFromRows(
          record,
          rows,
          (row) => ({ ...typed, quantityTon: decimalNumber((row as typeof biomassConsumptionRows[number]).quantityTon) }),
          "GOOGLE_SHEETS",
        );
      }
      case "coal_consumption": {
        const typed = value as CanonicalValueByEntity["coal_consumption"];
        const unitId = unitIds.get(typed.unitNumber);
        if (unitId === undefined) {
          return {
            ...absentTargetStateForRecord(record),
            existence: "UNRESOLVED" as const,
            blockingIssues: ["IDENTITY_CONFLICT" as const],
          };
        }
        const rows = coalConsumptionByKey.get(`${unitId}|${typed.readingDate}`) ?? [];
        return stateFromRows(
          record,
          rows,
          (row) => ({ ...typed, quantityTon: decimalNumber((row as typeof coalConsumptionRows[number]).coalUsed) }),
          "DATABASE",
        );
      }
      case "coal_stock": {
        const typed = value as CanonicalValueByEntity["coal_stock"];
        return stateFromRows(
          record,
          coalStockByKey.get(typed.readingDate) ?? [],
          (row) => {
            const typedRow = row as typeof coalStockRows[number];
            return {
              ...typed,
              closingStock: decimalNumber(typedRow.closingStock) ?? 0,
              consumed: decimalNumber(typedRow.consumed) ?? 0,
            };
          },
          "DATABASE",
        );
      }
      case "biomass_receipt": {
        const typed = value as CanonicalValueByEntity["biomass_receipt"];
        const key = `${typed.periodStart}|${typed.supplierCode.trim().toLocaleLowerCase("en-US")}`;
        return stateFromRows(
          record,
          biomassReceiptByKey.get(key) ?? [],
          (row) => {
            const typedRow = row as typeof biomassReceiptRows[number];
            return {
              ...typed,
              supplierName: typedRow.supplierName,
              quantityTon: decimalNumber(typedRow.quantityTon),
            };
          },
          "GOOGLE_SHEETS",
        );
      }
      case "coal_receipt": {
        const typed = value as CanonicalValueByEntity["coal_receipt"];
        return stateFromRows(
          record,
          coalReceiptByKey.get(typed.periodStart) ?? [],
          (row) => ({ ...typed, quantityTon: decimalNumber((row as typeof coalReceiptRows[number]).quantityTon) }),
          "GOOGLE_SHEETS",
        );
      }
      case "solar_consumption": {
        const typed = value as CanonicalValueByEntity["solar_consumption"];
        return stateFromRows(
          record,
          solarConsumptionByKey.get(typed.readingDate) ?? [],
          (row) => ({ ...typed, quantityLiter: decimalNumber((row as typeof solarConsumptionRows[number]).quantityLiter) }),
          "GOOGLE_SHEETS",
        );
      }
      case "solar_receipt": {
        const typed = value as CanonicalValueByEntity["solar_receipt"];
        return stateFromRows(
          record,
          solarReceiptByKey.get(typed.periodStart) ?? [],
          (row) => ({ ...typed, quantityLiter: decimalNumber((row as typeof solarReceiptRows[number]).quantityLiter) }),
          "GOOGLE_SHEETS",
        );
      }
      case "hop_reading": {
        const typed = value as CanonicalValueByEntity["hop_reading"];
        const unitId = unitIds.get(typed.unitNumber);
        if (unitId === undefined) {
          return {
            ...absentTargetStateForRecord(record),
            existence: "UNRESOLVED" as const,
            blockingIssues: ["IDENTITY_CONFLICT" as const],
          };
        }
        return stateFromRows(
          record,
          hopByKey.get(`${unitId}|${typed.readingDate}`) ?? [],
          (row) => ({ ...typed, hopDays: decimalNumber((row as typeof hopRows[number]).hopDays) }),
          "GOOGLE_SHEETS",
        );
      }
      case "biomass_target": {
        const typed = value as CanonicalValueByEntity["biomass_target"];
        return stateFromRows(
          record,
          targetByKey.get(String(typed.targetYear)) ?? [],
          (row) => ({ ...typed, targetTon: decimalNumber((row as typeof targetRows[number]).targetTon) ?? 0 }),
          "GOOGLE_SHEETS",
        );
      }
      case "biomass_cumulative": {
        const typed = value as CanonicalValueByEntity["biomass_cumulative"];
        return stateFromRows(
          record,
          cumulativeByKey.get(typed.periodStart) ?? [],
          (row) => ({ ...typed, cumulativeTon: decimalNumber((row as typeof cumulativeRows[number]).cumulativeTon) }),
          "GOOGLE_SHEETS",
        );
      }
    }
  });
  const blockers = states
    .filter((state) => state.existence === "AMBIGUOUS" || state.existence === "UNRESOLVED")
    .map((state) => `${state.entity}:${state.businessIdentity.canonicalKey}`);
  const representedEntities = new Set(records.map((record) => record.entity));
  const lookupQueries = (unitRecordList.length > 0 ? 1 : 0) + representedEntities.size;
  return {
    status: blockers.length === 0 ? "PASS" : "BLOCKED",
    states,
    lookupQueries,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    blockers,
  };
}
