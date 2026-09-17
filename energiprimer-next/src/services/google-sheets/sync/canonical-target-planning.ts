import "server-only";

import {
  approveCanonicalImportPlan,
  buildCanonicalImportPlan,
} from "../canonical/import-plan";
import {
  canonicalRecordsForCompatibilityPlan,
  type CompatibilityCanonicalPlanInput,
} from "../canonical/compatibility";
import {
  classifyCanonicalTargetDiff,
  existingCanonicalStateForTargetState,
  resolveJuli26TargetProvenance,
  JULI26_TARGET_PROVENANCE_RESOLUTION,
  type CanonicalTargetDiff,
} from "../canonical/target-state";
import {
  loadCanonicalTargetStates,
  type CanonicalTargetStateReadResult,
} from "../canonical/target-repository";
import type { CanonicalImportPlan } from "../canonical/types";

export type TargetAwareCanonicalPlanResult = {
  canonicalPlan: CanonicalImportPlan;
  targetRead: CanonicalTargetStateReadResult;
  targetDiffs: readonly CanonicalTargetDiff[];
};

type TargetAwareCanonicalPlanInput = CompatibilityCanonicalPlanInput & {
  provenanceResolution?: typeof JULI26_TARGET_PROVENANCE_RESOLUTION;
};

export async function buildTargetAwareCanonicalPlan(
  input: TargetAwareCanonicalPlanInput,
): Promise<TargetAwareCanonicalPlanResult> {
  const { manifest, records } = canonicalRecordsForCompatibilityPlan(input);
  const targetRead = await loadCanonicalTargetStates(records);
  const statesForPlanning = targetRead.states.map((state) => {
    const record = records.find(
      (candidate) => candidate.businessIdentity.canonicalKey === state.businessIdentity.canonicalKey,
    );
    if (!record) throw new Error("Target state lookup did not cover every canonical identity.");
    if (
      input.provenanceResolution === JULI26_TARGET_PROVENANCE_RESOLUTION &&
      record.entity === "biomass_target"
    ) {
      return resolveJuli26TargetProvenance(record, state);
    }
    return state;
  });
  const stateByKey = new Map(
    statesForPlanning.map((state) => [state.businessIdentity.canonicalKey, state]),
  );
  const targetDiffs = records.map((record) => {
    const state = stateByKey.get(record.businessIdentity.canonicalKey);
    if (!state) throw new Error("Target state lookup did not cover every canonical identity.");
    return classifyCanonicalTargetDiff(record, state);
  });
  const existing = statesForPlanning.flatMap((state) => {
    const record = records.find(
      (candidate) => candidate.businessIdentity.canonicalKey === state.businessIdentity.canonicalKey,
    );
    if (!record) return [];
    const current = existingCanonicalStateForTargetState(record, state);
    return current ? [current] : [];
  });
  const planned = buildCanonicalImportPlan({
    importRunId: input.importRunId,
    sourceManifest: manifest,
    mapping: input.mapping,
    records,
    existing,
  });
  const canonicalPlan = planned.operationCounts.BLOCK === 0 && planned.blockingIssues.length === 0
    ? approveCanonicalImportPlan(planned)
    : planned;
  const disagreement = canonicalPlan.items.some((item) => {
    const diff = targetDiffs.find((candidate) => candidate.businessKey === item.businessKey);
    return diff && diff.canonicalOperation !== item.operation;
  });
  if (disagreement) throw new Error("Canonical plan and target-state diff disagree.");
  return { canonicalPlan, targetRead, targetDiffs };
}
