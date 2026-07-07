import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ChannelKey } from "../multi-channel/channelProfiles";
import {
  buildV085PrivatePilotInputBinding,
  type V085PrivatePilotInputBindingReport
} from "./v085PrivatePilotInputBinding";
import {
  buildV087AuthoritativeProductSourceBinding,
  type V087AuthoritativeProductSourceBindingReport
} from "./v087AuthoritativeProductSourceBinding";
import type {
  V084PrivateUploadPilotBinderStatus,
  V084PrivateUploadPilotInvocationBlocker,
  V084PrivateUploadPilotInvocationReadiness,
  V084PrivateUploadPilotResolverStatus
} from "./v084PrivateUploadExecutionInvocation";

export const DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH = path.join(
  "commerce-assets",
  "review",
  "v057",
  "father_jobs",
  "private-pilot-execution-context.local.json"
);

export type V095PrivatePilotExecutionContextStatus = "blocked" | "context_ready";
export type V095PrivatePilotExecutionContextMode = "private_pilot_execution_context_no_upload";
export type V095PrivatePilotExecutionContextBlocker =
  | "BLOCKED_V095_V088_RESOLVER_NOT_BOUND"
  | "BLOCKED_V095_V087_BINDER_NOT_READY"
  | "BLOCKED_V095_V085_BINDER_NOT_READY"
  | "BLOCKED_V095_QUEUE_ITEM_ID_MISSING"
  | "BLOCKED_V095_UPLOAD_PACKAGE_ID_MISSING"
  | "BLOCKED_V095_CONTEXT_WRITE_FAILED"
  | "BLOCKED_V095_CONTEXT_PATH_UNSAFE"
  | "BLOCKED_V095_CONTEXT_UNSAFE"
  | "BLOCKED_V095_CONTEXT_STALE"
  | "BLOCKED_V095_READINESS_NOT_READY";

export type V095PrivatePilotExecutionContext = {
  version: "v095";
  channelKey: ChannelKey;
  queueItemId: string;
  uploadPackageId: string;
  v088ResolverStatus: "bound";
  v087BinderStatus: "ready_for_fresh_approval";
  v085BinderStatus: "ready_for_fresh_approval";
  visibility: "private";
  maxItems: 1;
  readiness: V095PrivatePilotExecutionReadiness;
  productSourceHashPrefix: string | null;
  videoAssetHashPrefix: string | null;
  targetChannelHashPrefix: string | null;
  generatedAt: string;
  contextCreatedAt: string;
  contextExpiresAt: string;
};

export type V095PrivatePilotExecutionReadiness = {
  runtimeReady: boolean;
  tokenProviderReady: boolean;
  uploadScopeReady: boolean;
  quotaReady: boolean;
  videoAssetReady: boolean;
  uploadPackageReady: boolean;
  affiliateEvidenceReady: boolean;
  disclosureEvidenceReady: boolean;
  duplicateGuardReady: boolean;
  targetChannelEvidenceReady: boolean;
  metadataReady: boolean;
};

export type V095PrivatePilotExecutionContextReport = {
  version: "v095";
  status: V095PrivatePilotExecutionContextStatus;
  mode: V095PrivatePilotExecutionContextMode;
  selectedChannelKey: ChannelKey;
  contextPathLabel: string;
  localContextWritten: boolean;
  contextExpiresAtPresent: boolean;
  v088ResolverStatus: V084PrivateUploadPilotResolverStatus;
  v087BinderStatus: V084PrivateUploadPilotBinderStatus;
  v085BinderStatus: V084PrivateUploadPilotBinderStatus;
  queueItemIdPresent: boolean;
  uploadPackageIdPresent: boolean;
  readiness: V095PrivatePilotExecutionReadiness;
  productSourceHashPrefix: string | null;
  videoAssetHashPrefix: string | null;
  targetChannelHashPrefix: string | null;
  blockers: V095PrivatePilotExecutionContextBlocker[];
  approvalPhraseStored: false;
  rawEvidenceStored: false;
  uploadExecuteCalled: false;
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
    approvalPhrasePrinted: false;
    fakeSuccess: false;
  };
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V095PreparePrivatePilotExecutionContextInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  contextPath?: string;
  now?: () => string;
  ttlMs?: number;
};

