import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as postLocalSlideshowRenderExecution } from "../app/api/candidates/[id]/execute-local-slideshow-render/route";
import type { SelectedImageAssetPlan } from "@/lib/image-qa-import/types";
import {
  localSlideshowRenderConfirmationPhrase,
  buildLocalSlideshowRenderPackage
} from "@/lib/local-slideshow-render";
import { buildSlideshowPackagePlan } from "@/lib/slideshow-package";
import {
  localSlideshowExecutionConfirmationPhrase,
  localSlideshowExecutionSafeBlockedSideEffects,
  isAllowedLocalRenderPath
} from "@/lib/local-slideshow-execution";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

vi.mock("@/lib/local-slideshow-execution/runLocalSlideshowExecution", () => ({
  runLocalSlideshowExecution: vi.fn(async ({ candidateId }: { candidateId: string }) => ({
    id: `${candidateId}-local-slideshow-render-execution`,
    candidate_id: candidateId,
    mode: "local_slideshow_render_execution",
    confirmation_required: "APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION",
    confirmation_matched: true,
    render_engine: "ffmpeg",
    execution_attempted: true,
    execution_succeeded: true,
    output_video_path: `commerce-assets/output/video-packages/${candidateId}/${candidateId}_shorts_v001.mp4`,
    output_manifest_path: `commerce-assets/output/video-packages/${candidateId}/${candidateId}_shorts_v001.manifest.json`,
    output_report_path: `commerce-assets/output/video-packages/${candidateId}/${candidateId}_shorts_v001.render-report.json`,
    logs_preview: ["ffmpeg completed"],
    warnings: [],
    side_effects: {
      external_api_called: false,
      db_written: false,
      file_uploaded: false,
      payment_triggered: false,
      message_sent: false,
      deployment_triggered: false,
      local_file_read: true,
      local_file_written: true,
      video_generated: true,
      ffmpeg_executed: true,
      moviepy_executed: false,
      uploaded: false,
      upload_package_created: false,
      worker_job_created: false,
      queue_created: false,
      r2_uploaded: false
    },
    approval_required: true
  }))
}));

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-local-execution-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-local-execution-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-local-execution-001",
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

function readySelectedImageAssetPlan(candidateId = "candidate-local-execution-001"): SelectedImageAssetPlan {
  const assetTypes = ["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"] as const;
  const selected_assets = assetTypes.map((assetType) => ({
    id: `${candidateId}-${assetType}-qa-import-candidate`,
    candidate_id: candidateId,
    asset_type: assetType,
    expected_filename: `${candidateId}_${assetType}_v001.png`,
    provided_filename: `${candidateId}_${assetType}_v001.png`,
    provided_path: `commerce-assets/output/selected/${candidateId}/${candidateId}_${assetType}_v001.png`,
    source: "manual_manifest" as const,
    qa_status: assetType === "hook_thumbnail" ? ("selected" as const) : ("passed" as const),
    qa_notes: ["Manual QA accepted."],
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

function renderPackageFixture(candidate = candidateFixture()) {
  const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, readySelectedImageAssetPlan(candidate.id), {
    now: "2026-06-07T00:00:00.000Z"
  });
  return buildLocalSlideshowRenderPackage(candidate, slideshowPackagePlan, {
    confirmation: localSlideshowRenderConfirmationPhrase,
    now: "2026-06-07T00:00:00.000Z"
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("approval-gated local slideshow render execution", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    vi.clearAllMocks();
  });

  test("validates allowed local render paths", () => {
    expect(isAllowedLocalRenderPath("commerce-assets/output/generated/candidate-1/main.png")).toBe(true);
    expect(isAllowedLocalRenderPath("commerce-assets/output/selected/candidate-1/main.png")).toBe(true);
    expect(isAllowedLocalRenderPath("G:/My Drive/commerce-assets/generated/candidate-1/main.png")).toBe(true);
    expect(isAllowedLocalRenderPath("G:/My Drive/commerce-assets/selected/candidate-1/main.png")).toBe(true);
    expect(isAllowedLocalRenderPath("tests/fixtures/local-slideshow-render/main.png")).toBe(true);
    expect(isAllowedLocalRenderPath("C:/Windows/System32/calc.exe")).toBe(false);
    expect(isAllowedLocalRenderPath("../outside/main.png")).toBe(false);
  });

  test("rejects wrong confirmation without local execution or repository writes", async () => {
    const repository = getAutomationRepository();
    const candidate = candidateFixture();
    await repository.upsertProductCandidates([candidate]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postLocalSlideshowRenderExecution(
      new Request("http://localhost/api/candidates/candidate-local-execution-001/execute-local-slideshow-render", {
        method: "POST",
        body: JSON.stringify({
          confirmation: "WRONG_CONFIRMATION",
          render_package: renderPackageFixture(candidate),
          engine_preference: "ffmpeg"
        })
      }),
      { params: Promise.resolve({ id: "candidate-local-execution-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "CONFIRMATION_REQUIRED",
      confirmation_required: localSlideshowExecutionConfirmationPhrase,
      side_effects: localSlideshowExecutionSafeBlockedSideEffects,
      approval_required: true
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });

  test("accepts exact confirmation and returns local-only execution side effects", async () => {
    const repository = getAutomationRepository();
    const candidate = candidateFixture();
    await repository.upsertProductCandidates([candidate]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postLocalSlideshowRenderExecution(
      new Request("http://localhost/api/candidates/candidate-local-execution-001/execute-local-slideshow-render", {
        method: "POST",
        body: JSON.stringify({
          confirmation: localSlideshowExecutionConfirmationPhrase,
          render_package: renderPackageFixture(candidate),
          engine_preference: "ffmpeg"
        })
      }),
      { params: Promise.resolve({ id: "candidate-local-execution-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      candidate_id: "candidate-local-execution-001",
      result: {
        mode: "local_slideshow_render_execution",
        confirmation_matched: true,
        execution_attempted: true,
        execution_succeeded: true,
        render_engine: "ffmpeg",
        side_effects: {
          local_file_read: true,
          local_file_written: true,
          video_generated: true,
          ffmpeg_executed: true,
          moviepy_executed: false,
          external_api_called: false,
          db_written: false,
          uploaded: false,
          upload_package_created: false,
          worker_job_created: false,
          queue_created: false,
          r2_uploaded: false
        },
        approval_required: true
      }
    });
    expect(JSON.stringify(payload)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|R2_SECRET|Authorization: Bearer/i);
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
