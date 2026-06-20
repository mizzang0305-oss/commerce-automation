import { describe, expect, test, vi } from "vitest";

import { buildMotionManifest } from "@/lib/uploads/videoAssets/motionManifest";
import {
  createMotionProviderRouter,
  selectMotionProvider
} from "@/lib/uploads/videoAssets/motionProviderRouter";
import {
  evaluateMotionQualityGate,
  REQUIRED_MOTION_QUALITY_BLOCKERS
} from "@/lib/uploads/videoAssets/motionQualityGate";
import type {
  MotionClipResult,
  MotionProvider,
  MotionProviderMode,
  MotionProviderName,
  MotionSceneBrief
} from "@/lib/uploads/videoAssets/motionProviderTypes";

describe("motion provider router scaffold", () => {
  test("prefers ComfyUI Wan I2V when configured", () => {
    const selection = selectMotionProvider([
      provider("comfyui_wan_i2v", "image_to_video_generated", true),
      provider("ltx_video", "real_motion_generated", true),
      provider("animated_still", "animated_still_generated", true),
      provider("slideshow", "slideshow_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "comfyui_wan_i2v",
      fallback_chain: ["comfyui_wan_i2v"]
    });
  });

  test("falls back to LTX Video when ComfyUI Wan is not configured", () => {
    const selection = selectMotionProvider([
      provider("comfyui_wan_i2v", "image_to_video_generated", false),
      provider("ltx_video", "real_motion_generated", true),
      provider("animated_still", "animated_still_generated", true),
      provider("slideshow", "slideshow_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "ltx_video",
      fallback_chain: ["comfyui_wan_i2v", "ltx_video"]
    });
  });

  test("falls back to animated still when video providers are not configured", () => {
    const selection = selectMotionProvider([
      provider("comfyui_wan_i2v", "image_to_video_generated", false),
      provider("ltx_video", "real_motion_generated", false),
      provider("animated_still", "animated_still_generated", true),
      provider("slideshow", "slideshow_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "animated_still",
      fallback_chain: ["comfyui_wan_i2v", "ltx_video", "animated_still"]
    });
  });

  test("slideshow provider is blocked for motion-first final upload", async () => {
    const router = createMotionProviderRouter({
      providers: [
        provider("comfyui_wan_i2v", "image_to_video_generated", false),
        provider("ltx_video", "real_motion_generated", false),
        provider("animated_still", "animated_still_generated", false),
        provider("slideshow", "slideshow_generated", true)
      ]
    });

    const result = await router.generate({
      sceneBriefs: sceneBriefs(),
      requireFinalUploadSafe: true
    });

    expect(result).toMatchObject({
      ok: false,
      provider_name: "slideshow",
      youtube_upload_allowed: false,
      blockers: expect.arrayContaining([
        "SLIDESHOW_LIKE_OUTPUT_BLOCKED",
        "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
      ])
    });
  });

  test("returns MOTION_PROVIDER_NOT_CONFIGURED when none are configured", () => {
    const selection = selectMotionProvider([
      provider("comfyui_wan_i2v", "image_to_video_generated", false),
      provider("ltx_video", "real_motion_generated", false),
      provider("animated_still", "animated_still_generated", false),
      provider("slideshow", "slideshow_generated", false)
    ]);

    expect(selection).toMatchObject({
      ok: false,
      blocker: "MOTION_PROVIDER_NOT_CONFIGURED",
      fallback_chain: ["comfyui_wan_i2v", "ltx_video", "animated_still", "slideshow"]
    });
  });
});

describe("motion quality gate scaffold", () => {
  test("exports the required motion-specific quality blockers", () => {
    expect(REQUIRED_MOTION_QUALITY_BLOCKERS).toEqual(expect.arrayContaining([
      "MOTION_PROVIDER_NOT_CONFIGURED",
      "REAL_MOTION_CLIP_REQUIRED",
      "MOTION_SCENE_COUNT_TOO_LOW",
      "HAND_INTERACTION_SCENE_MISSING",
      "UTENSIL_INTERACTION_SCENE_MISSING",
      "PRODUCT_ROTATE_SCENE_MISSING",
      "SLIDESHOW_LIKE_OUTPUT_BLOCKED",
      "ALL_SCENES_STATIC_BLOCKED",
      "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
    ]));
  });

  test("requires at least two hand interaction scenes", () => {
    const manifest = buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "comfyui_wan_i2v",
      clips: passingClips().map((clip) => ({
        ...clip,
        handInteraction: clip.sceneId === "scene-04-hand-pickup"
      })),
      publicUploadBlocked: true
    });

    expect(evaluateMotionQualityGate(manifest)).toMatchObject({
      final_upload_allowed: false,
      blockers: expect.arrayContaining(["HAND_INTERACTION_SCENE_MISSING"])
    });
  });

  test("requires at least two utensil interaction scenes", () => {
    const manifest = buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "ltx_video",
      clips: passingClips().map((clip) => ({
        ...clip,
        utensilInteraction: clip.sceneId === "scene-05-cooking-use"
      })),
      publicUploadBlocked: true
    });

    expect(evaluateMotionQualityGate(manifest)).toMatchObject({
      final_upload_allowed: false,
      blockers: expect.arrayContaining(["UTENSIL_INTERACTION_SCENE_MISSING"])
    });
  });

  test("requires a product rotate scene and keeps public or unlisted upload blocked", () => {
    const manifest = buildMotionManifest({
      productRef: "safe:coupang:candidate-001",
      providerName: "comfyui_wan_i2v",
      clips: passingClips().map((clip) => ({ ...clip, productRotateScene: false })),
      publicUploadBlocked: false
    });

    expect(evaluateMotionQualityGate(manifest)).toMatchObject({
      final_upload_allowed: false,
      public_upload_blocked: false,
      blockers: expect.arrayContaining([
        "PRODUCT_ROTATE_SCENE_MISSING",
        "PUBLIC_UPLOAD_NOT_BLOCKED"
      ])
    });
  });
});

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
      clips: sceneBriefs.map((scene) => clip(scene.sceneId, name, mode))
    }))
  };
}

