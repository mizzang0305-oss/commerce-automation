import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type QueueMediaEvidence = {
  videoPath: string;
  videoSha256: string;
  videoSize: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  passed: boolean;
  blockers: string[];
};

type FfprobeJson = {
  streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
  format?: { duration?: string };
};

export async function inspectQueueMediaEvidence(videoPath: string, dependencies: {
  probe?: (path: string) => Promise<FfprobeJson>;
  hash?: (path: string) => Promise<string>;
  size?: (path: string) => Promise<number>;
} = {}): Promise<QueueMediaEvidence> {
  const [probe, videoSha256, videoSize] = await Promise.all([
    (dependencies.probe ?? ffprobe)(videoPath),
    (dependencies.hash ?? sha256File)(videoPath),
    (dependencies.size ?? (async (path) => (await stat(path)).size))(videoPath),
  ]);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const fps = parseFrameRate(video?.r_frame_rate ?? "");
  const durationSeconds = Number(probe.format?.duration ?? 0);
  const blockers: string[] = [];
  if (videoSize <= 0) blockers.push("VIDEO_FILE_EMPTY");
  if (!/^[a-f0-9]{64}$/u.test(videoSha256)) blockers.push("VIDEO_SHA256_INVALID");
  if (video?.codec_name !== "h264") blockers.push("VIDEO_CODEC_NOT_H264");
  if (audio?.codec_name !== "aac") blockers.push("AUDIO_CODEC_NOT_AAC");
  if (video?.width !== 1080 || video?.height !== 1920) blockers.push("VIDEO_RESOLUTION_INVALID");
  if (!Number.isFinite(fps) || Math.abs(fps - 30) > 0.01) blockers.push("VIDEO_FPS_INVALID");
  if (!Number.isFinite(durationSeconds) || durationSeconds < 15 || durationSeconds > 60) blockers.push("VIDEO_DURATION_INVALID");
  return {
    videoPath,
    videoSha256,
    videoSize,
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name ?? "",
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps,
    durationSeconds,
    passed: blockers.length === 0,
    blockers,
  };
}

export async function sha256File(path: string): Promise<string> {
  const digest = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return digest.digest("hex");
}

function parseFrameRate(value: string) {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return numerator / denominator;
}

async function ffprobe(path: string): Promise<FfprobeJson> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    "--", path,
  ], { windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as FfprobeJson;
}
