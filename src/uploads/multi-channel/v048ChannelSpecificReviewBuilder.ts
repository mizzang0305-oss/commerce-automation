import fs from "node:fs/promises";
import path from "node:path";

import { V034_COUPANG_DISCLOSURE } from "../../lib/uploads/youtube/youtubeMetadataHardening";
import { V035_SCENE_ASSETS } from "../../../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  V046_AGENT_IMAGE_SCENE_PLANS,
  buildV046AgentImageSkillHandoffManifest
} from "./agentImageSkillHandoff";
import {
  evaluateChannelBinding,
  evaluateThreeChannelBinding,
  type ChannelBindingReport
} from "./channelBindingGate";
import { type ChannelKey } from "./channelProfiles";
import {
  V048_CHANNEL_SPECS,
  buildChannelSpecificScriptPlan
} from "./channelSpecificScriptFactory";
import {
  buildChannelUploadSettingsPreview,
  type ChannelUploadSettingsPreview
} from "./channelUploadSettingsPreview";
import {
  evaluateV035KoreanVoiceProviderReadiness,
  loadV035KoreanVoiceEnv
} from "./v035KoreanVoiceProviderAdapter";
import {
  assertV035SuccessPipelineReusable,
  runV035SuccessPipelineForChannel,
  type V035ChannelPlan,
  type V035PipelineRunnerOptions
} from "./v035PipelineAdapter";

const V047_FAIL_REASONS = [
  "CROSS_CHANNEL_SCRIPT_CONTAMINATION",
  "ALL_CHANNELS_USED_LAUNDRY_SCRIPT",
  "CHANNEL_PRODUCT_SCRIPT_MISMATCH",
  "SCENE_MANIFEST_PURPOSE_MISMATCH",
  "FATHER_JOBS_USED_LAUNDRY_PURPOSES",
  "LETS_BUY_USED_LAUNDRY_PURPOSES",
  "HOOK_ASSET_SCRIPT_NOT_BOUND_TO_CHANNEL",
  "UPLOAD_SETTINGS_GATE_MISSING"
] as const;

type V048FinalStatus =
  | "SUCCESS_V048_CHANNEL_SPECIFIC_REVIEW_READY"
  | "BLOCKED_V046_GENERATED_IMAGES_MISSING"
  | "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL"
  | "BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE"
  | "BLOCKED_V048_CHANNEL_SPECIFIC_SCRIPT_SETTINGS";

export async function recordV047ChannelBindingFailure(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  const decision = {
    version: "v047",
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    safe_to_upload: false,
    fail_reasons: [...V047_FAIL_REASONS],
    pr166_merge_allowed: false
  };
  await writeJson(path.join(cwd, "commerce-assets", "review", "v047", "human-review-decision.json"), decision);
  return decision;
}

