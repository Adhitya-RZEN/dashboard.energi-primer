import { normalizeCellText } from "../dynamic/spreadsheet-scanner";
import type {
  BbSchemaFamily,
  ImportGate,
  MappingProfile,
} from "./types";

export const BB_CANONICAL_WORKSHEET = "Juli26-BB";
export const OFFICIAL_BIOMASS_TARGET = 70_020;
export const BB_WORKSHEET_RULE =
  "^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)[0-9]{2}-BB$";

export const SUPPORTED_IMPORT_ENTITY_TYPES = [
  "biomass_receipt",
  "biomass_consumption",
  "coal_receipt",
  "coal_consumption",
  "coal_stock",
  "solar_receipt",
  "solar_consumption",
  "hop_reading",
  "biomass_target",
  "biomass_cumulative",
] as const;

export const CANONICAL_DATABASE_TARGETS = [
  "biomass_receipts",
  "biomass_consumptions",
  "coal_receipts",
  "coal_consumption",
  "coal_stock",
  "solar_receipts",
  "solar_consumptions",
  "hop_readings",
  "biomass_targets",
  "biomass_cumulative_snapshots",
] as const;

export const CANONICAL_SUPPLIERS = [
  {
    code: "sawdust-pt-syahroni",
    name: "Sawdust PT Syahroni",
    aliases: ["SAWDUST PT SYAHRONI"],
  },
  {
    code: "sawdust-pt-bintang",
    name: "Sawdust PT Bintang",
    aliases: ["SAWDUST PT BINTANG"],
  },
  {
    code: "woodchip-pt-syahroni",
    name: "Woodchip PT Syahroni",
    aliases: ["WOODCHIP PT SYAHRONI"],
  },
  {
    code: "woodchip-pt-rap",
    name: "Woodchip PT RAP",
    aliases: ["WOODCHIP PT RAP"],
  },
  {
    code: "woodchip-cv-multi-paketindo",
    name: "Woodchip CV Multi Paketindo",
    aliases: ["WOODCHIP CV MULTI PAKETINDO"],
  },
  { code: "lruk", name: "LRUK", aliases: ["LRUK"] },
  { code: "srf", name: "SRF", aliases: ["SRF"] },
] as const;

export type SupplierIdentityKind = "CANONICAL" | "PATTERN";

export type SupplierIdentity = {
  code: string;
  name: string;
  confidence: "HIGH" | "MEDIUM";
  kind: SupplierIdentityKind;
};

const allSupported = [...SUPPORTED_IMPORT_ENTITY_TYPES];

export const MAPPING_PROFILES: Readonly<Record<BbSchemaFamily, MappingProfile>> = {
  CANONICAL_FAMILY: {
    family: "CANONICAL_FAMILY",
    name: "Juli26-BB canonical profile",
    description:
      "Canonical schema reference and regression profile; values remain period-specific.",
    autoMapEntityTypes: allSupported,
    defaultGate: "IMPORT_READY",
  },
  LEGACY_FAMILY_A: {
    family: "LEGACY_FAMILY_A",
    name: "Legacy Family A mapping profile",
    description:
      "Semantic columns largely match canonical semantics while physical order, aliases, or value types vary.",
    autoMapEntityTypes: allSupported,
    defaultGate: "IMPORT_AFTER_REVIEW",
  },
  LEGACY_FAMILY_B: {
    family: "LEGACY_FAMILY_B",
    name: "Legacy Family B review profile",
    description:
      "Low semantic overlap; no domain value is auto-mapped until owner semantics are approved.",
    autoMapEntityTypes: [],
    defaultGate: "BLOCKED",
  },
  LEGACY_FAMILY_C: {
    family: "LEGACY_FAMILY_C",
    name: "Legacy Family C review profile",
    description:
      "Partial legacy overlap with block and identity ambiguity; no domain value is auto-mapped.",
    autoMapEntityTypes: [],
    defaultGate: "BLOCKED",
  },
  UNKNOWN_FAMILY: {
    family: "UNKNOWN_FAMILY",
    name: "Unknown schema review profile",
    description: "Schema cannot be safely represented by an approved BB profile.",
    autoMapEntityTypes: [],
    defaultGate: "BLOCKED",
  },
};

export function mappingProfileFor(family: BbSchemaFamily) {
  return MAPPING_PROFILES[family];
}

export function normalizeSupplierToken(value: string | null | undefined) {
  return normalizeCellText(value ?? "").replace(/\s+/g, " ").trim();
}

function supplierTokenWithoutContext(value: string | null | undefined) {
  return normalizeSupplierToken(value)
    .replace(/-/g, " ")
    .replace(/^PENERIMAAN(?:\s+BIOMASSA)?\s+/i, "")
    .replace(/^BIOMASSA\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function supplierCode(token: string) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function supplierDisplayName(token: string) {
  return token
    .split(" ")
    .map((word) => {
      if (/^(?:PT|CV|LRUK|SRF|RAP|MPI|BI|BBM|BRMS|SRM)$/i.test(word))
        return word.toUpperCase();
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

export function normalizeSupplierIdentity(
  value: string | null | undefined,
): SupplierIdentity | null {
  const token = supplierTokenWithoutContext(value);
  const match = CANONICAL_SUPPLIERS.find((supplier) =>
    normalizeSupplierToken(supplier.code).replace(/-/g, " ") === token ||
    supplier.aliases.some(
      (alias) => normalizeSupplierToken(alias).replace(/-/g, " ") === token,
    ),
  );
  if (match)
    return {
      code: match.code,
      name: match.name,
      confidence: "HIGH",
      kind: "CANONICAL",
    };

  // Historical worksheets use supplier names such as
  // "Woodchip PT Bhirawa".  The company name is intentionally preserved as
  // its own identity; it is never guessed to be one of the canonical seven.
  const materialSupplier = token.match(
    /^(SAWDUST|WOODCHIP|SEKAM(?:\s+PADI)?)\s+(PT|CV)\s+(.+)$/i,
  );
  const specialSupplier = token.match(/^(LRUK|SRF)\s+(.+)$/i);
  if (!materialSupplier && !specialSupplier) return null;

  return {
    code: supplierCode(token),
    name: supplierDisplayName(token),
    confidence: "MEDIUM",
    kind: "PATTERN",
  };
}

export function normalizeUnitIdentity(value: string | null | undefined) {
  const token = normalizeSupplierToken(value);
  const match = token.match(/(?:UNIT|PLTU)[\s-]*([123])$/i);
  return match ? (`UNIT-${match[1]}` as const) : null;
}

export function gateLabel(gate: ImportGate) {
  return gate;
}
