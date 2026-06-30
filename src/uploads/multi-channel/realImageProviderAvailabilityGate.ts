import { type RealImageSemanticAsset, validateRealImageSemanticGate } from "./realImageSemanticGate";

export type RealImageProviderAvailability = {
  provider_available: boolean;
  provider_name: string | null;
  real_image_generation_success: boolean;
  provider_blocker: string | null;
  blocker: string | null;
  generated_scene_asset_count: number;
  semantic_gate_pass: boolean;
  semantic_gate_blockers: string[];
};

export function evaluateRealImageProviderAvailability(input: {
  provider_name?: string | null;
  scene_assets: RealImageSemanticAsset[];
}): RealImageProviderAvailability {
  const providerName = input.provider_name?.trim() || null;
  const semanticGate = validateRealImageSemanticGate({
    channel_key: "lets_buy",
    assets: input.scene_assets
  });
  const providerAvailable = Boolean(providerName) && semanticGate.pass;
  const blocker = providerAvailable ? null : "REAL_IMAGE_PROVIDER_NOT_AVAILABLE";

  return {
    provider_available: providerAvailable,
    provider_name: providerName,
    real_image_generation_success: providerAvailable,
    provider_blocker: blocker,
    blocker,
    generated_scene_asset_count: semanticGate.generated_scene_asset_count,
    semantic_gate_pass: semanticGate.pass,
    semantic_gate_blockers: semanticGate.blockers
  };
}
