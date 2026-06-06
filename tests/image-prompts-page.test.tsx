import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ImagePromptsPage from "../app/image-prompts/page";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-image-page-001",
  product_name: "쇼츠 썸네일 테스트 상품",
  raw_coupang_url: "https://www.coupang.com/vp/products/candidate-image-page-001",
  selected_affiliate_url: "https://link.coupang.com/a/candidate-image-page-001",
  category: "생활용품",
  payload: {
    keyword: "정리 용품",
    category_path: "생활용품/수납"
  },
  created_at: "2026-06-06T00:00:00.000Z",
  updated_at: "2026-06-06T00:00:00.000Z"
};

describe("/image-prompts page", () => {
  test("renders copy-only image planning UI with no generation or upload actions", async () => {
    render(await ImagePromptsPage({ searchParams: Promise.resolve({ candidate_id: candidate.id }) }, {
      candidates: [candidate]
    }));

    expect(screen.getByRole("heading", { name: "Commerce Image Prompts" })).toBeInTheDocument();
    expect(screen.getByText(/This screen creates image prompt plans and 15-second video planning drafts only/)).toBeInTheDocument();
    expect(screen.getByText("main_product")).toBeInTheDocument();
    expect(screen.getByText("benefit_scene")).toBeInTheDocument();
    expect(screen.getByText("hook_thumbnail")).toBeInTheDocument();
    expect(screen.getByText("comparison_card")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Copy prompt/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
    expect(screen.getByText("image_generated=false")).toBeInTheDocument();
    expect(screen.getByText("video_generated=false")).toBeInTheDocument();
    expect(screen.getByText("uploaded=false")).toBeInTheDocument();
    expect(screen.getByText("worker_job_created=false")).toBeInTheDocument();
    expect(screen.getByText("queue_created=false")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Video Plan Preview" })).toBeInTheDocument();
    expect(screen.getByText("15-second storyboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy video plan JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy storyboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy narration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy subtitle lines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy CTA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy full image and video plan JSON" })).toBeInTheDocument();
    expect(screen.getByText("approval_required=true")).toBeInTheDocument();

    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toMatch(/Generate Image|Generate Video|Run Worker|Run FFmpeg|Run MoviePy|Call Gemini|Call OpenAI|Post to YouTube|Send to Google Drive/);
    expect(screen.queryByRole("button", { name: /^Upload$/i })).not.toBeInTheDocument();
  });
});