export async function buildV048ChannelSpecificReviewPackets(options: V035PipelineRunnerOptions & {
  env?: Partial<NodeJS.ProcessEnv>;
} = {}) {
  const cwd = options.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v048");
  const v047Failure = await recordV047ChannelBindingFailure({ cwd });
  const reusable = assertV035SuccessPipelineReusable();
  const handoff = await buildV046AgentImageSkillHandoffManifest({ cwd });
  const env = await loadV035KoreanVoiceEnv(cwd, options.env);
  const voiceProvider = evaluateV035KoreanVoiceProviderReadiness(env);
  const plans = V048_CHANNEL_SPECS.map((spec) => buildChannelSpecificScriptPlan(spec.channel_key));
  const threeChannelBinding = evaluateThreeChannelBinding(plans);

  if (!handoff.all_images_exist) {
    return writeAndReturn(buildResult({
      cwd,
      finalStatus: "BLOCKED_V046_GENERATED_IMAGES_MISSING",
      v047Failure,
      handoff,
      voiceProvider,
      threeChannelBinding,
      channels: []
    }));
  }

  if (!handoff.quality_gate_pass) {
    return writeAndReturn(buildResult({
      cwd,
      finalStatus: "BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
      v047Failure,
      handoff,
      voiceProvider,
      threeChannelBinding,
      channels: []
    }));
  }

  if (!voiceProvider.v035_melotts_provider_ready) {
    return writeAndReturn(buildResult({
      cwd,
      finalStatus: "BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE",
      v047Failure,
      handoff,
      voiceProvider,
      threeChannelBinding,
      channels: []
    }));
  }

  if (!reusable.reusable || threeChannelBinding.binding_blocker) {
    return writeAndReturn(buildResult({
      cwd,
      finalStatus: "BLOCKED_V048_CHANNEL_SPECIFIC_SCRIPT_SETTINGS",
      v047Failure,
      handoff,
      voiceProvider,
      threeChannelBinding,
      channels: []
    }));
  }

  const channels = [];
  for (const plan of plans) {
    const sourceSceneDir = await prepareV035SceneSourceFromV046AgentImages({ cwd, plan });
    const channelResult = await runV035SuccessPipelineForChannel(plan, {
      ...options,
      cwd,
      env,
      reviewVersion: "v048",
      sourceSceneDir
    });
    const binding = evaluateChannelBinding(plan);
    const settings = buildChannelUploadSettingsPreview(plan.channel_key);
    await writeV048ChannelArtifacts({
      cwd,
      outputRoot: path.join(outputRoot, plan.channel_key),
      plan,
      binding,
      settings,
      channelResult
    });
    channels.push({
      ...channelResult,
      binding,
      upload_settings: settings
    });
  }

  const allReady = channels.every((channel) => channel.FINAL_STATUS === "SUCCESS_V045_CHANNEL_V035_PIPELINE_READY") &&
    channels.every((channel) => channel.binding.binding_blocker === null);
  return writeAndReturn(buildResult({
    cwd,
    finalStatus: allReady
      ? "SUCCESS_V048_CHANNEL_SPECIFIC_REVIEW_READY"
      : "BLOCKED_V048_CHANNEL_SPECIFIC_SCRIPT_SETTINGS",
    v047Failure,
    handoff,
    voiceProvider,
    threeChannelBinding,
    channels
  }));

  async function writeAndReturn<T extends ReturnType<typeof buildResult>>(result: T) {
    await writeJson(path.join(outputRoot, "review-summary.json"), result);
    return result;
  }
}

