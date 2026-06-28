import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V030_OWNER_MOTION_FAIL_REASONS,
  buildV030OwnerMotionFailureDecision,
  buildV031SceneMotionPlan,
  evaluateV031EffectDiversity,
  evaluateV031StableMotion,
  generateV031StableCommerceMotionReviewPacket
} from "../scripts/uploads/generate-v031-stable-commerce-motion-review-packet.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeLockedV029Inputs(cwd) {
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v029");
  const sceneRoot = path.join(v029Root, "scene-assets");
  await mkdir(sceneRoot, { recursive: true });
  for (const scene of buildV031SceneMotionPlan()) {
    await writeFile(path.join(sceneRoot, `${scene.scene_key}.png`), `scene-${scene.scene_key}`, "utf8");
  }
  await writeFile(path.join(v029Root, "voiceover.wav"), "fake-v029-audio", "utf8");
  await writeFile(path.join(v029Root, "asr-transcript.txt"), "빨래 건조대 공간 확인", "utf8");
  await writeFile(path.join(v029Root, "audio-intelligibility-probe.json"), JSON.stringify({
    real_asr_probe_executed: true,
    raw_similarity_score: 0.94,
    transcript_similarity_score: 0.94,
    core_anchor_recognition_pass: true,
    recognized_core_anchors: ["빨래", "건조대", "공간"],
    audio_blocker: null
  }, null, 2), "utf8");
}

describe("v031 stable commerce motion review packet", () => {
  test("records v030 as content/audio-pass but owner motion-fail", () => {
    const decision = buildV030OwnerMotionFailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v030",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      next_action: "BUILD_V031_STABLE_COMMERCE_MOTION_REVIEW"
    });
    expect(decision.pass_aspects).toEqual(expect.arrayContaining([
      "CONTENT_ACCEPTABLE",
      "IMAGE_ASSETS_ACCEPTABLE",
      "MELOTTS_AUDIO_ACCEPTABLE"
    ]));
    expect(decision.fail_reasons).toEqual(V030_OWNER_MOTION_FAIL_REASONS);
  });

  test("locks crop centers and disables mechanical motion effects", () => {
    const plan = buildV031SceneMotionPlan();

    expect(plan).toHaveLength(8);
    expect(plan.every((scene) => scene.crop_center_locked === true)).toBe(true);
    expect(plan.every((scene) => scene.pre_transition_center_lock_seconds >= 0.3)).toBe(true);
    expect(plan.every((scene) => scene.post_transition_center_lock_seconds >= 0.3)).toBe(true);
    expect(plan.every((scene) => scene.focus_blur_enabled === false)).toBe(true);
    expect(plan.every((scene) => scene.fade_to_black_used === false)).toBe(true);
    expect(plan.every((scene) => scene.dark_fade_transition_used === false)).toBe(true);
    expect(plan.every((scene) => scene.shake_effect_used === false)).toBe(true);
    expect(plan.every((scene) => scene.random_pan_used === false)).toBe(true);
    expect(plan.every((scene) => scene.direction_flip_count === 0)).toBe(true);
    expect(Math.max(...plan.map((scene) => scene.scale_end))).toBeLessThanOrEqual(1.025);
    expect(Math.max(...plan.map((scene) => scene.lateral_movement))).toBeLessThanOrEqual(0.005);
    expect(new Set(plan.map((scene) => scene.transition)).size).toBeLessThanOrEqual(2);
    expect(new Set(plan.map((scene) => scene.transition))).toEqual(new Set(["soft_cross_dissolve", "direct_soft_cut"]));
    expect(plan.find((scene) => scene.scene === 7)).toMatchObject({
      before_after_completely_stable: true,
      scale_start: 1,
      scale_end: 1,
      lateral_movement: 0
    });
    expect(plan.find((scene) => scene.scene === 8)?.final_steady_hold_seconds).toBeGreaterThanOrEqual(0.7);
  });

  test("passes stable motion and allowed diversity gates", () => {
    const plan = buildV031SceneMotionPlan();
    const stableMotion = evaluateV031StableMotion(plan);
    const diversity = evaluateV031EffectDiversity(plan);

    expect(stableMotion).toMatchObject({
      stable_commerce_motion_pass: true,
      transition_dark_fade_visible: false,
      crop_recenter_jump_at_scene_boundary: false,
      focus_blur_enabled: false,
      random_pan_used: false,
      shake_effect_used: false,
      owner_motion_review_blocker: null
    });
    expect(stableMotion.max_zoom_scale).toBeLessThanOrEqual(1.025);
    expect(stableMotion.max_lateral_movement).toBeLessThanOrEqual(0.005);
    expect(diversity).toMatchObject({
      effect_diversity_pass: true,
      left_right_movement_used_for_diversity: false,
      focus_pumping_used_for_diversity: false,
      effect_diversity_blocker: null
    });
    expect(diversity.diversity_sources).toEqual([
      "text_reveal_timing",
      "hold_duration",
      "soft_cross_dissolve_duration",
      "slight_zoom_speed_difference"
    ]);
  });

  test("blocks v030 failure modes before review packet readiness", () => {
    const badPlan = buildV031SceneMotionPlan().map((scene, index) =>
      index === 0
        ? {
            ...scene,
            focus_blur_enabled: true,
            fade_to_black_used: true,
            dark_fade_transition_used: true,
            crop_center_locked: false,
            lateral_movement: 0.02,
            scale_end: 1.05,
            random_pan_used: true,
            direction_flip_count: 1
          }
        : scene
    );

    const result = evaluateV031StableMotion(badPlan);

    expect(result.stable_commerce_motion_pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "TRANSITION_DARK_FADE_VISIBLE",
      "CROP_RECENTER_JUMP_AT_SCENE_BOUNDARY",
      "FOCUS_EFFECT_STILL_FEELS_MECHANICAL",
      "AUTO_MOTION_FEELS_UNNATURAL"
    ]));
  });

  test("creates v031 pending review packet with reused images, script, and MeloTTS audio", async () => {
    const cwd = await makeCwd("commerce-v031-ready-");
    await writeLockedV029Inputs(cwd);

    const result = await generateV031StableCommerceMotionReviewPacket({
      cwd,
      mediaRunner: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-media", "utf8");
      },
      videoProbe: async () => ({
        duration_seconds: 23.8,
        video_has_audio_stream: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v031",
      v030_motion_status: "FAIL_LOCAL_HUMAN_REVIEW",
      source_content_version: "v029",
      image_assets_regenerated: false,
      script_changed: false,
      MeloTTS_audio_changed: false,
      stable_commerce_motion_pass: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    const summary = JSON.parse(await readFile(result.review_summary_path, "utf8"));
    expect(summary).toMatchObject({
      version: "v031",
      youtube_execute_called: false,
      videos_insert_called: false,
      r2_upload_write: false,
      product_assets_write: false
    });
  });
});
