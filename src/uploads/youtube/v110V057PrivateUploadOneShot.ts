import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { R2PutDiagnostics } from "@/lib/uploads/videoAssets/oneProductServerAssetRegistration";
import type {
  OwnerReviewedPrivateUploadEvidence
} from "@/lib/uploads/youtube/buildYoutubeUploadRequest";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
} from "./v081PrivateUploadPilot";
import {
  buildV084PrivateUploadPilotInvocationRequestFromEnv,
  type V084PrivateUploadPilotInvocationRequest
} from "./v084PrivateUploadExecutionInvocation";
import { APPROVE_V114_SERVER_LOCAL_ASSET_PREPARE_ONCE } from "./v114ServerLocalPreparedVideoAsset";
import {
  V115_EXPECTED_FIRST_FRAME_FILE_NAME,
  V115_EXPECTED_SUMMARY_FILE_NAME,
  V115_EXPECTED_VIDEO_FILE_NAME,
  V115_VIDEO_ASSET_SELECTION,
  evaluateV115ExactV113AssetEvidence,
  type V115ExactAssetEvidenceReport
} from "./v115ExactV113AssetContract";
import {
  APPROVE_V115_SERVER_LOCAL_V113_ASSET_PREPARE_ONCE
} from "./v115ExactV113ServerLocalPreparedVideoAsset";

export const APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE =
  "APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE" as const;

export type V110Mode = "preflight" | "execute";
export type V110AssetPreparationStrategy = "r2" | "server_local_file";
export type V110VideoAssetSelection =
  | "v057_corrected_preview"
  | typeof V115_VIDEO_ASSET_SELECTION;
export type V110Status = "blocked" | "ready_for_external_approval" | "private_upload_completed";

export type V110PreparedAssetResult =
  | { ok: true; assetRef: PreparedVideoAssetRef; diagnostics?: R2PutDiagnostics }
  | { ok: false; blocker: string; diagnostics?: R2PutDiagnostics };

export type V110PrivateExecutionResult = {
  completed: boolean;
  blockers: string[];
  videosInsertCalled: boolean;
  videosInsertTotalCount: 0 | 1;
  commentThreadsInsertCalled: false;
  uploadResultEvidencePresent: boolean;
  youtubeVideoIdHashPrefix: string | null;
  channelIdHashPrefix: string | null;
  fakeSuccess: false;
};

export type V110Report = {
  version: "v110" | "v115";
  mode: "v057_r2_private_upload_one_shot" | "v113_exact_local_private_upload_one_shot";
  requestedMode: V110Mode;
  videoAssetSelection: V110VideoAssetSelection;
  selectedVideoVersion: "v057" | "v113";
  selectedVideoFileName: "corrected-preview-v057.mp4" | typeof V115_EXPECTED_VIDEO_FILE_NAME;
  selectedVideoSha256Prefix: string | null;
  exactAssetEvidenceReady: boolean;
  noV057Fallback: boolean;
  noV112Fallback: boolean;
  status: V110Status;
  assetPreparationStrategy: V110AssetPreparationStrategy;
  assetPreparationReady: boolean;
  assetPreparationApprovalAccepted: boolean;
  assetPreparationAttempted: boolean;
  assetPrepared: boolean;
  blockers: string[];
  channelKey: "father_jobs";
  visibility: "private";
  maxItems: 1;
  canonicalManifestPresent: boolean;
  canonicalVideoPresent: boolean;
  canonicalFirstFramePresent: boolean;
  manifestContextMatch: boolean;
  manifestQueueItemMatch: boolean;
  manifestUploadPackageMatch: boolean;
  uploadPackageReboundToCurrentContext: boolean;
  productSourceEvidencePresent: boolean;
  affiliateEvidencePresent: boolean;
  disclosureEvidencePresent: boolean;
  ownerReviewEvidenceReady: boolean;
  r2ConfigReady: boolean;
  runtimeContextReady: boolean;
  r2ApprovalAccepted: boolean;
  privateUploadApprovalAccepted: boolean;
  r2UploadAttempted: boolean;
  R2_upload: boolean;
  r2HttpStatus: number | null;
  r2SafeErrorCode: string | null;
  localAssetReadAttempted: boolean;
  localAssetPrepared: boolean;
  youtubeExecutionAttempted: boolean;
  videosInsertCalled: boolean;
  videosInsertTotalCount: 0 | 1;
  commentThreadsInsertCalled: false;
  uploadResultEvidencePresent: boolean;
  youtubeVideoIdHashPrefix: string | null;
  channelIdHashPrefix: string | null;
  DB_write: false;
  product_assets_write: false;
  n8nWebhookCalled: false;
  schedulerExecutionCalled: false;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V110Input = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  mode?: V110Mode;
  assetPreparationStrategy?: V110AssetPreparationStrategy;
  videoAssetSelection?: V110VideoAssetSelection;
  request?: V084PrivateUploadPilotInvocationRequest;
  prepareAsset?: (input: {
    queueItemId: string;
    fileName: string;
    bytes: Buffer;
    sizeBytes: number;
    checksumSha256: string;
  }) => Promise<V110PreparedAssetResult>;
  executePrivateUpload?: (
    preparedAsset: PreparedVideoAssetRef,
    request: V084PrivateUploadPilotInvocationRequest,
    ownerReviewEvidence: OwnerReviewedPrivateUploadEvidence
  ) => Promise<V110PrivateExecutionResult>;
};

