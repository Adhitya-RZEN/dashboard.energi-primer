import type {
  BusinessIdentity,
  CanonicalEntity,
  CanonicalErrorCode,
  CanonicalPlanOperation,
  CanonicalRecord,
  CanonicalValueByEntity,
  ExistingCanonicalState,
  SourceAuthority,
  SourceIdentity,
} from "./types";
import { businessIdentityForValue, contentHashForRecord, stableCanonicalHash } from "./identity";

export const TARGET_NOT_AVAILABLE = "NOT AVAILABLE" as const;

export type TargetScalar = string | number | null;
export type CanonicalTargetValues = Readonly<Record<string, TargetScalar>>;

export type CanonicalTargetExistence =
  | "ABSENT"
  | "PRESENT"
  | "AMBIGUOUS"
  | "UNRESOLVED";

export type CanonicalTargetProvenance = {
  authority: SourceAuthority;
  sourceKey: string;
  spreadsheetId: string;
  sheetId: string;
  worksheetTitle: string;
  sourceCell: string;
  importRunId: string;
  conflict: boolean;
};

export type CanonicalTargetState = {
  entity: CanonicalEntity;
  targetModel: string;
  businessIdentity: BusinessIdentity;
  existence: CanonicalTargetExistence;
  matchedRowCount: number;
  canonicalValue: CanonicalRecord["value"] | null;
  values: CanonicalTargetValues;
  provenance: CanonicalTargetProvenance;
  lastKnownSyncState: string;
  lastSyncAt: string;
  versionMarker: string;
  targetId: string;
  blockingIssues: readonly CanonicalErrorCode[];
};

export type CanonicalTargetDiffOperation =
  | "INSERT"
  | "UPDATE"
  | "NO-OP"
  | "SKIP"
  | "BLOCK";

export type CanonicalTargetDiff = {
  entity: CanonicalEntity;
  targetModel: string;
  businessKey: string;
  operation: CanonicalTargetDiffOperation;
  canonicalOperation: CanonicalPlanOperation;
  expectedValues: CanonicalTargetValues;
  actualValues: CanonicalTargetValues;
  existence: CanonicalTargetExistence;
  blockers: readonly CanonicalErrorCode[];
};

export type CanonicalTargetReconciliationResult = {
  status: "RECONCILED" | "RECONCILIATION_REQUIRED";
  planHash: string;
  importRunId: string;
  plannedCount: number;
  observedCount: number;
  duplicateCount: number;
  missingBusinessKeys: readonly string[];
  unexpectedBusinessKeys: readonly string[];
  ambiguousBusinessKeys: readonly string[];
  existenceMismatches: readonly string[];
  valueMismatches: readonly string[];
  provenanceMismatches: readonly string[];
  blockers: readonly string[];
  verifiedAt: string;
};

const TARGET_MODELS: Readonly<Record<CanonicalEntity, string>> = {
  biomass_consumption: "biomass_consumptions",
  coal_consumption: "coal_consumption",
  coal_stock: "coal_stock",
  biomass_receipt: "biomass_receipts",
  coal_receipt: "coal_receipts",
  solar_consumption: "solar_consumptions",
  solar_receipt: "solar_receipts",
  hop_reading: "hop_readings",
  biomass_target: "biomass_targets",
  biomass_cumulative: "biomass_cumulative_snapshots",
};

export function targetModelForEntity(entity: CanonicalEntity) {
  return TARGET_MODELS[entity];
}

/**
 * Returns only fields whose values are authoritative target data. Identity
 * fields are deliberately excluded from the value comparison because they
 * are checked separately through the canonical business key.
 */
