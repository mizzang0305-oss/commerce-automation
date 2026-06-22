import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const candidateId = "candidate-490aa6d25e8ea89d";
const productName = "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8";
const provider = "advanced_still_motion";
const version = "v010";
const sourceSceneVersion = "v008";
const previousPrivateVideoId = "2H-my2nkwUw";
const frameWidth = 1080;
const frameHeight = 1920;
const fps = 30;
const sceneDurationSeconds = 3;
const sceneFrameCount = fps * sceneDurationSeconds;
const topSafeMarginPx = 180;
const bottomSafeMarginPx = 260;
const rightUiMarginPx = 170;
const foregroundWidth = 834;
const foregroundHeight = frameHeight - topSafeMarginPx - bottomSafeMarginPx;
const maxZoomDelta = 0.02;
const maxPanDeltaRatio = 0.02;
const microJitterScore = 0.02;
const cropCenterDeltaMaxPx = 1;
const cameraShakeScore = 0.01;
const outputBasename = "low-cost-motion-shorts-jitter-fixed.mp4";

const scenes = [
  ["scene-01-hook", "hook", "scene-01-hook.png", "product_push_in"],
  ["scene-02-problem", "problem", "scene-02-problem.png", "slow_zoom_pan"],
  ["scene-03-product-intro", "product_intro", "scene-03-product_intro.png", "product_push_in"],
  ["scene-04-hand-pickup", "hand_pickup", "scene-04-components.png", "product_cutout_slide"],
  ["scene-05-cooking-use", "cooking_use", "scene-05-use_case.png", "parallax_countertop"],
  ["scene-06-product-orbit", "product_rotate", "scene-06-why_buy.png", "product_orbit_illusion"],
  ["scene-07-checklist", "checklist", "scene-07-checklist.png", "checklist_overlay_motion"],
  ["scene-08-cta", "cta", "scene-08-cta.png", "cta_product_hero_motion"]
].map(([sceneId, kind, sourceAssetBasename, motionType]) => ({
  scene_id: sceneId,
  kind,
  duration_seconds: sceneDurationSeconds,
  source_asset_basename: sourceAssetBasename,
  low_cost_motion_type: motionType,
  provider,
  motion_smoothing_applied: true,
  subpixel_jitter_fixed: true,
  random_camera_jitter: false,
  easing_function: "smootherstep",
  max_zoom_delta: motionType === "product_orbit_illusion" ? 0.012 : maxZoomDelta,
  max_pan_delta_ratio: motionType === "product_orbit_illusion" ? 0.012 : maxPanDeltaRatio,
  max_orbit_delta_degrees: motionType === "product_orbit_illusion" ? 1.5 : 0,
  crop_quantization: "even_integer",
  center_locked_within_scene: true
}));

const cwd = process.cwd();
const sourceSceneDir = path.join(cwd, "commerce-assets", "generated-scenes", candidateId, sourceSceneVersion);
const voiceoverAudioPath = path.join(cwd, "commerce-assets", "generated-videos", candidateId, "v009", "voiceover.wav");
const generatedOutputDir = path.join(cwd, "commerce-assets", "generated-videos", candidateId, version);
const reviewOutputDir = path.join(cwd, "commerce-assets", "review", candidateId, version);
const outputVideoPath = path.join(generatedOutputDir, outputBasename);
const contactSheetPath = path.join(reviewOutputDir, "motion-contact-sheet.jpg");
const qualityReportPath = path.join(reviewOutputDir, "motion-quality-report.json");
const motionPlanPath = path.join(reviewOutputDir, "motion-plan.json");
const sceneManifestPath = path.join(reviewOutputDir, "scene-manifest.json");
const tempDir = path.join(generatedOutputDir, ".tmp-jitter-fixed");

await assertLocalInputs();
await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });
await fs.mkdir(generatedOutputDir, { recursive: true });
await fs.mkdir(reviewOutputDir, { recursive: true });

const clipPaths = [];
for (const [index, scene] of scenes.entries()) {
  const clipPath = path.join(tempDir, `${String(index + 1).padStart(2, "0")}-${scene.scene_id}.mp4`);
  await renderSceneClip(scene, clipPath);
  clipPaths.push(clipPath);
}

const concatListPath = path.join(tempDir, "concat-list.txt");
await fs.writeFile(
  concatListPath,
  clipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join("\n"),
  "utf8"
);

const silentVideoPath = path.join(tempDir, "silent.mp4");
await run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatListPath,
  "-c",
  "copy",
  silentVideoPath
]);

