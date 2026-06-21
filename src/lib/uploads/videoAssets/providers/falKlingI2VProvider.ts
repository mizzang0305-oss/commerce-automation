import { basename } from "node:path";

import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderGenerateResult,
  MotionQualityBlocker,
  MotionSceneBrief,
  MotionSceneKind
} from "../motionProviderTypes";

const DEFAULT_TIMEOUT_MS = 900_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_OUTPUT_DIR = "commerce-assets/generated-motion";
const DEFAULT_ASPECT_RATIO = "9:16";
const DEFAULT_NEGATIVE_PROMPT = [
  "cartoon",
  "anime",
  "vector illustration",
  "abstract shapes",
  "geometric placeholder",
  "color card",
  "stick hand",
  "distorted fingers",
  "extra fingers",
  "fake logo",
  "fake review",
  "testimonial face",
  "watermark",
  "text artifacts",
  "unreadable text",
  "low quality",
  "blurry",
  "deformed utensil"
].join(", ");

export type FalKlingI2VExecutionMode = "blocked" | "mock" | "live";

export type FalKlingI2VReadinessBlocker =
  | "FAL_KLING_I2V_PROVIDER_DISABLED"
  | "FAL_API_KEY_MISSING"
  | "FAL_KLING_I2V_MODEL_ID_MISSING"
  | "FAL_KLING_I2V_COST_APPROVAL_REQUIRED"
  | "FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"
  | "FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED"
  | "FAL_KLING_I2V_PAID_API_CALL_BLOCKED";

export type FalKlingI2VSafeSummary = {
  hasApiKey: boolean;
  hasModelId: boolean;
  costApproved: boolean;
  timeoutConfigured: boolean;
  pollIntervalConfigured: boolean;
  outputDirConfigured: boolean;
  outputDirBasename: string;
};

export type FalKlingI2VReadiness = {
  provider: "fal_kling_i2v";
  enabled: boolean;
  configured: boolean;
  runnable: boolean;
  canGenerateMotion: boolean;
  blocker: FalKlingI2VReadinessBlocker | null;
  blockers: FalKlingI2VReadinessBlocker[];
  modelId: string | null;
  timeoutMs: number;
  pollIntervalMs: number;
  outputDir: string;
  safeSummary: FalKlingI2VSafeSummary;
};

export type ResolveFalKlingI2VReadinessInput = {
  env?: Record<string, string | undefined>;
};

export type FalKlingI2VProviderInput = ResolveFalKlingI2VReadinessInput & {
  readiness?: FalKlingI2VReadiness;
  client?: FalKlingI2VClient;
  executionMode?: FalKlingI2VExecutionMode;
  allowLiveExecution?: boolean;
};

export type MapMotionSceneBriefToFalKlingI2VRequestInput = {
  sceneBrief: MotionSceneBrief;
  modelId: string;
  productName?: string;
  outputPrefix?: string;
  seed?: number;
};

export type FalKlingI2VRequest = {
  sceneId: string;
  kind: MotionSceneKind;
  modelId: string;
  productName: string;
  caption: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  aspectRatio: "9:16";
  sourceImageSafeRef: string;
  outputPrefix: string;
  seed: number;
  requiredSignals: string[];
};

export type FalKlingSubmitResult = {
  requestId: string;
  safeSummary: string;
};

export type FalKlingStatusResult = {
  requestId: string;
  status: "queued" | "running" | "completed" | "failed";
  safeSummary: string;
};

export type FalKlingResult = {
  requestId: string;
  safeRef?: string;
  localPath?: string;
  outputBasename?: string;
  mimeType: string;
  durationSeconds: number;
  safeSummary: string;
};

export interface FalKlingI2VClient {
  submitImageToVideo(input: FalKlingI2VRequest): Promise<FalKlingSubmitResult>;
  getStatus(requestId: string): Promise<FalKlingStatusResult>;
  getResult(requestId: string): Promise<FalKlingResult>;
}

export type MockFalKlingI2VClient = FalKlingI2VClient & {
  overrideClip?: Partial<MotionClipResult>;
  calls: {
    submit: FalKlingI2VRequest[];
    status: string[];
    result: string[];
  };
};

