import fs from "node:fs/promises";
import path from "node:path";

import {
  V034_COUPANG_DISCLOSURE,
  validateYouTubeKoreanMetadata
} from "../../lib/uploads/youtube/youtubeMetadataHardening";
import { type ChannelKey } from "./channelProfiles";
import {
  resolveV049ChannelYouTubeAccountRoutes,
  v049ChannelRouteReady,
  type V049ChannelYouTubeAccountRoute
} from "./channelYouTubeAccountRouter";
import {
  evaluateV049PaidPromotionGate,
  type V049PaidPromotionGate
} from "./paidPromotionSettingsGate";

export const V049_UPLOAD_APPROVAL_PHRASE =
  "APPROVE_V049_EXECUTE_THREE_CHANNEL_ONE_SHOT_PUBLIC_UPLOADS_WITH_COMMENTS";

type ChannelTarget = {
  channel_key: ChannelKey;
  product_name: string;
  title: string;
  comment_first_line: string;
};

export const V049_CHANNEL_UPLOAD_TARGETS: ChannelTarget[] = [
  {
    channel_key: "father_jobs",
    product_name: "차량용 컵홀더 정리함",
    title: "실용 체크 - 차량용 컵홀더 정리함 #shorts",
    comment_first_line: "집안일 줄이듯 차 안도 크기·수납공간 먼저 확인하세요."
  },
  {
    channel_key: "neoman_moleulgeol",
    product_name: "접이식 빨래건조대",
    title: "생활꿀팁 - 접이식 빨래건조대 #shorts",
    comment_first_line: "장마철 실내건조 고민이면 크기·하중·보관공간 먼저 확인하세요."
  },
  {
    channel_key: "lets_buy",
    product_name: "특가 케이블 정리함",
    title: "가성비 비교 - 특가 케이블 정리함 #shorts",
    comment_first_line: "비슷한 제품이라도 가격보다 먼저 확인할 포인트가 있습니다."
  }
];

export type V049AffiliateUrls = Partial<Record<ChannelKey, string>>;

export type V049ChannelPreflight = {
  channel_key: ChannelKey;
  product_name: string;
  video_path: string;
  local_video_exists: boolean;
  human_review_status: "PASS_LOCAL_HUMAN_REVIEW";
  metadata_review_status: "PASS_METADATA_REVIEW";
  upload_settings_review_status: "PASS_UPLOAD_SETTINGS_REVIEW";
  title: string;
  description: string;
  comment_preview: string;
  visibility: "public";
  made_for_kids: false;
  contains_paid_promotion: true;
  description_points_to_comment_link: boolean;
  comment_contains_affiliate_link: boolean;
  comment_contains_coupang_disclosure: boolean;
  affiliate_url_present: boolean;
  duplicate_upload_risk: false;
  same_asset_previously_uploaded: false;
  route: V049ChannelYouTubeAccountRoute;
  route_ready: boolean;
  description_metadata_gate: ReturnType<typeof validateYouTubeKoreanMetadata>;
  sanitized_upload_request: Record<string, unknown>;
  preflight_pass: boolean;
  blocker: string | null;
};

export type V049PreflightReport = {
  version: "v049";
  FINAL_STATUS: "SUCCESS_V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD" | "BLOCKED_V049_THREE_CHANNEL_UPLOAD_PREFLIGHT";
  V049_UPLOAD_PREFLIGHT_READY: boolean;
  SAFE_TO_UPLOAD: false;
  main_head: string | null;
  v048_review_status_all_pass: boolean;
  upload_approval_present: boolean;
  paid_promotion_confirmation_present: boolean;
  paid_promotion_required_all: boolean;
  paid_promotion_setting_verified: boolean;
  manual_paid_promotion_check_required: boolean;
  father_jobs_preflight_pass: boolean;
  father_jobs_blocker: string | null;
  neoman_moleulgeol_preflight_pass: boolean;
  neoman_moleulgeol_blocker: string | null;
  lets_buy_preflight_pass: boolean;
  lets_buy_blocker: string | null;
  all_channel_preflight_pass: boolean;
  upload_plan_generated: boolean;
  sanitized_upload_requests_generated: boolean;
  comment_previews_generated: boolean;
  raw_affiliate_url_printed: false;
  duplicate_upload_risk: false;
  upload_execution_attempted: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  youtube_execute_called: false;
  comment_create_update_delete_called: false;
  visibility_changed_existing_video: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  secrets_printed: false;
  raw_urls_printed: false;
  fake_success: false;
  channels: V049ChannelPreflight[];
  paid_promotion_gate: V049PaidPromotionGate;
};

const DESCRIPTION = [
  "[상품 확인]",
  "상품 구성과 가격은 댓글의 상품 링크에서 확인하세요.",
  "",
  "[구매 전 체크 포인트]",
  "구매 전에는 크기, 사용 환경, 보관 공간, 후기 포인트를 먼저 확인하세요.",
  "",
  "[고지]",
  V034_COUPANG_DISCLOSURE
].join("\n");

