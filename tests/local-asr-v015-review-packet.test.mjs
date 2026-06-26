import { describe, expect, test } from "vitest";

import {
  buildRealStoryboardGateProbe,
  buildV015RealSceneSourceManifest,
  buildV015ReviewSummary,
  evaluateApprovedKoreanVoiceProvider
} from "../scripts/generate-local-asr-v015-review-packet.mjs";

describe("local v015 real storyboard and voice provider review packet", () => {
  test("builds a real scene manifest with limited product photo reuse", () => {
    const manifest = buildV015RealSceneSourceManifest();
    const productPhotoScenes = manifest.scene_sources.filter((scene) => scene.uses_product_photo);
    const nonProductScenes = manifest.scene_sources.filter((scene) => !scene.uses_product_photo);

    expect(manifest).toMatchObject({
      version: "v015",
      candidate_id: "candidate-3c4f2ee364ba5b07"
    });
    expect(manifest.scene_sources).toHaveLength(8);
    expect(productPhotoScenes).toHaveLength(2);
    expect(nonProductScenes.length).toBeGreaterThanOrEqual(5);
    expect(manifest.scene_sources.map((scene) => scene.source_type)).toEqual(expect.arrayContaining([
      "problem_graphic",
      "rain_laundry_problem_graphic",
      "small_room_space_problem",
      "product_reveal",
      "use_case_laundry_items",
      "before_after_space_compare",
      "buying_checklist",
      "cta_clean_card"
    ]));
  });

  test("passes real storyboard gate for problem, use-case, comparison, checklist, and CTA scenes", () => {
    const probe = buildRealStoryboardGateProbe(buildV015RealSceneSourceManifest());

    expect(probe).toMatchObject({
      real_storyboard_gate_executed: true,
      single_product_photo_reuse_count: 2,
      product_photo_dominant_scene_count: 2,
      unique_non_product_scene_source_count: 6,
      problem_before_product_visible: true,
      before_after_comparison_present: true,
      use_case_visual_present: true,
      text_color_only_variation: false,
      real_storyboard_gate_pass: true,
      blocker: null
    });
  });

  test("blocks Windows SAPI and reports Korean voice provider not configured", () => {
    const voice = evaluateApprovedKoreanVoiceProvider({
      providerName: "Windows SAPI",
      providerApproved: false,
      windowsSapiUsed: true
    });

    expect(voice).toMatchObject({
      voice_provider_name: "Windows SAPI",
      voice_provider_approved: false,
      windows_sapi_used: true,
      voiceover_rejected_local_sapi_voice: true,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
    });
  });

  test("keeps v015 upload-blocked when real storyboard passes but approved voice is missing", () => {
    const summary = buildV015ReviewSummary({
      realStoryboard: buildRealStoryboardGateProbe(buildV015RealSceneSourceManifest()),
      voiceProvider: evaluateApprovedKoreanVoiceProvider({
        providerName: null,
        providerApproved: false,
        windowsSapiUsed: false
      }),
      localReviewVideoCreated: true
    });

    expect(summary).toMatchObject({
      version: "v015",
      v014_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      real_storyboard_gate_pass: true,
      voice_provider_approved: false,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      local_review_packet_ready: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });
});
