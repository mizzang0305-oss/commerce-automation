import { describe, expect, test } from "vitest";

import {
  buildV013FailureDecision,
  buildV014ReviewSummary,
  buildVisualDiversityProbe,
  evaluateVoiceSuitability
} from "../scripts/generate-local-asr-v014-review-packet.mjs";

describe("local v014 review packet voice and visual guards", () => {
  test("blocks the current local Korean SAPI voice when owner rejected the female tone", () => {
    const result = evaluateVoiceSuitability([
      {
        Name: "Microsoft Heami Desktop",
        Culture: "ko-KR",
        Gender: "Female",
        Age: "Adult"
      }
    ]);

    expect(result).toMatchObject({
      sapi_voice_probe_executed: true,
      ko_kr_voice_count: 1,
      selected_voice_gender: "Female",
      owner_rejected_voice_gender: "Female",
      voiceover_acceptability_pass: false,
      blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
    });
  });

  test("records v013 as failed for scary slow rejected voice and placeholder visuals", () => {
    const decision = buildV013FailureDecision();

    expect(decision).toMatchObject({
      candidate_id: "candidate-3c4f2ee364ba5b07",
      version: "v013",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
    expect(decision.fail_reasons).toEqual(expect.arrayContaining([
      "VOICEOVER_SCARY_OR_UNCOMFORTABLE",
      "VOICEOVER_TOO_SLOW",
      "VOICEOVER_REJECTED_FEMALE_VOICE",
      "VISUAL_DARK_PPT_CARD_FEELING",
      "VISUAL_PLACEHOLDER_GRAPHICS_USED"
    ]));
  });

  test("keeps v014 upload-blocked when visuals are improved but voice provider is rejected", () => {
    const visualDiversity = buildVisualDiversityProbe();
    const summary = buildV014ReviewSummary({
      voiceSuitability: evaluateVoiceSuitability([
        {
          Name: "Microsoft Heami Desktop",
          Culture: "ko-KR",
          Gender: "Female",
          Age: "Adult"
        }
      ]),
      visualOnlyVideoCreated: true,
      visualDiversity
    });

    expect(summary).toMatchObject({
      version: "v014",
      v013_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      visual_style: "bright_product_photo_commerce",
      product_photo_used: true,
      visual_review_ready: false,
      visual_diversity_pass: false,
      visual_diversity_blocker: "REPEATED_SINGLE_PRODUCT_PHOTO",
      voiceover_acceptability_pass: false,
      voiceover_acceptability_blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE",
      local_review_packet_ready: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });

  test("marks repeated product-photo visuals as not ready even when a visual file exists", () => {
    const visualDiversity = buildVisualDiversityProbe();

    expect(visualDiversity).toMatchObject({
      visual_diversity_probe_executed: true,
      repeated_single_product_photo: true,
      text_color_only_variation: true,
      visual_diversity_pass: false,
      blocker: "REPEATED_SINGLE_PRODUCT_PHOTO"
    });
  });
});
