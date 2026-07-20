import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectLocalCodexImageSkillOutput, writeLocalCodexOutputManifest } from "../../src/uploads/multi-channel/localCodexImageSkillOutputCollector";
import { validateLocalCodexImageQuality } from "../../src/uploads/multi-channel/localCodexImageQualityGate";
import { buildV044LocalCodexScenePromptPackage } from "../../src/uploads/multi-channel/localCodexImagePromptPackage";
import { mapLocalCodexImagesToV041ManualDrop } from "../../src/uploads/multi-channel/localCodexImageToManualDropMapper";

export async function generateV044LocalCodexImages(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v044");
  await fs.mkdir(outputRoot, { recursive: true });
  const promptPackage = buildV044LocalCodexScenePromptPackage({ cwd });
  const collection = await collectLocalCodexImageSkillOutput({ cwd, promptPackage });
  const quality = validateLocalCodexImageQuality(collection);
  const artifacts = {
    scene_prompt_package: path.join(outputRoot, "local-codex-scene-prompt-package.json"),
    output_collection: await writeLocalCodexOutputManifest(outputRoot, collection),
    quality_report: path.join(outputRoot, "local-codex-image-quality-report.json"),
    mapping_report: path.join(outputRoot, "local-codex-to-manual-drop-mapping.json")
  };

  await writeJson(artifacts.scene_prompt_package, promptPackage);
  await writeJson(artifacts.quality_report, quality);

  if (!quality.quality_gate_pass) {
    const result = buildResult({
      finalStatus: collection.generated_image_count === 0
        ? "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND"
        : "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
      collection,
      quality,
      artifacts
    });
    await writeJson(artifacts.mapping_report, { version: "v044", mapped_image_count: 0, blocker: result.quality_gate_blocker });
    return result;
  }

  const mapping = await mapLocalCodexImagesToV041ManualDrop({ cwd });
  await writeJson(artifacts.mapping_report, mapping);

  return buildResult({
    finalStatus: "SUCCESS_V044_LOCAL_CODEX_IMAGES_MAPPED_TO_V041_MANUAL_DROP",
    collection,
    quality,
    artifacts,
    outputCollected: true,
    mappedImageCount: mapping.mapped_image_count
  });
}

type V044GenerateStatus =
  | "SUCCESS_V044_LOCAL_CODEX_IMAGES_MAPPED_TO_V041_MANUAL_DROP"
  | "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND"
  | "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL";

function buildResult(input: {
  finalStatus: V044GenerateStatus;
  collection: Awaited<ReturnType<typeof collectLocalCodexImageSkillOutput>>;
  quality: ReturnType<typeof validateLocalCodexImageQuality>;
  artifacts: Record<string, string>;
  outputCollected?: boolean;
  mappedImageCount?: number;
}) {
  return {
    ...input.quality,
    version: "v044",
    FINAL_STATUS: input.finalStatus,
    V044_LOCAL_CODEX_IMAGE_SKILL_READY: input.finalStatus !== "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND",
    V044_REVIEW_PACKETS_READY: false,
    SAFE_TO_UPLOAD: false,
    image_generation_attempted: false,
    generated_image_count: input.collection.generated_image_count,
    generated_channels: input.collection.generated_channels,
    output_collected: input.outputCollected ?? false,
    mapped_image_count: input.mappedImageCount ?? 0,
    quality_gate_pass: input.quality.quality_gate_pass,
    quality_gate_blocker: input.quality.quality_gate_blocker,
    artifacts: input.artifacts,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  generateV044LocalCodexImages()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V044_LOCAL_CODEX_IMAGE_SKILL_READY: result.V044_LOCAL_CODEX_IMAGE_SKILL_READY,
        V044_REVIEW_PACKETS_READY: result.V044_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        generated_image_count: result.generated_image_count,
        generated_channels: result.generated_channels,
        output_collected: result.output_collected,
        quality_gate_pass: result.quality_gate_pass,
        quality_gate_blocker: result.quality_gate_blocker,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (!result.quality_gate_pass) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
