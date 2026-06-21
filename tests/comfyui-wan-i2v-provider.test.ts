import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { buildMotionManifest } from "@/lib/uploads/videoAssets/motionManifest";
import { selectMotionProvider } from "@/lib/uploads/videoAssets/motionProviderRouter";
import { evaluateMotionQualityGate } from "@/lib/uploads/videoAssets/motionQualityGate";
import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderMode,
  MotionProviderName,
  MotionSceneBrief
} from "@/lib/uploads/videoAssets/motionProviderTypes";
import type { ComfyUIClient } from "@/lib/uploads/videoAssets/providers/comfyuiClient";
import {
  createComfyUiWanI2VProvider,
  mapMotionSceneBriefToComfyUiWorkflowInput,
  resolveComfyUiWanI2VReadiness
} from "@/lib/uploads/videoAssets/providers/comfyuiWanI2VProvider";

describe("ComfyUI Wan I2V readiness", () => {
  test("defaults to disabled and does not expose raw config values", () => {
    const readiness = resolveComfyUiWanI2VReadiness({ env: {} });

    expect(readiness).toMatchObject({
      provider: "comfyui_wan_i2v",
      enabled: false,
      configured: false,
      canGenerateMotion: false,
      blocker: "COMFYUI_WAN_I2V_PROVIDER_DISABLED",
      safeSummary: {
        hasBaseUrl: false,
        hasWorkflowPath: false,
        workflowTemplateValid: false
      }
    });
    expect(JSON.stringify(readiness.safeSummary)).not.toContain("127.0.0.1");
    expect(JSON.stringify(readiness.safeSummary)).not.toMatch(/token|secret|authorization/i);
  });

  test("requires a base URL when enabled", () => {
    const readiness = resolveComfyUiWanI2VReadiness({
      env: {
        COMFYUI_WAN_I2V_ENABLED: "true",
        COMFYUI_WAN_I2V_WORKFLOW_PATH: "./config/comfyui/wan-i2v.workflow.example.json"
      }
    });

    expect(readiness).toMatchObject({
      enabled: true,
      configured: false,
      blocker: "COMFYUI_BASE_URL_MISSING",
      blockers: expect.arrayContaining([
        "COMFYUI_BASE_URL_MISSING",
        "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"
      ])
    });
  });

  test("requires a workflow path when enabled", () => {
    const readiness = resolveComfyUiWanI2VReadiness({
      env: {
        COMFYUI_WAN_I2V_ENABLED: "true",
        COMFYUI_BASE_URL: "http://127.0.0.1:8188"
      }
    });

    expect(readiness).toMatchObject({
      enabled: true,
      configured: false,
      blocker: "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING",
      blockers: expect.arrayContaining([
        "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING",
        "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"
      ])
    });
  });

  test("rejects invalid workflow JSON", () => {
    const readiness = resolveComfyUiWanI2VReadiness({
      env: enabledEnv(),
      fileExists: () => true,
      readFile: () => "{not valid json"
    });

    expect(readiness).toMatchObject({
      enabled: true,
      configured: false,
      blocker: "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON",
      safeSummary: {
        hasBaseUrl: true,
        hasWorkflowPath: true,
        workflowTemplateValid: false
      }
    });
  });

  test("accepts a valid placeholder workflow template", () => {
    const readiness = configuredReadiness();

    expect(readiness).toMatchObject({
      enabled: true,
      configured: true,
      canGenerateMotion: true,
      blocker: null,
      safeSummary: {
        hasBaseUrl: true,
        hasWorkflowPath: true,
        workflowTemplateExists: true,
        workflowTemplateValid: true,
        workflowTemplateBasename: "wan-i2v.workflow.example.json"
      }
    });
    expect(JSON.stringify(readiness.safeSummary)).not.toContain("http://127.0.0.1:8188");
  });
});

