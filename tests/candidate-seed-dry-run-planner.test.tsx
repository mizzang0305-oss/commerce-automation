import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GET as getCandidateSeedPlan } from "../app/api/candidates/seed-plan/route";
import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import { DashboardView } from "@/components/DashboardView";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { getQueueSummary } from "@/lib/status";
import { createQueueItemFixture } from "@/test/fixtures";
import type { CandidateAnalyticsResponse } from "@/lib/candidates/candidateAnalytics";

describe("candidate seed dry-run planner", () => {
  test("returns a read-only candidate-only dry-run payload plan from active filters", async () => {
    const repository = await seedPlannerCandidates();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await getCandidateSeedPlan(
      new Request(
        "http://localhost/api/candidates/seed-plan?keyword=stor&min_score=70&strategy=balanced&max_keywords=99&limit_per_keyword=99"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        mode: "candidate_only_dry_run_plan",
        strategy: "balanced",
        applied_filters: expect.objectContaining({
          keyword: "stor",
          min_score: 70
        }),
        plan_summary: {
          keyword_count: 1,
          estimated_candidate_limit: 20,
          collector_execution: false,
          queue_created: false,
          worker_jobs_created: false,
          upload_triggered: false
        },
        collector_payload_preview: expect.objectContaining({
          mode: "dry_run",
          keywords: ["storage"],
          limit_per_keyword: 20,
          candidate_only: true,
          queue_creation_enabled: false,
          worker_job_creation_enabled: false,
          upload_enabled: false
        }),
        side_effects: {
          collector_executed: false,
          queue_created: false,
          worker_jobs_created: false,
          upload_triggered: false
        }
      })
    );
    expect(payload.seed_keywords[0]).toEqual(
      expect.objectContaining({
        keyword: "storage",
        suggested_action: "keep",
        suggested_limit: 20,
        source: "analytics_keep_keyword"
      })
    );
    expect(payload.copy_blocks.keyword_list).toBe("storage");
    expect(JSON.parse(payload.copy_blocks.json_payload)).toEqual(payload.collector_payload_preview);
    await expect(repository.getQueue()).resolves.toHaveLength(initialQueue.length);
    await expect(repository.getWorkerJobs()).resolves.toHaveLength(initialJobs.length);
  });

  test("supports low-risk strategy and empty plans without side effects", async () => {
    await seedPlannerCandidates();

    const response = await getCandidateSeedPlan(
      new Request("http://localhost/api/candidates/seed-plan?keyword=missing&strategy=low_risk&max_keywords=3&limit_per_keyword=2")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.seed_keywords).toEqual([]);
    expect(payload.collector_payload_preview).toEqual({
      mode: "dry_run",
      keywords: [],
      limit_per_keyword: 2,
      candidate_only: true,
      queue_creation_enabled: false,
      worker_job_creation_enabled: false,
      upload_enabled: false
    });
    expect(payload.side_effects.collector_executed).toBe(false);
  });

  test("renders seed planner controls with copy and export actions only", async () => {
    render(<CandidateAnalyticsDashboard analytics={analyticsFixture} seedPlan={seedPlanFixture} />);

    expect(screen.getByText("Seed Dry-run Planner")).toBeInTheDocument();
    expect(screen.getByLabelText("Strategy")).toHaveValue("balanced");
    expect(screen.getByText("candidate_only=true")).toBeInTheDocument();
    expect(screen.getAllByText("queue_creation_enabled=false").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy keyword list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy JSON payload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run collector/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON payload" }));

    await waitFor(() => {
      expect(screen.getByText("Dry-run payload copied. No collector was executed.")).toBeInTheDocument();
    });
  });

  test("renders dashboard seed plan summary as a read-only card", () => {
    const settings = createDefaultSettings();
    const items = [createQueueItemFixture()];

    render(
      <DashboardView
        settings={settings}
        items={items}
        summary={getQueueSummary(items)}
        runs={[]}
        diagnostics={{
          nightlyScoutConfigured: false,
          nextBatchConfigured: false,
          retryItemConfigured: false,
          secretConfigured: false,
          callbackBaseUrlConfigured: false,
          callbackSecretConfigured: false,
          holdItemConfigured: false,
          skipItemConfigured: false
        }}
        productionReadiness={buildProductionReadinessSummary()}
        candidateSeedPlanSummary={{
          strategy: "balanced",
          keyword_count: 2,
          estimated_candidate_limit: 10,
          collector_executed: false
        }}
      />
    );

    expect(screen.getByText("Candidate Seed Plan")).toBeInTheDocument();
    expect(screen.getByText("Recommended keywords")).toBeInTheDocument();
    expect(screen.getByText("collector_executed=false")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open seed planner" })).toHaveAttribute("href", "/candidates/analytics#seed-plan");
    expect(screen.queryByRole("button", { name: /run collector/i })).not.toBeInTheDocument();
  });
});

async function seedPlannerCandidates() {
  const repository = resetMockRepositoryForTests();
  const storage = buildCoupangCandidate({
    product_name: "Storage planner item",
    raw_coupang_url: "https://www.coupang.com/vp/products/910001?itemId=1&vendorItemId=2",
    selected_affiliate_url: "https://link.coupang.com/a/planner-storage",
    thumbnail_url: "https://picsum.photos/seed/planner-storage/1080/1920",
    price_now_text: "19,900",
    category_path: "Home/Storage",
    source_type: "collector_dry_run",
    source: "planner_test"
  }).candidate;
  const kitchen = buildCoupangCandidate({
    product_name: "Kitchen planner item",
    raw_coupang_url: "https://www.coupang.com/vp/products/910002?itemId=3&vendorItemId=4",
    selected_affiliate_url: "https://link.coupang.com/a/planner-kitchen",
    thumbnail_url: "",
    price_now_text: "29,900",
    category_path: "Kitchen/Rack",
    source_type: "manual_url",
    source: "planner_test"
  }).candidate;
  await repository.upsertProductCandidates([
    withTrace(storage, {
      keyword: "storage",
      finalScore: 82,
      createdAt: "2026-06-02T00:00:00.000Z",
      riskFlags: []
    }),
    withTrace({ ...kitchen, promotion_status: "needs_review" }, {
      keyword: "kitchen",
      finalScore: 54,
      createdAt: "2026-06-04T00:00:00.000Z",
      riskFlags: ["missing_thumbnail"]
    })
  ]);
  return repository;
}

function withTrace(
  candidate: ReturnType<typeof buildCoupangCandidate>["candidate"],
  options: {
    keyword: string;
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
        collected_mode: "dry_run",
        collected_at: options.createdAt,
        collector_version: "collector-v1"
      }
    }
  };
}

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

