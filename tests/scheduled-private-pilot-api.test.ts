import { afterEach, describe, expect, test, vi } from "vitest";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { POST } from "../app/api/automation/scheduled-private-pilot/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("scheduled private pilot authenticated API", () => {
  test("creates the authoritative queue but defers Worker dispatch until actual usage evidence exists", async () => {
    const repository = resetMockRepositoryForTests();
    for (const item of await repository.getQueue()) {
      await repository.updateQueueItemById(item.id, { queue_status: "hold" });
    }
    await repository.updateSettings({
      is_paused: false,
      python_worker_enabled: true,
      allowed_worker_job_types: ["video_render"],
      batch_size: 1,
      max_daily_videos: 1
    });
    const secret = "scheduled-api-test-secret-0123456789";
    vi.stubEnv("SCHEDULED_PRIVATE_PILOT_API_SECRET", secret);
    vi.stubEnv("SCHEDULED_PRIVATE_PILOT_ENABLED", "true");
    vi.stubEnv("COUPANG_PARTNERS_PROVIDER_ENABLED", "true");
    vi.stubEnv("COUPANG_PARTNERS_ACCESS_KEY", "configured-access");
    vi.stubEnv("COUPANG_PARTNERS_SECRET_KEY", "configured-secret");
    vi.stubEnv("COUPANG_PARTNER_ID", "configured-partner");
    vi.stubEnv("WORKER_VISUAL_BINDING_SECRET", "scheduled-worker-binding-0123456789abcdef");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: {
        productData: [{
          productId: 987654321,
          productName: "여름철 실제 사용 제습기",
          productUrl: "https://link.coupang.com/a/scheduled-api",
          productImage: "https://image.example.com/product.jpg",
          productPrice: 99000,
          categoryName: "생활가전"
        }]
      }
    }), { status: 200 })));

    const response = await POST(new Request("http://localhost/api/automation/scheduled-private-pilot", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ slot_id: "morning_commute" })
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      worker_dispatch: {
        attempted: false,
        created_jobs: 0,
        guarded_items: 1,
        ok: true,
        deferred: true,
        blocker: "ACTUAL_USAGE_SCENE_EVIDENCE_REQUIRED_BEFORE_WORKER_DISPATCH"
      },
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      COMMENT_AUTOMATION_ENABLED: false,
      MAX_PRIVATE_PILOT_ITEMS: 1,
      FAKE_SUCCESS: false,
      upload_executor_called: false,
      videos_insert_called: false,
      raw_coupang_url_exposed: false
    });
    expect(await repository.getWorkerJobs()).toHaveLength(0);
    expect((await repository.getQueueItem(payload.queue_id))?.queue_status).toBe("manual_review");
    expect(JSON.stringify(payload)).not.toContain("www.coupang.com");
    expect(JSON.stringify(payload)).not.toContain("link.coupang.com");
  });
});
