import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V026_CLEAN_COMMERCE_FAIL_REASONS,
  buildV026FailureDecision,
  buildV027CleanCommerceScenePlan,
  buildV027CleanCommerceVisualGate,
  buildV027NegativePatternGateV2,
  buildV027ProductPresentationReport,
  evaluateV027AudioIntelligibility,
  generateV027CleanCommerceTemplateReviewPacket
} from "../scripts/uploads/generate-v027-clean-commerce-template-review-packet.mjs";
import {
  createDefaultAutopilotState,
  shouldBuildV027CleanCommerceTemplateFromFailReasons
} from "../scripts/autopilot/autopilot-safety-gates";
import { decideNextAutopilotAction } from "../scripts/autopilot/decide-next-action";

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

describe("v027 clean commerce shorts review packet", () => {
  test("records v026 owner visual failure as a non-upload decision", () => {
    const decision = buildV026FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v026",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      next_required_version: "v027"
    });
    expect(decision.fail_reasons).toEqual([
      "DARK_HORROR_LIKE_VISUAL",
      "SYNTHETIC_COMPOSITE_LOOKS_WRONG",
      "ABSTRACT_OVERLAY_ARTIFACTS",
      "COLOR_TINT_MAKES_PRODUCT_UNTRUSTWORTHY",
      "REAL_AD_VISUAL_GATE_FALSE_POSITIVE",
      "MOTION_VARIETY_GATE_FALSE_POSITIVE",
      "NOT_CLEAN_COMMERCE_AD",
      "NOT_CONVINCING_SHORTS_AD"
    ]);
  });

  test("builds six bright product-first commerce scenes without tint or abstract overlays", () => {
    const scenes = buildV027CleanCommerceScenePlan();

    expect(scenes).toHaveLength(6);
    expect(scenes[0]).toMatchObject({
      role: "hook",
      product_visible_first_frame: true,
      background_tone: "bright",
      product_color_tint: "none"
    });
    expect(scenes.every((scene) => scene.product_visible === true)).toBe(true);
    expect(scenes.every((scene) => scene.background_tone === "bright")).toBe(true);
    expect(scenes.every((scene) => scene.abstract_overlay_count === 0)).toBe(true);
    expect(scenes.every((scene) => scene.motion_style === "subtle_slide_scale")).toBe(true);
    expect(scenes.some((scene) => scene.role === "cta" && scene.shop_like_cta_present)).toBe(true);
  });

  test("passes clean commerce and negative-pattern gates for the default scene plan", () => {
    const scenes = buildV027CleanCommerceScenePlan();
    const cleanGate = buildV027CleanCommerceVisualGate({ scenes });
    const negativeGate = buildV027NegativePatternGateV2({ scenes });
    const presentation = buildV027ProductPresentationReport({ scenes, productImageReady: true });

    expect(cleanGate).toMatchObject({
      clean_commerce_visual_pass: true,
      bright_background_ratio: 1,
      dark_frame_ratio: 0,
      horror_like_visual: false,
      synthetic_composite_risk: false,
      abstract_overlay_count: 0,
      product_color_tint_changed: false,
      product_original_color_preserved: true,
      text_readability_pass: true,
      shop_like_cta_present: true,
      blockers: []
    });
    expect(negativeGate).toMatchObject({
      negative_pattern_gate_v2_pass: true,
      v024_text_card_pattern: false,
      v025_product_photo_card_pattern: false,
      v026_dark_composite_pattern: false,
      primitive_shape_artifact_pattern: false,
      unnatural_usage_simulation_pattern: false,
      blockers: []
    });
    expect(presentation).toMatchObject({
      product_image_ready: true,
      product_visible_first_frame: true,
      product_original_color_preserved: true,
      product_presentation_clean: true,
      product_presentation_blocker: null
    });
  });

  test("blocks dark/tinted/abstract scenes even when motion count is high", () => {
    const scenes = buildV027CleanCommerceScenePlan().map((scene, index) => ({
      ...scene,
      background_tone: index < 5 ? "dark" : scene.background_tone,
      product_color_tint: index === 0 ? "green_horror_tint" : scene.product_color_tint,
      abstract_overlay_count: index === 1 ? 2 : scene.abstract_overlay_count,
      synthetic_composite_risk: index === 2
    }));
    const cleanGate = buildV027CleanCommerceVisualGate({ scenes, motionVarietyCount: 10, realAdVisualPass: true });
    const negativeGate = buildV027NegativePatternGateV2({ scenes });

    expect(cleanGate.clean_commerce_visual_pass).toBe(false);
    expect(cleanGate.blockers).toEqual(expect.arrayContaining([
      "DARK_HORROR_LIKE_VISUAL",
      "PRODUCT_COLOR_TINT_CHANGED",
      "ABSTRACT_OVERLAY_ARTIFACTS",
      "SYNTHETIC_COMPOSITE_LOOKS_WRONG"
    ]));
    expect(negativeGate.negative_pattern_gate_v2_pass).toBe(false);
    expect(negativeGate.blockers).toContain("V026_DARK_COMPOSITE_PATTERN");
  });

  test("normalizes Korean ASR anchors for the clean commerce voiceover", () => {
    const probe = evaluateV027AudioIntelligibility({
      transcript: "\ube44 \uc624\ub294 \ub0a0 \ube68\ub798 \uac74\uc870\ub300\ub294 \uacf5\uac04\uc744 \uc544\ub07c\uace0 \uc811\uc5b4\uc11c \ubcf4\uad00\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4",
      speechRateWpm: 160,
      rawSimilarityScore: 0.91,
      transcriptSimilarityScore: 0.92
    });

    expect(probe).toMatchObject({
      real_asr_probe_executed: true,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: ["\ube68\ub798", "\uac74\uc870\ub300", "\uacf5\uac04"],
      audio_blocker: null
    });
  });

  test("creates a v027 pending-review packet with mocked local media and no upload side effects", async () => {
    const cwd = await makeCwd("commerce-v027-clean-commerce-");
    const productImagePath = await writeProductImage(cwd);

    const result = await generateV027CleanCommerceTemplateReviewPacket({
      cwd,
      env: voiceEnv(),
      productImagePath,
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
        transcript: "\ube68\ub798 \uac74\uc870\ub300 \uacf5\uac04 \ud655\uc778",
        speechRateWpm: 160,
        rawSimilarityScore: 0.94,
        transcriptSimilarityScore: 0.95,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v027",
      v026_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      clean_commerce_template_ready: true,
      clean_commerce_visual_pass: true,
      negative_pattern_gate_v2_pass: true,
      product_original_color_preserved: true,
      local_review_packet_ready: true,
      review_console_generated: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
      youtube_execute_called: false,
      r2_upload_write: false,
      product_assets_write: false
    });

    for (const artifactPath of [
      result.local_review_video_path,
      result.review_console_path,
      result.clean_commerce_visual_gate_path,
      result.negative_pattern_gate_v2_path,
      result.product_presentation_report_path,
      result.actual_frame_contact_sheet_path,
      result.shorts_ui_overlay_contact_sheet_path,
      result.asr_transcript_path,
      result.audio_intelligibility_probe_path,
      result.human_review_decision_path,
      result.review_summary_path
    ]) {
      await expect(stat(artifactPath)).resolves.toBeTruthy();
    }

    const v026Decision = JSON.parse(await readFile(result.v026_human_review_decision_path, "utf8"));
    const v027Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(v026Decision.fail_reasons).toEqual([...V026_CLEAN_COMMERCE_FAIL_REASONS]);
    expect(v027Decision).toMatchObject({
      version: "v027",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(summaryText).not.toContain("http://");
    expect(summaryText).not.toContain("https://");
  });
});

describe("autopilot v026 fail to v027 clean commerce decision", () => {
  test("routes v026 scary/dark composite failures to the clean commerce template renderer", async () => {
    expect(shouldBuildV027CleanCommerceTemplateFromFailReasons([...V026_CLEAN_COMMERCE_FAIL_REASONS])).toBe(true);

    const cwd = await makeCwd("commerce-v027-autopilot-");
    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v026",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: [...V026_CLEAN_COMMERCE_FAIL_REASONS]
      }),
      reviewDecision: {
        version: "v026",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: false,
        fail_reasons: [...V026_CLEAN_COMMERCE_FAIL_REASONS]
      },
      packageJson: {
        scripts: {
          "review:v027": "node scripts/uploads/generate-v027-clean-commerce-template-review-packet.mjs"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "HUMAN_REVIEW_FAILED",
      nextAction: "BUILD_V027_CLEAN_COMMERCE_TEMPLATE_REVIEW",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "review:v027",
      reviewCommandAvailable: true
    });
  });
});
