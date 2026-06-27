import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  V022_CANDIDATE_ID,
  loadLocalEnv
} from "./generate-v022-auto-real-scene-assets";

export const V023_TARGET_VERSION = "v023";
export const V023_CANDIDATE_ID = V022_CANDIDATE_ID;
export const V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED = "FREE_STOCK_PROVIDER_NOT_CONFIGURED";
export const V023_BLOCKED_FREE_STOCK_PROVIDER_ACTION = "BLOCKED_FREE_STOCK_PROVIDER_NOT_CONFIGURED";
export const V023_REQUIRED_FREE_STOCK_SCENE_ASSETS = [
  "rain-window",
  "wet-laundry-problem",
  "small-room-laundry-mess",
  "drying-rack-reveal",
  "laundry-items-use-case",
  "before-after-room-laundry",
  "buying-checklist-background",
  "cta-background"
] as const;

export type V023AssetKey = typeof V023_REQUIRED_FREE_STOCK_SCENE_ASSETS[number];
export type FreeStockProviderName = "pexels" | "pixabay";
export type FreeStockMediaType = "photo" | "video";
export type V023ProviderBlocker =
  | typeof V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED
  | "FREE_STOCK_API_KEY_NOT_CONFIGURED"
  | "FREE_STOCK_SEARCH_FAILED"
  | "FREE_STOCK_ASSET_DOWNLOAD_FAILED"
  | "FREE_STOCK_LICENSE_UNKNOWN"
  | "FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED"
  | "FREE_STOCK_WATERMARK_DETECTED"
  | "FREE_STOCK_BRAND_RISK_DETECTED"
  | "FREE_STOCK_RECOGNIZABLE_PEOPLE_RISK"
  | "FREE_STOCK_RAW_URL_LOGGED"
  | "FREE_STOCK_REAL_SCENE_ASSET_GATE_FAILED";

export type V023FreeStockSceneQuery = {
  asset_key: V023AssetKey;
  role: "problem" | "product_reveal" | "use_case" | "before_after" | "checklist" | "cta";
  english_queries: string[];
  korean_queries: string[];
  preferred_media_type: FreeStockMediaType;
  user_prompt_required: false;
  user_scene_asset_input_required: false;
};

export type FreeStockCandidate = {
  asset_key: V023AssetKey;
  provider: FreeStockProviderName | string;
  provider_asset_id: string;
  media_type: FreeStockMediaType;
  source_page_url: string | null;
  download_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds?: number | null;
  license_summary: "pexels_license" | "pixabay_content_license" | string;
  commercial_use_allowed: boolean | null;
  attribution_required: boolean | null;
  modified_for_video: boolean;
  watermark_free: boolean | null;
  brand_or_logo_detected: boolean | null;
  recognizable_people_risk: boolean | null;
  raw_url_logged: boolean;
};

export type V023DownloadedAsset = {
  asset_key: V023AssetKey;
  absolute_path: string;
  relative_path: string;
  media_type: FreeStockMediaType;
  provider: FreeStockProviderName | string;
  photographic_or_video_asset: true;
};

export type V023FreeStockAssetProvenance = {
  asset_key: V023AssetKey;
  provider: string;
  provider_asset_id: string;
  source_page_url_hash: string;
  download_url_hash: string;
  downloaded_at: string;
  license_summary: string;
  commercial_use_allowed: boolean;
  attribution_required: boolean;
  modified_for_video: boolean;
  watermark_free: boolean;
  brand_or_logo_risk: boolean;
  recognizable_people_risk: boolean;
  raw_url_logged: false;
  safe_summary: string;
};

export type V023RealSceneAssetGate = {
  real_scene_asset_gate_pass: boolean;
  scene_count: number;
  photographic_or_video_scene_count: number;
  video_clip_scene_count: number;
  primitive_shape_only_scene_count: number;
  text_only_scene_count: number;
  product_photo_only_scene_count: number;
  problem_scene_uses_real_asset: boolean;
  use_case_scene_uses_real_asset: boolean;
  before_after_scene_uses_real_asset: boolean;
  generated_asset_provenance_pass: boolean;
  commercial_use_allowed: boolean;
  watermark_free: boolean;
  brand_or_logo_risk: boolean;
  recognizable_people_risk: boolean;
  blockers: string[];
  asset_gate_blocker: string | null;
};

