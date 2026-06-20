import { z } from "zod";

import {
  VIDEO_FAILED_PATTERN_VALUES,
  type VideoHumanReviewFeedback
} from "./videoReviewMemoryTypes";

export { VIDEO_FAILED_PATTERN_VALUES };

export const VideoFailedPatternSchema = z.enum(VIDEO_FAILED_PATTERN_VALUES);

export const VideoHumanReviewFeedbackSchema = z.object({
  reviewId: z.string().min(1),
  candidateSafeRef: z.string().min(1).startsWith("safe:"),
  reviewer: z.enum(["operator", "qa", "maintainer"]),
  outcome: z.enum(["pass", "fail", "needs_revision"]),
  failedPatterns: z.array(VideoFailedPatternSchema),
  promptFeedback: z.string().min(1),
  createdAt: z.string().datetime(),
  storageWritesEnabled: z.literal(false).default(false)
});

export function normalizeVideoHumanReviewFeedback(input: unknown): VideoHumanReviewFeedback {
  return VideoHumanReviewFeedbackSchema.parse(input);
}
