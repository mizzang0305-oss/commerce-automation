import type { CommerceImageAssetType } from "@/lib/image-prompts/types";

function sanitizeSegment(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "candidate";
}

export function buildLocalImageAssetFilename(candidateId: string, assetType: CommerceImageAssetType, version = "v001") {
  return `${sanitizeSegment(candidateId)}_${assetType}_${version}.png`;
}

export function buildLocalImageOutputPath(candidateId: string) {
  return `commerce-assets/output/generated/${sanitizeSegment(candidateId)}/`;
}

export function buildGoogleDriveSyncPath(candidateId: string) {
  return `G:/My Drive/commerce-assets/generated/${sanitizeSegment(candidateId)}/`;
}