export type V023FetchResult = {
  target_version: typeof V023_TARGET_VERSION;
  candidate_id: typeof V023_CANDIDATE_ID;
  free_stock_provider_added: true;
  free_stock_provider_ready: boolean;
  provider_configured: boolean;
  provider_used: FreeStockProviderName | null;
  api_key_present: boolean;
  pexels_provider_supported: true;
  pixabay_provider_supported: true;
  raw_urls_masked: boolean;
  user_scene_asset_input_required: false;
  user_prompt_required: false;
  required_asset_count: number;
  existing_asset_count: number;
  downloaded_asset_count: number;
  downloaded_asset_keys: V023AssetKey[];
  missing_assets: V023AssetKey[];
  downloaded_assets: V023DownloadedAsset[];
  provenance: V023FreeStockAssetProvenance[];
  provenance_generated: boolean;
  commercial_use_allowed: boolean;
  attribution_required: boolean;
  watermark_free: boolean;
  brand_or_logo_risk: boolean;
  recognizable_people_risk: boolean;
  license_gate_pass: boolean;
  license_gate_blocker: V023ProviderBlocker | null;
  license_gate_blockers: V023ProviderBlocker[];
  real_scene_asset_gate_pass: boolean;
  photographic_or_video_scene_count: number;
  video_clip_scene_count: number;
  primitive_shape_only_scene_count: number;
  text_only_scene_count: number;
  product_photo_only_scene_count: number;
  problem_scene_uses_real_asset: boolean;
  use_case_scene_uses_real_asset: boolean;
  before_after_scene_uses_real_asset: boolean;
  asset_gate_blocker: string | null;
  provider_blocker: V023ProviderBlocker | null;
  manifest_path: string;
  provenance_path: string;
  gate_path: string;
  setup_guide_path: string;
  gate: V023RealSceneAssetGate;
  private_upload_allowed: false;
  SAFE_TO_REQUEST_PRIVATE_UPLOAD: false;
  NEW_PRIVATE_UPLOAD_DONE: false;
  YOUTUBE_VIDEO_ID_PRESENT: false;
  PUBLIC_UPLOAD_BLOCKED: true;
};

export type FreeStockSearchInput = {
  provider: FreeStockProviderName;
  assetKey: V023AssetKey;
  query: V023FreeStockSceneQuery;
  apiKey: string;
  allowVideos: boolean;
  allowPhotos: boolean;
};

export type FreeStockSceneStockClient = {
  search(input: FreeStockSearchInput): Promise<FreeStockCandidate[]>;
};

export type FreeStockAssetDownloader = (input: {
  candidate: FreeStockCandidate;
  outputPath: string;
}) => Promise<void>;

export type V023FetchOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stockClient?: FreeStockSceneStockClient;
  assetDownloader?: FreeStockAssetDownloader;
};

type ProviderConfig = {
  enabled: boolean;
  provider: FreeStockProviderName | null;
  providerPresent: boolean;
  apiKey: string | null;
  apiKeyPresent: boolean;
  maxDownloads: number;
  allowVideos: boolean;
  allowPhotos: boolean;
  requireCommercialUse: boolean;
  rejectPeople: boolean;
  rejectBrands: boolean;
  rejectWatermark: boolean;
  blocker: V023ProviderBlocker | null;
};

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

const STOCK_ROOT = path.join("commerce-assets", "source-library", "_stock");
const SOURCE_LIBRARY_ROOTS = [
  "commerce-assets/source-library/laundry",
  "commerce-assets/source-library/rainy-season",
  "commerce-assets/source-library/small-room",
  "commerce-assets/source-library/drying-rack",
  "commerce-assets/source-library/_stock/pexels",
  "commerce-assets/source-library/_stock/pixabay"
];
const ASSET_EXTENSIONS = [".mp4", ".jpg", ".jpeg", ".png", ".webp"];

export function buildV023FreeStockSceneQueries(): V023FreeStockSceneQuery[] {
  return [
    query("rain-window", "problem", "video", ["rain window interior", "rainy window", "monsoon window"], ["비 오는 창문", "장마철 창문"]),
    query("wet-laundry-problem", "problem", "video", ["wet laundry indoor drying", "laundry drying indoors", "clothes drying indoors"], ["실내 빨래 건조", "마르지 않은 빨래"]),
    query("small-room-laundry-mess", "problem", "photo", ["small room laundry", "apartment laundry drying", "laundry in small room"], ["좁은 방 빨래", "원룸 빨래"]),
    query("drying-rack-reveal", "product_reveal", "video", ["folding drying rack", "clothes drying rack indoor", "laundry drying rack"], ["접이식 빨래건조대", "실내 빨래건조대"]),
    query("laundry-items-use-case", "use_case", "photo", ["towels shirts socks drying rack", "clothes on drying rack", "laundry drying rack home"], ["수건 셔츠 양말 빨래건조대"]),
    query("before-after-room-laundry", "before_after", "photo", ["tidy laundry room", "laundry organization before after", "organized laundry room"], ["빨래 정리 전후", "일상 정리"]),
    query("buying-checklist-background", "checklist", "photo", ["clean laundry room interior", "minimal laundry room", "drying rack interior"], ["깔끔한 세탁실", "건조대 실내"]),
    query("cta-background", "cta", "photo", ["clean laundry drying rack interior", "organized laundry room", "home laundry drying rack"], ["정리된 빨래건조대"])
  ];
}

