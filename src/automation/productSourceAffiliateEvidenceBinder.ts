import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ProductQueueItem } from "@/types/automation";
import type { ChannelKey } from "@/uploads/multi-channel/channelProfiles";
import { isChannelKey } from "@/uploads/multi-channel/channelProfiles";
import type { V073UploadPackage } from "@/uploads/multi-channel/v073UploadPackage";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  buildV107OwnerReviewFirstVideoSettingsTable,
  type V107OwnerReviewFirstVideoSettingsTableReport
} from "./ownerReviewFirstVideoSettingsTable";
import {
  buildV108FirstVideoUploadPackageMaterializerReport,
  type V108FirstVideoUploadPackageMaterializerFinalStatus,
  type V108FirstVideoUploadPackageMaterializerReport
} from "./firstVideoUploadPackageMaterializer";

export type V109ProductSourceAffiliateEvidenceMode =
  | "dry_run"
  | "local_write"
  | "execute";

export type V109ProductSourceAffiliateEvidenceFinalStatus =
  | "SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD"
  | "BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
  | "BLOCKED_V109_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
  | "BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD"
  | "BLOCKED_V109_AFFILIATE_EVIDENCE_MISSING_NO_UPLOAD"
  | "BLOCKED_V109_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD"
  | "BLOCKED_V109_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD"
  | "BLOCKED_V109_EXECUTE_NOT_APPROVED_NO_UPLOAD";

export type V109NextBlocker =
  | V109ProductSourceAffiliateEvidenceFinalStatus
  | V108FirstVideoUploadPackageMaterializerFinalStatus
  | null;

export type V109ProductSourceAffiliateEvidenceReport = {
  version: "v109";
  mode: "product_source_and_affiliate_evidence_binding_no_upload";
  requestedMode: V109ProductSourceAffiliateEvidenceMode;
  FINAL_STATUS: V109ProductSourceAffiliateEvidenceFinalStatus;
  selectedChannelKey: ChannelKey;
  selectedItemFound: boolean;
  selectedItemShortId: string | null;
  sourceItemConsistency: boolean;
  productSourceEvidencePresent: boolean;
  productSourceHashPrefix: string | null;
  productSourceApproved: boolean;
  productSourcePatchPlanned: boolean;
  affiliateEvidencePresent: boolean;
  affiliateHashPrefix: string | null;
  affiliatePatchPlanned: boolean;
  disclosureEvidencePresent: boolean;
  disclosurePatchPlanned: boolean;
  queuePatchPlanned: boolean;
  queuePatchApplied: false;
  patchedQueueItemShortId: string | null;
  v107Status: V107OwnerReviewFirstVideoSettingsTableReport["FINAL_STATUS"] | null;
  v108BeforeStatus: V108FirstVideoUploadPackageMaterializerFinalStatus | null;
  v108AfterStatus: V108FirstVideoUploadPackageMaterializerFinalStatus | null;
  nextBlocker: V109NextBlocker;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  n8nWebhookCalled: false;
  schedulerExecutionCalled: false;
  DB_write: false;
  Supabase_write: false;
  R2_upload: false;
  storage_write: false;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V109DryRunFixtureEvidence = {
  rawCoupangUrl?: string | null;
  affiliateUrl?: string | null;
  disclosureEvidencePresent?: boolean;
};

export type V109ProductSourceAffiliateEvidenceInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  selectedChannelKey?: string;
  mode?: string;
  now?: string | Date;
  queueItems?: ProductQueueItem[];
  readQueueItems?: () => Promise<ProductQueueItem[]>;
  uploadPackages?: V073UploadPackage[];
  loadUploadPackages?: () => Promise<V073UploadPackage[]>;
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
  v107Report?: V107OwnerReviewFirstVideoSettingsTableReport;
  v108BeforeReport?: V108FirstVideoUploadPackageMaterializerReport;
  fixtureEvidence?: Partial<Record<ChannelKey, V109DryRunFixtureEvidence>>;
};

