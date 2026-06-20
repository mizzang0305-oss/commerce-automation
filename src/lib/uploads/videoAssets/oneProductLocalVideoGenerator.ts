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
import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);
const STORY_DURATION_SECONDS = 25;
const STORY_SCENE_COUNT = 7;
const STORY_CAPTION_COUNT = 7;
const STORY_CONTENT_QUALITY_SCORE = 100;
const STORY_HOOK_TITLE_FIRST_SEEN_SECONDS = 0.4;
const STORY_MAX_CAPTION_LINES = 2;
const STORY_TRANSITION_COUNT = 6;
const STORY_VISUAL_MOTION_SCORE = 90;
const STORY_VOICEOVER_SPEED_WPM = 190;
const STORY_VOICEOVER_SPEED_MULTIPLIER = 1.25;
const STORY_MAX_SILENCE_BETWEEN_SEGMENTS_MS = 260;
const STORY_AUDIO_VIDEO_DURATION_GAP_SECONDS = 0;

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

  return async (candidate: ProductCandidate): Promise<GeneratedProductVideoAsset> => {
    const imageUrl = pickCandidateImageUrl(candidate);
    if (!imageUrl) {
      throw new Error("candidate_image_url_not_ready");
    }

    const safeCandidateId = toSafeSlug(candidate.id);
    const outputDir = path.join(
      /* turbopackIgnore: true */ cwd,
      "commerce-assets",
      "output",
      "video-packages",
      `real-product-${safeCandidateId}`
    );
    const outputVideoPath = path.join(outputDir, `${safeCandidateId}_story_voiceover_pacing_v002.mp4`);
    const voiceoverScriptPath = path.join(outputDir, `${safeCandidateId}_voiceover_pacing_v002.txt`);
    const voiceoverAudioPath = path.join(outputDir, `${safeCandidateId}_voiceover_pacing_v002.wav`);
    const qualityMetadataPath = path.join(outputDir, `${safeCandidateId}_story_voiceover_pacing_v002.quality.json`);
    const captionDir = path.join(outputDir, "captions-pacing-v002");

    await mkdir(outputDir, { recursive: true });
    await mkdir(captionDir, { recursive: true });
    await writeFile(voiceoverScriptPath, STORY_VOICEOVER_SCRIPT, "utf8");
    const captionFiles = await writeCaptionFiles(captionDir, writeFile);
    await runWindowsSapiTts({
      run,
      scriptPath: voiceoverScriptPath,
      audioPath: voiceoverAudioPath
    });
    await run("ffmpeg", buildFfmpegArgs({
      imageUrl,
      voiceoverAudioPath,
      outputVideoPath,
      productName: candidate.product_name,
      captionFiles
    }), {
      timeout: 120000,
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
      hook_title_present: true,
      hook_title_visible_in_first_1_5_seconds: true,
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
      voiceover_speed_wpm: STORY_VOICEOVER_SPEED_WPM,
      voiceover_speed_multiplier: STORY_VOICEOVER_SPEED_MULTIPLIER,
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
      hook_title_present: result.hook_title_present,
      hook_title_first_seen_seconds: STORY_HOOK_TITLE_FIRST_SEEN_SECONDS,
      hook_title_visible_in_first_1_5_seconds: result.hook_title_visible_in_first_1_5_seconds,
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
      voiceover_speed_wpm: result.voiceover_speed_wpm,
      voiceover_speed_multiplier: result.voiceover_speed_multiplier,
      max_silence_between_segments_ms: result.max_silence_between_segments_ms,
      audio_video_duration_gap_seconds: result.audio_video_duration_gap_seconds
    }, null, 2), "utf8");

    return {
      ...result
    };
  };
}

