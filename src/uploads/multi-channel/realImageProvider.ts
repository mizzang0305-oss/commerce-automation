import { type ChannelKey } from "./channelProfiles";

export type RealImageProviderKey =
  | "codex_image_skill"
  | "openai_images"
  | "local_comfyui"
  | "local_sd_webui"
  | "manual_pack_fallback";

export type RealImageGenerationRequest = {
  channel_key: ChannelKey;
  scene_key: string;
  prompt: string;
  aspect_ratio: "9:16";
  style: "photorealistic_commerce_lifestyle";
  output_path: string;
};

export type RealImageGenerationResult = {
  provider: RealImageProviderKey;
  generated: boolean;
  output_path: string;
  width: number;
  height: number;
  file_size_bytes: number;
  raw_url_printed: false;
  blocker?: string;
};

export type RealImageProviderAvailabilityCheck = {
  provider: RealImageProviderKey;
  provider_configured: boolean;
  provider_test_image_generated: boolean;
  provider_test_image_real_photo_likeness_pass: boolean;
  provider_test_image_not_mosaic: boolean;
  provider_test_image_not_checkerboard: boolean;
  provider_test_image_not_noise: boolean;
  provider_test_image_decode_success: boolean;
  provider_available: boolean;
  provider_blocker: string | null;
  raw_url_printed: false;
  secrets_printed: false;
};

export type RealImageProvider = {
  key: RealImageProviderKey;
  priority: number;
  checkAvailability(input?: { cwd?: string }): Promise<RealImageProviderAvailabilityCheck>;
  generateImage(request: RealImageGenerationRequest): Promise<RealImageGenerationResult>;
};

export function blockedProviderCheck(
  provider: RealImageProviderKey,
  blocker: string
): RealImageProviderAvailabilityCheck {
  return {
    provider,
    provider_configured: false,
    provider_test_image_generated: false,
    provider_test_image_real_photo_likeness_pass: false,
    provider_test_image_not_mosaic: false,
    provider_test_image_not_checkerboard: false,
    provider_test_image_not_noise: false,
    provider_test_image_decode_success: false,
    provider_available: false,
    provider_blocker: blocker,
    raw_url_printed: false,
    secrets_printed: false
  };
}

export function unavailableGenerationResult(
  provider: RealImageProviderKey,
  outputPath: string,
  blocker: string
): RealImageGenerationResult {
  return {
    provider,
    generated: false,
    output_path: outputPath,
    width: 0,
    height: 0,
    file_size_bytes: 0,
    raw_url_printed: false,
    blocker
  };
}
