import type { RenderRequest, RendererExecutionResult, VideoRenderer } from "@/video/contracts/renderer";
import type { VideoRendererConfig } from "@/video/config/videoRendererConfig";
import { renderShadowComparison } from "@/video/renderers/shadowRenderer";

export async function executeRenderer(input: {
  request: RenderRequest;
  config: VideoRendererConfig;
  legacyRenderer: VideoRenderer;
  videoUseRenderer: VideoRenderer;
}): Promise<RendererExecutionResult> {
  if (input.config.renderer === "shadow") {
    return renderShadowComparison(input);
  }
  if (input.config.renderer === "legacy") {
    return {
      mode: "legacy",
      result: await input.legacyRenderer.render(input.request),
      fallback_used: false,
      safe_to_publish: false
    };
  }
  const videoUse = await input.videoUseRenderer.render(input.request);
  if (videoUse.success) {
    return { mode: "video_use", result: videoUse, fallback_used: false, safe_to_publish: false };
  }
  const legacy = await input.legacyRenderer.render(input.request);
  return {
    mode: "video_use",
    result: {
      ...legacy,
      warnings: [...legacy.warnings, "VIDEO_USE_FAILED_LEGACY_FALLBACK_USED", ...videoUse.errors]
    },
    fallback_used: true,
    safe_to_publish: false
  };
}
