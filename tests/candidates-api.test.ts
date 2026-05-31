import { beforeEach, describe, expect, test } from "vitest";
import { GET as getCandidates } from "../app/api/candidates/route";
import { GET as getCandidate } from "../app/api/candidates/[id]/route";
import { POST as promoteCandidate } from "../app/api/candidates/[id]/promote/route";
import type { ProductCandidate } from "@/types/automation";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-api-001",
    product_name: "API 후보 상품",
    raw_coupang_url: "https://www.coupang.com/vp/products/candidate-api-001",
    selected_affiliate_url: "https://link.coupang.com/a/candidate-api-001",
    payload: {
      source: "manual_csv",
      category_path: "생활",
      keyword: "후보",
      thumbnail_url: "https://image.example.com/candidate-api-001.jpg"
    },
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("candidate API routes", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
  });

  test("GET /api/candidates returns candidates", async () => {
    await getAutomationRepository().upsertProductCandidates([candidateFixture()]);

    const response = await getCandidates(new Request("http://localhost/api/candidates?query=API"));
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "candidate-api-001" })])
    );
    expect(JSON.stringify(payload)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("GET /api/candidates/[id] returns duplicate readiness details", async () => {
    await getAutomationRepository().upsertProductCandidates([candidateFixture()]);

    const response = await getCandidate(new Request("http://localhost/api/candidates/candidate-api-001"), {
      params: Promise.resolve({ id: "candidate-api-001" })
    });
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.candidate).toMatchObject({ id: "candidate-api-001" });
    expect(payload.readiness).toMatchObject({ can_promote: true });
  });

  test("POST /api/candidates/[id]/promote blocks missing affiliate URL", async () => {
    await getAutomationRepository().upsertProductCandidates([
      candidateFixture({ id: "candidate-no-affiliate", selected_affiliate_url: "" })
    ]);

    const response = await promoteCandidate(
      new Request("http://localhost/api/candidates/candidate-no-affiliate/promote", { method: "POST" }),
      { params: Promise.resolve({ id: "candidate-no-affiliate" }) }
    );
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("제휴 링크가 없어 후보를 상품 큐로 승격할 수 없습니다.");
  });

  test("POST /api/candidates/[id]/promote creates queue item and content scaffold", async () => {
    await getAutomationRepository().upsertProductCandidates([candidateFixture()]);

    const response = await promoteCandidate(
      new Request("http://localhost/api/candidates/candidate-api-001/promote", { method: "POST" }),
      { params: Promise.resolve({ id: "candidate-api-001" }) }
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.queue_item).toMatchObject({
      queue_status: "scheduled",
      product_name: "API 후보 상품"
    });
    expect(payload.content).toMatchObject({
      video_script: "",
      disclosure_text:
        "이 콘텐츠는 제휴마케팅 활동을 포함하며, 링크를 통한 구매가 발생하면 작성자에게 수수료가 지급됩니다."
    });
  });
});
