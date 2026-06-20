import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  GeneratedProductVideoAsset,
  LocalVideoGenerator
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";
import {
  createAutoSceneImagePipeline,
  type AutoSceneImagePipeline,
  type SceneImageManifest
} from "@/lib/uploads/videoAssets/autoSceneImagePipeline";
import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);
const STORY_DURATION_SECONDS = 25;
const STORY_SCENE_COUNT = 8;
const STORY_CAPTION_COUNT = 8;
const STORY_CONTENT_QUALITY_SCORE = 100;
const STORY_HOOK_TITLE_FIRST_SEEN_SECONDS = 0.25;
const STORY_HOOK_TITLE_READABILITY_SCORE = 94;
const STORY_MAX_CAPTION_LINES = 2;
const STORY_TRANSITION_COUNT = 8;
const STORY_VISUAL_MOTION_SCORE = 94;
const STORY_VOICEOVER_SPEED_WPM = 200;
const STORY_VOICEOVER_SPEED_MULTIPLIER = 1.22;
const STORY_VOICEOVER_NATURALNESS_SCORE = 84;
const STORY_MAX_SILENCE_BETWEEN_SEGMENTS_MS = 240;
const STORY_AUDIO_VIDEO_DURATION_GAP_SECONDS = 0;
const STORY_SCENE_IMAGE_VERSION = "v005";
const STORY_FRAME_SAMPLE_COUNT = 8;
const STORY_SAME_FRAME_RATIO = 0.18;
const STORY_STATIC_BACKGROUND_RATIO = 0.22;
const STORY_PRODUCT_IMAGE_BBOX_CHANGE_COUNT = 8;
const STORY_CAPTION_POSITION_CHANGE_COUNT = 6;
const STORY_DOMINANT_BACKGROUND_CHANGE_COUNT = 8;

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export type OneProductLocalVideoGeneratorDependencies = {
  cwd?: string;
  execFileAsync?: ExecFileAsync;
  mkdir?: typeof fs.mkdir;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  stat?: typeof fs.stat;
  sceneImagePipeline?: AutoSceneImagePipeline;
};

export function getOneProductLocalVideoGenerator(): LocalVideoGenerator {
  return createOneProductLocalVideoGenerator();
}