const DEFAULT_FIXTURE_EVIDENCE: Record<ChannelKey, Required<V109DryRunFixtureEvidence>> = {
  father_jobs: {
    rawCoupangUrl: "https://www.coupang.com/vp/products/v109-father-jobs-fixture",
    affiliateUrl: "https://link.coupang.com/a/v109-father-jobs-fixture",
    disclosureEvidencePresent: true
  },
  neoman_moleulgeol: {
    rawCoupangUrl: "https://www.coupang.com/vp/products/v109-neoman-fixture",
    affiliateUrl: "https://link.coupang.com/a/v109-neoman-fixture",
    disclosureEvidencePresent: true
  },
  lets_buy: {
    rawCoupangUrl: "https://www.coupang.com/vp/products/v109-lets-buy-fixture",
    affiliateUrl: "https://link.coupang.com/a/v109-lets-buy-fixture",
    disclosureEvidencePresent: true
  }
};

export async function buildV109ProductSourceAffiliateEvidenceReport(
  input: V109ProductSourceAffiliateEvidenceInput = {}
): Promise<V109ProductSourceAffiliateEvidenceReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const selectedChannelKey = resolveChannelKey(
    input.selectedChannelKey ??
    env.V109_CHANNEL_KEY ??
    env.V108_CHANNEL_KEY ??
    env.V107_CHANNEL_KEY
  );
  const requestedMode = resolveMode(input.mode ?? env.V109_MODE);

  if (requestedMode === "local_write") {
    return blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus: "BLOCKED_V109_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD"
    });
  }
  if (requestedMode === "execute") {
    return blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus: "BLOCKED_V109_EXECUTE_NOT_APPROVED_NO_UPLOAD"
    });
  }

  const v107Report = input.v107Report ?? await buildV107OwnerReviewFirstVideoSettingsTable({
    cwd,
    env: {
      ...env,
      V107_CHANNEL_KEY: selectedChannelKey,
      V106_CHANNEL_KEY: selectedChannelKey,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    now: input.now,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems,
    uploadPackages: input.uploadPackages,
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });
  const v108BeforeReport = input.v108BeforeReport ?? await buildV108FirstVideoUploadPackageMaterializerReport({
    cwd,
    env: {
      ...env,
      V108_CHANNEL_KEY: selectedChannelKey,
      V107_CHANNEL_KEY: selectedChannelKey,
      V106_CHANNEL_KEY: selectedChannelKey,
      V105_CHANNEL_KEY: selectedChannelKey
    },
    selectedChannelKey,
    mode: "dry_run",
    now: input.now,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems,
    uploadPackages: input.uploadPackages,
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs,
    v107Report
  });

  if (!v107Report.selectedItemFound || !v107Report.selectedItemShortId) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
      }),
      v107Status: v107Report.FINAL_STATUS,
      v108BeforeStatus: v108BeforeReport.FINAL_STATUS,
      nextBlocker: "BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
    };
  }

  if (!v107Report.sourceItemConsistency) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V109_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
      }),
      selectedItemFound: true,
      selectedItemShortId: v107Report.selectedItemShortId,
      sourceItemConsistency: false,
      v107Status: v107Report.FINAL_STATUS,
      v108BeforeStatus: v108BeforeReport.FINAL_STATUS,
      nextBlocker: "BLOCKED_V109_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
    };
  }

  const queueItems = await readQueueItems({
    cwd,
    env,
    queueItems: input.queueItems,
    readQueueItems: input.readQueueItems
  });
  const selectedItem = queueItems.find((item) =>
    getItemChannelKey(item) === selectedChannelKey &&
    hashPrefix(item.id) === v107Report.selectedItemShortId
  ) ?? null;

  if (!selectedItem) {
    return {
      ...blockedBaseReport({
        selectedChannelKey,
        requestedMode,
        finalStatus: "BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
      }),
      v107Status: v107Report.FINAL_STATUS,
      v108BeforeStatus: v108BeforeReport.FINAL_STATUS,
      nextBlocker: "BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD"
    };
  }

  const fixture = resolveFixtureEvidence({
    input,
    env,
    selectedChannelKey
  });
  const productSource = resolveProductSourceEvidence(selectedItem.raw_coupang_url, fixture?.rawCoupangUrl);
  const affiliate = resolveAffiliateEvidence(selectedItem.selected_affiliate_url, fixture?.affiliateUrl);
  const disclosureEvidencePresent = Boolean(
    v107Report.coupangDisclosurePresent ||
    fixture?.disclosureEvidencePresent === true
  );
  const disclosurePatchPlanned = !v107Report.coupangDisclosurePresent && fixture?.disclosureEvidencePresent === true;
  const queuePatchPlanned = productSource.patchPlanned || affiliate.patchPlanned || disclosurePatchPlanned;
  const patchedSelectedItem = patchQueueItem({
    selectedItem,
    productSource,
    affiliate
  });
  const patchedQueueItems = queueItems.map((item) => item.id === selectedItem.id ? patchedSelectedItem : item);
  const v108AfterStatus = await resolveV108AfterStatus({
    input,
    cwd,
    env,
    selectedChannelKey,
    patchedQueueItems,
    productSourceApproved: productSource.approved,
    affiliateEvidencePresent: affiliate.present,
    disclosureEvidencePresent,
    v107Report
  });
  const finalStatus = resolveFinalStatus({
    productSourceApproved: productSource.approved,
    affiliateEvidencePresent: affiliate.present,
    disclosureEvidencePresent
  });
  const nextBlocker = finalStatus === "SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD"
    ? v108AfterStatus === "SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD"
      ? null
      : v108AfterStatus
    : finalStatus;

  return {
    ...blockedBaseReport({
      selectedChannelKey,
      requestedMode,
      finalStatus
    }),
    selectedItemFound: true,
    selectedItemShortId: hashPrefix(selectedItem.id),
    sourceItemConsistency: true,
    productSourceEvidencePresent: productSource.present,
    productSourceHashPrefix: productSource.hashPrefix,
    productSourceApproved: productSource.approved,
    productSourcePatchPlanned: productSource.patchPlanned,
    affiliateEvidencePresent: affiliate.present,
    affiliateHashPrefix: affiliate.hashPrefix,
    affiliatePatchPlanned: affiliate.patchPlanned,
    disclosureEvidencePresent,
    disclosurePatchPlanned,
    queuePatchPlanned,
    queuePatchApplied: false,
    patchedQueueItemShortId: queuePatchPlanned ? hashPrefix(selectedItem.id) : null,
    v107Status: v107Report.FINAL_STATUS,
    v108BeforeStatus: v108BeforeReport.FINAL_STATUS,
    v108AfterStatus,
    nextBlocker
  };
}

