import { describe, expect, it } from "vitest";

import {
  buildV113PinnedCommentPackage,
  sanitizeV113PinnedCommentPackage,
  V113_PINNED_COMMENT_CAUTION,
  V113_PINNED_COMMENT_INTRO
} from "../src/uploads/youtube/v113PinnedCommentPackage";

const AFFILIATE_URL = "https://link.coupang.com/a/v113-owner-review-fixture";

describe("V113 pinned comment package", () => {
  it("builds a complete manual pinned-comment draft with disclosure and link", () => {
    const result = buildV113PinnedCommentPackage({
      channelKey: "father_jobs",
      targetChannelKey: "father_jobs",
      selectedAffiliateUrl: AFFILIATE_URL
    });
    expect(result.ready).toBe(true);
    expect(result.blocker).toBeNull();
    expect(result.commentText).toContain(V113_PINNED_COMMENT_INTRO);
    expect(result.commentText).toContain(V113_PINNED_COMMENT_CAUTION);
    expect(result.commentText).toContain("쿠팡 파트너스");
    expect(result.commentText).toContain("수수료");
    expect(result.commentText).toContain(AFFILIATE_URL);
    expect(result.disclosurePresent).toBe(true);
    expect(result.linkPresent).toBe(true);
    expect(result.manualCommentCreateRequired).toBe(true);
    expect(result.manualPinRequired).toBe(true);
    expect(result.commentMutationAllowed).toBe(false);
  });

  it("fails closed for wrong channels or non-canonical affiliate URLs", () => {
    expect(buildV113PinnedCommentPackage({
      channelKey: "lets_buy",
      targetChannelKey: "father_jobs",
      selectedAffiliateUrl: AFFILIATE_URL
    }).blocker).toBe("BLOCKED_V113_PINNED_COMMENT_CHANNEL_MISMATCH");
    expect(buildV113PinnedCommentPackage({
      channelKey: "father_jobs",
      targetChannelKey: "father_jobs",
      selectedAffiliateUrl: "https://example.com/a/not-coupang"
    }).blocker).toBe("BLOCKED_V113_AFFILIATE_EVIDENCE_INVALID");
  });

  it("redacts the raw affiliate URL from the sanitized report", () => {
    const result = buildV113PinnedCommentPackage({
      channelKey: "father_jobs",
      targetChannelKey: "father_jobs",
      selectedAffiliateUrl: AFFILIATE_URL
    });
    const sanitized = sanitizeV113PinnedCommentPackage(result);
    expect(JSON.stringify(sanitized)).not.toContain(AFFILIATE_URL);
    expect(sanitized.affiliateHost).toBe("link.coupang.com");
    expect(sanitized.affiliateHashPrefix).toMatch(/^[a-f0-9]{12}$/u);
    expect(sanitized.rawUrlPrinted).toBe(false);
    expect(sanitized.commentMutationAllowed).toBe(false);
  });
});
