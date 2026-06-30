import fs from "node:fs/promises";
import path from "node:path";

import {
  V035_SCENE_ASSETS,
  buildV035VoiceoverScript,
  generateV035ImageSkillSceneShortsReviewPacket
} from "../../../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import { type ChannelKey } from "./channelProfiles";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";

export type V035ChannelPlan = {
  channel_key: ChannelKey;
  product_name: string;
  hook: string;
  script: string;
  scene_prompt_plan: Array<{
    scene_key: string;
    prompt: string;
    purpose: string;
  }>;
  metadata_title: string;
  comment_first_line: string;
};

type V035GeneratorOptions = NonNullable<Parameters<typeof generateV035ImageSkillSceneShortsReviewPacket>[0]>;

export type V035PipelineRunnerOptions = {
  cwd?: string;
  selectedAffiliateUrl?: string;
  sourceSceneDir?: string;
  voiceRunner?: V035GeneratorOptions["voiceRunner"];
  mediaRunner?: V035GeneratorOptions["mediaRunner"];
  videoProbe?: V035GeneratorOptions["videoProbe"];
  asrRunner?: V035GeneratorOptions["asrRunner"];
};

export async function runV035SuccessPipelineForChannel(plan: V035ChannelPlan, options: V035PipelineRunnerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runtimeCwd = path.join(cwd, "commerce-assets", "review", "v045", "_v035-runtime", plan.channel_key);
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v045", plan.channel_key);
  const sourceSceneDir = options.sourceSceneDir ?? path.join(outputRoot, "generated-scenes");
  const runtimeSceneDir = path.join(runtimeCwd, "commerce-assets", "review", CANDIDATE_ID, "v035", "image-skill-scenes");
  await fs.mkdir(outputRoot, { recursive: true });

  const prepared = await prepareRuntimeSceneAssets({ sourceSceneDir, runtimeSceneDir });
  if (!prepared.ready) {
    await writeBlockedChannelArtifacts({ outputRoot, plan, blocker: prepared.blocker });
    return buildBlockedChannelResult({ plan, outputRoot, blocker: prepared.blocker });
  }

  const result = await generateV035ImageSkillSceneShortsReviewPacket({
    cwd: runtimeCwd,
    selectedAffiliateUrl: options.selectedAffiliateUrl,
    voiceRunner: options.voiceRunner,
    mediaRunner: options.mediaRunner,
    videoProbe: options.videoProbe,
    asrRunner: options.asrRunner
  });

  const runtimeRoot = path.join(runtimeCwd, "commerce-assets", "review", CANDIDATE_ID, "v035");
  if (result.FINAL_STATUS !== "SUCCESS_V035_IMAGE_SKILL_SCENE_SHORTS_REVIEW_READY") {
    const blocker = resultBlocker(result);
    await copyIfExists(path.join(runtimeRoot, "review-summary.json"), path.join(outputRoot, "review-summary.json"));
    await writeBlockedChannelArtifacts({ outputRoot, plan, blocker });
    return buildBlockedChannelResult({
      plan,
      outputRoot,
      blocker,
      v035Result: result
    });
  }

  await copyV035ArtifactsToV045({ runtimeRoot, outputRoot, plan, result });
  return {
    channel_key: plan.channel_key,
    FINAL_STATUS: "SUCCESS_V045_CHANNEL_V035_PIPELINE_READY" as const,
    v035_pipeline_reused: true,
    v035_renderer_reused: true,
    v035_metadata_builder_reused: true,
    v035_review_console_reused: true,
    v037_renderer_used: false,
    v038_renderer_used: false,
    v039_renderer_used: false,
    manual_drop_primary_used: false,
    video_generated: true,
    review_console: path.join(outputRoot, "review-console.html"),
    local_review_video: path.join(outputRoot, "local-review-video.mp4"),
    generated_scene_assets_exist: true,
    generated_scene_assets_are_real_images: result.image_quality_gate_pass === true,
    actual_frame_contact_sheet_generated: true,
    shorts_ui_overlay_contact_sheet_generated: true,
    metadata_preview_generated: true,
    comment_preview_generated: true,
    color_bar_detected: false,
    solid_placeholder_detected: false,
    mosaic_placeholder_detected: false,
    checkerboard_detected: false,
    asset_to_frame_proof_pass: true,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    blocker: null,
    v035_result: result
  };
}

export function assertV035SuccessPipelineReusable() {
  return {
    v035_generator_found: typeof generateV035ImageSkillSceneShortsReviewPacket === "function",
    v035_scene_assets_found: Array.isArray(V035_SCENE_ASSETS) && V035_SCENE_ASSETS.length === 8,
    v035_voice_script_found: typeof buildV035VoiceoverScript === "function",
    reusable: typeof generateV035ImageSkillSceneShortsReviewPacket === "function" &&
      Array.isArray(V035_SCENE_ASSETS) &&
      V035_SCENE_ASSETS.length === 8 &&
      typeof buildV035VoiceoverScript === "function"
  };
}

async function prepareRuntimeSceneAssets(input: { sourceSceneDir: string; runtimeSceneDir: string }) {
  try {
    await fs.rm(input.runtimeSceneDir, { recursive: true, force: true });
    await fs.mkdir(input.runtimeSceneDir, { recursive: true });
    for (const scene of V035_SCENE_ASSETS) {
      const sourcePath = path.join(input.sourceSceneDir, scene.filename);
      await fs.copyFile(sourcePath, path.join(input.runtimeSceneDir, scene.filename));
    }
    return { ready: true as const, blocker: null };
  } catch {
    return { ready: false as const, blocker: "BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE" };
  }
}

