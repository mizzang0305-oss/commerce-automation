import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, isChannelKey, type ChannelKey } from "../multi-channel/channelProfiles";
import {
  V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS,
  hashV057ProductSourceEvidence
} from "../multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import {
  buildV085PrivatePilotInputBinding,
  type V085PrivatePilotInputBindingReport
} from "./v085PrivatePilotInputBinding";

export type V087AuthoritativeProductSourceBindingBlocker =
  | "BLOCKED_V087_PRODUCT_SOURCE_MANIFEST_MISSING"
  | "BLOCKED_V087_PRODUCT_SOURCE_ID_MISSING"
  | "BLOCKED_V087_QUEUE_ITEM_ID_MISSING"
  | "BLOCKED_V087_UPLOAD_PACKAGE_ID_MISSING"
  | "BLOCKED_V087_CHANNEL_KEY_MISSING"
  | "BLOCKED_V087_RAW_COUPANG_URL_MISSING"
  | "BLOCKED_V087_AFFILIATE_URL_MISSING"
  | "BLOCKED_V087_DISCLOSURE_MISSING"
  | "BLOCKED_V087_VIDEO_ASSET_FILE_NOT_FOUND"
  | "BLOCKED_V087_VIDEO_ASSET_FILE_UNREADABLE"
  | "BLOCKED_V087_FIRST_FRAME_FILE_NOT_FOUND"
  | "BLOCKED_V087_CANONICAL_FIRST_FRAME_PATH_MISMATCH"
  | "BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_NOT_FOUND"
  | "BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_UNREADABLE"
  | "BLOCKED_V087_FIRST_FRAME_EVIDENCE_INCOMPLETE"
  | "BLOCKED_V087_DUPLICATE_GUARD_KEY_MISSING"
  | "BLOCKED_V087_TARGET_CHANNEL_KEY_MISSING"
  | "BLOCKED_V087_UNSAFE_REPORT_REQUESTED";

export type V087AuthoritativeProductSourceManifest = {
  sourceVersion?: unknown;
  productSourceId?: unknown;
  queueItemId?: unknown;
  uploadPackageId?: unknown;
  channelKey?: unknown;
  productName?: unknown;
  rawCoupangUrl?: unknown;
  selectedAffiliateUrl?: unknown;
  coupangPartnersDisclosureText?: unknown;
  videoAssetPath?: unknown;
  firstFramePath?: unknown;
  duplicateGuardKey?: unknown;
  targetChannelKey?: unknown;
};

export type V087FileEvidence = {
  present: boolean;
  fileExists: boolean;
  fileReadable: boolean;
  canonicalPathMatches?: boolean;
  hashPrefix: string | null;
  rawPathPrinted: false;
};

export type V087SanitizedV085BinderSummary = {
  status: V085PrivatePilotInputBindingReport["status"] | "not_run";
  queueItemIdPresent: boolean;
  uploadPackageIdPresent: boolean;
  runtimeReady: boolean;
  videoAssetReady: boolean;
  affiliateEvidenceReady: boolean;
  disclosureEvidenceReady: boolean;
  duplicateGuardReady: boolean;
  targetChannelEvidenceReady: boolean;
  tokenProviderReady: boolean;
  uploadScopeReady: boolean;
  quotaReady: boolean;
  approvalForwardedToV084Plan: false;
  ambientApprovalStripped: true;
  v084FreshApprovalRequired: boolean;
  blockers: string[];
};