const seedPlanFixture = {
  ok: true,
  mode: "candidate_only_dry_run_plan" as const,
  strategy: "balanced" as const,
  applied_filters: {
    status: "all",
    collected_mode: "all",
    sort: "final_score_desc" as const,
    limit: 50
  },
  plan_summary: {
    keyword_count: 1,
    estimated_candidate_limit: 5,
    collector_execution: false,
    queue_created: false,
    worker_jobs_created: false,
    upload_triggered: false
  },
  seed_keywords: [
    {
      keyword: "storage",
      source: "analytics_keep_keyword",
      suggested_action: "keep",
      suggested_limit: 5,
      reason: "Strong average score with low duplicate and rejection rates.",
      avg_final_score: 82,
      duplicate_rate: 0,
      manual_review_rate: 0,
      rejected_rate: 0,
      risk_notes: []
    }
  ],
  collector_payload_preview: {
    mode: "dry_run",
    keywords: ["storage"],
    limit_per_keyword: 5,
    candidate_only: true,
    queue_creation_enabled: false,
    worker_job_creation_enabled: false,
    upload_enabled: false
  },
  copy_blocks: {
    keyword_list: "storage",
    json_payload: JSON.stringify({
      mode: "dry_run",
      keywords: ["storage"],
      limit_per_keyword: 5,
      candidate_only: true,
      queue_creation_enabled: false,
      worker_job_creation_enabled: false,
      upload_enabled: false
    }, null, 2)
  },
  side_effects: {
    collector_executed: false,
    queue_created: false,
    worker_jobs_created: false,
    upload_triggered: false
  }
};
