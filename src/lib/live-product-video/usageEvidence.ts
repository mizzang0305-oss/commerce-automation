import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { OwnerReviewedRealUseAsset } from "@/lib/video-automation/types";
import type { LiveProductCandidate, LiveProductUseCase } from "./types";

const CHANNEL_BY_USE_CASE: Record<Exclude<LiveProductUseCase, "unsupported">, string> = {
  vehicle_console_organization: "father_jobs",
  vehicle_cabin_storage: "father_jobs",
  cable_organization: "lets_buy",
  laundry_space_organization: "neoman_moleulgeol",
  vehicle_organization: "father_jobs",
  desk_organization: "lets_buy",
  laundry_drying: "neoman_moleulgeol"
};

export function supportsUsageEvidence(candidate: LiveProductCandidate) {
  return candidate.useCase !== "unsupported" && Boolean(CHANNEL_BY_USE_CASE[candidate.useCase]);
}

export async function resolveOwnerReviewedUsageEvidence(input: {
  candidate: LiveProductCandidate;
  assetRoot: string;
}): Promise<OwnerReviewedRealUseAsset | null> {
  if (!supportsUsageEvidence(input.candidate)) return null;
  const channelKey = CHANNEL_BY_USE_CASE[input.candidate.useCase as Exclude<LiveProductUseCase, "unsupported">];
  const evidencePath = resolve(input.assetRoot, "commerce-assets/review/v049/three-channel-upload-preflight-report.json");
  let report: { channels?: Array<Record<string, unknown>> };
  try {
    report = JSON.parse(await readFile(evidencePath, "utf8")) as typeof report;
  } catch {
    return null;
  }
  const row = report.channels?.find((entry) => entry.channel_key === channelKey);
  if (!row || row.human_review_status !== "PASS_LOCAL_HUMAN_REVIEW" || row.local_video_exists !== true || typeof row.video_path !== "string") return null;
  const sourcePath = resolve(row.video_path);
  try {
    await Promise.all([stat(sourcePath), stat(evidencePath)]);
  } catch {
    return null;
  }
  return {
    assetId: `v049-${channelKey}-generic-use`,
    productKey: input.candidate.productKey,
    sourcePath,
    reviewEvidencePath: evidencePath,
    sourceType: "owner_reviewed_local_video",
    identityType: "generic_usage_example",
    usageType: "real_use_context",
    ownerReviewStatus: "pass"
  };
}
