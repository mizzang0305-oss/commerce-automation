import { beforeEach, describe, expect, test } from "vitest";
import { GET as getPlannerDaily } from "../app/api/planner/daily/route";
import { POST as seedDevQueue } from "../app/api/dev/seed/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("event planner APIs", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_REDIRECT_URI;
  });

  test("GET /api/planner/daily returns a safe manual-only production plan", async () => {
    await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "candidate-video-smoke" })
      })
    );

    const response = await getPlannerDaily(new Request("http://localhost/api/planner/daily?date=2026-12-01"));
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.youtube).toMatchObject({
      oauth_configured: false,
      upload_enabled: false,
      manual_upload_only: true
    });
    expect(serialized).not.toContain("YOUTUBE_CLIENT_SECRET");
    expect(serialized).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(serialized).not.toContain("WORKER_API_SECRET");
  });

  test("candidate-video-smoke seed creates only a candidate and no worker job", async () => {
    const response = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "candidate-video-smoke" })
      })
    );
    const payload = await readJson(response);
    const candidates = await getAutomationRepository().getProductCandidates({ search: "Candidate Video Smoke" });
    const jobs = await getAutomationRepository().getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      mode: "candidate-video-smoke",
      candidate_id: "candidate-video-smoke-001"
    });
    expect(candidates[0]).toMatchObject({
      id: "candidate-video-smoke-001",
      selected_affiliate_url: expect.stringContaining("https://link.coupang.com"),
      product_key: "test:candidate-video-smoke-001",
      duplicate_status: "unique",
      promotion_status: "ready",
      source_type: "event",
      platform: "test"
    });
    expect(jobs).toHaveLength(0);
  });

  test("candidate-video-smoke seed returns a safe JSON error when candidate storage fails", async () => {
    const repository = getAutomationRepository();
    repository.upsertProductCandidates = async () => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY raw-secret R2_SECRET WORKER_API_SECRET failed");
    };

    const response = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "candidate-video-smoke" })
      })
    );
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      ok: false,
      mode: "candidate-video-smoke",
      error_code: "DEV_SEED_FAILED",
      message: "개발용 seed 생성 중 오류가 발생했습니다."
    });
    expect(serialized).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(serialized).not.toContain("R2_SECRET");
    expect(serialized).not.toContain("WORKER_API_SECRET");
    expect(serialized).not.toContain("raw-secret");
  });
});