export type V095ContextLoadForV084Result = {
  found: boolean;
  values: null | {
    channelKey: ChannelKey;
    queueItemId: string;
    uploadPackageId: string;
    v088ResolverStatus: V084PrivateUploadPilotResolverStatus;
    v087BinderStatus: V084PrivateUploadPilotBinderStatus;
    v085BinderStatus: V084PrivateUploadPilotBinderStatus;
    visibility: "private";
    maxItems: 1;
    generatedAt: string;
    videoAssetHashPrefix: string | null;
    readiness: V084PrivateUploadPilotInvocationReadiness;
  };
  blockers: V084PrivateUploadPilotInvocationBlocker[];
};

const DEFAULT_CONTEXT_TTL_MS = 30 * 60 * 1000;

export async function prepareV095PrivatePilotExecutionContext(
  input: V095PreparePrivatePilotExecutionContextInput = {}
): Promise<V095PrivatePilotExecutionContextReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const selectedChannelKey = normalizeChannelKey(env.V084_CHANNEL_KEY);
  const nowIso = input.now?.() ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(nowIso) + (input.ttlMs ?? DEFAULT_CONTEXT_TTL_MS)).toISOString();
  const contextPath = resolveContextPath(cwd, input.contextPath ?? env.V095_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH);

  const v088ResolverStatus = await resolveLocalV088Status({
    cwd,
    env,
    channelKey: selectedChannelKey
  });
  const v087Env = withDefaultProductSourceManifestPath({
    cwd,
    env,
    channelKey: selectedChannelKey
  });
  const v087Binder = await buildV087AuthoritativeProductSourceBinding({
    cwd,
    env: {
      ...v087Env,
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
    }
  });
  const v087BinderStatus = normalizeV087Status(v087Binder);
  const v085Binder = await buildV085PrivatePilotInputBinding({
    cwd,
    env: {
      ...v087Env,
      V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: "",
      V084_V088_RESOLVER_STATUS: v088ResolverStatus,
      V084_V087_BINDER_STATUS: v087BinderStatus
    },
    channelKey: selectedChannelKey
  });
  const v085BinderStatus = normalizeV085Status(v085Binder);
  const readiness = buildReadiness(v085Binder);
  const queueItemId = trimOrNull(v085Binder.boundV084Env.V084_QUEUE_ITEM_ID);
  const uploadPackageId = trimOrNull(v085Binder.boundV084Env.V084_UPLOAD_PACKAGE_ID);
  const targetChannelHashPrefix = hashPrefix(readTargetChannelId(env, selectedChannelKey));
  const blockers = buildPrepareBlockers({
    v088ResolverStatus,
    v087BinderStatus,
    v085BinderStatus,
    queueItemId,
    uploadPackageId,
    readiness
  });
  if (!contextPath.safe) {
    blockers.push("BLOCKED_V095_CONTEXT_PATH_UNSAFE");
  }
  let localContextWritten = false;

  if (blockers.length === 0 && queueItemId && uploadPackageId) {
    const context: V095PrivatePilotExecutionContext = {
      version: "v095",
      channelKey: selectedChannelKey,
      queueItemId,
      uploadPackageId,
      v088ResolverStatus: "bound",
      v087BinderStatus: "ready_for_fresh_approval",
      v085BinderStatus: "ready_for_fresh_approval",
      visibility: "private",
      maxItems: 1,
      readiness,
      productSourceHashPrefix: v087Binder.productSourceHashPrefix,
      videoAssetHashPrefix: v087Binder.videoAssetEvidence.hashPrefix,
      targetChannelHashPrefix,
      generatedAt: nowIso,
      contextCreatedAt: nowIso,
      contextExpiresAt: expiresAt
    };
    if (containsUnsafeEvidence(context)) {
      blockers.push("BLOCKED_V095_CONTEXT_UNSAFE");
    } else {
      try {
        await fs.mkdir(path.dirname(contextPath.absolutePath), { recursive: true });
        await fs.writeFile(contextPath.absolutePath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
        localContextWritten = true;
      } catch {
        blockers.push("BLOCKED_V095_CONTEXT_WRITE_FAILED");
      }
    }
  }

  return buildReport({
    selectedChannelKey,
    contextPathLabel: DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH,
    localContextWritten,
    v088ResolverStatus,
    v087BinderStatus,
    v085BinderStatus,
    queueItemId,
    uploadPackageId,
    readiness,
    productSourceHashPrefix: v087Binder.productSourceHashPrefix,
    videoAssetHashPrefix: v087Binder.videoAssetEvidence.hashPrefix,
    targetChannelHashPrefix,
    blockers
  });
}

