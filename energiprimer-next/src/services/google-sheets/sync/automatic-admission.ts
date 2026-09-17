import "server-only";

import { approvedMappingContractForWorksheet } from "@/services/google-sheets/canonical/mapping-profiles";
import type { DetectedAnchor } from "@/services/google-sheets/dynamic/types";
import { parseBBWorksheetName } from "@/services/google-sheets/dynamic/worksheet-resolver";

import {
  BB_CANONICAL_MAPPING_PROFILE,
} from "./bb-policy";
import type { SchemaSnapshot } from "./schema-detection";
import { AUTOMATION_MINIMAL_PROBE_RANGE } from "./automation-contract";

export type AutomaticWorksheetAdmissionStatus =
  | "APPROVED_PROFILE"
  | "UNKNOWN"
  | "SCHEMA_REVIEW"
  | "BLOCKED";

export type AutomaticWorksheetAdmission = {
  status: AutomaticWorksheetAdmissionStatus;
  worksheetTitle: string;
  mappingProfile: string | null;
  mappingVersion: string | null;
  probeRange: string;
  recognizedAnchorCount: number;
  detectedSchemaHash: string | null;
  blockers: readonly string[];
  reason: string;
};

export type AutomaticProbeInput = {
  worksheetTitle: string;
  registryStatus: string;
  canonicalSchema: SchemaSnapshot | string | null;
  probe: {
    scannedCellCount: number;
    anchors: readonly Pick<DetectedAnchor, "key" | "matchType">[];
    parserErrors: readonly string[];
    schemaSnapshot?: SchemaSnapshot | null;
  } | null;
};

function result(
  input: AutomaticProbeInput,
  status: AutomaticWorksheetAdmissionStatus,
  fields: Partial<AutomaticWorksheetAdmission> = {},
): AutomaticWorksheetAdmission {
  return {
    status,
    worksheetTitle: input.worksheetTitle,
    mappingProfile: null,
    mappingVersion: null,
    probeRange: AUTOMATION_MINIMAL_PROBE_RANGE,
    recognizedAnchorCount: input.probe?.anchors.length ?? 0,
    detectedSchemaHash: input.probe?.schemaSnapshot?.hash ?? null,
    blockers: [],
    reason: "Automatic worksheet admission was not completed.",
    ...fields,
  };
}

/**
 * Classifies only the evidence needed to decide whether a source may receive
 * the bounded full read. A title match alone is deliberately insufficient.
 */
export function classifyAutomaticWorksheetProbe(
  input: AutomaticProbeInput,
): AutomaticWorksheetAdmission {
  if (["DISABLED", "MISSING", "ERROR"].includes(input.registryStatus)) {
    return result(input, "BLOCKED", {
      blockers: [`REGISTRY_${input.registryStatus}`],
      reason: "The worksheet registry state is not eligible for automatic admission.",
    });
  }
  if (!parseBBWorksheetName(input.worksheetTitle)) {
    return result(input, "UNKNOWN", {
      blockers: ["UNSUPPORTED_WORKSHEET_TITLE"],
      reason: "The worksheet title is not a supported BB period identifier.",
    });
  }
  const mapping = approvedMappingContractForWorksheet(input.worksheetTitle);
  if (!mapping || mapping.profile !== BB_CANONICAL_MAPPING_PROFILE) {
    return result(input, "UNKNOWN", {
      blockers: ["APPROVED_PROFILE_NOT_FOUND"],
      reason: "No approved canonical mapping profile is registered for this worksheet.",
    });
  }
  if (!input.canonicalSchema) {
    return result(input, "SCHEMA_REVIEW", {
      mappingProfile: mapping.profile,
      mappingVersion: mapping.mappingVersion,
      blockers: ["CANONICAL_SCHEMA_UNAVAILABLE"],
      reason: "The approved canonical schema is unavailable.",
    });
  }
  if (!input.probe) {
    return result(input, "SCHEMA_REVIEW", {
      mappingProfile: mapping.profile,
      mappingVersion: mapping.mappingVersion,
      blockers: ["MINIMAL_PROBE_NOT_EXECUTED"],
      reason: "The worksheet was not admitted to a full read without a minimal probe.",
    });
  }
  if (input.probe.scannedCellCount === 0 || input.probe.parserErrors.length > 0) {
    return result(input, "UNKNOWN", {
      mappingProfile: mapping.profile,
      mappingVersion: mapping.mappingVersion,
      blockers: [
        ...(input.probe.scannedCellCount === 0 ? ["MINIMAL_PROBE_EMPTY"] : []),
        ...(input.probe.parserErrors.length > 0 ? ["MINIMAL_PROBE_PARSE_ERROR"] : []),
      ],
      reason: "The minimal worksheet probe did not provide trustworthy profile evidence.",
    });
  }

  const recognizedAnchorKeys = new Set(
    input.probe.anchors
      .filter((anchor) => anchor.matchType === "exact" || anchor.matchType === "alias")
      .map((anchor) => anchor.key),
  );
  if (recognizedAnchorKeys.size < 2) {
    return result(input, "UNKNOWN", {
      mappingProfile: mapping.profile,
      mappingVersion: mapping.mappingVersion,
      blockers: ["MINIMAL_PROBE_PROFILE_MARKERS_INSUFFICIENT"],
      reason: "The minimal probe did not contain enough approved semantic markers.",
    });
  }

  // A minimal probe is profile evidence, not a full schema approval. The full
  // bounded read still performs the exact canonical schema comparison before
  // any plan can reach the writer.
  return result(input, "APPROVED_PROFILE", {
    mappingProfile: mapping.profile,
    mappingVersion: mapping.mappingVersion,
    reason: "Minimal semantic markers match an approved canonical mapping profile; full schema validation is required next.",
  });
}
