import type {
  CanonicalEntity,
  EffectivePeriod,
  SourceAuthority,
  SourceManifest,
  SourceManifestApprovalState,
  SourceManifestStatus,
} from "./types";
import { CANONICAL_ENTITIES } from "./types";

export type SourceManifestInput = {
  sourceKey: string;
  spreadsheetId: string;
  sheetId: string;
  worksheetTitle: string;
  effectivePeriod: EffectivePeriod | null;
  entities?: readonly CanonicalEntity[];
  sourceType?: "GOOGLE_SHEETS";
  mappingProfile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  schemaFingerprint?: string | null;
  sourceRange: string;
  approvalState: SourceManifestApprovalState;
  ownership: {
    authority: SourceAuthority;
    ownerRef: string | null;
    sourcePrecedence: readonly string[] | null;
  };
  status: SourceManifestStatus;
  observedAt: string;
};

export class SourceManifestError extends Error {
  readonly code = "SOURCE_MANIFEST_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SourceManifestError";
  }
}

function requiredText(value: string, label: string) {
  if (!value.trim()) throw new SourceManifestError(`${label} is required.`);
  return value.trim();
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function assertPeriod(period: EffectivePeriod | null) {
  if (period === null) return;
  if (
    !Number.isInteger(period.month) ||
    period.month < 1 ||
    period.month > 12 ||
    !Number.isInteger(period.year) ||
    period.year < 2000 ||
    period.year > 2200
  ) {
    throw new SourceManifestError("effectivePeriod is invalid.");
  }
}

function assertPrecedence(
  sourceKey: string,
  sourcePrecedence: readonly string[] | null,
) {
  if (sourcePrecedence === null) return;
  const normalized = sourcePrecedence.map((value) => requiredText(value, "source precedence key"));
  if (!normalized.includes(sourceKey)) {
    throw new SourceManifestError(
      "sourcePrecedence must include the manifest sourceKey.",
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new SourceManifestError("sourcePrecedence must not contain duplicates.");
  }
}

function freezeManifest(manifest: SourceManifest): SourceManifest {
  if (manifest.effectivePeriod) Object.freeze(manifest.effectivePeriod);
  Object.freeze(manifest.entities);
  Object.freeze(manifest.ownership);
  if (manifest.ownership.sourcePrecedence) {
    Object.freeze(manifest.ownership.sourcePrecedence);
  }
  return Object.freeze(manifest);
}

export function createSourceManifest(input: SourceManifestInput): SourceManifest {
  const sourceKey = requiredText(input.sourceKey, "sourceKey");
  const spreadsheetId = requiredText(input.spreadsheetId, "spreadsheetId");
  const sheetId = requiredText(input.sheetId, "sheetId");
  const worksheetTitle = requiredText(input.worksheetTitle, "worksheetTitle");
  const sourceRange = requiredText(input.sourceRange, "sourceRange");
  const mappingProfile = requiredText(input.mappingProfile, "mappingProfile");
  const mappingVersion = requiredText(input.mappingVersion, "mappingVersion");
  const schemaVersion = requiredText(input.schemaVersion, "schemaVersion");
  const parserVersion = requiredText(input.parserVersion, "parserVersion");
  const observedAt = requiredText(input.observedAt, "observedAt");
  const entities = input.entities?.length
    ? [...input.entities]
    : [...CANONICAL_ENTITIES];

  assertPeriod(input.effectivePeriod);
  assertPrecedence(sourceKey, input.ownership.sourcePrecedence);
  if (!input.ownership.authority) {
    throw new SourceManifestError("ownership.authority is required.");
  }

  return freezeManifest({
    sourceKey,
    sourceType: input.sourceType ?? "GOOGLE_SHEETS",
    provider: "google_sheets",
    spreadsheetId,
    workbookIdentity: `${sourceKey}:${spreadsheetId}`,
    sheetId,
    worksheetTitle,
    worksheetTitleSnapshot: worksheetTitle,
    normalizedWorksheetTitle: normalizeTitle(worksheetTitle),
    effectivePeriod: input.effectivePeriod
      ? { ...input.effectivePeriod }
      : null,
    entities,
    sourceRange,
    mappingProfile,
    mappingVersion,
    schemaVersion,
    parserVersion,
    schemaFingerprint: input.schemaFingerprint ?? null,
    approvalState: input.approvalState,
    ownership: {
      authority: input.ownership.authority,
      ownerRef: input.ownership.ownerRef?.trim() || null,
      sourcePrecedence: input.ownership.sourcePrecedence
        ? [...input.ownership.sourcePrecedence]
        : null,
    },
    status: input.status,
    observedAt,
  });
}

export function assertWritableSourceManifest(manifest: SourceManifest) {
  if (manifest.sourceType !== "GOOGLE_SHEETS" || manifest.provider !== "google_sheets") {
    throw new SourceManifestError("Only Google Sheets manifests are writable.");
  }
  if (manifest.approvalState !== "APPROVED") {
    throw new SourceManifestError(
      "Source manifest mapping approval is required before writing.",
    );
  }
  if (manifest.status !== "ACTIVE") {
    throw new SourceManifestError(
      "Source manifest registry status is not ACTIVE.",
    );
  }
  if (manifest.ownership.authority !== "GOOGLE_SHEETS") {
    throw new SourceManifestError(
      "Source ownership is not approved for Google Sheets writes.",
    );
  }
  requiredText(manifest.sourceKey, "sourceKey");
  requiredText(manifest.spreadsheetId, "spreadsheetId");
  requiredText(manifest.sheetId, "sheetId");
  requiredText(manifest.mappingVersion, "mappingVersion");
  requiredText(manifest.schemaVersion, "schemaVersion");
  requiredText(manifest.parserVersion, "parserVersion");
  return manifest;
}

export function sourceManifestFromRegistry(input: {
  sourceKey: string;
  spreadsheetId: string;
  worksheetKey: string;
  worksheetTitle: string;
  status: SourceManifestStatus;
  sourceRange: string;
  effectivePeriod?: EffectivePeriod | null;
  mappingProfile: string;
  mappingVersion: string;
  schemaVersion: string;
  parserVersion: string;
  schemaFingerprint?: string | null;
  entities?: readonly CanonicalEntity[];
  approvalState: SourceManifestApprovalState;
  ownership: SourceManifestInput["ownership"];
  observedAt: string;
}) {
  return createSourceManifest({
    sourceKey: input.sourceKey,
    spreadsheetId: input.spreadsheetId,
    sheetId: input.worksheetKey,
    worksheetTitle: input.worksheetTitle,
    effectivePeriod: input.effectivePeriod ?? null,
    entities: input.entities,
    sourceType: "GOOGLE_SHEETS",
    mappingProfile: input.mappingProfile,
    mappingVersion: input.mappingVersion,
    schemaVersion: input.schemaVersion,
    parserVersion: input.parserVersion,
    schemaFingerprint: input.schemaFingerprint ?? null,
    sourceRange: input.sourceRange,
    approvalState: input.approvalState,
    ownership: input.ownership,
    status: input.status,
    observedAt: input.observedAt,
  });
}
