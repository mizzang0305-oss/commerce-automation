import { describe, expect, test } from "vitest";
import type { ProductCandidate, ProductionHistory } from "@/types/automation";
import { analyzeCandidateDedupe, resolvePromotionStatus } from "@/lib/candidates/candidateDedupe";
import { scoreProductCandidate } from "@/lib/candidates/candidateScoring";
import { createQueueItemFixture } from "@/test/fixtures";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-score-001",
    product_name: "이벤트 인기 상품",
    raw_coupang_url: "https://www.coupang.com/vp/products/score-001",
    selected_affiliate_url: "https://link.coupang.com/a/score-001",
    payload: {
      source: "coupang",
      source_type: "event",
      category_path: "생활/정리",
      thumbnail_url: "https://image.example.com/item.jpg",
      price_now_text: "12,900원",
      discount_rate: 20,
      review_count: 180,
      rating: 4.6
    },
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

describe("candidate scoring and dedupe", () => {
  test("scores rich event candidates higher and explains the score", () => {
    const score = scoreProductCandidate(candidateFixture());

    expect(score.candidate_score).toBeGreaterThanOrEqual(85);
    expect(score.score_reason).toEqual(
      expect.arrayContaining(["제휴 링크 있음", "이벤트 상품", "이미지 있음"])
    );
  });

  test("penalizes missing required or useful fields", () => {
    const score = scoreProductCandidate(
      candidateFixture({
        product_name: "",
        selected_affiliate_url: "",
        raw_coupang_url: "",
        payload: {}
      })
    );

    expect(score.candidate_score).toBeLessThan(30);
    expect(score.score_reason).toEqual(
      expect.arrayContaining(["상품명 누락", "제휴 링크 누락", "URL 누락"])
    );
  });

  test("detects duplicate candidates by product_key", () => {
    const candidate = candidateFixture({ id: "candidate-a", product_key: "coupang:1:2:3" });
    const duplicate = candidateFixture({ id: "candidate-b", product_key: "coupang:1:2:3" });

    const result = analyzeCandidateDedupe(candidate, {
      candidates: [candidate, duplicate],
      queueItems: [],
      productionHistory: []
    });

    expect(result).toMatchObject({
      duplicate_status: "duplicate_candidate",
      duplicate_reason: "동일 product_key 후보가 이미 있습니다."
    });
  });

  test("detects queued and produced duplicates by URLs and history", () => {
    const queueItem = createQueueItemFixture({
      id: "queue-produced",
      raw_coupang_url: "https://www.coupang.com/vp/products/produced",
      selected_affiliate_url: "https://link.coupang.com/a/produced"
    });
    const history: ProductionHistory = {
      id: "history-produced",
      product_queue_id: "queue-produced",
      worker_job_id: "job-produced",
      event_type: "worker_job_completed",
      message: "done",
      metadata: {},
      created_at: "2026-05-31T00:00:00.000Z"
    };

    expect(
      analyzeCandidateDedupe(candidateFixture({ raw_coupang_url: queueItem.raw_coupang_url }), {
        candidates: [],
        queueItems: [queueItem],
        productionHistory: []
      }).duplicate_status
    ).toBe("already_queued");

    expect(
      analyzeCandidateDedupe(candidateFixture({ selected_affiliate_url: queueItem.selected_affiliate_url }), {
        candidates: [],
        queueItems: [queueItem],
        productionHistory: [history]
      }).duplicate_status
    ).toBe("already_produced");
  });

  test("resolves promotion readiness from missing fields, duplicates, and score", () => {
    expect(resolvePromotionStatus(candidateFixture({ selected_affiliate_url: "" }), "unique", 90)).toBe(
      "blocked_missing_affiliate"
    );
    expect(resolvePromotionStatus(candidateFixture({ product_name: "" }), "unique", 90)).toBe("blocked_missing_name");
    expect(resolvePromotionStatus(candidateFixture(), "already_queued", 90)).toBe("blocked_duplicate");
    expect(resolvePromotionStatus(candidateFixture({ payload: {} }), "unique", 25)).toBe("needs_review");
    expect(resolvePromotionStatus(candidateFixture(), "unique", 90)).toBe("ready");
  });
});
