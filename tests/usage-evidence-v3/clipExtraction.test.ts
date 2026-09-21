import { describe, expect, test } from "vitest";
import { isEligibleAsset } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 derived motion clip lineage", () => {
  test("requires a bounded ffmpeg clip window and temporal fingerprint", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "desk_organization", 1);
    const clip = registry.assets.find((asset) => asset.sourceKind === "derived_clip")!;
    expect(isEligibleAsset(clip)).toBe(true);
    expect(clip.clipEndSeconds! - clip.clipStartSeconds!).toBeCloseTo(2.2);
    expect(clip.derivationOperation).toMatch(/^ffmpeg_/u);
    expect(clip.temporalFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("does not relabel a zero-duration frame extraction as motion", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "desk_organization", 2);
    const clip = registry.assets.find((asset) => asset.sourceKind === "derived_clip")!;
    clip.clipEndSeconds = clip.clipStartSeconds;
    clip.derivationOperation = "ffmpeg_scene_detected_segment_midpoint";
    expect(isEligibleAsset(clip)).toBe(false);
  });
});
