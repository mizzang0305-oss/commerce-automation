import { describe, expect, test } from "vitest";

import {
  VIDEO_FAILED_PATTERN_VALUES,
  VideoHumanReviewFeedbackSchema,
  normalizeVideoHumanReviewFeedback
} from "@/lib/uploads/memory/videoReviewFeedbackSchema";

describe("video human review memory schema", () => {
  test("captures known failed patterns for future prompt feedback", () => {
    const feedback = normalizeVideoHumanReviewFeedback({
      reviewId: "review-001",
      candidateSafeRef: "safe:coupang:candidate-001",
      reviewer: "operator",
      outcome: "fail",
      failedPatterns: [
        "static product image repeated",
        "color card scene",
        "abstract shape card",
        "unrealistic stick hand",
        "non-photorealistic kitchen",
        "slideshow-like output",
        "caption out of safe area",
        "voice too slow",
        "no real motion clip",
        "product identity drift"
      ],
      promptFeedback: "Require hand pickup, utensil use, and product rotate scenes.",
      createdAt: "2026-06-21T00:00:00.000Z"
    });

    expect(feedback.failedPatterns).toEqual(VIDEO_FAILED_PATTERN_VALUES);
    expect(feedback.storageWritesEnabled).toBe(false);
    expect(JSON.stringify(feedback)).not.toMatch(/https?:\/\/|access_token|refresh_token|client_secret/i);
  });

  test("rejects unknown failed patterns", () => {
    expect(() => VideoHumanReviewFeedbackSchema.parse({
      reviewId: "review-002",
      candidateSafeRef: "safe:coupang:candidate-002",
      reviewer: "operator",
      outcome: "fail",
      failedPatterns: ["unknown failure"],
      promptFeedback: "bad pattern",
      createdAt: "2026-06-21T00:00:00.000Z"
    })).toThrow();
  });
});
