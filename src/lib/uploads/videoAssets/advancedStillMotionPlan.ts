import type { MotionSceneBrief, MotionSceneKind } from "./motionProviderTypes";

export type LowCostMotionType =
  | "product_push_in"
  | "product_orbit_illusion"
  | "product_cutout_slide"
  | "parallax_countertop"
  | "slow_zoom_pan"
  | "before_after_split"
  | "checklist_overlay_motion"
  | "cta_product_hero_motion";

export type AdvancedStillMotionPlanScene = MotionSceneBrief & {
  requiredMotion: LowCostMotionType;
  programmedMotion: true;
};

export type AdvancedStillMotionPlan = {
  candidateId: string;
  productSafeRef: string;
  providerName: "advanced_still_motion";
  renderStrategy: "ffmpeg_moviepy_programmed_motion";
  sceneBriefs: AdvancedStillMotionPlanScene[];
  safeSummary: string;
};

export function buildDefaultAdvancedStillMotionPlan(input: {
  candidateId: string;
  productSafeRef: string;
}): AdvancedStillMotionPlan {
  const productSafeRef = input.productSafeRef;

  return {
    candidateId: input.candidateId,
    productSafeRef,
    providerName: "advanced_still_motion",
    renderStrategy: "ffmpeg_moviepy_programmed_motion",
    sceneBriefs: [
      scene("scene-01-hook", "hook", "product_push_in", productSafeRef),
      scene("scene-02-problem", "problem", "slow_zoom_pan", productSafeRef),
      scene("scene-03-product-intro", "product_intro", "cta_product_hero_motion", productSafeRef),
      scene("scene-04-hand-pickup", "hand_pickup", "product_cutout_slide", productSafeRef, {
        handInteraction: true,
        utensilInteraction: true,
        kitchenContext: true
      }),
      scene("scene-05-cooking-use", "cooking_use", "parallax_countertop", productSafeRef, {
        handInteraction: true,
        utensilInteraction: true,
        kitchenContext: true
      }),
      scene("scene-06-product-rotate", "product_rotate", "product_orbit_illusion", productSafeRef, {
        productRotateScene: true,
        kitchenContext: true
      }),
      scene("scene-07-checklist", "checklist", "checklist_overlay_motion", productSafeRef),
      scene("scene-08-cta", "cta", "before_after_split", productSafeRef)
    ],
    safeSummary: "Low-cost motion plan uses programmed FFmpeg/MoviePy still motion; no paid API or media render is executed."
  };
}

function scene(
  sceneId: string,
  kind: MotionSceneKind,
  motionType: LowCostMotionType,
  productSafeRef: string,
  overrides: Omit<Partial<MotionSceneBrief>, "requiredMotion" | "requiredSignals"> = {}
): AdvancedStillMotionPlanScene {
  return {
    sceneId,
    kind,
    prompt: `low-cost ecommerce short ${sceneId} using ${motionType}`,
    negativePrompt: "no fake review, no fake logo, no raw URL, no paid video generation",
    durationSeconds: 3,
    productSafeRef,
    sourceImageSafeRef: productSafeRef,
    ...overrides,
    requiredMotion: motionType,
    requiredSignals: [motionType],
    handInteraction: overrides.handInteraction ?? false,
    utensilInteraction: overrides.utensilInteraction ?? false,
    productRotateScene: overrides.productRotateScene ?? false,
    programmedMotion: true
  };
}
