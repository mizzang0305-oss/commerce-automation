import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import type { CandidateAnalyticsResponse } from "@/lib/candidates/candidateAnalytics";

describe("collector seed strategy panel", () => {
  test("renders candidate-only seed strategy copy controls without collector or promote actions", async () => {
    render(<CandidateAnalyticsDashboard analytics={analyticsFixture} />);

    expect(screen.getByText("Seed Strategy")).toBeInTheDocument();
    expect(screen.getByText("Keep")).toBeInTheDocument();
    expect(screen.getAllByText("storage").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy seed list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run collector/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy seed list" }));

    await waitFor(() => {
      expect(screen.getByText("Seed strategy is for copy/export only. No collector was executed.")).toBeInTheDocument();
    });
  });
});

const analyticsFixture: CandidateAnalyticsResponse = {
  ok: true,
  filters: {},
  applied_filters: {
    status: "all",
    collected_mode: "all",
    sort: "final_score_desc",
    limit: 50
  },
  available_filters: {
    keywords: ["storage"],
    categories: ["Home/Storage"],
    risk_flags: [],
    statuses: ["collected"],
    collected_modes: ["dry_run"],
    collector_versions: ["collector-v1"]
  },
  summary: {
    total_candidates: 1,
    collected: 1,
    scored: 1,
    duplicate: 0,
    manual_review: 0,
    rejected: 0,
    promoted: 0
  },
  score_summary: {
    avg_final_score: 82,
    avg_demand_score: 20,
    avg_price_score: 16,
    avg_content_angle_score: 20,
    avg_risk_penalty: 0,
    avg_duplicate_penalty: 0
  },
  keyword_performance: [
    {
      source_keyword: "storage",
      candidate_count: 1,
      avg_final_score: 82,
      duplicate_rate: 0,
      manual_review_rate: 0,
      rejected_rate: 0,
      promoted_rate: 0,
      qa_pass_rate: null
    }
  ],
  risk_flag_performance: [],
  source_trace_summary: [{ collected_mode: "dry_run", candidate_count: 1, latest_collected_at: "2026-06-02T00:00:00.000Z" }],
  recommendations: [],
  seed_strategy: {
    keep_keywords: [
      {
        keyword: "storage",
        reason: "Strong average score with low duplicate and rejection rates.",
        avg_final_score: 82,
        duplicate_rate: 0,
        manual_review_rate: 0,
        rejected_rate: 0,
        suggested_action: "keep"
      }
    ],
    expand_keywords: [],
    review_keywords: [],
    avoid_keywords: [],
    risk_flags_to_watch: [],
    generated_at: "2026-06-05T00:00:00.000Z",
    side_effects: {
      collector_executed: false,
      queue_created: false,
      worker_jobs_created: false,
      upload_triggered: false
    }
  },
  side_effects: {
    queue_created: false,
    worker_jobs_created: false,
    upload_triggered: false,
    collector_executed: false
  }
};
