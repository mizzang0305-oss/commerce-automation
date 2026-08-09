import { describe, expect, test } from "vitest";
import { isEligibleAsset, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 motion, privacy, rights, and duplicate gates", () => {
  test("rejects frozen or undecodable clips", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "laundry_drying", 1);
    const clip = registry.assets.find((asset) => asset.sourceKind === "derived_clip")!;
    clip.motionQa = { ...clip.motionQa!, motionPresent: false, decodePassed: false, freezeRatio: 1 };
    expect(isEligibleAsset(clip)).toBe(false);
  });

  test("rejects privacy and rights blocks", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "laundry_drying", 2);
    const clip = registry.assets.find((asset) => asset.sourceKind === "derived_clip")!;
    clip.blockCodes = ["USAGE_ASSET_PRIVACY_RISK", "USAGE_ASSET_RIGHTS_UNCLEAR"];
    expect(isEligibleAsset(clip)).toBe(false);
  });

  test("rejects a duplicate visual fingerprint", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "laundry_drying", 3);
    registry.nearDuplicateHammingThreshold = 0;
    registry.assets[registry.assets.length - 1].visualFingerprint = registry.assets[registry.assets.length - 2].visualFingerprint;
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
  });
});
