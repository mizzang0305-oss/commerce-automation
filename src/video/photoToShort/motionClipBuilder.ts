import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { MotionEffect } from "@/video/contracts/renderer";
import type { PhotoToShortPlan } from "@/video/photoToShort/photoToShortPlan";

const execFileAsync = promisify(execFile);

export type MotionClipBuilderOptions = {
  ffmpegPath?: string;
  timeoutMs?: number;
  exec?: typeof execFileAsync;
};

export async function buildMotionClips(
  plan: PhotoToShortPlan,
  outputDirectory: string,
  options: MotionClipBuilderOptions = {}
) {
  const run = options.exec ?? execFileAsync;
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const clipsDirectory = path.join(outputDirectory, "motion-clips");
  await fs.mkdir(clipsDirectory, { recursive: true });
  const clips: Array<{ path: string; duration_seconds: number; caption: string }> = [];
  for (const scene of plan.scenes) {
    const output = path.join(clipsDirectory, `scene-${String(scene.index).padStart(3, "0")}.mp4`);
    await run(ffmpeg, buildMotionClipArgs({
      imagePath: scene.image_path,
      outputPath: output,
      durationSeconds: scene.duration_seconds,
      effect: scene.effect,
      width: plan.width,
      height: plan.height,
      fps: plan.fps
    }), {
      timeout: options.timeoutMs ?? 120_000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });
    clips.push({ path: output, duration_seconds: scene.duration_seconds, caption: scene.caption });
  }
  return clips;
}

export function buildMotionClipArgs(input: {
  imagePath: string;
  outputPath: string;
  durationSeconds: number;
  effect: MotionEffect;
  width: number;
  height: number;
  fps: number;
}) {
  const frames = Math.max(1, Math.round(input.durationSeconds * input.fps));
  const base = `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2:color=0x111827`;
  const zoom = motionFilter(input.effect, frames, input.width, input.height, input.fps);
  const filter = `${base},${zoom},format=yuv420p`;
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-loop", "1", "-framerate", String(input.fps), "-i", input.imagePath,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex", `[0:v]${filter}[v]`,
    "-map", "[v]", "-map", "1:a:0",
    "-t", input.durationSeconds.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-r", String(input.fps), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest", input.outputPath
  ];
}

function motionFilter(effect: MotionEffect, frames: number, width: number, height: number, fps: number) {
  const progress = `on/${Math.max(1, frames - 1)}`;
  switch (effect) {
    case "slow_push_in":
      return `zoompan=z='min(1+0.08*${progress},1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
    case "slow_pull_out":
      return `zoompan=z='max(1.08-0.08*${progress},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
    case "pan_left_to_right":
      return `zoompan=z='1.08':x='(iw-iw/zoom)*${progress}':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
    case "pan_right_to_left":
      return `zoompan=z='1.08':x='(iw-iw/zoom)*(1-${progress})':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
    case "static_hold":
      return `fps=${fps}`;
  }
}
