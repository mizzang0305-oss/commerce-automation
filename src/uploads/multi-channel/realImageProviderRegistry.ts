import { createCodexImageSkillProvider } from "./codexImageSkillProvider";
import { createLocalComfyUiImageProvider } from "./localComfyUiImageProvider";
import { createLocalSdWebUiImageProvider } from "./localSdWebUiImageProvider";
import { createOpenAiImageProvider } from "./openAiImageProvider";
import { blockedProviderCheck, type RealImageProvider, type RealImageProviderAvailabilityCheck } from "./realImageProvider";

export const REAL_IMAGE_PROVIDER_PRIORITY = [
  "codex_image_skill",
  "openai_images",
  "local_comfyui",
  "local_sd_webui",
  "manual_pack_fallback"
] as const;

export function createRealImageProviderRegistry(input: { providers?: RealImageProvider[] } = {}) {
  const providers = (input.providers ?? [
    createCodexImageSkillProvider(),
    createOpenAiImageProvider(),
    createLocalComfyUiImageProvider(),
    createLocalSdWebUiImageProvider(),
    createManualPackFallbackProvider()
  ]).sort((a, b) => a.priority - b.priority);

  return {
    providers,
    provider_priority: providers.map((provider) => provider.key),
    async checkAvailability() {
      const checks: RealImageProviderAvailabilityCheck[] = [];
      for (const provider of providers) {
        const check = await provider.checkAvailability();
        checks.push(check);
        if (check.provider_available) {
          return {
            active_provider: provider,
            active_provider_key: provider.key,
            provider_available: true,
            provider_blocker: null,
            checks
          };
        }
      }
      return {
        active_provider: null,
        active_provider_key: null,
        provider_available: false,
        provider_blocker: "REAL_IMAGE_PROVIDER_NOT_CONFIGURED",
        checks
      };
    }
  };
}

function createManualPackFallbackProvider(): RealImageProvider {
  return {
    key: "manual_pack_fallback",
    priority: 5,
    async checkAvailability() {
      return blockedProviderCheck("manual_pack_fallback", "MANUAL_PACK_FALLBACK_AVAILABLE_BUT_NOT_AUTOMATIC_PROVIDER");
    },
    async generateImage(request) {
      return {
        provider: "manual_pack_fallback",
        generated: false,
        output_path: request.output_path,
        width: 0,
        height: 0,
        file_size_bytes: 0,
        raw_url_printed: false,
        blocker: "MANUAL_PACK_FALLBACK_REQUIRES_V042_IMAGE_PACK"
      };
    }
  };
}
