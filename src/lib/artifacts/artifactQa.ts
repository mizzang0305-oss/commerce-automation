import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductAsset } from "@/types/automation";

export type ArtifactQaStatus = "pending" | "passed" | "needs_fix" | "rejected";
export type ArtifactQaSort = "newest" | "oldest" | "qa_status" | "asset_type";

export type ArtifactQaFilters = {
  qa_status: ArtifactQaStatus | "all";
  asset_type: ProductAsset["asset_type"] | "all";
  missing:
    | "all"
    | "none"
    | "missing_video"
    | "missing_thumbnail"
    | "missing_subtitle"
    | "missing_upload_package"
    | "has_warnings";
  search: string;
  sort: ArtifactQaSort;
};

const REQUIRED_ASSET_TYPES: ProductAsset["asset_type"][] = ["video", "thumbnail", "subtitle", "upload_package"];

export async function listArtifactQaSummaries(repository: AutomationRepository, filters: Partial<ArtifactQaFilters> = {}) {
  const normalizedFilters = normalizeArtifactQaFilters(filters);
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
  const filteredArtifacts = filterAndSortArtifactSummaries(artifacts, normalizedFilters);

  return {
    artifacts: filteredArtifacts,
    summary: summarizeArtifacts(filteredArtifacts),
    filters: normalizedFilters
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
    return { ok: false as const, status: 400, error_code: "INVALID_QA_STATUS", message: "지원하지 않는 QA 상태입니다." };
  }
  const asset = await repository.updateProductAssetQa(assetId, {
    qa_status: status,
    qa_note: typeof input.qa_note === "string" ? input.qa_note.trim().slice(0, 1000) : "",
    render_qa_metadata: {}
  });
  if (!asset) {
    return { ok: false as const, status: 404, error_code: "ARTIFACT_NOT_FOUND", message: "Artifact를 찾을 수 없습니다." };
  }
  return {
    ok: true as const,
    artifact: normalizeAssetQa(asset),
    upload_triggered: false,
    worker_jobs_created: false
  };
}

export async function bulkUpdateArtifactQaStatus(
  repository: AutomationRepository,
  input: { artifact_ids?: unknown; qa_status?: unknown; qa_note?: unknown }
) {
  const artifactIds = Array.isArray(input.artifact_ids)
    ? input.artifact_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
    : [];
  if (artifactIds.length === 0) {
    return {
      ok: false as const,
      status: 400,
      error_code: "ARTIFACT_IDS_REQUIRED",
      message: "선택된 artifact가 없습니다."
    };
  }

  const status = normalizeQaStatus(input.qa_status);
  if (!status) {
    return {
      ok: false as const,
      status: 400,
      error_code: "INVALID_QA_STATUS",
      message: "지원하지 않는 QA 상태입니다."
    };
  }

  const uniqueIds = [...new Set(artifactIds)].slice(0, 200);
  const qaNote = typeof input.qa_note === "string" ? input.qa_note.trim().slice(0, 1000) : "";
  const updated: ProductAsset[] = [];
  const skipped_ids: string[] = [];

  for (const id of uniqueIds) {
    const asset = await repository.updateProductAssetQa(id, {
      qa_status: status,
      qa_note: qaNote,
      render_qa_metadata: {
        bulk_reviewed: true,
        reviewed_at: new Date().toISOString()
      }
    });
    if (asset) {
      updated.push(normalizeAssetQa(asset));
    } else {
      skipped_ids.push(id);
    }
  }

  return {
    ok: true as const,
    requested_count: uniqueIds.length,
    updated_count: updated.length,
    skipped_count: skipped_ids.length,
    skipped_ids,
    artifacts: updated,
    upload_triggered: false,
    worker_jobs_created: false,
    queue_auto_uploaded_or_posted: false
  };
}

export function parseArtifactQaFilters(searchParams: URLSearchParams): ArtifactQaFilters {
  return normalizeArtifactQaFilters({
    qa_status: searchParams.get("qa_status") ?? undefined,
    asset_type: searchParams.get("asset_type") ?? undefined,
    missing: searchParams.get("missing") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    sort: searchParams.get("sort") ?? undefined
  });
}

