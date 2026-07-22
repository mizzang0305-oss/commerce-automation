import { describe, expect, it } from "vitest";

import {
  V112_CHANNEL_KEY,
  V112_PRODUCT_REFERENCE,
  V112_SCENE_PLAN,
  validateV112ScenePlan
} from "../src/rendering/shorts/v112ImageSkillVisualQuality";

describe("V112 image-skill visual quality preview", () => {
  it("locks the preview to the authoritative Coupang rear-seat organizer", () => {
    expect(V112_CHANNEL_KEY).toBe("father_jobs");
    expect(V112_PRODUCT_REFERENCE).toBe("CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER");
    expect(JSON.stringify(V112_SCENE_PLAN)).not.toContain("FRONT_CONSOLE_ORGANIZER");
    expect(V112_SCENE_PLAN.map((scene) => scene.filename)).toContain("03-v112-hidden-mirror.png");
  });

  it("uses six portrait image-skill scenes with one first-frame hook", () => {
    const result = validateV112ScenePlan();
    expect(result.ready).toBe(true);
    expect(result.sceneCount).toBe(6);
    expect(result.imageSkillSceneCount).toBe(6);
    expect(V112_SCENE_PLAN.every((scene) => scene.sourceKind === "v112_image_skill")).toBe(true);
    expect(result.hookSceneCount).toBe(1);
    expect(V112_SCENE_PLAN[0].hookOverlay).toBe(true);
    expect(V112_SCENE_PLAN.slice(1).every((scene) => !scene.hookOverlay)).toBe(true);
  });

  it("keeps motion subtle and upload disabled", () => {
    const result = validateV112ScenePlan();
    expect(V112_SCENE_PLAN.every((scene) => scene.zoomEnd >= 1 && scene.zoomEnd <= 1.05)).toBe(true);
    expect(result.SAFE_TO_UPLOAD).toBe(false);
    expect(result.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
    expect(result.audioCopyReviewRequired).toBe(true);
    expect(result.replacementUploadReady).toBe(false);
  });

  it("fails closed when the hook or scene count drifts", () => {
    const withoutHook = V112_SCENE_PLAN.map((scene) => ({ ...scene, hookOverlay: false }));
    const missingScene = V112_SCENE_PLAN.slice(0, 5);
    expect(validateV112ScenePlan(withoutHook).blockers).toContain("BLOCKED_V112_HOOK_SCENE_INVALID");
    expect(validateV112ScenePlan(missingScene).blockers).toContain("BLOCKED_V112_SCENE_COUNT_INVALID");
  });
});
