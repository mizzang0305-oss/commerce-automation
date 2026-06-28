import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V031_NEAR_PASS_FAIL_REASONS,
  buildV031NearPassDecision,
  buildV032SceneMotionPlan,
  buildV032VoiceoverScript,
  evaluateV032HookStrength,
  evaluateV032MicroMotion,
  generateV032HookMicroStabilizedReviewPacket,
  loadLocalEnvFile
} from "../scripts/uploads/generate-v032-hook-micro-stabilized-review-packet.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeLockedSceneInputs(cwd) {
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v029");
  const sceneRoot = path.join(v029Root, "scene-assets");
  await mkdir(sceneRoot, { recursive: true });
  for (const scene of buildV032SceneMotionPlan()) {
    await writeFile(path.join(sceneRoot, `${scene.scene_key}.png`), `scene-${scene.scene_key}`, "utf8");
  }
}

describe("v032 hook and micro-stabilized review packet", () => {
  test("records v031 as near-pass with hook and micro-motion fixes required", () => {
    const decision = buildV031NearPassDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v031",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      next_action: "BUILD_V032_HOOK_AND_MICRO_STABILIZED_REVIEW"
    });
    expect(decision.pass_aspects).toEqual(expect.arrayContaining([
      "REAL_IMAGE_SKILL_SCENES_ACCEPTABLE",
      "AUDIO_ACCEPTABLE",
      "MOTION_MUCH_IMPROVED"
    ]));
    expect(decision.fail_reasons).toEqual(V031_NEAR_PASS_FAIL_REASONS);
  });

  test("strengthens the first three seconds with direct loss and why-watch copy", () => {
    const plan = buildV032SceneMotionPlan();
    const hook = evaluateV032HookStrength(plan);

    expect(hook).toMatchObject({
      opening_hook_strength_pass: true,
      loss_aversion_visible_in_first_2s: true,
      why_watch_visible_in_first_3s: true,
      rainy_laundry_problem_visible: true,
      first_scene_not_product_only: true,
      first_scene_not_generic_clean_scene: true,
      hook_blocker: null
    });
    expect(hook.hook_copy_directness_score).toBeGreaterThanOrEqual(90);
    expect(hook.hook_copy).toContain("장마철 빨래");
    expect(hook.hook_copy).toContain("손해");
    expect(hook.sub_hook_copy).toContain("건조대");
    expect(hook.sub_hook_copy).toContain("확인");
  });

  test("micro-stabilizes motion below v032 thresholds", () => {
    const motion = evaluateV032MicroMotion(buildV032SceneMotionPlan());

    expect(motion).toMatchObject({
      motion_smoothness_pass: true,
      crop_center_locked: true,
      focus_effect_used: false,
      fade_to_black_used: false,
      hard_camera_jump_count: 0,
      shake_effect_used: false,
      motion_comfort_pass: true,
      motion_blocker: null
    });
    expect(motion.lateral_jitter_score).toBeLessThanOrEqual(0.012);
    expect(motion.max_center_shift_per_second).toBeLessThanOrEqual(0.012);
    expect(motion.direction_flip_count_max).toBe(0);
    expect(motion.focus_blur_strength_max).toBeLessThanOrEqual(0.02);
    expect(motion.transition_start_end_hold_seconds).toBeGreaterThanOrEqual(0.35);
  });

  test("blocks weak hook and visible micro motion failures", () => {
    const badPlan = buildV032SceneMotionPlan().map((scene, index) =>
      index === 0
        ? {
            ...scene,
            hook_copy: "장마철 빨래 고민",
            loss_aversion_visible_in_first_2s: false,
            why_watch_visible_in_first_3s: false,
            rainy_laundry_problem_visible: false,
            first_scene_not_product_only: false,
            lateral_jitter_score: 0.03,
            max_center_shift_per_second: 0.03,
            crop_center_locked: false,
            focus_effect_used: true,
            fade_to_black_used: true,
            hard_camera_jump_count: 1
          }
        : scene
    );

    const hook = evaluateV032HookStrength(badPlan);
    const motion = evaluateV032MicroMotion(badPlan);

    expect(hook.opening_hook_strength_pass).toBe(false);
    expect(hook.blockers).toEqual(expect.arrayContaining([
      "OPENING_HOOK_COPY_WEAK",
      "LOSS_AVERSION_NOT_VISIBLE",
      "WHY_WATCH_NOT_CLEAR",
      "FIRST_SCENE_PRODUCT_ONLY"
    ]));
    expect(motion.motion_smoothness_pass).toBe(false);
    expect(motion.blockers).toEqual(expect.arrayContaining([
      "MICRO_MOTION_STILL_NOTICEABLE",
      "CROP_CENTER_NOT_LOCKED",
      "FOCUS_EFFECT_STILL_VISIBLE",
      "TRANSITION_STILL_JUMPS",
      "FADE_TO_BLACK_VISIBLE"
    ]));
  });

  test("creates v032 pending review packet without upload side effects", async () => {
    const cwd = await makeCwd("commerce-v032-ready-");
    await writeLockedSceneInputs(cwd);

    const result = await generateV032HookMicroStabilizedReviewPacket({
      cwd,
      voiceRunner: async ({ scriptPath, audioPath, probePath, transcriptPath }) => {
        const script = await readFile(scriptPath, "utf8");
        await writeFile(audioPath, "fake-v032-audio", "utf8");
        await writeFile(transcriptPath, script, "utf8");
        await writeFile(probePath, JSON.stringify({
          real_asr_probe_executed: true,
          raw_similarity_score: 0.95,
          transcript_similarity_score: 0.95,
          core_anchor_recognition_pass: true,
          context_anchor_recognition_pass: true,
          recognized_core_anchors: ["빨래", "건조대", "공간"],
          recognized_context_anchors: ["장마철", "습기", "확인"],
          speech_rate_wpm: 160,
          audio_blocker: null
        }, null, 2), "utf8");
      },
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-media", "utf8");
      },
      videoProbe: async () => ({
        duration_seconds: 23.8,
        video_has_audio_stream: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v032",
      v031_status: "FAIL_LOCAL_HUMAN_REVIEW",
      opening_hook_strength_pass: true,
      motion_smoothness_pass: true,
      image_assets_reused: true,
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
      product_assets_write: false
    });
    expect(buildV032VoiceoverScript()).toContain("그냥 두면 냄새가 남습니다");
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    expect(decision.human_review_status).toBe("PENDING_HUMAN_REVIEW");
  });

  test("loads local voice command readiness from .env.local without exposing raw values", async () => {
    const cwd = await makeCwd("commerce-v032-env-");
    await writeFile(path.join(cwd, ".env.local"), [
      "KOREAN_VOICE_PROVIDER=local_command",
      "KOREAN_VOICE_PROVIDER_APPROVED=true",
      "KOREAN_VOICE_COMMAND=C:\\\\outside\\\\melotts-wrapper.cmd",
      "KOREAN_VOICE_LANGUAGE=ko"
    ].join("\n"), "utf8");
    const env = {};

    const loaded = await loadLocalEnvFile(cwd, env);

    expect(loaded).toMatchObject({
      env_file_present: true,
      provider_present: true,
      approved_present: true,
      command_present: true,
      raw_values_masked: true
    });
    expect(env.KOREAN_VOICE_PROVIDER).toBe("local_command");
    expect(env.KOREAN_VOICE_COMMAND).toContain("melotts-wrapper.cmd");
    expect(JSON.stringify(loaded)).not.toContain("melotts-wrapper.cmd");
  });
});