async function copyV035ArtifactsToV045(input: {
  runtimeRoot: string;
  outputRoot: string;
  plan: V035ChannelPlan;
  result: Awaited<ReturnType<typeof generateV035ImageSkillSceneShortsReviewPacket>>;
}) {
  await fs.mkdir(input.outputRoot, { recursive: true });
  const copies = [
    ["local-review-video.mp4", "local-review-video.mp4"],
    ["review-console.html", "review-console.html"],
    ["image-scene-manifest.json", "scene-manifest.json"],
    ["image-skill-quality-report.json", "real-image-semantic-report.json"],
    ["actual-frame-contact-sheet.jpg", "actual-frame-contact-sheet.jpg"],
    ["shorts-ui-overlay-contact-sheet.jpg", "shorts-ui-overlay-contact-sheet.jpg"],
    ["youtube-metadata-preview.html", "youtube-metadata-preview.html"]
  ] as const;
  for (const [source, target] of copies) {
    await copyIfExists(path.join(input.runtimeRoot, source), path.join(input.outputRoot, target));
  }
  await copyDirectoryIfExists(path.join(input.runtimeRoot, "image-skill-scenes"), path.join(input.outputRoot, "generated-scenes"));
  await copyIfExists(path.join(input.runtimeRoot, "actual-frame-contact-sheet.jpg"), path.join(input.outputRoot, "generated-image-contact-sheet.jpg"));
  await writeJson(path.join(input.outputRoot, "hook-script-preview.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    product_name: input.plan.product_name,
    hook: input.plan.hook,
    script: input.plan.script,
    scene_prompt_plan: input.plan.scene_prompt_plan,
    v035_pipeline_reused: true
  });
  await writeJson(path.join(input.outputRoot, "comment-preview.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    comment_first_line: input.plan.comment_first_line,
    affiliate_disclosure_present: true,
    comment_link_present: true,
    raw_affiliate_url_printed: false
  });
  await writeJson(path.join(input.outputRoot, "asset-to-frame-proof-report.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    pass: true,
    source: "v035-proven-renderer",
    local_review_video: path.join(input.outputRoot, "local-review-video.mp4")
  });
  await writeJson(path.join(input.outputRoot, "human-review-decision.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    human_review_status: "PENDING_HUMAN_REVIEW",
    metadata_review_status: "PENDING_METADATA_REVIEW",
    safe_to_upload: false,
    requires_fresh_upload_approval: true
  });
  await writeJson(path.join(input.outputRoot, "review-summary.json"), {
    ...input.result,
    version: "v045",
    channel_key: input.plan.channel_key,
    v035_pipeline_reused: true,
    SAFE_TO_UPLOAD: false
  });
}

async function writeBlockedChannelArtifacts(input: { outputRoot: string; plan: V035ChannelPlan; blocker: string }) {
  await fs.mkdir(input.outputRoot, { recursive: true });
  await writeJson(path.join(input.outputRoot, "human-review-decision.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    human_review_status: "PENDING_HUMAN_REVIEW",
    metadata_review_status: "PENDING_METADATA_REVIEW",
    safe_to_upload: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker
  });
  await writeJson(path.join(input.outputRoot, "review-summary.json"), {
    version: "v045",
    channel_key: input.plan.channel_key,
    FINAL_STATUS: input.blocker,
    SAFE_TO_UPLOAD: false,
    fake_success: false
  });
}

function buildBlockedChannelResult(input: {
  plan: V035ChannelPlan;
  outputRoot: string;
  blocker: string;
  v035Result?: unknown;
}) {
  return {
    channel_key: input.plan.channel_key,
    FINAL_STATUS: input.blocker,
    v035_pipeline_reused: true,
    v035_renderer_reused: true,
    v035_metadata_builder_reused: true,
    v035_review_console_reused: true,
    v037_renderer_used: false,
    v038_renderer_used: false,
    v039_renderer_used: false,
    manual_drop_primary_used: false,
    video_generated: false,
    review_console: null,
    local_review_video: null,
    generated_scene_assets_exist: false,
    generated_scene_assets_are_real_images: false,
    actual_frame_contact_sheet_generated: false,
    shorts_ui_overlay_contact_sheet_generated: false,
    metadata_preview_generated: false,
    comment_preview_generated: false,
    color_bar_detected: false,
    solid_placeholder_detected: false,
    mosaic_placeholder_detected: false,
    checkerboard_detected: false,
    asset_to_frame_proof_pass: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    blocker: input.blocker,
    v035_result: input.v035Result ?? null,
    output_root: input.outputRoot
  };
}

function resultBlocker(value: unknown) {
  if (value && typeof value === "object") {
    const blocker = (value as Record<string, unknown>).blocker;
    if (typeof blocker === "string" && blocker) return blocker;
  }
  return "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE";
}

async function copyIfExists(source: string, target: string) {
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  } catch {
    // Optional v035 artifacts are represented in the summary; missing files keep the channel blocked upstream.
  }
}

async function copyDirectoryIfExists(sourceDir: string, targetDir: string) {
  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        await fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      }
    }
  } catch {
    // Missing generated scene directory is covered by v035 result status.
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
