import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V029_MOTION_FAIL_REASONS,
  buildV029MotionFailureDecision,
  buildV030SceneMotionPlan,
  evaluateV030EffectDiversity,
  evaluateV030MotionSmoothness,
  generateV030SmoothMotionReviewPacket
} from "../scripts/uploads/generate-v030-smooth-motion-review-packet.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeV029Inputs(cwd) {
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v029");
  const sceneRoot = path.join(v029Root, "scene-assets");
  await mkdir(sceneRoot, { recursive: true });
  for (const scene of buildV030SceneMotionPlan()) {
    await writeFile(path.join(sceneRoot, `${scene.scene_key}.png`), `scene-${scene.scene_key}`, "utf8");
  }
  await writeFile(path.join(v029Root, "voiceover.wav"), "fake-v029-audio", "utf8");
  await writeFile(path.join(v029Root, "asr-transcript.txt"), "장마철 빨래 건조대 공간 확인", "utf8");
  await writeFile(path.join(v029Root, "audio-intelligibility-probe.json"), JSON.stringify({
    real_asr_probe_executed: true,
    raw_similarity_score: 0.94,
    transcript_similarity_score: 0.94,
    core_anchor_recognition_pass: true,
    recognized_core_anchors: ["빨래", "건조대", "공간"],
    audio_blocker: null
  }, null, 2), "utf8");
}

describe("v030 smooth motion review packet", () => {
  test("records v029 as content-pass but motion-fail", () => {
    const decision = buildV029MotionFailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v029",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true,
      next_action: "BUILD_V030_SMOOTH_MOTION_REVIEW"
    });
    expect(decision.pass_aspects).toContain("REAL_IMAGE_SKILL_SCENES_READY");
    expect(decision.fail_reasons).toEqual(V029_MOTION_FAIL_REASONS);
  });

  test("uses diverse smooth scene motion presets without focus-coupled lateral shake", () => {
    const plan = buildV030SceneMotionPlan();

    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((scene) => scene.motion_preset)).size).toBeGreaterThanOrEqual(5);
    expect(plan.every((scene) => scene.focus_center_shift_coupled === false)).toBe(true);
    expect(plan.every((scene) => scene.shake_effect_used === false)).toBe(true);
    expect(plan.find((scene) => scene.scene_key === "before-after-room-laundry")?.motion_preset)
      .toBe("stable_split_hold");
  });

  test("passes smoothness and diversity gates for the v030 preset plan", () => {
    const plan = buildV030SceneMotionPlan();
    const smoothness = evaluateV030MotionSmoothness(plan);
    const diversity = evaluateV030EffectDiversity(plan);

    expect(smoothness).toMatchObject({
      motion_smoothness_pass: true,
      focus_center_shift_coupled: false,
      hard_camera_jump_count: 0,
      shake_effect_used: false,
      motion_smoothness_blocker: null
    });
    expect(smoothness.lateral_jitter_score).toBeLessThanOrEqual(0.15);
    expect(smoothness.max_center_shift_per_second).toBeLessThanOrEqual(0.035);
    expect(diversity).toMatchObject({
      effect_diversity_pass: true,
      same_motion_preset_repeated_more_than_2: false,
      all_effects_smooth: true,
      effect_diversity_blocker: null
    });
  });

  test("blocks focus-coupled center movement and shake effects", () => {
    const badPlan = buildV030SceneMotionPlan().map((scene, index) =>
      index === 0
        ? {
            ...scene,
            lateral_jitter_score: 0.3,
            focus_center_shift_coupled: true,
            shake_effect_used: true
          }
        : scene
    );

    const result = evaluateV030MotionSmoothness(badPlan);

    expect(result.motion_smoothness_pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "MOTION_JITTER_TOO_STRONG",
      "FOCUS_EFFECT_CAUSES_LATERAL_SHAKE",
      "SHAKE_EFFECT_USED"
    ]));
  });

  test("creates v030 pending review packet with mocked media and reused v029 assets", async () => {
    const cwd = await makeCwd("commerce-v030-ready-");
    await writeV029Inputs(cwd);

    const result = await generateV030SmoothMotionReviewPacket({
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
      target_version: "v030",
      v029_content_direction: "PASS_CANDIDATE",
      v029_motion_status: "FAIL_LOCAL_HUMAN_REVIEW",
      v029_scene_assets_reused: true,
      image_assets_regenerated: false,
      motion_smoothness_pass: true,
      effect_diversity_pass: true,
      local_review_packet_ready: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    const summary = JSON.parse(await readFile(result.review_summary_path, "utf8"));
    expect(summary).toMatchObject({
      version: "v030",
      youtube_execute_called: false,
      r2_upload_write: false,
      product_assets_write: false
    });
  });
});