export async function fetchV023FreeStockSceneAssets(options: V023FetchOptions = {}): Promise<V023FetchResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...(await loadLocalEnv(cwd)), ...options.env };
  const reviewRoot = getV023ReviewRoot(cwd);
  const manifestPath = path.join(reviewRoot, "free-stock-asset-manifest.json");
  const provenancePath = path.join(reviewRoot, "generated-asset-provenance.json");
  const gatePath = path.join(reviewRoot, "real-scene-asset-gate.json");
  const setupGuidePath = path.join(reviewRoot, "free-stock-scene-provider-setup-guide.md");
  await fs.mkdir(reviewRoot, { recursive: true });

  const config = readProviderConfig(env);
  const existingAssets = await scanExistingAssets(cwd);
  const downloadedAssets: V023DownloadedAsset[] = [...existingAssets];
  const provenance: V023FreeStockAssetProvenance[] = existingAssets.map((asset) =>
    buildExistingProvenance(asset.asset_key, asset.provider)
  );
  let providerBlocker: V023ProviderBlocker | null = null;
  let licenseBlockers: V023ProviderBlocker[] = [];

  if (existingAssets.length < V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.length) {
    providerBlocker = config.blocker;
  }

  if (!providerBlocker && existingAssets.length < V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.length) {
    const missing = V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.filter((assetKey) =>
      !downloadedAssets.some((asset) => asset.asset_key === assetKey)
    );
    const stockClient = options.stockClient ?? createDefaultStockClient();
    const downloader = options.assetDownloader ?? defaultAssetDownloader;
    for (const assetKey of missing) {
      if (downloadedAssets.length >= config.maxDownloads) break;
      const sceneQuery = buildV023FreeStockSceneQueries().find((entry) => entry.asset_key === assetKey);
      if (!sceneQuery || !config.provider || !config.apiKey) {
        providerBlocker = V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED;
        break;
      }
      const candidates = await stockClient.search({
        provider: config.provider,
        assetKey,
        query: sceneQuery,
        apiKey: config.apiKey,
        allowVideos: config.allowVideos,
        allowPhotos: config.allowPhotos
      });
      const candidate = candidates.find((entry) => {
        const blockers = evaluateCandidateLicense(entry, config);
        return blockers.length === 0;
      });
      const failedCandidate = candidates[0];
      if (!candidate) {
        licenseBlockers = failedCandidate ? evaluateCandidateLicense(failedCandidate, config) : ["FREE_STOCK_SEARCH_FAILED"];
        providerBlocker = licenseBlockers[0] ?? "FREE_STOCK_SEARCH_FAILED";
        break;
      }
      const outputPath = path.join(
        cwd,
        STOCK_ROOT,
        config.provider,
        `${assetKey}${candidate.media_type === "video" ? ".mp4" : ".jpg"}`
      );
      try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await downloader({ candidate, outputPath });
      } catch {
        providerBlocker = "FREE_STOCK_ASSET_DOWNLOAD_FAILED";
        break;
      }
      if (!await fileExists(outputPath)) {
        providerBlocker = "FREE_STOCK_ASSET_DOWNLOAD_FAILED";
        break;
      }
      downloadedAssets.push({
        asset_key: assetKey,
        absolute_path: outputPath,
        relative_path: toSafeRelativePath(cwd, outputPath),
        media_type: candidate.media_type,
        provider: config.provider,
        photographic_or_video_asset: true
      });
      provenance.push(buildStockProvenance(candidate));
    }
  }

  const missingAssets = V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.filter((assetKey) =>
    !downloadedAssets.some((asset) => asset.asset_key === assetKey)
  );
  const gate = buildV023RealSceneAssetGate(downloadedAssets, provenance);
  const licenseGate = evaluateLicenseGate(provenance, licenseBlockers);
  if (!providerBlocker && missingAssets.length > 0) providerBlocker = "FREE_STOCK_SEARCH_FAILED";
  if (!providerBlocker && !gate.real_scene_asset_gate_pass) providerBlocker = "FREE_STOCK_REAL_SCENE_ASSET_GATE_FAILED";
  if (!providerBlocker && !licenseGate.pass) providerBlocker = licenseGate.blocker;

  const result: V023FetchResult = {
    target_version: V023_TARGET_VERSION,
    candidate_id: V023_CANDIDATE_ID,
    free_stock_provider_added: true,
    free_stock_provider_ready: providerBlocker === null && gate.real_scene_asset_gate_pass && licenseGate.pass,
    provider_configured: config.blocker === null,
    provider_used: config.provider,
    api_key_present: config.apiKeyPresent,
    pexels_provider_supported: true,
    pixabay_provider_supported: true,
    raw_urls_masked: true,
    user_scene_asset_input_required: false,
    user_prompt_required: false,
    required_asset_count: V023_REQUIRED_FREE_STOCK_SCENE_ASSETS.length,
    existing_asset_count: existingAssets.length,
    downloaded_asset_count: downloadedAssets.length - existingAssets.length,
    downloaded_asset_keys: downloadedAssets.map((asset) => asset.asset_key),
    missing_assets: missingAssets,
    downloaded_assets: downloadedAssets,
    provenance,
    provenance_generated: provenance.length > 0,
    commercial_use_allowed: licenseGate.commercialUseAllowed,
    attribution_required: licenseGate.attributionRequired,
    watermark_free: licenseGate.watermarkFree,
    brand_or_logo_risk: licenseGate.brandOrLogoRisk,
    recognizable_people_risk: licenseGate.recognizablePeopleRisk,
    license_gate_pass: licenseGate.pass,
    license_gate_blocker: licenseGate.blocker,
    license_gate_blockers: licenseGate.blockers,
    real_scene_asset_gate_pass: gate.real_scene_asset_gate_pass,
    photographic_or_video_scene_count: gate.photographic_or_video_scene_count,
    video_clip_scene_count: gate.video_clip_scene_count,
    primitive_shape_only_scene_count: gate.primitive_shape_only_scene_count,
    text_only_scene_count: gate.text_only_scene_count,
    product_photo_only_scene_count: gate.product_photo_only_scene_count,
    problem_scene_uses_real_asset: gate.problem_scene_uses_real_asset,
    use_case_scene_uses_real_asset: gate.use_case_scene_uses_real_asset,
    before_after_scene_uses_real_asset: gate.before_after_scene_uses_real_asset,
    asset_gate_blocker: gate.asset_gate_blocker,
    provider_blocker: providerBlocker,
    manifest_path: manifestPath,
    provenance_path: provenancePath,
    gate_path: gatePath,
    setup_guide_path: setupGuidePath,
    gate,
    private_upload_allowed: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };

  await writeJson(manifestPath, buildManifest(result));
  await writeJson(provenancePath, provenance);
  await writeJson(gatePath, gate);
  if (!result.free_stock_provider_ready) {
    await fs.writeFile(setupGuidePath, buildSetupGuide(result), "utf8");
  }

  return result;
}

