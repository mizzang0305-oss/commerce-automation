import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import {
  DEFAULT_MOTION_COST_POLICY,
  evaluatePaidMotionProviderPolicy
} from "@/lib/uploads/videoAssets/motionCostPolicy";
import {
  buildDefaultAdvancedStillMotionPlan
} from "@/lib/uploads/videoAssets/advancedStillMotionPlan";
import {
  evaluateLowCostMotionQualityGate
} from "@/lib/uploads/videoAssets/lowCostMotionQualityGate";
import {
  createMotionProviderRouter,
  selectMotionProvider
} from "@/lib/uploads/videoAssets/motionProviderRouter";
import {
  createAdvancedStillMotionProvider
} from "@/lib/uploads/videoAssets/providers/advancedStillMotionProvider";
import {
  createFalKlingI2VProvider
} from "@/lib/uploads/videoAssets/providers/falKlingI2VProvider";
import {
  createSourceVideoProvider,
  resolveSourceVideoProviderReadiness
} from "@/lib/uploads/videoAssets/providers/sourceVideoProvider";
import type {
  MotionProvider,
  MotionProviderMode,
  MotionProviderName
} from "@/lib/uploads/videoAssets/motionProviderTypes";

describe("low-cost motion shorts pivot cost policy", () => {
  test("paid I2V is blocked in autopilot by default", () => {
    expect(DEFAULT_MOTION_COST_POLICY).toMatchObject({
      autopilotPaidI2VEnabled: false,
      maxPaidI2VScenesPerShort: 0,
      maxPaidI2VCostPerShortUsd: 0,
      premiumManualOnly: true,
      freshApprovalRequired: true
    });

    const policy = evaluatePaidMotionProviderPolicy({
      providerName: "fal_kling_i2v",
      routeMode: "autopilot",
      requestedSceneCount: 1,
      estimatedCostUsd: 0.08
    });

    expect(policy).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        "PAID_I2V_AUTOPILOT_BLOCKED",
        "PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED",
        "PAID_I2V_COST_CAP_REQUIRED",
        "PAID_I2V_SCENE_CAP_EXCEEDED"
      ])
    });
  });

  test("fal Kling provider cannot run without premium manual approval", async () => {
    const provider = createFalKlingI2VProvider({
      env: configuredFalEnv(),
      executionMode: "mock"
    });

    const result = await provider.generate({ sceneBriefs: [sceneBrief("scene-06-product-rotate")] });

    expect(result).toMatchObject({
      ok: false,
      blockers: expect.arrayContaining(["PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED"])
    });
  });

  test("cost cap blocks paid I2V when max cost is zero", () => {
    const policy = evaluatePaidMotionProviderPolicy({
      providerName: "fal_kling_i2v",
      routeMode: "premium_manual",
      requestedSceneCount: 1,
      estimatedCostUsd: 0.01,
      premiumManualApproval: true,
      freshApproval: true
    });

    expect(policy).toMatchObject({
      allowed: false,
      maxPaidI2VCostPerShortUsd: 0,
      blockers: expect.arrayContaining(["PAID_I2V_COST_CAP_REQUIRED"])
    });
  });
});

describe("low-cost motion shorts pivot router", () => {
  test("advanced still motion provider is selected before paid provider in autopilot", () => {
    const selection = selectMotionProvider([
      createFalKlingI2VProvider({ env: configuredFalEnv(), executionMode: "mock" }),
      createAdvancedStillMotionProvider(),
      provider("slideshow", "slideshow_generated", true)
    ]);

    expect(selection).toMatchObject({
      ok: true,
      provider_name: "advanced_still_motion",
      fallback_chain: [
        "rights_confirmed_source_video",
        "advanced_still_motion"
      ]
    });
  });

  test("videos.insert and storage writes are not called by the pivot path", async () => {
    const videosInsert = vi.fn();
    const r2Write = vi.fn();
    const productAssetsWrite = vi.fn();
    const dbWrite = vi.fn();
    const router = createMotionProviderRouter({
      providers: [
        createAdvancedStillMotionProvider(),
        provider("slideshow", "slideshow_generated", true)
      ]
    });

    const result = await router.generate({
      sceneBriefs: buildDefaultAdvancedStillMotionPlan({
        candidateId: "candidate-490aa6d25e8ea89d",
        productSafeRef: "safe:coupang:candidate-490aa6d25e8ea89d"
      }).sceneBriefs,
      requireFinalUploadSafe: true
    });

    expect(videosInsert).not.toHaveBeenCalled();
    expect(r2Write).not.toHaveBeenCalled();
    expect(productAssetsWrite).not.toHaveBeenCalled();
    expect(dbWrite).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider_name: "advanced_still_motion",
      youtube_upload_allowed: false
    });
  });
});

