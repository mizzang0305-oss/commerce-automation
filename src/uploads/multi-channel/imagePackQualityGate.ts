import fs from "node:fs/promises";

import { detectMosaicPlaceholder, detectPixelPlaceholderPattern, type PlaceholderVisualStats } from "./mosaicPlaceholderDetector";

export type ImagePackQualityProbe = {
  file_path: string;
  file_exists: boolean;
  decode_success: boolean;
  width: number;
  height: number;
  file_size_bytes: number;
  portrait: boolean;
  min_width_pass: boolean;
  min_height_pass: boolean;
  file_size_pass: boolean;
  mosaic_pattern_detected: boolean;
  checkerboard_pattern_detected: boolean;
  noise_texture_detected: boolean;
  placeholder_detected: boolean;
  blockers: string[];
};

export async function validateImagePackFile(filePath: string): Promise<ImagePackQualityProbe> {
  try {
    const buffer = await fs.readFile(filePath);
    return inspectImageBuffer(filePath, buffer);
  } catch {
    return failedProbe(filePath, ["IMAGE_FILE_MISSING"]);
  }
}

export function inspectImageBuffer(filePath: string, buffer: Buffer): ImagePackQualityProbe {
  const dimensions = inspectPng(buffer) ?? inspectJpeg(buffer) ?? inspectWebp(buffer);
  const decodeSuccess = Boolean(dimensions);
  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;
  const stats = estimatePlaceholderStats(buffer, width, height);
  const mosaic = detectMosaicPlaceholder({ width, height, ...stats });
  const pixel = detectPixelPlaceholderPattern(stats);
  const blockers = [...mosaic.blockers, ...pixel.blockers];
  const portrait = decodeSuccess && height > width;
  const minWidthPass = decodeSuccess && width >= 720;
  const minHeightPass = decodeSuccess && height >= 1280;
  const fileSizePass = buffer.length > 50000;

  if (!decodeSuccess) blockers.push("IMAGE_DECODE_FAILED");
  if (!portrait) blockers.push("IMAGE_NOT_PORTRAIT");
  if (!minWidthPass) blockers.push("IMAGE_WIDTH_TOO_SMALL");
  if (!minHeightPass) blockers.push("IMAGE_HEIGHT_TOO_SMALL");
  if (!fileSizePass) blockers.push("IMAGE_FILE_TOO_SMALL");

  return {
    file_path: filePath,
    file_exists: true,
    decode_success: decodeSuccess,
    width,
    height,
    file_size_bytes: buffer.length,
    portrait,
    min_width_pass: minWidthPass,
    min_height_pass: minHeightPass,
    file_size_pass: fileSizePass,
    mosaic_pattern_detected: mosaic.mosaic_pattern_detected,
    checkerboard_pattern_detected: pixel.checkerboard_pattern_detected,
    noise_texture_detected: pixel.noise_texture_detected,
    placeholder_detected: pixel.solid_or_gradient_placeholder_detected || pixel.abstract_color_grid_detected,
    blockers: [...new Set(blockers)]
  };
}

function failedProbe(filePath: string, blockers: string[]): ImagePackQualityProbe {
  return {
    file_path: filePath,
    file_exists: false,
    decode_success: false,
    width: 0,
    height: 0,
    file_size_bytes: 0,
    portrait: false,
    min_width_pass: false,
    min_height_pass: false,
    file_size_pass: false,
    mosaic_pattern_detected: false,
    checkerboard_pattern_detected: false,
    noise_texture_detected: false,
    placeholder_detected: false,
    blockers
  };
}

function inspectPng(buffer: Buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return null;
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
    if (length <= 0) break;
    offset += 2 + length;
  }
  return null;
}

function inspectWebp(buffer: Buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  return null;
}

function estimatePlaceholderStats(buffer: Buffer, width: number, height: number): PlaceholderVisualStats {
  const sample = buffer.subarray(Math.min(32, buffer.length), Math.min(buffer.length, 4096));
  const unique = new Set(sample).size;
  const colorClusterCount = Math.max(1, Math.min(64, unique));
  const entropyScore = Math.min(1, colorClusterCount / 64);
  const repeatedTileRatio = colorClusterCount <= 3 ? 0.9 : 0.08;
  const gradientSmoothnessScore = colorClusterCount <= 2 ? 0.9 : 0.12;
  return {
    color_cluster_count: colorClusterCount,
    repeated_tile_ratio: repeatedTileRatio,
    edge_direction_uniformity: width > 0 && height > 0 && colorClusterCount <= 4 ? 0.85 : 0.18,
    entropy_score: entropyScore,
    alternating_grid_score: 0.02,
    random_noise_score: colorClusterCount >= 60 ? 0.25 : 0.04,
    gradient_smoothness_score: gradientSmoothnessScore,
    abstract_color_grid_score: 0.02
  };
}
