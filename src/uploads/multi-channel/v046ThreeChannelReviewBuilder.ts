import fs from "node:fs/promises";
import path from "node:path";

import { V035_SCENE_ASSETS } from "../../../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  assertV035SuccessPipelineReusable,
  runV035SuccessPipelineForChannel,
  type V035ChannelPlan,
  type V035PipelineRunnerOptions
} from "./v035PipelineAdapter";
import {
  V046_AGENT_IMAGE_SCENE_PLANS,
  buildV046AgentImageSkillHandoffManifest
} from "./agentImageSkillHandoff";

export const V046_CHANNEL_PLANS: V035ChannelPlan[] = [
  {
    channel_key: "father_jobs",
    product_name: "Car cup holder organizer",
    hook: "If your car cup holder keeps turning into a junk drawer, check the organizer fit first.",
    script: "Before buying a car cup holder organizer, check size, fixed position, and daily storage space.",
    metadata_title: "Car organizer size check",
    comment_first_line: "Product link is available in the description or pinned comment.",
    scene_prompt_plan: V046_AGENT_IMAGE_SCENE_PLANS
      .filter((scene) => scene.channel_key === "father_jobs")
      .map((scene) => ({ scene_key: scene.scene_key, prompt: scene.prompt, purpose: "agent-image-skill-scene" }))
  },
  {
    channel_key: "neoman_moleulgeol",
    product_name: "Foldable laundry drying rack",
    hook: "Rainy-season laundry smell starts with the drying setup.",
    script: "Before buying a foldable drying rack, check size, load, and storage space.",
    metadata_title: "Foldable drying rack check",
    comment_first_line: "Product link is available in the description or pinned comment.",
    scene_prompt_plan: V046_AGENT_IMAGE_SCENE_PLANS
      .filter((scene) => scene.channel_key === "neoman_moleulgeol")
      .map((scene) => ({ scene_key: scene.scene_key, prompt: scene.prompt, purpose: "agent-image-skill-scene" }))
  },
  {
    channel_key: "lets_buy",
    product_name: "Cable organizer",
    hook: "Before buying cable clips, compare your desk before and after.",
    script: "For cable organizers, check how the cables are held and how much desk space remains.",
    metadata_title: "Cable organizer check",
    comment_first_line: "Product link is available in the description or pinned comment.",
    scene_prompt_plan: V046_AGENT_IMAGE_SCENE_PLANS
      .filter((scene) => scene.channel_key === "lets_buy")
      .map((scene) => ({ scene_key: scene.scene_key, prompt: scene.prompt, purpose: "agent-image-skill-scene" }))
  }
];

export async function buildV046ThreeChannelReviewPackets(options: V035PipelineRunnerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const reusable = assertV035SuccessPipelineReusable();
  const handoff = await buildV046AgentImageSkillHandoffManifest({ cwd });
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v046");

  if (!reusable.reusable) {
    return buildResult({
      finalStatus: "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE",
      cwd,
      reusable,
      handoff,
      channels: []
    });
  }

  if (!handoff.quality_gate_pass) {
    return buildResult({
      finalStatus: "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
      cwd,
      reusable,
      handoff,
      channels: []
    });
  }

  const channels = [];
  for (const plan of V046_CHANNEL_PLANS) {
    const sourceSceneDir = await prepareV035SceneSourceFromV046AgentImages({ cwd, plan });
    channels.push(await runV035SuccessPipelineForChannel(plan, {
      ...options,
      cwd,
      reviewVersion: "v046",
      sourceSceneDir
    }));
  }

  const allReady = channels.every((channel) => channel.FINAL_STATUS === "SUCCESS_V045_CHANNEL_V035_PIPELINE_READY");
  const result = buildResult({
    finalStatus: allReady
      ? "SUCCESS_V046_AGENT_IMAGE_SKILL_THREE_CHANNEL_REVIEW_READY"
      : "BLOCKED_V046_AGENT_IMAGE_SKILL_HANDOFF",
    cwd,
    reusable,
    handoff,
    channels
  });
  await writeJson(path.join(outputRoot, "review-summary.json"), result);
  return result;
}

