import type { RendererExecutionResult } from "@/video/contracts/renderer";

export type RenderUploadBridgeResult = {
  ready: false;
  blocker: "LIVE_UPLOAD_DISABLED" | "SHADOW_OUTPUT_NOT_PUBLISHABLE" | "RENDER_QUALITY_NOT_PASSED";
  video_path: null;
  thumbnail_path: null;
  live_upload_attempted: false;
};

export function buildNoUploadRenderBridge(result: RendererExecutionResult): RenderUploadBridgeResult {
  if (result.mode === "shadow") {
    return {
      ready: false,
      blocker: "SHADOW_OUTPUT_NOT_PUBLISHABLE",
      video_path: null,
      thumbnail_path: null,
      live_upload_attempted: false
    };
  }
  if (!result.result.success || result.result.quality.status !== "PASS") {
    return {
      ready: false,
      blocker: "RENDER_QUALITY_NOT_PASSED",
      video_path: null,
      thumbnail_path: null,
      live_upload_attempted: false
    };
  }
  return {
    ready: false,
    blocker: "LIVE_UPLOAD_DISABLED",
    video_path: null,
    thumbnail_path: null,
    live_upload_attempted: false
  };
}
