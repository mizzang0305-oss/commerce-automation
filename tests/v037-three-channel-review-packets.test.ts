import { describe, expect, test } from "vitest";

import { V037_FAILURE_RECORD } from "../src/uploads/multi-channel/realThreeChannelImageSkillReviewBuilder";

describe("v037 three-channel review packet failure record", () => {
  test("v037_fail_status_tests", () => {
    expect(V037_FAILURE_RECORD.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(V037_FAILURE_RECORD.safe_to_upload).toBe(false);
    expect(V037_FAILURE_RECORD.pr156_merge_allowed).toBe(false);
    expect(V037_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "RGB_TEST_PATTERN_RENDERER_REGRESSION",
      "COLOR_BAR_PLACEHOLDER_VIDEO",
      "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER",
      "THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS",
      "ALL_CHANNELS_RENDERED_TEST_PATTERN",
      "VISUAL_ARTIFACT_GATE_MISSING"
    ]));
  });
});