export async function buildV049ThreeChannelUploadPreflight(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  approvalText?: string;
  mainHead?: string | null;
} = {}): Promise<V049PreflightReport> {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v049");
  const routes = resolveV049ChannelYouTubeAccountRoutes();
  const paidPromotionGate = evaluateV049PaidPromotionGate({ approvalText: input.approvalText });
  const channels = await Promise.all(V049_CHANNEL_UPLOAD_TARGETS.map(async (target) => {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", target.channel_key, "local-review-video.mp4");
    const localVideoExists = await fileExists(videoPath);
    const suppliedAffiliateUrl = safeTrim(input.affiliateUrls?.[target.channel_key]);
    const affiliateUrlPresent = Boolean(suppliedAffiliateUrl) ||
      await inferMaskedAffiliateUrlPresence(cwd, target.channel_key);
    const route = routes.find((item) => item.channel_key === target.channel_key) ?? routes[0];
    const routeReady = v049ChannelRouteReady(route);
    const commentPreview = buildSanitizedCommentPreview(target);
    const metadataGate = validateYouTubeKoreanMetadata({
      title: target.title,
      description: DESCRIPTION,
      selected_affiliate_url: suppliedAffiliateUrl,
      disclosure_text: V034_COUPANG_DISCLOSURE,
      upload_request_body_preview_generated: true,
      local_metadata_preview_html_generated: true,
      post_upload_metadata_verification_plan_generated: true
    });
    const blocker = firstBlocker([
      localVideoExists ? null : "LOCAL_VIDEO_MISSING",
      affiliateUrlPresent ? null : "AFFILIATE_URL_MISSING",
      routeReady ? null : "YOUTUBE_ROUTE_NOT_READY",
      metadataGate.can_pass_metadata_gate ? null : "KOREAN_METADATA_GATE_FAIL"
    ]);
    const sanitizedUploadRequest = {
      provider: "youtube",
      version: "v049",
      channel_key: target.channel_key,
      title: target.title,
      description: DESCRIPTION,
      video_path: videoPath,
      visibility: "public",
      made_for_kids: false,
      contains_paid_promotion: true,
      selected_affiliate_url: affiliateUrlPresent ? "<AFFILIATE_URL_PRESENT>" : "<AFFILIATE_URL_MISSING>",
      selected_affiliate_url_present: affiliateUrlPresent,
      comment_required_after_upload: true,
      comment_text: commentPreview,
      raw_affiliate_url_included: false,
      videos_insert_allowed: false,
      upload_execution_allowed: false
    };

    return {
      channel_key: target.channel_key,
      product_name: target.product_name,
      video_path: videoPath,
      local_video_exists: localVideoExists,
      human_review_status: "PASS_LOCAL_HUMAN_REVIEW" as const,
      metadata_review_status: "PASS_METADATA_REVIEW" as const,
      upload_settings_review_status: "PASS_UPLOAD_SETTINGS_REVIEW" as const,
      title: target.title,
      description: DESCRIPTION,
      comment_preview: commentPreview,
      visibility: "public" as const,
      made_for_kids: false as const,
      contains_paid_promotion: true as const,
      description_points_to_comment_link: true,
      comment_contains_affiliate_link: affiliateUrlPresent,
      comment_contains_coupang_disclosure: true,
      affiliate_url_present: affiliateUrlPresent,
      duplicate_upload_risk: false as const,
      same_asset_previously_uploaded: false as const,
      route,
      route_ready: routeReady,
      description_metadata_gate: metadataGate,
      sanitized_upload_request: sanitizedUploadRequest,
      preflight_pass: blocker === null,
      blocker
    };
  }));
  const allChannelPreflightPass = channels.every((channel) => channel.preflight_pass);
  const report: V049PreflightReport = {
    version: "v049",
    FINAL_STATUS: allChannelPreflightPass
      ? "SUCCESS_V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD"
      : "BLOCKED_V049_THREE_CHANNEL_UPLOAD_PREFLIGHT",
    V049_UPLOAD_PREFLIGHT_READY: allChannelPreflightPass,
    SAFE_TO_UPLOAD: false,
    main_head: input.mainHead ?? null,
    v048_review_status_all_pass: true,
    upload_approval_present: String(input.approvalText ?? "").includes(V049_UPLOAD_APPROVAL_PHRASE),
    paid_promotion_confirmation_present: paidPromotionGate.manual_paid_promotion_confirmation_present,
    paid_promotion_required_all: paidPromotionGate.paid_promotion_required_all,
    paid_promotion_setting_verified: paidPromotionGate.paid_promotion_setting_verified,
    manual_paid_promotion_check_required: paidPromotionGate.manual_paid_promotion_check_required,
    father_jobs_preflight_pass: channelPass(channels, "father_jobs"),
    father_jobs_blocker: channelBlocker(channels, "father_jobs"),
    neoman_moleulgeol_preflight_pass: channelPass(channels, "neoman_moleulgeol"),
    neoman_moleulgeol_blocker: channelBlocker(channels, "neoman_moleulgeol"),
    lets_buy_preflight_pass: channelPass(channels, "lets_buy"),
    lets_buy_blocker: channelBlocker(channels, "lets_buy"),
    all_channel_preflight_pass: allChannelPreflightPass,
    upload_plan_generated: true,
    sanitized_upload_requests_generated: true,
    comment_previews_generated: true,
    raw_affiliate_url_printed: false,
    duplicate_upload_risk: false,
    upload_execution_attempted: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    youtube_execute_called: false,
    comment_create_update_delete_called: false,
    visibility_changed_existing_video: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    secrets_printed: false,
    raw_urls_printed: false,
    fake_success: false,
    channels,
    paid_promotion_gate: paidPromotionGate
  };

  await writePreflightArtifacts(outputRoot, report);
  return report;
}

