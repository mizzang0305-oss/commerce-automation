import fs from "node:fs/promises";
import path from "node:path";

import { type ChannelKey } from "./channelProfiles";
import { buildV041ManualImageDropManifest } from "./manualImageDropManifest";
import { type PlaceholderVisualStats } from "./mosaicPlaceholderDetector";
import { validateRealImageSemanticGate, type RealImageSemanticAsset } from "./realImageSemanticGate";

export type ManualImageSemanticEvidence = {
  channel_key: ChannelKey;
  real_photo_likeness_score: number;
  detected_objects: string[];
  visual_stats: PlaceholderVisualStats;
};

export type ManualDropValidationReport = {
  version: "v041";
  required_image_count: number;
  found_image_count: number;
  all_required_images_present: boolean;
  all_images_decode_success: boolean;
  all_images_portrait: boolean;
  all_images_min_resolution: boolean;
  all_images_file_size_gt_50000: boolean;
  validation_attempted: boolean;
  validation_pass: boolean;
  validation_blocker: string | null;
  validation_blockers: string[];
  channel_reports: Array<{
    channel_key: ChannelKey;
    found_image_count: number;
    required_image_count: number;
    evidence_present: boolean;
    semantic_gate_pass: boolean;
    blockers: string[];
  }>;
  real_image_semantic_summary: ReturnType<typeof validateRealImageSemanticGate>[];
};

export async function validateV041ManualImageDrop(input: { cwd?: string } = {}): Promise<ManualDropValidationReport> {
  const manifest = buildV041ManualImageDropManifest({ cwd: input.cwd });
  const channelReports: ManualDropValidationReport["channel_reports"] = [];
  const semanticSummaries: ReturnType<typeof validateRealImageSemanticGate>[] = [];
  const allAssets: RealImageSemanticAsset[] = [];

  for (const channel of manifest.channels) {
    const evidence = await readEvidence(path.join(channel.expected_dir, channel.evidence_filename), channel.channel_key);
    const assets: RealImageSemanticAsset[] = [];

    for (const file of channel.files) {
      const probe = await inspectImage(file.path);
      assets.push({
        scene_key: file.scene_key,
        file_exists: probe.file_exists,
        decode_success: probe.decode_success,
        width: probe.width,
        height: probe.height,
        file_size_bytes: probe.file_size_bytes,
        real_photo_likeness_score: evidence?.real_photo_likeness_score ?? 0,
        detected_objects: evidence?.detected_objects ?? [],
        visual_stats: evidence?.visual_stats ?? placeholderStats()
      });
    }

    const semantic = validateRealImageSemanticGate({
      channel_key: channel.channel_key,
      assets
    });
    const foundImageCount = assets.filter((asset) => asset.file_exists).length;
    const blockers = [...semantic.blockers];
    if (!evidence) blockers.push("MANUAL_IMAGE_SEMANTIC_EVIDENCE_MISSING");

    channelReports.push({
      channel_key: channel.channel_key,
      found_image_count: foundImageCount,
      required_image_count: channel.files.length,
      evidence_present: Boolean(evidence),
      semantic_gate_pass: semantic.pass && Boolean(evidence),
      blockers: [...new Set(blockers)]
    });
    semanticSummaries.push(semantic);
    allAssets.push(...assets);
  }

  const requiredImageCount = manifest.required_image_count;
  const foundImageCount = allAssets.filter((asset) => asset.file_exists).length;
  const allRequiredImagesPresent = foundImageCount === requiredImageCount;
  const allImagesDecodeSuccess = allRequiredImagesPresent && allAssets.every((asset) => asset.decode_success);
  const allImagesPortrait = allRequiredImagesPresent && allAssets.every((asset) => asset.height > asset.width);
  const allImagesMinResolution = allRequiredImagesPresent && allAssets.every((asset) => asset.width >= 720 && asset.height >= 1280);
  const allImagesFileSize = allRequiredImagesPresent && allAssets.every((asset) => asset.file_size_bytes > 50000);
  const blockers: string[] = [];

  if (!allRequiredImagesPresent) blockers.push("MANUAL_DROP_IMAGES_MISSING");
  if (!allImagesDecodeSuccess) blockers.push("MANUAL_DROP_IMAGE_DECODE_FAIL");
  if (!allImagesPortrait) blockers.push("MANUAL_DROP_IMAGE_NOT_PORTRAIT");
  if (!allImagesMinResolution) blockers.push("MANUAL_DROP_IMAGE_RESOLUTION_TOO_SMALL");
  if (!allImagesFileSize) blockers.push("MANUAL_DROP_IMAGE_FILE_TOO_SMALL");
  for (const report of channelReports) {
    blockers.push(...report.blockers);
  }

  const uniqueBlockers = [...new Set(blockers)];

  return {
    version: "v041",
    required_image_count: requiredImageCount,
    found_image_count: foundImageCount,
    all_required_images_present: allRequiredImagesPresent,
    all_images_decode_success: allImagesDecodeSuccess,
    all_images_portrait: allImagesPortrait,
    all_images_min_resolution: allImagesMinResolution,
    all_images_file_size_gt_50000: allImagesFileSize,
    validation_attempted: true,
    validation_pass: uniqueBlockers.length === 0,
    validation_blocker: uniqueBlockers[0] ?? null,
    validation_blockers: uniqueBlockers,
    channel_reports: channelReports,
    real_image_semantic_summary: semanticSummaries
  };
}

async function readEvidence(filePath: string, channelKey: ChannelKey): Promise<ManualImageSemanticEvidence | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<ManualImageSemanticEvidence>;
    if (parsed.channel_key !== channelKey) return null;
    if (typeof parsed.real_photo_likeness_score !== "number") return null;
    if (!Array.isArray(parsed.detected_objects)) return null;
    if (!parsed.visual_stats) return null;
    return {
      channel_key: channelKey,
      real_photo_likeness_score: parsed.real_photo_likeness_score,
      detected_objects: parsed.detected_objects,
      visual_stats: parsed.visual_stats
    };
  } catch {
    return null;
  }
}

async function inspectImage(filePath: string) {
  try {
    const buffer = await fs.readFile(filePath);
    const png = inspectPng(buffer);
    const jpeg = inspectJpeg(buffer);
    const dimensions = png ?? jpeg;
    return {
      file_exists: true,
      decode_success: Boolean(dimensions),
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      file_size_bytes: buffer.length
    };
  } catch {
    return {
      file_exists: false,
      decode_success: false,
      width: 0,
      height: 0,
      file_size_bytes: 0
    };
  }
}

function inspectPng(buffer: Buffer) {
  const isPng = buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (!isPng) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inspectJpeg(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function placeholderStats(): PlaceholderVisualStats {
  return {
    color_cluster_count: 0,
    repeated_tile_ratio: 1,
    edge_direction_uniformity: 1,
    entropy_score: 0,
    alternating_grid_score: 0,
    random_noise_score: 0,
    gradient_smoothness_score: 1,
    abstract_color_grid_score: 0
  };
}
