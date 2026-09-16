import type {
  CanonicalImportPlan,
  CanonicalImportPlanItem,
  CanonicalOperationCounts,
  CanonicalPlanOperation,
  CanonicalRecord,
  ExistingCanonicalState,
  SourceManifest,
  SourceObservation,
  CanonicalErrorCode,
  ApprovedMappingContract,
} from "./types";
import { assertApprovedMappingForWrite, mappingFieldsForEntity } from "./mapping-contract";
import { assertWritableSourceManifest } from "./source-manifest";
import {
  businessIdentityForRecord,
  contentHashForRecord,
  sourceOccurrenceKeyForRecord,
  stableCanonicalHash,
} from "./identity";
import { canonicalRecordsFromImportPlan } from "./from-import-plan";
import type { GoogleSheetsImportPlan } from "../import/types";

export class CanonicalPlanError extends Error {
  readonly code = "PLAN_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalPlanError";
  }
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function emptyOperationCounts(): CanonicalOperationCounts {
  return { INSERT: 0, UPDATE: 0, SKIP: 0, BLOCK: 0 };
}

function operationFor(
  record: CanonicalRecord,
  existing: ExistingCanonicalState | undefined,
  sourceManifest: SourceManifest,
  contractIssues: readonly CanonicalErrorCode[] = [],
): { operation: CanonicalPlanOperation; issues: readonly CanonicalErrorCode[] } {
  const issues: CanonicalErrorCode[] = [...contractIssues];
  if (existing?.blockingIssues) issues.push(...existing.blockingIssues);
  if (
    record.validation.status === "BLOCKED" ||
    record.validation.status === "REJECTED" ||
    record.validation.status === "AMBIGUOUS" ||
    !record.validation.identityValid ||
    !record.validation.periodValid ||
    !record.validation.typeValid ||
    !record.validation.provenanceComplete
  ) {
    issues.push("VALIDATION_ERROR");
  }
  if (issues.length > 0) return { operation: "BLOCK", issues };
  if (record.validation.status === "VALID_EMPTY") return { operation: "SKIP", issues: [] };
  if (!existing) return { operation: "INSERT", issues: [] };
  if (existing.sourceIdentity.sourceKey !== sourceManifest.sourceKey) {
    const precedence = sourceManifest.ownership.sourcePrecedence;
    const currentIndex = precedence?.indexOf(sourceManifest.sourceKey) ?? -1;
    const existingIndex = precedence?.indexOf(existing.sourceIdentity.sourceKey) ?? -1;
    if (currentIndex < 0 || existingIndex < 0 || currentIndex >= existingIndex) {
      return { operation: "BLOCK", issues: ["IDENTITY_CONFLICT"] };
    }
  }
  return {
    operation: existing.contentHash === record.contentHash ? "SKIP" : "UPDATE",
    issues: [],
  };
}

function provenanceForPlan(
  source: SourceObservation,
  importRunId: string,
): SourceObservation {
  if (source.importRunId !== null) return source;
  return { ...source, importRunId };
}

function recordContractIssues(
  record: CanonicalRecord,
  sourceManifest: SourceManifest,
  mapping: ApprovedMappingContract,
): readonly CanonicalErrorCode[] {
  const issues = new Set<CanonicalErrorCode>();
  const identity = businessIdentityForRecord(record);
  if (
    record.businessIdentity.canonicalKey !== identity.canonicalKey ||
    record.businessIdentity.entity !== identity.entity
  ) {
    issues.add("IDENTITY_CONFLICT");
  }
  if (record.sourceOccurrenceKey !== sourceOccurrenceKeyForRecord(record)) {
    issues.add("PROVENANCE_ERROR");
  }
  if (
    record.sourceIdentity.sourceKey !== record.source.sourceKey ||
    record.sourceIdentity.spreadsheetId !== record.source.spreadsheetId ||
    record.sourceIdentity.sheetId !== record.source.sheetId ||
    record.sourceIdentity.sourceOccurrenceKey !== record.sourceOccurrenceKey ||
    record.sourceIdentity.mappingVersion !== record.mappingVersion ||
    record.sourceIdentity.schemaVersion !== record.schemaVersion
  ) {
    issues.add("PROVENANCE_ERROR");
  }
  if (record.contentHash !== contentHashForRecord(record)) {
    issues.add("VALIDATION_ERROR");
  }
  if (
    record.source.sourceKey !== sourceManifest.sourceKey ||
    record.source.spreadsheetId !== sourceManifest.spreadsheetId ||
    record.source.sheetId !== sourceManifest.sheetId
  ) {
    issues.add("PROVENANCE_ERROR");
  }
  if (
    record.mappingVersion !== mapping.mappingVersion ||
    record.schemaVersion !== mapping.schemaVersion ||
    record.parserVersion !== mapping.parserVersion ||
    record.source.mappingVersion !== mapping.mappingVersion ||
    record.source.schemaVersion !== mapping.schemaVersion ||
    record.source.parserVersion !== mapping.parserVersion
  ) {
    issues.add("MAPPING_ERROR");
  }
  const expectedFields = mappingFieldsForEntity(record.entity);
  if (
    record.mappingFields.length !== expectedFields.length ||
    expectedFields.some((field) => !record.mappingFields.includes(field))
  ) {
    issues.add("MAPPING_ERROR");
  }
  return [...issues];
}

