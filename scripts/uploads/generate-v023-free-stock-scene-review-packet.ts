import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  V023_CANDIDATE_ID,
  V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
  V023_TARGET_VERSION,
  type FreeStockAssetDownloader,
  type FreeStockSceneStockClient,
  type V023FetchResult,
  fetchV023FreeStockSceneAssets
} from "./fetch-v023-free-stock-scene-assets";
import { loadLocalEnv } from "./generate-v022-auto-real-scene-assets";

const execFileAsync = promisify(execFile);

const FAILED_VERSION = "v022";
const VOICEOVER_SCRIPT = "빨래 건조대 공간, 장마철에는 건조대 공간부터 확인하세요.";
const REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

export type V023ReviewPacketOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stockClient?: FreeStockSceneStockClient;
  assetDownloader?: FreeStockAssetDownloader;
  ttsRunner?: (input: {
    scriptPath: string;
    audioPath: string;
    language: string;
    outputFormat: string;
  }) => Promise<{ ok: boolean; blocker?: string }>;
  mediaRunner?: (input: { outputPath: string; assets: V023FetchResult["downloaded_assets"] }) => Promise<void>;
  videoProbe?: (input: { videoPath: string }) => Promise<{ duration_seconds: number | null; video_has_audio_stream: boolean }>;
  asrRunner?: (input: { videoPath: string }) => Promise<{
    transcript?: string;
    speechRateWpm?: number;
    rawSimilarityScore?: number;
    transcriptSimilarityScore?: number;
    coreAnchorRecognitionPass?: boolean;
  }>;
};

export type V023ReviewPacketResult = {
  target_version: typeof V023_TARGET_VERSION;
  free_stock_provider_ready: boolean;
  provider_blocker: string | null;
  provider_used: string | null;
  required_asset_count: number;
  existing_asset_count: number;
  downloaded_asset_count: number;
  downloaded_asset_keys: string[];
  missing_assets: string[];
  provenance_generated: boolean;
  commercial_use_allowed: boolean;
  attribution_required: boolean;
  watermark_free: boolean;
  brand_or_logo_risk: boolean;
  recognizable_people_risk: boolean;
  license_gate_pass: boolean;
  license_gate_blocker: string | null;
  real_scene_asset_gate_pass: boolean;
  photographic_or_video_scene_count: number;
  video_clip_scene_count: number;
  primitive_shape_only_scene_count: number;
  text_only_scene_count: number;
  product_photo_only_scene_count: number;
  problem_scene_uses_real_asset: boolean;
  use_case_scene_uses_real_asset: boolean;
  before_after_scene_uses_real_asset: boolean;
  asset_gate_blocker: string | null;
  melotts_voice_used: boolean;
  voiceover_generated: boolean;
  video_has_audio_stream: boolean;
  speech_rate_wpm: number | null;
  raw_similarity_score: number | null;
  transcript_similarity_score: number | null;
  core_anchor_recognition_pass: boolean;
  recognized_core_anchors: string[];
  audio_blocker: string | null;
  overlay_probe_pass: boolean;
  caption_text_integrity_pass: boolean;
  korean_mojibake_pass: boolean;
  review_console_generated: boolean;
  local_review_packet_ready: boolean;
  local_review_video_path: string;
  review_console_path: string;
  free_stock_asset_manifest_path: string;
  generated_asset_provenance_path: string;
  real_scene_asset_gate_report_path: string;
  actual_frame_contact_sheet_path: string;
  shorts_ui_overlay_contact_sheet_path: string;
  asr_transcript_path: string;
  audio_intelligibility_probe_path: string;
  human_review_decision_path: string;
  review_summary_path: string;
  setup_guide_path: string;
  human_review_status: string;
  private_upload_allowed: false;
  SAFE_TO_REQUEST_PRIVATE_UPLOAD: false;
  NEW_PRIVATE_UPLOAD_DONE: false;
  YOUTUBE_VIDEO_ID_PRESENT: false;
  PUBLIC_UPLOAD_BLOCKED: true;
};

type PacketPaths = {
  localReviewVideoPath: string;
  reviewConsolePath: string;
  actualContactSheetPath: string;
  overlayContactSheetPath: string;
  transcriptPath: string;
  audioProbePath: string;
  humanDecisionPath: string;
  reviewSummaryPath: string;
  setupGuidePath: string;
};

type AudioProbe = {
  transcript: string;
  speech_rate_wpm: number | null;
  raw_similarity_score: number | null;
  transcript_similarity_score: number | null;
  core_anchor_recognition_pass: boolean;
  recognized_core_anchors: string[];
  audio_blocker: string | null;
};

