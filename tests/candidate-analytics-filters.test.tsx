import { describe, expect, test } from "vitest";
import { GET as getCandidateAnalytics } from "../app/api/candidates/analytics/route";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function seedAnalyticsCandidates() {
  const repository = resetMockRepositoryForTests();
  const storage = buildCoupangCandidate({
    product_name: "Storage filter item",
    raw_coupang_url: "https://www.coupang.com/vp/products/800001?itemId=1&vendorItemId=2",
    selected_affiliate_url: "https://link.coupang.com/a/filter-storage",
    thumbnail_url: "https://picsum.photos/seed/filter-storage/1080/1920",
    price_now_text: "19,900",
    category_path: "Home/Storage",
    source_type: "collector_dry_run",
    source: "filter_test"
  }).candidate;
  const kitchen = buildCoupangCandidate({
    product_name: "Kitchen filter item",
    raw_coupang_url: "https://www.coupang.com/vp/products/800002?itemId=3&vendorItemId=4",
    selected_affiliate_url: "https://link.coupang.com/a/filter-kitchen",
    thumbnail_url: "",
    price_now_text: "29,900",
    category_path: "Kitchen/Rack",
    source_type: "manual_url",
    source: "filter_test"
  }).candidate;
  await repository.upsertProductCandidates([
    withAnalyticsTrace(storage, {
      keyword: "storage",
      mode: "dry_run",
      version: "collector-v1",
      finalScore: 82,
      createdAt: "2026-06-02T00:00:00.000Z",
      riskFlags: []
    }),
    withAnalyticsTrace(
      {
        ...kitchen,
        promotion_status: "needs_review"
      },
      {
        keyword: "kitchen",
        mode: "manual",
        version: "collector-v2",
        finalScore: 54,
        createdAt: "2026-06-04T00:00:00.000Z",
        riskFlags: ["missing_thumbnail"]
      }
    )
  ]);
  return repository;
}

describe("candidate analytics filters and seed strategy", () => {
  test("applies candidate analytics filters and returns available filter values without side effects", async () => {
    const repository = await seedAnalyticsCandidates();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await getCandidateAnalytics(
      new Request(
        "http://localhost/api/candidates/analytics?from=2026-06-01&to=2026-06-30&keyword=stor&category=home&min_score=70&max_score=100&collected_mode=dry_run&collector_version=collector-v1&sort=final_score_desc&limit=500"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.applied_filters).toEqual(
      expect.objectContaining({
        from: "2026-06-01",
        to: "2026-06-30",
        keyword: "stor",
        category: "home",
        status: "all",
        min_score: 70,
        max_score: 100,
        collected_mode: "dry_run",
        collector_version: "collector-v1",
        sort: "final_score_desc",
        limit: 200
      })
    );
    expect(payload.available_filters).toEqual(
      expect.objectContaining({
        keywords: expect.arrayContaining(["storage", "kitchen"]),
        categories: expect.arrayContaining(["Home/Storage", "Kitchen/Rack"]),
        risk_flags: expect.arrayContaining(["missing_thumbnail"]),
        statuses: expect.arrayContaining(["collected", "manual_review"]),
        collected_modes: expect.arrayContaining(["dry_run", "manual"]),
        collector_versions: expect.arrayContaining(["collector-v1", "collector-v2"])
      })
    );
    expect(payload.summary.total_candidates).toBe(1);
    expect(payload.keyword_performance[0]).toEqual(expect.objectContaining({ source_keyword: "storage" }));
    expect(payload.side_effects).toEqual({
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false,
      collector_executed: false
    });
    await expect(repository.getQueue()).resolves.toHaveLength(initialQueue.length);
    await expect(repository.getWorkerJobs()).resolves.toHaveLength(initialJobs.length);
  });

  test("rejects invalid score ranges with safe validation error", async () => {
    await seedAnalyticsCandidates();

    const response = await getCandidateAnalytics(
      new Request("http://localhost/api/candidates/analytics?min_score=95&max_score=10")
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual(
      expect.objectContaining({
        ok: false,
        error_code: "INVALID_SCORE_RANGE"
      })
    );
    expect(JSON.stringify(payload)).not.toContain("SECRET");
  });

  test("builds candidate-only seed strategy from filtered analytics", async () => {
    await seedAnalyticsCandidates();

    const response = await getCandidateAnalytics(new Request("http://localhost/api/candidates/analytics?to=2026-06-30"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seed_strategy).toEqual(
      expect.objectContaining({
        keep_keywords: expect.arrayContaining([expect.objectContaining({ keyword: "storage", suggested_action: "keep" })]),
        review_keywords: expect.arrayContaining([expect.objectContaining({ keyword: "kitchen", suggested_action: "review" })]),
        side_effects: {
          collector_executed: false,
          queue_created: false,
          worker_jobs_created: false,
          upload_triggered: false
        }
      })
    );
  });
});

function withAnalyticsTrace(
  candidate: ReturnType<typeof buildCoupangCandidate>["candidate"],
  options: {
    keyword: string;
    mode: string;
    version: string;
    finalScore: number;
    createdAt: string;
    riskFlags: string[];
  }
) {
  return {
    ...candidate,
    created_at: options.createdAt,
    updated_at: options.createdAt,
    payload: {
      ...candidate.payload,
      category_path: candidate.category,
      risk_flags: options.riskFlags,
      source_keyword: options.keyword,
      score_breakdown: {
        ...(candidate.payload.score_breakdown as Record<string, unknown>),
        final_score: options.finalScore
      },
      source_trace: {
        source_platform: "coupang",
        source_keyword: options.keyword,
        collected_mode: options.mode,
        collected_at: options.createdAt,
        collector_version: options.version
      }
    }
  };
}
