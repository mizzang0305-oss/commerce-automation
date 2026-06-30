import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverLocalCodexImageSkill } from "../../src/uploads/multi-channel/localCodexImageSkillBridge";
import { buildV044LocalCodexScenePromptPackage } from "../../src/uploads/multi-channel/localCodexImagePromptPackage";
import { getV041ExpectedImagePaths } from "../../src/uploads/multi-channel/manualImageDropManifest";

export async function checkV044LocalCodexImageSkill(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v044");
  await fs.mkdir(outputRoot, { recursive: true });

  const promptPackage = buildV044LocalCodexScenePromptPackage({ cwd });
  const discovery = await discoverLocalCodexImageSkill({ cwd, outputDir: promptPackage.image_skill_output_dir });
  const expectedPaths = getV041ExpectedImagePaths({ cwd });
  const artifacts = {
    setup_needed: path.join(outputRoot, "local-codex-image-skill-setup-needed.md"),
    scene_prompt_package: path.join(outputRoot, "local-codex-scene-prompt-package.json"),
    expected_output_paths: path.join(outputRoot, "expected-output-paths.json"),
    provider_status: path.join(outputRoot, "local-codex-image-skill-status.json")
  };
  const status = {
    version: "v044",
    FINAL_STATUS: discovery.image_skill_available
      ? "READY_LOCAL_CODEX_IMAGE_SKILL_AVAILABLE"
      : "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND",
    V044_LOCAL_CODEX_IMAGE_SKILL_READY: discovery.image_skill_available,
    V044_REVIEW_PACKETS_READY: false,
    SAFE_TO_UPLOAD: false,
    ...discovery,
    prompt_package_generated: true,
    scene_prompt_count: promptPackage.scene_prompt_count,
    channel_count: promptPackage.channel_count,
    prompt_package_path: artifacts.scene_prompt_package,
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

  await writeJson(artifacts.scene_prompt_package, promptPackage);
  await writeJson(artifacts.expected_output_paths, {
    version: "v044",
    local_codex_output_dir: promptPackage.image_skill_output_dir,
    expected_manual_drop_paths: expectedPaths
  });
  await writeJson(artifacts.provider_status, status);
  await fs.writeFile(artifacts.setup_needed, buildSetupGuide(status), "utf8");

  return { ...status, artifacts };
}

function buildSetupGuide(status: {
  image_skill_discovered: boolean;
  image_skill_command: string | null;
  image_skill_output_dir: string;
  discovery_blocker: string | null;
}) {
  return [
    "# v044 Local Codex Image Skill Setup Needed",
    "",
    "The repository found prior Codex image skill planning evidence, but no Node-callable local image skill command is exposed.",
    "",
    `- image_skill_discovered: ${status.image_skill_discovered}`,
    `- image_skill_command: ${status.image_skill_command ?? "null"}`,
    `- image_skill_output_dir: ${status.image_skill_output_dir}`,
    `- discovery_blocker: ${status.discovery_blocker}`,
    "",
    "Generate or save the 18 approved scene images into the output directory by channel, then run:",
    "",
    "```bash",
    "npm run image-skill:codex:generate",
    "npm run review:v044",
    "```",
    "",
    "Do not upload, change visibility, mutate comments, write DB rows, or commit generated images.",
    ""
  ].join("\n");
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  checkV044LocalCodexImageSkill()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V044_LOCAL_CODEX_IMAGE_SKILL_READY: result.V044_LOCAL_CODEX_IMAGE_SKILL_READY,
        V044_REVIEW_PACKETS_READY: result.V044_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        image_skill_discovered: result.image_skill_discovered,
        image_skill_command: result.image_skill_command,
        image_skill_output_dir: result.image_skill_output_dir,
        image_skill_available: result.image_skill_available,
        discovery_blocker: result.discovery_blocker,
        prompt_package_path: result.prompt_package_path,
        secrets_printed: result.secrets_printed,
        raw_urls_printed: result.raw_urls_printed
      }, null, 2));
      if (!result.V044_LOCAL_CODEX_IMAGE_SKILL_READY) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
