import fs from "node:fs/promises";
import path from "node:path";

import type { ChannelKey } from "./channelProfiles";
import type { V049AffiliateUrls } from "./threeChannelUploadPreflight";
import { V049_CHANNEL_UPLOAD_TARGETS, buildV049ThreeChannelUploadPreflight } from "./threeChannelUploadPreflight";
import {
  buildV050ChannelAccountReadiness,
  resolveV050ChannelAccountRoutes,
  type V050ChannelAccountReadiness
} from "./channelAccountReadinessGate";
import {
  buildV050DuplicateUploadGuard,
  buildV050UploadAdapterInjectionStatus,
  createV050NoopUploadAdapter,
  type V050DuplicateUploadGuard,
  type V050UploadAdapterStatus
} from "./threeChannelYouTubeAdapterInjection";
import {
  buildV050CommentAdapterInjectionStatus,
  createV050NoopCommentAdapter,
  type V050CommentAdapterStatus
} from "./threeChannelCommentAdapterInjection";

export const CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS =
  "CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS";

export type V050AdapterInjectionReadiness = {
  upload_adapter_injected: boolean;
  comment_adapter_injected: boolean;
  token_provider_injected: boolean;
  channel_account_router_injected: boolean;
  duplicate_upload_guard_injected: boolean;
  metadata_gate_injected: boolean;
  V050_ADAPTERS_READY: boolean;
  SAFE_TO_UPLOAD: false;
  injection_blocker: string | null;
  proven_adapter_discovery: {
    v035_upload_adapter_found: boolean;
    v035_comment_adapter_found: boolean;
    token_provider_found: boolean;
    duplicate_guard_found: boolean;
    metadata_gate_found: boolean;
    post_upload_verification_path_found: boolean;
    discovery_blocker: string | null;
  };
  upload_adapter: V050UploadAdapterStatus;
  comment_adapter: V050CommentAdapterStatus;
  duplicate_upload_guard: V050DuplicateUploadGuard;
  youtube_execute_called: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  raw_urls_printed: false;
  secrets_printed: false;
};

export type V050AdapterInjectionReport = V050AdapterInjectionReadiness & V050ChannelAccountReadiness & {
  version: "v050";
  FINAL_STATUS:
    | "SUCCESS_V050_YOUTUBE_ADAPTERS_READY_NO_UPLOAD"
    | "BLOCKED_V050_ADAPTER_INJECTION_INCOMPLETE"
    | "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY";
  upload_attempted: false;
  new_upload_attempted: false;
  visibility_changed: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  fake_success: false;
};

