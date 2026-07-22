import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  V112_CHANNEL_KEY,
  V112_PRODUCT_REFERENCE,
  V112_SCENE_PLAN,
  validateV112ScenePlan
} from "../../src/rendering/shorts/v112ImageSkillVisualQuality";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const sourceVideo = path.join(cwd, "commerce-assets", "review", "v057", V112_CHANNEL_KEY, "corrected-preview-v057.mp4");
const outputRoot = path.join(cwd, "commerce-assets", "review", "v112", V112_CHANNEL_KEY);
const sceneRoot = path.join(outputRoot, "generated-scenes");
const previewPath = path.join(outputRoot, "preview-v112.mp4");
const firstFramePath = path.join(outputRoot, "first-frame-v112.jpg");
const hookPreviewPath = path.join(outputRoot, "hook-overlay-preview-v112.jpg");
const contactSheetPath = path.join(outputRoot, "contact-sheet-v112.jpg");
const summaryPath = path.join(outputRoot, "v112-preview-summary.json");
const fontPath = "C:/Windows/Fonts/malgunbd.ttf";
const FFMPEG_TIMEOUT_MS = 180_000;

async function main() {
  assertInside(path.join(cwd, "commerce-assets", "review"), outputRoot);
  const planValidation = validateV112ScenePlan();
  if (!planValidation.ready) throw new Error(planValidation.blockers[0]);

  await fs.mkdir(outputRoot, { recursive: true });
  const sourceProbe = await probeVideo(sourceVideo);
  if (!sourceProbe.hasAudio || sourceProbe.durationSeconds <= 20) {
    throw new Error("BLOCKED_V112_SOURCE_VIDEO_INVALID");
  }

  const sceneInputs = await Promise.all(V112_SCENE_PLAN.map(async (scene) => {
    const imagePath = path.join(sceneRoot, scene.filename);
    const image = await probeImage(imagePath);
    if (!image.exists) throw new Error(`BLOCKED_V112_SCENE_MISSING_${scene.sceneKey.toUpperCase()}`);
    if (!image.portrait || image.width < 900 || image.height < 1600 || image.sizeBytes < 500_000) {
      throw new Error(`BLOCKED_V112_SCENE_QUALITY_${scene.sceneKey.toUpperCase()}`);
    }
    return { ...scene, imagePath, image };
  }));

  const fixedDuration = V112_SCENE_PLAN.reduce(
    (total, scene) => total + (typeof scene.durationSeconds === "number" ? scene.durationSeconds : 0),
    0
  );
  const remainderDuration = sourceProbe.durationSeconds - fixedDuration;
  if (remainderDuration < 3) throw new Error("BLOCKED_V112_SOURCE_DURATION_TOO_SHORT");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-v112-render-"));
  try {
    const clips: string[] = [];
    for (const [index, scene] of sceneInputs.entries()) {
      const duration = scene.durationSeconds === "remainder" ? remainderDuration : scene.durationSeconds;
      const captionPath = path.join(tempRoot, `${scene.sceneKey}.txt`);
      const clipPath = path.join(tempRoot, `${String(index + 1).padStart(2, "0")}-${scene.sceneKey}.mp4`);
      await fs.writeFile(captionPath, scene.caption, "utf8");
      await renderScene({
        imagePath: scene.imagePath,
        captionPath,
        duration,
        zoomEnd: scene.zoomEnd,
        hookOverlay: scene.hookOverlay,
        outputPath: clipPath
      });
      clips.push(clipPath);
    }

    const concatPath = path.join(tempRoot, "clips.txt");
    await fs.writeFile(concatPath, clips.map((clip) => `file '${escapeConcatPath(clip)}'`).join("\n"), "utf8");
    await runFfmpeg([
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", concatPath,
      "-i", sourceVideo,
      "-map", "0:v:0", "-map", "1:a:0?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-t", sourceProbe.durationSeconds.toFixed(3),
      "-movflags", "+faststart", previewPath
    ]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", previewPath, "-frames:v", "1", "-q:v", "2", firstFramePath]);
  await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", firstFramePath, "-vf", "scale=360:640", "-q:v", "2", hookPreviewPath]);
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error", "-i", previewPath,
    "-vf", "fps=1/2.7,scale=270:480:force_original_aspect_ratio=increase,crop=270:480,tile=3x3",
    "-frames:v", "1", contactSheetPath
  ]);

  const outputProbe = await probeVideo(previewPath);
  const outputStat = await fs.stat(previewPath);
  const firstFrameStat = await fs.stat(firstFramePath);
  const blockers = [
    outputProbe.width !== 1080 || outputProbe.height !== 1920 ? "BLOCKED_V112_OUTPUT_DIMENSIONS" : null,
    Math.abs(outputProbe.durationSeconds - sourceProbe.durationSeconds) > 0.25 ? "BLOCKED_V112_OUTPUT_DURATION" : null,
    !outputProbe.hasAudio ? "BLOCKED_V112_OUTPUT_AUDIO_MISSING" : null,
    outputStat.size < 1_000_000 ? "BLOCKED_V112_OUTPUT_FILE_TOO_SMALL" : null,
    firstFrameStat.size < 50_000 ? "BLOCKED_V112_FIRST_FRAME_TOO_SMALL" : null
  ].filter((blocker): blocker is string => Boolean(blocker));

  const report = {
    version: "v112",
    status: blockers.length === 0 ? "preview_ready_for_owner_review" : "blocked",
    mode: "image_skill_visual_quality_preview_no_upload",
    channelKey: V112_CHANNEL_KEY,
    productReference: V112_PRODUCT_REFERENCE,
    sceneCount: sceneInputs.length,
    imageSkillSceneCount: sceneInputs.length,
    newlyGeneratedSceneCount: sceneInputs.filter((scene) => scene.sourceKind === "v112_image_skill").length,
    reusedImageSkillSceneCount: sceneInputs.filter((scene) => scene.sourceKind === "v046_image_skill_reuse").length,
    sourceDurationSeconds: round3(sourceProbe.durationSeconds),
    outputDurationSeconds: round3(outputProbe.durationSeconds),
    outputWidth: outputProbe.width,
    outputHeight: outputProbe.height,
    audioPreserved: outputProbe.hasAudio,
    audioCopyReviewRequired: true,
    replacementUploadReady: false,
    uploadBlockers: ["BLOCKED_V112_AUDIO_COPY_REVIEW_REQUIRED"],
    hookOverlayFirstSceneOnly: true,
    hookOverlayReduced: true,
    productReferenceLocked: true,
    blockers,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    visibilityChanged: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
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

async function renderScene(input: {
  imagePath: string;
  captionPath: string;
  duration: number;
  zoomEnd: number;
  hookOverlay: boolean;
  outputPath: string;
}) {
  const frames = Math.max(1, Math.round(input.duration * 30));
  const zoomStep = ((input.zoomEnd - 1) / frames).toFixed(7);
  const font = escapeFilterPath(fontPath);
  const caption = escapeFilterPath(input.captionPath);
  const common = [
    "scale=1240:2204:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='min(zoom+${zoomStep},${input.zoomEnd.toFixed(3)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`
  ];
  const overlay = input.hookOverlay
    ? [
        "drawbox=x=64:y=118:w=952:h=270:color=black@0.78:t=fill",
        "drawbox=x=64:y=118:w=952:h=10:color=0xfacc15@1:t=fill",
        "drawbox=x=64:y=378:w=952:h=10:color=0xfacc15@1:t=fill",
        `drawtext=fontfile='${font}':textfile='${caption}':x=(w-text_w)/2:y=168:fontsize=82:fontcolor=white:borderw=2:bordercolor=black:line_spacing=14`
      ]
    : [
        "drawbox=x=54:y=1580:w=972:h=116:color=black@0.58:t=fill",
        `drawtext=fontfile='${font}':textfile='${caption}':x=(w-text_w)/2:y=1612:fontsize=46:fontcolor=white:borderw=2:bordercolor=black`
      ];
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-t", input.duration.toFixed(3), "-i", input.imagePath,
    "-vf", [...common, ...overlay, "format=yuv420p"].join(","),
    "-frames:v", String(frames), "-r", "30", "-an", input.outputPath
  ]);
}