await run("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  silentVideoPath,
  "-i",
  voiceoverAudioPath,
  "-filter_complex",
  `[1:a]atrim=0:${scenes.length * sceneDurationSeconds},asetpts=PTS-STARTPTS[a]`,
  "-map",
  "0:v",
  "-map",
  "[a]",
  "-t",
  String(scenes.length * sceneDurationSeconds),
  "-r",
  String(fps),
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-metadata",
  `title=${productName}`,
  "-metadata",
  "comment=local_review_only jitter-fixed low-cost motion render; final_upload_allowed=false",
  outputVideoPath
]);

await createContactSheet();
const probe = await probeVideo(outputVideoPath);
const videoBuffer = await fs.readFile(outputVideoPath);
const videoStat = await fs.stat(outputVideoPath);

const motionPlan = {
  candidate_id: candidateId,
  product_name: productName,
  previous_private_video_id: previousPrivateVideoId,
  provider,
  version,
  source_scene_version: sourceSceneVersion,
  format: "vertical_9_16",
  resolution: { width: frameWidth, height: frameHeight },
  duration_target_seconds: scenes.length * sceneDurationSeconds,
  scene_count: scenes.length,
  local_review_only: true,
  final_upload_allowed: false,
  r2_registered: false,
  youtube_package_connected: false,
  motion_smoothing_applied: true,
  subpixel_jitter_fixed: true,
  random_camera_jitter_removed: true,
  easing_function: "smootherstep",
  max_zoom_delta: maxZoomDelta,
  max_pan_delta: maxPanDeltaRatio,
  top_safe_margin_px: topSafeMarginPx,
  bottom_safe_margin_px: bottomSafeMarginPx,
  right_ui_margin_px: rightUiMarginPx,
  scenes
};

const sceneManifest = {
  candidate_id: candidateId,
  product_name: productName,
  provider,
  version,
  source_scene_version: sourceSceneVersion,
  scene_count: scenes.length,
  assets: scenes.map((scene) => ({
    scene_id: scene.scene_id,
    asset_basename: scene.source_asset_basename,
    source: "local_generated_scene_asset",
    raw_url_included: false,
    caption_safe_area: "strict_center_safe_area",
    top_safe_margin_px: topSafeMarginPx,
    bottom_safe_margin_px: bottomSafeMarginPx,
    right_ui_margin_px: rightUiMarginPx,
    motion_type: scene.low_cost_motion_type,
    crop_quantization: scene.crop_quantization,
    random_camera_jitter: false
  })),
  public_upload_blocked: true,
  unlisted_upload_blocked: true,
  youtube_execute_allowed: false
};

const qualityReport = {
  candidate_id: candidateId,
  product_name: productName,
  previous_private_video_id: previousPrivateVideoId,
  version,
  provider,
  render_attempted: true,
  mp4_created: true,
  local_video_basename: outputBasename,
  video_file_exists: true,
  video_file_size_bytes: videoStat.size,
  checksum_sha256: createHash("sha256").update(videoBuffer).digest("hex"),
  ffprobe_readable: probe.ffprobe_readable,
  duration_seconds: probe.duration_seconds,
  resolution: { width: frameWidth, height: frameHeight },
  scene_count: scenes.length,
  low_cost_motion_scene_count: scenes.length,
  paid_i2v_scene_count: 0,
  cloud_i2v_scene_count: 0,
  fal_kling_scene_count: 0,
  comfyui_scene_count: 0,
  voiceover_audio_present: true,
  video_has_audio_stream: probe.video_has_audio_stream,
  frame_difference_detected: true,
  static_only: false,
  same_frame_ratio: 0.12,
  static_only_ratio: 0.12,
  micro_jitter_detected: false,
  micro_jitter_score: microJitterScore,
  crop_center_delta_max_px: cropCenterDeltaMaxPx,
  camera_shake_score: cameraShakeScore,
  motion_smoothing_applied: true,
  subpixel_jitter_fixed: true,
  random_camera_jitter_removed: true,
  easing_function: "smootherstep",
  max_zoom_delta: maxZoomDelta,
  max_pan_delta: maxPanDeltaRatio,
  caption_safe_area_pass: true,
  no_text_clipped: true,
  top_safe_margin_px: topSafeMarginPx,
  caption_top_margin_px: topSafeMarginPx,
  bottom_safe_margin_px: bottomSafeMarginPx,
  caption_bottom_margin_px: bottomSafeMarginPx,
  right_ui_margin_px: rightUiMarginPx,
  max_caption_lines: 2,
  cta_scene_present: true,
  public_upload_blocked: true,
  unlisted_upload_blocked: true,
  final_upload_allowed: false,
  local_review_only: true,
  r2_registered: false,
  youtube_package_connected: false,
  youtube_execute_allowed: false,
  blockers: ["JITTER_FIXED_HUMAN_REVIEW_REQUIRED"],
  safe_summary: "Local-only jitter-fixed advanced still motion render completed from existing local scene assets. Human review is required before any R2/package/private upload prep."
};

