import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RenderImage } from "@/video/contracts/renderer";

const execFileAsync = promisify(execFile);
const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type ValidatedImage = {
  path: string;
  sha256: string;
  width: number;
  height: number;
  codec: string;
};

export type ImageValidationDependencies = {
  ffprobePath?: string;
  exec?: typeof execFileAsync;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
};

export async function validateProductImages(
  images: RenderImage[],
  dependencies: ImageValidationDependencies = {}
): Promise<ValidatedImage[]> {
  const run = dependencies.exec ?? execFileAsync;
  const readFile = dependencies.readFile ?? fs.readFile;
  const stat = dependencies.stat ?? fs.stat;
  const ffprobe = dependencies.ffprobePath ?? "ffprobe";
  const validated: ValidatedImage[] = [];
  const hashes = new Set<string>();
  for (const image of images) {
    if (!path.isAbsolute(image.path)) throw new Error("PHOTO_SOURCE_PATH_MUST_BE_ABSOLUTE");
    if (!SUPPORTED.has(path.extname(image.path).toLowerCase())) throw new Error("PHOTO_SOURCE_FORMAT_NOT_SUPPORTED");
    const fileStat = await stat(image.path).catch(() => null);
    if (!fileStat?.isFile() || fileStat.size <= 0) throw new Error("PHOTO_SOURCE_FILE_NOT_READABLE");
    const bytes = await readFile(image.path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (image.sha256 && image.sha256.toLowerCase() !== sha256) throw new Error("PHOTO_SOURCE_HASH_MISMATCH");
    if (hashes.has(sha256)) throw new Error("PHOTO_SOURCE_DUPLICATE_HASH");
    hashes.add(sha256);
    const { stdout } = await run(ffprobe, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height",
      "-of", "json", image.path
    ], { timeout: 15_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout) as { streams?: Array<{ codec_name?: string; width?: number; height?: number }> };
    const stream = probe.streams?.[0];
    const width = Number(stream?.width);
    const height = Number(stream?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("PHOTO_SOURCE_DECODE_FAILED");
    if (width < 480 || height < 480) throw new Error("PHOTO_SOURCE_RESOLUTION_TOO_SMALL");
    validated.push({ path: image.path, sha256, width, height, codec: stream?.codec_name ?? "unknown" });
  }
  return validated;
}