async function probeImage(filePath: string) {
  try {
    const [stat, probe] = await Promise.all([fs.stat(filePath), execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath
    ], { windowsHide: true, timeout: 30_000 })]);
    const parsed = JSON.parse(probe.stdout);
    const width = Number(parsed.streams?.[0]?.width ?? 0);
    const height = Number(parsed.streams?.[0]?.height ?? 0);
    return { exists: true, width, height, portrait: height > width, sizeBytes: stat.size };
  } catch {
    return { exists: false, width: 0, height: 0, portrait: false, sizeBytes: 0 };
  }
}

async function probeVideo(filePath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", filePath
  ], { windowsHide: true, timeout: 30_000 });
  const parsed = JSON.parse(stdout);
  const video = parsed.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "video");
  return {
    durationSeconds: Number(parsed.format?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    hasAudio: parsed.streams?.some((stream: { codec_type?: string }) => stream.codec_type === "audio") === true
  };
}

async function runFfmpeg(args: string[]) {
  await execFileAsync("ffmpeg", args, { windowsHide: true, timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeConcatPath(value: string) {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function assertInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("BLOCKED_V112_OUTPUT_PATH_UNSAFE");
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

main().catch(() => {
  process.stdout.write(`${JSON.stringify({
    version: "v112",
    status: "blocked",
    mode: "image_skill_visual_quality_preview_no_upload",
    blocker: "BLOCKED_V112_SAFE_RENDER_FAILURE",
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    R2_upload: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  }, null, 2)}\n`);
  process.exitCode = 1;
});