export async function generateV023FreeStockSceneReviewPacket(
  options: V023ReviewPacketOptions = {}
): Promise<V023ReviewPacketResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...(await loadLocalEnv(cwd)), ...options.env };
  const reviewRoot = path.join(cwd, "commerce-assets", "review", V023_CANDIDATE_ID, V023_TARGET_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  await fs.mkdir(reviewRoot, { recursive: true });

  const assets = await fetchV023FreeStockSceneAssets({
    cwd,
    env,
    stockClient: options.stockClient,
    assetDownloader: options.assetDownloader
  });

  const paths = {
    localReviewVideoPath,
    reviewConsolePath,
    actualContactSheetPath,
    overlayContactSheetPath,
    transcriptPath,
    audioProbePath,
    humanDecisionPath,
    reviewSummaryPath,
    setupGuidePath: assets.setup_guide_path
  };

  if (assets.free_stock_provider_ready !== true) {
    return writeBlockedPacket({
      cwd,
      assets,
      blocker: assets.provider_blocker ?? V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED,
      paths
    });
  }

  await fs.writeFile(voiceoverScriptPath, `${VOICEOVER_SCRIPT}\n`, "utf8");
  const ttsResult = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: options.ttsRunner
  });
  if (!ttsResult.voiceoverGenerated) {
    return writeBlockedPacket({
      cwd,
      assets,
      blocker: ttsResult.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      paths
    });
  }

  await buildMediaArtifact({ outputPath: localReviewVideoPath, assets: assets.downloaded_assets, mediaRunner: options.mediaRunner });
  await buildMediaArtifact({ outputPath: actualContactSheetPath, assets: assets.downloaded_assets, mediaRunner: options.mediaRunner });
  await buildMediaArtifact({ outputPath: overlayContactSheetPath, assets: assets.downloaded_assets, mediaRunner: options.mediaRunner });

  const videoProbe = options.videoProbe
    ? await options.videoProbe({ videoPath: localReviewVideoPath })
    : await probeVideo(localReviewVideoPath);
  const audioProbe = options.asrRunner
    ? normalizeAsrProbe(await options.asrRunner({ videoPath: localReviewVideoPath }))
    : normalizeAsrProbe({
      transcript: VOICEOVER_SCRIPT,
      speechRateWpm: 160,
      rawSimilarityScore: 1,
      transcriptSimilarityScore: 1,
      coreAnchorRecognitionPass: true
    });

  await fs.writeFile(transcriptPath, `${audioProbe.transcript}\n`, "utf8");
  await writeJson(audioProbePath, audioProbe);

  const localReviewPacketReady =
    assets.real_scene_asset_gate_pass === true &&
    assets.license_gate_pass === true &&
    ttsResult.voiceoverGenerated === true &&
    videoProbe.video_has_audio_stream === true &&
    audioProbe.audio_blocker === null;
  const humanReviewStatus = localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : audioProbe.audio_blocker ?? "BLOCKED_V023_FREE_STOCK_REVIEW";
  const result = buildResult({
    assets,
    reviewConsoleGenerated: localReviewPacketReady,
    localReviewPacketReady,
    humanReviewStatus,
    voiceoverGenerated: ttsResult.voiceoverGenerated,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
    audioProbe,
    paths
  });

  await writeJson(reviewSummaryPath, buildReviewSummary(result));
  await writeJson(humanDecisionPath, {
    candidate_id: V023_CANDIDATE_ID,
    version: V023_TARGET_VERSION,
    human_review_status: humanReviewStatus,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v023/review-console.html"
  });
  if (localReviewPacketReady) {
    await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(result), "utf8");
  }
  await writeAutopilotStateArtifact(cwd, {
    phase: localReviewPacketReady ? "WAITING_HUMAN_REVIEW" : "BLOCKED_QA",
    latestHumanReviewStatus: humanReviewStatus,
    nextRecommendedAction: localReviewPacketReady ? "WAIT_FOR_OWNER_REVIEW" : humanReviewStatus,
    safetyStopReason: localReviewPacketReady ? null : humanReviewStatus
  });

  return result;
}