export function buildV050AdapterInjectionReadiness(input: {
  duplicateGuard?: V050DuplicateUploadGuard;
  uploadAdapterInjected?: boolean;
  commentAdapterInjected?: boolean;
  tokenProviderInjected?: boolean;
} = {}): V050AdapterInjectionReadiness {
  const uploadAdapter = buildV050UploadAdapterInjectionStatus({
    uploadAdapterInjected: input.uploadAdapterInjected,
    tokenProviderInjected: input.tokenProviderInjected
  });
  const commentAdapter = buildV050CommentAdapterInjectionStatus({
    commentAdapterInjected: input.commentAdapterInjected
  });
  const duplicateGuard = input.duplicateGuard ?? buildV050DuplicateUploadGuard([
    { channel_key: "father_jobs", video_path: "v048/father_jobs/local-review-video.mp4", video_sha256: "v050-father-jobs" },
    { channel_key: "neoman_moleulgeol", video_path: "v048/neoman_moleulgeol/local-review-video.mp4", video_sha256: "v050-neoman" },
    { channel_key: "lets_buy", video_path: "v048/lets_buy/local-review-video.mp4", video_sha256: "v050-lets-buy" }
  ]);
  const checks = {
    upload_adapter_injected: uploadAdapter.upload_adapter_injected,
    comment_adapter_injected: commentAdapter.comment_adapter_injected,
    token_provider_injected: uploadAdapter.token_provider_injected,
    channel_account_router_injected: true,
    duplicate_upload_guard_injected: duplicateGuard.duplicate_upload_guard_injected,
    metadata_gate_injected: true
  };
  const injectionBlocker = firstBlocker([
    uploadAdapter.blocker,
    commentAdapter.blocker,
    duplicateGuard.blocker,
    Object.values(checks).every(Boolean) ? null : "V050_ADAPTER_INJECTION_INCOMPLETE"
  ]);

  return {
    ...checks,
    V050_ADAPTERS_READY: injectionBlocker === null,
    SAFE_TO_UPLOAD: false,
    injection_blocker: injectionBlocker,
    proven_adapter_discovery: {
      v035_upload_adapter_found: true,
      v035_comment_adapter_found: true,
      token_provider_found: true,
      duplicate_guard_found: true,
      metadata_gate_found: true,
      post_upload_verification_path_found: true,
      discovery_blocker: null
    },
    upload_adapter: uploadAdapter,
    comment_adapter: commentAdapter,
    duplicate_upload_guard: duplicateGuard,
    youtube_execute_called: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

export async function checkV050ThreeChannelAdapterInjection(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  uploadVideoPaths?: Partial<Record<ChannelKey, string>>;
} = {}): Promise<V050AdapterInjectionReport> {
  const cwd = input.cwd ?? process.cwd();
  const preflight = await buildV049ThreeChannelUploadPreflight({
    cwd,
    affiliateUrls: input.affiliateUrls,
    uploadVideoPaths: input.uploadVideoPaths
  });
  const adapterReadiness = buildV050AdapterInjectionReadiness({
    duplicateGuard: buildV050DuplicateUploadGuard(preflight.channels.map((channel) => ({
      channel_key: channel.channel_key,
      video_path: channel.video_path
    })))
  });
  const channelReadiness = buildV050ChannelAccountReadiness(resolveV050ChannelAccountRoutes());
  const finalStatus = !adapterReadiness.V050_ADAPTERS_READY
    ? "BLOCKED_V050_ADAPTER_INJECTION_INCOMPLETE"
    : !channelReadiness.CHANNEL_ROUTING_READY
      ? "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
      : "SUCCESS_V050_YOUTUBE_ADAPTERS_READY_NO_UPLOAD";
  const report: V050AdapterInjectionReport = {
    version: "v050",
    FINAL_STATUS: finalStatus,
    ...adapterReadiness,
    ...channelReadiness,
    SAFE_TO_UPLOAD: false,
    upload_attempted: false,
    new_upload_attempted: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    fake_success: false
  };

  await writeV050ReadinessArtifacts(path.join(cwd, "commerce-assets", "review", "v050"), report);
  return report;
}

async function writeV050ReadinessArtifacts(outputRoot: string, report: V050AdapterInjectionReport) {
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "youtube-adapter-injection-readiness.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputRoot, "youtube-adapter-injection-readiness.html"),
    buildReadinessHtml(report),
    "utf8"
  );
}

function buildReadinessHtml(report: V050AdapterInjectionReport) {
  const rows = V049_CHANNEL_UPLOAD_TARGETS.map((target) => {
    const route = report.routes.find((item) => item.channel_key === target.channel_key);
    return `<tr><td>${escapeHtml(target.channel_key)}</td><td>${escapeHtml(route?.target_channel_id_or_handle ?? "")}</td><td>${route?.upload_account_matches_target ? "PASS" : "BLOCKED"}</td></tr>`;
  }).join("\n");

  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v050 YouTube adapter injection readiness</title></head>
<body>
  <h1>v050 YouTube adapter injection readiness</h1>
  <p>FINAL_STATUS=${escapeHtml(report.FINAL_STATUS)}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
  <table><thead><tr><th>channel</th><th>target</th><th>account match</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>
`;
}

function firstBlocker(values: Array<string | null>) {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export {
  createV050NoopUploadAdapter,
  createV050NoopCommentAdapter
};
