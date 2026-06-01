import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CandidateReviewClient } from "@/components/CandidateReviewClient";
import type { CandidateReadiness } from "@/lib/candidatePromotion";
import type { ProductCandidate } from "@/types/automation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

const ready: CandidateReadiness = {
  can_promote: true,
  status: "ready",
  label: "승격 가능",
  reasons: ["다음 배치 실행 전까지 작업은 생성되지 않습니다."],
  product_key: "coupang:100:200:300",
  candidate_score: 92,
  score_reason: "제휴 링크 있음, 이벤트 상품, 이미지 있음",
  duplicate_status: "unique",
  duplicate_reason: "",
  duplicate_queue_id: "",
  duplicate_source: ""
};

const candidate: ProductCandidate = {
  id: "candidate-ui-001",
  product_name: "UI 후보 상품",
  raw_coupang_url: "https://www.coupang.com/vp/products/candidate-ui-001",
  selected_affiliate_url: "https://link.coupang.com/a/candidate-ui-001",
  payload: {
    source: "manual_csv",
    source_type: "event",
    category_path: "생활",
    keyword: "후보",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-render"
  },
  product_key: "coupang:100:200:300",
  platform: "coupang",
  source_type: "event",
  category: "생활",
  candidate_score: 92,
  score_reason: "제휴 링크 있음, 이벤트 상품, 이미지 있음",
  duplicate_status: "unique",
  duplicate_reason: "",
  promotion_status: "ready",
  created_at: "2026-05-31T00:00:00.000Z",
  updated_at: "2026-05-31T00:00:00.000Z"
};

describe("candidate review UI", () => {
  test("renders candidate review table and redacts secret-like payload keys", () => {
    render(<CandidateReviewClient candidates={[candidate]} readiness={{ [candidate.id]: ready }} />);

    expect(screen.getAllByText("UI 후보 상품").length).toBeGreaterThan(0);
    expect(screen.getAllByText("승격 가능").length).toBeGreaterThan(0);
    expect(screen.getAllByText("92점").length).toBeGreaterThan(0);
    expect(screen.getAllByText("coupang:100:200:300").length).toBeGreaterThan(0);
    expect(screen.getAllByText("중복 아님").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "상품 큐로 승격" })).toBeEnabled();
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
  });
});
