import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { getChannelProfiles } from "../src/uploads/multi-channel/channelProfiles";
import {
  type CommerceProductCandidate,
  calculateSafetyRiskScore,
  routeCommerceProduct
} from "../src/uploads/multi-channel/commerceProductRouter";
import {
  ACTIVE_AFFILIATE_PROVIDER,
  INACTIVE_PROVIDER_ADAPTERS,
  routeAffiliateProvider
} from "../src/uploads/multi-channel/affiliateProviderRouter";
import {
  buildChannelScriptDraft,
  generateChannelHooks,
  validateGeneratedCopySafety
} from "../src/uploads/multi-channel/hookAndScriptGenerator";
import {
  buildChannelCommentPreview,
  validateCommentTemplate
} from "../src/uploads/multi-channel/commentTemplateBuilder";
import {
  V036_SAMPLE_PRODUCTS,
  buildMultiChannelCommercePlan,
  validateDuplicateCrossChannelGuard,
  writeV036MultiChannelCommercePreviewArtifacts
} from "../src/uploads/multi-channel/channelUploadPlanPreview";

describe("v036 multi-channel commerce router", () => {
  test("channel_profile_registry_tests", () => {
    const profiles = getChannelProfiles();

    expect(profiles.map((profile) => profile.channel_key)).toEqual([
      "father_jobs",
      "neoman_moleulgeol",
      "lets_buy"
    ]);
    expect(profiles.find((profile) => profile.channel_key === "father_jobs")?.best_categories).toContain("tools");
    expect(profiles.find((profile) => profile.channel_key === "neoman_moleulgeol")?.best_categories).toContain("cleaning");
    expect(profiles.find((profile) => profile.channel_key === "lets_buy")?.best_categories).toContain("value deal");
  });

  test("commerce_product_router_tests and routing_accuracy_check", () => {
    const plan = buildMultiChannelCommercePlan();
    const selected = Object.fromEntries(plan.plans.map((item) => [item.candidate.candidate_id, item.routing.selected_channel_key]));

    expect(plan.sample_product_count).toBe(9);
    expect(plan.routing_accuracy_check).toEqual({
      expected_count: 9,
      matched_count: 9,
      pass: true
    });
    expect(selected["sample-drying-rack"]).toBe("neoman_moleulgeol");
    expect(selected["sample-car-cup-organizer"]).toBe("father_jobs");
    expect(selected["sample-driver-bit"]).toBe("father_jobs");
    expect(selected["sample-cable-organizer"]).toBe("lets_buy");
  });

  test("channel_fit_score_tests", () => {
    const dryingRack = V036_SAMPLE_PRODUCTS[0];
    const carOrganizer = V036_SAMPLE_PRODUCTS[1];
    const cableDeal = V036_SAMPLE_PRODUCTS[7];

    expect(routeCommerceProduct(dryingRack).selected_channel_key).toBe("neoman_moleulgeol");
    expect(routeCommerceProduct(carOrganizer).selected_channel_key).toBe("father_jobs");
    expect(routeCommerceProduct(cableDeal).selected_channel_key).toBe("lets_buy");
    expect(routeCommerceProduct(dryingRack).safety_risk_score).toBeLessThan(30);
  });

  test("hook_generator_tests and script_generator_tests", () => {
    for (const channel_key of ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const) {
      const hooks = generateChannelHooks({
        channel_key,
        product: V036_SAMPLE_PRODUCTS[0]
      });
      const script = buildChannelScriptDraft({
        channel_key,
        product: V036_SAMPLE_PRODUCTS[0],
        selected_hook: hooks.selected_hook
      });

      expect(hooks.hooks).toHaveLength(5);
      expect(hooks.selected_hook.length).toBeGreaterThan(10);
      expect(script.fake_usage_claim_blocked).toBe(true);
      expect(script.guaranteed_result_claim_blocked).toBe(true);
      expect(validateGeneratedCopySafety(script.script_lines.join("\n")).safe).toBe(true);
    }
  });

  test("affiliate_provider_router_tests", () => {
    const coupang = routeAffiliateProvider(V036_SAMPLE_PRODUCTS[0]);
    const naverCandidate = {
      ...V036_SAMPLE_PRODUCTS[0],
      marketplace: "naver" as const
    };
    const naver = routeAffiliateProvider(naverCandidate);

    expect(ACTIVE_AFFILIATE_PROVIDER).toBe("coupang");
    expect(INACTIVE_PROVIDER_ADAPTERS).toEqual([
      "naver_shopping",
      "aliexpress",
      "amazon",
      "linkprice",
      "adpick",
      "tenping"
    ]);
    expect(coupang).toMatchObject({
      selected_provider: "coupang",
      provider_active: true,
      live_call_allowed: false
    });
    expect(naver).toMatchObject({
      selected_provider: "naver_shopping",
      provider_active: false,
      live_call_allowed: false,
      blocker: "NAVER_SHOPPING_ADAPTER_INACTIVE"
    });
  });

  test("comment_template_builder_tests and metadata_disclosure_tests", () => {
    for (const channel_key of ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const) {
      const preview = buildChannelCommentPreview({ channel_key });
      const validation = validateCommentTemplate(preview);

      expect(validation.comment_link_present).toBe(true);
      expect(validation.coupang_disclosure_present).toBe(true);
      expect(validation.description_points_to_comment_link).toBe(true);
      expect(validation.description_contains_raw_affiliate_url).toBe(false);
      expect(validation.raw_affiliate_url_printed).toBe(false);
      expect(preview.raw_affiliate_url_included).toBe(false);
    }
  });

  test("no_raw_affiliate_url_report_tests and local preview artifacts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v036-preview-"));
    try {
      const result = await writeV036MultiChannelCommercePreviewArtifacts({ cwd });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V036_MULTI_CHANNEL_COMMERCE_ROUTER_READY");
      expect(result.raw_urls_printed).toBe(false);
      await expect(stat(result.artifact_paths.multi_channel_plan)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.routing_preview_html)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.hook_preview_json)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.comment_preview_json)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.provider_routing_preview)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.safety_risk_report)).resolves.toBeTruthy();

      const serialized = await readFile(result.artifact_paths.multi_channel_plan, "utf8");
      expect(serialized).toContain("https://link.coupang.com/re/***");
      const rawCoupangUrlPrefix = ["https://link.coupang.com", "a"].join("/");
      expect(serialized).not.toContain(`${rawCoupangUrlPrefix}/`);
      expect(serialized).not.toContain("<ACTUAL_AFFILIATE_URL>");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("multi_channel_duplicate_guard_tests", () => {
    const guard = validateDuplicateCrossChannelGuard(V036_SAMPLE_PRODUCTS[0]);

    expect(guard.pass).toBe(true);
    expect(guard.same_product_same_script_cross_channel).toBe(false);
    expect(guard.same_video_reused_across_channels).toBe(false);
  });

  test("unsafe_product_category_guard_tests", () => {
    const risky: CommerceProductCandidate = {
      ...V036_SAMPLE_PRODUCTS[0],
      candidate_id: "risky-medical",
      product_name: "medical cure patch",
      risk_tags: ["medical"]
    };

    expect(calculateSafetyRiskScore(risky)).toBeGreaterThanOrEqual(50);
  });

  test("fake_review_claim_guard_tests", () => {
    const fakeUsage = validateGeneratedCopySafety("\uC2E4\uC81C\uB85C \uC368\uBD24\uB294\uB370 \uBB34\uC870\uAC74 \uD6A8\uACFC\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");

    expect(fakeUsage.safe).toBe(false);
    expect(fakeUsage.fake_review_or_fake_usage_detected).toBe(true);
    expect(fakeUsage.guaranteed_result_claim_detected).toBe(true);
  });

  test("mojibake_tests", () => {
    const preview = buildChannelCommentPreview({ channel_key: "neoman_moleulgeol" });
    const validation = validateCommentTemplate({
      ...preview,
      comment_text_sanitized: `${preview.comment_text_sanitized}\n???`
    });

    expect(validation.mojibake_present).toBe(true);
  });
});
