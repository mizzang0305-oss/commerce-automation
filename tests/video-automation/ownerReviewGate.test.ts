import { describe, expect, test } from "vitest";
import { buildLocalQaStatus } from "@/lib/video-automation/layoutCollision";
import { isApprovedReviewRecord } from "@/lib/video-automation/productFixtures";

describe("owner review and publish-quality separation", () => {
  test("technical success defaults owner review to pending and cannot imply publish PASS", () => {
    expect(buildLocalQaStatus({ technicalQaPassed: true, captionQaPassed: true, layoutQaPassed: true, visualEvidencePassed: true })).toEqual({ technicalQaPassed: true, captionQaPassed: true, layoutQaPassed: true, visualEvidencePassed: true, ownerReviewStatus: "pending", publishQualityPassed: false });
  });

  test("publish quality requires an explicit human owner PASS", () => {
    expect(buildLocalQaStatus({ technicalQaPassed: true, captionQaPassed: true, layoutQaPassed: true, visualEvidencePassed: true, ownerReviewStatus: "pass" }).publishQualityPassed).toBe(true);
  });

  test("accepts only exact PASS_LOCAL_HUMAN_REVIEW evidence", () => {
    const base = { product_name: "접이식 빨래건조대", local_video_exists: true, video_path: "C:/reviewed.mp4" };
    expect(isApprovedReviewRecord({ ...base, human_review_status: "PASS_LOCAL_HUMAN_REVIEW" }, base.product_name)).toBe(true);
    expect(isApprovedReviewRecord({ ...base, human_review_status: "PENDING_HUMAN_REVIEW" }, base.product_name)).toBe(false);
    expect(isApprovedReviewRecord({ ...base, human_review_status: "PASS_LOCAL_HUMAN_REVIEW" }, "다른 상품")).toBe(false);
  });
});