function buildArtifactSummary(productQueueId: string, productName: string, assets: ProductAsset[], uploadPackageStatus: string) {
  const byType = new Map(assets.map((asset) => [asset.asset_type, asset]));
  const missing = REQUIRED_ASSET_TYPES.filter((type) => !byType.get(type)?.url);
  const primary = byType.get("video") ?? assets[0];
  const qaStatus = normalizeQaStatus(primary?.qa_status) ?? "pending";
  const assetTypes = [...new Set(assets.map((asset) => asset.asset_type))].sort();

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
    asset_types: assetTypes,
    missing_asset_types: missing,
    qa_status: qaStatus,
    qa_note: primary?.qa_note ?? "",
    render_qa_metadata: primary?.render_qa_metadata ?? {},
    manual_upload_status: uploadPackageStatus,
    created_at: primary?.created_at ?? "",
    updated_at: primary?.updated_at ?? primary?.created_at ?? ""
  };
}

function filterAndSortArtifactSummaries(
  artifacts: ReturnType<typeof buildArtifactSummary>[],
  filters: ArtifactQaFilters
) {
  const search = filters.search.toLowerCase();
  const filtered = artifacts.filter((artifact) => {
    if (filters.qa_status !== "all" && artifact.qa_status !== filters.qa_status) {
      return false;
    }
    if (filters.asset_type !== "all" && !artifact.asset_types.includes(filters.asset_type)) {
      return false;
    }
    if (filters.missing !== "all") {
      if (filters.missing === "none" && artifact.missing_asset_types.length > 0) {
        return false;
      }
      if (filters.missing === "has_warnings" && artifact.missing_asset_types.length === 0 && artifact.qa_status !== "needs_fix" && artifact.qa_status !== "rejected") {
        return false;
      }
      if (filters.missing !== "none" && filters.missing !== "has_warnings" && !artifact.missing_asset_types.includes(stripMissingPrefix(filters.missing))) {
        return false;
      }
    }
    if (search) {
      const haystack = [
        artifact.id,
        artifact.product_queue_id,
        artifact.product_name,
        artifact.video_url,
        artifact.thumbnail_url,
        artifact.subtitle_url,
        artifact.upload_package_url
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });

  return filtered.sort((left, right) => {
    if (filters.sort === "oldest") {
      return left.created_at.localeCompare(right.created_at);
    }
    if (filters.sort === "qa_status") {
      return left.qa_status.localeCompare(right.qa_status) || right.updated_at.localeCompare(left.updated_at);
    }
    if (filters.sort === "asset_type") {
      return left.asset_types.join(",").localeCompare(right.asset_types.join(",")) || right.updated_at.localeCompare(left.updated_at);
    }
    return right.updated_at.localeCompare(left.updated_at);
  });
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

function normalizeArtifactQaFilters(filters: Partial<Record<keyof ArtifactQaFilters, unknown>>): ArtifactQaFilters {
  return {
    qa_status: normalizeQaStatus(filters.qa_status) ?? "all",
    asset_type: normalizeAssetType(filters.asset_type) ?? "all",
    missing: normalizeMissingFilter(filters.missing),
    search: typeof filters.search === "string" ? filters.search.trim().slice(0, 120) : "",
    sort: normalizeSort(filters.sort)
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

function normalizeAssetType(value: unknown): ProductAsset["asset_type"] | null {
  return value === "video" ||
    value === "thumbnail" ||
    value === "subtitle" ||
    value === "upload_package" ||
    value === "sheet_export" ||
    value === "product_image"
    ? value
    : null;
}

function normalizeMissingFilter(value: unknown): ArtifactQaFilters["missing"] {
  if (value === "none" || value === "has_warnings") {
    return value;
  }
  if (value === "missing_video" || value === "video") {
    return "missing_video";
  }
  if (value === "missing_thumbnail" || value === "thumbnail") {
    return "missing_thumbnail";
  }
  if (value === "missing_subtitle" || value === "subtitle") {
    return "missing_subtitle";
  }
  if (value === "missing_upload_package" || value === "upload_package") {
    return "missing_upload_package";
  }
  return "all";
}

function normalizeSort(value: unknown): ArtifactQaSort {
  return value === "oldest" || value === "qa_status" || value === "asset_type" ? value : "newest";
}

function stripMissingPrefix(value: Exclude<ArtifactQaFilters["missing"], "all" | "none" | "has_warnings">) {
  return value.replace(/^missing_/, "") as ProductAsset["asset_type"];
}
