import path from "node:path";

import { type ChannelKey } from "./channelProfiles";
import { type ImagePackManifest } from "./imagePackManifest";
import { getV041ExpectedImagePaths } from "./manualImageDropManifest";

export type ImagePackSourceFile = {
  source_file: string;
  source_path: string;
};

export type ImagePackMappingConfidence =
  | "MANIFEST_EXACT"
  | "KEYWORD_FILENAME"
  | "ORDER_BASED_REQUIRES_OWNER_REVIEW";

export type ImagePackTarget = {
  channel_key: ChannelKey;
  scene_key: string;
  filename: string;
  target_path: string;
};

export type ImagePackMapping = ImagePackTarget & {
  source_file: string;
  source_path: string;
  mapping_confidence: ImagePackMappingConfidence;
  validation_status: "PENDING" | "PASS" | "FAIL";
  blockers: string[];
};

const CHANNEL_KEYWORDS: Record<ChannelKey, string[]> = {
  father_jobs: ["car", "cup", "holder", "console", "dashboard", "driver", "organizer"],
  neoman_moleulgeol: ["rain", "laundry", "drying", "rack", "socks", "towel", "clothes"],
  lets_buy: ["desk", "cable", "organizer", "clutter", "usb"]
};

export function buildV041ImagePackTargets(input: { cwd?: string } = {}): ImagePackTarget[] {
  return getV041ExpectedImagePaths(input).flatMap((channel) =>
    channel.files.map((file) => ({
      channel_key: channel.channel_key,
      scene_key: file.scene_key,
      filename: file.filename,
      target_path: file.path
    }))
  );
}

export function mapImagePackSources(input: {
  cwd?: string;
  sources: ImagePackSourceFile[];
  manifest?: ImagePackManifest | null;
}): ImagePackMapping[] {
  const targets = buildV041ImagePackTargets({ cwd: input.cwd });
  const bySourceName = new Map(input.sources.map((source) => [normalizeName(source.source_file), source]));
  const usedSources = new Set<string>();
  const mappings: ImagePackMapping[] = [];

  if (input.manifest) {
    for (const item of input.manifest.items) {
      const source = bySourceName.get(normalizeName(item.source_file));
      const target = findTarget(targets, item.channel_key, item.scene_key);
      if (!source || !target) continue;
      usedSources.add(source.source_path);
      mappings.push(toMapping(source, target, "MANIFEST_EXACT"));
    }
  }

  for (const source of input.sources) {
    if (usedSources.has(source.source_path)) continue;
    const channelKey = inferChannelFromName(source.source_file);
    if (!channelKey) continue;
    const channelTargets = targets.filter((target) => target.channel_key === channelKey);
    const target = channelTargets.find((candidate) => !mappings.some((mapping) => mapping.target_path === candidate.target_path));
    if (!target) continue;
    usedSources.add(source.source_path);
    mappings.push(toMapping(source, target, "KEYWORD_FILENAME"));
  }

  const remainingSources = input.sources
    .filter((source) => !usedSources.has(source.source_path))
    .sort((a, b) => naturalCompare(a.source_file, b.source_file));
  const remainingTargets = targets
    .filter((target) => !mappings.some((mapping) => mapping.target_path === target.target_path))
    .sort((a, b) => naturalCompare(a.target_path, b.target_path));

  for (let index = 0; index < Math.min(remainingSources.length, remainingTargets.length); index += 1) {
    mappings.push(toMapping(remainingSources[index], remainingTargets[index], "ORDER_BASED_REQUIRES_OWNER_REVIEW"));
  }

  return mappings.sort((a, b) => naturalCompare(a.target_path, b.target_path));
}

function toMapping(source: ImagePackSourceFile, target: ImagePackTarget, confidence: ImagePackMappingConfidence): ImagePackMapping {
  return {
    ...target,
    source_file: source.source_file,
    source_path: source.source_path,
    mapping_confidence: confidence,
    validation_status: "PENDING",
    blockers: []
  };
}

function findTarget(targets: ImagePackTarget[], channelKey: ChannelKey, sceneKey: string) {
  const normalizedSceneKey = normalizeSceneKey(sceneKey);
  return targets.find((target) =>
    target.channel_key === channelKey &&
    (target.scene_key === sceneKey ||
      normalizeSceneKey(target.filename) === normalizedSceneKey ||
      normalizeSceneKey(target.filename.replace(/\.[^.]+$/, "")) === normalizedSceneKey)
  );
}

function inferChannelFromName(fileName: string): ChannelKey | null {
  const normalized = normalizeSceneKey(fileName);
  for (const [channelKey, keywords] of Object.entries(CHANNEL_KEYWORDS) as Array<[ChannelKey, string[]]>) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return channelKey;
  }
  return null;
}

function normalizeName(value: string) {
  return path.basename(value).toLowerCase();
}

function normalizeSceneKey(value: string) {
  return path.basename(value).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
