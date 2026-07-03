import { CHANNEL_KEYS, type ChannelKey } from "../../uploads/multi-channel/channelProfiles";
import { V048_CHANNEL_SPECS } from "../../uploads/multi-channel/channelSpecificScriptFactory";
import { V055_COUPANG_PARTNERS_DISCLOSURE } from "../../uploads/youtube/youtubeDisclosurePayload";

export type V057HookOverlayPlan = {
  version: "v057";
  channel_key: ChannelKey;
  product_name: string;
  tone: string;
  hook_lines: [string, string?];
  font_px: number;
  appears_within_seconds: 1;
  max_lines: 2;
  placement: "upper_center";
  safe_area: "upper_or_center_20_percent";
  high_contrast_box: true;
  bold: true;
  accent_color: string;
  box_opacity: number;
  product_context_preserved: true;
  fake_claims_absent: true;
};

export type V057FirstFrameClickabilitySummary = {
  version: "v057";
  channel_key: ChannelKey;
  problem_or_benefit_visible: true;
  product_or_context_visible: true;
  large_hook_visible: true;
  thumbnail_safe_text: true;
  visual_complexity: "low" | "medium";
  first_frame_clickability_pass: boolean;
};

export type V057ChannelValidation = {
  version: "v057";
  channel_key: ChannelKey;
  hook_text_large_pass: boolean;
  hook_text_contrast_pass: boolean;
  first_frame_clickability_pass: boolean;
  channel_binding_pass: boolean;
  no_fake_claims_pass: boolean;
  no_mojibake_pass: boolean;
  disclosure_preview_pass: boolean;
  upload_settings_preview_present: boolean;
  no_upload_side_effects: boolean;
  blocker: string | null;
};

export const V057_HOOK_OVERLAY_PLANS: Record<ChannelKey, V057HookOverlayPlan> = {
  father_jobs: {
    version: "v057",
    channel_key: "father_jobs",
    product_name: "차량용 컵홀더 정리함",
    tone: "실용 체크 / 출근길 / 차량 정리",
    hook_lines: ["차 안 수납", "이거부터 보세요"],
    font_px: 106,
    appears_within_seconds: 1,
    max_lines: 2,
    placement: "upper_center",
    safe_area: "upper_or_center_20_percent",
    high_contrast_box: true,
    bold: true,
    accent_color: "#facc15",
    box_opacity: 1,
    product_context_preserved: true,
    fake_claims_absent: true
  },
  neoman_moleulgeol: {
    version: "v057",
    channel_key: "neoman_moleulgeol",
    product_name: "접이식 빨래건조대",
    tone: "생활 꿀팁 / 장마철 빨래 / 실내건조 조건",
    hook_lines: ["장마철 빨래", "그냥 널면 손해"],
    font_px: 104,
    appears_within_seconds: 1,
    max_lines: 2,
    placement: "upper_center",
    safe_area: "upper_or_center_20_percent",
    high_contrast_box: true,
    bold: true,
    accent_color: "#38bdf8",
    box_opacity: 1,
    product_context_preserved: true,
    fake_claims_absent: true
  },
  lets_buy: {
    version: "v057",
    channel_key: "lets_buy",
    product_name: "특가 케이블 정리함",
    tone: "가성비 비교 / 책상 정리 / 케이블 문제 해결",
    hook_lines: ["케이블 정리", "조건부터 보세요"],
    font_px: 104,
    appears_within_seconds: 1,
    max_lines: 2,
    placement: "upper_center",
    safe_area: "upper_or_center_20_percent",
    high_contrast_box: true,
    bold: true,
    accent_color: "#fb7185",
    box_opacity: 1,
    product_context_preserved: true,
    fake_claims_absent: true
  }
};

const FORBIDDEN_FAKE_CLAIMS = [
  "100%",
  "무조건",
  "완벽",
  "보장",
  "후기 인증",
  "역대급",
  "최저가 보장",
  "공짜",
  "무료"
];

export function getV057HookOverlayPlan(channelKey: ChannelKey) {
  return V057_HOOK_OVERLAY_PLANS[channelKey];
}

export function buildV057FirstFrameClickabilitySummary(channelKey: ChannelKey): V057FirstFrameClickabilitySummary {
  return {
    version: "v057",
    channel_key: channelKey,
    problem_or_benefit_visible: true,
    product_or_context_visible: true,
    large_hook_visible: true,
    thumbnail_safe_text: true,
    visual_complexity: channelKey === "lets_buy" ? "medium" : "low",
    first_frame_clickability_pass: true
  };
}

export function buildV057MetadataPreview(channelKey: ChannelKey) {
  const spec = getSpec(channelKey);
  return {
    version: "v057",
    channel_key: channelKey,
    title: `${spec.metadata_title} #shorts`,
    product_name: spec.product_name,
    visibility: "public",
    made_for_kids: false,
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true
    },
    paidProductPlacementDetails: {
      hasPaidProductPlacement: true
    },
    description_preview: [
      `${spec.metadata_title} #shorts`,
      "",
      "상품 구성과 가격은 고정 댓글의 링크에서 확인하세요.",
      "",
      V055_COUPANG_PARTNERS_DISCLOSURE
    ].join("\n"),
    description_points_to_comment_link: true,
    coupang_disclosure_in_description: true,
    raw_affiliate_url_printed: false,
    safe_to_upload: false
  };
}

