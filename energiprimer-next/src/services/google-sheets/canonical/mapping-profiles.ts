import {
  BB_CANONICAL_MAPPING_CONTRACT,
} from "./mapping-contract";
import type {
  ApprovedMappingContract,
  CanonicalField,
  MappingManifestEntry,
} from "./types";

type FixedLegacyProfile = {
  worksheet: string;
  month: number;
  profile: string;
  mappingVersion: string;
  fixedReferences: Partial<Record<CanonicalField, string>>;
};

const LEGACY_FIXED_REFERENCES: Partial<Record<CanonicalField, string>> = {
  "coal_receipt.quantityTon": "I42",
  "solar_receipt.quantityLiter": "CC42",
  "biomass_cumulative.cumulativeTon":
    "TONASE BIOMASSA > TOTAL {year} > first numeric cell to the right",
};

export const FIXED_LEGACY_MAPPING_PROFILES: readonly FixedLegacyProfile[] = [
  "Januari26-BB",
  "Februari26-BB",
  "Maret26-BB",
  "April26-BB",
  "Mei26-BB",
  "Juni26-BB",
].map((worksheet) => {
  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
  ].indexOf(worksheet.replace("26-BB", "")) + 1;
  const token = worksheet.replace("26-BB", "").toUpperCase();
  return {
    worksheet,
    month,
    profile: `BB_LEGACY_${token}_V1`,
    mappingVersion: `BB_LEGACY_${token}_V1@1`,
    fixedReferences: LEGACY_FIXED_REFERENCES,
  };
});

function normalizedTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function legacyProfileForWorksheet(title: string) {
  const normalized = normalizedTitle(title);
  return FIXED_LEGACY_MAPPING_PROFILES.find(
    (profile) => normalizedTitle(profile.worksheet) === normalized,
  );
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function legacyFieldDefinitions(profile: FixedLegacyProfile) {
  const fields = Object.fromEntries(
    Object.entries(BB_CANONICAL_MAPPING_CONTRACT.fields).map(
      ([field, definition]) => {
        const fixedReference =
          profile.fixedReferences[field as CanonicalField] ??
          definition.physicalReference;
        return [
          field,
          Object.freeze({
            ...definition,
            sourceKind: fixedReference
              ? ("PHYSICAL_REFERENCE" as const)
              : definition.sourceKind,
            physicalReference: fixedReference,
            mappingVersion: profile.mappingVersion,
          }),
        ];
      },
    ),
  ) as ApprovedMappingContract["fields"];
  return Object.freeze(fields);
}

function legacyManifest(profile: FixedLegacyProfile): readonly MappingManifestEntry[] {
  return Object.freeze(
    BB_CANONICAL_MAPPING_CONTRACT.manifest.map((entry) => {
      const fixedReference = profile.fixedReferences[entry.field];
      return Object.freeze({
        ...entry,
        profile: profile.profile,
        mappingVersion: profile.mappingVersion,
        effectiveFrom: `2026-${String(profile.month).padStart(2, "0")}-01`,
        effectiveTo: monthEnd(2026, profile.month),
        worksheet: profile.worksheet,
        sourcePath: fixedReference ?? entry.sourcePath,
        sourceKind: fixedReference ? "PHYSICAL_REFERENCE" : entry.sourceKind,
      });
    }),
  );
}

const legacyContracts = new Map<string, ApprovedMappingContract>();
for (const profile of FIXED_LEGACY_MAPPING_PROFILES) {
  legacyContracts.set(
    normalizedTitle(profile.worksheet),
    Object.freeze({
      profile: profile.profile,
      mappingVersion: profile.mappingVersion,
      schemaVersion: BB_CANONICAL_MAPPING_CONTRACT.schemaVersion,
      parserVersion: BB_CANONICAL_MAPPING_CONTRACT.parserVersion,
      approvalState: "APPROVED" as const,
      fields: legacyFieldDefinitions(profile),
      manifest: legacyManifest(profile),
    }),
  );
}

/**
 * Resolves exactly the profiles that are approved by the current mapping
 * policy. Unknown years/titles deliberately return null and must enter review.
 */
export function approvedMappingContractForWorksheet(
  worksheetTitle: string,
): ApprovedMappingContract | null {
  const legacy = legacyContracts.get(normalizedTitle(worksheetTitle));
  if (legacy) return legacy;
  const match = worksheetTitle.trim().match(
    /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)(\d{2})-BB$/i,
  );
  if (!match) return null;
  const year = 2000 + Number(match[2]);
  const month = [
    "januari",
    "februari",
    "maret",
    "april",
    "mei",
    "juni",
    "juli",
    "agustus",
    "september",
    "oktober",
    "november",
    "desember",
  ].indexOf(match[1].toLocaleLowerCase("en-US")) + 1;
  return year === 2026 && month >= 7
    ? BB_CANONICAL_MAPPING_CONTRACT
    : null;
}

export function legacyMappingProfileForWorksheet(worksheetTitle: string) {
  return legacyProfileForWorksheet(worksheetTitle) ?? null;
}

export function approvedLegacyMappingContracts() {
  return [...legacyContracts.values()];
}