async function resolveV108AfterStatus(input: {
  input: V109ProductSourceAffiliateEvidenceInput;
  cwd: string;
  env: NodeJS.ProcessEnv;
  selectedChannelKey: ChannelKey;
  patchedQueueItems: ProductQueueItem[];
  productSourceApproved: boolean;
  affiliateEvidencePresent: boolean;
  disclosureEvidencePresent: boolean;
  v107Report: V107OwnerReviewFirstVideoSettingsTableReport;
}): Promise<V108FirstVideoUploadPackageMaterializerFinalStatus | null> {
  if (!input.productSourceApproved) {
    return null;
  }
  if (!input.affiliateEvidencePresent || !input.disclosureEvidencePresent) {
    return "BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD";
  }
  const afterReport = await buildV108FirstVideoUploadPackageMaterializerReport({
    cwd: input.cwd,
    env: {
      ...input.env,
      V108_CHANNEL_KEY: input.selectedChannelKey,
      V107_CHANNEL_KEY: input.selectedChannelKey,
      V106_CHANNEL_KEY: input.selectedChannelKey,
      V105_CHANNEL_KEY: input.selectedChannelKey
    },
    selectedChannelKey: input.selectedChannelKey,
    mode: "dry_run",
    now: input.input.now,
    queueItems: input.patchedQueueItems,
    uploadPackages: input.input.uploadPackages,
    loadUploadPackages: input.input.loadUploadPackages,
    preparedVideoAssetRefs: input.input.preparedVideoAssetRefs,
    v107Report: {
      ...input.v107Report,
      selectedItemFound: true,
      sourceItemConsistency: true
    }
  });
  return afterReport.FINAL_STATUS;
}

