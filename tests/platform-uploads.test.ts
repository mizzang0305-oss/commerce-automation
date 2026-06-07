import { beforeEach, describe, expect, test } from "vitest";
import { GET as getPlatformReadiness } from "../app/api/uploads/platform-readiness/route";
import { POST as postPlatformUploadPlan } from "../app/api/candidates/[id]/platform-upload-plan/route";
import { buildPlatformUploadReadiness, createDefaultPlatformUploadSettings } from "@/lib/uploads/platformUploadCore";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-platform-upload-001",
    product_name: "Desk organizer set",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-platform-upload-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-platform-upload-001",
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

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("platform upload core and readiness gates", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("uses disabled provider defaults with manual upload only", () => {
    const settings = createDefaultPlatformUploadSettings();

    expect(settings).toMatchObject({
      youtube_upload_enabled: false,
      tiktok_upload_enabled: false,
      threads_upload_enabled: false,
      public_upload_enabled: false,
      manual_upload_only: true,
      approval_required: true,
      default_visibility: "private",
      max_daily_uploads: 6
    });
  });

  test("readiness blocks every provider without token, scopes, quota, account, policy, and enabled state", () => {
    const readiness = buildPlatformUploadReadiness(createDefaultPlatformUploadSettings());

    expect(readiness).toHaveLength(3);
    expect(readiness.map((item) => item.provider)).toEqual(["youtube", "tiktok", "threads"]);
    for (const item of readiness) {
      expect(item).toMatchObject({
        configured: false,
        token_ready: false,
        scopes_ready: false,
        quota_ready: false,
        account_ready: false,
        policy_ready: false,
        upload_enabled: false,
        can_upload: false
      });
      expect(item.blocked_reasons).toContain("upload_disabled");
      expect(item.blocked_reasons).toContain("token_not_ready");
      expect(item.blocked_reasons).toContain("scopes_not_ready");
    }
  });

  test("GET /api/uploads/platform-readiness returns safe readiness without secrets or side effects", async () => {
    const response = await getPlatformReadiness(new Request("http://localhost/api/uploads/platform-readiness"));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      settings: {
        youtube_upload_enabled: false,
        tiktok_upload_enabled: false,
        threads_upload_enabled: false,
        public_upload_enabled: false,
        manual_upload_only: true,
        approval_required: true
      },
      side_effects: {
        uploaded: false,
        platform_api_called: false,
        token_exchanged: false,
        token_stored: false,
        db_written: false,
        queue_created: false,
        worker_job_created: false,
        upload_package_created: false
      }
    });
    expect((payload.readiness as unknown[])).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|refresh_token|Authorization: Bearer/i);
  });

  test("blocks upload plan when required title, copy, disclosure, affiliate URL, video path, provider targets, or visibility are missing", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([
      candidateFixture({ id: "candidate-no-affiliate", selected_affiliate_url: "" })
    ]);

    const missingRequiredInputs = await postPlatformUploadPlan(
      new Request("http://localhost/api/candidates/candidate-no-affiliate/platform-upload-plan", {
        method: "POST",
        body: JSON.stringify({
          disclosure_text: "Affiliate disclosure."
        })
      }),
      { params: Promise.resolve({ id: "candidate-no-affiliate" }) }
    );
    const missingRequiredInputsPayload = await readJson(missingRequiredInputs);
    expect(missingRequiredInputs.status).toBe(400);
    expect(missingRequiredInputsPayload).toMatchObject({
      ok: false,
      error_code: "PLATFORM_UPLOAD_PLAN_NOT_READY",
      missing_reasons: expect.arrayContaining([
        "selected_affiliate_url",
        "video_path_or_url",
        "title",
        "description_or_caption",
        "provider_targets",
        "visibility"
      ])
    });

    await repository.upsertProductCandidates([candidateFixture()]);
    const missingDisclosure = await postPlatformUploadPlan(
      new Request("http://localhost/api/candidates/candidate-platform-upload-001/platform-upload-plan", {
        method: "POST",
        body: JSON.stringify({
          video_path_or_url: "commerce-assets/output/video-packages/candidate-platform-upload-001/shorts.mp4",
          title: "Desk organizer set quick review",
          description: "Manual upload description.",
          provider_targets: ["youtube"],
          visibility: "private"
        })
      }),
      { params: Promise.resolve({ id: "candidate-platform-upload-001" }) }
    );
    const missingDisclosurePayload = await readJson(missingDisclosure);
    expect(missingDisclosure.status).toBe(400);
    expect(missingDisclosurePayload).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["disclosure_text"])
    });
  });

  test("creates a copy-only upload job plan with all side effects false and no queue or worker jobs", async () => {
    const repository = getAutomationRepository();
    await repository.upsertProductCandidates([candidateFixture()]);
    const queueBefore = await repository.getQueue();
    const jobsBefore = await repository.getWorkerJobs();

    const response = await postPlatformUploadPlan(
      new Request("http://localhost/api/candidates/candidate-platform-upload-001/platform-upload-plan", {
        method: "POST",
        body: JSON.stringify({
          video_path_or_url: "commerce-assets/output/video-packages/candidate-platform-upload-001/shorts.mp4",
          title: "Desk organizer set quick review",
          description: "A manual upload draft for a product short.",
          disclosure_text: "This content includes affiliate links.",
          provider_targets: ["youtube", "tiktok", "threads"],
          visibility: "private"
        })
      }),
      { params: Promise.resolve({ id: "candidate-platform-upload-001" }) }
    );
    const payload = await readJson(response);
    const queueAfter = await repository.getQueue();
    const jobsAfter = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      plan: {
        candidate_id: "candidate-platform-upload-001",
        selected_affiliate_url: "https://link.coupang.com/a/candidate-platform-upload-001",
        provider_targets: ["youtube", "tiktok", "threads"],
        visibility: "private",
        approval_required: true,
        side_effects: {
          uploaded: false,
          platform_api_called: false,
          token_exchanged: false,
          token_stored: false,
          db_written: false,
          queue_created: false,
          worker_job_created: false,
          upload_package_created: false
        }
      }
    });
    expect(queueAfter).toHaveLength(queueBefore.length);
    expect(jobsAfter).toHaveLength(jobsBefore.length);
    expect(JSON.stringify(payload)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|refresh_token|Authorization: Bearer/i);
  });
});