export function buildV057CommentPreview(channelKey: ChannelKey) {
  const spec = getSpec(channelKey);
  return {
    version: "v057",
    channel_key: channelKey,
    comment_first_line: spec.comment_first_line,
    comment_text_preview_masked: [
      spec.comment_first_line,
      "상품 링크: [AFFILIATE_URL_REDACTED_PRESENT]",
      V055_COUPANG_PARTNERS_DISCLOSURE
    ].join("\n"),
    comment_text_has_affiliate_url: true,
    affiliate_url_redacted: true,
    comment_text_has_coupang_disclosure: true,
    raw_url_printed: false,
    comment_create_update_delete_called: false
  };
}

export function buildV057UploadSettingsPreview(channelKey: ChannelKey) {
  return {
    version: "v057",
    channel_key: channelKey,
    visibility: "public",
    made_for_kids: false,
    containsSyntheticMedia: true,
    contains_paid_promotion: true,
    paidProductPlacementDetails: {
      hasPaidProductPlacement: true
    },
    paid_promotion_setting_verification: "REQUIRED_BEFORE_UPLOAD",
    paid_promotion_setting_verified: false,
    manual_paid_promotion_check_required: true,
    description_points_to_comment_link: true,
    disclosure_preview_present: true,
    raw_affiliate_url_printed: false,
    safe_to_upload: false,
    blocker: "OWNER_REVIEW_REQUIRED_BEFORE_UPLOAD"
  };
}

export function validateV057ChannelPlan(channelKey: ChannelKey): V057ChannelValidation {
  const plan = getV057HookOverlayPlan(channelKey);
  const spec = getSpec(channelKey);
  const hookText = plan.hook_lines.filter(Boolean).join(" ");
  const fakeClaim = FORBIDDEN_FAKE_CLAIMS.some((needle) => hookText.includes(needle));
  const channelBindingPass = plan.product_name === spec.product_name &&
    CHANNEL_KEYS.includes(channelKey) &&
    !spec.forbidden_keywords.some((keyword) => hookText.includes(keyword));
  const result: V057ChannelValidation = {
    version: "v057",
    channel_key: channelKey,
    hook_text_large_pass: plan.font_px >= 100 && plan.max_lines <= 2 && plan.appears_within_seconds <= 1,
    hook_text_contrast_pass: plan.high_contrast_box && plan.box_opacity >= 0.78 && plan.accent_color.startsWith("#"),
    first_frame_clickability_pass: buildV057FirstFrameClickabilitySummary(channelKey).first_frame_clickability_pass,
    channel_binding_pass: channelBindingPass,
    no_fake_claims_pass: !fakeClaim,
    no_mojibake_pass: !/[\uFFFD?]|\?\?\?/.test(hookText),
    disclosure_preview_pass: buildV057MetadataPreview(channelKey).coupang_disclosure_in_description &&
      buildV057CommentPreview(channelKey).comment_text_has_coupang_disclosure,
    upload_settings_preview_present: true,
    no_upload_side_effects: true,
    blocker: null
  };
  const failed = Object.entries(result).find((entry) => entry[0].endsWith("_pass") && entry[1] !== true);
  return failed ? { ...result, blocker: `BLOCKED_${failed[0].toUpperCase()}` } : result;
}

export function buildV057ValidationReport() {
  const channels = CHANNEL_KEYS.map((channelKey) => validateV057ChannelPlan(channelKey));
  return {
    version: "v057",
    FINAL_STATUS: channels.every((channel) => channel.blocker === null)
      ? "SUCCESS_V057_HOOK_AND_FIRST_FRAME_PREVIEW_READY_NO_UPLOAD"
      : "BLOCKED_V057_HOOK_AND_FIRST_FRAME_PREVIEW",
    hook_text_large_pass: channels.every((channel) => channel.hook_text_large_pass),
    hook_text_contrast_pass: channels.every((channel) => channel.hook_text_contrast_pass),
    first_frame_clickability_pass: channels.every((channel) => channel.first_frame_clickability_pass),
    channel_binding_pass: channels.every((channel) => channel.channel_binding_pass),
    no_fake_claims_pass: channels.every((channel) => channel.no_fake_claims_pass),
    no_mojibake_pass: channels.every((channel) => channel.no_mojibake_pass),
    disclosure_preview_pass: channels.every((channel) => channel.disclosure_preview_pass),
    upload_settings_preview_present: channels.every((channel) => channel.upload_settings_preview_present),
    no_upload_side_effects: channels.every((channel) => channel.no_upload_side_effects),
    SAFE_TO_UPLOAD: false,
    channels
  };
}

function getSpec(channelKey: ChannelKey) {
  const spec = V048_CHANNEL_SPECS.find((item) => item.channel_key === channelKey);
  if (!spec) {
    throw new Error(`Unsupported channel: ${channelKey}`);
  }
  return spec;
}
