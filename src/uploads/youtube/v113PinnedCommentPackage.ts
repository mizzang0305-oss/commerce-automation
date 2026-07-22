import { createHash } from "node:crypto";

import {
  buildYouTubeLinkCtaMetadata,
  validateYouTubeLinkCtaMetadata,
  YOUTUBE_PINNED_COMMENT_DISCLOSURE
} from "../../lib/uploads/youtube/youtubeLinkCtaMetadata";

export const V113_PINNED_COMMENT_CHANNEL_KEY = "father_jobs" as const;
export const V113_PINNED_COMMENT_INTRO = "제품 정보와 현재 가격은 아래 링크에서 확인하세요.";
export const V113_PINNED_COMMENT_CAUTION =
  "구매 전 차량 헤드레스트 고정 방식과 시트 간격을 확인하세요.";

export type V113PinnedCommentPackage = {
  ready: boolean;
  blocker: string | null;
  commentText: string;
  affiliateUrlPresent: boolean;
  affiliateHost: "link.coupang.com" | "<HOST_NOT_ALLOWED>" | "<URL_INVALID>" | "<URL_MISSING>";
  affiliateHashPrefix: string | null;
  disclosurePresent: boolean;
  linkPresent: boolean;
  characterCount: number;
  manualCommentCreateRequired: true;
  manualPinRequired: true;
  commentMutationAllowed: false;
  rawUrlPrinted: false;
};

export function buildV113PinnedCommentPackage(input: {
  channelKey?: unknown;
  targetChannelKey?: unknown;
  selectedAffiliateUrl?: unknown;
}): V113PinnedCommentPackage {
  const channelKey = safeTrim(input.channelKey);
  const targetChannelKey = safeTrim(input.targetChannelKey);
  const affiliateUrl = safeTrim(input.selectedAffiliateUrl);
  const urlEvidence = validateAffiliateUrl(affiliateUrl);
  const blockers = [
    channelKey !== V113_PINNED_COMMENT_CHANNEL_KEY
      ? "BLOCKED_V113_PINNED_COMMENT_CHANNEL_MISMATCH"
      : null,
    targetChannelKey !== V113_PINNED_COMMENT_CHANNEL_KEY
      ? "BLOCKED_V113_PINNED_COMMENT_TARGET_CHANNEL_MISMATCH"
      : null,
    urlEvidence.blocker
  ].filter((blocker): blocker is string => Boolean(blocker));

  if (blockers.length > 0) {
    return buildBlockedPackage({ blocker: blockers[0], urlEvidence });
  }

  const canonical = buildYouTubeLinkCtaMetadata({
    selected_affiliate_url: affiliateUrl,
    disclosure_text: YOUTUBE_PINNED_COMMENT_DISCLOSURE
  });
  const commentText = [
    V113_PINNED_COMMENT_INTRO,
    canonical.pinned_comment_template,
    V113_PINNED_COMMENT_CAUTION
  ].join("\n\n");
  const validation = validateYouTubeLinkCtaMetadata({
    description: canonical.description,
    pinned_comment_template: commentText,
    on_screen_cta_text: canonical.on_screen_cta_text,
    selected_affiliate_url: affiliateUrl,
    disclosure_text: YOUTUBE_PINNED_COMMENT_DISCLOSURE
  });
  const ready = validation.pinned_comment_template_ready &&
    validation.affiliate_disclosure_present &&
    validation.description_url_present;

  return {
    ready,
    blocker: ready ? null : "BLOCKED_V113_PINNED_COMMENT_TEMPLATE_INVALID",
    commentText: ready ? commentText : "",
    affiliateUrlPresent: true,
    affiliateHost: "link.coupang.com",
    affiliateHashPrefix: hashPrefix(affiliateUrl),
    disclosurePresent: validation.affiliate_disclosure_present,
    linkPresent: validation.description_url_present,
    characterCount: ready ? commentText.length : 0,
    manualCommentCreateRequired: true,
    manualPinRequired: true,
    commentMutationAllowed: false,
    rawUrlPrinted: false
  };
}

export function sanitizeV113PinnedCommentPackage(value: V113PinnedCommentPackage) {
  return {
    ready: value.ready,
    blocker: value.blocker,
    affiliateUrlPresent: value.affiliateUrlPresent,
    affiliateHost: value.affiliateHost,
    affiliateHashPrefix: value.affiliateHashPrefix,
    disclosurePresent: value.disclosurePresent,
    linkPresent: value.linkPresent,
    characterCount: value.characterCount,
    manualCommentCreateRequired: value.manualCommentCreateRequired,
    manualPinRequired: value.manualPinRequired,
    commentMutationAllowed: value.commentMutationAllowed,
    rawUrlPrinted: false
  };
}

function validateAffiliateUrl(value: string) {
  if (!value) {
    return {
      blocker: "BLOCKED_V113_AFFILIATE_EVIDENCE_MISSING",
      host: "<URL_MISSING>" as const,
      hashPrefix: null
    };
  }
  try {
    const url = new URL(value);
    const payloadReady = /^\/(?:a|re)\/[^/?#]+/u.test(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "link.coupang.com" || !payloadReady) {
      return {
        blocker: "BLOCKED_V113_AFFILIATE_EVIDENCE_INVALID",
        host: "<HOST_NOT_ALLOWED>" as const,
        hashPrefix: hashPrefix(value)
      };
    }
    return {
      blocker: null,
      host: "link.coupang.com" as const,
      hashPrefix: hashPrefix(value)
    };
  } catch {
    return {
      blocker: "BLOCKED_V113_AFFILIATE_EVIDENCE_INVALID",
      host: "<URL_INVALID>" as const,
      hashPrefix: hashPrefix(value)
    };
  }
}

function buildBlockedPackage(input: {
  blocker: string;
  urlEvidence: ReturnType<typeof validateAffiliateUrl>;
}): V113PinnedCommentPackage {
  return {
    ready: false,
    blocker: input.blocker,
    commentText: "",
    affiliateUrlPresent: input.urlEvidence.host !== "<URL_MISSING>",
    affiliateHost: input.urlEvidence.host,
    affiliateHashPrefix: input.urlEvidence.hashPrefix,
    disclosurePresent: false,
    linkPresent: false,
    characterCount: 0,
    manualCommentCreateRequired: true,
    manualPinRequired: true,
    commentMutationAllowed: false,
    rawUrlPrinted: false
  };
}

function hashPrefix(value: string) {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
