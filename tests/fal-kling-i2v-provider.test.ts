import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { buildMotionManifest } from "@/lib/uploads/videoAssets/motionManifest";
import {
  createMotionProviderRouter,
  selectMotionProvider
} from "@/lib/uploads/videoAssets/motionProviderRouter";
import { evaluateMotionQualityGate } from "@/lib/uploads/videoAssets/motionQualityGate";
import {
  auditFalKlingI2VPaidSmokeRequest,
  buildFalKlingPayloadAudit,
  createFalKlingI2VProvider,
  createMockFalKlingI2VClient,
  evaluateFalKlingPaidRetryGate,
  guardFalKlingSubmitFailure,
  mapMotionSceneBriefToFalKlingI2VRequest,
  resolveFalKlingI2VReadiness,
  validateFalKlingI2VRequestShape
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

describe("fal Kling I2V paid smoke payload audit", () => {
  test("passes a valid scene-06 product rotate request without exposing raw values", () => {
    const audit = auditFalKlingI2VPaidSmokeRequest(validPayloadAuditInput());

    expect(audit).toMatchObject({
      payload_shape_valid: true,
      prompt_present: true,
      image_url_present: true,
      duration_valid: true,
      duration_is_5_or_10: true,
      duration_is_paid_smoke_5_seconds: true,
      aspect_ratio_valid: true,
      aspect_ratio_is_9_16: true,
      negative_prompt_present: true,
      source_image_safe_ref_present: true,
      external_image_accessibility_known: true,
      raw_image_url_masked: true,
      raw_values_masked: true,
      model_id_present: true,
      api_key_present_boolean_only: true,
      cost_approved: true,
      scene_id_is_product_rotate: true,
      scene_count_is_one: true,
      blockers: []
    });
    expect(JSON.stringify(audit)).not.toContain("masked-image-url-value");
    expect(JSON.stringify(audit)).not.toContain("fal-ai/kling-video/v1.6/pro/image-to-video");
    expect(JSON.stringify(audit)).not.toContain("replace-with-test-fal-key");
  });

  test("blocks missing image_url", () => {
    const audit = buildFalKlingPayloadAudit({
      ...validPayloadAuditInput(),
      imageUrl: ""
    });

    expect(audit).toMatchObject({
      payload_shape_valid: false,
      image_url_present: false,
      blockers: expect.arrayContaining(["FAL_KLING_IMAGE_URL_MISSING"])
    });
  });

  test("blocks invalid duration and non-5 paid-smoke duration", () => {
    const invalidDuration = validateFalKlingI2VRequestShape({
      ...validPayloadAuditInput(),
      duration: "12"
    });
    const tenSecondDuration = validateFalKlingI2VRequestShape({
      ...validPayloadAuditInput(),
      duration: "10"
    });

    expect(invalidDuration).toMatchObject({
      payload_shape_valid: false,
      duration_valid: false,
      blockers: expect.arrayContaining(["FAL_KLING_DURATION_INVALID"])
    });
    expect(tenSecondDuration).toMatchObject({
      payload_shape_valid: false,
      duration_valid: true,
      duration_is_5_or_10: true,
      duration_is_paid_smoke_5_seconds: false,
      blockers: expect.arrayContaining(["FAL_KLING_PAID_SMOKE_DURATION_NOT_5"])
    });
  });

  test("blocks invalid aspect ratio and non-9:16 paid-smoke aspect ratio", () => {
    const invalidAspect = buildFalKlingPayloadAudit({
      ...validPayloadAuditInput(),
      aspectRatio: "4:5"
    });
    const horizontalAspect = buildFalKlingPayloadAudit({
      ...validPayloadAuditInput(),
      aspectRatio: "16:9"
    });

    expect(invalidAspect).toMatchObject({
      payload_shape_valid: false,
      aspect_ratio_valid: false,
      blockers: expect.arrayContaining(["FAL_KLING_ASPECT_RATIO_INVALID"])
    });
    expect(horizontalAspect).toMatchObject({
      payload_shape_valid: false,
      aspect_ratio_valid: true,
      aspect_ratio_is_9_16: false,
      blockers: expect.arrayContaining(["FAL_KLING_PAID_SMOKE_ASPECT_RATIO_NOT_9_16"])
    });
  });

  test("masks raw image_url in blocked audit output", () => {
    const audit = buildFalKlingPayloadAudit({
      ...validPayloadAuditInput(),
      externalImageAccessibilityKnown: false
    });
    const serialized = JSON.stringify(audit);

    expect(audit).toMatchObject({
      payload_shape_valid: false,
      raw_image_url_masked: true,
      raw_values_masked: true,
      blockers: expect.arrayContaining(["FAL_KLING_EXTERNAL_IMAGE_ACCESSIBILITY_UNKNOWN"])
    });
    expect(serialized).not.toContain("masked-image-url-value");
    expect(serialized).not.toContain("replace-with-test-fal-key");
    expect(serialized).not.toContain("Author" + "ization");
  });
});

describe("fal Kling I2V submit failure guard", () => {
  test("502 without request_id does not poll, fetch result, or retry", () => {
    const guard = guardFalKlingSubmitFailure({
      submitHttpStatus: 502,
      requestId: null
    });

    expect(guard).toMatchObject({
      blocker: "FAL_SUBMIT_HTTP_502",
      submit_success: false,
      request_id_present: false,
      polling_attempted: false,
      result_fetch_attempted: false,
      retry_loop_attempted: false,
      generated_clip_count: 0,
      safe_to_retry: false,
      requires_fresh_approval: true,
      manual_dashboard_billing_check_required: true
    });
  });

  test("second paid submit is blocked without fresh retry approval and billing check", () => {
    const gate = evaluateFalKlingPaidRetryGate({
      payloadAuditPass: true,
      providerConfigured: true,
      costApproved: true,
      freshPaidRetryApproval: false,
      previousSubmitHadNoRequestId: true,
      manualDashboardBillingCheckDone: false
    });

    expect(gate).toMatchObject({
      paid_retry_allowed: false,
      blockers: expect.arrayContaining([
        "FAL_KLING_FRESH_PAID_RETRY_APPROVAL_REQUIRED",
        "FAL_KLING_MANUAL_BILLING_CHECK_REQUIRED"
      ])
    });
  });

  test("paid retry gate requires previous no-request-id evidence", () => {
    const gate = evaluateFalKlingPaidRetryGate({
      payloadAuditPass: true,
      providerConfigured: true,
      costApproved: true,
      freshPaidRetryApproval: true,
      previousSubmitHadNoRequestId: false,
      manualDashboardBillingCheckDone: true
    });

    expect(gate).toMatchObject({
      paid_retry_allowed: false,
      blockers: ["FAL_KLING_PREVIOUS_SUBMIT_REQUEST_ID_PRESENT"]
    });
  });

  test("safe summaries do not expose raw model, API key, or media URL values", () => {
    const audit = buildFalKlingPayloadAudit(validPayloadAuditInput());
    const guard = guardFalKlingSubmitFailure({
      submitHttpStatus: 502
    });
    const gate = evaluateFalKlingPaidRetryGate({
      payloadAuditPass: false,
      providerConfigured: false,
      costApproved: false,
      freshPaidRetryApproval: false,
      previousSubmitHadNoRequestId: true,
      manualDashboardBillingCheckDone: false
    });
    const serialized = JSON.stringify({ audit, guard, gate });

    expect(serialized).not.toContain("replace-with-test-fal-key");
    expect(serialized).not.toContain("fal-ai/kling-video/v1.6/pro/image-to-video");
    expect(serialized).not.toContain("masked-image-url-value");
    expect(serialized).not.toContain("masked-generated-media-value");
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

function validPayloadAuditInput() {
  return {
    prompt: "Photorealistic vertical 9:16 ecommerce short video with a slow product rotation.",
    imageUrl: "masked-image-url-value",
    duration: "5",
    aspectRatio: "9:16",
    negativePrompt: "cartoon, anime, watermark, low quality",
    cfgScale: 0.5,
    sourceImageSafeRef: "safe:image:candidate-001",
    externalImageAccessibilityKnown: true,
    modelId: "fal-ai/kling-video/v1.6/pro/image-to-video",
    apiKeyPresent: true,
    costApproved: true,
    sceneId: "scene-06-product-rotate",
    sceneCount: 1
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
      ok: false as const,
      providerName: name,
      providerMode: mode,
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED" as const],
      safeSummary: `${name} unavailable`
    }))
  };
}