type V057Manifest = {
  queueItemId?: unknown;
  uploadPackageId?: unknown;
  channelKey?: unknown;
  targetChannelKey?: unknown;
  rawCoupangUrl?: unknown;
  selectedAffiliateUrl?: unknown;
  coupangPartnersDisclosureText?: unknown;
};

const BLOCKED = {
  manifest: "BLOCKED_V110_CANONICAL_MANIFEST_MISSING",
  video: "BLOCKED_V110_CANONICAL_VIDEO_MISSING",
  firstFrame: "BLOCKED_V110_CANONICAL_FIRST_FRAME_MISSING",
  context: "BLOCKED_V110_RUNTIME_CONTEXT_NOT_READY",
  mismatch: "BLOCKED_V110_MANIFEST_CONTEXT_MISMATCH",
  source: "BLOCKED_V110_PRODUCT_SOURCE_EVIDENCE_MISSING",
  affiliate: "BLOCKED_V110_AFFILIATE_EVIDENCE_MISSING",
  disclosure: "BLOCKED_V110_DISCLOSURE_EVIDENCE_MISSING",
  ownerReview: "BLOCKED_V110_OWNER_REVIEW_EVIDENCE_MISSING",
  r2Config: "BLOCKED_V110_R2_CONFIG_NOT_READY",
  r2Approval: "BLOCKED_V110_FRESH_R2_APPROVAL_REQUIRED",
  localAssetApproval: "BLOCKED_V114_FRESH_LOCAL_ASSET_APPROVAL_REQUIRED",
  v115LocalAssetApproval: "BLOCKED_V115_FRESH_LOCAL_ASSET_APPROVAL_REQUIRED",
  v115ExactAsset: "BLOCKED_V115_EXACT_V113_ASSET_EVIDENCE_INCOMPLETE",
  v115Strategy: "BLOCKED_V115_SERVER_LOCAL_ASSET_STRATEGY_REQUIRED",
  uploadApproval: "BLOCKED_V110_FRESH_PRIVATE_UPLOAD_APPROVAL_REQUIRED",
  executor: "BLOCKED_V110_EXECUTOR_NOT_INJECTED",
  r2Prepare: "BLOCKED_V110_R2_PREPARE_FAILED",
  localPrepare: "BLOCKED_V114_LOCAL_ASSET_PREPARE_FAILED",
  upload: "BLOCKED_V110_PRIVATE_UPLOAD_FAILED"
} as const;