export type V087AuthoritativeProductSourceBindingReport = {
  version: "v087";
  status: "blocked" | "ready_for_fresh_approval";
  mode: "authoritative_product_source_binding_no_upload";
  selectedChannelKey: ChannelKey | null;
  productSourceBindingReady: boolean;
  queueItemBindingReady: boolean;
  uploadPackageBindingReady: boolean;
  channelBindingReady: boolean;
  videoAssetEvidence: V087FileEvidence;
  firstFrameEvidence: V087FileEvidence;
  affiliateEvidenceReady: boolean;
  affiliateHashPrefix: string | null;
  disclosureEvidenceReady: boolean;
  duplicateGuardReady: boolean;
  duplicateGuardHashPrefix: string | null;
  targetChannelEvidenceReady: boolean;
  productSourceHashPrefix: string | null;
  localProductSourceManifestWritten: boolean;
  v085Binder: V087SanitizedV085BinderSummary;
  blockers: V087AuthoritativeProductSourceBindingBlocker[];
  v084ExecuteCalled: false;
  videosInsertCalled: false;
  commentThreadsInsertCalled: false;
  comment_create_update_delete_called: false;
  scheduler_auto_execution_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  n8n_webhook_called: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  redactionProof: {
    rawUrlsPrinted: false;
    rawFilePathsPrinted: false;
    rawVideoIdsPrinted: false;
    rawChannelIdsPrinted: false;
    secretsPrinted: false;
    fakeSuccess: false;
  };
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export async function buildV087AuthoritativeProductSourceBinding(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  unsafeReportRequested?: boolean;
} = {}): Promise<V087AuthoritativeProductSourceBindingReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const manifestPath = trimOrNull(env.V087_PRODUCT_SOURCE_MANIFEST_PATH);
  const blockers: V087AuthoritativeProductSourceBindingBlocker[] = [];

  if (!manifestPath) {
    blockers.push("BLOCKED_V087_PRODUCT_SOURCE_MANIFEST_MISSING");
    return buildReport({
      blockers,
      selectedChannelKey: null,
      videoAssetEvidence: emptyFileEvidence(),
      firstFrameEvidence: emptyFileEvidence()
    });
  }

  const manifest = await readManifest(manifestPath);
  if (!manifest) {
    blockers.push("BLOCKED_V087_PRODUCT_SOURCE_MANIFEST_MISSING");
    return buildReport({
      blockers,
      selectedChannelKey: null,
      videoAssetEvidence: emptyFileEvidence(),
      firstFrameEvidence: emptyFileEvidence()
    });
  }

  const normalized = normalizeManifest(manifest);
  const selectedChannelKey = isChannelKey(normalized.channelKey) ? normalized.channelKey : null;
  const videoAssetEvidence = await resolveFileEvidence(normalized.videoAssetPath);
  const firstFrameEvidence = await resolveCanonicalFirstFrameEvidence({
    cwd,
    channelKey: selectedChannelKey,
    firstFramePath: normalized.firstFramePath
  });
  const affiliateEvidenceReady = isHttpsCoupangUrl(normalized.selectedAffiliateUrl);
  const disclosureEvidenceReady = hasCoupangDisclosure(normalized.coupangPartnersDisclosureText);
  const duplicateGuardReady = Boolean(normalized.duplicateGuardKey);
  const targetChannelEvidenceReady = isChannelKey(normalized.targetChannelKey);
  const productSourceBindingReady = Boolean(normalized.productSourceId);
  const queueItemBindingReady = Boolean(normalized.queueItemId);
  const uploadPackageBindingReady = Boolean(normalized.uploadPackageId);
  const channelBindingReady = Boolean(selectedChannelKey);

  if (!productSourceBindingReady) blockers.push("BLOCKED_V087_PRODUCT_SOURCE_ID_MISSING");
  if (!queueItemBindingReady) blockers.push("BLOCKED_V087_QUEUE_ITEM_ID_MISSING");
  if (!uploadPackageBindingReady) blockers.push("BLOCKED_V087_UPLOAD_PACKAGE_ID_MISSING");
  if (!channelBindingReady) blockers.push("BLOCKED_V087_CHANNEL_KEY_MISSING");
  if (!isHttpsCoupangUrl(normalized.rawCoupangUrl)) blockers.push("BLOCKED_V087_RAW_COUPANG_URL_MISSING");
  if (!affiliateEvidenceReady) blockers.push("BLOCKED_V087_AFFILIATE_URL_MISSING");
  if (!disclosureEvidenceReady) blockers.push("BLOCKED_V087_DISCLOSURE_MISSING");
  if (!videoAssetEvidence.fileExists) blockers.push("BLOCKED_V087_VIDEO_ASSET_FILE_NOT_FOUND");
  if (videoAssetEvidence.fileExists && !videoAssetEvidence.fileReadable) {
    blockers.push("BLOCKED_V087_VIDEO_ASSET_FILE_UNREADABLE");
  }
  if (!firstFrameEvidence.fileExists) blockers.push("BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_NOT_FOUND");
  if (firstFrameEvidence.fileExists && !firstFrameEvidence.fileReadable) {
    blockers.push("BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_UNREADABLE");
  }
  if (firstFrameEvidence.canonicalPathMatches === false) {
    blockers.push("BLOCKED_V087_CANONICAL_FIRST_FRAME_PATH_MISMATCH");
  }
  if (!firstFrameEvidence.fileExists ||
    !firstFrameEvidence.fileReadable ||
    firstFrameEvidence.canonicalPathMatches !== true) {
    blockers.push("BLOCKED_V087_FIRST_FRAME_EVIDENCE_INCOMPLETE");
  }
  if (!duplicateGuardReady) blockers.push("BLOCKED_V087_DUPLICATE_GUARD_KEY_MISSING");
  if (!targetChannelEvidenceReady) blockers.push("BLOCKED_V087_TARGET_CHANNEL_KEY_MISSING");
  if (input.unsafeReportRequested) blockers.push("BLOCKED_V087_UNSAFE_REPORT_REQUESTED");

  let localProductSourceManifestWritten = false;
  let v085Binder: V087SanitizedV085BinderSummary = emptyV085BinderSummary();

  if (blockers.length === 0 && selectedChannelKey) {
    await writeLocalProductSourceManifest({
      cwd,
      channelKey: selectedChannelKey,
      manifest: normalized
    });
    localProductSourceManifestWritten = true;
    v085Binder = sanitizeV085BinderReport(await buildV085PrivatePilotInputBinding({
      cwd,
      env: {
        ...env,
        V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
        V084_CHANNEL_KEY: selectedChannelKey,
        V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: "",
        V084_RUNTIME_READY: ""
      },
      channelKey: selectedChannelKey
    }));
  }

  const v085Ready = v085Binder.status === "ready_for_fresh_approval";

  return buildReport({
    blockers,
    selectedChannelKey,
    productSourceBindingReady,
    queueItemBindingReady,
    uploadPackageBindingReady,
    channelBindingReady,
    videoAssetEvidence,
    firstFrameEvidence,
    affiliateEvidenceReady,
    affiliateHashPrefix: hashPrefix(normalized.selectedAffiliateUrl),
    disclosureEvidenceReady,
    duplicateGuardReady,
    duplicateGuardHashPrefix: hashPrefix(normalized.duplicateGuardKey),
    targetChannelEvidenceReady,
    productSourceHashPrefix: hashPrefix(normalized.productSourceId),
    localProductSourceManifestWritten,
    v085Binder,
    status: blockers.length === 0 && v085Ready ? "ready_for_fresh_approval" : "blocked"
  });
}

