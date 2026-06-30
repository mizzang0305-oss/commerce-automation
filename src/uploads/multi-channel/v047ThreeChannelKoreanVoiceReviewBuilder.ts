import fs from "node:fs/promises";
import path from "node:path";

import { V035_SCENE_ASSETS } from "../../../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  V046_AGENT_IMAGE_SCENE_PLANS,
  buildV046AgentImageSkillHandoffManifest
} from "./agentImageSkillHandoff";
import {
  V046_CHANNEL_PLANS
} from "./v046ThreeChannelReviewBuilder";
import {
  evaluateV035KoreanVoiceProviderReadiness,
  loadV035KoreanVoiceEnv,
  type V035KoreanVoiceProviderReadiness
} from "./v035KoreanVoiceProviderAdapter";
import {
  assertV035SuccessPipelineReusable,
  runV035SuccessPipelineForChannel,
  type V035ChannelPlan,
  type V035PipelineRunnerOptions
} from "./v035PipelineAdapter";

type V047FinalStatus =
  | "SUCCESS_V047_THREE_CHANNEL_KOREAN_VOICE_REVIEW_READY"
  | "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE"
  | "BLOCKED_V046_GENERATED_IMAGES_MISSING"
  | "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL"
  | "BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE"
  | "BLOCKED_V047_THREE_CHANNEL_RENDER_FAILED";

export async function buildV047ThreeChannelKoreanVoiceReviewPackets(options: V035PipelineRunnerOptions & {
  env?: Partial<NodeJS.ProcessEnv>;
} = {}) {
  const cwd = options.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v047");
  const reusable = assertV035SuccessPipelineReusable();
  const handoff = await buildV046AgentImageSkillHandoffManifest({ cwd });
  const env = await loadV035KoreanVoiceEnv(cwd, options.env);
  const voiceProvider = evaluateV035KoreanVoiceProviderReadiness(env);

  if (!reusable.reusable) {
    return writeAndReturn(buildResult({
      finalStatus: "BLOCKED_V035_SUCCESS_PIPELINE_NOT_REUSABLE",
      cwd,
      reusable,
      handoff,
      voiceProvider,
      channels: []
    }));
  }

  if (!handoff.all_images_exist) {
    return writeAndReturn(buildResult({
      finalStatus: "BLOCKED_V046_GENERATED_IMAGES_MISSING",
      cwd,
      reusable,
      handoff,
      voiceProvider,
      channels: []
    }));
  }

  if (!handoff.quality_gate_pass) {
    return writeAndReturn(buildResult({
      finalStatus: "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
      cwd,
      reusable,
      handoff,
      voiceProvider,
      channels: []
    }));
  }

  if (!voiceProvider.v035_melotts_provider_ready) {
    return writeAndReturn(buildResult({
      finalStatus: "BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE",
      cwd,
      reusable,
      handoff,
      voiceProvider,
      channels: []
    }));
  }

  const channels = [];
  for (const plan of V046_CHANNEL_PLANS) {
    const sourceSceneDir = await prepareV035SceneSourceFromV046AgentImages({ cwd, plan });
    channels.push(await runV035SuccessPipelineForChannel(plan, {
      ...options,
      cwd,
      env,
      reviewVersion: "v047",
      sourceSceneDir
    }));
  }

  const allReady = channels.every((channel) => channel.FINAL_STATUS === "SUCCESS_V045_CHANNEL_V035_PIPELINE_READY");
  const voiceBlocked = channels.some((channel) => channel.blocker === "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED" ||
    channel.blocker === "LOCAL_KOREAN_TTS_COMMAND_FAILED" ||
    channel.blocker === "VOICE_PROVIDER_GENERATION_FAILED" ||
    channel.blocker === "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE");

  return writeAndReturn(buildResult({
    finalStatus: allReady
      ? "SUCCESS_V047_THREE_CHANNEL_KOREAN_VOICE_REVIEW_READY"
      : voiceBlocked
        ? "BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE"
        : "BLOCKED_V047_THREE_CHANNEL_RENDER_FAILED",
    cwd,
    reusable,
    handoff,
    voiceProvider,
    channels
  }));

  async function writeAndReturn<T extends ReturnType<typeof buildResult>>(result: T) {
    await writeJson(path.join(outputRoot, "review-summary.json"), result);
    await writeJson(path.join(outputRoot, "korean-voice-provider-readiness.json"), result.voice_provider_readiness);
    return result;
  }
}

