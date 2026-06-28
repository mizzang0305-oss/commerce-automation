import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV028ImageSceneQualityGate,
  buildV028SceneAssetPlan,
  evaluateV028AudioIntelligibility,
  generateV028ImageSkillRealCommerceReviewPacket
} from "../scripts/uploads/generate-v028-image-skill-real-commerce-review-packet.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeProductImage(cwd) {
  const productImageDir = path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID);
  await mkdir(productImageDir, { recursive: true });
  const productImagePath = path.join(productImageDir, PRODUCT_IMAGE_BASENAME);
  await writeFile(productImagePath, "fake-product-image", "utf8");
  return productImagePath;
}

function voiceEnv(commandPath = path.join(os.tmpdir(), "private-melotts-wrapper.cmd")) {
  return {
    KOREAN_VOICE_PROVIDER: "local_command",
    KOREAN_VOICE_PROVIDER_APPROVED: "true",
    KOREAN_VOICE_COMMAND: commandPath,
    KOREAN_VOICE_LANGUAGE: "ko",
    KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
  };
}

describe("v028 image-skill-driven real commerce review packet", () => {
  test("builds eight realistic scene asset prompts for rainy-season drying-rack commerce flow", () => {
    const plan = buildV028SceneAssetPlan();

    expect(plan).toHaveLength(8);
    expect(plan.map((scene) => scene.asset_key)).toEqual([
      "rain-window",
      "wet-laundry-problem",
      "small-room-laundry-mess",
      "drying-rack-reveal",
      "laundry-items-use-case",
      "indoor-drying-strength",
      "before-after-room-laundry",
      "buying-checklist-background"
    ]);
    expect(plan.every((scene) => scene.realistic_photo_prompt.includes("bright"))).toBe(true);
    expect(plan.every((scene) => scene.forbidden_patterns.includes("dark horror look"))).toBe(true);
    expect(plan.filter((scene) => scene.product_image_usage === "main_foreground").length).toBeGreaterThanOrEqual(5);
  });

  test("passes scene image quality only when assets are realistic, bright, and product-connected", () => {
    const pass = buildV028ImageSceneQualityGate({
      sceneAssets: buildV028SceneAssetPlan().map((scene) => ({
        ...scene,
        asset_generated: true,
        realistic_photo: true,
        horror_or_dark: false,
        abstract_or_ppt: false,
        product_connection_clear: true,
        product_image_dominance: scene.product_image_usage === "main_foreground" ? 0.72 : 0.48
      }))
    });
    const fail = buildV028ImageSceneQualityGate({
      sceneAssets: buildV028SceneAssetPlan().map((scene, index) => ({
        ...scene,
        asset_generated: true,
        realistic_photo: index !== 0,
        horror_or_dark: index === 1,
        abstract_or_ppt: index === 2,
        product_connection_clear: index !== 3,
        product_image_dominance: 0.1
      }))
    });

    expect(pass).toMatchObject({
      quality_gate_pass: true,
      generated_scene_asset_count: 8,
      rejected_asset_count: 0,
      product_connected_scene_count: 8
    });
    expect(fail.quality_gate_pass).toBe(false);
    expect(fail.rejected_reasons).toEqual(expect.arrayContaining([
      "SCENE_ASSET_NOT_REALISTIC_PHOTO",
      "SCENE_ASSET_DARK_OR_HORROR",
      "SCENE_ASSET_ABSTRACT_OR_PPT",
      "SCENE_ASSET_NOT_CONNECTED_TO_PRODUCT",
      "PRODUCT_NOT_VISUALLY_CENTRAL"
    ]));
  });

  test("recognizes required Korean core and context anchors", () => {
    const probe = evaluateV028AudioIntelligibility({
      transcript: "\uc7a5\ub9c8\ucca0 \ube68\ub798 \uac74\uc870\ub300\ub294 \uacf5\uac04\uacfc \uc2b5\uae30, \ud1b5\ud48d\uc744 \uba3c\uc800 \ud655\uc778\ud558\uc138\uc694",
      speechRateWpm: 160,
      rawSimilarityScore: 0.9,
      transcriptSimilarityScore: 0.91
    });

    expect(probe).toMatchObject({
      real_asr_probe_executed: true,
      core_anchor_recognition_pass: true,
      context_anchor_recognition_pass: true,
      recognized_core_anchors: ["\ube68\ub798", "\uac74\uc870\ub300", "\uacf5\uac04"],
      recognized_context_anchors: ["\uc7a5\ub9c8\ucca0", "\uc2b5\uae30", "\ud1b5\ud48d", "\ud655\uc778"],
      audio_blocker: null
    });
  });

  test("creates a v028 pending-review packet with image scene manifest and no upload side effects", async () => {
    const cwd = await makeCwd("commerce-v028-image-skill-");
    const productImagePath = await writeProductImage(cwd);

    const result = await generateV028ImageSkillRealCommerceReviewPacket({
      cwd,
      env: voiceEnv(),
      productImagePath,
      imageAssetRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-scene-image", "utf8");
      },
      ttsRunner: async ({ audioPath, speedMultiplier }) => {
        expect(speedMultiplier).toBe(1.14);
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
        transcript: "\uc7a5\ub9c8\ucca0 \ube68\ub798 \uac74\uc870\ub300 \uacf5\uac04 \uc2b5\uae30 \ud1b5\ud48d \ud655\uc778",
        speechRateWpm: 160,
        rawSimilarityScore: 0.92,
        transcriptSimilarityScore: 0.93
      })
    });

    expect(result).toMatchObject({
      version: "v028",
      based_on_previous_failures: true,
      selected_product_name: "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300",
      generated_scene_asset_count: 8,
      quality_gate_pass: true,
      local_review_video_generated: true,
      transcript_similarity_score: 0.93,
      core_anchor_recognition_pass: true,
      product_visible_in_first_2s: true,
      product_central_scene_count: 8,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      youtube_execute_called: false,
      R2_upload: false,
      product_assets_write: false
    });

    for (const artifactPath of [
      result.local_review_video_path,
      result.review_console_path,
      result.actual_frame_contact_sheet_path,
      result.shorts_ui_overlay_contact_sheet_path,
      result.asr_transcript_path,
      result.audio_intelligibility_probe_path,
      result.script_scene_timeline_path,
      result.image_scene_manifest_path,
      result.image_generation_provenance_path,
      result.human_review_decision_path,
      result.review_summary_path
    ]) {
      await expect(stat(artifactPath)).resolves.toBeTruthy();
    }

    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const manifest = JSON.parse(await readFile(result.image_scene_manifest_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(decision).toMatchObject({
      version: "v028",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(manifest.scene_assets).toHaveLength(8);
    expect(summaryText).not.toContain("http://");
    expect(summaryText).not.toContain("https://");
  });
});
