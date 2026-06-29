import { type ChannelKey, getChannelProfile } from "./channelProfiles";

export const MULTI_CHANNEL_COUPANG_DISCLOSURE =
  "\uC774 \uCF58\uD150\uCE20\uB294 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";

export type ChannelCommentPreview = {
  channel_key: ChannelKey;
  comment_text_sanitized: string;
  description_text: string;
  comment_link_required: true;
  coupang_disclosure_required: true;
  masked_affiliate_url_preview: string;
  raw_affiliate_url_included: false;
};

export type CommentTemplateValidation = {
  comment_link_required: true;
  comment_link_present: boolean;
  coupang_disclosure_required: true;
  coupang_disclosure_present: boolean;
  description_points_to_comment_link: boolean;
  description_contains_raw_affiliate_url: boolean;
  raw_affiliate_url_printed: false;
  placeholder_url_present: boolean;
  example_com_present: boolean;
  mojibake_present: boolean;
};

export function buildChannelCommentPreview(input: {
  channel_key: ChannelKey;
  affiliate_url_present?: boolean;
  masked_affiliate_url?: string;
}): ChannelCommentPreview {
  const profile = getChannelProfile(input.channel_key);
  const maskedUrl = input.affiliate_url_present === false
    ? "<AFFILIATE_URL_MISSING>"
    : input.masked_affiliate_url ?? "https://link.coupang.com/re/***";
  const comment = [
    profile.comment_first_line,
    "",
    "\uC0C1\uD488 \uAD6C\uC131\uACFC \uAC00\uACA9\uC740 \uC544\uB798 \uB9C1\uD06C\uC5D0\uC11C \uD655\uC778 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
    maskedUrl,
    "",
    MULTI_CHANNEL_COUPANG_DISCLOSURE
  ].join("\n");

  return {
    channel_key: input.channel_key,
    comment_text_sanitized: comment,
    description_text: buildDescriptionText(),
    comment_link_required: true,
    coupang_disclosure_required: true,
    masked_affiliate_url_preview: maskedUrl,
    raw_affiliate_url_included: false
  };
}

export function validateCommentTemplate(preview: ChannelCommentPreview): CommentTemplateValidation {
  return {
    comment_link_required: true,
    comment_link_present: preview.comment_text_sanitized.includes(preview.masked_affiliate_url_preview) &&
      preview.masked_affiliate_url_preview !== "<AFFILIATE_URL_MISSING>",
    coupang_disclosure_required: true,
    coupang_disclosure_present: hasCoupangDisclosure(preview.comment_text_sanitized),
    description_points_to_comment_link: preview.description_text.includes("\uB313\uAE00\uC758 \uC0C1\uD488 \uB9C1\uD06C"),
    description_contains_raw_affiliate_url: /https:\/\/link\.coupang\.com\/(?!re\/\*\*\*)/i.test(preview.description_text),
    raw_affiliate_url_printed: false,
    placeholder_url_present: /<ACTUAL|PLACEHOLDER|PLAIN_HTTPS|TEST_URL/i.test(preview.comment_text_sanitized),
    example_com_present: /example\.com/i.test(preview.comment_text_sanitized),
    mojibake_present: hasMojibake(preview.comment_text_sanitized)
  };
}

function buildDescriptionText() {
  return [
    "[\uC0C1\uD488 \uD655\uC778]",
    "\uC0C1\uD488 \uAD6C\uC131\uACFC \uAC00\uACA9\uC740 \uB313\uAE00\uC758 \uC0C1\uD488 \uB9C1\uD06C\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.",
    "",
    "[\uCCB4\uD06C \uD3EC\uC778\uD2B8]",
    "\uAD6C\uB9E4 \uC804\uC5D0\uB294 \uD06C\uAE30, \uD558\uC911, \uC811\uC5C8\uC744 \uB54C \uBCF4\uAD00 \uACF5\uAC04\uC744 \uAF2D \uD655\uC778\uD558\uC138\uC694.",
    "",
    "[\uACE0\uC9C0]",
    MULTI_CHANNEL_COUPANG_DISCLOSURE
  ].join("\n");
}

function hasCoupangDisclosure(value: string) {
  return value.includes("\uCFE0\uD321") &&
    value.includes("\uD30C\uD2B8\uB108\uC2A4") &&
    value.includes("\uC218\uC218\uB8CC");
}

function hasMojibake(value: string) {
  return /\?{3,}/.test(value) ||
    value.includes("\uFFFD") ||
    /\u5360|\u00C3|\u00EC|\u00ED|\u00EA/.test(value);
}