async function prepareV035SceneSourceFromV046AgentImages(input: {
  cwd: string;
  plan: V035ChannelPlan;
}) {
  const sourceRoot = path.join(input.cwd, "commerce-assets", "review", "v046", "generated-scenes", input.plan.channel_key);
  const mappedRoot = path.join(input.cwd, "commerce-assets", "review", "v048", "_v035-source", input.plan.channel_key);
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

async function writeV048ChannelArtifacts(input: {
  cwd: string;
  outputRoot: string;
  plan: V035ChannelPlan;
  binding: ChannelBindingReport;
  settings: ChannelUploadSettingsPreview;
  channelResult: Awaited<ReturnType<typeof runV035SuccessPipelineForChannel>>;
}) {
  await writeJson(path.join(input.outputRoot, "channel-binding-report.json"), input.binding);
  await writeJson(path.join(input.outputRoot, "hook-script-preview.json"), {
    version: "v048",
    channel_key: input.plan.channel_key,
    product_name: input.plan.product_name,
    hook: input.plan.hook,
    script: input.plan.script,
    scene_prompt_plan: input.plan.scene_prompt_plan,
    core_anchors: input.plan.core_anchors,
    channel_script_binding_pass: input.binding.channel_script_binding_pass,
    raw_affiliate_url_printed: false
  });
  await writeJson(path.join(input.outputRoot, "comment-preview.json"), {
    version: "v048",
    channel_key: input.plan.channel_key,
    comment_first_line: input.plan.comment_first_line,
    comment_link_present: true,
    comment_contains_affiliate_link: true,
    coupang_disclosure_present: true,
    comment_contains_coupang_disclosure: true,
    affiliate_url: "<AFFILIATE_URL_PRESENT>",
    raw_affiliate_url_printed: false
  });
  await fs.writeFile(path.join(input.outputRoot, "youtube-metadata-preview.html"), buildMetadataPreviewHtml(input.plan), "utf8");
  await writeJson(path.join(input.outputRoot, "youtube-upload-settings-preview.json"), input.settings);
  await writeJson(path.join(input.outputRoot, "human-review-decision.json"), {
    version: "v048",
    channel_key: input.plan.channel_key,
    human_review_status: "PENDING_HUMAN_REVIEW",
    metadata_review_status: "PENDING_METADATA_REVIEW",
    upload_settings_review_status: "PENDING_UPLOAD_SETTINGS_REVIEW",
    safe_to_upload: false,
    requires_fresh_upload_approval: true
  });
  await writeJson(path.join(input.outputRoot, "review-summary.json"), {
    ...input.channelResult,
    version: "v048",
    channel_key: input.plan.channel_key,
    channel_binding_report: path.join(input.outputRoot, "channel-binding-report.json"),
    youtube_upload_settings_preview: path.join(input.outputRoot, "youtube-upload-settings-preview.json"),
    upload_settings_review_status: "PENDING_UPLOAD_SETTINGS_REVIEW",
    SAFE_TO_UPLOAD: false
  });
  await fs.writeFile(path.join(input.outputRoot, "review-console.html"), buildReviewConsoleHtml(input), "utf8");
}

function buildResult(input: {
  cwd: string;
  finalStatus: V048FinalStatus;
  v047Failure: Awaited<ReturnType<typeof recordV047ChannelBindingFailure>>;
  handoff: Awaited<ReturnType<typeof buildV046AgentImageSkillHandoffManifest>>;
  voiceProvider: ReturnType<typeof evaluateV035KoreanVoiceProviderReadiness>;
  threeChannelBinding: ReturnType<typeof evaluateThreeChannelBinding>;
  channels: Array<Awaited<ReturnType<typeof runV035SuccessPipelineForChannel>> & {
    binding: ChannelBindingReport;
    upload_settings: ChannelUploadSettingsPreview;
  }>;
}) {
  const byKey = (key: ChannelKey) => input.channels.find((channel) => channel.channel_key === key);
  const ready = input.finalStatus === "SUCCESS_V048_CHANNEL_SPECIFIC_REVIEW_READY";
  const uploadSettings = input.channels.map((channel) => channel.upload_settings);
  const audioBlockers = input.channels
    .map((channel) => resultValue(channel.v035_result, "audio_blocker"))
    .filter((value) => value);
  const channelCorePass = (key: ChannelKey) => {
    const channel = byKey(key);
    return Boolean(channel?.binding.channel_asr_anchor_binding_pass && resultFlag(channel.v035_result, "core_anchor_recognition_pass"));
  };

  return {
    version: "v048",
    FINAL_STATUS: input.finalStatus,
    V048_REVIEW_PACKETS_READY: ready,
    SAFE_TO_UPLOAD: false,
    output_root: path.join(input.cwd, "commerce-assets", "review", "v048"),
    v047_review_status: input.v047Failure.human_review_status,
    v047_fail_reasons: input.v047Failure.fail_reasons,
    pr166_merge_allowed: false,
    source_image_version: "v046",
    generated_image_count: input.handoff.generated_image_count,
    v035_melotts_voice_provider_restored: input.voiceProvider.v035_melotts_provider_ready,
    father_jobs_binding_pass: byKey("father_jobs")?.binding.binding_blocker === null,
    neoman_moleulgeol_binding_pass: byKey("neoman_moleulgeol")?.binding.binding_blocker === null,
    lets_buy_binding_pass: byKey("lets_buy")?.binding.binding_blocker === null,
    cross_channel_text_contamination: input.threeChannelBinding.cross_channel_text_contamination,
    same_script_reused: input.threeChannelBinding.same_script_reused,
    binding_blocker: input.threeChannelBinding.binding_blocker,
    father_jobs_video_generated: byKey("father_jobs")?.video_generated ?? false,
    father_jobs_review_console: byKey("father_jobs")?.review_console ?? null,
    neoman_moleulgeol_video_generated: byKey("neoman_moleulgeol")?.video_generated ?? false,
    neoman_moleulgeol_review_console: byKey("neoman_moleulgeol")?.review_console ?? null,
    lets_buy_video_generated: byKey("lets_buy")?.video_generated ?? false,
    lets_buy_review_console: byKey("lets_buy")?.review_console ?? null,
    father_jobs_core_anchor_pass: channelCorePass("father_jobs"),
    neoman_moleulgeol_core_anchor_pass: channelCorePass("neoman_moleulgeol"),
    lets_buy_core_anchor_pass: channelCorePass("lets_buy"),
    audio_blocker: audioBlockers[0] ?? null,
    metadata_previews_generated: input.channels.length === 3,
    comment_previews_generated: input.channels.length === 3,
    comment_link_present_all: input.channels.length === 3 && input.channels.every((channel) => channel.upload_settings.comment_contains_affiliate_link),
    affiliate_disclosure_present_all: input.channels.length === 3 && input.channels.every((channel) => channel.upload_settings.comment_contains_coupang_disclosure),
    raw_affiliate_url_printed: false,
    mojibake_present: false,
    placeholder_url_present: false,
    upload_settings_previews_generated: input.channels.length === 3,
    contains_paid_promotion_all: uploadSettings.length === 3 && uploadSettings.every((settings) => settings.contains_paid_promotion),
    paid_promotion_setting_verified: false,
    manual_paid_promotion_check_required: uploadSettings.length === 3 && uploadSettings.every((settings) => settings.manual_paid_promotion_check_required),
    made_for_kids_false_all: uploadSettings.length === 3 && uploadSettings.every((settings) => settings.made_for_kids === false),
    upload_settings_blocker: uploadSettings.some((settings) => settings.blocker === "MANUAL_PAID_PROMOTION_CHECK_REQUIRED")
      ? "MANUAL_PAID_PROMOTION_CHECK_REQUIRED"
      : null,
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
    channels: input.channels
  };
}

function buildMetadataPreviewHtml(plan: V035ChannelPlan) {
  const description = [
    "상품 링크는 댓글에서 확인하세요.",
    "",
    plan.script,
    "",
    V034_COUPANG_DISCLOSURE
  ].join("\n");
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>${escapeHtml(plan.metadata_title)}</title></head>
<body>
  <h1>${escapeHtml(plan.metadata_title)}</h1>
  <pre>${escapeHtml(description)}</pre>
  <p>raw_affiliate_url_printed=false</p>
</body>
</html>
`;
}

function buildReviewConsoleHtml(input: {
  outputRoot: string;
  plan: V035ChannelPlan;
  binding: ChannelBindingReport;
  settings: ChannelUploadSettingsPreview;
}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v048 ${escapeHtml(input.plan.channel_key)} review</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:24px;color:#111827;background:#f8fafc}
    video,img{max-width:420px;border:1px solid #cbd5e1;background:white}
    pre{white-space:pre-wrap;background:white;border:1px solid #e5e7eb;padding:12px}
  </style>
</head>
<body>
  <h1>v048 ${escapeHtml(input.plan.product_name)}</h1>
  <section><h2>1. local-review-video.mp4</h2><video src="local-review-video.mp4" controls playsinline></video></section>
  <section><h2>2. channel binding report</h2><pre>${escapeHtml(JSON.stringify(input.binding, null, 2))}</pre></section>
  <section><h2>3. script preview</h2><pre>${escapeHtml(input.plan.script)}</pre></section>
  <section><h2>4. scene manifest</h2><pre>${escapeHtml(JSON.stringify(input.plan.scene_prompt_plan, null, 2))}</pre></section>
  <section><h2>5. generated image contact sheet</h2><img src="generated-image-contact-sheet.jpg" alt="generated image contact sheet" /></section>
  <section><h2>6. actual frame contact sheet</h2><img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" /></section>
  <section><h2>7. ASR transcript</h2><pre data-src="asr-transcript.txt">asr-transcript.txt</pre></section>
  <section><h2>8. metadata preview</h2><iframe src="youtube-metadata-preview.html"></iframe></section>
  <section><h2>9. comment preview</h2><pre>${escapeHtml(planCommentPreview(input.plan))}</pre></section>
  <section><h2>10. upload settings preview</h2><pre>${escapeHtml(JSON.stringify(input.settings, null, 2))}</pre></section>
  <section><h2>11. paid promotion setting status</h2><p>${escapeHtml(input.settings.paid_promotion_setting_verification)}</p></section>
  <section><h2>12. human review decision</h2><pre>PENDING_HUMAN_REVIEW</pre></section>
</body>
</html>
`;
}

function planCommentPreview(plan: V035ChannelPlan) {
  return [
    plan.comment_first_line,
    "상품 링크: <AFFILIATE_URL_PRESENT>",
    V034_COUPANG_DISCLOSURE
  ].join("\n");
}

function resultFlag(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)[key] === true);
}

function resultValue(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
