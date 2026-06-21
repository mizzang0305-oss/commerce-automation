import type {
  CloudVideoProviderExecutionMode,
  CloudVideoProviderReadiness,
  CloudVideoProviderReadinessBlocker,
  CloudVideoProviderSafeSummary,
  CloudVideoProviderVendor
} from "../cloudVideoProviderTypes";
import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderGenerateResult,
  MotionQualityBlocker,
  MotionSceneBrief
} from "../motionProviderTypes";

const SUPPORTED_CLOUD_PROVIDERS = new Set<CloudVideoProviderVendor>([
  "runway",
  "kling",
  "luma",
  "pika",
  "replicate",
  "fal"
]);

export type ResolveCloudVideoProviderReadinessInput = {
  env?: Record<string, string | undefined>;
};

export type CloudImageToVideoProviderInput = ResolveCloudVideoProviderReadinessInput & {
  readiness?: CloudVideoProviderReadiness;
  executionMode?: CloudVideoProviderExecutionMode;
};

export function resolveCloudVideoProviderReadiness(
  input: ResolveCloudVideoProviderReadinessInput = {}
): CloudVideoProviderReadiness {
  const env = input.env ?? process.env;
  const enabled = env.CLOUD_VIDEO_PROVIDER_ENABLED === "true";
  const providerName = normalizeProviderName(env.CLOUD_VIDEO_PROVIDER_NAME);
  const apiKeyPresent = hasValue(env.CLOUD_VIDEO_PROVIDER_API_KEY);
  const costApproved = env.CLOUD_VIDEO_PROVIDER_COST_APPROVED === "true";
  const safeSummary: CloudVideoProviderSafeSummary = {
    enabled,
    providerName,
    apiKeyPresent,
    costApproved,
    mockOnly: true
  };

  if (!enabled || !providerName || !apiKeyPresent) {
    return readinessResult({
      enabled,
      providerName,
      blocker: "CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED",
      blockers: ["CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED"],
      safeSummary
    });
  }

  if (!costApproved) {
    return readinessResult({
      enabled,
      providerName,
      blocker: "CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED",
      blockers: ["CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED"],
      safeSummary
    });
  }

  return readinessResult({
    enabled,
    providerName,
    blocker: null,
    blockers: [],
    safeSummary
  });
}

export function createCloudImageToVideoProvider(
  input: CloudImageToVideoProviderInput = {}
): MotionProvider {
  const readiness = input.readiness ?? resolveCloudVideoProviderReadiness({ env: input.env });
  const executionMode = input.executionMode ?? "blocked";

  return {
    name: "cloud_image_to_video",
    mode: "image_to_video_generated",
    configured: readiness.configured,
    safeSummary: readiness.configured
      ? `Cloud image-to-video provider ${readiness.providerName} is configured for mock-only scaffold; live paid API calls remain disabled.`
      : `Cloud image-to-video provider is not configured: ${readiness.blocker}.`,
    generate: async ({ sceneBriefs }) => {
      if (!readiness.enabled || !readiness.safeSummary.apiKeyPresent || !readiness.providerName) {
        return blockedResult(
          ["CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED"],
          "Cloud image-to-video provider is missing enabled state, provider name, or API key presence."
        );
      }

      if (!readiness.safeSummary.costApproved) {
        return blockedResult(
          ["CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED"],
          "Cloud image-to-video generation requires explicit quota and cost approval."
        );
      }

      if (executionMode !== "mock") {
        return blockedResult(
          ["CLOUD_VIDEO_PROVIDER_LIVE_API_NOT_IMPLEMENTED"],
          "Cloud image-to-video live API calls are not implemented in this scaffold."
        );
      }

      return {
        ok: true,
        providerName: "cloud_image_to_video",
        providerMode: "image_to_video_generated",
        clips: sceneBriefs.map((scene) => toMockClip(scene, readiness.providerName ?? "fal"))
      };
    }
  };
}

function readinessResult(input: {
  enabled: boolean;
  providerName: CloudVideoProviderVendor | null;
  blocker: CloudVideoProviderReadinessBlocker | null;
  blockers: CloudVideoProviderReadinessBlocker[];
  safeSummary: CloudVideoProviderSafeSummary;
}): CloudVideoProviderReadiness {
  return {
    provider: "cloud_image_to_video",
    enabled: input.enabled,
    configured: input.enabled && input.blockers.length === 0,
    canGenerateMotion: input.enabled && input.blockers.length === 0,
    providerName: input.providerName,
    blocker: input.blocker,
    blockers: input.blockers,
    safeSummary: input.safeSummary
  };
}

function blockedResult(
  blockers: MotionQualityBlocker[],
  safeSummary: string
): MotionProviderGenerateResult {
  return {
    ok: false,
    providerName: "cloud_image_to_video",
    providerMode: "image_to_video_generated",
    blockers,
    safeSummary
  };
}

function toMockClip(scene: MotionSceneBrief, providerName: CloudVideoProviderVendor): MotionClipResult {
  const handInteraction = scene.handInteraction || scene.kind === "hand_pickup" || scene.kind === "cooking_use";
  const utensilInteraction = scene.utensilInteraction || scene.kind === "hand_pickup" || scene.kind === "cooking_use";
  const productRotateScene = scene.productRotateScene || scene.kind === "product_rotate";

  return {
    sceneId: scene.sceneId,
    providerName: "cloud_image_to_video",
    providerMode: "image_to_video_generated",
    safeClipRef: `safe:motion:cloud_image_to_video:${providerName}:${scene.sceneId}`,
    durationSeconds: scene.durationSeconds,
    realMotion: true,
    handInteraction,
    utensilInteraction,
    productRotateScene,
    kitchenContext: scene.kitchenContext ?? true,
    staticFrameRatio: 0.05,
    slideshowLikeRatio: 0,
    imageSwapOnly: false,
    allScenesStatic: false,
    safeSummary: `Mock cloud image-to-video clip for ${scene.sceneId}; no paid API call or raw URL exposure.`
  };
}

function normalizeProviderName(value: string | undefined): CloudVideoProviderVendor | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return SUPPORTED_CLOUD_PROVIDERS.has(normalized as CloudVideoProviderVendor)
    ? normalized as CloudVideoProviderVendor
    : null;
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}