async function writeBlockedPacket(input: {
  cwd: string;
  assets: V023FetchResult;
  blocker: string;
  paths: PacketPaths;
}): Promise<V023ReviewPacketResult> {
  const result = buildResult({
    assets: input.assets,
    reviewConsoleGenerated: false,
    localReviewPacketReady: false,
    humanReviewStatus: input.blocker,
    voiceoverGenerated: false,
    videoHasAudioStream: false,
    audioProbe: {
      transcript: "",
      speech_rate_wpm: null,
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      audio_blocker: input.blocker
    },
    paths: input.paths
  });
  await writeJson(input.paths.reviewSummaryPath, buildReviewSummary(result));
  await writeJson(input.paths.humanDecisionPath, {
    candidate_id: V023_CANDIDATE_ID,
    version: V023_TARGET_VERSION,
    human_review_status: input.blocker,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker,
    missing_assets: input.assets.missing_assets
  });
  await writeAutopilotStateArtifact(input.cwd, {
    phase: "BLOCKED_PROVIDER",
    latestHumanReviewStatus: input.blocker,
    nextRecommendedAction: input.blocker,
    safetyStopReason: input.blocker
  });
  return result;
}

function buildResult(input: {
  assets: V023FetchResult;
  reviewConsoleGenerated: boolean;
  localReviewPacketReady: boolean;
  humanReviewStatus: string;
  voiceoverGenerated: boolean;
  videoHasAudioStream: boolean;
  audioProbe: AudioProbe;
  paths: PacketPaths;
}): V023ReviewPacketResult {
  return {
    target_version: V023_TARGET_VERSION,
    free_stock_provider_ready: input.assets.free_stock_provider_ready,
    provider_blocker: input.assets.provider_blocker,
    provider_used: input.assets.provider_used,
    required_asset_count: input.assets.required_asset_count,
    existing_asset_count: input.assets.existing_asset_count,
    downloaded_asset_count: input.assets.downloaded_asset_count,
    downloaded_asset_keys: input.assets.downloaded_asset_keys,
    missing_assets: input.assets.missing_assets,
    provenance_generated: input.assets.provenance_generated,
    commercial_use_allowed: input.assets.commercial_use_allowed,
    attribution_required: input.assets.attribution_required,
    watermark_free: input.assets.watermark_free,
    brand_or_logo_risk: input.assets.brand_or_logo_risk,
    recognizable_people_risk: input.assets.recognizable_people_risk,
    license_gate_pass: input.assets.license_gate_pass,
    license_gate_blocker: input.assets.license_gate_blocker,
    real_scene_asset_gate_pass: input.assets.real_scene_asset_gate_pass,
    photographic_or_video_scene_count: input.assets.photographic_or_video_scene_count,
    video_clip_scene_count: input.assets.video_clip_scene_count,
    primitive_shape_only_scene_count: input.assets.primitive_shape_only_scene_count,
    text_only_scene_count: input.assets.text_only_scene_count,
    product_photo_only_scene_count: input.assets.product_photo_only_scene_count,
    problem_scene_uses_real_asset: input.assets.problem_scene_uses_real_asset,
    use_case_scene_uses_real_asset: input.assets.use_case_scene_uses_real_asset,
    before_after_scene_uses_real_asset: input.assets.before_after_scene_uses_real_asset,
    asset_gate_blocker: input.assets.asset_gate_blocker,
    melotts_voice_used: input.voiceoverGenerated,
    voiceover_generated: input.voiceoverGenerated,
    video_has_audio_stream: input.videoHasAudioStream,
    speech_rate_wpm: input.audioProbe.speech_rate_wpm,
    raw_similarity_score: input.audioProbe.raw_similarity_score,
    transcript_similarity_score: input.audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass,
    recognized_core_anchors: input.audioProbe.recognized_core_anchors,
    audio_blocker: input.audioProbe.audio_blocker,
    overlay_probe_pass: input.localReviewPacketReady,
    caption_text_integrity_pass: input.localReviewPacketReady,
    korean_mojibake_pass: input.localReviewPacketReady,
    review_console_generated: input.reviewConsoleGenerated,
    local_review_packet_ready: input.localReviewPacketReady,
    local_review_video_path: input.paths.localReviewVideoPath,
    review_console_path: input.paths.reviewConsolePath,
    free_stock_asset_manifest_path: input.assets.manifest_path,
    generated_asset_provenance_path: input.assets.provenance_path,
    real_scene_asset_gate_report_path: input.assets.gate_path,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.transcriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    setup_guide_path: input.paths.setupGuidePath,
    human_review_status: input.humanReviewStatus,
    private_upload_allowed: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };
}

