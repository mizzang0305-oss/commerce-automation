import { blockedProviderCheck, type RealImageProvider, unavailableGenerationResult } from "./realImageProvider";

export function createCodexImageSkillProvider(): RealImageProvider {
  return {
    key: "codex_image_skill",
    priority: 1,
    async checkAvailability() {
      if (process.env.CODEX_IMAGE_SKILL_ENABLED !== "true") {
        return blockedProviderCheck("codex_image_skill", "CODEX_IMAGE_SKILL_NOT_CONFIGURED");
      }
      return blockedProviderCheck("codex_image_skill", "CODEX_IMAGE_SKILL_RUNTIME_NOT_CONNECTED_TO_NODE_SCRIPT");
    },
    async generateImage(request) {
      return unavailableGenerationResult(
        "codex_image_skill",
        request.output_path,
        "CODEX_IMAGE_SKILL_RUNTIME_NOT_CONNECTED_TO_NODE_SCRIPT"
      );
    }
  };
}
