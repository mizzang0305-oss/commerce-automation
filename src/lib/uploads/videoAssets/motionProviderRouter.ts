import { buildMotionManifest } from "./motionManifest";
import { evaluateMotionQualityGate, type MotionQualityGateReport } from "./motionQualityGate";
import {
  DEFAULT_MOTION_COST_POLICY,
  evaluatePaidMotionProviderPolicy,
  isPaidI2VProvider,
  type MotionCostPolicy,
  type MotionRouteMode
} from "./motionCostPolicy";
import { createCloudImageToVideoProvider } from "./providers/cloudImageToVideoProvider";
import { createFalKlingI2VProvider } from "./providers/falKlingI2VProvider";
import { createAdvancedStillMotionProvider } from "./providers/advancedStillMotionProvider";
import { createAnimatedStillProvider } from "./providers/animatedStillProvider";
import { createComfyUiWanI2VProvider } from "./providers/comfyuiWanI2VProvider";
import { createSourceVideoProvider } from "./providers/sourceVideoProvider";
import { createSlideshowProvider } from "./providers/slideshowProvider";
import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderGenerateInput,
  MotionProviderName,
  MotionProviderSelection,
  MotionQualityBlocker
} from "./motionProviderTypes";

export const MOTION_PROVIDER_PRIORITY = [
  "rights_confirmed_source_video",
  "advanced_still_motion",
  "photorealistic_scene_still",
  "comfyui_wan_i2v",
  "animated_still",
  "fal_kling_i2v",
  "cloud_image_to_video",
  "slideshow"
] as const satisfies readonly MotionProviderName[];

export type MotionProviderRouterOptions = {
  routeMode?: MotionRouteMode;
  costPolicy?: MotionCostPolicy;
  premiumManualApproval?: boolean;
  freshApproval?: boolean;
  requestedPaidSceneCount?: number;
  estimatedPaidI2VCostUsd?: number;
};

export type MotionRouterGenerateResult =
  | {
      ok: true;
      provider_name: MotionProviderName;
      fallback_chain: MotionProviderName[];
      clips: MotionClipResult[];
      quality: MotionQualityGateReport;
      youtube_upload_allowed: true;
    }
  | {
      ok: false;
      provider_name: MotionProviderName | null;
      fallback_chain: MotionProviderName[];
      blockers: MotionQualityBlocker[];
      quality?: MotionQualityGateReport;
      youtube_upload_allowed: false;
      safeSummary: string;
    };

export type MotionProviderRouter = {
  select(): MotionProviderSelection;
  generate(input: MotionProviderGenerateInput): Promise<MotionRouterGenerateResult>;
};

export function createMotionProviderRouter(input: {
  providers?: MotionProvider[];
} & MotionProviderRouterOptions = {}): MotionProviderRouter {
  const providers = input.providers ?? defaultMotionProviders();
  const options = normalizeRouterOptions(input);

  return {
    select: () => selectMotionProvider(providers, options),
    generate: async (generateInput) => generateWithSelectedProvider(providers, generateInput, options)
  };
}

export function selectMotionProvider(
  providers: MotionProvider[],
  options: MotionProviderRouterOptions = {}
): MotionProviderSelection {
  const byName = new Map(providers.map((provider) => [provider.name, provider]));
  const fallbackChain: MotionProviderName[] = [];
  const paidBlockers: MotionQualityBlocker[] = [];
  const normalizedOptions = normalizeRouterOptions(options);

  for (const providerName of MOTION_PROVIDER_PRIORITY) {
    const provider = byName.get(providerName);
    fallbackChain.push(providerName);
    if (provider?.configured) {
      if (isPaidI2VProvider(provider.name)) {
        const policy = evaluatePaidMotionProviderPolicy({
          providerName: provider.name,
          routeMode: normalizedOptions.routeMode,
          requestedSceneCount: normalizedOptions.requestedPaidSceneCount,
          estimatedCostUsd: normalizedOptions.estimatedPaidI2VCostUsd,
          premiumManualApproval: normalizedOptions.premiumManualApproval,
          freshApproval: normalizedOptions.freshApproval,
          policy: normalizedOptions.costPolicy
        });
        if (!policy.allowed) {
          paidBlockers.push(...policy.blockers);
          continue;
        }
      }
      return {
        ok: true,
        provider_name: provider.name,
        provider_mode: provider.mode,
        fallback_chain: fallbackChain,
        provider
      };
    }
  }

  return {
    ok: false,
    blocker: paidBlockers[0] ?? "MOTION_PROVIDER_NOT_CONFIGURED",
    blockers: paidBlockers.length ? [...new Set(paidBlockers)] : ["MOTION_PROVIDER_NOT_CONFIGURED"],
    fallback_chain: fallbackChain,
    safeSummary: paidBlockers.length
      ? "Configured paid I2V providers are blocked by low-cost autopilot policy."
      : "No motion provider is configured; final upload remains blocked."
  };
}

async function generateWithSelectedProvider(
  providers: MotionProvider[],
  input: MotionProviderGenerateInput,
  options: MotionProviderRouterOptions
): Promise<MotionRouterGenerateResult> {
  const selection = selectMotionProvider(providers, options);
  if (!selection.ok) {
    return {
      ok: false,
      provider_name: null,
      fallback_chain: selection.fallback_chain,
      blockers: selection.blockers,
      youtube_upload_allowed: false,
      safeSummary: selection.safeSummary
    };
  }

  const generated = await selection.provider.generate(input);
  if (!generated.ok) {
    return {
      ok: false,
      provider_name: selection.provider_name,
      fallback_chain: selection.fallback_chain,
      blockers: generated.blockers,
      youtube_upload_allowed: false,
      safeSummary: generated.safeSummary
    };
  }

  const manifest = buildMotionManifest({
    productRef: input.sceneBriefs[0]?.productSafeRef ?? "safe:unknown-product",
    providerName: selection.provider_name,
    clips: generated.clips,
    publicUploadBlocked: true
  });
  const quality = evaluateMotionQualityGate(manifest);

  if (!quality.final_upload_allowed || input.requireFinalUploadSafe === true && selection.provider_name === "slideshow") {
    return {
      ok: false,
      provider_name: selection.provider_name,
      fallback_chain: selection.fallback_chain,
      blockers: quality.blockers,
      quality,
      youtube_upload_allowed: false,
      safeSummary: "Motion quality gate blocked final upload."
    };
  }

  return {
    ok: true,
    provider_name: selection.provider_name,
    fallback_chain: selection.fallback_chain,
    clips: generated.clips,
    quality,
    youtube_upload_allowed: true
  };
}

function defaultMotionProviders(): MotionProvider[] {
  return [
    createSourceVideoProvider(),
    createAdvancedStillMotionProvider(),
    createAnimatedStillProvider({ configured: false }),
    createFalKlingI2VProvider(),
    createCloudImageToVideoProvider(),
    createComfyUiWanI2VProvider(),
    createSlideshowProvider()
  ];
}

function normalizeRouterOptions(options: MotionProviderRouterOptions): Required<MotionProviderRouterOptions> {
  return {
    routeMode: options.routeMode ?? "autopilot",
    costPolicy: options.costPolicy ?? DEFAULT_MOTION_COST_POLICY,
    premiumManualApproval: options.premiumManualApproval === true,
    freshApproval: options.freshApproval === true,
    requestedPaidSceneCount: options.requestedPaidSceneCount ?? 1,
    estimatedPaidI2VCostUsd: options.estimatedPaidI2VCostUsd ?? 0.01
  };
}