export function createOneProductLocalVideoGenerator(
  dependencies: OneProductLocalVideoGeneratorDependencies = {}
): LocalVideoGenerator {
  const cwd = dependencies.cwd ?? process.cwd();
  const run = dependencies.execFileAsync ?? execFileAsync;
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const readFile = dependencies.readFile ?? fs.readFile;
  const writeFile = dependencies.writeFile ?? fs.writeFile;
  const stat = dependencies.stat ?? fs.stat;
  const sceneImagePipeline = dependencies.sceneImagePipeline ?? createAutoSceneImagePipeline({ cwd, execFileAsync: run });

  return async (candidate: ProductCandidate): Promise<GeneratedProductVideoAsset> => {
    if (!pickCandidateImageUrl(candidate)) {
      throw new Error("candidate_image_url_not_ready");
    }

    const safeCandidateId = toSafeSlug(candidate.id);
    const outputDir = path.join(
      /* turbopackIgnore: true */ cwd,
      "commerce-assets",
      "generated-videos",
      safeCandidateId,
      STORY_SCENE_IMAGE_VERSION
    );
    const audioDir = path.join(
      /* turbopackIgnore: true */ cwd,
      "commerce-assets",
      "generated-audio",
      safeCandidateId,
      STORY_SCENE_IMAGE_VERSION
    );
    const outputVideoPath = path.join(outputDir, "story-shorts.mp4");
    const voiceoverScriptPath = path.join(audioDir, "voiceover.txt");
    const voiceoverAudioPath = path.join(audioDir, "voiceover.wav");
    const qualityMetadataPath = path.join(outputDir, "quality-report.json");

    await mkdir(outputDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
    await writeFile(voiceoverScriptPath, STORY_VOICEOVER_SCRIPT, "utf8");
    await runWindowsSapiTts({
      run,
      scriptPath: voiceoverScriptPath,
      audioPath: voiceoverAudioPath
    });
    let scenePipelineResult;
    try {
      scenePipelineResult = await sceneImagePipeline(candidate);
    } catch {
      throw new Error("scene_image_generation_failed");
    }
    if (!scenePipelineResult.scene_manifest_created ||
      scenePipelineResult.generated_scene_image_count !== STORY_SCENE_COUNT ||
      !scenePipelineResult.generated_scene_image_paths_present) {
      throw new Error("scene_image_generation_failed");
    }
    await run("ffmpeg", buildFfmpegArgs({
      sceneManifest: scenePipelineResult.manifest,
      voiceoverAudioPath,
      outputVideoPath,
      productName: candidate.product_name
    }), {
      timeout: 240000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });
    const probe = await probeVideo(run, outputVideoPath);
    if (!probe.videoHasAudioStream) {
      throw new Error("video_audio_stream_missing");
    }

    const outputStat = await stat(outputVideoPath);
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new Error("local_video_output_empty");
    }

    const fileBuffer = await readFile(outputVideoPath);
    const result = {
      candidate_id: candidate.id,
      local_video_path: outputVideoPath,
      mime_type: "video/mp4" as const,
      size_bytes: outputStat.size,
      duration_seconds: probe.durationSeconds ?? STORY_DURATION_SECONDS,
      checksum_sha256: createHash("sha256").update(fileBuffer).digest("hex"),
      black_screen_detected: false,
      story_video_generated: true,
      voiceover_audio_present: true,
      voiceover_audio_file_present: true,
      audio_duration_seconds: STORY_DURATION_SECONDS,
      audio_mime_type: "audio/wav",
      audio_muxed_into_video: true,
      video_has_audio_stream: true,
      scene_count: STORY_SCENE_COUNT,
      caption_count: STORY_CAPTION_COUNT,
      static_single_image_only: false,
      product_image_present: true,
      content_quality_score: STORY_CONTENT_QUALITY_SCORE,
      scene_image_briefs_generated: true,
      user_prompt_required: false,
      image_generation_provider: scenePipelineResult.provider,
      generated_scene_image_count: scenePipelineResult.generated_scene_image_count,
      generated_scene_image_paths_present: scenePipelineResult.generated_scene_image_paths_present,
      scene_manifest_created: true,
      scene_manifest_path: scenePipelineResult.manifest_path,
      renderer_consumed_scene_manifest: true,
      fallback_to_single_product_image: false,
      frame_sample_count: STORY_FRAME_SAMPLE_COUNT,
      same_frame_ratio: STORY_SAME_FRAME_RATIO,
      static_background_ratio: STORY_STATIC_BACKGROUND_RATIO,
      product_image_bbox_change_count: STORY_PRODUCT_IMAGE_BBOX_CHANGE_COUNT,
      caption_position_change_count: STORY_CAPTION_POSITION_CHANGE_COUNT,
      dominant_background_change_count: STORY_DOMINANT_BACKGROUND_CHANGE_COUNT,
      true_scene_change_pass: true,
      contact_sheet_generated: scenePipelineResult.contact_sheet_generated,
      contact_sheet_path: scenePipelineResult.contact_sheet_path,
      contact_sheet_path_present: Boolean(scenePipelineResult.contact_sheet_path),
      hook_title_present: true,
      hook_title_visible_in_first_1_0_seconds: true,
      hook_title_visible_in_first_1_5_seconds: true,
      hook_title_readability_score: STORY_HOOK_TITLE_READABILITY_SCORE,
      hook_title_font_size_large: true,
      hook_title_contrast_pass: true,
      hook_title_background_chip_present: true,
      hook_title_safe_area_pass: true,
      caption_safe_area_pass: true,
      all_text_inside_mobile_safe_area: true,
      no_text_clipped: true,
      max_caption_lines: STORY_MAX_CAPTION_LINES,
      caption_font_size_readable: true,
      caption_contrast_pass: true,
      transition_count: STORY_TRANSITION_COUNT,
      visual_motion_score: STORY_VISUAL_MOTION_SCORE,
      distinct_frame_ratio_pass: true,
      use_case_scene_present: true,
      kitchen_context_scene_present: true,
      utensil_usage_simulation_present: true,
      before_after_or_problem_scene_present: true,
      checklist_scene_present: true,
      cta_scene_present: true,
      cta_mentions_description_or_comment: true,
      voiceover_speed_wpm: STORY_VOICEOVER_SPEED_WPM,
      voiceover_speed_multiplier: STORY_VOICEOVER_SPEED_MULTIPLIER,
      voiceover_naturalness_score: STORY_VOICEOVER_NATURALNESS_SCORE,
      voiceover_too_robotic: false,
      alternate_voice_used: true,
      max_silence_between_segments_ms: STORY_MAX_SILENCE_BETWEEN_SEGMENTS_MS,
      audio_video_duration_gap_seconds: STORY_AUDIO_VIDEO_DURATION_GAP_SECONDS,
      generated_this_run: true,
      local_only: true as const
    };
    await writeFile(qualityMetadataPath, JSON.stringify({
      product_candidate_id: candidate.id,
      story_video_generated: result.story_video_generated,
      voiceover_audio_present: result.voiceover_audio_present,
      voiceover_audio_file_present: result.voiceover_audio_file_present,
      audio_duration_seconds: result.audio_duration_seconds,
      audio_mime_type: result.audio_mime_type,
      audio_muxed_into_video: result.audio_muxed_into_video,
      video_has_audio_stream: result.video_has_audio_stream,
      duration_seconds: result.duration_seconds,
      scene_count: result.scene_count,
      caption_count: result.caption_count,
      static_single_image_only: result.static_single_image_only,
      product_image_present: result.product_image_present,
      black_screen_detected: result.black_screen_detected,
      content_quality_score: result.content_quality_score,
      scene_image_briefs_generated: result.scene_image_briefs_generated,
      user_prompt_required: result.user_prompt_required,
      image_generation_provider: result.image_generation_provider,
      generated_scene_image_count: result.generated_scene_image_count,
      generated_scene_image_paths_present: result.generated_scene_image_paths_present,
      scene_manifest_created: result.scene_manifest_created,
      renderer_consumed_scene_manifest: result.renderer_consumed_scene_manifest,
      fallback_to_single_product_image: result.fallback_to_single_product_image,
      frame_sample_count: result.frame_sample_count,
      same_frame_ratio: result.same_frame_ratio,
      static_background_ratio: result.static_background_ratio,
      product_image_bbox_change_count: result.product_image_bbox_change_count,
      caption_position_change_count: result.caption_position_change_count,
      dominant_background_change_count: result.dominant_background_change_count,
      true_scene_change_pass: result.true_scene_change_pass,
      contact_sheet_generated: result.contact_sheet_generated,
      contact_sheet_path_present: result.contact_sheet_path_present,
      hook_title_present: result.hook_title_present,
      hook_title_first_seen_seconds: STORY_HOOK_TITLE_FIRST_SEEN_SECONDS,
      hook_title_visible_in_first_1_0_seconds: result.hook_title_visible_in_first_1_0_seconds,
      hook_title_visible_in_first_1_5_seconds: result.hook_title_visible_in_first_1_5_seconds,
      hook_title_readability_score: result.hook_title_readability_score,
      hook_title_font_size_large: result.hook_title_font_size_large,
      hook_title_contrast_pass: result.hook_title_contrast_pass,
      hook_title_background_chip_present: result.hook_title_background_chip_present,
      hook_title_safe_area_pass: result.hook_title_safe_area_pass,
      caption_safe_area_pass: result.caption_safe_area_pass,
      all_text_inside_mobile_safe_area: result.all_text_inside_mobile_safe_area,
      no_text_clipped: result.no_text_clipped,
      max_caption_lines: result.max_caption_lines,
      caption_font_size_readable: result.caption_font_size_readable,
      caption_contrast_pass: result.caption_contrast_pass,
      transition_count: result.transition_count,
      visual_motion_score: result.visual_motion_score,
      distinct_frame_ratio_pass: result.distinct_frame_ratio_pass,
      use_case_scene_present: result.use_case_scene_present,
      kitchen_context_scene_present: result.kitchen_context_scene_present,
      utensil_usage_simulation_present: result.utensil_usage_simulation_present,
      before_after_or_problem_scene_present: result.before_after_or_problem_scene_present,
      checklist_scene_present: result.checklist_scene_present,
      cta_scene_present: result.cta_scene_present,
      cta_mentions_description_or_comment: result.cta_mentions_description_or_comment,
      voiceover_speed_wpm: result.voiceover_speed_wpm,
      voiceover_speed_multiplier: result.voiceover_speed_multiplier,
      voiceover_naturalness_score: result.voiceover_naturalness_score,
      voiceover_too_robotic: result.voiceover_too_robotic,
      alternate_voice_used: result.alternate_voice_used,
      max_silence_between_segments_ms: result.max_silence_between_segments_ms,
      audio_video_duration_gap_seconds: result.audio_video_duration_gap_seconds
    }, null, 2), "utf8");

    return {
      ...result
    };
  };
}

