import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  GeneratedProductVideoAsset,
  LocalVideoGenerator
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";
import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);
const DEFAULT_DURATION_SECONDS = 12;

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export type OneProductLocalVideoGeneratorDependencies = {
  cwd?: string;
  execFileAsync?: ExecFileAsync;
  mkdir?: typeof fs.mkdir;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
};

export function getOneProductLocalVideoGenerator(): LocalVideoGenerator {
  return createOneProductLocalVideoGenerator();
}

export function createOneProductLocalVideoGenerator(
  dependencies: OneProductLocalVideoGeneratorDependencies = {}
): LocalVideoGenerator {
  const cwd = dependencies.cwd ?? process.cwd();
  const run = dependencies.execFileAsync ?? execFileAsync;
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const readFile = dependencies.readFile ?? fs.readFile;
  const stat = dependencies.stat ?? fs.stat;

  return async (candidate: ProductCandidate): Promise<GeneratedProductVideoAsset> => {
    const imageUrl = pickCandidateImageUrl(candidate);
    if (!imageUrl) {
      throw new Error("candidate_image_url_not_ready");
    }

    const safeCandidateId = toSafeSlug(candidate.id);
    const outputDir = path.join(
      /* turbopackIgnore: true */ cwd,
      "commerce-assets",
      "output",
      "video-packages",
      `real-product-${safeCandidateId}`
    );
    const outputVideoPath = path.join(outputDir, `${safeCandidateId}_one_product_v001.mp4`);

    await mkdir(outputDir, { recursive: true });
    await run("ffmpeg", buildFfmpegArgs({
      imageUrl,
      outputVideoPath,
      productName: candidate.product_name
    }), {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });

    const outputStat = await stat(outputVideoPath);
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new Error("local_video_output_empty");
    }

    const fileBuffer = await readFile(outputVideoPath);
    return {
      candidate_id: candidate.id,
      local_video_path: outputVideoPath,
      mime_type: "video/mp4",
      size_bytes: outputStat.size,
      duration_seconds: DEFAULT_DURATION_SECONDS,
      checksum_sha256: createHash("sha256").update(fileBuffer).digest("hex"),
      black_screen_detected: null,
      generated_this_run: true,
      local_only: true
    };
  };
}

function buildFfmpegArgs(input: {
  imageUrl: string;
  outputVideoPath: string;
  productName: string;
}) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-t",
    String(DEFAULT_DURATION_SECONDS),
    "-i",
    input.imageUrl,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p",
    "-r",
    "30",
    "-an",
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${sanitizeMetadata(input.productName)}`,
    "-metadata",
    "comment=Commerce Automation local-only one-product video; server registration required before upload.",
    input.outputVideoPath
  ];
}

function pickCandidateImageUrl(candidate: ProductCandidate) {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  return [
    payload.thumbnail_url,
    payload.image_url,
    payload.product_image_url
  ].map(safeTrim).find(isHttpUrl) ?? "";
}

function sanitizeMetadata(value: string) {
  return value.replace(/[\r\n]/g, " ").trim().slice(0, 120);
}

function toSafeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "candidate";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