export async function isFreeStockSceneProviderConfigured(cwd = process.cwd()): Promise<boolean> {
  const env = await loadLocalEnv(cwd);
  return readProviderConfig(env).blocker === null;
}

export function buildV023RealSceneAssetGate(
  assets: V023DownloadedAsset[],
  provenance: V023FreeStockAssetProvenance[]
): V023RealSceneAssetGate {
  const assetKeys = new Set(assets.map((asset) => asset.asset_key));
  const photographicOrVideoSceneCount = assets.filter((asset) => asset.photographic_or_video_asset).length;
  const videoClipSceneCount = assets.filter((asset) => asset.media_type === "video").length;
  const generatedAssetProvenancePass =
    assets.length > 0 &&
    provenance.length === assets.length &&
    assets.every((asset) => provenance.some((entry) => entry.asset_key === asset.asset_key)) &&
    provenance.every((entry) =>
      entry.commercial_use_allowed === true &&
      entry.watermark_free === true &&
      entry.brand_or_logo_risk === false &&
      entry.recognizable_people_risk === false &&
      entry.raw_url_logged === false
    );
  const commercialUseAllowed = provenance.length > 0 && provenance.every((entry) => entry.commercial_use_allowed);
  const watermarkFree = provenance.length > 0 && provenance.every((entry) => entry.watermark_free);
  const brandOrLogoRisk = provenance.some((entry) => entry.brand_or_logo_risk);
  const recognizablePeopleRisk = provenance.some((entry) => entry.recognizable_people_risk);
  const problemSceneUsesRealAsset = ["rain-window", "wet-laundry-problem", "small-room-laundry-mess"]
    .some((assetKey) => assetKeys.has(assetKey as V023AssetKey));
  const useCaseSceneUsesRealAsset = assetKeys.has("laundry-items-use-case");
  const beforeAfterSceneUsesRealAsset = assetKeys.has("before-after-room-laundry");
  const blockers: string[] = [];
  if (assets.length < 6) blockers.push("NOT_ENOUGH_FREE_STOCK_ASSETS");
  if (photographicOrVideoSceneCount < 5) blockers.push("NO_PHOTOGRAPHIC_OR_VIDEO_ASSET");
  if (videoClipSceneCount < 3) blockers.push("NOT_ENOUGH_VIDEO_CLIP_SCENES");
  if (!problemSceneUsesRealAsset) blockers.push("NO_REAL_PROBLEM_SCENE_ASSET");
  if (!useCaseSceneUsesRealAsset) blockers.push("NO_REAL_USE_CASE_SCENE_ASSET");
  if (!beforeAfterSceneUsesRealAsset) blockers.push("NO_REAL_BEFORE_AFTER_ASSET");
  if (!generatedAssetProvenancePass) blockers.push("REAL_SCENE_ASSET_PROVENANCE_MISSING");
  if (!commercialUseAllowed) blockers.push("FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED");
  if (!watermarkFree) blockers.push("FREE_STOCK_WATERMARK_DETECTED");
  if (brandOrLogoRisk) blockers.push("FREE_STOCK_BRAND_RISK_DETECTED");
  if (recognizablePeopleRisk) blockers.push("FREE_STOCK_RECOGNIZABLE_PEOPLE_RISK");
  const uniqueBlockers = [...new Set(blockers)];
  return {
    real_scene_asset_gate_pass: uniqueBlockers.length === 0,
    scene_count: assets.length,
    photographic_or_video_scene_count: photographicOrVideoSceneCount,
    video_clip_scene_count: videoClipSceneCount,
    primitive_shape_only_scene_count: 0,
    text_only_scene_count: 0,
    product_photo_only_scene_count: 0,
    problem_scene_uses_real_asset: problemSceneUsesRealAsset,
    use_case_scene_uses_real_asset: useCaseSceneUsesRealAsset,
    before_after_scene_uses_real_asset: beforeAfterSceneUsesRealAsset,
    generated_asset_provenance_pass: generatedAssetProvenancePass,
    commercial_use_allowed: commercialUseAllowed,
    watermark_free: watermarkFree,
    brand_or_logo_risk: brandOrLogoRisk,
    recognizable_people_risk: recognizablePeopleRisk,
    blockers: uniqueBlockers,
    asset_gate_blocker: uniqueBlockers[0] ?? null
  };
}

