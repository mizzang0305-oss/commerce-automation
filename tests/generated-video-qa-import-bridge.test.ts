import { beforeEach, describe, expect, test } from "vitest";
import { POST as postGeneratedVideoQaImportPlan } from "../app/api/candidates/[id]/generated-video-qa-import-plan/route";
import {
  buildGeneratedVideoQaImportPlan,
  generatedVideoQaImportPlanSideEffects,
  parseGeneratedVideoManifest
} from "@/lib/video-qa-import";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-video-qa-001",
    product_name: "Desk organizer slideshow",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-video-qa-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-video-qa-001",
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

function validManifest() {
  return {
    candidate_id: "candidate-video-qa-001",
    videos: [
      {
        provided_filename: "candidate-video-qa-001_short_v001.mp4",
        provided_path: "commerce-assets/video-packages/candidate-video-qa-001/candidate-video-qa-001_short_v001.mp4",
        source: "manual_manifest",
        duration_sec: 15,
        format: "shorts_9_16",
        qa_status: "passed",
        qa_notes: ["Manual video QA passed."]
      }
    ]
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("generated video QA import bridge", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("builds a plan-only generated video QA import plan from a valid manifest", () => {
    const manifest = parseGeneratedVideoManifest(JSON.stringify(validManifest()));
    const plan = buildGeneratedVideoQaImportPlan(candidateFixture(), manifest, {
      now: "2026-06-07T00:00:00.000Z"
    });

    expect(plan).toMatchObject({
      id: "candidate-video-qa-001-generated-video-qa-import-plan",
      candidate_id: "candidate-video-qa-001",
      mode: "generated_video_qa_import_bridge",
      package_type: "manual_video_qa_import_plan",
      ready_for_manual_upload_package: true,
      side_effects: generatedVideoQaImportPlanSideEffects,
      approval_required: true
    });
    expect(plan.videos).toHaveLength(1);
    expect(plan.videos[0]).toMatchObject({
      provided_filename: "candidate-video-qa-001_short_v001.mp4",
      source: "manual_manifest",
      duration_sec: 15,
      format: "shorts_9_16",
      qa_status: "passed"
    });
    expect(plan.qa_markdown).toContain("candidate-video-qa-001_short_v001.mp4");
    expect(plan.import_manifest_json).toContain("candidate-video-qa-001_short_v001.mp4");
    expect(JSON.stringify(plan)).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|Authorization: Bearer/i);
  });

  test("rejects invalid qa_status values before plan creation", () => {
    const manifest = validManifest();
    manifest.videos[0].qa_status = "uploaded";

    expect(() => parseGeneratedVideoManifest(JSON.stringify(manifest))).toThrow(/qa_status/i);
  });

  test("keeps manual upload package readiness false when all videos are rejected", () => {
    const manifest = validManifest();
    manifest.videos[0].qa_status = "rejected";
    const parsed = parseGeneratedVideoManifest(JSON.stringify(manifest));
    const plan = buildGeneratedVideoQaImportPlan(candidateFixture(), parsed, {
      now: "2026-06-07T00:00:00.000Z"
    });

    expect(plan.ready_for_manual_upload_package).toBe(false);
    expect(plan.missing_requirements).toContain("At least one passed or selected_for_manual_upload video is required.");
    expect(plan.side_effects).toEqual(generatedVideoQaImportPlanSideEffects);
  });

  test("marks null duration as requiring manual review instead of reading metadata", () => {
    const manifest = validManifest();
    manifest.videos[0].duration_sec = null;
    const parsed = parseGeneratedVideoManifest(JSON.stringify(manifest));
    const plan = buildGeneratedVideoQaImportPlan(candidateFixture(), parsed, {
      now: "2026-06-07T00:00:00.000Z"
    });

    expect(plan.ready_for_manual_upload_package).toBe(false);
    expect(plan.missing_requirements).toContain("Video duration must be manually confirmed between 10 and 60 seconds.");
    expect(plan.videos[0].qa_checklist).toContain("Confirm video duration manually; this bridge does not read video metadata.");
  });

  test("POST /api/candidates/[id]/generated-video-qa-import-plan returns a plan without queue or worker writes", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postGeneratedVideoQaImportPlan(
      new Request("http://localhost/api/candidates/candidate-video-qa-001/generated-video-qa-import-plan", {
        method: "POST",
        body: JSON.stringify({
          manifest_text: JSON.stringify(validManifest())
        })
      }),
      { params: Promise.resolve({ id: "candidate-video-qa-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      candidate_id: "candidate-video-qa-001",
      side_effects: generatedVideoQaImportPlanSideEffects,
      approval_required: true
    });
    expect(payload.generated_video_qa_import_plan).toMatchObject({
      mode: "generated_video_qa_import_bridge",
      ready_for_manual_upload_package: true,
      side_effects: generatedVideoQaImportPlanSideEffects,
      approval_required: true
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
  });
});
