import fs from "node:fs/promises";
import path from "node:path";
import { renderRequestSchema, type RenderRequest, type VideoRenderer } from "@/video/contracts/renderer";
import { validateProductImages } from "@/video/photoToShort/imageValidator";
import { buildMotionClips } from "@/video/photoToShort/motionClipBuilder";
import { buildPhotoToShortPlan } from "@/video/photoToShort/photoToShortPlan";
import {
  createThumbnail,
  defaultExecFile,
  failedRenderResult,
  finalizeRenderResult,
  writeSanitizedRenderLog
} from "@/video/renderers/renderSupport";

export class LegacyPhotoRenderer implements VideoRenderer {
  readonly name = "legacy" as const;
  readonly version = "photo-ffmpeg-v1";

  async render(rawRequest: RenderRequest) {
    const started = Date.now();
    const request = renderRequestSchema.parse(rawRequest);
    try {
      const validatedImages = await validateProductImages(request.product_images);
      const verifiedRequest = withValidatedImages(request, validatedImages);
      const plan = buildPhotoToShortPlan(verifiedRequest);
      const root = path.join(request.output_directory, "legacy");
      await fs.mkdir(root, { recursive: true });
      const clips = await buildMotionClips(plan, root);
      const concatPath = path.join(root, "concat.txt");
      await fs.writeFile(concatPath, `${clips.map((clip) => `file '${escapeConcat(clip.path)}'`).join("\n")}\n`, "utf8");
      const finalPath = path.join(root, "final.mp4");
      const previewPath = path.join(root, "preview.mp4");
      const thumbnailPath = path.join(root, "thumbnail.jpg");
      await defaultExecFile("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", concatPath,
        "-c", "copy", "-movflags", "+faststart", finalPath
      ], { timeout: 180_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      await fs.copyFile(finalPath, previewPath);
      await createThumbnail(request.product_images[0]!.path, thumbnailPath);
      await writeSanitizedRenderLog(root, "NO_ERRORS");
      return finalizeRenderResult({
        request: verifiedRequest,
        rendererName: this.name,
        rendererVersion: this.version,
        upstreamCommit: null,
        outputVideoPath: finalPath,
        previewVideoPath: previewPath,
        thumbnailPath,
        manifestPath: path.join(root, "render_manifest.json"),
        qualityReportPath: path.join(root, "quality_report.json"),
        elapsedSeconds: (Date.now() - started) / 1000
      });
    } catch (error) {
      return failedRenderResult(
        request,
        this.name,
        this.version,
        safeError(error, "LEGACY_RENDER_FAILED"),
        (Date.now() - started) / 1000
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

function escapeConcat(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]+$/.test(message) ? message : fallback;
}
