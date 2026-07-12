import type { RenderRequest, ShadowRenderResult, VideoRenderer } from "@/video/contracts/renderer";

export async function renderShadowComparison(input: {
  request: RenderRequest;
  legacyRenderer: VideoRenderer;
  videoUseRenderer: VideoRenderer;
}): Promise<ShadowRenderResult> {
  const [legacy, videoUse] = await Promise.all([
    input.legacyRenderer.render(input.request),
    input.videoUseRenderer.render(input.request)
  ]);
  return {
    mode: "shadow",
    legacy,
    video_use: videoUse,
    safe_to_publish: false,
    live_upload_attempted: false,
    comparison_only: true,
    preferred_publish_renderer: "legacy",
    warnings: [
      "SHADOW_OUTPUT_NOT_PUBLISHABLE",
      ...(videoUse.success ? [] : ["VIDEO_USE_SHADOW_FAILED_LEGACY_PRESERVED"])
    ]
  };
}
