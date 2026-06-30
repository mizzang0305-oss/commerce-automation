import { blockedProviderCheck, type RealImageProvider, unavailableGenerationResult } from "./realImageProvider";

export function createLocalComfyUiImageProvider(): RealImageProvider {
  return {
    key: "local_comfyui",
    priority: 3,
    async checkAvailability() {
      if (!process.env.COMFYUI_BASE_URL && process.env.V043_LOCAL_COMFYUI_ENABLED !== "true") {
        return blockedProviderCheck("local_comfyui", "LOCAL_COMFYUI_NOT_CONFIGURED");
      }
      return blockedProviderCheck("local_comfyui", "LOCAL_COMFYUI_PROVIDER_HEALTH_CHECK_NOT_CONNECTED");
    },
    async generateImage(request) {
      return unavailableGenerationResult(
        "local_comfyui",
        request.output_path,
        "LOCAL_COMFYUI_PROVIDER_HEALTH_CHECK_NOT_CONNECTED"
      );
    }
  };
}