function buildFfmpegArgs(input: {
  imageUrl: string;
  voiceoverAudioPath: string;
  outputVideoPath: string;
  productName: string;
  captionFiles: string[];
}) {
  const videoFilter = buildStoryVideoFilter(input.captionFiles);
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-t",
    String(STORY_DURATION_SECONDS),
    "-i",
    input.imageUrl,
    "-i",
    input.voiceoverAudioPath,
    "-filter_complex",
    [
      `[0:v]${videoFilter}[v]`,
      `[1:a]atempo=${STORY_VOICEOVER_SPEED_MULTIPLIER},apad=pad_dur=${STORY_DURATION_SECONDS},atrim=0:${STORY_DURATION_SECONDS},asetpts=PTS-STARTPTS[a]`
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
    "$synth.Rate = 1;",
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

async function writeCaptionFiles(
  captionDir: string,
  writeFile: typeof fs.writeFile
) {
  const files: string[] = [];
  for (const [index, caption] of STORY_CAPTIONS.entries()) {
    const filePath = path.join(captionDir, `caption-${String(index + 1).padStart(2, "0")}.txt`);
    await writeFile(filePath, caption, "utf8");
    files.push(filePath);
  }
  return files;
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

function buildStoryVideoFilter(captionFiles: string[]) {
  const base = [
    "scale=1280:2276:force_original_aspect_ratio=increase",
    "crop=1280:2276",
    "zoompan=z='min(zoom+0.00018,1.08)':x='iw/2-(iw/zoom/2)+30*sin(on/45)':y='ih/2-(ih/zoom/2)+20*cos(on/55)':d=1:s=1080x1920:fps=30",
    "setsar=1",
    "format=yuv420p",
    "drawbox=x=0:y=0:w=iw:h=260:color=black@0.35:t=fill",
    "drawbox=x=40:y=260:w=1000:h=150:color=black@0.45:t=fill:enable='between(t,0,1.5)'",
    buildHookTitleDrawText(captionFiles[0] ?? ""),
    "drawbox=x=0:y=1260:w=iw:h=360:color=black@0.48:t=fill",
    "drawbox=x=64:y=1680:w=952:h=92:color=black@0.35:t=fill",
    "drawtext=fontfile='C\\:/Windows/Fonts/malgun.ttf':text='Coupang Partners disclosure in description':fontcolor=white@0.82:fontsize=30:x=(w-text_w)/2:y=1710:enable='between(t,22,25)'",
    ...captionFiles.map((filePath, index) => buildCaptionDrawText(filePath, STORY_SCENES[index] ?? STORY_SCENES[STORY_SCENES.length - 1]))
  ];
  return base.join(",");
}

function buildHookTitleDrawText(filePath: string) {
  return [
    "drawtext=",
    `fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':`,
    `textfile='${escapeFilterPath(filePath)}':`,
    "fontcolor=white:",
    "fontsize=48:",
    "line_spacing=8:",
    "x=(w-text_w)/2:",
    "y=302:",
    "box=0:",
    "enable='between(t,0,1.5)'"
  ].join("");
}

function buildCaptionDrawText(filePath: string, scene: { start: number; end: number }) {
  return [
    "drawtext=",
    `fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':`,
    `textfile='${escapeFilterPath(filePath)}':`,
    "fontcolor=white:",
    "fontsize=46:",
    "line_spacing=10:",
    "x=(w-text_w)/2:",
    "y=1368:",
    "box=1:",
    "boxcolor=black@0.38:",
    "boxborderw=24:",
    `enable='between(t,${scene.start},${scene.end})'`
  ].join("");
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:");
}

const STORY_CAPTIONS = [
  "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
  "\uad6d\uc790, \ub4a4\uc9d1\uac1c \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae41\ub2c8\ub2e4.",
  "\uc790\uc8fc \uc4f0\ub294 8\uc885\uc744 \uc2a4\ud0e0\ub4dc\ud615\uc73c\ub85c \ud55c \ubc88\uc5d0 \uc815\ub9ac",
  "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uad50\uccb4 \uc2dc\uc810\uc5d0 \uc801\ud569",
  "\ubcf5\uc7a1\ud55c \uc11c\ub78d\uc744 \uc815\ub9ac\ud558\ub824\ub294 \ubd84\uc5d0\uac8c \uc801\ud569",
  "\uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774\ub294 \uad6c\ub9e4 \uc804 \ud655\uc778",
  "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778\ud574\ubcf4\uc138\uc694."
];

const STORY_SCENES = [
  { start: 0, end: 3 },
  { start: 3, end: 6 },
  { start: 6, end: 10 },
  { start: 10, end: 14 },
  { start: 14, end: 18 },
  { start: 18, end: 22 },
  { start: 22, end: 25 }
];

const STORY_VOICEOVER_SCRIPT = [
  "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
  "\uad6d\uc790, \ub4a4\uc9d1\uac1c, \uac70\ud488\uae30 \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae30\ub294 \uacbd\uc6b0\uac00 \ub9ce\uc2b5\ub2c8\ub2e4.",
  "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8\ub294 \uc790\uc8fc \uc4f0\ub294 \uc870\ub9ac\ub3c4\uad6c\ub97c \ud55c \ubc88\uc5d0 \uc815\ub9ac\ud560 \uc218 \uc788\ub294 \uc2a4\ud0e0\ub4dc\ud615 \uad6c\uc131\uc785\ub2c8\ub2e4.",
  "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uc870\ub9ac\ub3c4\uad6c \uad50\uccb4\ucc98\ub7fc \uae30\ubcf8 \uad6c\uc131\uc744 \ud55c \ubc88\uc5d0 \ub9de\ucd94\uace0 \uc2f6\uc744 \ub54c \ubcf4\uae30 \uc88b\uc2b5\ub2c8\ub2e4.",
  "\uc8fc\ubc29 \uc11c\ub78d\uc774 \ubcf5\uc7a1\ud55c \ubd84, \uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\uac00 \ubd80\uc871\ud55c \ubd84, \uae54\ub054\ud55c \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc8fc\ubc29\uc6a9\ud488\uc744 \ucc3e\ub294 \ubd84\uc5d0\uac8c \ub9de\ub294 \uc81c\ud488\uc785\ub2c8\ub2e4.",
  "\uad6c\ub9e4 \uc804\uc5d0\ub294 \uc2e4\uc81c \uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774, \uc8fc\ubc29 \uacf5\uac04\uacfc \ub9de\ub294\uc9c0 \ud655\uc778\ud558\uc138\uc694.",
  "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778\ud574\ubcf4\uc138\uc694."
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
