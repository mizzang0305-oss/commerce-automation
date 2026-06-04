import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductAsset } from "@/types/automation";

export type ArtifactQaStatus = "pending" | "passed" | "needs_fix" | "rejected";

const REQUIRED_ASSET_TYPES: ProductAsset["asset_type"][] = ["video", "thumbnail", "subtitle", "upload_package"];

export async function listArtifactQaSummaries(repository: AutomationRepository) {
  const [queueItems, assets, packages] = await Promise.all([
    repository.getQueue(),
    repository.getProductAssets(),
    repository.getChannelUploadPackages()
  ]);
  const groups = new Map<string, ProductAsset[]>();
  for (const asset of assets) {
    groups.set(asset.product_queue_id, [...(groups.get(asset.product_queue_id) ?? []), normalizeAssetQa(asset)]);
  }

  const artifacts = [...groups.entries()].map(([productQueueId, groupAssets]) => {
    const queueItem = queueItems.find((item) => item.id === productQueueId);
    const uploadPackage = packages.find((item) => item.product_queue_id === productQueueId);
    return buildArtifactSummary(productQueueId, queueItem?.product_name ?? "", groupAssets, uploadPackage?.status ?? "");
  });

  return {
    artifacts,
    summary: summarizeArtifacts(artifacts)
  };
}

export async function getArtifactQaDetail(repository: AutomationRepository, assetId: string) {
  const assets = await repository.getProductAssets();
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) {
    return null;
  }
  const [queueItem, queueAssets, packages] = await Promise.all([
    repository.getQueueItem(asset.product_queue_id),
    repository.getProductAssets(asset.product_queue_id),
    repository.getChannelUploadPackages(asset.product_queue_id)
  ]);
  return {
    ...buildArtifactSummary(
      asset.product_queue_id,
      queueItem?.product_name ?? "",
      queueAssets.map(normalizeAssetQa),
      packages[0]?.status ?? ""
    ),
    artifact: normalizeAssetQa(asset)
  };
}

export async function updateArtifactQaStatus(
  repository: AutomationRepository,
  assetId: string,
  input: { qa_status?: unknown; qa_note?: unknown }
) {
  const status = normalizeQaStatus(input.qa_status);
  if (!status) {
    return { ok: false as const, status: 400, message: "지원하지 않는 QA 상태입니다." };
  }
  const asset = await repository.updateProductAssetQa(assetId, {
    qa_status: status,
    qa_note: typeof input.qa_note === "string" ? input.qa_note.trim().slice(0, 1000) : "",
    render_qa_metadata: {}
  });
  if (!asset) {
    return { ok: false as const, status: 404, message: "Artifact를 찾을 수 없습니다." };
  }
  return {
    ok: true as const,
    artifact: normalizeAssetQa(asset),
    upload_triggered: false,
    worker_jobs_created: false
  };
}

function buildArtifactSummary(productQueueId: string, productName: string, assets: ProductAsset[], uploadPackageStatus: string) {
  const byType = new Map(assets.map((asset) => [asset.asset_type, asset]));
  const missing = REQUIRED_ASSET_TYPES.filter((type) => !byType.get(type)?.url);
  const primary = byType.get("video") ?? assets[0];
  const qaStatus = normalizeQaStatus(primary?.qa_status) ?? "pending";

  return {
    id: primary?.id ?? productQueueId,
    product_queue_id: productQueueId,
    product_name: productName,
    video_url: byType.get("video")?.url ?? "",
    thumbnail_url: byType.get("thumbnail")?.url ?? "",
    subtitle_url: byType.get("subtitle")?.url ?? "",
    upload_package_url: byType.get("upload_package")?.url ?? "",
    video_exists: Boolean(byType.get("video")?.url),
    thumbnail_exists: Boolean(byType.get("thumbnail")?.url),
    subtitle_exists: Boolean(byType.get("subtitle")?.url),
    upload_package_exists: Boolean(byType.get("upload_package")?.url),
    missing_asset_types: missing,
    qa_status: qaStatus,
    qa_note: primary?.qa_note ?? "",
    render_qa_metadata: primary?.render_qa_metadata ?? {},
    manual_upload_status: uploadPackageStatus,
    created_at: primary?.created_at ?? "",
    updated_at: primary?.updated_at ?? primary?.created_at ?? ""
  };
}

function summarizeArtifacts(artifacts: ReturnType<typeof buildArtifactSummary>[]) {
  return {
    total: artifacts.length,
    pending: artifacts.filter((artifact) => artifact.qa_status === "pending").length,
    passed: artifacts.filter((artifact) => artifact.qa_status === "passed").length,
    needs_fix: artifacts.filter((artifact) => artifact.qa_status === "needs_fix").length,
    rejected: artifacts.filter((artifact) => artifact.qa_status === "rejected").length,
    missing_video: artifacts.filter((artifact) => !artifact.video_exists).length,
    missing_thumbnail: artifacts.filter((artifact) => !artifact.thumbnail_exists).length,
    missing_subtitle: artifacts.filter((artifact) => !artifact.subtitle_exists).length,
    missing_upload_package: artifacts.filter((artifact) => !artifact.upload_package_exists).length
  };
}

function normalizeAssetQa(asset: ProductAsset): ProductAsset {
  return {
    ...asset,
    qa_status: normalizeQaStatus(asset.qa_status) ?? "pending",
    qa_note: asset.qa_note ?? "",
    render_qa_metadata: asset.render_qa_metadata ?? {},
    updated_at: asset.updated_at ?? asset.created_at
  };
}

function normalizeQaStatus(value: unknown): ArtifactQaStatus | null {
  return value === "pending" || value === "passed" || value === "needs_fix" || value === "rejected" ? value : null;
}