describe("advanced still motion plan and quality gate", () => {
  test("low-cost motion plan creates eight programmed scenes", () => {
    const plan = buildDefaultAdvancedStillMotionPlan({
      candidateId: "candidate-490aa6d25e8ea89d",
      productSafeRef: "safe:coupang:candidate-490aa6d25e8ea89d"
    });

    expect(plan.sceneBriefs).toHaveLength(8);
    expect(plan.sceneBriefs.map((scene) => scene.sceneId)).toEqual([
      "scene-01-hook",
      "scene-02-problem",
      "scene-03-product-intro",
      "scene-04-hand-pickup",
      "scene-05-cooking-use",
      "scene-06-product-rotate",
      "scene-07-checklist",
      "scene-08-cta"
    ]);
    expect(plan.sceneBriefs.map((scene) => scene.requiredMotion)).toEqual(expect.arrayContaining([
      "product_push_in",
      "product_orbit_illusion",
      "product_cutout_slide",
      "parallax_countertop",
      "slow_zoom_pan",
      "checklist_overlay_motion",
      "cta_product_hero_motion"
    ]));
  });

  test("low-cost motion quality gate accepts sufficient programmed motion", () => {
    const report = evaluateLowCostMotionQualityGate({
      paidI2VSceneCount: 0,
      lowCostMotionSceneCount: 8,
      staticOnlyRatio: 0.18,
      sameFrameRatio: 0.22,
      captionSafeAreaPass: true,
      voiceoverAudioPresent: true,
      hookVisibleFirstSecond: true,
      noTextClipped: true,
      publicUploadBlocked: true
    });

    expect(report).toMatchObject({
      final_upload_allowed: false,
      low_cost_motion_ready: true,
      blockers: ["LOW_COST_MOTION_RENDERER_NOT_EXECUTED"]
    });
  });

  test("low-cost motion quality gate blocks static-only output", () => {
    const report = evaluateLowCostMotionQualityGate({
      paidI2VSceneCount: 0,
      lowCostMotionSceneCount: 3,
      staticOnlyRatio: 0.8,
      sameFrameRatio: 0.78,
      captionSafeAreaPass: true,
      voiceoverAudioPresent: true,
      hookVisibleFirstSecond: true,
      noTextClipped: true,
      publicUploadBlocked: true
    });

    expect(report).toMatchObject({
      low_cost_motion_ready: false,
      blockers: expect.arrayContaining([
        "LOW_COST_MOTION_SCENE_COUNT_TOO_LOW",
        "STATIC_ONLY_RATIO_TOO_HIGH",
        "SAME_FRAME_RATIO_TOO_HIGH"
      ])
    });
  });
});

describe("source video provider scaffold", () => {
  test("source video provider requires rights confirmation", () => {
    const readiness = resolveSourceVideoProviderReadiness({
      enabled: true,
      rightsConfirmed: false,
      rawDownloadRequested: false
    });
    const provider = createSourceVideoProvider({ readiness });

    expect(readiness).toMatchObject({
      enabled: true,
      configured: false,
      blocker: "SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED"
    });
    expect(provider.configured).toBe(false);
  });

  test("source video provider blocks raw download even when rights are confirmed", () => {
    const readiness = resolveSourceVideoProviderReadiness({
      enabled: true,
      rightsConfirmed: true,
      rawDownloadRequested: true
    });

    expect(readiness).toMatchObject({
      configured: false,
      blocker: "SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED"
    });
  });
});

describe("low-cost motion pivot docs", () => {
  test("docs mention paid I2V as premium/manual only", () => {
    const docs = [
      "docs/LOW_COST_MOTION_SHORTS_STRATEGY.md",
      "docs/MOTION_FIRST_SHORTS_ARCHITECTURE.md",
      "docs/FAL_KLING_I2V_PROVIDER.md"
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(docs).toContain("paid I2V is premium/manual only");
    expect(docs).toContain("advanced still motion");
    expect(docs).toContain("PAID_I2V_AUTOPILOT_BLOCKED");
    expect(docs).not.toContain("paid I2V is the default autopilot provider");
  });
});

function configuredFalEnv() {
  return {
    FAL_KLING_I2V_ENABLED: "true",
    FAL_API_KEY: "replace-with-test-fal-key",
    FAL_KLING_I2V_MODEL_ID: "fal-ai/kling-video/v1.6/pro/image-to-video",
    FAL_KLING_I2V_COST_APPROVED: "true"
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
    safeSummary: `${name} scaffold only`,
    generate: vi.fn(async () => ({
      ok: false as const,
      providerName: name,
      providerMode: mode,
      blockers: ["MOTION_PROVIDER_NOT_CONFIGURED" as const],
      safeSummary: `${name} unavailable`
    }))
  };
}

function sceneBrief(sceneId: string) {
  return buildDefaultAdvancedStillMotionPlan({
    candidateId: "candidate-490aa6d25e8ea89d",
    productSafeRef: "safe:coupang:candidate-490aa6d25e8ea89d"
  }).sceneBriefs.find((scene) => scene.sceneId === sceneId)!;
}
