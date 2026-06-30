import path from "node:path";

import { type ChannelKey } from "./channelProfiles";
import { buildV041ManualImageDropManifest } from "./manualImageDropManifest";

export type LocalCodexScenePrompt = {
  channel_key: ChannelKey;
  scene_key: string;
  target_filename: string;
  prompt: string;
  output_path: string;
  manual_drop_path: string;
  required_visuals: string[];
  forbidden_visuals: string[];
};

export type LocalCodexScenePromptPackage = {
  version: "v044";
  provider: "local_codex_image_skill";
  scene_prompt_count: number;
  channel_count: number;
  image_skill_output_dir: string;
  manual_drop_root: string;
  common_constraints: string[];
  scenes: LocalCodexScenePrompt[];
};

export function buildV044LocalCodexScenePromptPackage(input: { cwd?: string } = {}): LocalCodexScenePromptPackage {
  const cwd = input.cwd ?? process.cwd();
  const manifest = buildV041ManualImageDropManifest({ cwd });
  const outputDir = path.join(cwd, "commerce-assets", "review", "v044", "local-codex-image-skill-output");
  const manualDropRoot = path.join(cwd, "commerce-assets", "manual-drop", "v041");

  const scenes = manifest.channels.flatMap((channel) =>
    channel.files.map((file) => ({
      channel_key: channel.channel_key,
      scene_key: path.basename(file.filename, path.extname(file.filename)),
      target_filename: file.filename,
      prompt: [
        "9:16 vertical photorealistic clean commerce lifestyle image.",
        "No text inside image, no watermark, no logo, no UI.",
        "No scary mood, no abstract overlay, no mosaic, no checkerboard, no noise texture.",
        "Minimum target size 720x1280.",
        file.prompt
      ].join(" "),
      output_path: path.join(outputDir, channel.channel_key, file.filename),
      manual_drop_path: file.path,
      required_visuals: file.required_visuals,
      forbidden_visuals: file.forbidden_visuals
    }))
  );

  return {
    version: "v044",
    provider: "local_codex_image_skill",
    scene_prompt_count: scenes.length,
    channel_count: manifest.channels.length,
    image_skill_output_dir: outputDir,
    manual_drop_root: manualDropRoot,
    common_constraints: manifest.common_requirements,
    scenes
  };
}