function resolveFinalStatus(input: {
  productSourceApproved: boolean;
  affiliateEvidencePresent: boolean;
  disclosureEvidencePresent: boolean;
}): V109ProductSourceAffiliateEvidenceFinalStatus {
  if (!input.productSourceApproved) {
    return "BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD";
  }
  if (!input.affiliateEvidencePresent) {
    return "BLOCKED_V109_AFFILIATE_EVIDENCE_MISSING_NO_UPLOAD";
  }
  if (!input.disclosureEvidencePresent) {
    return "BLOCKED_V109_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD";
  }
  return "SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD";
}

function patchQueueItem(input: {
  selectedItem: ProductQueueItem;
  productSource: EvidenceResolution;
  affiliate: EvidenceResolution;
}): ProductQueueItem {
  return {
    ...input.selectedItem,
    raw_coupang_url: input.productSource.value ?? input.selectedItem.raw_coupang_url,
    selected_affiliate_url: input.affiliate.value ?? input.selectedItem.selected_affiliate_url
  };
}

type EvidenceResolution = {
  value: string | null;
  present: boolean;
  approved: boolean;
  hashPrefix: string | null;
  patchPlanned: boolean;
};

function resolveProductSourceEvidence(existing: string, fixture: string | null | undefined): EvidenceResolution {
  if (isValidCoupangProductSourceEvidence(existing)) {
    const value = existing.trim();
    return {
      value,
      present: true,
      approved: true,
      hashPrefix: hashPrefix(value),
      patchPlanned: false
    };
  }
  if (isValidCoupangProductSourceEvidence(fixture)) {
    const value = fixture.trim();
    return {
      value,
      present: true,
      approved: true,
      hashPrefix: hashPrefix(value),
      patchPlanned: true
    };
  }
  return {
    value: null,
    present: false,
    approved: false,
    hashPrefix: null,
    patchPlanned: false
  };
}

function resolveAffiliateEvidence(existing: string, fixture: string | null | undefined): EvidenceResolution {
  if (isValidAffiliateEvidence(existing)) {
    const value = existing.trim();
    return {
      value,
      present: true,
      approved: true,
      hashPrefix: hashPrefix(value),
      patchPlanned: false
    };
  }
  if (isValidAffiliateEvidence(fixture)) {
    const value = fixture.trim();
    return {
      value,
      present: true,
      approved: true,
      hashPrefix: hashPrefix(value),
      patchPlanned: true
    };
  }
  return {
    value: null,
    present: false,
    approved: false,
    hashPrefix: null,
    patchPlanned: false
  };
}

export function isValidCoupangProductSourceEvidence(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" &&
      (url.hostname === "coupang.com" || url.hostname.endsWith(".coupang.com")) &&
      url.pathname.includes("/vp/products/")
    );
  } catch {
    return false;
  }
}

export function isValidAffiliateEvidence(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && (
      url.hostname === "link.coupang.com" ||
      url.hostname.endsWith(".link.coupang.com")
    );
  } catch {
    return false;
  }
}

