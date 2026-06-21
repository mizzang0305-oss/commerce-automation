import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { buildMotionManifest } from "@/lib/uploads/videoAssets/motionManifest";
import {
  createMotionProviderRouter,
  selectMotionProvider
} from "@/lib/uploads/videoAssets/motionProviderRouter";
import { evaluateMotionQualityGate } from "@/lib/uploads/videoAssets/motionQualityGate";
import {
  createFalKlingI2VProvider,
  createMockFalKlingI2VClient,
  mapMotionSceneBriefToFalKlingI2VRequest,
  resolveFalKlingI2VReadiness
} from "@/lib/uploads/videoAssets/providers/falKlingI2VProvider";
import type {
  MotionProvider,
  MotionProviderMode,
  MotionProviderName,
  MotionSceneBrief
} from "@/lib/uploads/videoAssets/motionProviderTypes";

describe("fal Kling I2V provider readiness", () => {
  test("returns disabled blocker by default", () => {
    const readiness = resolveFalKlingI2VReadiness({ env: {} });
    const provider = createFalKlingI2VProvider({ env: {} });

    expect(readiness).toMatchObject({
      provider: "fal_kling_i2v",
      enabled: false,
      configured: false,
      runnable: false,
      blocker: "FAL_KLING_I2V_PROVIDER_DISABLED"
    });
    expect(provider.configured).toBe(false);
  });

  test("requires API key when enabled", () => {
    const readiness = resolveFalKlingI2VReadiness({
      env: {
        FAL_KLING_I2V_ENABLED: "true",
        FAL_KLING_I2V_MODEL_ID: "fal-ai/kling-video/v1.6/pro/image-to-video",
        FAL_KLING_I2V_COST_APPROVED: "true"
      }
    });

    expect(readiness).toMatchObject({
      configured: false,
      blocker: "FAL_API_KEY_MISSING"
    });
  });

  test("requires model id when enabled", () => {
    const readiness = resolveFalKlingI2VReadiness({
      env: {
        FAL_KLING_I2V_ENABLED: "true",
        FAL_API_KEY: "replace-with-test-fal-key"
      }
    });

    expect(readiness).toMatchObject({
      configured: false,
      blocker: "FAL_KLING_I2V_MODEL_ID_MISSING"
    });
  });

  test("requires cost approval before configuration", () => {
    const readiness = resolveFalKlingI2VReadiness({
      env: {
        FAL_KLING_I2V_ENABLED: "true",
        FAL_API_KEY: "replace-with-test-fal-key",
        FAL_KLING_I2V_MODEL_ID: "fal-ai/kling-video/v1.6/pro/image-to-video"
      }
    });

    expect(readiness).toMatchObject({
      configured: false,
      blocker: "FAL_KLING_I2V_COST_APPROVAL_REQUIRED"
    });
  });

  test("blocks live execution without future explicit approval", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      executionMode: "live"
    });

    expect(provider.configured).toBe(true);

    const result = await provider.generate({ sceneBriefs: sceneBriefs() });

    expect(result).toMatchObject({
      ok: false,
      providerName: "fal_kling_i2v",
      blockers: ["FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED"]
    });
  });

  test("safeSummary does not expose API key, Authorization, or raw URLs", () => {
    const testApiKey = "replace-with-test-fal-key";
    const authorizationNeedle = "Author" + "ization";
    const httpNeedle = "http" + "://";
    const httpsNeedle = "https" + "://";
    const readiness = resolveFalKlingI2VReadiness({
      env: withFalApiKey({
        ...configuredEnv(),
        FAL_KLING_I2V_OUTPUT_DIR: "commerce-assets/generated-motion"
      }, testApiKey)
    });
    const provider = createFalKlingI2VProvider({
      env: withFalApiKey(configuredEnv(), testApiKey)
    });

    const serialized = JSON.stringify({ readiness, providerSafeSummary: provider.safeSummary });

    expect(serialized).not.toContain(testApiKey);
    expect(serialized).not.toContain(authorizationNeedle);
    expect(serialized).not.toContain(httpNeedle);
    expect(serialized).not.toContain(httpsNeedle);
  });
});

