import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { MediaQualityEvidence } from "@/video/contracts/renderer";

const execFileAsync = promisify(execFile);

export type MediaQualityGateOptions = {
  ffprobePath?: string;
  ffmpegPath?: string;
  exec?: typeof execFileAsync;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
};

export async function inspectRenderedVideo(
  filePath: string,
  expected: { width: number; height: number; fps: number; durationSeconds: number },
  options: MediaQualityGateOptions = {}
): Promise<MediaQualityEvidence & { file_size_bytes: number }> {
  const run = options.exec ?? execFileAsync;
  const ffprobe = options.ffprobePath ?? "ffprobe";
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const stat = await (options.stat ?? fs.stat)(filePath);
  const { stdout } = await run(ffprobe, [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", filePath
  ], { timeout: 20_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const width = numberOrNull(video?.width);
  const height = numberOrNull(video?.height);
  const duration = numberOrNull(parsed.format?.duration);
  const fps = parseRate(video?.avg_frame_rate);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (width !== expected.width || height !== expected.height) blockers.push("MEDIA_DIMENSIONS_MISMATCH");
  if (fps === null || Math.abs(fps - expected.fps) > 0.2) blockers.push("MEDIA_FPS_MISMATCH");
  if (duration === null || Math.abs(duration - expected.durationSeconds) > 1) blockers.push("MEDIA_DURATION_MISMATCH");
  if (video?.codec_name !== "h264") blockers.push("MEDIA_VIDEO_CODEC_NOT_H264");
  if (video?.pix_fmt !== "yuv420p") blockers.push("MEDIA_PIXEL_FORMAT_NOT_YUV420P");
  if (!audio) blockers.push("MEDIA_AUDIO_STREAM_MISSING");
  if (audio && audio.codec_name !== "aac") blockers.push("MEDIA_AUDIO_CODEC_NOT_AAC");
  const blackFrameDetected = await detectBlackFrame(run, ffmpeg, filePath);
  if (blackFrameDetected) blockers.push("MEDIA_BLACK_FRAME_DETECTED");
  const bytes = await (options.readFile ?? fs.readFile)(filePath);
  const text = bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)).toString("latin1");
  const moov = text.indexOf("moov");
  const mdat = text.indexOf("mdat");
  const faststart = moov >= 0 && (mdat < 0 || moov < mdat);
  if (!faststart) warnings.push("MEDIA_FASTSTART_NOT_CONFIRMED");
  return {
    status: blockers.length === 0 ? "PASS" : "FAIL",
    width,
    height,
    fps,
    duration_seconds: duration,
    video_codec: stringOrNull(video?.codec_name),
    pixel_format: stringOrNull(video?.pix_fmt),
    audio_codec: stringOrNull(audio?.codec_name),
    audio_stream_present: Boolean(audio),
    faststart,
    black_frame_detected: blackFrameDetected,
    warnings,
    blockers,
    file_size_bytes: stat.size
  };
}

async function detectBlackFrame(run: typeof execFileAsync, ffmpeg: string, filePath: string) {
  try {
    const { stderr } = await run(ffmpeg, [
      "-hide_banner", "-nostats", "-i", filePath,
      "-vf", "blackdetect=d=0.5:pix_th=0.02", "-an", "-f", "null", "-"
    ], { timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return /black_duration:([0-9.]+)/.test(stderr);
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    return /black_duration:([0-9.]+)/.test(stderr);
  }
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function parseRate(value: unknown) {
  if (typeof value !== "string") return null;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}
