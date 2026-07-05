import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { generateV073UploadPackages, type V073DisclosureOverride } from "../multi-channel/v073UploadPackageGenerator";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import type { ChannelKey } from "../multi-channel/channelProfiles";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";
import {
  buildV084PrivateUploadPilotInvocationFromEnv,
  type V084PrivateUploadPilotInvocationResult
} from "./v084PrivateUploadExecutionInvocation";

export type V085PrivatePilotInputBindingStatus = "blocked" | "ready_for_fresh_approval";
export type V085PrivatePilotInputBindingMode = "private_pilot_input_binding_no_upload";
export type V085PrivatePilotInputBindingBlocker =
  | "BLOCKED_V085_QUEUE_ITEM_ID_MISSING"
  | "BLOCKED_V085_UPLOAD_PACKAGE_ID_MISSING"
  | "BLOCKED_V085_RUNTIME_READY_MISSING"
  | "BLOCKED_V085_VIDEO_ASSET_NOT_READY"
  | "BLOCKED_V085_AFFILIATE_EVIDENCE_NOT_READY"
  | "BLOCKED_V085_DISCLOSURE_EVIDENCE_NOT_READY"
  | "BLOCKED_V085_DUPLICATE_GUARD_NOT_READY"
  | "BLOCKED_V085_TARGET_CHANNEL_EVIDENCE_NOT_READY"
  | "BLOCKED_V085_TOKEN_PROVIDER_NOT_READY"
  | "BLOCKED_V085_UPLOAD_SCOPE_NOT_READY"
  | "BLOCKED_V085_UNSAFE_REPORT_REQUESTED";

export type V085PrivatePilotInputBindingInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  channelKey?: ChannelKey;
  disclosureOverrides?: V073DisclosureOverride;
  unsafeReportRequested?: boolean;
};

export type V085BoundV084Env = {
  V084_QUEUE_ITEM_ID: string | null;
  V084_UPLOAD_PACKAGE_ID: string | null;
  V084_RUNTIME_READY: "true" | "false";
  V084_CHANNEL_KEY: ChannelKey;
  V084_VISIBILITY: "private";
  V084_MAX_ITEMS: "1";
};

export type V085PrivatePilotInputBindingReport = {
  version: "v085";
  status: V085PrivatePilotInputBindingStatus;
  mode: V085PrivatePilotInputBindingMode;
  selectedChannelKey: ChannelKey;
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
  nextRequiredEnv: {
    V084_QUEUE_ITEM_ID: "present" | "missing";
    V084_UPLOAD_PACKAGE_ID: "present" | "missing";
    V084_RUNTIME_READY: "ready" | "missing";
  };
  boundV084Env: V085BoundV084Env;
  blockers: V085PrivatePilotInputBindingBlocker[];
  v084Plan: V084PrivateUploadPilotInvocationResult;
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
    rawVideoIdsPrinted: false;
    rawChannelIdsPrinted: false;
    secretsPrinted: false;
    fakeSuccess: false;
  };
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

type TokenEvidence = {
  tokenProviderReady: boolean;
  uploadScopeReady: boolean;
};