describe("ComfyUI Wan I2V scene mapping", () => {
  test("maps hand_pickup scene briefs to a vertical photorealistic workflow input", () => {
    const mapped = mapMotionSceneBriefToComfyUiWorkflowInput({
      sceneBrief: brief("scene-hand-pickup", "hand_pickup", {
        prompt: "show the spoon set at the edge of the counter",
        handInteraction: true,
        utensilInteraction: true
      }),
      productName: "stainless utensil set",
      seed: 101,
      outputPrefix: "safe-motion-scene-hand",
      workflowTemplate: validWorkflowTemplate()
    });

    expect(mapped).toMatchObject({
      sceneId: "scene-hand-pickup",
      kind: "hand_pickup",
      productName: "stainless utensil set",
      durationSeconds: 3,
      width: 1080,
      height: 1920,
      sourceImageSafeRef: "safe:image:candidate-001",
      seed: 101,
      requiredSignals: expect.arrayContaining(["handInteraction", "utensilInteraction", "kitchenContext"])
    });
    expect(mapped.prompt).toContain("photorealistic vertical 9:16");
    expect(mapped.prompt).toContain("realistic hand taking utensil");
    expect(mapped.negativePrompt).toContain("distorted fingers");
    expect(JSON.stringify(mapped.workflow)).toContain("safe-motion-scene-hand");
  });

  test("maps cooking_use scene briefs with kitchen and utensil motion requirements", () => {
    const mapped = mapMotionSceneBriefToComfyUiWorkflowInput({
      sceneBrief: brief("scene-cooking-use", "cooking_use", {
        prompt: "show the ladle during soup preparation",
        handInteraction: true,
        utensilInteraction: true
      }),
      productName: "stainless utensil set",
      seed: 202,
      outputPrefix: "safe-motion-scene-cooking",
      workflowTemplate: validWorkflowTemplate()
    });

    expect(mapped.prompt).toContain("hand stirring soup");
    expect(mapped.requiredSignals).toEqual(expect.arrayContaining([
      "handInteraction",
      "utensilInteraction",
      "kitchenContext"
    ]));
  });

  test("maps product_rotate scene briefs with rotate and kitchen requirements", () => {
    const mapped = mapMotionSceneBriefToComfyUiWorkflowInput({
      sceneBrief: brief("scene-product-rotate", "product_rotate", {
        prompt: "show the utensil set from multiple angles",
        productRotateScene: true
      }),
      productName: "stainless utensil set",
      seed: 303,
      outputPrefix: "safe-motion-scene-rotate",
      workflowTemplate: validWorkflowTemplate()
    });

    expect(mapped.prompt).toContain("utensil set slowly rotating");
    expect(mapped.requiredSignals).toEqual(expect.arrayContaining([
      "productRotate",
      "kitchenContext"
    ]));
  });
});

describe("ComfyUI Wan I2V provider behavior", () => {
  test("returns disabled blocker by default", async () => {
    const provider = createComfyUiWanI2VProvider();

    await expect(provider.generate({ sceneBriefs: [brief("scene-1", "hand_pickup")] }))
      .resolves
      .toMatchObject({
        ok: false,
        providerName: "comfyui_wan_i2v",
        blockers: ["COMFYUI_WAN_I2V_PROVIDER_DISABLED"]
      });
  });

  test("blocks live execution unless a future local smoke approval is supplied", async () => {
    const client = mockClient();
    const provider = createComfyUiWanI2VProvider({
      readiness: configuredReadiness(),
      client
    });

    const result = await provider.generate({ sceneBriefs: [brief("scene-1", "hand_pickup")] });

    expect(result).toMatchObject({
      ok: false,
      blockers: ["COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED"]
    });
    expect(client.submitWorkflow).not.toHaveBeenCalled();
  });

  test("uses a mock client to return a motion clip contract without network access", async () => {
    const client = mockClient();
    const provider = createComfyUiWanI2VProvider({
      readiness: configuredReadiness(),
      client,
      executionMode: "mock"
    });

    const result = await provider.generate({ sceneBriefs: passingSceneBriefs() });

    expect(result).toMatchObject({
      ok: true,
      providerName: "comfyui_wan_i2v",
      providerMode: "image_to_video_generated"
    });
    expect(client.submitWorkflow).toHaveBeenCalledTimes(passingSceneBriefs().length);
    if (!result.ok) throw new Error("expected mock ComfyUI provider success");
    expect(result.clips[0]).toMatchObject({
      providerName: "comfyui_wan_i2v",
      providerMode: "image_to_video_generated",
      mimeType: "video/mp4",
      realMotion: true,
      safeClipRef: expect.stringContaining("safe:motion:comfyui_wan_i2v")
    });
    expect(JSON.stringify(result.clips)).not.toContain("http://127.0.0.1:8188");
  });

  test("does not call client execution or upload callbacks when provider is disabled", async () => {
    const client = mockClient();
    const videosInsert = vi.fn();
    const provider = createComfyUiWanI2VProvider({
      readiness: resolveComfyUiWanI2VReadiness({ env: {} }),
      client
    });

    const result = await provider.generate({ sceneBriefs: passingSceneBriefs() });

    expect(result).toMatchObject({
      ok: false,
      blockers: ["COMFYUI_WAN_I2V_PROVIDER_DISABLED"]
    });
    expect(client.submitWorkflow).not.toHaveBeenCalled();
    expect(videosInsert).not.toHaveBeenCalled();
  });
});

