import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V020_PLACEHOLDER_FAIL_REASONS
} from "../scripts/uploads/generate-v021-review-packet.mjs";
import {
  V022_AUTO_PROVIDER_BLOCKER,
  V022_REQUIRED_REAL_SCENE_ASSETS,
  buildV022AutoSceneBriefs,
  generateV022AutoRealSceneAssets
} from "../scripts/uploads/generate-v022-auto-real-scene-assets";
import {
  generateV022AutoRealSceneReviewPacket
} from "../scripts/uploads/generate-v022-auto-real-scene-review-packet";
import {
  createDefaultAutopilotState
} from "../scripts/autopilot/autopilot-safety-gates";
import {
  decideNextAutopilotAction
} from "../scripts/autopilot/decide-next-action";

async function makeCwd(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function localProviderEnv() {
  return {
    AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_ENABLED: "true",
    AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_APPROVED: "true",
    AUTO_REAL_SCENE_LOCAL_IMAGE_COMMAND: path.join(os.tmpdir(), "fake-local-scene-provider.cmd"),
    AUTO_REAL_SCENE_LOCAL_IMAGE_MODEL_COMMERCIAL_USE_CONFIRMED: "true",
    AUTO_REAL_SCENE_LOCAL_IMAGE_WATERMARK_FREE: "true"
  };
}

describe("v022 auto real scene asset provider", () => {
  test("builds eight system scene briefs without user prompts or manual asset requests", () => {
    const briefs = buildV022AutoSceneBriefs();

    expect(briefs).toHaveLength(8);
    expect(briefs.map((brief) => brief.asset_key)).toEqual(V022_REQUIRED_REAL_SCENE_ASSETS);
    expect(briefs.every((brief) => brief.user_prompt_required === false)).toBe(true);
    expect(briefs.every((brief) => brief.manual_asset_required === false)).toBe(true);
    expect(briefs.every((brief) => brief.prompt_generated_by_system === true)).toBe(true);
    expect(briefs.find((brief) => brief.asset_key === "wet-laundry-problem")?.prompt)
      .toContain("wet laundry");
    expect(briefs.find((brief) => brief.asset_key === "before-after-room-laundry")?.role)
      .toBe("before_after");
  });

  test("blocks with provider-not-configured instead of asking the owner to shoot scenes", async () => {
    const cwd = await makeCwd("commerce-v022-no-provider-");

    const result = await generateV022AutoRealSceneAssets({ cwd, env: {} });

    expect(result).toMatchObject({
      auto_real_scene_asset_provider_ready: false,
      user_scene_asset_input_required: false,
      user_prompt_required: false,
      required_asset_count: 8,
      existing_asset_count: 0,
      generated_asset_count: 0,
      provider_blocker: V022_AUTO_PROVIDER_BLOCKER
    });
    expect(result.generated_asset_keys).toEqual([]);
    expect(result.missing_assets).toEqual(V022_REQUIRED_REAL_SCENE_ASSETS);
    expect(result.provider_checks).toMatchObject({
      existing_local_provider_checked: true,
      local_generated_scene_provider_checked: true,
      repo_image_skill_provider_checked: true,
      stock_provider_checked: true,
      product_image_limited_compositor_checked: true
    });
    expect(result.setup_guide_path).toContain("auto-real-scene-provider-setup-guide.md");
  });

  test("generates eight local scene assets with license-safe provenance when a local provider is configured", async () => {
    const cwd = await makeCwd("commerce-v022-local-generated-");

    const result = await generateV022AutoRealSceneAssets({
      cwd,
      env: localProviderEnv(),
      generatedSceneWriter: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-photo-like-scene", "utf8");
      }
    });

    expect(result).toMatchObject({
      auto_real_scene_asset_provider_ready: true,
      generated_asset_count: 8,
      generated_asset_provenance_pass: true,
      commercial_use_allowed: true,
      watermark_free: true,
      model_license_checked: true,
      provider_blocker: null
    });
    expect(result.generated_asset_keys).toEqual(V022_REQUIRED_REAL_SCENE_ASSETS);
    expect(result.provenance.every((entry) =>
      entry.source_type === "auto_generated_local" &&
      entry.prompt_generated_by_system === true &&
      entry.user_prompt_required === false &&
      entry.commercial_use_allowed === true &&
      entry.watermark_free === true &&
      entry.model_license_checked === true
    )).toBe(true);
    await expect(stat(result.generated_assets[0]?.absolute_path ?? "")).resolves.toBeTruthy();
  });

  test("blocks generated assets when local model commercial-use licensing is not confirmed", async () => {
    const cwd = await makeCwd("commerce-v022-license-blocked-");

    const result = await generateV022AutoRealSceneAssets({
      cwd,
      env: {
        AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_ENABLED: "true",
        AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_APPROVED: "true",
        AUTO_REAL_SCENE_LOCAL_IMAGE_WATERMARK_FREE: "true"
      },
      generatedSceneWriter: async ({ outputPath }) => {
        await writeFile(outputPath, "should-not-be-used", "utf8");
      }
    });

    expect(result).toMatchObject({
      auto_real_scene_asset_provider_ready: false,
      generated_asset_count: 0,
      generated_asset_provenance_pass: false,
      commercial_use_allowed: false,
      model_license_checked: false,
      provider_blocker: "LOCAL_IMAGE_MODEL_COMMERCIAL_USE_UNKNOWN"
    });
  });

  test("blocks v022 review packet when no automatic real scene provider is configured", async () => {
    const cwd = await makeCwd("commerce-v022-review-blocked-");

    const result = await generateV022AutoRealSceneReviewPacket({ cwd, env: {} });

    expect(result).toMatchObject({
      target_version: "v022",
      auto_real_scene_asset_provider_ready: false,
      review_console_generated: false,
      local_review_packet_ready: false,
      human_review_status: V022_AUTO_PROVIDER_BLOCKER,
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    await expect(stat(result.review_console_path)).rejects.toThrow();

    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8")) as Record<string, unknown>;
    const setupGuide = await readFile(result.setup_guide_path, "utf8");
    expect(decision).toMatchObject({
      human_review_status: V022_AUTO_PROVIDER_BLOCKER,
      private_upload_allowed: false
    });
    expect(setupGuide).toContain("Configure a free/local image scene provider");
    expect(setupGuide).not.toContain("shoot eight scenes");
  });

  test("creates a pending human review packet from mocked local generated assets without enabling upload", async () => {
    const cwd = await makeCwd("commerce-v022-review-ready-");

    const result = await generateV022AutoRealSceneReviewPacket({
      cwd,
      env: localProviderEnv(),
      generatedSceneWriter: async ({ outputPath }) => {
        await writeFile(outputPath, "fake-photo-like-scene", "utf8");
      },
      ttsRunner: async ({ audioPath }) => {
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
        transcript: "\ube68\ub798 \uac74\uc870\ub300 \uacf5\uac04",
        speechRateWpm: 160,
        rawSimilarityScore: 0.9,
        transcriptSimilarityScore: 0.9,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v022",
      auto_real_scene_asset_provider_ready: true,
      review_console_generated: true,
      local_review_packet_ready: true,
      real_scene_asset_gate_pass: true,
      photographic_or_video_scene_count: 8,
      primitive_shape_only_scene_count: 0,
      text_only_scene_count: 0,
      product_photo_only_scene_count: 0,
      generated_asset_provenance_pass: true,
      melotts_voice_used: true,
      speech_rate_wpm: 160,
      core_anchor_recognition_pass: true,
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).resolves.toBeTruthy();
    await expect(stat(result.review_console_path)).resolves.toBeTruthy();
    await expect(stat(result.auto_real_scene_asset_manifest_path)).resolves.toBeTruthy();
    await expect(stat(result.generated_asset_provenance_path)).resolves.toBeTruthy();
  });
});

describe("autopilot v022 auto real scene asset decision", () => {
  test("maps v020 real-scene failures to automatic provider blocker when no provider is configured", async () => {
    const cwd = await makeCwd("commerce-v022-autopilot-blocked-");

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
      phase: "BLOCKED_PROVIDER",
      nextAction: V022_AUTO_PROVIDER_BLOCKER,
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      safetyStopReason: V022_AUTO_PROVIDER_BLOCKER
    });
  });

  test("recommends automatic scene asset generation when a safe local provider is configured", async () => {
    const cwd = await makeCwd("commerce-v022-autopilot-ready-");
    await writeFile(path.join(cwd, ".env.local"), [
      "AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_ENABLED=true",
      "AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_APPROVED=true",
      `AUTO_REAL_SCENE_LOCAL_IMAGE_COMMAND=${path.join(os.tmpdir(), "fake-local-scene-provider.cmd")}`,
      "AUTO_REAL_SCENE_LOCAL_IMAGE_MODEL_COMMERCIAL_USE_CONFIRMED=true",
      "AUTO_REAL_SCENE_LOCAL_IMAGE_WATERMARK_FREE=true"
    ].join("\n"), "utf8");

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
