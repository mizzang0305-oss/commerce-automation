import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { POST as executeSeedPlan } from "../app/api/candidates/execute-seed-plan/route";
import { CandidateAnalyticsDashboard } from "@/components/CandidateAnalyticsDashboard";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type {
  CandidateAnalyticsResponse,
  CandidateSeedDryRunPlanResponse
} from "@/lib/candidates/candidateAnalytics";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/candidates/execute-seed-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function safeBody(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: "EXECUTE_CANDIDATE_ONLY_COLLECTOR",
    mode: "candidate_only",
    dry_run: true,
    candidate_only: true,
    queue_creation_enabled: false,
    worker_job_creation_enabled: false,
    render_plan_creation_enabled: false,
    upload_package_creation_enabled: false,
    upload_enabled: false,
    keywords: ["storage", "gift"],
    limit_per_keyword: 2,
    source: "seed_plan",
    ...overrides
  };
}

describe("candidate-only collector execution gate", () => {
  test("requires explicit candidate-only confirmation", async () => {
    resetMockRepositoryForTests();

    const response = await executeSeedPlan(request(safeBody({ confirmation: "RUN" })));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "CANDIDATE_ONLY_CONFIRMATION_REQUIRED",
      side_effects: {
        queue_created: false,
        worker_jobs_created: false,
        render_plan_created: false,
        upload_package_created: false,
        upload_triggered: false,
        platform_upload_triggered: false
      }
    });
  });

  test("rejects any queue, worker, render, package, or upload side-effect flag", async () => {
    resetMockRepositoryForTests();

    for (const [flag, value] of [
      ["candidate_only", false],
      ["queue_creation_enabled", true],
      ["worker_job_creation_enabled", true],
      ["render_plan_creation_enabled", true],
      ["upload_package_creation_enabled", true],
      ["upload_enabled", true]
    ] as const) {
      const response = await executeSeedPlan(request(safeBody({ [flag]: value })));
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        ok: false,
        error_code: "CANDIDATE_ONLY_SAFETY_FLAGS_REQUIRED"
      });
    }
  });

  test("creates product candidates only and reports all forbidden side effects as false", async () => {
    const repository = resetMockRepositoryForTests();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();
    const initialPackages = await repository.getChannelUploadPackages();

    const response = await executeSeedPlan(request(safeBody()));
    const payload = await response.json();
    const candidates = await repository.getProductCandidates();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      mode: "candidate_only",
      dry_run: true,
      created_count: 4,
      duplicate_count: 0,
      rejected_count: 0,
      side_effects: {
        queue_created: false,
        worker_jobs_created: false,
        render_plan_created: false,
        upload_package_created: false,
        upload_triggered: false,
        platform_upload_triggered: false
      },
      safety: {
        candidate_only: true,
        confirmation_required: true,
        confirmation_matched: true
      }
    });
    expect(candidates).toHaveLength(4);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: expect.stringContaining("storage"),
          source_type: "seed_plan_dry_run",
          source_name: "seed_plan",
          promotion_status: "blocked_missing_affiliate"
        })
      ])
    );
    await expect(repository.getQueue()).resolves.toHaveLength(initialQueue.length);
    await expect(repository.getWorkerJobs()).resolves.toHaveLength(initialJobs.length);
    await expect(repository.getChannelUploadPackages()).resolves.toHaveLength(initialPackages.length);
  });

  test("rerunning the same plan reports duplicate candidates without creating queue rows or jobs", async () => {
    const repository = resetMockRepositoryForTests();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    await executeSeedPlan(request(safeBody({ keywords: ["storage"], limit_per_keyword: 1 })));
    const second = await executeSeedPlan(request(safeBody({ keywords: ["storage"], limit_per_keyword: 1 })));
    const payload = await second.json();

    expect(second.status).toBe(200);
    expect(payload.created_count).toBe(0);
    expect(payload.duplicate_count).toBe(1);
    await expect(repository.getQueue()).resolves.toHaveLength(initialQueue.length);
    await expect(repository.getWorkerJobs()).resolves.toHaveLength(initialJobs.length);
  });

  test("renders a confirmation-gated execution UI without queue, worker, or upload actions", async () => {
    render(<CandidateAnalyticsDashboard analytics={analyticsFixture} seedPlan={seedPlanFixture} />);

    expect(screen.getByText("Candidate-only Execution Gate")).toBeInTheDocument();
    expect(screen.getByText("Only product_candidates can be created. Queue rows, worker jobs, render plans, upload packages, and platform uploads stay disabled.")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmation text")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Candidate-only 수집 실행" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /create queue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start worker/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^upload$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /production collect/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("I understand this creates candidates only."));
    fireEvent.change(screen.getByLabelText("Confirmation text"), {
      target: { value: "RUN" }
    });

    await waitFor(() => {
      expect(screen.getByText("Enter EXECUTE_CANDIDATE_ONLY_COLLECTOR to enable candidate-only execution.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Candidate-only 수집 실행" })).toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText("Confirmation text"), {
      target: { value: "EXECUTE_CANDIDATE_ONLY_COLLECTOR" }
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Candidate-only 수집 실행" })).toBeEnabled();
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
  seed_strategy: undefined,
  side_effects: {
    queue_created: false,
    worker_jobs_created: false,
    upload_triggered: false,
    collector_executed: false
  }
};

const seedPlanFixture: CandidateSeedDryRunPlanResponse = {
  ok: true,
  mode: "candidate_only_dry_run_plan",
  strategy: "balanced",
  applied_filters: {
    status: "all",
    collected_mode: "all",
    sort: "final_score_desc",
    limit: 50
  },
  plan_summary: {
    keyword_count: 2,
    estimated_candidate_limit: 4,
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
      suggested_limit: 2,
      reason: "Strong average score with low duplicate and rejection rates.",
      avg_final_score: 82,
      duplicate_rate: 0,
      manual_review_rate: 0,
      rejected_rate: 0,
      risk_notes: []
    },
    {
      keyword: "gift",
      source: "analytics_expand_keyword",
      suggested_action: "expand",
      suggested_limit: 2,
      reason: "Useful discovery keyword.",
      avg_final_score: 76,
      duplicate_rate: 0.1,
      manual_review_rate: 0.2,
      rejected_rate: 0,
      risk_notes: []
    }
  ],
  collector_payload_preview: {
    mode: "dry_run",
    keywords: ["storage", "gift"],
    limit_per_keyword: 2,
    candidate_only: true,
    queue_creation_enabled: false,
    worker_job_creation_enabled: false,
    upload_enabled: false
  },
  copy_blocks: {
    keyword_list: "storage\ngift",
    json_payload: JSON.stringify({
      mode: "dry_run",
      keywords: ["storage", "gift"],
      limit_per_keyword: 2,
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
