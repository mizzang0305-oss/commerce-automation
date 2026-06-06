import { beforeEach, describe, expect, test } from "vitest";
import { GET as getLocalImagePackage } from "../app/api/candidates/[id]/local-image-package/route";
import { buildLocalImageGenerationPackage } from "@/lib/image-generation-bridge/buildLocalImageGenerationPackage";
import type { ProductCandidate } from "@/types/automation";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-local-image-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-local-image-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-local-image-001",
    category: "Home office",
    payload: {
      keyword: "desk organization",
      category_path: "Home office/Storage",
      thumbnail_url: "https://image.example.com/candidate-local-image-001.jpg"
    },
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("local image generation bridge", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("builds an approval-gated local package for four image assets without side effects", () => {
    const localPackage = buildLocalImageGenerationPackage(candidateFixture(), {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(localPackage.candidate_id).toBe("candidate-local-image-001");
    expect(localPackage.approval_required).toBe(true);
    expect(localPackage.assets.map((asset) => asset.asset_type)).toEqual([
      "main_product",
      "benefit_scene",
      "hook_thumbnail",
      "comparison_card"
    ]);
    expect(localPackage.assets.map((asset) => asset.suggested_filename)).toEqual([
      "candidate-local-image-001_main_product_v001.png",
      "candidate-local-image-001_benefit_scene_v001.png",
      "candidate-local-image-001_hook_thumbnail_v001.png",
      "candidate-local-image-001_comparison_card_v001.png"
    ]);
    expect(localPackage.local_output_path_suggestion).toBe("commerce-assets/output/generated/candidate-local-image-001/");
    expect(localPackage.google_drive_sync_path_suggestion).toBe(
      "G:/My Drive/commerce-assets/generated/candidate-local-image-001/"
    );
    expect(localPackage.prompt_markdown).toContain("candidate-local-image-001_main_product_v001.png");
    expect(localPackage.qa_checklist).toContain("No fake review, guaranteed effect, best-price, or fabricated discount claim.");
    expect(localPackage.manual_generation_steps).toContain("Copy one prompt into an approved local image generation tool.");
    expect(localPackage.future_import_instruction).toContain("Do not import generated files until a separate image QA/import PR is approved.");
    expect(localPackage.side_effects).toEqual({
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
      queue_created: false,
      local_file_written: false,
      google_drive_api_called: false
    });
    expect(JSON.stringify(localPackage)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("GET /api/candidates/[id]/local-image-package returns package without queue or worker writes", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await getLocalImagePackage(
      new Request("http://localhost/api/candidates/candidate-local-image-001/local-image-package"),
      { params: Promise.resolve({ id: "candidate-local-image-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.package).toMatchObject({
      candidate_id: "candidate-local-image-001",
      approval_required: true,
      side_effects: {
        image_generated: false,
        video_generated: false,
        uploaded: false,
        worker_job_created: false,
        queue_created: false,
        local_file_written: false,
        google_drive_api_called: false
      }
    });
    expect((payload.package as { assets: unknown[] }).assets).toHaveLength(4);
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });

  test("GET /api/candidates/[id]/local-image-package returns safe 404 for missing candidate", async () => {
    const response = await getLocalImagePackage(
      new Request("http://localhost/api/candidates/missing-candidate/local-image-package"),
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
        queue_created: false,
        local_file_written: false,
        google_drive_api_called: false
      }
    });
    expect(JSON.stringify(payload)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });
});
