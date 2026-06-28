import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V032_OWNER_FAIL_REASONS,
  buildV033AudioPostProcessPlan,
  buildV032OwnerReviewDecision,
  buildV033SceneMotionPlan,
  buildV033VoiceoverScript,
  evaluateV033AudioTailGuard,
  evaluateV033HookVisibility,
  evaluateV033SalesIdentity,
  generateV033MinzCommerceHouseStyleReviewPacket
} from "../scripts/uploads/generate-v033-minz-commerce-house-style-review-packet.mjs";
import { MINZ_COMMERCE_SHORTS_STYLE } from "../src/uploads/shorts-style/minz-commerce-shorts-style";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeLockedSceneInputs(cwd) {
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v029");
  const sceneRoot = path.join(v029Root, "scene-assets");
  await mkdir(sceneRoot, { recursive: true });
  for (const scene of buildV033SceneMotionPlan()) {
    await writeFile(path.join(sceneRoot, `${scene.scene_key}.png`), `scene-${scene.scene_key}`, "utf8");
  }
}

describe("v033 Minz Commerce Shorts house-style review packet", () => {
  test("records v032 owner review as a near-pass failure before building v033", () => {
    const decision = buildV032OwnerReviewDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v032",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      next_action: "BUILD_V033_MINZ_COMMERCE_HOUSE_STYLE_REVIEW"
    });
    expect(decision.pass_aspects).toEqual(expect.arrayContaining([
      "REAL_IMAGE_SKILL_SCENES_ACCEPTABLE",
      "SCRIPT_TO_SCENE_FLOW_ACCEPTABLE",
      "MOTION_MUCH_STABILIZED",
      "CONTENT_DIRECTION_ACCEPTABLE"
    ]));
    expect(decision.fail_reasons).toEqual(V032_OWNER_FAIL_REASONS);
  });

  test("defines reusable Minz Commerce house-style tokens for future shorts", () => {
    expect(MINZ_COMMERCE_SHORTS_STYLE).toMatchObject({
      hookTone: "loss_aversion_direct",
      visualTone: "clean_real_life_commerce",
      captionWeight: "bold",
      captionContrast: "high",
      productRole: "solution_after_problem",
      voiceTone: "firm_sales_explainer",
      ctaStyle: "clear_description_check"
    });
    expect(MINZ_COMMERCE_SHORTS_STYLE.forbiddenPatterns).toEqual(expect.arrayContaining([
      "text_card_video",
      "ppt_slide",
      "weak_generic_hook",
      "low_contrast_caption",
      "audio_tail_cutoff",
      "overactive_motion",
      "horror_or_dark_composite"
    ]));
  });

  test("makes the first three seconds readable, high contrast, and loss-aversion led", () => {
    const plan = buildV033SceneMotionPlan();
    const hook = evaluateV033HookVisibility(plan);

    expect(hook).toMatchObject({
      hook_visibility_pass: true,
      hook_text_contrast_pass: true,
      hook_text_visible_within_first_0_5s: true,
      hook_keyword_highlight_present: true,
      hook_safe_area_pass: true,
      hook_blocker: null
    });
    expect(hook.hook_text_readability_score).toBeGreaterThanOrEqual(92);
    expect(hook.hook_copy).toBe("장마철 빨래 냄새,\n건조대 잘못 고르면 계속 납니다");
    expect(hook.sub_hook_copy).toBe("좁은 공간이면\n자리 차지하는 건조대부터 피하세요");
    expect(hook.keyword_highlights).toEqual(expect.arrayContaining(["냄새", "잘못 고르면", "계속 납니다"]));
  });

  test("applies channel sales identity instead of generic commerce copy", () => {
    const sales = evaluateV033SalesIdentity(buildV033SceneMotionPlan(), buildV033VoiceoverScript());

    expect(sales).toMatchObject({
      sales_identity_pass: true,
      channel_style_applied: true,
      loss_aversion_hook_present: true,
      why_watch_clear: true,
      firm_sales_voice_present: true,
      generic_commerce_tone: false,
      sales_identity_blocker: null
    });
    expect(buildV033VoiceoverScript()).toContain("건조대 잘못 고르면 계속 납니다");
    expect(buildV033VoiceoverScript()).toContain("구매 전에는 하중, 크기, 접었을 때 보관성을 꼭 체크하세요");
    expect(buildV033VoiceoverScript()).toContain("상품 설명에서 먼저 확인해 보세요");
  });

  test("passes audio tail guard only when the final CTA is fully protected", () => {
    const pass = evaluateV033AudioTailGuard({
      transcript: `${buildV033VoiceoverScript()}\n`,
      audioProbe: {
        real_asr_probe_executed: true,
        transcript_similarity_score: 0.95,
        speech_rate_wpm: 158,
        final_sentence_fully_audible: true
      },
      videoProbe: {
        duration_seconds: 24.4,
        audio_duration_seconds: 22.9,
        video_has_audio_stream: true
      },
      tailPaddingSeconds: 1.4,
      endCardHoldSeconds: 1.5
    });

    expect(pass).toMatchObject({
      audio_tail_guard_pass: true,
      voice_authority_pass: true,
      final_sentence_fully_audible: true,
      last_transcript_contains_cta: true,
      no_audio_truncation: true,
      no_mux_cutoff: true,
      audio_tail_blocker: null
    });

    const fail = evaluateV033AudioTailGuard({
      transcript: "구매 전에는 하중, 크기",
      audioProbe: {
        real_asr_probe_executed: true,
        transcript_similarity_score: 0.62,
        speech_rate_wpm: 172,
        final_sentence_fully_audible: false
      },
      videoProbe: {
        duration_seconds: 22.9,
        audio_duration_seconds: 22.8,
        video_has_audio_stream: true
      },
      tailPaddingSeconds: 0.2,
      endCardHoldSeconds: 0.4
    });

    expect(fail.audio_tail_guard_pass).toBe(false);
    expect(fail.blockers).toEqual(expect.arrayContaining([
      "FINAL_SENTENCE_NOT_FULLY_AUDIBLE",
      "CTA_AUDIO_MISSING",
      "VIDEO_ENDS_BEFORE_AUDIO_TAIL"
    ]));
  });

  test("plans local voice post-processing when raw TTS is too long for the shorts tail guard", () => {
    const plan = buildV033AudioPostProcessPlan({
      rawAudioDurationSeconds: 36.233,
      targetVideoDurationSeconds: 24.4
    });

    expect(plan).toMatchObject({
      post_process_required: true,
      target_audio_duration_seconds: 22.9,
      target_video_duration_seconds: 24.4,
      minimum_tail_room_seconds: 1.2
    });
    expect(plan.atempo_multiplier).toBeGreaterThanOrEqual(1.55);
    expect(plan.expected_tail_room_seconds).toBeGreaterThanOrEqual(1.2);
  });

  test("creates a v033 pending review packet without upload or asset writes", async () => {
    const cwd = await makeCwd("commerce-v033-ready-");
    await writeLockedSceneInputs(cwd);

    const result = await generateV033MinzCommerceHouseStyleReviewPacket({
      cwd,
      voiceRunner: async ({ scriptPath, audioPath, probePath, transcriptPath }) => {
        const script = await readFile(scriptPath, "utf8");
        await writeFile(audioPath, "fake-v033-audio", "utf8");
        await writeFile(transcriptPath, script, "utf8");
        await writeFile(probePath, JSON.stringify({
          real_asr_probe_executed: true,
          raw_similarity_score: 0.96,
          transcript_similarity_score: 0.96,
          core_anchor_recognition_pass: true,
          context_anchor_recognition_pass: true,
          final_sentence_fully_audible: true,
          recognized_core_anchors: ["빨래", "건조대", "공간"],
          recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
          speech_rate_wpm: 158,
          audio_duration_seconds: 22.9,
          audio_blocker: null
        }, null, 2), "utf8");
      },
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-media", "utf8");
      },
      videoProbe: async () => ({
        duration_seconds: 24.4,
        audio_duration_seconds: 22.9,
        video_has_audio_stream: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v033",
      v032_status: "FAIL_LOCAL_HUMAN_REVIEW",
      hook_visibility_pass: true,
      sales_identity_pass: true,
      audio_tail_guard_pass: true,
      motion_smoothness_pass: true,
      image_assets_reused: true,
      hook_asset_regenerated: false,
      script_updated: true,
      voiceover_regenerated: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
      PUBLIC_UPLOAD_BLOCKED: true,
      youtube_execute_called: false,
      videos_insert_called: false,
      r2_upload_write: false,
      product_assets_write: false,
      db_write: false
    });
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    await expect(stat(result.hook_visibility_report_path)).resolves.toBeTruthy();
    await expect(stat(result.sales_identity_report_path)).resolves.toBeTruthy();
    await expect(stat(result.audio_tail_guard_report_path)).resolves.toBeTruthy();
    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    expect(decision).toMatchObject({
      version: "v033",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
  });
});
