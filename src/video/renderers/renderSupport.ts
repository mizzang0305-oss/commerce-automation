import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RenderRequest, RenderResult, RendererName } from "@/video/contracts/renderer";
import type { PhotoToShortPlan } from "@/video/photoToShort/photoToShortPlan";
import { inspectRenderedVideo } from "@/video/quality/mediaQualityGate";

export const defaultExecFile = promisify(execFile);

export function sourceHash(request: RenderRequest) {
  return createHash("sha256").update(JSON.stringify({
    product_id: request.product_id,
    campaign_id: request.campaign_id,
    title: request.title,
    images: request.product_images.map((image) => image.sha256 ?? image.path),
    duration: request.target_duration_seconds,
    template: request.template_id
  })).digest("hex");
}

export async function writeSrt(plan: PhotoToShortPlan, filePath: string) {
  let elapsed = 0;
  const blocks = plan.scenes.map((scene, index) => {
    const start = elapsed;
    elapsed += scene.duration_seconds;
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(elapsed)}\n${scene.caption}\n`;
  });
  await fs.writeFile(filePath, `${blocks.join("\n")}\n`, "utf8");
}

export async function writeSanitizedRenderLog(directory: string, status: string) {
  const safeStatus = /^[A-Z0-9_]+$/.test(status) ? status : "RENDER_STATUS_REDACTED";
  await fs.writeFile(path.join(directory, "stderr.log"), `${safeStatus}\n`, "utf8");
}

export async function createThumbnail(
  imagePath: string,
  outputPath: string,
  ffmpegPath = "ffmpeg",
  run = defaultExecFile
) {
  await run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", imagePath,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x111827",
    "-frames:v", "1", outputPath
  ], { timeout: 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

export async function normalizeVideo(
  inputPath: string,
  outputPath: string,
  fps: number,
  options: {
    ffmpegPath?: string;
    subtitlePath?: string;
    run?: typeof defaultExecFile;
  } = {}
) {
  const run = options.run ?? defaultExecFile;
  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
  const subtitleDirectory = options.subtitlePath ? path.dirname(options.subtitlePath) : undefined;
  const subtitleFilter = options.subtitlePath
    ? `subtitles=filename='${path.basename(options.subtitlePath)}':force_style='FontName=Malgun Gothic,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=170'`
    : null;
  await run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    ...(subtitleFilter ? ["-vf", subtitleFilter] : []),
    "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart", outputPath
  ], {
    timeout: 180_000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...(subtitleDirectory ? { cwd: subtitleDirectory } : {})
  });
}

export async function finalizeRenderResult(input: {
  request: RenderRequest;
  rendererName: RendererName;
  rendererVersion: string;
  upstreamCommit: string | null;
  outputVideoPath: string;
  previewVideoPath: string;
  thumbnailPath: string;
  manifestPath: string;
  qualityReportPath: string;
  elapsedSeconds: number;
  warnings?: string[];
}) : Promise<RenderResult> {
  const quality = await inspectRenderedVideo(input.outputVideoPath, {
    width: input.request.width,
    height: input.request.height,
    fps: input.request.fps,
    durationSeconds: input.request.target_duration_seconds
  });
  const result: RenderResult = {
    success: quality.status === "PASS",
    renderer_name: input.rendererName,
    renderer_version: input.rendererVersion,
    upstream_commit: input.upstreamCommit,
    output_video_path: input.outputVideoPath,
    preview_video_path: input.previewVideoPath,
    thumbnail_path: input.thumbnailPath,
    duration_seconds: quality.duration_seconds,
    width: quality.width,
    height: quality.height,
    fps: quality.fps,
    video_codec: quality.video_codec,
    audio_codec: quality.audio_codec,
    file_size_bytes: quality.file_size_bytes,
    source_hash: sourceHash(input.request),
    render_manifest_path: input.manifestPath,
    quality_report_path: input.qualityReportPath,
    quality,
    warnings: [...(input.warnings ?? []), ...quality.warnings],
    errors: [...quality.blockers],
    elapsed_seconds: input.elapsedSeconds,
    live_upload_attempted: false,
    production_db_write_attempted: false
  };
  await fs.writeFile(input.qualityReportPath, `${JSON.stringify(quality, null, 2)}\n`, "utf8");
  await fs.writeFile(input.manifestPath, `${JSON.stringify({
    schemaVersion: "1.0",
    jobId: input.request.job_id,
    productId: input.request.product_id,
    renderer: input.rendererName,
    rendererVersion: input.rendererVersion,
    videoUseCommit: input.upstreamCommit,
    templateId: input.request.template_id,
    createdAt: new Date().toISOString(),
    sourceTimestamp: input.request.source_timestamp,
    sourceImages: input.request.product_images.map((image) => ({
      sha256: image.sha256 ?? null,
      width: image.width ?? null,
      height: image.height ?? null
    })),
    renderConfig: {
      width: input.request.width,
      height: input.request.height,
      fps: input.request.fps,
      durationSeconds: input.request.target_duration_seconds
    },
    outputs: {
      preview: path.basename(input.previewVideoPath),
      final: path.basename(input.outputVideoPath),
      thumbnail: path.basename(input.thumbnailPath)
    },
    quality: { status: quality.status, warnings: quality.warnings, blockers: quality.blockers },
    compliance: {
      status: input.request.disclosure.trim() ? "PASS" : "FAIL",
      disclosurePresent: Boolean(input.request.disclosure.trim())
    },
    liveUploadAttempted: false,
    productionDbWriteAttempted: false,
    sanitizedMetadata: sanitizeMetadata(input.request.metadata)
  }, null, 2)}\n`, "utf8");
  return result;
}

export function failedRenderResult(
  request: RenderRequest,
  rendererName: RendererName,
  rendererVersion: string,
  errorCode: string,
  elapsedSeconds: number,
  upstreamCommit: string | null = null
): RenderResult {
  return {
    success: false,
    renderer_name: rendererName,
    renderer_version: rendererVersion,
    upstream_commit: upstreamCommit,
    output_video_path: null,
    preview_video_path: null,
    thumbnail_path: null,
    duration_seconds: null,
    width: null,
    height: null,
    fps: null,
    video_codec: null,
    audio_codec: null,
    file_size_bytes: null,
    source_hash: sourceHash(request),
    render_manifest_path: null,
    quality_report_path: null,
    quality: {
      status: "FAIL", width: null, height: null, fps: null, duration_seconds: null,
      video_codec: null, pixel_format: null, audio_codec: null, audio_stream_present: false,
      faststart: false, black_frame_detected: false, warnings: [], blockers: [errorCode]
    },
    warnings: [],
    errors: [errorCode],
    elapsed_seconds: elapsedSeconds,
    live_upload_attempted: false,
    production_db_write_attempted: false
  };
}

function timestamp(seconds: number) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(ms).padStart(3, "0")}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function sanitizeMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    if (/token|secret|authorization|cookie|affiliate|url|credential|password/i.test(key)) return [];
    if (typeof entry === "string") return [[key, entry.slice(0, 200)]];
    if (["number", "boolean"].includes(typeof entry) || entry === null) return [[key, entry]];
    return [];
  }));
}
