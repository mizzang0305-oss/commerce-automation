import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { renderRequestSchema, type RenderRequest, type VideoRenderer } from "@/video/contracts/renderer";
import type { VideoRendererConfig } from "@/video/config/videoRendererConfig";
import { validateProductImages } from "@/video/photoToShort/imageValidator";
import { buildMotionClips } from "@/video/photoToShort/motionClipBuilder";
import { buildPhotoToShortPlan } from "@/video/photoToShort/photoToShortPlan";
import {
  createThumbnail,
  defaultExecFile,
  failedRenderResult,
  finalizeRenderResult,
  normalizeVideo,
  writeSanitizedRenderLog,
  writeSrt
} from "@/video/renderers/renderSupport";

export class VideoUsePhotoRenderer implements VideoRenderer {
  readonly name = "video_use" as const;
  readonly version = "photo-adapter-v1";

  constructor(private readonly config: VideoRendererConfig) {}

  async render(rawRequest: RenderRequest) {
    const started = Date.now();
    const request = renderRequestSchema.parse(rawRequest);
    if (!this.config.videoUseEnabled) {
      return failedRenderResult(request, this.name, this.version, "VIDEO_USE_DISABLED", 0, this.config.videoUseCommit);
    }
    try {
      await verifyPinnedUpstream(this.config.videoUsePath, this.config.videoUseCommit, this.config.renderTimeoutMs);
      const validatedImages = await validateProductImages(request.product_images);
      const verifiedRequest = withValidatedImages(request, validatedImages);
      const plan = buildPhotoToShortPlan(verifiedRequest);
      const root = path.join(request.output_directory, "video-use", "edit");
      await fs.mkdir(root, { recursive: true });
      const clips = await buildMotionClips(plan, root, { timeoutMs: this.config.renderTimeoutMs });
      const subtitlesPath = path.join(root, "master.srt");
      await writeSrt(plan, subtitlesPath);
      const edl = {
        version: 1,
        sources: Object.fromEntries(clips.map((clip, index) => [`scene_${index + 1}`, clip.path])),
        ranges: clips.map((clip, index) => ({
          source: `scene_${index + 1}`,
          start: 0,
          end: clip.duration_seconds,
          beat: plan.scenes[index]?.index === 1 ? "HOOK" : "PRODUCT",
          quote: "photo-to-short",
          reason: plan.scenes[index]?.effect ?? "static_hold"
        })),
        grade: "subtle",
        overlays: [],
        subtitles: null,
        total_duration_s: request.target_duration_seconds
      };
      const edlPath = path.join(root, "edl.json");
      await fs.writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`, "utf8");
      const upstreamPreview = path.join(root, "preview-upstream-24fps.mp4");
      const upstreamFinal = path.join(root, "final-upstream-24fps.mp4");
      const renderScript = path.join(this.config.videoUsePath, "helpers", "render.py");
      const python = process.env.VIDEO_USE_PYTHON?.trim() || "python";
      const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
      await defaultExecFile(python, [renderScript, edlPath, "-o", upstreamPreview, "--preview", "--no-subtitles", "--no-loudnorm"], {
        timeout: this.config.renderTimeoutMs,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env
      });
      await defaultExecFile(python, [renderScript, edlPath, "-o", upstreamFinal, "--no-subtitles", "--no-loudnorm"], {
        timeout: this.config.renderTimeoutMs,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env
      });
      const previewPath = path.join(root, "preview.mp4");
      const finalPath = path.join(root, "final.mp4");
      await normalizeVideo(upstreamPreview, previewPath, request.fps, { subtitlePath: subtitlesPath });
      await normalizeVideo(upstreamFinal, finalPath, request.fps, { subtitlePath: subtitlesPath });
      const thumbnailPath = path.join(root, "thumbnail.jpg");
      await createThumbnail(request.product_images[0]!.path, thumbnailPath);
      await writeSanitizedRenderLog(root, "NO_ERRORS");
      const result = await finalizeRenderResult({
        request: verifiedRequest,
        rendererName: this.name,
        rendererVersion: this.version,
        upstreamCommit: this.config.videoUseCommit,
        outputVideoPath: finalPath,
        previewVideoPath: previewPath,
        thumbnailPath,
        manifestPath: path.join(root, "render_manifest.json"),
        qualityReportPath: path.join(root, "quality_report.json"),
        elapsedSeconds: (Date.now() - started) / 1000,
        warnings: this.config.allowTts ? [] : ["ELEVENLABS_NOT_REQUIRED", "VOICEOVER_OPTIONAL_SILENT_AAC_USED"]
      });
      if (!this.config.keepIntermediate) {
        await Promise.all([upstreamPreview, upstreamFinal].map((file) => fs.rm(file, { force: true })));
      }
      return result;
    } catch (error) {
      return failedRenderResult(
        request,
        this.name,
        this.version,
        safeError(error),
        (Date.now() - started) / 1000,
        this.config.videoUseCommit
      );
    }
  }
}

function withValidatedImages(
  request: RenderRequest,
  validated: Awaited<ReturnType<typeof validateProductImages>>
): RenderRequest {
  return {
    ...request,
    product_images: validated.map((image) => ({
      path: image.path,
      sha256: image.sha256,
      width: image.width,
      height: image.height
    }))
  };
}

async function verifyPinnedUpstream(videoUsePath: string, expectedCommit: string, timeout: number) {
  const renderScript = path.join(videoUsePath, "helpers", "render.py");
  const stat = await fs.stat(renderScript).catch(() => null);
  if (!stat?.isFile()) throw new Error("VIDEO_USE_NOT_FOUND");
  const { stdout } = await defaultExecFile("git", ["-C", videoUsePath, "rev-parse", "HEAD"], {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (stdout.trim() !== expectedCommit) throw new Error("VIDEO_USE_COMMIT_MISMATCH");
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/timed out|ETIMEDOUT|SIGTERM/i.test(message)) return "VIDEO_USE_RENDER_TIMEOUT";
  return /^[A-Z0-9_]+$/.test(message) ? message : "VIDEO_USE_RENDER_FAILED";
}
