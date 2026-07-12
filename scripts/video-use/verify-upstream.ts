import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pin from "../../config/video-use.upstream.json";

const run = promisify(execFile);

async function commandReady(command: string, args: string[]) {
  try {
    const { stdout, stderr } = await run(command, args, {
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }
    });
    return { ready: true, version: `${stdout || stderr}`.split(/\r?\n/, 1)[0]?.trim() ?? "" };
  } catch {
    return { ready: false, version: "" };
  }
}

async function main() {
  const cwd = process.cwd();
  const videoUsePath = path.resolve(process.env.VIDEO_USE_PATH?.trim() || path.join(cwd, ".tools", "video-use"));
  const renderPath = path.join(videoUsePath, "helpers", "render.py");
  const renderFound = (await fs.stat(renderPath).catch(() => null))?.isFile() === true;
  const commit = renderFound
    ? (await run("git", ["-C", videoUsePath, "rev-parse", "HEAD"], { timeout: 15_000, windowsHide: true })).stdout.trim()
    : "";
  const [ffmpeg, ffprobe, python, node] = await Promise.all([
    commandReady("ffmpeg", ["-version"]),
    commandReady("ffprobe", ["-version"]),
    commandReady(process.env.VIDEO_USE_PYTHON?.trim() || "python", ["--version"]),
    commandReady("node", ["--version"])
  ]);
  const report = {
    VIDEO_USE_FOUND: renderFound,
    VIDEO_USE_COMMIT_MATCH: commit === pin.commit,
    VIDEO_USE_COMMIT: commit || null,
    FFMPEG_FOUND: ffmpeg.ready,
    FFPROBE_FOUND: ffprobe.ready,
    PYTHON_DEPS_READY: python.ready,
    NODE_READY: node.ready,
    ELEVENLABS_NOT_REQUIRED: true,
    RENDER_SMOKE_READY: renderFound && commit === pin.commit && ffmpeg.ready && ffprobe.ready && python.ready,
    LIVE_UPLOAD: false,
    PRODUCTION_DB_WRITE: false,
    secrets_printed: false
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.RENDER_SMOKE_READY) process.exitCode = 1;
}

main().catch(() => {
  process.stdout.write(`${JSON.stringify({
    VIDEO_USE_FOUND: false,
    VIDEO_USE_COMMIT_MATCH: false,
    RENDER_SMOKE_READY: false,
    LIVE_UPLOAD: false,
    secrets_printed: false,
    blocker: "VIDEO_USE_VERIFY_SAFE_FAILURE"
  }, null, 2)}\n`);
  process.exitCode = 1;
});
