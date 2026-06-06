import { beforeEach, describe, expect, test } from "vitest";
import { POST as postImageQaImportPlan } from "../app/api/candidates/[id]/image-qa-import-plan/route";
import { buildLocalImageGenerationPackage } from "@/lib/image-generation-bridge/buildLocalImageGenerationPackage";
import {
  buildImageQaImportPlan,
  imageQaImportSideEffects
} from "@/lib/image-qa-import/buildImageQaImportPlan";
import { validateImageImportManifest } from "@/lib/image-qa-import/validateImageImportManifest";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-image-qa-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-image-qa-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-image-qa-001",
    category: "Home office",
    payload: {
      keyword: "desk organization",
      category_path: "Home office/Storage",
      thumbnail_url: "https://image.example.com/candidate-image-qa-001.jpg"
    },
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("image QA import bridge", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("builds an approval-gated image QA import plan with all side effects false", () => {
    const candidate = candidateFixture();
    const localPackage = buildLocalImageGenerationPackage(candidate, {
      now: "2026-06-06T00:00:00.000Z"
    });
    const plan = buildImageQaImportPlan(candidate, localPackage, undefined, {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(plan).toMatchObject({
      id: "candidate-image-qa-001-image-qa-import-plan",
      candidate_id: "candidate-image-qa-001",
      mode: "image_qa_import_bridge",
      package_type: "manual_image_import_plan",
      side_effects: imageQaImportSideEffects,
      approval_required: true
    });
    expect(plan.assets.map((asset) => asset.asset_type)).toEqual([
      "main_product",
      "benefit_scene",
      "hook_thumbnail",
      "comparison_card"
    ]);
    expect(plan.assets.every((asset) => asset.qa_status === "pending_review")).toBe(true);
    expect(plan.selected_image_asset_plan.ready_for_slideshow_plan).toBe(false);
    expect(plan.selected_image_asset_plan.missing_required_asset_types).toEqual([
      "main_product",
      "benefit_scene",
      "hook_thumbnail",
      "comparison_card"
    ]);
    expect(JSON.parse(plan.import_manifest_json)).toMatchObject({
      candidate_id: "candidate-image-qa-001",
      assets: expect.any(Array)
    });
    expect(plan.qa_markdown).toContain("Image QA Import Plan");
    expect(JSON.stringify(plan)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("validates manifests and reports invalid asset types without file reads", () => {
    const invalid = validateImageImportManifest({
      candidate_id: "candidate-image-qa-001",
      assets: [
        {
          asset_type: "invalid_asset",
          provided_filename: "candidate-image-qa-001_invalid.png",
          provided_path: "commerce-assets/output/generated/candidate-image-qa-001/invalid.png",
          qa_status: "passed"
        }
      ]
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain("assets[0].asset_type must be one of main_product, benefit_scene, hook_thumbnail, comparison_card.");
    expect(invalid.side_effects).toEqual(imageQaImportSideEffects);

    const valid = validateImageImportManifest({
      candidate_id: "candidate-image-qa-001",
      assets: [
        {
          asset_type: "main_product",
          provided_filename: "candidate-image-qa-001_main_product_v001.png",
          provided_path: "commerce-assets/output/generated/candidate-image-qa-001/candidate-image-qa-001_main_product_v001.png",
          qa_status: "passed"
        }
      ]
    });

    expect(valid.ok).toBe(true);
    expect(valid.manifest?.assets[0].asset_type).toBe("main_product");
    expect(valid.warnings).toContain("Missing required asset types: benefit_scene, hook_thumbnail, comparison_card.");
  });

  test("marks slideshow readiness true only when required assets are passed or selected", () => {
    const candidate = candidateFixture();
    const localPackage = buildLocalImageGenerationPackage(candidate, {
      now: "2026-06-06T00:00:00.000Z"
    });
    const plan = buildImageQaImportPlan(
      candidate,
      localPackage,
      {
        candidate_id: "candidate-image-qa-001",
        assets: [
          {
            asset_type: "main_product",
            provided_filename: "candidate-image-qa-001_main_product_v001.png",
            provided_path: "commerce-assets/output/generated/candidate-image-qa-001/candidate-image-qa-001_main_product_v001.png",
            qa_status: "passed"
          },
          {
            asset_type: "benefit_scene",
            provided_filename: "candidate-image-qa-001_benefit_scene_v001.png",
            provided_path: "commerce-assets/output/generated/candidate-image-qa-001/candidate-image-qa-001_benefit_scene_v001.png",
            qa_status: "passed"
          },
          {
            asset_type: "hook_thumbnail",
            provided_filename: "candidate-image-qa-001_hook_thumbnail_v001.png",
            provided_path: "commerce-assets/output/generated/candidate-image-qa-001/candidate-image-qa-001_hook_thumbnail_v001.png",
            qa_status: "selected"
          }
        ]
      },
      { now: "2026-06-06T00:00:00.000Z" }
    );

    expect(plan.selected_image_asset_plan.ready_for_slideshow_plan).toBe(true);
    expect(plan.selected_image_asset_plan.next_step).toBe("slideshow_package_plan");
    expect(plan.selected_image_asset_plan.selected_assets.map((asset) => asset.asset_type)).toEqual([
      "main_product",
      "benefit_scene",
      "hook_thumbnail"
    ]);
    expect(plan.selected_image_asset_plan.missing_required_asset_types).toEqual(["comparison_card"]);
  });

  test("POST /api/candidates/[id]/image-qa-import-plan returns plan without queue or worker writes", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postImageQaImportPlan(
      new Request("http://localhost/api/candidates/candidate-image-qa-001/image-qa-import-plan", {
        method: "POST",
        body: JSON.stringify({
          import_manifest: {
            candidate_id: "candidate-image-qa-001",
            assets: [
              {
                asset_type: "main_product",
                provided_filename: "candidate-image-qa-001_main_product_v001.png",
                provided_path: "commerce-assets/output/generated/candidate-image-qa-001/candidate-image-qa-001_main_product_v001.png",
                qa_status: "passed"
              }
            ]
          }
        })
      }),
      { params: Promise.resolve({ id: "candidate-image-qa-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload).toMatchObject({
      candidate_id: "candidate-image-qa-001",
      side_effects: imageQaImportSideEffects,
      approval_required: true
    });
    expect(payload.image_qa_import_plan).toMatchObject({
      candidate_id: "candidate-image-qa-001",
      approval_required: true,
      side_effects: imageQaImportSideEffects
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
