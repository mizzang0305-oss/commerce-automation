import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderGenerateResult,
  MotionQualityBlocker,
  MotionSceneBrief
} from "../motionProviderTypes";
import type {
  ComfyUIClient,
  ComfyUIOutputRef,
  ComfyUIWorkflowInput
} from "./comfyuiClient";

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_OUTPUT_DIR = "commerce-assets/generated-motion";
const REQUIRED_WORKFLOW_PLACEHOLDERS = [
  "{{PROMPT}}",
  "{{NEGATIVE_PROMPT}}",
  "{{SOURCE_IMAGE_PATH}}",
  "{{OUTPUT_PREFIX}}",
  "{{SEED}}",
  "{{DURATION_SECONDS}}",
  "{{WIDTH}}",
  "{{HEIGHT}}"
] as const;
const DEFAULT_NEGATIVE_PROMPT = [
  "cartoon",
  "vector illustration",
  "abstract shapes",
  "geometric placeholder",
  "stick hand",
  "distorted fingers",
  "fake logo",
  "fake review",
  "text artifacts",
  "watermark"
].join(", ");

export type ComfyUiWanI2VReadinessBlocker =
  | "COMFYUI_WAN_I2V_PROVIDER_DISABLED"
  | "COMFYUI_BASE_URL_MISSING"
  | "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING"
  | "COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND"
  | "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON"
  | "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED";

export type ComfyUiWanI2VSafeSummary = {
  hasBaseUrl: boolean;
  hasWorkflowPath: boolean;
  workflowTemplateExists: boolean;
  workflowTemplateValid: boolean;
  workflowTemplateBasename: string | null;
  timeoutMs: number;
  pollIntervalMs: number;
  outputDirConfigured: boolean;
  outputDirBasename: string | null;
};

export type ComfyUiWanI2VReadiness = {
  provider: "comfyui_wan_i2v";
  enabled: boolean;
  configured: boolean;
  canGenerateMotion: boolean;
  blocker: ComfyUiWanI2VReadinessBlocker | null;
  blockers: ComfyUiWanI2VReadinessBlocker[];
  timeoutMs: number;
  pollIntervalMs: number;
  outputDir: string;
  workflowTemplate?: unknown;
  safeSummary: ComfyUiWanI2VSafeSummary;
};

export type ResolveComfyUiWanI2VReadinessInput = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  fileExists?: (workflowPath: string) => boolean;
  readFile?: (workflowPath: string) => string;
};

export type ComfyUiWanI2VProviderInput = {
  configured?: boolean;
  readiness?: ComfyUiWanI2VReadiness;
  env?: Record<string, string | undefined>;
  client?: ComfyUIClient;
  executionMode?: "blocked" | "mock" | "live";
  allowLiveExecution?: boolean;
  workflowTemplate?: unknown;
};

export type MapMotionSceneBriefToComfyUiWorkflowInput = {
  sceneBrief: MotionSceneBrief;
  productName?: string;
  seed?: number;
  outputPrefix?: string;
  workflowTemplate?: unknown;
};