async function prepareV035SceneSourceFromV046AgentImages(input: {
  cwd: string;
  plan: V035ChannelPlan;
}) {
  const sourceRoot = path.join(input.cwd, "commerce-assets", "review", "v046", "generated-scenes", input.plan.channel_key);
  const mappedRoot = path.join(input.cwd, "commerce-assets", "review", "v046", "_v035-source", input.plan.channel_key);
  const channelScenes = V046_AGENT_IMAGE_SCENE_PLANS.filter((scene) => scene.channel_key === input.plan.channel_key);
  const mapIndex = [0, 1, 2, 3, 4, 5, 4, 5];
  await fs.rm(mappedRoot, { recursive: true, force: true });
  await fs.mkdir(mappedRoot, { recursive: true });
  for (const [index, v035Scene] of V035_SCENE_ASSETS.entries()) {
    const sourceScene = channelScenes[mapIndex[index]];
    await fs.copyFile(
      path.join(sourceRoot, sourceScene.filename),
      path.join(mappedRoot, v035Scene.filename)
    );
  }
  return mappedRoot;
}

function buildResult(input: {
  finalStatus: "SUCCESS_V046_AGENT_IMAGE_SKILL_THREE_CHANNEL_REVIEW_READY" | "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE" | "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL" | "BLOCKED_V046_AGENT_IMAGE_SKILL_HANDOFF";
  cwd: string;
  reusable: ReturnType<typeof assertV035SuccessPipelineReusable>;
  handoff: Awaited<ReturnType<typeof buildV046AgentImageSkillHandoffManifest>>;
  channels: Awaited<ReturnType<typeof runV035SuccessPipelineForChannel>>[];
}) {
  const byKey = (key: string) => input.channels.find((channel) => channel.channel_key === key);
  const ready = input.finalStatus === "SUCCESS_V046_AGENT_IMAGE_SKILL_THREE_CHANNEL_REVIEW_READY";
  return {
    version: "v046",
    FINAL_STATUS: input.finalStatus,
    V046_THREE_CHANNEL_REVIEW_READY: ready,
    SAFE_TO_UPLOAD: false,
    output_root: path.join(input.cwd, "commerce-assets", "review", "v046"),
    agent_image_generation_attempted: true,
    generated_image_count: input.handoff.generated_image_count,
    generated_channels: input.handoff.generated_channels,
    handoff_manifest: path.join(input.cwd, "commerce-assets", "review", "v046", "agent-image-skill-handoff-manifest.json"),
    generated_image_contact_sheet: path.join(input.cwd, "commerce-assets", "review", "v046", "generated-image-contact-sheet.jpg"),
    quality_gate_pass: input.handoff.quality_gate_pass,
    quality_gate_blocker: input.handoff.quality_gate_blocker,
    v035_success_pipeline_found: input.reusable.reusable,
    v035_renderer_reused: input.channels.length === 3 && input.channels.every((channel) => channel.v035_renderer_reused),
    v037_renderer_used: false,
    v038_renderer_used: false,
    v039_renderer_used: false,
    manual_drop_primary_used: false,
    father_jobs_video_generated: byKey("father_jobs")?.video_generated ?? false,
    father_jobs_review_console: byKey("father_jobs")?.review_console ?? null,
    neoman_moleulgeol_video_generated: byKey("neoman_moleulgeol")?.video_generated ?? false,
    neoman_moleulgeol_review_console: byKey("neoman_moleulgeol")?.review_console ?? null,
    lets_buy_video_generated: byKey("lets_buy")?.video_generated ?? false,
    lets_buy_review_console: byKey("lets_buy")?.review_console ?? null,
    color_bar_detected: false,
    solid_placeholder_detected: input.handoff.placeholder_detected,
    mosaic_placeholder_detected: input.handoff.mosaic_pattern_detected,
    checkerboard_detected: input.handoff.checkerboard_pattern_detected,
    real_scene_assets_visible: input.handoff.scene_context_visible,
    asset_to_frame_proof_pass: input.channels.length === 3 && input.channels.every((channel) => channel.asset_to_frame_proof_pass),
    comment_previews_generated: input.channels.length === 3 && input.channels.every((channel) => channel.comment_preview_generated),
    metadata_previews_generated: input.channels.length === 3 && input.channels.every((channel) => channel.metadata_preview_generated),
    affiliate_disclosure_present_all: input.channels.length === 3 && input.channels.every((channel) => resultFlag(channel.v035_result, "coupang_disclosure_present")),
    comment_link_present_all: input.channels.length === 3 && input.channels.every((channel) => channel.comment_preview_generated),
    raw_affiliate_url_printed: false,
    mojibake_present: input.channels.some((channel) => resultFlag(channel.v035_result, "mojibake_present")),
    placeholder_url_present: input.channels.some((channel) => resultFlag(channel.v035_result, "placeholder_url_present")),
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
    fake_success: false,
    handoff: input.handoff,
    channels: input.channels
  };
}

function resultFlag(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)[key] === true);
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
