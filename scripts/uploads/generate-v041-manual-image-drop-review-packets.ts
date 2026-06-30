import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MULTI_CHANNEL_COUPANG_DISCLOSURE } from "../../src/uploads/multi-channel/commentTemplateBuilder";
import { buildV041ManualImageDropManifest, getV041ExpectedImagePaths } from "../../src/uploads/multi-channel/manualImageDropManifest";
import { buildV041ManualImageDropReview } from "../../src/uploads/multi-channel/manualImageDropReviewBuilder";
import { validateV041ManualImageDrop } from "../../src/uploads/multi-channel/manualImageDropValidator";

export function buildV041ManualImageDropPromptPackage(input: { cwd?: string } = {}) {
  const manifest = buildV041ManualImageDropManifest(input);
  return {
    version: "v041",
    purpose: "Manual image drop bridge for real photo-like commerce Shorts review packets.",
    affiliate_disclosure: MULTI_CHANNEL_COUPANG_DISCLOSURE,
    manual_drop_root: "commerce-assets/manual-drop/v041",
    common_requirements: manifest.common_requirements,
    forbidden_conditions: manifest.forbidden_conditions,
    channels: manifest.channels.map((channel) => ({
      channel_key: channel.channel_key,
      product_name: channel.product_name,
      expected_dir: channel.expected_dir,
      semantic_evidence_required: channel.evidence_filename,
      scenes: channel.files.map((file) => ({
        scene_key: file.scene_key,
        filename: file.filename,
        prompt: file.prompt,
        required_visuals: file.required_visuals,
        forbidden_visuals: file.forbidden_visuals
      }))
    }))
  };
}

export async function writeV041ManualImageDropReviewPackets(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v041");
  await fs.mkdir(outputRoot, { recursive: true });

  const promptPackage = buildV041ManualImageDropPromptPackage({ cwd });
  const expectedImagePaths = getV041ExpectedImagePaths({ cwd });
  const validation = await validateV041ManualImageDrop({ cwd });
  const review = await buildV041ManualImageDropReview({ cwd });
  const artifactPaths = {
    manual_image_drop_guide: path.join(outputRoot, "manual-image-drop-guide.md"),
    manual_image_prompt_package: path.join(outputRoot, "manual-image-prompt-package.json"),
    expected_image_paths: path.join(outputRoot, "expected-image-paths.json"),
    manual_drop_status: path.join(outputRoot, "manual-drop-status.json")
  };
  const status = {
    version: "v041",
    FINAL_STATUS: review.FINAL_STATUS,
    V041_BRIDGE_READY: review.V041_BRIDGE_READY,
    V041_REVIEW_PACKETS_READY: review.V041_REVIEW_PACKETS_READY,
    SAFE_TO_UPLOAD: false,
    required_image_count: validation.required_image_count,
    found_image_count: validation.found_image_count,
    all_required_images_present: validation.all_required_images_present,
    validation_attempted: validation.validation_attempted,
    validation_pass: validation.validation_pass,
    validation_blocker: validation.validation_blocker,
    videos_generated: review.videos_generated,
    review_packet_blocker: review.review_packet_blocker,
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

  await writeJson(artifactPaths.manual_image_prompt_package, promptPackage);
  await writeJson(artifactPaths.expected_image_paths, expectedImagePaths);
  await writeJson(artifactPaths.manual_drop_status, status);
  await fs.writeFile(artifactPaths.manual_image_drop_guide, buildGuide(promptPackage), "utf8");

  return {
    ...status,
    artifact_paths: artifactPaths,
    channel_results: review.channel_results
  };
}

function buildGuide(promptPackage: ReturnType<typeof buildV041ManualImageDropPromptPackage>) {
  const lines = [
    "# v041 Manual Image Drop Guide",
    "",
    "Place real photo-like 9:16 images into the expected manual-drop folders, then rerun `npm run review:v041`.",
    "",
    "Required common conditions:",
    ...promptPackage.common_requirements.map((item) => `- ${item}`),
    "",
    "Forbidden image conditions:",
    ...promptPackage.forbidden_conditions.map((item) => `- ${item}`),
    "",
    "Each channel folder must also include `manual-image-semantic-evidence.json` with detected objects, real_photo_likeness_score, and visual_stats. Without evidence the bridge will not generate videos.",
    "",
    "Run command:",
    "",
    "```bash",
    "npm run review:v041",
    "```",
    ""
  ];
  for (const channel of promptPackage.channels) {
    lines.push(`## ${channel.channel_key}`);
    lines.push(`- expected_dir: ${channel.expected_dir}`);
    lines.push(`- semantic evidence: ${channel.semantic_evidence_required}`);
    for (const scene of channel.scenes) {
      lines.push(`- ${scene.filename}: ${scene.prompt}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  writeV041ManualImageDropReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V041_BRIDGE_READY: result.V041_BRIDGE_READY,
        V041_REVIEW_PACKETS_READY: result.V041_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        required_image_count: result.required_image_count,
        found_image_count: result.found_image_count,
        all_required_images_present: result.all_required_images_present,
        validation_attempted: result.validation_attempted,
        validation_pass: result.validation_pass,
        validation_blocker: result.validation_blocker,
        videos_generated: result.videos_generated,
        review_packet_blocker: result.review_packet_blocker,
        artifact_paths: result.artifact_paths,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_V041_MANUAL_IMAGE_DROP_BRIDGE",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
