export const YOUTUBE_DESCRIPTION_CTA_LINE =
  "\uC0C1\uD488 \uB9C1\uD06C\uB294 \uC124\uBA85\uB780 \uCCAB \uC904 \uB610\uB294 \uACE0\uC815\uB313\uAE00\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.";

export const YOUTUBE_ON_SCREEN_CTA_TEXT =
  "\uC0C1\uD488 \uB9C1\uD06C\uB294 \uC124\uBA85\uB780 / \uACE0\uC815\uB313\uAE00 \uD655\uC778";

export const YOUTUBE_PINNED_COMMENT_DISCLOSURE =
  "\u203B \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";

const DEFAULT_BODY =
  "\uAD6C\uB9E4 \uC804 \uC0C1\uD488 \uAD6C\uC131\uACFC \uC635\uC158\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.";

export type YouTubeLinkCtaMetadata = {
  description: string;
  pinned_comment_template: string;
  on_screen_cta_text: typeof YOUTUBE_ON_SCREEN_CTA_TEXT;
};

export type YouTubeLinkCtaValidation = {
  description_url_present: boolean;
  description_first_line_is_plain_https_url: boolean;
  no_markdown_wrapped_url: boolean;
  no_backtick_url: boolean;
  no_line_break_inside_url: boolean;
  affiliate_disclosure_present: boolean;
  pinned_comment_template_ready: boolean;
  on_screen_cta_mentions_description_or_pinned_comment: boolean;
  likely_clickable_in_watch_page: boolean;
  shorts_feed_click_limitation_noted: true;
};

export function buildYouTubeLinkCtaMetadata(input: {
  selected_affiliate_url: string;
  description?: string;
  disclosure_text?: string;
}): YouTubeLinkCtaMetadata {
  const affiliateUrl = safeTrim(input.selected_affiliate_url);
  const disclosureText = safeTrim(input.disclosure_text);
  const body = stripExistingLinkCtaPolicyLines(safeTrim(input.description), affiliateUrl, disclosureText) || DEFAULT_BODY;
  const description = [
    affiliateUrl,
    YOUTUBE_DESCRIPTION_CTA_LINE,
    body,
    disclosureText
  ].filter(Boolean).join("\n\n");

  return {
    description,
    pinned_comment_template: [
      `\uC0C1\uD488 \uB9C1\uD06C \uD83D\uDC49 ${affiliateUrl}`,
      YOUTUBE_PINNED_COMMENT_DISCLOSURE
    ].filter(Boolean).join("\n\n"),
    on_screen_cta_text: YOUTUBE_ON_SCREEN_CTA_TEXT
  };
}

export function validateYouTubeLinkCtaMetadata(input: {
  description: string;
  pinned_comment_template?: string;
  on_screen_cta_text?: string;
  selected_affiliate_url?: string;
  disclosure_text?: string;
}): YouTubeLinkCtaValidation {
  const description = safeTrim(input.description);
  const pinnedComment = safeTrim(input.pinned_comment_template);
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const firstLine = description.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const combined = [description, pinnedComment].join("\n");
  const expectedUrl = selectedAffiliateUrl || firstLine;
  const markdownWrapped = hasMarkdownWrappedUrl(combined);
  const backtickUrl = /`[^`]*https:\/\//i.test(combined);
  const firstLineIsPlainUrl = isPlainHttpsUrl(firstLine) &&
    (!selectedAffiliateUrl || firstLine === selectedAffiliateUrl);
  const urlPresent = isPlainHttpsUrl(expectedUrl) && combined.includes(expectedUrl);
  const lineBreakInsideUrl = Boolean(expectedUrl) && /\s/.test(expectedUrl);
  const disclosurePresent = hasAffiliateDisclosure(description, input.disclosure_text);
  const pinnedReady = pinnedComment.includes(expectedUrl) &&
    pinnedComment.includes(YOUTUBE_PINNED_COMMENT_DISCLOSURE) &&
    !hasMarkdownWrappedUrl(pinnedComment) &&
    !/`[^`]*https:\/\//i.test(pinnedComment);
  const onScreenCta = safeTrim(input.on_screen_cta_text);
  const onScreenMentionsLinkSurface =
    onScreenCta.includes("\uC124\uBA85\uB780") &&
    onScreenCta.includes("\uACE0\uC815\uB313\uAE00");

  return {
    description_url_present: urlPresent,
    description_first_line_is_plain_https_url: firstLineIsPlainUrl,
    no_markdown_wrapped_url: !markdownWrapped,
    no_backtick_url: !backtickUrl,
    no_line_break_inside_url: !lineBreakInsideUrl && firstLineIsPlainUrl,
    affiliate_disclosure_present: disclosurePresent,
    pinned_comment_template_ready: pinnedReady,
    on_screen_cta_mentions_description_or_pinned_comment: onScreenMentionsLinkSurface,
    likely_clickable_in_watch_page: urlPresent && firstLineIsPlainUrl && !markdownWrapped && !backtickUrl,
    shorts_feed_click_limitation_noted: true
  };
}

function stripExistingLinkCtaPolicyLines(value: string, affiliateUrl: string, disclosureText: string) {
  if (!value) {
    return "";
  }
  const productLinkLabel = "\uC0C1\uD488 \uB9C1\uD06C";
  return value
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (trimmed === affiliateUrl ||
        trimmed === disclosureText ||
        trimmed === YOUTUBE_DESCRIPTION_CTA_LINE ||
        trimmed === productLinkLabel ||
        trimmed === `${productLinkLabel}:`) {
        return false;
      }
      if (affiliateUrl && trimmed.includes(affiliateUrl)) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasAffiliateDisclosure(description: string, disclosureText?: string) {
  const explicitDisclosure = safeTrim(disclosureText);
  if (explicitDisclosure && description.includes(explicitDisclosure)) {
    return true;
  }
  return description.includes("\uCFE0\uD321") &&
    description.includes("\uD30C\uD2B8\uB108\uC2A4") &&
    description.includes("\uC218\uC218\uB8CC");
}

function hasMarkdownWrappedUrl(value: string) {
  return /`https:\/\//i.test(value) ||
    /<https:\/\//i.test(value) ||
    /\[[^\]]+]\(https:\/\//i.test(value) ||
    /\(https:\/\/[^)\s]+[)]/i.test(value);
}

function isPlainHttpsUrl(value: string) {
  return /^https:\/\/\S+$/i.test(value) && !/[<>()`\[\]]/.test(value);
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
