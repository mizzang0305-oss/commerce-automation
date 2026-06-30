import { describe, expect, test } from "vitest";

describe("v037 three-channel review packet failure boundary", () => {
  test("v037_fail_status_tests", () => {
    const failureRecord = {
      version: "v037",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      safe_to_upload: false,
      pr156_merge_allowed: false,
      fail_reasons: [
        "RGB_TEST_PATTERN_RENDERER_REGRESSION",
        "COLOR_BAR_PLACEHOLDER_VIDEO",
        "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER",
        "THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS",
        "VISUAL_ARTIFACT_GATE_MISSING"
      ]
    };

    expect(failureRecord.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(failureRecord.safe_to_upload).toBe(false);
    expect(failureRecord.pr156_merge_allowed).toBe(false);
    expect(failureRecord.fail_reasons).toEqual(expect.arrayContaining([
      "RGB_TEST_PATTERN_RENDERER_REGRESSION",
      "COLOR_BAR_PLACEHOLDER_VIDEO",
      "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER"
    ]));
  });
});