async function readManifest(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as V087AuthoritativeProductSourceManifest;
  } catch {
    return null;
  }
}

function normalizeManifest(manifest: V087AuthoritativeProductSourceManifest) {
  return {
    productSourceId: trimOrNull(manifest.productSourceId),
    queueItemId: trimOrNull(manifest.queueItemId),
    uploadPackageId: trimOrNull(manifest.uploadPackageId),
    channelKey: trimOrNull(manifest.channelKey),
    productName: trimOrNull(manifest.productName),
    rawCoupangUrl: trimOrNull(manifest.rawCoupangUrl),
    selectedAffiliateUrl: trimOrNull(manifest.selectedAffiliateUrl),
    coupangPartnersDisclosureText: trimOrNull(manifest.coupangPartnersDisclosureText),
    videoAssetPath: trimOrNull(manifest.videoAssetPath),
    firstFramePath: trimOrNull(manifest.firstFramePath),
    duplicateGuardKey: trimOrNull(manifest.duplicateGuardKey),
    targetChannelKey: trimOrNull(manifest.targetChannelKey)
  };
}

async function resolveFileEvidence(filePath: string | null): Promise<V087FileEvidence> {
  if (!filePath) return emptyFileEvidence();
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return {
        present: true,
        fileExists: true,
        fileReadable: false,
        hashPrefix: null,
        rawPathPrinted: false
      };
    }
    const handle = await fs.open(filePath, "r");
    await handle.close();
    return {
      present: true,
      fileExists: true,
      fileReadable: true,
      hashPrefix: hashPrefix(filePath),
      rawPathPrinted: false
    };
  } catch {
    return {
      present: true,
      fileExists: false,
      fileReadable: false,
      hashPrefix: hashPrefix(filePath),
      rawPathPrinted: false
    };
  }
}

