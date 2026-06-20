import type { MotionClipResult, MotionProvider } from "../motionProviderTypes";

export function createSlideshowProvider(input: { configured?: boolean } = {}): MotionProvider {
  return {
    name: "slideshow",
    mode: "slideshow_generated",
    configured: input.configured === true,
    safeSummary: "Slideshow scaffold only; explicitly blocked for motion-first final upload.",
    generate: async ({ sceneBriefs }) => ({
      ok: true,
      providerName: "slideshow",
      providerMode: "slideshow_generated",
      clips: sceneBriefs.map((scene): MotionClipResult => ({
        sceneId: scene.sceneId,
        providerName: "slideshow",
        providerMode: "slideshow_generated",
        safeClipRef: `safe:slideshow:${scene.sceneId}`,
        durationSeconds: scene.durationSeconds,
        realMotion: false,
        handInteraction: false,
        utensilInteraction: false,
        productRotateScene: false,
        staticFrameRatio: 1,
        slideshowLikeRatio: 1,
        imageSwapOnly: true,
        allScenesStatic: true,
        safeSummary: "Slideshow fallback does not satisfy motion-first quality gates."
      }))
    })
  };
}
