import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  V035_PREVIOUS_FAILURE_BASELINE,
  V035_SCENE_ASSETS,
  buildV035MetadataPreview,
  buildV035ScenePromptPackage,
  buildV035VoiceoverScript,
  generateV035ImageSkillSceneShortsReviewPacket,
  validateV035ImageSkillSceneAssets
} from "../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const AFFILIATE_URL = "https://link.coupang.com/a/v035-real-affiliate";

async function makeCwd(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFixtureSceneAssets(cwd: string, width = 941, height = 1672) {
  const sceneDir = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v035", "image-skill-scenes");
  await mkdir(sceneDir, { recursive: true });
  for (const scene of V035_SCENE_ASSETS) {
    await writeFile(path.join(sceneDir, scene.filename), makePngProbeBuffer(width, height));
  }
}

function makePngProbeBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(60000, 1);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("v035 image-skill scene shorts review packet", () => {
  test("defines eight image-skill scene requests with required filenames", () => {
    const promptPackage = buildV035ScenePromptPackage();

    expect(promptPackage.provider).toBe("codex_builtin_image_gen");
    expect(promptPackage.scenes.map((scene) => scene.filename)).toEqual([
      "01-rain-window-problem.png",
      "02-wet-laundry-slow-dry.png",
      "03-small-room-space-problem.png",
      "04-product-solution-reveal.png",
      "05-laundry-use-case-human-hands.png",
      "06-organized-indoor-drying-result.png",
      "07-before-after-room-laundry.png",
      "08-folded-storage-cta.png"
    ]);
    expect(promptPackage.common_constraints).toEqual(expect.arrayContaining([
      "photorealistic",
      "no text inside image",
      "no watermark",
      "no dark horror visual"
    ]));
    expect(V035_PREVIOUS_FAILURE_BASELINE).toEqual(expect.arrayContaining([
      "TEXT_CARD_RENDERER_REGRESSION",
      "DARK_HORROR_LIKE_VISUAL",
      "YOUTUBE_DESCRIPTION_MOJIBAKE"
    ]));
  });

  test("blocks instead of faking generated_scene_asset_count when image files are absent", async () => {
    const cwd = await makeCwd("commerce-v035-missing-images-");
    try {
      const report = await validateV035ImageSkillSceneAssets({ cwd });

      expect(report).toMatchObject({
        image_skill_available: true,
        image_skill_provider: "codex_builtin_image_gen",
        generated_scene_asset_count: 0,
        all_scene_assets_exist: false,
        image_quality_gate_pass: false,
        image_quality_blocker: "IMAGE_ASSET_MISSING"
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes the image quality gate only with portrait, non-placeholder scene files", async () => {
    const cwd = await makeCwd("commerce-v035-image-gate-");
    try {
      await writeFixtureSceneAssets(cwd);
      const pass = await validateV035ImageSkillSceneAssets({ cwd });

      expect(pass).toMatchObject({
        generated_scene_asset_count: 8,
        all_scene_assets_exist: true,
        all_scene_assets_are_portrait: true,
        all_scene_assets_min_width: true,
        all_scene_assets_min_height: true,
        all_scene_assets_file_size_bytes_gt_50000: true,
        no_placeholder_image: true,
        image_quality_gate_pass: true,
        image_quality_blocker: null
      });

      const fail = await validateV035ImageSkillSceneAssets({
        cwd,
        visualReview: {
          no_text_in_generated_image: false
        }
      });
      expect(fail.image_quality_gate_pass).toBe(false);
      expect(fail.image_quality_blockers).toContain("IMAGE_ASSET_CONTAINS_TEXT");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reuses the Korean metadata hardening gate without exposing raw affiliate URLs", () => {
    const preview = buildV035MetadataPreview({
      candidate_id: CANDIDATE_ID,
      selected_affiliate_url: AFFILIATE_URL
    });
    const serialized = JSON.stringify(preview);

    expect(preview.gate.can_pass_metadata_gate).toBe(true);
    expect(preview.gate.korean_utf8_roundtrip_pass).toBe(true);
    expect(preview.gate.description_contains_example_dot_com).toBe(false);
    expect(preview.gate.description_contains_placeholder_url).toBe(false);
    expect(preview.gate.coupang_disclosure_present).toBe(true);
    expect(serialized).toContain("<AFFILIATE_URL_PRESENT>");
    expect(serialized).not.toContain(AFFILIATE_URL);
    expect(preview.metadata.description).not.toContain("???");
    expect(preview.metadata.description).not.toContain("example.com");
  });

  test("creates a pending human-review packet with uploads locked when media providers are mocked", async () => {
    const cwd = await makeCwd("commerce-v035-ready-");
    try {
      await writeFixtureSceneAssets(cwd);
      const result = await generateV035ImageSkillSceneShortsReviewPacket({
        cwd,
        selectedAffiliateUrl: AFFILIATE_URL,
        voiceRunner: async ({ audioPath }) => {
          await writeFile(audioPath, "fake-v035-audio", "utf8");
          return { ok: true };
        },
        mediaRunner: async ({ outputPath }) => {
          await writeFile(outputPath, "fake-media", "utf8");
        },
        videoProbe: async () => ({
          duration_seconds: 23.5,
          audio_duration_seconds: 22.1,
          video_has_audio_stream: true
        }),
        asrRunner: async () => ({
          transcript: buildV035VoiceoverScript(),
          raw_similarity_score: 0.96,
          transcript_similarity_score: 0.96,
          core_anchor_recognition_pass: true,
          speech_rate_wpm: 160
        })
      });

      expect(result).toMatchObject({
        FINAL_STATUS: "SUCCESS_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW_READY",
        generated_scene_asset_count: 8,
        image_quality_gate_pass: true,
        local_review_video_generated: true,
        metadata_preview_generated: true,
        korean_utf8_roundtrip_pass: true,
        placeholder_scan_pass: true,
        example_com_present: false,
        mojibake_present: false,
        coupang_disclosure_present: true,
        human_review_status: "PENDING_HUMAN_REVIEW",
        metadata_review_status: "PENDING_METADATA_REVIEW",
        private_upload_allowed: false,
        safe_to_request_private_upload: false,
        PUBLIC_UPLOAD_BLOCKED: true,
        youtube_execute_called: false,
        videos_insert_called: false,
        r2_upload: false,
        product_assets_write: false,
        db_write: false,
        raw_urls_printed: false,
        secrets_printed: false
      });
      await expect(stat(result.review_console_path)).resolves.toBeTruthy();
      await expect(stat(result.image_scene_manifest_path)).resolves.toBeTruthy();
      await expect(stat(result.image_generation_provenance_path)).resolves.toBeTruthy();

      const uploadPreview = await readFile(
        path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, "v035", "youtube-upload-request-sanitized.json"),
        "utf8"
      );
      expect(uploadPreview).not.toContain(AFFILIATE_URL);
      expect(uploadPreview).toContain("<AFFILIATE_URL_PRESENT>");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("package script exposes review:v035", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["review:v035"]).toBe(
      "tsx scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet.ts"
    );
  });
});
