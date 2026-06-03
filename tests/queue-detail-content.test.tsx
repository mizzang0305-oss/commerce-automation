import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { QueueDetailView } from "@/components/QueueDetailView";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { createGeneratedContentFixture, createQueueItemFixture } from "@/test/fixtures";

describe("queue detail content draft UI", () => {
  test("renders content draft action and updates preview after generation", async () => {
    const item = createQueueItemFixture({
      id: "queue-content-ui",
      queue_status: "scheduled",
      video_url: "",
      video_snapshot_url: "",
      selected_affiliate_url: "https://link.coupang.com/a/content-ui",
      thumbnail_url: "https://picsum.photos/seed/content-ui/360/240"
    });
    const content = createGeneratedContentFixture({
      product_queue_id: item.id,
      video_script: "",
      disclosure_text: ""
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          message: "콘텐츠 초안을 생성했습니다. worker job은 생성하지 않았습니다.",
          created_worker_jobs: 0,
          content: {
            ...content,
            video_script: "새 영상 대본입니다.",
            disclosure_text: "이 콘텐츠는 제휴마케팅 활동을 포함합니다."
          }
        }),
        { status: 200 }
      )
    );

    render(
      <QueueDetailView
        item={item}
        content={content}
        settings={createDefaultSettings()}
        assets={[]}
        workerJobs={[]}
      />
    );

    expect(screen.getByText("영상 대본 없음")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "콘텐츠 초안 생성" }));

    await waitFor(() => {
      expect(screen.getByText("새 영상 대본입니다.")).toBeInTheDocument();
    });
    expect(screen.getByText(/worker job은 생성하지 않았습니다/)).toBeInTheDocument();
  });

  test("renders product image readiness in the worker checklist", () => {
    const item = createQueueItemFixture({
      id: "queue-image-readiness-ui",
      queue_status: "scheduled",
      selected_affiliate_url: "https://link.coupang.com/a/image-readiness",
      thumbnail_url: ""
    });
    const content = createGeneratedContentFixture({
      product_queue_id: item.id,
      video_script: "영상 대본입니다.",
      disclosure_text: "제휴 고지 문구입니다."
    });

    render(
      <QueueDetailView
        item={item}
        content={content}
        settings={createDefaultSettings()}
        assets={[]}
        workerJobs={[]}
      />
    );

    expect(screen.getAllByText(/상품 이미지 URL/).length).toBeGreaterThan(0);
    expect(screen.getByText(/상품 이미지 URL이 없어 영상 생성이 차단됩니다/)).toBeInTheDocument();
  });
});
