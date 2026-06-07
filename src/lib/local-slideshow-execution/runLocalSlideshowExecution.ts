import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildFfmpegArgs } from "@/lib/local-slideshow-execution/buildFfmpegCommand";
import { buildMoviePyScript } from "@/lib/local-slideshow-execution/buildMoviePyScript";
import {
  buildLocalSlideshowExecutionSideEffects,
  localSlideshowExecutionConfirmationPhrase,
  localSlideshowExecutionSafeBlockedSideEffects
} from "@/lib/local-slideshow-execution/constants";
import { resolveInputAssets } from "@/lib/local-slideshow-execution/resolveInputAssets";
import { writeRenderManifest, writeRenderReport } from "@/lib/local-slideshow-execution/writeRenderReport";
import type {
  LocalSlideshowExecutionRequest,
  LocalSlideshowExecutionResult,
  LocalSlideshowRenderEngine,
  LocalSlideshowRenderEnginePreference
} from "@/lib/local-slideshow-execution/types";

const execFileAsync = promisify(execFile);

function truncateLog(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .map((line) => line.slice(0, 500));
}

function outputBase(candidateId: string) {
  const safeCandidateId = candidateId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const outputDir = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "commerce-assets",
    "output",
    "video-packages",
    safeCandidateId
  );
  return {
    outputDir,
    outputVideoPath: path.join(outputDir, `${safeCandidateId}_shorts_v001.mp4`),
    outputManifestPath: path.join(outputDir, `${safeCandidateId}_shorts_v001.manifest.json`),
    outputReportPath: path.join(outputDir, `${safeCandidateId}_shorts_v001.render-report.json`)
  };
}

function blockedResult(
  request: Pick<LocalSlideshowExecutionRequest, "candidateId">,
  engine: LocalSlideshowRenderEngine,
  warnings: string[]
): LocalSlideshowExecutionResult {
  return {
    id: `${request.candidateId}-local-slideshow-render-execution`,
    candidate_id: request.candidateId,
    mode: "local_slideshow_render_execution",
    confirmation_required: localSlideshowExecutionConfirmationPhrase,
    confirmation_matched: true,
    render_engine: engine,
    execution_attempted: false,
    execution_succeeded: false,
    output_video_path: null,
    output_manifest_path: null,
    output_report_path: null,
    logs_preview: [],
    warnings,
    side_effects: { ...localSlideshowExecutionSafeBlockedSideEffects },
    approval_required: true
  };
}

async function hasExecutable(command: string) {
  try {
    await execFileAsync(command, ["-version"], { timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function runFfmpeg(inputAssets: Awaited<ReturnType<typeof resolveInputAssets>>["assets"], outputVideoPath: string) {
  const args = buildFfmpegArgs(inputAssets, outputVideoPath);
  return execFileAsync("ffmpeg", args, { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 16 });
}

async function runMoviePy(inputAssets: Awaited<ReturnType<typeof resolveInputAssets>>["assets"], outputVideoPath: string) {
  const script = buildMoviePyScript(inputAssets, outputVideoPath);
  const tempDir = await fs.mkdtemp(path.join(/* turbopackIgnore: true */ os.tmpdir(), "commerce-slideshow-render-"));
  const scriptPath = path.join(tempDir, "render_slideshow.py");
  await fs.writeFile(scriptPath, script, "utf8");
  const pythonPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "python-worker",
    ".venv",
    "Scripts",
    "python.exe"
  );
  return execFileAsync(pythonPath, [scriptPath], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function engineOrder(preference: LocalSlideshowRenderEnginePreference | undefined): LocalSlideshowRenderEngine[] {
  if (preference === "moviepy") {
    return ["moviepy"];
  }
  if (preference === "ffmpeg") {
    return ["ffmpeg"];
  }
  return ["ffmpeg", "moviepy"];
}

export async function runLocalSlideshowExecution(
  request: LocalSlideshowExecutionRequest
): Promise<LocalSlideshowExecutionResult> {
  const preferredEngines = engineOrder(request.enginePreference);
  const firstEngine = preferredEngines[0] ?? "ffmpeg";
  const resolved = await resolveInputAssets(request.renderPackage, request.inputImagePaths);

  if (!resolved.ok) {
    return blockedResult(request, firstEngine, [resolved.blocked_reason ?? "Input image assets could not be resolved."]);
  }

  const { outputDir, outputVideoPath, outputManifestPath, outputReportPath } = outputBase(request.candidateId);
  await fs.mkdir(outputDir, { recursive: true });

  const warnings: string[] = [...resolved.warnings];
  for (const engine of preferredEngines) {
    if (engine === "ffmpeg" && !(await hasExecutable("ffmpeg"))) {
      warnings.push("FFmpeg executable was not found; trying fallback if available.");
      continue;
    }

    try {
      const execution =
        engine === "ffmpeg"
          ? await runFfmpeg(resolved.assets, outputVideoPath)
          : await runMoviePy(resolved.assets, outputVideoPath);
      const stat = await fs.stat(outputVideoPath);
      if (!stat.isFile() || stat.size <= 0) {
        warnings.push(`${engine} finished without a non-empty output mp4.`);
        continue;
      }

      const result: LocalSlideshowExecutionResult = {
        id: `${request.candidateId}-local-slideshow-render-execution`,
        candidate_id: request.candidateId,
        mode: "local_slideshow_render_execution",
        confirmation_required: localSlideshowExecutionConfirmationPhrase,
        confirmation_matched: true,
        render_engine: engine,
        execution_attempted: true,
        execution_succeeded: true,
        output_video_path: outputVideoPath,
        output_manifest_path: outputManifestPath,
        output_report_path: outputReportPath,
        logs_preview: truncateLog(`${execution.stdout ?? ""}\n${execution.stderr ?? ""}`),
        warnings,
        side_effects: buildLocalSlideshowExecutionSideEffects({
          local_file_read: true,
          local_file_written: true,
          video_generated: true,
          ffmpeg_executed: engine === "ffmpeg",
          moviepy_executed: engine === "moviepy"
        }),
        approval_required: true
      };

      await writeRenderManifest({
        candidateId: request.candidateId,
        inputAssets: resolved.assets,
        outputVideoPath,
        outputManifestPath,
        engine
      });
      await writeRenderReport(outputReportPath, result);
      return result;
    } catch (error) {
      warnings.push(`${engine} execution failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    ...blockedResult(request, firstEngine, warnings.length > 0 ? warnings : ["No local render engine completed successfully."]),
    execution_attempted: true,
    output_video_path: null,
    output_manifest_path: outputManifestPath,
    output_report_path: outputReportPath
  };
}
