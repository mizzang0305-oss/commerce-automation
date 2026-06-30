import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExtractedSceneFrame = {
  timestamp_seconds: number;
  frame_path: string;
  width: number;
  height: number;
  file_size_bytes: number;
};

export type RealSceneFrameExtractionResult = {
  rendered_video_frame_extract_success: boolean;
  frames: ExtractedSceneFrame[];
  blocker: string | null;
};

export async function extractRealSceneFrames(input: {
  videoPath: string;
  outputDir: string;
  timestampsSeconds?: number[];
}): Promise<RealSceneFrameExtractionResult> {
  const timestamps = input.timestampsSeconds ?? [0.5, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  await fs.mkdir(input.outputDir, { recursive: true });
  const frames: ExtractedSceneFrame[] = [];

  try {
    await fs.stat(input.videoPath);
    for (const timestamp of timestamps) {
      const framePath = path.join(input.outputDir, `frame-${timestamp.toString().replace(".", "_")}s.jpg`);
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        timestamp.toString(),
        "-i",
        input.videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        framePath
      ], {
        windowsHide: true,
        timeout: 120000
      });
      const [probe, frameStat] = await Promise.all([
        probeImageSize(framePath),
        fs.stat(framePath)
      ]);
      frames.push({
        timestamp_seconds: timestamp,
        frame_path: framePath,
        width: probe.width,
        height: probe.height,
        file_size_bytes: frameStat.size
      });
    }

    return {
      rendered_video_frame_extract_success: frames.length === timestamps.length,
      frames,
      blocker: frames.length === timestamps.length ? null : "VIDEO_FRAME_EXTRACT_FAIL"
    };
  } catch {
    return {
      rendered_video_frame_extract_success: false,
      frames,
      blocker: "VIDEO_FRAME_EXTRACT_FAIL"
    };
  }
}

export async function probeVideoDurationSeconds(videoPath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    videoPath
  ], {
    windowsHide: true,
    timeout: 30000
  });
  return Number.parseFloat(stdout.trim());
}

export async function probeImageSize(imagePath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=s=x:p=0",
    imagePath
  ], {
    windowsHide: true,
    timeout: 30000
  });
  const [width, height] = stdout.trim().split("x").map((part) => Number.parseInt(part, 10));
  return { width, height };
}