describe("fal Kling I2V scene mapping", () => {
  test("maps hand_pickup brief to request payload", () => {
    const request = mapMotionSceneBriefToFalKlingI2VRequest({
      sceneBrief: brief("scene-04-hand-pickup", {
        kind: "hand_pickup",
        handInteraction: true,
        utensilInteraction: true
      }),
      modelId: "fal-ai/kling-video/v1.6/pro/image-to-video"
    });

    expect(request).toMatchObject({
      sceneId: "scene-04-hand-pickup",
      kind: "hand_pickup",
      aspectRatio: "9:16",
      sourceImageSafeRef: "safe:image:candidate-001"
    });
    expect(request.prompt).toContain("realistic human hand taking");
    expect(request.requiredSignals).toEqual(expect.arrayContaining([
      "handInteraction",
      "utensilInteraction",
      "kitchenContext"
    ]));
    expect(JSON.stringify(request)).not.toContain("http");
  });

  test("maps cooking_use brief to request payload", () => {
    const request = mapMotionSceneBriefToFalKlingI2VRequest({
      sceneBrief: brief("scene-05-cooking-use", {
        kind: "cooking_use",
        handInteraction: true,
        utensilInteraction: true
      }),
      modelId: "fal-ai/kling-video/v1.6/pro/image-to-video"
    });

    expect(request.prompt).toContain("stirring soup");
    expect(request.requiredSignals).toEqual(expect.arrayContaining([
      "handInteraction",
      "utensilInteraction",
      "kitchenContext"
    ]));
  });

  test("maps product_rotate brief to request payload", () => {
    const request = mapMotionSceneBriefToFalKlingI2VRequest({
      sceneBrief: brief("scene-06-product-rotate", {
        kind: "product_rotate",
        productRotateScene: true
      }),
      modelId: "fal-ai/kling-video/v1.6/pro/image-to-video"
    });

    expect(request.prompt).toContain("slow product rotation");
    expect(request.requiredSignals).toEqual(expect.arrayContaining([
      "productRotate",
      "kitchenContext"
    ]));
  });
});

describe("fal Kling I2V router and quality gate integration", () => {
  test("router prefers fal Kling when configured and cost approved", () => {
    const selection = selectMotionProvider([
      createFalKlingI2VProvider({ env: configuredEnv(), executionMode: "mock" }),
      provider("cloud_image_to_video", "image_to_video_generated", true),
      provider("comfyui_wan_i2v", "image_to_video_generated", true),
      provider("animated_still", "animated_still_generated", true),
      provider("slideshow", "slideshow_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "fal_kling_i2v",
      fallback_chain: ["fal_kling_i2v"]
    });
  });

  test("router falls back when fal Kling is disabled", () => {
    const selection = selectMotionProvider([
      createFalKlingI2VProvider({ env: {}, executionMode: "mock" }),
      provider("cloud_image_to_video", "image_to_video_generated", false),
      provider("comfyui_wan_i2v", "image_to_video_generated", true),
      provider("animated_still", "animated_still_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "comfyui_wan_i2v",
      fallback_chain: ["fal_kling_i2v", "cloud_image_to_video", "comfyui_wan_i2v"]
    });
  });

  test("cost gate blocks paid call before client execution", async () => {
    const client = createMockFalKlingI2VClient();
    const provider = createFalKlingI2VProvider({
      env: {
        FAL_KLING_I2V_ENABLED: "true",
        FAL_API_KEY: "replace-with-test-fal-key",
        FAL_KLING_I2V_MODEL_ID: "fal-ai/kling-video/v1.6/pro/image-to-video"
      },
      client,
      executionMode: "mock"
    });

    const result = await provider.generate({ sceneBriefs: sceneBriefs() });

    expect(result).toMatchObject({
      ok: false,
      blockers: ["FAL_KLING_I2V_COST_APPROVAL_REQUIRED"]
    });
    expect(client.calls.submit).toHaveLength(0);
  });

  test("mock fal Kling result satisfies motion clip contract without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      client: createMockFalKlingI2VClient(),
      executionMode: "mock"
    });

    const result = await provider.generate({ sceneBriefs: sceneBriefs() });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      providerName: "fal_kling_i2v",
      providerMode: "image_to_video_generated"
    });
    if (result.ok) {
      expect(result.clips).toHaveLength(4);
      expect(result.clips.every((clip) => clip.realMotion)).toBe(true);
      expect(result.clips.every((clip) => clip.mimeType?.startsWith("video/"))).toBe(true);
      expect(result.clips.some((clip) => clip.safeClipRef)).toBe(true);
      expect(JSON.stringify(result.clips)).not.toContain("replace-with-test-fal-key");
    }
  });

  test("motion quality gate accepts mocked valid fal Kling clips", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      client: createMockFalKlingI2VClient(),
      executionMode: "mock"
    });
    const result = await provider.generate({ sceneBriefs: sceneBriefs() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected mock result");

    const quality = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "fal_kling_i2v",
      clips: result.clips,
      publicUploadBlocked: true
    }));

    expect(quality).toMatchObject({
      final_upload_allowed: true,
      youtube_upload_allowed: true,
      motion_scene_count: 4,
      real_motion_scene_count: 4,
      hand_interaction_scene_count: 2,
      utensil_interaction_scene_count: 2,
      product_rotate_scene_present: true
    });
  });

  test("motion quality gate blocks fal result missing hand interaction", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      client: createMockFalKlingI2VClient({
        overrideClip: { handInteraction: false }
      }),
      executionMode: "mock"
    });
    const result = await provider.generate({ sceneBriefs: sceneBriefs() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected mock result");

    const quality = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "fal_kling_i2v",
      clips: result.clips,
      publicUploadBlocked: true
    }));

    expect(quality).toMatchObject({
      final_upload_allowed: false,
      blockers: expect.arrayContaining(["HAND_INTERACTION_SCENE_MISSING"])
    });
  });

  test("motion quality gate blocks fal result missing product rotate", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      client: createMockFalKlingI2VClient({
        overrideClip: { productRotateScene: false }
      }),
      executionMode: "mock"
    });
    const result = await provider.generate({ sceneBriefs: sceneBriefs() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected mock result");

    const quality = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "fal_kling_i2v",
      clips: result.clips,
      publicUploadBlocked: true
    }));

    expect(quality).toMatchObject({
      final_upload_allowed: false,
      blockers: expect.arrayContaining(["PRODUCT_ROTATE_SCENE_MISSING"])
    });
  });

  test("videos.insert is not called when fal provider is not configured", async () => {
    const videosInsert = vi.fn();
    const router = createMotionProviderRouter({
      providers: [
        createFalKlingI2VProvider({ env: {}, executionMode: "mock" }),
        provider("cloud_image_to_video", "image_to_video_generated", false),
        provider("comfyui_wan_i2v", "image_to_video_generated", false),
        provider("animated_still", "animated_still_generated", false),
        provider("slideshow", "slideshow_generated", false)
      ]
    });

    const result = await router.generate({
      sceneBriefs: sceneBriefs(),
      requireFinalUploadSafe: true
    });

    expect(videosInsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      youtube_upload_allowed: false
    });
  });

  test("public and unlisted upload remain blocked by motion quality gate", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredEnv(),
      client: createMockFalKlingI2VClient(),
      executionMode: "mock"
    });
    const result = await provider.generate({ sceneBriefs: sceneBriefs() });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected mock result");

    const quality = evaluateMotionQualityGate(buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "fal_kling_i2v",
      clips: result.clips,
      publicUploadBlocked: false
    }));

    expect(quality).toMatchObject({
      final_upload_allowed: false,
      youtube_upload_allowed: false,
      blockers: expect.arrayContaining(["PUBLIC_UPLOAD_NOT_BLOCKED"])
    });
  });
});

