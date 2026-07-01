import fs from "node:fs/promises";
import path from "node:path";

import {
  V049_PAID_PROMOTION_CONFIRMATION_PHRASE
} from "./paidPromotionSettingsGate";
import {
  V049_UPLOAD_APPROVAL_PHRASE,
  buildV049ThreeChannelUploadPreflight,
  type V049AffiliateUrls,
  type V049PreflightReport
} from "./threeChannelUploadPreflight";
import {
  executeV049ThreeChannelPublicUploads,
  type V049UploadExecutionResult
} from "./threeChannelUploadExecutor";
import {
  checkV050ThreeChannelAdapterInjection,
  createV050NoopCommentAdapter,
  createV050NoopUploadAdapter,
  type V050AdapterInjectionReport
} from "./v050ThreeChannelUploadExecutorWiring";

export const V051_UPLOAD_APPROVAL_PHRASE =
  "APPROVE_V051_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS";
export const V051_PAID_PROMOTION_CONFIRMATION_PHRASE =
  "CONFIRM_V051_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS";

type V051AliasFinalStatus =
  | "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD"
  | "BLOCKED_V051_STALE_V049_APPROVAL_REJECTED"
  | "BLOCKED_V051_APPROVAL_ALIAS_MISSING";

type V051ReportFinalStatus =
  | V051AliasFinalStatus
  | "BLOCKED_V051_PREFLIGHT_NOT_READY"
  | "BLOCKED_V051_ADAPTERS_NOT_READY"
  | "BLOCKED_V051_CHANNEL_ROUTING_NOT_READY";

type V051ApprovalBlocker =
  | "V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051"
  | "V051_UPLOAD_APPROVAL_MISSING"
  | "V051_PAID_PROMOTION_CONFIRMATION_MISSING";

