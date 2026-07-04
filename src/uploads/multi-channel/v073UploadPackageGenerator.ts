import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getStoragePaths } from "../../lib/repositories/storagePaths";
import {
  buildV057CommentPreview,
  buildV057MetadataPreview,
  buildV057UploadSettingsPreview
} from "../../rendering/shorts/v057HookFirstFrameOptimization";
import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import {
  normalizeV057ProductSourceCandidate,
  validateV057ProductSourceCandidate,
  V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS,
  type V057CorrectedReuploadProductSourceKind
} from "./v057CorrectedReuploadProductSource";
import {
  resolveV057ReuploadAssetBindings,
  V057_REUPLOAD_ASSET_PROFILE,
  type V057ReuploadAssetProfile
} from "./v057ReuploadAssetBinding";
import { resolveV054RuntimeTargetChannelIds } from "./v054RuntimeYouTubeAdapterFactory";
import { buildV050DuplicateUploadGuard } from "./threeChannelYouTubeAdapterInjection";
import { validateYouTubeChannelId } from "./youtubeChannelIdValidator";
import type {
  V073UploadPackage,
  V073UploadPackageBlocker,
  V073UploadPackageGenerationResult,
  V073UploadPackageProductSourceKind,
  V073UploadPackageReport,
  V073UploadPackageReportItem
} from "./v073UploadPackage";

export type V073DisclosureOverride = Partial<Record<ChannelKey, {
  containsSyntheticMedia?: boolean;
  paidProductPlacement?: boolean;
  descriptionDisclosurePresent?: boolean;
  commentDisclosurePresent?: boolean;
}>>;

type SourceResolution =
  | {
    status: "ready";
    channelKey: ChannelKey;
    sourceKind: V073UploadPackageProductSourceKind;
    queueItemId: string | null;
    generatedContentId: string | null;
    rawCoupangUrl: string;
    productName: string;
    selectedAffiliateUrl: string | null;
    sourceEvidenceHash: string;
  }
  | {
    status: "missing" | "raw_missing" | "invalid";
    channelKey: ChannelKey;
    sourceKind: V073UploadPackageProductSourceKind | "missing" | "invalid";
  };

type CandidateRow = {
  raw: unknown;
  id: string | null;
  channelKey: ChannelKey | null;
  productName: string;
  rawCoupangUrl: string;
  selectedAffiliateUrl: string;
  updatedAt: string;
  sourceEvidenceHash: string;
};

