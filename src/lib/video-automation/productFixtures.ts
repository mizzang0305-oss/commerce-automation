import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OwnerReviewedRealUseAsset, ProductVideoAutomationInput } from "./types";

type FixtureDefinition = Omit<ProductVideoAutomationInput["product"], "imagePaths" | "realUseAsset"> & { channelKey: string };

const FIXTURES: FixtureDefinition[] = [
  { channelKey: "father_jobs", productKey: "v057-father-jobs-car-cup-organizer", rawProductName: "차량용 컵홀더 정리함", canonicalProductName: "차량용 컵홀더 정리함", aliases: ["컵홀더 정리함", "차량용 정리함"], anchors: ["컵홀더", "수납", "소품", "차량"], category: "차량용품" },
  { channelKey: "neoman_moleulgeol", productKey: "v057-neoman-folding-drying-rack", rawProductName: "접이식 빨래건조대", canonicalProductName: "접이식 빨래건조대", aliases: ["접이식 건조대", "빨래 건조대"], anchors: ["빨래", "건조", "공간", "접이식"], category: "생활/건조" },
  { channelKey: "lets_buy", productKey: "v057-lets-buy-cable-organizer", rawProductName: "특가 케이블 정리함", canonicalProductName: "특가 케이블 정리함", aliases: ["케이블 정리함", "선 정리함"], anchors: ["케이블", "정리", "책상", "고정"], category: "전자액세서리" }
];

export function loadApprovedProductFixtures(assetRoot: string, runId: string): ProductVideoAutomationInput[] {
  if (!assetRoot.trim()) throw new Error("VIDEO_AUTOMATION_ASSET_ROOT_REQUIRED");
  const reviewEvidencePath = resolve(assetRoot, "commerce-assets/review/v049/three-channel-upload-preflight-report.json");
  const report = JSON.parse(readFileSync(reviewEvidencePath, "utf8")) as { channels?: Array<Record<string, unknown>> };
  return FIXTURES.map(({ channelKey, ...product }) => {
    const reviewed = report.channels?.find((entry) => entry.channel_key === channelKey && entry.product_name === product.canonicalProductName);
    if (!isApprovedReviewRecord(reviewed, product.canonicalProductName)) {
      throw new Error("OWNER_REVIEWED_REAL_USE_ASSET_REQUIRED");
    }
    const realUseAsset: OwnerReviewedRealUseAsset = {
      assetId: `v057-${channelKey}-owner-reviewed-video`,
      productKey: product.productKey,
      sourcePath: resolve(reviewed.video_path),
      reviewEvidencePath,
      sourceType: "owner_reviewed_local_video",
      identityType: "generic_usage_example",
      usageType: "real_use_context",
      ownerReviewStatus: "pass"
    };
    return { runId, product: { ...product, imagePaths: [], realUseAsset }, creative: { candidateCount: 3, language: "ko" }, mode: "local_review_only" };
  });
}

export function isApprovedReviewRecord(value: Record<string, unknown> | undefined, expectedProductName: string): value is Record<string, unknown> & { video_path: string } {
  return Boolean(value && value.product_name === expectedProductName && value.human_review_status === "PASS_LOCAL_HUMAN_REVIEW" && value.local_video_exists === true && typeof value.video_path === "string" && value.video_path.trim());
}