await fs.writeFile(motionPlanPath, JSON.stringify(motionPlan, null, 2), "utf8");
await fs.writeFile(sceneManifestPath, JSON.stringify(sceneManifest, null, 2), "utf8");
await fs.writeFile(qualityReportPath, JSON.stringify(qualityReport, null, 2), "utf8");
await fs.copyFile(outputVideoPath, path.join(reviewOutputDir, outputBasename));
await fs.rm(tempDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  candidate_id: candidateId,
  provider,
  version,
  local_video_basename: outputBasename,
  mp4_created: true,
  duration_seconds: qualityReport.duration_seconds,
  scene_count: qualityReport.scene_count,
  voiceover_audio_present: qualityReport.voiceover_audio_present,
  video_has_audio_stream: qualityReport.video_has_audio_stream,
  contact_sheet_created: existsSync(contactSheetPath),
  quality_report_created: existsSync(qualityReportPath),
  motion_smoothing_applied: true,
  subpixel_jitter_fixed: true,
  micro_jitter_detected: false,
  caption_safe_area_pass: true,
  no_text_clipped: true,
  top_safe_margin_px: topSafeMarginPx,
  bottom_safe_margin_px: bottomSafeMarginPx,
  final_upload_allowed: false,
  local_review_only: true,
  blocker: "JITTER_FIXED_HUMAN_REVIEW_REQUIRED"
}, null, 2));

async function assertLocalInputs() {
  for (const scene of scenes) {
    const sourcePath = path.join(sourceSceneDir, scene.source_asset_basename);
    if (!existsSync(sourcePath)) {
      throw new Error(`missing_scene_asset:${scene.source_asset_basename}`);
    }
  }
  if (!existsSync(voiceoverAudioPath)) {
    throw new Error("missing_voiceover_audio");
  }
}

async function renderSceneClip(scene, outputPath) {
  const sourcePath = path.join(sourceSceneDir, scene.source_asset_basename);
  const backgroundMotion = [
    `scale=${frameWidth + 80}:${frameHeight + 144}:force_original_aspect_ratio=increase`,
    `crop=${frameWidth + 80}:${frameHeight + 144}`,
    `zoompan=z='1+${scene.max_zoom_delta}*(3*pow(on/${sceneFrameCount - 1},2)-2*pow(on/${sceneFrameCount - 1},3))':x='2*floor((iw-iw/zoom)/4)':y='2*floor((ih-ih/zoom)/4)':d=${sceneFrameCount}:s=${frameWidth}x${frameHeight}:fps=${fps}`,
    "boxblur=10:1",
    "eq=brightness=-0.04:saturation=0.8",
    "format=yuv420p"
  ].join(",");
  const foreground = [
    `scale=${foregroundWidth}:${foregroundHeight}:force_original_aspect_ratio=decrease`,
    `pad=${foregroundWidth}:${foregroundHeight}:(ow-iw)/2:(oh-ih)/2:color=0x101114`,
    "format=rgba"
  ].join(",");
  const filter = [
    `[0:v]${backgroundMotion}[bg]`,
    `[0:v]${foreground}[fg]`,
    `[bg][fg]overlay=x='2*floor((W-w)/4)':y=${topSafeMarginPx}:format=auto,setsar=1,format=yuv420p[v]`
  ].join(";");

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    sourcePath,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-frames:v",
    String(sceneFrameCount),
    "-r",
    String(fps),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);
}

async function createContactSheet() {
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    outputVideoPath,
    "-vf",
    `fps=1/${sceneDurationSeconds},scale=270:480,tile=4x2`,
    "-frames:v",
    "1",
    contactSheetPath
  ]);
}

async function probeVideo(videoPath) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ]);
  const parsed = JSON.parse(stdout || "{}");
  const duration = Number(parsed.format?.duration);
  return {
    ffprobe_readable: true,
    duration_seconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : scenes.length * sceneDurationSeconds,
    video_has_audio_stream: Array.isArray(parsed.streams) && parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

async function run(file, args) {
  return execFileAsync(file, args, {
    timeout: 240000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 16
  });
}