export async function loadV095PrivatePilotExecutionContextForV084(input: {
  cwd?: string;
  env: NodeJS.ProcessEnv;
}): Promise<V095ContextLoadForV084Result> {
  const contextPathValue = trimOrNull(input.env.V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH);
  if (!contextPathValue) return { found: false, values: null, blockers: [] };

  const cwd = input.cwd ?? process.cwd();
  const contextPath = resolveContextPath(cwd, contextPathValue);
  if (!contextPath.safe) {
    return {
      found: true,
      values: null,
      blockers: ["BLOCKED_V084_EXECUTION_CONTEXT_PATH_UNSAFE"]
    };
  }
  const parsed = await readContext(contextPath.absolutePath);
  if (!parsed) return { found: false, values: null, blockers: [] };

  const blockers: V084PrivateUploadPilotInvocationBlocker[] = [];
  if (containsUnsafeEvidence(parsed)) {
    blockers.push("BLOCKED_V084_EXECUTION_CONTEXT_UNSAFE");
  }

  const context = normalizeContext(parsed);
  if (!context) {
    blockers.push("BLOCKED_V084_EXECUTION_CONTEXT_UNSAFE");
    return { found: true, values: null, blockers: [...new Set(blockers)] };
  }

  const now = parseDate(input.env.V084_NOW_ISO) ?? new Date();
  const expiresAt = parseDate(context.contextExpiresAt);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    blockers.push("BLOCKED_V084_EXECUTION_CONTEXT_STALE");
  }
  if (hasContextConflict(input.env, context)) {
    blockers.push("BLOCKED_V084_EXECUTION_CONTEXT_CONFLICT");
  }

  return {
    found: true,
    values: {
      channelKey: context.channelKey,
      queueItemId: context.queueItemId,
      uploadPackageId: context.uploadPackageId,
      v088ResolverStatus: context.v088ResolverStatus,
      v087BinderStatus: context.v087BinderStatus,
      v085BinderStatus: context.v085BinderStatus,
      visibility: context.visibility,
      maxItems: context.maxItems,
      generatedAt: context.generatedAt,
      videoAssetHashPrefix: context.videoAssetHashPrefix,
      readiness: {
        v081PilotReady: context.readiness.runtimeReady,
        v082RuntimeAdapterReady: context.readiness.runtimeReady,
        tokenProviderReady: context.readiness.tokenProviderReady,
        uploadScopeReady: context.readiness.uploadScopeReady,
        videoAssetReady: context.readiness.videoAssetReady,
        uploadPackageReady: context.readiness.uploadPackageReady,
        duplicateGuardReady: context.readiness.duplicateGuardReady,
        disclosureGuardReady: context.readiness.disclosureEvidenceReady,
        affiliateEvidenceReady: context.readiness.affiliateEvidenceReady,
        targetChannelEvidenceReady: context.readiness.targetChannelEvidenceReady,
        metadataReady: context.readiness.metadataReady,
        quotaReady: context.readiness.quotaReady
      }
    },
    blockers: [...new Set(blockers)]
  };
}

