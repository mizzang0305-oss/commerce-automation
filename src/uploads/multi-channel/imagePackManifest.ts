import fs from "node:fs/promises";
import path from "node:path";

import { type ChannelKey, isChannelKey } from "./channelProfiles";

export type ImagePackManifestItem = {
  source_file: string;
  channel_key: ChannelKey;
  scene_key: string;
};

export type ImagePackManifest = {
  version: "v041";
  items: ImagePackManifestItem[];
};

export const IMAGE_PACK_INBOX_ROOT = path.join("commerce-assets", "manual-drop", "v042-inbox");
export const IMAGE_PACK_RAW_DIR = path.join(IMAGE_PACK_INBOX_ROOT, "raw");
export const IMAGE_PACK_ZIP_PATH = path.join(IMAGE_PACK_INBOX_ROOT, "v041-image-pack.zip");
export const IMAGE_PACK_MANIFEST_PATH = path.join(IMAGE_PACK_INBOX_ROOT, "image-pack-manifest.json");

export function getImagePackInboxPaths(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  return {
    inbox_root: path.join(cwd, IMAGE_PACK_INBOX_ROOT),
    raw_dir: path.join(cwd, IMAGE_PACK_RAW_DIR),
    zip_path: path.join(cwd, IMAGE_PACK_ZIP_PATH),
    manifest_path: path.join(cwd, IMAGE_PACK_MANIFEST_PATH)
  };
}

export async function readImagePackManifest(input: { cwd?: string } = {}): Promise<ImagePackManifest | null> {
  const paths = getImagePackInboxPaths(input);
  try {
    return parseImagePackManifest(JSON.parse(await fs.readFile(paths.manifest_path, "utf8")));
  } catch {
    return null;
  }
}

export function parseImagePackManifest(value: unknown): ImagePackManifest {
  if (!value || typeof value !== "object") {
    throw new Error("IMAGE_PACK_MANIFEST_INVALID_OBJECT");
  }
  const record = value as { version?: unknown; items?: unknown };
  if (record.version !== "v041") {
    throw new Error("IMAGE_PACK_MANIFEST_VERSION_NOT_V041");
  }
  if (!Array.isArray(record.items)) {
    throw new Error("IMAGE_PACK_MANIFEST_ITEMS_MISSING");
  }
  const items = record.items.map((item, index) => parseImagePackManifestItem(item, index));
  return { version: "v041", items };
}

function parseImagePackManifestItem(value: unknown, index: number): ImagePackManifestItem {
  if (!value || typeof value !== "object") {
    throw new Error(`IMAGE_PACK_MANIFEST_ITEM_INVALID_${index}`);
  }
  const record = value as Record<string, unknown>;
  const sourceFile = normalizeRelativeSourceFile(record.source_file);
  const channelKey = record.channel_key;
  const sceneKey = record.scene_key;
  if (!isChannelKey(channelKey)) {
    throw new Error(`IMAGE_PACK_MANIFEST_ITEM_CHANNEL_INVALID_${index}`);
  }
  if (typeof sceneKey !== "string" || !sceneKey.trim()) {
    throw new Error(`IMAGE_PACK_MANIFEST_ITEM_SCENE_INVALID_${index}`);
  }
  return {
    source_file: sourceFile,
    channel_key: channelKey,
    scene_key: sceneKey.trim()
  };
}

export function normalizeRelativeSourceFile(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("IMAGE_PACK_SOURCE_FILE_INVALID");
  }
  const normalized = value.replace(/\\/g, "/").trim();
  if (path.isAbsolute(normalized) || normalized.includes("..")) {
    throw new Error("IMAGE_PACK_SOURCE_FILE_NOT_SAFE_RELATIVE");
  }
  return normalized;
}

export function isSupportedImagePackFile(filePath: string) {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}
