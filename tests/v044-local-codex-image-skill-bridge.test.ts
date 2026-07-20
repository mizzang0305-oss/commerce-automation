import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { checkV044LocalCodexImageSkill } from "../scripts/uploads/check-v044-local-codex-image-skill";
import { generateV044LocalCodexImages } from "../scripts/uploads/generate-v044-local-codex-images";
import { collectLocalCodexImageSkillOutput } from "../src/uploads/multi-channel/localCodexImageSkillOutputCollector";
import { validateLocalCodexImageQuality } from "../src/uploads/multi-channel/localCodexImageQualityGate";
import { buildV044LocalCodexScenePromptPackage } from "../src/uploads/multi-channel/localCodexImagePromptPackage";
import { mapLocalCodexImagesToV041ManualDrop } from "../src/uploads/multi-channel/localCodexImageToManualDropMapper";
import { validateV041ManualImageDrop } from "../src/uploads/multi-channel/manualImageDropValidator";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v044-"));
}

function validPng(width = 1080, height = 1920) {
  const buffer = Buffer.alloc(60001);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  for (let index = 32; index < buffer.length; index += 1) {
    buffer[index] = index % 251;
  }
  return buffer;
}

async function writeGeneratedImages(cwd: string) {
  const promptPackage = buildV044LocalCodexScenePromptPackage({ cwd });
  for (const scene of promptPackage.scenes) {
    await mkdir(path.dirname(scene.output_path), { recursive: true });
    await writeFile(scene.output_path, validPng());
  }
}

describe("v044 local Codex image skill bridge", () => {
  test("local_codex_image_skill_discovery_tests create setup artifacts without fake success", async () => {
    const cwd = await makeCwd();
    try {
      const result = await checkV044LocalCodexImageSkill({ cwd });

      expect(result.FINAL_STATUS).toBe("BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND");
      expect(result.V044_LOCAL_CODEX_IMAGE_SKILL_READY).toBe(false);
      expect(result.V044_REVIEW_PACKETS_READY).toBe(false);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.image_skill_command).toBeNull();
      await expect(stat(result.artifacts.setup_needed)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.scene_prompt_package)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.expected_output_paths)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("local_codex_prompt_package_tests produce 18 channel prompts", () => {
    const promptPackage = buildV044LocalCodexScenePromptPackage({ cwd: "C:\\repo" });

    expect(promptPackage.version).toBe("v044");
    expect(promptPackage.scene_prompt_count).toBe(18);
    expect(promptPackage.channel_count).toBe(3);
    expect(promptPackage.scenes[0]).toMatchObject({
      channel_key: "father_jobs",
      scene_key: "01-car-messy-cup-holder",
      target_filename: "01-car-messy-cup-holder.png"
    });
    expect(promptPackage.scenes.every((scene) => scene.prompt.includes("9:16 vertical"))).toBe(true);
  });

  test("local_codex_output_collector_tests and quality gate pass with 18 valid images", async () => {
    const cwd = await makeCwd();
    try {
      await writeGeneratedImages(cwd);
      const collection = await collectLocalCodexImageSkillOutput({ cwd });
      const quality = validateLocalCodexImageQuality(collection);

      expect(collection.generated_image_count).toBe(18);
      expect(collection.generated_channels).toEqual(["father_jobs", "neoman_moleulgeol", "lets_buy"]);
      expect(quality.quality_gate_pass).toBe(true);
      expect(quality.all_images_decode_success).toBe(true);
      expect(quality.all_images_portrait).toBe(true);
      expect(quality.placeholder_detected).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("local_codex_image_quality_gate_tests block missing or tiny outputs", async () => {
    const cwd = await makeCwd();
    try {
      const promptPackage = buildV044LocalCodexScenePromptPackage({ cwd });
      await mkdir(path.dirname(promptPackage.scenes[0].output_path), { recursive: true });
      await writeFile(promptPackage.scenes[0].output_path, validPng(300, 300));
      const result = await generateV044LocalCodexImages({ cwd });

      expect(result.FINAL_STATUS).toBe("BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL");
      expect(result.quality_gate_pass).toBe(false);
      expect(result.quality_gate_blockers).toContain("LOCAL_CODEX_IMAGE_OUTPUT_MISSING");
      expect(result.SAFE_TO_UPLOAD).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("local_codex_to_manual_drop_mapper_tests and v041 integration tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeGeneratedImages(cwd);
      const mapping = await mapLocalCodexImagesToV041ManualDrop({ cwd });
      const validation = await validateV041ManualImageDrop({ cwd });

      expect(mapping.mapped_image_count).toBe(18);
      expect(mapping.semantic_evidence_written).toBe(true);
      expect(validation.validation_pass).toBe(true);
      await expect(stat(path.join(cwd, "commerce-assets/manual-drop/v041/father_jobs/01-car-messy-cup-holder.png"))).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_disclosure_tests, no_raw_affiliate_url_report_tests, upload_side_effect_block_tests, package scripts", async () => {
    const cwd = await makeCwd();
    try {
      const result = await checkV044LocalCodexImageSkill({ cwd });
      const promptPackage = await readFile(result.artifacts.scene_prompt_package, "utf8");
      const serialized = JSON.stringify({ result, promptPackage });
      const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

      expect(serialized).not.toContain("https://link.coupang.com/a/");
      expect(serialized).not.toContain("example.com");
      expect(serialized).not.toContain("???");
      expect(serialized).not.toContain("\uFFFD");
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
      expect(packageJson.scripts["image-skill:codex:check"]).toBe("tsx scripts/uploads/check-v044-local-codex-image-skill.ts");
      expect(packageJson.scripts["image-skill:codex:generate"]).toBe("tsx scripts/uploads/generate-v044-local-codex-images.ts");
      expect(packageJson.scripts["review:v044"]).toBe("tsx scripts/uploads/generate-v044-local-codex-image-review-packets.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
