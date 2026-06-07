import { beforeEach, describe, expect, test } from "vitest";
import { POST as postLocalSlideshowRenderPackage } from "../app/api/candidates/[id]/local-slideshow-render-package/route";
import type { SelectedImageAssetPlan } from "@/lib/image-qa-import/types";
import {
  buildLocalSlideshowRenderPackage,
  localSlideshowRenderConfirmationPhrase,
  localSlideshowRenderSideEffects
} from "@/lib/local-slideshow-render";
import { buildSlideshowPackagePlan } from "@/lib/slideshow-package";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-local-render-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-local-render-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-local-render-001",
    category: "Home office",
    payload: {
      keyword: "desk organization",
      category_path: "Home office/Storage"
    },
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}

function readySelectedImageAssetPlan(candidateId = "candidate-local-render-001"): SelectedImageAssetPlan {
  const assetTypes = ["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"] as const;
  const selected_assets = assetTypes.map((assetType) => ({
    id: `${candidateId}-${assetType}-qa-import-candidate`,
    candidate_id: candidateId,
    asset_type: assetType,
    expected_filename: `${candidateId}_${assetType}_v001.png`,
    provided_filename: `${candidateId}_${assetType}_v001.png`,
    provided_path: `commerce-assets/output/generated/${candidateId}/${candidateId}_${assetType}_v001.png`,
    source: "manual_manifest" as const,
    qa_status: assetType === "hook_thumbnail" ? ("selected" as const) : ("passed" as const),
    qa_notes: ["Manual QA accepted as text only."],
    qa_checklist: ["Image passed manual QA."],
    safety_flags: ["No fake claims."]
  }));

  return {
    id: `${candidateId}-selected-image-assets`,
    candidate_id: candidateId,
    selected_assets,
    required_asset_types: [...assetTypes],
    missing_required_asset_types: [],
    ready_for_slideshow_plan: true,
    next_step: "slideshow_package_plan"
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("approval-gated local slideshow render bridge", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("requires exact confirmation before preparing the local render package", () => {
    const candidate = candidateFixture();
    const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, readySelectedImageAssetPlan(), {
      now: "2026-06-07T00:00:00.000Z"
    });

    const packagePreview = buildLocalSlideshowRenderPackage(candidate, slideshowPackagePlan, {
      confirmation: "WRONG_CONFIRMATION",
      now: "2026-06-07T00:00:00.000Z"
    });

    expect(packagePreview.confirmation_required).toBe(localSlideshowRenderConfirmationPhrase);
    expect(packagePreview.confirmation_matched).toBe(false);
    expect(packagePreview.execution_enabled).toBe(false);
    expect(packagePreview.side_effects).toEqual(localSlideshowRenderSideEffects);
    expect(packagePreview.ffmpeg_command_preview).toContain("ffmpeg");
    expect(packagePreview.moviepy_script_preview).toContain("Preview only");
  });

  test("marks confirmation as matched while keeping execution disabled and side effects false", () => {
    const candidate = candidateFixture();
    const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, readySelectedImageAssetPlan(), {
      now: "2026-06-07T00:00:00.000Z"
    });

    const packagePreview = buildLocalSlideshowRenderPackage(candidate, slideshowPackagePlan, {
      confirmation: localSlideshowRenderConfirmationPhrase,
      now: "2026-06-07T00:00:00.000Z"
    });

    expect(packagePreview).toMatchObject({
      id: "candidate-local-render-001-local-slideshow-render-package",
      candidate_id: "candidate-local-render-001",
      mode: "local_slideshow_render_bridge",
      package_type: "manual_local_render_package",
      confirmation_required: localSlideshowRenderConfirmationPhrase,
      confirmation_matched: true,
      execution_enabled: false,
      side_effects: localSlideshowRenderSideEffects,
      approval_required: true
    });
    expect(packagePreview.powershell_steps_markdown).toContain("Copy only");
    expect(packagePreview.input_assets_checklist.length).toBeGreaterThanOrEqual(4);
    expect(packagePreview.output_paths).toEqual(expect.arrayContaining([
      expect.stringContaining("commerce-assets/output/slideshow"),
      expect.stringContaining("commerce-assets/output/video-packages")
    ]));
    expect(packagePreview.manual_execution_checklist).toContain("Run FFmpeg/MoviePy manually only after separate explicit execution approval.");
    expect(JSON.stringify(packagePreview)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("POST /api/candidates/[id]/local-slideshow-render-package rejects wrong confirmation without writes", async () => {
    const repository = getAutomationRepository();
    const candidate = candidateFixture();
    await repository.upsertProductCandidates([candidate]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();
    const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, readySelectedImageAssetPlan());

    const response = await postLocalSlideshowRenderPackage(
      new Request("http://localhost/api/candidates/candidate-local-render-001/local-slideshow-render-package", {
        method: "POST",
        body: JSON.stringify({
          confirmation: "WRONG_CONFIRMATION",
          slideshow_package_plan: slideshowPackagePlan
        })
      }),
      { params: Promise.resolve({ id: "candidate-local-render-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "CONFIRMATION_REQUIRED",
      confirmation_required: localSlideshowRenderConfirmationPhrase,
      side_effects: localSlideshowRenderSideEffects,
      approval_required: true
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });

  test("POST /api/candidates/[id]/local-slideshow-render-package returns copy-only render package", async () => {
    const repository = getAutomationRepository();
    const candidate = candidateFixture();
    await repository.upsertProductCandidates([candidate]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();
    const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, readySelectedImageAssetPlan());

    const response = await postLocalSlideshowRenderPackage(
      new Request("http://localhost/api/candidates/candidate-local-render-001/local-slideshow-render-package", {
        method: "POST",
        body: JSON.stringify({
          confirmation: localSlideshowRenderConfirmationPhrase,
          slideshow_package_plan: slideshowPackagePlan
        })
      }),
      { params: Promise.resolve({ id: "candidate-local-render-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      candidate_id: "candidate-local-render-001",
      side_effects: localSlideshowRenderSideEffects,
      approval_required: true
    });
    expect(payload.local_slideshow_render_package).toMatchObject({
      mode: "local_slideshow_render_bridge",
      confirmation_matched: true,
      execution_enabled: false,
      side_effects: localSlideshowRenderSideEffects,
      approval_required: true
    });
    expect(JSON.stringify(payload)).not.toMatch(/child_process|execa|spawn\(|exec\(|subprocess/i);
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
