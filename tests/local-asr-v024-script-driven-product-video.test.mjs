import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V024_REQUIRED_MOTIONS,
  buildV023FailureDecision,
  buildV024ProductImageUsageReport,
  buildV024ReviewSummary,
  buildV024ScriptAlignmentReport,
  buildV024ScriptSceneTimeline,
  evaluateV024AudioIntelligibility,
  generateV024ScriptDrivenProductVideoReviewPacket,
  inspectV024ProductImage
} from "../scripts/uploads/generate-v024-script-driven-product-video-review-packet.mjs";
import {
  V023_STOCK_SCENE_FAIL_REASONS,
  createDefaultAutopilotState,
  shouldBuildScriptDrivenProductVideoFromFailReasons
} from "../scripts/autopilot/autopilot-safety-gates";
import {
  decideNextAutopilotAction
} from "../scripts/autopilot/decide-next-action";

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

describe("v024 script-driven product video review packet", () => {
  test("records v023 stock-scene failure as a non-upload decision", () => {
    const decision = buildV023FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v023",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      next_required_version: "v024"
    });
    expect(decision.fail_reasons).toEqual([
      "STOCK_SCENE_IRRELEVANT_TO_PRODUCT",
      "STOCK_ASSET_SEMANTIC_MISMATCH",
      "PRODUCT_NOT_USED_AS_MAIN_VISUAL",
      "SCRIPT_NOT_DRIVING_VIDEO",
      "DRYING_RACK_NOT_VISUALLY_CENTRAL",
      "STORY_FLOW_NOT_CLEAR"
    ]);
  });

  test("builds an eight-scene timeline where script order reveals the product after problem scenes", () => {
    const timeline = buildV024ScriptSceneTimeline();

    expect(timeline).toHaveLength(8);
    expect(timeline.slice(0, 4).every((scene) => scene.role === "problem")).toBe(true);
    expect(timeline[4]).toMatchObject({
      scene: 5,
      role: "product_reveal",
      product_image_required: true,
      product_visual_central: true
    });
    expect(timeline.slice(4).every((scene) => scene.product_image_required === true)).toBe(true);
    expect(timeline.flatMap((scene) => scene.motion_directives)).toEqual(expect.arrayContaining(V024_REQUIRED_MOTIONS));

    const productPlacements = new Set(timeline
      .filter((scene) => scene.product_image_required)
      .map((scene) => `${scene.product_layout.x}:${scene.product_layout.y}:${scene.product_layout.width}`));
    expect(productPlacements.size).toBeGreaterThanOrEqual(3);
  });

  test("passes product usage and script alignment only when product image is central in solution scenes", async () => {
    const cwd = await makeCwd("commerce-v024-product-usage-");
    await writeProductImage(cwd);
    const productImage = await inspectV024ProductImage({ cwd });
    const timeline = buildV024ScriptSceneTimeline();
    const productUsage = buildV024ProductImageUsageReport({ timeline, productImage });
    const alignment = buildV024ScriptAlignmentReport({ timeline });
    const summary = buildV024ReviewSummary({
      timeline,
      productUsage,
      alignment,
      voiceoverGenerated: true,
      videoHasAudioStream: true,
      localReviewVideoCreated: true,
      audioProbe: {
        real_asr_probe_executed: true,
        raw_similarity_score: 0.95,
        transcript_similarity_score: 0.95,
        core_anchor_recognition_pass: true,
        recognized_core_anchors: ["빨래", "건조대", "공간"],
        speech_rate_wpm: 160,
        audio_blocker: null
      }
    });

    expect(productUsage).toMatchObject({
      product_image_ready: true,
      product_image_used: true,
      product_image_used_in_solution_scenes: true,
      product_visual_central_scene_count: 4,
      product_solution_connection_score: 92,
      drying_rack_visible_as_solution: true,
      product_image_blocker: null,
      raw_product_image_url_printed: false
    });
    expect(alignment).toMatchObject({
      script_driven_timeline_pass: true,
      script_scene_alignment_score: 92,
      script_driving_video: true,
      problem_before_product_visible: true,
      stock_asset_role: "background_or_supporting",
      stock_asset_became_main_visual: false,
      stock_scene_irrelevant: false,
      script_alignment_blocker: null
    });
    expect(summary).toMatchObject({
      version: "v024",
      script_driven_renderer_added: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });

  test("normalizes common ASR confusion for the Korean drying-rack product anchor", () => {
    const probe = evaluateV024AudioIntelligibility({
      transcript: "장마철 빨래 냄새 접이식 빨래 건조되라면 작은 공간에서도 빨래를 말릴 수 있습니다",
      speechRateWpm: 160,
      rawSimilarityScore: 0.9,
      transcriptSimilarityScore: 0.9
    });

    expect(probe).toMatchObject({
      core_anchor_recognition_pass: true,
      recognized_core_anchors: ["빨래", "건조대", "공간"],
      audio_blocker: null
    });
  });

  test("blocks v024 generation before media when the selected product image is missing", async () => {
    const cwd = await makeCwd("commerce-v024-missing-image-");

    const result = await generateV024ScriptDrivenProductVideoReviewPacket({
      cwd,
      env: voiceEnv(),
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "must-not-run", "utf8");
      }
    });

    expect(result).toMatchObject({
      target_version: "v024",
      review_console_generated: false,
      product_image_ready: false,
      product_image_blocker: "PRODUCT_IMAGE_NOT_READY",
      local_review_packet_ready: false,
      human_review_status: "PRODUCT_IMAGE_NOT_READY",
      private_upload_allowed: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    await expect(stat(result.review_console_path)).rejects.toThrow();
  });

  test("creates a v024 pending-review packet from product image, script timeline, and mocked local media", async () => {
    const cwd = await makeCwd("commerce-v024-ready-");
    const productImagePath = await writeProductImage(cwd);

    const result = await generateV024ScriptDrivenProductVideoReviewPacket({
      cwd,
      env: voiceEnv(),
      productImagePath,
      ttsRunner: async ({ audioPath, speedMultiplier }) => {
        expect(speedMultiplier).toBeGreaterThan(1);
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
        transcript: "장마철 빨래 건조대 공간 확인",
        speechRateWpm: 160,
        rawSimilarityScore: 0.94,
        transcriptSimilarityScore: 0.94,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v024",
      v023_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      script_driven_renderer_added: true,
      scene_timeline_generated: true,
      script_scene_alignment_score: 92,
      product_image_ready: true,
      product_visual_central_scene_count: 4,
      product_solution_connection_score: 92,
      drying_rack_visible_as_solution: true,
      stock_asset_role: "background_or_supporting",
      stock_asset_became_main_visual: false,
      melotts_voice_used: true,
      voiceover_generated: true,
      raw_similarity_score: 0.94,
      transcript_similarity_score: 0.94,
      core_anchor_recognition_pass: true,
      local_review_packet_ready: true,
      review_console_generated: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });

    for (const artifactPath of [
      result.local_review_video_path,
      result.review_console_path,
      result.script_scene_timeline_path,
      result.product_image_usage_report_path,
      result.script_alignment_report_path,
      result.actual_frame_contact_sheet_path,
      result.shorts_ui_overlay_contact_sheet_path,
      result.asr_transcript_path,
      result.audio_intelligibility_probe_path,
      result.human_review_decision_path,
      result.review_summary_path
    ]) {
      await expect(stat(artifactPath)).resolves.toBeTruthy();
    }

    const v023Decision = JSON.parse(await readFile(result.v023_human_review_decision_path, "utf8"));
    const v024Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(v023Decision.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(v024Decision).toMatchObject({
      version: "v024",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(summaryText).not.toContain("http://");
    expect(summaryText).not.toContain("https://");
  });
});

describe("autopilot v023 fail to v024 decision", () => {
  test("routes stock-scene/product-image/script failures to script-driven product video", async () => {
    expect(shouldBuildScriptDrivenProductVideoFromFailReasons([...V023_STOCK_SCENE_FAIL_REASONS])).toBe(true);

    const cwd = await makeCwd("commerce-v024-autopilot-");
    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v023",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: [...V023_STOCK_SCENE_FAIL_REASONS]
      }),
      reviewDecision: {
        version: "v023",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: false,
        fail_reasons: [...V023_STOCK_SCENE_FAIL_REASONS]
      },
      packageJson: {
        scripts: {
          "review:v024": "node scripts/uploads/generate-v024-script-driven-product-video-review-packet.mjs"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "HUMAN_REVIEW_FAILED",
      nextAction: "BUILD_SCRIPT_DRIVEN_PRODUCT_VIDEO",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "review:v024",
      reviewCommandAvailable: true
    });
  });
});