async function resolveCanonicalFirstFrameEvidence(input: {
  cwd: string;
  channelKey: ChannelKey | null;
  firstFramePath: string | null;
}): Promise<V087FileEvidence> {
  if (!input.channelKey || !input.firstFramePath) return emptyFileEvidence();

  const canonicalPath = path.join(
    input.cwd,
    "commerce-assets",
    "review",
    "v057",
    input.channelKey,
    "first-frame-v057.jpg"
  );
  const manifestPath = path.resolve(input.firstFramePath);
  const resolvedCanonicalPath = path.resolve(canonicalPath);
  const canonicalPathMatches = manifestPath === resolvedCanonicalPath;
  const canonicalEvidence = await resolveFileEvidence(resolvedCanonicalPath);

  return {
    ...canonicalEvidence,
    present: Boolean(input.firstFramePath),
    canonicalPathMatches,
    hashPrefix: canonicalEvidence.hashPrefix ?? hashPrefix(resolvedCanonicalPath),
    rawPathPrinted: false
  };
}

async function writeLocalProductSourceManifest(input: {
  cwd: string;
  channelKey: ChannelKey;
  manifest: ReturnType<typeof normalizeManifest>;
}) {
  const outputDir = path.join(input.cwd, "commerce-assets", "review", "v057", input.channelKey);
  await fs.mkdir(outputDir, { recursive: true });
  const now = new Date().toISOString();
  const productName = input.manifest.productName ||
    V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[input.channelKey];
  const sourceEvidenceHash = hashV057ProductSourceEvidence([
    input.channelKey,
    input.manifest.productSourceId,
    input.manifest.queueItemId,
    input.manifest.uploadPackageId,
    input.manifest.rawCoupangUrl
  ].filter(Boolean).join(":"));
  const payload = {
    channelKey: input.channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSourceKind: "v057_review_package_metadata",
    productName,
    sourceProductLabel: productName,
    packageId: input.manifest.uploadPackageId,
    sourceQueueItemId: input.manifest.queueItemId,
    selectedAffiliateUrl: input.manifest.selectedAffiliateUrl,
    rawCoupangUrl: input.manifest.rawCoupangUrl,
    sourceEvidenceHash,
    duplicateGuardKey: input.manifest.duplicateGuardKey,
    targetChannelKey: input.manifest.targetChannelKey,
    updatedAt: now,
    boundAt: now,
    runtimeSourceApproved: true,
    rawUrlsRedactedInReport: true
  };
  await fs.writeFile(
    path.join(outputDir, "product-source-v057.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

function sanitizeV085BinderReport(report: V085PrivatePilotInputBindingReport): V087SanitizedV085BinderSummary {
  return {
    status: report.status,
    queueItemIdPresent: report.queueItemIdPresent,
    uploadPackageIdPresent: report.uploadPackageIdPresent,
    runtimeReady: report.runtimeReady,
    videoAssetReady: report.videoAssetReady,
    affiliateEvidenceReady: report.affiliateEvidenceReady,
    disclosureEvidenceReady: report.disclosureEvidenceReady,
    duplicateGuardReady: report.duplicateGuardReady,
    targetChannelEvidenceReady: report.targetChannelEvidenceReady,
    tokenProviderReady: report.tokenProviderReady,
    uploadScopeReady: report.uploadScopeReady,
    quotaReady: report.quotaReady,
    approvalForwardedToV084Plan: false,
    ambientApprovalStripped: true,
    v084FreshApprovalRequired: report.v084Plan.blockers.includes("BLOCKED_V084_FRESH_APPROVAL_REQUIRED"),
    blockers: report.blockers
  };
}

function emptyV085BinderSummary(): V087SanitizedV085BinderSummary {
  return {
    status: "not_run",
    queueItemIdPresent: false,
    uploadPackageIdPresent: false,
    runtimeReady: false,
    videoAssetReady: false,
    affiliateEvidenceReady: false,
    disclosureEvidenceReady: false,
    duplicateGuardReady: false,
    targetChannelEvidenceReady: false,
    tokenProviderReady: false,
    uploadScopeReady: false,
    quotaReady: false,
    approvalForwardedToV084Plan: false,
    ambientApprovalStripped: true,
    v084FreshApprovalRequired: true,
    blockers: []
  };
}

function buildReport(input: {
  blockers: V087AuthoritativeProductSourceBindingBlocker[];
  selectedChannelKey: ChannelKey | null;
  productSourceBindingReady?: boolean;
  queueItemBindingReady?: boolean;
  uploadPackageBindingReady?: boolean;
  channelBindingReady?: boolean;
  videoAssetEvidence: V087FileEvidence;
  firstFrameEvidence: V087FileEvidence;
  affiliateEvidenceReady?: boolean;
  affiliateHashPrefix?: string | null;
  disclosureEvidenceReady?: boolean;
  duplicateGuardReady?: boolean;
  duplicateGuardHashPrefix?: string | null;
  targetChannelEvidenceReady?: boolean;
  productSourceHashPrefix?: string | null;
  localProductSourceManifestWritten?: boolean;
  v085Binder?: V087SanitizedV085BinderSummary;
  status?: V087AuthoritativeProductSourceBindingReport["status"];
}): V087AuthoritativeProductSourceBindingReport {
  return {
    version: "v087",
    status: input.status ?? "blocked",
    mode: "authoritative_product_source_binding_no_upload",
    selectedChannelKey: input.selectedChannelKey,
    productSourceBindingReady: input.productSourceBindingReady ?? false,
    queueItemBindingReady: input.queueItemBindingReady ?? false,
    uploadPackageBindingReady: input.uploadPackageBindingReady ?? false,
    channelBindingReady: input.channelBindingReady ?? false,
    videoAssetEvidence: input.videoAssetEvidence,
    firstFrameEvidence: input.firstFrameEvidence,
    affiliateEvidenceReady: input.affiliateEvidenceReady ?? false,
    affiliateHashPrefix: input.affiliateHashPrefix ?? null,
    disclosureEvidenceReady: input.disclosureEvidenceReady ?? false,
    duplicateGuardReady: input.duplicateGuardReady ?? false,
    duplicateGuardHashPrefix: input.duplicateGuardHashPrefix ?? null,
    targetChannelEvidenceReady: input.targetChannelEvidenceReady ?? false,
    productSourceHashPrefix: input.productSourceHashPrefix ?? null,
    localProductSourceManifestWritten: input.localProductSourceManifestWritten ?? false,
    v085Binder: input.v085Binder ?? emptyV085BinderSummary(),
    blockers: [...new Set(input.blockers)],
    v084ExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    comment_create_update_delete_called: false,
    scheduler_auto_execution_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    n8n_webhook_called: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    redactionProof: {
      rawUrlsPrinted: false,
      rawFilePathsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    },
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function emptyFileEvidence(): V087FileEvidence {
  return {
    present: false,
    fileExists: false,
    fileReadable: false,
    hashPrefix: null,
    rawPathPrinted: false
  };
}

function hasCoupangDisclosure(value: string | null) {
  if (!value) return false;
  const normalized = value.replace(/\s+/g, "");
  return normalized.includes("쿠팡파트너스") && (normalized.includes("수수료") || normalized.includes("제공받"));
}

function isHttpsCoupangUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "coupang.com" || url.hostname.endsWith(".coupang.com")) &&
      !url.hostname.includes("example");
  } catch {
    return false;
  }
}

function trimOrNull(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function hashPrefix(value: string | null | undefined) {
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 10) : null;
}

export function v087AllowedChannelKeys() {
  return CHANNEL_KEYS;
}
