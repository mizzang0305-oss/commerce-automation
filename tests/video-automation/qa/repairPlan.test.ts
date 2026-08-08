import { describe, expect, it } from "vitest";
import { buildDeterministicRepairPlan, LEGACY_INITIAL_PROFILE } from "../../../src/lib/video-automation/repair/repairPlan";

describe("deterministic V2 repair plan", () => {
  it("maps static-small-caption failures to the proven local profile", () => {
    const plan = buildDeterministicRepairPlan({ cycle: 1, blockers: ["SLIDESHOW_FREEZE_RATIO_HIGH"], signals: ["PRIMARY_VISUAL_TOO_SMALL", "CAPTION_TOO_SMALL"], current: LEGACY_INITIAL_PROFILE });
    expect(plan.profile).toMatchObject({ motionPreset: "push_pan", primaryVisualWidthRatio: 0.92, captionFontPx: 66, captionAnimation: "pop", usageLabelMode: "full_then_abbreviated" });
    expect(plan.changes).toEqual(expect.arrayContaining(["ENABLE_DETERMINISTIC_PUSH_PAN", "EXPAND_PRIMARY_VISUAL_TO_FULL_BLEED", "UPGRADE_DYNAMIC_POP_GROUP_CAPTIONS"]));
  });
});