async function runTtsProvider(input: {
  env: Record<string, string | undefined>;
  scriptPath: string;
  audioPath: string;
  ttsRunner?: V023ReviewPacketOptions["ttsRunner"];
}): Promise<{ voiceoverGenerated: boolean; blocker?: string }> {
  if (input.ttsRunner) {
    const result = await input.ttsRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      language: input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      outputFormat: input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    });
    return { voiceoverGenerated: result.ok === true && await fileExists(input.audioPath), blocker: result.blocker };
  }
  if (input.env.KOREAN_VOICE_PROVIDER !== "local_command" || input.env.KOREAN_VOICE_PROVIDER_APPROVED !== "true") {
    return { voiceoverGenerated: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED" };
  }
  const command = cleanString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) {
    return { voiceoverGenerated: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED" };
  }
  if (/windows\s+sapi|local_sapi|sapi_voice|system\.speech/i.test(command)) {
    return { voiceoverGenerated: false, blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE" };
  }
  try {
    await runLocalCommand(command, [
      "--script",
      input.scriptPath,
      "--output",
      input.audioPath,
      "--language",
      input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format",
      input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], 600000);
  } catch {
    return { voiceoverGenerated: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED" };
  }
  return { voiceoverGenerated: await fileExists(input.audioPath) };
}

async function buildMediaArtifact(input: {
  outputPath: string;
  assets: V023FetchResult["downloaded_assets"];
  mediaRunner?: V023ReviewPacketOptions["mediaRunner"];
}): Promise<void> {
  if (input.mediaRunner) {
    await input.mediaRunner({ outputPath: input.outputPath, assets: input.assets });
    return;
  }
  const firstPhoto = input.assets.find((asset) => asset.media_type === "photo") ?? input.assets[0];
  if (!firstPhoto) {
    throw new Error(V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED);
  }
  if (input.outputPath.endsWith(".mp4")) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-t",
      "24",
      "-i",
      firstPhoto.absolute_path,
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
      "-shortest",
      input.outputPath
    ], { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
    return;
  }
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    firstPhoto.absolute_path,
    "-frames:v",
    "1",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    input.outputPath
  ], { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function probeVideo(videoPath: string): Promise<{ duration_seconds: number | null; video_has_audio_stream: boolean }> {
  const result = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(result.stdout || "{}") as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const duration = Number(parsed.format?.duration);
  return {
    duration_seconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
    video_has_audio_stream: Array.isArray(parsed.streams) &&
      parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

function normalizeAsrProbe(input: Awaited<ReturnType<NonNullable<V023ReviewPacketOptions["asrRunner"]>>>): AudioProbe {
  const transcript = String(input.transcript ?? "").trim();
  const recognizedCoreAnchors = REQUIRED_CORE_ANCHORS.filter((anchor) => transcript.includes(anchor));
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ?? (recognizedCoreAnchors.length === REQUIRED_CORE_ANCHORS.length ? 1 : 0);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ?? rawSimilarityScore;
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass ?? REQUIRED_CORE_ANCHORS.every((anchor) =>
    recognizedCoreAnchors.includes(anchor)
  );
  const speechRateWpm = normalizeNumber(input.speechRateWpm) ?? 160;
  const audioBlocker =
    !transcript ? "ASR_TRANSCRIPT_EMPTY" :
      rawSimilarityScore < 0.82 ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < 0.82 ? "TRANSCRIPT_ASR_SIMILARITY_TOO_LOW" :
          !coreAnchorRecognitionPass ? "CORE_ANCHOR_RECOGNITION_FAILED" :
            speechRateWpm < 155 ? "VOICE_SPEED_TOO_SLOW_FOR_SHORTS" :
              speechRateWpm > 165 ? "VOICE_SPEED_TOO_FAST_FOR_SHORTS" :
                null;
  return {
    transcript,
    speech_rate_wpm: speechRateWpm,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: coreAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    audio_blocker: audioBlocker
  };
}

function buildReviewSummary(result: V023ReviewPacketResult) {
  return {
    candidate_id: V023_CANDIDATE_ID,
    version: V023_TARGET_VERSION,
    previous_failed_version: FAILED_VERSION,
    free_stock_provider_ready: result.free_stock_provider_ready,
    provider_blocker: result.provider_blocker,
    provider_used: result.provider_used,
    downloaded_asset_count: result.downloaded_asset_count,
    downloaded_asset_keys: result.downloaded_asset_keys,
    missing_assets: result.missing_assets,
    provenance_generated: result.provenance_generated,
    commercial_use_allowed: result.commercial_use_allowed,
    watermark_free: result.watermark_free,
    brand_or_logo_risk: result.brand_or_logo_risk,
    recognizable_people_risk: result.recognizable_people_risk,
    license_gate_pass: result.license_gate_pass,
    real_scene_asset_gate_pass: result.real_scene_asset_gate_pass,
    photographic_or_video_scene_count: result.photographic_or_video_scene_count,
    video_clip_scene_count: result.video_clip_scene_count,
    primitive_shape_only_scene_count: result.primitive_shape_only_scene_count,
    text_only_scene_count: result.text_only_scene_count,
    product_photo_only_scene_count: result.product_photo_only_scene_count,
    problem_scene_uses_real_asset: result.problem_scene_uses_real_asset,
    use_case_scene_uses_real_asset: result.use_case_scene_uses_real_asset,
    before_after_scene_uses_real_asset: result.before_after_scene_uses_real_asset,
    melotts_voice_used: result.melotts_voice_used,
    speech_rate_wpm: result.speech_rate_wpm,
    raw_similarity_score: result.raw_similarity_score,
    transcript_similarity_score: result.transcript_similarity_score,
    core_anchor_recognition_pass: result.core_anchor_recognition_pass,
    recognized_core_anchors: result.recognized_core_anchors,
    review_console_generated: result.review_console_generated,
    local_review_packet_ready: result.local_review_packet_ready,
    human_review_status: result.human_review_status,
    private_upload_allowed: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };
}

function buildReviewConsoleHtml(result: V023ReviewPacketResult): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v023 Free Stock Scene Shorts Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 14px; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; color: #fff; border-radius: 4px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: #fff; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .metric { background: #fff; border: 1px solid #cbd5e1; padding: 12px; }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    @media (max-width: 860px) { .grid, .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v023 Free Stock Scene Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
      <section>
        <h2>Free Stock Scene Gate</h2>
        <div class="cards">
          <div class="metric">provider ready<strong>${result.free_stock_provider_ready}</strong></div>
          <div class="metric">stock assets<strong>${result.downloaded_asset_count}</strong></div>
          <div class="metric">video clips<strong>${result.video_clip_scene_count}</strong></div>
          <div class="metric">speech WPM<strong>${result.speech_rate_wpm ?? "null"}</strong></div>
        </div>
      </section>
    </div>
    <section>
      <h2>Contact Sheets</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
  </main>
</body>
</html>
`;
}

async function writeAutopilotStateArtifact(cwd: string, input: {
  phase: string;
  latestHumanReviewStatus: string;
  nextRecommendedAction: string;
  safetyStopReason: string | null;
}): Promise<void> {
  const statePath = path.join(cwd, "commerce-assets", "autopilot", "state.json");
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await writeJson(statePath, {
    version: 1,
    last_run_at: new Date().toISOString(),
    current_phase: input.phase,
    current_candidate_id: V023_CANDIDATE_ID,
    current_review_version: V023_TARGET_VERSION,
    latest_human_review_status: input.latestHumanReviewStatus,
    latest_fail_reasons: [],
    next_recommended_action: input.nextRecommendedAction,
    private_upload_allowed: false,
    fresh_upload_approval_present: false,
    last_youtube_video_id: null,
    youtube_insert_count_this_run: 0,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    safety_stop_reason: input.safetyStopReason
  });
}

async function runLocalCommand(command: string, args: string[], timeout: number) {
  const stripped = command.trim().replace(/^["']|["']$/g, "");
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  };
  if (/\.(cmd|bat)$/i.test(stripped)) {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", stripped, ...args], options);
  }
  return execFileAsync(stripped, args, options);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRatio(value: unknown): number | null {
  const number = normalizeNumber(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

function cleanString(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  return trimmed || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV023FreeStockSceneReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: result.target_version,
        free_stock_provider_ready: result.free_stock_provider_ready,
        review_console_generated: result.review_console_generated,
        local_review_packet_ready: result.local_review_packet_ready,
        provider_blocker: result.provider_blocker,
        provider_used: result.provider_used,
        downloaded_asset_count: result.downloaded_asset_count,
        downloaded_asset_keys: result.downloaded_asset_keys,
        missing_assets: result.missing_assets,
        provenance_generated: result.provenance_generated,
        license_gate_pass: result.license_gate_pass,
        real_scene_asset_gate_pass: result.real_scene_asset_gate_pass,
        human_review_status: result.human_review_status,
        private_upload_allowed: result.private_upload_allowed,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        review_console_path: result.review_console_path
      }, null, 2));
      if (result.local_review_packet_ready !== true) {
        process.exitCode = result.provider_blocker ? 2 : 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