function buildPrepareBlockers(input: {
  v088ResolverStatus: V084PrivateUploadPilotResolverStatus;
  v087BinderStatus: V084PrivateUploadPilotBinderStatus;
  v085BinderStatus: V084PrivateUploadPilotBinderStatus;
  queueItemId: string | null;
  uploadPackageId: string | null;
  readiness: V095PrivatePilotExecutionReadiness;
}) {
  const blockers: V095PrivatePilotExecutionContextBlocker[] = [];
  if (input.v088ResolverStatus !== "bound") blockers.push("BLOCKED_V095_V088_RESOLVER_NOT_BOUND");
  if (input.v087BinderStatus !== "ready_for_fresh_approval") blockers.push("BLOCKED_V095_V087_BINDER_NOT_READY");
  if (input.v085BinderStatus !== "ready_for_fresh_approval") blockers.push("BLOCKED_V095_V085_BINDER_NOT_READY");
  if (!input.queueItemId) blockers.push("BLOCKED_V095_QUEUE_ITEM_ID_MISSING");
  if (!input.uploadPackageId) blockers.push("BLOCKED_V095_UPLOAD_PACKAGE_ID_MISSING");
  if (!Object.values(input.readiness).every(Boolean)) blockers.push("BLOCKED_V095_READINESS_NOT_READY");
  return [...new Set(blockers)];
}

function buildReadiness(report: V085PrivatePilotInputBindingReport): V095PrivatePilotExecutionReadiness {
  return {
    runtimeReady: report.runtimeReady,
    tokenProviderReady: report.tokenProviderReady,
    uploadScopeReady: report.uploadScopeReady,
    quotaReady: report.quotaReady,
    videoAssetReady: report.videoAssetReady,
    uploadPackageReady: report.uploadPackageIdPresent,
    affiliateEvidenceReady: report.affiliateEvidenceReady,
    disclosureEvidenceReady: report.disclosureEvidenceReady,
    duplicateGuardReady: report.duplicateGuardReady,
    targetChannelEvidenceReady: report.targetChannelEvidenceReady,
    metadataReady: report.runtimeReady
  };
}

async function resolveLocalV088Status(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  channelKey: ChannelKey;
}): Promise<V084PrivateUploadPilotResolverStatus> {
  const manifestPath = resolveProductSourceManifestPath(input);
  const manifest = await readJson(manifestPath);
  if (!manifest) return "missing";

  const channelKey = trimOrNull(readField(manifest, ["channelKey", "channel_key"]));
  const targetChannelKey = trimOrNull(readField(manifest, ["targetChannelKey", "target_channel_key"]));
  const rawCoupangUrl = trimOrNull(readField(manifest, ["rawCoupangUrl", "raw_coupang_url"]));
  const selectedAffiliateUrl = trimOrNull(readField(manifest, ["selectedAffiliateUrl", "selected_affiliate_url"]));
  return channelKey === input.channelKey &&
    targetChannelKey === input.channelKey &&
    isHttpsCoupangUrl(rawCoupangUrl) &&
    isHttpsCoupangAffiliateUrl(selectedAffiliateUrl)
    ? "bound"
    : "blocked";
}

function withDefaultProductSourceManifestPath(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  channelKey: ChannelKey;
}): NodeJS.ProcessEnv {
  if (trimOrNull(input.env.V087_PRODUCT_SOURCE_MANIFEST_PATH)) return input.env;

  return {
    ...input.env,
    V087_PRODUCT_SOURCE_MANIFEST_PATH: resolveProductSourceManifestPath(input)
  };
}

