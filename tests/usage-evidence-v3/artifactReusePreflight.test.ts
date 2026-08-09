import { describe, expect, test } from "vitest";
import { evaluateV3ArtifactContract } from "@/lib/usage-evidence/liveCapacityProof";

const ready = {
  baseline_registry_valid: true,
  candidate_registry_valid: true,
  v2_packs: 30,
  v3_candidate_packs: 12,
  candidate_total_packs: 42,
  candidate_assets: 83,
  derived_clips: 24,
  distinct_new_sources: 8,
  unique_sequence_fingerprints: 12,
  codex_reviewed_clips: 24,
  codex_reviewed_packs: 12,
  publish_eligible: 0,
  clip_files_matched: 24,
  pack_manifests_matched: 12,
  source_hash_metadata_matched: 24,
  hash_mismatches: 0
};

describe("V3 artifact reuse preflight", () => {
  test("accepts the exact reviewed reusable artifact contract without rebuilding", () => {
    expect(evaluateV3ArtifactContract(ready)).toMatchObject({ ready: true, rebuild_executed: false, hash_mismatches: 0 });
  });

  test("rejects a missing derived clip before live calls", () => {
    expect(evaluateV3ArtifactContract({ ...ready, clip_files_matched: 23 })).toMatchObject({ ready: false, blocker: "V3_LOCAL_ARTIFACT_NOT_READY" });
  });

  test("rejects an unreviewed pack before live calls", () => {
    expect(evaluateV3ArtifactContract({ ...ready, codex_reviewed_packs: 11 })).toMatchObject({ ready: false, blocker: "V3_LOCAL_ARTIFACT_NOT_READY" });
  });
});