export async function runV110V057PrivateUploadOneShot(input: V110Input = {}): Promise<V110Report> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const requestedMode = input.mode ?? "preflight";
  const assetPreparationStrategy = input.assetPreparationStrategy ?? "r2";
  const videoAssetSelection = input.videoAssetSelection ?? "v057_corrected_preview";
  const useExactV113Asset = videoAssetSelection === V115_VIDEO_ASSET_SELECTION;
  const request = input.request ?? await buildV084PrivateUploadPilotInvocationRequestFromEnv({
    env,
    dryRun: requestedMode !== "execute"
  });
  const manifestPath = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs", "product-source-v057.local.json");
  const selectedAssetRoot = useExactV113Asset
    ? path.join(cwd, "commerce-assets", "review", "v113", "father_jobs")
    : path.join(cwd, "commerce-assets", "review", "v057", "father_jobs");
  const videoPath = path.join(
    selectedAssetRoot,
    useExactV113Asset ? V115_EXPECTED_VIDEO_FILE_NAME : "corrected-preview-v057.mp4"
  );
  const firstFramePath = path.join(
    selectedAssetRoot,
    useExactV113Asset ? V115_EXPECTED_FIRST_FRAME_FILE_NAME : "first-frame-v057.jpg"
  );
  const v056ReviewPath = path.join(cwd, "commerce-assets", "review", "v056", "v056-corrected-preview-report.json");
  const v057SummaryPath = path.join(cwd, "commerce-assets", "review", "v057", "v057-summary.json");
  const v057ValidationPath = path.join(cwd, "commerce-assets", "review", "v057", "hook-overlay-validation-report.json");
  const v057ClickabilityPath = path.join(cwd, "commerce-assets", "review", "v057", "first-frame-clickability-report.json");
  const manifest = await readManifest(manifestPath);
  const video = await readNonEmptyFile(videoPath);
  const firstFrame = await readNonEmptyFile(firstFramePath);
  const firstFramePresent = Boolean(firstFrame);
  const selectedVideoSha256 = video
    ? crypto.createHash("sha256").update(video).digest("hex")
    : null;
  const exactV113Evidence = useExactV113Asset
    ? evaluateV115ExactV113AssetEvidence({
        videoPresent: Boolean(video),
        videoSizeBytes: video?.byteLength ?? null,
        videoSha256: selectedVideoSha256,
        firstFramePresent,
        firstFrameSha256: firstFrame
          ? crypto.createHash("sha256").update(firstFrame).digest("hex")
          : null,
        summary: await readJsonRecord(path.join(selectedAssetRoot, V115_EXPECTED_SUMMARY_FILE_NAME))
      })
    : null;
  const ownerReviewEvidenceReady = useExactV113Asset
    ? exactV113Evidence?.ready === true
    : await hasOwnerReviewedV057Evidence({
        v056ReviewPath,
        v057SummaryPath,
        v057ValidationPath,
        v057ClickabilityPath
      });
  const runtimeContextReady = isRuntimeContextReady(request);
  const manifestQueueItemMatch = Boolean(
    manifest &&
    manifest.channelKey === "father_jobs" &&
    manifest.targetChannelKey === "father_jobs" &&
    safeString(manifest.queueItemId) === request.queueItemId
  );
  const manifestUploadPackageMatch = Boolean(
    manifest &&
    safeString(manifest.uploadPackageId) &&
    safeString(manifest.uploadPackageId) === request.uploadPackageId
  );
  const uploadPackageReboundToCurrentContext = Boolean(
    manifestQueueItemMatch &&
    request.uploadPackageId &&
    !manifestUploadPackageMatch
  );
  const manifestContextMatch = Boolean(manifestQueueItemMatch && request.uploadPackageId);
  const productSourceEvidencePresent = Boolean(safeString(manifest?.rawCoupangUrl));
  const affiliateEvidencePresent = Boolean(safeString(manifest?.selectedAffiliateUrl));
  const disclosureEvidencePresent = Boolean(safeString(manifest?.coupangPartnersDisclosureText));
  const r2ConfigReady = hasR2Config(env);
  const assetPreparationReady = useExactV113Asset
    ? assetPreparationStrategy === "server_local_file" && exactV113Evidence?.ready === true
    : assetPreparationStrategy === "r2" ? r2ConfigReady : Boolean(video);
  const blockers = compact([
    manifest ? null : BLOCKED.manifest,
    video ? null : BLOCKED.video,
    firstFramePresent ? null : BLOCKED.firstFrame,
    runtimeContextReady ? null : BLOCKED.context,
    manifestContextMatch ? null : BLOCKED.mismatch,
    productSourceEvidencePresent ? null : BLOCKED.source,
    affiliateEvidencePresent ? null : BLOCKED.affiliate,
    disclosureEvidencePresent ? null : BLOCKED.disclosure,
    ownerReviewEvidenceReady ? null : BLOCKED.ownerReview,
    useExactV113Asset && exactV113Evidence?.ready !== true ? BLOCKED.v115ExactAsset : null,
    useExactV113Asset && assetPreparationStrategy !== "server_local_file" ? BLOCKED.v115Strategy : null,
    assetPreparationReady ? null : (assetPreparationStrategy === "r2" ? BLOCKED.r2Config : null)
  ]);
  const r2ApprovalAccepted = env.V110_R2_PREPARE_APPROVAL ===
    APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE;
  const privateUploadApprovalAccepted = env.V084_PRIVATE_UPLOAD_APPROVAL_PHRASE ===
    APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT;
  const localAssetApprovalAccepted = env.V114_LOCAL_ASSET_PREPARE_APPROVAL ===
    APPROVE_V114_SERVER_LOCAL_ASSET_PREPARE_ONCE;
  const v115LocalAssetApprovalAccepted = env.V115_LOCAL_ASSET_PREPARE_APPROVAL ===
    APPROVE_V115_SERVER_LOCAL_V113_ASSET_PREPARE_ONCE;
  const assetPreparationApprovalAccepted = assetPreparationStrategy === "r2"
    ? r2ApprovalAccepted
    : useExactV113Asset
      ? v115LocalAssetApprovalAccepted
      : localAssetApprovalAccepted;
  const base = buildBaseReport({
    requestedMode,
    videoAssetSelection,
    selectedVideoSha256,
    exactV113Evidence,
    assetPreparationStrategy,
    assetPreparationReady,
    assetPreparationApprovalAccepted,
    blockers,
    manifestPresent: Boolean(manifest),
    videoPresent: Boolean(video),
    firstFramePresent,
    manifestContextMatch,
    manifestQueueItemMatch,
    manifestUploadPackageMatch,
    uploadPackageReboundToCurrentContext,
    productSourceEvidencePresent,
    affiliateEvidencePresent,
    disclosureEvidencePresent,
    ownerReviewEvidenceReady,
    r2ConfigReady,
    runtimeContextReady,
    r2ApprovalAccepted,
    privateUploadApprovalAccepted
  });

  if (blockers.length > 0) return base;
  if (requestedMode === "preflight") {
    return { ...base, status: "ready_for_external_approval" };
  }

  const approvalBlockers = compact([
    assetPreparationApprovalAccepted
      ? null
      : assetPreparationStrategy === "r2"
        ? BLOCKED.r2Approval
        : useExactV113Asset
          ? BLOCKED.v115LocalAssetApproval
          : BLOCKED.localAssetApproval,
    privateUploadApprovalAccepted ? null : BLOCKED.uploadApproval
  ]);
  if (approvalBlockers.length > 0) {
    return { ...base, blockers: approvalBlockers };
  }
  if (!input.prepareAsset || !input.executePrivateUpload || !video || !manifest) {
    return { ...base, blockers: [BLOCKED.executor] };
  }

  const checksumSha256 = crypto.createHash("sha256").update(video).digest("hex");
  const prepared = await input.prepareAsset({
    queueItemId: safeString(manifest.queueItemId),
    fileName: path.basename(videoPath),
    bytes: video,
    sizeBytes: video.byteLength,
    checksumSha256
  });
  if (!prepared.ok) {
    return {
      ...base,
      blockers: [
        assetPreparationStrategy === "r2" ? BLOCKED.r2Prepare : BLOCKED.localPrepare,
        prepared.blocker
      ],
      assetPreparationAttempted: true,
      r2UploadAttempted: assetPreparationStrategy === "r2",
      localAssetReadAttempted: assetPreparationStrategy === "server_local_file",
      r2HttpStatus: prepared.diagnostics?.http_status ?? null,
      r2SafeErrorCode: prepared.diagnostics?.safe_error_code ?? null
    };
  }

  const executed = await input.executePrivateUpload(
    prepared.assetRef,
    {
      ...request,
      dryRun: false
    },
    buildOwnerReviewedPrivateUploadEvidence()
  );
  const completed = Boolean(
    executed.completed &&
    executed.videosInsertCalled &&
    executed.videosInsertTotalCount === 1 &&
    executed.uploadResultEvidencePresent &&
    executed.youtubeVideoIdHashPrefix &&
    executed.channelIdHashPrefix &&
    !executed.fakeSuccess
  );

  return {
    ...base,
    status: completed ? "private_upload_completed" : "blocked",
    blockers: completed ? [] : [BLOCKED.upload, ...executed.blockers],
    assetPreparationAttempted: true,
    assetPrepared: true,
    r2UploadAttempted: assetPreparationStrategy === "r2",
    R2_upload: assetPreparationStrategy === "r2",
    r2HttpStatus: prepared.diagnostics?.http_status ?? null,
    r2SafeErrorCode: prepared.diagnostics?.safe_error_code ?? null,
    localAssetReadAttempted: assetPreparationStrategy === "server_local_file",
    localAssetPrepared: assetPreparationStrategy === "server_local_file",
    youtubeExecutionAttempted: true,
    videosInsertCalled: executed.videosInsertCalled,
    videosInsertTotalCount: executed.videosInsertTotalCount,
    uploadResultEvidencePresent: executed.uploadResultEvidencePresent,
    youtubeVideoIdHashPrefix: executed.youtubeVideoIdHashPrefix,
    channelIdHashPrefix: executed.channelIdHashPrefix
  };
}

