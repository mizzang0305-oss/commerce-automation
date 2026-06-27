import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V020_PLACEHOLDER_FAIL_REASONS,
  V021_REQUIRED_ASSETS,
  V021_REQUIRED_CORE_ANCHORS,
  V021_VOICEOVER_SCRIPT,
  buildV020FailureDecision,
  buildV021RealSceneAssetGate,
  buildV021ScenePlan,
  evaluateV021AudioIntelligibility,
  generateV021ReviewPacket,
  inspectLocalSceneAssetLibraryProvider
} from "../scripts/uploads/generate-v021-review-packet.mjs";
import {
  createDefaultAutopilotState
} from "../scripts/autopilot/autopilot-safety-gates";
import {
  decideNextAutopilotAction,
  resolveV020FailureNextAction
} from "../scripts/autopilot/decide-next-action";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

async function makeCwd(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSceneAsset(cwd, folder, basename, extension = ".jpg") {
  const dir = path.join(cwd, "commerce-assets", "source-library", folder);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${basename}${extension}`);
  await writeFile(filePath, "fake-scene-asset", "utf8");
  return filePath;
}

async function writeAllRequiredAssets(cwd) {
  await writeSceneAsset(cwd, "rainy-season", "rain-window", ".jpg");
  await writeSceneAsset(cwd, "laundry", "wet-laundry-problem", ".jpg");
  await writeSceneAsset(cwd, "small-room", "small-room-laundry-mess", ".jpg");
  await writeSceneAsset(cwd, "drying-rack", "drying-rack-reveal", ".jpg");
  await writeSceneAsset(cwd, "laundry", "laundry-items-use-case", ".jpg");
  await writeSceneAsset(cwd, "small-room", "before-after-room-laundry", ".jpg");
  await writeSceneAsset(cwd, "drying-rack", "buying-checklist-background", ".jpg");
  await writeSceneAsset(cwd, "drying-rack", "cta-background", ".jpg");
}

describe("v021 real scene asset pipeline", () => {
  test("records v020 as a failed local human review and blocks private upload", () => {
    const decision = buildV020FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: CANDIDATE_ID,
      version: "v020",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      next_required_version: "v021"
    });
    expect(decision.fail_reasons).toEqual(V020_PLACEHOLDER_FAIL_REASONS);
    expect(decision.fail_reasons).toEqual(expect.arrayContaining([
      "GEOMETRIC_PLACEHOLDER_VIDEO",
      "FAKE_REAL_MOTION_FROM_PRIMITIVE_SHAPES",
      "NO_REAL_SCENE_ASSETS",
      "MOTION_PROOF_FALSE_POSITIVE",
      "NO_REAL_LAUNDRY_USE_CASE_FOOTAGE"
    ]));
  });

  test("reports missing real scene assets and blocks v021 review video generation", async () => {
    const cwd = await makeCwd("commerce-v021-missing-assets-");

    const provider = await inspectLocalSceneAssetLibraryProvider({ cwd });
    const result = await generateV021ReviewPacket({ cwd });

    expect(provider).toMatchObject({
      asset_provider: "local_scene_asset_library",
      scene_assets_ready: false,
      available_asset_count: 0,
      blocker: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
    });
    expect(provider.required_assets).toEqual(V021_REQUIRED_ASSETS);
    expect(provider.missing_assets).toEqual(V021_REQUIRED_ASSETS);
    expect(result).toMatchObject({
      target_version: "v021",
      v020_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      review_console_generated: false,
      local_review_packet_ready: false,
      real_scene_asset_gate_pass: false,
      real_scene_asset_provider_blocker: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    await expect(stat(result.review_console_path)).rejects.toThrow();

    const v020Decision = JSON.parse(await readFile(result.v020_human_review_decision_path, "utf8"));
    const v021Decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    const manifest = JSON.parse(await readFile(result.real_scene_asset_manifest_path, "utf8"));
    const autopilotState = JSON.parse(await readFile(
      path.join(cwd, "commerce-assets", "autopilot", "state.json"),
      "utf8"
    ));

    expect(v020Decision.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(v021Decision).toMatchObject({
      human_review_status: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(manifest).toMatchObject({
      version: "v021",
      candidate_id: CANDIDATE_ID,
      scene_assets_ready: false,
      missing_assets: V021_REQUIRED_ASSETS,
      blocker: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
    });
    expect(autopilotState).toMatchObject({
      current_phase: "BLOCKED_PROVIDER",
      current_review_version: "v020",
      latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      latest_fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
      next_recommended_action: "CHECK_REAL_SCENE_ASSET_PROVIDER",
      private_upload_allowed: false,
      safety_stop_reason: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
    });
  });

  test("finds required photographic or video scene assets across the local library folders", async () => {
    const cwd = await makeCwd("commerce-v021-assets-ready-");
    await writeAllRequiredAssets(cwd);

    const provider = await inspectLocalSceneAssetLibraryProvider({ cwd });

    expect(provider).toMatchObject({
      scene_assets_ready: true,
      required_asset_count: 8,
      available_asset_count: 8,
      blocker: null
    });
    expect(provider.missing_assets).toEqual([]);
    expect(Object.values(provider.assets_by_id).every((asset) =>
      asset.kind === "photographic_or_video" &&
      asset.raw_url_present === false &&
      asset.placeholder_asset === false
    )).toBe(true);
  });

  test("blocks primitive shape, text, icon, and color-only motion even with eight scenes", () => {
    const weakScenes = Array.from({ length: 8 }, (_, index) => ({
      id: `primitive_${index + 1}`,
      scene: index + 1,
      required_asset_id: index < 4 ? "wet-laundry-problem" : "rain-window",
      uses_real_scene_asset: false,
      photographic_or_video_asset: false,
      primitive_shape_only: true,
      text_only: index % 2 === 0,
      icon_only: index % 3 === 0,
      color_only: index % 4 === 0,
      product_photo_only: index === 3,
      role: index === 0 ? "problem" : "decorative"
    }));

    const gate = buildV021RealSceneAssetGate(weakScenes);

    expect(gate.real_scene_asset_gate_pass).toBe(false);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      "PRIMITIVE_SHAPE_MOTION_ONLY",
      "TEXT_ONLY_MOTION",
      "ICON_ONLY_MOTION",
      "COLOR_ONLY_MOTION",
      "NO_TEXTURED_SCENE_SOURCE",
      "NO_PHOTOGRAPHIC_OR_VIDEO_ASSET",
      "NO_REAL_PROBLEM_SCENE_ASSET",
      "NO_REAL_BEFORE_AFTER_ASSET"
    ]));
  });

  test("passes the v021 gate only with enough real problem, use-case, and before-after scene assets", async () => {
    const cwd = await makeCwd("commerce-v021-gate-ready-");
    await writeAllRequiredAssets(cwd);
    const provider = await inspectLocalSceneAssetLibraryProvider({ cwd });
    const scenePlan = buildV021ScenePlan(provider);

    const gate = buildV021RealSceneAssetGate(scenePlan);

    expect(gate).toMatchObject({
      real_scene_asset_gate_pass: true,
      photographic_or_video_scene_count: 8,
      primitive_shape_only_scene_count: 0,
      text_only_scene_count: 0,
      product_photo_only_scene_count: 0,
      problem_scene_uses_real_asset: true,
      use_case_scene_uses_real_asset: true,
      before_after_scene_uses_real_asset: true,
      asset_gate_blocker: null
    });
  });

  test("keeps MeloTTS-style speech speed and Korean core anchors for v021", () => {
    const probe = evaluateV021AudioIntelligibility({
      transcript: V021_VOICEOVER_SCRIPT,
      speechRateWpm: 160,
      maxSilenceBetweenSegmentsMs: 110,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });
    const tooFast = evaluateV021AudioIntelligibility({
      transcript: V021_VOICEOVER_SCRIPT,
      speechRateWpm: 172,
      maxSilenceBetweenSegmentsMs: 110,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    expect(probe).toMatchObject({
      real_asr_probe_executed: true,
      raw_similarity_score: 1,
      transcript_similarity_score: 1,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: V021_REQUIRED_CORE_ANCHORS,
      speech_rate_wpm: 160,
      audio_blocker: null
    });
    expect(tooFast.audio_blocker).toBe("VOICE_SPEED_TOO_FAST_FOR_SHORTS");
  });

  test("generates v021 review artifacts only when real scene assets are ready", async () => {
    const cwd = await makeCwd("commerce-v021-review-ready-");
    await writeAllRequiredAssets(cwd);

    const result = await generateV021ReviewPacket({
      cwd,
      env: {
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: path.join(os.tmpdir(), "private-melotts-wrapper.cmd"),
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      },
      ttsRunner: async ({ audioPath }) => {
        await writeFile(audioPath, "fake-wave", "utf8");
        return { ok: true };
      },
      asrRunner: async () => ({
        transcript: V021_VOICEOVER_SCRIPT,
        speechRateWpm: 160,
        maxSilenceBetweenSegmentsMs: 110,
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
      target_version: "v021",
      review_console_generated: true,
      local_review_packet_ready: true,
      real_scene_asset_gate_pass: true,
      melotts_voice_used: true,
      speech_rate_wpm: 160,
      core_anchor_recognition_pass: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).resolves.toBeTruthy();
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    await expect(stat(result.real_scene_asset_gate_report_path)).resolves.toBeTruthy();
    await expect(stat(result.actual_frame_contact_sheet_path)).resolves.toBeTruthy();
    await expect(stat(result.shorts_ui_overlay_contact_sheet_path)).resolves.toBeTruthy();
  });
});

describe("autopilot v020 failure to v022 auto real scene asset provider", () => {
  test("maps v020 geometric placeholder failures to automatic real scene asset generation", () => {
    expect(resolveV020FailureNextAction(["GEOMETRIC_PLACEHOLDER_VIDEO"])).toBe("GENERATE_AUTO_REAL_SCENE_ASSETS");
    expect(resolveV020FailureNextAction(["FAKE_REAL_MOTION_FROM_PRIMITIVE_SHAPES"])).toBe("GENERATE_AUTO_REAL_SCENE_ASSETS");
    expect(resolveV020FailureNextAction(["NO_REAL_SCENE_ASSETS"])).toBe("GENERATE_AUTO_REAL_SCENE_ASSETS");
  });

  test("blocks autopilot before v022 generation when an automatic real scene provider is not configured", async () => {
    const cwd = await makeCwd("commerce-v021-autopilot-blocked-");

    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v020",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: V020_PLACEHOLDER_FAIL_REASONS
      }),
      reviewDecision: {
        version: "v020",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
        private_upload_allowed: false
      },
      packageJson: {
        scripts: {
          "review:v021": "node scripts/uploads/generate-v021-review-packet.mjs"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "BLOCKED_PROVIDER",
      nextAction: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      safetyStopReason: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
    });
  });

  test("allows automatic v022 scene asset generation when the local real scene library is complete", async () => {
    const cwd = await makeCwd("commerce-v021-autopilot-ready-");
    await writeAllRequiredAssets(cwd);

    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v020",
        latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        latest_fail_reasons: V020_PLACEHOLDER_FAIL_REASONS
      }),
      reviewDecision: {
        version: "v020",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
        private_upload_allowed: false
      },
      packageJson: {
        scripts: {
          "assets:generate-v022-real-scene": "tsx scripts/uploads/generate-v022-auto-real-scene-assets.ts",
          "review:v022": "tsx scripts/uploads/generate-v022-auto-real-scene-review-packet.ts"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "GENERATE_REVIEW_PACKET",
      nextAction: "GENERATE_AUTO_REAL_SCENE_ASSETS",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "assets:generate-v022-real-scene",
      reviewCommandAvailable: true
    });
  });
});