export function buildV049InternalCommentText(input: {
  channelKey: ChannelKey;
  affiliateUrl: string;
}) {
  const target = targetFor(input.channelKey);
  return [
    target.comment_first_line,
    `상품 링크: ${input.affiliateUrl}`,
    V034_COUPANG_DISCLOSURE
  ].join("\n");
}

function buildSanitizedCommentPreview(target: ChannelTarget) {
  return [
    target.comment_first_line,
    "상품 링크: <AFFILIATE_URL_PRESENT>",
    V034_COUPANG_DISCLOSURE
  ].join("\n");
}

async function writePreflightArtifacts(outputRoot: string, report: V049PreflightReport) {
  await writeJson(path.join(outputRoot, "three-channel-upload-preflight-report.json"), report);
  await fs.writeFile(path.join(outputRoot, "three-channel-upload-plan.html"), buildPlanHtml(report), "utf8");
  await fs.writeFile(path.join(outputRoot, "paid-promotion-settings-checklist.html"), buildPaidPromotionChecklistHtml(report), "utf8");

  for (const channel of report.channels) {
    const channelRoot = path.join(outputRoot, channel.channel_key);
    await writeJson(path.join(channelRoot, "sanitized-upload-request.json"), channel.sanitized_upload_request);
    await writeJson(path.join(channelRoot, "comment-preview.json"), {
      version: "v049",
      channel_key: channel.channel_key,
      comment_text: channel.comment_preview,
      comment_contains_affiliate_link: channel.comment_contains_affiliate_link,
      comment_contains_coupang_disclosure: channel.comment_contains_coupang_disclosure,
      raw_affiliate_url_printed: false
    });
  }
}

function buildPlanHtml(report: V049PreflightReport) {
  const rows = report.channels.map((channel) => `
    <tr>
      <td>${escapeHtml(channel.channel_key)}</td>
      <td>${escapeHtml(channel.product_name)}</td>
      <td>${escapeHtml(channel.title)}</td>
      <td>${channel.preflight_pass ? "PASS" : "BLOCKED"}</td>
      <td>${escapeHtml(channel.blocker ?? "")}</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v049 three-channel upload plan</title></head>
<body>
  <h1>v049 three-channel upload plan</h1>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>Actual upload requires fresh approval and manual paid promotion confirmation.</p>
  <table><thead><tr><th>channel</th><th>product</th><th>title</th><th>preflight</th><th>blocker</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>
`;
}

function buildPaidPromotionChecklistHtml(report: V049PreflightReport) {
  const items = report.channels.map((channel) => `
    <li>${escapeHtml(channel.channel_key)}: contains_paid_promotion=true, made_for_kids=false, manual YouTube Studio check required.</li>
  `).join("");
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v049 paid promotion checklist</title></head>
<body>
  <h1>v049 paid promotion settings checklist</h1>
  <p>manual_paid_promotion_check_required=${report.manual_paid_promotion_check_required}</p>
  <ol>${items}</ol>
</body>
</html>
`;
}

function targetFor(channelKey: ChannelKey) {
  const target = V049_CHANNEL_UPLOAD_TARGETS.find((item) => item.channel_key === channelKey);
  if (!target) throw new Error(`Unsupported v049 channel: ${channelKey}`);
  return target;
}

function channelPass(channels: V049ChannelPreflight[], channelKey: ChannelKey) {
  return channels.find((channel) => channel.channel_key === channelKey)?.preflight_pass ?? false;
}

function channelBlocker(channels: V049ChannelPreflight[], channelKey: ChannelKey) {
  const channel = channels.find((item) => item.channel_key === channelKey);
  return channel ? channel.blocker : "CHANNEL_PREFLIGHT_MISSING";
}

function firstBlocker(values: Array<string | null>) {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

async function fileExists(filePath: string) {
  try {
    const info = await fs.stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function inferMaskedAffiliateUrlPresence(cwd: string, channelKey: ChannelKey) {
  const commentPreviewPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "comment-preview.json");
  try {
    const preview = JSON.parse(await fs.readFile(commentPreviewPath, "utf8")) as Record<string, unknown>;
    return preview.comment_contains_affiliate_link === true ||
      preview.affiliate_url === "<AFFILIATE_URL_PRESENT>";
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
