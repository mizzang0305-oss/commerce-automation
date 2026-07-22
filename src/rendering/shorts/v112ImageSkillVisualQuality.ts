export const V112_CHANNEL_KEY = "father_jobs" as const;
export const V112_PRODUCT_REFERENCE = "CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER" as const;

export type V112ScenePlan = {
  sceneKey: string;
  filename: string;
  caption: string;
  durationSeconds: number | "remainder";
  zoomEnd: number;
  hookOverlay: boolean;
  sourceKind: "v112_image_skill" | "v046_image_skill_reuse";
};

export const V112_SCENE_PLAN: readonly V112ScenePlan[] = [
  {
    sceneKey: "product_hero",
    filename: "01-v112-product-hero.png",
    caption: "차 뒷좌석\n이거 하나 보세요",
    durationSeconds: 3.2,
    zoomEnd: 1.035,
    hookOverlay: true,
    sourceKind: "v112_image_skill"
  },
  {
    sceneKey: "before_messy",
    filename: "02-v112-empty-feature.png",
    caption: "컵홀더부터 티슈 수납까지",
    durationSeconds: 3,
    zoomEnd: 1.03,
    hookOverlay: false,
    sourceKind: "v112_image_skill"
  },
  {
    sceneKey: "before_clutter",
    filename: "03-v112-hidden-mirror.png",
    caption: "필요할 때 바로 쓰는 거울",
    durationSeconds: 3,
    zoomEnd: 1.03,
    hookOverlay: false,
    sourceKind: "v112_image_skill"
  },
  {
    sceneKey: "organizing_action",
    filename: "04-v112-loading-items.png",
    caption: "컵과 물티슈를 한 번에 정리",
    durationSeconds: 4,
    zoomEnd: 1.025,
    hookOverlay: false,
    sourceKind: "v112_image_skill"
  },
  {
    sceneKey: "clean_result",
    filename: "05-v112-hooks-cupholders.png",
    caption: "가방과 우산은 아래 걸이에",
    durationSeconds: 4,
    zoomEnd: 1.03,
    hookOverlay: false,
    sourceKind: "v112_image_skill"
  },
  {
    sceneKey: "dashboard_cta",
    filename: "06-v112-clean-rear-seat.png",
    caption: "설치 방식과 크기를 먼저 확인하세요",
    durationSeconds: "remainder",
    zoomEnd: 1.02,
    hookOverlay: false,
    sourceKind: "v112_image_skill"
  }
] as const;

export function validateV112ScenePlan(plan: readonly V112ScenePlan[] = V112_SCENE_PLAN) {
  const filenames = plan.map((scene) => scene.filename);
  const sceneKeys = plan.map((scene) => scene.sceneKey);
  const fixedDuration = plan.reduce(
    (total, scene) => total + (typeof scene.durationSeconds === "number" ? scene.durationSeconds : 0),
    0
  );
  const blockers = [
    plan.length !== 6 ? "BLOCKED_V112_SCENE_COUNT_INVALID" : null,
    new Set(filenames).size !== filenames.length ? "BLOCKED_V112_DUPLICATE_SCENE_FILENAME" : null,
    new Set(sceneKeys).size !== sceneKeys.length ? "BLOCKED_V112_DUPLICATE_SCENE_KEY" : null,
    plan.filter((scene) => scene.hookOverlay).length !== 1 ? "BLOCKED_V112_HOOK_SCENE_INVALID" : null,
    plan[0]?.hookOverlay !== true ? "BLOCKED_V112_FIRST_FRAME_HOOK_MISSING" : null,
    plan.filter((scene) => scene.durationSeconds === "remainder").length !== 1
      ? "BLOCKED_V112_REMAINDER_SCENE_INVALID"
      : null,
    fixedDuration <= 0 || fixedDuration >= 22.7 ? "BLOCKED_V112_FIXED_DURATION_INVALID" : null,
    plan.some((scene) => scene.zoomEnd < 1 || scene.zoomEnd > 1.05)
      ? "BLOCKED_V112_MOTION_OUT_OF_RANGE"
      : null
  ].filter((blocker): blocker is string => Boolean(blocker));

  return {
    version: "v112" as const,
    channelKey: V112_CHANNEL_KEY,
    productReference: V112_PRODUCT_REFERENCE,
    sceneCount: plan.length,
    hookSceneCount: plan.filter((scene) => scene.hookOverlay).length,
    imageSkillSceneCount: plan.filter((scene) => scene.sourceKind.includes("image_skill")).length,
    fixedDurationSeconds: fixedDuration,
    blockers,
    ready: blockers.length === 0,
    audioCopyReviewRequired: true,
    replacementUploadReady: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}
