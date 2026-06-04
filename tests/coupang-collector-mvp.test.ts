import { describe, expect, test } from "vitest";
import { POST } from "../app/api/candidates/collect-coupang/route";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/candidates/collect-coupang", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Coupang collector MVP", () => {
  test("dry-run collection creates candidates only and never creates queue or worker jobs", async () => {
    const repository = resetMockRepositoryForTests();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await POST(
      request({
        mode: "dry_run",
        keywords: ["차량 정리함", "여름 주방용품"],
        limit_per_keyword: 2,
        COUPANG_SECRET_KEY: "must-not-leak"
      })
    );
    const payload = await response.json();
    const finalQueue = await repository.getQueue();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      mode: "dry_run",
      queue_created: false,
      worker_jobs_created: false
    });
    expect(payload.created_count).toBeGreaterThan(0);
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        source_platform: "coupang",
        candidate_status: "collected",
        risk_flags: expect.any(Array)
      })
    );
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
    expect(finalQueue).toHaveLength(initialQueue.length);
    expect(finalJobs).toHaveLength(initialJobs.length);
  });
});
