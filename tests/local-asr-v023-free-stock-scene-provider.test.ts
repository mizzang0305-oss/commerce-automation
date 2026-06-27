import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
  V023_REQUIRED_FREE_STOCK_SCENE_ASSETS,
  buildV023FreeStockSceneQueries,
  fetchV023FreeStockSceneAssets
} from "../scripts/uploads/fetch-v023-free-stock-scene-assets";
import {
  generateV023FreeStockSceneReviewPacket
} from "../scripts/uploads/generate-v023-free-stock-scene-review-packet";
import {
  createDefaultAutopilotState
} from "../scripts/autopilot/autopilot-safety-gates";
import {
  decideNextAutopilotAction
} from "../scripts/autopilot/decide-next-action";

async function makeCwd(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function freeStockEnv(provider: "pexels" | "pixabay" = "pexels") {
  return {
    FREE_STOCK_PROVIDER_ENABLED: "true",
    FREE_STOCK_PROVIDER: provider,
    PEXELS_API_KEY: provider === "pexels" ? "test-pexels-key" : "",
    PIXABAY_API_KEY: provider === "pixabay" ? "test-pixabay-key" : "",
    FREE_STOCK_MAX_DOWNLOADS_PER_RUN: "8",
    FREE_STOCK_ALLOW_VIDEOS: "true",
    FREE_STOCK_ALLOW_PHOTOS: "true",
    FREE_STOCK_REQUIRE_COMMERCIAL_USE: "true",
    FREE_STOCK_REJECT_PEOPLE: "true",
    FREE_STOCK_REJECT_BRANDS: "true",
    FREE_STOCK_REJECT_WATERMARK: "true"
  };
}

function mockCandidate(assetKey: string, index: number, overrides: Record<string, unknown> = {}) {
  const mediaType = index < 3 ? "video" : "photo";
  return {
    asset_key: assetKey,
    provider: "pexels",
    provider_asset_id: `provider-asset-${assetKey}`,
    media_type: mediaType,
    source_page_url: `https://example.invalid/page/${assetKey}`,
    download_url: `https://example.invalid/download/${assetKey}.${mediaType === "video" ? "mp4" : "jpg"}`,
    width: 1080,
    height: 1920,
    duration_seconds: mediaType === "video" ? 6 : null,
    license_summary: "pexels_license",
    commercial_use_allowed: true,
    attribution_required: false,
    modified_for_video: true,
    watermark_free: true,
    brand_or_logo_detected: false,
    recognizable_people_risk: false,
    raw_url_logged: false,
    ...overrides
  };
}

describe("v023 free stock scene provider", () => {
  test("builds eight search plans without user prompts or manual scene requests", () => {
    const queries = buildV023FreeStockSceneQueries();

    expect(queries).toHaveLength(8);
    expect(queries.map((query) => query.asset_key)).toEqual(V023_REQUIRED_FREE_STOCK_SCENE_ASSETS);
    expect(queries.every((query) => query.user_prompt_required === false)).toBe(true);
    expect(queries.every((query) => query.user_scene_asset_input_required === false)).toBe(true);
    expect(queries.find((query) => query.asset_key === "rain-window")?.english_queries)
      .toContain("rain window interior");
    expect(queries.find((query) => query.asset_key === "drying-rack-reveal")?.korean_queries.join(" "))
      .toContain("빨래건조대");
  });

  test("stops before API calls when free stock provider is not configured", async () => {
    const cwd = await makeCwd("commerce-v023-no-provider-");
    let searchCount = 0;

    const result = await fetchV023FreeStockSceneAssets({
      cwd,
      env: {},
      stockClient: {
        search: async () => {
          searchCount += 1;
          return [];
        }
      }
    });

    expect(result).toMatchObject({
      free_stock_provider_added: true,
      provider_configured: false,
      provider_used: null,
      api_key_present: false,
      required_asset_count: 8,
      downloaded_asset_count: 0,
      raw_urls_masked: true,
      provider_blocker: V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
      license_gate_pass: false
    });
    expect(searchCount).toBe(0);
    expect(result.missing_assets).toEqual(V023_REQUIRED_FREE_STOCK_SCENE_ASSETS);
  });

  test("blocks configured provider without its API key", async () => {
    const cwd = await makeCwd("commerce-v023-missing-key-");

    const result = await fetchV023FreeStockSceneAssets({
      cwd,
      env: {
        FREE_STOCK_PROVIDER_ENABLED: "true",
        FREE_STOCK_PROVIDER: "pexels"
      }
    });

    expect(result).toMatchObject({
      provider_configured: false,
      provider_used: "pexels",
      api_key_present: false,
      provider_blocker: "FREE_STOCK_API_KEY_NOT_CONFIGURED"
    });
  });

  test("downloads mock Pexels assets with masked provenance and enough video clips", async () => {
    const cwd = await makeCwd("commerce-v023-pexels-ready-");

    const result = await fetchV023FreeStockSceneAssets({
      cwd,
      env: freeStockEnv("pexels"),
      stockClient: {
        search: async ({ assetKey }) => [mockCandidate(assetKey, V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.indexOf(assetKey))]
      },
      assetDownloader: async ({ candidate, outputPath }) => {
        await writeFile(outputPath, `downloaded-${candidate.asset_key}`, "utf8");
      }
    });

    expect(result).toMatchObject({
      provider_configured: true,
      provider_used: "pexels",
      api_key_present: true,
      downloaded_asset_count: 8,
      photographic_or_video_scene_count: 8,
      video_clip_scene_count: 3,
      provenance_generated: true,
      commercial_use_allowed: true,
      watermark_free: true,
      brand_or_logo_risk: false,
      recognizable_people_risk: false,
      license_gate_pass: true,
      real_scene_asset_gate_pass: true,
      private_upload_allowed: false
    });
    expect(result.provenance.every((entry) =>
      entry.provider === "pexels" &&
      entry.raw_url_logged === false &&
      !entry.provider_asset_id.includes("provider-asset-")
    )).toBe(true);
    expect(JSON.stringify(result)).not.toContain("example.invalid");
    await expect(stat(result.downloaded_assets[0]?.absolute_path ?? "")).resolves.toBeTruthy();
  });

  test("supports mock Pixabay assets with the same no-raw-url contract", async () => {
    const cwd = await makeCwd("commerce-v023-pixabay-ready-");

    const result = await fetchV023FreeStockSceneAssets({
      cwd,
      env: freeStockEnv("pixabay"),
      stockClient: {
        search: async ({ assetKey }) => [
          {
            ...mockCandidate(assetKey, V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.indexOf(assetKey)),
            provider: "pixabay",
            license_summary: "pixabay_content_license"
          }
        ]
      },
      assetDownloader: async ({ candidate, outputPath }) => {
        await writeFile(outputPath, `downloaded-${candidate.asset_key}`, "utf8");
      }
    });

    expect(result).toMatchObject({
      provider_configured: true,
      provider_used: "pixabay",
      downloaded_asset_count: 8,
      license_gate_pass: true,
      real_scene_asset_gate_pass: true,
      raw_urls_masked: true
    });
    expect(result.provenance.every((entry) => entry.provider === "pixabay")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("example.invalid");
  });

  test("blocks stock assets with commercial, watermark, brand, people, or raw-url risk", async () => {
    const cwd = await makeCwd("commerce-v023-license-blocked-");

    const result = await fetchV023FreeStockSceneAssets({
      cwd,
      env: freeStockEnv("pexels"),
      stockClient: {
        search: async ({ assetKey }) => [
          mockCandidate(assetKey, V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.indexOf(assetKey), {
            commercial_use_allowed: false,
            watermark_free: false,
            brand_or_logo_detected: true,
            recognizable_people_risk: true,
            raw_url_logged: true
          })
        ]
      },
      assetDownloader: async ({ outputPath }) => {
        await writeFile(outputPath, "should-not-download", "utf8");
      }
    });

    expect(result).toMatchObject({
      provider_configured: true,
      downloaded_asset_count: 0,
      license_gate_pass: false,
      provider_blocker: "FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED"
    });
    expect(result.license_gate_blockers).toEqual(expect.arrayContaining([
      "FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED",
      "FREE_STOCK_WATERMARK_DETECTED",
      "FREE_STOCK_BRAND_RISK_DETECTED",
      "FREE_STOCK_RECOGNIZABLE_PEOPLE_RISK",
      "FREE_STOCK_RAW_URL_LOGGED"
    ]));
  });

  test("blocks v023 review packet without a configured stock provider and does not create media", async () => {
    const cwd = await makeCwd("commerce-v023-review-blocked-");

    const result = await generateV023FreeStockSceneReviewPacket({ cwd, env: {} });

    expect(result).toMatchObject({
      target_version: "v023",
      review_console_generated: false,
      local_review_packet_ready: false,
      human_review_status: V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
      private_upload_allowed: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    await expect(stat(result.review_console_path)).rejects.toThrow();
    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8")) as Record<string, unknown>;
    expect(decision).toMatchObject({
      version: "v023",
      human_review_status: V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
      private_upload_allowed: false
    });
  });

  test("creates a pending v023 review packet from mock stock assets without upload readiness", async () => {
    const cwd = await makeCwd("commerce-v023-review-ready-");

    const result = await generateV023FreeStockSceneReviewPacket({
      cwd,
      env: {
        ...freeStockEnv("pexels"),
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: path.join(os.tmpdir(), "private-melotts-wrapper.cmd"),
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      },
      stockClient: {
        search: async ({ assetKey }) => [mockCandidate(assetKey, V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.indexOf(assetKey))]
      },
      assetDownloader: async ({ candidate, outputPath }) => {
        await writeFile(outputPath, `downloaded-${candidate.asset_key}`, "utf8");
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
        transcript: "빨래 건조대 공간",
        speechRateWpm: 160,
        rawSimilarityScore: 0.9,
        transcriptSimilarityScore: 0.9,
        coreAnchorRecognitionPass: true
      })
    });

    expect(result).toMatchObject({
      target_version: "v023",
      review_console_generated: true,
      local_review_packet_ready: true,
      free_stock_provider_ready: true,
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
    await expect(stat(result.free_stock_asset_manifest_path)).resolves.toBeTruthy();
    await expect(stat(result.generated_asset_provenance_path)).resolves.toBeTruthy();
  });
});

describe("autopilot v023 free stock decision", () => {
  test("maps the v022 provider blocker to free-stock provider configuration", async () => {
    const cwd = await makeCwd("commerce-v023-autopilot-blocked-");

    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v022",
        latest_human_review_status: "UNKNOWN",
        next_recommended_action: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
        safety_stop_reason: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
      }),
      reviewDecision: {
        version: "v022",
        human_review_status: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
        private_upload_allowed: false
      },
      packageJson: {
        scripts: {
          "assets:fetch-v023-free-stock": "tsx scripts/uploads/fetch-v023-free-stock-scene-assets.ts"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "BLOCKED_PROVIDER",
      nextAction: "BLOCKED_FREE_STOCK_PROVIDER_NOT_CONFIGURED",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: ["FREE_STOCK_PROVIDER_NOT_CONFIGURED"]
    });
  });

  test("recommends the v023 stock fetch when provider config is ready", async () => {
    const cwd = await makeCwd("commerce-v023-autopilot-ready-");
    await writeFile(path.join(cwd, ".env.local"), [
      "FREE_STOCK_PROVIDER_ENABLED=true",
      "FREE_STOCK_PROVIDER=pexels",
      "PEXELS_API_KEY=test-key"
    ].join("\n"), "utf8");

    const decision = await decideNextAutopilotAction({
      cwd,
      gitStatusShort: "",
      state: createDefaultAutopilotState({
        current_review_version: "v022",
        latest_human_review_status: "UNKNOWN",
        next_recommended_action: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
        safety_stop_reason: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
      }),
      reviewDecision: {
        version: "v022",
        human_review_status: "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
        private_upload_allowed: false
      },
      packageJson: {
        scripts: {
          "assets:fetch-v023-free-stock": "tsx scripts/uploads/fetch-v023-free-stock-scene-assets.ts"
        }
      }
    });

    expect(decision).toMatchObject({
      phase: "GENERATE_REVIEW_PACKET",
      nextAction: "FETCH_FREE_STOCK_SCENE_ASSETS",
      shouldStop: false,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      reviewCommand: "assets:fetch-v023-free-stock",
      reviewCommandAvailable: true
    });
  });
});