function resolveProductSourceManifestPath(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  channelKey: ChannelKey;
}) {
  return trimOrNull(input.env.V088_PRODUCT_SOURCE_MANIFEST_PATH) ??
    trimOrNull(input.env.V087_PRODUCT_SOURCE_MANIFEST_PATH) ??
    path.join(input.cwd, "commerce-assets", "review", "v057", input.channelKey, "product-source-v057.local.json");
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readContext(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function normalizeContext(value: unknown): V095PrivatePilotExecutionContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<V095PrivatePilotExecutionContext>;
  const channelKey = normalizeChannelKey(record.channelKey);
  const queueItemId = trimOrNull(record.queueItemId);
  const uploadPackageId = trimOrNull(record.uploadPackageId);
  const readiness = normalizeReadiness(record.readiness);
  if (
    record.version !== "v095" ||
    !channelKey ||
    !queueItemId ||
    !uploadPackageId ||
    record.v088ResolverStatus !== "bound" ||
    record.v087BinderStatus !== "ready_for_fresh_approval" ||
    record.v085BinderStatus !== "ready_for_fresh_approval" ||
    record.visibility !== "private" ||
    record.maxItems !== 1 ||
    !readiness
  ) {
    return null;
  }

  return {
    version: "v095",
    channelKey,
    queueItemId,
    uploadPackageId,
    v088ResolverStatus: "bound",
    v087BinderStatus: "ready_for_fresh_approval",
    v085BinderStatus: "ready_for_fresh_approval",
    visibility: "private",
    maxItems: 1,
    readiness,
    productSourceHashPrefix: trimOrNull(record.productSourceHashPrefix),
    videoAssetHashPrefix: trimOrNull(record.videoAssetHashPrefix),
    targetChannelHashPrefix: trimOrNull(record.targetChannelHashPrefix),
    generatedAt: trimOrNull(record.generatedAt) ?? new Date(0).toISOString(),
    contextCreatedAt: trimOrNull(record.contextCreatedAt) ?? new Date(0).toISOString(),
    contextExpiresAt: trimOrNull(record.contextExpiresAt) ?? new Date(0).toISOString()
  };
}

function normalizeReadiness(value: unknown): V095PrivatePilotExecutionReadiness | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Record<keyof V095PrivatePilotExecutionReadiness, unknown>>;
  const keys: Array<keyof V095PrivatePilotExecutionReadiness> = [
    "runtimeReady",
    "tokenProviderReady",
    "uploadScopeReady",
    "quotaReady",
    "videoAssetReady",
    "uploadPackageReady",
    "affiliateEvidenceReady",
    "disclosureEvidenceReady",
    "duplicateGuardReady",
    "targetChannelEvidenceReady",
    "metadataReady"
  ];
  if (!keys.every((key) => typeof record[key] === "boolean")) return null;
  return Object.fromEntries(keys.map((key) => [key, Boolean(record[key])])) as V095PrivatePilotExecutionReadiness;
}

function hasContextConflict(env: NodeJS.ProcessEnv, context: V095PrivatePilotExecutionContext) {
  return conflicts(env.V084_CHANNEL_KEY, context.channelKey) ||
    conflicts(env.V084_QUEUE_ITEM_ID, context.queueItemId) ||
    conflicts(env.V084_UPLOAD_PACKAGE_ID, context.uploadPackageId) ||
    conflicts(env.V084_V088_RESOLVER_STATUS, context.v088ResolverStatus) ||
    conflicts(env.V084_V087_BINDER_STATUS, context.v087BinderStatus) ||
    conflicts(env.V084_V085_BINDER_STATUS, context.v085BinderStatus) ||
    conflicts(env.V084_VISIBILITY, context.visibility) ||
    conflicts(env.V084_MAX_ITEMS, String(context.maxItems));
}

function conflicts(envValue: string | undefined, contextValue: string) {
  const normalized = trimOrNull(envValue);
  return Boolean(normalized && normalized !== contextValue);
}

function containsUnsafeEvidence(value: unknown): boolean {
  const stack = [value];
  const unsafeKeys = new Set([
    "approvalphrase",
    "rawcoupangurl",
    "raw_coupang_url",
    "selectedaffiliateurl",
    "selected_affiliate_url",
    "affiliateurl",
    "affiliate_url",
    "youtubevideoid",
    "youtube_video_id",
    "youtubechannelid",
    "youtube_channel_id",
    "targetchannelid",
    "target_channel_id",
    "token",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "secret",
    "client_secret",
    "authorization",
    "hmac"
  ]);

  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (current && typeof current === "object") {
      for (const [key, nested] of Object.entries(current)) {
        if (unsafeKeys.has(key.toLowerCase())) return true;
        stack.push(nested);
      }
      continue;
    }
    if (typeof current === "string" && isUnsafeString(current)) return true;
  }

  return false;
}

function isUnsafeString(value: string) {
  return /^https?:\/\//i.test(value) ||
    /^UC[A-Za-z0-9_-]{22}$/.test(value) ||
    /^APPROVE_/i.test(value) ||
    /(?:access|refresh)[-_ ]?token/i.test(value) ||
    /authorization|bearer|hmac|client_secret|secret/i.test(value);
}

