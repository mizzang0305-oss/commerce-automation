import { blockedProviderCheck, type RealImageProvider, unavailableGenerationResult } from "./realImageProvider";

export function createLocalSdWebUiImageProvider(): RealImageProvider {
  return {
    key: "local_sd_webui",
    priority: 4,
    async checkAvailability() {
      if (!process.env.SD_WEBUI_BASE_URL && process.env.V043_LOCAL_SD_WEBUI_ENABLED !== "true") {
        return blockedProviderCheck("local_sd_webui", "LOCAL_SD_WEBUI_NOT_CONFIGURED");
      }
      return blockedProviderCheck("local_sd_webui", "LOCAL_SD_WEBUI_PROVIDER_HEALTH_CHECK_NOT_CONNECTED");
    },
    async generateImage(request) {
      return unavailableGenerationResult(
        "local_sd_webui",
        request.output_path,
        "LOCAL_SD_WEBUI_PROVIDER_HEALTH_CHECK_NOT_CONNECTED"
      );
    }
  };
}