function planHashInput(plan: {
  sourceManifest: SourceManifest;
  mappingProfile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  items: readonly CanonicalImportPlanItem[];
}) {
  const hashableObservation = (observation: CanonicalImportPlanItem["sourceProvenance"]) =>
    Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== "observedAt"),
    );
  return {
    sourceManifest: {
      sourceKey: plan.sourceManifest.sourceKey,
      spreadsheetId: plan.sourceManifest.spreadsheetId,
      workbookIdentity: plan.sourceManifest.workbookIdentity,
      sheetId: plan.sourceManifest.sheetId,
      worksheetTitleSnapshot: plan.sourceManifest.worksheetTitleSnapshot,
      entities: plan.sourceManifest.entities,
      effectivePeriod: plan.sourceManifest.effectivePeriod,
      sourceRange: plan.sourceManifest.sourceRange,
      schemaFingerprint: plan.sourceManifest.schemaFingerprint,
      mappingProfile: plan.sourceManifest.mappingProfile,
      mappingVersion: plan.sourceManifest.mappingVersion,
      schemaVersion: plan.sourceManifest.schemaVersion,
      parserVersion: plan.sourceManifest.parserVersion,
    },
    mappingProfile: plan.mappingProfile,
    mappingVersion: plan.mappingVersion,
    schemaVersion: plan.schemaVersion,
    parserVersion: plan.parserVersion,
    items: plan.items.map((item) => ({
      itemId: item.itemId,
      entity: item.record.entity,
      grain: item.record.grain,
      businessIdentity: item.businessIdentity,
      typedValue: item.typedValue,
      sourceProvenance: hashableObservation(item.sourceProvenance),
      contentHash: item.contentHash,
      validationResult: item.validationResult,
      operation: item.operation,
      blockingIssues: item.blockingIssues,
    })),
  };
}

function hashPlan(value: unknown) {
  return stableCanonicalHash(value);
}

function assertPlanHeader(
  sourceManifest: SourceManifest,
  mapping: ApprovedMappingContract,
) {
  assertWritableSourceManifest(sourceManifest);
  assertApprovedMappingForWrite(mapping, [
    "biomass_consumption.quantityTon",
    "coal_consumption.quantityTon",
    "coal_stock.closingStock",
    "coal_stock.consumed",
    "biomass_receipt.quantityTon",
    "coal_receipt.quantityTon",
    "solar_consumption.quantityLiter",
    "solar_receipt.quantityLiter",
    "hop_reading.hopDays",
    "biomass_target.targetTon",
    "biomass_cumulative.cumulativeTon",
  ]);
  if (sourceManifest.mappingVersion !== mapping.mappingVersion)
    throw new CanonicalPlanError("Source manifest and mapping contract versions differ.");
  if (sourceManifest.schemaVersion !== mapping.schemaVersion)
    throw new CanonicalPlanError("Source manifest and mapping schema versions differ.");
  if (sourceManifest.parserVersion !== mapping.parserVersion)
    throw new CanonicalPlanError("Source manifest and mapping parser versions differ.");
  if (sourceManifest.mappingProfile !== mapping.profile)
    throw new CanonicalPlanError("Source manifest and mapping profiles differ.");
}

