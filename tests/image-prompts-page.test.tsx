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
    expect(screen.getAllByText("main_product").length).toBeGreaterThan(0);
    expect(screen.getAllByText("benefit_scene").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hook_thumbnail").length).toBeGreaterThan(0);
    expect(screen.getAllByText("comparison_card").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Copy prompt/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
    expect(screen.getAllByText("image_generated=false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("video_generated=false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("uploaded=false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("worker_job_created=false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("queue_created=false").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Video Plan Preview" })).toBeInTheDocument();
    expect(screen.getByText("15-second storyboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy video plan JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy storyboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy narration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy subtitle lines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy CTA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy full image and video plan JSON" })).toBeInTheDocument();
    expect(screen.getAllByText("approval_required=true").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Local Image Generation Package" })).toBeInTheDocument();
    expect(screen.getByText("commerce-assets/output/generated/candidate-image-page-001/")).toBeInTheDocument();
    expect(screen.getByText("G:/My Drive/commerce-assets/generated/candidate-image-page-001/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy local package JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy manifest JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy prompt markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy QA checklist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy manual steps" })).toBeInTheDocument();
    expect(screen.getAllByText("local_file_written=false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("google_drive_api_called=false").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Image QA Import Bridge" })).toBeInTheDocument();
    expect(screen.getByLabelText("Import manifest JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview QA import plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy import manifest JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy selected image asset JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy QA markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy next-step JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download import plan JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download QA markdown" })).toBeInTheDocument();
    expect(screen.getByText("ready_for_slideshow_plan=false")).toBeInTheDocument();
    expect(screen.getByText("local_file_read=false")).toBeInTheDocument();
    expect(screen.getByText("r2_uploaded=false")).toBeInTheDocument();

    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toMatch(/Generate Image|Generate Video|Run Worker|Run FFmpeg|Run MoviePy|Call Gemini|Call OpenAI|Post to YouTube|Send to Google Drive|Browse Local File|Read File|Import to DB|Upload to R2/);
    expect(screen.queryByRole("button", { name: /^Upload$/i })).not.toBeInTheDocument();
  });
});
