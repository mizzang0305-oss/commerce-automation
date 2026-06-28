import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V024_VISUAL_REGRESSION_FAIL_REASONS,
  buildV024VisualRegressionFailureDecision,
  buildV025CardRegressionGate,
  buildV025ProductFirstTimeline,
  buildV025ProductImageVisibilityReport,
  buildV025ReviewSummary,
  buildV025ScriptVisualAlignmentReport,
  evaluateV025AudioIntelligibility,
  generateV025ProductFirstAdVisualReviewPacket,
  inspectV025ProductImage
} from "../scripts/uploads/generate-v025-product-first-ad-visual-review-packet.mjs";
import {
  createDefaultAutopilotState,
  shouldBuildV025ProductAdVisualReviewFromFailReasons
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

describe("v025 product-first ad visual review packet", () => {
  test("locks v024 visual false positives as a non-upload owner failure", () => {
    const decision = buildV024VisualRegressionFailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v024",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      next_required_version: "v025"
    });
    expect(decision.fail_reasons).toEqual(V024_VISUAL_REGRESSION_FAIL_REASONS);
    expect(decision.fail_reasons).toEqual([
      "TEXT_CARD_RENDERER_REGRESSION",
      "ABSTRACT_SHAPE_VISUALS",
      "PRODUCT_IMAGE_NOT_VISIBLE_AS_SOLUTION_EARLY_ENOUGH",
      "SCRIPT_DRIVEN_METRICS_FALSE_POSITIVE",
      "VIDEO_STILL_LOOKS_LIKE_READING_CARD",
      "NOT_AD_LIKE"
    ]);
  });

  test("builds product-first timeline with solution preview inside the first two seconds", () => {
    const timeline = buildV025ProductFirstTimeline();

    expect(timeline).toHaveLength(8);
    expect(timeline[0]).toMatchObject({
      scene: 1,
      role: "hook_solution_preview",
      product_image_required: true,
      product_visible_in_first_2s: true,
      product_visual_central: true,
      visual_kind: "product_ad_scene"
    });
    expect(timeline[0].product_bbox_area_ratio).toBeGreaterThanOrEqual(0.18);
    expect(timeline[1].product_image_required).toBe(true);
    expect(timeline.filter((scene) => scene.product_image_required)).toHaveLength(8);
    expect(timeline.filter((scene) => scene.product_visual_central)).toHaveLength(6);
    expect(timeline.filter((scene) => scene.visual_kind === "text_card")).toHaveLength(0);
    expect(timeline.filter((scene) => scene.primitive_bar_or_box_visual === true)).toHaveLength(0);
  });

  test("passes product image visibility only when product is large, early, and central enough", async () => {
    const cwd = await makeCwd("commerce-v025-product-visibility-");
    await writeProductImage(cwd);
    const productImage = await inspectV025ProductImage({ cwd });
    const timeline = buildV025ProductFirstTimeline();

    const report = buildV025ProductImageVisibilityReport({ timeline, productImage });

    expect(report).toMatchObject({
      product_image_ready: true,
      product_image_visible_in_first_2s: true,
      product_image_visible_scene_count: 8,
      product_image_central_scene_count: 6,
      drying_rack_visible_as_solution: true,
      product_visibility_blocker: null,
      raw_product_image_url_printed: false
    });
    expect(report.product_image_bbox_area_ratio_first_2s).toBeGreaterThanOrEqual(0.12);
    expect(report.product_image_bbox_area_ratio_solution_scenes).toBeGreaterThanOrEqual(0.18);

    const badReport = buildV025ProductImageVisibilityReport({
      timeline: timeline.map((scene) => ({
        ...scene,
        product_visible_in_first_2s: false,
        product_bbox_area_ratio: 0.08,
        product_visual_central: scene.scene >= 6
      })),
      productImage
    });

    expect(badReport.product_visibility_blocker).toBe("PRODUCT_IMAGE_NOT_VISIBLE_IN_FIRST_2S");
  });

  test("blocks text-card, abstract-shape, and primitive-box regressions", () => {
    const timeline = buildV025ProductFirstTimeline();
    const gate = buildV025CardRegressionGate({ timeline });

    expect(gate).toMatchObject({
      text_card_scene_count: 0,
      abstract_shape_scene_count: 0,
      primitive_bar_or_box_scene_count: 0,
      reading_card_feeling: false,
      ad_like_visual_pass: true,
      card_regression_blocker: null
    });

    const badGate = buildV025CardRegressionGate({
      timeline: timeline.map((scene) => ({
        ...scene,
        visual_kind: "text_card",
        primitive_bar_or_box_visual: true
      }))
    });

    expect(badGate.ad_like_visual_pass).toBe(false);
    expect(badGate.card_regression_blocker).toBe("TEXT_CARD_RENDERER_REGRESSION");
  });

  test("requires each script sentence to have a visual counterpart before summary can pass", async () => {
    const cwd = await makeCwd("commerce-v025-script-visual-");
    await writeProductImage(cwd);
    const productImage = await inspectV025ProductImage({ cwd });
    const timeline = buildV025ProductFirstTimeline();
    const visibility = buildV025ProductImageVisibilityReport({ timeline, productImage });
    const cardGate = buildV025CardRegressionGate({ timeline });
    const alignment = buildV025ScriptVisualAlignmentReport({ timeline, visibility });
    const audioProbe = evaluateV025AudioIntelligibility({
      transcript: "rain laundry drying rack space check",
      speechRateWpm: 160,
      rawSimilarityScore: 0.92,
      transcriptSimilarityScore: 0.92
    });
    const summary = buildV025ReviewSummary({
      timeline,
      visibility,
      cardGate,
      alignment,
      voiceoverGenerated: true,
      videoHasAudioStream: true,
      localReviewVideoCreated: true,
      audioProbe
    });

    expect(alignment).toMatchObject({
      script_visual_alignment_pass: true,
      each_script_sentence_has_visual_counterpart: true,
      product_solution_connection_score: 94,
      problem_visual_before_solution: true,
      solution_visual_appears_before_halfway: true,
      script_visual_blocker: null
    });
    expect(summary).toMatchObject({
      version: "v025",
      product_first_ad_visual_ready: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });

  test("normalizes Korean ASR drying-rack anchor when 건조대 is split to 건조", () => {
    const probe = evaluateV025AudioIntelligibility({
      transcript: "장마철 빨래 냄새와 건조 공간을 확인하세요",
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

  test("creates a v025 pending-review packet and never enables upload from mocked local media", async () => {
    const cwd = await makeCwd("commerce-v025-ready-");
    const productImagePath = await writeProductImage(cwd);

    const result = await generateV025ProductFirstAdVisualReviewPacket({
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
        transcript: "rain laundry drying rack space check",
        speechRateWpm: 160,
        rawSimilarityScore: 0.93,
        transcriptSimilarityScore: 0.93,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v025",
      v024_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      product_image_ready: true,
      product_image_visible_in_first_2s: true,
      product_image_visible_scene_count: 8,
      product_image_central_scene_count: 6,
      drying_rack_visible_as_solution: true,
      text_card_scene_count: 0,
      abstract_shape_scene_count: 0,
      primitive_bar_or_box_scene_count: 0,
      ad_like_visual_pass: true,
      script_visual_alignment_pass: true,
      product_solution_connection_score: 94,
      melotts_voice_used: true,
      raw_similarity_score: 0.93,
      transcript_similarity_score: 0.93,
      core_anchor_recognition_pass: true,
      review_console_generated: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });

    for (const artifactPath of [
      result.local_review_video_path,
      result.review_console_path,
      result.product_image_visibility_report_path,
      result.card_regression_gate_path,
      result.script_visual_alignment_report_path,
      result.actual_frame_contact_sheet_path,
      result.shorts_ui_overlay_contact_sheet_path,
      result.asr_transcript_path,
      result.audio_intelligibility_probe_path,
      result.human_review_decision_path,
      result.review_summary_path
    ]) {
      await expect(stat(artifactPath)).resolves.toBeTruthy();
    }

    const v024Decision = JSON.parse(await readFile(result.v024_human_review_decision_path, "utf8"));
    const v025Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(v024Decision.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(v025Decision).toMatchObject({
      version: "v025",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(summaryText).not.toContain("http://");
    expect(summaryText).not.toContain("https://");
  });
});

describe("autopilot v024 fail to v025 product-ad visual decision", () => {
  test("routes visual false positives to v025 product-first ad visual review", async () => {
    expect(shouldBuildV025ProductAdVisualReviewFromFailReasons([...V024_VISUAL_REGRESSION_FAIL_REASONS])).toBe(true);

    const cwd = await makeCwd("commerce-v025-autopilot-");
    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v024",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: [...V024_VISUAL_REGRESSION_FAIL_REASONS]
      }),
      reviewDecision: {
        version: "v024",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: false,
        fail_reasons: [...V024_VISUAL_REGRESSION_FAIL_REASONS]
      },
      packageJson: {
        scripts: {
          "review:v025": "node scripts/uploads/generate-v025-product-first-ad-visual-review-packet.mjs"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "HUMAN_REVIEW_FAILED",
      nextAction: "BUILD_V025_PRODUCT_AD_VISUAL_REVIEW",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "review:v025",
      reviewCommandAvailable: true
    });
  });
});
