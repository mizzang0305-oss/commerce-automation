import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V020_REQUIRED_CORE_ANCHORS,
  V020_VOICEOVER_SCRIPT,
  buildV019FailureDecision,
  buildV020RealMotionGate,
  buildV020RealMotionReviewSummary,
  buildV020ScenePlan,
  evaluateV020AudioIntelligibility,
  generateV020ReviewPacket
} from "../scripts/uploads/generate-v020-review-packet.mjs";

describe("v020 real motion local review packet", () => {
  test("records v019 owner review as a failed non-upload baseline", () => {
    const decision = buildV019FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: "candidate-3c4f2ee364ba5b07",
      version: "v019",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      next_required_version: "v020"
    });
    expect(decision.fail_reasons).toEqual(expect.arrayContaining([
      "VIDEO_LOOKS_LIKE_TEXT_READING_CARD",
      "NO_REAL_IN_SCENE_MOTION",
      "SLIDESHOW_CARD_FEELING",
      "STATIC_STORYBOARD_DESPITE_CONTACT_SHEET_PASS",
      "VOICE_ACCEPTABLE_BUT_SPEED_SLIGHTLY_SLOW"
    ]));
  });

  test("passes the v020 real-motion gate only with animated in-scene object motion", () => {
    const gate = buildV020RealMotionGate(buildV020ScenePlan());

    expect(gate).toMatchObject({
      real_motion_renderer_added: true,
      animated_scene_count: 8,
      static_card_scene_count: 0,
      text_only_scene_count: 0,
      product_photo_only_scene_count: 0,
      animated_problem_scene_present: true,
      animated_use_case_scene_present: true,
      animated_before_after_scene_present: true,
      animated_cta_scene_present: true,
      motion_not_limited_to_text_or_color: true,
      sampled_frames_per_scene: 5,
      animated_object_motion_scene_count: 8,
      real_motion_gate_pass: true,
      real_motion_probe_pass: true,
      real_motion_blocker: null
    });
    expect(gate.average_intra_scene_frame_delta).toBeGreaterThanOrEqual(0.12);
    expect(gate.text_only_motion_ratio).toBeLessThanOrEqual(0.25);
    expect(gate.color_only_motion_ratio).toBeLessThanOrEqual(0.2);
    expect(gate.static_card_ratio).toBeLessThanOrEqual(0.2);
  });

  test("blocks text-only or color-only slides even when there are eight scenes", () => {
    const weakScenes = Array.from({ length: 8 }, (_, index) => ({
      id: `static_scene_${index + 1}`,
      source_type: index < 3 ? "problem_graphic" : "text_card",
      motion_categories: ["text", "color"],
      animated_object_motion: false,
      in_scene_frame_delta: 0.03,
      uses_product_photo: index === 3,
      product_photo_only: index === 3
    }));

    const gate = buildV020RealMotionGate(weakScenes);

    expect(gate.real_motion_gate_pass).toBe(false);
    expect(gate.real_motion_probe_pass).toBe(false);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      "TEXT_ONLY_MOTION",
      "COLOR_ONLY_MOTION",
      "STATIC_CARD_RATIO_TOO_HIGH",
      "ANIMATED_OBJECT_MOTION_TOO_LOW",
      "NO_ANIMATED_USE_CASE_SCENE",
      "NO_ANIMATED_BEFORE_AFTER_SCENE"
    ]));
  });

  test("keeps MeloTTS but requires shorts-paced Korean speech speed and anchors", () => {
    const passing = evaluateV020AudioIntelligibility({
      transcript: V020_VOICEOVER_SCRIPT,
      speechRateWpm: 160,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    expect(passing).toMatchObject({
      real_asr_probe_executed: true,
      raw_similarity_score: 1,
      transcript_similarity_score: 1,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: V020_REQUIRED_CORE_ANCHORS,
      speech_rate_wpm: 160,
      audio_blocker: null
    });

    const tooSlow = evaluateV020AudioIntelligibility({
      transcript: V020_VOICEOVER_SCRIPT,
      speechRateWpm: 145,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    expect(tooSlow.audio_blocker).toBe("VOICE_SPEED_TOO_SLOW_FOR_SHORTS");
  });

  test("normalizes common ASR confusion where drying rack is heard as drying action", () => {
    const confusedTranscript = V020_VOICEOVER_SCRIPT.replace("건조대는", "건조되는");

    const probe = evaluateV020AudioIntelligibility({
      transcript: confusedTranscript,
      speechRateWpm: 160,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    expect(probe.core_anchor_recognition_pass).toBe(true);
    expect(probe.recognized_core_anchors).toEqual(V020_REQUIRED_CORE_ANCHORS);
    expect(probe.audio_blocker).toBe(null);
  });

  test("summarizes a passing local packet while keeping private upload blocked", () => {
    const motionGate = buildV020RealMotionGate(buildV020ScenePlan());
    const audioProbe = evaluateV020AudioIntelligibility({
      transcript: V020_VOICEOVER_SCRIPT,
      speechRateWpm: 160,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    const summary = buildV020RealMotionReviewSummary({
      localReviewVideoCreated: true,
      voiceoverGenerated: true,
      melottsVoiceUsed: true,
      videoHasAudioStream: true,
      motionGate,
      audioProbe
    });

    expect(summary).toMatchObject({
      version: "v020",
      provider: "real_motion_local_renderer",
      real_motion_gate_pass: true,
      real_motion_probe_pass: true,
      melotts_voice_used: true,
      speech_rate_wpm: 160,
      core_anchor_recognition_pass: true,
      real_storyboard_gate_pass: true,
      human_visual_gate_pass: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });

  test("writes v019 failure and v020 pending-review artifacts without exposing command paths", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v020-real-motion-"));
    const outsideCommand = path.join(os.tmpdir(), "private-melotts-wrapper.cmd");
    await writeFile(outsideCommand, "echo fake", "utf8");

    const result = await generateV020ReviewPacket({
      cwd,
      env: {
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: outsideCommand,
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      },
      ttsRunner: async ({ audioPath, speedMultiplier }) => {
        expect(speedMultiplier).toBeGreaterThan(1);
        await writeFile(audioPath, "fake-wave", "utf8");
        return { ok: true };
      },
      asrRunner: async () => ({
        transcript: V020_VOICEOVER_SCRIPT,
        speechRateWpm: 160,
        maxSilenceBetweenSegmentsMs: 120,
        hardCutCount: 0,
        voiceoverNaturalnessScore: 90
      }),
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-media", "utf8");
      },
      videoProbe: async () => ({
        duration_seconds: 24,
        video_has_audio_stream: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v020",
      v019_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      review_console_generated: true,
      real_motion_gate_pass: true,
      real_motion_probe_pass: true,
      voiceover_generated: true,
      real_asr_probe_executed: true,
      core_anchor_recognition_pass: true,
      local_review_packet_ready: true,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).resolves.toBeTruthy();
    const v019Decision = JSON.parse(await readFile(result.v019_human_review_decision_path, "utf8"));
    const v020Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const summaryText = await readFile(result.review_summary_path, "utf8");

    expect(v019Decision.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(v020Decision).toMatchObject({
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(summaryText).not.toContain(outsideCommand);
  });
});
