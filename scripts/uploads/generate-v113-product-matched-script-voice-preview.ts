import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  V113_CHANNEL_KEY,
  V113_PRODUCT_REFERENCE,
  V113_REQUIRED_PRODUCT_ANCHORS,
  V113_TARGET_VOICE_DURATION_SECONDS,
  V113_VOICE_SPEED_MULTIPLIER,
  V113_VOICE_STYLE,
  V113_VOICEOVER_SCRIPT,
  calculateV113TranscriptSimilarity,
  findV113RecognizedAnchors,
  validateV113ProductMatchedScript
} from "../../src/rendering/shorts/v113ProductMatchedScriptVoicePreview";
import {
  evaluateV035KoreanVoiceProviderReadiness,
  loadV035KoreanVoiceEnv
} from "../../src/uploads/multi-channel/v035KoreanVoiceProviderAdapter";
import {
  buildV113PinnedCommentPackage,
  sanitizeV113PinnedCommentPackage
} from "../../src/uploads/youtube/v113PinnedCommentPackage";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const outputRoot = path.join(cwd, "commerce-assets", "review", "v113", V113_CHANNEL_KEY);
const sourceVideoPath = path.join(cwd, "commerce-assets", "review", "v112", V113_CHANNEL_KEY, "preview-v112.mp4");
const scriptPath = path.join(outputRoot, "voiceover-script-v113.txt");
const voiceoverPath = path.join(outputRoot, "voiceover-v113.wav");
const previewPath = path.join(outputRoot, "preview-v113.mp4");
const firstFramePath = path.join(outputRoot, "first-frame-v113.jpg");
const summaryPath = path.join(outputRoot, "v113-preview-summary.json");
const pinnedCommentPath = path.join(outputRoot, "pinned-comment-v113.txt");
const productSourcePath = path.join(
  cwd,
  "commerce-assets",
  "review",
  "v057",
  V113_CHANNEL_KEY,
  "product-source-v057.local.json"
);
const TTS_TIMEOUT_MS = 600_000;
const ASR_TIMEOUT_MS = 900_000;

