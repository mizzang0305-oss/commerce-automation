import { describe, expect, test } from "vitest";

import {
  COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER,
  MANUAL_EVENT_CANDIDATE_SOURCE,
  buildCoupangPartners401FinalLock,
  buildEventAwareManualCandidateFallback
} from "@/lib/coupang/eventAwareManualCandidateFallback";

const baselineCandidateId = "candidate-490aa6d25e8ea89d";
const rainyEvent = {
  event_id: "rainy-season",
  event_name: "Rainy season preparation",
  event_type: "weather"
};

describe("event-aware manual candidate fallback", () => {
  test("persistent 401 after external verification locks live scout retry", () => {
    const lock = buildCoupangPartners401FinalLock();

    expect(lock).toMatchObject({
      current_blocker: COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER,
      live_scout_retry_allowed_now: false,
      external_verification_done: true,
      final_live_retry_status: "HTTP_401",
      retry_loop_blocked: true,
      manual_fallback_source: MANUAL_EVENT_CANDIDATE_SOURCE
    });
    expect(lock.side_effects).toMatchObject({
      partners_api_called: false,
      external_scout_called: false,
      candidate_insert_update: false,
      render_attempted: false,
      r2_upload_write: false,
      db_write: false,
      youtube_execute: false
    });
  });

  test("live scout retry requires fresh approval even after external verification", () => {
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      current_blocker: "LIVE_SCOUT_NOT_EXECUTED_AFTER_EXTERNAL_VERIFICATION"
    });

    expect(result.ok).toBe(false);
    expect(result.blocked_reasons).toContain("MANUAL_EVENT_CANDIDATE_FALLBACK_REQUIRES_PERSISTENT_401");
    expect(result.side_effects.partners_api_called).toBe(false);
    expect(result.side_effects.external_scout_called).toBe(false);
  });

  test("manual event candidate fallback accepts only event-relevant candidate", () => {
    const result = buildEventAwareManualCandidateFallback(validInput());

    expect(result.ok).toBe(true);
    expect(result.candidate?.source_type).toBe(MANUAL_EVENT_CANDIDATE_SOURCE);
    expect(result.safe_summary).toMatchObject({
      source: MANUAL_EVENT_CANDIDATE_SOURCE,
      event_id: "rainy-season",
      selected_keyword: "빨래건조대",
      affiliate_url_present: true,
      product_image_present: true,
      baseline_candidate_excluded: true,
      policy_risk_clear: true,
      low_cost_motion_suitable: true,
      ready_for_low_cost_motion_v1_1_render: true
    });
    expect(result.safe_summary.event_relevance_score).toBeGreaterThanOrEqual(60);
    expect(result.safe_summary.motion_suitability_score).toBeGreaterThanOrEqual(60);
  });

  test("manual fallback rejects missing affiliate URL", () => {
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      affiliate_url: ""
    });

    expect(result.ok).toBe(false);
    expect(result.blocked_reasons).toContain("MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_MISSING");
    expect(result.safe_summary.ready_for_low_cost_motion_v1_1_render).toBe(false);
  });

  test("manual fallback rejects missing product image", () => {
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      product_image_url: ""
    });

    expect(result.ok).toBe(false);
    expect(result.blocked_reasons).toContain("MANUAL_EVENT_CANDIDATE_IMAGE_URL_MISSING");
    expect(result.safe_summary.ready_for_low_cost_motion_v1_1_render).toBe(false);
  });

  test("manual fallback rejects baseline candidate", () => {
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      product_name: "Baseline cookware set",
      baseline_product_names: ["Baseline cookware set"]
    });

    expect(result.ok).toBe(false);
    expect(result.blocked_reasons).toContain("MANUAL_EVENT_CANDIDATE_BASELINE_BLOCKED");
    expect(result.safe_summary.baseline_candidate_excluded).toBe(false);
  });

  test("manual fallback rejects policy-risk product", () => {
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      product_name: "빨래건조대 다이어트 건강기능 보장",
      category: "건강기능식품"
    });

    expect(result.ok).toBe(false);
    expect(result.blocked_reasons).toContain("MANUAL_EVENT_CANDIDATE_POLICY_RISK");
    expect(result.safe_summary.policy_risk_clear).toBe(false);
  });

  test("manual fallback marks ready for low-cost motion v1.1 render only after validation", () => {
    const notRelevant = buildEventAwareManualCandidateFallback({
      ...validInput(),
      product_name: "plain desk calendar",
      category: "stationery"
    });
    const valid = buildEventAwareManualCandidateFallback(validInput());

    expect(notRelevant.ok).toBe(false);
    expect(notRelevant.safe_summary.ready_for_low_cost_motion_v1_1_render).toBe(false);
    expect(valid.ok).toBe(true);
    expect(valid.safe_summary.ready_for_low_cost_motion_v1_1_render).toBe(true);
  });

  test("raw affiliate and image URLs are masked in safe summary", () => {
    const affiliateUrl = "https://link.coupang.com/a/manual-rain-safe";
    const imageUrl = "https://image.example.test/manual-rain-safe.jpg";
    const result = buildEventAwareManualCandidateFallback({
      ...validInput(),
      affiliate_url: affiliateUrl,
      product_image_url: imageUrl
    });
    const safeSummary = JSON.stringify(result.safe_summary);

    expect(result.safe_summary.raw_urls_masked).toBe(true);
    expect(result.safe_summary.raw_affiliate_url_printed).toBe(false);
    expect(result.safe_summary.raw_image_url_printed).toBe(false);
    expect(safeSummary).not.toContain(affiliateUrl);
    expect(safeSummary).not.toContain(imageUrl);
  });

  test("fallback does not render, upload, write DB, or call YouTube", () => {
    const result = buildEventAwareManualCandidateFallback(validInput());

    expect(result.side_effects).toEqual({
      partners_api_called: false,
      external_scout_called: false,
      candidate_insert_update: false,
      render_attempted: false,
      mp4_created: false,
      r2_upload_write: false,
      product_assets_write: false,
      db_write: false,
      youtube_execute: false,
      videos_insert: false,
      public_upload: false,
      unlisted_upload: false
    });
  });
});

function validInput() {
  return {
    current_blocker: COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER,
    event: rainyEvent,
    selected_keyword: "빨래건조대",
    product_name: "장마철 실내 빨래건조대 수납 정리 스탠드",
    category: "생활용품 빨래 건조대 정리",
    affiliate_url: "https://link.coupang.com/a/manual-rain-safe",
    product_image_url: "https://image.example.test/manual-rain-safe.jpg",
    baseline_candidate_id: baselineCandidateId,
    baseline_product_names: ["Baseline cookware set"],
    baseline_product_keys: ["coupang:baseline"],
    now: "2026-06-24T00:00:00.000Z"
  };
}