export function resolveFalKlingI2VReadiness(
  input: ResolveFalKlingI2VReadinessInput = {}
): FalKlingI2VReadiness {
  const env = input.env ?? process.env;
  const enabled = env.FAL_KLING_I2V_ENABLED === "true";
  const hasApiKey = hasValue(env.FAL_API_KEY);
  const modelId = nonEmpty(env.FAL_KLING_I2V_MODEL_ID);
  const costApproved = env.FAL_KLING_I2V_COST_APPROVED === "true";
  const timeoutMs = positiveInt(env.FAL_KLING_I2V_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = positiveInt(env.FAL_KLING_I2V_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  const outputDir = nonEmpty(env.FAL_KLING_I2V_OUTPUT_DIR) ?? DEFAULT_OUTPUT_DIR;
  const safeSummary: FalKlingI2VSafeSummary = {
    hasApiKey,
    hasModelId: Boolean(modelId),
    costApproved,
    timeoutConfigured: hasValue(env.FAL_KLING_I2V_TIMEOUT_MS),
    pollIntervalConfigured: hasValue(env.FAL_KLING_I2V_POLL_INTERVAL_MS),
    outputDirConfigured: hasValue(env.FAL_KLING_I2V_OUTPUT_DIR),
    outputDirBasename: basename(outputDir)
  };

  if (!enabled) {
    return readinessResult({
      enabled,
      modelId,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "FAL_KLING_I2V_PROVIDER_DISABLED",
      blockers: ["FAL_KLING_I2V_PROVIDER_DISABLED"],
      safeSummary
    });
  }

  if (!hasApiKey) {
    return readinessResult({
      enabled,
      modelId,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "FAL_API_KEY_MISSING",
      blockers: ["FAL_API_KEY_MISSING", "FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary
    });
  }

  if (!modelId) {
    return readinessResult({
      enabled,
      modelId,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "FAL_KLING_I2V_MODEL_ID_MISSING",
      blockers: ["FAL_KLING_I2V_MODEL_ID_MISSING", "FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary
    });
  }

  if (!costApproved) {
    return readinessResult({
      enabled,
      modelId,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "FAL_KLING_I2V_COST_APPROVAL_REQUIRED",
      blockers: ["FAL_KLING_I2V_COST_APPROVAL_REQUIRED"],
      safeSummary
    });
  }

  return readinessResult({
    enabled,
    modelId,
    timeoutMs,
    pollIntervalMs,
    outputDir,
    blocker: null,
    blockers: [],
    safeSummary
  });
}

export function createFalKlingI2VProvider(input: FalKlingI2VProviderInput = {}): MotionProvider {
  const readiness = input.readiness ?? resolveFalKlingI2VReadiness({ env: input.env });
  const executionMode = input.executionMode ?? "blocked";

  return {
    name: "fal_kling_i2v",
    mode: "image_to_video_generated",
    configured: readiness.configured,
    safeSummary: readiness.configured
      ? "fal Kling I2V is configured for adapter tests; live paid execution remains separately approval-gated."
      : `fal Kling I2V is not configured: ${readiness.blocker}.`,
    generate: async ({ sceneBriefs }) => {
      if (!readiness.enabled) {
        return blockedResult(
          ["FAL_KLING_I2V_PROVIDER_DISABLED"],
          "fal Kling I2V provider is disabled by default."
        );
      }

      if (!readiness.configured || !readiness.modelId) {
        return blockedResult(
          normalizeProviderBlockers(readiness.blockers),
          "fal Kling I2V provider is not configured."
        );
      }

      if (executionMode !== "mock") {
        if (!input.allowLiveExecution) {
          return blockedResult(
            ["FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED"],
            "fal Kling I2V live execution requires separate paid local smoke approval."
          );
        }

        return blockedResult(
          ["FAL_KLING_I2V_PAID_API_CALL_BLOCKED"],
          "fal Kling I2V paid API calls are blocked in this adapter PR."
        );
      }

      return generateWithMockClient({
        client: input.client ?? createMockFalKlingI2VClient(),
        sceneBriefs,
        modelId: readiness.modelId
      });
    }
  };
}

export function mapMotionSceneBriefToFalKlingI2VRequest(
  input: MapMotionSceneBriefToFalKlingI2VRequestInput
): FalKlingI2VRequest {
  const scene = input.sceneBrief;
  const kind = scene.kind ?? inferSceneKind(scene);
  const productName = input.productName ?? scene.productName ?? "stainless steel kitchen utensil set";
  const durationSeconds = scene.durationSeconds > 0 ? scene.durationSeconds : 3;
  const outputPrefix = input.outputPrefix ?? scene.outputPrefix ?? safeOutputPrefix(scene.sceneId);
  const seed = input.seed ?? scene.seed ?? stableSeed(scene.sceneId);
  const requiredSignals = requiredSignalsForScene(scene, kind);

  return {
    sceneId: scene.sceneId,
    kind,
    modelId: input.modelId,
    productName,
    caption: scene.caption ?? "",
    prompt: buildFalKlingPrompt({ scene, kind, productName }),
    negativePrompt: mergeNegativePrompt(scene.negativePrompt),
    durationSeconds,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    sourceImageSafeRef: scene.sourceImageSafeRef ?? scene.productSafeRef,
    outputPrefix,
    seed,
    requiredSignals
  };
}

export function createMockFalKlingI2VClient(input: {
  overrideClip?: Partial<Pick<MotionClipResult,
    | "realMotion"
    | "handInteraction"
    | "utensilInteraction"
    | "productRotateScene"
    | "kitchenContext"
    | "staticFrameRatio"
    | "slideshowLikeRatio"
    | "imageSwapOnly"
    | "allScenesStatic"
  >>;
} = {}): MockFalKlingI2VClient {
  const calls = {
    submit: [] as FalKlingI2VRequest[],
    status: [] as string[],
    result: [] as string[]
  };
  const requests = new Map<string, FalKlingI2VRequest>();

  return {
    overrideClip: input.overrideClip,
    calls,
    async submitImageToVideo(request) {
      calls.submit.push(request);
      const requestId = `mock-fal-kling-${request.sceneId}`;
      requests.set(requestId, request);
      return {
        requestId,
        safeSummary: `Mock fal Kling queue request accepted for ${request.sceneId}.`
      };
    },
    async getStatus(requestId) {
      calls.status.push(requestId);
      return {
        requestId,
        status: "completed",
        safeSummary: `Mock fal Kling request ${requestId} completed.`
      };
    },
    async getResult(requestId) {
      calls.result.push(requestId);
      const request = requests.get(requestId);
      return {
        requestId,
        safeRef: `safe:motion:fal_kling_i2v:${request?.sceneId ?? requestId}`,
        outputBasename: `${request?.outputPrefix ?? requestId}.mp4`,
        mimeType: "video/mp4",
        durationSeconds: request?.durationSeconds ?? 3,
        safeSummary: "Mock fal Kling result contains only a safe clip reference."
      };
    }
  };
}

function readinessResult(input: {
  enabled: boolean;
  modelId: string | null;
  timeoutMs: number;
  pollIntervalMs: number;
  outputDir: string;
  blocker: FalKlingI2VReadinessBlocker | null;
  blockers: FalKlingI2VReadinessBlocker[];
  safeSummary: FalKlingI2VSafeSummary;
}): FalKlingI2VReadiness {
  const configured = input.enabled && input.blockers.length === 0;
  return {
    provider: "fal_kling_i2v",
    enabled: input.enabled,
    configured,
    runnable: false,
    canGenerateMotion: configured,
    blocker: input.blocker,
    blockers: input.blockers,
    modelId: input.modelId,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    outputDir: input.outputDir,
    safeSummary: input.safeSummary
  };
}

async function generateWithMockClient(input: {
  client: FalKlingI2VClient;
  sceneBriefs: MotionSceneBrief[];
  modelId: string;
}): Promise<MotionProviderGenerateResult> {
  const clips: MotionClipResult[] = [];

  for (const sceneBrief of input.sceneBriefs) {
    const request = mapMotionSceneBriefToFalKlingI2VRequest({
      sceneBrief,
      modelId: input.modelId
    });
    const submitted = await input.client.submitImageToVideo(request);
    const status = await input.client.getStatus(submitted.requestId);
    if (status.status !== "completed") {
      return blockedResult(
        ["FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"],
        "Mock fal Kling queue did not complete."
      );
    }
    const result = await input.client.getResult(submitted.requestId);
    if (!isValidFalKlingResult(result, request.durationSeconds)) {
      return blockedResult(
        ["FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"],
        "Mock fal Kling result did not satisfy the motion clip contract."
      );
    }
    clips.push(toMotionClipResult(request, result, mockOverride(input.client)));
  }

  return {
    ok: true,
    providerName: "fal_kling_i2v",
    providerMode: "image_to_video_generated",
    clips
  };
}

function blockedResult(
  blockers: MotionQualityBlocker[],
  safeSummary: string
): MotionProviderGenerateResult {
  return {
    ok: false,
    providerName: "fal_kling_i2v",
    providerMode: "image_to_video_generated",
    blockers,
    safeSummary
  };
}

function normalizeProviderBlockers(blockers: FalKlingI2VReadinessBlocker[]): MotionQualityBlocker[] {
  const unique = new Set<MotionQualityBlocker>(blockers);
  if (blockers.some((blocker) => blocker !== "FAL_KLING_I2V_COST_APPROVAL_REQUIRED")) {
    unique.add("FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED");
  }
  return [...unique];
}

function toMotionClipResult(
  request: FalKlingI2VRequest,
  result: FalKlingResult,
  overrides: Partial<MotionClipResult> = {}
): MotionClipResult {
  return {
    sceneId: request.sceneId,
    providerName: "fal_kling_i2v",
    providerMode: "image_to_video_generated",
    safeClipRef: result.safeRef ?? `safe:motion:fal_kling_i2v:${request.sceneId}`,
    outputBasename: result.outputBasename,
    mimeType: result.mimeType,
    durationSeconds: result.durationSeconds,
    realMotion: true,
    handInteraction: request.requiredSignals.includes("handInteraction"),
    utensilInteraction: request.requiredSignals.includes("utensilInteraction"),
    productRotateScene: request.requiredSignals.includes("productRotate"),
    kitchenContext: request.requiredSignals.includes("kitchenContext"),
    staticFrameRatio: 0.05,
    slideshowLikeRatio: 0,
    imageSwapOnly: false,
    allScenesStatic: false,
    safeSummary: `Mock fal Kling I2V clip for ${request.sceneId}; no paid API call or raw media URL exposed.`,
    ...overrides
  };
}

function mockOverride(client: FalKlingI2VClient): Partial<MotionClipResult> {
  return "overrideClip" in client && typeof client.overrideClip === "object"
    ? client.overrideClip as Partial<MotionClipResult>
    : {};
}

function isValidFalKlingResult(result: FalKlingResult, requestedDurationSeconds: number) {
  return Boolean(result.safeRef || result.localPath)
    && result.mimeType.startsWith("video/")
    && result.durationSeconds > 0
    && requestedDurationSeconds > 0;
}

function buildFalKlingPrompt(input: { scene: MotionSceneBrief; kind: MotionSceneKind; productName: string }) {
  return [
    "photorealistic vertical 9:16 ecommerce short",
    "real kitchen countertop",
    input.productName,
    "natural lighting",
    "hands only or cropped arm when needed",
    "usage example, not testimonial",
    "clean product-focused composition",
    "no face",
    input.scene.prompt,
    scenePromptAddition(input.kind)
  ].filter(Boolean).join(", ");
}

function scenePromptAddition(kind: MotionSceneKind) {
  if (kind === "hand_pickup") {
    return "realistic human hand taking a stainless steel kitchen utensil from a countertop stand, natural hand movement";
  }
  if (kind === "cooking_use") {
    return "realistic cooking scene, cropped hand stirring soup with a stainless steel ladle, visible cookware, subtle natural motion";
  }
  if (kind === "product_rotate") {
    return "stainless steel kitchen utensil set on a clean kitchen counter, slow product rotation or subtle camera orbit";
  }
  return "subtle product motion on a clean kitchen counter";
}

function mergeNegativePrompt(sceneNegativePrompt: string) {
  const sceneText = sceneNegativePrompt.trim();
  return sceneText.length > 0
    ? `${sceneText}, ${DEFAULT_NEGATIVE_PROMPT}`
    : DEFAULT_NEGATIVE_PROMPT;
}

function requiredSignalsForScene(scene: MotionSceneBrief, kind: MotionSceneKind) {
  const signals = new Set(scene.requiredSignals ?? []);
  if (scene.handInteraction || kind === "hand_pickup" || kind === "cooking_use") {
    signals.add("handInteraction");
  }
  if (scene.utensilInteraction || kind === "hand_pickup" || kind === "cooking_use") {
    signals.add("utensilInteraction");
  }
  if (scene.productRotateScene || kind === "product_rotate") {
    signals.add("productRotate");
  }
  if (scene.kitchenContext || kind === "hand_pickup" || kind === "cooking_use" || kind === "product_rotate") {
    signals.add("kitchenContext");
  }
  return [...signals];
}

function inferSceneKind(scene: MotionSceneBrief): MotionSceneKind {
  if (scene.productRotateScene) return "product_rotate";
  if (scene.handInteraction && scene.utensilInteraction) return "cooking_use";
  if (scene.handInteraction) return "hand_pickup";
  return scene.kind ?? "product_intro";
}

function safeOutputPrefix(sceneId: string) {
  return `fal-kling-${sceneId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function stableSeed(sceneId: string) {
  return Array.from(sceneId).reduce((seed, char) => seed + char.charCodeAt(0), 1_000);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