export async function generateV073UploadPackages(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  uploadAssetProfile?: string | null;
  now?: string;
  disclosureOverrides?: V073DisclosureOverride;
} = {}): Promise<V073UploadPackageGenerationResult> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const now = input.now ?? new Date().toISOString();
  const selectedProfile = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? V057_REUPLOAD_ASSET_PROFILE
    : null;
  const sources = await Promise.all(CHANNEL_KEYS.map((channelKey) => resolveProductSource({
    cwd,
    channelKey,
    now
  })));
  const assetReport = await resolveV057ReuploadAssetBindings({
    cwd,
    uploadAssetProfile: input.uploadAssetProfile
  });
  const targetChannelIds = resolveV054RuntimeTargetChannelIds(env);
  const duplicateGuard = buildV050DuplicateUploadGuard(CHANNEL_KEYS.map((channelKey) => ({
    channel_key: channelKey,
    video_path: assetReport.bindings[channelKey].video_path
  })));
  const disclosure = Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    channelKey,
    buildDisclosureEvidence(channelKey, input.disclosureOverrides?.[channelKey])
  ])) as Record<ChannelKey, ReturnType<typeof buildDisclosureEvidence>>;
  const packages = CHANNEL_KEYS.flatMap((channelKey) => {
    const source = sources.find((item) => item.channelKey === channelKey);
    if (!source || source.status !== "ready" || selectedProfile === null) return [];
    return [buildUploadPackage({
      cwd,
    channelKey,
    selectedProfile,
    source,
    targetChannelId: targetChannelIds[channelKey] ?? "",
    asset: assetReport.bindings[channelKey],
      duplicateRisk: duplicateGuard.duplicate_upload_risk,
      disclosure: disclosure[channelKey]
    })];
  });
  const blocker = firstBlocker<V073UploadPackageBlocker>([
    selectedProfile === null ? "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED" : null,
    sources.some((source) => source.status === "invalid") ? "BLOCKED_V073_UPLOAD_PACKAGE_INVALID_MANIFEST" : null,
    sources.some((source) => source.status === "missing") ? "BLOCKED_V073_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING" : null,
    sources.some((source) => source.status === "raw_missing") ? "BLOCKED_V073_UPLOAD_PACKAGE_RAW_COUPANG_URL_MISSING" : null,
    assetReport.asset_binding_blocker === "BLOCKED_V057_ASSET_MISSING" ||
      assetReport.asset_binding_blocker === "BLOCKED_V057_ASSET_PATH_MISMATCH" ||
      CHANNEL_KEYS.some((channelKey) => !assetReport.bindings[channelKey].v057_mp4_exists)
      ? "BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING"
      : null,
    assetReport.asset_binding_blocker === "BLOCKED_V057_FIRST_FRAME_MISSING" ||
      CHANNEL_KEYS.some((channelKey) => !assetReport.bindings[channelKey].first_frame_v057_exists)
      ? "BLOCKED_V073_UPLOAD_PACKAGE_FIRST_FRAME_MISSING"
      : null,
    Object.values(disclosure).every((item) => item.ready) ? null : "BLOCKED_V073_UPLOAD_PACKAGE_DISCLOSURE_MISSING",
    packages.length > 0 && packages.every((item) => item.targetChannel.formatValid)
      ? null
      : "BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_MISSING",
    packages.length > 0 && packages.every((item) => item.deeplink.status === "ready")
      ? null
      : "BLOCKED_V073_UPLOAD_PACKAGE_DEEPLINK_PENDING",
    duplicateGuard.duplicate_upload_risk ? "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY" : null
  ]);
  const report = buildReport({
    selectedProfile,
    blocker,
    packages,
    sources,
    assetReport,
    targetChannelIds,
    disclosureReady: Object.values(disclosure).every((item) => item.ready),
    duplicateGuardReady: !duplicateGuard.duplicate_upload_risk
  });

  return {
    version: "v073",
    packages,
    report
  };
}