describe("ComfyUI Wan I2V router and quality gate integration", () => {
  test("router selects ComfyUI after low-cost source slots when configured", () => {
    const selection = selectMotionProvider([
      createComfyUiWanI2VProvider({
        readiness: configuredReadiness(),
        client: mockClient(),
        executionMode: "mock"
      }),
      provider("ltx_video", "real_motion_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "comfyui_wan_i2v",
      fallback_chain: [
        "rights_confirmed_source_video",
        "advanced_still_motion",
        "photorealistic_scene_still",
        "comfyui_wan_i2v"
      ]
    });
  });

  test("router does not fall back to legacy LTX when ComfyUI is disabled and cloud is absent", () => {
    const selection = selectMotionProvider([
      createComfyUiWanI2VProvider({ readiness: resolveComfyUiWanI2VReadiness({ env: {} }) }),
      provider("ltx_video", "real_motion_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: false,
      blocker: "MOTION_PROVIDER_NOT_CONFIGURED",
      fallback_chain: [
        "rights_confirmed_source_video",
        "advanced_still_motion",
        "photorealistic_scene_still",
        "comfyui_wan_i2v",
        "animated_still",
        "fal_kling_i2v",
        "cloud_image_to_video",
        "slideshow"
      ]
    });
  });

  test("motion quality gate accepts valid mocked ComfyUI motion clips", async () => {
    const provider = createComfyUiWanI2VProvider({
      readiness: configuredReadiness(),
      client: mockClient(),
      executionMode: "mock"
    });
    const generated = await provider.generate({ sceneBriefs: passingSceneBriefs() });
    if (!generated.ok) throw new Error("expected mocked provider success");

    const report = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "comfyui_wan_i2v",
      clips: generated.clips,
      publicUploadBlocked: true
    }));

    expect(report).toMatchObject({
      final_upload_allowed: true,
      youtube_upload_allowed: true,
      blockers: []
    });
  });

  test("motion quality gate blocks missing hand interaction", () => {
    const report = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "comfyui_wan_i2v",
      clips: passingClips().map((clip) => ({ ...clip, handInteraction: false })),
      publicUploadBlocked: true
    }));

    expect(report).toMatchObject({
      final_upload_allowed: false,
      blockers: expect.arrayContaining(["HAND_INTERACTION_SCENE_MISSING"])
    });
  });

  test("motion quality gate blocks missing product rotate and public upload readiness", () => {
    const report = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "comfyui_wan_i2v",
      clips: passingClips().map((clip) => ({ ...clip, productRotateScene: false })),
      publicUploadBlocked: false
    }));

    expect(report).toMatchObject({
      final_upload_allowed: false,
      public_upload_blocked: false,
      blockers: expect.arrayContaining([
        "PRODUCT_ROTATE_SCENE_MISSING",
        "PUBLIC_UPLOAD_NOT_BLOCKED"
      ])
    });
  });
});

describe("ComfyUI Wan I2V env example", () => {
  test(".env.example contains disabled placeholders only for ComfyUI Wan I2V", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const comfyLines = envExample
      .split(/\r?\n/)
      .filter((line) => line.startsWith("COMFYUI_"));

    expect(comfyLines).toEqual(expect.arrayContaining([
      "COMFYUI_WAN_I2V_ENABLED=false",
      "COMFYUI_BASE_URL=http://127.0.0.1:8188",
      "COMFYUI_WAN_I2V_WORKFLOW_PATH=./config/comfyui/wan-i2v.workflow.example.json",
      "COMFYUI_WAN_I2V_TIMEOUT_MS=600000",
      "COMFYUI_WAN_I2V_POLL_INTERVAL_MS=2000",
      "COMFYUI_WAN_I2V_OUTPUT_DIR=commerce-assets/generated-motion"
    ]));
    expect(comfyLines.join("\n")).not.toMatch(/sk-|bearer|authorization|client_secret/i);
  });
});