function sceneBriefs(): MotionSceneBrief[] {
  return [
    brief("scene-01-hook"),
    brief("scene-02-problem"),
    brief("scene-03-product-intro"),
    brief("scene-04-hand-pickup", { handInteraction: true, utensilInteraction: true }),
    brief("scene-05-cooking-use", { handInteraction: true, utensilInteraction: true }),
    brief("scene-06-product-rotate", { productRotateScene: true }),
    brief("scene-07-checklist"),
    brief("scene-08-cta")
  ];
}

function passingClips() {
  return sceneBriefs().map((scene) => clip(scene.sceneId, "comfyui_wan_i2v", "image_to_video_generated", {
    handInteraction: scene.handInteraction,
    utensilInteraction: scene.utensilInteraction,
    productRotateScene: scene.productRotateScene
  }));
}

function brief(
  sceneId: string,
  overrides: Partial<MotionSceneBrief> = {}
): MotionSceneBrief {
  return {
    sceneId,
    prompt: "photorealistic ecommerce kitchen usage scene",
    negativePrompt: "no cartoon, no abstract shape card, no distorted hands",
    durationSeconds: 3,
    productSafeRef: "safe:coupang:candidate-001",
    requiredMotion: "subtle camera and product motion",
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    ...overrides
  };
}

function clip(
  sceneId: string,
  providerName: MotionProviderName,
  providerMode: MotionProviderMode,
  overrides: Partial<MotionClipResult> = {}
): MotionClipResult {
  return {
    sceneId,
    providerName,
    providerMode,
    safeClipRef: `safe:motion:${providerName}:${sceneId}`,
    durationSeconds: 3,
    realMotion: providerMode === "real_motion_generated" || providerMode === "image_to_video_generated",
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    staticFrameRatio: 0.05,
    slideshowLikeRatio: 0,
    imageSwapOnly: false,
    allScenesStatic: false,
    safeSummary: `${providerName} generated ${sceneId} without raw asset URLs`,
    ...overrides
  };
}
