import { buildMotionManifest } from "./motionManifest";
import { evaluateMotionQualityGate, type MotionQualityGateReport } from "./motionQualityGate";
import { createCloudImageToVideoProvider } from "./providers/cloudImageToVideoProvider";
import { createAnimatedStillProvider } from "./providers/animatedStillProvider";
import { createComfyUiWanI2VProvider } from "./providers/comfyuiWanI2VProvider";
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
  "cloud_image_to_video",
  "comfyui_wan_i2v",
  "animated_still",
  "slideshow"
] as const satisfies readonly MotionProviderName[];

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

export function createMotionProviderRouter(input: { providers?: MotionProvider[] } = {}): MotionProviderRouter {
  const providers = input.providers ?? defaultMotionProviders();

  return {
    select: () => selectMotionProvider(providers),
    generate: async (generateInput) => generateWithSelectedProvider(providers, generateInput)
  };
}

export function selectMotionProvider(providers: MotionProvider[]): MotionProviderSelection {
  const byName = new Map(providers.map((provider) => [provider.name, provider]));
  const fallbackChain: MotionProviderName[] = [];

  for (const providerName of MOTION_PROVIDER_PRIORITY) {
    const provider = byName.get(providerName);
    fallbackChain.push(providerName);
    if (provider?.configured) {
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
    blocker: "MOTION_PROVIDER_NOT_CONFIGURED",
    fallback_chain: fallbackChain
  };
}

async function generateWithSelectedProvider(
  providers: MotionProvider[],
  input: MotionProviderGenerateInput
): Promise<MotionRouterGenerateResult> {
  const selection = selectMotionProvider(providers);
  if (!selection.ok) {
    return {
      ok: false,
      provider_name: null,
      fallback_chain: selection.fallback_chain,
      blockers: [selection.blocker],
      youtube_upload_allowed: false,
      safeSummary: "No motion provider is configured; final upload remains blocked."
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
    createCloudImageToVideoProvider(),
    createComfyUiWanI2VProvider(),
    createAnimatedStillProvider(),
    createSlideshowProvider()
  ];
}