export function buildCanonicalImportPlan(input: {
  importRunId: string;
  sourceManifest: SourceManifest;
  mapping: ApprovedMappingContract;
  records: readonly CanonicalRecord[];
  existing: readonly ExistingCanonicalState[];
}): CanonicalImportPlan {
  if (!input.importRunId.trim()) throw new CanonicalPlanError("importRunId is required.");
  assertPlanHeader(input.sourceManifest, input.mapping);

  const existingByKey = new Map<string, ExistingCanonicalState>();
  const duplicateExistingKeys = new Set<string>();
  for (const state of input.existing) {
    const key = state.businessIdentity.canonicalKey;
    if (existingByKey.has(key)) duplicateExistingKeys.add(key);
    existingByKey.set(key, state);
  }
  const sortedRecords = [...input.records].sort(
    (left, right) =>
      left.entity.localeCompare(right.entity) ||
      left.businessIdentity.canonicalKey.localeCompare(right.businessIdentity.canonicalKey) ||
      left.sourceOccurrenceKey.localeCompare(right.sourceOccurrenceKey),
  );
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const record of sortedRecords) {
    const key = businessIdentityForRecord(record).canonicalKey;
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
  }

  const operationCounts = emptyOperationCounts();
  const blockingIssues = new Set<CanonicalErrorCode>();
  const items = sortedRecords.map((record, index) => {
    const identity = businessIdentityForRecord(record);
    const key = identity.canonicalKey;
    let decision = operationFor(
      record,
      existingByKey.get(key),
      input.sourceManifest,
      recordContractIssues(record, input.sourceManifest, input.mapping),
    );
    const decisionIssues = new Set<CanonicalErrorCode>(decision.issues);
    if (
      record.source.importRunId !== null &&
      record.source.importRunId !== input.importRunId.trim()
    ) {
      decisionIssues.add("PROVENANCE_ERROR");
    }
    if (duplicateKeys.has(key) || duplicateExistingKeys.has(key)) {
      decisionIssues.add("IDENTITY_CONFLICT");
    }
    if (decisionIssues.size > 0) {
      decision = { operation: "BLOCK", issues: [...decisionIssues] };
    }
    const sourceProvenance = provenanceForPlan(record.source, input.importRunId.trim());
    const item: CanonicalImportPlanItem = {
      itemId: `${input.sourceManifest.sourceKey}:${index + 1}`,
      record,
      businessIdentity: identity,
      businessKey: key,
      typedValue: record.value,
      sourceProvenance,
      contentHash: record.contentHash,
      validationResult: record.validation,
      operation: decision.operation,
      blockingIssues: decision.issues,
    };
    operationCounts[decision.operation] += 1;
    for (const issue of decision.issues) blockingIssues.add(issue);
    if (!record.mappingFields.length) blockingIssues.add("PROVENANCE_ERROR");
    return item;
  });

  const partial = {
    sourceManifest: input.sourceManifest,
    mappingProfile: input.mapping.profile,
    mappingVersion: input.mapping.mappingVersion,
    schemaVersion: input.mapping.schemaVersion,
    parserVersion: input.mapping.parserVersion,
    items,
  };
  const planHash = hashPlan(planHashInput(partial));
  return freezeDeep({
    planId: planHash,
    planHash,
    importRunId: input.importRunId.trim(),
    sourceManifest: input.sourceManifest,
    mappingProfile: input.mapping.profile,
    mappingVersion: input.mapping.mappingVersion,
    schemaVersion: input.mapping.schemaVersion,
    parserVersion: input.mapping.parserVersion,
    items,
    operationCounts,
    blockingIssues: [...blockingIssues],
    approvalState: "PLANNED" as const,
  });
}

/**
 * Compatibility adapter for the current parser/import-plan output. The
 * adapter is intentionally one-way: it turns already parsed records into the
 * canonical domain layer and never asks the source adapter to rediscover a
 * field during planning or commit.
 */
export function buildCanonicalImportPlanFromCompatibilityPlan(input: {
  importRunId: string;
  plan: GoogleSheetsImportPlan;
  sourceManifest: SourceManifest;
  mapping: ApprovedMappingContract;
  existing: readonly ExistingCanonicalState[];
  stockScope?: string;
}) {
  return buildCanonicalImportPlan({
    importRunId: input.importRunId,
    sourceManifest: input.sourceManifest,
    mapping: input.mapping,
    records: canonicalRecordsFromImportPlan({
      plan: input.plan,
      sourceManifest: input.sourceManifest,
      mapping: input.mapping,
      stockScope: input.stockScope,
    }),
    existing: input.existing,
  });
}

export function canonicalPlanHashInput(plan: CanonicalImportPlan) {
  return planHashInput(plan);
}

export function assertCanonicalImportPlanIntegrity(plan: CanonicalImportPlan) {
  const expected = hashPlan(canonicalPlanHashInput(plan));
  if (expected !== plan.planHash || plan.planId !== plan.planHash) {
    throw new CanonicalPlanError("Canonical import plan hash does not match its contents.");
  }
  return plan;
}

export function approveCanonicalImportPlan(plan: CanonicalImportPlan): CanonicalImportPlan {
  assertCanonicalImportPlanIntegrity(plan);
  if (plan.approvalState !== "PLANNED")
    throw new CanonicalPlanError("Only a PLANNED canonical import plan can be approved.");
  if (plan.operationCounts.BLOCK > 0 || plan.blockingIssues.length > 0)
    throw new CanonicalPlanError("A blocked canonical import plan cannot be approved.");
  return freezeDeep({ ...plan, approvalState: "APPROVED" as const });
}
