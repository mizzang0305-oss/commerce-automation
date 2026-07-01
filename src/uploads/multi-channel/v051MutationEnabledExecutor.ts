import fs from "node:fs/promises";
import path from "node:path";

import type { ChannelKey } from "./channelProfiles";
import {
  buildV049ExecutionCommentText
} from "./threeChannelUploadExecutor";
import type { V049AffiliateUrls, V049ChannelPreflight } from "./threeChannelUploadPreflight";
import {
  buildV051UploadPreflight,
  type V051UploadPreflightReport
} from "./v051ApprovalAliasWrapper";
import {
  DEFAULT_V051_EXECUTION_MODE,
  resolveV051ExecutionMode,
  type V051ExecutionMode
} from "./v051ExecutionMode";
import {
  evaluateV051MutationSafetyGate,
  type V051MutationBlocker
} from "./v051MutationSafetyGate";

export type V051MutationUploadAdapter = {
  uploadPublicShorts(input: {
    channelKey: ChannelKey;
    videoPath: string;
    title: string;
    description: string;
    madeForKids: false;
    containsPaidPromotion: true;
    visibility: "public";
  }): Promise<{
    videoId: string;
    visibility?: "public" | "private" | "unlisted";
    ambiguous?: boolean;
    blockedReason?: V051MutationBlocker;
    videosInsertCalled?: boolean;
  }>;
};

export type V051MutationCommentAdapter = {
  createTopLevelComment(input: {
    channelKey: ChannelKey;
    videoId: string;
    commentTextWithAffiliateUrl: string;
  }): Promise<{
    commentId: string;
    ambiguous?: boolean;
    blockedReason?: V051MutationBlocker;
    commentMutationCalled?: boolean;
  }>;
};

export type V051MutationExecutorAdapters = {
  uploadAdapter?: V051MutationUploadAdapter;
  commentAdapter?: V051MutationCommentAdapter;
};

export type V051MutationSafetyOverrides = {
  channelRoutingReady?: boolean;
  duplicateUploadRisk?: boolean;
  metadataGateReady?: boolean;
};

export type V051MutationChannelResult = {
  channel_key: ChannelKey;
  uploaded: boolean;
  youtube_video_id: string | null;
  visibility: "public" | "not_uploaded";
  comment_created: boolean;
  comment_id: string | null;
  blocker: string | null;
};

export type V051MutationExecutionReport = {
  version: "v053";
  FINAL_STATUS:
    | "SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD"
    | "SUCCESS_V051_THREE_CHANNEL_PUBLIC_UPLOADS_DONE"
    | "BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR"
    | "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY";
  V051_MUTATION_EXECUTOR_READY: boolean;
  SAFE_TO_UPLOAD: false;
  execution_mode: V051ExecutionMode;
  default_mode: typeof DEFAULT_V051_EXECUTION_MODE;
  execution_mode_added: true;
  mutation_enabled_supported: true;
  check_only_blocks_upload: true;
  dry_run_blocks_upload: true;
  mutation_mode_requires_fresh_approval: true;
  upload_adapter_callable_in_mutation_mode: boolean;
  comment_adapter_callable_after_upload_success: boolean;
  channel_routing_gate_required: true;
  duplicate_upload_guard_required: true;
  metadata_gate_required: true;
  paid_promotion_confirmation_required: true;
  mutation_blocker: V051MutationBlocker | null;
  mutation_wiring_blocker: V051MutationBlocker | null;
  preflight: V051UploadPreflightReport;
  father_jobs_uploaded: boolean;
  father_jobs_video_id: string | null;
  father_jobs_visibility: "public" | "not_uploaded";
  father_jobs_comment_created: boolean;
  father_jobs_comment_id: string | null;
  neoman_moleulgeol_uploaded: boolean;
  neoman_moleulgeol_video_id: string | null;
  neoman_moleulgeol_visibility: "public" | "not_uploaded";
  neoman_moleulgeol_comment_created: boolean;
  neoman_moleulgeol_comment_id: string | null;
  lets_buy_uploaded: boolean;
  lets_buy_video_id: string | null;
  lets_buy_visibility: "public" | "not_uploaded";
  lets_buy_comment_created: boolean;
  lets_buy_comment_id: string | null;
  videos_insert_total_count: number;
  comment_create_total_count: number;
  retry_loop_after_external_call: false;
  youtube_execute_called: boolean;
  videos_insert_called: boolean;
  upload_execution_attempted: boolean;
  new_upload_attempted: boolean;
  comment_create_update_delete_called: boolean;
  visibility_changed: false;
  visibility_changed_existing_video: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  private_upload: false;
  unlisted_upload: false;
  duplicate_upload_detected: false;
  duplicate_comment_detected: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
  channels: V051MutationChannelResult[];
};

