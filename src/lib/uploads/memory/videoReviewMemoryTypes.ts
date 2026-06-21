export const VIDEO_FAILED_PATTERN_VALUES = [
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
] as const;

export type VideoFailedPattern = typeof VIDEO_FAILED_PATTERN_VALUES[number];

export type VideoHumanReviewFeedback = {
  reviewId: string;
  candidateSafeRef: string;
  reviewer: "operator" | "qa" | "maintainer";
  outcome: "pass" | "fail" | "needs_revision";
  failedPatterns: VideoFailedPattern[];
  promptFeedback: string;
  createdAt: string;
  storageWritesEnabled: false;
};
