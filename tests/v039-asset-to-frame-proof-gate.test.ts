import { describe, expect, test } from "vitest";

import { V039_FAILURE_RECORD } from "../scripts/uploads/generate-v040-real-image-semantic-review-packets";

describe("v039 asset-to-frame proof failure boundary", () => {
  test("v039 remains failed because asset-to-frame proof only propagated placeholders", () => {
    expect(V039_FAILURE_RECORD).toMatchObject({
      version: "v039",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      safe_to_upload: false,
      pr158_merge_allowed: false
    });
    expect(V039_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "ASSET_TO_FRAME_PROOF_ONLY_PROVED_PLACEHOLDER_PROPAGATION",
      "REAL_IMAGE_SEMANTIC_GATE_MISSING",
      "PR158_MERGE_BLOCKED"
    ]));
  });
});