export function resolveComfyUiWanI2VReadiness(
  input: ResolveComfyUiWanI2VReadinessInput = {}
): ComfyUiWanI2VReadiness {
  const env = input.env ?? process.env;
  const enabled = env.COMFYUI_WAN_I2V_ENABLED === "true";
  const timeoutMs = positiveInt(env.COMFYUI_WAN_I2V_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = positiveInt(env.COMFYUI_WAN_I2V_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  const outputDir = nonEmpty(env.COMFYUI_WAN_I2V_OUTPUT_DIR) ?? DEFAULT_OUTPUT_DIR;
  const baseUrl = nonEmpty(env.COMFYUI_BASE_URL);
  const workflowPath = nonEmpty(env.COMFYUI_WAN_I2V_WORKFLOW_PATH);

  const baseSafeSummary: ComfyUiWanI2VSafeSummary = {
    hasBaseUrl: Boolean(baseUrl),
    hasWorkflowPath: Boolean(workflowPath),
    workflowTemplateExists: false,
    workflowTemplateValid: false,
    workflowTemplateBasename: workflowPath ? basename(workflowPath) : null,
    timeoutMs,
    pollIntervalMs,
    outputDirConfigured: Boolean(nonEmpty(env.COMFYUI_WAN_I2V_OUTPUT_DIR)),
    outputDirBasename: basename(outputDir)
  };

  if (!enabled) {
    return readinessResult({
      enabled,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "COMFYUI_WAN_I2V_PROVIDER_DISABLED",
      blockers: ["COMFYUI_WAN_I2V_PROVIDER_DISABLED"],
      safeSummary: baseSafeSummary
    });
  }

  if (!baseUrl) {
    return readinessResult({
      enabled,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "COMFYUI_BASE_URL_MISSING",
      blockers: ["COMFYUI_BASE_URL_MISSING", "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary: baseSafeSummary
    });
  }

  if (!workflowPath) {
    return readinessResult({
      enabled,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING",
      blockers: ["COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING", "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary: baseSafeSummary
    });
  }

  const resolvedWorkflowPath = resolveWorkflowPath(workflowPath, input.cwd ?? process.cwd());
  const fileExists = input.fileExists ?? existsSync;
  if (!fileExists(resolvedWorkflowPath)) {
    return readinessResult({
      enabled,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND",
      blockers: ["COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND", "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary: {
        ...baseSafeSummary,
        workflowTemplateExists: false
      }
    });
  }

  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const parsed = parseWorkflowTemplate(readFile(resolvedWorkflowPath));
  if (!parsed.ok) {
    return readinessResult({
      enabled,
      timeoutMs,
      pollIntervalMs,
      outputDir,
      blocker: "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON",
      blockers: ["COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON", "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"],
      safeSummary: {
        ...baseSafeSummary,
        workflowTemplateExists: true,
        workflowTemplateValid: false
      }
    });
  }

  return readinessResult({
    enabled,
    timeoutMs,
    pollIntervalMs,
    outputDir,
    blocker: null,
    blockers: [],
    workflowTemplate: parsed.workflowTemplate,
    safeSummary: {
      ...baseSafeSummary,
      workflowTemplateExists: true,
      workflowTemplateValid: true
    }
  });
}

export function createComfyUiWanI2VProvider(input: ComfyUiWanI2VProviderInput = {}): MotionProvider {
  const readiness = input.readiness ?? legacyOrEnvReadiness(input);
  const executionMode = input.executionMode ?? "blocked";

  return {
    name: "comfyui_wan_i2v",
    mode: "image_to_video_generated",
    configured: readiness.configured,
    safeSummary: readiness.configured
      ? "ComfyUI Wan I2V is configured but live execution remains approval-gated."
      : "ComfyUI Wan I2V is disabled or not configured; no workflow execution is performed.",
    generate: async (generateInput) => {
      if (!readiness.enabled) {
        return blockedResult(
          ["COMFYUI_WAN_I2V_PROVIDER_DISABLED"],
          "ComfyUI Wan I2V provider is disabled by default."
        );
      }

      if (!readiness.configured) {
        return blockedResult(
          normalizeProviderBlockers(readiness.blockers),
          "ComfyUI Wan I2V provider is not configured."
        );
      }

      if (executionMode !== "mock" && !input.allowLiveExecution) {
        return blockedResult(
          ["COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED"],
          "ComfyUI Wan I2V live execution is blocked until a separate local smoke approval is provided."
        );
      }

      if (!input.client) {
        return blockedResult(
          ["COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"],
          "ComfyUI Wan I2V client is not configured."
        );
      }

      return generateWithClient({
        sceneBriefs: generateInput.sceneBriefs,
        client: input.client,
        readiness,
        workflowTemplate: input.workflowTemplate ?? readiness.workflowTemplate ?? fallbackWorkflowTemplate()
      });
    }
  };
}

export function mapMotionSceneBriefToComfyUiWorkflowInput(
  input: MapMotionSceneBriefToComfyUiWorkflowInput
): ComfyUIWorkflowInput {
  const scene = input.sceneBrief;
  const kind = scene.kind ?? inferSceneKind(scene);
  const productName = input.productName ?? scene.productName ?? "commerce product";
  const width = scene.width ?? DEFAULT_WIDTH;
  const height = scene.height ?? DEFAULT_HEIGHT;
  const durationSeconds = scene.durationSeconds > 0 ? scene.durationSeconds : 3;
  const seed = input.seed ?? scene.seed ?? stableSeed(scene.sceneId);
  const outputPrefix = input.outputPrefix ?? scene.outputPrefix ?? safeOutputPrefix(scene.sceneId);
  const prompt = buildWanPrompt({ scene, kind, productName });
  const negativePrompt = mergeNegativePrompt(scene.negativePrompt);
  const requiredSignals = requiredSignalsForScene(scene, kind);
  const sourceImagePath = scene.sourceImageLocalPath ?? scene.sourceImageSafeRef ?? scene.productSafeRef;

  return {
    sceneId: scene.sceneId,
    kind,
    productName,
    caption: scene.caption ?? "",
    prompt,
    negativePrompt,
    durationSeconds,
    width,
    height,
    sourceImageSafeRef: scene.sourceImageSafeRef,
    sourceImageLocalPath: scene.sourceImageLocalPath,
    outputPrefix,
    seed,
    requiredSignals,
    workflow: applyWorkflowTemplate(input.workflowTemplate ?? fallbackWorkflowTemplate(), {
      PROMPT: prompt,
      NEGATIVE_PROMPT: negativePrompt,
      SOURCE_IMAGE_PATH: sourceImagePath,
      OUTPUT_PREFIX: outputPrefix,
      SEED: seed,
      DURATION_SECONDS: durationSeconds,
      WIDTH: width,
      HEIGHT: height
    })
  };
}

function readinessResult(input: {
  enabled: boolean;
  timeoutMs: number;
  pollIntervalMs: number;
  outputDir: string;
  blocker: ComfyUiWanI2VReadinessBlocker | null;
  blockers: ComfyUiWanI2VReadinessBlocker[];
  safeSummary: ComfyUiWanI2VSafeSummary;
  workflowTemplate?: unknown;
}): ComfyUiWanI2VReadiness {
  return {
    provider: "comfyui_wan_i2v",
    enabled: input.enabled,
    configured: input.enabled && input.blockers.length === 0,
    canGenerateMotion: input.enabled && input.blockers.length === 0,
    blocker: input.blocker,
    blockers: input.blockers,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    outputDir: input.outputDir,
    workflowTemplate: input.workflowTemplate,
    safeSummary: input.safeSummary
  };
}

function legacyOrEnvReadiness(input: ComfyUiWanI2VProviderInput) {
  if (input.configured === true) {
    return readinessResult({
      enabled: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      outputDir: DEFAULT_OUTPUT_DIR,
      blocker: null,
      blockers: [],
      workflowTemplate: input.workflowTemplate ?? fallbackWorkflowTemplate(),
      safeSummary: {
        hasBaseUrl: true,
        hasWorkflowPath: true,
        workflowTemplateExists: true,
        workflowTemplateValid: true,
        workflowTemplateBasename: "provided-workflow.json",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        outputDirConfigured: false,
        outputDirBasename: basename(DEFAULT_OUTPUT_DIR)
      }
    });
  }

  if (input.configured === false) {
    return readinessResult({
      enabled: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      outputDir: DEFAULT_OUTPUT_DIR,
      blocker: "COMFYUI_WAN_I2V_PROVIDER_DISABLED",
      blockers: ["COMFYUI_WAN_I2V_PROVIDER_DISABLED"],
      safeSummary: {
        hasBaseUrl: false,
        hasWorkflowPath: false,
        workflowTemplateExists: false,
        workflowTemplateValid: false,
        workflowTemplateBasename: null,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        outputDirConfigured: false,
        outputDirBasename: basename(DEFAULT_OUTPUT_DIR)
      }
    });
  }

  return resolveComfyUiWanI2VReadiness({ env: input.env });
}

async function generateWithClient(input: {
  sceneBriefs: MotionSceneBrief[];
  client: ComfyUIClient;
  readiness: ComfyUiWanI2VReadiness;
  workflowTemplate: unknown;
}): Promise<MotionProviderGenerateResult> {
  const clips: MotionClipResult[] = [];

  for (const sceneBrief of input.sceneBriefs) {
    const workflowInput = mapMotionSceneBriefToComfyUiWorkflowInput({
      sceneBrief,
      workflowTemplate: input.workflowTemplate
    });
    const prompt = await input.client.submitWorkflow(workflowInput);
    const history = await input.client.waitForResult(prompt.promptId, {
      timeoutMs: input.readiness.timeoutMs,
      pollIntervalMs: input.readiness.pollIntervalMs
    });
    const output = await input.client.resolveOutput(history);
    if (!isValidMotionOutput(output, workflowInput.durationSeconds)) {
      return blockedResult(
        ["COMFYUI_WAN_I2V_OUTPUT_INVALID"],
        "ComfyUI Wan I2V output did not satisfy the motion clip contract."
      );
    }

    clips.push(toMotionClipResult(workflowInput, output));
  }

  return {
    ok: true,
    providerName: "comfyui_wan_i2v",
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
    providerName: "comfyui_wan_i2v",
    providerMode: "image_to_video_generated",
    blockers,
    safeSummary
  };
}

function normalizeProviderBlockers(blockers: ComfyUiWanI2VReadinessBlocker[]): MotionQualityBlocker[] {
  const unique = new Set<MotionQualityBlocker>(blockers);
  unique.add("COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED");
  return [...unique];
}

function toMotionClipResult(input: ComfyUIWorkflowInput, output: ComfyUIOutputRef): MotionClipResult {
  return {
    sceneId: input.sceneId,
    providerName: "comfyui_wan_i2v",
    providerMode: "image_to_video_generated",
    safeClipRef: output.safeRef ?? `safe:motion:comfyui_wan_i2v:${input.sceneId}`,
    localPath: output.localPath,
    outputBasename: output.outputBasename,
    mimeType: output.mimeType,
    durationSeconds: output.durationSeconds ?? input.durationSeconds,
    realMotion: true,
    handInteraction: input.requiredSignals.includes("handInteraction"),
    utensilInteraction: input.requiredSignals.includes("utensilInteraction"),
    productRotateScene: input.requiredSignals.includes("productRotate"),
    kitchenContext: input.requiredSignals.includes("kitchenContext"),
    staticFrameRatio: 0.05,
    slideshowLikeRatio: 0,
    imageSwapOnly: false,
    allScenesStatic: false,
    safeSummary: `ComfyUI Wan I2V generated ${input.sceneId} as a safe video clip reference.`
  };
}

function isValidMotionOutput(output: ComfyUIOutputRef, durationSeconds: number) {
  const hasRef = Boolean(output.safeRef || output.localPath);
  return hasRef && output.mimeType.startsWith("video/") && durationSeconds > 0;
}

function parseWorkflowTemplate(rawJson: string):
  | { ok: true; workflowTemplate: unknown }
  | { ok: false } {
  try {
    const parsed = JSON.parse(rawJson);
    const serialized = JSON.stringify(parsed);
    const hasPlaceholders = REQUIRED_WORKFLOW_PLACEHOLDERS.every((placeholder) => serialized.includes(placeholder));
    return hasPlaceholders ? { ok: true, workflowTemplate: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function applyWorkflowTemplate(
  template: unknown,
  values: Record<string, string | number>
): unknown {
  if (typeof template === "string") {
    return replacePlaceholders(template, values);
  }
  if (Array.isArray(template)) {
    return template.map((item) => applyWorkflowTemplate(item, values));
  }
  if (template !== null && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, applyWorkflowTemplate(value, values)])
    );
  }
  return template;
}

function replacePlaceholders(value: string, replacements: Record<string, string | number>): string | number {
  for (const [key, replacement] of Object.entries(replacements)) {
    if (value === `{{${key}}}`) {
      return replacement;
    }
  }

  return Object.entries(replacements).reduce(
    (nextValue, [key, replacement]) => nextValue.split(`{{${key}}}`).join(String(replacement)),
    value
  );
}

function buildWanPrompt(input: { scene: MotionSceneBrief; kind: string; productName: string }) {
  const sceneSpecificPrompt = scenePromptAddition(input.kind);
  return [
    "photorealistic vertical 9:16 commerce short",
    "real kitchen countertop",
    "hands or cropped arm only when interacting with the product",
    input.productName,
    "natural lighting",
    "practical usage example, not a testimonial or review claim",
    input.scene.prompt,
    sceneSpecificPrompt
  ].filter(Boolean).join(", ");
}

function scenePromptAddition(kind: string) {
  if (kind === "hand_pickup") {
    return "realistic hand taking utensil from the set on a kitchen counter, visible natural pickup motion";
  }
  if (kind === "cooking_use") {
    return "hand stirring soup with a stainless utensil, practical cooking use motion, warm kitchen context";
  }
  if (kind === "product_rotate") {
    return "utensil set slowly rotating with a subtle orbit camera move on the kitchen counter";
  }
  return "subtle camera movement and real product motion in a kitchen setting";
}

function mergeNegativePrompt(sceneNegativePrompt: string) {
  const sceneText = sceneNegativePrompt.trim();
  return sceneText.length > 0
    ? `${sceneText}, ${DEFAULT_NEGATIVE_PROMPT}`
    : DEFAULT_NEGATIVE_PROMPT;
}

function requiredSignalsForScene(scene: MotionSceneBrief, kind: string) {
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

function inferSceneKind(scene: MotionSceneBrief) {
  if (scene.productRotateScene) return "product_rotate";
  if (scene.handInteraction && scene.utensilInteraction) return "cooking_use";
  if (scene.handInteraction) return "hand_pickup";
  return "product_intro";
}

function safeOutputPrefix(sceneId: string) {
  return `safe-motion-${sceneId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function stableSeed(sceneId: string) {
  return Array.from(sceneId).reduce((seed, char) => seed + char.charCodeAt(0), 1_000);
}

function resolveWorkflowPath(workflowPath: string, cwd: string) {
  return isAbsolute(workflowPath) ? workflowPath : resolve(cwd, workflowPath);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function fallbackWorkflowTemplate() {
  return {
    "1": {
      class_type: "ComfyUI_Wan_I2V_Placeholder",
      inputs: {
        prompt: "{{PROMPT}}",
        negative_prompt: "{{NEGATIVE_PROMPT}}",
        source_image: "{{SOURCE_IMAGE_PATH}}",
        output_prefix: "{{OUTPUT_PREFIX}}",
        seed: "{{SEED}}",
        duration_seconds: "{{DURATION_SECONDS}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}"
      }
    }
  };
}
