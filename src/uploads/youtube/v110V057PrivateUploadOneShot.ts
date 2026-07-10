import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
} from "./v081PrivateUploadPilot";
import {
  buildV084PrivateUploadPilotInvocationRequestFromEnv,
  type V084PrivateUploadPilotInvocationRequest
} from "./v084PrivateUploadExecutionInvocation";

export const APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE =
  "APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE" as const;

export type V110Mode = "preflight" | "execute";
export type V110Status = "blocked" | "ready_for_external_approval" | "private_upload_completed";

export type V110PreparedAssetResult =
  | { ok: true; assetRef: PreparedVideoAssetRef }
  | { ok: false; blocker: string };

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
  version: "v110";
  mode: "v057_r2_private_upload_one_shot";
  requestedMode: V110Mode;
  status: V110Status;
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
  r2ConfigReady: boolean;
  runtimeContextReady: boolean;
  r2ApprovalAccepted: boolean;
  privateUploadApprovalAccepted: boolean;
  r2UploadAttempted: boolean;
  R2_upload: boolean;
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
    request: V084PrivateUploadPilotInvocationRequest
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
  r2Config: "BLOCKED_V110_R2_CONFIG_NOT_READY",
  r2Approval: "BLOCKED_V110_FRESH_R2_APPROVAL_REQUIRED",
  uploadApproval: "BLOCKED_V110_FRESH_PRIVATE_UPLOAD_APPROVAL_REQUIRED",
  executor: "BLOCKED_V110_EXECUTOR_NOT_INJECTED",
  r2Prepare: "BLOCKED_V110_R2_PREPARE_FAILED",
  upload: "BLOCKED_V110_PRIVATE_UPLOAD_FAILED"
} as const;

export async function runV110V057PrivateUploadOneShot(input: V110Input = {}): Promise<V110Report> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const requestedMode = input.mode ?? "preflight";
  const request = input.request ?? await buildV084PrivateUploadPilotInvocationRequestFromEnv({
    env,
    dryRun: requestedMode !== "execute"
  });
  const manifestPath = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs", "product-source-v057.local.json");
  const videoPath = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs", "corrected-preview-v057.mp4");
  const firstFramePath = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs", "first-frame-v057.jpg");
  const manifest = await readManifest(manifestPath);
  const video = await readNonEmptyFile(videoPath);
  const firstFramePresent = await isNonEmptyFile(firstFramePath);
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
  const blockers = compact([
    manifest ? null : BLOCKED.manifest,
    video ? null : BLOCKED.video,
    firstFramePresent ? null : BLOCKED.firstFrame,
    runtimeContextReady ? null : BLOCKED.context,
    manifestContextMatch ? null : BLOCKED.mismatch,
    productSourceEvidencePresent ? null : BLOCKED.source,
    affiliateEvidencePresent ? null : BLOCKED.affiliate,
    disclosureEvidencePresent ? null : BLOCKED.disclosure,
    r2ConfigReady ? null : BLOCKED.r2Config
  ]);
  const r2ApprovalAccepted = env.V110_R2_PREPARE_APPROVAL ===
    APPROVE_V110_R2_PREPARE_V057_FATHER_JOBS_ASSET_ONCE;
  const privateUploadApprovalAccepted = env.V084_PRIVATE_UPLOAD_APPROVAL_PHRASE ===
    APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT;
  const base = buildBaseReport({
    requestedMode,
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
    r2ApprovalAccepted ? null : BLOCKED.r2Approval,
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
      blockers: [BLOCKED.r2Prepare, prepared.blocker],
      r2UploadAttempted: true
    };
  }

  const executed = await input.executePrivateUpload(prepared.assetRef, {
    ...request,
    dryRun: false
  });
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
    r2UploadAttempted: true,
    R2_upload: true,
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
  r2ConfigReady: boolean;
  runtimeContextReady: boolean;
  r2ApprovalAccepted: boolean;
  privateUploadApprovalAccepted: boolean;
}): V110Report {
  return {
    version: "v110",
    mode: "v057_r2_private_upload_one_shot",
    requestedMode: input.requestedMode,
    status: "blocked",
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
    r2ConfigReady: input.r2ConfigReady,
    runtimeContextReady: input.runtimeContextReady,
    r2ApprovalAccepted: input.r2ApprovalAccepted,
    privateUploadApprovalAccepted: input.privateUploadApprovalAccepted,
    r2UploadAttempted: false,
    R2_upload: false,
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

async function isNonEmptyFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value));
}
