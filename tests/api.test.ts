import { beforeEach, describe, expect, test } from "vitest";
import { GET as getSettings, POST as postSettings } from "../app/api/settings/route";
import { GET as getQueue } from "../app/api/queue/route";
import { POST as runNightlyScout } from "../app/api/run/nightly-scout/route";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("api routes", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    delete process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
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
  });
});
