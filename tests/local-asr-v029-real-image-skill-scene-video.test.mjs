import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V028_FAIL_REASONS,
  V029_REQUIRED_SCENE_KEYS,
  buildV028FailureDecision,
  buildV029RealImageScenePlan,
  generateV029RealImageSkillSceneVideoReviewPacket,
  validateV029SceneAssetGate
} from "../scripts/uploads/generate-v029-real-image-skill-scene-video-review-packet.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSceneAsset(cwd, sceneKey, body = "real-image") {
  const sceneDir = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v029", "scene-assets");
  await mkdir(sceneDir, { recursive: true });
  const assetPath = path.join(sceneDir, `${sceneKey}.png`);
  await writeFile(assetPath, `${body}-${sceneKey}`, "utf8");
  return assetPath;
}

async function writeProductImage(cwd) {
  const productDir = path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID);
  await mkdir(productDir, { recursive: true });
  const productImagePath = path.join(productDir, "source-product-e85e25a977.jpg");
  await writeFile(productImagePath, "product-image", "utf8");
  return productImagePath;
}

function buildValidManifest(assetPaths) {
  const plan = buildV029RealImageScenePlan();
  return {
    candidate_id: CANDIDATE_ID,
    version: "v029",
    asset_source: "image_skill_generated",
    real_image_skill_provider_connected: true,
    scenes: plan.map((scene) => ({
      scene_key: scene.scene_key,
      asset_path: assetPaths[scene.scene_key],
      asset_source: "image_skill_generated",
      visual_tags: Object.fromEntries(scene.required_visual_tags.map((tag) => [tag, true])),
      not_product_image_clone: true,
      not_same_as_other_scene: true,
      not_card_render: true,
      not_placeholder: true,
      not_prompt_only: true
    }))
  };
}

function validProvenance() {
  return {
    provider: "codex_builtin_image_gen",
    provider_mode: "built_in_image_gen",
    asset_source: "image_skill_generated",
    real_image_skill_provider_connected: true,
    raw_urls_masked: true
  };
}

function phashOverrides(distance = 32) {
  const sceneToProduct = Object.fromEntries(V029_REQUIRED_SCENE_KEYS.map((key) => [key, distance]));
  const sceneToScene = {};
  for (let i = 0; i < V029_REQUIRED_SCENE_KEYS.length; i += 1) {
    for (let j = i + 1; j < V029_REQUIRED_SCENE_KEYS.length; j += 1) {
      sceneToScene[`${V029_REQUIRED_SCENE_KEYS[i]}|${V029_REQUIRED_SCENE_KEYS[j]}`] = distance;
    }
  }
  return { sceneToProduct, sceneToScene };
}

describe("v029 real image-skill scene video packet", () => {
  test("records v028 as failed because image prompts were not realized", () => {
    const decision = buildV028FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v028",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      next_required_version: "v029"
    });
    expect(decision.fail_reasons).toEqual(V028_FAIL_REASONS);
    expect(decision.fail_reasons).toContain("IMAGE_SKILL_NOT_ACTUALLY_USED");
    expect(decision.fail_reasons).toContain("PRODUCT_IMAGE_REPEATED_AS_SCENE");
  });

  test("requires eight distinct real image-skill scenes with semantic tags", () => {
    const plan = buildV029RealImageScenePlan();

    expect(plan.map((scene) => scene.scene_key)).toEqual(V029_REQUIRED_SCENE_KEYS);
    expect(plan.every((scene) => scene.asset_source_required === "image_skill_generated")).toBe(true);
    expect(plan.find((scene) => scene.scene_key === "rain-window")?.required_visual_tags)
      .toEqual(["rain_visible", "window_visible", "indoor_context"]);
    expect(plan.find((scene) => scene.scene_key === "human-hanging-laundry-use-case")?.required_visual_tags)
      .toEqual(["human_hands_or_person_visible", "laundry_being_hung", "drying_rack_visible"]);
  });

  test("blocks when the image-skill provider/provenance is not connected", async () => {
    const cwd = await makeCwd("commerce-v029-no-provider-");
    await writeProductImage(cwd);

    const result = await validateV029SceneAssetGate({
      cwd,
      manifest: null,
      provenance: null
    });

    expect(result).toMatchObject({
      real_image_skill_provider_connected: false,
      real_scene_asset_gate_pass: false,
      blocker: "BLOCKED_REAL_IMAGE_SKILL_PROVIDER_NOT_CONNECTED"
    });
  });

  test("blocks repeated product-image clone scenes before media generation", async () => {
    const cwd = await makeCwd("commerce-v029-clone-");
    const productImagePath = await writeProductImage(cwd);
    const assetPaths = {};
    for (const sceneKey of V029_REQUIRED_SCENE_KEYS) {
      assetPaths[sceneKey] = await writeSceneAsset(cwd, sceneKey);
    }

    const result = await validateV029SceneAssetGate({
      cwd,
      productImagePath,
      manifest: buildValidManifest(assetPaths),
      provenance: validProvenance(),
      phashOverrides: phashOverrides(2)
    });

    expect(result.real_scene_asset_gate_pass).toBe(false);
    expect(result.blocker).toBe("BLOCKED_V029_REAL_SCENE_ASSET_GATE");
    expect(result.scene_results.some((scene) => scene.not_product_image_clone === false)).toBe(true);
  });

  test("creates a pending-review packet from real image-skill assets and mocked media", async () => {
    const cwd = await makeCwd("commerce-v029-ready-");
    const productImagePath = await writeProductImage(cwd);
    const assetPaths = {};
    for (const sceneKey of V029_REQUIRED_SCENE_KEYS) {
      assetPaths[sceneKey] = await writeSceneAsset(cwd, sceneKey);
    }

    const result = await generateV029RealImageSkillSceneVideoReviewPacket({
      cwd,
      productImagePath,
      manifest: buildValidManifest(assetPaths),
      provenance: validProvenance(),
      phashOverrides: phashOverrides(32),
      env: {
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: path.join(os.tmpdir(), "melotts-wrapper.cmd"),
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      },
      ttsRunner: async ({ audioPath, speedMultiplier }) => {
        expect(speedMultiplier).toBeGreaterThan(0.9);
        await writeFile(audioPath, "fake-wave", "utf8");
        return { ok: true };
      },
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-media", "utf8");
      },
      videoProbe: async () => ({
        duration_seconds: 24,
        video_has_audio_stream: true
      }),
      asrRunner: async () => ({
        transcript: "장마철 빨래 냄새와 습기, 접이식 빨래건조대 공간 확인",
        speechRateWpm: 160,
        rawSimilarityScore: 0.9,
        transcriptSimilarityScore: 0.9,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v029",
      v028_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      real_image_skill_provider_connected: true,
      real_scene_asset_gate_pass: true,
      generated_asset_count: 8,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    const summary = JSON.parse(await readFile(result.review_summary_path, "utf8"));
    expect(summary).toMatchObject({
      version: "v029",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      youtube_execute_called: false,
      r2_upload_write: false,
      product_assets_write: false
    });
  });
});
