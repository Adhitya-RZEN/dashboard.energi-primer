import type {
  ApprovedMappingContract,
  EffectivePeriod,
  ExistingCanonicalState,
  SourceManifestStatus,
} from "./types";
import type { GoogleSheetsImportPlan } from "../import/types";
import { createSourceManifest } from "./source-manifest";
import { canonicalRecordsFromImportPlan } from "./from-import-plan";
import {
  approveCanonicalImportPlan,
  buildCanonicalImportPlan,
} from "./import-plan";

/**
 * Compatibility boundary used while the existing bounded repository writer is
 * retained. It creates and approves the canonical plan first; the legacy
 * Prisma writer receives the already validated compatibility payload only
 * after this function succeeds.
 */
export type CompatibilityCanonicalPlanInput = {
  importRunId: string;
  plan: GoogleSheetsImportPlan;
  sourceKey: string;
  spreadsheetId: string;
  sheetId: string;
  worksheetTitle: string;
  effectivePeriod: EffectivePeriod | null;
  sourceRange: string;
  schemaFingerprint?: string | null;
  mapping: ApprovedMappingContract;
  existing?: readonly ExistingCanonicalState[];
  status?: SourceManifestStatus;
  stockScope?: string;
};

export function sourceManifestForCompatibilityPlan(input: CompatibilityCanonicalPlanInput) {
  return createSourceManifest({
    sourceKey: input.sourceKey,
    spreadsheetId: input.spreadsheetId,
    sheetId: input.sheetId,
    worksheetTitle: input.worksheetTitle,
    effectivePeriod: input.effectivePeriod,
    mappingProfile: input.mapping.profile,
    mappingVersion: input.mapping.mappingVersion,
    schemaVersion: input.mapping.schemaVersion,
    parserVersion: input.mapping.parserVersion,
    schemaFingerprint: input.schemaFingerprint ?? null,
    sourceRange: input.sourceRange,
    approvalState: "APPROVED",
    ownership: {
      authority: "GOOGLE_SHEETS",
      ownerRef: "canonical-mapping-policy",
      sourcePrecedence: null,
    },
    status: input.status ?? "ACTIVE",
    observedAt: new Date().toISOString(),
  });
}

export function canonicalRecordsForCompatibilityPlan(input: CompatibilityCanonicalPlanInput) {
  const manifest = sourceManifestForCompatibilityPlan(input);
  return {
    manifest,
    records: canonicalRecordsFromImportPlan({
      plan: input.plan,
      sourceManifest: manifest,
      mapping: input.mapping,
      stockScope: input.stockScope ?? "plant",
    }),
  };
}

export function buildApprovedCanonicalPlanForCompatibility(input: CompatibilityCanonicalPlanInput) {
  const { manifest, records } = canonicalRecordsForCompatibilityPlan(input);
  return approveCanonicalImportPlan(
    buildCanonicalImportPlan({
      importRunId: input.importRunId,
      sourceManifest: manifest,
      mapping: input.mapping,
      records,
      existing: input.existing ?? [],
    }),
  );
}