function resolveFixtureEvidence(input: {
  input: V109ProductSourceAffiliateEvidenceInput;
  env: NodeJS.ProcessEnv;
  selectedChannelKey: ChannelKey;
}): V109DryRunFixtureEvidence | null {
  if (input.env.V109_DRY_RUN_USE_FIXTURE_EVIDENCE !== "true") {
    return null;
  }
  return input.input.fixtureEvidence?.[input.selectedChannelKey] ??
    DEFAULT_FIXTURE_EVIDENCE[input.selectedChannelKey];
}

async function readQueueItems(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  queueItems?: ProductQueueItem[];
  readQueueItems?: () => Promise<ProductQueueItem[]>;
}) {
  if (input.queueItems) {
    return input.queueItems.filter(isProductQueueItem);
  }
  if (input.readQueueItems) {
    return (await input.readQueueItems()).filter(isProductQueueItem);
  }

  try {
    const parsed = JSON.parse(await fs.readFile(getQueuePath(input.cwd, input.env), "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isProductQueueItem) : [];
  } catch {
    return [];
  }
}

function blockedBaseReport(input: {
  selectedChannelKey: ChannelKey;
  requestedMode: V109ProductSourceAffiliateEvidenceMode;
  finalStatus: V109ProductSourceAffiliateEvidenceFinalStatus;
}): V109ProductSourceAffiliateEvidenceReport {
  return {
    version: "v109",
    mode: "product_source_and_affiliate_evidence_binding_no_upload",
    requestedMode: input.requestedMode,
    FINAL_STATUS: input.finalStatus,
    selectedChannelKey: input.selectedChannelKey,
    selectedItemFound: false,
    selectedItemShortId: null,
    sourceItemConsistency: false,
    productSourceEvidencePresent: false,
    productSourceHashPrefix: null,
    productSourceApproved: false,
    productSourcePatchPlanned: false,
    affiliateEvidencePresent: false,
    affiliateHashPrefix: null,
    affiliatePatchPlanned: false,
    disclosureEvidencePresent: false,
    disclosurePatchPlanned: false,
    queuePatchPlanned: false,
    queuePatchApplied: false,
    patchedQueueItemShortId: null,
    v107Status: null,
    v108BeforeStatus: null,
    v108AfterStatus: null,
    nextBlocker: input.finalStatus === "SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD"
      ? null
      : input.finalStatus,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    n8nWebhookCalled: false,
    schedulerExecutionCalled: false,
    DB_write: false,
    Supabase_write: false,
    R2_upload: false,
    storage_write: false,
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

function resolveChannelKey(value: unknown): ChannelKey {
  return isChannelKey(value) ? value : "father_jobs";
}

function resolveMode(value: unknown): V109ProductSourceAffiliateEvidenceMode {
  if (value === "local_write" || value === "execute") {
    return value;
  }
  return "dry_run";
}

function getItemChannelKey(item: ProductQueueItem): ChannelKey {
  return isChannelKey(item.channelKey) ? item.channelKey : "father_jobs";
}

function getQueuePath(cwd: string, env: NodeJS.ProcessEnv) {
  const dataDir = path.resolve(cwd, env.AUTOMATION_DATA_DIR || "./data");
  return path.join(dataDir, "queue.json");
}

function isProductQueueItem(value: unknown): value is ProductQueueItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ProductQueueItem>;
  return (
    typeof record.id === "string" &&
    isChannelKey(record.channelKey) &&
    typeof record.queue_date === "string" &&
    typeof record.queue_rank === "number" &&
    typeof record.upload_slot === "number" &&
    typeof record.scheduled_at === "string" &&
    typeof record.keyword === "string" &&
    typeof record.theme === "string" &&
    typeof record.product_name === "string" &&
    typeof record.category_path === "string" &&
    typeof record.raw_coupang_url === "string" &&
    typeof record.selected_affiliate_url === "string" &&
    typeof record.queue_status === "string" &&
    typeof record.manual_review_status === "string"
  );
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}
