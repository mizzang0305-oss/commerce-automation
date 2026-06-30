import { describe, expect, test } from "vitest";

import { V038_FAILURE_RECORD } from "../scripts/uploads/generate-v039-asset-to-frame-proof-review-packets";

describe("v038 real three-channel image-skill review failure record", () => {
  test("v038_fail_status_tests", () => {
    expect(V038_FAILURE_RECORD.human_review_status).toBe("FAIL_LOCAL_HUMAN_REVIEW");
    expect(V038_FAILURE_RECORD.safe_to_upload).toBe(false);
    expect(V038_FAILURE_RECORD.pr157_merge_allowed).toBe(false);
    expect(V038_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "BLANK_SOLID_PLACEHOLDER_FRAME",
      "SCENE_ASSET_NOT_VISIBLE_IN_VIDEO",
      "RENDERED_FRAME_DOES_NOT_CONTAIN_IMAGE_PIXELS",
      "ASSET_TO_FRAME_PROOF_MISSING",
      "TEST_PATTERN_GATE_FALSE_NEGATIVE",
      "PR157_MERGE_BLOCKED"
    ]));
  });
});