async function main() {
  assertInside(path.join(cwd, "commerce-assets", "review"), outputRoot);
  const scriptValidation = validateV113ProductMatchedScript();
  if (!scriptValidation.ready) throw new SafeBlocker(scriptValidation.blockers[0]);

  const env = await loadV035KoreanVoiceEnv(cwd);
  const voiceProvider = evaluateV035KoreanVoiceProviderReadiness(env);
  if (!voiceProvider.local_command_provider_ready) {
    throw new SafeBlocker(voiceProvider.blocker ?? "BLOCKED_V113_KOREAN_VOICE_PROVIDER_NOT_READY");
  }

  const sourceProbe = await probeMedia(sourceVideoPath);
  if (sourceProbe.width !== 1080 || sourceProbe.height !== 1920 || sourceProbe.durationSeconds < 20) {
    throw new SafeBlocker("BLOCKED_V113_V112_SOURCE_PREVIEW_INVALID");
  }

  const productSource = await readJsonRecord(productSourcePath);
  const pinnedCommentPackage = buildV113PinnedCommentPackage({
    channelKey: productSource.channelKey,
    targetChannelKey: productSource.targetChannelKey,
    selectedAffiliateUrl: productSource.selectedAffiliateUrl
  });
  if (!pinnedCommentPackage.ready) {
    throw new SafeBlocker(pinnedCommentPackage.blocker ?? "BLOCKED_V113_PINNED_COMMENT_TEMPLATE_INVALID");
  }

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(scriptPath, `${V113_VOICEOVER_SCRIPT}\n`, "utf8");
  await fs.writeFile(pinnedCommentPath, `${pinnedCommentPackage.commentText}\n`, "utf8");
  await generateLocalVoice({ env, scriptPath, voiceoverPath });
  await normalizeVoiceoverDuration(
    voiceoverPath,
    Math.min(V113_TARGET_VOICE_DURATION_SECONDS, sourceProbe.durationSeconds - 0.15)
  );

  const voiceProbe = await probeMedia(voiceoverPath);
  if (!voiceProbe.hasAudio || voiceProbe.durationSeconds < 12 || voiceProbe.durationSeconds > sourceProbe.durationSeconds + 0.1) {
    throw new SafeBlocker("BLOCKED_V113_VOICE_DURATION_INVALID");
  }

  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", sourceVideoPath,
    "-i", voiceoverPath,
    "-filter_complex", `[1:a]apad=pad_dur=${sourceProbe.durationSeconds.toFixed(3)}[voice]`,
    "-map", "0:v:0", "-map", "[voice]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
    "-t", sourceProbe.durationSeconds.toFixed(3),
    "-movflags", "+faststart",
    previewPath
  ]);
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", previewPath, "-frames:v", "1", "-q:v", "2", firstFramePath
  ]);

  const outputProbe = await probeMedia(previewPath);
  const asrProbe = await runLocalAsr({ env, videoPath: previewPath });
  const outputStat = await fs.stat(previewPath);
  const recognizedAnchors = findV113RecognizedAnchors(asrProbe.transcript);
  const similarity = calculateV113TranscriptSimilarity(V113_VOICEOVER_SCRIPT, asrProbe.transcript);
  const requiredAnchorCount = Math.min(5, V113_REQUIRED_PRODUCT_ANCHORS.length);
  const blockers = [
    outputProbe.width !== 1080 || outputProbe.height !== 1920
      ? "BLOCKED_V113_OUTPUT_DIMENSIONS"
      : null,
    Math.abs(outputProbe.durationSeconds - sourceProbe.durationSeconds) > 0.25
      ? "BLOCKED_V113_OUTPUT_DURATION"
      : null,
    !outputProbe.hasAudio ? "BLOCKED_V113_OUTPUT_AUDIO_MISSING" : null,
    outputStat.size < 1_000_000 ? "BLOCKED_V113_OUTPUT_FILE_TOO_SMALL" : null,
    !asrProbe.executed ? "BLOCKED_V113_LOCAL_ASR_NOT_READY" : null,
    similarity < 0.82 ? "BLOCKED_V113_ASR_SIMILARITY_LOW" : null,
    recognizedAnchors.length < requiredAnchorCount ? "BLOCKED_V113_ASR_PRODUCT_ANCHORS_MISSING" : null
  ].filter((blocker): blocker is string => Boolean(blocker));

  const report = {
    version: "v113",
    status: blockers.length === 0 ? "preview_ready_for_owner_review" : "blocked",
    mode: "product_matched_script_voice_preview_no_upload",
    channelKey: V113_CHANNEL_KEY,
    productReference: V113_PRODUCT_REFERENCE,
    scriptProductMatched: scriptValidation.productMatched,
    scriptSegmentCount: scriptValidation.scriptSegmentCount,
    scriptCharacterCount: scriptValidation.scriptCharacterCount,
    forbiddenMismatchTermsFound: scriptValidation.forbiddenTermsFound.length,
    pinnedCommentCtaPresent: scriptValidation.pinnedCommentCtaPresent,
    pinnedCommentCreated: false,
    pinnedCommentPackage: sanitizeV113PinnedCommentPackage(pinnedCommentPackage),
    voiceProviderType: voiceProvider.provider_type,
    localCommandVoiceUsed: true,
    paidOrCloudVoiceUsed: false,
    voiceStyle: V113_VOICE_STYLE,
    voiceSpeedMultiplier: V113_VOICE_SPEED_MULTIPLIER,
    targetVoiceDurationSeconds: V113_TARGET_VOICE_DURATION_SECONDS,
    voiceDurationSeconds: round3(voiceProbe.durationSeconds),
    outputDurationSeconds: round3(outputProbe.durationSeconds),
    outputWidth: outputProbe.width,
    outputHeight: outputProbe.height,
    audioReplacedWithProductMatchedVoice: outputProbe.hasAudio,
    asrProbeExecuted: asrProbe.executed,
    transcriptSimilarityScore: similarity,
    recognizedProductAnchorCount: recognizedAnchors.length,
    requiredProductAnchorCount: requiredAnchorCount,
    coreAnchorRecognitionPass: recognizedAnchors.length >= requiredAnchorCount,
    speechRateWpm: asrProbe.speechRateWpm,
    transcriptPrinted: false,
    voiceOwnerReviewRequired: true,
    replacementUploadReady: false,
    uploadBlockers: [
      "BLOCKED_V113_OWNER_VOICE_REVIEW_REQUIRED",
      "BLOCKED_V113_PINNED_COMMENT_ACTION_NOT_APPROVED"
    ],
    blockers,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    commentCreateUpdateDeleteCalled: false,
    commentPinned: false,
    visibilityChanged: false,
    schedulerExecutionCalled: false,
    n8nWebhookCalled: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };

  await fs.writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (blockers.length) process.exitCode = 1;
}

async function readJsonRecord(filePath: string) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid record");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SafeBlocker("BLOCKED_V113_PRODUCT_SOURCE_MANIFEST_NOT_READY");
  }
}