export function comparableTargetValues(
  record: Pick<CanonicalRecord, "entity" | "value">,
): CanonicalTargetValues {
  const value = record.value as CanonicalValueByEntity[CanonicalEntity];
  switch (record.entity) {
    case "biomass_consumption":
    case "coal_consumption":
      return { quantityTon: (value as CanonicalValueByEntity["biomass_consumption"]).quantityTon };
    case "coal_stock":
      return {
        closingStock: (value as CanonicalValueByEntity["coal_stock"]).closingStock,
        consumed: (value as CanonicalValueByEntity["coal_stock"]).consumed,
      };
    case "biomass_receipt":
      return {
        supplierName: (value as CanonicalValueByEntity["biomass_receipt"]).supplierName,
        quantityTon: (value as CanonicalValueByEntity["biomass_receipt"]).quantityTon,
      };
    case "coal_receipt":
      return { quantityTon: (value as CanonicalValueByEntity["coal_receipt"]).quantityTon };
    case "solar_consumption":
      return { quantityLiter: (value as CanonicalValueByEntity["solar_consumption"]).quantityLiter };
    case "solar_receipt":
      return { quantityLiter: (value as CanonicalValueByEntity["solar_receipt"]).quantityLiter };
    case "hop_reading":
      return { hopDays: (value as CanonicalValueByEntity["hop_reading"]).hopDays };
    case "biomass_target":
      return { targetTon: (value as CanonicalValueByEntity["biomass_target"]).targetTon };
    case "biomass_cumulative":
      return { cumulativeTon: (value as CanonicalValueByEntity["biomass_cumulative"]).cumulativeTon };
  }
}

function scalarEqual(left: TargetScalar | undefined, right: TargetScalar | undefined) {
  if (left === null || right === null) return left === right;
  if (typeof left === "number" || typeof right === "number") {
    return typeof left === "number" && typeof right === "number" &&
      Number.isFinite(left) && Number.isFinite(right) && left === right;
  }
  return left === right;
}

export function targetValuesMatch(
  expected: CanonicalTargetValues,
  actual: CanonicalTargetValues,
) {
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  return expectedKeys.length === actualKeys.length &&
    expectedKeys.every(
      (key, index) => key === actualKeys[index] && scalarEqual(expected[key], actual[key]),
    );
}

export function targetVersionMarker(
  targetModel: string,
  businessKey: string,
  values: CanonicalTargetValues,
) {
  return stableCanonicalHash({ targetModel, businessKey, values });
}

function targetIssuesForRecord(record: CanonicalRecord) {
  const issues = new Set<CanonicalErrorCode>();
  if (
    record.validation.status === "BLOCKED" ||
    record.validation.status === "REJECTED" ||
    record.validation.status === "AMBIGUOUS" ||
    !record.validation.identityValid ||
    !record.validation.periodValid ||
    !record.validation.typeValid ||
    !record.validation.provenanceComplete
  ) {
    issues.add("VALIDATION_ERROR");
  }
  return issues;
}

export function classifyCanonicalTargetDiff(
  record: CanonicalRecord,
  state: CanonicalTargetState,
): CanonicalTargetDiff {
  const expectedValues = comparableTargetValues(record);
  const blockers = targetIssuesForRecord(record);
  if (state.targetModel !== targetModelForEntity(record.entity)) blockers.add("IDENTITY_CONFLICT");
  for (const issue of state.blockingIssues) blockers.add(issue);
  if (state.provenance.conflict) blockers.add("PROVENANCE_ERROR");

  if (blockers.size > 0 || state.existence === "AMBIGUOUS" || state.existence === "UNRESOLVED") {
    if (state.existence === "AMBIGUOUS" || state.existence === "UNRESOLVED") {
      blockers.add("IDENTITY_CONFLICT");
    }
    return {
      entity: record.entity,
      targetModel: targetModelForEntity(record.entity),
      businessKey: record.businessIdentity.canonicalKey,
      operation: "BLOCK",
      canonicalOperation: "BLOCK",
      expectedValues,
      actualValues: state.values,
      existence: state.existence,
      blockers: [...blockers],
    };
  }

  if (record.validation.status === "VALID_EMPTY") {
    return {
      entity: record.entity,
      targetModel: targetModelForEntity(record.entity),
      businessKey: record.businessIdentity.canonicalKey,
      operation: "SKIP",
      canonicalOperation: "SKIP",
      expectedValues,
      actualValues: state.values,
      existence: state.existence,
      blockers: [],
    };
  }

  if (state.existence === "ABSENT") {
    return {
      entity: record.entity,
      targetModel: targetModelForEntity(record.entity),
      businessKey: record.businessIdentity.canonicalKey,
      operation: "INSERT",
      canonicalOperation: "INSERT",
      expectedValues,
      actualValues: state.values,
      existence: state.existence,
      blockers: [],
    };
  }

  const same = targetValuesMatch(expectedValues, state.values);
  return {
    entity: record.entity,
    targetModel: targetModelForEntity(record.entity),
    businessKey: record.businessIdentity.canonicalKey,
    operation: same ? "NO-OP" : "UPDATE",
    canonicalOperation: same ? "SKIP" : "UPDATE",
    expectedValues,
    actualValues: state.values,
    existence: state.existence,
    blockers: [],
  };
}

