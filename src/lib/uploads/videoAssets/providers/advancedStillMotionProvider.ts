import type { MotionClipResult, MotionProvider, MotionProviderGenerateResult } from "../motionProviderTypes";

export function createAdvancedStillMotionProvider(input: {
  configured?: boolean;
  executionMode?: "plan_only" | "mock";
} = {}): MotionProvider {
  const configured = input.configured !== false;
  const executionMode = input.executionMode ?? "plan_only";

  return {
    name: "advanced_still_motion",
    mode: "programmed_still_motion_generated",
    configured,
    safeSummary: "Advanced still motion is the low-cost default; renderer execution is separate and local-only.",
    generate: async ({ sceneBriefs }) => {
      if (!configured) {
        return blocked("Advanced still motion provider is disabled.");
      }
      if (executionMode !== "mock") {
        return blocked("Low-cost motion plan is selected; local renderer execution has not been run.");
      }

      return {
        ok: true,
        providerName: "advanced_still_motion",
        providerMode: "programmed_still_motion_generated",
        clips: sceneBriefs.map((scene): MotionClipResult => ({
          sceneId: scene.sceneId,
          providerName: "advanced_still_motion",
          providerMode: "programmed_still_motion_generated",
          safeClipRef: `safe:motion:advanced_still_motion:${scene.sceneId}`,
          durationSeconds: scene.durationSeconds,
          realMotion: false,
          handInteraction: scene.handInteraction,
          utensilInteraction: scene.utensilInteraction,
          productRotateScene: scene.productRotateScene,
          kitchenContext: scene.kitchenContext,
          staticFrameRatio: 0.18,
          slideshowLikeRatio: 0.12,
          imageSwapOnly: false,
          allScenesStatic: false,
          safeSummary: "Mock advanced still motion clip uses safe references only; no media was rendered."
        }))
      };
    }
  };
}

function blocked(safeSummary: string): MotionProviderGenerateResult {
  return {
    ok: false,
    providerName: "advanced_still_motion",
    providerMode: "programmed_still_motion_generated",
    blockers: ["LOW_COST_MOTION_RENDERER_NOT_EXECUTED"],
    safeSummary
  };
}