function buildReport(input: {
  selectedChannelKey: ChannelKey;
  contextPathLabel: string;
  localContextWritten: boolean;
  v088ResolverStatus: V084PrivateUploadPilotResolverStatus;
  v087BinderStatus: V084PrivateUploadPilotBinderStatus;
  v085BinderStatus: V084PrivateUploadPilotBinderStatus;
  queueItemId: string | null;
  uploadPackageId: string | null;
  readiness: V095PrivatePilotExecutionReadiness;
  productSourceHashPrefix: string | null;
  videoAssetHashPrefix: string | null;
  targetChannelHashPrefix: string | null;
  blockers: V095PrivatePilotExecutionContextBlocker[];
}): V095PrivatePilotExecutionContextReport {
  const blockers = [...new Set(input.blockers)];
  return {
    version: "v095",
    status: blockers.length === 0 && input.localContextWritten ? "context_ready" : "blocked",
    mode: "private_pilot_execution_context_no_upload",
    selectedChannelKey: input.selectedChannelKey,
    contextPathLabel: input.contextPathLabel,
    localContextWritten: input.localContextWritten,
    contextExpiresAtPresent: input.localContextWritten,
    v088ResolverStatus: input.v088ResolverStatus,
    v087BinderStatus: input.v087BinderStatus,
    v085BinderStatus: input.v085BinderStatus,
    queueItemIdPresent: Boolean(input.queueItemId),
    uploadPackageIdPresent: Boolean(input.uploadPackageId),
    readiness: input.readiness,
    productSourceHashPrefix: input.productSourceHashPrefix,
    videoAssetHashPrefix: input.videoAssetHashPrefix,
    targetChannelHashPrefix: input.targetChannelHashPrefix,
    blockers,
    approvalPhraseStored: false,
    rawEvidenceStored: false,
    uploadExecuteCalled: false,
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
      approvalPhrasePrinted: false,
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

function resolveContextPath(cwd: string, filePath: string | null | undefined) {
  const requestedPath = filePath ?? DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH;
  const absolutePath = path.resolve(cwd, requestedPath);
  const protectedRoot = path.resolve(cwd, "commerce-assets", "review", "v057", "father_jobs");
  const relativeToRoot = path.relative(protectedRoot, absolutePath);
  const safe = !containsPathTraversal(requestedPath) &&
    Boolean(relativeToRoot) &&
    !relativeToRoot.startsWith("..") &&
    !path.isAbsolute(relativeToRoot);

  return {
    absolutePath,
    safe
  };
}

function containsPathTraversal(filePath: string) {
  return filePath.split(/[\\/]+/).includes("..");
}

function readTargetChannelId(env: NodeJS.ProcessEnv, channelKey: ChannelKey) {
  switch (channelKey) {
    case "father_jobs":
      return trimOrNull(env.YOUTUBE_FATHER_JOBS_CHANNEL_ID);
    case "neoman_moleulgeol":
      return trimOrNull(env.YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID);
    case "lets_buy":
      return trimOrNull(env.YOUTUBE_LETS_BUY_CHANNEL_ID);
  }
}

function readField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isHttpsCoupangUrl(value: string | null | undefined) {
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

function isHttpsCoupangAffiliateUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "link.coupang.com" &&
      !url.hostname.includes("example");
  } catch {
    return false;
  }
}

function normalizeV087Status(report: V087AuthoritativeProductSourceBindingReport): V084PrivateUploadPilotBinderStatus {
  return report.status === "ready_for_fresh_approval" ? "ready_for_fresh_approval" : "blocked";
}

function normalizeV085Status(report: V085PrivatePilotInputBindingReport): V084PrivateUploadPilotBinderStatus {
  return report.status === "ready_for_fresh_approval" ? "ready_for_fresh_approval" : "blocked";
}

function normalizeChannelKey(value: unknown): ChannelKey {
  return value === "neoman_moleulgeol" || value === "lets_buy" ? value : "father_jobs";
}

function trimOrNull(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashPrefix(value: string | null | undefined) {
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 10) : null;
}