function targetSourceIdentity(
  record: CanonicalRecord,
  state: CanonicalTargetState,
): SourceIdentity {
  return state.provenance.sourceKey === TARGET_NOT_AVAILABLE
    ? record.sourceIdentity
    : {
        sourceKey: state.provenance.sourceKey,
        spreadsheetId: state.provenance.spreadsheetId,
        sheetId: state.provenance.sheetId,
        worksheetTitleSnapshot: state.provenance.worksheetTitle,
        sourceOccurrenceKey: record.sourceOccurrenceKey,
        mappingVersion: record.mappingVersion,
        schemaVersion: record.schemaVersion,
      };
}

function targetValueForContentHash(record: CanonicalRecord, state: CanonicalTargetState) {
  if (!state.canonicalValue) return record.value;
  return state.canonicalValue;
}

export function existingCanonicalStateForTargetState(
  record: CanonicalRecord,
  state: CanonicalTargetState,
): ExistingCanonicalState | null {
  if (state.existence === "ABSENT") return null;
  const targetValue = targetValueForContentHash(record, state);
  const identity = businessIdentityForValue(
    record.entity,
    targetValue as CanonicalValueByEntity[typeof record.entity],
    record.businessIdentity.scope,
  );
  const contentHash = contentHashForRecord({
    ...record,
    value: targetValue,
    businessIdentity: identity,
  });
  return {
    businessIdentity: record.businessIdentity,
    contentHash,
    sourceIdentity: targetSourceIdentity(record, state),
    blockingIssues: [
      ...state.blockingIssues,
      ...(state.provenance.conflict ? (["PROVENANCE_ERROR"] as const) : []),
    ],
    targetModel: state.targetModel,
    targetExistence: state.existence,
  };
}

export function absentTargetStateForRecord(record: CanonicalRecord): CanonicalTargetState {
  return {
    entity: record.entity,
    targetModel: targetModelForEntity(record.entity),
    businessIdentity: record.businessIdentity,
    existence: "ABSENT",
    matchedRowCount: 0,
    canonicalValue: null,
    values: {},
    provenance: {
      authority: "DATABASE",
      sourceKey: TARGET_NOT_AVAILABLE,
      spreadsheetId: TARGET_NOT_AVAILABLE,
      sheetId: TARGET_NOT_AVAILABLE,
      worksheetTitle: TARGET_NOT_AVAILABLE,
      sourceCell: TARGET_NOT_AVAILABLE,
      importRunId: TARGET_NOT_AVAILABLE,
      conflict: false,
    },
    lastKnownSyncState: TARGET_NOT_AVAILABLE,
    lastSyncAt: TARGET_NOT_AVAILABLE,
    versionMarker: TARGET_NOT_AVAILABLE,
    targetId: TARGET_NOT_AVAILABLE,
    blockingIssues: [],
  };
}

/**
 * Compares actual target rows with the approved plan using canonical business
 * identities and values. This function is deliberately read-only: a mismatch
 * is evidence for `RECONCILIATION_REQUIRED`, never an instruction to repair.
 */