async function generateLocalVoice(input: {
  env: NodeJS.ProcessEnv;
  scriptPath: string;
  voiceoverPath: string;
}) {
  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) throw new SafeBlocker("BLOCKED_V113_KOREAN_VOICE_PROVIDER_NOT_READY");
  try {
    await runLocalCommand(command, [
      "--script", input.scriptPath,
      "--output", input.voiceoverPath,
      "--language", input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format", input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], TTS_TIMEOUT_MS, { MELOTTS_SPEED: String(V113_VOICE_SPEED_MULTIPLIER) });
  } catch {
    throw new SafeBlocker("BLOCKED_V113_LOCAL_VOICE_GENERATION_FAILED");
  }
}

async function runLocalAsr(input: { env: NodeJS.ProcessEnv; videoPath: string }) {
  const command = readString(input.env.LOCAL_ASR_COMMAND);
  const modelPath = readString(input.env.LOCAL_ASR_MODEL_PATH);
  const configured = input.env.LOCAL_ASR_ENABLED === "true" && command && modelPath;
  if (!configured || !await fileExists(command) || !await directoryHasFiles(modelPath)) {
    return { executed: false, transcript: "", speechRateWpm: null as number | null };
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-v113-asr-"));
  const outputJson = path.join(tempRoot, "asr-output.json");
  try {
    await runLocalCommand(command, [
      "--input", input.videoPath,
      "--output-json", outputJson,
      "--language", input.env.LOCAL_ASR_LANGUAGE ?? "ko",
      "--model-path", modelPath
    ], ASR_TIMEOUT_MS);
    const parsed = JSON.parse(await fs.readFile(outputJson, "utf8"));
    return {
      executed: true,
      transcript: typeof parsed.transcript === "string" ? parsed.transcript.trim() : "",
      speechRateWpm: typeof parsed.speech_rate_wpm === "number" ? round3(parsed.speech_rate_wpm) : null
    };
  } catch {
    return { executed: false, transcript: "", speechRateWpm: null as number | null };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function normalizeVoiceoverDuration(audioPath: string, targetDurationSeconds: number) {
  const probe = await probeMedia(audioPath);
  if (probe.durationSeconds <= targetDurationSeconds + 0.05) return;
  const tempo = Math.min(2, Math.max(0.5, probe.durationSeconds / targetDurationSeconds));
  const tempPath = `${audioPath}.tempo.wav`;
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", audioPath, "-filter:a", `atempo=${tempo.toFixed(3)}`, tempPath
  ]);
  await fs.rm(audioPath, { force: true });
  await fs.rename(tempPath, audioPath);
}

async function probeMedia(filePath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,width,height",
      "-of", "json", filePath
    ], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const video = parsed.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "video");
    return {
      durationSeconds: Number(parsed.format?.duration ?? 0),
      width: Number(video?.width ?? 0),
      height: Number(video?.height ?? 0),
      hasAudio: parsed.streams?.some((stream: { codec_type?: string }) => stream.codec_type === "audio") === true
    };
  } catch {
    throw new SafeBlocker("BLOCKED_V113_MEDIA_PROBE_FAILED");
  }
}

async function runFfmpeg(args: string[]) {
  try {
    await execFileAsync("ffmpeg", args, {
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    throw new SafeBlocker("BLOCKED_V113_SAFE_RENDER_FAILURE");
  }
}

async function runLocalCommand(
  command: string,
  args: string[],
  timeout: number,
  envOverrides: Record<string, string> = {}
) {
  const cleanCommand = stripWrappingQuotes(command.trim());
  const extension = path.extname(cleanCommand).toLowerCase();
  const options = {
    windowsHide: true,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...envOverrides }
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", cleanCommand, ...args], options);
  }
  return execFileAsync(cleanCommand, args, options);
}

async function fileExists(filePath: string) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(dirPath: string) {
  try {
    return (await fs.readdir(dirPath)).length > 0;
  } catch {
    return false;
  }
}

function assertInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SafeBlocker("BLOCKED_V113_OUTPUT_PATH_UNSAFE");
  }
}

function readString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stripWrappingQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "");
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

class SafeBlocker extends Error {}

main().catch(async (error) => {
  const blocker = error instanceof SafeBlocker && error.message
    ? error.message
    : "BLOCKED_V113_SAFE_PREVIEW_FAILURE";
  const report = {
    version: "v113",
    status: "blocked",
    mode: "product_matched_script_voice_preview_no_upload",
    blocker,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    visibilityChanged: false,
    schedulerExecutionCalled: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
  try {
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    // The sanitized stdout report remains the source of truth if local artifact creation fails.
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
});