const CHANNEL_ORDER: ChannelKey[] = ["father_jobs", "neoman_moleulgeol", "lets_buy"];

export async function executeV051MutationEnabledUploads(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  approvalText?: string;
  executionMode?: V051ExecutionMode | string | null;
  adapters?: V051MutationExecutorAdapters;
  safetyOverrides?: V051MutationSafetyOverrides;
} = {}): Promise<V051MutationExecutionReport> {
  const cwd = input.cwd ?? process.cwd();
  const executionMode = resolveV051ExecutionMode(input.executionMode ?? process.env.V051_EXECUTION_MODE);
  const preflight = await buildV051UploadPreflight({
    cwd,
    affiliateUrls: input.affiliateUrls,
    approvalText: input.approvalText
  });
  const gate = evaluateV051MutationSafetyGate({
    executionMode,
    preflight,
    uploadAdapterInjected: Boolean(input.adapters?.uploadAdapter),
    commentAdapterInjected: Boolean(input.adapters?.commentAdapter),
    channelRoutingReady: input.safetyOverrides?.channelRoutingReady,
    duplicateUploadRisk: input.safetyOverrides?.duplicateUploadRisk,
    metadataGateReady: input.safetyOverrides?.metadataGateReady
  });
  const initialReport = buildBaseReport({
    executionMode,
    preflight,
    mutationBlocker: gate.mutation_blocker,
    uploadAdapterCallable: executionMode === "mutation_enabled" && Boolean(input.adapters?.uploadAdapter),
    commentAdapterCallable: false
  });

  if (!gate.mutation_mode_allowed) {
    await writeV053Artifacts(cwd, initialReport);
    return initialReport;
  }

  const uploadAdapter = input.adapters?.uploadAdapter;
  const commentAdapter = input.adapters?.commentAdapter;
  if (!uploadAdapter || !commentAdapter) {
    const blocked = {
      ...initialReport,
      FINAL_STATUS: "BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR" as const,
      mutation_blocker: "V051_MUTATION_ADAPTERS_NOT_INJECTED" as const,
      mutation_wiring_blocker: "V051_MUTATION_ADAPTERS_NOT_INJECTED" as const,
      V051_MUTATION_EXECUTOR_READY: false
    };
    await writeV053Artifacts(cwd, blocked);
    return blocked;
  }

  const mutableReport = {
    ...initialReport,
    mutation_blocker: null,
    mutation_wiring_blocker: null,
    upload_adapter_callable_in_mutation_mode: true,
    upload_execution_attempted: true,
    new_upload_attempted: true
  };

  for (const channelKey of CHANNEL_ORDER) {
    const channel = findChannel(preflight, channelKey);
    const uploadResult = await uploadAdapter.uploadPublicShorts({
      channelKey,
      videoPath: channel.video_path,
      title: channel.title,
      description: channel.description,
      madeForKids: false,
      containsPaidPromotion: true,
      visibility: "public"
    });
    const explicitVideosInsertCall = uploadResult.videosInsertCalled === true;
    if (explicitVideosInsertCall || (uploadResult.videosInsertCalled === undefined && Boolean(uploadResult.videoId.trim() || uploadResult.ambiguous))) {
      mutableReport.videos_insert_total_count += 1;
    }
    if (explicitVideosInsertCall) {
      mutableReport.youtube_execute_called = true;
      mutableReport.videos_insert_called = true;
    }

    if (uploadResult.blockedReason) {
      setChannelBlocker(mutableReport, channelKey, uploadResult.blockedReason);
      return await blocked(cwd, mutableReport, uploadResult.blockedReason);
    }
    if (uploadResult.ambiguous) {
      setChannelBlocker(mutableReport, channelKey, "AMBIGUOUS_UPLOAD_RESULT_AFTER_EXTERNAL_CALL");
      return await blocked(cwd, mutableReport, "AMBIGUOUS_UPLOAD_RESULT_AFTER_EXTERNAL_CALL");
    }
    if (uploadResult.visibility && uploadResult.visibility !== "public") {
      setChannelBlocker(mutableReport, channelKey, "NON_PUBLIC_UPLOAD_RESULT_REJECTED");
      return await blocked(cwd, mutableReport, "NON_PUBLIC_UPLOAD_RESULT_REJECTED");
    }
    if (!uploadResult.videoId.trim()) {
      setChannelBlocker(mutableReport, channelKey, "UPLOAD_RESULT_VIDEO_ID_MISSING");
      return await blocked(cwd, mutableReport, "UPLOAD_RESULT_VIDEO_ID_MISSING");
    }

    setUploaded(mutableReport, channelKey, uploadResult.videoId.trim());
    const commentResult = await commentAdapter.createTopLevelComment({
      channelKey,
      videoId: uploadResult.videoId.trim(),
      commentTextWithAffiliateUrl: buildV049ExecutionCommentText({
        channelKey,
        affiliateUrl: input.affiliateUrls?.[channelKey] ?? ""
      })
    });
    const explicitCommentMutation = commentResult.commentMutationCalled === true;
    if (explicitCommentMutation || (commentResult.commentMutationCalled === undefined && Boolean(commentResult.commentId.trim() || commentResult.ambiguous))) {
      mutableReport.comment_create_total_count += 1;
    }
    if (explicitCommentMutation) {
      mutableReport.comment_create_update_delete_called = true;
    }
    mutableReport.comment_adapter_callable_after_upload_success = true;

    if (commentResult.blockedReason) {
      setChannelBlocker(mutableReport, channelKey, commentResult.blockedReason);
      return await blocked(cwd, mutableReport, commentResult.blockedReason);
    }
    if (commentResult.ambiguous) {
      setChannelBlocker(mutableReport, channelKey, "AMBIGUOUS_COMMENT_RESULT_AFTER_EXTERNAL_CALL");
      return await blocked(cwd, mutableReport, "AMBIGUOUS_COMMENT_RESULT_AFTER_EXTERNAL_CALL");
    }

    setCommentCreated(mutableReport, channelKey, commentResult.commentId);
  }

  const completedReport: V051MutationExecutionReport = {
    ...mutableReport,
    FINAL_STATUS: mutableReport.videos_insert_called || mutableReport.comment_create_update_delete_called
      ? "SUCCESS_V051_THREE_CHANNEL_PUBLIC_UPLOADS_DONE"
      : mutableReport.FINAL_STATUS
  };
  await writeV053Artifacts(cwd, completedReport);
  return completedReport;
}

