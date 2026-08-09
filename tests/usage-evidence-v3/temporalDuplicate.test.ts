import { describe, expect, test } from "vitest";
import { validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 temporal duplicate protection", () => {
  test("rejects exact temporal signatures even when middle-frame hashes differ", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "desk_organization", 11);
    const clips = registry.assets.filter((asset) => asset.sourceKind === "derived_clip");
    clips[1].temporalFingerprint = clips[0].temporalFingerprint;
    expect(clips[1].visualFingerprint).not.toBe(clips[0].visualFingerprint);
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
  });
});