export function reconcileCanonicalTargetStates(
  plan: Pick<CanonicalImportPlanLike, "planHash" | "importRunId" | "items">,
  states: readonly CanonicalTargetState[],
  verifiedAt = new Date().toISOString(),
): CanonicalTargetReconciliationResult {
  const blockers = new Set<string>();
  const byKey = new Map<string, CanonicalTargetState>();
  const duplicateKeys = new Set<string>();
  for (const state of states) {
    const key = state.businessIdentity.canonicalKey;
    if (byKey.has(key)) duplicateKeys.add(key);
    else byKey.set(key, state);
  }
  const expectedByKey = new Map(plan.items.map((item) => [item.businessKey, item]));
  const missingBusinessKeys = plan.items
    .map((item) => item.businessKey)
    .filter((key) => !byKey.has(key));
  const unexpectedBusinessKeys = [...byKey.keys()].filter((key) => !expectedByKey.has(key));
  const ambiguousBusinessKeys: string[] = [];
  const existenceMismatches: string[] = [];
  const valueMismatches: string[] = [];
  const provenanceMismatches: string[] = [];

  for (const item of plan.items) {
    const state = byKey.get(item.businessKey);
    if (!state) continue;
    if (state.existence === "AMBIGUOUS" || state.existence === "UNRESOLVED") {
      ambiguousBusinessKeys.push(item.businessKey);
      continue;
    }
    if (state.provenance.conflict || state.blockingIssues.includes("PROVENANCE_ERROR")) {
      provenanceMismatches.push(item.businessKey);
    }
    if (item.record.validation.status === "VALID_EMPTY") continue;
    if (item.operation === "INSERT" || item.operation === "UPDATE") {
      if (state.existence !== "PRESENT") existenceMismatches.push(item.businessKey);
      else if (!targetValuesMatch(comparableTargetValues(item.record), state.values))
        valueMismatches.push(item.businessKey);
    } else if (item.operation === "SKIP") {
      // A planned SKIP is a no-op only when the target still exists with the
      // same values; an absent row is a reconciliation failure, not an insert.
      if (state.existence !== "PRESENT") existenceMismatches.push(item.businessKey);
      else if (!targetValuesMatch(comparableTargetValues(item.record), state.values))
        valueMismatches.push(item.businessKey);
    } else {
      blockers.add("PLAN_CONTAINS_BLOCKED_ITEM");
    }
  }
  if (duplicateKeys.size > 0) blockers.add("DUPLICATE_TARGET_IDENTITY");
  if (missingBusinessKeys.length > 0) blockers.add("MISSING_TARGET_IDENTITY");
  if (unexpectedBusinessKeys.length > 0) blockers.add("UNEXPECTED_TARGET_IDENTITY");
  if (ambiguousBusinessKeys.length > 0) blockers.add("AMBIGUOUS_TARGET_IDENTITY");
  if (existenceMismatches.length > 0) blockers.add("TARGET_EXISTENCE_MISMATCH");
  if (valueMismatches.length > 0) blockers.add("RECONCILIATION_MISMATCH");
  if (provenanceMismatches.length > 0) blockers.add("TARGET_PROVENANCE_MISMATCH");
  return {
    status: blockers.size === 0 ? "RECONCILED" : "RECONCILIATION_REQUIRED",
    planHash: plan.planHash,
    importRunId: plan.importRunId,
    plannedCount: plan.items.length,
    observedCount: states.length,
    duplicateCount: duplicateKeys.size,
    missingBusinessKeys,
    unexpectedBusinessKeys,
    ambiguousBusinessKeys,
    existenceMismatches,
    valueMismatches,
    provenanceMismatches,
    blockers: [...blockers],
    verifiedAt,
  };
}

type CanonicalImportPlanLike = {
  planHash: string;
  importRunId: string;
  items: readonly {
    businessKey: string;
    operation: CanonicalPlanOperation;
    record: CanonicalRecord;
  }[];
};