function buildBaseReport(input: {
  requestedMode: V110Mode;
  videoAssetSelection: V110VideoAssetSelection;
  selectedVideoSha256: string | null;
  exactV113Evidence: V115ExactAssetEvidenceReport | null;
  assetPreparationStrategy: V110AssetPreparationStrategy;
  assetPreparationReady: boolean;
  assetPreparationApprovalAccepted: boolean;
  blockers: string[];
  manifestPresent: boolean;
  videoPresent: boolean;
  firstFramePresent: boolean;
  manifestContextMatch: boolean;
  manifestQueueItemMatch: boolean;
  manifestUploadPackageMatch: boolean;
  uploadPackageReboundToCurrentContext: boolean;
  productSourceEvidencePresent: boolean;
  affiliateEvidencePresent: boolean;
  disclosureEvidencePresent: boolean;
  ownerReviewEvidenceReady: boolean;
  r2ConfigReady: boolean;
  runtimeContextReady: boolean;
  r2ApprovalAccepted: boolean;
  privateUploadApprovalAccepted: boolean;
}): V110Report {
  return {
    version: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION ? "v115" : "v110",
    mode: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION
      ? "v113_exact_local_private_upload_one_shot"
      : "v057_r2_private_upload_one_shot",
    requestedMode: input.requestedMode,
    videoAssetSelection: input.videoAssetSelection,
    selectedVideoVersion: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION ? "v113" : "v057",
    selectedVideoFileName: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION
      ? V115_EXPECTED_VIDEO_FILE_NAME
      : "corrected-preview-v057.mp4",
    selectedVideoSha256Prefix: input.selectedVideoSha256?.slice(0, 12) ?? null,
    exactAssetEvidenceReady: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION
      ? input.exactV113Evidence?.ready === true
      : false,
    noV057Fallback: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION,
    noV112Fallback: input.videoAssetSelection === V115_VIDEO_ASSET_SELECTION,
    status: "blocked",
    assetPreparationStrategy: input.assetPreparationStrategy,
    assetPreparationReady: input.assetPreparationReady,
    assetPreparationApprovalAccepted: input.assetPreparationApprovalAccepted,
    assetPreparationAttempted: false,
    assetPrepared: false,
    blockers: input.blockers,
    channelKey: "father_jobs",
    visibility: "private",
    maxItems: 1,
    canonicalManifestPresent: input.manifestPresent,
    canonicalVideoPresent: input.videoPresent,
    canonicalFirstFramePresent: input.firstFramePresent,
    manifestContextMatch: input.manifestContextMatch,
    manifestQueueItemMatch: input.manifestQueueItemMatch,
    manifestUploadPackageMatch: input.manifestUploadPackageMatch,
    uploadPackageReboundToCurrentContext: input.uploadPackageReboundToCurrentContext,
    productSourceEvidencePresent: input.productSourceEvidencePresent,
    affiliateEvidencePresent: input.affiliateEvidencePresent,
    disclosureEvidencePresent: input.disclosureEvidencePresent,
    ownerReviewEvidenceReady: input.ownerReviewEvidenceReady,
    r2ConfigReady: input.r2ConfigReady,
    runtimeContextReady: input.runtimeContextReady,
    r2ApprovalAccepted: input.r2ApprovalAccepted,
    privateUploadApprovalAccepted: input.privateUploadApprovalAccepted,
    r2UploadAttempted: false,
    R2_upload: false,
    r2HttpStatus: null,
    r2SafeErrorCode: null,
    localAssetReadAttempted: false,
    localAssetPrepared: false,
    youtubeExecutionAttempted: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    uploadResultEvidencePresent: false,
    youtubeVideoIdHashPrefix: null,
    channelIdHashPrefix: null,
    DB_write: false,
    product_assets_write: false,
    n8nWebhookCalled: false,
    schedulerExecutionCalled: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function isRuntimeContextReady(request: V084PrivateUploadPilotInvocationRequest) {
  return Boolean(
    request.serverOnlyContext !== false &&
    request.v083AdapterAvailable !== false &&
    request.v088ResolverStatus === "bound" &&
    request.v087BinderStatus === "ready_for_fresh_approval" &&
    request.v085BinderStatus === "ready_for_fresh_approval" &&
    request.queueItemId &&
    request.uploadPackageId &&
    request.channelKey === "father_jobs" &&
    request.visibility === "private" &&
    request.maxItems === 1 &&
    request.commentAutomationAllowed === false &&
    request.schedulerExecutionAllowed === false &&
    (request.preflightBlockers?.length ?? 0) === 0 &&
    Object.values(request.readiness).every(Boolean)
  );
}

function hasR2Config(env: NodeJS.ProcessEnv) {
  return Boolean(
    pickEnv(env, "R2_ENDPOINT_URL", "S3_ENDPOINT_URL") &&
    pickEnv(env, "R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID") &&
    pickEnv(env, "R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY") &&
    pickEnv(env, "R2_PUBLIC_BASE_URL_RENDERED_VIDEOS", "PUBLIC_RENDERED_VIDEOS_BASE_URL", "PUBLIC_STORAGE_BASE_URL")
  );
}

function pickEnv(env: NodeJS.ProcessEnv, ...keys: string[]) {
  return keys.map((key) => safeString(env[key])).find(Boolean) ?? "";
}

async function hasOwnerReviewedV057Evidence(input: {
  v056ReviewPath: string;
  v057SummaryPath: string;
  v057ValidationPath: string;
  v057ClickabilityPath: string;
}) {
  const [v056, v057, validation, clickability] = await Promise.all([
    readJsonRecord(input.v056ReviewPath),
    readJsonRecord(input.v057SummaryPath),
    readJsonRecord(input.v057ValidationPath),
    readJsonRecord(input.v057ClickabilityPath)
  ]);
  const validationChannel = findChannelRecord(validation?.channels, "father_jobs");
  const clickabilityChannel = findChannelRecord(clickability?.channels, "father_jobs");

  return Boolean(
    v056?.final_status_preview === "SUCCESS_V056_CORRECTED_PREVIEW_READY_NO_UPLOAD" &&
    v056.corrected_preview_ready === true &&
    v056.safe_to_upload === false &&
    v056.existing_video_mutated_by_automation === false &&
    v057?.FINAL_STATUS === "SUCCESS_V057_HOOK_AND_FIRST_FRAME_PREVIEW_READY_NO_UPLOAD" &&
    v057.CORRECTED_PREVIEW_READY === true &&
    v057.SAFE_TO_UPLOAD === false &&
    v057.new_upload_attempted === false &&
    v057.fake_success === false &&
    validation?.FINAL_STATUS === "SUCCESS_V057_HOOK_AND_FIRST_FRAME_PREVIEW_READY_NO_UPLOAD" &&
    validation.hook_text_large_pass === true &&
    validation.hook_text_contrast_pass === true &&
    validation.first_frame_clickability_pass === true &&
    validation.channel_binding_pass === true &&
    validation.no_fake_claims_pass === true &&
    validation.no_mojibake_pass === true &&
    validation.disclosure_preview_pass === true &&
    validation.upload_settings_preview_present === true &&
    validation.no_upload_side_effects === true &&
    validation.SAFE_TO_UPLOAD === false &&
    validationChannel?.hook_text_large_pass === true &&
    validationChannel.hook_text_contrast_pass === true &&
    validationChannel.first_frame_clickability_pass === true &&
    validationChannel.channel_binding_pass === true &&
    validationChannel.no_fake_claims_pass === true &&
    validationChannel.no_mojibake_pass === true &&
    validationChannel.disclosure_preview_pass === true &&
    validationChannel.upload_settings_preview_present === true &&
    validationChannel.no_upload_side_effects === true &&
    !validationChannel.blocker &&
    clickability?.first_frame_clickability_pass === true &&
    clickability.SAFE_TO_UPLOAD === false &&
    clickabilityChannel?.first_frame_clickability_pass === true
  );
}

function buildOwnerReviewedPrivateUploadEvidence(): OwnerReviewedPrivateUploadEvidence {
  return {
    profile: "v057_corrected_reupload",
    correctedPreviewReady: true,
    hookFirstFrameReviewReady: true,
    channelBindingReady: true,
    noUploadReviewSideEffects: true
  };
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function findChannelRecord(value: unknown, channelKey: string) {
  if (!Array.isArray(value)) return null;
  const match = value.find((item) => isRecord(item) && item.channel_key === channelKey);
  return isRecord(match) ? match : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readManifest(filePath: string): Promise<V057Manifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as V057Manifest
      : null;
  } catch {
    return null;
  }
}

async function readNonEmptyFile(filePath: string) {
  try {
    const bytes = await fs.readFile(filePath);
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value));
}