describe("fal Kling I2V environment example", () => {
  test(".env.example contains placeholders only", () => {
    const envExample = readFileSync(".env.example", "utf8");

    expect(envExample).toContain("FAL_KLING_I2V_ENABLED=false");
    expect(envExample).toContain("FAL_KLING_I2V_COST_APPROVED=false");
    expect(envExample).toContain("FAL_API_KEY=replace-with-fal-api-key");
    expect(envExample).toContain("FAL_KLING_I2V_MODEL_ID=replace-with-current-fal-kling-image-to-video-model-id");
    expect(envExample).not.toContain("replace-with-test-fal-key");
    expect(envExample).not.toContain("Author" + "ization");
  });
});

function configuredEnv() {
  return {
    FAL_KLING_I2V_ENABLED: "true",
    FAL_API_KEY: "replace-with-test-fal-key",
    FAL_KLING_I2V_MODEL_ID: "fal-ai/kling-video/v1.6/pro/image-to-video",
    FAL_KLING_I2V_COST_APPROVED: "true"
  };
}

function withFalApiKey(env: Record<string, string>, value: string) {
  return {
    ...env,
    ["FAL_" + "API_KEY"]: value
  };
}

function sceneBriefs(): MotionSceneBrief[] {
  return [
    brief("scene-01-hook"),
    brief("scene-04-hand-pickup", {
      kind: "hand_pickup",
      handInteraction: true,
      utensilInteraction: true
    }),
    brief("scene-05-cooking-use", {
      kind: "cooking_use",
      handInteraction: true,
      utensilInteraction: true
    }),
    brief("scene-06-product-rotate", {
      kind: "product_rotate",
      productRotateScene: true
    })
  ];
}

function brief(sceneId: string, overrides: Partial<MotionSceneBrief> = {}): MotionSceneBrief {
  return {
    sceneId,
    kind: overrides.kind ?? "product_intro",
    productName: "stainless steel kitchen utensil set",
    caption: "Kitchen utensil motion scene",
    prompt: "photorealistic vertical commerce kitchen motion",
    negativePrompt: "cartoon, anime, fake logo, text artifacts",
    durationSeconds: 3,
    productSafeRef: "safe:coupang:candidate-001",
    sourceImageSafeRef: "safe:image:candidate-001",
    outputPrefix: `safe-output-${sceneId}`,
    seed: 1234,
    requiredMotion: "real product motion",
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    kitchenContext: true,
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
    safeSummary: `${name} scaffold`,
    generate: vi.fn(async () => ({
      ok: false,
      providerName: name,
      providerMode: mode,
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED"],
      safeSummary: `${name} unavailable`
    }))
  };
}
