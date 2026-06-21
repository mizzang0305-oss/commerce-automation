import type { MotionProvider } from "../motionProviderTypes";

export function createLtxVideoProvider(input: { configured?: boolean } = {}): MotionProvider {
  return {
    name: "ltx_video",
    mode: "real_motion_generated",
    configured: input.configured === true,
    safeSummary: "LTX-Video scaffold only; no inference or model download is performed.",
    generate: async () => ({
      ok: false,
      providerName: "ltx_video",
      providerMode: "real_motion_generated",
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED"],
      safeSummary: "LTX-Video endpoint is not configured."
    })
  };
}