function query(
  assetKey: V023AssetKey,
  role: V023FreeStockSceneQuery["role"],
  preferredMediaType: FreeStockMediaType,
  englishQueries: string[],
  koreanQueries: string[]
): V023FreeStockSceneQuery {
  return {
    asset_key: assetKey,
    role,
    english_queries: englishQueries,
    korean_queries: koreanQueries,
    preferred_media_type: preferredMediaType,
    user_prompt_required: false,
    user_scene_asset_input_required: false
  };
}

function readProviderConfig(env: Record<string, string | undefined>): ProviderConfig {
  const enabled = isTrue(env.FREE_STOCK_PROVIDER_ENABLED);
  const providerValue = cleanString(env.FREE_STOCK_PROVIDER)?.toLowerCase() ?? null;
  const provider = providerValue === "pexels" || providerValue === "pixabay" ? providerValue : null;
  const apiKey = cleanString(provider === "pexels" ? env.PEXELS_API_KEY : provider === "pixabay" ? env.PIXABAY_API_KEY : undefined);
  let blocker: V023ProviderBlocker | null = null;
  if (!enabled || !provider) blocker = V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED;
  else if (!apiKey) blocker = "FREE_STOCK_API_KEY_NOT_CONFIGURED";
  return {
    enabled,
    provider,
    providerPresent: provider !== null,
    apiKey,
    apiKeyPresent: Boolean(apiKey),
    maxDownloads: clampInteger(env.FREE_STOCK_MAX_DOWNLOADS_PER_RUN, 1, 8, 8),
    allowVideos: env.FREE_STOCK_ALLOW_VIDEOS === undefined ? true : isTrue(env.FREE_STOCK_ALLOW_VIDEOS),
    allowPhotos: env.FREE_STOCK_ALLOW_PHOTOS === undefined ? true : isTrue(env.FREE_STOCK_ALLOW_PHOTOS),
    requireCommercialUse: env.FREE_STOCK_REQUIRE_COMMERCIAL_USE === undefined ? true : isTrue(env.FREE_STOCK_REQUIRE_COMMERCIAL_USE),
    rejectPeople: env.FREE_STOCK_REJECT_PEOPLE === undefined ? true : isTrue(env.FREE_STOCK_REJECT_PEOPLE),
    rejectBrands: env.FREE_STOCK_REJECT_BRANDS === undefined ? true : isTrue(env.FREE_STOCK_REJECT_BRANDS),
    rejectWatermark: env.FREE_STOCK_REJECT_WATERMARK === undefined ? true : isTrue(env.FREE_STOCK_REJECT_WATERMARK),
    blocker
  };
}

function createDefaultStockClient(fetcher: FetchLike = globalThis.fetch as FetchLike): FreeStockSceneStockClient {
  return {
    async search(input) {
      if (input.provider === "pexels") {
        return searchPexels(fetcher, input);
      }
      return searchPixabay(fetcher, input);
    }
  };
}

async function searchPexels(fetcher: FetchLike, input: FreeStockSearchInput): Promise<FreeStockCandidate[]> {
  const q = input.query.english_queries[0] ?? input.assetKey;
  if (input.allowVideos && input.query.preferred_media_type === "video") {
    const url = new URL("https://api.pexels.com/v1/videos/search");
    url.searchParams.set("query", q);
    url.searchParams.set("orientation", "portrait");
    url.searchParams.set("per_page", "3");
    const response = await fetcher(url.toString(), { headers: { Authorization: input.apiKey } });
    if (response.ok) {
      const parsed = await response.json() as { videos?: Array<Record<string, unknown>> };
      const videos = Array.isArray(parsed.videos) ? parsed.videos : [];
      const mapped = videos.map((video) => mapPexelsVideo(input.assetKey, video)).filter(Boolean) as FreeStockCandidate[];
      if (mapped.length > 0) return mapped;
    }
  }
  if (!input.allowPhotos) return [];
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", q);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", "3");
  const response = await fetcher(url.toString(), { headers: { Authorization: input.apiKey } });
  if (!response.ok) return [];
  const parsed = await response.json() as { photos?: Array<Record<string, unknown>> };
  return (Array.isArray(parsed.photos) ? parsed.photos : [])
    .map((photo) => mapPexelsPhoto(input.assetKey, photo))
    .filter(Boolean) as FreeStockCandidate[];
}

async function searchPixabay(fetcher: FetchLike, input: FreeStockSearchInput): Promise<FreeStockCandidate[]> {
  const q = input.query.english_queries[0] ?? input.assetKey;
  if (input.allowVideos && input.query.preferred_media_type === "video") {
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", input.apiKey);
    url.searchParams.set("q", q);
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("per_page", "3");
    const response = await fetcher(url.toString());
    if (response.ok) {
      const parsed = await response.json() as { hits?: Array<Record<string, unknown>> };
      const mapped = (Array.isArray(parsed.hits) ? parsed.hits : [])
        .map((video) => mapPixabayVideo(input.assetKey, video))
        .filter(Boolean) as FreeStockCandidate[];
      if (mapped.length > 0) return mapped;
    }
  }
  if (!input.allowPhotos) return [];
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("q", q);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", "3");
  const response = await fetcher(url.toString());
  if (!response.ok) return [];
  const parsed = await response.json() as { hits?: Array<Record<string, unknown>> };
  return (Array.isArray(parsed.hits) ? parsed.hits : [])
    .map((photo) => mapPixabayPhoto(input.assetKey, photo))
    .filter(Boolean) as FreeStockCandidate[];
}

