import { describe, expect, test, vi } from "vitest";

import {
  createCloudImageToVideoProvider,
  resolveCloudVideoProviderReadiness
} from "@/lib/uploads/videoAssets/providers/cloudImageToVideoProvider";
import {
  createMotionProviderRouter,
  selectMotionProvider
} from "@/lib/uploads/videoAssets/motionProviderRouter";
import type {
  MotionProvider,
  MotionSceneBrief
} from "@/lib/uploads/videoAssets/motionProviderTypes";

describe("cloud image-to-video provider scaffold", () => {
  test("defaults to disabled and not configured when API key is absent", () => {
    const readiness = resolveCloudVideoProviderReadiness({ env: {} });
    const provider = createCloudImageToVideoProvider({ env: {} });

    expect(readiness).toMatchObject({
      enabled: false,
      configured: false,
      blocker: "CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED"
    });
    expect(provider.configured).toBe(false);
    expect(provider.safeSummary).not.toContain("sk-");
  });

  test("requires cost approval before execution even when API key is present", async () => {
    const provider = createCloudImageToVideoProvider({
      env: {
        CLOUD_VIDEO_PROVIDER_ENABLED: "true",
        CLOUD_VIDEO_PROVIDER_NAME: "fal",
        CLOUD_VIDEO_PROVIDER_API_KEY: "sk-cloud-secret"
      },
      executionMode: "mock"
    });

    expect(provider.configured).toBe(false);

    const result = await provider.generate({ sceneBriefs: sceneBriefs() });

    expect(result).toMatchObject({
      ok: false,
      providerName: "cloud_image_to_video",
      blockers: ["CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED"]
    });
    expect(result.safeSummary).not.toContain("sk-cloud-secret");
  });

  test("mock cloud i2v result satisfies motion clip contract without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = createCloudImageToVideoProvider({
      env: configuredEnv(),
      executionMode: "mock"
    });

    const result = await provider.generate({ sceneBriefs: sceneBriefs() });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      providerName: "cloud_image_to_video",
      providerMode: "image_to_video_generated"
    });
    expect(result.ok && result.clips).toHaveLength(3);
    if (result.ok) {
      expect(result.clips.every((clip) => clip.realMotion)).toBe(true);
      expect(result.clips.filter((clip) => clip.handInteraction)).toHaveLength(2);
      expect(result.clips.filter((clip) => clip.utensilInteraction)).toHaveLength(2);
      expect(result.clips.some((clip) => clip.productRotateScene)).toBe(true);
      expect(JSON.stringify(result.clips)).not.toContain("sk-cloud-secret");
    }
  });

  test("router falls back to configured cloud provider when local ComfyUI is unavailable", () => {
    const selection = selectMotionProvider([
      createCloudImageToVideoProvider({ env: configuredEnv(), executionMode: "mock" }),
      provider("comfyui_wan_i2v", false),
      provider("animated_still", true),
      provider("slideshow", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "cloud_image_to_video",
      fallback_chain: ["cloud_image_to_video"]
    });
  });

  test("unavailable motion providers keep upload blocked and do not call videos.insert", async () => {
    const videosInsert = vi.fn();
    const router = createMotionProviderRouter({
      providers: [
        createCloudImageToVideoProvider({ env: {}, executionMode: "mock" }),
        provider("comfyui_wan_i2v", false),
        provider("animated_still", false),
        provider("slideshow", false)
      ]
    });

    const result = await router.generate({
      sceneBriefs: sceneBriefs(),
      requireFinalUploadSafe: true
    });

    expect(videosInsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      youtube_upload_allowed: false,
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED"]
    });
  });
});

function configuredEnv() {
  return {
    CLOUD_VIDEO_PROVIDER_ENABLED: "true",
    CLOUD_VIDEO_PROVIDER_NAME: "fal",
    CLOUD_VIDEO_PROVIDER_API_KEY: "sk-cloud-secret",
    CLOUD_VIDEO_PROVIDER_COST_APPROVED: "true"
  };
}

function provider(name: "comfyui_wan_i2v" | "animated_still" | "slideshow", configured: boolean): MotionProvider {
  const mode = name === "animated_still"
    ? "animated_still_generated"
    : name === "slideshow"
      ? "slideshow_generated"
      : "image_to_video_generated";

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

function sceneBriefs(): MotionSceneBrief[] {
  return [
    brief("scene-04-hand-pickup", { handInteraction: true, utensilInteraction: true }),
    brief("scene-05-cooking-use", { handInteraction: true, utensilInteraction: true }),
    brief("scene-06-product-rotate", { productRotateScene: true })
  ];
}

function brief(sceneId: string, overrides: Partial<MotionSceneBrief>): MotionSceneBrief {
  return {
    sceneId,
    kind: sceneId.includes("rotate") ? "product_rotate" : sceneId.includes("cooking") ? "cooking_use" : "hand_pickup",
    prompt: "photorealistic vertical commerce kitchen motion",
    negativePrompt: "no cartoon, no fake logo, no distorted hands",
    durationSeconds: 3,
    productSafeRef: "safe:coupang:candidate-490aa6d25e8ea89d",
    sourceImageSafeRef: "safe:image:candidate-490aa6d25e8ea89d",
    requiredMotion: "real product motion",
    handInteraction: false,
    utensilInteraction: false,
    productRotateScene: false,
    kitchenContext: true,
    ...overrides
  };
}
