import type { MotionClipResult, MotionProvider } from "../motionProviderTypes";

export function createAnimatedStillProvider(input: { configured?: boolean } = {}): MotionProvider {
  return {
    name: "animated_still",
    mode: "animated_still_generated",
    configured: input.configured === true,
    safeSummary: "Animated still scaffold only; safe local fallback remains blocked for final upload.",
    generate: async ({ sceneBriefs }) => ({
      ok: true,
      providerName: "animated_still",
      providerMode: "animated_still_generated",
      clips: sceneBriefs.map((scene): MotionClipResult => ({
        sceneId: scene.sceneId,
        providerName: "animated_still",
        providerMode: "animated_still_generated",
        safeClipRef: `safe:animated-still:${scene.sceneId}`,
        durationSeconds: scene.durationSeconds,
        realMotion: false,
        handInteraction: false,
        utensilInteraction: false,
        productRotateScene: false,
        staticFrameRatio: 0.18,
        slideshowLikeRatio: 0.2,
        imageSwapOnly: false,
        allScenesStatic: false,
        safeSummary: "Animated still fallback does not expose raw media URLs."
      }))
    })
  };
}