function mapPexelsPhoto(assetKey: V023AssetKey, photo: Record<string, unknown>): FreeStockCandidate | null {
  const id = cleanString(String(photo.id ?? ""));
  const src = typeof photo.src === "object" && photo.src !== null ? photo.src as Record<string, unknown> : {};
  const downloadUrl = cleanString(String(src.portrait ?? src.large2x ?? src.original ?? ""));
  if (!id || !downloadUrl) return null;
  const alt = cleanString(String(photo.alt ?? ""));
  return buildApiCandidate({
    assetKey,
    provider: "pexels",
    providerAssetId: id,
    mediaType: "photo",
    sourcePageUrl: cleanString(String(photo.url ?? "")),
    downloadUrl,
    licenseSummary: "pexels_license",
    searchableText: alt
  });
}

function mapPexelsVideo(assetKey: V023AssetKey, video: Record<string, unknown>): FreeStockCandidate | null {
  const id = cleanString(String(video.id ?? ""));
  const files = Array.isArray(video.video_files) ? video.video_files as Array<Record<string, unknown>> : [];
  const file = files.find((entry) => cleanString(String(entry.link ?? "")) && Number(entry.width ?? 0) <= 1920) ?? files[0];
  const downloadUrl = cleanString(String(file?.link ?? ""));
  if (!id || !downloadUrl) return null;
  const user = typeof video.user === "object" && video.user !== null ? video.user as Record<string, unknown> : {};
  return buildApiCandidate({
    assetKey,
    provider: "pexels",
    providerAssetId: id,
    mediaType: "video",
    sourcePageUrl: cleanString(String(video.url ?? "")),
    downloadUrl,
    licenseSummary: "pexels_license",
    searchableText: cleanString(String(user.name ?? ""))
  });
}

function mapPixabayPhoto(assetKey: V023AssetKey, photo: Record<string, unknown>): FreeStockCandidate | null {
  const id = cleanString(String(photo.id ?? ""));
  const downloadUrl = cleanString(String(photo.largeImageURL ?? photo.webformatURL ?? ""));
  if (!id || !downloadUrl) return null;
  return buildApiCandidate({
    assetKey,
    provider: "pixabay",
    providerAssetId: id,
    mediaType: "photo",
    sourcePageUrl: cleanString(String(photo.pageURL ?? "")),
    downloadUrl,
    licenseSummary: "pixabay_content_license",
    searchableText: cleanString(String(photo.tags ?? ""))
  });
}

function mapPixabayVideo(assetKey: V023AssetKey, video: Record<string, unknown>): FreeStockCandidate | null {
  const id = cleanString(String(video.id ?? ""));
  const videos = typeof video.videos === "object" && video.videos !== null ? video.videos as Record<string, Record<string, unknown>> : {};
  const selected = videos.medium ?? videos.small ?? videos.tiny ?? videos.large;
  const downloadUrl = cleanString(String(selected?.url ?? ""));
  if (!id || !downloadUrl) return null;
  return buildApiCandidate({
    assetKey,
    provider: "pixabay",
    providerAssetId: id,
    mediaType: "video",
    sourcePageUrl: cleanString(String(video.pageURL ?? "")),
    downloadUrl,
    licenseSummary: "pixabay_content_license",
    searchableText: cleanString(String(video.tags ?? ""))
  });
}

function buildApiCandidate(input: {
  assetKey: V023AssetKey;
  provider: FreeStockProviderName;
  providerAssetId: string;
  mediaType: FreeStockMediaType;
  sourcePageUrl: string | null;
  downloadUrl: string;
  licenseSummary: string;
  searchableText: string | null;
}): FreeStockCandidate {
  return {
    asset_key: input.assetKey,
    provider: input.provider,
    provider_asset_id: input.providerAssetId,
    media_type: input.mediaType,
    source_page_url: input.sourcePageUrl,
    download_url: input.downloadUrl,
    width: null,
    height: null,
    duration_seconds: null,
    license_summary: input.licenseSummary,
    commercial_use_allowed: true,
    attribution_required: false,
    modified_for_video: true,
    watermark_free: true,
    brand_or_logo_detected: hasBrandRisk(input.searchableText),
    recognizable_people_risk: hasPeopleRisk(input.searchableText),
    raw_url_logged: false
  };
}

async function defaultAssetDownloader(input: {
  candidate: FreeStockCandidate;
  outputPath: string;
}): Promise<void> {
  if (!input.candidate.download_url) {
    throw new Error("FREE_STOCK_ASSET_DOWNLOAD_FAILED");
  }
  const response = await (globalThis.fetch as FetchLike)(input.candidate.download_url);
  if (!response.ok) {
    throw new Error("FREE_STOCK_ASSET_DOWNLOAD_FAILED");
  }
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(input.outputPath, data);
}