export async function buildV085PrivatePilotInputBinding(
  input: V085PrivatePilotInputBindingInput = {}
): Promise<V085PrivatePilotInputBindingReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const selectedChannelKey = input.channelKey ?? normalizeChannelKey(env.V084_CHANNEL_KEY);
  const packageResult = await generateV073UploadPackages({
    cwd,
    env,
    uploadAssetProfile: env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE,
    disclosureOverrides: input.disclosureOverrides
  });
  const selectedPackage = selectPackage(packageResult.packages, selectedChannelKey);
  const tokenEvidence = await resolveTokenEvidence({ cwd, env });
  const queueItemId = selectedPackage?.queueItemId ?? trimOrNull(env.V084_QUEUE_ITEM_ID);
  const uploadPackageId = selectedPackage?.packageId ?? trimOrNull(env.V084_UPLOAD_PACKAGE_ID);
  const evidence = buildEvidence(selectedPackage, tokenEvidence, env);
  const runtimeReady = Object.values(evidence).every(Boolean);
  const boundV084Env: V085BoundV084Env = {
    V084_QUEUE_ITEM_ID: queueItemId,
    V084_UPLOAD_PACKAGE_ID: uploadPackageId,
    V084_RUNTIME_READY: runtimeReady ? "true" : "false",
    V084_CHANNEL_KEY: selectedChannelKey,
    V084_VISIBILITY: "private",
    V084_MAX_ITEMS: "1"
  };
  const blockers = buildBlockers({
    queueItemId,
    uploadPackageId,
    evidence,
    unsafeReportRequested: input.unsafeReportRequested
  });
  const v084Plan = await buildV084PrivateUploadPilotInvocationFromEnv({
    dryRun: true,
    env: {
      ...env,
      ...toProcessEnv(boundV084Env),
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: env.V084_PRIVATE_UPLOAD_APPROVAL_PHRASE ?? ""
    }
  });

  return {
    version: "v085",
    status: blockers.length === 0 ? "ready_for_fresh_approval" : "blocked",
    mode: "private_pilot_input_binding_no_upload",
    selectedChannelKey,
    queueItemIdPresent: Boolean(queueItemId),
    uploadPackageIdPresent: Boolean(uploadPackageId),
    runtimeReady,
    videoAssetReady: evidence.videoAssetReady,
    affiliateEvidenceReady: evidence.affiliateEvidenceReady,
    disclosureEvidenceReady: evidence.disclosureEvidenceReady,
    duplicateGuardReady: evidence.duplicateGuardReady,
    targetChannelEvidenceReady: evidence.targetChannelEvidenceReady,
    tokenProviderReady: evidence.tokenProviderReady,
    uploadScopeReady: evidence.uploadScopeReady,
    quotaReady: evidence.quotaReady,
    nextRequiredEnv: {
      V084_QUEUE_ITEM_ID: queueItemId ? "present" : "missing",
      V084_UPLOAD_PACKAGE_ID: uploadPackageId ? "present" : "missing",
      V084_RUNTIME_READY: runtimeReady ? "ready" : "missing"
    },
    boundV084Env,
    blockers,
    v084Plan,
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
    redactionProof: buildRedactionProof(),
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function selectPackage(packages: V073UploadPackage[], channelKey: ChannelKey) {
  return packages.find((item) => item.channelKey === channelKey) ?? packages[0] ?? null;
}

function buildEvidence(
  selectedPackage: V073UploadPackage | null,
  tokenEvidence: TokenEvidence,
  env: NodeJS.ProcessEnv
) {
  return {
    videoAssetReady: Boolean(selectedPackage?.videoAsset.path && selectedPackage.videoAsset.hashEvidence),
    affiliateEvidenceReady: selectedPackage?.deeplink.status === "ready" &&
      Boolean(selectedPackage.deeplink.sanitizedEvidence.affiliateUrlPresent),
    disclosureEvidenceReady: Boolean(selectedPackage?.commentPackage.coupangPartnersDisclosurePresent),
    duplicateGuardReady: Boolean(selectedPackage?.duplicateGuard.ready && !selectedPackage.duplicateGuard.duplicateUploadRisk),
    targetChannelEvidenceReady: Boolean(selectedPackage?.targetChannel.formatValid && selectedPackage.targetChannel.channelIdHashPrefix),
    tokenProviderReady: tokenEvidence.tokenProviderReady,
    uploadScopeReady: tokenEvidence.uploadScopeReady,
    quotaReady: readBooleanEnv(env.YOUTUBE_QUOTA_READY)
  };
}

function buildBlockers(input: {
  queueItemId: string | null;
  uploadPackageId: string | null;
  evidence: ReturnType<typeof buildEvidence>;
  unsafeReportRequested?: boolean;
}): V085PrivatePilotInputBindingBlocker[] {
  const blockers: V085PrivatePilotInputBindingBlocker[] = [];

  if (!input.queueItemId) blockers.push("BLOCKED_V085_QUEUE_ITEM_ID_MISSING");
  if (!input.uploadPackageId) blockers.push("BLOCKED_V085_UPLOAD_PACKAGE_ID_MISSING");
  if (!input.evidence.videoAssetReady) blockers.push("BLOCKED_V085_VIDEO_ASSET_NOT_READY");
  if (!input.evidence.affiliateEvidenceReady) blockers.push("BLOCKED_V085_AFFILIATE_EVIDENCE_NOT_READY");
  if (!input.evidence.disclosureEvidenceReady) blockers.push("BLOCKED_V085_DISCLOSURE_EVIDENCE_NOT_READY");
  if (!input.evidence.duplicateGuardReady) blockers.push("BLOCKED_V085_DUPLICATE_GUARD_NOT_READY");
  if (!input.evidence.targetChannelEvidenceReady) blockers.push("BLOCKED_V085_TARGET_CHANNEL_EVIDENCE_NOT_READY");
  if (!input.evidence.tokenProviderReady) blockers.push("BLOCKED_V085_TOKEN_PROVIDER_NOT_READY");
  if (!input.evidence.uploadScopeReady) blockers.push("BLOCKED_V085_UPLOAD_SCOPE_NOT_READY");
  if (!Object.values(input.evidence).every(Boolean)) blockers.push("BLOCKED_V085_RUNTIME_READY_MISSING");
  if (input.unsafeReportRequested) blockers.push("BLOCKED_V085_UNSAFE_REPORT_REQUESTED");

  return [...new Set(blockers)];
}

async function resolveTokenEvidence(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<TokenEvidence> {
  const configuredPath = trimOrNull(input.env.YOUTUBE_LOCAL_TOKEN_FILE_PATH) ??
    trimOrNull(input.env.YOUTUBE_TOKEN_FILE);
  if (!configuredPath) {
    return { tokenProviderReady: false, uploadScopeReady: false };
  }
  const resolvedPath = path.resolve(configuredPath);
  if (isPathInside(resolvedPath, path.resolve(input.cwd))) {
    return { tokenProviderReady: false, uploadScopeReady: false };
  }

  try {
    const parsed = JSON.parse(await fs.readFile(resolvedPath, "utf8")) as {
      access_token?: unknown;
      refresh_token?: unknown;
      scope?: unknown;
      scopes?: unknown;
      granted_scopes?: unknown;
    };
    const tokenProviderReady = typeof parsed.access_token === "string" ||
      typeof parsed.refresh_token === "string";
    const uploadScopeReady = getScopes(parsed).includes(YOUTUBE_UPLOAD_SCOPE);
    return { tokenProviderReady, uploadScopeReady };
  } catch {
    return { tokenProviderReady: false, uploadScopeReady: false };
  }
}

function getScopes(tokenJson: {
  scope?: unknown;
  scopes?: unknown;
  granted_scopes?: unknown;
}) {
  const scopes = new Set<string>();
  for (const value of [tokenJson.scope, tokenJson.scopes, tokenJson.granted_scopes]) {
    if (typeof value === "string") {
      value.split(/\s+/).filter(Boolean).forEach((scope) => scopes.add(scope));
    }
    if (Array.isArray(value)) {
      value.filter((scope): scope is string => typeof scope === "string").forEach((scope) => scopes.add(scope));
    }
  }
  return Array.from(scopes);
}

function isPathInside(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeChannelKey(value: string | undefined): ChannelKey {
  return value === "neoman_moleulgeol" || value === "lets_buy" ? value : "father_jobs";
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function readBooleanEnv(value: unknown) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function buildRedactionProof() {
  return {
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false,
    fakeSuccess: false
  } as const;
}

function toProcessEnv(env: V085BoundV084Env): Record<string, string> {
  return {
    V084_QUEUE_ITEM_ID: env.V084_QUEUE_ITEM_ID ?? "",
    V084_UPLOAD_PACKAGE_ID: env.V084_UPLOAD_PACKAGE_ID ?? "",
    V084_RUNTIME_READY: env.V084_RUNTIME_READY,
    V084_CHANNEL_KEY: env.V084_CHANNEL_KEY,
    V084_VISIBILITY: env.V084_VISIBILITY,
    V084_MAX_ITEMS: env.V084_MAX_ITEMS
  };
}

export function v085HashPrefix(value: string | null | undefined) {
  const normalized = trimOrNull(value);
  return normalized
    ? crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 10)
    : null;
}
