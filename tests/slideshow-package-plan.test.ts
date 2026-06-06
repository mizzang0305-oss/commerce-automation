import { beforeEach, describe, expect, test } from "vitest";
import { POST as postSlideshowPackagePlan } from "../app/api/candidates/[id]/slideshow-package-plan/route";
import { buildSlideshowPackagePlan, slideshowPackagePlanSideEffects } from "@/lib/slideshow-package";
import type { SelectedImageAssetPlan } from "@/lib/image-qa-import/types";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-slideshow-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-slideshow-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-slideshow-001",
    category: "Home office",
    payload: {
      keyword: "desk organization",
      category_path: "Home office/Storage"
    },
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides
  };
}

function readySelectedImageAssetPlan(): SelectedImageAssetPlan {
  const assetTypes = ["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"] as const;
  const selected_assets = assetTypes.map((assetType) => ({
    id: `candidate-slideshow-001-${assetType}-qa-import-candidate`,
    candidate_id: "candidate-slideshow-001",
    asset_type: assetType,
    expected_filename: `candidate-slideshow-001_${assetType}_v001.png`,
    provided_filename: `candidate-slideshow-001_${assetType}_v001.png`,
    provided_path: `commerce-assets/output/generated/candidate-slideshow-001/candidate-slideshow-001_${assetType}_v001.png`,
    source: "manual_manifest" as const,
    qa_status: assetType === "hook_thumbnail" ? ("selected" as const) : ("passed" as const),
    qa_notes: ["Manual QA accepted as text only."],
    qa_checklist: ["Image passed manual QA."],
    safety_flags: ["No fake claims."]
  }));

  return {
    id: "candidate-slideshow-001-selected-image-assets",
    candidate_id: "candidate-slideshow-001",
    selected_assets,
    required_asset_types: [...assetTypes],
    missing_required_asset_types: [],
    ready_for_slideshow_plan: true,
    next_step: "slideshow_package_plan"
  };
}

function notReadySelectedImageAssetPlan(): SelectedImageAssetPlan {
  const ready = readySelectedImageAssetPlan();
  return {
    ...ready,
    selected_assets: ready.selected_assets.slice(0, 2),
    missing_required_asset_types: ["hook_thumbnail", "comparison_card"],
    ready_for_slideshow_plan: false,
    next_step: "manual_review"
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("selected image slideshow package plan", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("builds a plan-only 15-second slideshow package from selected images", () => {
    const plan = buildSlideshowPackagePlan(candidateFixture(), readySelectedImageAssetPlan(), {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(plan).toMatchObject({
      id: "candidate-slideshow-001-slideshow-package-plan",
      candidate_id: "candidate-slideshow-001",
      mode: "selected_image_slideshow_package_plan",
      package_type: "manual_slideshow_plan",
      format: "shorts_9_16",
      duration_sec: 15,
      side_effects: slideshowPackagePlanSideEffects,
      approval_required: true
    });
    expect(plan.ready_for_slideshow_plan).toBe(true);
    expect(plan.timeline.length).toBeGreaterThanOrEqual(4);
    expect(plan.timeline.length).toBeLessThanOrEqual(6);
    expect(plan.timeline[0]).toMatchObject({ start_sec: 0 });
    expect(plan.timeline.at(-1)).toMatchObject({ end_sec: 15 });
    expect(plan.timeline.reduce((total, item) => total + item.duration_sec, 0)).toBe(15);
    expect(plan.image_sequence).toEqual(expect.arrayContaining([
      expect.stringContaining("main_product"),
      expect.stringContaining("benefit_scene"),
      expect.stringContaining("hook_thumbnail"),
      expect.stringContaining("comparison_card")
    ]));
    expect(plan.cta).toContain("구매 전");
    expect(plan.affiliate_disclosure_reminder).toContain("쿠팡파트너스");
    expect(plan.ffmpeg_preview.ffmpeg_command_preview).toContain("ffmpeg");
    expect(plan.moviepy_preview.moviepy_script_preview).toContain("Preview only");
    expect(plan.ffmpeg_preview.command_execution_allowed).toBe(false);
    expect(plan.moviepy_preview.command_execution_allowed).toBe(false);
    expect(plan.manual_render_checklist.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("keeps package readiness blocked when selected image assets are not ready", () => {
    const plan = buildSlideshowPackagePlan(candidateFixture(), notReadySelectedImageAssetPlan(), {
      now: "2026-06-06T00:00:00.000Z"
    });

    expect(plan.ready_for_slideshow_plan).toBe(false);
    expect(plan.selected_image_asset_plan.next_step).toBe("manual_review");
    expect(plan.selected_image_asset_plan.missing_required_asset_types).toEqual(["hook_thumbnail", "comparison_card"]);
    expect(plan.next_step_after_plan).toContain("Resolve missing or rejected image assets before local slideshow generation.");
    expect(plan.ffmpeg_preview.command_execution_allowed).toBe(false);
    expect(plan.moviepy_preview.command_execution_allowed).toBe(false);
    expect(plan.side_effects).toEqual(slideshowPackagePlanSideEffects);
  });

  test("POST /api/candidates/[id]/slideshow-package-plan returns a plan without queue or worker writes", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postSlideshowPackagePlan(
      new Request("http://localhost/api/candidates/candidate-slideshow-001/slideshow-package-plan", {
        method: "POST",
        body: JSON.stringify({
          selected_image_asset_plan: readySelectedImageAssetPlan()
        })
      }),
      { params: Promise.resolve({ id: "candidate-slideshow-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      candidate_id: "candidate-slideshow-001",
      side_effects: slideshowPackagePlanSideEffects,
      approval_required: true
    });
    expect(payload.slideshow_package_plan).toMatchObject({
      mode: "selected_image_slideshow_package_plan",
      ready_for_slideshow_plan: true,
      side_effects: slideshowPackagePlanSideEffects,
      approval_required: true
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