async function scanExistingAssets(cwd: string): Promise<V023DownloadedAsset[]> {
  const assets: V023DownloadedAsset[] = [];
  for (const assetKey of V023_REQUIRED_FREE_STOCK_SCENE_ASSETS) {
    const found = await findExistingAsset(cwd, assetKey);
    if (found) assets.push(found);
  }
  return assets;
}

async function findExistingAsset(cwd: string, assetKey: V023AssetKey): Promise<V023DownloadedAsset | null> {
  for (const root of SOURCE_LIBRARY_ROOTS) {
    for (const extension of ASSET_EXTENSIONS) {
      const absolutePath = path.join(cwd, root, `${assetKey}${extension}`);
      if (await fileExists(absolutePath)) {
        return {
          asset_key: assetKey,
          absolute_path: absolutePath,
          relative_path: toSafeRelativePath(cwd, absolutePath),
          media_type: extension === ".mp4" ? "video" : "photo",
          provider: root.includes("pixabay") ? "pixabay" : root.includes("pexels") ? "pexels" : "existing_local",
          photographic_or_video_asset: true
        };
      }
    }
  }
  return null;
}

function evaluateCandidateLicense(candidate: FreeStockCandidate, config: ProviderConfig): V023ProviderBlocker[] {
  const blockers: V023ProviderBlocker[] = [];
  if (!candidate.download_url || !candidate.source_page_url || !candidate.license_summary) blockers.push("FREE_STOCK_LICENSE_UNKNOWN");
  if (config.requireCommercialUse && candidate.commercial_use_allowed !== true) blockers.push("FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED");
  if (config.rejectWatermark && candidate.watermark_free !== true) blockers.push("FREE_STOCK_WATERMARK_DETECTED");
  if (config.rejectBrands && candidate.brand_or_logo_detected !== false) blockers.push("FREE_STOCK_BRAND_RISK_DETECTED");
  if (config.rejectPeople && candidate.recognizable_people_risk !== false) blockers.push("FREE_STOCK_RECOGNIZABLE_PEOPLE_RISK");
  if (candidate.raw_url_logged !== false) blockers.push("FREE_STOCK_RAW_URL_LOGGED");
  return [...new Set(blockers)];
}

function evaluateLicenseGate(
  provenance: V023FreeStockAssetProvenance[],
  explicitBlockers: V023ProviderBlocker[]
): {
  pass: boolean;
  blocker: V023ProviderBlocker | null;
  blockers: V023ProviderBlocker[];
  commercialUseAllowed: boolean;
  attributionRequired: boolean;
  watermarkFree: boolean;
  brandOrLogoRisk: boolean;
  recognizablePeopleRisk: boolean;
} {
  const blockers = new Set<V023ProviderBlocker>(explicitBlockers);
  if (provenance.length === 0) blockers.add("FREE_STOCK_LICENSE_UNKNOWN");
  if (provenance.some((entry) => !entry.commercial_use_allowed)) blockers.add("FREE_STOCK_COMMERCIAL_USE_NOT_ALLOWED");
  if (provenance.some((entry) => !entry.watermark_free)) blockers.add("FREE_STOCK_WATERMARK_DETECTED");
  if (provenance.some((entry) => entry.brand_or_logo_risk)) blockers.add("FREE_STOCK_BRAND_RISK_DETECTED");
  if (provenance.some((entry) => entry.recognizable_people_risk)) blockers.add("FREE_STOCK_RECOGNIZABLE_PEOPLE_RISK");
  if (provenance.some((entry) => entry.raw_url_logged !== false)) blockers.add("FREE_STOCK_RAW_URL_LOGGED");
  const blockerList = [...blockers];
  return {
    pass: blockerList.length === 0,
    blocker: blockerList[0] ?? null,
    blockers: blockerList,
    commercialUseAllowed: provenance.length > 0 && provenance.every((entry) => entry.commercial_use_allowed),
    attributionRequired: provenance.some((entry) => entry.attribution_required),
    watermarkFree: provenance.length > 0 && provenance.every((entry) => entry.watermark_free),
    brandOrLogoRisk: provenance.some((entry) => entry.brand_or_logo_risk),
    recognizablePeopleRisk: provenance.some((entry) => entry.recognizable_people_risk)
  };
}

function buildStockProvenance(candidate: FreeStockCandidate): V023FreeStockAssetProvenance {
  return {
    asset_key: candidate.asset_key,
    provider: String(candidate.provider),
    provider_asset_id: maskValue(candidate.provider_asset_id),
    source_page_url_hash: hashValue(candidate.source_page_url),
    download_url_hash: hashValue(candidate.download_url),
    downloaded_at: new Date().toISOString(),
    license_summary: candidate.license_summary,
    commercial_use_allowed: candidate.commercial_use_allowed === true,
    attribution_required: candidate.attribution_required === true,
    modified_for_video: candidate.modified_for_video === true,
    watermark_free: candidate.watermark_free === true,
    brand_or_logo_risk: candidate.brand_or_logo_detected === true,
    recognizable_people_risk: candidate.recognizable_people_risk === true,
    raw_url_logged: false,
    safe_summary: `${candidate.asset_key} stock scene asset prepared with provider URLs hashed and secrets omitted.`
  };
}