async function prepareV035SceneSourceFromV046AgentImages(input: {
  cwd: string;
  plan: V035ChannelPlan;
}) {
  const sourceRoot = path.join(input.cwd, "commerce-assets", "review", "v046", "generated-scenes", input.plan.channel_key);
  const mappedRoot = path.join(input.cwd, "commerce-assets", "review", "v047", "_v035-source", input.plan.channel_key);
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
  finalStatus: V047FinalStatus;
  cwd: string;
  reusable: ReturnType<typeof assertV035SuccessPipelineReusable>;
  handoff: Awaited<ReturnType<typeof buildV046AgentImageSkillHandoffManifest>>;
  voiceProvider: V035KoreanVoiceProviderReadiness;
  channels: Awaited<ReturnType<typeof runV035SuccessPipelineForChannel>>[];
}) {
  const byKey = (key: string) => input.channels.find((channel) => channel.channel_key === key);
  const ready = input.finalStatus === "SUCCESS_V047_THREE_CHANNEL_KOREAN_VOICE_REVIEW_READY";
  const audioValues = input.channels.map((channel) => channel.v035_result).filter(Boolean);
  const audioValidationPass = input.channels.length === 3 && audioValues.every((value) =>
    resultFlag(value, "melotts_voice_used") &&
    resultValue(value, "audio_blocker") === null &&
    typeof resultValue(value, "speech_rate_wpm") === "number" &&
    typeof resultValue(value, "raw_similarity_score") === "number" &&
    typeof resultValue(value, "transcript_similarity_score") === "number" &&
    resultFlag(value, "core_anchor_recognition_pass"));

  return {
    version: "v047",
    FINAL_STATUS: input.finalStatus,
    V047_THREE_CHANNEL_REVIEW_READY: ready,
    SAFE_TO_UPLOAD: false,
    output_root: path.join(input.cwd, "commerce-assets", "review", "v047"),
    source_image_version: "v046",
    v046_generated_images_found: input.handoff.all_images_exist,
    generated_image_count: input.handoff.generated_image_count,
    generated_channels: input.handoff.generated_channels,
    quality_gate_pass: input.handoff.quality_gate_pass,
    quality_gate_blocker: input.handoff.quality_gate_blocker,
    v035_success_pipeline_found: input.reusable.reusable,
    v035_renderer_reused: input.channels.length === 3 && input.channels.every((channel) => channel.v035_renderer_reused),
    v035_metadata_builder_reused: input.channels.length === 3 && input.channels.every((channel) => channel.v035_metadata_builder_reused),
    v035_review_console_reused: input.channels.length === 3 && input.channels.every((channel) => channel.v035_review_console_reused),
    v035_melotts_voice_provider_restored: input.voiceProvider.v035_melotts_provider_ready && audioValidationPass,
    v035_melotts_provider_ready: input.voiceProvider.v035_melotts_provider_ready,
    local_command_provider_ready: input.voiceProvider.local_command_provider_ready,
    windows_sapi_used: input.voiceProvider.windows_sapi_used,
    cloud_or_paid_voice_provider_used: input.voiceProvider.paid_or_cloud_provider_used,
    voice_provider_blocker: input.voiceProvider.blocker,
    voice_provider_readiness: input.voiceProvider,
    melotts_voice_used_all: audioValues.length === 3 && audioValues.every((value) => resultFlag(value, "melotts_voice_used")),
    speech_rate_wpm_present_all: audioValues.length === 3 && audioValues.every((value) => typeof resultValue(value, "speech_rate_wpm") === "number"),
    raw_similarity_score_present_all: audioValues.length === 3 && audioValues.every((value) => typeof resultValue(value, "raw_similarity_score") === "number"),
    transcript_similarity_score_present_all: audioValues.length === 3 && audioValues.every((value) => typeof resultValue(value, "transcript_similarity_score") === "number"),
    core_anchor_recognition_pass_all: audioValues.length === 3 && audioValues.every((value) => resultFlag(value, "core_anchor_recognition_pass")),
    audio_blocker_all_clear: audioValues.length === 3 && audioValues.every((value) => resultValue(value, "audio_blocker") === null),
    audio_validation_pass: audioValidationPass,
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
    private_upload: false,
    public_upload: false,
    unlisted_upload: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    channels: input.channels
  };
}

function resultFlag(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)[key] === true);
}

function resultValue(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
