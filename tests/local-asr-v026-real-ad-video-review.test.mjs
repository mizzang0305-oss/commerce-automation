import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V025_FALSE_POSITIVE_FAIL_REASONS,
  V026_REQUIRED_CORE_ANCHORS,
  buildV025FailureDecision,
  buildV026NegativePatternGate,
  buildV026ProductInteractionReport,
  buildV026RealAdScenePlan,
  buildV026RealAdVisualGate,
  evaluateV026AudioIntelligibility,
  generateV026RealAdVideoReviewPacket,
  inspectV026ProductImage
} from "../scripts/uploads/generate-v026-real-ad-video-review-packet.mjs";
import {
  createDefaultAutopilotState,
  shouldBuildV026RealAdVideoReviewFromFailReasons
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

describe("v026 real ad video review packet", () => {
  test("records v025 owner review failure and keeps upload blocked", () => {
    const decision = buildV025FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v025",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      requires_fresh_upload_approval: true,
      next_required_version: "v026"
    });
    expect(decision.fail_reasons).toEqual([
      "PRODUCT_PHOTO_CARD_SLIDE",
      "STILL_LOOKS_LIKE_PPT",
      "PRODUCT_VISIBLE_BUT_NOT_VIDEO_LIKE",
      "NO_REAL_USAGE_SCENE",
      "NO_AD_LIKE_MOTION",
      "SCRIPT_VISUAL_GATE_FALSE_POSITIVE",
      "PRODUCT_FIRST_GATE_FALSE_POSITIVE",
      "NOT_CONVINCING_SHORTS_AD"
    ]);
  });

  test("requires product cutout motion, usage simulation, before/after, depth, and CTA motion", () => {
    const scenes = buildV026RealAdScenePlan();
    const gate = buildV026RealAdVisualGate({ scenes });

    expect(scenes).toHaveLength(8);
    expect(gate).toMatchObject({
      real_ad_visual_pass: true,
      product_photo_card_slide: false,
      ppt_slide_feeling: false,
      visual_depth_pass: true,
      product_cutout_motion_used: true,
      usage_simulation_used: true,
      before_after_used: true,
      cta_motion_used: true,
      real_ad_visual_blocker: null
    });
    expect(gate.motion_variety_count).toBeGreaterThanOrEqual(4);

    const brokenGate = buildV026RealAdVisualGate({
      scenes: scenes.map((scene) => ({
        ...scene,
        product_display_mode: "photo_card",
        ad_motion_directives: ["static_photo_card"],
        visual_depth: false,
        usage_simulation: false,
        before_after: false,
        cta_motion: false
      }))
    });

    expect(brokenGate.real_ad_visual_pass).toBe(false);
    expect(brokenGate.real_ad_visual_blockers).toEqual(expect.arrayContaining([
      "PRODUCT_PHOTO_CARD_SLIDE",
      "STILL_LOOKS_LIKE_PPT",
      "NO_REAL_USAGE_SCENE",
      "NO_AD_LIKE_MOTION",
      "MOTION_VARIETY_TOO_LOW",
      "NO_PRODUCT_DEPTH",
      "NO_USAGE_SIMULATION",
      "NO_BEFORE_AFTER"
    ]));
  });

  test("negative-pattern gate blocks v025-style static card/product-photo frames", () => {
    const scenes = buildV026RealAdScenePlan();
    const gate = buildV026NegativePatternGate({ scenes });

    expect(gate).toMatchObject({
      negative_pattern_match: false,
      static_card_frame_ratio: 0,
      product_photo_card_frame_ratio: 0,
      primitive_shape_frame_ratio: 0,
      negative_pattern_blocker: null
    });

    const brokenGate = buildV026NegativePatternGate({
      scenes: scenes.map((scene) => ({
        ...scene,
        static_card_frame: true,
        product_photo_card_frame: true,
        primitive_shape_frame: true
      }))
    });

    expect(brokenGate.negative_pattern_match).toBe(true);
    expect(brokenGate.negative_pattern_blockers).toEqual(expect.arrayContaining([
      "V025_NEGATIVE_PATTERN_MATCH",
      "STATIC_CARD_FRAME_RATIO_TOO_HIGH",
      "PRODUCT_PHOTO_CARD_FRAME_RATIO_TOO_HIGH",
      "PRIMITIVE_SHAPE_FRAME_RATIO_TOO_HIGH"
    ]));
  });

  test("product interaction report requires the product to act as an object, not a fixed card", async () => {
    const cwd = await makeCwd("commerce-v026-product-interaction-");
    await writeProductImage(cwd);
    const productImage = await inspectV026ProductImage({ cwd });
    const scenes = buildV026RealAdScenePlan();
    const interaction = buildV026ProductInteractionReport({ scenes, productImage });

    expect(interaction).toMatchObject({
      product_image_ready: true,
      product_image_visible_in_first_2s: true,
      product_image_visible_scene_count: 8,
      product_image_central_scene_count: 6,
      product_depth_effect_used: true,
      product_interaction_overlay_used: true,
      product_fixed_in_rectangle_card: false,
      only_zoom_pan_used: false,
      product_interaction_pass: true,
      product_interaction_blocker: null
    });

    const brokenInteraction = buildV026ProductInteractionReport({
      scenes: scenes.map((scene) => ({
        ...scene,
        product_display_mode: "photo_card",
        product_depth: false,
        product_interaction_overlay: false,
        product_fixed_in_rectangle_card: true,
        only_zoom_pan: true
      })),
      productImage
    });

    expect(brokenInteraction.product_interaction_pass).toBe(false);
    expect(brokenInteraction.product_interaction_blockers).toEqual(expect.arrayContaining([
      "PRODUCT_PHOTO_CARD_SLIDE",
      "NO_PRODUCT_DEPTH",
      "NO_USAGE_SIMULATION"
    ]));
  });

  test("keeps MeloTTS audio expectations at approved speed and recognizes core anchors", () => {
    const probe = evaluateV026AudioIntelligibility({
      transcript: "장마철 빨래 냄새와 공간 부족은 접이식 빨래 건조대 하나로 확인하세요.",
      speechRateWpm: 160,
      rawSimilarityScore: 0.9,
      transcriptSimilarityScore: 0.91
    });

    expect(probe).toMatchObject({
      real_asr_probe_executed: true,
      raw_similarity_score: 0.9,
      transcript_similarity_score: 0.91,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: V026_REQUIRED_CORE_ANCHORS,
      speech_rate_wpm: 160,
      audio_blocker: null
    });
  });

  test("normalizes common local ASR confusion for the drying-rack anchor", () => {
    const probe = evaluateV026AudioIntelligibility({
      transcript: "장마철 빨래 냄새와 공간 문제는 접이쉬 빨래 건조되는 방식으로 해결합니다.",
      speechRateWpm: 160,
      rawSimilarityScore: 0.9,
      transcriptSimilarityScore: 0.9
    });

    expect(probe).toMatchObject({
      core_anchor_recognition_pass: true,
      recognized_core_anchors: V026_REQUIRED_CORE_ANCHORS,
      audio_blocker: null
    });
  });

  test("creates a pending v026 real-ad review packet without enabling upload", async () => {
    const cwd = await makeCwd("commerce-v026-ready-");
    const productImagePath = await writeProductImage(cwd);

    const result = await generateV026RealAdVideoReviewPacket({
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
        transcript: "장마철 빨래 냄새와 공간 부족은 접이식 빨래 건조대 하나로 해결해 보세요.",
        speechRateWpm: 160,
        rawSimilarityScore: 0.93,
        transcriptSimilarityScore: 0.94,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v026",
      v025_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      real_ad_visual_pass: true,
      negative_pattern_match: false,
      product_interaction_pass: true,
      motion_variety_count: expect.any(Number),
      melotts_voice_used: true,
      voiceover_generated: true,
      raw_similarity_score: 0.93,
      transcript_similarity_score: 0.94,
      core_anchor_recognition_pass: true,
      local_review_packet_ready: true,
      review_console_generated: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    expect(result.motion_variety_count).toBeGreaterThanOrEqual(4);

    for (const artifactPath of [
      result.local_review_video_path,
      result.review_console_path,
      result.real_ad_visual_gate_path,
      result.negative_pattern_gate_path,
      result.product_interaction_report_path,
      result.actual_frame_contact_sheet_path,
      result.shorts_ui_overlay_contact_sheet_path,
      result.asr_transcript_path,
      result.audio_intelligibility_probe_path,
      result.human_review_decision_path,
      result.review_summary_path
    ]) {
      await expect(stat(artifactPath)).resolves.toBeTruthy();
    }

    const v025Decision = JSON.parse(await readFile(result.v025_human_review_decision_path, "utf8"));
    const v026Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(v025Decision.fail_reasons).toEqual(V025_FALSE_POSITIVE_FAIL_REASONS);
    expect(v026Decision).toMatchObject({
      version: "v026",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(summaryText).not.toContain("http://");
    expect(summaryText).not.toContain("https://");
  });
});

describe("autopilot v025 fail to v026 decision", () => {
  test("routes product-card false positive failures to real ad video review", async () => {
    expect(shouldBuildV026RealAdVideoReviewFromFailReasons([...V025_FALSE_POSITIVE_FAIL_REASONS])).toBe(true);

    const cwd = await makeCwd("commerce-v026-autopilot-");
    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v025",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: [...V025_FALSE_POSITIVE_FAIL_REASONS]
      }),
      reviewDecision: {
        version: "v025",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: false,
        fail_reasons: [...V025_FALSE_POSITIVE_FAIL_REASONS]
      },
      packageJson: {
        scripts: {
          "review:v026": "node scripts/uploads/generate-v026-real-ad-video-review-packet.mjs"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "HUMAN_REVIEW_FAILED",
      nextAction: "BUILD_V026_REAL_AD_VIDEO_REVIEW",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "review:v026",
      reviewCommandAvailable: true
    });
  });
});