export async function writeV073UploadPackageArtifacts(input: {
  cwd?: string;
  result: V073UploadPackageGenerationResult;
}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v073");
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "upload-package-report.json"),
    `${JSON.stringify(input.result.report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputRoot, "upload-package-report.html"),
    buildHtmlReport(input.result.report),
    "utf8"
  );
}

export function buildV073UploadPackageGeneratorCliInput(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  return {
    cwd: input.cwd,
    env: input.env,
    uploadAssetProfile: input.env.V051_UPLOAD_ASSET_PROFILE ?? null
  };
}

async function resolveProductSource(input: {
  cwd: string;
  channelKey: ChannelKey;
  now: string;
}): Promise<SourceResolution> {
  const storagePaths = getStoragePaths(path.join(input.cwd, "data"));
  const queueRows = normalizeRows(await readJsonIfExists(storagePaths.queue));
  const generatedRows = normalizeRows(await readJsonIfExists(storagePaths.contents));
  const queue = findRowForChannel(queueRows, input.channelKey);
  const generated = findRowForChannel(generatedRows, input.channelKey);
  const pair = buildPairSource(input.channelKey, queue, generated);
  if (pair) return pair;

  const reviewManifest = await readReviewPackageManifest(input.cwd, input.channelKey);
  if (reviewManifest === INVALID_JSON) {
    return { status: "invalid", channelKey: input.channelKey, sourceKind: "invalid" };
  }
  const review = buildManifestSource(input.channelKey, reviewManifest, "v057_review_package_metadata");
  if (review) return review;

  const generatedOnly = buildSingleRowSource(input.channelKey, generated, "generated_content");
  if (generatedOnly) return generatedOnly;

  const queueOnly = buildSingleRowSource(input.channelKey, queue, "product_queue_item");
  if (queueOnly) return queueOnly;

  const trustedManifest = await readTrustedManifest(input.cwd, input.channelKey);
  if (trustedManifest === INVALID_JSON) {
    return { status: "invalid", channelKey: input.channelKey, sourceKind: "invalid" };
  }
  const trusted = buildManifestSource(input.channelKey, trustedManifest, "trusted_upstream_manifest");
  if (trusted) return trusted;

  return { status: "missing", channelKey: input.channelKey, sourceKind: "missing" };
}

function buildPairSource(
  channelKey: ChannelKey,
  queue: CandidateRow | null,
  generated: CandidateRow | null
): SourceResolution | null {
  if (!queue || !generated) return null;
  const rawCoupangUrl = queue.rawCoupangUrl || generated.rawCoupangUrl;
  if (!rawCoupangUrl) {
    return { status: "raw_missing", channelKey, sourceKind: "product_queue_item_generated_content_pair" };
  }
  return {
    status: "ready",
    channelKey,
    sourceKind: "product_queue_item_generated_content_pair",
    queueItemId: queue.id,
    generatedContentId: generated.id,
    rawCoupangUrl,
    productName: queue.productName || generated.productName,
    selectedAffiliateUrl: generated.selectedAffiliateUrl || queue.selectedAffiliateUrl || null,
    sourceEvidenceHash: queue.sourceEvidenceHash || generated.sourceEvidenceHash || hashEvidence(`${channelKey}:${rawCoupangUrl}`)
  };
}

function buildSingleRowSource(
  channelKey: ChannelKey,
  row: CandidateRow | null,
  sourceKind: Extract<V073UploadPackageProductSourceKind, "generated_content" | "product_queue_item">
): SourceResolution | null {
  if (!row) return null;
  if (!row.rawCoupangUrl) return { status: "raw_missing", channelKey, sourceKind };
  return {
    status: "ready",
    channelKey,
    sourceKind,
    queueItemId: sourceKind === "product_queue_item" ? row.id : null,
    generatedContentId: sourceKind === "generated_content" ? row.id : null,
    rawCoupangUrl: row.rawCoupangUrl,
    productName: row.productName,
    selectedAffiliateUrl: row.selectedAffiliateUrl || null,
    sourceEvidenceHash: row.sourceEvidenceHash || hashEvidence(`${channelKey}:${row.rawCoupangUrl}`)
  };
}

function buildManifestSource(
  channelKey: ChannelKey,
  payload: unknown,
  sourceKind: Extract<V073UploadPackageProductSourceKind, "v057_review_package_metadata" | "trusted_upstream_manifest">
): SourceResolution | null {
  if (!payload) return null;
  const normalized = normalizeV057ProductSourceCandidate(
    payload,
    sourceKind === "v057_review_package_metadata"
      ? "v057_review_package_metadata"
      : "generated_upload_metadata"
  );
  const validation = validateV057ProductSourceCandidate({
    channelKey,
    candidate: {
      ...normalized,
      productSourceKind: sourceKind === "v057_review_package_metadata"
        ? "v057_review_package_metadata"
        : normalized.productSourceKind as V057CorrectedReuploadProductSourceKind
    }
  });
  if (!validation.evidence.source_present) return null;
  if (!validation.evidence.raw_coupang_url_present) return { status: "raw_missing", channelKey, sourceKind };
  if (!validation.ok) return { status: "invalid", channelKey, sourceKind: "invalid" };
  return {
    status: "ready",
    channelKey,
    sourceKind,
    queueItemId: normalized.sourceQueueItemId ?? null,
    generatedContentId: normalized.sourceGeneratedContentId ?? null,
    rawCoupangUrl: validation.rawCoupangUrl,
    productName: normalized.productName || normalized.sourceProductLabel || V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    selectedAffiliateUrl: normalized.selectedAffiliateUrl || null,
    sourceEvidenceHash: normalized.sourceEvidenceHash || hashEvidence(`${channelKey}:${validation.rawCoupangUrl}`)
  };
}

function buildUploadPackage(input: {
  cwd: string;
  channelKey: ChannelKey;
  selectedProfile: V057ReuploadAssetProfile;
  source: Extract<SourceResolution, { status: "ready" }>;
  targetChannelId: string;
  asset: Awaited<ReturnType<typeof resolveV057ReuploadAssetBindings>>["bindings"][ChannelKey];
  duplicateRisk: boolean;
  disclosure: ReturnType<typeof buildDisclosureEvidence>;
}): V073UploadPackage {
  const metadata = buildV057MetadataPreview(input.channelKey);
  const comment = buildV057CommentPreview(input.channelKey);
  const targetValidation = validateYouTubeChannelId(input.targetChannelId);
  const affiliateHashPrefix = hashPrefix(input.source.selectedAffiliateUrl ?? "");

  return {
    packageId: input.source.queueItemId && input.source.generatedContentId
      ? `pkg-${hashPrefix(`${input.source.queueItemId}:${input.source.generatedContentId}`)}`
      : `pkg-${input.source.sourceEvidenceHash.slice(0, 10)}`,
    queueItemId: input.source.queueItemId,
    generatedContentId: input.source.generatedContentId,
    channelKey: input.channelKey,
    assetProfile: input.selectedProfile,
    productSource: {
      rawCoupangUrl: input.source.rawCoupangUrl,
      productName: input.source.productName,
      sourceKind: input.source.sourceKind,
      sourceEvidenceHash: input.source.sourceEvidenceHash,
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: input.source.selectedAffiliateUrl,
      source: "deeplink",
      status: input.source.selectedAffiliateUrl ? "ready" : "pending",
      sanitizedEvidence: {
        affiliateUrlPresent: Boolean(input.source.selectedAffiliateUrl),
        affiliateUrlPrinted: false,
        affiliateHashPrefix
      }
    },
    videoAsset: {
      path: input.asset.video_path,
      basename: path.basename(input.asset.video_path),
      hashEvidence: hashEvidence(`${input.channelKey}:${path.basename(input.asset.video_path)}`).slice(0, 10),
      firstFramePath: input.asset.first_frame_path,
      firstFrameBasename: path.basename(input.asset.first_frame_path),
      firstFrameHashEvidence: hashEvidence(`${input.channelKey}:${path.basename(input.asset.first_frame_path)}`).slice(0, 10),
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: metadata.title,
      description: metadata.description_preview,
      tags: [
        input.channelKey,
        "coupang",
        "shorts"
      ],
      categoryId: "26",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    youtubeAdvancedSettings: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      },
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    commentPackage: {
      commentText: comment.comment_text_preview_masked,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: input.disclosure.commentDisclosurePresent
    },
    targetChannel: {
      channelKey: input.channelKey,
      channelIdHashPrefix: targetValidation.hash_prefix,
      formatValid: targetValidation.present && targetValidation.format_valid,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: !input.duplicateRisk,
      duplicateUploadRisk: input.duplicateRisk,
      signature: hashEvidence(`${input.channelKey}:${input.asset.video_path}`).slice(0, 10)
    },
    quotaGuard: {
      ready: true,
      publicUploadExecutionDisabled: true
    },
    approvalGate: {
      freshApprovalRequired: true,
      approvalPresent: false,
      publicUploadExecutionDisabled: true
    },
    resultStore: {
      status: "placeholder",
      rawUrlsStored: false,
      secretsStored: false
    }
  };
}

function buildReport(input: {
  selectedProfile: V057ReuploadAssetProfile | null;
  blocker: V073UploadPackageBlocker | null;
  packages: V073UploadPackage[];
  sources: SourceResolution[];
  assetReport: Awaited<ReturnType<typeof resolveV057ReuploadAssetBindings>>;
  targetChannelIds: Partial<Record<ChannelKey, string>>;
  disclosureReady: boolean;
  duplicateGuardReady: boolean;
}): V073UploadPackageReport {
  const items = CHANNEL_KEYS.map((channelKey) => {
    const source = input.sources.find((item) => item.channelKey === channelKey);
    const pkg = input.packages.find((item) => item.channelKey === channelKey);
    const targetValidation = validateYouTubeChannelId(input.targetChannelIds[channelKey]);
    return buildReportItem({
      channelKey,
      selectedProfile: input.selectedProfile,
      pkg,
      source,
      videoPresent: input.assetReport.bindings[channelKey].v057_mp4_exists,
      firstFramePresent: input.assetReport.bindings[channelKey].first_frame_v057_exists,
      disclosureReady: input.disclosureReady,
      targetReady: targetValidation.present && targetValidation.format_valid,
      targetHashPrefix: targetValidation.hash_prefix,
      duplicateGuardReady: input.duplicateGuardReady
    });
  });
  const ready = input.blocker === null;
  return {
    version: "v073",
    FINAL_STATUS: ready
      ? "SUCCESS_V073_UPLOAD_PACKAGES_GENERATED_NO_UPLOAD"
      : "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    selected_profile: input.selectedProfile,
    upload_package_generator_ready: ready,
    upload_package_count: input.packages.length,
    blocker: input.blocker,
    manualAffiliateUrlInputRequired: false,
    manualRawCoupangUrlInputRequired: false,
    productionDefaultAffiliatePath: "coupang_deeplink",
    packages: items,
    uploadExecutionCalled: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildReportItem(input: {
  channelKey: ChannelKey;
  selectedProfile: V057ReuploadAssetProfile | null;
  pkg: V073UploadPackage | undefined;
  source: SourceResolution | undefined;
  videoPresent: boolean;
  firstFramePresent: boolean;
  disclosureReady: boolean;
  targetReady: boolean;
  targetHashPrefix: string | null;
  duplicateGuardReady: boolean;
}): V073UploadPackageReportItem {
  const productHash = input.pkg?.productSource.sourceEvidenceHash.slice(0, 10) ?? null;
  return {
    packageId: input.pkg?.packageId ?? `pkg-blocked-${hashPrefix(input.channelKey)}`,
    channelKey: input.channelKey,
    assetProfile: input.selectedProfile ?? V057_REUPLOAD_ASSET_PROFILE,
    productSourcePresent: input.source?.status === "ready" || input.source?.status === "raw_missing",
    productSourceKind: input.pkg?.productSource.sourceKind ??
      (input.source?.sourceKind as V073UploadPackageReportItem["productSourceKind"] | undefined) ??
      "missing",
    productSourceHashPrefix: productHash,
    rawCoupangUrlPresent: Boolean(input.pkg?.productSource.rawCoupangUrl),
    rawCoupangUrlPrinted: false,
    affiliateUrlPresent: Boolean(input.pkg?.deeplink.selectedAffiliateUrl),
    affiliateUrlPrinted: false,
    videoAssetPresent: input.videoPresent,
    videoAssetHashPrefix: input.pkg?.videoAsset.hashEvidence ?? null,
    firstFramePresent: input.firstFramePresent,
    disclosureReady: input.disclosureReady,
    targetChannelReady: input.targetReady,
    targetChannelHashPrefix: input.targetHashPrefix,
    duplicateGuardReady: input.duplicateGuardReady,
    approvalRequired: true,
    uploadExecutionCalled: false,
    safeToUpload: false
  };
}

function buildDisclosureEvidence(
  channelKey: ChannelKey,
  override: V073DisclosureOverride[ChannelKey] | undefined
) {
  const metadata = buildV057MetadataPreview(channelKey);
  const comment = buildV057CommentPreview(channelKey);
  const settings = buildV057UploadSettingsPreview(channelKey);
  const evidence = {
    containsSyntheticMedia: Boolean(metadata.status.containsSyntheticMedia && settings.containsSyntheticMedia),
    paidProductPlacement: Boolean(metadata.paidProductPlacementDetails.hasPaidProductPlacement &&
      settings.paidProductPlacementDetails.hasPaidProductPlacement),
    descriptionDisclosurePresent: Boolean(metadata.coupang_disclosure_in_description),
    commentDisclosurePresent: Boolean(comment.comment_text_has_coupang_disclosure),
    ...override
  };
  return {
    ...evidence,
    ready: Boolean(
      evidence.containsSyntheticMedia &&
      evidence.paidProductPlacement &&
      evidence.descriptionDisclosurePresent &&
      evidence.commentDisclosurePresent
    )
  };
}

function normalizeRows(value: unknown): CandidateRow[] {
  return flatten(value)
    .map((raw) => normalizeCandidateRow(raw))
    .filter((row): row is CandidateRow => row !== null);
}

function normalizeCandidateRow(raw: unknown): CandidateRow | null {
  const record = asRecord(raw);
  if (!record) return null;
  const normalized = normalizeV057ProductSourceCandidate(raw);
  const channelKey = readChannelKey(record, normalized.channelKey);
  const rawCoupangUrl = normalized.rawCoupangUrl || pickString(record, [
    "raw_coupang_url",
    "rawCoupangUrl",
    "product_url",
    "productUrl",
    "url"
  ]);
  const productName = normalized.productName || normalized.sourceProductLabel || pickString(record, [
    "product_name",
    "productName",
    "source_product_label",
    "sourceProductLabel",
    "title",
    "keyword"
  ]);
  return {
    raw,
    id: normalized.packageId ||
      normalized.sourceQueueItemId ||
      normalized.sourceGeneratedContentId ||
      pickString(record, ["id", "queue_id", "queueItemId", "product_queue_id"]),
    channelKey,
    productName,
    rawCoupangUrl,
    selectedAffiliateUrl: normalized.selectedAffiliateUrl || pickString(record, [
      "selected_affiliate_url",
      "selectedAffiliateUrl",
      "affiliate_url",
      "affiliateUrl"
    ]),
    updatedAt: normalized.updatedAt || normalized.boundAt || pickString(record, ["updated_at", "updatedAt", "bound_at", "boundAt"]),
    sourceEvidenceHash: normalized.sourceEvidenceHash || hashEvidence(`${channelKey ?? "unbound"}:${productName}:${rawCoupangUrl}`)
  };
}

function findRowForChannel(rows: CandidateRow[], channelKey: ChannelKey) {
  return rows.find((row) => {
    const channelMatches = row.channelKey === null || row.channelKey === channelKey;
    return channelMatches && productLabelMatches(channelKey, row.productName);
  }) ?? null;
}

function productLabelMatches(channelKey: ChannelKey, value: string) {
  const expected = normalizeText(V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey]);
  return Boolean(expected && normalizeText(value).includes(expected));
}

function readChannelKey(record: Record<string, unknown>, normalized: unknown): ChannelKey | null {
  const value = safeTrim(normalized) || pickString(record, ["channelKey", "channel_key"]);
  return CHANNEL_KEYS.includes(value as ChannelKey) ? value as ChannelKey : null;
}

async function readReviewPackageManifest(cwd: string, channelKey: ChannelKey) {
  return readJsonIfExists(path.join(cwd, "commerce-assets", "review", "v057", channelKey, "product-source-v057.json"));
}

async function readTrustedManifest(cwd: string, channelKey: ChannelKey) {
  return readJsonIfExists(path.join(cwd, "commerce-assets", "review", "v057", channelKey, "trusted-upstream-manifest-v057.json"));
}

const INVALID_JSON = Symbol("invalid-v073-json");

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return INVALID_JSON;
    throw error;
  }
}

function flatten(value: unknown): unknown[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = ["items", "rows", "queue_items", "generated_contents", "packages"]
    .flatMap((key) => Array.isArray(record[key]) ? record[key] as unknown[] : []);
  return [value, ...nested];
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  const nested = asRecord(record.productSource) ?? asRecord(record.product_source) ?? {};
  for (const key of keys) {
    const value = safeTrim(record[key]) || safeTrim(nested[key]);
    if (value) return value;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstBlocker<T extends string>(values: Array<T | null | undefined>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}

function hashEvidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPrefix(value: string) {
  return value ? hashEvidence(value).slice(0, 10) : null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildHtmlReport(report: V073UploadPackageReport) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v073 upload package generator</title></head>
<body>
  <h1>v073 upload package generator</h1>
  <p>FINAL_STATUS=${escapeHtml(report.FINAL_STATUS)}</p>
  <p>blocker=${escapeHtml(report.blocker)}</p>
  <p>upload_package_generator_ready=${report.upload_package_generator_ready}</p>
  <p>upload_package_count=${report.upload_package_count}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
  <p>raw_urls_printed=false</p>
  <p>raw_channel_ids_printed=false</p>
  <p>secrets_printed=false</p>
</body>
</html>
`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
