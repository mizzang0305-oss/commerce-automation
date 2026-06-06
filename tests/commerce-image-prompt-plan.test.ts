import { beforeEach, describe, expect, test } from "vitest";
import { GET as getCandidateImagePlan } from "../app/api/candidates/[id]/image-plan/route";
import { buildCommerceImagePromptPlan } from "@/lib/image-prompts/prompt-builder";
import type { ProductCandidate } from "@/types/automation";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-image-plan-001",
    product_name: "원룸 무선 청소기",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-image-plan-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-image-plan-001",
    category: "생활가전",
    payload: {
      keyword: "원룸 청소기",
      category_path: "생활가전/청소기",
      thumbnail_url: "https://image.example.com/candidate-image-plan-001.jpg"
    },
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("commerce image prompt planning", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("builds four copy-only image asset plans with false side effects", () => {
    const plan = buildCommerceImagePromptPlan(candidateFixture(), {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(plan.candidate_id).toBe("candidate-image-plan-001");
    expect(plan.image_assets.map((asset) => asset.type)).toEqual([
      "main_product",
      "benefit_scene",
      "hook_thumbnail",
      "comparison_card"
    ]);
    expect(plan.side_effects).toEqual({
      image_generated: false,
      video_generated: false,
      uploaded: false,
      worker_job_created: false,
      queue_created: false
    });
    expect(plan.image_assets.every((asset) => asset.prompt.length > 40)).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("adds risk flags and conservative safety notes for high-risk categories", () => {
    const plan = buildCommerceImagePromptPlan(
      candidateFixture({
        id: "candidate-risk-001",
        product_name: "비타민 건강식품",
        category: "건강식품",
        payload: {
          keyword: "건강 선물",
          category_path: "건강식품/비타민"
        }
      })
    );

    expect(plan.risk_flags).toContain("high_risk_category:건강식품");
    expect(plan.image_assets.find((asset) => asset.type === "hook_thumbnail")?.recommended_aspect_ratio).toBe("9:16");
    expect(plan.image_assets.find((asset) => asset.type === "hook_thumbnail")?.safety_notes.join(" ")).toContain("효능");
    expect(plan.image_assets.find((asset) => asset.type === "comparison_card")?.prompt).toContain("before and after comparison card");
  });

  test("GET /api/candidates/[id]/image-plan returns plan without creating queue or worker jobs", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await getCandidateImagePlan(
      new Request("http://localhost/api/candidates/candidate-image-plan-001/image-plan"),
      { params: Promise.resolve({ id: "candidate-image-plan-001" }) }
    );
    const payload = await readJson(response);
    const queue = await repository.getQueue();
    const jobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.plan).toMatchObject({
      candidate_id: "candidate-image-plan-001",
      side_effects: {
        image_generated: false,
        video_generated: false,
        uploaded: false,
        worker_job_created: false,
        queue_created: false
      }
    });
    expect((payload.plan as { image_assets: unknown[] }).image_assets).toHaveLength(4);
    expect(queue).toHaveLength(queueBefore.length);
    expect(jobs).toHaveLength(jobsBefore.length);
  });

  test("GET /api/candidates/[id]/image-plan returns safe 404 for missing candidate", async () => {
    const response = await getCandidateImagePlan(
      new Request("http://localhost/api/candidates/missing-candidate/image-plan"),
      { params: Promise.resolve({ id: "missing-candidate" }) }
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "CANDIDATE_NOT_FOUND",
      side_effects: {
        image_generated: false,
        video_generated: false,
        uploaded: false,
        worker_job_created: false,
        queue_created: false
      }
    });
  });
});
