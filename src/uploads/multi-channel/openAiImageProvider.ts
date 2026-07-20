import { blockedProviderCheck, type RealImageProvider, unavailableGenerationResult } from "./realImageProvider";

export function createOpenAiImageProvider(): RealImageProvider {
  return {
    key: "openai_images",
    priority: 2,
    async checkAvailability() {
      if (process.env.V043_OPENAI_IMAGES_ENABLED !== "true") {
        return blockedProviderCheck("openai_images", "OPENAI_IMAGES_PROVIDER_DISABLED");
      }
      if (!process.env.OPENAI_API_KEY) {
        return blockedProviderCheck("openai_images", "OPENAI_IMAGES_API_KEY_MISSING");
      }
      return blockedProviderCheck("openai_images", "OPENAI_IMAGES_PROVIDER_NOT_IMPLEMENTED_FOR_LOCAL_NO_SECRET_OUTPUT");
    },
    async generateImage(request) {
      return unavailableGenerationResult(
        "openai_images",
        request.output_path,
        "OPENAI_IMAGES_PROVIDER_NOT_IMPLEMENTED_FOR_LOCAL_NO_SECRET_OUTPUT"
      );
    }
  };
}
