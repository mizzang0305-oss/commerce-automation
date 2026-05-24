import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET as getSettings, POST as postSettings } from "../app/api/settings/route";
import { GET as getQueue } from "../app/api/queue/route";
import { POST as seedDevQueue } from "../app/api/dev/seed/route";
import { POST as runNightlyScout } from "../app/api/run/nightly-scout/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("api routes", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    delete process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GET /api/settings returns settings without secrets", async () => {
    const response = await getSettings();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.settings).toMatchObject({ daily_target_count: 69 });
    expect(JSON.stringify(payload)).not.toContain("N8N_WEBHOOK_SECRET");
    expect(JSON.stringify(payload)).not.toContain("WEBHOOK_URL");
  });

  test("POST /api/settings saves validated settings", async () => {
    const response = await postSettings(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({ interval_hours: 3 })
      })
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.settings).toMatchObject({ interval_hours: 3 });
  });

  test("GET /api/queue returns seeded queue items", async () => {
    const response = await getQueue(new Request("http://localhost/api/queue?limit=12"));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(12);
  });

  test("POST /api/dev/seed creates a renderable worker smoke item", async () => {
    const response = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "worker-smoke" })
      })
    );
    const payload = await readJson(response);
    const itemId = String(payload.item_id);
    const item = await getAutomationRepository().getQueueItem(itemId);
    const content = await getAutomationRepository().getGeneratedContentByQueueItem(itemId);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, mode: "worker-smoke" });
    expect(item).toMatchObject({
      id: itemId,
      queue_status: "scheduled",
      selected_affiliate_url: expect.stringContaining("https://link.coupang.com")
    });
    expect(new Date(item?.scheduled_at ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
    expect(item?.thumbnail_url).toMatch(/^https:\/\/picsum\.photos\//);
    expect(content?.video_script).toContain("worker smoke");
    expect(content?.disclosure_text).toContain("쿠팡 파트너스");
  });

  test("POST /api/run/nightly-scout returns safe error when env is missing", async () => {
    const response = await runNightlyScout(
      new Request("http://localhost/api/run/nightly-scout", { method: "POST" })
    );
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("n8n Webhook 설정이 없어 실행할 수 없습니다.");
    expect(serialized).not.toContain("N8N_NIGHTLY_SCOUT_WEBHOOK_URL");
    expect(serialized).not.toContain("N8N_WEBHOOK_SECRET");
    const runs = await getAutomationRepository().getRuns();
    expect(runs[0]).toMatchObject({ status: "failed", run_type: "nightly_scout" });
  });

  test("POST /api/run/nightly-scout records successful webhook response", async () => {
    process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL = "https://n8n.example.com/webhook/nightly-secret";
    process.env.N8N_WEBHOOK_SECRET = "n8n-secret";
    process.env.PUBLIC_APP_BASE_URL = "http://localhost:3001";
    await getAutomationRepository().updateSettings({ is_paused: false });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          run_id: "n8n-run-1",
          processed_count: 69,
          error_count: 0
        }),
        { status: 200 }
      )
    );

    const response = await runNightlyScout(
      new Request("http://localhost/api/run/nightly-scout", { method: "POST" })
    );
    const payload = await readJson(response);
    const runs = await getAutomationRepository().getRuns();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.request_id).toMatch(/^nightly_scout-/);
    expect(runs[0]).toMatchObject({
      run_type: "nightly_scout",
      status: "success",
      request_id: payload.request_id,
      n8n_run_id: "n8n-run-1",
      processed_count: 69,
      error_count: 0
    });
    expect(JSON.stringify(payload)).not.toContain("n8n-secret");
    expect(runs[0].log).not.toContain("nightly-secret");
  });
});