function buildBaseReport(input: {
  executionMode: V051ExecutionMode;
  preflight: V051UploadPreflightReport;
  mutationBlocker: V051MutationBlocker | null;
  uploadAdapterCallable: boolean;
  commentAdapterCallable: boolean;
}): V051MutationExecutionReport {
  const channels = CHANNEL_ORDER.map((channelKey) => ({
    channel_key: channelKey,
    uploaded: false,
    youtube_video_id: null,
    visibility: "not_uploaded" as const,
    comment_created: false,
    comment_id: null,
    blocker: null
  }));
  const blockedByRouting = input.mutationBlocker === "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY";
  const hardBlocked = input.mutationBlocker !== null &&
    input.mutationBlocker !== "CHECK_ONLY_NO_UPLOAD" &&
    input.mutationBlocker !== "DRY_RUN_NO_UPLOAD";

  return {
    version: "v053",
    FINAL_STATUS: blockedByRouting
      ? "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
      : hardBlocked
        ? "BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR"
        : "SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD",
    V051_MUTATION_EXECUTOR_READY: !hardBlocked,
    SAFE_TO_UPLOAD: false,
    execution_mode: input.executionMode,
    default_mode: DEFAULT_V051_EXECUTION_MODE,
    execution_mode_added: true,
    mutation_enabled_supported: true,
    check_only_blocks_upload: true,
    dry_run_blocks_upload: true,
    mutation_mode_requires_fresh_approval: true,
    upload_adapter_callable_in_mutation_mode: input.uploadAdapterCallable,
    comment_adapter_callable_after_upload_success: input.commentAdapterCallable,
    channel_routing_gate_required: true,
    duplicate_upload_guard_required: true,
    metadata_gate_required: true,
    paid_promotion_confirmation_required: true,
    mutation_blocker: input.mutationBlocker,
    mutation_wiring_blocker: input.mutationBlocker,
    preflight: input.preflight,
    father_jobs_uploaded: false,
    father_jobs_video_id: null,
    father_jobs_visibility: "not_uploaded",
    father_jobs_comment_created: false,
    father_jobs_comment_id: null,
    neoman_moleulgeol_uploaded: false,
    neoman_moleulgeol_video_id: null,
    neoman_moleulgeol_visibility: "not_uploaded",
    neoman_moleulgeol_comment_created: false,
    neoman_moleulgeol_comment_id: null,
    lets_buy_uploaded: false,
    lets_buy_video_id: null,
    lets_buy_visibility: "not_uploaded",
    lets_buy_comment_created: false,
    lets_buy_comment_id: null,
    videos_insert_total_count: 0,
    comment_create_total_count: 0,
    retry_loop_after_external_call: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    upload_execution_attempted: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    visibility_changed_existing_video: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    private_upload: false,
    unlisted_upload: false,
    duplicate_upload_detected: false,
    duplicate_comment_detected: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    channels
  };
}

