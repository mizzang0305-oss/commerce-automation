import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GET as getCandidateAnalytics } from "../app/api/candidates/analytics/route";
import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function seedCandidates() {
  const repository = resetMockRepositoryForTests();
  const first = buildCoupangCandidate({
    product_name: "Analytics storage box",
    raw_coupang_url: "https://www.coupang.com/vp/products/700001?itemId=11&vendorItemId=22",
    selected_affiliate_url: "https://link.coupang.com/a/analytics-one",
    thumbnail_url: "https://picsum.photos/seed/analytics-one/1080/1920",
    price_now_text: "19,900",
    category_path: "Home/Storage",
    source_type: "collector_dry_run",
    source: "analytics_test"
  }).candidate;
  const duplicate = buildCoupangCandidate(
    {
      product_name: "Analytics storage box duplicate",
      raw_coupang_url: "https://www.coupang.com/vp/products/700003?itemId=55&vendorItemId=66",
      selected_affiliate_url: "https://link.coupang.com/a/analytics-two",
      thumbnail_url: "",
      price_now_text: "19,900",
      category_path: "Home/Storage",
      source_type: "collector_dry_run",
      source: "analytics_test"
    },
    { candidates: [first] }
  ).candidate;
  const duplicateCandidate = {
    ...duplicate,
    id: "candidate-analytics-storage-duplicate",
    product_key: first.product_key,
    duplicate_status: "duplicate_candidate" as const,
    duplicate_reason: "Test duplicate candidate."
  };
  const promoted = {
    ...buildCoupangCandidate({
      product_name: "Analytics kitchen rack",
      raw_coupang_url: "https://www.coupang.com/vp/products/700002?itemId=33&vendorItemId=44",
      selected_affiliate_url: "https://link.coupang.com/a/analytics-three",
      thumbnail_url: "https://picsum.photos/seed/analytics-three/1080/1920",
      price_now_text: "29,900",
      category_path: "Kitchen/Storage",
      source_type: "manual_url",
      source: "analytics_test"
    }).candidate,
    promotion_status: "promoted" as const,
    promoted_queue_id: "queue-promoted-analytics"
  };
  await repository.upsertProductCandidates([
    withAnalyticsTrace(first, "storage", "collector_dry_run"),
    withAnalyticsTrace(duplicateCandidate, "storage", "collector_dry_run"),
    withAnalyticsTrace(promoted, "kitchen", "manual_url")
  ]);
  return repository;
}

describe("candidate analytics dashboard", () => {
  test("returns read-only keyword, score, risk, and recommendation analytics", async () => {
    const repository = await seedCandidates();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await getCandidateAnalytics(new Request("http://localhost/api/candidates/analytics"));
    const payload = await response.json();
    const finalQueue = await repository.getQueue();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      summary: {
        total_candidates: 3,
        duplicate: 2,
        promoted: 1
      },
      side_effects: {
        queue_created: false,
        worker_jobs_created: false,
        upload_triggered: false
      }
    });
    expect(payload.score_summary.avg_final_score).toBeGreaterThan(0);
    expect(payload.keyword_performance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_keyword: "storage",
          candidate_count: 2,
          duplicate_rate: 1,
          qa_pass_rate: null
        })
      ])
    );
    expect(payload.risk_flag_performance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          risk_flag: "missing_thumbnail",
          candidate_count: 1
        })
      ])
    );
    expect(payload.recommendations.length).toBeGreaterThan(0);
    expect(finalQueue).toHaveLength(initialQueue.length);
    expect(finalJobs).toHaveLength(initialJobs.length);
    expect(JSON.stringify(payload)).not.toContain("SECRET");
  });

  test("renders analytics dashboard without revenue claims or upload actions", () => {
    render(
      <CandidateAnalyticsDashboard
        analytics={{
          ok: true,
          filters: {},
          summary: {
            total_candidates: 3,
            collected: 2,
            scored: 3,
            duplicate: 1,
            manual_review: 0,
            rejected: 0,
            promoted: 1
          },
          score_summary: {
            avg_final_score: 72,
            avg_demand_score: 20,
            avg_price_score: 10,
            avg_content_angle_score: 24,
            avg_risk_penalty: 2,
            avg_duplicate_penalty: 8
          },
          keyword_performance: [
            {
              source_keyword: "storage",
              candidate_count: 2,
              avg_final_score: 75,
              duplicate_rate: 0.5,
              manual_review_rate: 0,
              rejected_rate: 0,
              promoted_rate: 0.5,
              qa_pass_rate: null
            }
          ],
          risk_flag_performance: [
            {
              risk_flag: "missing_thumbnail",
              candidate_count: 1,
              manual_review_rate: 0,
              rejected_rate: 0
            }
          ],
          source_trace_summary: [
            {
              collected_mode: "collector_dry_run",
              candidate_count: 2,
              latest_collected_at: "2026-06-05T00:00:00.000Z"
            }
          ],
          recommendations: [
            {
              type: "keyword",
              label: "storage",
              reason: "High candidate quality proxy.",
              suggested_action: "Use as a collector seed reference."
            }
          ],
          side_effects: {
            queue_created: false,
            worker_jobs_created: false,
            upload_triggered: false
          }
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Candidate Scoring Analytics" })).toBeInTheDocument();
    expect(screen.getByText("Avg Final Score")).toBeInTheDocument();
    expect(screen.getAllByText("storage").length).toBeGreaterThan(0);
    expect(screen.getByText("Candidate quality proxy only. No sales outcome is inferred.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();
  });
});

function withAnalyticsTrace(candidate: ReturnType<typeof buildCoupangCandidate>["candidate"], keyword: string, mode: string) {
  return {
    ...candidate,
    payload: {
      ...candidate.payload,
      source_keyword: keyword,
      source_trace: {
        ...(candidate.payload.source_trace as Record<string, unknown>),
        source_platform: "coupang",
        source_keyword: keyword,
        collected_mode: mode,
        collected_at: candidate.created_at,
        collector_version: "analytics-test-v1"
      }
    }
  };
}