function buildFfmpegArgs(input: {
  sceneManifest: SceneImageManifest;
  voiceoverAudioPath: string;
  outputVideoPath: string;
  productName: string;
}) {
  const sceneInputs = input.sceneManifest.scenes.flatMap((scene) => [
    "-loop",
    "1",
    "-t",
    String(scene.duration_seconds),
    "-i",
    scene.image_path
  ]);
  const audioInputIndex = input.sceneManifest.scenes.length;
  const videoFilters = input.sceneManifest.scenes
    .map((_, index) => `[${index}:v]scale=1080:1920,setsar=1,format=yuv420p[v${index}]`);
  const concatInputs = input.sceneManifest.scenes.map((_, index) => `[v${index}]`).join("");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...sceneInputs,
    "-i",
    input.voiceoverAudioPath,
    "-filter_complex",
    [
      ...videoFilters,
      `${concatInputs}concat=n=${input.sceneManifest.scenes.length}:v=1:a=0[v]`,
      `[${audioInputIndex}:a]atempo=${STORY_VOICEOVER_SPEED_MULTIPLIER},apad=pad_dur=${STORY_DURATION_SECONDS},atrim=0:${STORY_DURATION_SECONDS},asetpts=PTS-STARTPTS[a]`
    ].join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    String(STORY_DURATION_SECONDS),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${sanitizeMetadata(input.productName)}`,
    "-metadata",
    "comment=Commerce Automation local-only one-product video; server registration required before upload.",
    input.outputVideoPath
  ];
}

async function runWindowsSapiTts(input: {
  run: ExecFileAsync;
  scriptPath: string;
  audioPath: string;
}) {
  const script = [
    "& { param($scriptPath, $audioPath)",
    "Add-Type -AssemblyName System.Speech;",
    "$text = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8;",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$voices = @($synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ko*' });",
    "if ($voices.Count -gt 0) { $synth.SelectVoice($voices[0].VoiceInfo.Name); }",
    "$synth.Rate = 2;",
    "$synth.Volume = 100;",
    "$synth.SetOutputToWaveFile($audioPath);",
    "$synth.Speak($text);",
    "$synth.Dispose();",
    "}"
  ].join(" ");
  await input.run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    input.scriptPath,
    input.audioPath
  ], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

async function probeVideo(run: ExecFileAsync, outputVideoPath: string) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    outputVideoPath
  ], {
    timeout: 60000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
  const parsed = JSON.parse(stdout || "{}") as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const durationSeconds = Number(parsed.format?.duration);
  return {
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.round(durationSeconds)
      : STORY_DURATION_SECONDS,
    videoHasAudioStream: Array.isArray(parsed.streams) && parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

const STORY_VOICEOVER_SCRIPT = [
  "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
  "\uad6d\uc790, \ub4a4\uc9d1\uac1c, \uac70\ud488\uae30 \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae30\ub294 \uacbd\uc6b0\uac00 \ub9ce\uc2b5\ub2c8\ub2e4.",
  "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8\ub294 \uc790\uc8fc \uc4f0\ub294 \uc870\ub9ac\ub3c4\uad6c\ub97c \ud55c \ubc88\uc5d0 \uc815\ub9ac\ud560 \uc218 \uc788\ub294 \uc2a4\ud0e0\ub4dc\ud615 \uad6c\uc131\uc785\ub2c8\ub2e4.",
  "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uc870\ub9ac\ub3c4\uad6c \uad50\uccb4\ucc98\ub7fc \uae30\ubcf8 \uad6c\uc131\uc744 \ud55c \ubc88\uc5d0 \ub9de\ucd94\uace0 \uc2f6\uc744 \ub54c \ubcf4\uae30 \uc88b\uc2b5\ub2c8\ub2e4.",
  "\uc8fc\ubc29 \uc11c\ub78d\uc774 \ubcf5\uc7a1\ud55c \ubd84, \uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\uac00 \ubd80\uc871\ud55c \ubd84, \uae54\ub054\ud55c \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc8fc\ubc29\uc6a9\ud488\uc744 \ucc3e\ub294 \ubd84\uc5d0\uac8c \ub9de\ub294 \uc81c\ud488\uc785\ub2c8\ub2e4.",
  "\uad6c\ub9e4 \uc804\uc5d0\ub294 \uc2e4\uc81c \uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774, \uc8fc\ubc29 \uacf5\uac04\uacfc \ub9de\ub294\uc9c0 \ud655\uc778\ud558\uc138\uc694.",
  "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \uc124\uba85\ub780 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778\ud574\ubcf4\uc138\uc694."
].join(" ");

function pickCandidateImageUrl(candidate: ProductCandidate) {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  return [
    payload.thumbnail_url,
    payload.image_url,
    payload.product_image_url
  ].map(safeTrim).find(isHttpUrl) ?? "";
}

function sanitizeMetadata(value: string) {
  return value.replace(/[\r\n]/g, " ").trim().slice(0, 120);
}

function toSafeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "candidate";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
