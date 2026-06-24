import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { buildCoupangCandidate, type CoupangCandidateInput } from "@/lib/coupang/coupangCandidateImport";
import { buildCoupangPartnersSearchRequest } from "@/lib/coupang/partnersAuthConfig";
import {
  selectRainyDryingRackCandidate,
  type RainyDryingRackCandidateScore
} from "@/lib/coupang/rainyDryingRackCandidateScoring";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { AutomationRepository } from "@/lib/repositories/types";
import { createOneProductServerAssetRegistrar } from "@/lib/uploads/videoAssets/oneProductServerAssetRegistration";
import { createRainyDryingRackSceneCardRenderer } from "@/lib/uploads/videoAssets/rainyDryingRackSceneRenderer";
import {
  DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  ServerYouTubeUploadAdapter,
  buildYouTubeExecuteReadiness,
  buildYouTubeProductVideoUploadPackage,
  buildYouTubeUploadReadiness,
  buildYouTubeUploadRequest,
  getYouTubeUploadAccessTokenForServerUpload
} from "@/lib/uploads/youtube";
import { APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD } from "@/lib/uploads/youtube/rainyDryingRackPrivateUploadApproval";
import { normalizePreparedVideoAssetRef, type PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { ProductAsset, ProductCandidate } from "@/types/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASELINE_CANDIDATE_ID = "candidate-490aa6d25e8ea89d";
const SELECTED_EVENT = "Rainy season preparation";
const DEFAULT_KEYWORDS = ["\uBE68\uB798\uAC74\uC870\uB300", "\uC2E4\uB0B4 \uBE68\uB798\uAC74\uC870\uB300", "drying rack"];

type PartnersProduct = Record<string, unknown>;
type RainyCandidateInput = CoupangCandidateInput & { source_keyword?: string };

type SafePipelineReport = {
  ok: boolean;
  error_code: string | null;
  blocked_reasons: string[];
  selected_event: string;
  selected_keyword: string | null;
  keyword_expansion_used: boolean;
  external_api_call_count: number;
  candidate_id: string | null;
  product_name: string | null;
  category: string | null;
  candidate_score: RainyDryingRackCandidateScore | null;
  candidate_created_or_selected: boolean;
  affiliate_url_present: boolean;
  product_image_present: boolean;
  provider: "advanced_still_motion";
  render_attempted: boolean;
  mp4_created: boolean;
  local_video_basename: string | null;
  duration_seconds: number | null;
  scene_count: number | null;
  true_scene_change_pass: boolean;
  caption_safe_area_pass: boolean;
  no_text_clipped: boolean;
  voiceover_audio_present: boolean;
  video_has_audio_stream: boolean;
  loss_aversion_hook_present: boolean;
  cta_scene_present: boolean;
  coupang_disclosure_ready: boolean;
  r2_upload_attempted: boolean;
  r2_uploaded: boolean;
  product_assets_written: boolean;
  rows_written: number;
  prepared_video_asset_ref_present: boolean;
  product_package_prepare: "PASS" | "BLOCKED" | "NOT_ATTEMPTED";
  readiness_can_upload: boolean;
  readiness_blocked_reasons: string[];
  execute_attempted: boolean;
  execute_count: number;
  videos_insert_called: boolean;
  videos_insert_count: number;
  youtube_video_id_present: boolean;
  youtube_video_id: string | null;
  visibility: "private";
  public_upload: false;
  unlisted_upload: false;
  retry_loop_after_external_call: false;
  paid_api_called: false;
  fal_api_called: false;
  kling_api_called: false;
  comfyui_called: false;
  raw_urls_printed: false;
  secrets_printed: false;
};

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body.confirmation !== APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD) {
    return NextResponse.json(blockedReport({
      errorCode: "BLOCKED_BY_CONFIRMATION",
      blockedReasons: ["upload_confirmation_missing", "private_execute_approval_missing"]
    }), { status: 403 });
  }
  if (body.visibility === "public" || body.visibility === "unlisted") {
    return NextResponse.json(blockedReport({
      errorCode: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      blockedReasons: [body.visibility === "public" ? "visibility_public_blocked" : "visibility_unlisted_blocked"]
    }), { status: 400 });
  }

  try {
    const repository = getAutomationRepository();
    const result = await runRainyDryingRackPrivatePipeline({
      repository,
      fetchImpl: fetch,
      keywords: normalizeKeywords(body.keywords)
    });
    return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error_code) });
  } catch (error) {
    console.error("[uploads.youtube.rainy_drying_rack] private execute failed", {
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return NextResponse.json(blockedReport({
      errorCode: "RAINY_DRYING_RACK_PRIVATE_PIPELINE_FAILED",
      blockedReasons: ["safe_server_error"]
    }), { status: 500 });
  }
}

async function runRainyDryingRackPrivatePipeline(input: {
  repository: AutomationRepository;
  fetchImpl: typeof fetch;
  keywords: string[];
}): Promise<SafePipelineReport> {
  let externalApiCallCount = 0;
  const existingCandidates = await input.repository.getProductCandidates();
  const existingAssets = await input.repository.getProductAssets();
  const baseline = existingCandidates.find((candidate) => candidate.id === BASELINE_CANDIDATE_ID);
  const baselineProductNames = baseline?.product_name ? [baseline.product_name] : [];
  const baselineProductKeys = baseline?.product_key ? [baseline.product_key] : [];
  const collectedCandidates: ProductCandidate[] = [];
  let selectedKeyword: string | null = null;
  let lastBlockedReason: string | null = null;

  const existingSelection = selectExistingRainyDryingRackCandidateWithPreparedAsset({
    candidates: existingCandidates,
    assets: existingAssets,
    baselineProductNames,
    baselineProductKeys
  });
  if (existingSelection) {
    return renderRegisterAndUpload({
      repository: input.repository,
      candidate: existingSelection.candidate,
      candidateScore: existingSelection.score,
      selectedKeyword: readPayloadString(existingSelection.candidate, "source_keyword") || "existing rainy drying rack candidate",
      keywordExpansionUsed: false,
      externalApiCallCount: 0
    });
  }

  for (const keyword of input.keywords) {
    selectedKeyword = keyword;
    const requestResult = buildCoupangPartnersSearchRequest({ keyword, limit: 10 });
    if (!requestResult.ok) {
      return blockedReport({
        errorCode: requestResult.blocker,
        blockedReasons: [requestResult.blocker],
        selectedKeyword,
        externalApiCallCount
      });
    }

    externalApiCallCount += 1;
    const response = await input.fetchImpl(requestResult.request.url, {
      method: requestResult.request.method,
      headers: requestResult.request.headers
    });
    if (!response.ok) {
      return blockedReport({
        errorCode: `COUPANG_PARTNERS_API_HTTP_${response.status}`,
        blockedReasons: [`coupang_partners_api_http_${response.status}`],
        selectedKeyword,
        externalApiCallCount
      });
    }
    const payload = await safeJson(response);
    const products = extractPartnersProducts(payload);
    const candidates = products
      .flatMap((product) => mapPartnersProductToCandidateInput(product, keyword))
      .flatMap((candidateInput) => buildCandidate(candidateInput, existingCandidates));
    collectedCandidates.push(...candidates);

    const selected = selectRainyDryingRackCandidate(collectedCandidates, {
      baselineCandidateId: BASELINE_CANDIDATE_ID,
      baselineProductNames,
      baselineProductKeys
    });
    if (selected) {
      const readyCandidate = await downloadSelectedProductImage({
        candidate: selected.candidate,
        fetchImpl: input.fetchImpl
      });
      const rescored = selectRainyDryingRackCandidate([readyCandidate], {
        baselineCandidateId: BASELINE_CANDIDATE_ID,
        baselineProductNames,
        baselineProductKeys
      });
      if (!rescored) {
        lastBlockedReason = "RAINY_DRYING_RACK_CANDIDATE_SCORE_NOT_READY";
        continue;
      }

      await input.repository.upsertProductCandidates([readyCandidate]);
      return renderRegisterAndUpload({
        repository: input.repository,
        candidate: readyCandidate,
        candidateScore: rescored.score,
        selectedKeyword,
        keywordExpansionUsed: input.keywords.indexOf(keyword) > 0,
        externalApiCallCount
      });
    }
    lastBlockedReason = "RAINY_DRYING_RACK_CANDIDATE_NOT_FOUND";
  }

  return blockedReport({
    errorCode: lastBlockedReason ?? "RAINY_DRYING_RACK_CANDIDATE_NOT_FOUND",
    blockedReasons: [lastBlockedReason ?? "rainy_drying_rack_candidate_not_found"],
    selectedKeyword,
    externalApiCallCount
  });
}

function selectExistingRainyDryingRackCandidateWithPreparedAsset(input: {
  candidates: ProductCandidate[];
  assets: ProductAsset[];
  baselineProductNames: string[];
  baselineProductKeys: string[];
}) {
  const candidateIdsWithVideoAssets = new Set(
    input.assets
      .filter((asset) => asset.asset_type === "video" && Boolean(buildPreparedVideoAssetFromProductAsset(asset)))
      .map((asset) => asset.product_candidate_id)
      .filter((candidateId): candidateId is string => typeof candidateId === "string" && candidateId.trim().length > 0)
  );
  const eligibleCandidates = input.candidates.filter((candidate) => candidateIdsWithVideoAssets.has(candidate.id));
  return selectRainyDryingRackCandidate(eligibleCandidates, {
    baselineCandidateId: BASELINE_CANDIDATE_ID,
    baselineProductNames: input.baselineProductNames,
    baselineProductKeys: input.baselineProductKeys
  });
}

async function renderRegisterAndUpload(input: {
  repository: AutomationRepository;
  candidate: ProductCandidate;
  candidateScore: RainyDryingRackCandidateScore;
  selectedKeyword: string;
  keywordExpansionUsed: boolean;
  externalApiCallCount: number;
}): Promise<SafePipelineReport> {
  const renderer = createRainyDryingRackSceneCardRenderer();
  const asset = await renderer(input.candidate);
  const existingAssetRef = await findExistingPreparedVideoAssetRef(input.repository, input.candidate.id);
  let preparedVideoAssetRef: PreparedVideoAssetRef | null = existingAssetRef;
  let r2Uploaded = false;
  let productAssetsWritten = false;
  let rowsWritten = 0;

  if (!preparedVideoAssetRef) {
    const registrar = createOneProductServerAssetRegistrar(input.repository);
    const registration = await registrar({ candidate: input.candidate });
    if (!registration.ok) {
      return blockedReport({
        errorCode: registration.error_code,
        blockedReasons: registration.blocked_reasons,
        selectedKeyword: input.selectedKeyword,
        externalApiCallCount: input.externalApiCallCount,
        candidate: input.candidate,
        candidateScore: input.candidateScore,
        renderAttempted: true,
        mp4Created: true,
        asset
      });
    }
    preparedVideoAssetRef = registration.asset_ref;
    r2Uploaded = registration.r2_uploaded;
    productAssetsWritten = registration.db_written;
    rowsWritten = registration.rows_inserted_or_upserted;
  }

  if (!preparedVideoAssetRef) {
    return blockedReport({
      errorCode: "VIDEO_ASSET_REGISTRATION_NOT_READY",
      blockedReasons: ["prepared_video_asset_ref"],
      selectedKeyword: input.selectedKeyword,
      externalApiCallCount: input.externalApiCallCount,
      candidate: input.candidate,
      candidateScore: input.candidateScore,
      renderAttempted: true,
      mp4Created: true,
      asset
    });
  }

  const packageResult = buildYouTubeProductVideoUploadPackage({
    candidate_id: input.candidate.id,
    product_name: input.candidate.product_name,
    product_source: "coupang",
    selected_affiliate_url: input.candidate.selected_affiliate_url,
    prepared_video_asset: preparedVideoAssetRef,
    video_path_or_url: preparedVideoAssetRef.prepared_video_asset_url ?? preparedVideoAssetRef.signed_url ?? "",
    visibility: "private",
    title: buildTitle(input.candidate.product_name),
    description: asset.story_package.description,
    disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
    tags: ["coupang", "rainy season", "drying rack", "private review"],
    made_for_kids: false,
    shorts_content_quality: asset
  });
  if (!packageResult.ok) {
    return blockedReport({
      errorCode: "YOUTUBE_PRODUCT_UPLOAD_PACKAGE_NOT_READY",
      blockedReasons: packageResult.blocked_reasons,
      selectedKeyword: input.selectedKeyword,
      externalApiCallCount: input.externalApiCallCount,
      candidate: input.candidate,
      candidateScore: input.candidateScore,
      renderAttempted: true,
      mp4Created: true,
      asset,
      r2Uploaded,
      productAssetsWritten,
      rowsWritten,
      preparedVideoAssetRefPresent: true,
      productPackagePrepare: "BLOCKED",
      readinessCanUpload: false,
      readinessBlockedReasons: packageResult.blocked_reasons
    });
  }

  const uploadRequest = buildYouTubeUploadRequest({
    ...packageResult.package,
    execution_intent: "private_execute"
  });
  if (!uploadRequest.ok) {
    return blockedReport({
      errorCode: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      blockedReasons: uploadRequest.missing_reasons,
      selectedKeyword: input.selectedKeyword,
      externalApiCallCount: input.externalApiCallCount,
      candidate: input.candidate,
      candidateScore: input.candidateScore,
      renderAttempted: true,
      mp4Created: true,
      asset,
      r2Uploaded,
      productAssetsWritten,
      rowsWritten,
      preparedVideoAssetRefPresent: true,
      productPackagePrepare: "PASS",
      readinessCanUpload: false,
      readinessBlockedReasons: uploadRequest.missing_reasons
    });
  }

  const readiness = buildYouTubeUploadReadiness();
  const executeReadiness = buildYouTubeExecuteReadiness({
    confirmation: APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD,
    visibility: "private",
    executionIntent: "private_execute"
  });
  const readinessBlockedReasons = [
    ...readiness.blocked_reasons,
    ...executeReadiness.blocked_reasons
  ];
  if (!readiness.can_upload || !executeReadiness.can_execute) {
    return blockedReport({
      errorCode: "BLOCKED_BY_YOUTUBE_READINESS",
      blockedReasons: readinessBlockedReasons.length ? readinessBlockedReasons : ["youtube_readiness_blocked"],
      selectedKeyword: input.selectedKeyword,
      externalApiCallCount: input.externalApiCallCount,
      candidate: input.candidate,
      candidateScore: input.candidateScore,
      renderAttempted: true,
      mp4Created: true,
      asset,
      r2Uploaded,
      productAssetsWritten,
      rowsWritten,
      preparedVideoAssetRefPresent: true,
      productPackagePrepare: "PASS",
      readinessCanUpload: false,
      readinessBlockedReasons
    });
  }

  const uploadResult = await new ServerYouTubeUploadAdapter({
    accessTokenProvider: () => getYouTubeUploadAccessTokenForServerUpload()
  }).upload(uploadRequest.request);
  return {
    ...successBase({
      selectedKeyword: input.selectedKeyword,
      keywordExpansionUsed: input.keywordExpansionUsed,
      externalApiCallCount: input.externalApiCallCount,
      candidate: input.candidate,
      candidateScore: input.candidateScore,
      asset
    }),
    ok: uploadResult.succeeded,
    error_code: uploadResult.succeeded ? null : "YOUTUBE_PRIVATE_UPLOAD_FAILED",
    blocked_reasons: uploadResult.succeeded ? [] : uploadResult.blocked_reasons,
    r2_upload_attempted: !existingAssetRef,
    r2_uploaded: r2Uploaded,
    product_assets_written: productAssetsWritten,
    rows_written: rowsWritten,
    prepared_video_asset_ref_present: true,
    product_package_prepare: "PASS",
    readiness_can_upload: true,
    readiness_blocked_reasons: [],
    execute_attempted: true,
    execute_count: 1,
    videos_insert_called: uploadResult.resumable_session_attempted === true,
    videos_insert_count: uploadResult.resumable_session_attempted === true ? 1 : 0,
    youtube_video_id_present: Boolean(uploadResult.youtube_video_id),
    youtube_video_id: uploadResult.youtube_video_id ?? null
  };
}

function mapPartnersProductToCandidateInput(product: PartnersProduct, keyword: string): RainyCandidateInput[] {
  const productName = readString(product, "productName", "product_name", "name");
  const productId = readString(product, "productId", "product_id");
  const itemId = readString(product, "itemId", "item_id");
  const vendorItemId = readString(product, "vendorItemId", "vendor_item_id");
  const productUrl = readString(product, "productUrl", "product_url", "shortenUrl", "shorten_url");
  const productImage = readString(product, "productImage", "product_image", "productImageUrl", "image_url");
  if (!productName || !productId || !productUrl || !productImage) {
    return [];
  }
  return [{
    product_name: productName,
    raw_coupang_url: buildRawCoupangUrl({ productId, itemId, vendorItemId }),
    selected_affiliate_url: productUrl,
    thumbnail_url: productImage,
    productImage,
    category_path: readString(product, "categoryName", "category_name", "category"),
    price_now_text: readString(product, "productPrice", "price", "priceText"),
    item_id: itemId,
    vendor_item_id: vendorItemId,
    source_type: "event_aware_live_partners",
    source: "rainy_drying_rack_auto_private_upload",
    source_keyword: keyword,
    product_url: productUrl,
    productImageUrl: productImage,
    product_image_url: productImage,
    landing_url: productUrl,
    deeplink_url: productUrl,
    shorten_url: productUrl,
    image_url: productImage,
    imagePath: productImage,
    image_path: productImage,
    productUrl
  } satisfies RainyCandidateInput];
}

function buildCandidate(input: RainyCandidateInput, existingCandidates: ProductCandidate[]) {
  try {
    const built = buildCoupangCandidate(input, { candidates: existingCandidates }).candidate;
    return [{
      ...built,
      payload: {
        ...built.payload,
        source_keyword: readCandidateInputString(input, "source_keyword") || "drying rack"
      }
    }];
  } catch {
    return [];
  }
}

async function downloadSelectedProductImage(input: {
  candidate: ProductCandidate;
  fetchImpl: typeof fetch;
}) {
  const imageUrl = readPayloadString(input.candidate, "thumbnail_url") ||
    readPayloadString(input.candidate, "image_url") ||
    readPayloadString(input.candidate, "source_image_url");
  if (!imageUrl) {
    throw new Error("candidate_image_url_not_ready");
  }
  const response = await input.fetchImpl(imageUrl);
  if (!response.ok) {
    throw new Error("candidate_image_download_failed");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength <= 0) {
    throw new Error("candidate_image_download_empty");
  }
  const safeCandidateId = toSafeSlug(input.candidate.id);
  const outputDir = path.join(process.cwd(), "commerce-assets", "product-images", safeCandidateId);
  await fs.mkdir(outputDir, { recursive: true });
  const extension = imageExtension(response.headers.get("content-type"));
  const outputPath = path.join(outputDir, `source-product-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}${extension}`);
  await fs.writeFile(outputPath, bytes);
  return {
    ...input.candidate,
    payload: {
      ...input.candidate.payload,
      local_product_image_path: outputPath,
      image_readiness_status: "ready"
    }
  };
}

function extractPartnersProducts(payload: unknown): PartnersProduct[] {
  const record = isRecord(payload) ? payload : {};
  const data = isRecord(record.data) ? record.data : record;
  for (const key of ["productData", "products", "items", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

async function findExistingPreparedVideoAssetRef(
  repository: AutomationRepository,
  candidateId: string
): Promise<PreparedVideoAssetRef | null> {
  const assets = await repository.getProductAssets();
  const matching = assets
    .filter((asset) => asset.product_candidate_id === candidateId && asset.asset_type === "video")
    .sort((left, right) => String(right.updated_at ?? right.created_at).localeCompare(String(left.updated_at ?? left.created_at)))[0];
  if (!matching) {
    return null;
  }
  return buildPreparedVideoAssetFromProductAsset(matching);
}

function buildPreparedVideoAssetFromProductAsset(asset: ProductAsset): PreparedVideoAssetRef | null {
  const metadata = isRecord(asset.render_qa_metadata) ? asset.render_qa_metadata : {};
  return normalizePreparedVideoAssetRef({
    prepared_video_asset: {
      asset_id: readString(metadata, "asset_id") || asset.id,
      provider: readString(metadata, "prepared_video_asset_provider") || inferProviderFromBucket(asset.bucket),
      storage_key: readString(metadata, "storage_key"),
      prepared_video_asset_url: readString(metadata, "prepared_video_asset_url") || asset.url,
      signed_url: readString(metadata, "signed_url"),
      mime_type: readString(metadata, "mime_type") || "video/mp4",
      size_bytes: readNumber(metadata, "size_bytes"),
      checksum_sha256: readString(metadata, "checksum_sha256"),
      expires_at: readString(metadata, "expires_at"),
      server_accessible: metadata.server_accessible === true || /^https:\/\//i.test(asset.url)
    }
  });
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function successBase(input: {
  selectedKeyword: string;
  keywordExpansionUsed: boolean;
  externalApiCallCount: number;
  candidate: ProductCandidate;
  candidateScore: RainyDryingRackCandidateScore;
  asset: Awaited<ReturnType<ReturnType<typeof createRainyDryingRackSceneCardRenderer>>>;
}): SafePipelineReport {
  return {
    ok: true,
    error_code: null,
    blocked_reasons: [],
    selected_event: SELECTED_EVENT,
    selected_keyword: input.selectedKeyword,
    keyword_expansion_used: input.keywordExpansionUsed,
    external_api_call_count: input.externalApiCallCount,
    candidate_id: input.candidate.id,
    product_name: input.candidate.product_name,
    category: input.candidate.category ?? null,
    candidate_score: input.candidateScore,
    candidate_created_or_selected: true,
    affiliate_url_present: Boolean(input.candidate.selected_affiliate_url),
    product_image_present: true,
    provider: "advanced_still_motion",
    render_attempted: true,
    mp4_created: true,
    local_video_basename: path.basename(input.asset.local_video_path),
    duration_seconds: input.asset.duration_seconds ?? null,
    scene_count: input.asset.scene_count ?? null,
    true_scene_change_pass: input.asset.true_scene_change_pass === true,
    caption_safe_area_pass: input.asset.caption_safe_area_pass === true,
    no_text_clipped: input.asset.no_text_clipped === true,
    voiceover_audio_present: input.asset.voiceover_audio_present === true,
    video_has_audio_stream: input.asset.video_has_audio_stream === true,
    loss_aversion_hook_present: input.asset.loss_aversion_hook_present,
    cta_scene_present: input.asset.cta_scene_present === true,
    coupang_disclosure_ready: input.asset.coupang_disclosure_ready,
    r2_upload_attempted: false,
    r2_uploaded: false,
    product_assets_written: false,
    rows_written: 0,
    prepared_video_asset_ref_present: false,
    product_package_prepare: "NOT_ATTEMPTED",
    readiness_can_upload: false,
    readiness_blocked_reasons: [],
    execute_attempted: false,
    execute_count: 0,
    videos_insert_called: false,
    videos_insert_count: 0,
    youtube_video_id_present: false,
    youtube_video_id: null,
    visibility: "private",
    public_upload: false,
    unlisted_upload: false,
    retry_loop_after_external_call: false,
    paid_api_called: false,
    fal_api_called: false,
    kling_api_called: false,
    comfyui_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

function blockedReport(input: {
  errorCode: string | null;
  blockedReasons: string[];
  selectedKeyword?: string | null;
  externalApiCallCount?: number;
  candidate?: ProductCandidate;
  candidateScore?: RainyDryingRackCandidateScore;
  renderAttempted?: boolean;
  mp4Created?: boolean;
  asset?: Awaited<ReturnType<ReturnType<typeof createRainyDryingRackSceneCardRenderer>>>;
  r2Uploaded?: boolean;
  productAssetsWritten?: boolean;
  rowsWritten?: number;
  preparedVideoAssetRefPresent?: boolean;
  productPackagePrepare?: "PASS" | "BLOCKED" | "NOT_ATTEMPTED";
  readinessCanUpload?: boolean;
  readinessBlockedReasons?: string[];
}): SafePipelineReport {
  const asset = input.asset;
  return {
    ok: false,
    error_code: input.errorCode,
    blocked_reasons: input.blockedReasons,
    selected_event: SELECTED_EVENT,
    selected_keyword: input.selectedKeyword ?? null,
    keyword_expansion_used: false,
    external_api_call_count: input.externalApiCallCount ?? 0,
    candidate_id: input.candidate?.id ?? null,
    product_name: input.candidate?.product_name ?? null,
    category: input.candidate?.category ?? null,
    candidate_score: input.candidateScore ?? null,
    candidate_created_or_selected: Boolean(input.candidate),
    affiliate_url_present: Boolean(input.candidate?.selected_affiliate_url),
    product_image_present: Boolean(input.candidate && (readPayloadString(input.candidate, "local_product_image_path") || readPayloadString(input.candidate, "thumbnail_url"))),
    provider: "advanced_still_motion",
    render_attempted: input.renderAttempted ?? false,
    mp4_created: input.mp4Created ?? false,
    local_video_basename: asset ? path.basename(asset.local_video_path) : null,
    duration_seconds: asset?.duration_seconds ?? null,
    scene_count: asset?.scene_count ?? null,
    true_scene_change_pass: asset?.true_scene_change_pass === true,
    caption_safe_area_pass: asset?.caption_safe_area_pass === true,
    no_text_clipped: asset?.no_text_clipped === true,
    voiceover_audio_present: asset?.voiceover_audio_present === true,
    video_has_audio_stream: asset?.video_has_audio_stream === true,
    loss_aversion_hook_present: asset?.loss_aversion_hook_present === true,
    cta_scene_present: asset?.cta_scene_present === true,
    coupang_disclosure_ready: asset?.coupang_disclosure_ready === true,
    r2_upload_attempted: Boolean(asset),
    r2_uploaded: input.r2Uploaded ?? false,
    product_assets_written: input.productAssetsWritten ?? false,
    rows_written: input.rowsWritten ?? 0,
    prepared_video_asset_ref_present: input.preparedVideoAssetRefPresent ?? false,
    product_package_prepare: input.productPackagePrepare ?? "NOT_ATTEMPTED",
    readiness_can_upload: input.readinessCanUpload ?? false,
    readiness_blocked_reasons: input.readinessBlockedReasons ?? input.blockedReasons,
    execute_attempted: false,
    execute_count: 0,
    videos_insert_called: false,
    videos_insert_count: 0,
    youtube_video_id_present: false,
    youtube_video_id: null,
    visibility: "private",
    public_upload: false,
    unlisted_upload: false,
    retry_loop_after_external_call: false,
    paid_api_called: false,
    fal_api_called: false,
    kling_api_called: false,
    comfyui_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return DEFAULT_KEYWORDS;
  }
  const keywords = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, 3);
  return keywords.length ? keywords : DEFAULT_KEYWORDS;
}

function buildRawCoupangUrl(input: { productId: string; itemId: string; vendorItemId: string }) {
  const url = new URL(`https://www.coupang.com/vp/products/${input.productId}`);
  if (input.itemId) {
    url.searchParams.set("itemId", input.itemId);
  }
  if (input.vendorItemId) {
    url.searchParams.set("vendorItemId", input.vendorItemId);
  }
  return url.toString();
}

function buildTitle(productName: string) {
  const cleaned = productName.trim();
  return cleaned
    ? `${cleaned} | \uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uAC74\uC870 \uCCB4\uD06C`
    : "\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4 \uBE68\uB798\uAC74\uC870\uB300 \uCCB4\uD06C";
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferProviderFromBucket(bucket: string) {
  return bucket === "r2-rendered-videos" ? "r2" : "external_https";
}

function readCandidateInputString(input: RainyCandidateInput, key: string) {
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readPayloadString(candidate: ProductCandidate, key: string) {
  const value = candidate.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function imageExtension(contentType: string | null) {
  if (contentType?.toLowerCase().includes("png")) {
    return ".png";
  }
  if (contentType?.toLowerCase().includes("webp")) {
    return ".webp";
  }
  return ".jpg";
}

function toSafeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "candidate";
}

function statusFor(errorCode: string | null) {
  if (!errorCode) {
    return 200;
  }
  if (errorCode.startsWith("COUPANG_PARTNERS_API_HTTP_")) {
    return 502;
  }
  if (errorCode === "BLOCKED_BY_YOUTUBE_READINESS") {
    return 403;
  }
  return 400;
}
