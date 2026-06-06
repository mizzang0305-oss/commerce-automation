import { beforeEach, describe, expect, test } from "vitest";
import { GET as getCandidateImageVideoPlan } from "../app/api/candidates/[id]/image-video-plan/route";
import { buildCommerceImagePromptPlan } from "@/lib/image-prompts/prompt-builder";
import { buildCommerceVideoPlan } from "@/lib/video-plans/buildCommerceVideoPlan";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-image-video-plan-001",
    product_name: "Compact desk organizer",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-image-video-plan-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-image-video-plan-001",
    category: "Home office",
    payload: {
      keyword: "desk organization",
      category_path: "Home office/Storage",
      thumbnail_url: "https://image.example.com/candidate-image-video-plan-001.jpg"
    },
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("commerce image and video planning", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("generates a 15-second copy-only VideoPlan from the image plan", () => {
    const imagePlan = buildCommerceImagePromptPlan(candidateFixture(), {
      now: "2026-06-06T00:00:00.000Z"
    });
    const videoPlan = buildCommerceVideoPlan(imagePlan, {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(videoPlan).toMatchObject({
      product_candidate_id: "candidate-image-video-plan-001",
      duration_sec: 15,
      format: "shorts_9_16",
      side_effects: {
        scraped_live_web: false,
        external_api_called: false,
        image_generated: false,
        video_generated: false,
        uploaded: false,
        db_written: false,
        file_uploaded: false,
        payment_triggered: false,
        message_sent: false,
        deployment_triggered: false,
        worker_job_created: false,
        queue_created: false
      },
      approval_required: true
    });
    expect(videoPlan.shot_list.length).toBeGreaterThanOrEqual(4);
    expect(videoPlan.shot_list.length).toBeLessThanOrEqual(6);
    expect(videoPlan.shot_list[0]).toMatchObject({ start_sec: 0, image_asset_type: "hook_thumbnail" });
    expect(videoPlan.shot_list.at(-1)).toMatchObject({ end_sec: 15 });
    expect(new Set(videoPlan.required_image_assets)).toEqual(
      new Set(["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"])
    );
    expect(videoPlan.narration_script.length).toBeGreaterThan(80);
    expect(videoPlan.subtitle_lines.length).toBeGreaterThanOrEqual(4);
    expect(videoPlan.cta).toContain("Coupang");
    expect(videoPlan.affiliate_disclosure_reminder).toContain("Coupang Partners");
    expect(JSON.stringify(videoPlan)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("GET /api/candidates/[id]/image-video-plan returns image and video plans without side effects", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await getCandidateImageVideoPlan(
      new Request("http://localhost/api/candidates/candidate-image-video-plan-001/image-video-plan"),
      { params: Promise.resolve({ id: "candidate-image-video-plan-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      candidate_id: "candidate-image-video-plan-001",
      side_effects: {
        scraped_live_web: false,
        external_api_called: false,
        image_generated: false,
        video_generated: false,
        uploaded: false,
        db_written: false,
        file_uploaded: false,
        payment_triggered: false,
        message_sent: false,
        deployment_triggered: false,
        worker_job_created: false,
        queue_created: false
      },
      approval_required: true
    });
    expect((payload.image_asset_plans as unknown[])).toHaveLength(4);
    expect(payload.video_plan).toMatchObject({
      duration_sec: 15,
      format: "shorts_9_16",
      approval_required: true
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