export type V051ApprovalAliasStatus = {
  version: "v052";
  FINAL_STATUS: V051AliasFinalStatus;
  V051_ALIAS_READY: boolean;
  SAFE_TO_UPLOAD: false;
  paid_promotion_confirmation_present: boolean;
  v051_upload_approval_present: boolean;
  v049_approval_phrase_present: boolean;
  v049_paid_promotion_phrase_present: boolean;
  v049_approval_phrases_rejected: true;
  approval_blocker: V051ApprovalBlocker | null;
  mapped_v049_approval_text_generated: boolean;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V051UploadPreflightReport = Omit<V051ApprovalAliasStatus, "FINAL_STATUS"> & {
  FINAL_STATUS: V051ReportFinalStatus;
  preflight_generated: boolean;
  adapter_check_generated: boolean;
  V049_UPLOAD_PREFLIGHT_READY: boolean;
  V050_ADAPTERS_READY: boolean;
  CHANNEL_ROUTING_READY: boolean;
  father_jobs_preflight_pass: boolean;
  neoman_moleulgeol_preflight_pass: boolean;
  lets_buy_preflight_pass: boolean;
  all_channel_preflight_pass: boolean;
  upload_adapter_injected: boolean;
  comment_adapter_injected: boolean;
  token_provider_injected: boolean;
  channel_account_router_injected: boolean;
  duplicate_upload_guard_injected: boolean;
  metadata_gate_injected: boolean;
  duplicate_upload_risk: boolean;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  comment_create_update_delete_called: false;
  upload_execution_attempted: false;
  new_upload_attempted: false;
  visibility_changed: false;
  visibility_changed_existing_video: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  preflight: V049PreflightReport | null;
  adapter_readiness: V050AdapterInjectionReport | null;
  blocker: string | null;
};

export type V051UploadExecutionReport = V051UploadPreflightReport & {
  execution_result: V049UploadExecutionResult | null;
  father_jobs_uploaded: boolean;
  father_jobs_video_id: string | null;
  father_jobs_comment_created: boolean;
  neoman_moleulgeol_uploaded: boolean;
  neoman_moleulgeol_video_id: string | null;
  neoman_moleulgeol_comment_created: boolean;
  lets_buy_uploaded: boolean;
  lets_buy_video_id: string | null;
  lets_buy_comment_created: boolean;
  retry_loop_after_external_call: boolean;
};

export function buildV051ApprovalAliasStatus(input: {
  approvalText?: string;
} = {}): V051ApprovalAliasStatus {
  const approvalText = String(input.approvalText ?? "");
  const v049ApprovalPresent = approvalText.includes(V049_UPLOAD_APPROVAL_PHRASE);
  const v049PaidPromotionPresent = approvalText.includes(V049_PAID_PROMOTION_CONFIRMATION_PHRASE);
  const v051ApprovalPresent = approvalText.includes(V051_UPLOAD_APPROVAL_PHRASE);
  const v051PaidPromotionPresent = approvalText.includes(V051_PAID_PROMOTION_CONFIRMATION_PHRASE);
  const blocker = firstBlocker<V051ApprovalBlocker>([
    v049ApprovalPresent || v049PaidPromotionPresent ? "V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051" : null,
    v051ApprovalPresent ? null : "V051_UPLOAD_APPROVAL_MISSING",
    v051PaidPromotionPresent ? null : "V051_PAID_PROMOTION_CONFIRMATION_MISSING"
  ]);
  const finalStatus: V051AliasFinalStatus = blocker === null
    ? "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD"
    : blocker === "V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051"
      ? "BLOCKED_V051_STALE_V049_APPROVAL_REJECTED"
      : "BLOCKED_V051_APPROVAL_ALIAS_MISSING";

  return {
    version: "v052",
    FINAL_STATUS: finalStatus,
    V051_ALIAS_READY: blocker === null,
    SAFE_TO_UPLOAD: false,
    paid_promotion_confirmation_present: v051PaidPromotionPresent,
    v051_upload_approval_present: v051ApprovalPresent,
    v049_approval_phrase_present: v049ApprovalPresent,
    v049_paid_promotion_phrase_present: v049PaidPromotionPresent,
    v049_approval_phrases_rejected: true,
    approval_blocker: blocker,
    mapped_v049_approval_text_generated: blocker === null,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export async function buildV051UploadPreflight(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  approvalText?: string;
} = {}): Promise<V051UploadPreflightReport> {
  const cwd = input.cwd ?? process.cwd();
  const alias = buildV051ApprovalAliasStatus({ approvalText: input.approvalText });
  if (!alias.V051_ALIAS_READY) {
    const report = buildBlockedPreflightReport(alias);
    await writeV051Artifacts(path.join(cwd, "commerce-assets", "review", "v052"), "v051-approval-alias-preflight", report);
    return report;
  }

  const preflight = await buildV049ThreeChannelUploadPreflight({
    cwd,
    affiliateUrls: input.affiliateUrls,
    approvalText: buildMappedV049ApprovalText()
  });
  const adapterReadiness = await checkV050ThreeChannelAdapterInjection({
    cwd,
    affiliateUrls: input.affiliateUrls
  });
  const finalStatus = determinePreflightFinalStatus(alias, preflight, adapterReadiness);
  const report: V051UploadPreflightReport = {
    ...alias,
    FINAL_STATUS: finalStatus,
    preflight_generated: true,
    adapter_check_generated: true,
    V049_UPLOAD_PREFLIGHT_READY: preflight.V049_UPLOAD_PREFLIGHT_READY,
    V050_ADAPTERS_READY: adapterReadiness.V050_ADAPTERS_READY,
    CHANNEL_ROUTING_READY: adapterReadiness.CHANNEL_ROUTING_READY,
    father_jobs_preflight_pass: preflight.father_jobs_preflight_pass,
    neoman_moleulgeol_preflight_pass: preflight.neoman_moleulgeol_preflight_pass,
    lets_buy_preflight_pass: preflight.lets_buy_preflight_pass,
    all_channel_preflight_pass: preflight.all_channel_preflight_pass,
    upload_adapter_injected: adapterReadiness.upload_adapter_injected,
    comment_adapter_injected: adapterReadiness.comment_adapter_injected,
    token_provider_injected: adapterReadiness.token_provider_injected,
    channel_account_router_injected: adapterReadiness.channel_account_router_injected,
    duplicate_upload_guard_injected: adapterReadiness.duplicate_upload_guard_injected,
    metadata_gate_injected: adapterReadiness.metadata_gate_injected,
    duplicate_upload_risk: preflight.duplicate_upload_risk || adapterReadiness.duplicate_upload_guard.duplicate_upload_risk,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    upload_execution_attempted: false,
    new_upload_attempted: false,
    visibility_changed: false,
    visibility_changed_existing_video: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    preflight,
    adapter_readiness: adapterReadiness,
    blocker: finalStatus === "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD"
      ? null
      : finalStatus
  };

  await writeV051Artifacts(path.join(cwd, "commerce-assets", "review", "v052"), "v051-approval-alias-preflight", report);
  return report;
}

export async function executeV051ThreeChannelPublicUploads(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  approvalText?: string;
} = {}): Promise<V051UploadExecutionReport> {
  const cwd = input.cwd ?? process.cwd();
  const alias = buildV051ApprovalAliasStatus({ approvalText: input.approvalText });
  if (!alias.V051_ALIAS_READY) {
    const report = buildBlockedExecutionReport(buildBlockedPreflightReport(alias));
    await writeV051Artifacts(path.join(cwd, "commerce-assets", "review", "v052"), "v051-approval-alias-execute", report);
    return report;
  }

  const preflight = await buildV051UploadPreflight({
    cwd,
    affiliateUrls: input.affiliateUrls,
    approvalText: input.approvalText
  });
  if (preflight.FINAL_STATUS !== "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD") {
    const report = buildBlockedExecutionReport(preflight);
    await writeV051Artifacts(path.join(cwd, "commerce-assets", "review", "v052"), "v051-approval-alias-execute", report);
    return report;
  }

  const executionResult = await executeV049ThreeChannelPublicUploads({
    cwd,
    affiliateUrls: input.affiliateUrls,
    approvalText: buildMappedV049ApprovalText(),
    executionMode: "check_only",
    deps: {
      uploadVideo: createV050NoopUploadAdapter(),
      createTopLevelComment: createV050NoopCommentAdapter()
    }
  });
  const report: V051UploadExecutionReport = {
    ...preflight,
    FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
    execution_result: executionResult,
    upload_execution_attempted: false,
    new_upload_attempted: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    father_jobs_uploaded: executionResult.father_jobs_uploaded,
    father_jobs_video_id: executionResult.father_jobs_video_id,
    father_jobs_comment_created: executionResult.father_jobs_comment_created,
    neoman_moleulgeol_uploaded: executionResult.neoman_moleulgeol_uploaded,
    neoman_moleulgeol_video_id: executionResult.neoman_moleulgeol_video_id,
    neoman_moleulgeol_comment_created: executionResult.neoman_moleulgeol_comment_created,
    lets_buy_uploaded: executionResult.lets_buy_uploaded,
    lets_buy_video_id: executionResult.lets_buy_video_id,
    lets_buy_comment_created: executionResult.lets_buy_comment_created,
    retry_loop_after_external_call: executionResult.retry_loop_after_external_call
  };

  await writeV051Artifacts(path.join(cwd, "commerce-assets", "review", "v052"), "v051-approval-alias-execute", report);
  return report;
}

function buildMappedV049ApprovalText() {
  return `${V049_UPLOAD_APPROVAL_PHRASE}\n${V049_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
}

function determinePreflightFinalStatus(
  alias: V051ApprovalAliasStatus,
  preflight: V049PreflightReport,
  adapterReadiness: V050AdapterInjectionReport
): V051ReportFinalStatus {
  if (!alias.V051_ALIAS_READY) return alias.FINAL_STATUS;
  if (!preflight.V049_UPLOAD_PREFLIGHT_READY) return "BLOCKED_V051_PREFLIGHT_NOT_READY";
  if (!adapterReadiness.V050_ADAPTERS_READY) return "BLOCKED_V051_ADAPTERS_NOT_READY";
  if (!adapterReadiness.CHANNEL_ROUTING_READY) return "BLOCKED_V051_CHANNEL_ROUTING_NOT_READY";
  return "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD";
}

function buildBlockedPreflightReport(alias: V051ApprovalAliasStatus): V051UploadPreflightReport {
  return {
    ...alias,
    FINAL_STATUS: alias.FINAL_STATUS,
    preflight_generated: false,
    adapter_check_generated: false,
    V049_UPLOAD_PREFLIGHT_READY: false,
    V050_ADAPTERS_READY: false,
    CHANNEL_ROUTING_READY: false,
    father_jobs_preflight_pass: false,
    neoman_moleulgeol_preflight_pass: false,
    lets_buy_preflight_pass: false,
    all_channel_preflight_pass: false,
    upload_adapter_injected: false,
    comment_adapter_injected: false,
    token_provider_injected: false,
    channel_account_router_injected: false,
    duplicate_upload_guard_injected: false,
    metadata_gate_injected: false,
    duplicate_upload_risk: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    upload_execution_attempted: false,
    new_upload_attempted: false,
    visibility_changed: false,
    visibility_changed_existing_video: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    preflight: null,
    adapter_readiness: null,
    blocker: alias.approval_blocker
  };
}

function buildBlockedExecutionReport(preflight: V051UploadPreflightReport): V051UploadExecutionReport {
  return {
    ...preflight,
    execution_result: null,
    father_jobs_uploaded: false,
    father_jobs_video_id: null,
    father_jobs_comment_created: false,
    neoman_moleulgeol_uploaded: false,
    neoman_moleulgeol_video_id: null,
    neoman_moleulgeol_comment_created: false,
    lets_buy_uploaded: false,
    lets_buy_video_id: null,
    lets_buy_comment_created: false,
    retry_loop_after_external_call: false
  };
}

async function writeV051Artifacts(outputRoot: string, basename: string, report: unknown) {
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputRoot, `${basename}.html`), buildHtmlReport(report), "utf8");
}

function buildHtmlReport(report: unknown) {
  const value = report as Record<string, unknown>;
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v052 v051 approval alias wrapper</title></head>
<body>
  <h1>v052 v051 approval alias wrapper</h1>
  <p>FINAL_STATUS=${escapeHtml(value.FINAL_STATUS)}</p>
  <p>V051_ALIAS_READY=${escapeHtml(value.V051_ALIAS_READY)}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
</body>
</html>
`;
}

function firstBlocker<T extends string>(values: Array<T | null>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