async function blocked(
  cwd: string,
  report: V051MutationExecutionReport,
  blocker: V051MutationBlocker
) {
  const nextReport: V051MutationExecutionReport = {
    ...report,
    FINAL_STATUS: blocker === "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
      ? "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
      : "BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR",
    V051_MUTATION_EXECUTOR_READY: false,
    mutation_blocker: blocker,
    mutation_wiring_blocker: blocker
  };
  await writeV053Artifacts(cwd, nextReport);
  return nextReport;
}

function findChannel(preflight: V051UploadPreflightReport, channelKey: ChannelKey): V049ChannelPreflight {
  const channel = preflight.preflight?.channels.find((item) => item.channel_key === channelKey);
  if (!channel) throw new Error(`Missing v051 preflight channel: ${channelKey}`);
  return channel;
}

function setUploaded(report: V051MutationExecutionReport, channelKey: ChannelKey, videoId: string) {
  const channel = report.channels.find((item) => item.channel_key === channelKey);
  if (channel) {
    channel.uploaded = true;
    channel.youtube_video_id = videoId;
    channel.visibility = "public";
  }
  assignChannelFields(report, channelKey, {
    uploaded: true,
    videoId,
    visibility: "public"
  });
}

function setCommentCreated(report: V051MutationExecutionReport, channelKey: ChannelKey, commentId: string) {
  const channel = report.channels.find((item) => item.channel_key === channelKey);
  if (channel) {
    channel.comment_created = true;
    channel.comment_id = commentId;
  }
  assignChannelFields(report, channelKey, {
    commentCreated: true,
    commentId
  });
}

function setChannelBlocker(report: V051MutationExecutionReport, channelKey: ChannelKey, blocker: string) {
  const channel = report.channels.find((item) => item.channel_key === channelKey);
  if (channel) channel.blocker = blocker;
}

function assignChannelFields(
  report: V051MutationExecutionReport,
  channelKey: ChannelKey,
  values: {
    uploaded?: boolean;
    videoId?: string;
    visibility?: "public" | "not_uploaded";
    commentCreated?: boolean;
    commentId?: string;
  }
) {
  const prefix = channelKey;
  if (values.uploaded !== undefined) {
    report[`${prefix}_uploaded` as keyof V051MutationExecutionReport] = values.uploaded as never;
  }
  if (values.videoId !== undefined) {
    report[`${prefix}_video_id` as keyof V051MutationExecutionReport] = values.videoId as never;
  }
  if (values.visibility !== undefined) {
    report[`${prefix}_visibility` as keyof V051MutationExecutionReport] = values.visibility as never;
  }
  if (values.commentCreated !== undefined) {
    report[`${prefix}_comment_created` as keyof V051MutationExecutionReport] = values.commentCreated as never;
  }
  if (values.commentId !== undefined) {
    report[`${prefix}_comment_id` as keyof V051MutationExecutionReport] = values.commentId as never;
  }
}

async function writeV053Artifacts(cwd: string, report: V051MutationExecutionReport) {
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v053");
  await fs.mkdir(outputRoot, { recursive: true });
  const sanitized = sanitizeReport(report);
  await fs.writeFile(path.join(outputRoot, "v051-mutation-enabled-execute.json"), `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outputRoot, "v051-mutation-enabled-execute.html"), buildHtmlReport(sanitized), "utf8");
}

function sanitizeReport(report: V051MutationExecutionReport): V051MutationExecutionReport {
  return JSON.parse(JSON.stringify(report)) as V051MutationExecutionReport;
}

function buildHtmlReport(report: V051MutationExecutionReport) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v053 mutation-enabled v051 executor</title></head>
<body>
  <h1>v053 mutation-enabled v051 executor</h1>
  <p>FINAL_STATUS=${escapeHtml(report.FINAL_STATUS)}</p>
  <p>V051_MUTATION_EXECUTOR_READY=${report.V051_MUTATION_EXECUTOR_READY}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>execution_mode=${escapeHtml(report.execution_mode)}</p>
  <p>mutation_blocker=${escapeHtml(report.mutation_blocker ?? "")}</p>
  <p>videos_insert_called=${report.videos_insert_called}</p>
  <p>comment_create_update_delete_called=${report.comment_create_update_delete_called}</p>
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
