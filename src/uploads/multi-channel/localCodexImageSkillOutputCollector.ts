import fs from "node:fs/promises";
import path from "node:path";

import { validateImagePackFile, type ImagePackQualityProbe } from "./imagePackQualityGate";
import { buildV044LocalCodexScenePromptPackage, type LocalCodexScenePromptPackage } from "./localCodexImagePromptPackage";

export type LocalCodexCollectedImage = {
  channel_key: string;
  scene_key: string;
  target_filename: string;
  output_path: string;
  file_exists: boolean;
  quality: ImagePackQualityProbe;
};

export type LocalCodexOutputCollection = {
  version: "v044";
  image_skill_output_dir: string;
  required_image_count: number;
  generated_image_count: number;
  generated_channels: string[];
  all_images_exist: boolean;
  images: LocalCodexCollectedImage[];
};

export async function collectLocalCodexImageSkillOutput(input: {
  cwd?: string;
  promptPackage?: LocalCodexScenePromptPackage;
} = {}): Promise<LocalCodexOutputCollection> {
  const promptPackage = input.promptPackage ?? buildV044LocalCodexScenePromptPackage({ cwd: input.cwd });
  const images: LocalCodexCollectedImage[] = [];

  for (const scene of promptPackage.scenes) {
    const quality = await validateImagePackFile(scene.output_path);
    images.push({
      channel_key: scene.channel_key,
      scene_key: scene.scene_key,
      target_filename: scene.target_filename,
      output_path: scene.output_path,
      file_exists: quality.file_exists,
      quality
    });
  }

  const generatedChannels = [...new Set(images.filter((image) => image.file_exists).map((image) => image.channel_key))];

  return {
    version: "v044",
    image_skill_output_dir: promptPackage.image_skill_output_dir,
    required_image_count: promptPackage.scene_prompt_count,
    generated_image_count: images.filter((image) => image.file_exists).length,
    generated_channels: generatedChannels,
    all_images_exist: images.every((image) => image.file_exists),
    images
  };
}

export async function writeLocalCodexOutputManifest(outputRoot: string, collection: LocalCodexOutputCollection) {
  const filePath = path.join(outputRoot, "local-codex-output-collection.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
  return filePath;
}