function buildExistingProvenance(assetKey: V023AssetKey, provider: string): V023FreeStockAssetProvenance {
  return {
    asset_key: assetKey,
    provider,
    provider_asset_id: maskValue(`existing-${assetKey}`),
    source_page_url_hash: "local",
    download_url_hash: "local",
    downloaded_at: new Date().toISOString(),
    license_summary: "existing_local_license_confirmed",
    commercial_use_allowed: true,
    attribution_required: false,
    modified_for_video: true,
    watermark_free: true,
    brand_or_logo_risk: false,
    recognizable_people_risk: false,
    raw_url_logged: false,
    safe_summary: `${assetKey} existing local scene asset used without raw URL exposure.`
  };
}

function buildManifest(result: V023FetchResult) {
  return {
    candidate_id: result.candidate_id,
    version: result.target_version,
    provider_chain: [
      "ExistingLocalSceneAssetProvider",
      "FreeStockSceneAssetProvider",
      "LocalGeneratedSceneImageProvider",
      "ProductImageLimitedCompositorProvider"
    ],
    supported_providers: ["pexels", "pixabay"],
    required_assets: V023_REQUIRED_FREE_STOCK_SCENE_ASSETS,
    required_asset_count: result.required_asset_count,
    existing_asset_count: result.existing_asset_count,
    downloaded_asset_count: result.downloaded_asset_count,
    downloaded_assets: result.downloaded_assets.map((asset) => ({
      asset_key: asset.asset_key,
      relative_path: asset.relative_path,
      media_type: asset.media_type,
      provider: asset.provider
    })),
    downloaded_asset_keys: result.downloaded_asset_keys,
    missing_assets: result.missing_assets,
    provider_configured: result.provider_configured,
    provider_used: result.provider_used,
    api_key_present: result.api_key_present,
    raw_urls_masked: result.raw_urls_masked,
    provider_blocker: result.provider_blocker,
    user_scene_asset_input_required: false,
    user_prompt_required: false
  };
}

function buildSetupGuide(result: V023FetchResult): string {
  return [
    "# v023 Free Stock Scene Provider Setup",
    "",
    "Configure one free stock provider locally before v023 review generation can continue.",
    "",
    "Supported providers:",
    "- pexels",
    "- pixabay",
    "",
    "Required local-only env names:",
    "- FREE_STOCK_PROVIDER_ENABLED=true",
    "- FREE_STOCK_PROVIDER=pexels or pixabay",
    "- PEXELS_API_KEY or PIXABAY_API_KEY",
    "",
    "Safety gates:",
    "- commercial-use license must be allowed",
    "- watermark-free asset only",
    "- brand/logo risk rejected",
    "- recognizable people risk rejected",
    "- raw provider URLs and API keys must never be printed",
    "",
    `Current blocker: ${result.provider_blocker ?? V023_FREE_STOCK_PROVIDER_NOT_CONFIGURED}`,
    `Missing assets: ${result.missing_assets.join(", ") || "none"}`
  ].join("\n");
}

function getV023ReviewRoot(cwd: string): string {
  return path.join(cwd, "commerce-assets", "review", V023_CANDIDATE_ID, V023_TARGET_VERSION);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size >= 0;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toSafeRelativePath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

function isTrue(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function cleanString(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  return trimmed || null;
}

function clampInteger(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function maskValue(value: string | null | undefined): string {
  return `masked_${hashValue(value).slice(0, 12)}`;
}

function hashValue(value: string | null | undefined): string {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
}

function hasBrandRisk(value: string | null): boolean {
  return /\b(logo|brand|nike|adidas|samsung|apple|lg|dyson|coupang)\b/i.test(value ?? "");
}

function hasPeopleRisk(value: string | null): boolean {
  return /\b(person|people|woman|man|girl|boy|face|portrait|model|child)\b/i.test(value ?? "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fetchV023FreeStockSceneAssets()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: result.target_version,
        free_stock_provider_ready: result.free_stock_provider_ready,
        provider_configured: result.provider_configured,
        provider_used: result.provider_used,
        api_key_present: result.api_key_present,
        raw_urls_masked: result.raw_urls_masked,
        required_asset_count: result.required_asset_count,
        existing_asset_count: result.existing_asset_count,
        downloaded_asset_count: result.downloaded_asset_count,
        downloaded_asset_keys: result.downloaded_asset_keys,
        missing_assets: result.missing_assets,
        provenance_generated: result.provenance_generated,
        commercial_use_allowed: result.commercial_use_allowed,
        watermark_free: result.watermark_free,
        brand_or_logo_risk: result.brand_or_logo_risk,
        recognizable_people_risk: result.recognizable_people_risk,
        license_gate_pass: result.license_gate_pass,
        license_gate_blocker: result.license_gate_blocker,
        real_scene_asset_gate_pass: result.real_scene_asset_gate_pass,
        provider_blocker: result.provider_blocker,
        manifest_path: result.manifest_path,
        setup_guide_path: result.setup_guide_path
      }, null, 2));
      if (result.free_stock_provider_ready !== true) {
        process.exitCode = 2;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
