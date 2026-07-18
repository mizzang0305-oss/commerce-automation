import { describe, expect, test } from "vitest";

import {
  evaluateV143ReusableCreativePolicy,
  type V143CreativePolicyEvidence
} from "@/lib/uploads/videoAssets/v143ReusableCreativePolicy";

function validEvidence(
  overrides: Partial<V143CreativePolicyEvidence> = {}
): V143CreativePolicyEvidence {
  return {
    hook_font_px: 112,
    hook_max_lines: 2,
    hook_visible_within_seconds: 0,
    hook_high_contrast: true,
    real_usage_scene_present: true,
    usage_source_role: "generic_usage_example",
    usage_label_present: true,
    exact_product_identity_claim: false,
    exact_product_identity_verified: false,
    actor_nationality_claim: null,
    actor_nationality_verified: false,
    product_identity_binding_verified: true,
    tts_provider_approved: true,
    tts_language: "ko",
    tts_speed_multiplier: 1.25,
    tts_delivery_style: "brisk_confident_sales",
    safe_to_upload: false,
    safe_to_public_upload: false,
    ...overrides
  };
}

describe("V143 reusable creative policy", () => {
  test("accepts labelled generic usage without claiming Korean nationality or exact product use", () => {
    const result = evaluateV143ReusableCreativePolicy(validEvidence());

    expect(result).toMatchObject({
      version: "v143",
      passed: true,
      blockers: [],
      usage_source_role: "generic_usage_example",
      exact_product_use_claim_allowed: false,
      nationality_claim_allowed: true,
      merchant_tts_pass: true,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
  });

  test("allows an exact-product-use claim only with verified exact-product identity", () => {
    const result = evaluateV143ReusableCreativePolicy(
      validEvidence({
        usage_source_role: "exact_product_use",
        exact_product_identity_claim: true,
        exact_product_identity_verified: true
      })
    );

    expect(result.passed).toBe(true);
    expect(result.exact_product_use_claim_allowed).toBe(true);
  });

  test("blocks an exact-product-use role until exact-product identity is verified", () => {
    const result = evaluateV143ReusableCreativePolicy(
      validEvidence({
        usage_source_role: "exact_product_use",
        exact_product_identity_claim: false,
        exact_product_identity_verified: false
      })
    );

    expect(result.passed).toBe(false);
    expect(result.exact_product_use_claim_allowed).toBe(false);
    expect(result.blockers).toContain(
      "V143_EXACT_PRODUCT_IDENTITY_VERIFICATION_REQUIRED"
    );
  });

  test("blocks a generic usage clip that is presented as exact product use", () => {
    const result = evaluateV143ReusableCreativePolicy(
      validEvidence({ exact_product_identity_claim: true })
    );

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain("V143_GENERIC_USAGE_EXACT_PRODUCT_OVERCLAIM");
  });

  test("blocks an unverified Korean nationality claim", () => {
    const result = evaluateV143ReusableCreativePolicy(
      validEvidence({ actor_nationality_claim: "Korean", actor_nationality_verified: false })
    );

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain("V143_NATIONALITY_CLAIM_UNVERIFIED");
  });

  test("blocks small hooks, unapproved voice, slow delivery, missing binding, and upload enablement", () => {
    const result = evaluateV143ReusableCreativePolicy(
      validEvidence({
        hook_font_px: 78,
        product_identity_binding_verified: false,
        tts_provider_approved: false,
        tts_speed_multiplier: 1.14,
        safe_to_upload: true
      })
    );

    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "V143_HOOK_READABILITY_REQUIRED",
        "V143_PRODUCT_IDENTITY_BINDING_REQUIRED",
        "V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED",
        "V143_MERCHANT_TTS_SPEED_OUT_OF_RANGE",
        "V143_UPLOAD_DEFAULT_MUST_REMAIN_BLOCKED"
      ])
    );
    expect(result.SAFE_TO_UPLOAD).toBe(false);
    expect(result.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  });
});
