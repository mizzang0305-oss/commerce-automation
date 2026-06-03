import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QueueDetailView } from "@/components/QueueDetailView";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { createGeneratedContentFixture, createQueueItemFixture } from "@/test/fixtures";

describe("queue detail render plan preview", () => {
  test("renders storyboard shot preview when render plan inputs are ready", () => {
    const item = createQueueItemFixture({
      id: "queue-render-plan-ui",
      product_name: "Render plan UI product",
      queue_status: "scheduled",
      selected_affiliate_url: "https://link.coupang.com/a/render-plan-ui",
      thumbnail_url: "https://picsum.photos/seed/render-plan-ui/1080/1920"
    });
    const content = createGeneratedContentFixture({
      product_queue_id: item.id,
      product_name: item.product_name,
      video_title: "Render plan UI product checklist",
      video_script:
        "Open with the product. Show the category and price context. Ask operators to check current terms before upload.",
      disclosure_text: "This content contains affiliate links."
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

    expect(screen.getByText("Render plan preview")).toBeInTheDocument();
    expect(screen.getByText("render_plan_attached=true")).toBeInTheDocument();
    expect(screen.getByText("shots=4")).toBeInTheDocument();
    expect(screen.getByText("duration=18s")).toBeInTheDocument();
    expect(screen.getByText("hook")).toBeInTheDocument();
    expect(screen.getAllByText("product_focus").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("check_points")).toBeInTheDocument();
    expect(screen.getByText("manual_cta")).toBeInTheDocument();
  });

  test("renders legacy fallback copy and gaps when render plan cannot be built", () => {
    const item = createQueueItemFixture({
      id: "queue-render-plan-legacy",
      product_name: "Render plan fallback product",
      queue_status: "manual_review",
      selected_affiliate_url: "https://link.coupang.com/a/render-plan-legacy",
      thumbnail_url: ""
    });
    const content = createGeneratedContentFixture({
      product_queue_id: item.id,
      product_name: item.product_name,
      video_script: "",
      disclosure_text: "This content contains affiliate links."
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

    expect(screen.getByText("Render plan preview")).toBeInTheDocument();
    expect(screen.getByText("render_plan_attached=false")).toBeInTheDocument();
    expect(screen.getByText("Legacy render fallback will be used until the missing inputs are fixed.")).toBeInTheDocument();
    expect(screen.getByText("thumbnail_url")).toBeInTheDocument();
    expect(screen.getByText("video_script")).toBeInTheDocument();
  });
});
