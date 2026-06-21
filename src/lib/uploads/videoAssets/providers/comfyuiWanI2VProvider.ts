import type { MotionProvider } from "../motionProviderTypes";

export function createComfyUiWanI2VProvider(input: { configured?: boolean } = {}): MotionProvider {
  return {
    name: "comfyui_wan_i2v",
    mode: "image_to_video_generated",
    configured: input.configured === true,
    safeSummary: "ComfyUI Wan I2V scaffold only; no workflow execution or model download is performed.",
    generate: async () => ({
      ok: false,
      providerName: "comfyui_wan_i2v",
      providerMode: "image_to_video_generated",
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED"],
      safeSummary: "ComfyUI Wan I2V endpoint is not configured."
    })
  };
}