function enabledEnv() {
  return {
    COMFYUI_WAN_I2V_ENABLED: "true",
    COMFYUI_BASE_URL: "http://127.0.0.1:8188",
    COMFYUI_WAN_I2V_WORKFLOW_PATH: "./config/comfyui/wan-i2v.workflow.example.json"
  };
}

function configuredReadiness() {
  return resolveComfyUiWanI2VReadiness({
    env: enabledEnv(),
    fileExists: () => true,
    readFile: () => JSON.stringify(validWorkflowTemplate())
  });
}

function validWorkflowTemplate() {
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

function mockClient(): ComfyUIClient {
  return {
    submitWorkflow: vi.fn(async (input) => ({
      promptId: `prompt-${input.sceneId}`,
      safeSummary: "mock ComfyUI prompt queued without raw response logging"
    })),
    waitForResult: vi.fn(async (promptId) => ({
      promptId,
      status: "completed",
      outputs: [{ outputBasename: `${promptId}.mp4`, mimeType: "video/mp4" }],
      safeSummary: "mock ComfyUI prompt completed"
    })),
    resolveOutput: vi.fn(async (result) => ({
      safeRef: `safe:motion:comfyui_wan_i2v:${result.promptId}`,
      mimeType: "video/mp4",
      outputBasename: `${result.promptId}.mp4`,
      safeSummary: "mock video output basename only"
    }))
  };
}

function passingSceneBriefs(): MotionSceneBrief[] {
  return [
    brief("scene-01-hand-pickup", "hand_pickup", { handInteraction: true, utensilInteraction: true }),
    brief("scene-02-cooking-use", "cooking_use", { handInteraction: true, utensilInteraction: true }),
    brief("scene-03-product-rotate", "product_rotate", { productRotateScene: true }),
    brief("scene-04-kitchen-context", "cooking_use", { handInteraction: true, utensilInteraction: true })
  ];
}

function passingClips(): MotionClipResult[] {
  return passingSceneBriefs().map((scene) => clip(scene.sceneId, {
    handInteraction: scene.handInteraction,
    utensilInteraction: scene.utensilInteraction,
    productRotateScene: scene.productRotateScene
  }));
}

function brief(
  sceneId: string,
  kind: string,
  overrides: Partial<MotionSceneBrief> = {}
): MotionSceneBrief {
  return {
    sceneId,
    kind,
    productName: "stainless utensil set",
    caption: "quick kitchen use demo",
    prompt: "photorealistic ecommerce kitchen usage scene",
    negativePrompt: "no cartoon, no abstract shape card, no distorted hands",
    durationSeconds: 3,
    productSafeRef: "safe:coupang:candidate-001",
    sourceImageSafeRef: "safe:image:candidate-001",
    requiredMotion: "subtle camera and product motion",
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    ...overrides
  };
}

function clip(sceneId: string, overrides: Partial<MotionClipResult> = {}): MotionClipResult {
  return {
    sceneId,
    providerName: "comfyui_wan_i2v",
    providerMode: "image_to_video_generated",
    safeClipRef: `safe:motion:comfyui_wan_i2v:${sceneId}`,
    durationSeconds: 3,
    realMotion: true,
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    kitchenContext: true,
    mimeType: "video/mp4",
    staticFrameRatio: 0.05,
    slideshowLikeRatio: 0,
    imageSwapOnly: false,
    allScenesStatic: false,
    safeSummary: `comfyui_wan_i2v generated ${sceneId} without raw asset URLs`,
    ...overrides
  };
}

function provider(
  name: MotionProviderName,
  mode: MotionProviderMode,
  configured: boolean
): MotionProvider {
  return {
    name,
    mode,
    configured,
    safeSummary: `${name} local scaffold only`,
    generate: vi.fn(async ({ sceneBriefs }) => ({
      ok: true,
      providerName: name,
      providerMode: mode,
      clips: sceneBriefs.map((scene) => ({
        ...clip(scene.sceneId),
        providerName: name,
        providerMode: mode
      }))
    }))
  };
}
